import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { odRequests, odApprovalHistory, eventRegistrations, events, users, students } from "@/db/schema";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "@/lib/errors";
import { canDecideOd, isInstAdmin, isOverrideDecision } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { audit, notify } from "./common";
import { calculateOverlap } from "./timetable";
import { getEvent } from "./events";

const REASONS: Record<string, string> = {
  NON_WORKING_DAY: "The event date is not a working day in the applicable timetable, so no academic periods are affected.",
  NO_TIMETABLE: "No active institutional timetable exists for the event date.",
  NO_CLASS_OVERLAP: "The event does not overlap any class period (breaks are not counted), so OD is not required.",
};

export function previewOverlap(db: DB, user: SessionUser, eventId: number) {
  const ev = getEvent(db, user, eventId); // enforces event visibility
  const calc = calculateOverlap(db, ev.eventDate, ev.startTime, ev.endTime);
  return {
    event: { id: ev.id, title: ev.title, eventDate: ev.eventDate, startTime: ev.startTime, endTime: ev.endTime, venue: ev.venue },
    ...calc,
    message: calc.reason ? REASONS[calc.reason] : null,
  };
}

export const odApplySchema = z
  .object({
    registrationId: z.coerce.number().int().positive().optional(),
    eventId: z.coerce.number().int().positive().optional(),
    reason: z.string().trim().min(5, "Please explain the reason (min 5 characters)").max(1000),
  })
  .refine((v) => v.registrationId || v.eventId, "registrationId or eventId is required");

export function applyForOd(db: DB, actor: SessionUser, input: z.infer<typeof odApplySchema>, ip?: string) {
  if (actor.role !== "student" || !actor.studentProfile) throw forbidden("Only students can apply for OD");
  return db.transaction(
    (tx) => {
      // Object-level check: the registration must belong to the caller (someone else's registration looks non-existent).
      const reg = input.registrationId
        ? tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.id, input.registrationId), eq(eventRegistrations.userId, actor.id))).get()
        : tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.eventId, input.eventId as number), eq(eventRegistrations.userId, actor.id))).get();
      if (!reg) {
        if (input.registrationId) throw notFound("Registration not found");
        throw badRequest("You must register for this event before applying for OD", "NOT_REGISTERED");
      }
      const ev = tx.select().from(events).where(eq(events.id, reg.eventId)).get();
      if (!ev) throw notFound("Event not found");
      if (ev.status !== "Approved" && ev.status !== "Ongoing") throw badRequest(`OD can only be requested for approved upcoming events (this event is "${ev.status}")`, "EVENT_NOT_ELIGIBLE");
      if (tx.select({ id: odRequests.id }).from(odRequests).where(eq(odRequests.registrationId, reg.id)).get()) throw conflict("An OD request already exists for this registration", "OD_EXISTS");

      const calc = calculateOverlap(tx, ev.eventDate, ev.startTime, ev.endTime);
      if (!calc.structure || calc.affectedPeriods.length === 0) throw unprocessable(REASONS[calc.reason ?? "NO_CLASS_OVERLAP"], calc.reason ?? "NO_CLASS_OVERLAP");

      // Route to the student's ASSIGNED CLASS MENTOR (not the event's Faculty Coordinator).
      const profile = tx.select().from(students).where(eq(students.userId, actor.id)).get();
      if (!profile) throw badRequest("Student profile missing");
      const od = tx
        .insert(odRequests)
        .values({
          registrationId: reg.id, userId: actor.id, eventId: ev.id, mentorId: profile.mentorId, status: "Pending", reason: input.reason,
          timetableStructureId: calc.structure.id, timetableName: calc.structure.name, timetableVersion: calc.structure.version,
          affectedPeriodsSnapshot: JSON.stringify(calc.affectedPeriods), totalAcademicMinutes: calc.totalAcademicMinutes,
        })
        .returning()
        .get();
      tx.insert(odApprovalHistory).values({ odId: od.id, actorId: actor.id, action: "Submitted", remarks: input.reason }).run();
      notify(tx, profile.mentorId, {
        title: "OD application awaiting your review",
        message: `${actor.fullName} (${profile.raNumber}) requested OD for "${ev.title}" - ${calc.affectedPeriods.length} class period(s), ${calc.totalAcademicMinutes} min.`,
        type: "od",
        link: "/od",
      });
      audit(tx, actor.id, "SUBMIT_OD", "od_requests", od.id, `event=${ev.id} mentor=${profile.mentorId}`, ip);
      return { onDutyRequest: od, affectedPeriodsCount: calc.affectedPeriods.length, totalAcademicMinutes: calc.totalAcademicMinutes };
    },
    { behavior: "immediate" }
  );
}

export const odReviewSchema = z.object({ decision: z.enum(["Approved", "Rejected"]), mentorRemarks: z.string().trim().max(1000).optional() });

export function reviewOd(db: DB, actor: SessionUser, id: number, input: z.infer<typeof odReviewSchema>, ip?: string) {
  const od = db.select().from(odRequests).where(eq(odRequests.id, id)).get();
  if (!od) throw notFound("OD request not found");
  if (!canDecideOd(actor, od)) throw forbidden("Only the student's assigned Class Mentor can review this OD request");
  if (od.status !== "Pending") throw conflict(`This OD request was already ${od.status.toLowerCase()}`, "OD_DECISION_FINAL");
  const override = isOverrideDecision(actor, od.mentorId);
  return db.transaction((tx) => {
    const updated = tx
      .update(odRequests)
      .set({ status: input.decision, mentorRemarks: input.mentorRemarks || null, decidedBy: actor.id, decidedAt: new Date(), isOverride: override })
      .where(and(eq(odRequests.id, id), eq(odRequests.status, "Pending")))
      .returning()
      .get();
    if (!updated) throw conflict("This OD request was already decided", "OD_DECISION_FINAL");
    tx.insert(odApprovalHistory).values({ odId: id, actorId: actor.id, action: input.decision, remarks: input.mentorRemarks || null, isOverride: override }).run();
    const ev = tx.select({ title: events.title }).from(events).where(eq(events.id, od.eventId)).get();
    notify(tx, od.userId, {
      title: `OD ${input.decision.toLowerCase()}`,
      message: `${override ? "An administrator" : `Your Class Mentor ${actor.fullName}`} ${input.decision.toLowerCase()} your OD for "${ev?.title}".${input.mentorRemarks ? ` Remarks: ${input.mentorRemarks}` : ""}`,
      type: "od",
      link: "/od",
    });
    audit(tx, actor.id, `${override ? "OVERRIDE_" : ""}${input.decision === "Approved" ? "APPROVE" : "REJECT"}_OD`, "od_requests", id, input.mentorRemarks || "", ip);
    return updated;
  });
}

export function listOd(db: DB, user: SessionUser) {
  if (user.role !== "student" && user.role !== "faculty" && !isInstAdmin(user)) throw forbidden("OD requests are not available for your role");
  const rows = db
    .select({
      id: odRequests.id, registrationId: odRequests.registrationId, userId: odRequests.userId, eventId: odRequests.eventId, mentorId: odRequests.mentorId, status: odRequests.status,
      reason: odRequests.reason, affectedPeriodsSnapshot: odRequests.affectedPeriodsSnapshot, totalAcademicMinutes: odRequests.totalAcademicMinutes, timetableName: odRequests.timetableName,
      timetableVersion: odRequests.timetableVersion, mentorRemarks: odRequests.mentorRemarks, decidedAt: odRequests.decidedAt, isOverride: odRequests.isOverride, appliedAt: odRequests.appliedAt,
      studentName: users.fullName, studentEmail: users.email, raNumber: students.raNumber, department: students.department, academicYear: students.academicYear,
      eventTitle: events.title, eventDate: events.eventDate, startTime: events.startTime, endTime: events.endTime, venue: events.venue,
    })
    .from(odRequests)
    .innerJoin(users, eq(users.id, odRequests.userId))
    .innerJoin(students, eq(students.userId, users.id))
    .innerJoin(events, eq(events.id, odRequests.eventId))
    .orderBy(desc(odRequests.appliedAt))
    .all()
    .filter((r) => (user.role === "student" ? r.userId === user.id : user.role === "faculty" ? r.mentorId === user.id : true));
  return rows.map((r) => {
    const { affectedPeriodsSnapshot, ...rest } = r;
    const history = db
      .select({ action: odApprovalHistory.action, remarks: odApprovalHistory.remarks, isOverride: odApprovalHistory.isOverride, createdAt: odApprovalHistory.createdAt, actor: users.fullName })
      .from(odApprovalHistory)
      .innerJoin(users, eq(users.id, odApprovalHistory.actorId))
      .where(eq(odApprovalHistory.odId, r.id))
      .orderBy(odApprovalHistory.id)
      .all();
    return { ...rest, affectedPeriods: JSON.parse(affectedPeriodsSnapshot) as unknown[], history, canReview: r.status === "Pending" && canDecideOd(user, r) };
  });
}
