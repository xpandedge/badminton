import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Pickleball Rotation App",
  description:
    "Use DuoRally to create fair pickleball player rotations, manage social play, track scores, and rotate players across courts.",
  alternates: { canonical: "/pickleball-rotation-app" },
  openGraph: {
    title: "Pickleball Rotation App | DuoRally",
    description:
      "Create fair pickleball player rotations, manage sit-outs, run courts, and track scores for social sessions.",
    url: "/pickleball-rotation-app",
  },
};

const features = [
  {
    title: "Easy player rotation",
    body: "Set the player list and courts, then let DuoRally create the next games for social pickleball play.",
  },
  {
    title: "Bench fairness",
    body: "The app tracks sit-outs so players are less likely to wait twice while others keep playing.",
  },
  {
    title: "Simple score entry",
    body: "Use winner-only or points scoring and keep the session leaderboard visible as games finish.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can DuoRally rotate pickleball players?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. DuoRally creates fair lineups for social pickleball sessions and tracks sit-outs, scores, and future court assignments.",
      },
    },
    {
      "@type": "Question",
      name: "Is DuoRally only for pickleball?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. DuoRally is useful for racquet-sport rotations including tennis, badminton, pickleball, squash, table tennis, and similar social court sessions.",
      },
    },
  ],
};

export default function PickleballRotationPage() {
  return (
    <main className="pb-public-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <nav className="pb-public-nav" aria-label="DuoRally public navigation">
        <Link href="/" className="pb-public-brand" aria-label="DuoRally home">
          <Logo variant="full" theme="light" size={42} showKicker />
        </Link>
        <div className="pb-public-nav__links">
          <Link href="/racquet-sports-rotation-app">Racquet sports</Link>
          <Link href="/badminton-doubles-rotation-app">Badminton</Link>
          <Link href="/brisbane-pickleball-badminton-court-bookings">Brisbane courts</Link>
          <Link href="/sign-in">Sign in</Link>
        </div>
      </nav>

      <section className="pb-public-hero">
        <div className="pb-public-hero__copy">
          <span className="pb-kicker">Pickleball rotation app</span>
          <h1>Keep social pickleball games moving across every court.</h1>
          <p>
            DuoRally helps pickleball organisers rotate players, share court assignments, record results,
            and keep the bench fair during busy social sessions.
          </p>
          <div className="pb-public-actions">
            <Link className="pb-btn pb-btn-volt" href="/sign-in">
              Start a pickleball session
            </Link>
            <Link className="pb-public-text-link" href="/">
              Back to overview
            </Link>
          </div>
        </div>
        <div className="pb-public-scoreboard" aria-label="Example pickleball rotation">
          <div>
            <span>Game format</span>
            <strong>Player rotation</strong>
            <em>Winner-only or points scoring</em>
          </div>
          <div>
            <span>Courts</span>
            <strong>1 to many</strong>
            <em>Use the courts available now</em>
          </div>
          <div>
            <span>Next games</span>
            <strong>Automatic</strong>
            <em>Refill courts after results</em>
          </div>
        </div>
      </section>

      <section className="pb-public-section" aria-labelledby="pickleball-features">
        <div className="pb-public-section__heading">
          <span className="pb-mono-label">For social play</span>
          <h2 id="pickleball-features">Less whiteboard admin, more games.</h2>
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

      <section className="pb-public-section pb-public-two-up" aria-labelledby="pickleball-keywords">
        <div>
          <span className="pb-mono-label">Use cases</span>
          <h2 id="pickleball-keywords">For open play, social ladders, and regular pickleball groups.</h2>
        </div>
        <p>
          DuoRally is a practical option for organisers searching for a pickleball rotation app, pickleball player
          scheduler, social pickleball organiser, or pickleball score tracker. It also works for nearby racquet
          sports where groups need fair court rotation and simple results.
        </p>
      </section>
    </main>
  );
}
