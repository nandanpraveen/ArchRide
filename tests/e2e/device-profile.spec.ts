import { test, expect } from "./fixtures";
import { DEFAULT_TRAVEL } from "../../src/lib/personal";
import { mockTransit } from "./transit-fixtures";

test.beforeEach(async ({ page }) => { await mockTransit(page); });

test("signed-in student features verify Auth without requesting account setup again", async ({ page }) => {
  const authRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/auth/v1/")) authRequests.push(request.url()); });
  for (const path of ["/", "/map", "/plan", "/saved", "/classes", "/notifications", "/profile"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation", exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^(Sign in|Create account|Create an account)$/i })).toHaveCount(0);
  }
  expect(authRequests.length).toBeGreaterThan(0);
  expect(authRequests.every(url => new URL(url).pathname.endsWith("/user"))).toBe(true);
});

test("travel preferences and appearance persist only in the current browser", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByLabel("Arrival buffer (minutes)")).toBeEnabled();
  await page.getByLabel("Arrival buffer (minutes)").fill("7");
  await page.getByRole("combobox", { name: "Appearance" }).click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await page.getByLabel("Quiet hours start").fill("22:00");
  await page.getByLabel("Quiet hours end").fill("07:00");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Preferences saved on this device.")).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByLabel("Arrival buffer (minutes)")).toHaveValue("7");
  await expect(page.getByLabel("Quiet hours start")).toHaveValue("22:00");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("confirmed clearing removes ArchRide device data and preserves unrelated site storage", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((prefs) => {
    localStorage.setItem("unrelated-site-data", "preserve");
    localStorage.setItem("archride.personal.v1:account:10000000-0000-0000-0000-000000000001", JSON.stringify({ prefs: { ...prefs, buffer: 9 }, active: null, items: [{ id: "saved-test", key: "stop:uga-passio:east", kind: "stop", name: "My boarding stop", origin: null, destination: { id: "uga-passio:east", name: "Memorial Hall", type: "stop" }, position: 0, updatedAt: new Date().toISOString() }] }));
    localStorage.setItem("archride.notification-preferences.v1:account:10000000-0000-0000-0000-000000000001", JSON.stringify({ leaveNowEnabled: false, classRemindersEnabled: true, alertsEnabled: true, tripUpdatesEnabled: true, busLeadMinutes: 10 }));
  }, DEFAULT_TRAVEL);
  await page.goto("/profile");
  await expect(page.getByLabel("Arrival buffer (minutes)")).toHaveValue("9");
  await page.getByRole("button", { name: "Clear device data", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Keep my data" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByLabel("Arrival buffer (minutes)")).toHaveValue("9");
  await page.getByRole("button", { name: "Clear device data", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear device data", exact: true }).click();
  await expect(page.getByText("Your ArchRide data was cleared from this browser.")).toBeVisible();
  await expect(page.getByLabel("Arrival buffer (minutes)")).toHaveValue(String(DEFAULT_TRAVEL.buffer));
  expect(await page.evaluate(() => localStorage.getItem("unrelated-site-data"))).toBe("preserve");
  await page.goto("/saved");
  await expect(page.getByText("My boarding stop", { exact: true })).toHaveCount(0);
});

test("clearing another tab cancels a personal write already waiting for its lock", async ({ page, context }) => {
  await page.goto("/profile");
  await expect(page.getByLabel("Arrival buffer (minutes)")).toBeEnabled();
  await page.getByLabel("Arrival buffer (minutes)").fill("9");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Preferences saved on this device.")).toBeVisible();
  await page.evaluate(() => {
    void navigator.locks.request("archride:personal", () => new Promise<void>(resolve => {
      (window as unknown as { releasePersonal: () => void }).releasePersonal = resolve;
    }));
  });
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releasePersonal?: unknown }).releasePersonal)).toBe("function");
  await page.getByLabel("Arrival buffer (minutes)").fill("11");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  const second = await context.newPage();
  await mockTransit(second);
  await second.goto("/profile");
  await second.getByRole("button", { name: "Clear device data", exact: true }).click();
  await second.getByRole("dialog").getByRole("button", { name: "Clear device data", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("archride.personal.v1:account:10000000-0000-0000-0000-000000000001"))).toBeNull();
  await page.evaluate(() => (window as unknown as { releasePersonal: () => void }).releasePersonal());
  await expect(page.getByRole("button", { name: "Save preferences", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("archride.personal.v1:account:10000000-0000-0000-0000-000000000001"))).toBeNull();
});
