import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";

export const metadata: Metadata = {
  title: "Run Social Sessions, Round Robins and Tournaments",
  description:
    "DuoRally helps organisers run social court sessions, fixed-pair round robins, small tournament-style play, live boards, scoring, and results.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "DuoRally | Run Social Sessions, Round Robins and Tournaments",
    description:
      "Run social court sessions, round robins, and small tournament-style play with courts, players, live boards, scores, and results in one app.",
    url: "/",
  },
};

const navLinks = [
  { href: "/racquet-sports-rotation-app", label: "Racquet sports" },
  { href: "/badminton-doubles-rotation-app", label: "Badminton" },
  { href: "/pickleball-rotation-app", label: "Pickleball" },
  { href: "/brisbane-pickleball-badminton-court-bookings", label: "Brisbane courts" },
];

const moments = [
  {
    label: "Before play",
    title: "Know who is coming",
    body: "Create a squad, invite players, confirm numbers, choose courts, and set the session format before everyone arrives.",
  },
  {
    label: "During play",
    title: "Keep games moving",
    body: "Start the session, see who is on each court, manage sit-outs, swap players when life happens, and send the next group on quickly.",
  },
  {
    label: "After play",
    title: "Leave with results",
    body: "Scores become standings, session history, and player records so your group has more than a forgotten whiteboard photo.",
  },
];

const formats = [
  {
    title: "Social sessions",
    body: "Great for club nights and casual groups where players rotate through doubles games across one or more courts.",
  },
  {
    title: "Round robins",
    body: "Set fixed pairs, generate the match list, score each game, and keep a team leaderboard visible as the event runs.",
  },
  {
    title: "Tournament-style play",
    body: "Run small organised events where the priority is clear courts, quick scoring, and simple standings, not a clipboard full of manual updates.",
  },
];

const boardRows = [
  { court: "Court 1", match: "Mia + Leo vs Priya + Noah", state: "Playing now" },
  { court: "Court 2", match: "Ava + Sam vs Kim + Jordan", state: "Next to score" },
  { court: "Court 3", match: "Oli + Chen vs Ruby + Max", state: "Up next" },
];

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "DuoRally",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web",
  url: "https://duorally.com.au/",
  description:
    "A web app for running social court sessions, fixed-pair round robins, tournament-style play, live boards, scoring, and results for tennis, badminton, pickleball, squash, table tennis, and similar sports.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "AUD",
  },
};

export default function Home() {
  return (
    <main className="pb-public-shell pb-home-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <nav className="pb-public-nav" aria-label="DuoRally public navigation">
        <Link href="/" className="pb-public-brand" aria-label="DuoRally home">
          <Logo variant="full" theme="light" size={42} showKicker />
        </Link>
        <div className="pb-public-nav__links">
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <section className="pb-home-hero" aria-labelledby="home-hero-title">
        <Image
          className="pb-home-hero__image"
          src="/duorally-courtside-session.png"
          alt="Social racquet-sport players checking their next games beside indoor courts"
          width={1792}
          height={1024}
          priority
        />
        <div className="pb-home-hero__shade" aria-hidden="true" />
        <div className="pb-home-hero__copy">
          <span className="pb-kicker">DuoRally</span>
          <h1 id="home-hero-title">Run social sessions, round robins, and tournaments from one courtside app.</h1>
          <p>
            Give organisers one place to invite players, start games, share the live board, enter scores,
            and keep the whole event moving.
          </p>
          <div className="pb-public-actions">
            <Link className="pb-btn pb-btn-volt" href="/sign-in">
              Start a session
            </Link>
            <Link className="pb-public-text-link" href="/racquet-sports-rotation-app">
              See supported sports
            </Link>
          </div>
        </div>
        <div className="pb-home-session-panel" aria-label="Example live session board">
          <span className="pb-home-panel-label">Live board</span>
          {boardRows.map((row) => (
            <div className="pb-home-board-row" key={row.court}>
              <span>{row.court}</span>
              <strong>{row.match}</strong>
              <em>{row.state}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-home-intro" aria-labelledby="home-context">
        <span className="pb-mono-label">Bigger than a fixture list</span>
        <h2 id="home-context">DuoRally gives every court night a simple rhythm.</h2>
        <p>
          Whether it is weekly social play, a club round robin, or a small tournament-style event, the hard part is
          keeping players, courts, scores, and standings clear while people are arriving, resting, swapping, and playing.
        </p>
      </section>

      <section className="pb-public-section" aria-labelledby="home-flow">
        <div className="pb-public-section__heading">
          <span className="pb-mono-label">How the night runs</span>
          <h2 id="home-flow">Plan the session, run the courts, keep the results.</h2>
        </div>
        <div className="pb-home-moment-grid">
          {moments.map((item) => (
            <article className="pb-home-moment" key={item.label}>
              <span>{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pb-home-feature-band" aria-labelledby="home-live-board">
        <div>
          <span className="pb-mono-label">For players too</span>
          <h2 id="home-live-board">The live board keeps everyone oriented.</h2>
          <p>
            Players can open a shared board from their phone to see where they are playing, who is waiting,
            what has been scored, and how the standings are shaping up.
          </p>
        </div>
        <div className="pb-home-phone" aria-label="Example player phone view">
          <div>
            <span>Up next</span>
            <strong>Court 2</strong>
            <p>Ava + Sam vs Kim + Jordan</p>
          </div>
          <div>
            <span>Standings</span>
            <strong>10 players</strong>
            <p>Names, games, wins, and score difference stay visible.</p>
          </div>
        </div>
      </section>

      <section className="pb-public-section pb-home-formats" aria-labelledby="home-formats">
        <div className="pb-public-section__heading">
          <span className="pb-mono-label">Session formats</span>
          <h2 id="home-formats">Use one app for the ways your group already plays.</h2>
        </div>
        <div className="pb-home-format-list">
          {formats.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pb-public-section pb-public-two-up" aria-labelledby="sports">
        <div>
          <span className="pb-mono-label">Court sports</span>
          <h2 id="sports">Built for regular groups, clubs, and organisers.</h2>
          <p>
            Use DuoRally for pickleball, badminton, tennis, squash, table tennis, and similar social court sports
            where players need clear games, simple scoring, and a record of the night.
          </p>
        </div>
        <div className="pb-public-link-list">
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
              <span aria-hidden="true">-&gt;</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="pb-home-final" aria-labelledby="home-final">
        <span className="pb-kicker">Ready when the courts are</span>
        <h2 id="home-final">Start the next session with less chasing and more playing.</h2>
        <Link className="pb-btn pb-btn-volt" href="/sign-in">
          Start a session
        </Link>
      </section>

      <footer className="pb-public-footer">
        <span>Xpandedge Pty Ltd</span>
        <LegalLinks compact />
      </footer>
    </main>
  );
}
