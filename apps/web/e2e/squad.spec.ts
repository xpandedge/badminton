import { test, expect } from "@playwright/test";
import { signInAs, DEV_NAME } from "./fixtures/users";
import { createSquad, addMemberByName } from "./fixtures/setup";

test.describe("squad creation + membership", () => {
  test("owner creates a squad and adds a member; member sees the squad", async ({ page }) => {
    await page.goto("/");
    await signInAs(page, "alice");

    const squadName = `Smashers ${Date.now()}`;
    const squadId = await createSquad(page, squadName);
    expect(squadId).toBeTruthy();

    // Alice (owner) adds Bob by name via the picker.
    await addMemberByName(page, DEV_NAME.bob);
    await expect(
      page.getByTestId("member-list-item").filter({ hasText: DEV_NAME.bob }),
    ).toBeVisible();

    // Switch to Bob: he should see the squad in his groups list.
    await signInAs(page, "bob");
    await page.goto("/groups");
    await expect(
      page.getByTestId("squad-list-item").filter({ hasText: squadName }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
