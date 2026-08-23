"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import type { AppAdminRole } from "@picklebaddies/domain";
import { writeAdminAudit } from "@/server/admin/audit";
import { getAdminAuth, getAdminDb } from "@/server/firebase/admin";
import { requireAppOwner, requireSuperAdmin } from "@/server/auth/dal";
import { err, ok, type ActionResult } from "@/server/result";

export type { AppAdminRole } from "@picklebaddies/domain";

export interface AppAdminRecord {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  role: AppAdminRole;
  createdAtIso: string | null;
  updatedAtIso: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseRole(role: FormDataEntryValue | null): AppAdminRole | null {
  return role === "owner" || role === "admin" ? role : null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function listAppAdmins(): Promise<ActionResult<AppAdminRecord[]>> {
  try {
    await requireSuperAdmin();
  } catch {
    return err("FORBIDDEN", "Founder support access is required");
  }

  const db = getAdminDb();
  const auth = getAdminAuth();
  const snap = await db.collection("_appAdmins")
    .where("disabled", "==", false)
    .limit(50)
    .get();

  const records = await Promise.all(snap.docs.map(async (docSnap) => {
    const data = docSnap.data();
    const role = data.role === "owner" ? "owner" : "admin";
    const authUser = await auth.getUser(docSnap.id).catch(() => null);
    return {
      uid: docSnap.id,
      email: authUser?.email ?? (typeof data.email === "string" ? data.email : null),
      displayName: authUser?.displayName ?? null,
      disabled: authUser?.disabled ?? Boolean(data.disabled),
      role,
      createdAtIso: toIso(data.createdAt),
      updatedAtIso: toIso(data.updatedAt),
    } satisfies AppAdminRecord;
  }));

  records.sort((a, b) => (a.email ?? a.uid).localeCompare(b.email ?? b.uid));
  return ok(records);
}

async function countOtherActiveOwners(targetUid: string): Promise<number> {
  const snap = await getAdminDb().collection("_appAdmins")
    .where("role", "==", "owner")
    .where("disabled", "==", false)
    .limit(2)
    .get();

  return snap.docs.filter((docSnap) => docSnap.id !== targetUid).length;
}

export async function grantAppAdminByEmail(
  email: string,
  role: AppAdminRole,
  reason: string,
): Promise<ActionResult<void>> {
  const normalizedEmail = normalizeEmail(email);
  const trimmedReason = reason.trim();
  if (!normalizedEmail) return err("INVALID_ARGUMENT", "Email is required");
  if (!trimmedReason) return err("INVALID_ARGUMENT", "Reason is required");
  if (role !== "owner" && role !== "admin") return err("INVALID_ARGUMENT", "Choose owner or admin access");

  let actor;
  try {
    actor = await requireAppOwner();
  } catch {
    return err("FORBIDDEN", "Only app owners can manage app admins");
  }

  const auth = getAdminAuth();
  const db = getAdminDb();
  const target = await auth.getUserByEmail(normalizedEmail).catch(() => null);
  if (!target) return err("NOT_FOUND", "User must sign in before app-admin access can be granted");

  const currentClaims = target.customClaims ?? {};
  await auth.setCustomUserClaims(target.uid, {
    ...currentClaims,
    superAdmin: true,
    appAdminRole: role,
  });

  const ref = db.doc(`_appAdmins/${target.uid}`);
  const existing = await ref.get();
  await ref.set({
    uid: target.uid,
    email: normalizedEmail,
    role,
    disabled: false,
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid }),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
    updatedReason: trimmedReason,
  }, { merge: true });

  await writeAdminAudit({
    actor,
    action: "app_admin/granted",
    target: { collection: "_appAdmins", id: target.uid },
    reason: trimmedReason,
    after: { email: normalizedEmail, role },
  });

  revalidatePath("/admin/app-admins");
  return ok(undefined);
}

export async function revokeAppAdminByEmail(
  email: string,
  reason: string,
): Promise<ActionResult<void>> {
  const normalizedEmail = normalizeEmail(email);
  const trimmedReason = reason.trim();
  if (!normalizedEmail) return err("INVALID_ARGUMENT", "Email is required");
  if (!trimmedReason) return err("INVALID_ARGUMENT", "Reason is required");

  let actor;
  try {
    actor = await requireAppOwner();
  } catch {
    return err("FORBIDDEN", "Only app owners can manage app admins");
  }

  const auth = getAdminAuth();
  const db = getAdminDb();
  const target = await auth.getUserByEmail(normalizedEmail).catch(() => null);
  if (!target) return err("NOT_FOUND", "App admin not found");

  const ref = db.doc(`_appAdmins/${target.uid}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.disabled === true) {
    return err("NOT_FOUND", "App admin not found");
  }

  const role = snap.data()?.role === "owner" ? "owner" : "admin";
  if (role === "owner" && await countOtherActiveOwners(target.uid) === 0) {
    return err("FAILED_PRECONDITION", "Add another app owner before removing this one");
  }

  const currentClaims = target.customClaims ?? {};
  await auth.setCustomUserClaims(target.uid, {
    ...currentClaims,
    superAdmin: false,
    appAdminRole: null,
  });

  await ref.set({
    disabled: true,
    revokedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
    updatedReason: trimmedReason,
  }, { merge: true });

  await writeAdminAudit({
    actor,
    action: "app_admin/revoked",
    target: { collection: "_appAdmins", id: target.uid },
    reason: trimmedReason,
    before: { email: normalizedEmail, role },
  });

  revalidatePath("/admin/app-admins");
  return ok(undefined);
}

export async function grantAppAdminFormAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const role = parseRole(formData.get("role"));
  if (!role) throw new Error("Choose owner or admin access");
  const result = await grantAppAdminByEmail(email, role, reason);
  if (!result.ok) throw new Error(result.message);
}

export async function revokeAppAdminFormAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await revokeAppAdminByEmail(email, reason);
  if (!result.ok) throw new Error(result.message);
}
