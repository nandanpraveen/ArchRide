import { defineConfig, devices } from "@playwright/test";

// A supplied URL runs the same checks against an already-published static site.
const external = process.env.ARCHRIDE_EXPORT_BASE_URL;
export default defineConfig({
  testDir: "./tests/export",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/export-results.json" }]],
  outputDir: "test-results/export",
  use: { baseURL: external ?? "http://127.0.0.1:3300", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "export-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "export-webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: external ? undefined : {
    command: "python3 scripts/serve-export.py",
    url: "http://127.0.0.1:3300/archride/",
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
