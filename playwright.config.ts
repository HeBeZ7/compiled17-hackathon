import { defineConfig, devices } from "@playwright/test";

// Own port, build dir and data dir, so it can run while the worker's dev server is up.
const port = Number(process.env.E2E_PORT ?? 3105);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 780 } } },
  ],
  webServer: {
    command: `rm -rf .data/e2e && npx next dev -H 127.0.0.1 -p ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { AA_DIST_DIR: ".next-e2e", AA_DATA_DIR: ".data/e2e", NEXT_PUBLIC_AA_TEST_MODE: "1" },
  },
});
