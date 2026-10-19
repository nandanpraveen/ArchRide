import { test, expect } from "@playwright/test";

const unavailableText =
  "Campus location data is not connected yet, so search is unavailable.";

test.describe("Home search", () => {
  test("shows an honest unavailable message and ignores extra spaces", async ({
    page,
  }) => {
    await page.goto("/");
    const search = page.getByRole("combobox", {
      name: "Search buildings and stops",
    });
    await expect(async () => {
      await search.fill("");
      await search.fill("  Miller    Library  ");
      await expect(page.getByText(unavailableText)).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15000 });
  });

  test("works with the keyboard only", async ({ page }) => {
    await page.goto("/");
    const search = page.getByRole("combobox", {
      name: "Search buildings and stops",
    });
    await expect(async () => {
      await search.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("lib");
      await expect(page.getByText(unavailableText)).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15000 });
  });
});

test.describe("Home without data", () => {
  test("shows unavailable states and no invented arrivals", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Where are you headed?" }),
    ).toBeVisible();
    await expect(
      page.getByText("No stop or departure data is available yet", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByText("Source: not connected")).toBeVisible();
    await expect(page.getByText("You're browsing as a guest", { exact: false }))
      .toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("all five destinations open, and Back and Forward work", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    for (const name of ["Map", "Plan", "Saved", "Profile"]) {
      await nav.getByRole("link", { name }).click();
      await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
    }
    await page.goBack();
    await expect(page).toHaveURL(/\/saved$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("direct links load each page", async ({ page }) => {
    for (const path of ["/", "/map", "/plan", "/saved", "/profile"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    }
  });
});

test.describe("Small screens", () => {
  test("Home has no sideways scrolling at 320 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/");
    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(fits).toBe(true);
  });
});

test.describe("Location outside campus", () => {
  test.use({
    permissions: ["geolocation"],
    geolocation: { latitude: 40.7128, longitude: -74.006 },
  });

  test("explains it and keeps the manual choice available", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(
      page.getByText("outside the UGA campus area", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Choose a building or stop" }),
    ).toBeVisible();
  });
});

test.describe("Location on campus", () => {
  test.use({
    permissions: ["geolocation"],
    geolocation: { latitude: 33.948, longitude: -83.377 },
  });

  test("accepts a location on campus", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText("Got your location")).toBeVisible();
  });
});

test.describe("Location denied", () => {
  test.use({ permissions: [] });

  test("shows the denied message and keeps manual choice", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(
      page.getByText("Location is blocked for this site", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Choose a building or stop" }),
    ).toBeVisible();
  });
});