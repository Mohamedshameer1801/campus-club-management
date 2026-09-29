import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DBLike } from "@/db";
import { badgeDefinitions, awardedBadges, users, clubs, clubMemberships, attendance, eventRegistrations, events, students } from "@/db/schema";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { canManageClub, hasClubPermission, isInstAdmin, requireClubPermission, requireInstAdmin } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { audit, notify } from "./common";

/** Verifiable system rules ("First Event", "Three-Event Streak"). Called inside the attendance transaction. */
export function evaluateAutoBadges(db: DBLike, userId: number) {
  const attended =
    db
      .select({ n: sql<number>`count(*)` })
      .from(attendance)
      .innerJoin(eventRegistrations, eq(eventRegistrations.id, attendance.registrationId))
      .where(and(eq(eventRegistrations.userId, userId), eq(attendance.status, "Attended")))
      .get()?.n ?? 0;
  const rules = db.select().from(badgeDefinitions).where(isNotNull(badgeDefinitions.ruleKey)).all();
  for (const r of rules) {
    const needed = r.ruleKey === "first_event" ? 1 : 3;
    if (attended < needed) continue;
    if (db.select({ id: awardedBadges.id }).from(awardedBadges).where(and(eq(awardedBadges.badgeId, r.id), eq(awardedBadges.userId, userId))).get()) continue;
    db.insert(awardedBadges).values({ badgeId: r.id, userId, awardedBy: null, reason: `Awarded automatically: ${r.criteria} (verified attendance: ${attended})` }).run();
    notify(db, userId, { title: "Badge earned", message: `You earned the "${r.name}" badge.`, type: "badge", link: "/portfolio" });
  }
}

export const badgeCreateSchema = z.object({
  clubId: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(5).max(300),
  icon: z.string().regex(/^[A-Za-z]{2,30}$/).default("Award"),
  criteria: z.string().trim().min(3).max(300),
});

export function createBadge(db: DB, actor: SessionUser, input: z.infer<typeof badgeCreateSchema>, ip?: string) {
  if (input.clubId) {
    if (!canManageClub(actor, input.clubId)) throw forbidden("Only the Club Admin can define badges for this club");
  } else requireInstAdmin(actor);
  return db.transaction((tx) => {
    if (input.clubId && !tx.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, input.clubId)).get()) throw notFound("Club not found");
    const dup = tx.select({ id: badgeDefinitions.id }).from(badgeDefinitions).where(and(sql`coalesce(${badgeDefinitions.clubId}, 0) = ${input.clubId ?? 0}`, sql`lower(${badgeDefinitions.name}) = lower(${input.name})`)).get();
    if (dup) throw conflict("A badge with this name already exists in this scope");
    const b = tx.insert(badgeDefinitions).values({ clubId: input.clubId ?? null, name: input.name, description: input.description, icon: input.icon, criteria: input.criteria, createdBy: actor.id }).returning().get();
    audit(tx, actor.id, "CREATE_BADGE", "badge_definitions", b.id, b.name, ip);
    return b;
  });
}

export function listBadgeDefinitions(db: DB) {
  return db
    .select({ id: badgeDefinitions.id, clubId: badgeDefinitions.clubId, name: badgeDefinitions.name, description: badgeDefinitions.description, icon: badgeDefinitions.icon, criteria: badgeDefinitions.criteria, ruleKey: badgeDefinitions.ruleKey, clubName: clubs.name })
    .from(badgeDefinitions)
    .leftJoin(clubs, eq(clubs.id, badgeDefinitions.clubId))
    .orderBy(badgeDefinitions.id)
    .all();
}

export const awardSchema = z.object({ badgeId: z.coerce.number().int().positive(), userId: z.coerce.number().int().positive(), reason: z.string().trim().min(3).max(300) });

export function awardBadge(db: DB, actor: SessionUser, input: z.infer<typeof awardSchema>, ip?: string) {
  const badge = db.select().from(badgeDefinitions).where(eq(badgeDefinitions.id, input.badgeId)).get();
  if (!badge) throw notFound("Badge not found");
  if (badge.clubId) requireClubPermission(actor, badge.clubId, "award_badges");
  else requireInstAdmin(actor);
  if (badge.ruleKey) throw badRequest("This badge is awarded automatically by a verifiable system rule", "AUTO_BADGE");
  return db.transaction((tx) => {
    const target = tx.select({ id: users.id, role: users.role, isActive: users.isActive, fullName: users.fullName }).from(users).where(eq(users.id, input.userId)).get();
    if (!target || target.role !== "student" || !target.isActive) throw badRequest("Badges can only be awarded to active students");
    if (badge.clubId) {
      const member = tx.select({ id: clubMemberships.id }).from(clubMemberships).where(and(eq(clubMemberships.clubId, badge.clubId), eq(clubMemberships.userId, target.id), eq(clubMemberships.status, "active"))).get();
      const attended = tx
        .select({ id: attendance.id })
        .from(attendance)
        .innerJoin(eventRegistrations, eq(eventRegistrations.id, attendance.registrationId))
        .innerJoin(events, eq(events.id, eventRegistrations.eventId))
        .where(and(eq(eventRegistrations.userId, target.id), eq(events.clubId, badge.clubId), eq(attendance.status, "Attended")))
        .get();
      if (!member && !attended) throw badRequest("The student is neither a member of this club nor an attendee of its events");
    }
    if (tx.select({ id: awardedBadges.id }).from(awardedBadges).where(and(eq(awardedBadges.badgeId, badge.id), eq(awardedBadges.userId, target.id))).get())
      throw conflict("This student already holds this badge", "BADGE_EXISTS");
    const award = tx.insert(awardedBadges).values({ badgeId: badge.id, userId: target.id, awardedBy: actor.id, reason: input.reason }).returning().get();
    notify(tx, target.id, { title: "Badge awarded", message: `You were awarded the "${badge.name}" badge: ${input.reason}`, type: "badge", link: "/portfolio" });
    audit(tx, actor.id, "AWARD_BADGE", "awarded_badges", award.id, `${badge.name} -> ${target.fullName}`, ip);
    return award;
  });
}

function inBadgeScope(u: SessionUser, clubId: number | null): boolean {
  if (isInstAdmin(u)) return true;
  if (clubId === null) return false;
  return canManageClub(u, clubId) || u.coordinatedClubIds.includes(clubId) || hasClubPermission(u, clubId, "award_badges");
}

/** Issued-badge oversight list, scoped: students see their own; club staff their clubs; coordinators their clubs; admins all. */
export function listAwarded(db: DB, user: SessionUser) {
  const rows = db
    .select({
      id: awardedBadges.id, badgeId: badgeDefinitions.id, name: badgeDefinitions.name, icon: badgeDefinitions.icon, clubId: badgeDefinitions.clubId, clubName: clubs.name,
      userId: awardedBadges.userId, studentName: users.fullName, raNumber: students.raNumber, reason: awardedBadges.reason, awardedAt: awardedBadges.awardedAt, awardedBy: awardedBadges.awardedBy,
    })
    .from(awardedBadges)
    .innerJoin(badgeDefinitions, eq(badgeDefinitions.id, awardedBadges.badgeId))
    .leftJoin(clubs, eq(clubs.id, badgeDefinitions.clubId))
    .innerJoin(users, eq(users.id, awardedBadges.userId))
    .leftJoin(students, eq(students.userId, users.id))
    .orderBy(desc(awardedBadges.awardedAt))
    .all();
  const scoped = rows.filter((r) => r.userId === user.id || inBadgeScope(user, r.clubId));
  return scoped.map((r) => {
    const by = r.awardedBy ? db.select({ n: users.fullName }).from(users).where(eq(users.id, r.awardedBy)).get()?.n : null;
    return { ...r, awardedByName: by ?? "System rule" };
  });
}

export function badgesOfStudent(db: DBLike, userId: number) {
  return db
    .select({ id: awardedBadges.id, badgeName: badgeDefinitions.name, name: badgeDefinitions.name, description: badgeDefinitions.description, icon: badgeDefinitions.icon, criteria: badgeDefinitions.criteria, clubName: clubs.name, reason: awardedBadges.reason, awardedAt: awardedBadges.awardedAt })
    .from(awardedBadges)
    .innerJoin(badgeDefinitions, eq(badgeDefinitions.id, awardedBadges.badgeId))
    .leftJoin(clubs, eq(clubs.id, badgeDefinitions.clubId))
    .where(eq(awardedBadges.userId, userId))
    .orderBy(desc(awardedBadges.awardedAt))
    .all();
}
