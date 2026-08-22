"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGroupRole } from "@/lib/groups/useGroupRole";
import {
  canLeaveGroup,
  canManageAdmins,
  canManageGroup,
  canRemoveGroupMember,
  groupRoleLabel,
  normalizeGroupRole,
  getTimestampMillis,
  isSquadArchived,
  type GroupRole,
  type SquadPlayerKind,
} from "@picklebaddies/domain";
import { shareUrl } from "@/lib/config/site";
import { getGroup, watchGroupMembers, watchJoinRequests, watchGroupDoc, type JoinRequest } from "@/lib/groups/groups";
import type { GroupDocument } from "@/lib/groups/types";
import { watchGroupPlayers } from "@/lib/players/players";
import { watchCourts, watchVenues } from "@/lib/groups/venues";
import { watchGroupSessions, type SessionSummary } from "@/lib/sessions/sessions";
import { useAuth } from "@/lib/auth/useAuth";
import { rsvpToSession, deleteSession, getGroupSessionsAction } from "@/server/sessions/actions";
import { addMemberToSquad, addVenueToSquad, addCourtToSquadVenue, approveJoinRequest, rejectJoinRequest, archiveSquad, leaveSquad, restoreSquad, rotateInviteCode, removePlayerFromSquad, transferSquadOwnership, updateMemberRole, updateSquadPlayerKind, updateSquadRsvpDefaults } from "@/server/squads/actions";
import { searchUsers, type UserSearchResult } from "@/server/users/actions";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getApp } from "firebase/app";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { Toast, type ToastMessage } from "@/components/Toast";

type VenueRow = { id: string; name: string };
type CourtRow = { id: string; name?: string; courtNumber?: number; isActive?: boolean };
type PlayerRow = {
  id: string;
  userId?: string | null;
  displayName: string;
  email: string | null;
  skillLevel?: string;
  isGuest?: boolean;
  playerKind?: SquadPlayerKind;
  squadRating?: number;
  squadGrade?: string;
  squadGradedGames?: number;
  squadWins?: number;
  squadLosses?: number;
  squadPointsFor?: number;
  squadPointsAgainst?: number;
  squadPointDiff?: number;
};
type MemberRow = { userId: string; role: GroupRole; displayName?: string; email?: string };
type SquadRsvpDefaultsState = {
  totalPlayers: number;
  casualConfirmedSlots: number;
  waitlistEnabled: boolean;
  cutoffHoursBeforeStart: number | null;
};

const DEFAULT_SQUAD_RSVP_DEFAULTS: SquadRsvpDefaultsState = {
  totalPlayers: 11,
  casualConfirmedSlots: 3,
  waitlistEnabled: true,
  cutoffHoursBeforeStart: null,
};

function formatArchiveDeadline(value: unknown): string {
  const milliseconds = getTimestampMillis(value);
  if (milliseconds === null) return "the end of the restore window";
  return new Date(milliseconds).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function GroupDetailsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const router = useRouter();
  const role = useGroupRole(groupId);
  const [group, setGroup] = useState<GroupDocument | null>(null);
  const isArchived = isSquadArchived(group ?? {});
  const isOwnerRole = canManageAdmins(role);
  const isOwner = isOwnerRole && !isArchived;
  const canAdminister = canManageGroup(role) && !isArchived;
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [courtsByVenue, setCourtsByVenue] = useState<Record<string, CourtRow[]>>({});

  // Member add state — combobox search
  const [searchQuery, setSearchQuery] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newMemberRole, setNewMemberRole] = useState<"member" | "admin">("member");
  const [memberAddError, setMemberAddError] = useState<string | null>(null);
  const [memberAddSuccess, setMemberAddSuccess] = useState<string | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null);
  const [ownershipChangingId, setOwnershipChangingId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { confirm: requestConfirmation, confirmationDialog } = useConfirmDialog();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = useCallback((message: string, tone: ToastMessage["tone"] = "success") => {
    setToast({ id: Date.now(), message, tone });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // Venue add state
  const [venueName, setVenueName] = useState("");
  const [courtNames, setCourtNames] = useState<Record<string, string>>({});
  const [courtNumbers, setCourtNumbers] = useState<Record<string, number>>({});

  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionFilter, setSessionFilter] = useState<"all" | "upcoming" | "active" | "past">("upcoming");
  const [activeTab, setActiveTab] = useState<"members" | "sessions">("members");
  const [peopleView, setPeopleView] = useState<"rankings" | "manage">("rankings");
  const [rsvpDefaults, setRsvpDefaults] = useState<SquadRsvpDefaultsState>(DEFAULT_SQUAD_RSVP_DEFAULTS);
  const [isSavingRsvpDefaults, setIsSavingRsvpDefaults] = useState(false);
  const [playerKindChangingId, setPlayerKindChangingId] = useState<string | null>(null);

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
  const inviteUrl = shareUrl("/dashboard");
  const inviteMessage = inviteCode
    ? `Join ${group?.name ?? "our squad"} on DuoRally. Use invite code ${inviteCode}: ${inviteUrl}`
    : "";
  const whatsappInviteUrl = inviteMessage
    ? `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`
    : "#";
  const handleShareInvite = async () => {
    if (!inviteCode) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: `Join ${group?.name ?? "our DuoRally squad"}`,
          text: inviteMessage,
          url: inviteUrl,
        });
        return;
      } catch {
        /* cancelled or unsupported */
      }
    }
    await navigator.clipboard?.writeText(inviteMessage);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };
  const handleRotateCode = async () => {
    setRotating(true);
    const res = await rotateInviteCode(groupId).catch(() => null);
    if (res?.ok) setInviteCode(res.data.inviteCode);
    setRotating(false);
  };
  const handleRsvpDefaultsSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSavingRsvpDefaults) return;
    setIsSavingRsvpDefaults(true);
    const result = await updateSquadRsvpDefaults(groupId, rsvpDefaults).catch((error) => ({
      ok: false as const,
      message: error.message,
    }));
    setIsSavingRsvpDefaults(false);
    if (result?.ok) notify("Default RSVP capacity saved.");
    else notify(result?.message ?? "Could not save RSVP defaults.", "error");
  };
  const handlePlayerKindChange = async (playerId: string, name: string, kind: SquadPlayerKind) => {
    if (playerKindChangingId === playerId) return;
    const previous = players;
    setPlayers((current) => current.map((player) => (player.id === playerId ? { ...player, playerKind: kind } : player)));
    setPlayerKindChangingId(playerId);
    const result = await updateSquadPlayerKind(groupId, playerId, kind).catch((error) => ({
      ok: false as const,
      message: error.message,
    }));
    setPlayerKindChangingId(null);
    if (result?.ok) notify(`${name} is marked ${kind === "regular" ? "Regular" : "Casual"}.`);
    else {
      setPlayers(previous);
      notify(result?.message ?? "Could not update player type.", "error");
    }
  };
  const handleApprove = async (uid: string, kind: SquadPlayerKind) => {
    setResolvingReq(uid);
    await approveJoinRequest(groupId, uid, kind).catch(() => null);
    setResolvingReq(null);
  };
  const handleReject = async (uid: string) => {
    setResolvingReq(uid);
    await rejectJoinRequest(groupId, uid).catch(() => null);
    setResolvingReq(null);
  };
  const handleRemovePlayer = async (targetId: string, name: string) => {
    const confirmed = await requestConfirmation({
      title: `Remove ${name}?`,
      description: "They will lose access to this squad. Their completed session results will stay intact.",
      confirmLabel: "Remove member",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await removePlayerFromSquad(groupId, targetId).catch(() => null);
    if (result?.ok) notify(`${name} was removed from the squad.`);
    else notify(result?.message ?? "Could not remove this member.", "error");
  };
  const handleRoleChange = async (
    targetUserId: string,
    name: string,
    currentRole: GroupRole,
  ) => {
    const nextRole = normalizeGroupRole(currentRole) === "admin" ? "member" : "admin";
    const confirmed = await requestConfirmation({
      title: nextRole === "admin" ? `Make ${name} an admin?` : `Make ${name} a member?`,
      description: nextRole === "admin"
        ? "They will be able to manage players, venues, courts, and sessions. Only the owner can manage admin roles."
        : "They will stay in the squad but will no longer be able to manage players, venues, courts, or sessions.",
      confirmLabel: nextRole === "admin" ? "Make admin" : "Make member",
    });
    if (!confirmed) return;
    setRoleChangingId(targetUserId);
    const result = await updateMemberRole(groupId, targetUserId, nextRole).catch(() => null);
    setRoleChangingId(null);
    if (result?.ok) notify(`${name} is now ${nextRole === "admin" ? "an admin" : "a member"}.`);
    else notify(result?.message ?? "Could not change this role.", "error");
  };
  const handleMemberRoleSelect = async (
    targetUserId: string,
    name: string,
    currentRole: GroupRole,
    nextRole: "member" | "admin" | "owner",
  ) => {
    const normalizedRole = normalizeGroupRole(currentRole);
    if (!normalizedRole || normalizedRole === nextRole) return;
    if (nextRole === "owner") {
      if (!isOwner || targetUserId === user?.uid || currentRole === "owner") return;
      await handleTransferOwnership(targetUserId, name);
      return;
    }
    if (currentRole === "owner") return;
    await handleRoleChange(targetUserId, name, currentRole);
  };
  const handleTransferOwnership = async (targetUserId: string, name: string) => {
    const confirmed = await requestConfirmation({
      title: `Make ${name} the squad owner?`,
      description: `${name} will control ownership and admin roles. You will become an admin and can then leave the squad if needed.`,
      confirmLabel: "Transfer ownership",
    });
    if (!confirmed) return;
    setOwnershipChangingId(targetUserId);
    const result = await transferSquadOwnership(groupId, targetUserId).catch(() => null);
    setOwnershipChangingId(null);
    if (result?.ok) notify(`${name} is now the squad owner.`);
    else notify(result?.message ?? "Could not transfer ownership.", "error");
  };
  const handleLeaveSquad = async () => {
    const confirmed = await requestConfirmation({
      title: `Leave ${group?.name ?? "this squad"}?`,
      description: "You will lose access to this squad and its upcoming sessions. Your completed results and rankings will stay.",
      confirmLabel: "Leave squad",
      tone: "danger",
    });
    if (!confirmed) return;
    setIsLeaving(true);
    const result = await leaveSquad(groupId).catch(() => null);
    if (!result?.ok) {
      setIsLeaving(false);
      notify(result?.message ?? "Could not leave this squad.", "error");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  };
  const handleArchiveSquad = async () => {
    if (!isOwnerRole || isArchived || isArchiving) return;
    const confirmed = await requestConfirmation({
      title: `Archive ${group?.name ?? "this squad"}?`,
      description: "The squad will become read-only immediately. All squad data, including sessions and results, will be permanently deleted in 2 days. You can restore it during that window.",
      confirmLabel: "Archive squad",
      tone: "danger",
    });
    if (!confirmed) return;
    setIsArchiving(true);
    const result = await archiveSquad(groupId).catch(() => null);
    setIsArchiving(false);
    if (!result?.ok) {
      notify(result?.message ?? "Could not archive this squad.", "error");
      return;
    }
    setGroup((current) => current ? {
      ...current,
      archivedAt: new Date(),
      purgeAfter: result.data.purgeAfter,
      archivedBy: user?.uid,
    } : current);
    notify("Squad archived. You can restore it for 2 days.");
  };
  const handleRestoreSquad = async () => {
    if (!isOwnerRole || !isArchived || isRestoring) return;
    setIsRestoring(true);
    const result = await restoreSquad(groupId).catch(() => null);
    setIsRestoring(false);
    if (!result?.ok) {
      notify(result?.message ?? "Could not restore this squad.", "error");
      return;
    }
    setGroup((current) => {
      if (!current) return current;
      const { archivedAt: _archivedAt, purgeAfter: _purgeAfter, archivedBy: _archivedBy, ...rest } = current;
      return rest;
    });
    notify("Squad restored.");
  };
  const handleRsvp = async (sessionId: string, status: "going" | "not_going") => {
    if (isArchived) return;
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
      setRsvpToast((t) => ({ ...t, [sessionId]: status === "going" ? "You're in." : "Marked away." }));
      setTimeout(() => setRsvpToast((t) => { const n = { ...t }; delete n[sessionId]; return n; }), 2500);
    }
  };
  const handleCancelSession = async (sessionId: string, sessionName: string) => {
    const confirmed = await requestConfirmation({
      title: `Cancel ${sessionName}?`,
      description: "It will move to Past and can no longer be run. Any completed scores will stay unchanged.",
      confirmLabel: "Cancel session",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await deleteSession(sessionId).catch((error) => ({ ok: false as const, message: error.message }));
    if (result?.ok) notify(`${sessionName} was cancelled.`);
    else notify(result?.message ?? "Could not cancel this session.", "error");
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
    const unsubGroupDoc = watchGroupDoc(groupId, (g) => {
      if (g) setGroup(g);
      setInviteCode(g?.inviteCode);
      const defaults = g?.rsvpDefaults;
      setRsvpDefaults({
        totalPlayers: Number(defaults?.totalPlayers ?? DEFAULT_SQUAD_RSVP_DEFAULTS.totalPlayers),
        casualConfirmedSlots: Number(defaults?.casualConfirmedSlots ?? DEFAULT_SQUAD_RSVP_DEFAULTS.casualConfirmedSlots),
        waitlistEnabled: defaults?.waitlistEnabled ?? DEFAULT_SQUAD_RSVP_DEFAULTS.waitlistEnabled,
        cutoffHoursBeforeStart: defaults?.cutoffHoursBeforeStart ?? null,
      });
    }, () => {});

    return () => {
      unsubPlayers();
      unsubMembers();
      unsubVenues();
      unsubSessions();
      unsubGroupDoc();
    };
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !canAdminister) {
      setJoinRequests([]);
      return;
    }
    return watchJoinRequests(groupId, setJoinRequests, () => setJoinRequests([]));
  }, [canAdminister, groupId]);

  useEffect(() => {
    if (!isOwner) setNewMemberRole("member");
  }, [isOwner]);

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
  const currentUserPlayerKind: SquadPlayerKind = players.find((player) =>
    player.id === user?.uid || player.userId === user?.uid
  )?.playerKind ?? "regular";
  const squadRankingRows = [...players]
    .filter((player) => !player.isGuest)
    .map((player) => {
      const played = Number(player.squadGradedGames) || 0;
      const wins = Number(player.squadWins) || 0;
      const losses = Number(player.squadLosses) || 0;
      const pointDiff = Number(player.squadPointDiff) || 0;
      const rating = Number(player.squadRating) || 1000;
      return {
        ...player,
        played,
        wins,
        losses,
        pointDiff,
        rating,
        winPct: played > 0 ? Math.round((wins / played) * 100) : 0,
        grade: player.squadGrade || "C",
        provisional: played < 3,
      };
    })
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "");
    });

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
    if (!memberEmail.trim() || isAddingMember) return;
    setIsAddingMember(true);
    setMemberAddError(null);
    setMemberAddSuccess(null);
    const result = await addMemberToSquad(groupId, memberEmail.trim(), newMemberRole).catch(() => null);
    if (!result || !result.ok) {
      setMemberAddError(result?.message ?? "Could not add member. Please try again.");
    } else {
      setMemberAddSuccess(`${memberEmail.trim()} added as ${newMemberRole}.`);
      setMemberEmail("");
      setNewMemberRole("member");
    }
    setIsAddingMember(false);
  };

  const handleAddVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueName.trim()) return;
    const result = await addVenueToSquad(groupId, venueName).catch(() => null);
    if (result?.ok) setVenueName("");
    else notify(result?.message ?? "Could not add venue.", "error");
  };

  const handleAddCourt = async (e: React.FormEvent, venueId: string) => {
    e.preventDefault();
    const name = courtNames[venueId]?.trim();
    if (!name) return;
    const fallbackNumber = (courtsByVenue[venueId]?.length ?? 0) + 1;
    const courtNumber = courtNumbers[venueId] || fallbackNumber;
    const result = await addCourtToSquadVenue(groupId, venueId, name, courtNumber).catch(() => null);
    if (result?.ok) {
      setCourtNames((prev) => ({ ...prev, [venueId]: "" }));
      setCourtNumbers((prev) => ({ ...prev, [venueId]: courtNumber + 1 }));
    } else {
      notify(result?.message ?? "Could not add court.", "error");
    }
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
              {groupRoleLabel(role) ?? "No role"}
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

      {isArchived && (
        <section style={{
          background: "var(--danger-bg)", border: "1px solid var(--danger)",
          borderRadius: "var(--r-xl)", padding: "1rem 1.125rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "1rem", flexWrap: "wrap",
        }}>
          <div>
            <strong style={{ display: "block", color: "var(--danger)", fontWeight: 900 }}>
              Archived squad · read-only
            </strong>
            <span style={{ display: "block", color: "var(--text-2)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
              This squad and its history are scheduled for permanent deletion on {formatArchiveDeadline(group.purgeAfter)}.
            </span>
          </div>
          {isOwnerRole && (
            <button
              type="button"
              onClick={handleRestoreSquad}
              disabled={isRestoring}
              style={{
                height: 42, padding: "0 1rem", border: "none",
                borderRadius: "var(--r-md)", background: "var(--ink-800)",
                color: "var(--volt-500)", fontWeight: 900,
                cursor: isRestoring ? "default" : "pointer",
                opacity: isRestoring ? 0.6 : 1,
              }}
            >
              {isRestoring ? "Restoring..." : "Restore squad"}
            </button>
          )}
        </section>
      )}

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
            if (isArchived || upcomingSessions.length === 0) return null;

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
                      : "Upcoming";
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
                              {goingCount} in · {notGoingCount} away
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
                                  {currentUserPlayerKind === "casual" ? "Casual interest:" : "You're in by default:"}
                                </span>
                                <button
                                  type="button"
                                  disabled={isLoading || isArchived}
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
                                  {isLoading ? "..." : currentUserPlayerKind === "casual" ? "I'm interested" : myStatus === "not_going" ? "I'm back in" : "I'm in"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isLoading || isArchived}
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
                                  {isLoading ? "..." : currentUserPlayerKind === "casual" ? "Not interested" : "I'm away"}
                                </button>
                              </div>
                              {toast && (
                                <div style={{
                                  marginTop: "0.5rem",
                                  fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 700,
                                  color: toast === "You're in." ? "var(--volt-500)" : "rgba(246,100,100,0.9)",
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

          {!isArchived && isOwnerRole && (
            <section style={{
              borderTop: "1px solid var(--border)", padding: "1rem 0 0.25rem",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "1rem", flexWrap: "wrap",
            }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", fontWeight: 900 }}>
                  Archive this squad
                </h2>
                <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "0.2rem", maxWidth: 560 }}>
                  Archive it to make the squad read-only now. All squad data will be permanently deleted after 2 days unless you restore it.
                </p>
              </div>
              <button
                type="button"
                onClick={handleArchiveSquad}
                disabled={isArchiving}
                style={{
                  height: 42, padding: "0 1rem", border: "1px solid var(--danger)",
                  borderRadius: "var(--r-md)", background: "transparent",
                  color: "var(--danger)", fontWeight: 900,
                  cursor: isArchiving ? "default" : "pointer",
                  opacity: isArchiving ? 0.55 : 1,
                }}
              >
                {isArchiving ? "Archiving..." : "Archive squad"}
              </button>
            </section>
          )}

          <section style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}>
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                People
              </span>
              <p style={{ color: "var(--text-2)", fontSize: "0.875rem", marginTop: "0.2rem" }}>
                {peopleView === "rankings" ? "Grades, form, and squad standings." : "Members, roles, invites, and setup."}
              </p>
            </div>
            <div style={{
              display: "inline-grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "0.25rem",
              padding: "0.25rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-pill)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-xs)",
            }}>
              {(["rankings", "manage"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setPeopleView(view)}
                  aria-pressed={peopleView === view}
                  style={{
                    minWidth: 112,
                    height: 36,
                    padding: "0 0.875rem",
                    border: "none",
                    borderRadius: "var(--r-pill)",
                    background: peopleView === view ? "var(--ink-800)" : "transparent",
                    color: peopleView === view ? "var(--volt-500)" : "var(--text-2)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.6875rem",
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  {view === "rankings" ? "Rankings" : "Manage"}
                </button>
              ))}
            </div>
          </section>

          {peopleView === "manage" && (
          <>
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
                  <div key={r.userId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto auto", gap: "0.5rem", alignItems: "center", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.625rem 0.75rem" }}>
                    <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.displayName}</span>
                    <button
                      onClick={() => handleApprove(r.userId, "regular")}
                      disabled={resolvingReq === r.userId}
                      style={{ height: 34, padding: "0 0.75rem", border: "none", borderRadius: "var(--r-md)", background: "var(--volt-500)", color: "var(--ink-800)", fontWeight: 900, cursor: "pointer", fontSize: "0.8125rem" }}
                    >
                      {resolvingReq === r.userId ? "..." : "Regular"}
                    </button>
                    <button
                      onClick={() => handleApprove(r.userId, "casual")}
                      disabled={resolvingReq === r.userId}
                      style={{ height: 34, padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--text-1)", fontWeight: 900, cursor: "pointer", fontSize: "0.8125rem" }}
                    >
                      {resolvingReq === r.userId ? "..." : "Casual"}
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
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>Share invite</h2>
              <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "0.875rem" }}>Send the squad invite and let players join when they are ready.</p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "0.15em", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0.5rem 1rem", color: "var(--text-1)" }}>
                  {inviteCode}
                </code>
                <button onClick={handleShareInvite} style={{ height: 44, padding: "0 1rem", border: "none", borderRadius: "var(--r-md)", background: "var(--volt-500)", color: "var(--ink-800)", fontWeight: 900, cursor: "pointer" }}>
                  Share invite
                </button>
                <a href={whatsappInviteUrl} target="_blank" rel="noreferrer" style={{ height: 44, padding: "0 1rem", border: "none", borderRadius: "var(--r-md)", background: "#25D366", color: "var(--ink-800)", fontWeight: 900, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                  WhatsApp
                </a>
                <button onClick={handleCopyCode} style={{ height: 44, padding: "0 1rem", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--text-1)", fontWeight: 900, cursor: "pointer" }}>
                  {copiedCode ? "Copied!" : "Copy"}
                </button>
                {canAdminister && (
                  <button onClick={handleRotateCode} disabled={rotating} style={{ height: 44, padding: "0 0.875rem", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--text-2)", fontWeight: 800, cursor: "pointer", fontSize: "0.8125rem" }}>
                    {rotating ? "…" : "New code"}
                  </button>
                )}
              </div>
            </section>
          )}

          {canAdminister && (
            <section style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)", padding: "1rem", boxShadow: "var(--shadow-sm)",
              animation: "pb-rise 400ms 55ms var(--ease-out) both",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "0.875rem" }}>
                <div>
                  <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                    Default RSVP capacity
                  </h2>
                  <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginTop: "0.2rem" }}>
                    New sessions start with these numbers. You can still adjust an individual session.
                  </p>
                </div>
                <span style={{
                  padding: "4px 9px", borderRadius: "var(--r-pill)",
                  background: "rgba(198,241,53,0.14)", color: "var(--ink-800)",
                  border: "1px solid var(--volt-500)",
                  fontFamily: "var(--font-mono)", fontSize: "0.625rem",
                  fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  Squad default
                </span>
              </div>
              <form onSubmit={handleRsvpDefaultsSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: "0.75rem", alignItems: "end" }}>
                <label style={{ display: "grid", gap: "0.35rem", color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 800 }}>
                  Total player capacity
                  <input
                    className="pb-input"
                    type="number"
                    min={4}
                    value={rsvpDefaults.totalPlayers}
                    onChange={(event) => setRsvpDefaults((current) => ({ ...current, totalPlayers: Number(event.target.value) }))}
                    aria-label="Total player capacity"
                    style={{ height: 42, borderRadius: "var(--r-md)", marginTop: 0 }}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.35rem", color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 800 }}>
                  RSVP cutoff hours
                  <input
                    className="pb-input"
                    type="number"
                    min={0}
                    value={rsvpDefaults.cutoffHoursBeforeStart ?? ""}
                    onChange={(event) => setRsvpDefaults((current) => ({
                      ...current,
                      cutoffHoursBeforeStart: event.target.value === "" ? null : Number(event.target.value),
                    }))}
                    aria-label="RSVP cutoff hours before start"
                    placeholder="No cutoff"
                    style={{ height: 42, borderRadius: "var(--r-md)", marginTop: 0 }}
                  />
                </label>
                <label style={{
                  minHeight: 42,
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0 0.75rem", border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)", background: "var(--surface-sunken)",
                  color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 800,
                }}>
                  <input
                    type="checkbox"
                    checked={rsvpDefaults.waitlistEnabled}
                    onChange={(event) => setRsvpDefaults((current) => ({ ...current, waitlistEnabled: event.target.checked }))}
                    name="waitlistEnabled"
                  />
                  Keep a casual waiting list
                </label>
                <button
                  type="submit"
                  disabled={isSavingRsvpDefaults}
                  style={{
                    height: 42, padding: "0 1rem", border: "none",
                    borderRadius: "var(--r-md)", background: "var(--ink-800)",
                    color: "var(--volt-500)", fontWeight: 900,
                    cursor: isSavingRsvpDefaults ? "default" : "pointer",
                    opacity: isSavingRsvpDefaults ? 0.6 : 1,
                  }}
                >
                  {isSavingRsvpDefaults ? "Saving..." : "Save defaults"}
                </button>
              </form>
            </section>
          )}

          {/* Account member management remains available through the join flow. */}
          {false && (
            <section style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)", padding: "1rem", boxShadow: "var(--shadow-sm)",
              animation: "pb-rise 400ms 60ms var(--ease-out) both",
              display: "flex", flexDirection: "column",
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
                    Add players
                  </h2>
                  <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                    Add anyone by name now. Players can join later to keep stats and rankings.
                  </p>
                </div>
              </div>

              {false && (
              <form onSubmit={handleAddMember} style={{ display: "grid", gap: "0.625rem", order: 2 }}>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", fontWeight: 900 }}>
                    Add existing member
                  </h3>
                  <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "0.2rem" }}>
                    Use this when they already have a DuoRally account.
                  </p>
                </div>
                <div className="pb-member-add-form">
                  <input
                    data-testid="member-email-input"
                    className="pb-input"
                    type="email"
                    placeholder="Email address"
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                    required
                    style={{ height: 46, borderRadius: "var(--r-md)" }}
                  />
                  {isOwner && (
                    <select
                      data-testid="member-role-select"
                      className="pb-input"
                      value={newMemberRole}
                      onChange={(event) => setNewMemberRole(event.target.value as "member" | "admin")}
                      style={{ height: 46, borderRadius: "var(--r-md)" }}
                      aria-label="New member role"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  <button
                    data-testid="member-add-submit"
                    type="submit"
                    disabled={!memberEmail.trim() || isAddingMember}
                    style={{
                      height: 46, padding: "0 1.25rem", border: "none",
                      borderRadius: "var(--r-md)", background: "var(--ink-800)",
                      color: "var(--volt-500)", fontWeight: 800,
                      opacity: memberEmail.trim() && !isAddingMember ? 1 : 0.5,
                      cursor: memberEmail.trim() && !isAddingMember ? "pointer" : "default",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isAddingMember ? "Adding..." : "Add member"}
                  </button>
                </div>
                {(memberAddError || memberAddSuccess) && (
                  <p role="status" style={{
                    borderRadius: "var(--r-md)", padding: "0.75rem",
                    background: memberAddError ? "var(--danger-bg)" : "rgba(198,241,53,0.18)",
                    color: memberAddError ? "var(--danger)" : "var(--ink-800)",
                    fontWeight: 800, fontSize: "0.875rem",
                  }}>
                    {memberAddError ?? memberAddSuccess}
                  </p>
                )}
              </form>
              )}

              {/* Linked account (existing) member search form */}
              {false && selectedUser && (
                <form onSubmit={handleAddMember} style={{ display: "grid", gap: "0.625rem" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                    Add someone who already has a DuoRally account so their stats stay linked.
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
                        {(selectedUser!.displayName || selectedUser!.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {selectedUser!.displayName || "(no name)"}
                        </div>
                        <div style={{ color: "var(--text-3)", fontSize: "0.75rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {selectedUser!.email}
                        </div>
                      </div>
                    </div>
                    <select
                      className="pb-input"
                      value={newMemberRole}
                      onChange={e => setNewMemberRole(e.target.value as "member" | "admin")}
                      style={{ height: 46, borderRadius: "var(--r-md)" }}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
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

          </>
          )}

          {peopleView === "rankings" && (
          <>
          {/* Squad rankings */}
          <section style={{ animation: "pb-rise 400ms 80ms var(--ease-out) both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem", gap: "0.75rem" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                Squad Rankings
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "right" }}>
                Grade settles after 3 games
              </span>
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              <div className="pb-squad-ranking-grid" style={{
                padding: "0.5rem 0.75rem",
                fontFamily: "var(--font-mono)",
                fontSize: "0.625rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}>
                <span>#</span>
                <span>Player</span>
                <span style={{ textAlign: "right" }}>Played</span>
                <span style={{ textAlign: "right" }}>Won</span>
                <span style={{ textAlign: "right" }}>Lost</span>
                <span style={{ textAlign: "right" }}>Win%</span>
                <span style={{ textAlign: "right" }}>Grade</span>
              </div>

              {squadRankingRows.length === 0 ? (
                <div style={{
                  background: "var(--surface)",
                  border: "2px dashed var(--border)",
                  borderRadius: "var(--r-xl)",
                  padding: "1.5rem 1rem",
                  textAlign: "center",
                }}>
                  <p style={{ color: "var(--text-2)" }}>Squad rankings start after the first recorded result.</p>
                </div>
              ) : (
                squadRankingRows.map((row, index) => (
                  <div key={row.id} className="pb-squad-ranking-grid" style={{
                    alignItems: "center",
                    padding: "0.75rem",
                    borderRadius: "var(--r-xl)",
                    border: "1px solid var(--border)",
                    background: index === 0 ? "rgba(198,241,53,0.09)" : "var(--surface)",
                    boxShadow: index < 3 ? "var(--shadow-xs)" : "none",
                    animation: `pb-rise 400ms ${100 + index * 25}ms var(--ease-out) both`,
                  }}>
                    <span style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: index === 0 ? "var(--volt-500)" : "var(--surface-sunken)",
                      color: index === 0 ? "var(--ink-800)" : "var(--text-2)",
                      display: "grid",
                      placeItems: "center",
                      fontFamily: "var(--font-display-tight)",
                      fontWeight: 900,
                      fontSize: "0.8125rem",
                    }}>
                      {index + 1}
                    </span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 900, color: "var(--text-1)" }}>
                      {row.displayName}
                    </span>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-1)", fontWeight: 800 }}>{row.played}</span>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--volt-600)", fontWeight: 900 }}>{row.wins}</span>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{row.losses}</span>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: row.winPct >= 50 ? "var(--volt-600)" : "var(--text-2)", fontWeight: 800 }}>{row.winPct}%</span>
                    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: 0 }}>
                      <strong style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", color: "var(--ink-800)" }}>{row.grade}</strong>
                      {row.provisional && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5625rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Provisional
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          </>
          )}

          {peopleView === "manage" && (
          <>
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
                  {canAdminister
                    ? "Add members above — they'll appear here once they sign up."
                    : "No members in this team yet."}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.625rem" }}>
                {players.map((p, i) => {
                  const initial = p.displayName?.[0]?.toUpperCase() ?? "?";
                  const memberRole = p.userId ? roleByUserId.get(p.userId) : undefined;
                  const normalizedRole = normalizeGroupRole(memberRole ?? null);
                  const canMakeOwner = Boolean(
                    isOwner
                    && p.userId
                    && p.userId !== user?.uid
                    && memberRole
                    && memberRole !== "owner",
                  );
                  const canRemove = p.isGuest
                    ? canAdminister
                    : Boolean(memberRole && canRemoveGroupMember(role, memberRole));
                  const currentKind = p.playerKind ?? (p.isGuest ? "casual" : "regular");
                  const roleSelectValue = normalizedRole === "owner"
                    ? "owner"
                    : normalizedRole === "admin"
                      ? "admin"
                      : "member";
                  const roleSelectBusy = roleChangingId === p.userId || ownershipChangingId === p.userId;
                  return (
                    <div key={p.id} data-testid="member-list-item" className="pb-member-row" style={{
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
                        <div style={{ color: "var(--text-3)", fontSize: "0.8125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.email ?? "No email"}
                          {p.skillLevel && p.skillLevel !== "unknown" ? ` · ${p.skillLevel}` : ""}
                        </div>
                      </div>
                      <div className="pb-member-actions" style={{ display: "flex", gap: "0.625rem", alignItems: "end", justifyContent: "flex-end", flexWrap: "wrap", flexShrink: 0 }}>
                        {canAdminister && (
                          <label style={{ display: "grid", gap: "0.25rem", minWidth: 126 }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: "0.5625rem",
                              letterSpacing: "0.08em", textTransform: "uppercase",
                              color: "var(--text-3)", fontWeight: 900,
                            }}>
                              Player type
                            </span>
                            <select
                              value={currentKind}
                              disabled={playerKindChangingId === p.id}
                              onChange={(event) => void handlePlayerKindChange(
                                p.id,
                                p.displayName,
                                event.target.value as SquadPlayerKind,
                              )}
                              aria-label={`${p.displayName} player type`}
                              style={{
                                height: 38, minWidth: 126, padding: "0 0.75rem",
                                border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                                background: "var(--surface-sunken)", color: "var(--text-1)",
                                fontSize: "0.8125rem", fontWeight: 900,
                                cursor: playerKindChangingId === p.id ? "default" : "pointer",
                                opacity: playerKindChangingId === p.id ? 0.58 : 1,
                              }}
                            >
                              <option value="regular">Regular</option>
                              <option value="casual">Casual</option>
                            </select>
                          </label>
                        )}
                        {memberRole ? (
                          <label style={{ display: "grid", gap: "0.25rem", minWidth: 126 }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: "0.5625rem",
                              letterSpacing: "0.08em", textTransform: "uppercase",
                              color: "var(--text-3)", fontWeight: 900,
                            }}>
                              Squad role
                            </span>
                            <select
                              data-testid={p.userId ? `member-role-${p.userId}` : undefined}
                              value={roleSelectValue}
                              disabled={!isOwner || memberRole === "owner" || roleSelectBusy}
                              onChange={(event) => {
                                if (!p.userId) return;
                                void handleMemberRoleSelect(
                                  p.userId,
                                  p.displayName,
                                  memberRole,
                                  event.target.value as "member" | "admin" | "owner",
                                );
                              }}
                              aria-label={`${p.displayName} squad role`}
                              style={{
                                height: 38, minWidth: 126, padding: "0 0.75rem",
                                border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                                background: "var(--surface-sunken)", color: "var(--text-1)",
                                fontSize: "0.8125rem", fontWeight: 900,
                                cursor: !isOwner || memberRole === "owner" || roleSelectBusy ? "default" : "pointer",
                                opacity: roleSelectBusy ? 0.58 : 1,
                              }}
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                              {(roleSelectValue === "owner" || canMakeOwner) && (
                                <option value="owner">Owner</option>
                              )}
                            </select>
                          </label>
                        ) : (
                          <label style={{ display: "grid", gap: "0.25rem", minWidth: 126 }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: "0.5625rem",
                              letterSpacing: "0.08em", textTransform: "uppercase",
                              color: "var(--text-3)", fontWeight: 900,
                            }}>
                              Squad role
                            </span>
                            <select
                              value="guest"
                              disabled
                              aria-label={`${p.displayName} squad role`}
                              style={{
                                height: 38, minWidth: 126, padding: "0 0.75rem",
                                border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                                background: "var(--surface-sunken)", color: "var(--text-2)",
                                fontSize: "0.8125rem", fontWeight: 900,
                              }}
                            >
                              <option value="guest">Guest</option>
                            </select>
                          </label>
                        )}
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => handleRemovePlayer(p.id, p.displayName)}
                            style={{
                              height: 38, padding: "0 0.5rem", border: "none",
                              borderRadius: "var(--r-md)", background: "transparent",
                              color: "var(--danger)", fontSize: "0.8125rem", fontWeight: 900,
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
          {canAdminister && (
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

          <section style={{
            borderTop: "1px solid var(--border)", padding: "1rem 0 0.25rem",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "1rem", flexWrap: "wrap",
          }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", fontWeight: 900 }}>
                Leave this squad
              </h2>
              <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "0.2rem", maxWidth: 560 }}>
                {isOwner
                  ? "Transfer ownership to another member from their Squad role dropdown. You can leave after you become an admin."
                  : "Your completed results and rankings will remain in the squad history."}
              </p>
            </div>
            {canLeaveGroup(role) && !isArchived && (
              <button
                type="button"
                onClick={handleLeaveSquad}
                disabled={isLeaving}
                style={{
                  height: 42, padding: "0 1rem", border: "1px solid var(--danger)",
                  borderRadius: "var(--r-md)", background: "transparent",
                  color: "var(--danger)", fontWeight: 900,
                  cursor: isLeaving ? "default" : "pointer",
                  opacity: isLeaving ? 0.55 : 1,
                }}
              >
                {isLeaving ? "Leaving..." : "Leave squad"}
              </button>
            )}
          </section>
          </>
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
                {f === "upcoming" ? `Upcoming (${sessions.filter(s => s.status === "scheduled" || s.status === "draft").length})` : f === "all" ? "All sessions" : f === "active" ? "Playing now" : "Finished"}
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
                <div style={{ border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "2rem 1.25rem", textAlign: "center", color: "var(--text-2)", display: "grid", justifyItems: "center", gap: "0.875rem" }}>
                  <span>No {sessionFilter === "all" ? "" : sessionFilter} sessions found.</span>
                  <Link
                    href={`/sessions/new?groupId=${encodeURIComponent(groupId)}`}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      minHeight: 44, padding: "0 1.25rem", borderRadius: "var(--r-pill)",
                      background: "var(--volt-500)", color: "var(--ink-800)",
                      fontWeight: 900, textDecoration: "none", boxShadow: "var(--shadow-volt)",
                    }}
                  >
                    Create session
                  </Link>
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
                                {goingCount} in · {notGoingCount} away
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
                          onClick={(event) => {
                            if (isArchived && s.status !== "completed" && s.status !== "cancelled") event.preventDefault();
                          }}
                          style={{
                            height: 38, padding: "0 0.875rem", borderRadius: "var(--r-lg)",
                            background: "var(--ink-800)", color: "var(--volt-500)",
                            fontWeight: 800, fontSize: "0.8125rem",
                            textDecoration: "none", display: "inline-flex", alignItems: "center", flexShrink: 0,
                            opacity: isArchived && s.status !== "completed" && s.status !== "cancelled" ? 0.55 : 1,
                          }}
                        >
                          {isArchived && s.status !== "completed" && s.status !== "cancelled"
                            ? "Read-only"
                            : s.status === "active" || s.status === "paused" ? "Run Session" : s.status === "completed" ? "View Results" : "Start Playing"}
                        </a>
                      </div>

                      {/* RSVP Buttons for upcoming sessions */}
                      {isUpcoming && !isArchived && (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>
                            {currentUserPlayerKind === "casual" ? "Casual interest:" : "You're in by default:"}
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
                            {currentUserPlayerKind === "casual" ? "I'm interested" : "I'm in"}
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
                            {currentUserPlayerKind === "casual" ? "Not interested" : "I'm away"}
                          </button>
                          {canAdminister && (
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
      {confirmationDialog}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
