import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { syntheticExportData } from "./fixtures";

test.skip(({ browserName }) => browserName !== "chromium", "Worker instrumentation verifies the Chromium renderer; layout is covered in both engines.");
test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

test("planned route preserves zoom and its line across clock ticks and journey refreshes", async ({ page }) => {
  await syntheticExportData(page);
  // A local image keeps raster loading deterministic; these checks establish map behavior, not geography.
  const tile = await readFile("public/icons/app-192.png");
  await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({ contentType: "image/png", body: tile }));
  await page.addInitScript(() => {
    const calls: { type: string; source: string }[] = [];
    Object.assign(window, { mapWorkerCalls: calls });
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...rest) {
      if (message?.data?.source === "selected-route") calls.push({ type: message.type, source: message.data.source });
      return Reflect.apply(post, this, [message, ...rest]);
    };
  });
  await page.goto("/archride/plan/?from=building&fromType=building&to=destination&toType=building");
  await expect(page.getByRole("heading", { name: "Walk directly", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit route", exact: true })).toBeVisible();
  const calls = () => page.evaluate(() => (window as unknown as { mapWorkerCalls: { type: string }[] }).mapWorkerCalls);
  await expect.poll(async () => (await calls()).filter(call => call.type === "LD").length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForTimeout(800); // Complete MapLibre's camera and raster fades before comparing the viewport.
  const canvas = page.locator("canvas.maplibregl-canvas");
  const lineExtent = async () => page.evaluate(async encoded => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
    const image = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = image.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let top = image.height, bottom = -1;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      // The walking line is #8f2631; the synthetic raster icon uses a different red.
      if (Math.abs(pixels[offset] - 143) < 8 && Math.abs(pixels[offset + 1] - 38) < 8 && Math.abs(pixels[offset + 2] - 49) < 8) {
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    bitmap.close();
    return { top, bottom };
  }, (await canvas.screenshot()).toString("base64"));
  const zoomed = await lineExtent();
  expect(zoomed.bottom).toBeGreaterThan(zoomed.top);
  const before = await calls();
  await page.clock.install();
  await page.clock.fastForward(32000);
  await page.clock.resume();
  await expect(page.getByText("Refreshing your options…", { exact: true })).toHaveCount(0);
  expect(await calls()).toEqual(before); // No source removal/reload while the same geometry remains selected.
  const refreshed = await lineExtent();
  expect(Math.abs(refreshed.top - zoomed.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(refreshed.bottom - zoomed.bottom)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Fit route", exact: true }).click();
  const fitted = await lineExtent();
  expect(fitted.bottom - fitted.top).toBeLessThan(zoomed.bottom - zoomed.top);
});
