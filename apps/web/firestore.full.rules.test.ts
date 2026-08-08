/**
 * Consolidated Firestore security-rules test suite (PRD §19 + DELTA_SPEC D6).
 * Run against the emulator: pnpm --filter @picklebaddies/web test:rules
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, collection, addDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rulesPath = path.resolve(__dirname, "../../firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: "demo-full-rules",
    firestore: { rules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Group g1: owner1, organiser1, member1
    await setDoc(doc(db, "groups/g1"), { createdBy: "owner1", memberIds: ["owner1", "organiser1", "member1"] });
    await setDoc(doc(db, "groups/g1/members/owner1"), { role: "owner" });
    await setDoc(doc(db, "groups/g1/members/organiser1"), { role: "organiser" });
    await setDoc(doc(db, "groups/g1/members/member1"), { role: "member" });

    // Venue + court
    await setDoc(doc(db, "groups/g1/venues/v1"), { name: "Hall A" });
    await setDoc(doc(db, "groups/g1/venues/v1/courts/c1"), { name: "Court 1", isActive: true });

    // Group player
    await setDoc(doc(db, "groups/g1/players/p1"), { displayName: "P1" });

    // Session s1 belongs to group g1; player p1 is a participant
    await setDoc(doc(db, "sessions/s1"), { groupId: "g1", status: "active" });
    await setDoc(doc(db, "sessions/s1/players/p1"), { displayName: "P1", status: "active" });

    // Round + match
    await setDoc(doc(db, "sessions/s1/rounds/round_1"), { roundNumber: 1, status: "in_progress" });
    await setDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1"), { matchNumber: 1, status: "scheduled" });

    // Leaderboard + ancillary
    await setDoc(doc(db, "sessions/s1/leaderboard/p1"), { wins: 0 });
    await setDoc(doc(db, "sessions/s1/sitOuts/so1"), { roundNumber: 1 });
    await setDoc(doc(db, "sessions/s1/generationRuns/gr1"), { mode: "initial" });
    await setDoc(doc(db, "sessions/s1/auditLogs/al1"), { action: "test" });

    // Join request
    await setDoc(doc(db, "sessions/s1/joinRequests/jr1"), { status: "pending", displayName: "Guest" });

    // User profile
    await setDoc(doc(db, "users/owner1"), { displayName: "Owner" });
    await setDoc(doc(db, "users/member1"), { displayName: "Member", email: "member@example.com" });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ── §19.1 Users ─────────────────────────────────────────────────────────────

describe("§19.1 Users", () => {
  it("user can read their own profile", async () => {
    const db = testEnv.authenticatedContext("owner1").firestore();
    await assertSucceeds(getDoc(doc(db, "users/owner1")));
  });

  it("user cannot read another user's profile", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertFails(getDoc(doc(db, "users/owner1")));
  });

  it("super admin can read user profiles", async () => {
    const db = testEnv.authenticatedContext("superAdmin", { email: "sanju36@gmail.com" }).firestore();
    await assertSucceeds(getDoc(doc(db, "users/member1")));
  });

  it("user can write their own profile", async () => {
    const db = testEnv.authenticatedContext("owner1").firestore();
    await assertSucceeds(setDoc(doc(db, "users/owner1"), { displayName: "New" }));
  });

  it("user cannot write another user's profile", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertFails(setDoc(doc(db, "users/owner1"), { displayName: "Hijacked" }));
  });

  it("unauthenticated user cannot read any profile", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "users/owner1")));
  });
});

// ── §19.2 Groups ─────────────────────────────────────────────────────────────

describe("§19.2 Groups", () => {
  it("group member can read the group", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertSucceeds(getDoc(doc(db, "groups/g1")));
  });

  it("non-member cannot read the group", async () => {
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(getDoc(doc(db, "groups/g1")));
  });

  it("super admin can read and update the group", async () => {
    const db = testEnv.authenticatedContext("superAdmin", { email: "pankaj4bharat@gmail.com" }).firestore();
    await assertSucceeds(getDoc(doc(db, "groups/g1")));
    await assertSucceeds(setDoc(doc(db, "groups/g1"), { name: "Admin Updated" }, { merge: true }));
  });

  it("owner can update the group", async () => {
    const db = testEnv.authenticatedContext("owner1").firestore();
    await assertSucceeds(setDoc(doc(db, "groups/g1"), { updatedAt: new Date() }, { merge: true }));
  });

  it("member cannot update the group", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertFails(setDoc(doc(db, "groups/g1"), { name: "Hacked" }, { merge: true }));
  });
});

// ── §19.3 Group Members ──────────────────────────────────────────────────────

describe("§19.3 Group Members", () => {
  it("member can read member list", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertSucceeds(getDoc(doc(db, "groups/g1/members/owner1")));
  });

  it("owner can write member docs", async () => {
    const db = testEnv.authenticatedContext("owner1").firestore();
    await assertSucceeds(setDoc(doc(db, "groups/g1/members/newmember"), { role: "member" }));
  });

  it("owner cannot create another owner", async () => {
    const db = testEnv.authenticatedContext("owner1").firestore();
    await assertFails(setDoc(doc(db, "groups/g1/members/newowner"), { role: "owner" }));
  });

  it("super admin can create team owner docs", async () => {
    const db = testEnv.authenticatedContext("superAdmin", { email: "pankaj4bharat@gmail.com" }).firestore();
    await assertSucceeds(setDoc(doc(db, "groups/g1/members/newowner"), { role: "owner" }));
  });

  it("member cannot write member docs", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertFails(setDoc(doc(db, "groups/g1/members/member1"), { role: "owner" }));
  });
});

// ── §19.4 Group Players + Venues ─────────────────────────────────────────────

describe("§19.4 Group Players", () => {
  it("member can read group players", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertSucceeds(getDoc(doc(db, "groups/g1/players/p1")));
  });

  it("organiser can write group players", async () => {
    const db = testEnv.authenticatedContext("organiser1").firestore();
    await assertSucceeds(setDoc(doc(db, "groups/g1/players/pnew"), { displayName: "New" }));
  });

  it("member cannot write group players", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertFails(setDoc(doc(db, "groups/g1/players/p1"), { displayName: "Hacked" }));
  });

  it("organiser can write venues and courts", async () => {
    const db = testEnv.authenticatedContext("organiser1").firestore();
    await assertSucceeds(setDoc(doc(db, "groups/g1/venues/v1"), { name: "Updated" }));
    await assertSucceeds(setDoc(doc(db, "groups/g1/venues/v1/courts/c2"), { name: "Court 2", isActive: true }));
  });

  it("member cannot write courts", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertFails(setDoc(doc(db, "groups/g1/venues/v1/courts/c1"), { name: "Hacked" }));
  });
});

// ── §19.5 Sessions ───────────────────────────────────────────────────────────

describe("§19.5 Sessions", () => {
  it("group member can read session", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1")));
  });

  it("session player (non-member) can read their session", async () => {
    const db = testEnv.authenticatedContext("p1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1")));
  });

  it("unauthenticated user cannot read session", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "sessions/s1")));
  });

  it("organiser can update session", async () => {
    const db = testEnv.authenticatedContext("organiser1").firestore();
    await assertSucceeds(setDoc(doc(db, "sessions/s1"), { status: "paused" }, { merge: true }));
  });

  it("member cannot update session", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertFails(setDoc(doc(db, "sessions/s1"), { status: "cancelled" }, { merge: true }));
  });

  it("player cannot update session", async () => {
    const db = testEnv.authenticatedContext("p1").firestore();
    await assertFails(setDoc(doc(db, "sessions/s1"), { status: "cancelled" }, { merge: true }));
  });
});

// ── §19.6 Session Players (DELTA_SPEC D6) ───────────────────────────────────

describe("§19.6 Session Players — function-write-only (D6)", () => {
  it("group member can read session players", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1/players/p1")));
  });

  it("player can read their own player doc", async () => {
    const db = testEnv.authenticatedContext("p1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1/players/p1")));
  });

  it("organiser cannot write session players directly", async () => {
    const db = testEnv.authenticatedContext("organiser1").firestore();
    await assertFails(setDoc(doc(db, "sessions/s1/players/p1"), { status: "left" }));
  });

  it("player cannot write their own player doc", async () => {
    const db = testEnv.authenticatedContext("p1").firestore();
    await assertFails(setDoc(doc(db, "sessions/s1/players/p1"), { wins: 99 }));
  });
});

// ── §19.7 Rounds + Matches ───────────────────────────────────────────────────

describe("§19.7 Rounds + Matches — function-write-only", () => {
  it("group member can read rounds and matches", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1/rounds/round_1")));
    await assertSucceeds(getDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1")));
  });

  it("session player can read matches", async () => {
    const db = testEnv.authenticatedContext("p1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1")));
  });

  it("organiser cannot write rounds directly", async () => {
    const db = testEnv.authenticatedContext("organiser1").firestore();
    await assertFails(setDoc(doc(db, "sessions/s1/rounds/round_1"), { status: "completed" }));
  });

  it("organiser cannot write matches directly", async () => {
    const db = testEnv.authenticatedContext("organiser1").firestore();
    await assertFails(setDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1"), { status: "completed" }));
  });

  it("player cannot write matches", async () => {
    const db = testEnv.authenticatedContext("p1").firestore();
    await assertFails(setDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1"), { status: "hacked" }));
  });

  it("non-participant cannot read matches", async () => {
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(getDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1")));
  });
});

// ── §19.8 Leaderboard ────────────────────────────────────────────────────────

describe("§19.8 Leaderboard — function-write-only", () => {
  it("group member can read leaderboard", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1/leaderboard/p1")));
  });

  it("session player can read leaderboard", async () => {
    const db = testEnv.authenticatedContext("p1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1/leaderboard/p1")));
  });

  it("anyone cannot write leaderboard directly", async () => {
    const db = testEnv.authenticatedContext("organiser1").firestore();
    await assertFails(setDoc(doc(db, "sessions/s1/leaderboard/p1"), { wins: 99 }));
  });
});

// ── §19.9 SitOuts / GenerationRuns / AuditLogs ───────────────────────────────

describe("§19.9 Read-only subcollections (function-write-only)", () => {
  it("member can read sitOuts, generationRuns, auditLogs", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1/sitOuts/so1")));
    await assertSucceeds(getDoc(doc(db, "sessions/s1/generationRuns/gr1")));
    await assertSucceeds(getDoc(doc(db, "sessions/s1/auditLogs/al1")));
  });

  it("nobody can write sitOuts, generationRuns, or auditLogs", async () => {
    const orgDb = testEnv.authenticatedContext("organiser1").firestore();
    await assertFails(setDoc(doc(orgDb, "sessions/s1/sitOuts/fake"), { roundNumber: 9 }));
    await assertFails(setDoc(doc(orgDb, "sessions/s1/generationRuns/fake"), { mode: "hacked" }));
    await assertFails(setDoc(doc(orgDb, "sessions/s1/auditLogs/fake"), { action: "hacked" }));
  });
});

// ── §19.10 JoinRequests (D6) ─────────────────────────────────────────────────

describe("§19.10 JoinRequests (D6)", () => {
  it("organiser can read join requests", async () => {
    const db = testEnv.authenticatedContext("organiser1").firestore();
    await assertSucceeds(getDoc(doc(db, "sessions/s1/joinRequests/jr1")));
  });

  it("organiser can update (approve/reject) a join request", async () => {
    const db = testEnv.authenticatedContext("organiser1").firestore();
    await assertSucceeds(setDoc(doc(db, "sessions/s1/joinRequests/jr1"), { status: "approved" }, { merge: true }));
  });

  it("nobody can create join requests directly (function-only, D6)", async () => {
    const db = testEnv.authenticatedContext("p1").firestore();
    await assertFails(addDoc(collection(db, "sessions/s1/joinRequests"), { displayName: "X", status: "pending" }));
  });

  it("member cannot read join requests", async () => {
    const db = testEnv.authenticatedContext("member1").firestore();
    await assertFails(getDoc(doc(db, "sessions/s1/joinRequests/jr1")));
  });
});

// ── Catch-all ────────────────────────────────────────────────────────────────

describe("Catch-all deny rule", () => {
  it("blocks access to arbitrary unknown collections", async () => {
    const db = testEnv.authenticatedContext("owner1").firestore();
    await assertFails(getDoc(doc(db, "unknownCollection/doc1")));
    await assertFails(setDoc(doc(db, "unknownCollection/doc1"), { x: 1 }));
  });
});
