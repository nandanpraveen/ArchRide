import { expect, test, type Page } from "./fixtures";
import { mockTransit } from "./transit-fixtures";

test.beforeEach(async ({ page }) => {
  await mockTransit(page);
});

const KEY = "archride:saved:v1:account:10000000-0000-0000-0000-000000000001";
const stops = [
  { id: "s1", name: "Tate Center", savedAt: "2026-10-20T12:00:00.000Z" },
  { id: "s2", name: "Library", savedAt: "2026-10-20T12:01:00.000Z" },
];
const good = JSON.stringify({ version: 1, stops });

async function seed(page: Page, raw: string, path = "/saved") {
  await page.goto("/saved");
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: KEY, value: raw },
  );
  await page.goto(path);
}

test.describe("Saved page", () => {
  test("a map stop can be saved, opened from Home, and unsaved", async ({ page }) => {
    await page.goto("/map?stop=uga-passio%3Aeast");
    const details = page.getByRole("region", { name: "Stop details" });
    await details.getByRole("button", { name: "Save stop", exact: true }).click();
    await expect(details.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/");
    const favorites = page.getByRole("region", { name: "Your usual places", exact: true });
    await favorites.getByRole("link", { name: /Memorial Hall/ }).click();
    await expect(page.getByRole("region", { name: "Stop details" }).getByRole("button", { name: "Saved", exact: true })).toBeVisible();
    await page.goto("/saved");
    await expect(page.getByRole("button", { name: "Remove Memorial Hall" })).toBeVisible();
    await page.goto("/map?stop=uga-passio%3Aeast");
    await details.getByRole("button", { name: "Saved", exact: true }).click();
    await expect(details.getByRole("button", { name: "Save stop", exact: true })).toHaveAttribute("aria-pressed", "false");
    await page.goto("/saved");
    await expect(page.getByRole("button", { name: "Remove Memorial Hall" })).toHaveCount(0);
  });

  test("empty state when nothing is saved", async ({ page }) => {
    await page.goto("/saved");
    await expect(
      page.getByRole("heading", { name: "Save the places you use most" }),
    ).toBeVisible();
    await expect(page.getByText("Your journeys and stops stay on this device.", { exact: false })).toBeVisible();
  });

  test("corrupted storage does not crash the page", async ({ page }) => {
    await seed(page, "{not valid json");
    await expect(
      page.getByRole("heading", { name: "Save the places you use most" }),
    ).toBeVisible();
  });

  test("saved stops survive a refresh", async ({ page }) => {
    await seed(page, good);
    await page.reload();
    await expect(page.getByRole("article", { name: "Tate Center", exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: "Library", exact: true })).toBeVisible();
  });

  test("rename rejects a blank name, then accepts a real one", async ({
    page,
  }) => {
    await seed(page, good);
    await page.getByRole("button", { name: "Rename Tate Center" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename saved item" });
    await dialog.getByLabel("Name", { exact: true }).fill("   ");
    await expect(dialog.getByRole("button", { name: "Save name" })).toBeDisabled();
    await dialog.getByLabel("Name", { exact: true }).fill("Tate Plaza");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Tate Plaza")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Tate Plaza")).toBeVisible();
  });

  test("remove can be undone", async ({ page }) => {
    await seed(page, good);
    await page.getByRole("button", { name: "Remove Library" }).click();
    await expect(page.getByText("Library removed")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove Library" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(
      page.getByRole("button", { name: "Remove Library" }),
    ).toBeVisible();
  });

  test("reorder with buttons", async ({ page }) => {
    await seed(page, good);
    await page.getByRole("button", { name: "Move Library up" }).click();
    await expect(
      page.getByRole("main").getByRole("article").first(),
    ).toContainText("Library");
  });
});

test.describe("Home favorites", () => {
  test("shows saved stops and links to them", async ({ page }) => {
    await seed(page, good, "/");
    await expect(
      page.getByRole("link", { name: /Tate Center/ }),
    ).toBeVisible();
  });

  test("offers saved places without an empty promotional card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Your usual places" }).getByRole("link", { name: "Manage saved items" })).toBeVisible();
  });
});
