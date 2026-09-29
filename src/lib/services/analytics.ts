import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  users, clubs, clubMemberships, events, eventRegistrations, attendance, odRequests, certificates, awardedBadges,
  eventApprovalHistory, students,
} from "@/db/schema";
import { isInstAdmin } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { localDate } from "./common";

const count = (rows: unknown[]) => rows.length;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

function clubStats(db: DB, clubId: number, today: string) {
  const c = db.select().from(clubs).where(eq(clubs.id, clubId)).get();
  if (!c) return null;
  const members = db.select({ n: sql<number>`count(*)` }).from(clubMemberships).where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.status, "active"))).get()?.n ?? 0;
  const evs = db.select().from(events).where(eq(events.clubId, clubId)).all();
  const evIds = evs.map((e) => e.id);
  const regs = evIds.length ? db.select({ id: eventRegistrations.id }).from(eventRegistrations).where(inArray(eventRegistrations.eventId, evIds)).all() : [];
  const attended = regs.length
    ? db.select({ id: attendance.id }).from(attendance).where(and(inArray(attendance.registrationId, regs.map((r) => r.id)), eq(attendance.status, "Attended"))).all()
    : [];
  return {
    clubId, name: c.name, code: c.code, members,
    upcomingEvents: evs.filter((e) => e.status === "Approved" && e.eventDate >= today).length,
    completedEvents: evs.filter((e) => e.status === "Completed").length,
    pendingApprovals: evs.filter((e) => e.status === "Pending Faculty Approval").length,
    totalEvents: evs.length,
    registrations: regs.length,
    attended: attended.length,
    attendanceRate: pct(attended.length, regs.length),
  };
}

/** Every figure is computed from database rows, scoped to what the caller is allowed to see. */
export function getAnalytics(db: DB, user: SessionUser) {
  const today = localDate();
  const out: Record<string, unknown> = { role: user.role };
  out.demoDataPresent = (db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.isDemo, true)).get()?.n ?? 0) > 0;

  if (user.role === "student") {
    const joined = db
      .select({ clubId: clubs.id, name: clubs.name, code: clubs.code })
      .from(clubMemberships).innerJoin(clubs, eq(clubs.id, clubMemberships.clubId))
      .where(and(eq(clubMemberships.userId, user.id), eq(clubMemberships.status, "active"))).all();
    const regs = db
      .select({ regId: eventRegistrations.id, eventId: events.id, title: events.title, eventDate: events.eventDate, startTime: events.startTime, status: events.status, att: attendance.status })
      .from(eventRegistrations).innerJoin(events, eq(events.id, eventRegistrations.eventId)).leftJoin(attendance, eq(attendance.registrationId, eventRegistrations.id))
      .where(eq(eventRegistrations.userId, user.id)).all();
    const od = db.select().from(odRequests).where(eq(odRequests.userId, user.id)).orderBy(desc(odRequests.appliedAt)).all();
    const decided = od.filter((o) => o.status !== "Pending");
    out.student = {
      joinedClubs: joined,
      upcomingRegistered: regs.filter((r) => (r.status === "Approved" || r.status === "Ongoing") && r.eventDate >= today),
      attendedEvents: regs.filter((r) => r.att === "Attended").length,
      totalODs: od.length,
      approvedODs: od.filter((o) => o.status === "Approved").length,
      pendingODs: od.filter((o) => o.status === "Pending").length,
      odApprovalRate: pct(od.filter((o) => o.status === "Approved").length, decided.length),
      certificates: db.select({ id: certificates.id }).from(certificates).where(eq(certificates.userId, user.id)).all().length,
      badges: db.select({ id: awardedBadges.id }).from(awardedBadges).where(eq(awardedBadges.userId, user.id)).all().length,
      odHistory: od.slice(0, 5).map((o) => ({ id: o.id, status: o.status, minutes: o.totalAcademicMinutes, appliedAt: o.appliedAt })),
    };
  }

  const clubIds = new Set<number>([...user.managedClubIds, ...user.clubRoles.map((r) => r.clubId)]);
  if (clubIds.size > 0 && !isInstAdmin(user)) {
    const list = [...clubIds].map((id) => clubStats(db, id, today)).filter((x): x is NonNullable<typeof x> => x !== null);
    out.clubAdmin = {
      clubs: list,
      totals: {
        members: list.reduce((a, c) => a + c.members, 0), upcomingEvents: list.reduce((a, c) => a + c.upcomingEvents, 0), completedEvents: list.reduce((a, c) => a + c.completedEvents, 0),
        pendingApprovals: list.reduce((a, c) => a + c.pendingApprovals, 0), registrations: list.reduce((a, c) => a + c.registrations, 0), attended: list.reduce((a, c) => a + c.attended, 0),
      },
    };
  }

  if (user.role === "faculty") {
    const awaiting = db
      .select({ id: events.id, title: events.title, eventDate: events.eventDate, clubName: clubs.name })
      .from(events).innerJoin(clubs, eq(clubs.id, events.clubId))
      .where(and(eq(events.facultyCoordinatorId, user.id), eq(events.status, "Pending Faculty Approval"))).all();
    const odAll = db
      .select({ id: odRequests.id, status: odRequests.status, studentName: users.fullName, decidedAt: odRequests.decidedAt, appliedAt: odRequests.appliedAt, eventTitle: events.title })
      .from(odRequests).innerJoin(users, eq(users.id, odRequests.userId)).innerJoin(events, eq(events.id, odRequests.eventId))
      .where(eq(odRequests.mentorId, user.id)).all();
    const eventDecisions = db
      .select({ id: eventApprovalHistory.id, action: eventApprovalHistory.action, title: events.title, createdAt: eventApprovalHistory.createdAt })
      .from(eventApprovalHistory).innerJoin(events, eq(events.id, eventApprovalHistory.eventId))
      .where(and(eq(eventApprovalHistory.actorId, user.id), inArray(eventApprovalHistory.action, ["Approved", "Rejected"]))).orderBy(desc(eventApprovalHistory.id)).all();
    const mentees = db.select({ userId: students.userId, name: users.fullName, ra: students.raNumber }).from(students).innerJoin(users, eq(users.id, students.userId)).where(eq(students.mentorId, user.id)).all();
    const participation = mentees.map((m) => ({
      name: m.name, ra: m.ra,
      attended: db.select({ id: attendance.id }).from(attendance).innerJoin(eventRegistrations, eq(eventRegistrations.id, attendance.registrationId)).where(and(eq(eventRegistrations.userId, m.userId), eq(attendance.status, "Attended"))).all().length,
    }));
    out.faculty = {
      eventsAwaitingApproval: awaiting,
      odAwaitingReview: odAll.filter((o) => o.status === "Pending").length,
      odPending: odAll.filter((o) => o.status === "Pending").slice(0, 5),
      participation,
      decisions: {
        events: eventDecisions.slice(0, 8),
        eventsApproved: eventDecisions.filter((d) => d.action === "Approved").length,
        eventsRejected: eventDecisions.filter((d) => d.action === "Rejected").length,
        odApproved: odAll.filter((o) => o.status === "Approved").length,
        odRejected: odAll.filter((o) => o.status === "Rejected").length,
      },
    };
  }

  if (isInstAdmin(user)) {
    const allClubs = db.select().from(clubs).all();
    const stats = allClubs.map((c) => clubStats(db, c.id, today)).filter((x): x is NonNullable<typeof x> => x !== null);
    const allEvents = db.select({ status: events.status }).from(events).all();
    const memberships = db.select({ userId: clubMemberships.userId }).from(clubMemberships).where(eq(clubMemberships.status, "active")).all();
    const perUser = new Map<number, number>();
    for (const m of memberships) perUser.set(m.userId, (perUser.get(m.userId) ?? 0) + 1);
    out.admin = {
      totalClubs: allClubs.length,
      activeClubs: allClubs.filter((c) => !c.isArchived).length,
      totalMembers: memberships.length,
      totalEvents: count(allEvents),
      pendingApprovals: allEvents.filter((e) => e.status === "Pending Faculty Approval").length,
      totalRegistrations: db.select({ n: sql<number>`count(*)` }).from(eventRegistrations).get()?.n ?? 0,
      confirmedAttendance: db.select({ n: sql<number>`count(*)` }).from(attendance).where(eq(attendance.status, "Attended")).get()?.n ?? 0,
      approvedODs: db.select({ n: sql<number>`count(*)` }).from(odRequests).where(eq(odRequests.status, "Approved")).get()?.n ?? 0,
      pendingODs: db.select({ n: sql<number>`count(*)` }).from(odRequests).where(eq(odRequests.status, "Pending")).get()?.n ?? 0,
      crossClubParticipants: [...perUser.values()].filter((n) => n >= 2).length,
      eventStatus: ["Draft", "Pending Faculty Approval", "Approved", "Rejected", "Ongoing", "Completed", "Cancelled"].map((s) => ({ name: s, count: allEvents.filter((e) => e.status === s).length })),
      clubs: stats,
      mostActiveClubs: [...stats].sort((a, b) => b.totalEvents + b.attended - (a.totalEvents + a.attended)).slice(0, 5),
    };
  }
  return out;
}
