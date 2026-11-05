import { test, expect } from "@playwright/test";
import { mockTransit, transitFixtures } from "./transit-fixtures";

async function status(page: import("@playwright/test").Page) {
  await page.getByText("Transit updates & data sources", { exact: true }).click();
}

test("Home uses the catalog and filters source notice periods", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/");
  await status(page);
  await expect(page.getByText("Static data: current", { exact: true })).toBeVisible();
  await expect(page.getByText("3 verified stops are available", { exact: false })).toBeVisible();
  await page.getByText("Service updates (1)", { exact: true }).click();
  await expect(page.getByText("Board at the signed stop", { exact: true })).toBeVisible();
  await expect(page.getByText("Future notice hidden")).toHaveCount(0);
  await expect(page.getByText("Expired notice hidden")).toHaveCount(0);
});

test("keyboard search preserves duplicate stop identity in the complete trip query", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/");
  const from = page.getByRole("combobox", { name: "From", exact: true });
  await from.fill("Student Center");
  await page.getByRole("option").click();
  const to = page.getByRole("combobox", { name: "To", exact: true });
  await to.fill("  MEMORIAL   hall  ");
  await expect(page.getByRole("option")).toHaveCount(2);
  await to.press("ArrowDown");
  await to.press("ArrowDown");
  await to.press("Enter");
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  await expect(page).toHaveURL(/to=uga-passio%3Awest&toType=stop&from=building&fromType=building/);
});

test("changing search removes old options and ignores a delayed older result", async ({ page }) => {
  let held = false;
  await mockTransit(page, transitFixtures(), async (route) => {
    const u = new URL(route.request().url());
    if (!held && u.pathname.endsWith("transit_stops") && u.searchParams.get("select") === "id,name,latitude,longitude") {
      held = true;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return false;
  });
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "To", exact: true });
  await search.fill("Memorial Hall");
  await expect.poll(() => held).toBe(true);
  await search.fill("Science");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Science Center");
});

test("building aliases retain building type when the trip is opened", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "From", exact: true }).fill("Science");
  await page.getByRole("option").click();
  await page.getByRole("combobox", { name: "To", exact: true }).fill("Student Center");
  await page.getByRole("option").click();
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  await expect(page).toHaveURL(/to=building&toType=building&from=uga-passio%3Asouth&fromType=stop/);
});

test("failed campus search keeps an explicit retry action", async ({ page }) => {
  let broken = true;
  await mockTransit(page, transitFixtures(), async (route) => {
    if (!broken) return false;
    await route.fulfill({ status: 403, json: { message: "unavailable" } });
    return true;
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry data" })).toBeVisible();
  const search = page.getByRole("combobox", { name: "To", exact: true });
  await search.fill("Memorial Hall");
  await expect(page.getByText("Campus location data is temporarily unavailable. Please try again.", { exact: false })).toBeVisible();
  broken = false;
  await page.getByRole("button", { name: "Retry search" }).click();
  await expect(page.getByRole("option")).toHaveCount(2);
});

test("missing stops and stale sources have honest states", async ({ page }) => {
  const tables = transitFixtures();
  tables.feed_status = tables.feed_status.map((f) => ({ ...f, source_timestamp: "2020-01-01T00:00:00Z", last_success_at: "2020-01-01T00:00:00Z" }));
  tables.transit_stops = [];
  await mockTransit(page, tables);
  await page.goto("/");
  await status(page);
  await expect(page.getByText("Static data: stale", { exact: true })).toBeVisible();
  await expect(page.getByText("Live arrivals: stale", { exact: true })).toBeVisible();
  await expect(page.getByText("0 verified stops are available", { exact: false })).toBeVisible();
});

test("location is opt-in and nearby distances are labeled straight line", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 33.948, longitude: -83.377 });
  await mockTransit(page);
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Nearby stops" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByRole("list", { name: "Nearby stops" })).toContainText("About 0 m away (straight line)");
});

for (const [kind, code] of [["denied", 1], ["unavailable", 2], ["timeout", 3]] as const) {
  test(`location ${kind} keeps manual origin usable`, async ({ page }) => {
    await page.addInitScript((code) => {
      Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_success: unknown, failure: (error: { code: number }) => void) => failure({ code }) } });
    }, code);
    await mockTransit(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByRole("alert").filter({ hasText: code === 1 ? "Location is blocked" : "We couldn't find your location" })).toBeVisible();
    const from = page.getByRole("combobox", { name: "From", exact: true });
    await from.fill("Student Center");
    await page.getByRole("option").click();
    await expect(from).toHaveValue("Mémorial Building");
  });
}

test("outside-area location retains manual selection and fits 320 px", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 40.7128, longitude: -74.006 });
  await mockTransit(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText("outside the supported Athens campus area", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
