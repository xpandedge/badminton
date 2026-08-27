import { PLAYERS_PER_MATCH } from "./types.js";
import type { EngineState } from "./state.js";

export interface SitOutResult { playing: string[]; sitting: string[]; }

/**
 * Select which players sit out this round.
 *
 * Hard Sit-Out Shield (new): players who sat out in the immediately previous
 * round are strongly penalised — they are sorted to the BACK of the sit-out
 * candidate list so they are the LAST to be asked to sit again. This guarantees
 * no consecutive sit-outs wherever the player/court ratio allows it.
 *
 * Tie-break order within shield groups:
 *   1. Fewer total sit-outs → sit first (equalize)
 *   2. More games played → sit first (give rest to overplayed)
 *   3. Higher play streak → sit first (soft two-game rhythm)
 *   4. Seeded deterministic order as final tiebreak
 */
/**
 * How far apart two players' game counts may drift before the difference is
 * treated as real unfairness rather than noise. One game apart is the ordinary
 * churn of a rotation; two is somebody actually being left out.
 */
const GAMES_TOLERANCE = 1;

/** Strict fairness ordering — a total order, used to find the sit-out boundary. */
function strictCompare(s: EngineState, x: string, y: string, prevRound: number): number {
  const xJustSat = prevRound > 0 && s.lastSitOutRound.get(x) === prevRound ? 1 : 0;
  const yJustSat = prevRound > 0 && s.lastSitOutRound.get(y) === prevRound ? 1 : 0;
  if (xJustSat !== yJustSat) return xJustSat - yJustSat; // shielded players rank last
  const so = (s.sitOuts.get(x) ?? 0) - (s.sitOuts.get(y) ?? 0);
  if (so !== 0) return so;                               // fewer sit-outs → sit first
  return (s.gamesPlayed.get(y) ?? 0) - (s.gamesPlayed.get(x) ?? 0); // more games → sit first
}

/**
 * Where `id` stands against the player on the sit-out boundary: <0 must sit,
 * 0 interchangeable, >0 must play.
 *
 * Looser than `strictCompare` on purpose. Sorting on games played to the exact
 * game made the ordering all but total — every line-up was forced, the
 * scheduler had no choice left, and the group locked into a fixed rotation
 * where the same faces met over and over. Within `GAMES_TOLERANCE` the players
 * count as interchangeable, and `planSitOuts` hands that choice on to be
 * settled on who has already played whom.
 */
function boundaryCompare(s: EngineState, id: string, boundary: string, prevRound: number): number {
  const idJustSat = prevRound > 0 && s.lastSitOutRound.get(id) === prevRound ? 1 : 0;
  const bJustSat = prevRound > 0 && s.lastSitOutRound.get(boundary) === prevRound ? 1 : 0;
  if (idJustSat !== bJustSat) return idJustSat - bJustSat;
  const so = (s.sitOuts.get(id) ?? 0) - (s.sitOuts.get(boundary) ?? 0);
  if (so !== 0) return so;
  const games = (s.gamesPlayed.get(id) ?? 0);
  const boundaryGames = (s.gamesPlayed.get(boundary) ?? 0);
  if (Math.abs(games - boundaryGames) > GAMES_TOLERANCE) return boundaryGames - games;
  return 0;
}

/**
 * Which sit-outs fairness actually dictates, and which are a free choice.
 *
 * `selectSitOuts` settles every tie on the seeded order, which in continuous
 * play trims the idle pool to exactly one court's worth before the scheduler
 * ever sees it — leaving it no say in who meets whom. This splits the decision:
 * `mustSit` and `mustPlay` are forced, and any `remaining` sitters may be taken
 * from `tied` on other grounds (see round.ts, which picks on pairing history).
 */
export interface SitOutPlan {
  /** Players fairness requires to sit this round. */
  mustSit: string[];
  /** Players fairness requires to play this round. */
  mustPlay: string[];
  /** Players tied at the fairness boundary — any of them may take a sit-out. */
  tied: string[];
  /** How many of `tied` still have to sit. */
  remaining: number;
}

export function planSitOuts(
  s: EngineState, available: string[], courtCount: number, currentRoundNumber = 0,
): SitOutPlan {
  const capacity = courtCount * PLAYERS_PER_MATCH;
  const playableCount = Math.min(Math.floor(available.length / PLAYERS_PER_MATCH) * PLAYERS_PER_MATCH, capacity);
  const sitCount = available.length - playableCount;
  if (sitCount <= 0) return { mustSit: [], mustPlay: [...available], tied: [], remaining: 0 };

  const prevRound = currentRoundNumber - 1;
  const ranked = [...available].sort((x, y) => strictCompare(s, x, y, prevRound));
  const boundary = ranked[sitCount - 1]!;

  const mustSit: string[] = [];
  const tied: string[] = [];
  const mustPlay: string[] = [];
  for (const id of available) {
    const cmp = boundaryCompare(s, id, boundary, prevRound);
    if (cmp < 0) mustSit.push(id);
    else if (cmp === 0) tied.push(id);
    else mustPlay.push(id);
  }
  return { mustSit, mustPlay, tied, remaining: sitCount - mustSit.length };
}

export function selectSitOuts(
  s: EngineState, available: string[], courtCount: number,
  order: Map<string, number> = new Map(),
  currentRoundNumber = 0,
): SitOutResult {
  const capacity = courtCount * PLAYERS_PER_MATCH;
  const playableCount = Math.min(Math.floor(available.length / PLAYERS_PER_MATCH) * PLAYERS_PER_MATCH, capacity);
  const sitCount = available.length - playableCount;
  if (sitCount <= 0) return { playing: [...available], sitting: [] };

  const prevRound = currentRoundNumber - 1;

  // Sort candidates: those who sat out last round come LAST (hard shield),
  // then sort within each group by normal fairness criteria.
  const ranked = [...available].sort((x, y) => {
    // Hard shield: just-sat-out players are deprioritised for another sit-out
    const xJustSat = prevRound > 0 && s.lastSitOutRound.get(x) === prevRound ? 1 : 0;
    const yJustSat = prevRound > 0 && s.lastSitOutRound.get(y) === prevRound ? 1 : 0;
    if (xJustSat !== yJustSat) return xJustSat - yJustSat; // shielded players rank last

    // Within same shield group: fewer sit-outs → sit first (equalize sit-out count)
    const so = (s.sitOuts.get(x) ?? 0) - (s.sitOuts.get(y) ?? 0);
    if (so !== 0) return so;
    // More games played → sit first (give rest)
    const gp = (s.gamesPlayed.get(y) ?? 0) - (s.gamesPlayed.get(x) ?? 0);
    if (gp !== 0) return gp;
    // Soft rhythm: after fairness is equal, prefer resting players who have
    // played about two games in a row. Cap at 2 so long streaks do not dominate.
    const rhythm = Math.min(s.playStreak.get(y) ?? 0, 2) - Math.min(s.playStreak.get(x) ?? 0, 2);
    if (rhythm !== 0) return rhythm;
    // Deterministic tiebreak
    return (order.get(x) ?? 0) - (order.get(y) ?? 0) || (x < y ? -1 : x > y ? 1 : 0);
  });

  const sitting = ranked.slice(0, sitCount);
  const sittingSet = new Set(sitting);
  return { playing: available.filter((p) => !sittingSet.has(p)), sitting };
}
