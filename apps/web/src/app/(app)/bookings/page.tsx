// Book a court — links only. No records, no automation: we send the organiser
// straight to each venue's own booking page (where the real reserve + pay happens).

type VenueLink = { label: string; href: string };
type Venue = { name: string; area: string; note: string; links: VenueLink[] };

const VENUES: Venue[] = [
  {
    name: "Northside Badminton",
    area: "Brisbane · Book via Skedda",
    note: "Instant confirmation · member & non-member rates.",
    links: [
      { label: "Book badminton", href: "https://www.northsidebadminton.com.au/book-badminton/" },
      { label: "Book pickleball", href: "https://www.northsidebadminton.com.au/book-pickleball/" },
    ],
  },
  {
    name: "Sam's Indoor Sports Centre",
    area: "Brisbane · Book on venue site",
    note: "Court hire and socials on the venue's booking system.",
    links: [
      { label: "Indoor pickleball", href: "https://www.samsindoorsportscentre.com.au/indoor-pickleball" },
      { label: "Outdoor pickleball", href: "https://www.samsindoorsportscentre.com.au/outdoor-pickleball" },
      { label: "All court bookings", href: "https://www.samsindoorsportscentre.com.au/sc_booking/" },
    ],
  },
];

export default function BookingsPage() {
  return (
    <div className="pb-page-shell" style={{ maxWidth: 640 }}>
      <div className="pb-page-heading">
        <div>
          <span className="pb-kicker">Brisbane</span>
          <h1>Book a court</h1>
          <p>Pick a venue and jump straight to their booking page. You&apos;ll reserve and pay on the venue&apos;s own site.</p>
        </div>
      </div>

      <div style={{ display: "grid", gap: "1rem" }}>
        {VENUES.map((venue) => (
          <section className="pb-card" key={venue.name} style={{ display: "grid", gap: "0.875rem" }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                {venue.name}
              </h2>
              <p className="pb-mono-label" style={{ marginTop: "0.25rem" }}>{venue.area}</p>
              <p style={{ color: "var(--text-2)", fontSize: "0.9rem", marginTop: "0.375rem" }}>{venue.note}</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {venue.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="pb-secondary-action"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  {link.label}
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "1.25rem" }}>
        More Brisbane venues coming soon.
      </p>
    </div>
  );
}
