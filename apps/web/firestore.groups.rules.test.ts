import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { setLogLevel, doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc } from "firebase/firestore";
import fs from "fs";

let env: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel("error");
  env = await initializeTestEnvironment({
    projectId: "picklebaddies-groups",
    firestore: {
      rules: fs.readFileSync("../../firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();

  // Seed the group
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "groups", "group1"), {
      name: "Test Group",
      createdBy: "owner1",
      memberIds: ["owner1", "admin1", "organiser1", "member1"],
    });
    await setDoc(doc(db, "groups", "group1", "members", "owner1"), {
      userId: "owner1",
      role: "owner",
    });
    await setDoc(doc(db, "groups", "group1", "members", "organiser1"), {
      userId: "organiser1",
      role: "organiser",
    });
    await setDoc(doc(db, "groups", "group1", "members", "admin1"), {
      userId: "admin1",
      role: "admin",
    });
    await setDoc(doc(db, "groups", "group1", "members", "member1"), {
      userId: "member1",
      role: "member",
    });
    await setDoc(doc(db, "groups", "group1", "joinRequests", "requester1"), {
      userId: "requester1",
      email: "requester@example.com",
      status: "pending",
    });
  });
});

describe("groups security rules", () => {
  it("allows a user to create a group and then write their membership doc", async () => {
    const user = env.authenticatedContext("newUser").firestore();
    // Simulate what the client does
    await assertSucceeds(
      setDoc(doc(user, "groups", "newGroup"), {
        name: "My New Group",
        createdBy: "newUser",
        memberIds: ["newUser"],
      })
    );
    await assertSucceeds(
      setDoc(doc(user, "groups", "newGroup", "members", "newUser"), {
        userId: "newUser",
        role: "owner",
      })
    );
  });

  it("allows unauthenticated read failure", async () => {
    const unauth = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauth, "groups", "group1")));
  });

  it("allows non-member authenticated user read failure", async () => {
    const nonMember = env.authenticatedContext("randomUser").firestore();
    await assertFails(getDoc(doc(nonMember, "groups", "group1")));
  });

  it("allows member to read group", async () => {
    const member = env.authenticatedContext("member1").firestore();
    await assertSucceeds(getDoc(doc(member, "groups", "group1")));
  });

  it("allows normal owner updates but blocks archive metadata tampering", async () => {
    const owner = env.authenticatedContext("owner1").firestore();
    await assertSucceeds(
      updateDoc(doc(owner, "groups", "group1"), { description: "Updated normally" })
    );
    await assertFails(
      updateDoc(doc(owner, "groups", "group1"), { archivedAt: new Date() })
    );
    await assertFails(
      updateDoc(doc(owner, "groups", "group1"), { purgeAfter: new Date(Date.now() + 86_400_000) })
    );
    await assertFails(
      updateDoc(doc(owner, "groups", "group1"), { archivedBy: "owner1" })
    );
    await assertFails(
      setDoc(doc(owner, "groups", "newGroupWithArchiveMetadata"), {
        name: "Invalid",
        createdBy: "owner1",
        memberIds: ["owner1"],
        archivedAt: new Date(),
      })
    );
  });

  it("allows archived group reads but blocks group and subcollection writes", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, "groups", "group1"), {
        archivedAt: new Date(),
        purgeAfter: new Date(Date.now() + 86_400_000),
        archivedBy: "owner1",
      });
      await setDoc(doc(db, "groups", "group1", "players", "player1"), { displayName: "Player" });
      await setDoc(doc(db, "groups", "group1", "venues", "venue1"), { name: "Venue" });
    });

    const owner = env.authenticatedContext("owner1").firestore();
    await assertSucceeds(getDoc(doc(owner, "groups", "group1")));
    await assertSucceeds(getDoc(doc(owner, "groups", "group1", "members", "owner1")));
    await assertSucceeds(getDoc(doc(owner, "groups", "group1", "players", "player1")));
    await assertSucceeds(getDoc(doc(owner, "groups", "group1", "venues", "venue1")));
    await assertFails(
      updateDoc(doc(owner, "groups", "group1"), { description: "Archived update" })
    );
    await assertFails(
      setDoc(doc(owner, "groups", "group1", "members", "newMember"), {
        userId: "newMember",
        role: "member",
      })
    );
    await assertFails(
      setDoc(doc(owner, "groups", "group1", "players", "player2"), { displayName: "Player 2" })
    );
    await assertFails(
      setDoc(doc(owner, "groups", "group1", "venues", "venue1"), { name: "Changed" })
    );
  });

  it("allows owner to write members", async () => {
    const owner = env.authenticatedContext("owner1").firestore();
    await assertSucceeds(
      setDoc(doc(owner, "groups", "group1", "members", "newMember"), {
        userId: "newMember",
        role: "member",
      })
    );
  });

  it("denies owner from creating another team owner", async () => {
    const owner = env.authenticatedContext("owner1").firestore();
    await assertFails(
      setDoc(doc(owner, "groups", "group1", "members", "newOwner"), {
        userId: "newOwner",
        role: "owner",
      })
    );
  });

  it("allows super admin to read groups and assign team owners", async () => {
    const superAdmin = env.authenticatedContext("superAdmin", { email: "pankaj4bharat@gmail.com" }).firestore();
    await assertSucceeds(getDoc(doc(superAdmin, "groups", "group1")));
    await assertSucceeds(
      setDoc(doc(superAdmin, "groups", "group1", "members", "newOwner"), {
        userId: "newOwner",
        role: "owner",
      })
    );
  });

  it("allows admin to add and remove regular members", async () => {
    const admin = env.authenticatedContext("admin1").firestore();
    const memberRef = doc(admin, "groups", "group1", "members", "newMember");
    await assertSucceeds(
      setDoc(memberRef, {
        userId: "newMember",
        role: "member",
      })
    );
    await assertSucceeds(deleteDoc(memberRef));
  });

  it("denies admin from appointing another admin", async () => {
    const admin = env.authenticatedContext("admin1").firestore();
    await assertFails(
      setDoc(doc(admin, "groups", "group1", "members", "newAdmin"), {
        userId: "newAdmin",
        role: "admin",
      })
    );
  });

  it("keeps legacy organiser records at admin level", async () => {
    const organiser = env.authenticatedContext("organiser1").firestore();
    await assertSucceeds(
      setDoc(doc(organiser, "groups", "group1", "members", "newMember"), {
        userId: "newMember",
        role: "member",
      })
    );
  });

  it("allows admin to write players", async () => {
    const admin = env.authenticatedContext("admin1").firestore();
    await assertSucceeds(
      addDoc(collection(admin, "groups", "group1", "players"), {
        displayName: "New Player",
      })
    );
  });

  it("denies member to write players", async () => {
    const member = env.authenticatedContext("member1").firestore();
    await assertFails(
      addDoc(collection(member, "groups", "group1", "players"), {
        displayName: "New Player",
      })
    );
  });

  it("allows admin to write venues and courts", async () => {
    const admin = env.authenticatedContext("admin1").firestore();
    const venueRef = await assertSucceeds(
      addDoc(collection(admin, "groups", "group1", "venues"), {
        name: "New Venue",
      })
    );
    await assertSucceeds(
      addDoc(collection(admin, "groups", "group1", "venues", venueRef.id, "courts"), {
        name: "Court 1",
      })
    );
  });

  it("denies member to write venues", async () => {
    const member = env.authenticatedContext("member1").firestore();
    await assertFails(
      addDoc(collection(member, "groups", "group1", "venues"), {
        name: "New Venue",
      })
    );
  });

  it("allows admins to read join requests but hides them from members", async () => {
    const admin = env.authenticatedContext("admin1").firestore();
    const member = env.authenticatedContext("member1").firestore();
    const requestPath = "groups/group1/joinRequests/requester1";
    await assertSucceeds(getDoc(doc(admin, requestPath)));
    await assertFails(getDoc(doc(member, requestPath)));
  });

});
