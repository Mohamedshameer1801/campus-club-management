import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, R, call, client, clubId, idOf, makeApprovedEvent, makeStudent, one, pid, q, run, setupApp, unread, type Client } from "./helpers";
import { hashToken } from "@/lib/session";

let alex: Client, jordan: Client, thorne: Client, wright: Client, maya: Client, dev: Client, priya: Client, admin: Client;
beforeAll(async () => {
  setupApp();
  [alex, jordan, thorne, wright, maya, dev, priya, admin] = await Promise.all([EMAILS.alex, EMAILS.jordan, EMAILS.thorne, EMAILS.wright, EMAILS.maya, EMAILS.dev, EMAILS.priya, EMAILS.admin].map((e) => client(e)));
});

const regId = (ev: number, userId: number) => (one<{ id: number }>("select id from event_registrations where event_id = ? and user_id = ?", ev, userId) as { id: number }).id;
const mark = (staff: Client, ev: number, userId: number, s: "Attended" | "Absent" | "Registered") => staff.call(R.attendance.POST, { params: pid(ev), body: { registrationId: regId(ev, userId), attendanceStatus: s } });
const setStatus = (ev: number, s: "Ongoing" | "Completed" | "Cancelled") => alex.call(R.status.POST, { params: pid(ev), body: { status: s } });
const pdfHead = (d: unknown) => Buffer.from(d as Uint8Array).subarray(0, 5).toString();

describe("certificate issuance rules", () => {
  let ev = 0;
  let mayaCert: { id: number; certificateNumber: string };

  it("requires authorisation, a Completed event and CONFIRMED attendance", async () => {
    ev = await makeApprovedEvent();
    for (const c of [maya, dev, priya]) await c.call(R.eventRegister.POST, { params: pid(ev) });
    const notCompleted = await alex.call(R.certs.POST, { body: { eventId: ev, userId: idOf(EMAILS.maya) } });
    expect(notCompleted.status).toBe(400);
    expect(notCompleted.data.code).toBe("EVENT_NOT_COMPLETED");
    expect((await jordan.call(R.certs.POST, { body: { eventId: ev, userId: idOf(EMAILS.maya) } })).status).toBe(403); // wrong club, refused before state is revealed
    expect((await maya.call(R.certs.POST, { body: { eventId: ev, userId: idOf(EMAILS.maya) } })).status).toBe(403);
    expect((await thorne.call(R.certs.POST, { body: { eventId: ev, userId: idOf(EMAILS.maya) } })).status).toBe(403); // coordinators oversee, they do not issue
    await setStatus(ev, "Ongoing");
    expect((await mark(alex, ev, idOf(EMAILS.maya), "Attended")).status).toBe(200);
    expect((await mark(alex, ev, idOf(EMAILS.dev), "Absent")).status).toBe(200);
    await setStatus(ev, "Completed");
    for (const email of [EMAILS.dev, EMAILS.priya]) {
      const r = await alex.call(R.certs.POST, { body: { eventId: ev, userId: idOf(email) } });
      expect(r.status, email).toBe(400);
      expect(r.data.code).toBe("ATTENDANCE_NOT_CONFIRMED");
    }
    const stranger = await makeStudent();
    expect((await alex.call(R.certs.POST, { body: { eventId: ev, userId: stranger.id } })).data.code).toBe("NOT_REGISTERED");
    expect(one("select count(*) n from certificates where event_id = ?", ev)).toEqual({ n: 0 });
  });

  it("issues one unique certificate per participation, notifies the student and audits it", async () => {
    const before = unread(EMAILS.maya, "certificate");
    const r = await alex.call(R.certs.POST, { body: { eventId: ev, userId: idOf(EMAILS.maya), participationRole: "Winner" } });
    expect(r.status).toBe(200);
    mayaCert = r.data.certificate;
    expect(mayaCert.certificateNumber).toMatch(/^CERT-\d{4}-TCC-[0-9A-F]{10}$/);
    expect(unread(EMAILS.maya, "certificate")).toBe(before + 1);
    expect(one("select participation_role from certificates where id = ?", mayaCert.id)).toEqual({ participation_role: "Winner" });
    expect(one("select count(*) n from audit_logs where action = 'ISSUE_CERTIFICATE'")).toEqual({ n: 1 });
    const dup = await alex.call(R.certs.POST, { body: { eventId: ev, userId: idOf(EMAILS.maya) } });
    expect(dup.status).toBe(409);
    expect(dup.data.code).toBe("CERTIFICATE_EXISTS");
    expect((await mark(alex, ev, idOf(EMAILS.maya), "Absent")).status).toBe(409); // attendance is locked once a certificate exists
    expect(one("select count(*) n from certificates where user_id = ? and event_id = ?", idOf(EMAILS.maya), ev)).toEqual({ n: 1 });
  });

  it("a dynamic-role holder (issue_certificates) can issue only inside their own club", async () => {
    expect((await mark(alex, ev, idOf(EMAILS.dev), "Attended")).status).toBe(200);
    const r = await priya.call(R.certs.POST, { body: { eventId: ev, userId: idOf(EMAILS.dev), participationRole: "Volunteer" } });
    expect(r.status).toBe(200);
    expect(one("select participation_role, issued_by from certificates where user_id = ? and event_id = ?", idOf(EMAILS.dev), ev)).toEqual({ participation_role: "Volunteer", issued_by: idOf(EMAILS.priya) });
    const robo = await makeApprovedEvent({ club: "ROBO" });
    expect((await priya.call(R.certs.POST, { body: { eventId: robo, userId: idOf(EMAILS.maya) } })).status).toBe(403);
    expect((await priya.call(R.certBulk.POST, { body: { eventId: robo } })).status).toBe(403);
  });

  it("generates a real downloadable PDF, restricted to the owner, club staff, coordinator and admins", async () => {
    const ok = await maya.call(R.certPdf.GET, { params: pid(mayaCert.id) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(ok.headers.get("content-disposition")).toContain(mayaCert.certificateNumber);
    expect(pdfHead(ok.data)).toBe("%PDF-");
    expect((ok.data as Uint8Array).length).toBeGreaterThan(2000);
    expect(Buffer.from(ok.data as Uint8Array).toString("latin1")).toContain("%%EOF");
    for (const c of [alex, thorne, admin]) expect((await c.call(R.certPdf.GET, { params: pid(mayaCert.id) })).status, c.email).toBe(200);
    for (const c of [dev, jordan, wright]) expect((await c.call(R.certPdf.GET, { params: pid(mayaCert.id) })).status, c.email).toBe(404);
    expect((await call(R.certPdf.GET, { params: pid(mayaCert.id) })).status).toBe(401);
    expect((await maya.call(R.certPdf.GET, { params: pid(999999) })).status).toBe(404);
  });

  it("public verification exposes only what is needed and masks the RA Number", async () => {
    const r = await call(R.certVerify.GET, { params: { certificateNumber: mayaCert.certificateNumber } });
    expect(r.status).toBe(200);
    expect(r.data.isValid).toBe(true);
    expect(r.data.certificate.studentName).toBe("Maya Patel");
    expect(r.data.certificate.maskedRANumber).toBe("RA23*******0045");
    const text = JSON.stringify(r.data);
    for (const leaked of ["RA2311003010045", "maya@student", "Computer Science", "department", "email"]) expect(text).not.toContain(leaked);
    expect((await call(R.certVerify.GET, { params: { certificateNumber: "CERT-2026-TCC-DOESNOTEXIST" } })).data.isValid).toBe(false);
    expect((await call(R.certVerify.GET, { params: { certificateNumber: "x' OR '1'='1" } })).data.isValid).toBe(false);
    expect((await call(R.certVerify.GET, { params: { certificateNumber: "CERT-DEMO-TCC-000001" } })).data.isValid).toBe(true);
  });

  it("bulk issuance covers exactly the confirmed attendees and is idempotent; club templates are honoured", async () => {
    expect((await alex.call(R.template.PUT, { method: "PUT", params: pid(clubId("TCC")), body: { headerTitle: "Certificate of Excellence", accentColor: "#ff0000", signatoryName: "Alex Rivera", signatoryTitle: "President", bodyText: "{name} excelled at {event}." } })).status).toBe(200);
    expect((await alex.call(R.template.PUT, { method: "PUT", params: pid(clubId("TCC")), body: { accentColor: "red" } })).status).toBe(400);
    expect((await jordan.call(R.template.PUT, { method: "PUT", params: pid(clubId("TCC")), body: { headerTitle: "Hijack" } })).status).toBe(403);
    expect((await maya.call(R.template.PUT, { method: "PUT", params: pid(clubId("TCC")), body: { headerTitle: "Hijack" } })).status).toBe(403);
    const e = await makeApprovedEvent();
    const extra = [await makeStudent(), await makeStudent()];
    for (const c of [maya, dev, ...extra]) await c.call(R.eventRegister.POST, { params: pid(e) });
    await setStatus(e, "Ongoing");
    await mark(alex, e, idOf(EMAILS.maya), "Attended");
    await mark(alex, e, extra[0].id, "Attended");
    await mark(alex, e, extra[1].id, "Attended");
    await mark(alex, e, idOf(EMAILS.dev), "Absent");
    await setStatus(e, "Completed");
    expect((await jordan.call(R.certBulk.POST, { body: { eventId: e } })).status).toBe(403);
    const first = await alex.call(R.certBulk.POST, { body: { eventId: e } });
    expect(first.data.issuedCount).toBe(3);
    const again = await alex.call(R.certBulk.POST, { body: { eventId: e } });
    expect(again.data).toMatchObject({ issuedCount: 0, alreadyIssued: 3 });
    expect(one("select count(*) n from certificates where event_id = ?", e)).toEqual({ n: 3 });
    expect(one("select template_snapshot from certificates where event_id = ? limit 1", e)?.template_snapshot).toContain("Certificate of Excellence");
    const c = one<{ id: number }>("select id from certificates where event_id = ? and user_id = ?", e, idOf(EMAILS.maya)) as { id: number };
    expect(pdfHead((await maya.call(R.certPdf.GET, { params: pid(c.id) })).data)).toBe("%PDF-");
    const noOne = await makeApprovedEvent();
    await setStatus(noOne, "Ongoing");
    await setStatus(noOne, "Completed");
    expect((await alex.call(R.certBulk.POST, { body: { eventId: noOne } })).status).toBe(400);
  });
});

describe("dynamic QR attendance", () => {
  let ev = 0;
  let token = "";
  let extras: Awaited<ReturnType<typeof makeStudent>>[] = [];
  const gen = (c: Client, event = ev, minutes?: number) => c.call(R.qrGen.POST, { body: { eventId: event, validityMinutes: minutes } });

  it("QR codes can only be generated by authorised staff while the event is Ongoing", async () => {
    ev = await makeApprovedEvent();
    for (const c of [maya, dev]) await c.call(R.eventRegister.POST, { params: pid(ev) });
    extras = [await makeStudent(), await makeStudent(), await makeStudent()];
    for (const c of extras) expect((await c.call(R.eventRegister.POST, { params: pid(ev) })).status).toBe(200); // registered while the event is still Approved
    const early = await gen(alex);
    expect(early.status).toBe(409);
    expect(early.data.code).toBe("EVENT_NOT_ONGOING");
    await setStatus(ev, "Ongoing");
    for (const c of [maya, jordan, thorne]) expect((await gen(c)).status, c.email).toBe(403);
    expect((await call(R.qrGen.POST, { body: { eventId: ev } })).status).toBe(401);
    expect((await gen(priya)).status).toBe(200); // Tech Lead holds record_attendance for this club
    const r = await gen(alex);
    expect(r.status).toBe(200);
    token = r.data.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(r.data.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(r.data.checkinUrl).toContain(token);
    expect(new Date(r.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(r.data.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 1000);
  });

  it("tokens are unpredictable, stored only as hashes, and superseded by newer codes", async () => {
    const r2 = await gen(alex);
    expect(r2.data.token).not.toBe(token);
    expect(one("select count(*) n from qr_tokens where token_hash = ?", token)).toEqual({ n: 0 });
    expect(one("select count(*) n from qr_tokens where token_hash = ?", hashToken(token))).toEqual({ n: 1 });
    const old = await maya.call(R.qrCheckin.POST, { body: { token } });
    expect(old.status).toBe(400);
    expect(old.data.code).toBe("QR_INVALID");
    expect(one("select count(*) n from qr_tokens where event_id = ? and is_active = 1", ev)).toEqual({ n: 1 });
    token = r2.data.token;
  });

  it("validates registration, authenticity, duplicates and feeds the real attendance record", async () => {
    expect((await call(R.qrCheckin.POST, { body: { token } })).status).toBe(401);
    expect((await maya.call(R.qrCheckin.POST, { body: { token: "totally-fabricated-token-value" } })).status).toBe(400);
    const stranger = await makeStudent();
    const notReg = await stranger.call(R.qrCheckin.POST, { body: { token } });
    expect(notReg.status).toBe(403);
    expect(one("select count(*) n from attendance a join event_registrations r on r.id = a.registration_id where r.user_id = ?", stranger.id)).toEqual({ n: 0 });
    const before = unread(EMAILS.maya, "attendance");
    const ok = await maya.call(R.qrCheckin.POST, { body: { token } });
    expect(ok.status).toBe(200);
    expect(one("select status, method from attendance where registration_id = ?", regId(ev, idOf(EMAILS.maya)))).toEqual({ status: "Attended", method: "QR" });
    expect(one("select count(*) n from qr_checkins where registration_id = ?", regId(ev, idOf(EMAILS.maya)))).toEqual({ n: 1 });
    expect(unread(EMAILS.maya, "attendance")).toBe(before + 1);
    const dup = await maya.call(R.qrCheckin.POST, { body: { token } });
    expect(dup.status).toBe(409);
    expect(dup.data.code).toBe("ALREADY_CHECKED_IN");
    const roster = (await alex.call(R.registrations.GET, { params: pid(ev) })).data.registrations as { userId: number; attendanceStatus: string; checkInMethod: string | null }[];
    expect(roster.find((r) => r.userId === idOf(EMAILS.maya))).toMatchObject({ attendanceStatus: "Attended", checkInMethod: "QR" });
    expect(roster.find((r) => r.userId === idOf(EMAILS.dev))).toMatchObject({ attendanceStatus: "Registered", checkInMethod: null });
  });

  it("the identity always comes from the session - a student cannot check in on behalf of another", async () => {
    const [s1, s2] = extras;
    const r = await s1.call(R.qrCheckin.POST, { body: { token, userId: s2.id, studentId: s2.id, registrationId: regId(ev, s2.id) } });
    expect(r.status).toBe(200);
    expect(one("select status from attendance where registration_id = ?", regId(ev, s1.id))).toEqual({ status: "Attended" });
    expect(one("select count(*) n from attendance where registration_id = ?", regId(ev, s2.id))).toEqual({ n: 0 });
  });

  it("accepts the scanned URL form, rejects expired codes and closed events", async () => {
    const url = (await gen(alex)).data.checkinUrl as string;
    const fresh = extras[2];
    expect((await fresh.call(R.qrCheckin.POST, { body: { token: url } })).status).toBe(200);
    const t2 = (await gen(alex)).data.token as string;
    run("update qr_tokens set expires_at = ? where token_hash = ?", Date.now() - 1000, hashToken(t2));
    const expired = await dev.call(R.qrCheckin.POST, { body: { token: t2 } });
    expect(expired.status).toBe(400);
    expect(expired.data.code).toBe("QR_EXPIRED");
    const t3 = (await gen(alex)).data.token as string;
    await setStatus(ev, "Completed");
    const closed = await dev.call(R.qrCheckin.POST, { body: { token: t3 } });
    expect(closed.status).toBe(409);
    expect(closed.data.code).toBe("EVENT_NOT_ONGOING");
  });

  it("manual attendance remains available as an authorised fallback and QR attendance unlocks certificates", async () => {
    expect((await mark(alex, ev, idOf(EMAILS.dev), "Attended")).status).toBe(200);
    expect(one("select method from attendance where registration_id = ?", regId(ev, idOf(EMAILS.dev)))).toEqual({ method: "Manual" });
    expect((await mark(jordan, ev, idOf(EMAILS.dev), "Absent")).status).toBe(403);
    expect((await alex.call(R.certs.POST, { body: { eventId: ev, userId: idOf(EMAILS.maya) } })).status).toBe(200); // attended via QR
    expect(q("select id from qr_checkins")).not.toHaveLength(0);
  });
});
