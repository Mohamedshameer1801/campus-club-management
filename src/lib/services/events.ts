import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DBLike } from "@/db";
import { events, clubs, users, students, eventRegistrations, attendance, eventApprovalHistory, certificates, clubMemberships } from "@/db/schema";
import { EVENT_TRANSITIONS, type EventStatus } from "@/lib/constants";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { canDecideEvent, hasClubPermission, isInstAdmin, isOverrideDecision, requireClubPermission } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { audit, eventStart, localDate, notify } from "./common";
import { canSeeEvent } from "./visibility";
import { evaluateAutoBadges } from "./badges";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const isRealDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export const eventInputSchema = z.object({
  clubId: z.coerce.number().int().positive(),
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(3000),
  eventDate: z.string().refine(isRealDate, "Invalid date (YYYY-MM-DD)"),
  startTime: z.string().regex(timeRe, "Use HH:MM"),
  endTime: z.string().regex(timeRe, "Use HH:MM"),
  venue: z.string().trim().min(2).max(150),
  maxCapacity: z.coerce.number().int().min(1).max(100000),
  posterUrl: z.string().url().max(500).nullable().optional(),
  registrationClosesAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional(),
  submitImmediately: z.boolean().optional(),
});
export const eventPatchSchema = eventInputSchema.omit({ clubId: true, submitImmediately: true }).partial().strict();

function validateSchedule(date: string, start: string, end: string) {
  if (end <= start) throw badRequest("End time must be after start time", "INVALID_TIME_RANGE");
  if (date < localDate()) throw badRequest("Event date cannot be in the past", "DATE_IN_PAST");
}

const brief = (db: DBLike, id: number) =>
  db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, id)).get() ?? null;

function registrationCount(db: DBLike, eventId: number): number {
  return db.select({ n: sql<number>`count(*)` }).from(eventRegistrations).where(eq(eventRegistrations.eventId, eventId)).get()?.n ?? 0;
}

function userRegistration(db: DBLike, eventId: number, userId: number) {
  return (
    db
      .select({
        id: eventRegistrations.id,
        registeredAt: eventRegistrations.registeredAt,
        attendanceStatus: sql<string>`coalesce(${attendance.status}, 'Registered')`,
        checkInMethod: attendance.method,
      })
      .from(eventRegistrations)
      .leftJoin(attendance, eq(attendance.registrationId, eventRegistrations.id))
      .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
      .get() ?? null
  );
}

function registrationOpen(ev: typeof events.$inferSelect) {
  const closes = ev.registrationClosesAt ? new Date(ev.registrationClosesAt) : eventStart(ev.eventDate, ev.startTime);
  return ev.status === "Approved" && Date.now() < closes.getTime();
}

export function presentEvent(db: DBLike, user: SessionUser, ev: typeof events.$inferSelect) {
  const club = db.select({ id: clubs.id, name: clubs.name, code: clubs.code, logoUrl: clubs.logoUrl, clubAdminId: clubs.clubAdminId, isArchived: clubs.isArchived }).from(clubs).where(eq(clubs.id, ev.clubId)).get();
  const reg = userRegistration(db, ev.id, user.id);
  const registeredCount = registrationCount(db, ev.id);
  const editableState = ev.status === "Draft" || ev.status === "Rejected";
  const canEditPerm = hasClubPermission(user, ev.clubId, "edit_events") || (ev.createdById === user.id && hasClubPermission(user, ev.clubId, "create_events"));
  const isCoordinator = user.role === "faculty" && user.id === ev.facultyCoordinatorId;
  const recordAtt = hasClubPermission(user, ev.clubId, "record_attendance");
  return {
    ...ev,
    club,
    coordinator: brief(db, ev.facultyCoordinatorId),
    creator: brief(db, ev.createdById),
    registeredCount,
    userRegistration: reg,
    permissions: {
      canEdit: editableState && canEditPerm,
      canSubmit: editableState && (canEditPerm || hasClubPermission(user, ev.clubId, "create_events")),
      canDecide: ev.status === "Pending Faculty Approval" && canDecideEvent(user, ev),
      canChangeStatus: hasClubPermission(user, ev.clubId, "edit_events"),
      canRecordAttendance: recordAtt && (ev.status === "Ongoing" || ev.status === "Completed"),
      canGenerateQr: recordAtt && ev.status === "Ongoing",
      canViewRegistrations: hasClubPermission(user, ev.clubId, "manage_registrations") || recordAtt || isCoordinator || isInstAdmin(user),
      canIssueCertificates: hasClubPermission(user, ev.clubId, "issue_certificates") && ev.status === "Completed",
      canRegister: user.role === "student" && !reg && registrationOpen(ev) && registeredCount < ev.maxCapacity,
      canApplyOd: user.role === "student" && !!reg && (ev.status === "Approved" || ev.status === "Ongoing"),
    },
  };
}

function loadEvent(db: DBLike, id: number) {
  const ev = db.select().from(events).where(eq(events.id, id)).get();
  if (!ev) throw notFound("Event not found");
  return ev;
}

function hasRegistration(db: DBLike, eventId: number, userId: number) {
  return !!db.select({ id: eventRegistrations.id }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId))).get();
}

export function listEvents(db: DB, user: SessionUser, filter: { clubId?: number; status?: string } = {}) {
  const conds = [];
  if (filter.clubId) conds.push(eq(events.clubId, filter.clubId));
  if (filter.status && filter.status !== "all") conds.push(eq(events.status, filter.status as EventStatus));
  const rows = db.select().from(events).where(conds.length ? and(...conds) : undefined).orderBy(desc(events.eventDate)).all();
  const registered = new Set(db.select({ e: eventRegistrations.eventId }).from(eventRegistrations).where(eq(eventRegistrations.userId, user.id)).all().map((r) => r.e));
  return rows.filter((ev) => canSeeEvent(user, ev, registered.has(ev.id))).map((ev) => presentEvent(db, user, ev));
}

export function getEvent(db: DB, user: SessionUser, id: number) {
  const ev = loadEvent(db, id);
  // Non-visible events look non-existent (no information leak about drafts of other clubs).
  if (!canSeeEvent(user, ev, hasRegistration(db, id, user.id))) throw notFound("Event not found");
  return presentEvent(db, user, ev);
}

function recordHistory(db: DBLike, eventId: number, actorId: number, action: string, from: string, to: string, remarks?: string | null, isOverride = false) {
  db.insert(eventApprovalHistory).values({ eventId, actorId, action, fromStatus: from, toStatus: to, remarks: remarks ?? null, isOverride }).run();
}

function submitTx(tx: DBLike, actor: SessionUser, ev: typeof events.$inferSelect, ip?: string) {
  if (ev.status !== "Draft" && ev.status !== "Rejected") throw conflict(`An event in "${ev.status}" status cannot be submitted for approval`, "INVALID_TRANSITION");
  if (ev.eventDate < localDate()) throw badRequest("Event date is in the past - edit the event before submitting", "DATE_IN_PAST");
  const resubmission = ev.status === "Rejected";
  tx.update(events).set({ status: "Pending Faculty Approval", rejectionReason: null, updatedAt: new Date() }).where(eq(events.id, ev.id)).run();
  recordHistory(tx, ev.id, actor.id, resubmission ? "Resubmitted" : "Submitted", ev.status, "Pending Faculty Approval");
  notify(tx, ev.facultyCoordinatorId, {
    title: resubmission ? "Event resubmitted for approval" : "Event awaiting your approval",
    message: `"${ev.title}" was ${resubmission ? "resubmitted" : "submitted"} by ${actor.fullName} for your approval.`,
    type: "event",
    link: "/approvals",
  });
  audit(tx, actor.id, resubmission ? "RESUBMIT_EVENT" : "SUBMIT_EVENT", "events", ev.id, ev.title, ip);
}

export function createEvent(db: DB, actor: SessionUser, input: z.infer<typeof eventInputSchema>, ip?: string) {
  const club = db.select().from(clubs).where(eq(clubs.id, input.clubId)).get();
  if (!club) throw notFound("Club not found");
  requireClubPermission(actor, club.id, "create_events");
  if (club.isArchived) throw badRequest("Archived clubs cannot create events");
  validateSchedule(input.eventDate, input.startTime, input.endTime);
  return db.transaction((tx) => {
    const ev = tx
      .insert(events)
      .values({
        clubId: club.id, title: input.title, description: input.description, eventDate: input.eventDate, startTime: input.startTime, endTime: input.endTime,
        venue: input.venue, maxCapacity: input.maxCapacity, posterUrl: input.posterUrl ?? null, registrationClosesAt: input.registrationClosesAt ?? null,
        createdById: actor.id, facultyCoordinatorId: club.facultyCoordinatorId, status: "Draft",
      })
      .returning()
      .get();
    audit(tx, actor.id, "CREATE_EVENT", "events", ev.id, ev.title, ip);
    if (input.submitImmediately) submitTx(tx, actor, ev, ip);
    return tx.select().from(events).where(eq(events.id, ev.id)).get() as typeof ev;
  });
}

export function updateEvent(db: DB, actor: SessionUser, id: number, patch: z.infer<typeof eventPatchSchema>, ip?: string) {
  const ev = loadEvent(db, id);
  if (!canSeeEvent(actor, ev, false)) throw notFound("Event not found");
  const canEdit = hasClubPermission(actor, ev.clubId, "edit_events") || (ev.createdById === actor.id && hasClubPermission(actor, ev.clubId, "create_events"));
  if (!canEdit) throw forbidden("Missing club permission: edit_events");
  if (ev.status !== "Draft" && ev.status !== "Rejected") throw conflict(`Events in "${ev.status}" status can no longer be edited`, "NOT_EDITABLE");
  const merged = { eventDate: patch.eventDate ?? ev.eventDate, startTime: patch.startTime ?? ev.startTime, endTime: patch.endTime ?? ev.endTime };
  validateSchedule(merged.eventDate, merged.startTime, merged.endTime);
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) throw badRequest("Nothing to update");
  return db.transaction((tx) => {
    const updated = tx.update(events).set({ ...clean, updatedAt: new Date() }).where(eq(events.id, id)).returning().get();
    audit(tx, actor.id, "UPDATE_EVENT", "events", id, Object.keys(clean).join(","), ip);
    return updated;
  });
}

export function submitEvent(db: DB, actor: SessionUser, id: number, ip?: string) {
  const ev = loadEvent(db, id);
  if (!canSeeEvent(actor, ev, false)) throw notFound("Event not found");
  if (!(hasClubPermission(actor, ev.clubId, "create_events") || hasClubPermission(actor, ev.clubId, "edit_events")))
    throw forbidden("You cannot submit events for this club");
  return db.transaction((tx) => {
    submitTx(tx, actor, ev, ip);
    return tx.select().from(events).where(eq(events.id, id)).get();
  });
}

export const decisionSchema = z.object({
  decision: z.enum(["Approved", "Rejected"]),
  rejectionReason: z.string().trim().max(1000).optional(),
  facultyRemarks: z.string().trim().max(1000).optional(),
});

export function decideEvent(db: DB, actor: SessionUser, id: number, input: z.infer<typeof decisionSchema>, ip?: string) {
  const ev = loadEvent(db, id);
  if (!canDecideEvent(actor, ev)) throw forbidden("Only the assigned Faculty Coordinator can approve or reject this event");
  if (ev.status !== "Pending Faculty Approval") throw conflict(`Event is in "${ev.status}" status and is not awaiting approval`, "INVALID_TRANSITION");
  if (input.decision === "Rejected" && !input.rejectionReason?.trim()) throw badRequest("A rejection reason is mandatory", "REASON_REQUIRED");
  const override = isOverrideDecision(actor, ev.facultyCoordinatorId);
  return db.transaction((tx) => {
    const updated = tx
      .update(events)
      .set({
        status: input.decision,
        rejectionReason: input.decision === "Rejected" ? (input.rejectionReason as string) : null,
        facultyRemarks: input.facultyRemarks || null,
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning()
      .get();
    recordHistory(tx, id, actor.id, input.decision, ev.status, input.decision, input.decision === "Rejected" ? input.rejectionReason : input.facultyRemarks, override);
    const club = tx.select().from(clubs).where(eq(clubs.id, ev.clubId)).get();
    const recipients = new Set([ev.createdById, club?.clubAdminId].filter((x): x is number => typeof x === "number"));
    for (const uid of recipients)
      notify(tx, uid, {
        title: `Event ${input.decision.toLowerCase()}`,
        message:
          input.decision === "Approved"
            ? `"${ev.title}" was approved by ${actor.fullName} and is now published for registration.`
            : `"${ev.title}" was rejected: ${input.rejectionReason}. Edit and resubmit it for approval.`,
        type: "event",
        link: `/events/${id}`,
      });
    audit(tx, actor.id, `${override ? "OVERRIDE_" : ""}${input.decision === "Approved" ? "APPROVE" : "REJECT"}_EVENT`, "events", id, input.rejectionReason || input.facultyRemarks || ev.title, ip);
    return updated;
  });
}

export function eventHistory(db: DB, user: SessionUser, id: number) {
  const ev = getEvent(db, user, id);
  return db
    .select({ id: eventApprovalHistory.id, action: eventApprovalHistory.action, fromStatus: eventApprovalHistory.fromStatus, toStatus: eventApprovalHistory.toStatus, remarks: eventApprovalHistory.remarks, isOverride: eventApprovalHistory.isOverride, createdAt: eventApprovalHistory.createdAt, actor: users.fullName })
    .from(eventApprovalHistory)
    .innerJoin(users, eq(users.id, eventApprovalHistory.actorId))
    .where(eq(eventApprovalHistory.eventId, ev.id))
    .orderBy(eventApprovalHistory.id)
    .all();
}

export const statusChangeSchema = z.object({ status: z.enum(["Ongoing", "Completed", "Cancelled"]) });

export function changeStatus(db: DB, actor: SessionUser, id: number, to: "Ongoing" | "Completed" | "Cancelled", ip?: string) {
  const ev = loadEvent(db, id);
  if (!canSeeEvent(actor, ev, false)) throw notFound("Event not found");
  requireClubPermission(actor, ev.clubId, "edit_events");
  if (!EVENT_TRANSITIONS[ev.status].includes(to)) throw conflict(`Invalid transition: ${ev.status} \u2192 ${to}`, "INVALID_TRANSITION");
  return db.transaction((tx) => {
    const updated = tx.update(events).set({ status: to, updatedAt: new Date() }).where(eq(events.id, id)).returning().get();
    recordHistory(tx, id, actor.id, `Status:${to}`, ev.status, to);
    if (to === "Cancelled") {
      const regs = tx.select({ userId: eventRegistrations.userId }).from(eventRegistrations).where(eq(eventRegistrations.eventId, id)).all();
      for (const r of regs) notify(tx, r.userId, { title: "Event cancelled", message: `"${ev.title}" has been cancelled.`, type: "event", link: `/events/${id}` });
    }
    audit(tx, actor.id, "CHANGE_EVENT_STATUS", "events", id, `${ev.status} -> ${to}`, ip);
    return updated;
  });
}

// ------------------------------------------------------------------ registration (atomic)
export function registerForEvent(db: DB, user: SessionUser, eventId: number) {
  if (user.role !== "student") throw forbidden("Only students can register for events");
  return db.transaction(
    (tx) => {
      const ev = loadEvent(tx, eventId);
      if (ev.status !== "Approved") throw badRequest(`Registration is not open: this event is "${ev.status}"`, "EVENT_NOT_OPEN");
      const closes = ev.registrationClosesAt ? new Date(ev.registrationClosesAt) : eventStart(ev.eventDate, ev.startTime);
      if (Date.now() >= closes.getTime()) throw badRequest("The registration window for this event has closed", "REGISTRATION_CLOSED");
      if (hasRegistration(tx, eventId, user.id)) throw conflict("You are already registered for this event", "ALREADY_REGISTERED");
      if (registrationCount(tx, eventId) >= ev.maxCapacity) throw conflict("This event has reached its maximum capacity", "EVENT_FULL");
      const reg = tx.insert(eventRegistrations).values({ eventId, userId: user.id }).returning().get();
      notify(tx, user.id, {
        title: "Registration confirmed",
        message: `You are registered for "${ev.title}" on ${ev.eventDate} (${ev.startTime}-${ev.endTime}). You can now apply for On-Duty.`,
        type: "event",
        link: `/events/${ev.id}`,
      });
      return reg;
    },
    { behavior: "immediate" }
  );
}

export function listRegistrations(db: DB, actor: SessionUser, eventId: number) {
  const ev = loadEvent(db, eventId);
  const allowed = hasClubPermission(actor, ev.clubId, "manage_registrations") || hasClubPermission(actor, ev.clubId, "record_attendance") || (actor.role === "faculty" && actor.id === ev.facultyCoordinatorId) || isInstAdmin(actor);
  if (!allowed) throw forbidden("You cannot view the registrations of this event");
  return db
    .select({
      id: eventRegistrations.id, eventId: eventRegistrations.eventId, userId: eventRegistrations.userId, registeredAt: eventRegistrations.registeredAt,
      attendanceStatus: sql<string>`coalesce(${attendance.status}, 'Registered')`, attendanceMarkedAt: attendance.markedAt, checkInMethod: attendance.method,
      fullName: users.fullName, email: users.email, raNumber: students.raNumber, department: students.department, academicYear: students.academicYear,
      hasCertificate: sql<number>`exists(select 1 from ${certificates} where ${certificates.registrationId} = ${eventRegistrations.id})`,
    })
    .from(eventRegistrations)
    .innerJoin(users, eq(users.id, eventRegistrations.userId))
    .leftJoin(students, eq(students.userId, users.id))
    .leftJoin(attendance, eq(attendance.registrationId, eventRegistrations.id))
    .where(eq(eventRegistrations.eventId, eventId))
    .orderBy(eventRegistrations.registeredAt)
    .all()
    .map((r) => ({ ...r, hasCertificate: Boolean(r.hasCertificate) }));
}

export const attendanceSchema = z.object({ registrationId: z.coerce.number().int().positive(), attendanceStatus: z.enum(["Registered", "Attended", "Absent"]) });

/** Manual attendance (authorised fallback to QR). Attendance is a separate record from the registration. */
export function markAttendance(db: DB, actor: SessionUser, eventId: number, input: z.infer<typeof attendanceSchema>, ip?: string) {
  const ev = loadEvent(db, eventId);
  requireClubPermission(actor, ev.clubId, "record_attendance");
  if (ev.status !== "Ongoing" && ev.status !== "Completed") throw conflict(`Attendance can only be recorded for Ongoing or Completed events (this event is "${ev.status}")`, "EVENT_NOT_STARTED");
  return db.transaction((tx) => {
    const reg = tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.id, input.registrationId), eq(eventRegistrations.eventId, eventId))).get();
    if (!reg) throw notFound("Registration not found for this event");
    if (tx.select({ id: certificates.id }).from(certificates).where(eq(certificates.registrationId, reg.id)).get())
      throw conflict("A certificate was already issued for this registration; attendance can no longer be changed", "CERTIFICATE_ISSUED");
    const existing = tx.select().from(attendance).where(eq(attendance.registrationId, reg.id)).get();
    if (input.attendanceStatus === "Registered") {
      if (existing) tx.delete(attendance).where(eq(attendance.id, existing.id)).run();
    } else if (existing) {
      tx.update(attendance).set({ status: input.attendanceStatus, method: "Manual", markedBy: actor.id, markedAt: new Date() }).where(eq(attendance.id, existing.id)).run();
    } else {
      tx.insert(attendance).values({ registrationId: reg.id, status: input.attendanceStatus, method: "Manual", markedBy: actor.id }).run();
    }
    if (input.attendanceStatus === "Attended") {
      notify(tx, reg.userId, { title: "Attendance confirmed", message: `Your attendance at "${ev.title}" was confirmed.`, type: "attendance", link: `/events/${eventId}` });
      evaluateAutoBadges(tx, reg.userId);
    }
    audit(tx, actor.id, "RECORD_ATTENDANCE", "event_registrations", reg.id, input.attendanceStatus, ip);
    return { registrationId: reg.id, attendanceStatus: input.attendanceStatus };
  });
}

export function activeMemberCount(db: DBLike, clubId: number) {
  return db.select({ n: sql<number>`count(*)` }).from(clubMemberships).where(and(eq(clubMemberships.clubId, clubId), inArray(clubMemberships.status, ["active"]))).get()?.n ?? 0;
}
