import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rulesPath = path.resolve(__dirname, "../../firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: "demo-live-rules",
    firestore: { rules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "groups/g1/members/organiser1"), { role: "organiser" });
    await setDoc(doc(db, "groups/g1"), { memberIds: ["organiser1"] });
    await setDoc(doc(db, "sessions/s1"), { groupId: "g1" });
    await setDoc(doc(db, "sessions/s1/players/p1"), { displayName: "P1" });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Live Session Rules (PRD §19.10, D3)", () => {
  it("allows participant to read matches and leaderboard", async () => {
    const p1Context = testEnv.authenticatedContext("p1");
    const db = p1Context.firestore();

    await assertSucceeds(getDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1")));
    await assertSucceeds(getDoc(doc(db, "sessions/s1/leaderboard/p1")));
  });

  it("denies non-participant from reading matches", async () => {
    const randomContext = testEnv.authenticatedContext("random");
    const db = randomContext.firestore();

    await assertFails(getDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1")));
  });

  it("denies participants from writing to matches or leaderboard", async () => {
    const p1Context = testEnv.authenticatedContext("p1");
    const db = p1Context.firestore();

    await assertFails(setDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1"), { test: 1 }));
    await assertFails(setDoc(doc(db, "sessions/s1/leaderboard/p1"), { wins: 1 }));
  });

  it("denies organisers from writing to matches directly", async () => {
    const orgContext = testEnv.authenticatedContext("organiser1");
    const db = orgContext.firestore();

    await assertFails(setDoc(doc(db, "sessions/s1/rounds/round_1/matches/m1"), { test: 1 }));
  });
});
