import { FieldValue } from "firebase-admin/firestore";
import { buildSessionRsvpBuckets, type RsvpResponse, type SessionRsvpEntry } from "@picklebaddies/domain";

export interface RsvpPlannerGroupPlayer {
  id: string;
  userId?: string;
  displayName?: string;
  skillLevel?: string;
  playerKind?: "regular" | "casual";
}

export interface RsvpPlannerRecord {
  id: string;
  response?: RsvpResponse;
  status?: "going" | "not_going";
  participantType?: string;
  displayName?: string;
  adminOverride?: "confirmed" | "waiting";
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface RsvpPlannerSessionPlayer {
  id: string;
  status?: string;
}

export interface RsvpPlannerChange {
  playerId: string;
  response: RsvpResponse;
}

export interface RsvpSessionPlayerPlanEntry {
  playerId: string;
  displayName: string;
  skillLevel: string;
  participantType: "registered_user" | "guest";
  status: "active";
}

export interface RsvpSessionPlayerUpdatePlan {
  active: RsvpSessionPlayerPlanEntry[];
  waitingPlayerIds: string[];
  leftPlayerIds: string[];
}

function responseFromRecord(record: RsvpPlannerRecord | undefined, playerKind: "regular" | "casual") {
  if (record?.response) return record.response;
  if (record?.status === "going") return playerKind === "regular" ? "in" : "casual_joined";
  if (record?.status === "not_going") return playerKind === "regular" ? "away" : "removed";
  return undefined;
}

function displayName(value: unknown): string {
  return String(value ?? "Player").trim() || "Player";
}

export function planRsvpSessionPlayerUpdates(input: {
  status: string;
  capacity: { totalPlayers: number; casualConfirmedSlots: number; waitlistEnabled: boolean };
  groupPlayers: RsvpPlannerGroupPlayer[];
  rsvps: RsvpPlannerRecord[];
  sessionPlayers: RsvpPlannerSessionPlayer[];
  changedRsvp: RsvpPlannerChange;
}): RsvpSessionPlayerUpdatePlan {
  if (input.status !== "draft" && input.status !== "scheduled") {
    return { active: [], waitingPlayerIds: [], leftPlayerIds: [] };
  }

  const rsvpById = new Map(input.rsvps.map((record) => [record.id, record]));
  const regulars: SessionRsvpEntry[] = [];
  const casuals: Array<SessionRsvpEntry & { participantType?: string }> = [];
  const groupPlayerById = new Map(input.groupPlayers.map((player) => [player.id, player]));
  const sessionPlayerById = new Map(input.sessionPlayers.map((player) => [player.id, player]));

  for (const player of input.groupPlayers) {
    const playerKind = player.playerKind === "casual" ? "casual" : "regular";
    const storedRsvp = rsvpById.get(player.id) ?? (player.userId ? rsvpById.get(player.userId) : undefined);
    const changed = input.changedRsvp.playerId === player.id || input.changedRsvp.playerId === player.userId;
    const response = changed ? input.changedRsvp.response : responseFromRecord(storedRsvp, playerKind);
    const entry: SessionRsvpEntry = {
      id: player.id,
      displayName: displayName(player.displayName),
      response,
      joinedAtMs: storedRsvp?.createdAtMs ?? storedRsvp?.updatedAtMs,
      adminOverride: storedRsvp?.adminOverride,
    };
    if (playerKind === "regular") regulars.push(entry);
    else if (response === "casual_joined") casuals.push(entry);
  }

  for (const record of input.rsvps) {
    if (record.participantType !== "public_casual") continue;
    const changed = input.changedRsvp.playerId === record.id;
    const response = changed ? input.changedRsvp.response : record.response;
    if (response !== "casual_joined") continue;
    casuals.push({
      id: record.id,
      displayName: displayName(record.displayName),
      response: "casual_joined",
      joinedAtMs: record.createdAtMs ?? record.updatedAtMs,
      adminOverride: record.adminOverride,
      participantType: "guest",
    });
  }

  const buckets = buildSessionRsvpBuckets({ capacity: input.capacity, regulars, casuals });
  const existingPlayerIds = new Set(input.sessionPlayers.map((player) => player.id));
  const changedPlayerIds = new Set([input.changedRsvp.playerId]);
  const active = [...buckets.regularsIn, ...buckets.casualsConfirmed]
    .filter((entry) => {
      const existingStatus = sessionPlayerById.get(entry.id)?.status;
      return changedPlayerIds.has(entry.id) || (existingStatus !== "left" && existingStatus !== "removed");
    })
    .map((entry) => {
      const groupPlayer = groupPlayerById.get(entry.id);
      const isGuest = (entry as SessionRsvpEntry & { participantType?: string }).participantType === "guest";
      return {
        playerId: entry.id,
        displayName: entry.displayName,
        skillLevel: groupPlayer?.skillLevel ?? "unknown",
        participantType: isGuest ? "guest" as const : "registered_user" as const,
        status: "active" as const,
      };
    });

  const waitingPlayerIds = buckets.casualsWaiting
    .map((entry) => entry.id)
    .filter((playerId) => existingPlayerIds.has(playerId));
  const leftPlayerIds = (input.changedRsvp.response === "away" || input.changedRsvp.response === "removed")
    && existingPlayerIds.has(input.changedRsvp.playerId)
    ? [input.changedRsvp.playerId]
    : [];

  return { active, waitingPlayerIds, leftPlayerIds };
}

export function applyRsvpSessionPlayerPlan(
  db: FirebaseFirestore.Firestore,
  transaction: FirebaseFirestore.Transaction,
  sessionId: string,
  plan: RsvpSessionPlayerUpdatePlan,
  existingPlayerIds: ReadonlySet<string>,
): void {
  for (const entry of plan.active) {
    const playerRef = db.doc(`sessions/${sessionId}/players/${entry.playerId}`);
    transaction.set(playerRef, {
      playerId: entry.playerId,
      displayName: entry.displayName,
      skillLevel: entry.skillLevel,
      status: entry.status,
      participantType: entry.participantType,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existingPlayerIds.has(entry.playerId) ? {} : {
        joinedAt: FieldValue.serverTimestamp(),
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        sitOutCount: 0,
        availableFromRound: 1,
      }),
    }, { merge: true });
  }

  for (const playerId of plan.waitingPlayerIds) {
    transaction.update(db.doc(`sessions/${sessionId}/players/${playerId}`), {
      status: "waiting",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const playerId of plan.leftPlayerIds) {
    transaction.update(db.doc(`sessions/${sessionId}/players/${playerId}`), {
      status: "left",
      leftAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
