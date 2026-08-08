import type { SkillLevel } from "@picklebaddies/domain";

export interface NewPlayerInput {
  displayName: string; email?: string | null; phone?: string | null;
  skillLevel?: SkillLevel; isGuest?: boolean;
}
