import { test, expect, type Page } from "./fixtures";
import { mockTransit } from "./transit-fixtures";
import { DEFAULT_TRAVEL } from "../../src/lib/personal";

async function browserNotifications(page: Page, denied = false) {
  await mockTransit(page);
  await page.addInitScript((deny) => {
    let permission: NotificationPermission = "default";
    let subscribed = false;
    const calls = { prompts: 0, subscriptions: 0, unsubscribes: 0 };
    Object.assign(window, { notificationCalls: calls });
    Object.defineProperty(Notification, "permission", { get: () => permission });
    Notification.requestPermission = async () => { calls.prompts++; permission = deny ? "denied" : "granted"; return permission; };
    const subscription = { toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/test", keys: { auth: "a".repeat(22), p256dh: "B".repeat(87) } }), unsubscribe: async () => { calls.unsubscribes++; subscribed = false; return true; } };
    PushManager.prototype.getSubscription = async () => subscribed ? subscription as unknown as PushSubscription : null;
    PushManager.prototype.subscribe = async () => { calls.subscriptions++; subscribed = true; return subscription as unknown as PushSubscription; };
  }, denied);
  const requests: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/push-reminders", async route => {
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } }); return; }
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { publicKey: "B".repeat(87) }, headers: { "access-control-allow-origin": "*" } }); return;
    }
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { syncedAt: new Date().toISOString() }, headers: { "access-control-allow-origin": "*" } });
  });
  return requests;
}

test("browser notification permission is opt-in, reminders sync, and turning off unsubscribes", async ({ page }) => {
  const requests = await browserNotifications(page);
  await page.goto("/profile");
  const enable = page.getByRole("button", { name: "Enable browser notifications", exact: true });
  await expect(enable).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { notificationCalls: { prompts: number } }).notificationCalls.prompts)).toBe(0);
  expect(requests).toEqual([]);
  await enable.click();
  await expect(page.getByText("Browser notifications enabled.", { exact: false })).toBeVisible();
  await expect.poll(() => requests.filter(request => request.action === "sync").length).toBeGreaterThan(0);
  const synced = requests.find(request => request.action === "sync")!;
  expect(synced.token).toMatch(/^[a-f0-9]{64}$/);
  expect(synced).not.toHaveProperty("userId");
  expect(synced).not.toHaveProperty("coordinates");
  await page.getByRole("button", { name: "Turn off browser notifications" }).click();
  await expect(enable).toBeEnabled();
  expect(requests.at(-1)?.action).toBe("disable");
  expect(await page.evaluate(() => (window as unknown as { notificationCalls: { unsubscribes: number } }).notificationCalls.unsubscribes)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("archride.browser-push.v1"))).toBeNull();
});

test("denied permission leaves in-app settings usable and uploads nothing", async ({ page }) => {
  const requests = await browserNotifications(page, true);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Enable browser notifications", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Notifications are blocked" })).toBeVisible();
  await expect(page.getByLabel("Remind me when a watched bus is close")).toBeEnabled();
  expect(requests).toEqual([]);
});

test("the synced reminder uses the selected walking trip and is removed when the trip ends", async ({ page }) => {
  const requests = await browserNotifications(page);
  const now = Date.now(), deadline = new Date(now + 13 * 60000).toISOString();
  const key = "archride.personal.v1:account:10000000-0000-0000-0000-000000000001";
  await page.addInitScript(([storageKey, value]) => localStorage.setItem(storageKey, value), [key, JSON.stringify({
    prefs: DEFAULT_TRAVEL, items: [], active: { mode: "walk", step: 0, origin: null, destination: { id: "building", name: "Mémorial Building", type: "building" },
      instanceKey: null, boardingSequence: null, boarding: null, alighting: null, routeName: "", headsign: "", deadline,
      walkToSeconds: 600, expiresAt: new Date(now + 3600000).toISOString() },
  })]);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Enable browser notifications", exact: true }).click();
  await expect.poll(() => requests.filter(request => request.action === "sync").length).toBeGreaterThan(0);
  const state = requests.find(request => request.action === "sync")!.state as { scheduled: { dueAt: number; notification: { body: string } }[] };
  expect(state.scheduled[0].dueAt).toBe(now);
  expect(state.scheduled[0].notification.body).toContain("Mémorial Building");
  expect(JSON.stringify(state)).not.toMatch(/latitude|longitude/);
  // Stay in the same document, as the actual end-trip control does through PersonalProvider.
  await page.evaluate(storageKey => {
    const current = JSON.parse(localStorage.getItem(storageKey)!);
    localStorage.setItem(storageKey, JSON.stringify({ ...current, active: null }));
    window.dispatchEvent(new Event("focus"));
  }, key);
  await expect.poll(() => (requests.filter(request => request.action === "sync").at(-1)?.state as { scheduled: unknown[] })?.scheduled.length).toBe(0);
});

test("clear device data revokes server reminders before discarding the capability", async ({ page }) => {
  const requests = await browserNotifications(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Enable browser notifications", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn off browser notifications" })).toBeEnabled();
  await page.getByRole("button", { name: "Clear device data", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear device data" }).click();
  await expect(page.getByText("Your ArchRide data was cleared from this browser.")).toBeVisible();
  expect(requests.at(-1)?.action).toBe("disable");
  expect(await page.evaluate(() => localStorage.getItem("archride.browser-push.v1"))).toBeNull();
});

test("push setup failure explains retry and does not claim notifications are enabled", async ({ page }) => {
  await browserNotifications(page);
  await page.route("**/functions/v1/push-reminders", route => route.fulfill({ status: 503, json: { error: "push_not_configured" }, headers: { "access-control-allow-origin": "*" } }));
  await page.goto("/profile");
  await page.getByRole("button", { name: "Enable browser notifications", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t save browser reminders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable browser notifications", exact: true })).toBeEnabled();
});

test("notification settings fit narrow phones and desktop", async ({ page }, info) => {
  await browserNotifications(page);
  const mobile = info.project.name === "mobile";
  await page.setViewportSize({ width: mobile ? 320 : 1440, height: mobile ? 900 : 1000 });
  await page.goto("/profile");
  await page.getByRole("button", { name: "Enable browser notifications", exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const toggle of await page.getByRole("region", { name: "Leave-now reminders" }).locator(".MuiFormControlLabel-root").all()) expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `.impeccable/review/${mobile ? "mobile" : "desktop"}.png`, fullPage: true });
  await page.getByText("About reminders", { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("iPhone browser tabs explain Home Screen installation before requesting permission", async ({ page }) => {
  await browserNotifications(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "userAgent", { get: () => "iPhone Safari" }));
  await page.goto("/profile");
  await expect(page.getByText(/tap Share → Add to Home Screen/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable browser notifications", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { notificationCalls: { prompts: number } }).notificationCalls.prompts)).toBe(0);
});
