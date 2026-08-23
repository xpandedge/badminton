import type { ScoringMode, SessionFormat, SessionStatus, SessionPlayerStatus, SkillLevel, Sport } from "@picklebaddies/domain";

export interface SessionCourt {
  courtId: string;
  name: string;
  courtNumber: number;
  isActive: boolean;
}

export interface Session {
  groupId: string;
  venueId: string | null;
  venueName: string;
  name: string;
  sport: Sport;
  status: SessionStatus;
  startsAt: unknown;
  durationMinutes: number;
  estimatedGameMinutes: number;
  courts: SessionCourt[];            // DELTA_SPEC D2 snapshot (replaces numberOfCourts)
  courtCount: number;                // derived: count of isActive courts
  scoringMode: ScoringMode;          // DELTA_SPEC D1
  sessionFormat?: SessionFormat;
  createdBy: string;
  /** Continuous scheduling: courts advance independently, no synchronized
   *  round pointer. Purely a labeling counter for the next assigned match. */
  nextCycleNumber?: number;
  joinCode: string;
  joinEnabled: boolean;
  scoreCode: string;
  scoreLinkEnabled: boolean;
  rsvpCode?: string;
  rsvpEnabled?: boolean;
  rsvpCapacity?: {
    totalPlayers: number;
    casualConfirmedSlots: number;
    waitlistEnabled: boolean;
    cutoffAt?: unknown | null;
  };
  /** Read-only public player board (see-your-matches). Absent = enabled (legacy sessions). */
  boardEnabled?: boolean;
}

export interface SessionPlayer {
  playerId: string;
  displayName: string;
  skillLevel: SkillLevel;
  status: SessionPlayerStatus;
  participantType: "registered_user" | "guest"; // DELTA_SPEC D5 axis B
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  sitOutCount: number;
}
