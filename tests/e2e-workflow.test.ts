import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, PASSWORD, R, call, client, cookieFrom, futureDate, idOf, one, pid, q, setupApp, type Client } from "./helpers";
import { openDatabase } from "@/db";

/**
 * Full user journey through the real API (real sessions, real SQLite file):
 * Super Admin sets up staff + club -> student registers & joins -> event proposed -> faculty approves -> student registers
 * -> OD applied & approved by the Class Mentor -> event started, QR generated, student checks in -> event completed
 * -> certificates issued -> PDF + public verification -> badges, portfolio, analytics and audit trail.
 */
let sa: Client, admin: Client;
beforeAll(() => {
  setupApp();
});

describe("end-to-end campus workflow", () => {
  const S = { faculty: "prof.new@campus.edu", clubAdmin: "lead.new@campus.edu", student: "rina@student.campus.edu", ra: "RA2411009900001" };
  let facultyId = 0, clubAdminId = 0, clubIdNew = 0, eventId = 0, odId = 0, certId = 0, certNumber = "";
  let faculty: Client, lead: Client, stu: Client & { id?: number };
  let studentId = 0;

  it("Super Admin creates a faculty member, a club admin and a club", async () => {
    sa = await client(EMAILS.superAdmin);
    admin = await client(EMAILS.admin);
    const f = await sa.call(R.users.POST, { body: { email: S.faculty, fullName: "Prof. Nadia Rao", password: PASSWORD, role: "faculty", department: "Mechanical", designation: "Professor" } });
    expect(f.status).toBe(200);
    facultyId = f.data.user.id;
    const c = await admin.call(R.users.POST, { body: { email: S.clubAdmin, fullName: "Kabir Lead", password: PASSWORD, role: "club_admin" } });
    expect(c.status).toBe(200);
    clubAdminId = c.data.user.id;
    const club = await sa.call(R.clubs.POST, { body: { name: "Design & Fabrication Club", code: "DFC", category: "Technical", description: "Makerspace projects and CAD workshops.", clubAdminId, facultyCoordinatorId: facultyId } });
    expect(club.status).toBe(200);
    clubIdNew = club.data.club.id;
    faculty = await client(S.faculty);
    lead = await client(S.clubAdmin);
  });

  it("a student registers with the new mentor (visible in the public mentor list) and joins the club", async () => {
    const mentors = (await call(R.mentors.GET)).data.mentors as { id: number; fullName: string }[];
    expect(mentors.some((m) => m.id === facultyId)).toBe(true);
    const r = await call(R.register.POST, { body: { fullName: "Rina Kapoor", email: S.student, password: PASSWORD, raNumber: S.ra, department: "Mechanical", academicYear: "2nd Year", mentorId: facultyId } });
    expect(r.status).toBe(201);
    studentId = r.data.user.id;
    const cookie = cookieFrom(r.headers);
    stu = { cookie, email: S.student, call: (h, o = {}) => call(h, { ...o, cookie }) };
    expect((await stu.call(R.me.GET)).data.user.studentProfile).toMatchObject({ raNumber: S.ra, mentorId: facultyId });
    expect((await stu.call(R.join.POST, { params: pid(clubIdNew) })).status).toBe(200);
  });

  it("the club admin defines a dynamic role; the event goes through faculty approval", async () => {
    const role = await lead.call(R.roles.POST, { params: pid(clubIdNew), body: { roleName: "Workshop Lead", permissions: ["create_events", "record_attendance"] } });
    expect(role.status).toBe(200);
    const created = await lead.call(R.events.POST, { body: { clubId: clubIdNew, title: "CAD Workshop", description: "Hands-on CAD and 3D printing workshop.", eventDate: futureDate(2), startTime: "09:30", endTime: "15:30", venue: "Maker Lab", maxCapacity: 25, submitImmediately: true } });
    expect(created.status).toBe(200);
    eventId = created.data.event.id;
    expect((await stu.call(R.eventById.GET, { params: pid(eventId) })).status).toBe(404); // not yet approved
    expect((await faculty.call(R.approve.POST, { params: pid(eventId), body: { decision: "Approved", facultyRemarks: "Approved" } })).status).toBe(200);
    expect((await stu.call(R.eventById.GET, { params: pid(eventId) })).data.event.permissions.canRegister).toBe(true);
    expect((await stu.call(R.eventRegister.POST, { params: pid(eventId) })).status).toBe(200);
  });

  it("the student applies for OD and only the assigned Class Mentor approves", async () => {
    const preview = (await stu.call(R.odOverlap.POST, { body: { eventId } })).data;
    expect(preview.affectedPeriods).toHaveLength(6);
    const apply = await stu.call(R.odApply.POST, { body: { eventId, reason: "Attending the CAD workshop" } });
    expect(apply.status).toBe(200);
    odId = apply.data.onDutyRequest.id;
    expect((await faculty.call(R.od.GET)).data.onDutyRequests.map((o: { id: number }) => o.id)).toContain(odId);
    expect((await (await client(EMAILS.thorne)).call(R.odReview.POST, { params: pid(odId), body: { decision: "Approved" } })).status).toBe(403);
    expect((await faculty.call(R.odReview.POST, { params: pid(odId), body: { decision: "Approved", mentorRemarks: "Enjoy" } })).status).toBe(200);
    expect((await stu.call(R.od.GET)).data.onDutyRequests[0]).toMatchObject({ status: "Approved", mentorRemarks: "Enjoy", totalAcademicMinutes: 300 });
  });

  it("the event is started, a QR code is generated and the student checks in", async () => {
    expect((await lead.call(R.status.POST, { params: pid(eventId), body: { status: "Ongoing" } })).status).toBe(200);
    const qr = await lead.call(R.qrGen.POST, { body: { eventId } });
    expect(qr.status).toBe(200);
    expect((await stu.call(R.qrCheckin.POST, { body: { token: qr.data.token } })).status).toBe(200);
    const roster = (await lead.call(R.registrations.GET, { params: pid(eventId) })).data.registrations;
    expect(roster[0]).toMatchObject({ fullName: "Rina Kapoor", attendanceStatus: "Attended", checkInMethod: "QR", raNumber: S.ra });
  });

  it("completion unlocks certificates: bulk issue, PDF download, public verification", async () => {
    expect((await lead.call(R.status.POST, { params: pid(eventId), body: { status: "Completed" } })).status).toBe(200);
    const bulk = await lead.call(R.certBulk.POST, { body: { eventId, defaultRole: "Participant" } });
    expect(bulk.data.issuedCount).toBe(1);
    const list = (await stu.call(R.certs.GET)).data.certificates;
    expect(list).toHaveLength(1);
    certId = list[0].id;
    certNumber = list[0].certificateNumber;
    const pdf = await stu.call(R.certPdf.GET, { params: pid(certId) });
    expect(Buffer.from(pdf.data as Uint8Array).subarray(0, 5).toString()).toBe("%PDF-");
    const v = await call(R.certVerify.GET, { params: { certificateNumber: certNumber } });
    expect(v.data).toMatchObject({ isValid: true, certificate: { studentName: "Rina Kapoor", eventTitle: "CAD Workshop", clubName: "Design & Fabrication Club" } });
    expect(JSON.stringify(v.data)).not.toContain(S.ra);
  });

  it("badges, portfolio and role dashboards reflect the real records", async () => {
    const portfolio = (await stu.call(R.portfolio.GET, { params: { userId: String(studentId) } })).data.portfolio;
    expect(portfolio.attendedEvents.map((e: { title: string }) => e.title)).toEqual(["CAD Workshop"]);
    expect(portfolio.certificates).toHaveLength(1);
    expect(portfolio.badges.map((b: { badgeName: string }) => b.badgeName)).toContain("First Event"); // verifiable system rule
    const a = (await stu.call(R.analytics.GET)).data.student;
    expect(a).toMatchObject({ attendedEvents: 1, certificates: 1, approvedODs: 1, totalODs: 1, odApprovalRate: 100 });
    expect(a.badges).toBeGreaterThanOrEqual(1);
    const ca = (await lead.call(R.analytics.GET)).data.clubAdmin;
    expect(ca.clubs[0]).toMatchObject({ code: "DFC", members: 1, completedEvents: 1, registrations: 1, attended: 1, attendanceRate: 100 });
    const fa = (await faculty.call(R.analytics.GET)).data.faculty;
    expect(fa.decisions).toMatchObject({ eventsApproved: 1, odApproved: 1 });
    expect(fa.participation[0]).toMatchObject({ name: "Rina Kapoor", attended: 1 });
    const ad = (await admin.call(R.analytics.GET)).data.admin;
    expect(ad.totalClubs).toBe(4);
    expect(ad.crossClubParticipants).toBe(1); // Maya belongs to two seeded clubs
    expect(ad.eventStatus.find((s: { name: string }) => s.name === "Completed").count).toBe(2);
  });

  it("the audit trail recorded every sensitive action and demo data stays distinguishable", async () => {
    const actions = ((await sa.call(R.audit.GET, { url: "/api/audit-logs?limit=500" })).data.auditLogs as { action: string }[]).map((l) => l.action);
    for (const a of ["CREATE_ACCOUNT", "CREATE_CLUB", "CREATE_CLUB_ROLE", "APPROVE_EVENT", "SUBMIT_OD", "APPROVE_OD", "GENERATE_QR", "CHANGE_EVENT_STATUS", "BULK_ISSUE_CERTIFICATES", "ISSUE_CERTIFICATE"]) expect(actions, a).toContain(a);
    expect(one("select count(*) n from users where is_demo = 0")).toEqual({ n: 3 }); // the three accounts created during this journey are NOT demo records
    expect(one("select count(*) n from clubs where is_demo = 0")).toEqual({ n: 1 });
    expect((await admin.call(R.analytics.GET)).data.demoDataPresent).toBe(true);
  });

  it("data persists across a fresh database connection (server restart)", () => {
    const { sqlite } = openDatabase(process.env.DATABASE_PATH as string);
    expect(sqlite.prepare("select count(*) n from certificates where certificate_number = ?").get(certNumber)).toEqual({ n: 1 });
    expect(sqlite.prepare("select status from od_requests where id = ?").get(odId)).toEqual({ status: "Approved" });
    expect(q("select id from sessions").length).toBeGreaterThan(0);
    sqlite.close();
    expect(idOf(S.student)).toBe(studentId);
  });
});
