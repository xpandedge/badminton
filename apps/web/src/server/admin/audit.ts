import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { SessionUser } from "@/server/auth/dal";
import { getAdminDb } from "@/server/firebase/admin";

export type AdminAuditAction =
  | "app_admin/granted"
  | "app_admin/revoked"
  | "squad/restored"
  | "squad/ownership_transferred"
  | "session/status_recovered";

export async function writeAdminAudit(input: {
  actor: Pick<SessionUser, "uid" | "email">;
  action: AdminAuditAction;
  target: { collection: string; id: string };
  reason: string;
  before?: unknown;
  after?: unknown;
  details?: Record<string, unknown>;
}): Promise<void> {
  await getAdminDb().collection("_adminAuditLogs").add({
    actorUid: input.actor.uid,
    actorEmail: input.actor.email,
    action: input.action,
    target: input.target,
    reason: input.reason.trim(),
    before: input.before ?? null,
    after: input.after ?? null,
    details: input.details ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });
}
