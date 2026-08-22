/**
 * Cloud Functions entrypoint (PRD §16, DELTA_SPEC D1/D3/D6).
 *
 * M0: scaffold only. Each function is a thin wrapper that will (M5/M6):
 *   - validate group role (DELTA_SPEC D5)
 *   - load Firestore data
 *   - call the pure @picklebaddies/match-engine
 *   - write results in a batch/transaction
 *
 * Listed here so the integration surface is fixed early.
 */
// Must be the first import: it sets the region and initialises the admin app
// before any of the re-exports below define their functions. See options.ts.
import "./options.js";

// Planned callable functions (implemented in later milestones):
//   submitScore(sessionId, roundId, matchId, payload)   — DELTA_SPEC D1
//   updatePlayerStatus(sessionId, sessionPlayerId, st)  — PRD §16.4
//   advanceRound(sessionId)                             — PRD §16.5
//   pauseSession / resumeSession                        — DELTA_SPEC minor
//   requestJoin(joinCode, details)                      — DELTA_SPEC D6

export {
  requestJoin,
  approveJoinRequest,
  rejectJoinRequest
} from "./join.js";

export { submitScore } from "./submitScore.js";
export { startSession, pauseSession, resumeSession, completeSession } from "./sessionLifecycle.js";
export { advanceRound } from "./advanceRound.js";
export { updatePlayerStatus, addLatePlayer } from "./updatePlayerStatus.js";
export { swapPlayers, moveMatch, disableCourt } from "./manualOverride.js";
export { addGroupMemberByEmail } from "./groups.js";
export { getScoreLinkData, submitScoreByLink } from "./scoreLink.js";
export { joinGroupByInvite } from "./groupInvite.js";
export { purgeArchivedSquads } from "./purgeArchivedSquads.js";
