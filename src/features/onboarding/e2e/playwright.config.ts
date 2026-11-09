import { defineConfig, devices } from "@playwright/test";

// C's own browser check, kept beside the feature because tests/** belongs to F.
// Run from the repo root: npx playwright test -c src/features/onboarding/e2e/playwright.config.ts
const port = Number(process.env.E2E_PORT ?? 3102);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  outputDir: "../../../../test-results/onboarding",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 780 }, hasTouch: true } },
  ],
  webServer: {
    command: `rm -rf .data/e2e-c && npx next dev -H 127.0.0.1 -p ${port}`,
    cwd: "../../../..",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { AA_DIST_DIR: ".next-e2e", AA_DATA_DIR: ".data/e2e-c" },
  },
});
