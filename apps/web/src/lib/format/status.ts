/**
 * Maps raw Firestore status strings to human-readable labels.
 * Use this everywhere a status is displayed to the user.
 */

// Session-level statuses
const SESSION_STATUS_LABELS: Record<string, string> = {
  draft:     "Not started",
  scheduled: "Upcoming",
  active:    "Playing now",
  paused:    "Paused",
  completed: "Finished",
  cancelled: "Cancelled",
};

// Player-level statuses (within a session)
const PLAYER_STATUS_LABELS: Record<string, string> = {
  active:     "Playing",
  waiting:    "Stepped Out",
  checked_in: "Playing",
  left:       "Left",
  removed:    "Removed",
  no_show:    "No Show",
  injured:    "Stepped Out",
};

// Scoring mode labels
const SCORING_MODE_LABELS: Record<string, string> = {
  points:      "Full Score",
  winner_only: "Win / Loss",
};

export function formatSessionStatus(status: string): string {
  return SESSION_STATUS_LABELS[status] ?? titleCase(status);
}

export function formatPlayerStatus(status: string): string {
  return PLAYER_STATUS_LABELS[status] ?? titleCase(status);
}

export function formatScoringMode(mode: string): string {
  return SCORING_MODE_LABELS[mode] ?? titleCase(mode);
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}
