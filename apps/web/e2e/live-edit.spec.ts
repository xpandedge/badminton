import { test, expect } from "@playwright/test";
import { signInAs, DEV_NAME } from "./fixtures/users";
import { createSquad, addMemberByName, createSession, addPlayersToSession, openLiveConsole, generateScheduleOnLive } from "./fixtures/setup";

test.describe("live session editing", () => {
  test("score a match, then rebalance preserves the locked match", async ({ page }) => {
    // Accept any confirm dialogs (e.g. rebalance prompts) automatically.
    page.on("dialog", (d) => d.accept());

    await page.goto("/");
    await signInAs(page, "alice");

    const squadId = await createSquad(page, `Live ${Date.now()}`);
    await addMemberByName(page, DEV_NAME.bob);
    await addMemberByName(page, DEV_NAME.carol);
    await addMemberByName(page, DEV_NAME.dave);

    await createSession(page, squadId, {
      name: `Live Test ${Date.now()}`,
      venue: "Hall",
      courts: ["Court 1"],
      sport: "pickleball", // points scoring
    });

    await addPlayersToSession(page, [DEV_NAME.alice, DEV_NAME.bob, DEV_NAME.carol, DEV_NAME.dave]);

    await openLiveConsole(page);
    await generateScheduleOnLive(page);

    // Start the session so the current round's matches render, then score round 1.
    await page.getByTestId("start-session-btn").click();
    await expect(page.getByTestId("match-card").first()).toBeVisible({ timeout: 20_000 });
    const match = page.getByTestId("match-card").first();
    const matchId = await match.getAttribute("data-match-id");
    expect(matchId).toBeTruthy();

    await match.getByTestId("score-team-a-input").fill("21");
    await match.getByTestId("score-team-b-input").fill("15");
    await match.getByTestId("save-score-btn").click();

    // The scored match becomes locked.
    const locked = page.locator(`[data-match-id="${matchId}"][data-locked="true"]`);
    await expect(locked).toBeVisible({ timeout: 20_000 });

    // The organiser flow no longer exposes a manual shuffle button. Roster and
    // court changes rebalance in the background without disturbing visible cards.
    await expect(page.getByTestId("rebalance-btn")).toHaveCount(0);
    const lockedAfter = page.locator(`[data-match-id="${matchId}"][data-locked="true"]`);
    await expect(lockedAfter).toBeVisible({ timeout: 20_000 });
    await expect(lockedAfter.getByTestId("match-player")).toHaveCount(4);
  });
});
