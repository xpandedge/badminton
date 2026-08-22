import "server-only";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;

  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0]!;
    return _app;
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "picklebaddies";

  // When running against emulators, credentials are not needed.
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    _app = initializeApp({ projectId });
    return _app;
  }

  // On Cloud Run (which is where Firebase Hosting runs the Next.js server) the
  // platform supplies credentials for the project the service belongs to, so
  // Application Default Credentials are both sufficient and authoritative.
  //
  // This deliberately takes priority over FIREBASE_ADMIN_* env vars. A stray
  // .env.local can end up inside the deployed bundle, and Next loads it at
  // runtime — which previously pointed production at a developer's project.
  // Never let a packaged file decide which database production writes to.
  //
  // `K_SERVICE` is set by Cloud Run on every revision; `FUNCTION_TARGET` covers
  // the Cloud Functions runtime.
  if (process.env.K_SERVICE || process.env.FUNCTION_TARGET) {
    _app = initializeApp();
    return _app;
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY. " +
        "Set them in .env.local or use FIRESTORE_EMULATOR_HOST for local dev."
    );
  }

  _app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return _app;
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
