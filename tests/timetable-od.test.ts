import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, R, client, futureDate, idOf, makeApprovedEvent, one, pid, q, setupApp, unread, type Client } from "./helpers";
import { computeOverlap, toMinutes, type SnapshotPeriod } from "@/lib/services/timetable";

let sa: Client, admin: Client, alex: Client, thorne: Client, wright: Client, maya: Client, dev: Client, priya: Client, jordan: Client;
beforeAll(async () => {
  setupApp();
  [sa, admin, alex, thorne, wright, maya, dev, priya, jordan] = await Promise.all(
    [EMAILS.superAdmin, EMAILS.admin, EMAILS.alex, EMAILS.thorne, EMAILS.wright, EMAILS.maya, EMAILS.dev, EMAILS.priya, EMAILS.jordan].map((e) => client(e))
  );
});

const P = (n: number, label: string, s: string, e: string, type: SnapshotPeriod["periodType"] = "Class Period"): SnapshotPeriod => ({ periodNumber: n, periodLabel: label, startTime: s, endTime: e, periodType: type, durationMinutes: toMinutes(e) - toMinutes(s) });
const DAY = [P(1, "Period 1", "09:00", "09:50"), P(2, "Period 2", "09:55", "10:45"), P(3, "Morning Break", "10:45", "11:05", "Short Break"), P(4, "Period 3", "11:05", "11:55"), P(5, "Period 4", "12:00", "12:50"), P(6, "Lunch Break", "12:50", "13:40", "Lunch Break"), P(7, "Period 5", "13:40", "14:30"), P(8, "Period 6", "14:35", "15:25"), P(9, "Period 7", "15:30", "16:20")];
const labels = (ps: SnapshotPeriod[]) => ps.map((p) => p.periodLabel);
const stdPeriods = DAY.map(({ durationMinutes: _d, ...p }) => (void _d, p));
const structure = (o: Record<string, unknown> = {}) => ({ name: "Test Structure", workingDays: ["Monday"], effectiveFrom: "2025-01-01", isActive: false, periods: [{ periodNumber: 1, periodLabel: "P1", startTime: "09:00", endTime: "10:00", periodType: "Class Period" }], ...o });

describe("overlap engine (pure)", () => {
  it("counts only class periods, excludes breaks, and totals full academic minutes", () => {
    const r = computeOverlap(DAY, "09:30", "15:30");
    expect(labels(r.affectedPeriods)).toEqual(["Period 1", "Period 2", "Period 3", "Period 4", "Period 5", "Period 6"]);
    expect(r.totalAcademicMinutes).toBe(300);
    expect(labels(r.allOverlappingPeriods)).toContain("Morning Break");
    expect(labels(r.allOverlappingPeriods)).toContain("Lunch Break");
    expect(labels(r.affectedPeriods)).not.toContain("Lunch Break");
  });
  it("an event that only touches a break affects no academic period", () => {
    expect(computeOverlap(DAY, "10:45", "11:05").affectedPeriods).toHaveLength(0);
    expect(labels(computeOverlap(DAY, "10:45", "11:05").allOverlappingPeriods)).toEqual(["Morning Break"]);
    expect(computeOverlap(DAY, "12:50", "13:40").affectedPeriods).toHaveLength(0);
  });
  it.each([
    ["09:00", "09:50", ["Period 1"]],
    ["09:50", "09:55", []], // the gap between periods
    ["09:00", "09:55", ["Period 1"]], // ends exactly when Period 2 starts
    ["09:49", "09:56", ["Period 1", "Period 2"]],
    ["09:10", "09:20", ["Period 1"]], // fully inside one period
    ["17:00", "18:00", []],
    ["06:00", "09:00", []], // ends exactly when the day starts
  ])("boundary %s-%s", (s, e, expected) => {
    expect(labels(computeOverlap(DAY, s, e).affectedPeriods)).toEqual(expected);
  });
});

describe("timetable is selected by EVENT DATE (not just 'the active one')", () => {
  it("Super Admin edits the standard structure to Mon-Wed and adds a separate Thu-Fri structure", async () => {
    const upd = await sa.call(R.ttManage.PUT, { method: "PUT", body: { structureId: 1, name: "Mon-Wed Structure", workingDays: ["Monday", "Tuesday", "Wednesday"], effectiveFrom: "2025-01-01", isActive: true, periods: stdPeriods } });
    expect(upd.status).toBe(200);
    expect(upd.data.structure.version).toBe(2);
    const b = await sa.call(R.ttManage.POST, {
      body: structure({ name: "Thu-Fri Structure", workingDays: ["Thursday", "Friday"], isActive: true, periods: [
        { periodNumber: 1, periodLabel: "Session A", startTime: "10:00", endTime: "11:00", periodType: "Class Period" },
        { periodNumber: 2, periodLabel: "Tea Break", startTime: "11:00", endTime: "11:30", periodType: "Short Break" },
        { periodNumber: 3, periodLabel: "Session B", startTime: "11:30", endTime: "12:30", periodType: "Class Period" }] }),
    });
    expect(b.status).toBe(200);
    expect(one("select count(*) n from timetable_structures where is_active = 1")).toEqual({ n: 2 });
  });

  it("a Thursday event uses the Thu-Fri structure; a Monday event uses the Mon-Wed structure", async () => {
    const thu = await makeApprovedEvent({ date: futureDate(4), start: "10:30", end: "12:00" });
    const mon = await makeApprovedEvent({ date: futureDate(1), start: "09:30", end: "09:50" });
    const t = (await maya.call(R.odOverlap.POST, { body: { eventId: thu } })).data;
    expect(t.structure.name).toBe("Thu-Fri Structure");
    expect(labels(t.affectedPeriods)).toEqual(["Session A", "Session B"]);
    expect(t.totalAcademicMinutes).toBe(120);
    const m = (await maya.call(R.odOverlap.POST, { body: { eventId: mon } })).data;
    expect(m.structure.name).toBe("Mon-Wed Structure");
    expect(labels(m.affectedPeriods)).toEqual(["Period 1"]);
    expect(m.totalAcademicMinutes).toBe(50);
  });

  it("weekends and dates before a structure's effective-from date are not covered", async () => {
    const sun = await makeApprovedEvent({ date: futureDate(0), start: "10:00", end: "12:00" });
    const sunCalc = (await maya.call(R.odOverlap.POST, { body: { eventId: sun } })).data;
    expect(sunCalc.structure).toBeNull();
    expect(sunCalc.reason).toBe("NON_WORKING_DAY");
    // a Saturday structure that only starts 20+ days from now
    const effective = futureDate(6, 20);
    expect((await sa.call(R.ttManage.POST, { body: structure({ name: "Saturday Lab", workingDays: ["Saturday"], effectiveFrom: effective, isActive: true, periods: [{ periodNumber: 1, periodLabel: "Sat Lab", startTime: "09:00", endTime: "12:00", periodType: "Class Period" }] }) })).status).toBe(200);
    const early = await makeApprovedEvent({ date: futureDate(6, 3), start: "10:00", end: "11:00" });
    expect((await maya.call(R.odOverlap.POST, { body: { eventId: early } })).data.structure).toBeNull(); // before effective date
    const onDay = await makeApprovedEvent({ date: effective, start: "10:00", end: "11:00" }); // exactly the effective date
    const calc = (await maya.call(R.odOverlap.POST, { body: { eventId: onDay } })).data;
    expect(calc.structure.name).toBe("Saturday Lab");
    expect(calc.totalAcademicMinutes).toBe(180);
  });
});

describe("OD workflow", () => {
  const monday = futureDate(1, 3);
  let e1 = 0;
  let devOd = 0;
  let priyaOd = 0;

  it("requires an existing registration owned by the caller", async () => {
    e1 = await makeApprovedEvent({ date: monday, start: "09:30", end: "15:30" });
    const noReg = await dev.call(R.odApply.POST, { body: { eventId: e1, reason: "Team lead at the hackathon" } });
    expect(noReg.status).toBe(400);
    expect(noReg.data.code).toBe("NOT_REGISTERED");
    await maya.call(R.eventRegister.POST, { params: pid(e1) });
    const mayaReg = (one<{ id: number }>("select id from event_registrations where event_id = ? and user_id = ?", e1, idOf(EMAILS.maya)) as { id: number }).id;
    expect((await dev.call(R.odApply.POST, { body: { registrationId: mayaReg, reason: "Using someone else's registration" } })).status).toBe(404);
    expect((await dev.call(R.odApply.POST, { body: { eventId: e1, reason: "no" } })).status).toBe(400);
    expect(q("select * from od_requests where event_id = ?", e1)).toHaveLength(0);
  });

  it("routes to the assigned Class Mentor - never to the event's Faculty Coordinator - and computes periods automatically", async () => {
    await dev.call(R.eventRegister.POST, { params: pid(e1) });
    await priya.call(R.eventRegister.POST, { params: pid(e1) });
    const thorneBefore = unread(EMAILS.thorne, "od");
    const wrightBefore = unread(EMAILS.wright, "od");
    const r = await dev.call(R.odApply.POST, { body: { eventId: e1, reason: "Representing CSE at the hackathon" } });
    expect(r.status).toBe(200);
    expect(r.data.affectedPeriodsCount).toBe(6);
    expect(r.data.totalAcademicMinutes).toBe(300);
    devOd = r.data.onDutyRequest.id;
    expect(one("select mentor_id, status from od_requests where id = ?", devOd)).toEqual({ mentor_id: idOf(EMAILS.thorne), status: "Pending" });
    expect(unread(EMAILS.thorne, "od")).toBe(thorneBefore + 1);
    // Priya's mentor is Wright although the event is coordinated by Thorne
    const p = await priya.call(R.odApply.POST, { body: { eventId: e1, reason: "Volunteering at the hackathon" } });
    expect(p.status).toBe(200);
    priyaOd = p.data.onDutyRequest.id;
    expect(one("select mentor_id from od_requests where id = ?", priyaOd)).toEqual({ mentor_id: idOf(EMAILS.wright) });
    expect(unread(EMAILS.wright, "od")).toBe(wrightBefore + 1);
    expect(unread(EMAILS.thorne, "od")).toBe(thorneBefore + 1); // coordinator was not notified about Priya's OD
    expect((await dev.call(R.odApply.POST, { body: { eventId: e1, reason: "Applying a second time" } })).status).toBe(409);
  });

  it("only the assigned mentor can decide; nobody else, and nothing changes on refusal", async () => {
    for (const c of [wright, maya, alex, jordan, priya, admin]) {
      expect((await c.call(R.odReview.POST, { params: pid(devOd), body: { decision: "Approved" } })).status, c.email).toBe(403);
    }
    expect((await thorne.call(R.odReview.POST, { params: pid(priyaOd), body: { decision: "Approved" } })).status).toBe(403); // coordinator != mentor
    expect(one("select status from od_requests where id = ?", devOd)).toEqual({ status: "Pending" });
  });

  it("approval/rejection are final, notify the student and are recorded in the history", async () => {
    const before = unread(EMAILS.dev, "od");
    const ok = await thorne.call(R.odReview.POST, { params: pid(devOd), body: { decision: "Approved", mentorRemarks: "Approved - submit notes" } });
    expect(ok.status).toBe(200);
    expect(unread(EMAILS.dev, "od")).toBe(before + 1);
    expect((await thorne.call(R.odReview.POST, { params: pid(devOd), body: { decision: "Rejected" } })).status).toBe(409);
    expect((await thorne.call(R.odReview.POST, { params: pid(devOd), body: { decision: "Approved" } })).status).toBe(409);
    expect(one("select status, decided_by, is_override from od_requests where id = ?", devOd)).toEqual({ status: "Approved", decided_by: idOf(EMAILS.thorne), is_override: 0 });
    expect((await wright.call(R.odReview.POST, { params: pid(priyaOd), body: { decision: "Rejected", mentorRemarks: "Not relevant to coursework" } })).status).toBe(200);
    const mine = (await priya.call(R.od.GET)).data.onDutyRequests[0];
    expect(mine.status).toBe("Rejected");
    expect(mine.mentorRemarks).toBe("Not relevant to coursework");
    const devHistory = (await dev.call(R.od.GET)).data.onDutyRequests[0].history.map((h: { action: string }) => h.action);
    expect(devHistory).toEqual(["Submitted", "Approved"]);
    expect((await priya.call(R.odApply.POST, { body: { eventId: e1, reason: "Trying again after rejection" } })).status).toBe(409);
  });

  it("Super Admin can override, and the override is flagged and audited", async () => {
    const pendingSeed = one<{ id: number }>("select id from od_requests where status = 'Pending'") as { id: number };
    const r = await sa.call(R.odReview.POST, { params: pid(pendingSeed.id), body: { decision: "Approved", mentorRemarks: "Admin override" } });
    expect(r.status).toBe(200);
    expect(one("select is_override from od_requests where id = ?", pendingSeed.id)).toEqual({ is_override: 1 });
    expect(one("select count(*) n from audit_logs where action = 'OVERRIDE_APPROVE_OD'")).toEqual({ n: 1 });
  });

  it("refuses OD when nothing academic is affected (non-working day, break-only) or the event is not eligible", async () => {
    const sun = await makeApprovedEvent({ date: futureDate(0), start: "10:00", end: "12:00" });
    await dev.call(R.eventRegister.POST, { params: pid(sun) });
    const s = await dev.call(R.odApply.POST, { body: { eventId: sun, reason: "Weekend event, should be refused" } });
    expect(s.status).toBe(422);
    expect(s.data.code).toBe("NON_WORKING_DAY");
    const brk = await makeApprovedEvent({ date: futureDate(1, 10), start: "10:45", end: "11:05" });
    await dev.call(R.eventRegister.POST, { params: pid(brk) });
    const b = await dev.call(R.odApply.POST, { body: { eventId: brk, reason: "Only overlaps the morning break" } });
    expect(b.status).toBe(422);
    expect(b.data.code).toBe("NO_CLASS_OVERLAP");
    const cancelled = await makeApprovedEvent({ date: futureDate(2, 10) });
    await dev.call(R.eventRegister.POST, { params: pid(cancelled) });
    await alex.call(R.status.POST, { params: pid(cancelled), body: { status: "Cancelled" } });
    expect((await dev.call(R.odApply.POST, { body: { eventId: cancelled, reason: "Event was cancelled" } })).status).toBe(400);
    expect((await alex.call(R.odApply.POST, { body: { eventId: e1, reason: "Staff cannot apply for OD" } })).status).toBe(403);
  });

  it("approved OD snapshots survive timetable edits; referenced structures cannot be deleted", async () => {
    const before = one<{ affected_periods_snapshot: string; timetable_version: number; timetable_name: string; total_academic_minutes: number }>("select affected_periods_snapshot, timetable_version, timetable_name, total_academic_minutes from od_requests where id = ?", devOd) as {
      affected_periods_snapshot: string; timetable_version: number; timetable_name: string; total_academic_minutes: number;
    };
    expect(JSON.parse(before.affected_periods_snapshot)).toHaveLength(6);
    const edit = await sa.call(R.ttManage.PUT, { method: "PUT", body: { structureId: 1, name: "Renamed & Rewritten", workingDays: ["Monday", "Tuesday", "Wednesday"], effectiveFrom: "2025-01-01", isActive: true, periods: [{ periodNumber: 1, periodLabel: "Only Period", startTime: "08:00", endTime: "08:50", periodType: "Class Period" }] } });
    expect(edit.status).toBe(200);
    expect(edit.data.structure.version).toBe(before.timetable_version + 1);
    expect(one("select affected_periods_snapshot, timetable_version, timetable_name, total_academic_minutes from od_requests where id = ?", devOd)).toEqual(before);
    const view = (await dev.call(R.od.GET)).data.onDutyRequests[0];
    expect(view.affectedPeriods).toHaveLength(6);
    expect(view.timetableName).toBe(before.timetable_name);
    expect(view.totalAcademicMinutes).toBe(300);
    const del = await sa.call(R.ttManage.DELETE, { method: "DELETE", url: "/api/timetable/manage?id=1" });
    expect(del.status).toBe(409);
    expect(del.data.code).toBe("IN_USE");
    expect(one("select count(*) n from timetable_structures where id = 1")).toEqual({ n: 1 });
  });
});

describe("timetable validation, conflicts and audit trail", () => {
  const bad = (periods: unknown[], extra: Record<string, unknown> = {}) => sa.call(R.ttManage.POST, { body: structure({ periods, ...extra }) });
  const pp = (n: number, s: string, e: string, label = `P${n}`) => ({ periodNumber: n, periodLabel: label, startTime: s, endTime: e, periodType: "Class Period" });

  it("rejects overlapping, inverted, zero-length, out-of-order and duplicate periods", async () => {
    const overlap = await bad([pp(1, "09:00", "10:00"), pp(2, "09:30", "10:30")]);
    expect(overlap.status).toBe(400);
    expect(overlap.data.error).toMatch(/overlaps/);
    expect((await bad([pp(1, "10:00", "09:00")])).status).toBe(400);
    expect((await bad([pp(1, "09:00", "09:00")])).status).toBe(400);
    const order = await bad([pp(1, "10:00", "11:00"), pp(2, "09:00", "09:30")]);
    expect(order.status).toBe(400);
    expect(order.data.error).toMatch(/chronological/);
    expect((await bad([pp(1, "09:00", "10:00"), pp(1, "10:00", "11:00")])).status).toBe(400);
    expect((await bad([])).status).toBe(400);
    expect((await bad([pp(1, "9:00", "10:00")])).status).toBe(400);
  });
  it("validates working days and effective date", async () => {
    expect((await bad([pp(1, "09:00", "10:00")], { workingDays: ["Funday"] })).status).toBe(400);
    expect((await bad([pp(1, "09:00", "10:00")], { workingDays: [] })).status).toBe(400);
    expect((await bad([pp(1, "09:00", "10:00")], { effectiveFrom: "2026-02-30" })).status).toBe(400);
    expect((await bad([pp(1, "09:00", "10:00")], { name: "x" })).status).toBe(400);
  });
  it("warns about unintended gaps but still saves", async () => {
    const r = await bad([pp(1, "09:00", "10:00"), pp(2, "10:30", "11:30")]);
    expect(r.status).toBe(200);
    expect(r.data.warnings).toHaveLength(1);
    expect(r.data.warnings[0]).toMatch(/30 minutes/);
    const dur = q<{ duration_minutes: number }>("select duration_minutes from timetable_periods where structure_id = ? order by period_number", r.data.structure.id);
    expect(dur.map((d) => d.duration_minutes)).toEqual([60, 60]); // durations are computed by the server
  });
  it("allows only one active structure per day unless replacement is explicitly confirmed", async () => {
    const conflict = await bad([pp(1, "09:00", "10:00")], { workingDays: ["Monday"], isActive: true });
    expect(conflict.status).toBe(409);
    expect(conflict.data.code).toBe("ACTIVE_CONFLICT");
    const replaced = await bad([pp(1, "09:00", "10:00")], { name: "Monday Only", workingDays: ["Monday"], isActive: true, replaceConflicting: true });
    expect(replaced.status).toBe(200);
    expect(one("select is_active from timetable_structures where id = 1")).toEqual({ is_active: 0 });
    expect((await sa.call(R.ttManage.PATCH, { method: "PATCH", body: { structureId: 1, isActive: true } })).status).toBe(409);
    expect((await sa.call(R.ttManage.DELETE, { method: "DELETE", url: `/api/timetable/manage?id=${replaced.data.structure.id}` })).status).toBe(200);
    expect((await sa.call(R.ttManage.PATCH, { method: "PATCH", body: { structureId: 1, isActive: true } })).status).toBe(200);
  });
  it("every timetable change is audit-logged with the Super Admin as actor", () => {
    const actions = q<{ action: string; actor_id: number }>("select distinct action, actor_id from audit_logs where entity_type = 'timetable_structures'");
    for (const a of ["CREATE_TIMETABLE", "UPDATE_TIMETABLE", "DEACTIVATE_TIMETABLE", "ACTIVATE_TIMETABLE", "DELETE_TIMETABLE"]) expect(actions.some((x) => x.action === a), a).toBe(true);
    expect(actions.every((x) => x.actor_id === idOf(EMAILS.superAdmin))).toBe(true);
  });
});
