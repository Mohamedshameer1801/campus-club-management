import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB, DBLike } from "@/db";
import { certificates, events, clubs, users, students, eventRegistrations, attendance } from "@/db/schema";
import { PARTICIPATION_ROLES } from "@/lib/constants";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { canManageClub, hasClubPermission, isInstAdmin, requireClubPermission } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { audit, notify } from "./common";
import { parseCertificateTemplate } from "./clubs";
import { renderCertificatePdf } from "./pdf";

export const issueSchema = z
  .object({
    eventId: z.coerce.number().int().positive(),
    userId: z.coerce.number().int().positive().optional(),
    registrationId: z.coerce.number().int().positive().optional(),
    participationRole: z.enum(PARTICIPATION_ROLES).default("Participant"),
  })
  .refine((v) => v.userId || v.registrationId, "userId or registrationId is required");

export const bulkSchema = z.object({ eventId: z.coerce.number().int().positive(), defaultRole: z.enum(PARTICIPATION_ROLES).default("Participant") });

const newCertNumber = (code: string) => `CERT-${new Date().getFullYear()}-${code}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;

function issueTx(tx: DBLike, actor: SessionUser, ev: typeof events.$inferSelect, club: typeof clubs.$inferSelect, regId: number, userId: number, role: (typeof PARTICIPATION_ROLES)[number], ip?: string) {
  if (tx.select({ id: certificates.id }).from(certificates).where(eq(certificates.registrationId, regId)).get())
    throw conflict("A certificate has already been issued for this participation record", "CERTIFICATE_EXISTS");
  const att = tx.select().from(attendance).where(eq(attendance.registrationId, regId)).get();
  if (!att || att.status !== "Attended") throw badRequest("Certificates require confirmed attendance (status \"Attended\")", "ATTENDANCE_NOT_CONFIRMED");
  const cert = tx
    .insert(certificates)
    .values({ certificateNumber: newCertNumber(club.code), registrationId: regId, eventId: ev.id, userId, clubId: club.id, participationRole: role, templateSnapshot: club.certificateTemplate, issuedBy: actor.id })
    .returning()
    .get();
  notify(tx, userId, { title: "Certificate issued", message: `Your certificate for "${ev.title}" (${cert.certificateNumber}) is ready to download.`, type: "certificate", link: "/certificates" });
  audit(tx, actor.id, "ISSUE_CERTIFICATE", "certificates", cert.id, `${cert.certificateNumber} -> user ${userId}`, ip);
  return cert;
}

function loadIssuable(db: DBLike, actor: SessionUser, eventId: number) {
  const ev = db.select().from(events).where(eq(events.id, eventId)).get();
  if (!ev) throw notFound("Event not found");
  requireClubPermission(actor, ev.clubId, "issue_certificates"); // authorise BEFORE revealing state details
  if (ev.status !== "Completed") throw badRequest(`Certificates can only be issued for Completed events (this event is "${ev.status}")`, "EVENT_NOT_COMPLETED");
  const club = db.select().from(clubs).where(eq(clubs.id, ev.clubId)).get() as typeof clubs.$inferSelect;
  return { ev, club };
}

export function issueCertificate(db: DB, actor: SessionUser, input: z.infer<typeof issueSchema>, ip?: string) {
  const { ev, club } = loadIssuable(db, actor, input.eventId);
  return db.transaction((tx) => {
    const reg = input.registrationId
      ? tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.id, input.registrationId), eq(eventRegistrations.eventId, ev.id))).get()
      : tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.userId, input.userId as number), eq(eventRegistrations.eventId, ev.id))).get();
    if (!reg) throw badRequest("The student is not registered for this event", "NOT_REGISTERED");
    return issueTx(tx, actor, ev, club, reg.id, reg.userId, input.participationRole, ip);
  });
}

export function bulkIssue(db: DB, actor: SessionUser, input: z.infer<typeof bulkSchema>, ip?: string) {
  const { ev, club } = loadIssuable(db, actor, input.eventId);
  return db.transaction((tx) => {
    const attended = tx
      .select({ regId: eventRegistrations.id, userId: eventRegistrations.userId })
      .from(eventRegistrations)
      .innerJoin(attendance, eq(attendance.registrationId, eventRegistrations.id))
      .where(and(eq(eventRegistrations.eventId, ev.id), eq(attendance.status, "Attended")))
      .all();
    if (attended.length === 0) throw badRequest("No attendees with confirmed attendance for this event", "NO_ATTENDEES");
    let issued = 0;
    for (const a of attended) {
      if (tx.select({ id: certificates.id }).from(certificates).where(eq(certificates.registrationId, a.regId)).get()) continue;
      issueTx(tx, actor, ev, club, a.regId, a.userId, input.defaultRole, ip);
      issued++;
    }
    audit(tx, actor.id, "BULK_ISSUE_CERTIFICATES", "events", ev.id, `${issued} issued, ${attended.length - issued} already existed`, ip);
    return { issuedCount: issued, alreadyIssued: attended.length - issued };
  });
}

const certRows = (db: DBLike) =>
  db
    .select({
      id: certificates.id, certificateNumber: certificates.certificateNumber, eventId: certificates.eventId, userId: certificates.userId, clubId: certificates.clubId,
      participationRole: certificates.participationRole, issuedAt: certificates.issuedAt, templateSnapshot: certificates.templateSnapshot,
      studentName: users.fullName, studentEmail: users.email, raNumber: students.raNumber, department: students.department, academicYear: students.academicYear,
      eventTitle: events.title, eventDate: events.eventDate, clubName: clubs.name, clubTemplate: clubs.certificateTemplate,
    })
    .from(certificates)
    .innerJoin(users, eq(users.id, certificates.userId))
    .leftJoin(students, eq(students.userId, users.id))
    .innerJoin(events, eq(events.id, certificates.eventId))
    .innerJoin(clubs, eq(clubs.id, certificates.clubId))
    .orderBy(desc(certificates.issuedAt));

/** Scope: students own certificates; club staff their clubs; Faculty Coordinators (oversight) their clubs; admins all. */
function certInScope(u: SessionUser, c: { userId: number; clubId: number }) {
  if (c.userId === u.id) return true; // owners always see their own
  if (isInstAdmin(u)) return true;
  return canManageClub(u, c.clubId) || hasClubPermission(u, c.clubId, "issue_certificates") || u.coordinatedClubIds.includes(c.clubId);
}

export function listCertificates(db: DB, user: SessionUser, eventId?: number) {
  return certRows(db)
    .all()
    .filter((c) => certInScope(user, c) && (!eventId || c.eventId === eventId))
    .map(({ templateSnapshot: _t, clubTemplate: _c, ...rest }) => {
      void _t;
      void _c;
      return rest;
    });
}

export async function certificatePdf(db: DB, user: SessionUser, id: number, origin: string) {
  const c = certRows(db).all().find((x) => x.id === id);
  if (!c || !certInScope(user, c)) throw notFound("Certificate not found");
  const tpl = parseCertificateTemplate(c.templateSnapshot ?? c.clubTemplate);
  const verifyUrl = `${process.env.APP_URL || origin}/verify-certificate/${c.certificateNumber}`;
  const bytes = await renderCertificatePdf(
    { certificateNumber: c.certificateNumber, studentName: c.studentName, raNumber: c.raNumber ?? "N/A", eventTitle: c.eventTitle, clubName: c.clubName, eventDate: c.eventDate, participationRole: c.participationRole, issuedAt: c.issuedAt },
    tpl,
    verifyUrl
  );
  return { bytes, filename: `${c.certificateNumber}.pdf` };
}

/** Public verification - exposes only what is needed to validate the credential (RA number is masked). */
export function verifyCertificate(db: DB, number: string) {
  if (!/^CERT-[A-Za-z0-9-]{6,40}$/.test(number)) return { isValid: false, message: "Certificate not found in the official registry." };
  const c = certRows(db).all().find((x) => x.certificateNumber === number);
  if (!c) return { isValid: false, message: "Certificate not found in the official registry." };
  const ra = c.raNumber ?? "";
  return {
    isValid: true,
    certificate: {
      certificateNumber: c.certificateNumber,
      studentName: c.studentName,
      maskedRANumber: ra.length === 15 ? `${ra.slice(0, 4)}*******${ra.slice(-4)}` : "********",
      eventTitle: c.eventTitle,
      eventDate: c.eventDate,
      clubName: c.clubName,
      participationRole: c.participationRole,
      issuedAt: c.issuedAt,
    },
  };
}
