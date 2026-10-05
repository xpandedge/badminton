import s from "./landing.module.css";

const faq = [
  ["How do the rotations work?", "DuoRally aims to share court time and vary partners and opponents. Available players, skill levels and the session format affect the matchups."],
  ["Which session formats can I run?", "Choose social player rotation to mix partners, or a fixed-pair round robin to keep teams together and play through the matchups."],
  ["Do players need an account to see the board?", "Players can open a shared public board link without signing in. Organisers sign in to create and manage sessions."],
  ["What if someone arrives late or needs a break?", "Organisers can add late players and update player availability during a session. Games already in progress stay in place."],
  ["Can players follow the session from a phone or shared screen?", "Yes. The live board is designed to be shared from a phone, browser or screen at the venue."],
  ["Which sports are supported?", "DuoRally supports pickleball, badminton and other racquet-sport session formats."],
  ["What is the sample session?", "It is a fictional, interactive example so you can see the rotation and board flow before creating a real session."],
  ["Does DuoRally work offline?", "DuoRally is a web app and currently needs a connection for the live board and session updates."],
];

export function LandingFaq() {
  return <section className={s.faq} aria-labelledby="faq-title"><div><span className={s.eyebrow}>A few things to know</span><h2 id="faq-title">Before you step on court.</h2></div><div>{faq.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>;
}
