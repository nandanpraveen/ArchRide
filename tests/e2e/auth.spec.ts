import { test, expect } from "./fixtures";
import { mockTransit } from "./transit-fixtures";
import { TEST_USER, testSession } from "../auth/fixtures";
test.use({ signedIn: false });

test("every travel screen requires sign-in before mounting data consumers", async ({page}) => {
  const dataRequests: string[]=[];
  page.on("request",r=>{if(r.url().includes("/functions/v1/"))dataRequests.push(r.url());});
  for(const route of ["/","/map?stop=example","/plan?to=building","/saved","/classes","/profile","/notifications"]){
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in\/\?next=/);
    await expect(page.getByRole("heading",{name:"Sign in to ArchRide",exact:true})).toBeVisible();
    await expect(page.getByRole("navigation",{name:"Primary navigation",exact:true})).toHaveCount(0);
  }
  expect(dataRequests).toEqual([]);
});

test("email signup skips verification, rejects a mismatch, and persists the session", async ({page}) => {
  await mockTransit(page);
  await page.goto("/create-account?next=%2Fmap");
  await page.getByRole("textbox",{name:"Email",exact:true}).fill("student@example.test");
  const password=page.getByLabel(/^Password\s*\*?$/);await expect(password).toHaveAttribute("type","password");
  await password.fill("Synthetic-password-123");await page.getByLabel(/^Confirm password\s*\*?$/).fill("not-the-same");
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:"Passwords do not match"})).toContainText("Passwords do not match");
  await page.getByLabel(/^Confirm password\s*\*?$/).fill("Synthetic-password-123");
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await expect(page).toHaveURL(/\/map\/?$/);await expect(page.getByRole("heading",{name:"Campus map",exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole("heading",{name:"Campus map",exact:true})).toBeVisible();
});

test("bad email credentials keep a recoverable form and no travel data", async ({page}) => {
  await page.route("**/auth/v1/token?**",r=>r.fulfill({status:400,json:{code:"invalid_credentials",msg:"Invalid login credentials"},headers:{"access-control-allow-origin":"*"}}));
  await page.goto("/sign-in");await page.getByRole("textbox",{name:"Email",exact:true}).fill("student@example.test");await page.getByLabel(/^Password\s*\*?$/).fill("Synthetic-password-123");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"Check your email and password"})).toContainText("Check your email and password");
  await expect(page.getByRole("button",{name:"Sign in",exact:true})).toBeEnabled();
  await expect(page.getByRole("navigation",{name:"Primary navigation"})).toHaveCount(0);
});

test("Google sign-in starts PKCE with a production-path callback and safe destination", async ({page}) => {
  await page.route("**/auth/v1/authorize?**",r=>r.fulfill({status:200,body:"Synthetic Google redirect"}));
  await page.goto("/sign-in?next=https%3A%2F%2Fevil.test");await page.getByRole("button",{name:"Continue with Google",exact:true}).click();
  await expect(page).toHaveURL(/\/auth\/v1\/authorize\?/);
  const url=new URL(page.url());expect(url.searchParams.get("provider")).toBe("google");expect(url.searchParams.get("code_challenge_method")?.toLowerCase()).toBe("s256");
  const callback=new URL(url.searchParams.get("redirect_to")!);expect(callback.pathname).toBe("/auth/callback/");expect(callback.searchParams.get("next")).toBe("/");
});

test("cancelled callback offers sign-in, and privacy stays available without an account", async ({page}) => {
  await page.goto("/auth/callback?error=access_denied");await expect(page.getByRole("heading",{name:"Sign-in didn’t finish",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Return to sign in",exact:true}).click();await expect(page.getByRole("heading",{name:"Sign in to ArchRide",exact:true})).toBeVisible();
  await page.goto("/privacy");await expect(page.getByRole("heading",{name:"Privacy & data",exact:true})).toBeVisible();
});

test("sign-out removes app access and preserves only the account's device data", async ({page}) => {
  await mockTransit(page);await page.goto("/sign-in");
  await page.getByRole("textbox",{name:"Email",exact:true}).fill("student@example.test");await page.getByLabel(/^Password\s*\*?$/).fill("Synthetic-password-123");await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("button",{name:"Find a trip",exact:true})).toBeEnabled();
  await page.goto("/profile");await page.getByRole("button",{name:"Sign out",exact:true}).click();
  await expect(page).toHaveURL(/\/sign-in/);await page.goto("/saved");await expect(page).toHaveURL(/\/sign-in/);
});

test("PKCE callback exchanges once and restores the requested travel screen", async ({page}) => {
  await mockTransit(page);
  await page.addInitScript(() => localStorage.setItem("archride.auth-code-verifier", JSON.stringify("synthetic-pkce-verifier")));
  let exchanges = 0;
  await page.route("**/auth/v1/token?**", route => {
    exchanges++;
    expect(route.request().postDataJSON().auth_code).toBe("synthetic-code");
    return route.fulfill({ json: testSession(), headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/auth/callback?code=synthetic-code&next=%2Fclasses");
  await expect(page.getByRole("heading", { name: "Add your weekly classes", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/classes\/?$/);
  expect(exchanges).toBe(1);
});

test("switching accounts isolates classes and clearing one account preserves the other", async ({page}) => {
  await mockTransit(page);
  const second = "10000000-0000-0000-0000-000000000002";
  let current = TEST_USER;
  await page.route("**/auth/v1/**", route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (request.method() === "OPTIONS" || path.endsWith("/logout")) return route.fulfill({ status: 204, headers });
    if (path.endsWith("/token")) current = request.postDataJSON().email === "second@example.test" ? second : TEST_USER;
    return route.fulfill({ json: path.endsWith("/user") ? testSession(current).user : testSession(current), headers });
  });
  const signIn = async (email: string) => {
    await page.goto("/sign-in?next=%2Fclasses");
    await page.getByRole("textbox", {name:"Email",exact:true}).fill(email);
    await page.getByLabel(/^Password\s*\*?$/).fill("Synthetic-password-123");
    await page.getByRole("button", {name:"Sign in",exact:true}).click();
    await expect(page.getByRole("button", {name:"Add a class",exact:true})).toBeEnabled();
  };
  const signOut = async () => {
    await page.goto("/profile");
    await page.getByRole("button", {name:"Sign out",exact:true}).click();
    await expect(page).toHaveURL(/\/sign-in/);
  };
  await signIn("first@example.test");
  await page.getByRole("button", {name:"Add a class",exact:true}).click();
  const dialog = page.getByRole("dialog", {name:"Add a class"});
  await dialog.getByLabel("Class name").fill("First account calculus");
  await dialog.getByRole("combobox", {name:"Class building"}).fill("Memorial");
  await page.getByRole("option", {name:/Mémorial Building/}).click();
  await dialog.getByRole("button", {name:"Monday",exact:true}).click();
  await dialog.getByRole("button", {name:"Save class",exact:true}).click();
  await expect(page.getByRole("region", {name:"Weekly class schedule"})).toContainText("First account calculus");
  await signOut();
  await signIn("second@example.test");
  await expect(page.getByRole("heading", {name:"Add your weekly classes",exact:true})).toBeVisible();
  await expect(page.getByText("First account calculus", {exact:true})).toHaveCount(0);
  await page.goto("/profile");
  await page.getByRole("button", {name:"Clear device data",exact:true}).click();
  await page.getByRole("dialog").getByRole("button", {name:"Clear device data",exact:true}).click();
  await signOut();
  await signIn("first@example.test");
  await expect(page.getByRole("region", {name:"Weekly class schedule"})).toContainText("First account calculus");
});

test("server rejection removes travel access and signed-in requests carry the session token", async ({page}) => {
  await mockTransit(page);
  await page.goto("/sign-in");
  await page.getByRole("textbox", {name:"Email",exact:true}).fill("student@example.test");
  await page.getByLabel(/^Password\s*\*?$/).fill("Synthetic-password-123");
  const request = page.waitForRequest(request => request.method() === "GET" && request.url().includes("/functions/v1/public-read"));
  await page.getByRole("button", {name:"Sign in",exact:true}).click();
  const authorization = (await request).headers().authorization;
  expect(authorization).toMatch(/^Bearer /);
  expect(JSON.parse(Buffer.from(authorization.split(".")[1], "base64url").toString()).sub).toBe(TEST_USER);
  await expect(page.getByRole("button", {name:"Find a trip",exact:true})).toBeEnabled();
  await page.route("**/functions/v1/public-read?**", route => route.fulfill({status:401,json:{error:"sign_in_required"},headers:{"access-control-allow-origin":"*"}}));
  await page.goto("/map");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("navigation", {name:"Primary navigation"})).toHaveCount(0);
});

test("a brief read concurrency limit recovers once without signing the student out", async ({page}) => {
  await mockTransit(page);
  let attempts = 0;
  await page.route("**/functions/v1/public-read?**", route => {
    const path = new URL(route.request().url()).searchParams.get("path") ?? "";
    if (path.startsWith("/rest/v1/transit_buildings")) {
      attempts++;
      if (attempts === 1) return route.fulfill({status:429,json:{error:"service_busy"},headers:{"access-control-allow-origin":"*","retry-after":"1","access-control-expose-headers":"retry-after"}});
    }
    return route.fallback();
  });
  await page.goto("/sign-in");
  await page.getByRole("textbox", {name:"Email",exact:true}).fill("student@example.test");
  await page.getByLabel(/^Password\s*\*?$/).fill("Synthetic-password-123");
  await page.getByRole("button", {name:"Sign in",exact:true}).click();
  await page.getByRole("combobox", {name:"From",exact:true}).fill("Memorial");
  await expect(page.getByRole("option", {name:/Mémorial Building/})).toBeVisible();
  expect(attempts).toBe(2);
  await expect(page.getByRole("navigation", {name:"Primary navigation",exact:true}).filter({visible:true})).toBeVisible();
});

test("sign-out also removes access in another open tab", async ({page, context}) => {
  await mockTransit(page);
  await page.goto("/sign-in");
  await page.getByRole("textbox", {name:"Email",exact:true}).fill("student@example.test");
  await page.getByLabel(/^Password\s*\*?$/).fill("Synthetic-password-123");
  await page.getByRole("button", {name:"Sign in",exact:true}).click();
  await expect(page.getByRole("button", {name:"Find a trip",exact:true})).toBeEnabled();
  const other = await context.newPage();
  await mockTransit(other);
  await other.goto("/saved");
  await expect(other.getByRole("heading", {name:"Saved",exact:true})).toBeVisible();
  await page.goto("/profile");
  await page.getByRole("button", {name:"Sign out",exact:true}).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(other).toHaveURL(/\/sign-in/);
  await expect(other.getByRole("navigation", {name:"Primary navigation"})).toHaveCount(0);
});
