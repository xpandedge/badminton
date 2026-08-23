import "server-only";
import { notFound } from "next/navigation";
import { requireAppOwner, requireSuperAdmin, type SessionUser } from "@/server/auth/dal";
import { err, ok, type ActionResult } from "@/server/result";

export async function assertSuperAdminPage(): Promise<SessionUser> {
  try {
    return await requireSuperAdmin();
  } catch {
    notFound();
  }
}

export async function assertAppOwnerPage(): Promise<SessionUser> {
  try {
    return await requireAppOwner();
  } catch {
    notFound();
  }
}

export async function assertSuperAdminAction(): Promise<ActionResult<SessionUser>> {
  try {
    return ok(await requireSuperAdmin());
  } catch {
    return err("FORBIDDEN", "Founder support access is required");
  }
}

export async function assertAppOwnerAction(): Promise<ActionResult<SessionUser>> {
  try {
    return ok(await requireAppOwner());
  } catch {
    return err("FORBIDDEN", "App owner access is required");
  }
}
