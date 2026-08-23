import "server-only";
import { unstable_cache } from "next/cache";
import type { AdminMetricsSnapshot } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { inferSquadGeography, type SquadGeographySource } from "@/server/admin/geography";

async function count(query: FirebaseFirestore.Query): Promise<number> {
  const snap = await query.count().get();
  return snap.data().count;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function geographySource(sources: Set<SquadGeographySource>): AdminMetricsSnapshot["geography"]["source"] {
  const withoutUnknown = new Set([...sources].filter((source) => source !== "unknown"));
  if (withoutUnknown.size === 0) return "unknown";
  if (withoutUnknown.size > 1) return "mixed";
  return withoutUnknown.has("venue-address") ? "venue-address" : "session-venue";
}

export async function computeAdminMetrics(): Promise<AdminMetricsSnapshot> {
  const db = getAdminDb();
  const now = new Date();
  const last7 = daysAgo(7);
  const last30 = daysAgo(30);

  const [
    totalUsers,
    totalPlayers,
    activePlayers30d,
    totalSquads,
    archivedSquads,
    totalSessions,
    created7d,
    startedSessions,
    completedSessions,
    abandonedSessions,
    scoreCorrections,
    ownershipTransfers,
    statRecomputes,
  ] = await Promise.all([
    count(db.collection("users")),
    count(db.collection("players")),
    count(db.collection("players").where("lastPlayedAt", ">=", last30)).catch(() => 0),
    count(db.collection("groups")),
    count(db.collection("groups").where("archivedAt", ">=", new Date(0))).catch(() => 0),
    count(db.collection("sessions")),
    count(db.collection("sessions").where("createdAt", ">=", last7)).catch(() => 0),
    count(db.collection("sessions").where("startedAt", ">=", new Date(0))).catch(() => 0),
    count(db.collection("sessions").where("status", "==", "completed")),
    count(db.collection("sessions").where("status", "in", ["active", "paused"])).catch(() => 0),
    count(db.collection("_adminAuditLogs").where("action", "==", "score/corrected")).catch(() => 0),
    count(db.collection("_adminAuditLogs").where("action", "==", "ownership/transferred")).catch(() => 0),
    count(db.collection("_adminAuditLogs").where("action", "==", "player_stats/recomputed")).catch(() => 0),
  ]);

  const recentSessionsSnap = await db.collection("sessions")
    .where("createdAt", ">=", last30)
    .limit(200)
    .get()
    .catch(() => null);
  const activeSquadIds = new Set<string>();
  const squadSessionCounts = new Map<string, number>();
  for (const docSnap of recentSessionsSnap?.docs ?? []) {
    const groupId = String(docSnap.data().groupId ?? "");
    if (!groupId) continue;
    activeSquadIds.add(groupId);
    squadSessionCounts.set(groupId, (squadSessionCounts.get(groupId) ?? 0) + 1);
  }
  const matchSnaps = await Promise.all(
    (recentSessionsSnap?.docs ?? []).slice(0, 50).map((docSnap) =>
      db.collection(`sessions/${docSnap.id}/matches`).limit(50).get().catch(() => null),
    ),
  );
  let sampledMatches = 0;
  let sampledScoredMatches = 0;
  let sampledUnscoredMatches = 0;
  for (const snap of matchSnaps) {
    for (const matchDoc of snap?.docs ?? []) {
      const match = matchDoc.data();
      if (match.status === "cancelled") continue;
      sampledMatches += 1;
      const hasWinner = match.winnerTeam === "A" || match.winnerTeam === "B";
      const hasScorePayload = match.scorePayload && typeof match.scorePayload === "object";
      if (match.status === "completed" && (hasWinner || hasScorePayload)) {
        sampledScoredMatches += 1;
      } else {
        sampledUnscoredMatches += 1;
      }
    }
  }

  const sampledSquadsSnap = await db.collection("groups").limit(100).get();
  const geography = new Map<string, { squadCount: number; active30d: number }>();
  const sources = new Set<SquadGeographySource>();
  let unknownSquads = 0;

  await Promise.all(sampledSquadsSnap.docs.map(async (groupSnap) => {
    const [venuesSnap, sessionsSnap] = await Promise.all([
      groupSnap.ref.collection("venues").limit(5).get(),
      db.collection("sessions").where("groupId", "==", groupSnap.id).limit(5).get(),
    ]);
    const inferred = inferSquadGeography({
      venues: venuesSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          name: typeof data.name === "string" ? data.name : null,
          address: typeof data.address === "string" ? data.address : null,
        };
      }),
      sessions: sessionsSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return { venueName: typeof data.venueName === "string" ? data.venueName : null };
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
  }));

  const topRegions = [...geography.entries()]
    .map(([label, values]) => ({ label, ...values }))
    .sort((a, b) => b.squadCount - a.squadCount || a.label.localeCompare(b.label))
    .slice(0, 8);

  return {
    capturedAtIso: now.toISOString(),
    users: { total: totalUsers, registeredPlayers: totalPlayers, active30d: activePlayers30d },
    squads: {
      total: totalSquads,
      active30d: activeSquadIds.size,
      repeatSessionSquads: [...squadSessionCounts.values()].filter((value) => value >= 2).length,
      archived: archivedSquads,
    },
    geography: {
      topRegions,
      unknownSquads,
      source: geographySource(sources),
    },
    sessions: {
      total: totalSessions,
      created7d,
      started: startedSessions,
      completed: completedSessions,
      abandoned: abandonedSessions,
    },
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
