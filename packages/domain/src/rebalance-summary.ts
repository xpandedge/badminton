export interface RebalanceSummaryInput {
  completedPreserved: number;
  /** Not-yet-started matches cancelled and re-picked against the current idle pool. */
  cancelled: number;
  /** New matches assigned to freed courts as a result of the rebalance. */
  regenerated: number;
  removed: string[];
}

const matchWord = (n: number): string => (n === 1 ? "match" : "matches");

export function buildRebalanceSummary(i: RebalanceSummaryInput): string {
  const parts = [
    `${i.completedPreserved} completed ${matchWord(i.completedPreserved)} preserved.`,
    `${i.cancelled} not-yet-started ${matchWord(i.cancelled)} re-picked.`,
    `${i.regenerated} new ${matchWord(i.regenerated)} assigned.`,
  ];
  for (const r of i.removed) parts.push(`${r} removed from the session.`);
  return parts.join(" ");
}
