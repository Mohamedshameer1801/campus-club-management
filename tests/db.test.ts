import { beforeAll, describe, expect, it } from "vitest";
import { getSqlite, openDatabase, runMigrations } from "@/db";
import { EMAILS, clubId, idOf, one, q, run, setupApp } from "./helpers";

beforeAll(() => {
  setupApp();
});

let n = 0;
const mkUser = (role = "student", email = `db${++n}@t.edu`) => Number(run("insert into users (email, password_hash, full_name, role) values (?, 'h', 'T', ?)", email, role).lastInsertRowid);
const mkStudent = (ra: string, userId = mkUser()) =>
  run("insert into students (user_id, ra_number, department, academic_year, mentor_id) values (?, ?, 'CSE', '1st', ?)", userId, ra, idOf(EMAILS.thorne));
const mkEvent = (status = "Draft", capacity = 2, extra = "") => {
  const r = run(
    `insert into events (club_id, title, description, event_date, start_time, end_time, venue, max_capacity, created_by_id, faculty_coordinator_id, status ${extra ? ", " + extra.split("=")[0] : ""})
     values (?, 'T', 'D', '2030-01-15', '10:00', '11:00', 'V', ?, ?, ?, ? ${extra ? ", " + extra.split("=")[1] : ""})`,
    clubId("TCC"), capacity, idOf(EMAILS.alex), idOf(EMAILS.thorne), status
  );
  return Number(r.lastInsertRowid);
};
const reg = (eventId: number, userId: number) => run("insert into event_registrations (event_id, user_id) values (?, ?)", eventId, userId);

describe("SQLite engine configuration", () => {
  it("enforces foreign keys on the application connection and on any new connection", () => {
    expect(getSqlite().pragma("foreign_keys", { simple: true })).toBe(1);
    const { sqlite } = openDatabase(process.env.DATABASE_PATH as string);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    sqlite.close();
  });

  it("persists data across connections (restart) and migrations are idempotent", () => {
    const before = one<{ n: number }>("select count(*) n from users")?.n;
    const { db, sqlite } = openDatabase(process.env.DATABASE_PATH as string);
    expect(sqlite.prepare("select count(*) n from users").get()).toEqual({ n: before });
    expect(() => runMigrations(db)).not.toThrow();
    sqlite.close();
  });
});

describe("RA Number constraints (database layer)", () => {
  it.each(["RA123", "RA23110030100456", "ra2311003010045", "RA2311003010#45", "RA23110030 10045", "RA231100301004\u00e9"])("rejects malformed RA %j", (ra) => {
    expect(() => mkStudent(ra)).toThrow(/CHECK constraint failed/);
  });
  it("accepts a valid RA once and rejects duplicates", () => {
    expect(() => mkStudent("RA0000000000001")).not.toThrow();
    expect(() => mkStudent("RA0000000000001")).toThrow(/UNIQUE constraint failed: students\.ra_number/);
  });
  it("a student row must reference a student user and a faculty mentor", () => {
    expect(() => run("insert into students (user_id, ra_number, department, academic_year, mentor_id) values (?, 'RA0000000000002', 'C', '1', ?)", idOf(EMAILS.thorne), idOf(EMAILS.thorne))).toThrow(/STUDENT_ROLE_REQUIRED/);
    expect(() => run("insert into students (user_id, ra_number, department, academic_year, mentor_id) values (?, 'RA0000000000003', 'C', '1', ?)", mkUser(), idOf(EMAILS.maya))).toThrow(/MENTOR_MUST_BE_FACULTY/);
  });
});

describe("integrity constraints", () => {
  it("rejects orphan foreign keys", () => {
    expect(() => run("insert into event_registrations (event_id, user_id) values (99999, ?)", idOf(EMAILS.maya))).toThrow(/FOREIGN KEY constraint failed/);
    expect(() => run("insert into club_memberships (club_id, user_id) values (99999, ?)", idOf(EMAILS.maya))).toThrow(/FOREIGN KEY constraint failed/);
  });
  it("restricts deleting referenced rows (history is archived, not destroyed)", () => {
    expect(() => run("delete from users where id = ?", idOf(EMAILS.maya))).toThrow(/FOREIGN KEY constraint failed/);
    expect(() => run("delete from clubs where id = ?", clubId("TCC"))).toThrow(/FOREIGN KEY constraint failed/);
  });
  it("users: valid roles, lower-case e-mail and at least one auth method", () => {
    expect(() => run("insert into users (email, password_hash, full_name, role) values ('r@t.edu', 'h', 'X', 'hacker')")).toThrow(/CHECK constraint failed/);
    expect(() => run("insert into users (email, password_hash, full_name, role) values ('Upper@t.edu', 'h', 'X', 'student')")).toThrow(/CHECK constraint failed/);
    expect(() => run("insert into users (email, full_name, role) values ('noauth@t.edu', 'X', 'student')")).toThrow(/CHECK constraint failed/);
    expect(() => run("insert into users (email, password_hash, full_name) values (?, 'h', 'X')", EMAILS.maya)).toThrow(/UNIQUE constraint failed: users\.email/);
  });
  it("unique membership, unique registration and case-insensitive club names", () => {
    expect(() => run("insert into club_memberships (club_id, user_id) values (?, ?)", clubId("TCC"), idOf(EMAILS.maya))).toThrow(/UNIQUE constraint failed/);
    const e = mkEvent("Approved", 5);
    reg(e, idOf(EMAILS.maya));
    expect(() => reg(e, idOf(EMAILS.maya))).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      run("insert into clubs (name, code, category, description, club_admin_id, faculty_coordinator_id) values ('TURING CODING & AI CLUB', 'XX1', 'Technical', 'd', ?, ?)", idOf(EMAILS.alex), idOf(EMAILS.thorne))
    ).toThrow(/UNIQUE constraint failed/);
  });
  it("event field checks (date format, time order, capacity, rejection reason)", () => {
    expect(() => mkEvent("Draft", 0)).toThrow(/CHECK constraint failed/);
    expect(() =>
      run("insert into events (club_id,title,description,event_date,start_time,end_time,venue,max_capacity,created_by_id,faculty_coordinator_id) values (?, 'T','D','2030-01-15','12:00','11:00','V',5,?,?)", clubId("TCC"), idOf(EMAILS.alex), idOf(EMAILS.thorne))
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      run("insert into events (club_id,title,description,event_date,start_time,end_time,venue,max_capacity,created_by_id,faculty_coordinator_id) values (?, 'T','D','2030-1-5','10:00','11:00','V',5,?,?)", clubId("TCC"), idOf(EMAILS.alex), idOf(EMAILS.thorne))
    ).toThrow(/CHECK constraint failed/);
    const e = mkEvent("Pending Faculty Approval");
    expect(() => run("update events set status = 'Rejected' where id = ?", e)).toThrow(/CHECK constraint failed/);
  });
  it("timetable period checks", () => {
    const s = one<{ id: number }>("select id from timetable_structures limit 1")?.id as number;
    const ins = (num: number, st: string, en: string, dur: number) =>
      run("insert into timetable_periods (structure_id, period_number, label, start_time, end_time, period_type, duration_minutes) values (?, ?, 'P', ?, ?, 'Class Period', ?)", s, num, st, en, dur);
    expect(() => ins(50, "10:00", "09:00", 60)).toThrow(/CHECK constraint failed/);
    expect(() => ins(51, "10:00", "10:00", 0)).toThrow(/CHECK constraint failed/);
    expect(() => ins(1, "17:00", "18:00", 60)).toThrow(/UNIQUE constraint failed/);
  });
});

describe("workflow guard triggers", () => {
  it("registration: only Approved events, never beyond capacity (DB-level, independent of app code)", () => {
    expect(() => reg(mkEvent("Draft"), idOf(EMAILS.maya))).toThrow(/EVENT_NOT_OPEN/);
    expect(() => reg(mkEvent("Rejected", 5, "rejection_reason='no'"), idOf(EMAILS.maya))).toThrow(/EVENT_NOT_OPEN/);
    const e = mkEvent("Approved", 1);
    reg(e, idOf(EMAILS.maya));
    expect(() => reg(e, idOf(EMAILS.dev))).toThrow(/EVENT_FULL/);
    expect(one("select count(*) n from event_registrations where event_id = ?", e)).toEqual({ n: 1 });
  });
  it("two independent connections racing for the last seat: exactly one wins", () => {
    const e = mkEvent("Approved", 1);
    const a = openDatabase(process.env.DATABASE_PATH as string).sqlite;
    const b = openDatabase(process.env.DATABASE_PATH as string).sqlite;
    const ins = "insert into event_registrations (event_id, user_id) values (?, ?)";
    const results = [a.prepare(ins), b.prepare(ins)].map((st, i) => {
      try {
        st.run(e, i === 0 ? idOf(EMAILS.maya) : idOf(EMAILS.dev));
        return "ok";
      } catch (err) {
        return (err as Error).message;
      }
    });
    a.close();
    b.close();
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.find((r) => r !== "ok")).toMatch(/EVENT_FULL/);
  });
  it("event status transitions follow the state machine", () => {
    const e = mkEvent("Draft");
    expect(() => run("update events set status = 'Approved' where id = ?", e)).toThrow(/INVALID_EVENT_TRANSITION/);
    expect(() => run("update events set status = 'Pending Faculty Approval' where id = ?", e)).not.toThrow();
    expect(() => run("update events set status = 'Completed' where id = ?", e)).toThrow(/INVALID_EVENT_TRANSITION/);
    expect(() => run("update events set status = 'Approved' where id = ?", e)).not.toThrow();
    expect(() => run("update events set status = 'Completed' where id = ?", e)).not.toThrow();
    expect(() => run("update events set status = 'Ongoing' where id = ?", e)).toThrow(/INVALID_EVENT_TRANSITION/);
    expect(() => run("update events set status = 'Cancelled' where id = ?", e)).toThrow(/INVALID_EVENT_TRANSITION/);
    const rej = mkEvent("Rejected", 5, "rejection_reason='no'");
    expect(() => run("update events set status = 'Approved' where id = ?", rej)).toThrow(/INVALID_EVENT_TRANSITION/); // must be resubmitted first
  });
  it("OD approved snapshots and decisions are immutable", () => {
    const approved = one<{ id: number }>("select id from od_requests where status = 'Approved'")?.id as number;
    expect(() => run("update od_requests set affected_periods_snapshot = '[]' where id = ?", approved)).toThrow(/OD_SNAPSHOT_IMMUTABLE/);
    expect(() => run("update od_requests set total_academic_minutes = 1 where id = ?", approved)).toThrow(/OD_SNAPSHOT_IMMUTABLE/);
    expect(() => run("update od_requests set status = 'Rejected' where id = ?", approved)).toThrow(/OD_DECISION_FINAL/);
  });
  it("audit log is append-only", () => {
    expect(() => run("update audit_logs set details = 'tampered'")).toThrow(/AUDIT_LOG_IMMUTABLE/);
    expect(() => run("delete from audit_logs")).toThrow(/AUDIT_LOG_IMMUTABLE/);
  });
  it("certificates require a Completed event and confirmed attendance for that registration", () => {
    const insert = (regId: number, eventId: number, userId: number) =>
      run("insert into certificates (certificate_number, registration_id, event_id, user_id, club_id, participation_role, issued_by) values (?, ?, ?, ?, ?, 'Participant', ?)", `CERT-DB-${regId}-${eventId}`, regId, eventId, userId, clubId("TCC"), idOf(EMAILS.alex));
    const sprint = q<{ id: number; event_id: number; user_id: number }>("select r.id, r.event_id, r.user_id from event_registrations r join events e on e.id = r.event_id where e.status = 'Ongoing' limit 1")[0];
    expect(() => insert(sprint.id, sprint.event_id, sprint.user_id)).toThrow(/CERT_EVENT_NOT_COMPLETED/);
    const devAbsent = q<{ id: number; event_id: number; user_id: number }>("select r.id, r.event_id, r.user_id from event_registrations r join events e on e.id = r.event_id where e.status = 'Completed' and r.user_id = ?", idOf(EMAILS.dev))[0];
    expect(() => insert(devAbsent.id, devAbsent.event_id, devAbsent.user_id)).toThrow(/CERT_NO_CONFIRMED_ATTENDANCE/);
  });
  it("a dynamic role can only be assigned inside its own club", () => {
    const rid = Number(run("insert into club_roles (club_id, name) values (?, 'Literary Only')", clubId("CLDS")).lastInsertRowid);
    expect(() => run("update club_memberships set role_id = ? where club_id = ? and user_id = ?", rid, clubId("TCC"), idOf(EMAILS.maya))).toThrow(/ROLE_OUT_OF_CLUB_SCOPE/);
    expect(() => run("insert into role_permissions (role_id, permission_key) values (?, 'super_admin')", rid)).toThrow(/FOREIGN KEY constraint failed/); // no institutional permission exists
  });
});
