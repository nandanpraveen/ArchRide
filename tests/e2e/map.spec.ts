import { test, expect } from "./fixtures";
import { mockTransit, transitFixtures } from "./transit-fixtures";

test("route selection preserves repeated boarding occurrences and source direction", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/map?route=uga-passio%3Ar");
  const details = page.getByRole("region", { name: "Route details" });
  await expect(details.getByRole("heading", { name: "Campus Loop" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Ordered stop occurrences" }).getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("list", { name: "Ordered stop occurrences" })).toContainText("1. Memorial Hall");
  await expect(page.getByRole("list", { name: "Ordered stop occurrences" })).toContainText("3. Memorial Hall");
  await page.getByRole("list", { name: "Ordered stop occurrences" }).getByRole("button").nth(1).click();
  await expect(page).toHaveURL(/stop=uga-passio%3Awest/);
});

test("stop detail filters stale and cancelled predictions and preserves planning context", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/map?stop=uga-passio%3Aeast");
  const details = page.getByRole("region", { name: "Stop details" });
  await expect(details).toContainText("Northbound Loop");
  await expect(details.getByText("Source prediction", { exact: false })).toHaveCount(1);
  await expect(details.getByRole("link", { name: "Walking directions" })).toHaveAttribute("href", /destination=33.948,-83.377&travelmode=walking/);
  await details.getByRole("link", { name: "Plan to this stop" }).click();
  await expect(page).toHaveURL(url => url.pathname.replace(/\/$/, "") === "/plan" && url.searchParams.get("to") === "uga-passio:east" && (!url.searchParams.has("toType") || url.searchParams.get("toType") === "stop"));
  await expect(page.getByRole("heading", { name: "Plan your trip", exact: true })).toBeVisible();
  await expect(page.getByText("Choose a starting point to compare your trip options.", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "To", exact: true })).toHaveValue("Memorial Hall");
  await expect(page.getByRole("combobox", { name: "From", exact: true })).toBeEmpty();
});

test("a stale bus is labeled by source observation time and missing predictions are not cancellations", async ({ page }) => {
  const data = transitFixtures();
  data.transit_arrivals = [];
  await mockTransit(page, data);
  await page.goto("/map?vehicle=uga-passio%3Av");
  await expect(page.getByRole("region", { name: "Bus details" })).toContainText("stale position");
  await page.getByRole("link", { name: "Open reported stop" }).click();
  const details = page.getByRole("region", { name: "Stop details" });
  await expect(details).toContainText("Memorial Hall");
  await expect(details.getByText("No current arrival estimates are available.", { exact: false })).toBeVisible();
  await expect(details.getByText("Source prediction", { exact: false })).toHaveCount(0);
  await expect(details.getByText(/cancelled|canceled/i)).toHaveCount(0);
});

test("WebGL failure keeps the accessible directory and stop details usable", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await mockTransit(page);
  await page.goto("/map?stop=uga-passio%3Aeast");
  await expect(page.getByText("The map could not load.", { exact: false })).toBeVisible();
  await expect(page.getByRole("list", { name: "Routes", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Stop details" })).toContainText("Memorial Hall");
  await expect(page.getByRole("button", { name: "Retry map" })).toBeVisible();
});

test("invalid route, stop and place direct links fail honestly", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/map?route=unknown&stop=unknown&place=unknown&type=building");
  await expect(page.getByText("This route is not available in the current catalog.")).toBeVisible();
  await expect(page.getByText("This stop is not available in the current catalog.")).toBeVisible();
  await expect(page.getByText("This campus location is unavailable or ambiguous.", { exact: false })).toBeVisible();
});

test("directory filtering, Back and mobile layout work without map tiles", async ({ page }) => {
  await mockTransit(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/map");
  await page.getByRole("textbox", { name: "Search route and stop directory" }).fill("Science");
  await expect(page.getByRole("list", { name: "Boarding stops" }).getByRole("link")).toHaveCount(1);
  await page.getByRole("list", { name: "Boarding stops" }).getByRole("link").click();
  await expect(page).toHaveURL(/stop=uga-passio%3Asouth/);
  await page.goBack();
  await expect(page).toHaveURL(/\/map\/?$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("searchable route picker supports keyboard selection, clearing and distinguishable stops", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/map");
  const picker = page.getByRole("combobox", { name: "Route filter", exact: true });
  await picker.fill("Campus");
  await expect(page.getByRole("option", { name: "Campus Loop", exact: true })).toBeVisible();
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(page).toHaveURL(/route=uga-passio%3Ar/);
  await expect(page.getByRole("list", { name: "Ordered stop occurrences" }).getByRole("button")).toHaveCount(3);
  await picker.fill("does not exist");
  await expect(page.getByText("No matching routes. Try another name.")).toBeVisible();
  await picker.press("Escape");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL(/\/map\/?$/);
  const stops = page.getByRole("list", { name: "Boarding stops" });
  await expect(stops.getByRole("link", { name: "Memorial Hall Stop east" })).toBeVisible();
  await expect(stops.getByRole("link", { name: "Memorial Hall Stop west" })).toBeVisible();
  await page.getByRole("link", { name: "Skip map", exact: true }).click();
  await expect(page.locator("#map-sources")).toBeFocused();
});


test("browsing stays open before selected details and details are one click away", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/map?stop=uga-passio%3Aeast");
  const directory = page.getByRole("region", { name: "Transit directory", exact: true });
  const selected = page.getByRole("region", { name: "Stop details", exact: true });
  await expect(directory.getByRole("list", { name: "Routes", exact: true })).toBeVisible();
  await expect(directory.getByRole("list", { name: "Boarding stops", exact: true })).toBeVisible();
  expect(await directory.evaluate(element => {
    const details = document.getElementById("map-details")!;
    return !!(element.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await page.getByRole("link", { name: "View selected details", exact: true }).click();
  await expect(selected.getByRole("heading", { name: "Memorial Hall", exact: true })).toBeInViewport();
  await expect(page.locator("#map-details")).toBeFocused();
  const routeLink = directory.getByRole("list", { name: "Routes", exact: true }).getByRole("link").first();
  await routeLink.focus();
  await routeLink.press("Enter");
  await expect(routeLink).toHaveAttribute("aria-current", "page");
  await expect(routeLink).toBeFocused();
});
