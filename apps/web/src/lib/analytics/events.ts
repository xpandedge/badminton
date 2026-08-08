import { getAnalytics, logEvent as fbLogEvent, isSupported } from "firebase/analytics";
import { getFirebaseApp } from "@/lib/firebase/client";

export type AnalyticsEvent =
  | "user_signed_up"
  | "group_created"
  | "player_added"
  | "session_created"
  | "join_link_opened"
  | "player_joined_session"
  | "schedule_generated"
  | "session_started"
  | "score_entered"
  | "round_advanced"
  | "rebalance_triggered"
  | "session_completed"
  | "leaderboard_viewed"
  | "game_finished_no_score"
  | "player_injured";

export async function logEvent(name: AnalyticsEvent, params?: Record<string, unknown>): Promise<void> {
  if (!(await isSupported())) return;
  fbLogEvent(getAnalytics(getFirebaseApp()), name, params);
}
