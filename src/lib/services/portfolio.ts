import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { users, students, clubs, clubMemberships, clubRoles, events, eventRegistrations, attendance, certificates, odRequests } from "@/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import { isInstAdmin } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { badgesOfStudent } from "./badges";
import { PdfWriter, safe } from "./pdf";

/** Everything here is read from the database. Nothing is accepted from the browser. */
export function getPortfolio(db: DB, viewer: SessionUser, userId: number) {
  const sp = db.select().from(students).where(eq(students.userId, userId)).get();
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (!sp || !u) throw notFound("Student portfolio not found");
  const allowed = viewer.id === userId || isInstAdmin(viewer) || (viewer.role === "faculty" && sp.mentorId === viewer.id);
  if (!allowed) throw forbidden("You cannot view this portfolio");
  const mentor = db.select({ n: users.fullName }).from(users).where(eq(users.id, sp.mentorId)).get();

  const memberships = db
    .select({ clubId: clubs.id, clubName: clubs.name, category: clubs.category, roleName: clubRoles.name, joinedAt: clubMemberships.joinedAt })
    .from(clubMemberships)
    .innerJoin(clubs, eq(clubs.id, clubMemberships.clubId))
    .leftJoin(clubRoles, eq(clubRoles.id, clubMemberships.roleId))
    .where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.status, "active")))
    .all();

  const attendedEvents = db
    .select({ id: events.id, title: events.title, eventDate: events.eventDate, startTime: events.startTime, endTime: events.endTime, venue: events.venue, clubName: clubs.name, checkInMethod: attendance.method, attendanceMarkedAt: attendance.markedAt })
    .from(attendance)
    .innerJoin(eventRegistrations, eq(eventRegistrations.id, attendance.registrationId))
    .innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .innerJoin(clubs, eq(clubs.id, events.clubId))
    .where(and(eq(eventRegistrations.userId, userId), eq(attendance.status, "Attended")))
    .orderBy(desc(events.eventDate))
    .all();

  const certs = db
    .select({ id: certificates.id, certificateNumber: certificates.certificateNumber, participationRole: certificates.participationRole, issuedAt: certificates.issuedAt, eventTitle: events.title, eventDate: events.eventDate, clubName: clubs.name })
    .from(certificates)
    .innerJoin(events, eq(events.id, certificates.eventId))
    .innerJoin(clubs, eq(clubs.id, certificates.clubId))
    .where(eq(certificates.userId, userId))
    .orderBy(desc(certificates.issuedAt))
    .all();

  const badges = badgesOfStudent(db, userId);
  const experience = [
    ...certs.filter((c) => c.participationRole === "Organizer" || c.participationRole === "Volunteer").map((c) => ({ type: c.participationRole as string, title: c.eventTitle, club: c.clubName, date: c.eventDate })),
    ...memberships.filter((m) => m.roleName).map((m) => ({ type: "Club leadership", title: m.roleName as string, club: m.clubName, date: m.joinedAt.toISOString().slice(0, 10) })),
  ];
  const achievements = [
    ...certs.filter((c) => c.participationRole === "Winner" || c.participationRole === "Runner-up").map((c) => ({ title: `${c.participationRole}: ${c.eventTitle}`, club: c.clubName, date: c.eventDate })),
    ...badges.map((b) => ({ title: `Badge: ${b.badgeName}`, club: b.clubName ?? "Campus-wide", date: b.awardedAt.toISOString().slice(0, 10) })),
  ];
  const od = db.select().from(odRequests).where(eq(odRequests.userId, userId)).all();

  return {
    user: { id: u.id, fullName: u.fullName, email: u.email },
    studentProfile: { raNumber: sp.raNumber, department: sp.department, academicYear: sp.academicYear, mentorName: mentor?.n ?? "Unassigned" },
    memberships,
    attendedEvents,
    certificates: certs,
    badges,
    experience,
    achievements,
    stats: {
      clubsCount: memberships.length,
      eventsAttendedCount: attendedEvents.length,
      certificatesCount: certs.length,
      badgesCount: badges.length,
      totalApprovedOD: od.filter((o) => o.status === "Approved").length,
    },
    provenance: "All records are read from the campus database; certificates and attendance were confirmed by authorised organisers.",
  };
}
export type Portfolio = ReturnType<typeof getPortfolio>;

/** Deterministic, fact-only text. This is template-based generation - NOT an AI model. */
export function buildTemplateSummary(p: Portfolio) {
  const s = p.studentProfile;
  const parts: string[] = [];
  parts.push(`${p.user.fullName} is a ${s.academicYear} student of ${s.department} (RA ${s.raNumber}).`);
  parts.push(
    `Verified campus activity: member of ${p.stats.clubsCount} club(s)${p.memberships.length ? ` (${p.memberships.map((m) => m.clubName).join(", ")})` : ""}; ` +
      `${p.stats.eventsAttendedCount} event(s) attended with confirmed attendance; ${p.stats.certificatesCount} certificate(s); ${p.stats.badgesCount} badge(s).`
  );
  const bullets: string[] = [];
  for (const e of p.attendedEvents) bullets.push(`Attended "${e.title}" (${e.clubName}) on ${e.eventDate} - attendance verified (${e.checkInMethod === "QR" ? "QR check-in" : "organiser-confirmed"}).`);
  for (const x of p.experience) bullets.push(`${x.type}: ${x.title} - ${x.club} (${x.date}).`);
  for (const c of p.certificates) bullets.push(`Certificate ${c.certificateNumber}: ${c.participationRole} at "${c.eventTitle}" (${c.clubName}).`);
  for (const b of p.badges) bullets.push(`Badge "${b.badgeName}": ${b.reason}`);
  return { text: parts.join(" "), bullets };
}

/** Optional AI rewrite (OpenAI-compatible API). Any failure falls back to the template so the portfolio never breaks. */
export async function generateSummary(db: DB, user: SessionUser) {
  const p = getPortfolio(db, user, user.id);
  const tpl = buildTemplateSummary(p);
  const { AI_API_URL, AI_API_KEY, AI_MODEL } = process.env;
  if (AI_API_URL && AI_API_KEY && AI_MODEL) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(AI_API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${AI_API_KEY}` },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: "Rewrite the FACTS as a concise, resume-ready paragraph. Use ONLY the supplied facts. Never add awards, roles, dates, skills or numbers that are not present." },
            { role: "user", content: JSON.stringify({ facts: [tpl.text, ...tpl.bullets] }) },
          ],
        }),
      });
      clearTimeout(timer);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (res.ok && content) return { source: "ai" as const, text: content, bullets: tpl.bullets, note: "Generated by an external AI model from your verified records. Review and edit before use." };
    } catch {
      /* fall through to the template */
    }
    return { source: "template" as const, text: tpl.text, bullets: tpl.bullets, note: "The AI service was unavailable, so the template-based summary is shown." };
  }
  return { source: "template" as const, text: tpl.text, bullets: tpl.bullets, note: "Template-based summary built only from your verified records (no AI model is configured)." };
}

export async function renderPortfolioPdf(p: Portfolio, studentSummary?: string) {
  const w = await PdfWriter.create(`Activity Portfolio - ${p.user.fullName}`);
  w.text("Co-curricular Activity Portfolio", { size: 20, bold: true });
  w.text(safe(p.user.fullName), { size: 14, bold: true });
  w.text(`RA ${p.studentProfile.raNumber}  |  ${p.studentProfile.department}  |  ${p.studentProfile.academicYear}  |  Class Mentor: ${p.studentProfile.mentorName}`, { size: 9, color: [0.35, 0.35, 0.4] });
  w.text(`Verified totals: ${p.stats.clubsCount} clubs, ${p.stats.eventsAttendedCount} events attended, ${p.stats.certificatesCount} certificates, ${p.stats.badgesCount} badges.`, { size: 10 });
  if (studentSummary?.trim()) {
    w.heading("Student summary (written/edited by the student - not verified data)");
    w.text(studentSummary.trim());
  }
  w.heading("Club memberships & leadership");
  if (!p.memberships.length) w.text("None recorded.");
  for (const m of p.memberships) w.text(`- ${m.clubName} (${m.category})${m.roleName ? ` - role: ${m.roleName}` : ""}`);
  w.heading("Verified event attendance");
  if (!p.attendedEvents.length) w.text("None recorded.");
  for (const e of p.attendedEvents) w.text(`- ${e.title} - ${e.clubName}, ${e.eventDate} (${e.checkInMethod === "QR" ? "QR" : "manual"} verification)`);
  w.heading("Volunteer & organiser experience");
  if (!p.experience.length) w.text("None recorded.");
  for (const x of p.experience) w.text(`- ${x.type}: ${x.title} - ${x.club} (${x.date})`);
  w.heading("Certificates");
  if (!p.certificates.length) w.text("None issued.");
  for (const c of p.certificates) w.text(`- ${c.certificateNumber}: ${c.participationRole}, ${c.eventTitle} (${c.clubName}) - verify at /verify-certificate/${c.certificateNumber}`);
  w.heading("Badges & achievements");
  if (!p.achievements.length) w.text("None recorded.");
  for (const a of p.achievements) w.text(`- ${a.title} - ${a.club} (${a.date})`);
  w.gap(12);
  w.text(p.provenance, { size: 8, color: [0.4, 0.4, 0.45] });
  return w.save();
}
