export interface RebalanceSummaryInput {
  completedPreserved: number;
  inProgressPreserved: number;
  removed: string[];
  addedFromRound: Array<{ name: string; round: number }>;
  minGames: number;
  maxGames: number;
}

const matchWord = (n: number): string => (n === 1 ? "match" : "matches");

export function buildRebalanceSummary(i: RebalanceSummaryInput): string {
  const parts = [
    "Future rounds regenerated.",
    `${i.completedPreserved} completed ${matchWord(i.completedPreserved)} preserved.`,
    `${i.inProgressPreserved} current ${matchWord(i.inProgressPreserved)} preserved.`,
  ];
  for (const r of i.removed) parts.push(`${r} removed from future rounds.`);
  for (const a of i.addedFromRound) parts.push(`${a.name} added from Round ${a.round}.`);
  parts.push(`Expected games per active player: ${i.minGames}–${i.maxGames}.`);
  return parts.join(" ");
}
