import { expect, test, type Page } from "@playwright/test";

const KEY = "archride:saved:v1";
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
  test("empty state when nothing is saved", async ({ page }) => {
    await page.goto("/saved");
    await expect(
      page.getByRole("heading", { name: "Keep your usual trips close" }),
    ).toBeVisible();
    await expect(page.getByText("stay on this device only")).toBeVisible();
  });

  test("corrupted storage does not crash the page", async ({ page }) => {
    await seed(page, "{not valid json");
    await expect(
      page.getByRole("heading", { name: "Keep your usual trips close" }),
    ).toBeVisible();
  });

  test("saved stops survive a refresh", async ({ page }) => {
    await seed(page, good);
    await page.reload();
    await expect(page.getByText("Tate Center")).toBeVisible();
    await expect(page.getByText("Library")).toBeVisible();
  });

  test("rename rejects a blank name, then accepts a real one", async ({
    page,
  }) => {
    await seed(page, good);
    await page.getByRole("button", { name: "Rename Tate Center" }).click();
    await page.getByLabel("Stop name").fill("   ");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Enter a name.")).toBeVisible();
    await page.getByLabel("Stop name").fill("Tate Plaza");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Tate Plaza")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Tate Plaza")).toBeVisible();
  });

  test("remove can be undone", async ({ page }) => {
    await seed(page, good);
    await page.getByRole("button", { name: "Remove Library" }).click();
    await expect(page.getByText("Removed Library")).toBeVisible();
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
      page.getByRole("main").getByRole("listitem").first(),
    ).toContainText("Library");
  });
});

test.describe("Home favorites", () => {
  test("shows saved stops and links to them", async ({ page }) => {
    await seed(page, good, "/");
    await expect(
      page.getByRole("link", { name: "Tate Center" }),
    ).toBeVisible();
  });

  test("explains when nothing is saved", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Stops you save will appear here")).toBeVisible();
  });
});