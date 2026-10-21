import { test, expect } from "@playwright/test";
import { mockTransit, transitFixtures } from "./transit-fixtures";

test("Home uses the real catalog contract and filters source notice periods", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/");
  await expect(page.getByText("Static data: current", { exact: true })).toBeVisible();
  await expect(page.getByText("3 verified stops are available", { exact: false })).toBeVisible();
  await expect(page.getByText("Board at the signed stop", { exact: true })).toBeVisible();
  await expect(page.getByText("Future notice hidden")).toHaveCount(0);
  await expect(page.getByText("Expired notice hidden")).toHaveCount(0);
});

test("keyboard search preserves duplicate stop identities and opens the selected detail", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/");
  await expect(page.getByText("Static data: current", { exact: true })).toBeVisible();
  const search = page.getByRole("combobox", { name: "Search buildings and stops" });
  await search.fill("  MEMORIAL   hall  ");
  await expect(page.getByRole("option")).toHaveCount(2);
  await search.press("ArrowDown");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(/map\?stop=uga-passio%3Awest$/);
  await expect(page.getByRole("region", { name: "Stop details" })).toContainText("Memorial Hall");
});

test("changing search clears old clickable results and rejects a late older response", async ({ page }) => {
  let searches = 0;
  await mockTransit(page, transitFixtures(), async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith("transit_stops") && u.searchParams.get("select") === "id,name,latitude,longitude") {
      searches++;
      if (searches === 2) await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return false;
  });
  await page.goto("/");
  await expect(page.getByText("Static data: current", { exact: true })).toBeVisible();
  const search = page.getByRole("combobox", { name: "Search buildings and stops" });
  await search.fill("Memorial Hall");
  await expect(page.getByRole("option")).toHaveCount(2);
  await search.fill("Memorial");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect.poll(() => searches).toBeGreaterThanOrEqual(2);
  await search.fill("Science");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Science Center");
  await expect(page.getByRole("option")).toHaveCount(1);
});

test("search aliases and building type survive navigation", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/");
  await expect(page.getByText("Static data: current", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Search buildings and stops" }).fill("Student Center");
  await page.getByRole("option").click();
  await expect(page).toHaveURL(/place=building&type=building/);
  await expect(page.getByRole("heading", { name: "Mémorial Building" })).toBeVisible();
});

test("backend failure has a useful reason and search retries", async ({ page }) => {
  let broken = true;
  await mockTransit(page, transitFixtures(), async (route) => {
    if (!broken) return false;
    await route.fulfill({ status: 403, json: { message: "unavailable" }, headers: { "access-control-allow-origin": "*" } });
    return true;
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry data" })).toBeVisible();
  const search = page.getByRole("combobox", { name: "Search buildings and stops" });
  await search.fill("Memorial Hall");
  await expect(page.getByText("Campus location data is temporarily unavailable. Please try again.", { exact: false })).toBeVisible();
  broken = false;
  await page.getByRole("button", { name: "Retry search" }).click();
  await search.click();
  await expect(page.getByRole("option")).toHaveCount(2);
});

test("missing data and stale catalogs remain honest", async ({ page }) => {
  const tables = transitFixtures();
  tables.feed_status = tables.feed_status.map((f) => ({ ...f, source_timestamp: "2020-01-01T00:00:00Z", last_success_at: "2020-01-01T00:00:00Z" }));
  tables.transit_stops = [];
  await mockTransit(page, tables);
  await page.goto("/");
  await expect(page.getByText("Static data: stale", { exact: true })).toBeVisible();
  await expect(page.getByText("Live arrivals: stale", { exact: true })).toBeVisible();
  await expect(page.getByText("No stop or departure data is available.", { exact: false })).toBeVisible();
});

test("manual location fallback focuses the accessible place search", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Choose a building or stop" }).click();
  await expect(page.getByRole("combobox", { name: "Search buildings and stops" })).toBeFocused();
});

test("location is opt-in and shows nearest verified stops without claiming walking distances", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 33.948, longitude: -83.377 });
  await mockTransit(page);
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Nearby stops" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByRole("list", { name: "Nearby stops" })).toContainText("About 0 m in a straight line");
});

for (const [kind, code, message] of [["denied", 1, "Location is blocked"], ["unavailable", 2, "Your location isn't available"], ["timeout", 3, "Finding your location took too long"]] as const) {
  test(`location ${kind} keeps manual origin usable`, async ({ page }) => {
    await page.addInitScript((code) => {
      Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_success: unknown, failure: (error: { code: number }) => void) => failure({ code }) } });
    }, code);
    await mockTransit(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Choose a building or stop" }).click();
    await expect(page.getByRole("combobox", { name: "Search buildings and stops" })).toBeFocused();
  });
}

test("outside-area location offers manual selection and Home fits 320 px", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 40.7128, longitude: -74.006 });
  await mockTransit(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText("far from the available campus stops", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
