"use client";
import { useState } from "react";
import { DEMO_SNAPSHOTS, type DemoStage } from "@/lib/demo/session-demo";
import { CourtDiagram, Player } from "./CourtDiagram";
import s from "./story.module.css";
const stages: { id: DemoStage; label: string }[] = [
  { id: "playing", label: "Playing now" },
  { id: "court-finished", label: "A court finishes" },
  { id: "late-arrival", label: "Someone arrives late" },
];
export function SessionDemo() {
  const [stage, setStage] = useState<DemoStage>("playing");
  const sample = DEMO_SNAPSHOTS[stage];
  return <div className={s.demo}>
    <div className={s.demoTop}><span className={s.eyebrow}>A night on court</span><span className={s.example}>Fictional example</span></div>
    <div className={s.stageControls} role="group" aria-label="Explore a session">
      {stages.map((item, i) => <button key={item.id} type="button" aria-pressed={stage === item.id} onClick={() => setStage(item.id)}><span aria-hidden="true">0{i + 1}</span>{item.label}</button>)}
    </div>
    <div className={s.courts}>{sample.courts.map(court => <CourtDiagram key={court.id} court={court} />)}</div>
    <div className={s.bench}><div><span className={s.eyebrow}>Off court</span><p>Waiting & resting</p></div><div className={s.benchPlayers}>{sample.waiting.map(name => <Player key={name} name={name} />)}</div></div>
    <p className={s.explanation} aria-live="polite" aria-atomic="true">{sample.explanation}</p>
    <p className={s.sampleNote}>One possible rotation, shown with sample players.</p>
  </div>;
}
