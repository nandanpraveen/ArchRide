import { test, expect } from "@playwright/test";
import { assertStudentNavigation, noHorizontalOverflow, readyForLayout, snapshot, syntheticExportData } from "./fixtures";

const root = "/archride/";
const destinations = ["", "map/", "plan/", "saved/", "profile/", "classes/", "notifications/", "privacy/"];

test("static direct URLs load assets under /archride and primary navigation preserves Back", async ({ page, context }) => {
  const failedAssets: string[] = [];
  const assetResponse = (response: import("@playwright/test").Response) => {
    if (response.url().includes("/_next/") && response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`);
  };
  // Separate documents keep WebKit's expected unload cancellations out of the next page's startup checks.
  for (const destination of destinations) {
    const direct = await context.newPage();
    await syntheticExportData(direct);
    const errors: string[] = [];
    const recordError = (error: Error) => errors.push(error.message);
    direct.on("pageerror", recordError);
    direct.on("response", assetResponse);
    const response = await direct.goto(root + destination);
    expect(response?.status(), destination || "Home").toBe(200);
    await expect(direct.locator("main h1")).toHaveCount(1);
    await readyForLayout(direct, destination);
    await noHorizontalOverflow(direct);
    await assertStudentNavigation(direct);
    expect(errors, destination || "Home").toEqual([]);
    direct.off("pageerror", recordError);
    await direct.close();
  }
  await syntheticExportData(page);
  page.on("response", assetResponse);
  await page.goto(root);
  await readyForLayout(page, "");
  await page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("link", { name: "Map", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/archride\/map\/?$/);
  await expect(page.locator("main h1")).toHaveText("Campus map");
  await readyForLayout(page, "map/");
  await page.goBack();
  await expect(page).toHaveURL(/\/archride\/$/);
  await readyForLayout(page, "");
  expect(failedAssets).toEqual([]);
});

test("static authentication routes load under the production base path and protect travel screens", async ({ page }, info) => {
  await syntheticExportData(page, false);
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/functions/v1/")) requests.push(request.url()); });
  for (const width of [320, 375, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const route of ["sign-in/", "create-account/"]) {
        const response = await page.goto(root + route);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeEnabled();
        await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
        await noHorizontalOverflow(page);
        if ([375, 1440].includes(width)) await snapshot(page, info, `${route.slice(0,-1)}-${width}-${colorScheme}`);
        await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
        await noHorizontalOverflow(page);
        if (route === "create-account/") {
          const label = page.locator("label").filter({hasText:"Confirm password"});
          expect(await label.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        }
      }
    }
  }
  await page.goto(root + "auth/callback/?error=access_denied");
  await expect(page.getByRole("heading", { name: "Sign-in didn’t finish", exact: true })).toBeVisible();
  for (const route of ["", "saved/", "map/?stop=example", "classes/"]) {
    await page.goto(root + route);
    await expect(page).toHaveURL(/\/archride\/sign-in\/\?next=/);
    await expect(page.getByRole("heading", { name: "Sign in to ArchRide", exact: true })).toBeVisible();
  }
  expect(requests).toEqual([]);
  const admin = await page.goto(root + "admin/");
  if (admin?.status() !== 404) {
    await expect(page.getByRole("button", { name: /retry ingestion|publish notice|save correction/i })).toHaveCount(0);
    await expect(page.locator("main")).toContainText(/restricted|maintainer|unavailable|access/i);
  }
});

for (const width of [320, 375, 768, 1440]) for (const colorScheme of ["light", "dark"] as const) {
  test(`synthetic responsive matrix ${width}px ${colorScheme}, reduced motion and enlarged text`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await syntheticExportData(page);
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1000 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const route of ["", "plan/?from=building&fromType=building&to=destination&toType=building", "saved/", "profile/", "classes/", "notifications/", "map/?parking=e23"]) {
      await page.goto(root + route);
      await readyForLayout(page, route);
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
      await noHorizontalOverflow(page);
      await assertStudentNavigation(page);
      const smallCtas = await page.locator("main button.MuiButton-root, nav a").evaluateAll(elements => elements.flatMap(element => {
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
        return style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && (rect.width < 43 || rect.height < 43) ? [{ text: element.textContent, width: rect.width, height: rect.height }] : [];
      }));
      expect(smallCtas, route).toEqual([]);
      if ((width === 375 || width === 1440) && ["", "plan", "map", "profile"].includes(route.split("/")[0])) await snapshot(page, info, `${route.split("/")[0] || "home"}-${width}-${colorScheme}`);
      await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
      await noHorizontalOverflow(page);
    }
  });
}

for (const colorScheme of ["light", "dark"] as const) test(`375px ${colorScheme} all student screens support 200% base text`, async ({ page }, info) => {
  await syntheticExportData(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  const overflow: { route: string; pixels: number }[] = [];
  for (const route of ["", "plan/?from=building&fromType=building&to=destination&toType=building", "saved/", "profile/", "classes/", "notifications/", "map/?parking=e23"]) {
    await page.goto(root + route);
    await readyForLayout(page, route);
    await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const pixels = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - 375);
    if (pixels > 1) overflow.push({ route: route || "Home", pixels });
    await snapshot(page, info, `${route.split("/")[0] || "home"}-375-${colorScheme}-200pct`);
  }
  expect(overflow).toEqual([]);
});

test("synthetic complete signed-in journey: Home search, verified walk, saved journey, resume and arrival", async ({ page }, info) => {
  await syntheticExportData(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const privateRequests: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    const target = url.pathname.endsWith("/public-read") ? url.searchParams.get("path") ?? "" : url.pathname;
    if (/\/rest\/v1\/(profiles|favorites|classes|active_trips|notification_preferences|notifications|reminder_jobs)(\?|$)/.test(target)) privateRequests.push(request.url());
  });
  await page.goto(root);
  await page.getByRole("combobox", { name: "From", exact: true }).fill("Student Center");
  await page.getByRole("option", { name: /Mémorial Building/ }).click();
  await page.getByRole("combobox", { name: "To", exact: true }).fill("Science Library");
  await page.getByRole("option", { name: /Science Library/ }).click();
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  await expect(page).toHaveURL(/\/archride\/plan\/\?.*to=destination/);
  const walk = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Walk directly", exact: true }) });
  await expect(walk).toContainText(/7\s*min/);
  await walk.getByRole("button", { name: "Save journey", exact: true }).click();
  await expect(walk.getByRole("button", { name: "Journey saved", exact: true })).toBeDisabled();
  await walk.getByRole("button", { name: "Start walking", exact: true }).click();
  const active = page.getByRole("region", { name: "Active trip" });
  await expect(active).toContainText("Walk to destination");
  await snapshot(page, info, "synthetic-active-walk-375");
  await page.goto(root);
  await page.getByRole("link", { name: "Resume trip", exact: true }).click();
  await expect(active).toContainText("Science Library");
  await page.reload();
  await expect(active).toContainText("Science Library");
  await active.getByRole("button", { name: "I’ve arrived", exact: true }).click();
  await expect(active).toHaveCount(0);
  await expect(page.getByText("You’ve arrived. Your trip is complete.")).toBeVisible();
  await page.goto(root + "saved/");
  await expect(page.locator("main")).toContainText("Science Library");
  expect(privateRequests).toEqual([]);
});

test("unavailable transit keeps signed-in planning feedback, navigation and offline parking useful", async ({ page }) => {
  await syntheticExportData(page);
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.route("**/functions/v1/public-read?**", route => route.abort());
  await page.goto(root);
  await expect(page.getByRole("button", { name: "Find a trip", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  await expect(page.getByText("Choose a starting point and a destination.", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "From", exact: true })).toBeFocused();
  await page.goto(root + "map/?parking=e26");
  await expect(page.getByRole("region", { name: "Parking details" })).toContainText("East Side Park & Ride");
  await expect(page.getByRole("textbox", { name: "Search parking lots and decks" })).toBeEnabled();
  await assertStudentNavigation(page);
});

test("a late agency notice keeps End trip in place and never prevents ending a walk", async ({ page }) => {
  const tables = await syntheticExportData(page);
  const notice = tables.transit_alerts[0];
  tables.transit_alerts = [];
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(root + "plan/?from=building&fromType=building&to=destination&toType=building");
  await page.getByRole("button", { name: "Start walking", exact: true }).click();
  const active = page.getByRole("region", { name: "Active trip" });
  const end = active.getByRole("button", { name: "End trip", exact: true });
  await expect(end).toBeEnabled();
  const before = await end.boundingBox();
  tables.transit_alerts = [{ ...notice, id: "late-notice", source_id_raw: "late-notice", header: "Late service notice", description: "Use the signed stop while this road is closed. ".repeat(30), source_timestamp: new Date().toISOString() }];
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(active.getByText("Late service notice", { exact: true })).toBeVisible();
  const after = await end.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
  await end.click();
  await expect(active).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("archride.personal.v1:account:10000000-0000-0000-0000-000000000001")!).active)).toBeNull();
});

test("phone bus markers stay compact at enlarged text and retain touch targets", async ({ page }) => {
  await syntheticExportData(page);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(root + "map/");
    const marker = page.locator('[data-map-marker="vehicle"]');
    await expect(marker).toHaveCount(1);
    await expect(marker.locator("svg")).toHaveAttribute("width", "18");
    await expect(marker).toHaveText("");
    await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
    const size = await marker.evaluate(element => {
      const target = element.getBoundingClientRect(), pin = element.querySelector("span")!.getBoundingClientRect();
      return { target: [target.width, target.height], pin: [pin.width, pin.height] };
    });
    expect(size).toEqual({ target: [44, 44], pin: [28, 28] });
    const zoom = await page.getByRole("button", { name: "Zoom in", exact: true }).boundingBox();
    expect(zoom?.width).toBe(44);
    expect(zoom?.height).toBe(44);
    await expect(page.getByRole("button", { name: /rotate map/ })).toHaveCount(0);
    await noHorizontalOverflow(page);
    await page.goto(root + "map/?vehicle=uga-passio%3Av");
    await expect(marker).toHaveAttribute("aria-pressed", "true");
    await expect(marker.locator("svg")).toHaveAttribute("width", "22");
  }
});
