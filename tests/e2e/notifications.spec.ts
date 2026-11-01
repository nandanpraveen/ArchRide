import { test, expect, type Page } from "@playwright/test";
import { mockTransit, transitFixtures } from "./transit-fixtures";

const WATCHED_KEY = "archride.watched-buses.v1";
const PREFERENCES_KEY = "archride.notification-preferences.v1";

// The fixture's one bus (a trip at the "Memorial Hall" stop), as a student would be watching it.
const watchedBus = () => ({
  tripId: "uga-passio:trip",
  stopId: "uga-passio:east",
  routeName: "Campus Loop",
  stopName: "Memorial Hall",
  addedAt: Date.now(),
});

// Seeds device storage once, so later page loads keep whatever the test changed.
async function seed(page: Page, key: string, value: unknown) {
  await page.addInitScript(
    ([storageKey, json]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, json);
    },
    [key, JSON.stringify(value)],
  );
}

// The fixture's bus with a fresh prediction due `minutes` from now.
function busDue(minutes: number, overrides: Partial<ReturnType<typeof transitFixtures>["transit_arrivals"][number]> = {}) {
  const tables = transitFixtures();
  const now = Date.now();
  tables.transit_arrivals = [
    {
      ...tables.transit_arrivals[0],
      arrival_at: new Date(now + minutes * 60_000).toISOString(),
      valid_until: new Date(now + (minutes + 5) * 60_000).toISOString(),
      update_timestamp: new Date(now).toISOString(),
      ...overrides,
    },
  ];
  return tables;
}

const leaveNowAlert = (page: Page) => page.getByRole("alert").filter({ hasText: "Leave now if you want to catch it" });
const bell = (page: Page) => page.getByRole("link", { name: "Notifications", exact: true });

// Resolves once the reminder check has read the watched bus's arrival rows.
const arrivalsChecked = (page: Page) =>
  page.waitForResponse((response) => response.url().includes("/transit_arrivals") && response.ok());

async function chooseHomeOrigin(page: Page, name = "Student Center") {
  await page.getByRole("button", { name: "Choose a building or stop" }).click();
  const origin = page.getByRole("combobox", { name: "Choose your starting building or stop" });
  await origin.fill(name);
  await page.getByRole("option").first().click();
  await origin.press("Escape");
}

test("a student can watch a bus from Home, gets a reminder naming the route, and can stop watching", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/");
  await chooseHomeOrigin(page);
  const nearby = page.getByRole("list", { name: "Nearby stops" });
  // The button names the route by its readable name, not its internal id.
  const watch = nearby.getByRole("button", { name: "Watch Campus Loop at Memorial Hall" });
  await expect(watch).toBeVisible();
  await expect(watch).toHaveAttribute("aria-pressed", "false");

  await watch.click();
  const stop = nearby.getByRole("button", { name: "Stop watching Campus Loop at Memorial Hall" });
  await expect(stop).toHaveAttribute("aria-pressed", "true");
  // The fixture's bus is about 5 minutes away, which is within the default lead time, so the check fires at once.
  await expect(leaveNowAlert(page)).toContainText("Campus Loop at Memorial Hall");
  expect(await page.evaluate((key) => localStorage.getItem(key), WATCHED_KEY)).toContain("uga-passio:trip");

  await stop.click();
  await expect(watch).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), WATCHED_KEY)).toBe("[]");
});

test("a guest sees an empty notification center that says where notifications are kept", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "No notifications" })).toBeVisible();
  await expect(page.getByText(/kept on this device only/)).toBeVisible();
  await expect(bell(page)).toBeVisible();
});

test("reminder settings are saved on this device and are honest about in-app delivery", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Leave-now reminders" })).toBeVisible();
  await expect(page.getByText(/not sent as texts, emails or phone notifications/)).toBeVisible();

  const toggle = page.getByLabel("Remind me when a watched bus is close");
  const lead = page.getByRole("combobox", { name: "How early to remind me" });
  await expect(toggle).toBeChecked();
  await expect(lead).toHaveText("5 minutes");

  await lead.click();
  await page.getByRole("option", { name: "10 minutes" }).click();
  await expect(page.getByText("Saved on this device.")).toBeVisible();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();

  await page.reload();
  await expect(toggle).not.toBeChecked();
  await expect(lead).toHaveText("10 minutes");
});

test("a close watched bus creates one leave-now reminder that can be read, cleared, and stays cleared", async ({ page }) => {
  await mockTransit(page, busDue(3));
  await seed(page, WATCHED_KEY, [watchedBus()]);
  await page.goto("/");

  const banner = leaveNowAlert(page);
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Campus Loop at Memorial Hall");
  await expect(page.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible();

  await banner.getByRole("link", { name: "View" }).click();
  // The dev server compiles /notifications on first visit, which can take longer than the default 5 s.
  await expect(page).toHaveURL(/\/notifications$/, { timeout: 15_000 });
  const list = page.getByRole("region", { name: "Notification list" });
  await expect(list).toContainText(/Your bus is [23] minutes away/);
  await expect(list).toContainText("Campus Loop at Memorial Hall");
  await expect(list.getByRole("link", { name: /^Open:/ })).toHaveAttribute("href", "/map?stop=uga-passio%3Aeast");
  await expect(page.getByText("1 unread", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^Mark read:/ }).click();
  await expect(page.getByText("All read", { exact: true })).toBeVisible();
  await expect(bell(page)).toBeVisible();

  await page.getByRole("button", { name: /^Clear:/ }).click();
  await expect(page.getByRole("heading", { name: "No notifications" })).toBeVisible();

  // The bus is still close and still watched, but a cleared reminder must not come back.
  const checked = arrivalsChecked(page);
  await page.reload();
  await checked;
  await page.waitForTimeout(500);
  await expect(page.getByRole("heading", { name: "No notifications" })).toBeVisible();
  await expect(bell(page)).toBeVisible();
});

test("opening a reminder goes to its stop and marks it read", async ({ page }) => {
  await mockTransit(page, busDue(3));
  await seed(page, WATCHED_KEY, [watchedBus()]);
  await page.goto("/notifications");
  const open = page.getByRole("link", { name: /^Open:/ });
  await expect(open).toHaveAttribute("href", "/map?stop=uga-passio%3Aeast");
  await expect(page.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible();

  await open.click();
  // The dev server compiles /map on first visit, which can take longer than the default 5 s.
  await expect(page).toHaveURL(/\/map\?stop=uga-passio%3Aeast$/, { timeout: 15_000 });
  await expect(bell(page)).toBeVisible();
});

test("the student's own lead time decides when the reminder appears", async ({ page }) => {
  await mockTransit(page, busDue(8));
  await seed(page, WATCHED_KEY, [watchedBus()]);
  await seed(page, PREFERENCES_KEY, {
    leaveNowEnabled: true,
    classRemindersEnabled: true,
    alertsEnabled: true,
    tripUpdatesEnabled: true,
    busLeadMinutes: 10,
  });
  await page.goto("/");
  await expect(leaveNowAlert(page)).toContainText(/Your bus is [78] minutes away/);
});

test("a bus that is still far away creates nothing and stays watched", async ({ page }) => {
  await mockTransit(page, busDue(12));
  await seed(page, WATCHED_KEY, [watchedBus()]);
  const checked = arrivalsChecked(page);
  await page.goto("/");
  await checked;
  await page.waitForTimeout(500);
  await expect(leaveNowAlert(page)).toHaveCount(0);
  await expect(bell(page)).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), WATCHED_KEY)).toContain("uga-passio:trip");
});

test("turning leave-now reminders off creates nothing", async ({ page }) => {
  await mockTransit(page, busDue(3));
  await seed(page, WATCHED_KEY, [watchedBus()]);
  await seed(page, PREFERENCES_KEY, {
    leaveNowEnabled: false,
    classRemindersEnabled: true,
    alertsEnabled: true,
    tripUpdatesEnabled: true,
    busLeadMinutes: 5,
  });
  const checked = arrivalsChecked(page);
  await page.goto("/");
  await checked;
  await page.waitForTimeout(500);
  await expect(leaveNowAlert(page)).toHaveCount(0);
  await expect(bell(page)).toBeVisible();
});

test("when the arrival feed is not healthy no reminder is created from its predictions", async ({ page }) => {
  const tables = busDue(3);
  tables.feed_status = tables.feed_status.map((feed) => (feed.id === "uga-passio:arrivals" ? { ...feed, state: "failed" } : feed));
  await mockTransit(page, tables);
  await seed(page, WATCHED_KEY, [watchedBus()]);
  const checked = arrivalsChecked(page);
  await page.goto("/");
  await checked;
  await page.waitForTimeout(500);
  await expect(leaveNowAlert(page)).toHaveCount(0);
  await expect(bell(page)).toBeVisible();
});

test("a cancelled bus produces a cancellation notice and is no longer watched", async ({ page }) => {
  await mockTransit(page, busDue(3, { relationship: "CANCELED" }));
  await seed(page, WATCHED_KEY, [watchedBus()]);
  await page.goto("/");
  const banner = page.getByRole("alert").filter({ hasText: "Bus watch cancelled." });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Campus Loop at Memorial Hall");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), WATCHED_KEY)).toBe("[]");
});

test("a bus with no prediction row is not reported as cancelled", async ({ page }) => {
  const tables = busDue(3);
  tables.transit_arrivals = [];
  await mockTransit(page, tables);
  await seed(page, WATCHED_KEY, [watchedBus()]);
  const checked = arrivalsChecked(page);
  await page.goto("/");
  await checked;
  await page.waitForTimeout(500);
  await expect(page.getByRole("alert").filter({ hasText: "cancelled" })).toHaveCount(0);
  await expect(bell(page)).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), WATCHED_KEY)).toContain("uga-passio:trip");
});
