"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";

type GuideRole = "organiser" | "player";

type GuideStep = {
  title: string;
  body: string;
  action?: string;
};

type GuideSection = {
  id: string;
  label: string;
  title: string;
  summary: string;
  tone: "lime" | "blue" | "ink" | "gold";
  icon: "squad" | "calendar" | "court" | "score" | "rank" | "join" | "player" | "help";
  steps: GuideStep[];
};

const ORGANISER_SECTIONS: GuideSection[] = [
  {
    id: "squad-setup",
    label: "Setup",
    title: "Build your squad",
    summary: "Create the shared space for your players, venues, and sessions.",
    tone: "lime",
    icon: "squad",
    steps: [
      {
        title: "Create a squad",
        body: "Open Squads, tap Create Squad, and give it a name. You become the owner and can appoint other admins.",
        action: "Squads -> Create Squad",
      },
      {
        title: "Share the invite",
        body: "Open the squad and use Share invite, WhatsApp, or Copy. A player using the invite code joins immediately; a player searching by name sends a request for approval.",
        action: "Squad -> Share invite",
      },
      {
        title: "Share admin access",
        body: "Make another trusted player an admin if they help run nights. Admins can manage players, venues, and sessions.",
        action: "Squad -> Members -> Make admin",
      },
      {
        title: "Hand over a squad",
        body: "The owner can use Make owner beside another registered member. The previous owner becomes an admin and can leave if needed.",
        action: "Squad -> Members -> Make owner",
      },
      {
        title: "Add venues and courts",
        body: "Save the venues and courts your squad uses. Choose the courts that are available when you create each session.",
      },
    ],
  },
  {
    id: "schedule-session",
    label: "Schedule",
    title: "Create a session",
    summary: "Create the event your squad will RSVP to and play from.",
    tone: "blue",
    icon: "calendar",
    steps: [
      {
        title: "Create the session",
        body: "Use the Session button in the bottom navigation. You can also create one from a squad when its Sessions tab is empty.",
        action: "Session + -> Create Session",
      },
      {
        title: "Choose the session settings",
        body: "Choose the sport, scoring style, session length, game length, venue, and courts.",
      },
      {
        title: "Schedule or start now",
        body: "Add a date and time if it is later. Leave it blank if you are about to start.",
      },
      {
        title: "Use RSVP for planning",
        body: "Players choose Going or Not going from Home. Going adds that player to the session roster automatically.",
      },
      {
        title: "Build the player list",
        body: "Use Add all when most squad members are playing, then remove anyone who is absent. You can also add members one at a time.",
      },
      {
        title: "Add a session guest",
        body: "Add a guest by name for a one-off player. They appear in this session and its ranking, but not in overall rankings.",
      },
    ],
  },
  {
    id: "live-console",
    label: "Live",
    title: "Run the courts",
    summary: "Start games, handle changes, and keep people moving on and off court.",
    tone: "ink",
    icon: "court",
    steps: [
      {
        title: "Start playing",
        body: "Open the session and tap Start Playing. The first games appear on the courts.",
        action: "Session -> Start Playing",
      },
      {
        title: "Treat displayed games as current",
        body: "Each court card is the game being played now. Current games and completed scores stay in place when the roster or courts change.",
      },
      {
        title: "Swap one player when needed",
        body: "Use Swap with on a current court to replace a player in that game only. Later games rebalance around who actually played.",
      },
      {
        title: "Handle players leaving or returning",
        body: "Use Injured / Step Out to stop assigning more games, Re-activate if they return, or Remove to take them out of the session roster.",
      },
      {
        title: "Change court availability",
        body: "Disable a court if it is no longer available. Current games stay put and later games use the remaining courts.",
      },
    ],
  },
  {
    id: "scores-rankings",
    label: "Scores",
    title: "Record results",
    summary: "Save each result as games finish so the table stays current.",
    tone: "gold",
    icon: "score",
    steps: [
      {
        title: "Winner-only scoring",
        body: "Check the current court card, then tap A Wins or B Wins. Wait for the next game to load before scoring that court again.",
      },
      {
        title: "Points scoring",
        body: "Enter both team scores when you want point totals recorded. The higher score determines the winner.",
      },
      {
        title: "Share the session views",
        body: "Show Board gives players the live courts and session ranking. Share the Score Entry Link only with people who should submit results.",
      },
      {
        title: "Complete the session",
        body: "When the last games are done, complete the session so rankings and stats are final.",
      },
    ],
  },
];

const PLAYER_SECTIONS: GuideSection[] = [
  {
    id: "player-account",
    label: "Account",
    title: "Set up your player name",
    summary: "Sign in and choose the name other players know you by.",
    tone: "blue",
    icon: "player",
    steps: [
      {
        title: "Join DuoRally",
        body: "Continue with Google or create an account with your email, password, and player name. Existing email/password accounts can still use Forgot password.",
      },
      {
        title: "Choose your player name",
        body: "Tap your initials in the top-right corner and answer What should players call you? This updates your name across your squads and sessions.",
        action: "Initials -> Your player name",
      },
    ],
  },
  {
    id: "join-squad",
    label: "Join",
    title: "Join your squad",
    summary: "Use the code from your organiser or request to join by squad name.",
    tone: "lime",
    icon: "join",
    steps: [
      {
        title: "Use an invite code",
        body: "On Home, enter the code from your organiser to join the squad immediately.",
        action: "Home -> Join squad",
      },
      {
        title: "Search by squad name",
        body: "If you do not have a code, search from Home and tap Request to join.",
      },
      {
        title: "Wait for approval",
        body: "If the organiser needs to approve you, the squad will appear after they accept the request.",
      },
      {
        title: "Leave a squad",
        body: "Open the squad's Members tab and use Leave squad at the bottom. You will lose access to upcoming sessions, while completed results and rankings stay.",
        action: "Squad -> Members -> Leave squad",
      },
    ],
  },
  {
    id: "rsvp",
    label: "RSVP",
    title: "Tell the organiser you are coming",
    summary: "Let the organiser know before they build the games.",
    tone: "blue",
    icon: "calendar",
    steps: [
      {
        title: "Find the session on Home",
        body: "Home shows sessions from your squads, with a live or next session highlighted at the top.",
      },
      {
        title: "Choose Going or Not Going",
        body: "Tap Going to add yourself to the session automatically, or Not going if you cannot attend. You can change it until play starts.",
      },
      {
        title: "Show up late?",
        body: "Tell the organiser when you arrive. They can add or re-activate you without changing games already on court.",
      },
    ],
  },
  {
    id: "player-view",
    label: "Play",
    title: "Find your court",
    summary: "See where you are playing, who you are with, and when you are waiting.",
    tone: "ink",
    icon: "player",
    steps: [
      {
        title: "Open the highlighted session",
        body: "Use the live or next-session card on Home, or open the session from its squad.",
        action: "Home -> Open session",
      },
      {
        title: "Check your current match",
        body: "Your player view shows your court, partner, opponents, or that you are waiting.",
      },
      {
        title: "Use the Player Board",
        body: "Open the organiser's shared board link or QR code to follow current courts, the bench, upcoming games, and the session ranking.",
      },
    ],
  },
  {
    id: "follow-results",
    label: "Results",
    title: "Follow scores and rankings",
    summary: "Watch the session table change as results come in.",
    tone: "gold",
    icon: "rank",
    steps: [
      {
        title: "Follow the live leaderboard",
        body: "The session ranking updates as organisers or scorekeepers enter results. Session-only guests appear here too.",
      },
      {
        title: "Use the board link",
        body: "If the organiser shares a board link, open it to see courts and scores without signing in.",
      },
      {
        title: "Check all-time rankings",
        body: "Tap Rankings from Home to see overall results for registered players across completed sessions. Session-only guests are not included.",
      },
    ],
  },
];

const QUICK_START: Record<GuideRole, string[]> = {
  organiser: [
    "Create or open a squad.",
    "Share the invite and save your venues and courts.",
    "Create a session and let players RSVP from Home.",
    "Use Add all, remove absences, and add any session guests.",
    "Tap Start Playing from the session.",
    "Enter each result and let DuoRally prepare the next game.",
  ],
  player: [
    "Join your squad from Home.",
    "Choose Going or Not going on the session card.",
    "Open the highlighted live or next session.",
    "Check your court, partner, and opponents.",
    "Follow the Player Board and session ranking.",
  ],
};

const TROUBLESHOOTING = [
  {
    title: "Matches will not generate",
    body: "Check that at least four players are in and at least one court is available.",
  },
  {
    title: "A player is missing",
    body: "Use Add all, add the squad member individually, or add a session-only guest by name.",
  },
  {
    title: "Someone needs to step out",
    body: "Tap Injured / Step Out so they are not assigned more games. Use Re-activate if they return.",
  },
  {
    title: "The current lineup changed",
    body: "Use Swap with on that court. Only the selected current game changes; later games rebalance around the actual players.",
  },
];

function GuideIcon({ type }: { type: GuideSection["icon"] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (type) {
    case "squad":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.8" />
          <path d="M16 3.2a4 4 0 0 1 0 7.6" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="3" />
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <path d="M3 10h18" />
        </svg>
      );
    case "court":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M4 12h16" />
          <path d="M12 3v18" />
          <path d="M8 7h8" />
          <path d="M8 17h8" />
        </svg>
      );
    case "score":
      return (
        <svg {...common}>
          <path d="M5 19V5" />
          <path d="M19 19V5" />
          <path d="M8 8h3" />
          <path d="M13 16h3" />
          <path d="M9.5 5v14" />
          <path d="M14.5 5v14" />
        </svg>
      );
    case "rank":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-4" />
        </svg>
      );
    case "join":
      return (
        <svg {...common}>
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </svg>
      );
    case "player":
      return (
        <svg {...common}>
          <circle cx="12" cy="7" r="4" />
          <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      );
  }
}

function getToneStyles(tone: GuideSection["tone"]) {
  switch (tone) {
    case "lime":
      return { bg: "rgba(198, 241, 53, 0.16)", fg: "var(--ink-800)", border: "rgba(198, 241, 53, 0.34)" };
    case "blue":
      return { bg: "rgba(61, 109, 255, 0.12)", fg: "var(--sport-badminton)", border: "rgba(61, 109, 255, 0.24)" };
    case "gold":
      return { bg: "rgba(246, 182, 28, 0.16)", fg: "#8a5c00", border: "rgba(246, 182, 28, 0.28)" };
    case "ink":
      return { bg: "var(--ink-800)", fg: "var(--volt-500)", border: "rgba(22, 36, 28, 0.16)" };
  }
}

function SectionCard({
  section,
  open,
  onToggle,
}: {
  section: GuideSection;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = getToneStyles(section.tone);

  return (
    <article
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: "0.875rem",
          padding: "1rem",
          border: "none",
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 46,
            height: 46,
            borderRadius: "var(--r-lg)",
            display: "grid",
            placeItems: "center",
            color: tone.fg,
            background: tone.bg,
            border: `1px solid ${tone.border}`,
            flexShrink: 0,
          }}
        >
          <GuideIcon type={section.icon} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              marginBottom: 3,
            }}
          >
            {section.label}
          </span>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-display-tight)",
              fontSize: "1.075rem",
              fontWeight: 900,
              lineHeight: 1.1,
              color: "var(--text-1)",
            }}
          >
            {section.title}
          </span>
          <span
            style={{
              display: "block",
              marginTop: 6,
              fontSize: "0.875rem",
              lineHeight: 1.45,
              color: "var(--text-2)",
            }}
          >
            {section.summary}
          </span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-3)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 180ms var(--ease-out)",
          }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "0.25rem 1rem 1rem",
            display: "grid",
            gap: "0.625rem",
          }}
        >
          {section.steps.map((step, index) => (
            <div
              key={step.title}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr",
                gap: "0.75rem",
                paddingTop: "0.75rem",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: index === 0 ? "var(--volt-500)" : "var(--surface-sunken)",
                  color: index === 0 ? "var(--ink-800)" : "var(--text-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  fontWeight: 900,
                }}
              >
                {index + 1}
              </span>
              <div>
                <h3
                  style={{
                    fontSize: "0.9625rem",
                    fontWeight: 900,
                    color: "var(--text-1)",
                    lineHeight: 1.2,
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    marginTop: 4,
                    color: "var(--text-2)",
                    fontSize: "0.875rem",
                    lineHeight: 1.58,
                  }}
                >
                  {step.body}
                </p>
                {step.action && (
                  <p
                    style={{
                      marginTop: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      minHeight: 26,
                      padding: "0 0.625rem",
                      borderRadius: "var(--r-pill)",
                      background: "var(--surface-sunken)",
                      color: "var(--text-2)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.625rem",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {step.action}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export default function HelpPage() {
  const [role, setRole] = useState<GuideRole>("organiser");
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({
    "squad-setup": true,
    "join-squad": true,
  });

  const sections = role === "organiser" ? ORGANISER_SECTIONS : PLAYER_SECTIONS;
  const filteredSections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sections;
    return sections.filter((section) => {
      const haystack = [
        section.label,
        section.title,
        section.summary,
        ...section.steps.flatMap((step) => [step.title, step.body, step.action ?? ""]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, sections]);

  return (
    <div
      className="pb-net-bg"
      style={{
        minHeight: "100%",
        padding: "1rem 1rem 2rem",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "grid",
          gap: "1rem",
        }}
      >
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            background: "var(--ink-800)",
            color: "var(--n-50)",
            borderRadius: "var(--r-2xl)",
            padding: "1.25rem",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(135deg, rgba(198,241,53,0.18), transparent 34%), repeating-linear-gradient(45deg, rgba(246,248,244,0.06) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(246,248,244,0.04) 0 1px, transparent 1px 18px)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
              gap: "1rem",
              alignItems: "end",
            }}
          >
            <div>
              <Logo variant="full" theme="dark" size={42} style={{ marginBottom: "1.25rem" }} />
              <p
                style={{
                  display: "inline-flex",
                  height: 28,
                  alignItems: "center",
                  padding: "0 0.75rem",
                  borderRadius: "var(--r-pill)",
                  background: "rgba(198, 241, 53, 0.14)",
                  border: "1px solid rgba(198, 241, 53, 0.28)",
                  color: "var(--volt-300)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: "0.875rem",
                }}
              >
                Court-side guide
              </p>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2rem, 7vw, 4rem)",
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  lineHeight: 0.98,
                  textTransform: "uppercase",
                  maxWidth: 620,
                }}
              >
                Run fair games with less admin.
              </h1>
              <p
                style={{
                  marginTop: "0.875rem",
                  maxWidth: 560,
                  color: "rgba(246, 248, 244, 0.68)",
                  fontSize: "1rem",
                  lineHeight: 1.6,
                }}
              >
                Use this when you are setting up a squad, starting play, finding your court, or fixing a change mid-session.
              </p>
            </div>

            <div
              style={{
                background: "rgba(246,248,244,0.08)",
                border: "1px solid rgba(246,248,244,0.14)",
                borderRadius: "var(--r-xl)",
                padding: "1rem",
                display: "grid",
                gap: "0.75rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(246,248,244,0.54)",
                }}
              >
                Start here
              </p>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <Link href="/groups" className="pb-btn pb-btn-volt" style={{ height: 44 }}>
                  Open squads
                </Link>
                <Link
                  href="/sessions/new"
                  className="pb-btn"
                  style={{
                    height: 44,
                    background: "rgba(246,248,244,0.12)",
                    border: "1px solid rgba(246,248,244,0.16)",
                    color: "var(--n-50)",
                  }}
                >
                  Create session
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
            gap: "1rem",
            alignItems: "start",
          }}
        >
          <aside
            className="pb-help-aside"
            style={{
              display: "grid",
              gap: "0.875rem",
            }}
          >
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-xl)",
                padding: "0.625rem",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.375rem",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              {(["organiser", "player"] as GuideRole[]).map((item) => {
                const active = role === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setRole(item);
                      setQuery("");
                    }}
                    style={{
                      minHeight: 44,
                      padding: "0.625rem",
                      border: "none",
                      borderRadius: "var(--r-lg)",
                      background: active ? "var(--ink-800)" : "transparent",
                      color: active ? "var(--volt-500)" : "var(--text-3)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.625rem",
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {item === "organiser" ? "Organiser" : "Player"}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-xl)",
                padding: "1rem",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--r-md)",
                    display: "grid",
                    placeItems: "center",
                    background: "var(--volt-500)",
                    color: "var(--ink-800)",
                  }}
                >
                  <GuideIcon type="help" />
                </span>
                <div>
                  <h2
                    style={{
                      fontFamily: "var(--font-display-tight)",
                      fontSize: "1.05rem",
                      fontWeight: 900,
                      color: "var(--text-1)",
                    }}
                  >
                    Quick start
                  </h2>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-3)" }}>
                    {role === "organiser" ? "Run a session in order." : "Find your way onto court."}
                  </p>
                </div>
              </div>
              <ol
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "grid",
                  gap: "0.625rem",
                }}
              >
                {QUICK_START[role].map((item, index) => (
                  <li
                    key={item}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr",
                      gap: "0.625rem",
                      alignItems: "start",
                      color: "var(--text-2)",
                      fontSize: "0.875rem",
                      lineHeight: 1.45,
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        background: index === 0 ? "var(--ink-800)" : "var(--surface-sunken)",
                        color: index === 0 ? "var(--volt-500)" : "var(--text-3)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.625rem",
                        fontWeight: 900,
                      }}
                    >
                      {index + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>

            <div
              style={{
                background: "var(--ink-800)",
                borderRadius: "var(--r-xl)",
                padding: "1rem",
                color: "var(--n-50)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--volt-500)",
                  marginBottom: "0.5rem",
                }}
              >
                When plans change
              </p>
              <p style={{ color: "rgba(246,248,244,0.72)", fontSize: "0.875rem", lineHeight: 1.55 }}>
                Current games stay put. Player and court changes are applied to the games that follow.
              </p>
            </div>
          </aside>

          <main style={{ display: "grid", gap: "0.875rem" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: "0.75rem",
                alignItems: "center",
              }}
            >
              <label style={{ position: "relative", display: "block" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 16,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-3)",
                    width: 18,
                    height: 18,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </span>
                <input
                  className="pb-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search guide..."
                  style={{ paddingLeft: 46 }}
                />
              </label>
              <Link
                href="/dashboard"
                style={{
                  minHeight: 52,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 1rem",
                  borderRadius: "var(--r-xl)",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  boxShadow: "var(--shadow-sm)",
                  whiteSpace: "nowrap",
                }}
              >
                Home
              </Link>
            </div>

            <div style={{ display: "grid", gap: "0.75rem" }}>
              {filteredSections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  open={!!openIds[section.id] || !!query.trim()}
                  onToggle={() => setOpenIds((current) => ({ ...current, [section.id]: !current[section.id] }))}
                />
              ))}
              {filteredSections.length === 0 && (
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-xl)",
                    padding: "1.25rem",
                    color: "var(--text-2)",
                    textAlign: "center",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  No guide entries match that search.
                </div>
              )}
            </div>

            <section
              style={{
                display: "grid",
                gap: "0.75rem",
                marginTop: "0.25rem",
              }}
            >
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.625rem",
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                    marginBottom: "0.375rem",
                  }}
                >
                  Troubleshooting
                </p>
                <h2
                  style={{
                    fontFamily: "var(--font-display-tight)",
                    fontSize: "1.25rem",
                    fontWeight: 900,
                    color: "var(--text-1)",
                  }}
                >
                  Fast fixes during play
                </h2>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                  gap: "0.75rem",
                }}
              >
                {TROUBLESHOOTING.map((item) => (
                  <article
                    key={item.title}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-xl)",
                      padding: "1rem",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "0.9375rem",
                        fontWeight: 900,
                        color: "var(--text-1)",
                        marginBottom: "0.375rem",
                      }}
                    >
                      {item.title}
                    </h3>
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.55, color: "var(--text-2)" }}>
                      {item.body}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <footer className="pb-help-legal">
              <span>Xpandedge Pty Ltd</span>
              <LegalLinks compact />
            </footer>
          </main>
        </section>
      </div>
    </div>
  );
}
