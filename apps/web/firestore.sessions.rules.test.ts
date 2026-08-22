import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

describe("Firestore Rules: Sessions", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "picklebaddies",
      firestore: {
        rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      },
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  async function setupGroupAndSession() {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Setup group
      await setDoc(doc(db, "groups/g1"), { name: "G1", memberIds: ["admin1", "org1", "mem1"] });
      await setDoc(doc(db, "groups/g1/members/admin1"), { userId: "admin1", role: "admin" });
      await setDoc(doc(db, "groups/g1/members/org1"), { userId: "org1", role: "organiser" });
      await setDoc(doc(db, "groups/g1/members/mem1"), { userId: "mem1", role: "member" });

      // Setup session
      await setDoc(doc(db, "sessions/s1"), { groupId: "g1", name: "Session 1" });

      // Setup session player
      await setDoc(doc(db, "sessions/s1/players/p1"), { playerId: "p1", status: "registered" });

      // Setup join request
      await setDoc(doc(db, "sessions/s1/joinRequests/r1"), { status: "pending" });
    });
  }

  describe("session document access", () => {
    it("allows admin to create session", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("admin1").firestore();
      await assertSucceeds(setDoc(doc(db, "sessions/s2"), { groupId: "g1", name: "S2" }));
    });

    it("keeps legacy organiser session access", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("org1").firestore();
      await assertSucceeds(setDoc(doc(db, "sessions/s2"), { groupId: "g1", name: "S2" }));
    });

    it("denies member to create session", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("mem1").firestore();
      await assertFails(setDoc(doc(db, "sessions/s2"), { groupId: "g1", name: "S2" }));
    });

    it("allows member to read session", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("mem1").firestore();
      await assertSucceeds(getDoc(doc(db, "sessions/s1")));
    });

    it("allows non-member session player to read session", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("p1").firestore();
      await assertSucceeds(getDoc(doc(db, "sessions/s1")));
    });

    it("denies random user to read session", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("rando").firestore();
      await assertFails(getDoc(doc(db, "sessions/s1")));
    });
  });

  describe("session players subcollection", () => {
    it("allows member to read player", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("mem1").firestore();
      await assertSucceeds(getDoc(doc(db, "sessions/s1/players/p1")));
    });

    it("allows self to read player", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("p1").firestore();
      await assertSucceeds(getDoc(doc(db, "sessions/s1/players/p1")));
    });

    it("denies client (even organiser) to write player", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("org1").firestore();
      await assertFails(setDoc(doc(db, "sessions/s1/players/p1"), { name: "Updated" }));
    });
  });

  describe("joinRequests subcollection", () => {
    it("allows admin to read join request", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("admin1").firestore();
      await assertSucceeds(getDoc(doc(db, "sessions/s1/joinRequests/r1")));
    });

    it("denies regular member access to applicant details", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("mem1").firestore();
      await assertFails(getDoc(doc(db, "sessions/s1/joinRequests/r1")));
    });

    it("denies client to create join request directly", async () => {
      await setupGroupAndSession();
      const db = env.authenticatedContext("rando").firestore();
      await assertFails(setDoc(doc(db, "sessions/s1/joinRequests/r2"), { status: "pending" }));
    });
  });
});
