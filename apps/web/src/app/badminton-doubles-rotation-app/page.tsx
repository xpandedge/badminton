import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Badminton Player Rotation App",
  description:
    "Use DuoRally to create fair badminton player rotations, balance sit-outs, manage courts, and track scores for social badminton sessions.",
  alternates: { canonical: "/badminton-doubles-rotation-app" },
  openGraph: {
    title: "Badminton Player Rotation App | DuoRally",
    description:
      "Create fair badminton player rotations, manage sit-outs, run courts, and track scores for social sessions.",
    url: "/badminton-doubles-rotation-app",
  },
};

const rotationSteps = [
  "Add regulars and guests for the session.",
  "Choose available courts, game length, and scoring style.",
  "Generate balanced games across active courts.",
  "Record each result so DuoRally prepares the next fair match.",
];

const features = [
  {
    title: "Fair sit-outs",
    body: "DuoRally keeps an eye on who has waited, who has played, and who should come back on court next.",
  },
  {
    title: "Partner variety",
    body: "The rotation avoids the same combinations where possible, so players mix through the group naturally.",
  },
  {
    title: "Mid-session changes",
    body: "Step a player out, reactivate them, or change court availability while protecting games already scored.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is a badminton player rotation app?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A badminton player rotation app helps a social group decide who plays together, who sits out, and which games come next across one or more courts.",
      },
    },
    {
      "@type": "Question",
      name: "Can DuoRally handle late badminton players?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Organisers can add or reactivate players during a session, and future games can adjust without changing completed results.",
      },
    },
  ],
};

export default function BadmintonRotationPage() {
  return (
    <main className="pb-public-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <nav className="pb-public-nav" aria-label="DuoRally public navigation">
        <Link href="/" className="pb-public-brand" aria-label="DuoRally home">
          <Logo variant="full" theme="light" size={42} showKicker />
        </Link>
        <div className="pb-public-nav__links">
          <Link href="/racquet-sports-rotation-app">Racquet sports</Link>
          <Link href="/pickleball-rotation-app">Pickleball</Link>
          <Link href="/brisbane-pickleball-badminton-court-bookings">Brisbane courts</Link>
          <Link href="/sign-in">Sign in</Link>
        </div>
      </nav>

      <section className="pb-public-hero pb-public-hero--badminton">
        <div className="pb-public-hero__copy">
          <span className="pb-kicker">Badminton player rotation app</span>
          <h1>Run fair badminton rotations without manually juggling players.</h1>
          <p>
            DuoRally gives social badminton organisers a simple way to rotate players, balance sit-outs,
            manage court changes, and keep scores for regular club nights.
          </p>
          <div className="pb-public-actions">
            <Link className="pb-btn pb-btn-volt" href="/sign-in">
              Start a badminton session
            </Link>
            <Link className="pb-public-text-link" href="/">
              Back to overview
            </Link>
          </div>
        </div>
        <ol className="pb-public-step-list" aria-label="How badminton rotation works">
          {rotationSteps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="pb-public-section" aria-labelledby="badminton-features">
        <div className="pb-public-section__heading">
          <span className="pb-mono-label">Built for social badminton</span>
          <h2 id="badminton-features">The rotation stays practical when real people arrive late, leave early, or need a break.</h2>
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

      <section className="pb-public-section pb-public-two-up" aria-labelledby="badminton-keywords">
        <div>
          <span className="pb-mono-label">Use cases</span>
          <h2 id="badminton-keywords">For club nights, casual squads, and recurring badminton groups.</h2>
        </div>
        <p>
          DuoRally is designed for organisers searching for a badminton player rotation app, badminton session
          organiser, badminton score tracker, or fair court rotation tool for social play. It sits inside a broader
          racquet-sport workflow for tennis, pickleball, squash, table tennis, and similar groups that need fair games.
        </p>
      </section>
    </main>
  );
}
