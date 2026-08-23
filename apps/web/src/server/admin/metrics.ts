import "server-only";
import { unstable_cache } from "next/cache";
import type { AdminMetricsSnapshot } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { inferSquadGeography, type SquadGeographySource } from "@/server/admin/geography";
import { toPlain } from "@/server/lib/serialize";

async function count(query: FirebaseFirestore.Query): Promise<number> {
  const snap = await query.count().get();
  return snap.data().count;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

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

function toDate(value: unknown): Date | null {
  const iso = toIso(value);
  return iso ? new Date(iso) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dateMs(value: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
}

function geographySource(sources: Set<SquadGeographySource>): AdminMetricsSnapshot["geography"]["source"] {
  const withoutUnknown = new Set([...sources].filter((source) => source !== "unknown"));
  if (withoutUnknown.size === 0) return "unknown";
  if (withoutUnknown.size > 1) return "mixed";
  return withoutUnknown.has("venue-address") ? "venue-address" : "session-venue";
}

function buildWeeklySessions(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  now: Date,
  weekCount: number,
): AdminMetricsSnapshot["weeklySessions"] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (weekCount - 1) * 7);
  const buckets = Array.from({ length: weekCount }, (_, index) => {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + index * 7);
    return { weekStartIso: weekStart.toISOString(), count: 0 };
  });

  for (const docSnap of docs) {
    const createdAt = toDate(docSnap.data().createdAt);
    if (!createdAt) continue;
    const bucketIndex = Math.floor((createdAt.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (bucketIndex >= 0 && bucketIndex < buckets.length) {
      buckets[bucketIndex]!.count += 1;
    }
  }

  return buckets;
}

function buildRetention(counts: Map<string, number>): AdminMetricsSnapshot["retention"] {
  const retention = { fivePlus: 0, twoToFour: 0, once: 0 };
  for (const countValue of counts.values()) {
    if (countValue >= 5) retention.fivePlus += 1;
    else if (countValue >= 2) retention.twoToFour += 1;
    else if (countValue === 1) retention.once += 1;
  }
  return retention;
}

export async function computeAdminMetrics(): Promise<AdminMetricsSnapshot> {
  const db = getAdminDb();
  const now = new Date();
  const last7 = daysAgo(7);
  const last30 = daysAgo(30);
  const last90 = daysAgo(90);

  const [
    totalUsers,
    totalPlayers,
    activePlayers30d,
    totalSquads,
    archivedSquads,
    newSquads30d,
    totalSessions,
    created7d,
    created30d,
    created90d,
    scoreCorrections,
    ownershipTransfers,
    statRecomputes,
  ] = await Promise.all([
    count(db.collection("users")),
    count(db.collection("players")),
    count(db.collection("players").where("lastPlayedAt", ">=", last30)).catch(() => 0),
    count(db.collection("groups")),
    count(db.collection("groups").where("archivedAt", ">=", new Date(0))).catch(() => 0),
    count(db.collection("groups").where("createdAt", ">=", last30)).catch(() => 0),
    count(db.collection("sessions")),
    count(db.collection("sessions").where("createdAt", ">=", last7)).catch(() => 0),
    count(db.collection("sessions").where("createdAt", ">=", last30)).catch(() => 0),
    count(db.collection("sessions").where("createdAt", ">=", last90)).catch(() => 0),
    count(db.collection("_adminAuditLogs").where("action", "==", "score/corrected")).catch(() => 0),
    count(db.collection("_adminAuditLogs").where("action", "==", "ownership/transferred")).catch(() => 0),
    count(db.collection("_adminAuditLogs").where("action", "==", "player_stats/recomputed")).catch(() => 0),
  ]);

  const recentSessionsSnap = await db.collection("sessions")
    .where("createdAt", ">=", last90)
    .limit(500)
    .get()
    .catch(() => null);
  const recentSessionDocs = recentSessionsSnap?.docs ?? [];
  const activeSquadIds = new Set<string>();
  const squadSessionCounts = new Map<string, number>();
  let startedSessions = 0;
  let completedSessions = 0;
  let openNow = 0;
  let neverStarted = 0;

  for (const docSnap of recentSessionDocs) {
    const data = docSnap.data();
    const groupId = text(data.groupId);
    if (!groupId) continue;
    const createdAt = toDate(data.createdAt);
    if (createdAt && createdAt >= last30) activeSquadIds.add(groupId);
    squadSessionCounts.set(groupId, (squadSessionCounts.get(groupId) ?? 0) + 1);

    const status = text(data.status);
    if (status === "completed") completedSessions += 1;
    if (status === "active" || status === "paused") openNow += 1;
    if (toDate(data.startedAt) || status === "active" || status === "paused" || status === "completed" || status === "cancelled") {
      startedSessions += 1;
    } else {
      neverStarted += 1;
    }
  }
  const matchSnaps = await Promise.all(
    recentSessionDocs.slice(0, 80).map((docSnap) =>
      db.collection(`sessions/${docSnap.id}/matches`).limit(50).get().catch(() => null),
    ),
  );
  let sampledMatches = 0;
  let sampledScoredMatches = 0;
  let sampledUnscoredMatches = 0;
  let fullyScoredSessions = 0;
  for (const [index, snap] of matchSnaps.entries()) {
    let sessionMatches = 0;
    let sessionUnscored = 0;
    for (const matchDoc of snap?.docs ?? []) {
      const match = matchDoc.data();
      if (match.status === "cancelled") continue;
      sampledMatches += 1;
      sessionMatches += 1;
      const hasWinner = match.winnerTeam === "A" || match.winnerTeam === "B";
      const hasScorePayload = match.scorePayload && typeof match.scorePayload === "object";
      if (match.status === "completed" && (hasWinner || hasScorePayload)) {
        sampledScoredMatches += 1;
      } else {
        sampledUnscoredMatches += 1;
        sessionUnscored += 1;
      }
    }
    if (text(recentSessionDocs[index]?.data().status) === "completed" && sessionMatches > 0 && sessionUnscored === 0) {
      fullyScoredSessions += 1;
    }
  }

  const sampledSquadsSnap = await db.collection("groups").limit(100).get();
  const geography = new Map<string, { squadCount: number; active30d: number }>();
  const sources = new Set<SquadGeographySource>();
  let unknownSquads = 0;
  const quietSquads: AdminMetricsSnapshot["quietSquads"] = [];

  await Promise.all(sampledSquadsSnap.docs.map(async (groupSnap) => {
    const group = toPlain<Record<string, unknown>>(groupSnap.data());
    const [venuesSnap, sessionsSnap, sessionCountSnap] = await Promise.all([
      groupSnap.ref.collection("venues").limit(5).get(),
      db.collection("sessions").where("groupId", "==", groupSnap.id).limit(20).get(),
      db.collection("sessions").where("groupId", "==", groupSnap.id).count().get().catch(() => null),
    ]);
    const sessionDocs = sessionsSnap.docs
      .map((docSnap) => toPlain<Record<string, unknown>>(docSnap.data()))
      .sort((a, b) => dateMs(toIso(b.createdAt) ?? toIso(b.startsAt)) - dateMs(toIso(a.createdAt) ?? toIso(a.startsAt)));
    const inferred = inferSquadGeography({
      venues: venuesSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          name: typeof data.name === "string" ? data.name : null,
          address: typeof data.address === "string" ? data.address : null,
        };
      }),
      sessions: sessionDocs.map((session) => {
        return { venueName: text(session.venueName) };
      }),
    });
    sources.add(inferred.source);
    if (inferred.source === "unknown") {
      unknownSquads += 1;
      return;
    }
    const current = geography.get(inferred.label) ?? { squadCount: 0, active30d: 0 };
    current.squadCount += 1;
    if (activeSquadIds.has(groupSnap.id)) current.active30d += 1;
    geography.set(inferred.label, current);

    const lastPlayedAtIso = toIso(sessionDocs[0]?.createdAt) ?? toIso(sessionDocs[0]?.startsAt);
    const sessionCount = sessionCountSnap?.data().count ?? sessionDocs.length;
    const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
    if (lastPlayedAtIso && sessionCount > 0 && new Date(lastPlayedAtIso) < last30) {
      quietSquads.push({
        id: groupSnap.id,
        name: text(group.name) || "Untitled squad",
        sessionCount,
        lastPlayedAtIso,
        memberCount: memberIds.length,
      });
    }
  }));

  const playerSnaps = await Promise.all(
    recentSessionDocs.slice(0, 50).map((docSnap) =>
      db.collection(`sessions/${docSnap.id}/players`).limit(50).get().catch(() => null),
    ),
  );
  let guestPlayersSampled = 0;
  for (const snap of playerSnaps) {
    for (const playerDoc of snap?.docs ?? []) {
      const player = playerDoc.data();
      if (player.participantType === "guest" || player.isGuest === true || text(player.uid).startsWith("guest_")) {
        guestPlayersSampled += 1;
      }
    }
  }

  const topRegions = [...geography.entries()]
    .map(([label, values]) => ({ label, ...values }))
    .sort((a, b) => b.squadCount - a.squadCount || a.label.localeCompare(b.label))
    .slice(0, 8);

  return {
    capturedAtIso: now.toISOString(),
    period: { days: 90, label: "Last 90 days" },
    users: { total: totalUsers, registeredPlayers: totalPlayers, active30d: activePlayers30d, guestPlayersSampled },
    squads: {
      total: totalSquads,
      active30d: activeSquadIds.size,
      repeatSessionSquads: [...squadSessionCounts.values()].filter((value) => value >= 2).length,
      archived: archivedSquads,
      new30d: newSquads30d,
    },
    retention: buildRetention(squadSessionCounts),
    geography: {
      topRegions,
      unknownSquads,
      source: geographySource(sources),
    },
    sessions: {
      total: totalSessions,
      created7d,
      created30d,
      created90d,
      started: startedSessions,
      completed: completedSessions,
      abandoned: openNow,
      openNow,
      neverStarted,
      fullyScored: fullyScoredSessions,
    },
    weeklySessions: buildWeeklySessions(recentSessionDocs, now, 12),
    quietSquads: quietSquads
      .sort((a, b) => dateMs(a.lastPlayedAtIso) - dateMs(b.lastPlayedAtIso))
      .slice(0, 8),
    matches: { total: sampledMatches, scored: sampledScoredMatches, unscored: sampledUnscoredMatches },
    support: {
      scoreCorrections,
      ownershipTransfers,
      statRecomputes,
    },
  };
}

export const getAdminMetrics = unstable_cache(
  computeAdminMetrics,
  ["founder-admin-metrics"],
  { revalidate: 86_400 },
);
