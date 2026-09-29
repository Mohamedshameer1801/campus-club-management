import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, R, call, client, clubId, futureDate, idOf, makeApprovedEvent, one, pid, q, setupApp, unread, type Client } from "./helpers";

let alex: Client, jordan: Client, thorne: Client, wright: Client, maya: Client, dev: Client, priya: Client, admin: Client;
beforeAll(async () => {
  setupApp();
  [alex, jordan, thorne, wright, maya, dev, priya, admin] = await Promise.all([EMAILS.alex, EMAILS.jordan, EMAILS.thorne, EMAILS.wright, EMAILS.maya, EMAILS.dev, EMAILS.priya, EMAILS.admin].map((e) => client(e)));
});
const badgeId = (name: string) => (one<{ id: number }>("select id from badge_definitions where name = ?", name) as { id: number }).id;
const membership = (club: string, email: string) => (one<{ id: number }>("select id from club_memberships where club_id = ? and user_id = ?", clubId(club), idOf(email)) as { id: number }).id;
const regId = (ev: number, userId: number) => (one<{ id: number }>("select id from event_registrations where event_id = ? and user_id = ?", ev, userId) as { id: number }).id;

describe("mandatory notification triggers (created only after the operation succeeds)", () => {
  it("1+2: event submitted -> Faculty Coordinator; approved/rejected -> creator (Club Admin)", async () => {
    const t0 = unread(EMAILS.thorne, "event");
    const a0 = unread(EMAILS.alex, "event");
    const e = (await alex.call(R.events.POST, { body: { clubId: clubId("TCC"), title: "Notif Event", description: "Event for notification tests", eventDate: futureDate(2), startTime: "10:00", endTime: "12:00", venue: "Hall", maxCapacity: 10, submitImmediately: true } })).data.event.id as number;
    expect(unread(EMAILS.thorne, "event")).toBe(t0 + 1);
    await wright.call(R.approve.POST, { params: pid(e), body: { decision: "Approved" } }); // refused -> no notification
    expect(unread(EMAILS.alex, "event")).toBe(a0);
    await thorne.call(R.approve.POST, { params: pid(e), body: { decision: "Rejected", rejectionReason: "Needs a bigger venue" } });
    expect(unread(EMAILS.alex, "event")).toBe(a0 + 1);
    expect(one("select message from notifications where user_id = ? order by id desc limit 1", idOf(EMAILS.alex))?.message).toContain("Needs a bigger venue");
    await alex.call(R.submit.POST, { params: pid(e), body: {} });
    await thorne.call(R.approve.POST, { params: pid(e), body: { decision: "Approved" } });
    expect(unread(EMAILS.alex, "event")).toBe(a0 + 2); // rejected + approved -> creator; the resubmission goes to the coordinator instead
    expect(unread(EMAILS.thorne, "event")).toBe(t0 + 2); // submitted + resubmitted
  });

  it("3+4+5: registration -> student; OD submitted -> mentor; OD decision -> student", async () => {
    const e = await makeApprovedEvent({ date: futureDate(1), start: "09:30", end: "11:00" });
    const s0 = unread(EMAILS.dev, "event");
    await dev.call(R.eventRegister.POST, { params: pid(e) });
    expect(unread(EMAILS.dev, "event")).toBe(s0 + 1);
    await dev.call(R.eventRegister.POST, { params: pid(e) }); // duplicate -> fails -> nothing new
    expect(unread(EMAILS.dev, "event")).toBe(s0 + 1);
    const m0 = unread(EMAILS.thorne, "od");
    const od = (await dev.call(R.odApply.POST, { body: { eventId: e, reason: "Notification test for OD" } })).data.onDutyRequest.id as number;
    expect(unread(EMAILS.thorne, "od")).toBe(m0 + 1);
    const d0 = unread(EMAILS.dev, "od");
    await wright.call(R.odReview.POST, { params: pid(od), body: { decision: "Approved" } }); // refused
    expect(unread(EMAILS.dev, "od")).toBe(d0);
    await thorne.call(R.odReview.POST, { params: pid(od), body: { decision: "Approved" } });
    expect(unread(EMAILS.dev, "od")).toBe(d0 + 1);
  });

  it("6: a newly assigned club role notifies the user", async () => {
    expect((await dev.call(R.join.POST, { params: pid(clubId("TCC")) })).status).toBe(200);
    const role = (await alex.call(R.roles.POST, { params: pid(clubId("TCC")), body: { roleName: "Volunteer Coordinator", permissions: ["manage_registrations"] } })).data.dynamicRole;
    const before = unread(EMAILS.dev, "role");
    expect((await alex.call(R.members.PATCH, { params: pid(clubId("TCC")), body: { membershipId: membership("TCC", EMAILS.dev), roleId: role.id } })).status).toBe(200);
    expect(unread(EMAILS.dev, "role")).toBe(before + 1);
    expect(one("select message from notifications where user_id = ? and type = 'role' order by id desc limit 1", idOf(EMAILS.dev))?.message).toContain("Volunteer Coordinator");
  });

  it("7: awarding a badge notifies the student; a failed duplicate award does not", async () => {
    const before = unread(EMAILS.dev, "badge");
    expect((await alex.call(R.badgeAward.POST, { body: { badgeId: badgeId("Hackathon Finisher"), userId: idOf(EMAILS.dev), reason: "Shipped a working prototype" } })).status).toBe(200);
    expect(unread(EMAILS.dev, "badge")).toBe(before + 1);
    expect((await alex.call(R.badgeAward.POST, { body: { badgeId: badgeId("Hackathon Finisher"), userId: idOf(EMAILS.dev), reason: "Shipped a working prototype" } })).status).toBe(409);
    expect(unread(EMAILS.dev, "badge")).toBe(before + 1);
  });

  it("notifications can be listed and marked read by their owner only", async () => {
    const list = (await dev.call(R.notifs.GET)).data;
    expect(list.notifications.every((n: { userId: number }) => n.userId === idOf(EMAILS.dev))).toBe(true);
    expect(list.unreadCount).toBeGreaterThan(0);
    expect((await dev.call(R.notifs.PATCH, { method: "PATCH", body: { markAll: true } })).status).toBe(200);
    expect((await dev.call(R.notifs.GET)).data.unreadCount).toBe(0);
    expect((await call(R.notifs.GET)).data).toEqual({ notifications: [], unreadCount: 0 });
  });
});

describe("badge management", () => {
  it("club badges can only be awarded to members/attendees by authorised staff; system badges are automatic", async () => {
    const outsider = await alex.call(R.badgeAward.POST, { body: { badgeId: badgeId("Hardware Tinkerer"), userId: idOf(EMAILS.priya), reason: "not a Robotics member" } });
    expect(outsider.status).toBe(400); // Priya is neither a member of Robotics nor an attendee of its events
    expect(outsider.status).not.toBe(200);
    expect((await maya.call(R.badgeAward.POST, { body: { badgeId: badgeId("Code Champion"), userId: idOf(EMAILS.priya), reason: "students cannot award" } })).status).toBe(403);
    expect((await jordan.call(R.badgeAward.POST, { body: { badgeId: badgeId("Code Champion"), userId: idOf(EMAILS.priya), reason: "wrong club admin" } })).status).toBe(403);
    expect((await alex.call(R.badgeAward.POST, { body: { badgeId: badgeId("Event Winner"), userId: idOf(EMAILS.priya), reason: "global badge needs an admin" } })).status).toBe(403);
    expect((await admin.call(R.badgeAward.POST, { body: { badgeId: badgeId("Event Winner"), userId: idOf(EMAILS.priya), reason: "Won the inter-college quiz" } })).status).toBe(200);
    const auto = await admin.call(R.badgeAward.POST, { body: { badgeId: badgeId("First Event"), userId: idOf(EMAILS.dev), reason: "manual attempt" } });
    expect(auto.status).toBe(400);
    expect(auto.data.code).toBe("AUTO_BADGE");
    expect((await alex.call(R.badgeAward.POST, { body: { badgeId: badgeId("Code Champion"), userId: idOf(EMAILS.thorne), reason: "faculty is not a student" } })).status).toBe(400);
  });

  it("First Event / Three-Event Streak are awarded by verifiable rules when attendance is confirmed", async () => {
    expect(one("select count(*) n from awarded_badges where user_id = ? and awarded_by is null", idOf(EMAILS.priya))).toEqual({ n: 0 });
    for (let i = 0; i < 3; i++) {
      const e = await makeApprovedEvent({ title: `Streak Event ${i}` });
      await priya.call(R.eventRegister.POST, { params: pid(e) });
      await alex.call(R.status.POST, { params: pid(e), body: { status: "Ongoing" } });
      await alex.call(R.attendance.POST, { params: pid(e), body: { registrationId: regId(e, idOf(EMAILS.priya)), attendanceStatus: "Attended" } });
      const names = q<{ name: string }>("select d.name from awarded_badges a join badge_definitions d on d.id = a.badge_id where a.user_id = ? and a.awarded_by is null", idOf(EMAILS.priya)).map((r) => r.name);
      expect(names).toEqual(i === 0 ? ["First Event"] : i === 1 ? ["First Event"] : ["First Event", "Three-Event Streak"]);
    }
    expect(unread(EMAILS.priya, "badge")).toBeGreaterThanOrEqual(2);
  });

  it("badge definitions are scoped and the awarded list is permission-filtered", async () => {
    expect((await alex.call(R.badges.POST, { body: { clubId: clubId("TCC"), name: "Bug Squasher", description: "Fixed a critical bug", criteria: "Merged a fix" } })).status).toBe(200);
    expect((await alex.call(R.badges.POST, { body: { clubId: clubId("TCC"), name: "bug squasher", description: "Duplicate name", criteria: "n/a" } })).status).toBe(409);
    expect((await alex.call(R.badges.POST, { body: { clubId: clubId("CLDS"), name: "Not Mine", description: "Other club", criteria: "n/a" } })).status).toBe(403);
    expect((await alex.call(R.badges.POST, { body: { name: "Global Attempt", description: "Campus wide", criteria: "n/a" } })).status).toBe(403);
    expect((await priya.call(R.badges.POST, { body: { clubId: clubId("TCC"), name: "Tech Lead Badge", description: "Not allowed", criteria: "n/a" } })).status).toBe(403);
    expect((await admin.call(R.badges.POST, { body: { name: "Campus Star", description: "Campus wide badge", criteria: "Nominated" } })).status).toBe(200);
    const mine = (await maya.call(R.badgesAwarded.GET)).data.awarded as { userId: number }[];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((b) => b.userId === idOf(EMAILS.maya))).toBe(true);
    const jordanSees = (await jordan.call(R.badgesAwarded.GET)).data.awarded as unknown[];
    expect(jordanSees).toHaveLength(0);
    expect(((await alex.call(R.badgesAwarded.GET)).data.awarded as { clubName: string }[]).some((b) => b.clubName === "Turing Coding & AI Club")).toBe(true);
    expect(((await admin.call(R.badgesAwarded.GET)).data.awarded as unknown[]).length).toBeGreaterThan(mine.length);
  });
});

describe("contextual messaging", () => {
  it("lists eligible contacts (faculty + club admins only, never self)", async () => {
    const c = (await alex.call(R.contacts.GET)).data.contacts as { id: number; role: string }[];
    expect(c.map((x) => x.role).every((r) => r === "faculty" || r === "club_admin")).toBe(true);
    expect(c.some((x) => x.id === idOf(EMAILS.thorne))).toBe(true);
    expect(c.some((x) => x.id === idOf(EMAILS.alex))).toBe(false);
    expect(c.some((x) => x.id === idOf(EMAILS.maya))).toBe(false);
  });

  it("Faculty<->Club Admin threads tied to an event support replies, read state and notifications", async () => {
    const ev = await makeApprovedEvent();
    const created = await alex.call(R.threads.POST, { body: { subject: "Logistics for the event", recipientIds: [idOf(EMAILS.thorne)], contextType: "event", eventId: ev, body: "Please confirm the venue booking." } });
    expect(created.status).toBe(200);
    const tid = created.data.thread.id as number;
    const inbox = (await thorne.call(R.threads.GET)).data.threads as { id: number; unread: number; eventTitle: string | null }[];
    expect(inbox.find((t) => t.id === tid)?.unread).toBe(1);
    expect(inbox.find((t) => t.id === tid)?.eventTitle).toContain("Test Event");
    const opened = (await thorne.call(R.threadById.GET, { params: pid(tid) })).data;
    expect(opened.messages).toHaveLength(1);
    expect(opened.messages[0].senderName).toContain("Alex Rivera");
    expect(((await thorne.call(R.threads.GET)).data.threads as { id: number; unread: number }[]).find((t) => t.id === tid)?.unread).toBe(0);
    const n0 = unread(EMAILS.alex, "message");
    expect((await thorne.call(R.threadById.POST, { params: pid(tid), body: { body: "Booked. See you there." } })).status).toBe(200);
    expect(unread(EMAILS.alex, "message")).toBe(n0 + 1);
    expect((await alex.call(R.threadById.GET, { params: pid(tid) })).data.messages).toHaveLength(2);
    for (const c of [wright, jordan, admin, maya]) expect((await c.call(R.threadById.GET, { params: pid(tid) })).status, c.email).toBe(404);
  });

  it("enforces who may talk to whom and about what", async () => {
    const ev = await makeApprovedEvent();
    const mk = (c: Client, o: Record<string, unknown>) => c.call(R.threads.POST, { body: { subject: "A subject", body: "Hello there", ...o } });
    expect((await mk(maya, { recipientIds: [idOf(EMAILS.thorne)] })).status).toBe(403); // students cannot message
    expect((await mk(alex, { recipientIds: [idOf(EMAILS.maya)] })).status).toBe(400); // students cannot be recipients
    expect((await mk(alex, { recipientIds: [idOf(EMAILS.jordan)] })).status).toBe(400); // needs at least one faculty participant
    expect((await mk(alex, { recipientIds: [idOf(EMAILS.wright)], contextType: "event", eventId: ev })).status).toBe(403); // Wright is not involved in a Turing event
    expect((await mk(alex, { recipientIds: [idOf(EMAILS.wright)] })).status).toBe(200); // general Faculty<->Club Admin
    expect((await mk(thorne, { recipientIds: [idOf(EMAILS.wright)] })).status).toBe(200); // Faculty<->Faculty
    expect((await mk(alex, { recipientIds: [idOf(EMAILS.thorne)], body: "   " })).status).toBe(400);
  });

  it("OD-context threads are limited to the student's mentor and the event coordinator", async () => {
    const ev = await makeApprovedEvent({ date: futureDate(1), start: "09:30", end: "11:00" });
    await priya.call(R.eventRegister.POST, { params: pid(ev) });
    const od = (await priya.call(R.odApply.POST, { body: { eventId: ev, reason: "Volunteering at this event" } })).data.onDutyRequest.id as number;
    const mk = (c: Client, ids: number[]) => c.call(R.threads.POST, { body: { subject: "About Priya's OD", recipientIds: ids, contextType: "od", odRequestId: od, body: "Can we discuss this request?" } });
    expect((await mk(thorne, [idOf(EMAILS.wright)])).status).toBe(200); // coordinator <-> mentor
    expect((await mk(alex, [idOf(EMAILS.wright)])).status).toBe(403);
    expect((await mk(thorne, [idOf(EMAILS.alex)])).status).toBe(403);
  });
});

describe("student portfolio (verified data only)", () => {
  it("summary is built from database records, ignores browser-supplied achievements and is labelled template-based", async () => {
    const r = await call(R.pSummary.POST, { cookie: maya.cookie, body: { badges: [{ badgeName: "Fake Nobel Prize" }], certificates: 99, memberships: [{ clubName: "Imaginary Club", roleName: "Emperor" }] } });
    expect(r.status).toBe(200);
    expect(r.data.source).toBe("template");
    expect(r.data.note).toMatch(/template/i);
    const all = JSON.stringify(r.data);
    expect(all).toContain("Maya Patel");
    expect(all).toContain("CERT-DEMO-TCC-000001");
    for (const invented of ["Nobel", "Imaginary", "Emperor", "99"]) expect(all).not.toContain(invented);
    expect((await thorne.call(R.pSummary.POST, { body: {} })).data.text).toBe("");
  });

  it("only attended events are listed and the PDF export works for the owner and mentor only", async () => {
    const dp = (await dev.call(R.portfolio.GET, { params: { userId: String(idOf(EMAILS.dev)) } })).data.portfolio;
    expect(dp.attendedEvents.every((e: { title: string }) => typeof e.title === "string")).toBe(true);
    const mp = (await maya.call(R.portfolio.GET, { params: { userId: String(idOf(EMAILS.maya)) } })).data.portfolio;
    expect(mp.stats.eventsAttendedCount).toBe(mp.attendedEvents.length);
    expect(mp.attendedEvents.map((e: { title: string }) => e.title)).toContain("Full-Stack Web & API Masterclass");
    expect(mp.attendedEvents.map((e: { title: string }) => e.title)).not.toContain("Campus HackFest 2026: AI & Systems"); // registered only
    const pdf = await maya.call(R.pPdf.POST, { body: { summary: "In my own words: I enjoy building things." } });
    expect(pdf.status).toBe(200);
    expect(Buffer.from(pdf.data as Uint8Array).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await dev.call(R.pPdf.POST, { body: { userId: idOf(EMAILS.maya) } })).status).toBe(403);
    expect((await thorne.call(R.pPdf.POST, { body: { userId: idOf(EMAILS.maya) } })).status).toBe(200);
  });
});
