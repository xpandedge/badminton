import { test, expect } from "@playwright/test";

test.describe("public legal pages", () => {
  test("privacy and terms are public and cross-linked", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
    await expect(page.getByText("Xpandedge Pty Ltd").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" }).first()).toHaveAttribute("href", "/terms");

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Use", level: 1 })).toBeVisible();
    await expect(page.getByText("Australian Consumer Law").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy" }).first()).toHaveAttribute("href", "/privacy");
  });

  test("entry surfaces expose legal links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");

    await page.goto("/sign-in");
    await expect(page.getByText(/agree to the Terms/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  test("legal pages do not overflow a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/privacy");

    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });
});
