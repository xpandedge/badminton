export interface ExistingPlayer { id: string; displayName: string; email: string | null; }
export interface CandidatePlayer { displayName: string; email: string | null; }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function findDuplicatePlayers(
  existing: ExistingPlayer[],
  candidate: CandidatePlayer,
): ExistingPlayer[] {
  const candName = norm(candidate.displayName);
  const candEmail = candidate.email ? candidate.email.trim().toLowerCase() : null;
  return existing.filter((p) => {
    const emailHit = candEmail !== null && p.email !== null && p.email.toLowerCase() === candEmail;
    const nameHit = norm(p.displayName) === candName;
    return emailHit || nameHit;
  });
}
