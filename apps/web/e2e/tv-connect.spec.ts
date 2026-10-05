import { test, expect } from "@playwright/test";

test("connection page explains options and requires organiser sign-in", async ({ page }) => {
  await page.goto("/board/ABC123/connect");
  await expect(page.getByRole("heading", { name: "Show your social on TV" })).toBeVisible();
  await page.getByLabel("TV pairing code").fill("AB12-CD34");
  await page.getByRole("button", { name: "Connect TV", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sign in as the session organiser" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "TV board", exact: true })).toHaveAttribute("href", "/board/ABC123/tv");
});

test("receiver bootstraps a non-media Cast app and rejects URL messages", async ({ page }) => {
  await page.route("https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js", route => route.fulfill({
    contentType: "application/javascript",
    body: `window.__castTest = {messages: []}; window.cast = {framework: {system: {MessageType: {JSON: 'JSON'}}, CastReceiverContext: {getInstance: () => ({
      addCustomMessageListener: (namespace, listener) => {window.__castTest.namespace = namespace; window.__castTest.listener = listener;},
      removeCustomMessageListener: () => {},
      sendCustomMessage: (namespace, sender, data) => window.__castTest.messages.push(data),
      start: options => window.__castTest.options = options
    })}}};`,
  }));
  await page.goto("/cast/receiver");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __castTest?: { options?: { disableIdleTimeout: boolean } } }).__castTest?.options?.disableIdleTimeout)).toBe(true);
  await page.evaluate(() => (window as unknown as { __castTest: { listener: (event: unknown) => void } }).__castTest.listener({ senderId: "test", data: { type: "url", url: "https://example.com" } }));
  expect(await page.evaluate(() => (window as unknown as { __castTest: { messages: unknown[] } }).__castTest.messages)).toContainEqual({ type: "error", message: "Invalid display message" });
  await expect(page.getByText(/Ready for your session/)).toBeVisible();
});
