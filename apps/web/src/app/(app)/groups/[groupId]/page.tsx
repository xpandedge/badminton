"use client";

import { useEffect, useRef, useState, use } from "react";
import { useGroupRole } from "@/lib/groups/useGroupRole";
import { canManageGroup } from "@picklebaddies/domain";
import { getGroup, watchGroupMembers, watchJoinRequests, watchGroupDoc, type JoinRequest } from "@/lib/groups/groups";
import { watchGroupPlayers } from "@/lib/players/players";
import { addVenue, addCourt, watchCourts, watchVenues } from "@/lib/groups/venues";
import { type GroupRole } from "@picklebaddies/domain";
import { watchGroupSessions, type SessionSummary } from "@/lib/sessions/sessions";
import { useAuth } from "@/lib/auth/useAuth";
import { rsvpToSession, deleteSession, getGroupSessionsAction } from "@/server/sessions/actions";
import { addMemberToSquad, addGuestPlayerToSquad, approveJoinRequest, rejectJoinRequest, rotateInviteCode, removePlayerFromSquad } from "@/server/squads/actions";
import { searchUsers, type UserSearchResult } from "@/server/users/actions";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getApp } from "firebase/app";

type VenueRow = { id: string; name: string };
type CourtRow = { id: string; name?: string; courtNumber?: number; isActive?: boolean };
type PlayerRow = { id: string; userId?: string | null; displayName: string; email: string | null; skillLevel?: string; isGuest?: boolean };
type MemberRow = { userId: string; role: string; displayName?: string; email?: string };

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  owner:     { bg: "var(--volt-500)",       color: "var(--ink-800)" },
  organiser: { bg: "var(--ink-800)",        color: "var(--volt-500)" },
  member:    { bg: "var(--surface-sunken)", color: "var(--text-2)" },
};

export default function GroupDetailsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const role = useGroupRole(groupId);

  const [group, setGroup] = useState<{ name: string; description: string | null } | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [courtsByVenue, setCourtsByVenue] = useState<Record<string, CourtRow[]>>({});

  // Member add state — combobox search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newMemberRole, setNewMemberRole] = useState<Exclude<GroupRole, "owner">>("member");
  const [memberAddError, setMemberAddError] = useState<string | null>(null);
  const [memberAddSuccess, setMemberAddSuccess] = useState<string | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guest player add state
  const [guestName, setGuestName] = useState("");
  const [guestSkill, setGuestSkill] = useState("unknown");
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [guestAddError, setGuestAddError] = useState<string | null>(null);
  const [guestAddSuccess, setGuestAddSuccess] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"member" | "guest">("guest");

  // Venue add state
  const [venueName, setVenueName] = useState("");
  const [courtNames, setCourtNames] = useState<Record<string, string>>({});
  const [courtNumbers, setCourtNumbers] = useState<Record<string, number>>({});

  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionFilter, setSessionFilter] = useState<"all" | "upcoming" | "active" | "past">("upcoming");
  const [activeTab, setActiveTab] = useState<"members" | "sessions">("members");

  // Self-join: invite code + incoming requests
  const [inviteCode, setInviteCode] = useState<string | undefined>(undefined);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [resolvingReq, setResolvingReq] = useState<string | null>(null);

  // RSVP tracking: map of sessionId → current user's status
  const [rsvpStatus, setRsvpStatus] = useState<Record<string, "going" | "not_going" | null>>({});
  const [rsvpLoading, setRsvpLoading] = useState<Set<string>>(new Set());
  const [rsvpToast, setRsvpToast] = useState<Record<string, string>>({});

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard?.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };
  const handleRotateCode = async () => {
    setRotating(true);
    const res = await rotateInviteCode(groupId).catch(() => null);
    if (res?.ok) setInviteCode(res.data.inviteCode);
    setRotating(false);
  };
  const handleApprove = async (uid: string) => {
    setResolvingReq(uid);
    await approveJoinRequest(groupId, uid).catch(() => null);
    setResolvingReq(null);
  };
  const handleReject = async (uid: string) => {
    setResolvingReq(uid);
    await rejectJoinRequest(groupId, uid).catch(() => null);
    setResolvingReq(null);
  };
  const handleRemovePlayer = async (targetId: string, name: string) => {
    if (!confirm(`Remove ${name} from this squad?`)) return;
    await removePlayerFromSquad(groupId, targetId).catch((e) => alert(e.message));
  };
  const handleRsvp = async (sessionId: string, status: "going" | "not_going") => {
    // Prevent double-click
    if (rsvpLoading.has(sessionId)) return;
    // Optimistic update
    const prev = rsvpStatus[sessionId] ?? null;
    setRsvpStatus((s) => ({ ...s, [sessionId]: status }));
    setRsvpLoading((s) => { const n = new Set(s); n.add(sessionId); return n; });
    setRsvpToast((t) => ({ ...t, [sessionId]: "" }));

    const res = await rsvpToSession(sessionId, status).catch((e) => ({ ok: false as const, message: e.message }));

    setRsvpLoading((s) => { const n = new Set(s); n.delete(sessionId); return n; });
    if (res && !res.ok) {
      // Rollback optimistic update on error
      setRsvpStatus((s) => ({ ...s, [sessionId]: prev }));
      setRsvpToast((t) => ({ ...t, [sessionId]: res.message || "Failed to update RSVP" }));
    } else {
      setRsvpToast((t) => ({ ...t, [sessionId]: status === "going" ? "✅ You're in!" : "👋 Marked as not playing" }));
      setTimeout(() => setRsvpToast((t) => { const n = { ...t }; delete n[sessionId]; return n; }), 2500);
    }
  };
  const handleCancelSession = async (sessionId: string, sessionName: string) => {
    if (!confirm(`Cancel session "${sessionName}"?`)) return;
    await deleteSession(sessionId).catch((e) => alert(e.message));
  };

  useEffect(() => {
    if (!groupId) return;
    void getGroup(groupId).then((g) => {
      if (g) setGroup(g);
    });

    // 1. Immediate initial load via server action (bypass security rules / offline delays)
    void getGroupSessionsAction(groupId).then((res) => {
      if (res.ok && res.data.length > 0) setSessions(res.data as any);
    });

    // 2. Realtime updates via client SDK
    const unsubPlayers = watchGroupPlayers(groupId, (p) => setPlayers(p as PlayerRow[]), () => setPlayers([]));
    const unsubMembers = watchGroupMembers(groupId, (m) => setMembers(m as unknown as MemberRow[]), () => setMembers([]));
    const unsubVenues = watchVenues(groupId, setVenues, () => setVenues([]));
    const unsubSessions = watchGroupSessions(groupId, (sList) => {
      if (sList.length > 0) setSessions(sList);
    }, () => {});
    const unsubGroupDoc = watchGroupDoc(groupId, (g) => setInviteCode(g?.inviteCode), () => {});
    const unsubRequests = watchJoinRequests(groupId, setJoinRequests, () => setJoinRequests([]));

    return () => {
      unsubPlayers();
      unsubMembers();
      unsubVenues();
      unsubSessions();
      unsubGroupDoc();
      unsubRequests();
    };
  }, [groupId]);

  // Load existing RSVP statuses for the current user whenever sessions change
  useEffect(() => {
    if (!user?.uid || sessions.length === 0) return;
    const db = getFirestore(getApp());
    const upcoming = sessions.filter((s) => s.status === "scheduled" || s.status === "draft" || s.status === "active");
    Promise.all(
      upcoming.map(async (s) => {
        try {
          const snap = await getDoc(doc(db, `sessions/${s.id}/rsvps/${user.uid}`));
          return { id: s.id, status: snap.exists() ? (snap.data().status as "going" | "not_going") : null };
        } catch {
          return { id: s.id, status: null };
        }
      })
    ).then((results) => {
      setRsvpStatus((prev) => {
        const next = { ...prev };
        results.forEach(({ id, status }) => { next[id] = status; });
        return next;
      });
    });
  }, [sessions, user?.uid]);

  useEffect(() => {
    if (!groupId || venues.length === 0) {
      setCourtsByVenue({});
      return;
    }
    const unsubs = venues.map((venue) =>
      watchCourts(groupId, venue.id, (courts) => {
        setCourtsByVenue((prev) => ({
          ...prev,
          [venue.id]: (courts as CourtRow[]).sort((a, b) => (a.courtNumber ?? 0) - (b.courtNumber ?? 0)),
        }));
      }, () => {
        setCourtsByVenue((prev) => ({ ...prev, [venue.id]: [] }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [groupId, venues]);

  if (!group) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.25rem" }}>
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)", padding: "1.5rem", boxShadow: "var(--shadow-sm)",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Loading group
          </span>
        </div>
      </div>
    );
  }

  // Build a role lookup from the members collection
  const roleByUserId = new Map(members.map((m) => [m.userId, m.role]));

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    setSelectedUser(null);
    setMemberAddError(null);
    setMemberAddSuccess(null);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      const res = await searchUsers(value.trim()).catch(() => null);
      setIsSearching(false);
      if (res?.ok) {
        setSearchResults(res.data);
        setShowDropdown(res.data.length > 0);
      }
    }, 300);
  }

  function handleSelectUser(u: UserSearchResult) {
    setSelectedUser(u);
    setSearchQuery(u.displayName || u.email || "");
    setShowDropdown(false);
    setSearchResults([]);
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || isAddingMember) return;
    setIsAddingMember(true);
    setMemberAddError(null);
    setMemberAddSuccess(null);
    const result = await addMemberToSquad(groupId, selectedUser.email ?? "", newMemberRole).catch(() => null);
    if (!result || !result.ok) {
      setMemberAddError(result?.message ?? "Could not add member. Please try again.");
    } else {
      setMemberAddSuccess(`${selectedUser.displayName || selectedUser.email} added as ${newMemberRole}.`);
      setSelectedUser(null);
      setSearchQuery("");
    }
    setIsAddingMember(false);
  };

  const handleAddGuestPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || isAddingGuest) return;
    setIsAddingGuest(true);
    setGuestAddError(null);
    setGuestAddSuccess(null);
    const result = await addGuestPlayerToSquad({ squadId: groupId, displayName: guestName, skillLevel: guestSkill }).catch(() => null);
    if (!result || !result.ok) {
      setGuestAddError(result?.message ?? "Could not add guest player. Please try again.");
    } else {
      setGuestAddSuccess(`"${guestName.trim()}" added as a guest player.`);
      setGuestName("");
      setGuestSkill("unknown");
    }
    setIsAddingGuest(false);
  };

  const handleAddVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueName.trim()) return;
    await addVenue(groupId, venueName);
    setVenueName("");
  };

  const handleAddCourt = async (e: React.FormEvent, venueId: string) => {
    e.preventDefault();
    const name = courtNames[venueId]?.trim();
    if (!name) return;
    const fallbackNumber = (courtsByVenue[venueId]?.length ?? 0) + 1;
    const courtNumber = courtNumbers[venueId] || fallbackNumber;
    await addCourt(groupId, venueId, name, courtNumber);
    setCourtNames((prev) => ({ ...prev, [venueId]: "" }));
    setCourtNumbers((prev) => ({ ...prev, [venueId]: courtNumber + 1 }));
  };

  return (
    <div style={{
      maxWidth: 1040, margin: "0 auto",
      padding: "1.25rem 1.25rem 2rem",
      display: "flex", flexDirection: "column", gap: "1rem",
    }}>

      {/* Hero */}
      <section style={{
        background: "var(--ink-800)", borderRadius: "var(--r-2xl)",
        padding: "1.5rem", color: "var(--text-inverse)",
        position: "relative", overflow: "hidden",
        animation: "pb-rise 400ms var(--ease-out) both",
      }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: "repeating-linear-gradient(45deg,rgba(198,241,53,0.055) 0 1px,transparent 1px 18px),repeating-linear-gradient(-45deg,rgba(198,241,53,0.055) 0 1px,transparent 1px 18px)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", display: "grid", gap: "1.25rem" }}>
          <div>
            <span style={{
              display: "inline-flex", padding: "3px 10px",
              borderRadius: "var(--r-pill)", background: "var(--volt-500)",
              color: "var(--ink-800)", fontFamily: "var(--font-mono)",
              fontSize: "0.625rem", fontWeight: 700,
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.875rem",
            }}>
              {role ?? "No role"}
            </span>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.75rem, 5vw, 2.75rem)",
              lineHeight: 1.02, textTransform: "uppercase",
              letterSpacing: "-0.025em", color: "var(--n-50)",
            }}>
              {group.name}
            </h1>
            {group.description && (
              <p style={{ color: "rgba(246,248,244,0.72)", marginTop: "0.5rem", maxWidth: 620 }}>
                {group.description}
              </p>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem" }}>
            {[
              ["Members", members.length],
              ["Venues", venues.length],
              ["Courts", Object.values(courtsByVenue).reduce((sum, c) => sum + c.length, 0)],
            ].map(([label, value]) => (
              <div key={label as string} style={{
                background: "rgba(246,248,244,0.08)", border: "1px solid rgba(246,248,244,0.12)",
                borderRadius: "var(--r-xl)", padding: "1rem",
              }}>
                <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "2rem", fontWeight: 900, color: "var(--volt-500)", lineHeight: 1 }}>
                  {value as number}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>
                  {label as string}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {(["members", "sessions"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              height: 38, padding: "0 1rem", border: "none",
              borderRadius: "var(--r-pill)",
              background: activeTab === tab ? "var(--ink-800)" : "var(--surface)",
              color: activeTab === tab ? "var(--volt-500)" : "var(--text-2)",
              fontFamily: "var(--font-mono)", fontSize: "0.6875rem",
              fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
              cursor: "pointer", boxShadow: "var(--shadow-sm)",
            }}
          >
            {tab === "members" ? "Members" : "Sessions"}
          </button>
        ))}
      </div>

      {activeTab === "members" && (
        <>
          {/* Upcoming Sessions & RSVPs Banner for members & owners */}
          {(() => {
            const upcomingSessions = sessions.filter(
              (s) => s.status === "scheduled" || s.status === "draft" || s.status === "active"
            );
            if (upcomingSessions.length === 0) return null;

            return (
              <section style={{
                background: "var(--ink-800)", borderRadius: "var(--r-2xl)",
                padding: "1.25rem 1.5rem", color: "var(--n-50)",
                boxShadow: "var(--shadow-sm)", animation: "pb-rise 400ms 30ms var(--ease-out) both",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "0.875rem" }}>
                  <div>
                    <span style={{
                      display: "inline-flex", padding: "3px 9px", borderRadius: "var(--r-pill)",
                      background: "var(--volt-500)", color: "var(--ink-800)",
                      fontFamily: "var(--font-mono)", fontSize: "0.625rem", fontWeight: 900,
                      letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.375rem",
                    }}>
                      Upcoming Sessions & RSVPs
                    </span>
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.375rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
                      Next Session Schedule
                    </h2>
                  </div>
                </div>

                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {upcomingSessions.map((s: any) => {
                    const dateObj = s.startsAt && typeof s.startsAt.toDate === "function" ? s.startsAt.toDate() : null;
                    const ts = dateObj
                      ? dateObj.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : "Scheduled";
                    const goingCount = s.rsvpGoingCount ?? 0;
                    const notGoingCount = s.rsvpNotGoingCount ?? 0;

                    return (
                      <div key={s.id} style={{
                        background: "rgba(246,248,244,0.08)", border: "1px solid rgba(246,248,244,0.14)",
                        borderRadius: "var(--r-xl)", padding: "1rem",
                        display: "grid", gap: "0.75rem",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.125rem", fontWeight: 900, color: "var(--n-50)" }}>
                              {s.name}
                            </div>
                            <div style={{ color: "rgba(246,248,244,0.7)", fontSize: "0.8125rem", marginTop: 2 }}>
                              📍 {s.venueName || "Home Venue"} · {ts}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{
                              padding: "4px 10px", borderRadius: "var(--r-pill)",
                              background: "var(--volt-500)", color: "var(--ink-800)",
                              fontFamily: "var(--font-mono)", fontSize: "0.6875rem", fontWeight: 900,
                            }}>
                              👍 {goingCount} Going · 👎 {notGoingCount} Not Going
                            </span>
                            <a href={`/sessions/${s.id}/live`} style={{
                              height: 34, padding: "0 0.875rem", borderRadius: "var(--r-md)",
                              background: "var(--n-50)", color: "var(--ink-800)", fontWeight: 900,
                              fontSize: "0.75rem", textDecoration: "none", display: "inline-flex", alignItems: "center",
                            }}>
                              Open →
                            </a>
                          </div>
                        </div>

                        {s.status !== "active" && (() => {
                          const myStatus = rsvpStatus[s.id] ?? null;
                          const isLoading = rsvpLoading.has(s.id);
                          const toast = rsvpToast[s.id];
                          return (
                            <div style={{ paddingTop: "0.625rem", borderTop: "1px solid rgba(246,248,244,0.12)" }}>
                              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(246,248,244,0.6)" }}>
                                  {myStatus ? "Change RSVP:" : "Your RSVP:"}
                                </span>
                                <button
                                  type="button"
                                  disabled={isLoading}
                                  onClick={() => handleRsvp(s.id, "going")}
                                  style={{
                                    height: 32, padding: "0 0.875rem", border: myStatus === "going" ? "2px solid var(--volt-500)" : "2px solid transparent",
                                    borderRadius: "var(--r-pill)",
                                    background: myStatus === "going" ? "var(--volt-500)" : "rgba(198,241,53,0.18)",
                                    color: myStatus === "going" ? "var(--ink-800)" : "var(--volt-500)",
                                    fontWeight: 900, fontSize: "0.75rem",
                                    cursor: isLoading ? "default" : "pointer",
                                    opacity: isLoading ? 0.6 : 1,
                                    transition: "all 0.15s ease",
                                    boxShadow: myStatus === "going" ? "0 0 0 3px rgba(198,241,53,0.25)" : "none",
                                  }}
                                >
                                  {isLoading ? "…" : myStatus === "going" ? "✅ I'm Playing" : "👍 I'm Playing"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isLoading}
                                  onClick={() => handleRsvp(s.id, "not_going")}
                                  style={{
                                    height: 32, padding: "0 0.875rem",
                                    border: myStatus === "not_going" ? "2px solid rgba(246,248,244,0.6)" : "2px solid rgba(246,248,244,0.2)",
                                    borderRadius: "var(--r-pill)",
                                    background: myStatus === "not_going" ? "rgba(246,248,244,0.15)" : "transparent",
                                    color: "var(--n-50)", fontWeight: myStatus === "not_going" ? 900 : 800, fontSize: "0.75rem",
                                    cursor: isLoading ? "default" : "pointer",
                                    opacity: isLoading ? 0.6 : 1,
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  {isLoading ? "…" : myStatus === "not_going" ? "❌ Not Playing" : "👎 Not Playing"}
                                </button>
                              </div>
                              {toast && (
                                <div style={{
                                  marginTop: "0.5rem",
                                  fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 700,
                                  color: toast.startsWith("✅") ? "var(--volt-500)" : "rgba(246,100,100,0.9)",
                                }}>
                                  {toast}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}
          {/* Pending join requests — any member can approve/reject */}
          {joinRequests.length > 0 && (
            <section data-testid="join-requests" style={{
              background: "var(--surface)", border: "1px solid var(--volt-500)",
              borderRadius: "var(--r-xl)", padding: "1rem", boxShadow: "var(--shadow-sm)",
              animation: "pb-rise 400ms 40ms var(--ease-out) both",
            }}>
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
                Join requests <span style={{ color: "var(--volt-600)" }}>({joinRequests.length})</span>
              </h2>
              <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "0.875rem" }}>People asking to join this squad.</p>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {joinRequests.map((r) => (
                  <div key={r.userId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.5rem", alignItems: "center", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.625rem 0.75rem" }}>
                    <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.displayName}</span>
                    <button
                      onClick={() => handleApprove(r.userId)}
                      disabled={resolvingReq === r.userId}
                      style={{ height: 34, padding: "0 0.75rem", border: "none", borderRadius: "var(--r-md)", background: "var(--volt-500)", color: "var(--ink-800)", fontWeight: 900, cursor: "pointer", fontSize: "0.8125rem" }}
                    >
                      {resolvingReq === r.userId ? "…" : "Approve"}
                    </button>
                    <button
                      onClick={() => handleReject(r.userId)}
                      disabled={resolvingReq === r.userId}
                      style={{ height: 34, padding: "0 0.625rem", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--danger)", fontWeight: 800, cursor: "pointer", fontSize: "0.8125rem" }}
                    >
                      Decline
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Invite code — share to let players join directly */}
          {inviteCode && (
            <section style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)", padding: "1rem", boxShadow: "var(--shadow-sm)",
              animation: "pb-rise 400ms 50ms var(--ease-out) both",
            }}>
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>Invite code</h2>
              <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "0.875rem" }}>Share this code — anyone who enters it joins instantly.</p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "0.15em", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0.5rem 1rem", color: "var(--text-1)" }}>
                  {inviteCode}
                </code>
                <button onClick={handleCopyCode} style={{ height: 44, padding: "0 1rem", border: "none", borderRadius: "var(--r-md)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer" }}>
                  {copiedCode ? "Copied!" : "Copy"}
                </button>
                {canManageGroup(role) && (
                  <button onClick={handleRotateCode} disabled={rotating} style={{ height: 44, padding: "0 0.875rem", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--text-2)", fontWeight: 800, cursor: "pointer", fontSize: "0.8125rem" }}>
                    {rotating ? "…" : "New code"}
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Add member — searchable combobox, owner only */}
          {canManageGroup(role) && (
            <section style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)", padding: "1rem", boxShadow: "var(--shadow-sm)",
              animation: "pb-rise 400ms 60ms var(--ease-out) both",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "var(--r-lg)",
                  background: "var(--volt-500)", display: "grid", placeItems: "center", flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-800)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M19 8v6" /><path d="M22 11h-6" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                    Add Player
                  </h2>
                  {/* Mode toggle */}
                  <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.375rem" }}>
                    {(["guest", "member"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setAddMode(mode)}
                        style={{
                          height: 28, padding: "0 0.75rem",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--r-pill)",
                          background: addMode === mode ? "var(--ink-800)" : "var(--surface-sunken)",
                          color: addMode === mode ? "var(--volt-500)" : "var(--text-3)",
                          fontFamily: "var(--font-mono)", fontSize: "0.625rem",
                          fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                          cursor: "pointer",
                        }}
                      >
                        {mode === "guest" ? "⚡ Guest (no sign-up)" : "🔗 Linked Account"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Guest player form */}
              {addMode === "guest" && (
                <form onSubmit={handleAddGuestPlayer} style={{ display: "grid", gap: "0.625rem" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                    Add anyone by name — no email or account needed. Great for walk-ins and testing.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(130px, 160px) auto", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      data-testid="guest-name-input"
                      className="pb-input"
                      type="text"
                      placeholder="Player name (e.g. John S.)"
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      required
                      style={{ height: 46, borderRadius: "var(--r-md)" }}
                    />
                    <select
                      className="pb-input"
                      value={guestSkill}
                      onChange={e => setGuestSkill(e.target.value)}
                      style={{ height: 46, borderRadius: "var(--r-md)" }}
                    >
                      <option value="unknown">Skill: Unknown</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                    <button
                      data-testid="guest-add-submit"
                      type="submit"
                      disabled={!guestName.trim() || isAddingGuest}
                      style={{
                        height: 46, padding: "0 1.25rem", border: "none",
                        borderRadius: "var(--r-md)", background: "var(--ink-800)",
                        color: "var(--volt-500)", fontWeight: 800,
                        opacity: guestName.trim() && !isAddingGuest ? 1 : 0.5,
                        cursor: guestName.trim() && !isAddingGuest ? "pointer" : "default",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isAddingGuest ? "Adding…" : "Add Guest →"}
                    </button>
                  </div>
                  {(guestAddError || guestAddSuccess) && (
                    <p style={{
                      borderRadius: "var(--r-md)", padding: "0.75rem",
                      background: guestAddError ? "var(--danger-bg)" : "rgba(198,241,53,0.18)",
                      color: guestAddError ? "var(--danger)" : "var(--ink-800)",
                      fontWeight: 800, fontSize: "0.875rem",
                    }}>
                      {guestAddError ?? guestAddSuccess}
                    </p>
                  )}
                </form>
              )}

              {/* Linked account (existing) member search form */}
              {addMode === "member" && (
                <form onSubmit={handleAddMember} style={{ display: "grid", gap: "0.625rem" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                    Search by name or email — they must have signed up first.
                  </p>
                {/* Search input + dropdown */}
                <div style={{ position: "relative" }}>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      data-testid="member-search-input"
                      className="pb-input"
                      type="text"
                      placeholder="Search by name or email…"
                      value={searchQuery}
                      onChange={e => handleSearchInput(e.target.value)}
                      onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                      autoComplete="off"
                      style={{ height: 46, borderRadius: "var(--r-md)", paddingRight: "2.5rem", width: "100%" }}
                    />
                    {/* State indicator: spinner / check / search icon */}
                    <div style={{ position: "absolute", right: "0.75rem", pointerEvents: "none", color: "var(--text-3)", display: "flex" }}>
                      {isSearching ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ animation: "spin 0.8s linear infinite" }}>
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                      ) : selectedUser ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--volt-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Dropdown results */}
                  {showDropdown && searchResults.length > 0 && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)",
                      zIndex: 50, overflow: "hidden",
                    }}>
                      {searchResults.map((u, i) => (
                        <button
                          key={u.uid}
                          data-testid="member-search-result"
                          type="button"
                          onMouseDown={() => handleSelectUser(u)}
                          style={{
                            display: "flex", alignItems: "center", gap: "0.75rem",
                            width: "100%", padding: "0.75rem 1rem",
                            border: "none", borderBottom: i < searchResults.length - 1 ? "1px solid var(--border)" : "none",
                            background: "transparent", cursor: "pointer", textAlign: "left",
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-sunken)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{
                            width: 34, height: 34, borderRadius: "var(--r-md)",
                            background: "var(--ink-800)", color: "var(--volt-500)",
                            display: "grid", placeItems: "center",
                            fontWeight: 900, fontSize: "0.875rem", flexShrink: 0,
                          }}>
                            {(u.displayName || u.email || "?").charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: "0.9375rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {u.displayName || "(no name)"}
                            </div>
                            <div style={{ color: "var(--text-3)", fontSize: "0.8125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {u.email}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected user preview + role + submit */}
                {selectedUser && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(140px, 180px) auto", gap: "0.625rem", alignItems: "center" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: "0.625rem",
                      padding: "0.625rem 0.875rem",
                      background: "rgba(198,241,53,0.12)", border: "1.5px solid var(--volt-500)",
                      borderRadius: "var(--r-md)",
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "var(--r-sm)",
                        background: "var(--ink-800)", color: "var(--volt-500)",
                        display: "grid", placeItems: "center", fontWeight: 900, fontSize: "0.75rem", flexShrink: 0,
                      }}>
                        {(selectedUser.displayName || selectedUser.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {selectedUser.displayName || "(no name)"}
                        </div>
                        <div style={{ color: "var(--text-3)", fontSize: "0.75rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {selectedUser.email}
                        </div>
                      </div>
                    </div>
                    <select
                      className="pb-input"
                      value={newMemberRole}
                      onChange={e => setNewMemberRole(e.target.value as Exclude<GroupRole, "owner">)}
                      style={{ height: 46, borderRadius: "var(--r-md)" }}
                    >
                      <option value="member">Member</option>
                      <option value="organiser">Organiser</option>
                    </select>
                    <button
                      data-testid="member-add-submit"
                      type="submit"
                      disabled={isAddingMember}
                      style={{
                        height: 46, padding: "0 1.25rem", border: "none",
                        borderRadius: "var(--r-md)", background: "var(--ink-800)",
                        color: "var(--volt-500)", fontWeight: 800,
                        opacity: isAddingMember ? 0.55 : 1,
                        cursor: isAddingMember ? "default" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isAddingMember ? "Adding…" : "Add →"}
                    </button>
                  </div>
                )}
              </form>
              )}

              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </section>
          )}

          {/* Members list */}
          <section style={{ animation: "pb-rise 400ms 90ms var(--ease-out) both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                Members
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>
                {players.length} total
              </span>
            </div>

            {players.length === 0 ? (
              <div style={{
                background: "var(--surface)", border: "2px dashed var(--border)",
                borderRadius: "var(--r-xl)", padding: "2rem 1.25rem", textAlign: "center",
              }}>
                <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, marginBottom: "0.375rem" }}>
                  No members yet
                </h3>
                <p style={{ color: "var(--text-2)" }}>
                  {canManageGroup(role)
                    ? "Add members above — they'll appear here once they sign up."
                    : "No members in this team yet."}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.625rem" }}>
                {players.map((p, i) => {
                  const initial = p.displayName?.[0]?.toUpperCase() ?? "?";
                  const memberRole = p.userId ? roleByUserId.get(p.userId) : undefined;
                  const roleStyle = memberRole ? (ROLE_STYLE[memberRole] ?? ROLE_STYLE.member) : null;
                  return (
                    <div key={p.id} data-testid="member-list-item" style={{
                      display: "grid",
                      gridTemplateColumns: "auto minmax(0, 1fr) auto",
                      alignItems: "center", gap: "0.75rem",
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: "var(--r-xl)", padding: "0.75rem",
                      boxShadow: "var(--shadow-xs)",
                      animation: `pb-rise 400ms ${120 + i * 30}ms var(--ease-out) both`,
                    }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: "var(--r-md)",
                        background: "var(--ink-800)", color: "var(--volt-500)",
                        display: "grid", placeItems: "center", fontWeight: 900, flexShrink: 0,
                      }}>
                        {initial}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.displayName}
                        </div>
                        <div style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>{p.email ?? "No email"}</div>
                      </div>
                      <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", flexShrink: 0 }}>
                        {p.isGuest && (
                          <span style={{
                            padding: "3px 8px", borderRadius: "var(--r-pill)",
                            background: "rgba(198,241,53,0.15)", color: "var(--ink-800)",
                            border: "1px solid var(--volt-500)",
                            fontSize: "0.6875rem", fontWeight: 800, letterSpacing: "0.05em",
                            textTransform: "uppercase",
                          }}>
                            Guest
                          </span>
                        )}
                        {p.skillLevel && p.skillLevel !== "unknown" && (
                          <span style={{
                            padding: "3px 8px", borderRadius: "var(--r-pill)",
                            background: "var(--surface-sunken)", color: "var(--text-2)",
                            fontSize: "0.75rem", fontWeight: 700,
                          }}>
                            {p.skillLevel}
                          </span>
                        )}
                        {roleStyle && memberRole && (
                          <span style={{
                            padding: "3px 8px", borderRadius: "var(--r-pill)",
                            background: roleStyle.bg, color: roleStyle.color,
                            fontSize: "0.75rem", fontWeight: 800,
                            textTransform: "capitalize",
                          }}>
                            {memberRole}
                          </span>
                        )}
                        {canManageGroup(role) && memberRole !== "owner" && (
                          <button
                            type="button"
                            onClick={() => handleRemovePlayer(p.id, p.displayName)}
                            style={{
                              height: 30, padding: "0 0.5rem", border: "1px solid var(--border)",
                              borderRadius: "var(--r-md)", background: "transparent",
                              color: "var(--danger)", fontSize: "0.6875rem", fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Venues section — organiser only */}
          {canManageGroup(role) && (
            <section style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)", padding: "1rem", boxShadow: "var(--shadow-sm)",
              animation: "pb-rise 400ms 150ms var(--ease-out) both",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                    Venues
                  </h2>
                  <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Saved venues and courts for quick session setup.</p>
                </div>
                <form onSubmit={handleAddVenue} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <input
                    className="pb-input"
                    type="text"
                    placeholder="Venue name"
                    value={venueName}
                    onChange={e => setVenueName(e.target.value)}
                    required
                    style={{ height: 44, borderRadius: "var(--r-md)", width: 220 }}
                  />
                  <button
                    type="submit"
                    disabled={!venueName.trim()}
                    style={{
                      height: 44, padding: "0 1rem", border: "none",
                      borderRadius: "var(--r-md)", background: "var(--ink-800)",
                      color: "var(--volt-500)", fontWeight: 800,
                      opacity: venueName.trim() ? 1 : 0.55, cursor: venueName.trim() ? "pointer" : "default",
                    }}
                  >
                    Add Venue
                  </button>
                </form>
              </div>

              {venues.length === 0 ? (
                <div style={{ border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", color: "var(--text-2)", textAlign: "center" }}>
                  No saved venues.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "0.75rem" }}>
                  {venues.map((venue) => {
                    const courts = courtsByVenue[venue.id] ?? [];
                    const nextNumber = courts.length + 1;
                    return (
                      <div key={venue.id} style={{ border: "1px solid var(--border)", padding: "1rem", borderRadius: "var(--r-xl)", background: "var(--surface-sunken)" }}>
                        <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", fontWeight: 900, marginBottom: "0.625rem" }}>{venue.name}</h3>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.75rem" }}>
                          {courts.map((court) => (
                            <span key={court.id} style={{
                              padding: "4px 8px", borderRadius: "var(--r-pill)",
                              background: court.isActive === false ? "var(--n-200)" : "var(--white)",
                              color: "var(--text-2)", fontSize: "0.75rem", fontWeight: 700,
                            }}>
                              {court.name ?? `Court ${court.courtNumber ?? ""}`}
                            </span>
                          ))}
                          {courts.length === 0 && <span style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>No courts</span>}
                        </div>
                        <form onSubmit={(e) => handleAddCourt(e, venue.id)} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 72px auto", gap: "0.5rem" }}>
                          <input
                            className="pb-input" type="text"
                            placeholder={`Court ${nextNumber}`}
                            value={courtNames[venue.id] ?? ""}
                            onChange={(e) => setCourtNames((prev) => ({ ...prev, [venue.id]: e.target.value }))}
                            required style={{ height: 42, borderRadius: "var(--r-md)" }}
                          />
                          <input
                            className="pb-input" type="number" min={1}
                            value={courtNumbers[venue.id] ?? nextNumber}
                            onChange={(e) => setCourtNumbers((prev) => ({ ...prev, [venue.id]: Number(e.target.value) }))}
                            aria-label="Court number"
                            required style={{ height: 42, borderRadius: "var(--r-md)", padding: "0 0.5rem" }}
                          />
                          <button
                            type="submit"
                            disabled={!(courtNames[venue.id] ?? "").trim()}
                            style={{
                              height: 42, padding: "0 0.875rem", border: "none",
                              borderRadius: "var(--r-md)", background: "var(--ink-800)",
                              color: "var(--volt-500)", fontWeight: 800,
                              opacity: (courtNames[venue.id] ?? "").trim() ? 1 : 0.55,
                            }}
                          >
                            Add
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {activeTab === "sessions" && (
        <section style={{ display: "grid", gap: "0.875rem" }}>
          {/* Filter chips */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(["upcoming", "all", "active", "past"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSessionFilter(f)}
                style={{
                  height: 34, padding: "0 0.875rem",
                  border: "1px solid var(--border)", borderRadius: "var(--r-pill)",
                  background: sessionFilter === f ? "var(--volt-500)" : "var(--surface)",
                  color: sessionFilter === f ? "var(--ink-800)" : "var(--text-2)",
                  fontFamily: "var(--font-mono)", fontSize: "0.625rem",
                  fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
                }}
              >
                {f === "upcoming" ? `Upcoming (${sessions.filter(s => s.status === "scheduled" || s.status === "draft").length})` : f === "all" ? "All Sessions" : f === "active" ? "Live" : "Past"}
              </button>
            ))}
          </div>

          {(() => {
            const filtered = sessions.filter((s) => {
              if (sessionFilter === "all") return s.status !== "cancelled";
              if (sessionFilter === "active") return s.status === "active";
              if (sessionFilter === "upcoming") return s.status === "scheduled" || s.status === "draft";
              return s.status === "completed" || s.status === "cancelled";
            });

            if (filtered.length === 0) {
              return (
                <div style={{ border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "2rem", textAlign: "center", color: "var(--text-2)" }}>
                  No {sessionFilter === "all" ? "" : sessionFilter} sessions found.
                </div>
              );
            }

            return (
              <div style={{ display: "grid", gap: "0.625rem" }}>
                {filtered.map((s: any) => {
                  const dateObj = s.startsAt && typeof s.startsAt.toDate === "function" ? s.startsAt.toDate() : null;
                  const ts = dateObj
                    ? dateObj.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : "";
                  const statusTone = s.status === "active"
                    ? { bg: "var(--volt-500)", fg: "var(--ink-800)" }
                    : s.status === "completed"
                      ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" }
                      : { bg: "var(--surface-sunken)", fg: "var(--text-3)" };

                  const goingCount = s.rsvpGoingCount ?? 0;
                  const notGoingCount = s.rsvpNotGoingCount ?? 0;
                  const isUpcoming = s.status === "scheduled" || s.status === "draft";

                  return (
                    <div key={s.id} data-testid="session-list-item" style={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: "var(--r-xl)", padding: "1rem",
                      boxShadow: "var(--shadow-xs)",
                      display: "grid", gap: "0.75rem",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                            <span style={{
                              padding: "2px 7px", borderRadius: "var(--r-pill)",
                              background: statusTone.bg, color: statusTone.fg,
                              fontFamily: "var(--font-mono)", fontSize: "0.5625rem",
                              fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                            }}>
                              {s.status}
                            </span>
                            {isUpcoming && (
                              <span style={{
                                padding: "2px 7px", borderRadius: "var(--r-pill)",
                                background: "rgba(198,241,53,0.15)", color: "var(--ink-800)",
                                fontFamily: "var(--font-mono)", fontSize: "0.625rem", fontWeight: 800,
                              }}>
                                👍 {goingCount} Going · 👎 {notGoingCount} Not Going
                              </span>
                            )}
                          </div>
                          <div style={{ fontWeight: 900, fontSize: "1.125rem" }}>{s.name}</div>
                          <div style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "0.125rem" }}>
                            {s.venueName ? `${s.venueName} · ` : ""}{ts}
                          </div>
                        </div>

                        <a
                          href={`/sessions/${s.id}/live`}
                          style={{
                            height: 38, padding: "0 0.875rem", borderRadius: "var(--r-lg)",
                            background: "var(--ink-800)", color: "var(--volt-500)",
                            fontWeight: 800, fontSize: "0.8125rem",
                            textDecoration: "none", display: "inline-flex", alignItems: "center", flexShrink: 0,
                          }}
                        >
                          {s.status === "active" ? "Live Console" : "View Session"}
                        </a>
                      </div>

                      {/* RSVP Buttons for upcoming sessions */}
                      {isUpcoming && (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>
                            RSVP:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRsvp(s.id, "going")}
                            style={{
                              height: 32, padding: "0 0.75rem", border: "none",
                              borderRadius: "var(--r-pill)", background: "var(--volt-500)",
                              color: "var(--ink-800)", fontWeight: 900, fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            👍 I'm Playing
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRsvp(s.id, "not_going")}
                            style={{
                              height: 32, padding: "0 0.75rem", border: "1px solid var(--border)",
                              borderRadius: "var(--r-pill)", background: "var(--surface-sunken)",
                              color: "var(--text-2)", fontWeight: 800, fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            👎 Not Playing
                          </button>
                          {canManageGroup(role) && (
                            <button
                              type="button"
                              onClick={() => handleCancelSession(s.id, s.name)}
                              style={{
                                height: 32, padding: "0 0.625rem", border: "none",
                                borderRadius: "var(--r-pill)", background: "transparent",
                                color: "var(--danger)", fontWeight: 800, fontSize: "0.75rem",
                                cursor: "pointer", marginLeft: "auto",
                              }}
                            >
                              Cancel Session
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}
    </div>
  );
}
