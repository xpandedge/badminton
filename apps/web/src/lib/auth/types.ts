import type { User } from "firebase/auth";

export interface AuthState {
  user: User | null;
  /** true until the first onAuthStateChanged callback fires. */
  loading: boolean;
}
