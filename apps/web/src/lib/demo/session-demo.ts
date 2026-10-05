export type DemoStage = "playing" | "court-finished" | "late-arrival";
export interface DemoCourt {
  id: string;
  label: string;
  teamA: readonly [string, string];
  teamB: readonly [string, string];
}
export interface DemoSnapshot {
  courts: readonly DemoCourt[];
  waiting: readonly string[];
  explanation: string;
}
const courts: readonly DemoCourt[] = [
  { id: "one", label: "Court 1", teamA: ["Mia", "Leo"], teamB: ["Priya", "Noah"] },
  { id: "two", label: "Court 2", teamA: ["Ava", "Sam"], teamB: ["Kim", "Jordan"] },
];
export const DEMO_SNAPSHOTS: Readonly<Record<DemoStage, DemoSnapshot>> = {
  playing: { courts, waiting: ["Oli", "Chen"], explanation: "Eight on court. Two taking a breather. Everyone has a place." },
  "court-finished": {
    courts: [{ id: "one", label: "Court 1", teamA: ["Oli", "Mia"], teamB: ["Chen", "Priya"] }, courts[1]!],
    waiting: ["Leo", "Noah"],
    explanation: "Oli and Chen step onto Court 1. Leo and Noah rest. Court 2 keeps playing.",
  },
  "late-arrival": { courts, waiting: ["Oli", "Chen", "Ruby"], explanation: "Ruby joins the waiting players. Games already on court carry on undisturbed." },
};
