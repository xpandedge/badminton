import "server-only";
import { getAdminAuth, getAdminDb } from "@/server/firebase/admin";
import { inferSquadGeography } from "@/server/admin/geography";
import { toPlain } from "@/server/lib/serialize";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function dateMs(value: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface AdminUserRow {
  uid: string;
  displayName: string;
  email: string;
  createdAtIso: string | null;
  lastSignInIso: string | null;
  disabled: boolean;
  playerGames: number | null;
}

export interface AdminSquadRow {
  id: string;
  name: string;
  ownerUid: string;
  ownerName: string;
  memberCount: number;
  sessionCount: number | null;
  geography: string;
  status: "active" | "archived";
  createdAtIso: string | null;
  updatedAtIso: string | null;
}

export interface AdminSessionRow {
  id: string;
  name: string;
  squadId: string;
  squadName: string;
  status: string;
  sport: string;
  venueName: string;
  startsAtIso: string | null;
  createdAtIso: string | null;
  courtCount: number;
  rsvpGoingCount: number;
  matchCount: number | null;
}

export async function listAdminUsers(limit = 50): Promise<AdminUserRow[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 50);
  const auth = getAdminAuth();
  const db = getAdminDb();
  const page = await auth.listUsers(cappedLimit);
  const users = page.users;
  const [profileSnaps, playerSnaps] = users.length > 0
    ? await Promise.all([
      db.getAll(...users.map((user) => db.doc(`users/${user.uid}`))),
      db.getAll(...users.map((user) => db.doc(`players/${user.uid}`))),
    ])
    : [[], []];

  return users.map((user, index) => {
    const profile = profileSnaps[index]?.exists ? profileSnaps[index]!.data() : {};
    const player = playerSnaps[index]?.exists ? playerSnaps[index]!.data() : {};
    return {
      uid: user.uid,
      displayName: user.displayName || text(profile?.displayName) || "Player",
      email: user.email || text(profile?.email) || text(profile?.emailLower),
      createdAtIso: toIso(profile?.createdAt) ?? user.metadata.creationTime ?? null,
      lastSignInIso: user.metadata.lastSignInTime ?? toIso(player?.lastPlayedAt),
      disabled: user.disabled,
      playerGames: typeof player?.totalGames === "number" ? player.totalGames : null,
    };
  }).sort((a, b) => dateMs(b.lastSignInIso ?? b.createdAtIso) - dateMs(a.lastSignInIso ?? a.createdAtIso));
}

export async function listAdminSquads(limit = 50): Promise<AdminSquadRow[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 50);
  const db = getAdminDb();
  const snap = await db.collection("groups").orderBy("updatedAt", "desc").limit(cappedLimit).get()
    .catch(() => db.collection("groups").limit(cappedLimit).get());

  const rows = await Promise.all(snap.docs.map(async (groupSnap) => {
    const group = toPlain<Record<string, unknown>>(groupSnap.data());
    const ownerUid = text(group.createdBy);
    const [ownerSnap, venuesSnap, sessionsSnap, sessionCountSnap] = await Promise.all([
      ownerUid ? groupSnap.ref.collection("members").doc(ownerUid).get().catch(() => null) : Promise.resolve(null),
      groupSnap.ref.collection("venues").limit(5).get(),
      db.collection("sessions").where("groupId", "==", groupSnap.id).limit(5).get(),
      db.collection("sessions").where("groupId", "==", groupSnap.id).count().get().catch(() => null),
    ]);
    const geography = inferSquadGeography({
      venues: venuesSnap.docs.map((docSnap) => {
        const venue = docSnap.data();
        return { name: text(venue.name), address: text(venue.address) };
      }),
      sessions: sessionsSnap.docs.map((docSnap) => {
        const session = docSnap.data();
        return { venueName: text(session.venueName) };
      }),
    });
    const owner = ownerSnap?.exists ? ownerSnap.data() : {};
    const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
    return {
      id: groupSnap.id,
      name: text(group.name) || "Untitled squad",
      ownerUid,
      ownerName: text(owner?.displayName) || ownerUid || "Unknown",
      memberCount: memberIds.length,
      sessionCount: sessionCountSnap?.data().count ?? null,
      geography: geography.label,
      status: group.archivedAt ? "archived" : "active",
      createdAtIso: toIso(group.createdAt),
      updatedAtIso: toIso(group.updatedAt),
    } satisfies AdminSquadRow;
  }));

  return rows.sort((a, b) => dateMs(b.updatedAtIso ?? b.createdAtIso) - dateMs(a.updatedAtIso ?? a.createdAtIso));
}

export async function listAdminSessions(limit = 50): Promise<AdminSessionRow[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 50);
  const db = getAdminDb();
  const snap = await db.collection("sessions").orderBy("createdAt", "desc").limit(cappedLimit).get()
    .catch(() => db.collection("sessions").limit(cappedLimit).get());

  const squadIds = [...new Set(snap.docs.map((docSnap) => text(docSnap.data().groupId)).filter(Boolean))];
  const squadSnaps = squadIds.length > 0
    ? await db.getAll(...squadIds.map((id) => db.doc(`groups/${id}`)))
    : [];
  const squadNameById = new Map(squadSnaps.map((squadSnap) => [
    squadSnap.id,
    squadSnap.exists ? text(squadSnap.data()?.name) || "Untitled squad" : "Unknown squad",
  ]));

  const matchCounts = await Promise.all(
    snap.docs.map((docSnap) => docSnap.ref.collection("matches").count().get().then((countSnap) => countSnap.data().count).catch(() => null)),
  );

  return snap.docs.map((docSnap, index) => {
    const session = toPlain<Record<string, unknown>>(docSnap.data());
    const squadId = text(session.groupId);
    return {
      id: docSnap.id,
      name: text(session.name) || "Untitled session",
      squadId,
      squadName: squadNameById.get(squadId) ?? "Unknown squad",
      status: text(session.status) || "unknown",
      sport: text(session.sport) || "badminton",
      venueName: text(session.venueName),
      startsAtIso: toIso(session.startsAt),
      createdAtIso: toIso(session.createdAt),
      courtCount: typeof session.courtCount === "number" ? session.courtCount : 0,
      rsvpGoingCount: typeof session.rsvpGoingCount === "number" ? session.rsvpGoingCount : 0,
      matchCount: matchCounts[index] ?? null,
    } satisfies AdminSessionRow;
  }).sort((a, b) => dateMs(b.createdAtIso ?? b.startsAtIso) - dateMs(a.createdAtIso ?? a.startsAtIso));
}
