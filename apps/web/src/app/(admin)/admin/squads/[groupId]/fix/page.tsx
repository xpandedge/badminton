import { inspectSquad } from "@/server/admin/inspect";
import {
  adminRestoreArchivedSquadFormAction,
  adminTransferSquadOwnershipFormAction,
} from "@/server/admin/fixes";

function isArchived(group: Record<string, unknown>): boolean {
  return Boolean(group.archivedAt);
}

function labelForMember(member: { id: string; data: Record<string, unknown> }): string {
  const name = typeof member.data.displayName === "string" && member.data.displayName.trim()
    ? member.data.displayName.trim()
    : member.id;
  const email = typeof member.data.email === "string" && member.data.email.trim()
    ? ` (${member.data.email.trim()})`
    : "";
  return `${name}${email}`;
}

export default async function AdminSquadFixPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const result = await inspectSquad(groupId);
  if (!result.ok) return <SupportError message={result.message} />;
  const squad = result.data;
  const archived = isArchived(squad.group);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.5rem" }}>
          Support fix
        </p>
        <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>Squad fixes</h2>
        <p style={{ color: "var(--text-3)" }}>{groupId}</p>
      </section>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem" }}>
        <h3 style={{ fontWeight: 900, marginBottom: "0.5rem" }}>Transfer ownership</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "0.75rem" }}>
          Moves squad ownership to an existing member. The previous owner becomes an admin when their member record exists.
        </p>
        <form action={adminTransferSquadOwnershipFormAction} style={{ display: "grid", gap: "0.75rem", maxWidth: 520 }}>
          <input type="hidden" name="groupId" value={groupId} />
          <select className="pb-input" name="newOwnerUid" required defaultValue="">
            <option value="" disabled>Choose new owner</option>
            {squad.members.map((member) => (
              <option key={member.id} value={member.id}>{labelForMember(member)}</option>
            ))}
          </select>
          <input className="pb-input" name="reason" placeholder="Reason" required />
          <button className="pb-button" type="submit">Apply support fix</button>
        </form>
      </section>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem" }}>
        <h3 style={{ fontWeight: 900, marginBottom: "0.5rem" }}>Restore archived squad</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "0.75rem" }}>
          Restores a squad only when it is archived and still inside its restore window.
        </p>
        <form action={adminRestoreArchivedSquadFormAction} style={{ display: "grid", gap: "0.75rem", maxWidth: 520 }}>
          <input type="hidden" name="groupId" value={groupId} />
          <input className="pb-input" name="reason" placeholder="Reason" required disabled={!archived} />
          <button className="pb-button" type="submit" disabled={!archived}>Apply support fix</button>
        </form>
        {!archived && <p style={{ color: "var(--text-3)", marginTop: "0.75rem" }}>This squad is not archived.</p>}
      </section>
    </div>
  );
}

function SupportError({ message }: { message: string }) {
  return <div style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(240,62,62,0.18)", borderRadius: "var(--r-lg)", padding: "1rem" }}>{message}</div>;
}
