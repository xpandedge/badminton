// apps/web/src/lib/quick-sessions/storage.ts
import type { QuickSession } from "./types";

const PREFIX = "qs:";

export function saveSessionToStorage(session: QuickSession): void {
  try {
    localStorage.setItem(PREFIX + session.id, JSON.stringify(session));
  } catch {
    // Storage full or unavailable — fail silently, Firestore is source of truth
  }
}

export function loadSessionFromStorage(sessionId: string): QuickSession | null {
  try {
    const raw = localStorage.getItem(PREFIX + sessionId);
    if (!raw) return null;
    return JSON.parse(raw) as QuickSession;
  } catch {
    return null;
  }
}

export function updateSessionInStorage(sessionId: string, updater: (s: QuickSession) => QuickSession): void {
  const current = loadSessionFromStorage(sessionId);
  if (!current) return;
  saveSessionToStorage(updater(current));
}
