import s from "./landing.module.css";

const pains = [
  ["01", "Who is next?", "The next game needs deciding before everyone can get back on court."],
  ["02", "Where is the plan?", "A clipboard can lose track of courts, sit-outs, and late arrivals."],
  ["03", "Is it fair?", "A good social night should give everyone a chance to play and reset."],
  ["04", "What was the score?", "Keep the fun part of the night without losing the games afterwards."],
];

export function PainSection() {
  return <section className={s.pain} aria-labelledby="pain-title">
    <div className={s.painIntro}><span className={s.eyebrow}>Sound familiar?</span><h2 id="pain-title">The night should start on court, not in a spreadsheet.</h2><p>DuoRally gives the moving parts of a social session one shared rhythm.</p></div>
    <div className={s.painList}>{pains.map(([number, title, copy]) => <article key={number} className={s.painItem}><span className={s.painNumber}>{number}</span><div><h3>{title}</h3><p>{copy}</p></div><span className={s.painMark} aria-hidden="true">↗</span></article>)}</div>
  </section>;
}
