import { test, expect, type Page } from "./fixtures";
import { mockTransit, transitFixtures } from "./transit-fixtures";

type FixtureTables = Record<string, Record<string, unknown>[]>;
const planUrl = "/plan?from=building&fromType=building&to=destination&toType=building";
const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
async function plannerFixture(page: Page) {
  const tables = transitFixtures() as FixtureTables;
  const now = Date.now(), stamp = new Date(now).toISOString();
  tables.transit_buildings.push({ ...tables.transit_buildings[0], id: "destination", name: "Science Library", latitude: 33.95 });
  tables.transit_arrivals = [
    { ...tables.transit_arrivals[0], id: "board", arrival_at: new Date(now + 600000).toISOString(), valid_until: new Date(now + 90000).toISOString() },
    { ...tables.transit_arrivals[0], id: "exit", stop_id: "uga-passio:west", stop_sequence: 2, arrival_at: new Date(now + 900000).toISOString(), valid_until: new Date(now + 90000).toISOString() },
  ];
  await mockTransit(page, tables);
  await page.route("**/functions/v1/walking-route", async (route) => {
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    const body = route.request().postDataJSON() as { from: { id: string }; to: { id: string } };
    const direct = ["building", "destination"].includes(body.from.id) && ["building", "destination"].includes(body.to.id);
    await route.fulfill({ headers, json: { originId: body.from.id, destinationId: body.to.id, seconds: direct ? 1800 : 60, meters: direct ? 1200 : 70, coordinates: [[-83.377, 33.948], [-83.377, 33.95]], provider: "FOSSGIS / OpenStreetMap test fixture", fetchedAt: stamp, expiresAt: new Date(now + 3600000).toISOString() } });
  });
  return { tables };
}
async function startBus(page: Page) {
  await page.goto(planUrl);
  await expect(page.getByRole("heading", { name: "Plan your trip", exact: true })).toBeVisible();
  const bus = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Campus Loop", exact: true }) }).first();
  await expect(bus).toContainText("Northbound Loop");
  await expect(bus).toContainText("Board at · Stop east");
  await expect(bus).toContainText("Get off at Memorial Hall · Stop west");
  await bus.getByRole("button", { name: "Start trip", exact: true }).click();
  const active = page.getByRole("region", { name: "Active trip" });
  await expect(active).toContainText("Walk to boarding stop");
  await expect(active).toContainText("Estimated destination arrival:");
  return active;
}

test("guest trip survives reload, confirms boarding location and recovers without the missed instance", async ({ page }) => {
  await plannerFixture(page);
  let active = await startBus(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("archride.personal.v1:account:10000000-0000-0000-0000-000000000001")!).active);
  expect(saved.alightingSequence).toBe(2);
  expect(saved.tripId).toBe("uga-passio:trip");
  expect(JSON.stringify(saved)).not.toMatch(/latitude|longitude/);
  await page.goto("/plan");
  active = page.getByRole("region", { name: "Active trip" });
  await expect(active).toContainText("Science Library");
  await expect(active).toContainText("Estimated destination arrival:");
  await active.getByRole("button", { name: "I’m at the stop", exact: true }).click();
  await expect(active.getByRole("heading", { name: "Wait and board", exact: true })).toBeVisible();
  await active.getByRole("button", { name: "I missed the bus", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("from") === "uga-passio:east" && url.searchParams.get("to") === "destination" && url.searchParams.get("missed") === "test-instance" && url.searchParams.get("recovery") === "missed");
  await expect(active).toHaveCount(0);
  await expect(page.getByText("The missed bus is excluded.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start trip", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Start walking", exact: true }).click();
  active = page.getByRole("region", { name: "Active trip" });
  await expect(active).toContainText("Your current location and arrival time are not tracked");
  await active.getByRole("button", { name: "I’ve arrived", exact: true }).click();
  await expect(active).toHaveCount(0);
  await expect(page.getByText("You’ve arrived. Your trip is complete.")).toBeVisible();
});

test("active countdown evidence expires and only a current source cancellation changes trip status", async ({ page }) => {
  const { tables } = await plannerFixture(page);
  const active = await startBus(page);
  await page.clock.install();
  await page.clock.fastForward(91000);
  await expect(active).toContainText("Current bus timing cannot be verified");
  await expect(active.getByText("Estimated destination arrival:", { exact: false })).toHaveCount(0);
  const now = await page.evaluate(() => Date.now()), stamp = new Date(now).toISOString();
  tables.feed_status = tables.feed_status.map((feed) => ({ ...feed, source_timestamp: stamp, last_success_at: stamp, updated_at: stamp }));
  tables.transit_arrivals = tables.transit_arrivals.map((arrival) => ({ ...arrival, relationship: "CANCELED", update_timestamp: stamp, source_timestamp: stamp, valid_until: new Date(now + 90000).toISOString() }));
  await active.getByRole("button", { name: "Refresh timing", exact: true }).click();
  await expect(active).toContainText("The source reports a cancellation or skipped stop");
  await expect(active.getByRole("button", { name: "I missed the bus", exact: true })).toBeEnabled();
  await active.getByRole("button", { name: "End trip", exact: true }).click();
  await expect(active).toHaveCount(0);
});
