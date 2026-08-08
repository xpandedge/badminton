import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import type { QuickSession, QuickScore, PlayerStats, RosterPlayer } from "./types";
import { computeMatchKey } from "./score";
import { computeSessionDelta } from "./stats";

function sessionRef(sessionId: string) {
  const { db } = getFirebaseServices();
  return doc(db, "quickSessions", sessionId);
}

export async function saveSessionToFirestore(session: QuickSession): Promise<void> {
  await setDoc(sessionRef(session.id), session);
}

export async function loadSessionFromFirestore(sessionId: string): Promise<QuickSession | null> {
  const snap = await getDoc(sessionRef(sessionId));
  if (!snap.exists()) return null;
  return snap.data() as QuickSession;
}

export async function saveScoreToFirestore(
  sessionId: string,
  roundNumber: number,
  courtId: string,
  score: QuickScore
): Promise<void> {
  const key = computeMatchKey(roundNumber, courtId);
  await updateDoc(sessionRef(sessionId), { [`scores.${key}`]: score });
}

export async function applySessionRebalanceToFirestore(
  sessionId: string,
  players: QuickSession["players"],
  matches: QuickSession["matches"],
  sitOuts: QuickSession["sitOuts"]
): Promise<void> {
  await updateDoc(sessionRef(sessionId), { players, matches, sitOuts });
}

export async function updateSessionMatchesToFirestore(
  sessionId: string,
  matches: QuickSession["matches"],
  sitOuts: QuickSession["sitOuts"]
): Promise<void> {
  await updateDoc(sessionRef(sessionId), { matches, sitOuts });
}

export async function commitSessionStats(
  session: QuickSession,
  ownerUid: string
): Promise<void> {
  const { db } = getFirebaseServices();

  // idempotency guard
  const sessionSnap = await getDoc(doc(db, "quickSessions", session.id));
  if (sessionSnap.data()?.statsCommitted === true) return;

  const delta = computeSessionDelta(session.matches, session.sitOuts);
  const now = Date.now();
  const rosterIds = session.rosterPlayerIds ?? session.players.map((p) => p.id);

  for (const playerId of rosterIds) {
    const ref = doc(db, "users", ownerUid, "players", playerId);
    const snap = await getDoc(ref);
    if (!snap.exists()) continue;
    const existing = snap.data() as RosterPlayer;
    const s = existing.stats;

    const mergedPartner = { ...s.partnerCounts };
    delta.partnerCounts.forEach((v, k) => {
      if (k.includes(playerId)) mergedPartner[k] = (mergedPartner[k] ?? 0) + v;
    });
    const mergedOpponent = { ...s.opponentCounts };
    delta.opponentCounts.forEach((v, k) => {
      if (k.includes(playerId)) mergedOpponent[k] = (mergedOpponent[k] ?? 0) + v;
    });

    const updated: PlayerStats = {
      totalGames: s.totalGames + (delta.gamesPerPlayer.get(playerId) ?? 0),
      totalSitOuts: s.totalSitOuts + (delta.sitOutsPerPlayer.get(playerId) ?? 0),
      sessionsPlayed: s.sessionsPlayed + 1,
      partnerCounts: mergedPartner,
      opponentCounts: mergedOpponent,
      lastPlayedAt: now,
    };

    await updateDoc(ref, { stats: updated });
  }

  await updateDoc(doc(db, "quickSessions", session.id), { statsCommitted: true });
}
