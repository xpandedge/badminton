"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { watchGroupMembers } from "./groups";
import { resolveGroupRole, type GroupRole } from "@picklebaddies/domain";

export function useGroupRole(groupId: string | null): GroupRole | null {
  const { user } = useAuth();
  const [role, setRole] = useState<GroupRole | null>(null);
  useEffect(() => {
    if (!groupId || !user) { setRole(null); return; }
    return watchGroupMembers(
      groupId,
      (members) => setRole(resolveGroupRole(members, user.uid)),
      () => setRole(null),
    );
  }, [groupId, user]);
  return role;
}
