import { test, expect } from "@playwright/test";
import { mockTransit } from "./transit-fixtures";
test("deadline form keeps campus timezone and explains unsupported future trips", async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await mockTransit(page);
  await page.goto("/plan");
  await expect(
    page.getByRole("heading", { name: "Plan a trip", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Find trips arriving by this time" })
    .click();
  await expect(
    page.getByText("Enter a future campus time", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Campus arrival deadline").fill("2027-02-01T10:00");
  await page.getByLabel("Arrival buffer (minutes)").fill("5");
  await page
    .getByRole("button", { name: "Find trips arriving by this time" })
    .click();
  await expect(
    page.getByText("Insufficient data: no complete supported journey", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("America/New_York campus time", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/archride-week2-plan-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("stop details lose countdown after source expiry without a network refresh", async ({
  page,
}) => {
  await mockTransit(page);
  await page.goto("/map?stop=uga-passio%3Aeast");
  await expect(page.getByText(/· 5 min · Estimate/)).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(181000);
  await expect(page.getByText(/· \d+ min · Estimate/)).toHaveCount(0);
  await expect(
    page.getByText("No current source arrivals are available.", {
      exact: false,
    }),
  ).toBeVisible();
});

test("repeated campus hour requires a choice and invalid buffer retains input and focus", async ({
  page,
}) => {
  // Keep the repeated hour in the future regardless of the day CI runs.
  await page.clock.setFixedTime(new Date("2026-10-31T12:00:00Z"));
  await mockTransit(page);
  await page.goto("/plan");
  await page.getByLabel("Campus arrival deadline").fill("2026-11-01T01:30");
  await expect(page.getByText("This campus hour occurs twice")).toBeVisible();
  await page.getByLabel("Second occurrence (EST)").check();
  await page.getByLabel("Arrival buffer (minutes)").fill("-1");
  await page
    .getByRole("button", { name: "Find trips arriving by this time" })
    .click();
  await expect(page.getByLabel("Arrival buffer (minutes)")).toBeFocused();
  await expect(
    page.getByText("Enter a nonnegative buffer in minutes."),
  ).toBeVisible();
  await expect(page.getByLabel("Campus arrival deadline")).toHaveValue(
    "2026-11-01T01:30",
  );
  await page.getByLabel("Arrival buffer (minutes)").fill("0");
  await page
    .getByRole("button", { name: "Find trips arriving by this time" })
    .click();
  await expect(
    page.getByText("Insufficient data: no complete supported journey", {
      exact: false,
    }),
  ).toBeVisible();
});
