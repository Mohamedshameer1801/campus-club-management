import { and, asc, eq, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DBLike } from "@/db";
import { timetableStructures, timetablePeriods, odRequests } from "@/db/schema";
import { PERIOD_TYPES, WEEKDAYS, type PeriodType } from "@/lib/constants";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { requireSuperAdmin } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { audit } from "./common";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const isRealDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const periodSchema = z.object({
  periodNumber: z.coerce.number().int().min(1).max(50),
  periodLabel: z.string().trim().min(1).max(60),
  startTime: z.string().regex(timeRe, "Use HH:MM"),
  endTime: z.string().regex(timeRe, "Use HH:MM"),
  periodType: z.enum(PERIOD_TYPES),
});
export type PeriodInput = z.infer<typeof periodSchema>;

const daysSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
  z.array(z.enum(WEEKDAYS)).min(1, "Select at least one working day")
);

export const structureSchema = z.object({
  name: z.string().trim().min(3).max(100),
  workingDays: daysSchema,
  effectiveFrom: z.string().refine(isRealDate, "Invalid effective date (YYYY-MM-DD)"),
  isActive: z.boolean().optional(),
  replaceConflicting: z.boolean().optional(),
  periods: z.array(periodSchema).min(1).max(30),
});
export type StructureInput = z.infer<typeof structureSchema>;

/** Pure validation: errors block saving, warnings (unintended gaps) are reported but allowed. */
export function validatePeriods(periods: PeriodInput[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sorted = [...periods].sort((a, b) => a.periodNumber - b.periodNumber);
  const numbers = new Set<number>();
  sorted.forEach((p, i) => {
    if (numbers.has(p.periodNumber)) errors.push(`Period number ${p.periodNumber} is used more than once`);
    numbers.add(p.periodNumber);
    const s = toMinutes(p.startTime);
    const e = toMinutes(p.endTime);
    if (e <= s) errors.push(`${p.periodLabel}: end time (${p.endTime}) must be after start time (${p.startTime})`);
    if (i > 0) {
      const prev = sorted[i - 1];
      const ps = toMinutes(prev.startTime);
      const pe = toMinutes(prev.endTime);
      if (s < ps) errors.push(`${p.periodLabel} is out of chronological order (starts before "${prev.periodLabel}")`);
      else if (s < pe) errors.push(`${p.periodLabel} (${p.startTime}) overlaps "${prev.periodLabel}" (ends ${prev.endTime})`);
      else if (s > pe) warnings.push(`Gap of ${s - pe} minutes between "${prev.periodLabel}" (${prev.endTime}) and "${p.periodLabel}" (${p.startTime})`);
    }
  });
  const normalized = sorted.map((p) => ({ ...p, durationMinutes: toMinutes(p.endTime) - toMinutes(p.startTime) }));
  return { errors, warnings, normalized };
}

export interface SnapshotPeriod {
  periodNumber: number;
  periodLabel: string;
  startTime: string;
  endTime: string;
  periodType: PeriodType;
  durationMinutes: number;
}

/** Pure overlap engine. Breaks are reported as overlapping but NEVER counted as missed academic periods. */
export function computeOverlap(periods: SnapshotPeriod[], eventStart: string, eventEnd: string) {
  const s = toMinutes(eventStart);
  const e = toMinutes(eventEnd);
  const allOverlappingPeriods = periods.filter((p) => s < toMinutes(p.endTime) && e > toMinutes(p.startTime));
  const affectedPeriods = allOverlappingPeriods.filter((p) => p.periodType === "Class Period");
  const totalAcademicMinutes = affectedPeriods.reduce((sum, p) => sum + p.durationMinutes, 0);
  return { affectedPeriods, allOverlappingPeriods, totalAcademicMinutes };
}

const JS_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayOf = (date: string) => JS_DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
const daysOf = (s: { workingDays: string }) => s.workingDays.split(",").map((d) => d.trim());

function periodsOf(db: DBLike, structureId: number): SnapshotPeriod[] {
  return db
    .select()
    .from(timetablePeriods)
    .where(eq(timetablePeriods.structureId, structureId))
    .orderBy(asc(timetablePeriods.periodNumber))
    .all()
    .map((p) => ({ periodNumber: p.periodNumber, periodLabel: p.label, startTime: p.startTime, endTime: p.endTime, periodType: p.periodType, durationMinutes: p.durationMinutes }));
}

/** The structure applicable to a calendar DATE (not merely "the active one"): active, effective by then, and covering that weekday. */
export function findApplicableStructure(db: DBLike, date: string) {
  const day = weekdayOf(date);
  const candidates = db
    .select()
    .from(timetableStructures)
    .where(and(eq(timetableStructures.isActive, true), lte(timetableStructures.effectiveFrom, date)))
    .orderBy(sql`${timetableStructures.effectiveFrom} desc`)
    .all()
    .filter((s) => daysOf(s).includes(day));
  return candidates[0] ?? null;
}

export function calculateOverlap(db: DBLike, date: string, start: string, end: string) {
  const day = weekdayOf(date);
  const structure = findApplicableStructure(db, date);
  if (!structure) {
    const anyActive = db.select({ id: timetableStructures.id }).from(timetableStructures).where(eq(timetableStructures.isActive, true)).all();
    return { structure: null, weekday: day, affectedPeriods: [], allOverlappingPeriods: [], totalAcademicMinutes: 0, reason: anyActive.length ? "NON_WORKING_DAY" : "NO_TIMETABLE" } as const;
  }
  const res = computeOverlap(periodsOf(db, structure.id), start, end);
  return {
    structure: { id: structure.id, name: structure.name, version: structure.version },
    weekday: day,
    ...res,
    reason: res.affectedPeriods.length === 0 ? ("NO_CLASS_OVERLAP" as const) : null,
  };
}

// ------------------------------------------------------------------ queries
export function listStructures(db: DB) {
  const all = db.select().from(timetableStructures).orderBy(sql`${timetableStructures.isActive} desc`, sql`${timetableStructures.effectiveFrom} desc`).all();
  const withPeriods = all.map((s) => ({ ...s, workingDaysList: daysOf(s), periods: periodsOf(db, s.id).map((p) => ({ ...p, id: `${s.id}-${p.periodNumber}` })) }));
  const active = withPeriods.filter((s) => s.isActive);
  return { activeStructure: active[0] ?? null, activeStructures: active, allStructures: withPeriods };
}

// ------------------------------------------------------------------ commands (Super Admin only)
function conflictingActive(db: DBLike, days: string[], excludeId?: number) {
  return db
    .select()
    .from(timetableStructures)
    .where(excludeId ? and(eq(timetableStructures.isActive, true), ne(timetableStructures.id, excludeId)) : eq(timetableStructures.isActive, true))
    .all()
    .filter((s) => daysOf(s).some((d) => days.includes(d)));
}

function resolveConflicts(tx: DBLike, actor: SessionUser, days: string[], replace: boolean | undefined, excludeId: number | undefined, ip?: string) {
  const conflicts = conflictingActive(tx, days, excludeId);
  if (conflicts.length === 0) return;
  if (!replace) throw conflict(`Only one active structure may apply to a day. Conflicts with: ${conflicts.map((c) => `"${c.name}"`).join(", ")}. Deactivate them first or confirm replacement.`, "ACTIVE_CONFLICT");
  for (const c of conflicts) {
    tx.update(timetableStructures).set({ isActive: false, updatedAt: new Date() }).where(eq(timetableStructures.id, c.id)).run();
    audit(tx, actor.id, "DEACTIVATE_TIMETABLE", "timetable_structures", c.id, `replaced by new active structure`, ip);
  }
}

function insertPeriods(tx: DBLike, structureId: number, periods: ReturnType<typeof validatePeriods>["normalized"]) {
  for (const p of periods)
    tx.insert(timetablePeriods).values({ structureId, periodNumber: p.periodNumber, label: p.periodLabel, startTime: p.startTime, endTime: p.endTime, periodType: p.periodType, durationMinutes: p.durationMinutes }).run();
}

export function createStructure(db: DB, actor: SessionUser, input: StructureInput, ip?: string) {
  requireSuperAdmin(actor);
  const v = validatePeriods(input.periods);
  if (v.errors.length) throw badRequest(v.errors.join("; "), "INVALID_TIMETABLE");
  return db.transaction((tx) => {
    if (input.isActive) resolveConflicts(tx, actor, input.workingDays, input.replaceConflicting, undefined, ip);
    const s = tx.insert(timetableStructures).values({ name: input.name, workingDays: input.workingDays.join(","), effectiveFrom: input.effectiveFrom, isActive: !!input.isActive, createdBy: actor.id }).returning().get();
    insertPeriods(tx, s.id, v.normalized);
    audit(tx, actor.id, "CREATE_TIMETABLE", "timetable_structures", s.id, `${s.name}: ${v.normalized.length} periods, active=${s.isActive}`, ip);
    return { structure: s, warnings: v.warnings };
  });
}

export function updateStructure(db: DB, actor: SessionUser, id: number, input: StructureInput, ip?: string) {
  requireSuperAdmin(actor);
  const existing = db.select().from(timetableStructures).where(eq(timetableStructures.id, id)).get();
  if (!existing) throw notFound("Timetable structure not found");
  const v = validatePeriods(input.periods);
  if (v.errors.length) throw badRequest(v.errors.join("; "), "INVALID_TIMETABLE");
  return db.transaction((tx) => {
    const active = input.isActive ?? existing.isActive;
    if (active) resolveConflicts(tx, actor, input.workingDays, input.replaceConflicting, id, ip);
    // Historical OD approvals keep their own frozen period snapshot, so replacing periods here cannot rewrite history.
    const s = tx
      .update(timetableStructures)
      .set({ name: input.name, workingDays: input.workingDays.join(","), effectiveFrom: input.effectiveFrom, isActive: active, version: existing.version + 1, updatedAt: new Date() })
      .where(eq(timetableStructures.id, id))
      .returning()
      .get();
    tx.delete(timetablePeriods).where(eq(timetablePeriods.structureId, id)).run();
    insertPeriods(tx, id, v.normalized);
    audit(tx, actor.id, "UPDATE_TIMETABLE", "timetable_structures", id, `${existing.name} v${existing.version} -> v${s.version}; ${v.normalized.length} periods`, ip);
    return { structure: s, warnings: v.warnings };
  });
}

export function setStructureActive(db: DB, actor: SessionUser, id: number, active: boolean, replace: boolean | undefined, ip?: string) {
  requireSuperAdmin(actor);
  const s = db.select().from(timetableStructures).where(eq(timetableStructures.id, id)).get();
  if (!s) throw notFound("Timetable structure not found");
  return db.transaction((tx) => {
    if (active) resolveConflicts(tx, actor, daysOf(s), replace, id, ip);
    const updated = tx.update(timetableStructures).set({ isActive: active, updatedAt: new Date() }).where(eq(timetableStructures.id, id)).returning().get();
    audit(tx, actor.id, active ? "ACTIVATE_TIMETABLE" : "DEACTIVATE_TIMETABLE", "timetable_structures", id, s.name, ip);
    return updated;
  });
}

export function deleteStructure(db: DB, actor: SessionUser, id: number, ip?: string) {
  requireSuperAdmin(actor);
  const s = db.select().from(timetableStructures).where(eq(timetableStructures.id, id)).get();
  if (!s) throw notFound("Timetable structure not found");
  return db.transaction((tx) => {
    const refs = tx.select({ n: sql<number>`count(*)` }).from(odRequests).where(eq(odRequests.timetableStructureId, id)).get()?.n ?? 0;
    if (refs > 0) throw conflict(`This structure is referenced by ${refs} OD request(s) and is preserved for auditability. Deactivate it instead.`, "IN_USE");
    tx.delete(timetableStructures).where(eq(timetableStructures.id, id)).run();
    audit(tx, actor.id, "DELETE_TIMETABLE", "timetable_structures", id, s.name, ip);
    return { deleted: true };
  });
}

export const activeStatusSchema = z.object({ structureId: z.coerce.number().int().positive(), isActive: z.boolean(), replaceConflicting: z.boolean().optional() });
