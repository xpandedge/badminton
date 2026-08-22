import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, getFirestore, type Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, type Functions, connectFunctionsEmulator } from "firebase/functions";

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

let services: FirebaseServices | null = null;

export function getFirebaseServices(): FirebaseServices {
  if (services) return services;

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-key",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "picklebaddies",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef",
  };

  const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
  const auth = getAuth(app);
  const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
  let db: Firestore;
  try {
    // Against the emulator (esp. in headless Chromium / Playwright), the
    // auto-detect long-polling probe can mis-negotiate and trip a Firestore
    // INTERNAL ASSERTION (ID: ca9), which then surfaces as spurious
    // "Missing or insufficient permissions" errors. Forcing long-polling
    // avoids the probe. Production keeps auto-detect (best transport).
    db = initializeFirestore(app, useEmulators
      ? { experimentalForceLongPolling: true }
      : { experimentalAutoDetectLongPolling: true });
  } catch {
    db = getFirestore(app);
  }
  // Prod functions are deployed to australia-southeast1, alongside the Firestore
  // database, but the emulator serves callables at us-central1 (the built lib
  // doesn't apply the configured region under the emulator). Match the emulator
  // region so httpsCallable hits the right endpoint.
  //
  // Keep this in step with FUNCTIONS_REGION in functions/src/options.ts — a
  // mismatch here makes every callable silently unreachable in production.
  const functions = getFunctions(app, useEmulators ? "us-central1" : "australia-southeast1");

  if (useEmulators) {
    // `services` is memoised so this block runs once per app instance. Connect each
    // emulator directly; the previous `_settings.host` guard could mis-detect the
    // default production host and silently SKIP the Firestore emulator, leaving the
    // client pointed at production (tokens rejected -> "permission denied"). Calling
    // before the db is used is safe; the try/catch absorbs HMR "already started".
    if (!auth.emulatorConfig) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    }
    try {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    } catch {
      // already connected (HMR / repeat init) — ignore
    }
    try {
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    } catch {
      // already connected — ignore
    }
  }

  services = { app, auth, db, functions };
  return services;
}

export function getFirebaseApp(): FirebaseApp {
  return getFirebaseServices().app;
}
