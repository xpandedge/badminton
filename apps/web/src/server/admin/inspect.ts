import "server-only";
import { getAdminAuth, getAdminDb } from "@/server/firebase/admin";
import { inferSquadGeography, type SquadGeography } from "@/server/admin/geography";
import { assertSuperAdminAction } from "@/server/admin/guard";
import { err, ok, type ActionResult } from "@/server/result";
import { toPlain } from "@/server/lib/serialize";

type PlainData = Record<string, unknown>;

export interface AdminDoc<T = PlainData> {
  id: string;
  data: T;
}

export interface AdminUserInspection {
  uid: string;
  profile: PlainData | null;
  player: PlainData | null;
  auth: {
    email: string | null;
    displayName: string | null;
    disabled: boolean;
    lastSignInTime: string | null;
    creationTime: string | null;
    providers: string[];
  } | null;
  membershipNote: string;
}

export interface AdminSquadInspection {
  id: string;
  group: PlainData;
  geography: SquadGeography;
  members: AdminDoc[];
  venues: AdminDoc[];
  sessions: AdminDoc[];
  counts: { members: number | null; sessions: number | null };
}

export interface AdminSessionInspection {
  id: string;
  session: PlainData;
  players: AdminDoc[];
  matches: AdminDoc[];
  leaderboard: AdminDoc[];
  auditLogs: AdminDoc[];
  generationRuns: AdminDoc[];
  engine: AdminDoc[];
}

function dataOf<T = PlainData>(snap: FirebaseFirestore.DocumentSnapshot): T {
  return toPlain((snap.data() ?? {}) as T);
}

async function assertAccess() {
  const access = await assertSuperAdminAction();
  if (!access.ok) return access;
  return ok(access.data);
}

export async function inspectUser(uid: string): Promise<ActionResult<AdminUserInspection>> {
  const access = await assertAccess();
  if (!access.ok) return access;
  if (!uid) return err("INVALID_ARGUMENT", "User ID is required");

  const db = getAdminDb();
  const auth = getAdminAuth();
  const [profileSnap, playerSnap, authUser] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`players/${uid}`).get(),
    auth.getUser(uid).catch(() => null),
  ]);

  if (!profileSnap.exists && !playerSnap.exists && !authUser) {
    return err("NOT_FOUND", "User not found");
  }

  return ok({
    uid,
    profile: profileSnap.exists ? dataOf(profileSnap) : null,
    player: playerSnap.exists ? dataOf(playerSnap) : null,
    auth: authUser ? {
      email: authUser.email ?? null,
      displayName: authUser.displayName ?? null,
      disabled: authUser.disabled,
      lastSignInTime: authUser.metadata.lastSignInTime ?? null,
      creationTime: authUser.metadata.creationTime ?? null,
      providers: authUser.providerData.map((provider) => provider.providerId),
    } : null,
    membershipNote: "Squad memberships are shown from squad inspectors to avoid cross-squad scans without a dedicated index.",
  });
}

export async function inspectSquad(groupId: string): Promise<ActionResult<AdminSquadInspection>> {
  const access = await assertAccess();
  if (!access.ok) return access;
  if (!groupId) return err("INVALID_ARGUMENT", "Squad ID is required");

  const db = getAdminDb();
  const groupRef = db.doc(`groups/${groupId}`);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return err("NOT_FOUND", "Squad not found");

  const [membersSnap, venuesSnap, sessionsSnap, memberCountSnap, sessionCountSnap] = await Promise.all([
    groupRef.collection("members").limit(25).get(),
    groupRef.collection("venues").limit(25).get(),
    db.collection("sessions").where("groupId", "==", groupId).limit(25).get(),
    groupRef.collection("members").count().get().catch(() => null),
    db.collection("sessions").where("groupId", "==", groupId).count().get().catch(() => null),
  ]);

  const venues = venuesSnap.docs.map((docSnap) => ({ id: docSnap.id, data: dataOf(docSnap) }));
  const sessions = sessionsSnap.docs.map((docSnap) => ({ id: docSnap.id, data: dataOf(docSnap) }));
  const geography = inferSquadGeography({
    venues: venues.map((venue) => ({
      name: typeof venue.data.name === "string" ? venue.data.name : null,
      address: typeof venue.data.address === "string" ? venue.data.address : null,
    })),
    sessions: sessions.map((session) => ({
      venueName: typeof session.data.venueName === "string" ? session.data.venueName : null,
    })),
  });

  return ok({
    id: groupId,
    group: dataOf(groupSnap),
    geography,
    members: membersSnap.docs.map((docSnap) => ({ id: docSnap.id, data: dataOf(docSnap) })),
    venues,
    sessions,
    counts: {
      members: memberCountSnap?.data().count ?? null,
      sessions: sessionCountSnap?.data().count ?? null,
    },
  });
}

export async function inspectSession(sessionId: string): Promise<ActionResult<AdminSessionInspection>> {
  const access = await assertAccess();
  if (!access.ok) return access;
  if (!sessionId) return err("INVALID_ARGUMENT", "Session ID is required");

  const db = getAdminDb();
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return err("NOT_FOUND", "Session not found");

  const [playersSnap, matchesSnap, leaderboardSnap, auditSnap, generationSnap, engineSnap] = await Promise.all([
    sessionRef.collection("players").limit(50).get(),
    sessionRef.collection("matches").limit(50).get(),
    sessionRef.collection("leaderboard").limit(50).get(),
    sessionRef.collection("auditLogs").orderBy("createdAt", "desc").limit(100).get().catch(() => sessionRef.collection("auditLogs").limit(100).get()),
    sessionRef.collection("generationRuns").limit(25).get(),
    sessionRef.collection("engine").limit(5).get(),
  ]);

  return ok({
    id: sessionId,
    session: dataOf(sessionSnap),
    players: playersSnap.docs.map((docSnap) => ({ id: docSnap.id, data: dataOf(docSnap) })),
    matches: matchesSnap.docs.map((docSnap) => ({ id: docSnap.id, data: dataOf(docSnap) })),
    leaderboard: leaderboardSnap.docs.map((docSnap) => ({ id: docSnap.id, data: dataOf(docSnap) })),
    auditLogs: auditSnap.docs.map((docSnap) => ({ id: docSnap.id, data: dataOf(docSnap) })),
    generationRuns: generationSnap.docs.map((docSnap) => ({ id: docSnap.id, data: dataOf(docSnap) })),
    engine: engineSnap.docs.map((docSnap) => ({ id: docSnap.id, data: dataOf(docSnap) })),
  });
}
