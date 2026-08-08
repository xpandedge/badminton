import { type Page, expect } from "@playwright/test";

export const DEV_KEYS = ["alice", "bob", "carol", "dave"] as const;
export type DevKey = (typeof DEV_KEYS)[number];

export const DEV_NAME: Record<DevKey, string> = {
  alice: "Alice Dev", bob: "Bob Dev", carol: "Carol Dev", dave: "Dave Dev",
};
export const DEV_EMAIL: Record<DevKey, string> = {
  alice: "alice@dev.local", bob: "bob@dev.local", carol: "carol@dev.local", dave: "dave@dev.local",
};

/** Switch the app to a given dummy user via the dev switcher, wait until signed in. */
export async function signInAs(page: Page, key: DevKey): Promise<void> {
  await expect(page.getByTestId("dev-user-switcher")).toBeVisible();
  await page.getByTestId(`dev-user-option-${key}`).click();
  await expect(page.getByTestId("dev-current-user")).toHaveText(DEV_NAME[key], { timeout: 20_000 });
}
