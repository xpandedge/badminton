import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseServices } from "@/lib/firebase/client";

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
): Promise<UserCredential> {
  const { auth } = getFirebaseServices();
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebaseServices();
  await signOut(auth);
}
