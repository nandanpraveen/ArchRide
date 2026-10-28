import { expect, test } from "@playwright/test";
import { mockTransit } from "./transit-fixtures";

test.beforeEach(async ({ page }) => { await mockTransit(page); });

test("a guest can add, edit, disable, and remove a draft class", async ({ page }) => {
  await page.goto("/classes");
  await page.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter a class name" })).toBeVisible();
  await page.getByLabel("Class name").fill("Calculus");
  await page.getByRole("checkbox", { name: "Monday", exact: true }).check();
  await page.getByRole("checkbox", { name: "Wednesday", exact: true }).check();
  await page.getByLabel("Start time").fill("09:30");
  await page.getByRole("button", { name: "Add class", exact: true }).click();
  const schedule = page.getByRole("table", { name: "Class schedule" });
  await expect(schedule).toContainText("Monday, Wednesday");
  await expect(schedule).toContainText("09:30");
  await expect(page.getByRole("status")).toContainText("Next class: Calculus");
  await page.getByRole("button", { name: "Edit Calculus", exact: true }).click();
  await page.getByLabel("Class name").fill("Linear Algebra");
  await page.getByLabel("Start time").fill("14:15");
  await page.getByRole("button", { name: "Save class", exact: true }).click();
  await expect(schedule).toContainText("Linear Algebra");
  await expect(schedule).toContainText("14:15");
  await page.getByRole("button", { name: "Disable Linear Algebra", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No upcoming classes");
  await page.getByRole("button", { name: "Enable Linear Algebra", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Next class: Linear Algebra");
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Remove Linear Algebra", exact: true }).click();
  await expect(schedule).toHaveCount(0);
});

test("the draft schedule explains that it resets on reload", async ({ page }) => {
  await page.goto("/classes");
  await expect(page.getByRole("alert")).toContainText("lasts until you reload or leave this page");
  await page.getByLabel("Class name").fill("Chemistry");
  await page.getByRole("checkbox", { name: "Friday", exact: true }).check();
  await page.getByLabel("Start time").fill("12:00");
  await page.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(page.getByRole("table", { name: "Class schedule" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("table", { name: "Class schedule" })).toHaveCount(0);
});
