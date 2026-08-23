import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Racquet Sports Rotation App",
  description:
    "Use DuoRally to run fair social rotations for tennis, badminton, pickleball, squash, table tennis, and similar court sports.",
  alternates: { canonical: "/racquet-sports-rotation-app" },
  openGraph: {
    title: "Racquet Sports Rotation App | DuoRally",
    description:
      "Create fair player rotations, manage sit-outs, run courts, and track scores for social racquet sport sessions.",
    url: "/racquet-sports-rotation-app",
  },
};

const sports = ["Tennis", "Badminton", "Pickleball", "Squash", "Table tennis", "Padel", "Social groups"];

const features = [
  {
    title: "Rotate players fairly",
    body: "Balance who plays, who waits, and who gets paired next across one or more courts.",
  },
  {
    title: "Adapt during the session",
    body: "Handle late arrivals, quick swaps, changing court counts, and players stepping out for a break.",
  },
  {
    title: "Keep results together",
    body: "Record winners or scores so regular squads can keep a simple history without a separate spreadsheet.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What sports can DuoRally help organise?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "DuoRally helps social racquet and court sport groups organise player rotations for sports such as tennis, badminton, pickleball, squash, table tennis, padel, and similar group-play sessions.",
      },
    },
    {
      "@type": "Question",
      name: "Is DuoRally only for one sport?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. DuoRally is built for social racquet and court sessions where players need fair lineups, sit-out tracking, score entry, and next-game planning.",
      },
    },
  ],
};

export default function RacquetSportsRotationPage() {
  return (
    <main className="pb-public-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <nav className="pb-public-nav" aria-label="DuoRally public navigation">
        <Link href="/" className="pb-public-brand" aria-label="DuoRally home">
          <Logo variant="full" theme="light" size={42} showKicker />
        </Link>
        <div className="pb-public-nav__links">
          <Link href="/badminton-doubles-rotation-app">Badminton</Link>
          <Link href="/pickleball-rotation-app">Pickleball</Link>
          <Link href="/brisbane-pickleball-badminton-court-bookings">Brisbane courts</Link>
          <Link href="/sign-in">Sign in</Link>
        </div>
      </nav>

      <section className="pb-public-hero pb-public-hero--racquet">
        <div className="pb-public-hero__copy">
          <span className="pb-kicker">Racquet sports rotation app</span>
          <h1>Run fair social rotations for every court in play.</h1>
          <p>
            DuoRally helps tennis, badminton, pickleball, squash, table tennis, and similar social groups
            organise players, balance sit-outs, prepare next games, and keep scores in one mobile-friendly place.
          </p>
          <div className="pb-public-actions">
            <Link className="pb-btn pb-btn-volt" href="/sign-in">
              Start a session
            </Link>
            <Link className="pb-public-text-link" href="/pickleball-rotation-app">
              View a sport example
            </Link>
          </div>
        </div>
        <div className="pb-public-scoreboard" aria-label="Racquet sport examples">
          {sports.slice(0, 5).map((sport) => (
            <div key={sport}>
              <span>Works for</span>
              <strong>{sport}</strong>
              <em>Social rotation and scoring</em>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-public-section" aria-labelledby="racquet-features">
        <div className="pb-public-section__heading">
          <span className="pb-mono-label">Across court sports</span>
          <h2 id="racquet-features">The session stays organised even when people arrive, leave, or need a rest.</h2>
        </div>
        <div className="pb-public-grid">
          {features.map((feature) => (
            <article className="pb-public-tile" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pb-public-section pb-public-two-up" aria-labelledby="racquet-keywords">
        <div>
          <span className="pb-mono-label">Built for organisers</span>
          <h2 id="racquet-keywords">Replace whiteboards, notes, and courtside spreadsheets.</h2>
        </div>
        <p>
          Use one mobile-friendly place to prepare players, rotate courts, track scores, and keep casual games moving
          across tennis, badminton, pickleball, squash, table tennis, and other racquet-sport sessions.
        </p>
      </section>
    </main>
  );
}
