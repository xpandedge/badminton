// apps/web/src/lib/quick-sessions/roster.ts
import {
  collection, doc, getDocs, setDoc, getDoc,
} from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import type { QuickPlayer, RosterPlayer, PlayerStats } from "./types";

function emptyStats(): PlayerStats {
  return {
    totalGames: 0,
    totalSitOuts: 0,
    sessionsPlayed: 0,
    partnerCounts: {},
    opponentCounts: {},
    lastPlayedAt: 0,
  };
}

function rosterRef(uid: string) {
  const { db } = getFirebaseServices();
  return collection(db, "users", uid, "players");
}

function playerRef(uid: string, playerId: string) {
  const { db } = getFirebaseServices();
  return doc(db, "users", uid, "players", playerId);
}

export async function loadRoster(uid: string): Promise<RosterPlayer[]> {
  const snap = await getDocs(rosterRef(uid));
  return snap.docs.map((d) => d.data() as RosterPlayer);
}

export async function upsertRosterPlayer(uid: string, player: QuickPlayer): Promise<RosterPlayer> {
  const ref = playerRef(uid, player.id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const existing = snap.data() as RosterPlayer;
    if (existing.name !== player.name || existing.skillLevel !== player.skillLevel) {
      await setDoc(ref, { ...existing, name: player.name, skillLevel: player.skillLevel }, { merge: true });
      return { ...existing, name: player.name, skillLevel: player.skillLevel };
    }
    return existing;
  }
  const fresh: RosterPlayer = { ...player, stats: emptyStats() };
  await setDoc(ref, fresh);
  return fresh;
}

export async function upsertAllRosterPlayers(uid: string, players: QuickPlayer[]): Promise<RosterPlayer[]> {
  return Promise.all(players.map((p) => upsertRosterPlayer(uid, p)));
}
