import { redirect } from "next/navigation";
import {
  getPublicRsvpRoster,
  joinKnownPlayerRsvp,
  joinPublicCasualRsvp,
  removeKnownPlayerRsvp,
  removePublicCasualRsvp,
} from "@/server/sessions/rsvp-public";

function namesList(names: Array<{ displayName: string; isPublic?: boolean }>, empty: string) {
  if (names.length === 0) {
    return <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>{empty}</p>;
  }
  return (
    <ol style={{ display: "grid", gap: "0.45rem", margin: 0, paddingLeft: "1.25rem" }}>
      {names.map((person) => (
        <li key={`${person.displayName}-${person.isPublic ? "public" : "member"}`} style={{ color: "var(--text-1)", fontWeight: 800 }}>
          {person.displayName}
        </li>
      ))}
    </ol>
  );
}

export default async function PublicRsvpPage({
  params,
  searchParams,
}: {
  params: Promise<{ rsvpCode: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { rsvpCode } = await params;
  const query = searchParams ? await searchParams : {};
  const message = typeof query.message === "string" ? query.message : null;
  const error = typeof query.error === "string" ? query.error : null;
  const result = await getPublicRsvpRoster(rsvpCode);

  async function joinAction(formData: FormData) {
    "use server";
    const name = String(formData.get("displayName") ?? "");
    const actionResult = await joinPublicCasualRsvp(rsvpCode, name);
    if (!actionResult.ok) {
      redirect(`/rsvp/${encodeURIComponent(rsvpCode)}?error=${encodeURIComponent(actionResult.message)}`);
    }
    redirect(`/rsvp/${encodeURIComponent(rsvpCode)}?message=${encodeURIComponent("You are on the casual list.")}`);
  }

  async function knownPlayerAction(formData: FormData) {
    "use server";
    const playerId = String(formData.get("playerId") ?? "");
    const intent = String(formData.get("intent") ?? "join");
    const actionResult = intent === "remove"
      ? await removeKnownPlayerRsvp(rsvpCode, playerId)
      : await joinKnownPlayerRsvp(rsvpCode, playerId);
    if (!actionResult.ok) {
      redirect(`/rsvp/${encodeURIComponent(rsvpCode)}?error=${encodeURIComponent(actionResult.message)}`);
    }
    redirect(`/rsvp/${encodeURIComponent(rsvpCode)}?message=${encodeURIComponent("Your RSVP is updated.")}`);
  }

  async function removeAction(formData: FormData) {
    "use server";
    const name = String(formData.get("displayName") ?? "");
    const actionResult = await removePublicCasualRsvp(rsvpCode, name);
    if (!actionResult.ok) {
      redirect(`/rsvp/${encodeURIComponent(rsvpCode)}?error=${encodeURIComponent(actionResult.message)}`);
    }
    redirect(`/rsvp/${encodeURIComponent(rsvpCode)}?message=${encodeURIComponent("Your name was removed.")}`);
  }

  if (!result.ok) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "1rem", display: "grid", placeItems: "center" }}>
        <section style={{ width: "min(100%, 560px)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.25rem", boxShadow: "var(--shadow-sm)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
            RSVP unavailable
          </span>
          <h1 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.75rem", fontWeight: 900, marginTop: "0.4rem" }}>
            This session list is not open.
          </h1>
          <p style={{ color: "var(--text-2)", marginTop: "0.5rem" }}>{result.message}</p>
        </section>
      </main>
    );
  }

  const roster = result.data;
  const confirmedCount = roster.regularsIn.length + roster.casualsConfirmed.length;
  const openSpots = Math.max(0, roster.capacity.totalPlayers - confirmedCount);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "1rem" }}>
      <div style={{ width: "min(100%, 920px)", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section style={{
          background: "var(--ink-800)",
          borderRadius: "var(--r-2xl)",
          padding: "1.25rem",
          color: "var(--text-inverse)",
          position: "relative",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}>
          <div aria-hidden="true" style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px)",
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative", display: "grid", gap: "0.875rem" }}>
            <span style={{ width: "fit-content", padding: "4px 10px", borderRadius: "var(--r-pill)", background: "var(--volt-500)", color: "var(--ink-800)", fontFamily: "var(--font-mono)", fontSize: "0.625rem", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Session RSVP
            </span>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 7vw, 4rem)", lineHeight: 0.98, textTransform: "uppercase", letterSpacing: "-0.02em", color: "var(--n-50)" }}>
                {roster.sessionName}
              </h1>
              <p style={{ color: "rgba(246,248,244,0.75)", marginTop: "0.55rem", fontWeight: 700 }}>
                {roster.squadName}{roster.venueName ? ` at ${roster.venueName}` : ""} · {roster.startsAtLabel}
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.625rem" }}>
              {[
                { label: "Confirmed", value: confirmedCount },
                { label: "Capacity", value: roster.capacity.totalPlayers },
                { label: "Open spots", value: openSpots },
              ].map((item) => (
                <div key={item.label} style={{ background: "rgba(246,248,244,0.08)", border: "1px solid rgba(246,248,244,0.12)", borderRadius: "var(--r-lg)", padding: "0.75rem" }}>
                  <div style={{ fontFamily: "var(--font-display-tight)", color: "var(--volt-500)", fontSize: "1.6rem", fontWeight: 900, lineHeight: 1 }}>{item.value}</div>
                  <div style={{ fontFamily: "var(--font-mono)", color: "rgba(246,248,244,0.58)", fontSize: "0.5625rem", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 5 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {(message || error) && (
          <p role="status" style={{
            margin: 0,
            padding: "0.75rem 0.875rem",
            borderRadius: "var(--r-lg)",
            background: error ? "var(--danger-bg)" : "rgba(198,241,53,0.16)",
            color: error ? "var(--danger)" : "var(--ink-800)",
            fontWeight: 900,
          }}>
            {error ?? message}
          </p>
        )}

        <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem", boxShadow: "var(--shadow-sm)" }}>
          <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.35rem", fontWeight: 900 }}>RSVP</h2>
          <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginTop: "0.2rem" }}>
            Find your name to update this session. Guests can add a session-only name below.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "0.75rem", marginTop: "0.875rem" }}>
            <form action={knownPlayerAction} style={{ display: "grid", gap: "0.5rem" }}>
              <label style={{ color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 900 }}>
                Signed-up players
              </label>
              <select className="pb-input" name="playerId" required defaultValue="" style={{ marginTop: 0 }}>
                <option value="" disabled>Find your name</option>
                {roster.knownPlayerOptions.map((player) => (
                  <option key={player.playerId} value={player.playerId}>{player.displayName}</option>
                ))}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <button name="intent" value="join" type="submit" disabled={roster.knownPlayerOptions.length === 0} style={{ minHeight: 44, border: "none", borderRadius: "var(--r-md)", background: "var(--volt-500)", color: "var(--ink-800)", fontWeight: 900, cursor: roster.knownPlayerOptions.length === 0 ? "default" : "pointer", opacity: roster.knownPlayerOptions.length === 0 ? 0.55 : 1 }}>
                  I'm coming
                </button>
                <button name="intent" value="remove" type="submit" disabled={roster.knownPlayerOptions.length === 0} style={{ minHeight: 44, border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-sunken)", color: "var(--text-1)", fontWeight: 900, cursor: roster.knownPlayerOptions.length === 0 ? "default" : "pointer", opacity: roster.knownPlayerOptions.length === 0 ? 0.55 : 1 }}>
                  I'm away
                </button>
              </div>
              <p style={{ color: "var(--text-3)", fontSize: "0.75rem", fontWeight: 800 }}>
                Uses your existing player profile. Regulars can opt out here.
              </p>
            </form>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <form action={joinAction} style={{ display: "grid", gap: "0.5rem" }}>
                <label style={{ color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 900 }}>
                  Not listed?
                </label>
                <input className="pb-input" name="displayName" placeholder="Add guest name" required minLength={2} style={{ marginTop: 0 }} />
                <button type="submit" style={{ minHeight: 44, border: "none", borderRadius: "var(--r-md)", background: "var(--volt-500)", color: "var(--ink-800)", fontWeight: 900, cursor: "pointer" }}>
                  Add guest for this session
                </button>
              </form>
              <form action={removeAction} style={{ display: "grid", gap: "0.5rem" }}>
                <input className="pb-input" name="displayName" placeholder="Guest name to remove" required minLength={2} style={{ marginTop: 0 }} />
                <button type="submit" style={{ minHeight: 44, border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-sunken)", color: "var(--text-1)", fontWeight: 900, cursor: "pointer" }}>
                  Remove guest name
                </button>
              </form>
              <a href="/dashboard" style={{ color: "var(--emerald-600)", fontSize: "0.8125rem", fontWeight: 900 }}>
                Want to be remembered next time? Join the squad.
              </a>
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "0.75rem" }}>
          {[
            { title: "Regulars in", names: roster.regularsIn, empty: "No regulars listed yet." },
            { title: "Regulars away", names: roster.regularsAway, empty: "No regulars away." },
            { title: "Casuals confirmed", names: roster.casualsConfirmed, empty: "No casuals confirmed yet." },
            { title: "Casuals waiting", names: roster.casualsWaiting, empty: roster.capacity.waitlistEnabled ? "No casuals waiting." : "Waiting list is off." },
          ].map((bucket) => (
            <div key={bucket.title} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.875rem", boxShadow: "var(--shadow-xs)" }}>
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", fontWeight: 900, marginBottom: "0.625rem" }}>{bucket.title}</h2>
              {namesList(bucket.names, bucket.empty)}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
