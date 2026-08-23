"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getTimestampMillis } from "@picklebaddies/domain";
import { assertSuperAdminAction } from "@/server/admin/guard";
import { writeAdminAudit } from "@/server/admin/audit";
import { getAdminDb } from "@/server/firebase/admin";
import { err, ok, type ActionResult } from "@/server/result";
import { reconcileSquadRatingsForSession } from "@/server/sessions/squad-rating";

function requireReason(reason: string): ActionResult<string> {
  const trimmed = reason.trim();
  return trimmed ? ok(trimmed) : err("INVALID_ARGUMENT", "Reason is required");
}

function errorResult(error: unknown): ActionResult<void> {
  const coded = error as { code?: string; message?: string };
  if (coded.code === "NOT_FOUND") return err("NOT_FOUND", coded.message ?? "Not found");
  if (coded.code === "FORBIDDEN") return err("FORBIDDEN", coded.message ?? "Forbidden");
  if (coded.code === "FAILED_PRECONDITION") {
    return err("FAILED_PRECONDITION", coded.message ?? "Support fix cannot be applied");
  }
  if (coded.code === "INVALID_ARGUMENT") {
    return err("INVALID_ARGUMENT", coded.message ?? "Invalid support fix");
  }
  throw error;
}

export async function adminRestoreArchivedSquad(
  groupId: string,
  reason: string,
): Promise<ActionResult<void>> {
  const actor = await assertSuperAdminAction();
  if (!actor.ok) return actor;
  const validReason = requireReason(reason);
  if (!validReason.ok) return validReason;
  if (!groupId) return err("INVALID_ARGUMENT", "Squad ID is required");

  const db = getAdminDb();
  const groupRef = db.doc(`groups/${groupId}`);

  try {
    await db.runTransaction(async (t) => {
      const snap = await t.get(groupRef);
      if (!snap.exists) throw Object.assign(new Error("Squad not found"), { code: "NOT_FOUND" });
      const group = snap.data()!;
      if (!group.archivedAt) {
        throw Object.assign(new Error("This squad is not archived"), { code: "FAILED_PRECONDITION" });
      }
      const purgeAfter = getTimestampMillis(group.purgeAfter);
      if (purgeAfter === null || purgeAfter <= Date.now()) {
        throw Object.assign(new Error("The squad restore window has expired"), { code: "FAILED_PRECONDITION" });
      }

      t.update(groupRef, {
        archivedAt: FieldValue.delete(),
        archivedBy: FieldValue.delete(),
        purgeAfter: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.data.uid,
      });
      t.set(groupRef.collection("auditLogs").doc(), {
        actorUid: actor.data.uid,
        action: "support/squad_restored",
        details: { reason: validReason.data },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    await writeAdminAudit({
      actor: actor.data,
      action: "squad/restored",
      target: { collection: "groups", id: groupId },
      reason: validReason.data,
    });
    return ok(undefined);
  } catch (error) {
    return errorResult(error);
  }
}

export async function adminTransferSquadOwnership(
  groupId: string,
  newOwnerUid: string,
  reason: string,
): Promise<ActionResult<void>> {
  const actor = await assertSuperAdminAction();
  if (!actor.ok) return actor;
  const validReason = requireReason(reason);
  if (!validReason.ok) return validReason;
  if (!groupId || !newOwnerUid) return err("INVALID_ARGUMENT", "Squad ID and new owner are required");

  const db = getAdminDb();
  const groupRef = db.doc(`groups/${groupId}`);

  try {
    const beforeAfter = await db.runTransaction(async (t) => {
      const groupSnap = await t.get(groupRef);
      if (!groupSnap.exists) throw Object.assign(new Error("Squad not found"), { code: "NOT_FOUND" });
      const group = groupSnap.data()!;
      const previousOwnerUid = typeof group.createdBy === "string" ? group.createdBy : null;
      if (previousOwnerUid === newOwnerUid) {
        throw Object.assign(new Error("This member already owns the squad"), { code: "FAILED_PRECONDITION" });
      }

      const targetRef = groupRef.collection("members").doc(newOwnerUid);
      const previousOwnerRef = previousOwnerUid ? groupRef.collection("members").doc(previousOwnerUid) : null;
      const [targetSnap, previousOwnerSnap] = await Promise.all([
        t.get(targetRef),
        previousOwnerRef ? t.get(previousOwnerRef) : Promise.resolve(null),
      ]);

      if (!targetSnap.exists) {
        throw Object.assign(new Error("Choose an existing squad member as the new owner"), { code: "NOT_FOUND" });
      }
      const targetRole = targetSnap.data()?.role;
      if (targetRole === "owner") {
        throw Object.assign(new Error("This member already owns the squad"), { code: "FAILED_PRECONDITION" });
      }

      t.update(targetRef, {
        role: "owner",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.data.uid,
      });
      if (previousOwnerRef && previousOwnerSnap?.exists) {
        t.update(previousOwnerRef, {
          role: "admin",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.data.uid,
        });
      }
      t.update(groupRef, {
        createdBy: newOwnerUid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.data.uid,
      });
      t.set(groupRef.collection("auditLogs").doc(), {
        actorUid: actor.data.uid,
        action: "support/ownership_transferred",
        details: { previousOwnerUid, newOwnerUid, reason: validReason.data },
        createdAt: FieldValue.serverTimestamp(),
      });

      return { previousOwnerUid, newOwnerUid };
    });

    await writeAdminAudit({
      actor: actor.data,
      action: "squad/ownership_transferred",
      target: { collection: "groups", id: groupId },
      reason: validReason.data,
      before: { ownerUid: beforeAfter.previousOwnerUid },
      after: { ownerUid: beforeAfter.newOwnerUid },
    });
    return ok(undefined);
  } catch (error) {
    return errorResult(error);
  }
}

export async function adminRecoverSessionStatus(
  sessionId: string,
  statusTo: "active" | "paused" | "completed",
  reason: string,
): Promise<ActionResult<void>> {
  const actor = await assertSuperAdminAction();
  if (!actor.ok) return actor;
  const validReason = requireReason(reason);
  if (!validReason.ok) return validReason;
  if (!sessionId) return err("INVALID_ARGUMENT", "Session ID is required");

  const db = getAdminDb();
  const sessionRef = db.doc(`sessions/${sessionId}`);

  try {
    if (statusTo === "completed") {
      await reconcileSquadRatingsForSession(db, sessionId);
    }

    const beforeAfter = await db.runTransaction(async (t) => {
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;
      const statusFrom = String(session.status ?? "");
      if (statusFrom === "cancelled") {
        throw Object.assign(new Error("Cancelled sessions cannot be recovered here"), { code: "FAILED_PRECONDITION" });
      }

      const allowed =
        (statusTo === "active" && ["draft", "scheduled", "paused"].includes(statusFrom)) ||
        (statusTo === "paused" && statusFrom === "active") ||
        (statusTo === "completed" && ["active", "paused"].includes(statusFrom));
      if (!allowed) {
        throw Object.assign(new Error(`Cannot recover session from ${statusFrom || "unknown"} to ${statusTo}`), {
          code: "FAILED_PRECONDITION",
        });
      }

      if (statusTo === "active" && statusFrom !== "paused") {
        const matchesSnap = await t.get(sessionRef.collection("matches").limit(1));
        if (matchesSnap.empty) {
          throw Object.assign(new Error("Generate matches before recovering the session to active"), {
            code: "FAILED_PRECONDITION",
          });
        }
      }

      t.update(sessionRef, {
        status: statusTo,
        ...(statusTo === "active" && statusFrom !== "paused" ? { startedAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.data.uid,
      });
      t.set(sessionRef.collection("auditLogs").doc(), {
        actorUid: actor.data.uid,
        action: "support/status_recovered",
        details: { statusFrom, statusTo, reason: validReason.data },
        createdAt: FieldValue.serverTimestamp(),
      });

      return { statusFrom, statusTo };
    });

    await writeAdminAudit({
      actor: actor.data,
      action: "session/status_recovered",
      target: { collection: "sessions", id: sessionId },
      reason: validReason.data,
      before: { status: beforeAfter.statusFrom },
      after: { status: beforeAfter.statusTo },
    });
    return ok(undefined);
  } catch (error) {
    return errorResult(error);
  }
}

export async function adminRestoreArchivedSquadFormAction(formData: FormData): Promise<void> {
  const result = await adminRestoreArchivedSquad(
    String(formData.get("groupId") ?? ""),
    String(formData.get("reason") ?? ""),
  );
  if (!result.ok) throw new Error(result.message);
}

export async function adminTransferSquadOwnershipFormAction(formData: FormData): Promise<void> {
  const result = await adminTransferSquadOwnership(
    String(formData.get("groupId") ?? ""),
    String(formData.get("newOwnerUid") ?? ""),
    String(formData.get("reason") ?? ""),
  );
  if (!result.ok) throw new Error(result.message);
}

export async function adminRecoverSessionStatusFormAction(formData: FormData): Promise<void> {
  const statusTo = String(formData.get("statusTo") ?? "");
  if (statusTo !== "active" && statusTo !== "paused" && statusTo !== "completed") {
    throw new Error("Choose a supported recovery status");
  }
  const result = await adminRecoverSessionStatus(
    String(formData.get("sessionId") ?? ""),
    statusTo,
    String(formData.get("reason") ?? ""),
  );
  if (!result.ok) throw new Error(result.message);
}
