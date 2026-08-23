"use server";
import "server-only";
import { verifySession } from "@/server/auth/dal";
import { ok, type ActionResult } from "@/server/result";

export async function getFounderSupportAccessAction(): Promise<ActionResult<{ canAccess: boolean; role: "owner" | "admin" | null }>> {
  const session = await verifySession();
  return ok({
    canAccess: session?.superAdmin === true,
    role: session?.appAdminRole ?? null,
  });
}
