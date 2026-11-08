import { test, expect } from "@playwright/test";
import { syntheticExportData, noHorizontalOverflow } from "./fixtures";

test("notification assets and service-worker scope respect the GitHub Pages base path", async ({ page, request }) => {
  const manifest = await request.get("/archride/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const data = await manifest.json();
  expect(data.start_url).toBe("/archride/");
  expect(data.scope).toBe("/archride/");
  for (const icon of data.icons) {
    expect(icon.src).toMatch(/^\/archride\/icons\//);
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
  expect((await request.get("/archride/notifications-sw.js")).headers()["content-type"]).toMatch(/javascript/);
  await syntheticExportData(page);
  await page.goto("/archride/profile/");
  await expect(page.getByRole("heading", { name: "Browser notifications" })).toBeVisible();
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register("/archride/notifications-sw.js", { scope: "/archride/" });
    await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(new URL(scope).pathname).toBe("/archride/");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await noHorizontalOverflow(page);
  await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
  await noHorizontalOverflow(page);
});
