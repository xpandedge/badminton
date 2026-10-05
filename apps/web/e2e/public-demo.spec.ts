import { test, expect } from "@playwright/test";
for (const width of [390, 1440]) {
  test(`public story and demo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Less organising.");
    await page.getByRole("button", { name: /A court finishes/ }).click();
    await expect(page.getByText("Oli and Chen step onto Court 1. Leo and Noah rest. Court 2 keeps playing.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('a[href="/demo"]').first().click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole("heading", { name: "Try a sample session", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Someone arrives late/ }).click();
    await expect(page.getByText("Ruby", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Playing now/ }).click();
    await expect(page.getByText("Ruby", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Start my own session/ })).toHaveAttribute("href", "/sign-in");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Try a sample session", exact: true })).toBeVisible();
  });
}
