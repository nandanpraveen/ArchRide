import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { mockTransit, transitFixtures } from "./transit-fixtures";

// Auth uses the local protocol server; private REST calls are stateful browser
// fixtures. The matching real migrations/RLS are tested separately in PostgreSQL.
async function accountStore(page: Page, initial = true) {
  const now = new Date().toISOString();
  let rows: Record<string, unknown>[] = initial ? [{
    id: randomUUID(), user_id: randomUUID(), type: "leave_now",
    title: "Account reminder", body: "Campus Loop at Memorial Hall",
    link: "/map?stop=uga-passio%3Aeast", dedupe_key: "leave:previous-arrival",
    created_at: now, expires_at: new Date(Date.now() + 3_600_000).toISOString(), read_at: null,
  }] : [];
  let preferences = {
    leave_now_enabled: true, class_reminders_enabled: true,
    alerts_enabled: true, trip_updates_enabled: true, bus_lead_minutes: 5,
  };
  const writes: { table: string; method: string; body: Record<string, unknown> | null; query: string }[] = [];
  await mockTransit(page, transitFixtures(), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split("/").at(-1)!;
    if (!["notifications", "notification_preferences"].includes(table)) return false;
    const headers = {
      "access-control-allow-origin": "*", "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    };
    const method = request.method();
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return true;
    }
    expect(request.headers().authorization).toMatch(/^Bearer eyJ/);
    const body = request.postDataJSON() as Record<string, unknown> | null;
    if (method !== "GET") writes.push({ table, method, body, query: url.search });
    if (table === "notification_preferences") {
      if (method === "POST") preferences = { ...preferences, ...body };
      await route.fulfill({ headers, json: request.headers().accept?.includes("application/vnd.pgrst.object") ? preferences : [preferences] });
      return true;
    }
    if (method === "POST") rows.unshift({ ...body, id: randomUUID(), user_id: randomUUID(), created_at: new Date().toISOString(), read_at: null });
    if (method === "PATCH") rows = rows.map((row) =>
      (!url.searchParams.has("id") || url.searchParams.get("id") === `eq.${row.id}`) && row.read_at === null ? { ...row, ...body } : row);
    if (method === "DELETE") rows = rows.filter((row) => url.searchParams.get("id") !== `eq.${row.id}`);
    await route.fulfill({ headers, json: request.headers().accept?.includes("application/vnd.pgrst.object") ? rows[0] ?? null : rows });
    return true;
  });
  return { writes };
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel(/^Email\s*\*?$/).fill(`success+${randomUUID()}@example.test`);
  await page.getByLabel(/^Password\s*\*?$/).fill("Fixture-password-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}

test("signed-in notifications load from the account and stay read and cleared after reload", async ({ page }) => {
  const store = await accountStore(page);
  await signIn(page);
  await page.goto("/notifications");
  await expect(page.getByRole("region", { name: "Notification list" })).toContainText("Account reminder");
  await expect(page.getByText(/kept on this device only/)).toHaveCount(0);
  await page.getByRole("button", { name: "Mark read: Account reminder", exact: true }).click();
  await expect(page.getByText("All read", { exact: true })).toBeVisible();
  expect(store.writes[0].method).toBe("PATCH");
  expect(Object.keys(store.writes[0].body!)).toEqual(["read_at"]);
  expect(store.writes[0].query).toContain("read_at=is.null");
  await page.reload();
  await expect(page.getByText("All read", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear: Account reminder", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No notifications" })).toBeVisible();
  expect(store.writes.at(-1)?.method).toBe("DELETE");
  await page.reload();
  await expect(page.getByRole("heading", { name: "No notifications" })).toBeVisible();
});

test("signed-in reminder settings upsert to the account and survive reload", async ({ page }) => {
  const store = await accountStore(page, false);
  await signIn(page);
  const lead = page.getByRole("combobox", { name: "How early to remind me" });
  await expect(lead).toBeEnabled();
  await lead.click();
  await page.getByRole("option", { name: "10 minutes", exact: true }).click();
  await expect(page.getByText("Saved to your account.")).toBeVisible();
  await expect(page.getByRole("listbox", { includeHidden: true })).toHaveCount(0);
  // Account writes finish over HTTP; the controlled switch updates after save.
  await page.getByLabel("Remind me when a watched bus is close").click();
  await expect(page.getByLabel("Remind me when a watched bus is close")).not.toBeChecked();
  expect(store.writes).toHaveLength(2);
  expect(store.writes[1]).toMatchObject({ table: "notification_preferences", method: "POST", body: { leave_now_enabled: false, bus_lead_minutes: 10 } });
  expect(store.writes[1].query).toContain("on_conflict=user_id");
  expect(store.writes[1].body).not.toHaveProperty("user_id");
  await page.reload();
  await expect(lead).toHaveText("10 minutes");
  await expect(page.getByLabel("Remind me when a watched bus is close")).not.toBeChecked();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("link", { name: "Continue as guest", exact: true }).click();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByLabel("Remind me when a watched bus is close")).toBeChecked();
  await expect(lead).toHaveText("5 minutes");
  expect(store.writes).toHaveLength(2);
});

test("a signed-in watched bus saves one account reminder without a client-supplied owner", async ({ page }) => {
  const store = await accountStore(page, false);
  await signIn(page);
  await page.evaluate(() => localStorage.setItem("archride.watched-buses.v1", JSON.stringify([{
    arrivalId: "arrival1", tripId: "uga-passio:trip", stopId: "uga-passio:east",
    routeName: "Campus Loop", stopName: "Memorial Hall", addedAt: Date.now(),
  }])));
  await page.goto("/notifications");
  await expect(page.getByRole("region", { name: "Notification list" })).toContainText("Campus Loop at Memorial Hall");
  const inserts = () => store.writes.filter((write) => write.table === "notifications" && write.method === "POST");
  expect(inserts()).toHaveLength(1);
  expect(inserts()[0].body).toMatchObject({ type: "leave_now", dedupe_key: "leave:arrival1" });
  expect(inserts()[0].body).not.toHaveProperty("user_id");
  expect(inserts()[0].body).not.toHaveProperty("read_at");
  await page.reload();
  await expect(page.getByRole("region", { name: "Notification list" })).toContainText("Campus Loop at Memorial Hall");
  expect(inserts()).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem("archride.notifications.v1"))).toBeNull();
});
