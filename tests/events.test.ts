import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, R, client, clubId, futureDate, idOf, makeApprovedEvent, makeStudent, one, pid, q, run, setupApp, unread, type Client } from "./helpers";

let alex: Client, thorne: Client, wright: Client, jordan: Client, maya: Client, dev: Client;

beforeAll(async () => {
  setupApp();
  [alex, thorne, wright, jordan, maya, dev] = await Promise.all([EMAILS.alex, EMAILS.thorne, EMAILS.wright, EMAILS.jordan, EMAILS.maya, EMAILS.dev].map((e) => client(e)));
});

const body = (o: Record<string, unknown> = {}) => ({
  clubId: clubId("TCC"), title: "Lifecycle Event", description: "Description for lifecycle test event", eventDate: futureDate(2, 5), startTime: "10:00", endTime: "12:00", venue: "Hall A", maxCapacity: 20, ...o,
});
const status = (id: number) => one<{ status: string }>("select status from events where id = ?", id)?.status;

describe("event lifecycle: Draft -> Pending -> Rejected -> resubmit -> Approved", () => {
  let id = 0;

  it("a new event is a Draft, invisible to students, and editable by its club admin", async () => {
    const r = await alex.call(R.events.POST, { body: body() });
    expect(r.status).toBe(200);
    id = r.data.event.id;
    expect(r.data.event.status).toBe("Draft");
    expect(r.data.event.facultyCoordinatorId).toBe(idOf(EMAILS.thorne)); // the club's coordinator is assigned automatically
    expect((await maya.call(R.eventById.GET, { params: pid(id) })).status).toBe(404);
    expect((await alex.call(R.eventById.PATCH, { method: "PATCH", params: pid(id), body: { title: "Lifecycle Event (edited)" } })).status).toBe(200);
  });

  it("submitting moves it to Pending and notifies the Faculty Coordinator (in the same transaction)", async () => {
    const before = unread(EMAILS.thorne, "event");
    const r = await alex.call(R.submit.POST, { params: pid(id), body: {} });
    expect(r.status).toBe(200);
    expect(status(id)).toBe("Pending Faculty Approval");
    expect(unread(EMAILS.thorne, "event")).toBe(before + 1);
    expect(q("select action from event_approval_history where event_id = ?", id).map((h) => (h as { action: string }).action)).toEqual(["Submitted"]);
    expect((await maya.call(R.eventById.GET, { params: pid(id) })).status).toBe(404);
    expect((await alex.call(R.submit.POST, { params: pid(id), body: {} })).status).toBe(409); // cannot submit twice
  });

  it("wrong approvers are refused and cause no side effects", async () => {
    const before = unread(EMAILS.alex, "event");
    for (const c of [wright, jordan, maya]) expect((await c.call(R.approve.POST, { params: pid(id), body: { decision: "Rejected", rejectionReason: "nope nope" } })).status).toBe(403);
    expect(status(id)).toBe("Pending Faculty Approval");
    expect(unread(EMAILS.alex, "event")).toBe(before);
  });

  it("rejection needs a reason; the creator is notified and sees the reason", async () => {
    expect((await thorne.call(R.approve.POST, { params: pid(id), body: { decision: "Rejected" } })).status).toBe(400);
    expect((await thorne.call(R.approve.POST, { params: pid(id), body: { decision: "Rejected", rejectionReason: "   " } })).status).toBe(400);
    const before = unread(EMAILS.alex, "event");
    const r = await thorne.call(R.approve.POST, { params: pid(id), body: { decision: "Rejected", rejectionReason: "Venue clashes with exams" } });
    expect(r.status).toBe(200);
    expect(unread(EMAILS.alex, "event")).toBe(before + 1);
    const ev = (await alex.call(R.eventById.GET, { params: pid(id) })).data.event;
    expect(ev.status).toBe("Rejected");
    expect(ev.rejectionReason).toBe("Venue clashes with exams");
  });

  it("a rejected event cannot be published, registered for, or re-decided without resubmission", async () => {
    expect((await maya.call(R.eventRegister.POST, { params: pid(id) })).status).toBe(400);
    expect((await thorne.call(R.approve.POST, { params: pid(id), body: { decision: "Approved" } })).status).toBe(409);
    expect((await alex.call(R.status.POST, { params: pid(id), body: { status: "Ongoing" } })).status).toBe(409);
    expect((await alex.call(R.status.POST, { params: pid(id), body: { status: "Approved" } })).status).toBe(400); // "Approved" is not a manual status
    expect(status(id)).toBe("Rejected");
  });

  it("resubmission (after editing) sends it back to the coordinator; approval publishes it", async () => {
    expect((await alex.call(R.eventById.PATCH, { method: "PATCH", params: pid(id), body: { venue: "Hall B" } })).status).toBe(200);
    expect((await alex.call(R.submit.POST, { params: pid(id), body: {} })).status).toBe(200);
    expect(status(id)).toBe("Pending Faculty Approval");
    expect(one<{ rejection_reason: string | null }>("select rejection_reason from events where id = ?", id)?.rejection_reason).toBeNull();
    expect(q("select action from event_approval_history where event_id = ? order by id", id).map((h) => (h as { action: string }).action)).toEqual(["Submitted", "Rejected", "Resubmitted"]);
    const before = unread(EMAILS.alex, "event");
    expect((await thorne.call(R.approve.POST, { params: pid(id), body: { decision: "Approved", facultyRemarks: "Looks good" } })).status).toBe(200);
    expect(status(id)).toBe("Approved");
    expect(unread(EMAILS.alex, "event")).toBe(before + 1);
    expect((await maya.call(R.eventById.GET, { params: pid(id) })).status).toBe(200);
    expect((await alex.call(R.eventById.PATCH, { method: "PATCH", params: pid(id), body: { venue: "Hall C" } })).status).toBe(409); // published events are locked
  });

  it("exposes the approval history for audit", async () => {
    const h = (await alex.call(R.history.GET, { params: pid(id) })).data.history as { action: string }[];
    expect(h.map((x) => x.action)).toEqual(["Submitted", "Rejected", "Resubmitted", "Approved"]);
  });
});

describe("invalid transitions and input validation", () => {
  it("rejects illegal state transitions", async () => {
    const draft = (await alex.call(R.events.POST, { body: body({ title: "Transition Draft" }) })).data.event.id as number;
    expect((await alex.call(R.status.POST, { params: pid(draft), body: { status: "Ongoing" } })).status).toBe(409);
    expect((await alex.call(R.status.POST, { params: pid(draft), body: { status: "Completed" } })).status).toBe(409);
    await alex.call(R.submit.POST, { params: pid(draft), body: {} });
    expect((await alex.call(R.status.POST, { params: pid(draft), body: { status: "Completed" } })).status).toBe(409); // pending cannot complete
    expect((await alex.call(R.status.POST, { params: pid(draft), body: { status: "Cancelled" } })).status).toBe(200);
    for (const s of ["Ongoing", "Completed", "Cancelled"]) expect((await alex.call(R.status.POST, { params: pid(draft), body: { status: s } })).status).toBe(409);
    expect((await alex.call(R.submit.POST, { params: pid(draft), body: {} })).status).toBe(409);
    const ok = await makeApprovedEvent();
    expect((await alex.call(R.status.POST, { params: pid(ok), body: { status: "Completed" } })).status).toBe(200);
    expect((await alex.call(R.status.POST, { params: pid(ok), body: { status: "Ongoing" } })).status).toBe(409);
    expect((await alex.call(R.status.POST, { params: pid(ok), body: { status: "Cancelled" } })).status).toBe(409);
  });

  it("validates dates, times and capacity", async () => {
    expect((await alex.call(R.events.POST, { body: body({ eventDate: "2001-01-01" }) })).status).toBe(400);
    expect((await alex.call(R.events.POST, { body: body({ eventDate: "2030-02-31" }) })).status).toBe(400);
    expect((await alex.call(R.events.POST, { body: body({ startTime: "12:00", endTime: "10:00" }) })).status).toBe(400);
    expect((await alex.call(R.events.POST, { body: body({ startTime: "25:00" }) })).status).toBe(400);
    expect((await alex.call(R.events.POST, { body: body({ maxCapacity: 0 }) })).status).toBe(400);
    expect((await alex.call(R.events.POST, { body: body({ title: "x" }) })).status).toBe(400);
  });

  it("cancelling an approved event notifies registrants and closes registration", async () => {
    const id = await makeApprovedEvent();
    expect((await maya.call(R.eventRegister.POST, { params: pid(id) })).status).toBe(200);
    const before = unread(EMAILS.maya, "event");
    expect((await alex.call(R.status.POST, { params: pid(id), body: { status: "Cancelled" } })).status).toBe(200);
    expect(unread(EMAILS.maya, "event")).toBe(before + 1);
    expect((await dev.call(R.eventRegister.POST, { params: pid(id) })).status).toBe(400);
  });
});

describe("registration rules", () => {
  it("only approved, open events accept registrations; duplicates and staff are refused", async () => {
    const draft = (await alex.call(R.events.POST, { body: body({ title: "Draft Reg" }) })).data.event.id as number;
    expect((await maya.call(R.eventRegister.POST, { params: pid(draft) })).status).toBe(400);
    const id = await makeApprovedEvent();
    const before = unread(EMAILS.maya, "event");
    const r = await maya.call(R.eventRegister.POST, { params: pid(id) });
    expect(r.status).toBe(200);
    expect(unread(EMAILS.maya, "event")).toBe(before + 1); // student is notified
    const dup = await maya.call(R.eventRegister.POST, { params: pid(id) });
    expect(dup.status).toBe(409);
    expect(unread(EMAILS.maya, "event")).toBe(before + 1); // failed operation -> no notification
    expect((await alex.call(R.eventRegister.POST, { params: pid(id) })).status).toBe(403);
    expect((await thorne.call(R.eventRegister.POST, { params: pid(id) })).status).toBe(403);
  });

  it("respects the registration window", async () => {
    const id = await makeApprovedEvent();
    run("update events set registration_closes_at = '2000-01-01T00:00' where id = ?", id);
    const r = await maya.call(R.eventRegister.POST, { params: pid(id) });
    expect(r.status).toBe(400);
    expect(r.data.code).toBe("REGISTRATION_CLOSED");
    const started = await makeApprovedEvent();
    run("update events set event_date = '2001-01-01' where id = ?", started); // start already passed
    expect((await maya.call(R.eventRegister.POST, { params: pid(started) })).data.code).toBe("REGISTRATION_CLOSED");
  });

  it("concurrent registrations cannot exceed capacity (8 students, 3 seats)", async () => {
    const id = await makeApprovedEvent({ capacity: 3 });
    const students = [];
    for (let i = 0; i < 8; i++) students.push(await makeStudent());
    const results = await Promise.all(students.map((s) => s.call(R.eventRegister.POST, { params: pid(id) })));
    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBe(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(one("select count(*) n from event_registrations where event_id = ?", id)).toEqual({ n: 3 });
    const notified = students.filter((s) => (one<{ n: number }>("select count(*) n from notifications where user_id = ? and type = 'event'", s.id)?.n ?? 0) > 0).length;
    expect(notified).toBe(3); // notifications only for the successful registrations
  });

  it("the final seat goes to exactly one of two simultaneous students; the same student cannot double-register", async () => {
    const id = await makeApprovedEvent({ capacity: 1 });
    const [a, b] = [await makeStudent(), await makeStudent()];
    const race = await Promise.all([a.call(R.eventRegister.POST, { params: pid(id) }), b.call(R.eventRegister.POST, { params: pid(id) })]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    const id2 = await makeApprovedEvent({ capacity: 10 });
    const s = await makeStudent();
    const twice = await Promise.all([s.call(R.eventRegister.POST, { params: pid(id2) }), s.call(R.eventRegister.POST, { params: pid(id2) }), s.call(R.eventRegister.POST, { params: pid(id2) })]);
    expect(twice.filter((r) => r.status === 200)).toHaveLength(1);
    expect(one("select count(*) n from event_registrations where event_id = ?", id2)).toEqual({ n: 1 });
  });
});

describe("attendance is separate from registration", () => {
  it("a registration is not attendance; manual attendance needs an Ongoing/Completed event and a valid registration", async () => {
    const id = await makeApprovedEvent();
    await maya.call(R.eventRegister.POST, { params: pid(id) });
    let regs = (await alex.call(R.registrations.GET, { params: pid(id) })).data.registrations as { id: number; attendanceStatus: string }[];
    expect(regs).toHaveLength(1);
    expect(regs[0].attendanceStatus).toBe("Registered");
    expect(one("select count(*) n from attendance")).toEqual({ n: 2 }); // only the seeded rows; registering created none
    expect((await alex.call(R.attendance.POST, { params: pid(id), body: { registrationId: regs[0].id, attendanceStatus: "Attended" } })).status).toBe(409); // not started
    await alex.call(R.status.POST, { params: pid(id), body: { status: "Ongoing" } });
    expect((await alex.call(R.attendance.POST, { params: pid(id), body: { registrationId: 999999, attendanceStatus: "Attended" } })).status).toBe(404);
    const before = unread(EMAILS.maya, "attendance");
    expect((await alex.call(R.attendance.POST, { params: pid(id), body: { registrationId: regs[0].id, attendanceStatus: "Attended" } })).status).toBe(200);
    expect(unread(EMAILS.maya, "attendance")).toBe(before + 1);
    regs = (await alex.call(R.registrations.GET, { params: pid(id) })).data.registrations;
    expect(regs[0].attendanceStatus).toBe("Attended");
    expect((await alex.call(R.attendance.POST, { params: pid(id), body: { registrationId: regs[0].id, attendanceStatus: "Absent" } })).status).toBe(200);
    expect((await alex.call(R.attendance.POST, { params: pid(id), body: { registrationId: regs[0].id, attendanceStatus: "Registered" } })).status).toBe(200);
    expect(one("select count(*) n from attendance where registration_id = ?", regs[0].id)).toEqual({ n: 0 });
    // an attendance record can only be created for a registration of THIS event
    const other = await makeApprovedEvent();
    expect((await alex.call(R.attendance.POST, { params: pid(other), body: { registrationId: regs[0].id, attendanceStatus: "Attended" } })).status).toBe(409);
  });
});
