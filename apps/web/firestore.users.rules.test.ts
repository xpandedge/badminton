import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

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

describe("users/{uid} rules (PRD §19.1)", () => {
  it("owner can write and read their own profile", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(setDoc(doc(db, "users/u1"), { displayName: "A" }));
    await assertSucceeds(getDoc(doc(db, "users/u1")));
  });

  it("a user cannot read another user's profile", async () => {
    const db = env.authenticatedContext("u2").firestore();
    await assertFails(getDoc(doc(db, "users/u1")));
  });

  it("an unauthenticated user cannot read any profile", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "users/u1")));
  });
});
