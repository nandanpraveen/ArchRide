import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/functions/v1/public-read?**", (route) => route.fulfill({ json: [] }));
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
});
test("a guest can visit all destinations without invented arrivals", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Where are you headed?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Find a trip", exact: true })).toBeEnabled();
  const navigation = page
    .getByRole("navigation", { name: "Primary navigation" })
    .filter({ visible: true });
  for (const [label, heading] of [
    ["Map", "Campus map"],
    ["Plan", "Plan your trip"],
    ["Saved", "Saved"],
    ["Profile", "Profile"],
    ["Home", "Where are you headed?"],
  ]) {
    await navigation.getByRole("link", { name: label, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
    await expect(
      navigation.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
});
test("keyboard users can skip directly to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});
