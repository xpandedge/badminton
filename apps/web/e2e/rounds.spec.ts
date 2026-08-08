import { test, expect } from "@playwright/test";
import { signInAs, DEV_NAME } from "./fixtures/users";
import { createSquad, addMemberByName, createSession, addPlayersToSession, openLiveConsole, generateScheduleOnLive } from "./fixtures/setup";

test.describe("round generation", () => {
  test("add four players and generate a fair round", async ({ page }) => {
    await page.goto("/");
    await signInAs(page, "alice");

    const squadId = await createSquad(page, `Gen ${Date.now()}`);
    // Build a 4-player squad: Alice (owner) + Bob + Carol + Dave.
    await addMemberByName(page, DEV_NAME.bob);
    await addMemberByName(page, DEV_NAME.carol);
    await addMemberByName(page, DEV_NAME.dave);

    await createSession(page, squadId, {
      name: `Round Test ${Date.now()}`,
      venue: "Hall",
      courts: ["Court 1"],
      sport: "badminton",
    });

    // On the detail page, add the four players to the session.
    await addPlayersToSession(page, [DEV_NAME.alice, DEV_NAME.bob, DEV_NAME.carol, DEV_NAME.dave]);

    // Open the live console (warm nav), generate, then start so the current round's
    // matches render (the console only shows matches for session.currentRoundNumber,
    // which becomes 1 on start).
    await openLiveConsole(page);
    await generateScheduleOnLive(page);
    await page.getByTestId("start-session-btn").click();

    // A round + match renders; the match has 4 distinct players.
    await expect(page.getByTestId("round-card").first()).toBeVisible({ timeout: 20_000 });
    const match = page.getByTestId("match-card").first();
    await expect(match).toBeVisible({ timeout: 20_000 });
    await expect(match.getByTestId("match-player")).toHaveCount(4);
    await expect(page.getByTestId("fairness-chip")).toBeVisible({ timeout: 20_000 });
  });
});
