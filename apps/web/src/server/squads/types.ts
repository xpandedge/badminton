import "server-only";

import type { DocumentReference } from "firebase-admin/firestore";
import type { GroupRole } from "@picklebaddies/domain";

export interface SquadGroupData {
  name?: string;
  nameLower?: string;
  description?: string | null;
  createdBy?: string;
  memberIds?: string[];
  inviteCode?: string;
  archivedAt?: unknown;
  purgeAfter?: unknown;
  archivedBy?: string;
  [key: string]: unknown;
}

export interface SquadAccess {
  groupRef: DocumentReference;
  group: SquadGroupData;
  role: GroupRole | null;
}
