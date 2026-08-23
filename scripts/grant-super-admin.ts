import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

type AppAdminRole = "owner" | "admin";

function initAdmin() {
  if (getApps().length > 0) return getApps()[0]!;

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "picklebaddies";

  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId });
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  return initializeApp({ projectId });
}

function parseArgs(): { email: string; role: AppAdminRole; revoke: boolean } {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  const roleIndex = process.argv.indexOf("--role");
  const roleArg = roleIndex >= 0 ? process.argv[roleIndex + 1] : "admin";
  const role = roleArg === "owner" || roleArg === "admin" ? roleArg : null;

  if (!email || !role) {
    throw new Error("Usage: tsx scripts/grant-super-admin.ts <email> --role owner|admin [--revoke]");
  }

  return { email, role, revoke };
}

async function main() {
  const { email, role, revoke } = parseArgs();
  const app = initAdmin();
  const auth = getAuth(app);
  const db = getFirestore(app);
  const user = await auth.getUserByEmail(email);
  const current = user.customClaims ?? {};
  const appAdminRef = db.doc(`_appAdmins/${user.uid}`);

  if (revoke) {
    const existing = await appAdminRef.get();
    const existingRole = existing.data()?.role;
    if (existingRole === "owner") {
      const activeOwners = await db.collection("_appAdmins")
        .where("role", "==", "owner")
        .where("disabled", "==", false)
        .limit(2)
        .get();
      const otherOwnerCount = activeOwners.docs.filter((doc) => doc.id !== user.uid).length;
      if (otherOwnerCount === 0) {
        throw new Error("Add another active app owner before revoking this owner.");
      }
    }
  }

  const nextClaims = revoke
    ? { ...current, superAdmin: false, appAdminRole: null }
    : { ...current, superAdmin: true, appAdminRole: role };

  await auth.setCustomUserClaims(user.uid, nextClaims);

  if (revoke) {
    await appAdminRef.set({
      uid: user.uid,
      email,
      role,
      disabled: true,
      revokedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "service-account",
      updatedReason: "CLI revoke",
    }, { merge: true });
  } else {
    await appAdminRef.set({
      uid: user.uid,
      email,
      role,
      disabled: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "service-account",
      updatedReason: "CLI grant",
    }, { merge: true });
  }

  console.log(`${revoke ? "Revoked" : `Granted ${role}`} app-admin access for ${email}.`);
  console.log("The user must sign out and sign back in before the /admin access claim is refreshed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
