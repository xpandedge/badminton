import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseServices } from "@/lib/firebase/client";
import { normalizePlayerDisplayName } from "@/lib/auth/display-name";

export async function signInWithGoogle(): Promise<UserCredential> {
  const { auth } = getFirebaseServices();
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<UserCredential> {
  const { auth } = getFirebaseServices();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<UserCredential> {
  const { auth } = getFirebaseServices();
  const chosenName = normalizePlayerDisplayName(displayName);
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: chosenName });
  return credential;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { auth } = getFirebaseServices();
  await sendPasswordResetEmail(auth, email);
}

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebaseServices();
  await signOut(auth);
}
