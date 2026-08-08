/**
 * Emulator seed script — PRD §30/§31.
 * Creates a realistic demo: 1 group, 12 players (varied skill), 1 venue with 3 courts,
 * and a draft session ready to generate.
 *
 * Usage:
 *   pnpm emulators          # start the emulators first
 *   pnpm seed               # in another terminal
 *
 * Idempotent: fixed document IDs mean re-running is safe.
 */
import * as admin from "firebase-admin";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

admin.initializeApp({ projectId: "picklebaddies" });
const db = admin.firestore();
const auth = admin.auth();

const OWNER_UID = "seed-owner-001";
const GROUP_ID = "seed-group-001";
const VENUE_ID = "seed-venue-001";
const SESSION_ID = "seed-session-001";

const PLAYERS = [
  { id: "seed-p01", name: "Alice Chen",     skill: "advanced" },
  { id: "seed-p02", name: "Bob Patel",      skill: "intermediate" },
  { id: "seed-p03", name: "Carlos Ruiz",    skill: "intermediate" },
  { id: "seed-p04", name: "Diana Lee",      skill: "advanced" },
  { id: "seed-p05", name: "Ethan Brown",    skill: "beginner" },
  { id: "seed-p06", name: "Fatima Hassan",  skill: "intermediate" },
  { id: "seed-p07", name: "George Smith",   skill: "beginner" },
  { id: "seed-p08", name: "Hannah Wilson",  skill: "advanced" },
  { id: "seed-p09", name: "Ivan Kozlov",    skill: "intermediate" },
  { id: "seed-p10", name: "Jane Moore",     skill: "intermediate" },
  { id: "seed-p11", name: "Kai Tanaka",     skill: "beginner" },
  { id: "seed-p12", name: "Lena Kumar",     skill: "advanced" },
];

const COURTS = [
  { id: "seed-c01", name: "Court 1", courtNumber: 1 },
  { id: "seed-c02", name: "Court 2", courtNumber: 2 },
  { id: "seed-c03", name: "Court 3", courtNumber: 3 },
];

async function seed() {
  console.log("🌱  Seeding demo data into emulator…");

  // 1. Create owner user
  try {
    await auth.createUser({ uid: OWNER_UID, email: "owner@demo.test", displayName: "Demo Owner" });
    console.log("  ✓ Created owner user");
  } catch {
    console.log("  ↩ Owner user already exists");
  }

  const batch1 = db.batch();

  // 2. Group
  batch1.set(db.doc(`groups/${GROUP_ID}`), {
    name: "PickleBaddies Demo Club",
    createdBy: OWNER_UID,
    sport: "badminton",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch1.set(db.doc(`groups/${GROUP_ID}/members/${OWNER_UID}`), { role: "owner" });

  // 3. Group players
  for (const p of PLAYERS) {
    batch1.set(db.doc(`groups/${GROUP_ID}/players/${p.id}`), {
      displayName: p.name,
      skillLevel: p.skill,
      addedBy: OWNER_UID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // 4. Venue + courts
  batch1.set(db.doc(`groups/${GROUP_ID}/venues/${VENUE_ID}`), {
    name: "Community Sports Hall",
    address: "1 Sports Lane",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  for (const c of COURTS) {
    batch1.set(db.doc(`groups/${GROUP_ID}/venues/${VENUE_ID}/courts/${c.id}`), {
      name: c.name,
      courtNumber: c.courtNumber,
      isActive: true,
    });
  }

  await batch1.commit();
  console.log("  ✓ Group, players, venue, courts created");

  // 5. Draft session with courts snapshot
  const courts = COURTS.map((c) => ({
    courtId: c.id,
    name: c.name,
    courtNumber: c.courtNumber,
    isActive: true,
  }));

  await db.doc(`sessions/${SESSION_ID}`).set({
    groupId: GROUP_ID,
    venueId: VENUE_ID,
    name: "Saturday Morning Demo Session",
    sport: "badminton",
    status: "draft",
    startsAt: new Date(Date.now() + 3600_000),
    durationMinutes: 90,
    estimatedGameMinutes: 15,
    scoringMode: "winner_only",
    courts,
    courtCount: courts.length,
    createdBy: OWNER_UID,
    currentRoundNumber: 0,
    joinCode: "DEMO01",
    joinEnabled: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 6. Add all 12 players to the session as active
  const batch2 = db.batch();
  for (const p of PLAYERS) {
    batch2.set(db.doc(`sessions/${SESSION_ID}/players/${p.id}`), {
      playerId: p.id,
      displayName: p.name,
      skillLevel: p.skill,
      status: "active",
      participantType: "registered_user",
      gamesPlayed: 0, wins: 0, losses: 0,
      pointsFor: 0, pointsAgainst: 0, sitOutCount: 0,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch2.commit();
  console.log("  ✓ Session created with 12 active players");

  console.log("\n✅ Seed complete!");
  console.log(`   Group:   ${GROUP_ID}`);
  console.log(`   Session: ${SESSION_ID}  (status: draft — ready to generate)`);
  console.log(`   Join code: DEMO01`);
  console.log(`\n   To try it: open http://localhost:3000, sign in as ${OWNER_UID}`);
  console.log(`   Then navigate to the session and click "Generate Schedule".`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
