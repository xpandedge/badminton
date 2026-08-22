"use client";

import { useMemo, useState, type CSSProperties } from "react";

type Sport = "pickleball" | "badminton";

type VenueLink = {
  label: string;
  href: string;
  sport?: Sport;
};

type Venue = {
  name: string;
  monogram: string;
  area: string;
  note: string;
  sports: Sport[];
  theme: {
    bg: string;
    fg: string;
    accent: string;
  };
  links: VenueLink[];
};

const SPORT_COPY: Record<Sport, { label: string; shortLabel: string; detail: string }> = {
  pickleball: {
    label: "Pickleball",
    shortLabel: "PB",
    detail: "Dedicated courts, club sessions, and indoor options around Brisbane.",
  },
  badminton: {
    label: "Badminton",
    shortLabel: "BD",
    detail: "Indoor court hire with direct booking links for casual sessions.",
  },
};

const VENUES: Venue[] = [
  {
    name: "Sam's Indoor Sports Centre",
    monogram: "S",
    area: "Brisbane",
    note: "Indoor and outdoor pickleball links from the venue's own booking system.",
    sports: ["pickleball"],
    theme: { bg: "#102B23", fg: "#F7FFF0", accent: "#C6F135" },
    links: [
      { label: "Indoor pickleball", href: "https://www.samsindoorsportscentre.com.au/indoor-pickleball", sport: "pickleball" },
      { label: "Outdoor pickleball", href: "https://www.samsindoorsportscentre.com.au/outdoor-pickleball", sport: "pickleball" },
      { label: "All court bookings", href: "https://www.samsindoorsportscentre.com.au/sc_booking/" },
    ],
  },
  {
    name: "UQ Sport",
    monogram: "UQ",
    area: "St Lucia",
    note: "Account-based online court bookings for pickleball, badminton, squash, and more.",
    sports: ["pickleball", "badminton"],
    theme: { bg: "#4B145F", fg: "#FFFFFF", accent: "#F7D547" },
    links: [{ label: "Book UQ courts", href: "https://uqsport.com.au/courts/" }],
  },
  {
    name: "Northside Badminton Centre",
    monogram: "N",
    area: "Brendale",
    note: "Quick court hire for badminton or pickleball with member and non-member rates.",
    sports: ["pickleball", "badminton"],
    theme: { bg: "#081D33", fg: "#F4FAFF", accent: "#53C7FF" },
    links: [
      { label: "Book badminton", href: "https://www.northsidebadminton.com.au/book-badminton/", sport: "badminton" },
      { label: "Book pickleball", href: "https://www.northsidebadminton.com.au/book-pickleball/", sport: "pickleball" },
    ],
  },
  {
    name: "Brisbane City Indoor Sports",
    monogram: "BC",
    area: "Coorparoo",
    note: "Private court hire form for badminton, pickleball, and other indoor sports.",
    sports: ["pickleball", "badminton"],
    theme: { bg: "#121820", fg: "#FFFFFF", accent: "#FFB000" },
    links: [{ label: "Hire a court", href: "https://www.brisbanecityindoorsports.com.au/booking/court-hire" }],
  },
  {
    name: "PARK The Gap",
    monogram: "P",
    area: "The Gap",
    note: "Purpose-built racquet club with dedicated pickleball courts, social play, and events.",
    sports: ["pickleball"],
    theme: { bg: "#052E22", fg: "#F5FFF5", accent: "#79E36F" },
    links: [{ label: "Book a court", href: "https://thepark.club/venues/the-gap?from=gsp" }],
  },
  {
    name: "Roy Emerson Tennis Centre",
    monogram: "RE",
    area: "Milton",
    note: "Online pickleball court bookings through TennisVenues at Frew Park.",
    sports: ["pickleball"],
    theme: { bg: "#1C3D7A", fg: "#FFFFFF", accent: "#FBCB3C" },
    links: [{ label: "Book pickleball", href: "https://www.tennisvenues.com.au/booking/roy-emerson-tc", sport: "pickleball" }],
  },
  {
    name: "Churchie Pickleball",
    monogram: "C",
    area: "East Brisbane",
    note: "Online hourly pickleball court hire at Heath Park / East Brisbane Tennis Centre.",
    sports: ["pickleball"],
    theme: { bg: "#173A66", fg: "#FFFFFF", accent: "#C8A24A" },
    links: [{ label: "Book pickleball", href: "https://www.tennisvenues.com.au/booking/churchie-pickleball", sport: "pickleball" }],
  },
  {
    name: "Pickle Kit",
    monogram: "PK",
    area: "Mitchelton + Arana Hills",
    note: "OpenSports bookings for social play, coaching, leagues, and private court hire.",
    sports: ["pickleball"],
    theme: { bg: "#295B24", fg: "#F8FFF1", accent: "#F0FF54" },
    links: [{ label: "Book on OpenSports", href: "https://opensports.ca/pickle-kit", sport: "pickleball" }],
  },
  {
    name: "Vision Badminton Centre",
    monogram: "V",
    area: "Coorparoo",
    note: "Daily badminton court bookings through Daifo with rates shown on the platform.",
    sports: ["badminton"],
    theme: { bg: "#0E1428", fg: "#F7F9FF", accent: "#5F75FF" },
    links: [{ label: "Book badminton", href: "https://booking.daifo.ai/vision/booking", sport: "badminton" }],
  },
  {
    name: "Queensland Badminton Centre",
    monogram: "Q",
    area: "Carole Park",
    note: "Tournament-grade badminton courts with Skedda court bookings.",
    sports: ["badminton"],
    theme: { bg: "#0E2B4F", fg: "#FFFFFF", accent: "#7ED4FF" },
    links: [{ label: "Book badminton", href: "https://www.qbcbadminton.com.au/court-bookings", sport: "badminton" }],
  },
  {
    name: "Goodminton",
    monogram: "G",
    area: "Browns Plains",
    note: "Automated badminton venue with online booking required before play.",
    sports: ["badminton"],
    theme: { bg: "#162A31", fg: "#FFFFFF", accent: "#75D7C8" },
    links: [{ label: "Book badminton", href: "https://goodmintonbc.skedda.com/", sport: "badminton" }],
  },
  {
    name: "Sky Badminton Centre",
    monogram: "SK",
    area: "Logan Central",
    note: "Large badminton centre with a live day-by-day booking grid.",
    sports: ["badminton"],
    theme: { bg: "#111B44", fg: "#FFFFFF", accent: "#8BCBFF" },
    links: [{ label: "Book badminton", href: "https://skybadminton.com.au/booking", sport: "badminton" }],
  },
  {
    name: "Badminton Brisbane",
    monogram: "BB",
    area: "Crestmead",
    note: "Air-conditioned badminton facility using YepBooking for court hire.",
    sports: ["badminton"],
    theme: { bg: "#10274E", fg: "#FFFFFF", accent: "#9FD7FF" },
    links: [{ label: "Book badminton", href: "https://badmintonbrisbane.yepbooking.com.au/", sport: "badminton" }],
  },
];

function isSportLink(link: VenueLink, sport: Sport) {
  return !link.sport || link.sport === sport;
}

export default function BookingsPage() {
  const [activeSport, setActiveSport] = useState<Sport>("pickleball");
  const [query, setQuery] = useState("");

  const venues = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return VENUES.filter((venue) => {
      const matchesSport = venue.sports.includes(activeSport);
      const matchesQuery =
        !normalized ||
        venue.area.toLowerCase().includes(normalized) ||
        venue.name.toLowerCase().includes(normalized);
      return matchesSport && matchesQuery;
    });
  }, [activeSport, query]);

  return (
    <div className="pb-page-shell pb-bookings-shell">
      <div className="pb-bookings-hero">
        <div className="pb-bookings-hero-copy">
          <span className="pb-kicker">Court booking</span>
          <h1>Where do you want to play?</h1>
          <p>Pick a sport, search by suburb or venue, then book directly with the court.</p>
        </div>
      </div>

      <div className="pb-booking-controls">
        <label className="pb-booking-search">
          <span>Suburb or venue</span>
          <input
            className="pb-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Suburb or venue"
          />
        </label>

        <div className="pb-booking-tabs" role="tablist" aria-label="Court booking sport">
          {(Object.keys(SPORT_COPY) as Sport[]).map((sport) => (
            <button
              key={sport}
              type="button"
              role="tab"
              aria-selected={activeSport === sport}
              className={activeSport === sport ? "is-selected" : ""}
              data-sport={sport}
              onClick={() => setActiveSport(sport)}
            >
              <span>{SPORT_COPY[sport].label}</span>
              <small>{VENUES.filter((venue) => venue.sports.includes(sport)).length} options</small>
            </button>
          ))}
        </div>
      </div>

      <section className="pb-booking-section" aria-live="polite">
        <div className="pb-booking-section-header">
          <div>
            <span className="pb-mono-label">{SPORT_COPY[activeSport].shortLabel} court links</span>
            <h2>{SPORT_COPY[activeSport].label} venues</h2>
          </div>
          <p>{SPORT_COPY[activeSport].detail}</p>
        </div>

        <div className="pb-venue-directory">
          {venues.map((venue) => (
            <article
              className="pb-venue-card"
              key={`${activeSport}-${venue.name}`}
              style={{
                "--venue-bg": venue.theme.bg,
                "--venue-fg": venue.theme.fg,
                "--venue-accent": venue.theme.accent,
              } as CSSProperties}
            >
              <div className="pb-venue-mark" aria-hidden="true">
                <span>{venue.monogram}</span>
              </div>

              <div className="pb-venue-content">
                <div className="pb-venue-title-row">
                  <div>
                    <h3>{venue.name}</h3>
                    <p>{venue.area}</p>
                  </div>
                </div>

                <p className="pb-venue-note">{venue.note}</p>

                <div className="pb-venue-footer">
                  <div className="pb-venue-sports" aria-label={`Sports at ${venue.name}`}>
                    {venue.sports.map((sport) => (
                      <span key={sport} data-sport={sport}>
                        {SPORT_COPY[sport].shortLabel}
                      </span>
                    ))}
                  </div>

                  <div className="pb-venue-links">
                    {venue.links.filter((link) => isSportLink(link, activeSport)).map((link) => (
                      <a key={link.href} href={link.href} target="_blank" rel="noreferrer noopener">
                        {link.label}
                        <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
          {venues.length === 0 && (
            <div className="pb-empty-card">
              No courts found for that search. Try another suburb or switch sport.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
