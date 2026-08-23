import { type Page, expect } from "@playwright/test";
import type { Sport } from "@picklebaddies/domain";

/** Create a squad from the groups page; returns the squad id from the resulting URL. */
export async function createSquad(page: Page, name: string): Promise<string> {
  await page.goto("/groups");
  await page.getByTestId("squad-name-input").fill(name);
  await page.getByTestId("squad-create-submit").click();
  await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 20_000 });
  const m = page.url().match(/\/groups\/([^/?#]+)/);
  if (!m) throw new Error("squad id not found in URL: " + page.url());
  return m[1]!;
}

/** On a squad detail page, add a member by typing their name and picking the dropdown result. */
export async function addMemberByName(page: Page, displayName: string): Promise<void> {
  await page.getByTestId("member-search-input").fill(displayName);
  const result = page.getByTestId("member-search-result").filter({ hasText: displayName }).first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  // The result selects on mousedown; the input's onBlur closes the dropdown after a
  // short delay, which races a normal click. Dispatch mousedown directly instead.
  await result.dispatchEvent("mousedown");
  await page.getByTestId("member-add-submit").click();
  await expect(
    page.getByTestId("member-list-item").filter({ hasText: displayName }),
  ).toBeVisible({ timeout: 15_000 });
}

export interface SessionOpts {
  name: string;
  venue: string;
  courts: string[];
  sport?: Sport;
}

/** Create a session in a squad; returns the session id (lands on the detail page). */
export async function createSession(page: Page, squadId: string, opts: SessionOpts): Promise<string> {
  await page.goto("/sessions/new");
  // The group <select> is populated async from the user's groups; wait for our option.
  await expect(page.locator(`option[value="${squadId}"]`)).toBeAttached({ timeout: 15_000 });
  await page.getByTestId("session-group-select").selectOption({ value: squadId });
  await page.getByTestId("session-name-input").fill(opts.name);
  await page.getByTestId("session-venue-input").fill(opts.venue);
  await page.getByTestId("session-courts-input").fill(opts.courts.join("\n"));
  if (opts.sport) await page.getByTestId(`session-sport-${opts.sport}`).click();
  await page.getByTestId("session-create-submit").click();
  await page.waitForURL(/\/sessions\/[^/]+$/, { timeout: 20_000 });
  const m = page.url().match(/\/sessions\/([^/?#]+)/);
  if (!m) throw new Error("session id not found in URL: " + page.url());
  return m[1]!;
}

/**
 * Open the live console from the session DETAIL page via its in-app link (warm
 * client-side nav). A cold page.goto to /live re-initialises Firebase and races the
 * auth restore, making the first Firestore listeners error terminally. Must be on
 * /sessions/{id}.
 */
export async function openLiveConsole(page: Page): Promise<void> {
  await page.getByRole("link", { name: /Live Console/i }).click();
  await page.waitForURL(/\/live$/, { timeout: 15_000 });
  await expect(page.getByText("Loading live console")).toHaveCount(0, { timeout: 20_000 });
}

/**
 * Click "Generate Schedule" on the live console and wait for the schedule to exist.
 * The generate flow is a Cloud Function; on a cold emulator the first call can fail,
 * so retry (dismissing the error banner) until the Start Session button appears,
 * which only renders once rounds exist. Must be on the live console (draft session).
 */
export async function generateScheduleOnLive(page: Page): Promise<void> {
  const startBtn = page.getByTestId("start-session-btn");
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await page.getByTestId("generate-schedule-btn").count()) {
      await page.getByTestId("generate-schedule-btn").click();
    }
    try {
      await expect(startBtn).toBeVisible({ timeout: 15_000 });
      return;
    } catch {
      // Cold-start failure: dismiss any error banner and retry.
      const dismiss = page.getByRole("button", { name: /^Dismiss$/i });
      if (await dismiss.count()) await dismiss.first().click().catch(() => {});
    }
  }
  await expect(startBtn).toBeVisible({ timeout: 15_000 });
}

/**
 * Add squad players to a session from the session DETAIL page (draft-time roster).
 * The live console's add-player panel is only for late additions (active/paused).
 * Must already be on /sessions/{id}.
 */
export async function addPlayersToSession(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    const byAttr = page.locator(`[data-testid="roster-row"][data-player-name="${name}"]`).first();
    const target = (await byAttr.count())
      ? byAttr
      : page.getByTestId("roster-row").filter({ hasText: name }).first();
    await target.getByTestId("roster-add-btn").click();
    await expect(
      page.getByTestId("session-player").filter({ hasText: name }),
    ).toBeVisible({ timeout: 15_000 });
  }
}
