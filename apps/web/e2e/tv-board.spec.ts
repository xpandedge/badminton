import { expect, test } from "@playwright/test";

test("TV rotates, prioritises simultaneous assignments and recovers", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.clock.install();
  await page.goto("/tv/demo");
  await expect(page.getByTestId("tv-court")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Court 1", exact: true })).toBeVisible();
  await page.clock.fastForward(10_500);
  await expect(page.getByTestId("tv-court")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Court 5", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Two courts finish" }).click();
  await expect(page.getByText("Head to court", { exact: true })).toHaveCount(2);
  await page.clock.fastForward(15_000);
  await expect(page.getByText("Head to court", { exact: true })).toHaveCount(2);
  await page.clock.fastForward(6000);
  await expect(page.getByText("Head to court", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByTestId("tv-board").getByRole("status")).toContainText("Connection lost");
  await page.getByRole("button", { name: "A court finishes", exact: true }).click();
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByText("Head to court", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByTestId("tv-board").getByRole("status")).toHaveText("Session paused");
});

for (const [width, height] of [[1280, 720], [1920, 1080], [3840, 2160]] as const) {
  test(`TV panels fit at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/tv/demo");
    for (const count of [2, 4, 6]) {
      await page.getByRole("button", { name: `${count} courts`, exact: true }).click();
      await expect(page.getByTestId("tv-court")).toHaveCount(Math.min(4, count));
      expect(await page.getByTestId("tv-board").evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      expect(await page.getByTestId("tv-court").evaluateAll(els => els.every(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth))).toBe(true);
    }
  });
}
