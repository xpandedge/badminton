import s from "./landing.module.css";

const audiences = [
  ["Weekly organisers", "Run the regular social night without rebuilding the plan every week.", "01 / Same group, less admin"],
  ["Clubs and groups", "Give players one shared place for attendance, courts and results.", "02 / One link for everyone"],
  ["Small organised events", "Make the format and live board easy to understand while play is moving.", "03 / Clear from the sideline"],
];

export function AudienceSection() {
  return <section className={s.audience} aria-labelledby="audience-title"><div className={s.landingHeading}><span className={s.eyebrow}>Built around the way groups play</span><h2 id="audience-title">For the person who keeps the night moving.</h2></div><div className={s.audienceRows}>{audiences.map(([title, copy, label], index) => <article key={title} className={s.audienceRow}><div className={s.audienceVisual} aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><i /><i /><i /></div><div><span className={s.stepNumber}>{label}</span><h3>{title}</h3><p>{copy}</p></div><span className={s.audienceArrow} aria-hidden="true">→</span></article>)}</div></section>;
}
