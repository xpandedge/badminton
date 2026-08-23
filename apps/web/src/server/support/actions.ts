"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import { requireSession } from "@/server/auth/dal";
import { getAdminDb } from "@/server/firebase/admin";
import { checkRateLimit, err, ok, type ActionResult } from "@/server/result";

const SUPPORT_RECIPIENT = "sanju36@gmail.com";
const SUBJECT_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 4_000;

export interface SupportRequestInput {
  subject: string;
  message: string;
  honeypot?: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : null;
}

async function createSupportCase(input: {
  uid: string;
  email: string | null;
  subject: string;
  message: string;
}): Promise<string> {
  const ref = getAdminDb().collection("_supportCases").doc();
  await ref.set({
    title: input.subject,
    status: "open",
    priority: "medium",
    targetType: "user",
    targetId: input.uid,
    note: input.message,
    source: "help_form",
    requesterUid: input.uid,
    requesterEmail: input.email,
    createdByUid: input.uid,
    createdByEmail: input.email,
    emailStatus: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function submitSupportRequest(
  input: SupportRequestInput,
): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "You must be signed in to contact support.");

  // Silently accept the honeypot so automated submissions do not learn the field worked.
  if (text(input.honeypot)) return ok(undefined);

  const subject = text(input.subject);
  const message = text(input.message);
  if (subject.length < 3 || subject.length > SUBJECT_MAX_LENGTH) {
    return err("INVALID_ARGUMENT", "Enter a subject between 3 and 120 characters.");
  }
  if (message.length < 10 || message.length > MESSAGE_MAX_LENGTH) {
    return err("INVALID_ARGUMENT", "Enter a message between 10 and 4,000 characters.");
  }

  if (!session.superAdmin) {
    try {
      await checkRateLimit(`support:${session.uid}`, { maxRequests: 3, windowMs: 60 * 60 * 1_000 });
    } catch (error) {
      if (errorCode(error) === "RESOURCE_EXHAUSTED") {
        return err("RESOURCE_EXHAUSTED", "Please wait before sending another support request.");
      }
      console.error("Support request rate limit failed", error);
      return err("INTERNAL", "Support is temporarily unavailable. Please try again later.");
    }
  }

  let caseId: string;
  try {
    caseId = await createSupportCase({
      uid: session.uid,
      email: session.email,
      subject,
      message,
    });
  } catch (error) {
    console.error("Support case creation failed", error);
    return err("INTERNAL", "Support is temporarily unavailable. Please try again later.");
  }

  const smtpUser = process.env.SUPPORT_SMTP_USER?.trim();
  const smtpPassword = process.env.SUPPORT_SMTP_APP_PASSWORD?.trim();
  if (!smtpUser || !smtpPassword) {
    console.error("Support email is not configured; support case was created", { caseId });
    await getAdminDb().collection("_supportCases").doc(caseId).set({
      emailStatus: "skipped",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch((error) => console.error("Support case email status update failed", error));
    return ok(undefined);
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPassword },
  });

  try {
    await transporter.sendMail({
      from: smtpUser,
      to: SUPPORT_RECIPIENT,
      replyTo: session.email ?? undefined,
      subject: `[DuoRally Support] ${subject}`,
      text: [
        `From: ${session.email ?? "No email on account"}`,
        `User ID: ${session.uid}`,
        `Case ID: ${caseId}`,
        "",
        message,
      ].join("\n"),
    });
  } catch (error) {
    console.error("Support request email failed", error);
    await getAdminDb().collection("_supportCases").doc(caseId).set({
      emailStatus: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch((statusError) => console.error("Support case email status update failed", statusError));
    return ok(undefined);
  }

  await getAdminDb().collection("_supportCases").doc(caseId).set({
    emailStatus: "sent",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }).catch((error) => console.error("Support case email status update failed", error));

  return ok(undefined);
}
