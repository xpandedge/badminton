import { assertSuperAdminPage } from "@/server/admin/guard";
import {
  grantAppAdminFormAction,
  listAppAdmins,
  revokeAppAdminFormAction,
} from "@/server/admin/app-admins";

export default async function AppAdminsPage() {
  const session = await assertSuperAdminPage();
  const admins = await listAppAdmins();
  const canManage = session.appAdminRole === "owner";

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.5rem" }}>
          App Admins
        </p>
        <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.6rem", fontWeight: 900, letterSpacing: 0, marginBottom: "0.5rem" }}>
          Control who can support DuoRally.
        </h2>
        <p style={{ color: "var(--text-2)", lineHeight: 1.5, maxWidth: 760 }}>
          App owners can manage app admins. App admins can see and fix data across DuoRally. Only add people you trust to support the app.
        </p>
      </section>

      {canManage && (
        <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
          <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.2rem", fontWeight: 900, marginBottom: "0.75rem" }}>
            Add App Admin
          </h3>
          <form action={grantAppAdminFormAction} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "0.75rem" }}>
            <input className="pb-input" type="email" name="email" placeholder="Email address" required />
            <select className="pb-input" name="role" defaultValue="admin" aria-label="App admin role">
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            <input className="pb-input" name="reason" placeholder="Reason" required />
            <button className="pb-btn pb-btn-volt" type="submit">Grant access</button>
          </form>
        </section>
      )}

      <section style={{ display: "grid", gap: "0.75rem" }}>
        {(admins.ok ? admins.data : []).map((admin) => (
          <article key={admin.uid} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.1rem", fontWeight: 900, margin: 0 }}>
                  {admin.displayName || admin.email || admin.uid}
                </h3>
                <p style={{ color: "var(--text-3)", marginTop: "0.25rem" }}>{admin.email ?? admin.uid}</p>
              </div>
              <span style={{ textTransform: "capitalize", fontWeight: 900, color: admin.role === "owner" ? "var(--volt-500)" : "var(--text-2)" }}>
                {admin.role}
              </span>
            </div>
            {canManage && admin.email && (
              <form action={revokeAppAdminFormAction} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.5rem" }}>
                <input type="hidden" name="email" value={admin.email} />
                <input className="pb-input" name="reason" placeholder="Reason for removing access" required />
                <button className="pb-btn pb-btn-secondary" type="submit">Revoke</button>
              </form>
            )}
          </article>
        ))}

        {admins.ok && admins.data.length === 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", color: "var(--text-2)" }}>
            No active app admins found. Run the bootstrap grant command for the first owner.
          </div>
        )}

        {!admins.ok && (
          <div style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(240,62,62,0.18)", borderRadius: "var(--r-lg)", padding: "1rem" }}>
            {admins.message}
          </div>
        )}
      </section>
    </div>
  );
}
