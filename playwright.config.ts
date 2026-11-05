import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm build && python3 scripts/serve-export.py --port 3100 --base-path /",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_BASE_PATH: "",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_archride_test",
    },
    timeout: 120000,
  },
});
