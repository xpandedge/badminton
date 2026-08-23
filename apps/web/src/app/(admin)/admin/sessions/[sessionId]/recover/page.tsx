import { inspectSession } from "@/server/admin/inspect";
import { adminRecoverSessionStatusFormAction } from "@/server/admin/fixes";

function recoveryOptions(status: unknown): Array<{ value: "active" | "paused" | "completed"; label: string }> {
  if (status === "draft" || status === "scheduled") return [{ value: "active", label: "Recover to active" }];
  if (status === "paused") return [
    { value: "active", label: "Resume to active" },
    { value: "completed", label: "Complete session" },
  ];
  if (status === "active") return [
    { value: "paused", label: "Pause session" },
    { value: "completed", label: "Complete session" },
  ];
  return [];
}

export default async function AdminSessionRecoverPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const result = await inspectSession(sessionId);
  if (!result.ok) return <SupportError message={result.message} />;
  const session = result.data;
  const currentStatus = session.session.status;
  const options = recoveryOptions(currentStatus);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.5rem" }}>
          Support fix
        </p>
        <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>Session recovery</h2>
        <p style={{ color: "var(--text-3)" }}>{sessionId}</p>
      </section>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem" }}>
        <h3 style={{ fontWeight: 900, marginBottom: "0.5rem" }}>Recover status</h3>
        <p style={{ color: "var(--text-2)", marginBottom: "0.75rem" }}>
          Current status: <strong>{String(currentStatus ?? "unknown")}</strong>. Starting draft or scheduled sessions requires generated matches.
        </p>
        {options.length > 0 ? (
          <form action={adminRecoverSessionStatusFormAction} style={{ display: "grid", gap: "0.75rem", maxWidth: 520 }}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <select className="pb-input" name="statusTo" required defaultValue="">
              <option value="" disabled>Choose recovery action</option>
              {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input className="pb-input" name="reason" placeholder="Reason" required />
            <button className="pb-button" type="submit">Apply support fix</button>
          </form>
        ) : (
          <p style={{ color: "var(--text-3)" }}>No safe status recovery action is available for this status.</p>
        )}
      </section>
    </div>
  );
}

function SupportError({ message }: { message: string }) {
  return <div style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(240,62,62,0.18)", borderRadius: "var(--r-lg)", padding: "1rem" }}>{message}</div>;
}
