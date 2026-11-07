import { test, expect, type Page } from "./fixtures";
import { mockTransit, transitFixtures } from "./transit-fixtures";

async function manualOrigin(page: Page, name = "Student Center") {
  const origin = page.getByRole("combobox", { name: "From", exact: true });
  await origin.fill(name);
  await page.getByRole("option").first().click();
  await origin.press("Escape");
}

test("manual origin shows real source departures and keeps origin/destination identity in Plan", async ({ page }, testInfo) => {
  await mockTransit(page);
  await page.goto("/");
  await manualOrigin(page);
  await expect(page.getByRole("combobox", { name: "From", exact: true })).toHaveValue("Mémorial Building");
  const nearby = page.getByRole("list", { name: "Nearby stops" });
  await expect(nearby).toContainText("Campus Loop");
  await expect(nearby).toContainText("Northbound Loop");
  await expect(nearby).toContainText("About this arrival");
  await expect(nearby).toContainText("About 0 m away (straight line)");
  await expect(nearby.getByText(/About this arrival/)).toHaveCount(1);
  await page.getByRole("combobox", { name: "To", exact: true }).fill("Science Center");
  await page.getByRole("option").click();
  await expect(page.getByRole("combobox", { name: "To", exact: true })).toHaveValue("Science Center");
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("home-nearby-320.png"), fullPage: true });
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  await expect(page).toHaveURL(/to=uga-passio%3Asouth&toType=stop&from=building&fromType=building/);
  await expect(page.getByRole("heading", { name: "Plan your trip", exact: true })).toBeVisible();
});

test("GPS origin is opt-in and coordinates never enter URLs or stored state", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 33.948, longitude: -83.377 });
  await mockTransit(page);
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Nearby stops" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByRole("list", { name: "Nearby stops" })).toContainText("Estimate");
  await page.getByRole("combobox", { name: "To", exact: true }).fill("Science");
  await page.getByRole("option").click();
  const plan = page.getByRole("button", { name: "Find a trip", exact: true });
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/33\.948|83\.377/);
  await plan.click();
  await expect(page).toHaveURL(/fromSource=current-location/);
  expect(page.url()).not.toMatch(/33\.948|83\.377/);
});

test("source departure validity expires without navigation or a successful refresh", async ({ page }) => {
  const tables = transitFixtures();
  tables.transit_arrivals = [{ ...tables.transit_arrivals[0], valid_until: new Date(Date.now() + 30_000).toISOString() }];
  await mockTransit(page, tables);
  await page.goto("/");
  await manualOrigin(page);
  const nearby = page.getByRole("list", { name: "Nearby stops" });
  await expect(nearby).toContainText("Estimate");
  await page.clock.install();
  await page.clock.fastForward(31_000);
  await expect(nearby.getByText(/About this arrival/)).toHaveCount(0);
  await expect(nearby).toContainText("No current arrival estimates are available");
});

test("partial ingestion refreshes source departures without changing the last successful feed clock", async ({ page }) => {
  const tables = transitFixtures();
  await page.clock.install();
  let snapshotReads = 0;
  let departureReads = 0;
  await mockTransit(page, tables, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("feed_status") && url.searchParams.get("select") === "*") snapshotReads++;
    if (url.pathname.endsWith("transit_arrivals") && url.searchParams.get("stop_id") === "eq.uga-passio:east") departureReads++;
    return false;
  });
  await page.goto("/");
  await manualOrigin(page);
  const nearby = page.getByRole("list", { name: "Nearby stops" });
  await expect(nearby).toContainText("Northbound Loop");
  const initialSnapshots = snapshotReads;
  const initialDepartures = departureReads;
  const partialAt = new Date(Date.now() + 60_000).toISOString();
  tables.feed_status = tables.feed_status.map((feed) => feed.id.endsWith(":arrivals")
    ? { ...feed, state: "stale", error_code: "partial_rejection", updated_at: partialAt, last_attempt_at: partialAt }
    : feed);
  tables.transit_arrivals = [{
    ...tables.transit_arrivals[0], id: "partial-valid-update", stop_sequence: 3,
    update_timestamp: partialAt,
  }];
  await page.clock.fastForward(61_000);
  await expect.poll(() => snapshotReads).toBeGreaterThan(initialSnapshots);
  await expect(nearby).toContainText("Northbound Loop");
  await expect(nearby).toContainText("About this arrival");
  expect(departureReads).toBeGreaterThan(initialDepartures);
});

test("fresh empty predictions and stale source state never claim route cancellation", async ({ page }) => {
  const tables = transitFixtures();
  tables.transit_arrivals = [];
  await mockTransit(page, tables);
  await page.goto("/");
  await manualOrigin(page);
  await page.getByText("Transit updates & data sources", { exact: true }).click();
  await expect(page.getByText("Live arrivals: current", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Nearby stops" })).toContainText("No current arrival estimates are available");
  tables.feed_status = tables.feed_status.map((feed) => feed.id.endsWith(":arrivals") ? { ...feed, state: "error", source_timestamp: "2020-01-01T00:00:00Z" } : feed);
  await page.reload();
  await manualOrigin(page);
  await page.getByText("Transit updates & data sources", { exact: true }).click();
  await expect(page.getByText("Live arrivals: stale", { exact: true })).toBeVisible();
  await expect(page.getByText("The arrival feed is stale.", { exact: false })).toBeVisible();
  await expect(page.getByRole("list", { name: "Nearby stops" })).not.toContainText("Estimate");
});

test("one stop departure failure leaves other stops available and can be retried", async ({ page }) => {
  const tables = transitFixtures();
  tables.transit_arrivals.push({ ...tables.transit_arrivals[0], id: "west-good", stop_id: "uga-passio:west" });
  let broken = true;
  await mockTransit(page, tables, async (route) => {
    const url = new URL(route.request().url());
    if (broken && url.pathname.endsWith("transit_arrivals") && url.searchParams.get("stop_id") === "eq.uga-passio:east") {
      await route.fulfill({ status: 500, json: { message: "unavailable" }, headers: { "access-control-allow-origin": "*" } });
      return true;
    }
    return false;
  });
  await page.goto("/");
  await manualOrigin(page);
  const nearby = page.getByRole("list", { name: "Nearby stops" });
  await expect(nearby).toContainText("Some departure details for this stop could not load");
  await expect(nearby.getByText(/About this arrival/)).toHaveCount(1);
  broken = false;
  await page.getByRole("button", { name: "Refresh departures" }).click();
  await expect(nearby.getByText(/About this arrival/)).toHaveCount(2);
  await expect(nearby).not.toContainText("Some departure details");
});

test("optional feed failures preserve Home search and nearby catalog browsing", async ({ page }) => {
  await mockTransit(page, transitFixtures(), async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("transit_alerts")) {
      await route.fulfill({ status: 403, json: { message: "unavailable" }, headers: { "access-control-allow-origin": "*" } });
      return true;
    }
    return false;
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry alerts" })).toBeVisible();
  await page.getByText("Transit updates & data sources", { exact: true }).click();
  await expect(page.getByText("Static data: current", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Service alerts" })).toContainText("Source notices could not refresh");
  await manualOrigin(page);
  await expect(page.getByRole("list", { name: "Nearby stops" })).toContainText("Campus Loop");
});

test("switching manual origins ignores an older delayed departure response", async ({ page }) => {
  const tables = transitFixtures();
  const north = { ...tables.transit_stops[0], id: "uga-passio:north", source_id_raw: "north", name: "North Campus", latitude: 33.98 };
  tables.transit_stops.push(north);
  tables.transit_arrivals = [{ ...tables.transit_arrivals[0], id: "late-old", stop_id: "uga-passio:south" }];
  let held = false;
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await mockTransit(page, tables, async (route) => {
    const url = new URL(route.request().url());
    if (!held && url.pathname.endsWith("transit_arrivals") && url.searchParams.get("stop_id") === "eq.uga-passio:south") {
      held = true;
      await delayed;
    }
    return false;
  });
  await page.goto("/");
  await manualOrigin(page);
  await expect.poll(() => held).toBe(true);
  await manualOrigin(page, "North Campus");
  await expect(page.getByRole("list", { name: "Nearby stops" })).toContainText("North Campus");
  await expect(page.getByRole("list", { name: "Nearby stops" })).not.toContainText("Science Center");
  release();
  await expect(page.getByRole("list", { name: "Nearby stops" })).not.toContainText("Estimate");
  await expect(page.getByRole("combobox", { name: "From", exact: true })).toHaveValue("North Campus");
});

test("a delayed GPS result cannot replace a manually selected origin", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (success: (position: unknown) => void) => {
      (window as unknown as { finishGPS: () => void }).finishGPS = () => success({ coords: { latitude: 40.7, longitude: -74 } });
    } } });
  });
  await mockTransit(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Use my location" }).click();
  await manualOrigin(page);
  await page.evaluate(() => (window as unknown as { finishGPS: () => void }).finishGPS());
  await expect(page.getByRole("combobox", { name: "From", exact: true })).toHaveValue("Mémorial Building");
  await expect(page.getByText("far from the available campus stops", { exact: false })).toHaveCount(0);
});
