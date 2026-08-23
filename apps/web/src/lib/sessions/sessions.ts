import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, onSnapshot, query, where, orderBy, collectionGroup, getDocs } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import { generateJoinCode } from "@picklebaddies/domain";
import type { Session, SessionCourt, SessionPlayer } from "./types";
import type { SkillLevel } from "@picklebaddies/domain";
import { logEvent } from "@/lib/analytics/events";
import { safeUnsubscribe, watchWithFallback } from "@/lib/realtime/watchWithFallback";

export interface CreateSessionInput {
  groupId: string;
  venueName: string;
  courtNames: string[];
  name: string;
  sport: "badminton" | "pickleball";
  startsAt: Date;
  durationMinutes: number;
  estimatedGameMinutes: number;
  scoringMode: "winner_only" | "points";
  sessionFormat?: "social_rotation" | "fixed_pair_round_robin";
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const { db, auth } = getFirebaseServices();
  const uid = auth.currentUser!.uid;

  const courts: SessionCourt[] = input.courtNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, idx) => ({
      courtId: `court_${idx + 1}`,
      name,
      courtNumber: idx + 1,
      isActive: true,
    }));

  if (courts.length === 0) {
    throw new Error("Add at least one court before creating a session.");
  }

  const ref = await addDoc(collection(db, "sessions"), {
    groupId: input.groupId,
    venueId: null,
    venueName: input.venueName.trim(),
    name: input.name,
    sport: input.sport,
    status: "draft",
    startsAt: input.startsAt,
    durationMinutes: input.durationMinutes,
    estimatedGameMinutes: input.estimatedGameMinutes,
    courts,
    courtCount: courts.length,
    scoringMode: input.scoringMode,
    sessionFormat: input.sessionFormat ?? "social_rotation",
    createdBy: uid,
    currentRoundNumber: 0,
    joinCode: generateJoinCode(),
    joinEnabled: true,
    scoreCode: generateJoinCode(),
    scoreLinkEnabled: true,
    rsvpCode: generateJoinCode(),
    rsvpEnabled: true,
    rsvpCapacity: {
      totalPlayers: 11,
      casualConfirmedSlots: 3,
      waitlistEnabled: true,
      cutoffAt: null,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  void logEvent("session_created", { groupId: input.groupId, sport: input.sport });
  return ref.id;
}

export function watchSession(sessionId: string, cb: (s: (Session & { id: string }) | null) => void): () => void {
  const { db } = getFirebaseServices();
  const ref = doc(db, `sessions/${sessionId}`);
  const emit = (snap: { exists: () => boolean; id: string; data: () => unknown }) =>
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as Session) }) : null);
  return watchWithFallback(
    (onData, onError) => onSnapshot(ref, (snap) => { emit(snap); onData(snap); }, onError),
    () => { void getDoc(ref).then(emit).catch(() => {}); },
  );
}

export async function addSessionPlayer(
  sessionId: string,
  playerData: { playerId: string; displayName: string; skillLevel: SkillLevel }
): Promise<void> {
  const { db } = getFirebaseServices();
  const playerDocRef = doc(db, `sessions/${sessionId}/players`, playerData.playerId);

  const newPlayer: SessionPlayer = {
    ...playerData,
    status: "registered",
    participantType: "registered_user",
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    sitOutCount: 0,
  };

  await setDoc(playerDocRef, { ...newPlayer, addedAt: serverTimestamp() });
  void logEvent("player_added", { sessionId });
}

export function watchSessionPlayers(
  sessionId: string,
  cb: (players: SessionPlayer[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const unsub = onSnapshot(collection(db, `sessions/${sessionId}/players`), (snap) => {
    const players = snap.docs.map(doc => doc.data() as SessionPlayer);
    cb(players);
  }, onError);
  return () => safeUnsubscribe(unsub);
}

// Ensure updateSessionDraft is present, as mentioned in the plan spec
export async function updateSessionDraft(sessionId: string, updates: Partial<Session>): Promise<void> {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, `sessions/${sessionId}`), { ...updates, updatedAt: serverTimestamp() }, { merge: true });
}

export type SessionSummary = {
  id: string;
  name: string;
  sport: "badminton" | "pickleball";
  status: string;
  startsAt: unknown;
  venueName: string;
  courtCount: number;
  createdBy: string;
  joinCode: string;
  groupId: string;
};

export function watchGroupSessions(
  groupId: string,
  cb: (sessions: SessionSummary[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, "sessions"),
    where("groupId", "==", groupId),
  );
  const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SessionSummary, "id">) }));
    list.sort((a, b) => {
      const getMs = (val: any) => {
        if (!val) return 0;
        if (typeof val.toMillis === "function") return val.toMillis();
        if (typeof val.toDate === "function") return val.toDate().getTime();
        return new Date(val).getTime() || 0;
      };
      return getMs(b.startsAt) - getMs(a.startsAt);
    });
    cb(list);
  }, onError);
  return () => safeUnsubscribe(unsub);
}

export async function fetchMySessions(uid: string): Promise<{
  organising: SessionSummary[];
  playing: SessionSummary[];
}> {
  const { db } = getFirebaseServices();

  const [orgSnap, playerSnap] = await Promise.all([
    getDocs(query(collection(db, "sessions"), where("createdBy", "==", uid), orderBy("startsAt", "desc"))),
    getDocs(query(collectionGroup(db, "players"), where("playerId", "==", uid))),
  ]);

  const organising = orgSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SessionSummary, "id">) }));

  const playingSessionIds = [...new Set(
    playerSnap.docs.map((d) => d.ref.parent.parent!.id)
  )];
  const orgIds = new Set(organising.map((s) => s.id));
  const nonOrgPlayingIds = playingSessionIds.filter((id) => !orgIds.has(id));

  const playingDocs = await Promise.all(
    nonOrgPlayingIds.map((id) => getDoc(doc(db, "sessions", id)))
  );

  const playing = playingDocs
    .filter((d) => d.exists())
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SessionSummary, "id">) }));

  return { organising, playing };
}
