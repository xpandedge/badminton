import "server-only";
import { getAdminDb } from "@/server/firebase/admin";
import { assertSuperAdminAction } from "@/server/admin/guard";
import { err, ok, type ActionResult } from "@/server/result";

export type AdminSearchKind = "user" | "player" | "squad" | "session";
export type AdminSearchTermKind = "id" | "email" | "code" | "text";

export interface AdminSearchHit {
  kind: AdminSearchKind;
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

export function classifyAdminSearchTerm(term: string): AdminSearchTermKind {
  const q = term.trim();
  if (/^[A-Za-z0-9_-]{18,}$/.test(q)) return "id";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) return "email";
  if (/^[A-Za-z]{2,5}-?[A-Za-z0-9]{4,10}$/.test(q)) return "code";
  return "text";
}

function prefixEnd(value: string): string {
  return `${value}\uf8ff`;
}

function hit(kind: AdminSearchKind, id: string, label: string, sublabel: string): AdminSearchHit {
  const base = kind === "squad" ? "squads" : `${kind}s`;
  return { kind, id, label, sublabel, href: `/admin/${base}/${id}` };
}

export async function adminSearch(term: string): Promise<ActionResult<AdminSearchHit[]>> {
  const access = await assertSuperAdminAction();
  if (!access.ok) return access;

  const q = term.trim();
  if (q.length < 2) return ok([]);

  const db = getAdminDb();
  const kind = classifyAdminSearchTerm(q);
  const results: AdminSearchHit[] = [];

  if (kind === "id") {
    const refs = [
      { kind: "user" as const, ref: db.doc(`users/${q}`), labelField: "displayName" },
      { kind: "player" as const, ref: db.doc(`players/${q}`), labelField: "displayName" },
      { kind: "squad" as const, ref: db.doc(`groups/${q}`), labelField: "name" },
      { kind: "session" as const, ref: db.doc(`sessions/${q}`), labelField: "name" },
    ];
    const snaps = await Promise.all(refs.map((entry) => entry.ref.get()));
    snaps.forEach((snap, index) => {
      if (!snap.exists) return;
      const entry = refs[index]!;
      const data = snap.data() ?? {};
      results.push(hit(entry.kind, snap.id, String(data[entry.labelField] ?? snap.id), `ID ${snap.id}`));
    });
    return ok(results);
  }

  if (kind === "email") {
    const snap = await db.collection("users").where("emailLower", "==", q.toLowerCase()).limit(10).get();
    return ok(snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return hit("user", docSnap.id, String(data.displayName ?? data.email ?? docSnap.id), String(data.email ?? q));
    }));
  }

  if (kind === "code") {
    const [join, score, rsvp] = await Promise.all([
      db.collection("sessions").where("joinCode", "==", q).limit(5).get(),
      db.collection("sessions").where("scoreCode", "==", q).limit(5).get(),
      db.collection("sessions").where("rsvpCode", "==", q).limit(5).get(),
    ]);
    for (const snap of [join, score, rsvp]) {
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        results.push(hit("session", docSnap.id, String(data.name ?? docSnap.id), `Session code ${q}`));
      }
    }
    return ok(results);
  }

  const lower = q.toLowerCase();
  const searchSnaps = await Promise.all([
    db.collection("users").where("displayNameLower", ">=", lower).where("displayNameLower", "<=", prefixEnd(lower)).limit(10).get(),
    db.collection("users").where("emailLower", ">=", lower).where("emailLower", "<=", prefixEnd(lower)).limit(10).get(),
    db.collection("groups").where("nameLower", ">=", lower).where("nameLower", "<=", prefixEnd(lower)).limit(10).get(),
  ]).catch(() => null);
  if (!searchSnaps) return err("FAILED_PRECONDITION", "Text search needs supported user and squad fields");
  const [usersByName, usersByEmail, squadsByName] = searchSnaps;

  const seen = new Set<string>();
  for (const docSnap of [...usersByName.docs, ...usersByEmail.docs]) {
    if (seen.has(`user:${docSnap.id}`)) continue;
    seen.add(`user:${docSnap.id}`);
    const data = docSnap.data();
    results.push(hit("user", docSnap.id, String(data.displayName ?? data.email ?? docSnap.id), String(data.email ?? "User")));
  }
  for (const docSnap of squadsByName.docs) {
    const data = docSnap.data();
    results.push(hit("squad", docSnap.id, String(data.name ?? docSnap.id), "Squad"));
  }

  return ok(results);
}
