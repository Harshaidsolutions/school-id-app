import { test, expect } from "@playwright/test";

// Offline: serves admin-web/dist. The page shell + login render client-side with
// no backend. For logged-in states (dashboard, the notification bulk-delete modal)
// point baseURL at a locally-seeded instance and sign in in a beforeEach.
test.describe("admin-web visual", () => {
  test("login page", async ({ page }) => {
    await page.goto("http://localhost:4317/login");
    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });

  // Example of the exact regression that bit us: the bulk-delete modal must sit on
  // top of the page, centered. (Enable once you can reach the logged-in dashboard.)
  test.skip("notification bulk-delete modal is on top & centered", async ({ page }) => {
    // await signInAsSuperAdmin(page);
    // await page.getByRole("button", { name: /bell|notifications/i }).click();
    // await page.getByRole("button", { name: /bulk delete/i }).click();
    // const overlay = page.locator(".fixed.inset-0").last();
    // await expect(overlay).toHaveScreenshot("bulk-delete-modal.png");
  });
});
