export type SquadPlayerKind = "regular" | "casual";

export type RsvpResponse = "in" | "away" | "casual_joined" | "guest_requested" | "removed";

export type SessionRsvpAdminOverride = "confirmed" | "waiting";

export interface SessionRsvpCapacity {
  totalPlayers: number;
  casualConfirmedSlots: number;
  waitlistEnabled: boolean;
}

export interface SessionRsvpEntry {
  id: string;
  displayName: string;
  response?: RsvpResponse;
  joinedAtMs?: number;
  adminOverride?: SessionRsvpAdminOverride;
}

export interface BuildSessionRsvpBucketsInput {
  capacity: SessionRsvpCapacity;
  regulars: SessionRsvpEntry[];
  casuals: SessionRsvpEntry[];
}

export interface SessionRsvpBuckets {
  regularsIn: SessionRsvpEntry[];
  regularsAway: SessionRsvpEntry[];
  casualsConfirmed: SessionRsvpEntry[];
  casualsWaiting: SessionRsvpEntry[];
  confirmedCount: number;
  spotsRemaining: number;
}

export function normalizeCasualName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildSessionRsvpBuckets(input: BuildSessionRsvpBucketsInput): SessionRsvpBuckets {
  const totalPlayers = Math.max(0, input.capacity.totalPlayers);
  const regularsAway = input.regulars.filter((entry) => entry.response === "away");
  const regularsIn = input.regulars.filter((entry) => entry.response !== "away" && entry.response !== "removed");
  const maxCasualConfirmed = Math.max(0, totalPlayers - regularsIn.length);

  const joinedCasuals = input.casuals
    .filter((entry) => entry.response === "casual_joined")
    .sort((a, b) => (a.joinedAtMs ?? 0) - (b.joinedAtMs ?? 0));
  const overrideWaitingIds = new Set(
    joinedCasuals.filter((entry) => entry.adminOverride === "waiting").map((entry) => entry.id),
  );
  const overrideConfirmed = joinedCasuals.filter((entry) => entry.adminOverride === "confirmed");
  const autoEligibleCasuals = joinedCasuals.filter(
    (entry) => entry.adminOverride !== "confirmed" && !overrideWaitingIds.has(entry.id),
  );
  const remainingSlots = Math.max(0, maxCasualConfirmed - overrideConfirmed.length);
  const casualsConfirmed = [...overrideConfirmed, ...autoEligibleCasuals.slice(0, remainingSlots)];
  const confirmedIds = new Set(casualsConfirmed.map((entry) => entry.id));
  const waitingCasuals = joinedCasuals.filter((entry) => !confirmedIds.has(entry.id));
  const confirmedCount = regularsIn.length + casualsConfirmed.length;

  return {
    regularsIn,
    regularsAway,
    casualsConfirmed,
    casualsWaiting: input.capacity.waitlistEnabled ? waitingCasuals : [],
    confirmedCount,
    spotsRemaining: Math.max(0, totalPlayers - confirmedCount),
  };
}
