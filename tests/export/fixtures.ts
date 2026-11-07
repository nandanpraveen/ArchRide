import { expect, type Page, type TestInfo } from "@playwright/test";
import { mockAuth } from "../auth/fixtures";
import { mockTransit, transitFixtures } from "../e2e/transit-fixtures";

/** Deterministic synthetic data. These tests establish UI behavior, not real ETA quality. */
export async function syntheticExportData(page: Page, signedIn = true) {
  await mockAuth(page, signedIn);
  const tables: Record<string, Record<string, unknown>[]> = transitFixtures();
  const now = Date.now(), stamp = new Date(now).toISOString();
  tables.transit_buildings.push({ ...tables.transit_buildings[0], id: "destination", name: "Science Library", latitude: 33.95 });
  tables.transit_arrivals = [];
  await mockTransit(page, tables);
  await page.route("**/functions/v1/walking-route", async route => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    const body = route.request().postDataJSON() as { from: { id: string }; to: { id: string } };
    await route.fulfill({ headers, json: { originId: body.from.id, destinationId: body.to.id, seconds: 420, meters: 460, coordinates: [[-83.377, 33.948], [-83.377, 33.95]], provider: "Synthetic export test; FOSSGIS contract", fetchedAt: stamp, expiresAt: new Date(now + 3600000).toISOString() } });
  });
  return tables;
}

export async function noHorizontalOverflow(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const width = page.viewportSize()?.width ?? await page.evaluate(() => innerWidth);
  const overflow = await page.evaluate(expected => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - expected, width);
  expect(overflow, `Horizontal overflow at ${JSON.stringify(page.viewportSize())} on ${page.url()}`).toBeLessThanOrEqual(1);
}

export async function readyForLayout(page: Page, route: string) {
  await expect(page.locator("main h1")).toBeVisible();
  if (!route) {
    await expect(page.getByRole("button", { name: "Find a trip", exact: true })).toBeEnabled();
    await expect(page.getByText("Loading map…", { exact: true })).toHaveCount(0);
  }
  if (route.startsWith("profile/")) {
    await expect(page.getByRole("button", { name: "Save preferences", exact: true })).toBeEnabled();
    await expect(page.getByRole("switch", { name: "Class reminders", exact: true })).toBeEnabled();
  }
  if (route.startsWith("plan/?")) await expect(page.getByRole("heading", { name: "Walk directly", exact: true })).toBeVisible();
  if (route.startsWith("map/?parking=")) await expect(page.getByRole("combobox", { name: "Event conditions", exact: true })).toBeEnabled();
  else if (route.startsWith("map/")) await expect(page.getByRole("combobox", { name: "Route filter", exact: true })).toBeEnabled();
  await expect(page.locator("main .MuiSkeleton-root")).toHaveCount(0);
  await expect(page.getByText("Loading notifications…", { exact: true })).toHaveCount(0);
}

export async function assertStudentNavigation(page: Page) {
  const links = await page.locator('a[href^="/"]').evaluateAll(elements => elements.map(el => el.getAttribute("href")));
  expect(links.filter(href => href && !href.startsWith("/archride"))).toEqual([]);
  await expect(page.getByRole("link", { name: /^(sign in|sign up|create account)$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(sign in|sign up|create account)$/i })).toHaveCount(0);
}

export async function snapshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}
