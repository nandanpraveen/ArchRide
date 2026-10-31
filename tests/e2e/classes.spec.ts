import { test, expect, type Page } from "@playwright/test";
import { mockTransit } from "./transit-fixtures";

async function addClass(page: Page, title: string, day: string) {
  await page.getByLabel("Class name").fill(title);
  await page.getByRole("combobox", { name: "Building" }).fill("Memorial");
  await page.getByRole("option", { name: /Mémorial Building/ }).click();
  await page.getByRole("combobox", { name: "Weekdays" }).click();
  await page.getByRole("option", { name: day, exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add class" }).click();
}

test.beforeEach(async ({ page }) => {
  await mockTransit(page);
});

test("a guest adds a class on this device and Home shows it with a Plan action", async ({ page }) => {
  await page.goto("/classes");
  await expect(page.getByText(/guest schedule/)).toBeVisible();
  await expect(page.getByText("No classes yet. Add your first class above.")).toBeVisible();
  await addClass(page, "Calculus", "Thursday");
  const grid = page.getByRole("grid", { name: "Weekly class schedule" });
  await expect(grid).toContainText("Calculus");
  await expect(grid).toContainText("Mémorial Building");
  await expect(grid).toContainText("Thursday");

  await page.goto("/");
  const card = page.getByRole("region", { name: "Next class" });
  await expect(card).toContainText("Calculus");
  await expect(card).toContainText("Mémorial Building");
  await expect(card.getByRole("link", { name: "Plan trip to class" })).toHaveAttribute("href", "/plan?to=building&toType=building");
  await expect(card).toContainText("Guest schedules stay on this device");
});

test("the editor reports missing details instead of saving", async ({ page }) => {
  await page.goto("/classes");
  await page.getByRole("button", { name: "Add class" }).click();
  await expect(page.getByText("Enter a class name.")).toBeVisible();
  await expect(page.getByText("Choose a campus building.")).toBeVisible();
  await expect(page.getByText("Choose at least one weekday.")).toBeVisible();
  await expect(page.getByText("No classes yet. Add your first class above.")).toBeVisible();
});

test("deleting a class asks for confirmation and can be undone", async ({ page }) => {
  await page.goto("/classes");
  await addClass(page, "Biology", "Monday");
  const grid = page.getByRole("grid", { name: "Weekly class schedule" });
  await expect(grid).toContainText("Biology");
  await page.getByRole("menuitem", { name: "Delete Biology" }).or(page.getByRole("button", { name: "Delete Biology" })).click();
  await expect(page.getByRole("dialog", { name: "Delete this class?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No classes yet. Add your first class above.")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("grid", { name: "Weekly class schedule" })).toContainText("Biology");
});

test("Home invites a guest with no classes to add them", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("region", { name: "Next class" });
  await expect(card).toContainText("Add your weekly classes");
  await card.getByRole("link", { name: "Add your classes" }).click();
  await expect(page).toHaveURL(/\/classes$/);
});
