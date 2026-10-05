"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canManageSessionPlayers } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";
import { changeCourts, type CourtChange } from "@/lib/sessions/courts";
import { requireActiveSessionSquad } from "./actions";

export async function saveLiveCourt(sessionId: string, change: CourtChange): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");
  const db = getAdminDb();
  const squad = await requireActiveSessionSquad(db, sessionId, user.uid);
  if (!squad.ok) return squad;
  try {
    return await db.runTransaction(async t => {
      const ref = db.doc(`sessions/${sessionId}`);
      const snap = await t.get(ref);
      if (!snap.exists) return err("NOT_FOUND", "Session not found");
      const session = snap.data()!;
      const member = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      if (!canManageSessionPlayers(member.data()?.role ?? null)) return err("FORBIDDEN", "Only group owners and admins can change courts");
      if (!["active", "paused"].includes(session.status)) return err("FAILED_PRECONDITION", "Courts can only be changed in a live or paused session");
      let courts;
      try { courts = changeCourts(session.courts ?? [], change, db.collection("sessions").doc().id); }
      catch (e) { return err("INVALID_ARGUMENT", e instanceof Error ? e.message : "Invalid court details"); }
      t.update(ref, { courts, courtCount: courts.filter(c => c.isActive).length, updatedAt: FieldValue.serverTimestamp() });
      t.set(ref.collection("auditLogs").doc(), { actorUid: user.uid, action: change.courtId ? "court/updated" : "court/added", details: change, createdAt: FieldValue.serverTimestamp() });
      return ok(undefined);
    });
  } catch (e) {
    console.error("saveLiveCourt error:", e);
    return err("INTERNAL", "Could not save court. Please try again.");
  }
}
