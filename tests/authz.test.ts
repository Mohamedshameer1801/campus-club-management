import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, R, call, client, clubId, futureDate, idOf, makeApprovedEvent, one, pid, q, setupApp, type Client } from "./helpers";

let alex: Client, jordan: Client, thorne: Client, wright: Client, maya: Client, dev: Client, priya: Client, admin: Client, sa: Client;

beforeAll(async () => {
  setupApp();
  [alex, jordan, thorne, wright, maya, dev, priya, admin, sa] = await Promise.all(
    [EMAILS.alex, EMAILS.jordan, EMAILS.thorne, EMAILS.wright, EMAILS.maya, EMAILS.dev, EMAILS.priya, EMAILS.admin, EMAILS.superAdmin].map((e) => client(e))
  );
});

const eventBody = (o: Record<string, unknown> = {}) => ({
  clubId: clubId("TCC"), title: "Authz Test Event", description: "A sufficiently long description", eventDate: futureDate(3), startTime: "10:00", endTime: "12:00", venue: "Hall", maxCapacity: 30, ...o,
});
const membership = (club: string, email: string) => (one<{ id: number }>("select id from club_memberships where club_id = ? and user_id = ?", clubId(club), idOf(email)) as { id: number }).id;

describe("authentication is required for every data endpoint", () => {
  it.each([R.clubs.GET, R.events.GET, R.od.GET, R.timetable.GET, R.analytics.GET, R.certs.GET, R.badges.GET, R.threads.GET, R.audit.GET, R.users.GET])("rejects anonymous callers", async (h) => {
    expect((await call(h)).status).toBe(401);
  });
});

describe("club administration", () => {
  it("only institutional admins create clubs; validation and staff checks apply", async () => {
    const body = { name: "Photography Society", code: "PHOTO", category: "Cultural", description: "Photography walks and exhibitions.", clubAdminId: idOf(EMAILS.alex), facultyCoordinatorId: idOf(EMAILS.wright) };
    expect((await maya.call(R.clubs.POST, { body })).status).toBe(403);
    expect((await alex.call(R.clubs.POST, { body })).status).toBe(403);
    expect((await thorne.call(R.clubs.POST, { body })).status).toBe(403);
    expect((await admin.call(R.clubs.POST, { body: { ...body, name: "x" } })).status).toBe(400);
    expect((await admin.call(R.clubs.POST, { body: { ...body, clubAdminId: idOf(EMAILS.maya) } })).status).toBe(400); // a student cannot be club admin
    expect((await admin.call(R.clubs.POST, { body: { ...body, facultyCoordinatorId: idOf(EMAILS.alex) } })).status).toBe(400);
    expect((await admin.call(R.clubs.POST, { body })).status).toBe(200);
    expect((await admin.call(R.clubs.POST, { body: { ...body, code: "PHOTO2" } })).status).toBe(409); // duplicate name
  });

  it("a Club Admin cannot modify another club; archiving/staffing is institutional only", async () => {
    expect((await alex.call(R.clubById.PATCH, { params: pid(clubId("CLDS")), body: { description: "Hijacked description text" } })).status).toBe(403);
    expect((await jordan.call(R.clubById.PATCH, { params: pid(clubId("CLDS")), body: { description: "Updated by the rightful admin." } })).status).toBe(200);
    expect((await jordan.call(R.clubById.PATCH, { params: pid(clubId("CLDS")), body: { isArchived: true } })).status).toBe(403);
    expect((await jordan.call(R.clubById.PATCH, { params: pid(clubId("CLDS")), body: { clubAdminId: idOf(EMAILS.alex) } })).status).toBe(403);
    expect((await maya.call(R.clubById.PATCH, { params: pid(clubId("TCC")), body: { name: "Pwned" } })).status).toBe(403);
  });

  it("archived clubs disappear for students and refuse new members", async () => {
    const photo = clubId("PHOTO");
    expect((await admin.call(R.clubById.PATCH, { params: pid(photo), body: { isArchived: true } })).status).toBe(200);
    expect((await maya.call(R.join.POST, { params: pid(photo) })).status).toBe(400);
    expect((await maya.call(R.clubs.GET)).data.clubs.some((c: { code: string }) => c.code === "PHOTO")).toBe(false);
    expect((await admin.call(R.clubs.GET)).data.clubs.some((c: { code: string }) => c.code === "PHOTO")).toBe(true);
    expect((await maya.call(R.clubById.GET, { params: pid(photo) })).status).toBe(404);
  });

  it("membership: students join once, staff cannot join, the member roster is restricted", async () => {
    expect((await maya.call(R.join.POST, { params: pid(clubId("TCC")) })).status).toBe(409); // already active
    expect((await alex.call(R.join.POST, { params: pid(clubId("TCC")) })).status).toBe(403);
    expect((await dev.call(R.join.POST, { params: pid(clubId("TCC")) })).status).toBe(200);
    expect((await dev.call(R.join.POST, { params: pid(clubId("TCC")) })).status).toBe(409);
    expect((await maya.call(R.clubById.GET, { params: pid(clubId("TCC")) })).data.club.members).toHaveLength(0);
    expect((await jordan.call(R.clubById.GET, { params: pid(clubId("TCC")) })).data.club.members).toHaveLength(0);
    expect((await alex.call(R.clubById.GET, { params: pid(clubId("TCC")) })).data.club.members.length).toBeGreaterThan(2);
  });
});

describe("event access control", () => {
  it("cross-club and student creation attempts are refused", async () => {
    expect((await jordan.call(R.events.POST, { body: eventBody() })).status).toBe(403);
    expect((await alex.call(R.events.POST, { body: eventBody({ clubId: clubId("CLDS") }) })).status).toBe(403);
    expect((await maya.call(R.events.POST, { body: eventBody() })).status).toBe(403);
    expect((await thorne.call(R.events.POST, { body: eventBody() })).status).toBe(403);
  });

  it("students never see unapproved events (drafts, pending, rejected)", async () => {
    const draft = (await alex.call(R.events.POST, { body: eventBody({ title: "Secret Draft" }) })).data.event.id as number;
    expect((await maya.call(R.eventById.GET, { params: pid(draft) })).status).toBe(404);
    expect((await maya.call(R.events.GET)).data.events.some((e: { id: number }) => e.id === draft)).toBe(false);
    expect((await jordan.call(R.eventById.GET, { params: pid(draft) })).status).toBe(404); // other club's admin
    expect((await thorne.call(R.eventById.GET, { params: pid(draft) })).status).toBe(404); // coordinator sees it only after submission
    expect((await alex.call(R.eventById.GET, { params: pid(draft) })).status).toBe(200);
    expect((await admin.call(R.eventById.GET, { params: pid(draft) })).status).toBe(200);
    const visibleToMaya = (await maya.call(R.events.GET)).data.events as { status: string }[];
    expect(visibleToMaya.every((e) => ["Approved", "Ongoing", "Completed"].includes(e.status))).toBe(true);
    // submitted -> coordinator sees it, students still do not
    await alex.call(R.submit.POST, { params: pid(draft), body: {} });
    expect((await thorne.call(R.eventById.GET, { params: pid(draft) })).status).toBe(200);
    expect((await wright.call(R.eventById.GET, { params: pid(draft) })).status).toBe(404);
    expect((await maya.call(R.eventById.GET, { params: pid(draft) })).status).toBe(404);
  });

  it("only the assigned Faculty Coordinator may approve or reject", async () => {
    const id = (await alex.call(R.events.POST, { body: eventBody({ title: "Needs Approval", submitImmediately: true }) })).data.event.id as number;
    for (const c of [wright, jordan, maya, alex, priya, admin]) {
      const r = await c.call(R.approve.POST, { params: pid(id), body: { decision: "Approved" } });
      expect(r.status, `${c.email} must not approve`).toBe(403);
    }
    expect(one<{ status: string }>("select status from events where id = ?", id)?.status).toBe("Pending Faculty Approval");
    expect((await thorne.call(R.approve.POST, { params: pid(id), body: { decision: "Approved" } })).status).toBe(200);
  });

  it("registrations, attendance and status changes are limited to authorised staff of that club", async () => {
    const id = await makeApprovedEvent();
    expect((await alex.call(R.registrations.GET, { params: pid(id) })).status).toBe(200);
    expect((await thorne.call(R.registrations.GET, { params: pid(id) })).status).toBe(200);
    expect((await admin.call(R.registrations.GET, { params: pid(id) })).status).toBe(200);
    for (const c of [maya, jordan, wright]) expect((await c.call(R.registrations.GET, { params: pid(id) })).status).toBe(403);
    for (const c of [maya, jordan, wright]) expect((await c.call(R.attendance.POST, { params: pid(id), body: { registrationId: 1, attendanceStatus: "Attended" } })).status).toBe(403);
    for (const c of [maya, jordan, thorne]) expect((await c.call(R.status.POST, { params: pid(id), body: { status: "Cancelled" } })).status).toBe(403);
  });
});

describe("institutional timetable is Super-Admin only", () => {
  const structure = { name: "Hacked Timetable", workingDays: ["Monday"], effectiveFrom: "2030-01-01", periods: [{ periodNumber: 1, periodLabel: "P1", startTime: "09:00", endTime: "10:00", periodType: "Class Period" }] };
  it("students, faculty, club admins and even Admin are refused for every mutation", async () => {
    for (const c of [maya, thorne, alex, priya, admin]) {
      expect((await c.call(R.ttManage.POST, { body: structure })).status, `${c.email} POST`).toBe(403);
      expect((await c.call(R.ttManage.PUT, { method: "PUT", body: { ...structure, structureId: 1 } })).status, `${c.email} PUT`).toBe(403);
      expect((await c.call(R.ttManage.PATCH, { method: "PATCH", body: { structureId: 1, isActive: false } })).status, `${c.email} PATCH`).toBe(403);
      expect((await c.call(R.ttManage.DELETE, { method: "DELETE", url: "/api/timetable/manage?id=1" })).status, `${c.email} DELETE`).toBe(403);
    }
    expect(one<{ isActive: number }>("select is_active as isActive from timetable_structures where id = 1")?.isActive).toBe(1);
    expect((await maya.call(R.timetable.GET)).status).toBe(200); // read access is fine
  });
});

describe("dynamic club roles never escape their club or grant institutional power", () => {
  it("a Tech Lead (create_events, edit_events, record_attendance, ...) acts only inside Turing", async () => {
    expect((await priya.call(R.events.POST, { body: eventBody({ title: "By Tech Lead" }) })).status).toBe(200);
    expect((await priya.call(R.events.POST, { body: eventBody({ clubId: clubId("ROBO"), title: "Robotics By Tech Lead" }) })).status).toBe(403);
    expect((await priya.call(R.events.POST, { body: eventBody({ clubId: clubId("CLDS"), title: "Literary By Tech Lead" }) })).status).toBe(403);
    const turingEvent = await makeApprovedEvent();
    const roboEvent = await makeApprovedEvent({ club: "ROBO" });
    expect((await priya.call(R.registrations.GET, { params: pid(turingEvent) })).status).toBe(200);
    expect((await priya.call(R.registrations.GET, { params: pid(roboEvent) })).status).toBe(403);
    expect((await priya.call(R.status.POST, { params: pid(roboEvent), body: { status: "Cancelled" } })).status).toBe(403);
    expect((await priya.call(R.eventRegister.POST, { params: pid(turingEvent) })).status).toBe(200); // she is still just a student for registration
  });

  it("dynamic roles grant no institutional privileges", async () => {
    const pending = (await alex.call(R.events.POST, { body: eventBody({ title: "Pending For Priya", submitImmediately: true }) })).data.event.id as number;
    expect((await priya.call(R.approve.POST, { params: pid(pending), body: { decision: "Approved" } })).status).toBe(403);
    expect((await priya.call(R.od.GET)).status).toBe(200); // her own OD list only
    for (const h of [R.users.GET, R.audit.GET]) expect((await priya.call(h)).status).toBe(403);
    expect((await priya.call(R.clubs.POST, { body: { name: "Priya Club", code: "PRI", category: "Social", description: "Not allowed at all.", clubAdminId: idOf(EMAILS.alex), facultyCoordinatorId: idOf(EMAILS.wright) } })).status).toBe(403);
    expect((await priya.call(R.roles.POST, { params: pid(clubId("TCC")), body: { roleName: "Shadow Admin", permissions: ["create_events"] } })).status).toBe(403);
    expect((await priya.call(R.clubById.PATCH, { params: pid(clubId("TCC")), body: { description: "Priya takes over the club" } })).status).toBe(403);
    expect((await priya.call(R.ttManage.POST, { body: {} })).status).toBe(403);
  });

  it("permission lists are a closed set; a manage_members holder cannot assign roles (no self-escalation)", async () => {
    expect((await alex.call(R.roles.POST, { params: pid(clubId("TCC")), body: { roleName: "Root", permissions: ["super_admin"] } })).status).toBe(400);
    expect((await alex.call(R.roles.POST, { params: pid(clubId("TCC")), body: { roleName: "Approver", permissions: ["approve_events"] } })).status).toBe(400);
    const role = await alex.call(R.roles.POST, { params: pid(clubId("TCC")), body: { roleName: "Membership Manager", permissions: ["manage_members"] } });
    expect(role.status).toBe(200);
    expect((await alex.call(R.roles.POST, { params: pid(clubId("TCC")), body: { roleName: "membership manager", permissions: ["manage_members"] } })).status).toBe(409);
    const assign = await alex.call(R.members.PATCH, { params: pid(clubId("TCC")), body: { membershipId: membership("TCC", EMAILS.maya), roleId: role.data.dynamicRole.id } });
    expect(assign.status).toBe(200);
    // Maya now holds manage_members - but must not be able to promote herself or others
    const grabAll = (await alex.call(R.roles.POST, { params: pid(clubId("TCC")), body: { roleName: "Everything", permissions: ["create_events", "edit_events", "award_badges", "issue_certificates"] } })).data.dynamicRole.id;
    expect((await maya.call(R.members.PATCH, { params: pid(clubId("TCC")), body: { membershipId: membership("TCC", EMAILS.maya), roleId: grabAll } })).status).toBe(403);
    expect((await maya.call(R.members.PATCH, { params: pid(clubId("TCC")), body: { membershipId: membership("TCC", EMAILS.dev), roleId: grabAll } })).status).toBe(403);
    expect((await maya.call(R.events.POST, { body: eventBody({ title: "Maya not allowed" }) })).status).toBe(403); // holds only manage_members
    expect((await maya.call(R.roles.POST, { params: pid(clubId("TCC")), body: { roleName: "Mine", permissions: ["create_events"] } })).status).toBe(403);
  });

  it("a role from one club cannot be assigned inside another club", async () => {
    const literaryRole = await jordan.call(R.roles.POST, { params: pid(clubId("CLDS")), body: { roleName: "Debate Captain", permissions: ["create_events"] } });
    const r = await alex.call(R.members.PATCH, { params: pid(clubId("TCC")), body: { membershipId: membership("TCC", EMAILS.priya), roleId: literaryRole.data.dynamicRole.id } });
    expect(r.status).toBe(400);
    expect(r.data.code).toBe("ROLE_OUT_OF_CLUB_SCOPE");
    expect((await jordan.call(R.members.PATCH, { params: pid(clubId("TCC")), body: { membershipId: membership("TCC", EMAILS.priya), roleId: literaryRole.data.dynamicRole.id } })).status).toBe(403);
  });
});

describe("object-level (IDOR) protections", () => {
  it("notifications: a user cannot mark someone else's notification as read", async () => {
    const theirs = one<{ id: number }>("select id from notifications where user_id = ? and is_read = 0", idOf(EMAILS.thorne)) as { id: number };
    expect((await maya.call(R.notifs.PATCH, { method: "PATCH", body: { notificationId: theirs.id } })).status).toBe(404);
    expect(one("select is_read from notifications where id = ?", theirs.id)).toEqual({ is_read: 0 });
    const mine = one<{ id: number }>("select id from notifications where user_id = ? and is_read = 0", idOf(EMAILS.maya)) as { id: number };
    expect((await maya.call(R.notifs.PATCH, { method: "PATCH", body: { notificationId: mine.id } })).status).toBe(200);
  });

  it("certificate listings are scoped to the owner, the club's staff and the coordinator", async () => {
    const n = async (c: Client) => (await c.call(R.certs.GET)).data.certificates.length as number;
    expect(await n(maya)).toBe(1);
    expect(await n(dev)).toBe(0);
    expect(await n(alex)).toBeGreaterThanOrEqual(1);
    expect(await n(priya)).toBeGreaterThanOrEqual(1);
    expect(await n(thorne)).toBeGreaterThanOrEqual(1);
    expect(await n(admin)).toBeGreaterThanOrEqual(1);
    expect(await n(jordan)).toBe(0); // another club's admin
    expect(await n(wright)).toBe(0); // another club's coordinator
  });

  it("portfolios: owner, assigned mentor and institutional admins only", async () => {
    const view = (c: Client, email: string) => c.call(R.portfolio.GET, { params: { userId: String(idOf(email)) } });
    expect((await view(maya, EMAILS.maya)).status).toBe(200);
    expect((await view(thorne, EMAILS.maya)).status).toBe(200); // Maya's Class Mentor
    expect((await view(admin, EMAILS.maya)).status).toBe(200);
    for (const c of [dev, wright, alex, jordan]) expect((await view(c, EMAILS.maya)).status).toBe(403);
    expect((await view(maya, EMAILS.thorne)).status).toBe(404); // not a student
  });

  it("OD lists are limited to the student, the assigned mentor and institutional admins", async () => {
    const list = async (c: Client) => (await c.call(R.od.GET)).data.onDutyRequests as { userId: number }[];
    expect((await list(maya)).every((o) => o.userId === idOf(EMAILS.maya))).toBe(true);
    expect((await list(maya)).length).toBeGreaterThanOrEqual(2);
    expect(await list(dev)).toHaveLength(0);
    expect(await list(wright)).toHaveLength(0); // not Maya's mentor
    expect((await list(thorne)).length).toBeGreaterThanOrEqual(2);
    expect((await alex.call(R.od.GET)).status).toBe(403);
  });

  it("messaging: students cannot use it and private threads are invisible to non-participants (even admins)", async () => {
    expect((await maya.call(R.contacts.GET)).status).toBe(403);
    expect((await maya.call(R.threads.GET)).status).toBe(403);
    const seeded = one<{ id: number }>("select id from message_threads limit 1") as { id: number };
    expect((await thorne.call(R.threadById.GET, { params: pid(seeded.id) })).status).toBe(200);
    expect((await alex.call(R.threadById.GET, { params: pid(seeded.id) })).status).toBe(200);
    for (const c of [wright, jordan, admin, sa, maya]) expect((await c.call(R.threadById.GET, { params: pid(seeded.id) })).status, c.email).toBe(404);
    expect((await wright.call(R.threadById.POST, { params: pid(seeded.id), body: { body: "I should not be able to post here" } })).status).toBe(404);
    expect(q("select * from messages where body like 'I should not%'")).toHaveLength(0);
  });

  it("audit logs are visible to Super Admin only", async () => {
    expect((await sa.call(R.audit.GET)).status).toBe(200);
    for (const c of [admin, thorne, alex, maya]) expect((await c.call(R.audit.GET)).status).toBe(403);
  });

  it("analytics are permission-filtered by role", async () => {
    const a = async (c: Client) => (await c.call(R.analytics.GET)).data;
    const m = await a(maya);
    expect(m.student).toBeDefined();
    expect(m.admin).toBeUndefined();
    expect(m.faculty).toBeUndefined();
    expect((await a(alex)).admin).toBeUndefined();
    expect((await a(alex)).clubAdmin.clubs.map((c: { code: string }) => c.code).sort()).toEqual(["PHOTO", "ROBO", "TCC"]); // PHOTO was assigned to Alex earlier in this file
    expect((await a(jordan)).clubAdmin.clubs.map((c: { code: string }) => c.code)).toEqual(["CLDS"]);
    expect((await a(thorne)).faculty).toBeDefined();
    expect((await a(thorne)).admin).toBeUndefined();
    expect((await a(admin)).admin.totalClubs).toBeGreaterThanOrEqual(3);
    expect((await a(admin)).student).toBeUndefined();
  });
});
