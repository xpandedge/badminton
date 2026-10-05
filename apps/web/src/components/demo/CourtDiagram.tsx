import type { DemoCourt } from "@/lib/demo/session-demo";
import s from "./story.module.css";

export function Player({ name, muted = false }: { name: string; muted?: boolean }) {
  return <span className={`${s.player} ${muted ? s.mutedPlayer : ""}`}><span aria-hidden="true">{name.slice(0, 1)}</span><strong>{name}</strong></span>;
}
export function CourtDiagram({ court }: { court: DemoCourt }) {
  return <div className={s.courtWrap} aria-label={`${court.label}: ${court.teamA.join(" and ")} versus ${court.teamB.join(" and ")}`}>
    <div className={s.courtLabel}><strong>{court.label}</strong><span>Playing</span></div>
    <div className={s.court}>
      <div className={s.team}>{court.teamA.map(name => <Player key={name} name={name} />)}</div>
      <span className={s.net} aria-hidden="true" />
      <div className={s.team}>{court.teamB.map(name => <Player key={name} name={name} muted />)}</div>
    </div>
  </div>;
}
