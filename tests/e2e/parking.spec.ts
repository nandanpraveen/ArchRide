import { test, expect } from "@playwright/test";
import { mockTransit } from "./transit-fixtures";

test("parking has guest-accessible deep links, weekly rules and separate payment conditions", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/map?parking=e23");
  const details = page.getByRole("region", { name: "Parking details" });
  await expect(details.getByRole("heading", { name: "College Station Park and Ride" })).toBeVisible();
  await expect(details.getByText("Unknown: check TPS and posted signs", { exact: true }).first()).toBeVisible();
  await details.getByText("Permits, registration & visitors", { exact: true }).click();
  await expect(details).toContainText("Registration is separate from a parking permit");
  await expect(details).toContainText("Daily paid visitor parking via ParkMobile");
  await details.getByText("Weekly hours", { exact: true }).click();
  for (const day of ["Monday", "Friday", "Sunday"]) await expect(details.getByText(day, { exact: true })).toBeVisible();
  await expect(details.getByRole("link", { name: "TPS parking rules" })).toHaveAttribute("href", "https://tps.uga.edu/parking/enforcement/");
  await expect(page.getByRole("tab", { name: "Parking", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("parking list survives complete transit failure and keyboard selection preserves browser history", async ({ page }) => {
  await mockTransit(page, {}, async route => { await route.abort(); return true; });
  await page.goto("/map?parking=vmc");
  await page.getByRole("textbox", { name: "Search parking lots and decks" }).fill("E26");
  const item = page.getByRole("list", { name: "Parking lots and decks" }).getByRole("button");
  await expect(item).toHaveCount(1);
  await item.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/parking=e26/);
  await expect(page.getByRole("region", { name: "Parking details" })).toContainText("East Side Park & Ride");
  await page.goBack();
  await expect(page).toHaveURL(/parking=vmc/);
});

test("invalid parking links and empty search are actionable at 320px with large text", async ({ page }) => {
  await mockTransit(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/map?parking=unknown");
  await expect(page.getByText("This parking location is not in the verified inventory.", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Search parking lots and decks" }).fill("no matching parking");
  await expect(page.getByText("No parking locations match this search.", { exact: false })).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 24px; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("event mode cannot present ordinary vehicle access as authorization", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/map?parking=tsl");
  const details = page.getByRole("region", { name: "Parking details" });
  await details.getByRole("combobox", { name: "Event conditions" }).click();
  await page.getByRole("option", { name: "Gameday or special event", exact: true }).click();
  await expect(details).toContainText("Restricted: check event instructions");
  await details.getByText("Events & special spaces", { exact: true }).click();
  await expect(details).toContainText("Thursday at 5:15 PM");
  await expect(details).toContainText("Reserved, accessible and state-vehicle spaces");
});

test("geolocation outside Athens reports the boundary while manual parking selection remains available", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 33.749, longitude: -84.388 });
  await mockTransit(page);
  await page.goto("/map?parking=hsc");
  const locate = page.getByRole("button", { name: "Find my location", exact: true });
  await expect(locate).toBeVisible();
  await locate.click();
  await expect(page.getByText("Your location is outside the supported campus area.", { exact: false })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search parking lots and decks" })).toBeVisible();
});
