import type { SessionCourt } from "./types";

export type CourtChange = { courtId?: string; name?: string; courtNumber?: number; isActive?: boolean };

export function changeCourts(courts: SessionCourt[], change: CourtChange, newId: string): SessionCourt[] {
  const existing = change.courtId ? courts.find(c => c.courtId === change.courtId) : undefined;
  if (change.courtId && !existing) throw new Error("Court not found");
  const name = (change.name ?? existing?.name ?? "").trim();
  const courtNumber = change.courtNumber ?? existing?.courtNumber;
  if (!name || name.length > 80) throw new Error("Enter a court name between 1 and 80 characters");
  if (!Number.isSafeInteger(courtNumber) || courtNumber! < 1) throw new Error("Enter a positive whole court number");
  if (change.isActive !== undefined && typeof change.isActive !== "boolean") throw new Error("Invalid court availability");
  const others = courts.filter(c => c.courtId !== existing?.courtId);
  if (others.some(c => c.name.trim().toLowerCase() === name.toLowerCase())) throw new Error("A court with this name already exists");
  if (others.some(c => c.courtNumber === courtNumber)) throw new Error("A court with this number already exists");
  const updated = { courtId: existing?.courtId ?? newId, name, courtNumber: courtNumber!, isActive: change.isActive ?? existing?.isActive ?? true };
  return existing ? courts.map(c => c.courtId === existing.courtId ? updated : c) : [...courts, updated];
}
