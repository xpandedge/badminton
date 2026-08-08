import type { SessionStatus, SessionPlayerStatus } from "@picklebaddies/domain";

const SESSION_STATUS_CONFIG: Record<SessionStatus, { icon: string; label: string; color: string }> = {
  draft:     { icon: "✏️", label: "Draft",     color: "bg-gray-100 text-gray-700" },
  scheduled: { icon: "📅", label: "Scheduled", color: "bg-blue-100 text-blue-700" },
  active:    { icon: "▶️", label: "Active",    color: "bg-green-100 text-green-700" },
  paused:    { icon: "⏸️", label: "Paused",    color: "bg-yellow-100 text-yellow-700" },
  completed: { icon: "✅", label: "Completed", color: "bg-purple-100 text-purple-700" },
  cancelled: { icon: "✖️", label: "Cancelled", color: "bg-red-100 text-red-700" },
};

const PLAYER_STATUS_CONFIG: Record<SessionPlayerStatus, { icon: string; label: string; color: string }> = {
  invited:    { icon: "📨", label: "Invited",     color: "bg-gray-100 text-gray-600" },
  registered: { icon: "📋", label: "Registered",  color: "bg-blue-100 text-blue-600" },
  checked_in: { icon: "✔️", label: "Checked in",  color: "bg-teal-100 text-teal-700" },
  active:     { icon: "▶️", label: "Active",      color: "bg-green-100 text-green-700" },
  waiting:    { icon: "⏳", label: "Waiting",     color: "bg-yellow-100 text-yellow-700" },
  left:       { icon: "🚶", label: "Left",        color: "bg-orange-100 text-orange-700" },
  removed:    { icon: "✖️", label: "Removed",     color: "bg-red-100 text-red-700" },
  no_show:    { icon: "❓", label: "No show",     color: "bg-red-100 text-red-600" },
};

interface SessionStatusBadgeProps {
  status: SessionStatus;
}

interface PlayerStatusBadgeProps {
  status: SessionPlayerStatus;
}

function Badge({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

export function SessionStatusBadge({ status }: SessionStatusBadgeProps) {
  const config = SESSION_STATUS_CONFIG[status] ?? { icon: "❔", label: status, color: "bg-gray-100 text-gray-600" };
  return <Badge {...config} />;
}

export function PlayerStatusBadge({ status }: PlayerStatusBadgeProps) {
  const config = PLAYER_STATUS_CONFIG[status] ?? { icon: "❔", label: status, color: "bg-gray-100 text-gray-600" };
  return <Badge {...config} />;
}
