import { test, expect, type Page } from "@playwright/test";
import { mockTransit } from "./transit-fixtures";

async function addClass(page: Page, title: string, day: string) {
  await page.getByRole("button", { name: "Add a class", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a class" });
  await dialog.getByLabel("Class name").fill(title);
  await dialog.getByRole("combobox", { name: "Class building" }).fill("Memorial");
  await page.getByRole("option", { name: /Mémorial Building/ }).click();
  await dialog.getByRole("button", { name: day, exact: true }).click();
  await dialog.getByRole("button", { name: "Save class" }).click();
  await expect(dialog).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await mockTransit(page);
});

test("a guest adds a class on this device and Home shows it with a Plan action", async ({ page }) => {
  await page.goto("/classes");
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add your weekly classes", exact: true })).toBeVisible();
  await addClass(page, "Calculus", "Thursday");
  const grid = page.getByRole("region", { name: "Weekly class schedule" });
  await expect(grid).toContainText("Calculus");
  await expect(grid).toContainText("Mémorial Building");
  await expect(grid).toContainText("Thursday");

  await page.goto("/");
  const card = page.getByRole("region", { name: "Next class" });
  await expect(card).toContainText("Calculus");
  await expect(card).toContainText("Mémorial Building");
  await expect(card.getByRole("link", { name: "Plan trip to class" })).toHaveAttribute("href", /\/plan\/?\?to=building&toType=building&deadline=/);
  await expect(card.getByRole("link", { name: "Edit class schedule" })).toBeVisible();
});

test("the editor reports missing details instead of saving", async ({ page }) => {
  await page.goto("/classes");
  // This text only renders once the page has loaded on the client, so clicks below are not lost.
  await expect(page.getByRole("heading", { name: "Add your weekly classes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add a class", exact: true }).click();
  await page.getByRole("dialog", { name: "Add a class" }).getByRole("button", { name: "Save class" }).click();
  await expect(page.getByText("Enter a class name.")).toBeVisible();
  await expect(page.getByText("Choose a campus building.")).toBeVisible();
  await expect(page.getByText("Choose at least one weekday.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Add a class" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("archride.classes.v1") ?? "[]").length)).toBe(0);
});

test("deleting a class asks for confirmation and can be undone", async ({ page }) => {
  await page.goto("/classes");
  await expect(page.getByRole("heading", { name: "Add your weekly classes", exact: true })).toBeVisible();
  await addClass(page, "Biology", "Monday");
  const grid = page.getByRole("region", { name: "Weekly class schedule" });
  await expect(grid).toContainText("Biology");
  await page.getByRole("button", { name: "Delete Biology", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Delete Biology?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete class", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add your weekly classes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Weekly class schedule" })).toContainText("Biology");
});

test("Home invites a guest with no classes to add them", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("region", { name: "Next class" });
  await expect(card.getByRole("link", { name: "Add your classes" })).toBeVisible();
  await card.getByRole("link", { name: "Add your classes" }).click();
  await expect(page).toHaveURL(/\/classes\/?$/, { timeout: 15_000 });
});

// A guest class whose building is not in the mocked campus data ("building" is the only one there).
// It meets every day, so Home always has a next class to show.
const retiredClass = {
  id: "retired-1",
  title: "Chemistry",
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  startsAt: "09:30",
  enabled: true,
  buildingId: "retired-building",
  buildingName: "Old Science Hall",
  minutesEarly: 10,
  reminderEnabled: false,
};

// Seeds the guest schedule once, so later page loads keep whatever the test saved.
async function seedGuestClasses(page: Page, classes: object[]) {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    ["archride.classes.v1", JSON.stringify(classes)],
  );
}

test("a class in a retired building is flagged and can be moved to a current one", async ({ page }) => {
  await seedGuestClasses(page, [retiredClass]);
  await page.goto("/classes");
  const grid = page.getByRole("region", { name: "Weekly class schedule" });
  await expect(grid).toContainText("Old Science Hall");
  await expect(grid).toContainText("no longer in the campus catalog");
  await expect(page.getByText(/no longer in the campus catalog/)).toBeVisible();

  await page.getByRole("button", { name: "Edit Chemistry", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit class" });
  await dialog.getByRole("combobox", { name: "Class building" }).fill("Memorial");
  await page.getByRole("option", { name: /Mémorial Building/ }).click();
  await dialog.getByRole("button", { name: "Save class" }).click();

  await expect(dialog).toBeHidden();
  await expect(grid).toContainText("Mémorial Building");
  await expect(grid).not.toContainText("no longer in the campus catalog");
  await expect(page.getByText(/no longer in the campus catalog/)).toBeHidden();

  await page.goto("/");
  const card = page.getByRole("region", { name: "Next class" });
  await expect(card).toContainText("Chemistry");
  await expect(card).toContainText("Mémorial Building");
  await expect(card.getByRole("link", { name: "Plan trip to class" })).toBeVisible();
});

test("Home does not offer a trip to a retired building", async ({ page }) => {
  await seedGuestClasses(page, [retiredClass]);
  await page.goto("/");
  const card = page.getByRole("region", { name: "Next class" });
  await expect(card).toContainText("Chemistry");
  await expect(card).toContainText("This building is unavailable");
  await expect(card.getByRole("link", { name: "Plan trip to class" })).toHaveCount(0);
  await card.getByRole("link", { name: "Edit class schedule" }).click();
  await expect(page).toHaveURL(/\/classes\/?$/, { timeout: 15_000 });
});

test("when campus buildings cannot be checked, no class is marked unavailable", async ({ page }) => {
  // Later routes win, so this replaces the beforeEach mock and fails only the building lookup.
  await mockTransit(page, undefined, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS" || !new URL(request.url()).pathname.endsWith("/transit_buildings")) return false;
    await route.fulfill({ status: 500, json: { message: "down" }, headers: { "access-control-allow-origin": "*" } });
    return true;
  });
  await seedGuestClasses(page, [retiredClass]);
  const lookup = page.waitForResponse((response) => decodeURIComponent(response.url()).includes("/transit_buildings") && response.status() === 500);
  await page.goto("/classes");
  const grid = page.getByRole("region", { name: "Weekly class schedule" });
  await expect(grid).toContainText("Old Science Hall");
  await lookup;
  await expect(grid).not.toContainText("no longer in the campus catalog");
  await expect(page.getByText(/no longer in the campus catalog/)).toBeHidden();
});
