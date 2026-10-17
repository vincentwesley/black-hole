import { defineConfig, devices } from "@playwright/test";

// PW_CHROMIUM points at a preinstalled Chromium when Playwright's own download is unavailable.
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

export default defineConfig({
  testDir: "e2e",
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: { baseURL: "http://127.0.0.1:4173", headless: true, launchOptions },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, launchOptions } },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
