import { expect, test, type Page } from "@playwright/test";
import { mockTransit, transitFixtures } from "./transit-fixtures";

const KEY = "archride.notifications.v1";
const reminder = () => ({
  id: "device-reminder", type: "trip", title: "Review your trip", body: "Compare current options before leaving.",
  link: "/plan", dedupeKey: "trip:device-test", createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(), readAt: null,
});
async function mockDevice(page: Page) {
  const tables = transitFixtures();
  tables.transit_alerts = [];
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    const url = decodeURIComponent(request.url());
    if (/\/auth\/v1\//.test(url) || /\/rest\/v1\/(classes|notifications|notification_preferences|profiles|active_trips|saved_items)(\?|$)/.test(url)) privateRequests.push(url);
  });
  await mockTransit(page, tables);
  return privateRequests;
}
async function seed(page: Page) {
  await page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, [KEY, JSON.stringify([reminder()])]);
}

test("notification read and clear changes persist across tabs without accounts or private API requests", async ({ page, context }) => {
  const requests = await mockDevice(page);
  await seed(page);
  await page.goto("/notifications");
  const second = await context.newPage();
  const secondRequests = await mockDevice(second);
  await second.goto("/notifications");
  await expect(second.getByRole("region", { name: "Notification list" })).toContainText("Review your trip");
  await page.getByRole("button", { name: "Mark read: Review your trip", exact: true }).click();
  await expect(second.getByText("All read", { exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Clear: Review your trip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No notifications" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "No notifications" })).toBeVisible();
  expect(requests).toEqual([]);
  expect(secondRequests).toEqual([]);
});

test("notification preferences update across tabs and survive reload", async ({ page, context }) => {
  const requests = await mockDevice(page);
  await page.goto("/profile");
  const firstToggle = page.getByLabel("Remind me when a watched bus is close");
  await expect(firstToggle).toBeChecked();
  const second = await context.newPage();
  const secondRequests = await mockDevice(second);
  await second.goto("/profile");
  const secondToggle = second.getByLabel("Remind me when a watched bus is close");
  await expect(secondToggle).toBeChecked();
  await firstToggle.uncheck();
  await expect(secondToggle).not.toBeChecked();
  await page.getByLabel("Active trip updates", { exact: true }).uncheck();
  await expect(second.getByLabel("Active trip updates", { exact: true })).not.toBeChecked();
  await second.reload();
  await expect(secondToggle).not.toBeChecked();
  await expect(second.getByLabel("Active trip updates", { exact: true })).not.toBeChecked();
  expect(requests).toEqual([]);
  expect(secondRequests).toEqual([]);
});

test("a separate browser context does not see another browser's local notifications", async ({ page, browser }) => {
  await mockDevice(page);
  await seed(page);
  await page.goto("/notifications");
  await expect(page.getByRole("region", { name: "Notification list" })).toContainText("Review your trip");
  const isolatedContext = await browser.newContext();
  try {
    const isolated = await isolatedContext.newPage();
    const requests = await mockDevice(isolated);
    await isolated.goto("http://127.0.0.1:3100/notifications");
    await expect(isolated.getByRole("heading", { name: "No notifications" })).toBeVisible();
    expect(requests).toEqual([]);
  } finally { await isolatedContext.close(); }
});
