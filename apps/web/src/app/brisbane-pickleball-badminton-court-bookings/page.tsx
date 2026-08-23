import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Brisbane Racquet Sport Court Bookings",
  description:
    "Find Brisbane racquet sport court booking links for pickleball, badminton, squash, and social court play, then use DuoRally to organise rotations and scores.",
  alternates: { canonical: "/brisbane-pickleball-badminton-court-bookings" },
  openGraph: {
    title: "Brisbane Racquet Sport Court Bookings | DuoRally",
    description:
      "Quick Brisbane court booking links for racquet sport groups using DuoRally to organise social sessions.",
    url: "/brisbane-pickleball-badminton-court-bookings",
  },
};

const venues = [
  { name: "Sam's Indoor Sports Centre", area: "Brisbane", sports: "Pickleball", href: "https://www.samsindoorsportscentre.com.au/sc_booking/" },
  { name: "UQ Sport", area: "St Lucia", sports: "Pickleball, badminton, and squash", href: "https://uqsport.com.au/courts/" },
  { name: "Northside Badminton Centre", area: "Brendale", sports: "Badminton and pickleball", href: "https://www.northsidebadminton.com.au/" },
  { name: "Brisbane City Indoor Sports", area: "Coorparoo", sports: "Badminton and pickleball", href: "https://www.brisbanecityindoorsports.com.au/booking/court-hire" },
  { name: "PARK The Gap", area: "The Gap", sports: "Pickleball", href: "https://thepark.club/venues/the-gap?from=gsp" },
  { name: "Vision Badminton Centre", area: "Coorparoo", sports: "Badminton", href: "https://booking.daifo.ai/vision/booking" },
  { name: "Queensland Badminton Centre", area: "Carole Park", sports: "Badminton", href: "https://www.qbcbadminton.com.au/court-bookings" },
  { name: "Sky Badminton Centre", area: "Logan Central", sports: "Badminton", href: "https://skybadminton.com.au/booking" },
];

export default function BrisbaneCourtBookingsPage() {
  return (
    <main className="pb-public-shell">
      <nav className="pb-public-nav" aria-label="DuoRally public navigation">
        <Link href="/" className="pb-public-brand" aria-label="DuoRally home">
          <Logo variant="full" theme="light" size={42} showKicker />
        </Link>
        <div className="pb-public-nav__links">
          <Link href="/racquet-sports-rotation-app">Racquet sports</Link>
          <Link href="/badminton-doubles-rotation-app">Badminton</Link>
          <Link href="/pickleball-rotation-app">Pickleball</Link>
          <Link href="/sign-in">Sign in</Link>
        </div>
      </nav>

      <section className="pb-public-hero pb-public-hero--booking">
        <div className="pb-public-hero__copy">
          <span className="pb-kicker">Brisbane racquet sport court links</span>
          <h1>Book a court, then let DuoRally handle the games.</h1>
          <p>
            A quick directory for Brisbane pickleball, badminton, squash, and social court-sport organisers.
            Pick a venue, book directly with the court, then use DuoRally to manage players, rotations, scores, and results.
          </p>
          <div className="pb-public-actions">
            <Link className="pb-btn pb-btn-volt" href="/sign-in">
              Organise after booking
            </Link>
            <Link className="pb-public-text-link" href="/">
              Learn about DuoRally
            </Link>
          </div>
        </div>
      </section>

      <section className="pb-public-section" aria-labelledby="brisbane-venues">
        <div className="pb-public-section__heading">
          <span className="pb-mono-label">Venue links</span>
          <h2 id="brisbane-venues">Brisbane racquet sport court booking options.</h2>
        </div>
        <div className="pb-public-venue-grid">
          {venues.map((venue) => (
            <article className="pb-public-tile" key={venue.name}>
              <h3>{venue.name}</h3>
              <p>{venue.area}</p>
              <p>{venue.sports}</p>
              <a href={venue.href} target="_blank" rel="noreferrer noopener">
                Open booking link <span aria-hidden="true">-&gt;</span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="pb-public-section pb-public-two-up" aria-labelledby="after-booking">
        <div>
          <span className="pb-mono-label">After you book</span>
          <h2 id="after-booking">Use the court time well.</h2>
        </div>
        <p>
          Once the venue is sorted, DuoRally helps your group invite players, confirm who is coming, generate fair
          games, track scores, and keep future matches ready as each court finishes.
        </p>
      </section>
    </main>
  );
}
