# Squad Grade Rankings Design

## Goal

Add a per-squad grading system so players can see a simple competitive grade that rewards beating stronger opponents and penalises losing to weaker opponents.

## Placement

Add a **Squad Rankings** table inside each squad. The first version is per squad only, not global across every squad. The ranking should sit with squad-level member and session information, because the grade is meaningful inside the player pool where those people actually compete.

The table columns are:

`# | Player | Played | Won | Lost | Win% | +/- | Grade`

The **Grade** column is the last column. It shows a grade such as `B+` or `C`, plus a small **Provisional** label until the player has 3 graded games in that squad.

## Rating Model

Use a hidden Elo-style rating per squad player. Everyone starts neutral:

- starting rating: `1000`
- starting grade: `C`
- provisional until: `3` graded games

Each completed match with a winner changes the four players' squad ratings. Point scores are not required; a winner-only result is enough.

For doubles, compare team averages:

- Team A strength = average rating of the two Team A players
- Team B strength = average rating of the two Team B players
- Winners gain rating
- Losers lose rating
- Beating a stronger team gives a larger gain
- Beating a weaker team gives a smaller gain
- Losing to a stronger team gives a smaller penalty
- Losing to a weaker team gives a larger penalty

The visible grade scale is:

`A+`, `A`, `B+`, `B`, `C+`, `C`, `D+`, `D`

Do not show `F`.

## Data Storage

Store squad ranking stats on each squad player document at `groups/{squadId}/players/{playerId}` so the squad page can render quickly:

- `squadRating`
- `squadGrade`
- `squadGradedGames`
- `squadWins`
- `squadLosses`
- `squadPointsFor`
- `squadPointsAgainst`
- `squadPointDiff`

The existing session-player and session-leaderboard documents remain the source for live session views. The squad-player document becomes the squad-level rollup for rankings and grades.

## Scoring Flow

Both score entry paths must update squad grade stats:

- authenticated member scoring in `apps/web/src/server/sessions/score.ts`
- public court score-link scoring in `apps/web/src/server/sessions/score-link.ts`

This is important because grades depend on match results, and a score entered from the public court link should not be invisible to squad grading.

Score edits must reverse the previous rating/stat effect before applying the new result. If exact Elo reversal becomes too risky, the safer implementation path is to extract and replay the completed match history for that squad after an edit. The implementation plan should choose one approach explicitly and test it.

## Empty And Early States

Players with no graded games appear with:

- `Played`: `0`
- `Won`: `0`
- `Lost`: `0`
- `Win%`: `0%`
- `+/-`: `0`
- `Grade`: `C` with `Provisional`

The ranking table should keep the current DuoRally tone: useful, friendly, and not punitive. Avoid harsh copy around low grades.

## Testing

Add pure domain tests for rating behaviour:

- neutral players start at `C`
- underdog winners gain more than favourites
- favourites still gain a small amount for winning
- losing to a weaker team costs more
- grades are provisional until 3 graded games
- rating boundaries map to the expected grade labels

Add server tests or focused action coverage for:

- authenticated scoring updates squad-player ranking stats
- score-link scoring updates the same squad-player ranking stats
- winner-only payloads update grades
- guests or session-only players do not break the squad rollup
