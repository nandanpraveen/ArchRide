import { test, expect } from "@playwright/test";
import { noHorizontalOverflow, snapshot } from "./fixtures";

// This case uses the actual public Supabase catalog and walking Edge Function.
// Tile images alone are blocked to keep incidental tile load out of the smoke.
test("real public catalog supports a complete guest walking journey on the static export", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [], requestFailures: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.url().includes("supabase.co") && response.status() >= 400) requestFailures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.goto("/archride/");
  await page.getByRole("combobox", { name: "From", exact: true }).fill("Miller Learning");
  await page.getByRole("option", { name: /Miller/i }).first().click();
  const fromName = await page.getByRole("combobox", { name: "From", exact: true }).inputValue();
  await page.getByRole("combobox", { name: "To", exact: true }).fill("Tate");
  await page.getByRole("option", { name: /\bTate\b/i }).first().click();
  const toName = await page.getByRole("combobox", { name: "To", exact: true }).inputValue();
  await page.getByRole("button", { name: "Find a trip", exact: true }).click();
  const walk = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Walk directly", exact: true }) });
  await expect(walk).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Pedestrian routing:", { exact: false })).toContainText("FOSSGIS");
  await snapshot(page, info, "real-walking-options-375");
  await walk.getByRole("button", { name: "Start walking", exact: true }).click();
  const active = page.getByRole("region", { name: "Active trip" });
  await expect(active).toContainText(toName);
  await page.goto("/archride/");
  await page.getByRole("link", { name: "Resume trip", exact: true }).click();
  await expect(active).toContainText(toName);
  await active.getByRole("button", { name: "End trip", exact: true }).click();
  try { await expect(active).toHaveCount(0); }
  catch (error) {
    await info.attach("end-trip-state", { body: JSON.stringify(await page.evaluate(() => ({ personal: localStorage.getItem("archride.personal.v1"), activeTrip: document.querySelector('[aria-label="Active trip"]')?.textContent })), null, 2), contentType: "application/json" });
    throw error;
  }
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
  await info.attach("real-public-observation", { body: JSON.stringify({ observedAt: new Date().toISOString(), from: fromName, to: toName, requestFailures, pageErrors: errors }, null, 2), contentType: "application/json" });
});
