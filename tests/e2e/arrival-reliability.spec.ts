import { test, expect, type Page } from "@playwright/test";
import { mockTransit } from "./transit-fixtures";

async function places(page: Page) {
  await page.getByRole("combobox", { name: "From", exact: true }).fill("Student Center");
  await page.getByRole("option").click();
  await page.getByRole("combobox", { name: "To", exact: true }).fill("Science");
  await page.getByRole("option").click();
  await page.getByRole("button", { name: "Arrive by", exact: true }).click();
}

test("deadline form keeps campus timezone, values, and focus on invalid input", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-31T12:00:00Z"));
  await mockTransit(page);
  await page.goto("/plan");
  await places(page);
  const deadline = page.getByLabel("Arrive by (campus time)", { exact: true });
  await deadline.fill("2026-10-30T10:00");
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  await expect(page.getByText("Choose a valid future deadline in Athens campus time.")).toBeVisible();
  await expect(deadline).toBeFocused();
  await expect(deadline).toHaveValue("2026-10-30T10:00");
  await deadline.fill("2027-02-01T10:00");
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  await expect(page).toHaveURL(/deadline=2027-02-01T15%3A00%3A00\.000Z/);
});

test("stop details lose a countdown after source expiry without network refresh", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/map?stop=uga-passio%3Aeast");
  const details = page.getByRole("region", { name: "Stop details" });
  await expect(details.getByText(/min\s+Estimate/)).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(181000);
  await expect(details.getByText(/min\s+Estimate/)).toHaveCount(0);
  await expect(details).toContainText("No current arrival estimates are available.");
});

test("the repeated campus hour requires an explicit EDT or EST choice", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-31T12:00:00Z"));
  await mockTransit(page);
  await page.goto("/plan");
  await places(page);
  const deadline = page.getByLabel("Arrive by (campus time)", { exact: true });
  await deadline.fill("2026-11-01T01:30");
  await expect(page.getByRole("radiogroup", { name: "Repeated campus time" })).toBeVisible();
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  await expect(page.getByText("Choose the first or second occurrence of this campus time.")).toBeVisible();
  await expect(deadline).toHaveValue("2026-11-01T01:30");
  await page.getByLabel("Second occurrence (EST)").check();
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  await expect(page).toHaveURL(/deadline=2026-11-01T06%3A30%3A00\.000Z/);
});
