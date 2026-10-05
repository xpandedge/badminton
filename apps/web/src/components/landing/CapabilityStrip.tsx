import s from "./landing.module.css";

const capabilities = [
  ["01", "Gather attendance", "Squad, RSVP and waitlist in one place."],
  ["02", "Set the format", "Mix players or keep fixed pairs together."],
  ["03", "Keep courts moving", "See sit-outs, late players and the next game."],
  ["04", "Share the picture", "Give everyone one public board to follow."],
  ["05", "Keep the results", "Save scores, standings and the session history."],
];

export function CapabilityStrip() {
  return <section className={s.capabilities} aria-labelledby="capabilities-title"><div className={s.landingHeading}><span className={s.eyebrow}>One organiser flow</span><h2 id="capabilities-title">Everything in its right place.</h2></div><div className={s.capabilityRail}>{capabilities.map(([number, title, copy], index) => <article key={number} className={s.capability}><span className={s.capabilityNumber}>{number}</span><span className={s.capabilityCourt} aria-hidden="true"><i className={index % 2 ? s.activeCourt : ""} /></span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>;
}
