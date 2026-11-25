import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";

// Offline desktop app. Build the renderer first:  (cd ../desktop-generator && npm run build:renderer)
const GEN_DIR = path.resolve(__dirname, "../../desktop-generator");

test("generator: welcome splash + main window render", async () => {
  const app = await electron.launch({ args: ["."], cwd: GEN_DIR, env: { ...process.env, MSIDC_DEV: "1" } });
  // The 5-second splash window appears first.
  const splash = await app.firstWindow();
  await splash.waitForTimeout(500);
  await expect(splash).toHaveScreenshot("generator-splash.png");
  // Then the main window (wait for it to be shown after the splash).
  const main = await app.waitForEvent("window", { timeout: 15_000 }).catch(() => splash);
  await main.waitForLoadState("domcontentloaded");
  await expect(main).toHaveScreenshot("generator-main.png", { maxDiffPixelRatio: 0.02 });
  await app.close();
});
