import { test, expect } from "@playwright/test";
import { mockTransit } from "./transit-fixtures";

test("sample comparisons preserve verified places and campus deadline controls", async ({ page }) => {
  await mockTransit(page);
  await page.goto("/plan?to=building&toType=building");
  await expect(page.getByRole("heading", { name: "Destination: Mémorial Building" })).toBeVisible();
  await expect(page.getByText("Sample data only:", { exact: false })).toBeHidden();
  await page.getByLabel("Campus arrival deadline").fill("2027-02-01T10:00");
  await page.getByRole("button", { name: "Preview comparison with sample data" }).click();
  await expect(page.getByText("Sample data only:", { exact: false })).toBeVisible();
  await page.getByRole("combobox", { name: "From", exact: true }).click();
  await page.getByRole("option", { name: "Main Library", exact: true }).click();
  await page.getByRole("combobox", { name: "To", exact: true }).click();
  await page.getByRole("option", { name: "Ramsey Student Center", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Walk: about/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Bus: about/ })).toBeVisible();
  await expect(page.getByLabel("Campus arrival deadline")).toHaveValue("2027-02-01T10:00");
  await expect(page.getByRole("heading", { name: "Destination: Mémorial Building" })).toBeVisible();
});
