import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mockTransit } from "./transit-fixtures";

const fixture = "http://127.0.0.1:3101";
const password = "Fixture-password-2026!";
const address = (scenario: string) => `${scenario}+${randomUUID()}@example.test`;
const signInButton = (page: Page) => page.getByRole("button", { name: "Sign in", exact: true });
const createButton = (page: Page) => page.getByRole("button", { name: "Create account", exact: true });

type AuthEvent = { path: string; method: string; email: string; grant: string | null; hasCodeVerifier: boolean };
async function events(request: APIRequestContext, email: string): Promise<AuthEvent[]> {
  const response = await request.get(`${fixture}/__test/events?email=${encodeURIComponent(email)}`);
  expect(response.ok()).toBe(true);
  return response.json();
}
async function credentials(page: Page, email: string, signup = false) {
  await page.getByLabel(/^Email\s*\*?$/).fill(email);
  await page.getByLabel(/^Password\s*\*?$/).fill(password);
  if (signup) await page.getByLabel(/^Confirm password\s*\*?$/).fill(password);
}
async function pendingSignup(page: Page, email: string) {
  await page.goto("/create-account");
  await credentials(page, email, true);
  await createButton(page).click();
  await expect(page.getByText(/check your email/i)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockTransit(page);
});

test("guests retain public pages, health and the map worker without a guest cookie", async ({ page, request, context }) => {
  for (const path of ["/", "/map", "/plan", "/saved"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByRole("main")).toBeVisible();
  }
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).app).toBe("ArchRide");
  const worker = await request.get("/maplibre-gl-worker.mjs");
  expect(worker.status()).toBe(200);
  expect(worker.headers()["content-type"]).toMatch(/javascript/);
  expect((await context.cookies()).some((cookie) => cookie.name === "guest")).toBe(false);
});

test("a signed-out Profile offers account entry and ignores an arbitrary guest cookie", async ({ page, context }) => {
  await context.addCookies([{ name: "guest", value: "1", url: "http://127.0.0.1:3100" }]);
  await page.goto("/profile");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await page.goto("/sign-in");
  await expect(signInButton(page)).toBeVisible();
});

test("keyboard sign-in masks the password, persists the verified user and signs out", async ({ page, request }) => {
  const email = address("success");
  await page.goto("/sign-in");
  await credentials(page, email);
  await expect(page.getByLabel(/^Password\s*\*?$/)).toHaveAttribute("type", "password");
  await page.getByLabel(/^Password\s*\*?$/).press("Enter");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(email);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(email);
  await expect.poll(async () => (await events(request, email)).filter((event) => event.path === "/auth/v1/user").length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/profile");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveCount(0);
});

test("a pending submission disables duplicate sign-in requests", async ({ page, request }) => {
  const email = address("slow");
  await page.goto("/sign-in");
  await credentials(page, email);
  await signInButton(page).click();
  await expect(page.getByRole("button", { name: "Please wait…", exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/\/profile$/);
  const posted = (await events(request, email)).filter((event) => event.grant === "password");
  expect(posted).toHaveLength(1);
});

for (const scenario of ["invalid", "rate", "unavailable"] as const) {
  test(`${scenario} sign-in failure stays on the form with an accessible error`, async ({ page }) => {
    await page.goto("/sign-in");
    await credentials(page, address(scenario));
    await signInButton(page).click();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(signInButton(page)).toBeEnabled();
    await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);
  });
}

test("signup validates matching masked passwords without sending an invalid request", async ({ page, request }) => {
  const email = address("pending");
  await page.goto("/create-account");
  await credentials(page, email, true);
  await expect(page.getByLabel(/^Confirm password\s*\*?$/)).toHaveAttribute("type", "password");
  await page.getByLabel(/^Confirm password\s*\*?$/).fill("Different-password-2026!");
  await createButton(page).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/match/i);
  expect((await events(request, email)).filter((event) => event.path === "/auth/v1/signup")).toHaveLength(0);
});

test("confirmation-required signup stays signed out and can resend confirmation", async ({ page, request }) => {
  const email = address("pending");
  await pendingSignup(page, email);
  await expect(page).toHaveURL(/\/create-account$/);
  await page.getByRole("button", { name: /resend confirmation/i }).click();
  await expect.poll(async () => (await events(request, email)).filter((event) => event.path === "/auth/v1/resend").length).toBe(1);
  await page.goto("/profile");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
});

test("immediate-session signup opens Profile instead of falsely requesting email confirmation", async ({ page }) => {
  const email = address("instant");
  await page.goto("/create-account");
  await credentials(page, email, true);
  await createButton(page).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(email);
});

test("PKCE email confirmation uses the browser verifier and creates a server-validated session", async ({ page, request }) => {
  const email = address("pending");
  await pendingSignup(page, email);
  await page.goto(`/auth/callback?code=${encodeURIComponent(`confirmation:${email}`)}&next=%2Fprofile`);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(email);
  expect((await events(request, email)).some((event) => event.grant === "pkce" && event.hasCodeVerifier)).toBe(true);
});

for (const next of ["//outside.example", "/\\outside.example", "/\t/outside.example", "/\r/outside.example", "/\n/outside.example", "https://outside.example", "/inside/..//outside.example"]) {
  test(`confirmation rejects an external redirect ${JSON.stringify(next)}`, async ({ page }) => {
    const email = address("pending");
    await pendingSignup(page, email);
    await page.goto(`/auth/callback?code=${encodeURIComponent(`confirmation:${email}`)}&next=${encodeURIComponent(next)}`);
    await expect(page).toHaveURL("http://127.0.0.1:3100/profile");
    await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(email);
  });
}

test("confirmation preserves a safe internal destination and its session", async ({ page }) => {
  const email = address("pending");
  await pendingSignup(page, email);
  const next = "/saved?from=confirmation#saved";
  await page.goto(`/auth/callback?code=${encodeURIComponent(`confirmation:${email}`)}&next=${encodeURIComponent(next)}`);
  await expect(page).toHaveURL(`http://127.0.0.1:3100${next}`);
  await page.goto("/profile");
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(email);
});

test("missing and expired confirmations show a real recovery page", async ({ page }) => {
  for (const query of ["", "?code=expired-fixture-code"]) {
    const response = await page.goto(`/auth/callback${query}`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/auth\/auth-code-error/);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in|try again/i }).first()).toBeVisible();
  }
});

test("Profile rejects a session whose token no longer validates on the server", async ({ page }) => {
  const email = address("profile-failure");
  await page.goto("/sign-in");
  await credentials(page, email);
  await signInButton(page).click();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
});

test("auth controls fit 320 px and guests can return Home without creating an account", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ["/create-account", "/sign-in"]) {
    await page.goto(path);
    await expect(page.getByLabel(/^Email\s*\*?$/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.getByRole("link", { name: /continue as guest/i }).click();
  await expect(page.getByRole("heading", { name: "Where are you headed?" })).toBeVisible();
});

test("an unconfirmed email offers a real resend action", async ({ page, request }) => {
  const email = address("unconfirmed");
  await page.goto("/sign-in");
  await credentials(page, email);
  await signInButton(page).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/confirm your email/i);
  await page.getByRole("button", { name: "Resend confirmation", exact: true }).click();
  await expect.poll(async () => (await events(request, email)).filter((event) => event.path === "/auth/v1/resend").length).toBe(1);
});

test("password recovery exchanges PKCE before allowing a verified password update", async ({ page, request }) => {
  const email = address("recovery");
  await page.goto("/forgot-password");
  await page.getByLabel(/^Email\s*\*?$/).fill(email);
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/if an account exists/i);
  expect((await events(request, email)).some((event) => event.path === "/auth/v1/recover")).toBe(true);
  await page.goto(`/auth/callback?code=${encodeURIComponent(`recovery:${email}`)}&next=%2Freset-password`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByLabel(/^Password\s*\*?$/)).toBeEnabled();
  await page.getByLabel(/^Password\s*\*?$/).fill("Updated-fixture-password-2026!");
  await page.getByLabel(/^Confirm password\s*\*?$/).fill("Updated-fixture-password-2026!");
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(email);
  expect((await events(request, email)).some((event) => event.path === "/auth/v1/user" && event.method === "PUT")).toBe(true);
});

test("a missing recovery session cannot submit a password update", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/reset session is missing, expired, or could not be verified/i);
  await expect(page.getByLabel(/^Password\s*\*?$/)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Update password", exact: true })).toBeDisabled();
});

test("Profile distinguishes unavailable account verification from a signed-out session", async ({ page }) => {
  await page.goto("/sign-in");
  await credentials(page, address("profile-unavailable"));
  await signInButton(page).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/account services are temporarily unavailable/i);
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveCount(0);
  await expect(page.getByText("You are browsing as a guest.", { exact: false })).toHaveCount(0);
});

test("a failed remote sign-out is reported rather than falsely confirmed", async ({ page }) => {
  const email = address("logout-failure");
  await page.goto("/sign-in");
  await credentials(page, email);
  await signInButton(page).click();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(email);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert").filter({ hasText: /sign-out could not be confirmed/i })).toBeVisible();
});
