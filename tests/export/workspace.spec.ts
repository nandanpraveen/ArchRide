import { test, expect } from "@playwright/test";
import { noHorizontalOverflow, readyForLayout, snapshot, syntheticExportData } from "./fixtures";

for (const width of [900, 1200, 1920, 2560]) {
  test(`${width}px workspace uses available width and keeps related tasks together`, async ({ page }, info) => {
    await syntheticExportData(page);
    await page.setViewportSize({ width, height: 1080 });
    await page.goto("/archride/");
    await readyForLayout(page, "");
    const main = (await page.getByRole("main").boundingBox())!;
    expect(main.width).toBeGreaterThanOrEqual(width - 1);
    const form = page.getByRole("form", { name: "Plan your journey" });
    const overview = page.getByRole("region", { name: "Campus overview" });
    const day = page.getByRole("complementary", { name: "Your campus day" });
    const formBox = (await form.boundingBox())!, mapBox = (await overview.boundingBox())!, dayBox = (await day.boundingBox())!;
    expect(mapBox.x).toBeGreaterThanOrEqual(formBox.x + formBox.width);
    expect(Math.abs(mapBox.y - formBox.y)).toBeLessThan(2);
    if (width >= 1200) {
      expect(dayBox.x).toBeGreaterThanOrEqual(mapBox.x + mapBox.width);
      expect(Math.abs(dayBox.y - formBox.y)).toBeLessThan(2);
    }
    await page.getByRole("combobox", { name: "From", exact: true }).fill("Student Center");
    await page.getByRole("option", { name: /Mémorial Building/ }).click();
    const departures = page.getByRole("region", { name: "Nearby stops and departures" });
    await expect(departures).toBeVisible();
    const departureBox = (await departures.boundingBox())!;
    expect(Math.abs(departureBox.x - formBox.x)).toBeLessThan(2);
    expect(departureBox.y).toBeGreaterThan(formBox.y + formBox.height);
    await noHorizontalOverflow(page);
    if (width === 1920) await snapshot(page, info, "home-wide-with-origin");
    await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
    await noHorizontalOverflow(page);

    await page.goto("/archride/plan/?from=building&fromType=building&to=destination&toType=building");
    await readyForLayout(page, "plan/?");
    const tripForm = (await page.getByRole("region", { name: "Edit your journey" }).boundingBox())!;
    const tripMap = (await page.getByRole("region", { name: "Journey map" }).boundingBox())!;
    const options = (await page.getByRole("region", { name: "Journey options" }).boundingBox())!;
    expect(options.x).toBeGreaterThan(tripForm.x + tripForm.width);
    if (width >= 1200) {
      expect(tripMap.x).toBeGreaterThan(tripForm.x + tripForm.width);
      expect(options.x).toBeGreaterThan(tripMap.x + tripMap.width);
      expect(Math.abs(tripMap.y - options.y)).toBeLessThan(2);
    }
    await noHorizontalOverflow(page);
    await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
    await noHorizontalOverflow(page);
    for (const route of ["map/", "profile/", "classes/", "saved/", "notifications/", "privacy/"]) {
      await page.goto("/archride/" + route);
      await readyForLayout(page, route);
      await noHorizontalOverflow(page);
      await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
      await noHorizontalOverflow(page);
    }
  });
}

test("phone trip results stay first, edit links work, and the map renderer stays unloaded", async ({ page }) => {
  await syntheticExportData(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/archride/plan/?from=building&fromType=building&to=destination&toType=building");
  await readyForLayout(page, "plan/?");
  await expect(page.locator(".maplibregl-map")).toHaveCount(0);
  const options = (await page.getByRole("region", { name: "Journey options" }).boundingBox())!;
  const form = (await page.getByRole("form", { name: "Plan your journey" }).boundingBox())!;
  expect(options.y).toBeLessThan(form.y);
  await page.getByRole("link", { name: "Edit trip", exact: true }).click();
  const input = page.getByRole("combobox", { name: "From", exact: true });
  await expect(input).toBeInViewport();
  await noHorizontalOverflow(page);
});

for (const width of [320, 768]) test(`${width}px undo stays clear of bottom navigation and selected map details are reachable`, async ({ page }) => {
  await syntheticExportData(page);
  await page.setViewportSize({ width, height: 812 });
  await page.goto("/archride/map/?stop=uga-passio%3Aeast");
  const details = page.getByRole("region", { name: "Stop details" });
  await details.getByRole("button", { name: "Save stop", exact: true }).click();
  await expect(details.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "View selected details", exact: true }).click();
  await expect(details.getByRole("heading", { name: "Memorial Hall", exact: true })).toBeInViewport();
  await page.goto("/archride/saved/");
  await page.getByRole("button", { name: "Remove Memorial Hall", exact: true }).click();
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeVisible();
  await expect(async () => {
    const toast = (await undo.boundingBox())!;
    const navigation = (await page.getByRole("navigation", { name: "Primary navigation", exact: true }).filter({ visible: true }).boundingBox())!;
    expect(toast.y + toast.height).toBeLessThan(navigation.y);
  }).toPass({ timeout: 3000 });
  await undo.click();
  await expect(page.getByRole("button", { name: "Remove Memorial Hall", exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
});

test("saved journeys and stops share desktop space and stack on phones", async ({ page }) => {
  await syntheticExportData(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/archride/plan/?from=building&fromType=building&to=destination&toType=building");
  await page.getByRole("button", { name: "Save journey", exact: true }).click();
  await expect(page.getByRole("button", { name: "Journey saved", exact: true })).toBeDisabled();
  await page.goto("/archride/map/?stop=uga-passio%3Aeast");
  await page.getByRole("button", { name: "Save stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/archride/saved/");
  const journeys = page.getByRole("region", { name: "Journeys", exact: true });
  const stops = page.getByRole("region", { name: "Stops", exact: true });
  await expect(journeys).toBeVisible();
  const journeyBox = (await journeys.boundingBox())!, stopBox = (await stops.boundingBox())!;
  expect(Math.abs(journeyBox.y - stopBox.y)).toBeLessThan(2);
  expect(stopBox.x).toBeGreaterThan(journeyBox.x + journeyBox.width);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(async () => {
    const stackedJourney = (await journeys.boundingBox())!, stackedStop = (await stops.boundingBox())!;
    expect(stackedStop.y).toBeGreaterThan(stackedJourney.y + stackedJourney.height);
  }).toPass({ timeout: 3000 });
  await noHorizontalOverflow(page);
});
