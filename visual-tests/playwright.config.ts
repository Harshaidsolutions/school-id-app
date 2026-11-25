import { defineConfig } from "@playwright/test";

// Pixel baselines live in tests/__screenshots__/. Generate them once on a real
// machine (`npm run update`), review, commit; thereafter diffs fail the run.
export default defineConfig({
  testDir: "tests",
  snapshotDir: "tests/__screenshots__",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: { viewport: { width: 1440, height: 900 } },
  // Serve the built admin-web (offline, no backend needed for the shell/login/components).
  webServer: {
    command: "npx vite preview --port 4317 --strictPort",
    cwd: "../admin-web",
    url: "http://localhost:4317",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
