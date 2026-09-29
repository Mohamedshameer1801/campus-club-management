import { getDb, getSqlite } from "@/db";
import { seedDatabase } from "@/db/seed";
import { resetLoginThrottle } from "@/lib/services/auth";
import { localDate } from "@/lib/services/common";

import * as login from "@/app/api/auth/login/route";
import * as register from "@/app/api/auth/register/route";
import * as logout from "@/app/api/auth/logout/route";
import * as me from "@/app/api/auth/me/route";
import * as google from "@/app/api/auth/google/route";
import * as profile from "@/app/api/profile/route";
import * as users from "@/app/api/users/route";
import * as userById from "@/app/api/users/[id]/route";
import * as clubs from "@/app/api/clubs/route";
import * as clubById from "@/app/api/clubs/[id]/route";
import * as join from "@/app/api/clubs/[id]/join/route";
import * as members from "@/app/api/clubs/[id]/members/route";
import * as roles from "@/app/api/clubs/[id]/dynamic-roles/route";
import * as template from "@/app/api/clubs/[id]/certificate-template/route";
import * as events from "@/app/api/events/route";
import * as eventById from "@/app/api/events/[id]/route";
import * as submit from "@/app/api/events/[id]/submit/route";
import * as approve from "@/app/api/events/[id]/approve/route";
import * as status from "@/app/api/events/[id]/status/route";
import * as eventRegister from "@/app/api/events/[id]/register/route";
import * as registrations from "@/app/api/events/[id]/registrations/route";
import * as attendance from "@/app/api/events/[id]/attendance/route";
import * as history from "@/app/api/events/[id]/history/route";
import * as qrGen from "@/app/api/qr/generate/route";
import * as qrCheckin from "@/app/api/qr/verify-and-checkin/route";
import * as timetable from "@/app/api/timetable/route";
import * as ttManage from "@/app/api/timetable/manage/route";
import * as od from "@/app/api/od/route";
import * as odApply from "@/app/api/od/apply/route";
import * as odOverlap from "@/app/api/od/calculate-overlap/route";
import * as odReview from "@/app/api/od/[id]/review/route";
import * as certs from "@/app/api/certificates/route";
import * as certBulk from "@/app/api/certificates/bulk-issue/route";
import * as certPdf from "@/app/api/certificates/[id]/pdf/route";
import * as certVerify from "@/app/api/certificates/verify/[certificateNumber]/route";
import * as badges from "@/app/api/badges/route";
import * as badgeAward from "@/app/api/badges/award/route";
import * as badgesAwarded from "@/app/api/badges/awarded/route";
import * as notifs from "@/app/api/notifications/route";
import * as threads from "@/app/api/messages/threads/route";
import * as threadById from "@/app/api/messages/threads/[id]/route";
import * as contacts from "@/app/api/messages/contacts/route";
import * as portfolio from "@/app/api/portfolio/[userId]/route";
import * as pSummary from "@/app/api/portfolio/summary/route";
import * as pPdf from "@/app/api/portfolio/pdf/route";
import * as analytics from "@/app/api/analytics/route";
import * as audit from "@/app/api/audit-logs/route";
import * as mentors from "@/app/api/auth/mentors/route";

export const R = {
  login, register, logout, me, google, profile, users, userById, clubs, clubById, join, members, roles, template, events, eventById, submit, approve, status,
  eventRegister, registrations, attendance, history, qrGen, qrCheckin, timetable, ttManage, od, odApply, odOverlap, odReview, certs, certBulk, certPdf, certVerify,
  badges, badgeAward, badgesAwarded, notifs, threads, threadById, contacts, portfolio, pSummary, pPdf, analytics, audit, mentors,
};

export const PASSWORD = "Password123!";
export const EMAILS = {
  superAdmin: "superadmin@campus.edu", admin: "admin@campus.edu", alex: "clubadmin@campus.edu", jordan: "clubadmin2@campus.edu",
  thorne: "faculty@campus.edu", wright: "mentor@campus.edu", maya: "maya@student.campus.edu", dev: "dev@student.campus.edu", priya: "priya@student.campus.edu",
};

export function setupApp() {
  const db = getDb();
  seedDatabase(db);
  resetLoginThrottle();
  return db;
}
type Handler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response>;
interface CallOpts { method?: string; url?: string; body?: unknown; cookie?: string; params?: Record<string, string>; headers?: Record<string, string> }
export interface ApiResult { status: number; data: any; headers: Headers }

export async function call(handler: Handler, opts: CallOpts = {}): Promise<ApiResult> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-host": "localhost:3000", ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers };
  const req = new Request(`http://localhost:3000${opts.url ?? "/api/test"}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}

export function cookieFrom(headers: Headers): string {
  const m = /campus_session=([^;]*)/.exec(headers.get("set-cookie") ?? "");
  if (!m) throw new Error("no session cookie in response");
  return `campus_session=${m[1]}`;
}

export interface Client { cookie: string; email: string; call: (h: Handler, o?: CallOpts) => Promise<ApiResult> }
const cache = new Map<string, string>();
export async function client(email: string, fresh = false): Promise<Client> {
  let cookie = cache.get(email);
  if (!cookie || fresh) {
    const r = await call(login.POST, { body: { email, password: PASSWORD } });
    if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.data)}`);
    cookie = cookieFrom(r.headers);
    cache.set(email, cookie);
  }
  const c = cookie;
  return { cookie: c, email, call: (h, o = {}) => call(h, { ...o, cookie: c }) };
}

// ---------------------------------------------------------------- raw db helpers
export const q = <T = Record<string, unknown>>(sql: string, ...p: unknown[]) => getSqlite().prepare(sql).all(...p) as T[];
export const one = <T = Record<string, unknown>>(sql: string, ...p: unknown[]) => getSqlite().prepare(sql).get(...p) as T | undefined;
export const run = (sql: string, ...p: unknown[]) => getSqlite().prepare(sql).run(...p);
export const idOf = (email: string) => (one<{ id: number }>("select id from users where email = ?", email) as { id: number }).id;
export const clubId = (code: string) => (one<{ id: number }>("select id from clubs where code = ?", code) as { id: number }).id;
export const unread = (email: string, type?: string) => (one<{ n: number }>(`select count(*) n from notifications where user_id = ? ${type ? "and type = ?" : ""}`, ...(type ? [idOf(email), type] : [idOf(email)])) as { n: number }).n;

/** A future date (>= minDays ahead) that falls on the given JS weekday (0 = Sunday ... 6 = Saturday). */
export function futureDate(dow: number, minDays = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + minDays);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return localDate(d);
}

let seq = 0;
export async function makeApprovedEvent(o: { club?: "TCC" | "ROBO" | "CLDS"; date?: string; start?: string; end?: string; capacity?: number; title?: string } = {}): Promise<number> {
  const club = o.club ?? "TCC";
  const admin = await client(club === "CLDS" ? EMAILS.jordan : EMAILS.alex);
  const fac = await client(club === "CLDS" ? EMAILS.wright : EMAILS.thorne);
  const created = await admin.call(R.events.POST, {
    body: {
      clubId: clubId(club), title: o.title ?? `Test Event ${++seq}`, description: "Automated test event description", eventDate: o.date ?? futureDate(2), startTime: o.start ?? "09:30",
      endTime: o.end ?? "15:30", venue: "Test Hall", maxCapacity: o.capacity ?? 50, submitImmediately: true,
    },
  });
  if (created.status !== 200) throw new Error(`event create failed: ${JSON.stringify(created.data)}`);
  const id = created.data.event.id as number;
  const dec = await fac.call(R.approve.POST, { params: { id: String(id) }, body: { decision: "Approved" } });
  if (dec.status !== 200) throw new Error(`approve failed: ${JSON.stringify(dec.data)}`);
  return id;
}

let studentSeq = 0;
export async function makeStudent(): Promise<Client & { id: number; ra: string }> {
  const n = ++studentSeq + 100;
  const ra = `RA${String(n).padStart(13, "0")}`;
  const email = `student${n}@test.edu`;
  const r = await call(register.POST, { body: { fullName: `Test Student ${n}`, email, password: PASSWORD, raNumber: ra, department: "CSE", academicYear: "2nd Year", mentorId: idOf(EMAILS.thorne) } });
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.data)}`);
  const cookie = cookieFrom(r.headers);
  return { cookie, email, id: r.data.user.id, ra, call: (h, o = {}) => call(h, { ...o, cookie }) };
}

export const pid = (id: number) => ({ id: String(id) });
