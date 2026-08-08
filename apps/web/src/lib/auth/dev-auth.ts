"use client";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, type Auth } from "firebase/auth";

export interface DevUser { key: string; email: string; password: string; displayName: string; }

export const DEV_USERS: DevUser[] = [
  { key: "alice", email: "alice@dev.local", password: "devpass1!", displayName: "Alice Dev" },
  { key: "bob",   email: "bob@dev.local",   password: "devpass1!", displayName: "Bob Dev" },
  { key: "carol", email: "carol@dev.local", password: "devpass1!", displayName: "Carol Dev" },
  { key: "dave",  email: "dave@dev.local",  password: "devpass1!", displayName: "Dave Dev" },
];

export const DEV_USER_STORAGE_KEY = "pb.devUser";

/** Dev-only auth switcher is active ONLY in non-prod with emulators + the explicit flag. */
export function isDevAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_AUTH === "true" &&
    process.env.NEXT_PUBLIC_USE_EMULATORS === "true"
  );
}

/** Sign into the Auth emulator as a dummy user; create the account on first use. */
export async function signInAsDevUser(auth: Auth, user: DevUser): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, user.email, user.password);
  } catch {
    const cred = await createUserWithEmailAndPassword(auth, user.email, user.password);
    await updateProfile(cred.user, { displayName: user.displayName });
  }
}

export async function signOutDevUser(auth: Auth): Promise<void> {
  await signOut(auth);
}
