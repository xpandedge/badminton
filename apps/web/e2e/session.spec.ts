import { test, expect } from "@playwright/test";
import { signInAs } from "./fixtures/users";
import { createSquad, createSession } from "./fixtures/setup";

test.describe("session creation", () => {
  test("owner creates a session in a squad", async ({ page }) => {
    await page.goto("/");
    await signInAs(page, "alice");

    const squadId = await createSquad(page, `Sesh ${Date.now()}`);
    const sessionName = `Friday Night ${Date.now()}`;
    const sessionId = await createSession(page, squadId, {
      name: sessionName,
      venue: "Community Hall",
      courts: ["Court 1", "Court 2"],
      sport: "pickleball",
    });
    expect(sessionId).toBeTruthy();

    // The detail page should show the session name.
    await expect(page.getByText(sessionName).first()).toBeVisible({ timeout: 20_000 });
  });
});
