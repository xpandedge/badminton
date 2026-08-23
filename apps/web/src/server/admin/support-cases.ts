"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { assertSuperAdminAction } from "@/server/admin/guard";
import { getAdminDb } from "@/server/firebase/admin";
import { toPlain } from "@/server/lib/serialize";
import { err, ok, type ActionResult } from "@/server/result";

export type SupportCaseStatus = "open" | "investigating" | "closed";
export type SupportCasePriority = "low" | "medium" | "high";
export type SupportCaseTargetType = "user" | "squad" | "session" | "other";

export interface SupportCaseRow {
  id: string;
  title: string;
  status: SupportCaseStatus;
  priority: SupportCasePriority;
  targetType: SupportCaseTargetType;
  targetId: string;
  note: string;
  createdByEmail: string | null;
  createdAtIso: string | null;
  updatedAtIso: string | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function parsePriority(value: string): SupportCasePriority {
  return value === "high" || value === "low" ? value : "medium";
}

function parseTargetType(value: string): SupportCaseTargetType {
  return value === "user" || value === "squad" || value === "session" ? value : "other";
}

export async function listSupportCases(status: string = "open"): Promise<ActionResult<SupportCaseRow[]>> {
  const access = await assertSuperAdminAction();
  if (!access.ok) return access;

  const db = getAdminDb();
  const query = status === "all"
    ? db.collection("_supportCases").orderBy("updatedAt", "desc").limit(50)
    : db.collection("_supportCases").where("status", "==", status).limit(50);
  const snap = await query.get().catch(() => db.collection("_supportCases").limit(50).get());
  const cases = snap.docs.map((docSnap) => {
    const data = toPlain<Record<string, unknown>>(docSnap.data());
    return {
      id: docSnap.id,
      title: text(data.title) || "Untitled case",
      status: data.status === "closed" || data.status === "investigating" ? data.status : "open",
      priority: data.priority === "high" || data.priority === "low" ? data.priority : "medium",
      targetType: parseTargetType(text(data.targetType)),
      targetId: text(data.targetId),
      note: text(data.note),
      createdByEmail: text(data.createdByEmail) || null,
      createdAtIso: toIso(data.createdAt),
      updatedAtIso: toIso(data.updatedAt),
    } satisfies SupportCaseRow;
  });

  cases.sort((a, b) => (new Date(b.updatedAtIso ?? b.createdAtIso ?? 0).getTime()) - (new Date(a.updatedAtIso ?? a.createdAtIso ?? 0).getTime()));
  return ok(cases);
}

export async function createSupportCase(input: {
  title: string;
  priority: SupportCasePriority;
  targetType: SupportCaseTargetType;
  targetId: string;
  note: string;
}): Promise<ActionResult<void>> {
  const access = await assertSuperAdminAction();
  if (!access.ok) return access;
  const title = input.title.trim();
  if (title.length < 3) return err("INVALID_ARGUMENT", "Case title is required");

  await getAdminDb().collection("_supportCases").add({
    title,
    status: "open",
    priority: input.priority,
    targetType: input.targetType,
    targetId: input.targetId.trim(),
    note: input.note.trim(),
    createdByUid: access.data.uid,
    createdByEmail: access.data.email,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  revalidatePath("/admin/cases");
  return ok(undefined);
}

export async function closeSupportCase(caseId: string): Promise<ActionResult<void>> {
  const access = await assertSuperAdminAction();
  if (!access.ok) return access;
  if (!caseId) return err("INVALID_ARGUMENT", "Case ID is required");

  await getAdminDb().doc(`_supportCases/${caseId}`).set({
    status: "closed",
    closedByUid: access.data.uid,
    closedByEmail: access.data.email,
    closedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  revalidatePath("/admin/cases");
  return ok(undefined);
}

export async function createSupportCaseFormAction(formData: FormData): Promise<void> {
  const result = await createSupportCase({
    title: String(formData.get("title") ?? ""),
    priority: parsePriority(String(formData.get("priority") ?? "")),
    targetType: parseTargetType(String(formData.get("targetType") ?? "")),
    targetId: String(formData.get("targetId") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!result.ok) throw new Error(result.message);
}

export async function closeSupportCaseFormAction(formData: FormData): Promise<void> {
  const result = await closeSupportCase(String(formData.get("caseId") ?? ""));
  if (!result.ok) throw new Error(result.message);
}
