import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";

export const metadata: Metadata = {
  title: "Racquet Sports Rotation App",
  description:
    "DuoRally helps social tennis, badminton, pickleball, squash, and table tennis groups create fair rotations, manage sit-outs, run courts, and track scores.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "DuoRally | Racquet Sports Rotation App",
    description:
      "Create fair rotations, manage sit-outs, run courts, and track scores for social tennis, badminton, pickleball, squash, and table tennis sessions.",
    url: "/",
  },
};

const benefits = [
  {
    title: "Fair player rotation",
    body: "Generate court lineups that balance players, partners, opponents, skill levels, and sit-outs across a social session.",
  },
  {
    title: "Live court management",
    body: "Swap players, mark someone as stepped out, adjust courts, and keep the next games moving without losing completed scores.",
  },
  {
    title: "Scores and rankings",
    body: "Record winner-only or points-based results, then keep a session table and player history for regular squads.",
  },
];

const links = [
  { href: "/racquet-sports-rotation-app", label: "Racquet sports rotation app" },
  { href: "/badminton-doubles-rotation-app", label: "Badminton rotation app" },
  { href: "/pickleball-rotation-app", label: "Pickleball rotation app" },
  { href: "/brisbane-pickleball-badminton-court-bookings", label: "Brisbane court booking links" },
];

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "DuoRally",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web",
  url: "https://duorally.com.au/",
  description:
    "A web app for fair racquet-sport rotations, social session management, live court changes, scoring, and rankings for tennis, badminton, pickleball, squash, table tennis, and similar court sports.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "AUD",
  },
};

export default function Home() {
  return (
    <main className="pb-public-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <nav className="pb-public-nav" aria-label="DuoRally public navigation">
        <Link href="/" className="pb-public-brand" aria-label="DuoRally home">
          <Logo variant="full" theme="light" size={42} showKicker />
        </Link>
        <div className="pb-public-nav__links">
          {links.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <section className="pb-public-hero">
        <div className="pb-public-hero__copy">
          <span className="pb-kicker">Racquet sports session organiser</span>
          <h1>Fair player rotations without the courtside spreadsheet.</h1>
          <p>
            DuoRally helps social tennis, badminton, pickleball, squash, table tennis, and other racquet-sport
            groups create balanced games, manage sit-outs, run live courts, and track scores from one mobile-friendly app.
          </p>
          <div className="pb-public-actions">
            <Link className="pb-btn pb-btn-volt" href="/sign-in">
              Get started
            </Link>
            <Link className="pb-public-text-link" href="/racquet-sports-rotation-app">
              See how rotations work
            </Link>
          </div>
        </div>
        <div className="pb-public-scoreboard" aria-label="Example session rotation">
          <div>
            <span>Court 1</span>
            <strong>Mia + Leo</strong>
            <em>vs Priya + Noah</em>
          </div>
          <div>
            <span>Court 2</span>
            <strong>Ava + Sam</strong>
            <em>vs Kim + Jordan</em>
          </div>
          <div>
            <span>Waiting</span>
            <strong>Ben, Ella</strong>
            <em>Next on after this game</em>
          </div>
        </div>
      </section>

      <section className="pb-public-section" aria-labelledby="why-duorally">
        <div className="pb-public-section__heading">
          <span className="pb-mono-label">Why groups use it</span>
          <h2 id="why-duorally">Built for casual court sessions that still need to feel fair.</h2>
        </div>
        <div className="pb-public-grid">
          {benefits.map((item) => (
            <article className="pb-public-tile" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pb-public-section pb-public-two-up" aria-labelledby="sports">
        <div>
          <span className="pb-mono-label">Explore by sport</span>
          <h2 id="sports">A simple way to run the games your group already loves.</h2>
          <p>
            Set up DuoRally for tennis, badminton, pickleball, squash, table tennis, or another social court sport.
            Each session keeps the focus on fair turns, quick results, and less organiser admin.
          </p>
        </div>
        <div className="pb-public-link-list">
          {links.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
              <span aria-hidden="true">-&gt;</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="pb-public-footer">
        <span>Xpandedge Pty Ltd</span>
        <LegalLinks compact />
      </footer>
    </main>
  );
}
