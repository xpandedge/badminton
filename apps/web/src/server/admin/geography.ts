import "server-only";

export type SquadGeographySource = "venue-address" | "session-venue" | "unknown";

export interface SquadGeography {
  label: string;
  source: SquadGeographySource;
}

const KNOWN_LOCAL_PLACES = [
  "Brisbane",
  "Northside",
  "The Gap",
  "Milton",
  "Salisbury",
  "Nundah",
  "Mansfield",
  "Sunnybank",
  "Springfield",
  "Gold Coast",
  "Sunshine Coast",
];

function cleanPart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function inferFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map(cleanPart).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2] ?? null;
  return parts[0] ?? null;
}

function inferKnownPlace(value: string | null | undefined): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  return KNOWN_LOCAL_PLACES.find((place) => lower.includes(place.toLowerCase())) ?? null;
}

export function inferSquadGeography(input: {
  venues: Array<{ name?: string | null; address?: string | null }>;
  sessions: Array<{ venueName?: string | null }>;
}): SquadGeography {
  for (const venue of input.venues) {
    const fromAddress = inferFromAddress(venue.address);
    if (fromAddress) return { label: fromAddress, source: "venue-address" };
  }

  for (const venue of input.venues) {
    const fromName = inferKnownPlace(venue.name);
    if (fromName) return { label: fromName, source: "venue-address" };
  }

  for (const session of input.sessions) {
    const fromSession = inferKnownPlace(session.venueName);
    if (fromSession) return { label: fromSession, source: "session-venue" };
  }

  return { label: "Unknown", source: "unknown" };
}
