// Idempotent: ensure the 4 dummy Auth-emulator users + their users/{uid} and
// players/{uid} docs exist, so the owner can add them by email/name in the member
// picker and the leaderboard works. Requires emulator env:
// FIREBASE_AUTH_EMULATOR_HOST + FIRESTORE_EMULATOR_HOST.
//
// The users/{uid} fields mirror buildUserProfile (apps/web/src/lib/auth/profile.ts):
// searchUsers queries emailLower AND displayNameLower, so both must be present for
// seeded users to be discoverable before they have ever signed in.
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const DEV_USERS = [
  { email: "alice@dev.local", password: "devpass1!", displayName: "Alice Dev" },
  { email: "bob@dev.local",   password: "devpass1!", displayName: "Bob Dev" },
  { email: "carol@dev.local", password: "devpass1!", displayName: "Carol Dev" },
  { email: "dave@dev.local",  password: "devpass1!", displayName: "Dave Dev" },
];

async function main() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Set FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST before seeding.");
  }
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "picklebaddies";
  if (getApps().length === 0) initializeApp({ projectId });
  const auth = getAuth();
  const db = getFirestore();

  for (const u of DEV_USERS) {
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(u.email);
      uid = existing.uid;
    } catch {
      const created = await auth.createUser({
        email: u.email, password: u.password, displayName: u.displayName, emailVerified: true,
      });
      uid = created.uid;
    }

    await db.doc(`users/${uid}`).set({
      displayName: u.displayName,
      displayNameLower: u.displayName.toLowerCase(),
      email: u.email,
      emailLower: u.email.toLowerCase(),
      photoURL: null,
      // Pre-set so the first-run sport-picker modal doesn't block the dev/test UI.
      sportPreference: "pickleball",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.doc(`players/${uid}`).set({
      uid,
      displayName: u.displayName,
      isGuest: false,
      totalGames: 0, totalWins: 0, totalLosses: 0,
      totalPointsFor: 0, totalPointsAgainst: 0, totalPointDiff: 0,
      totalSitOuts: 0, totalSessions: 0, lastPlayedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`seeded ${u.email} -> ${uid}`);
  }
  console.log("dev-seed complete");
}

main().catch((e) => { console.error(e); process.exit(1); });
