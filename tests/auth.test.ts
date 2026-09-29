import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMAILS, PASSWORD, R, call, client, cookieFrom, idOf, one, run, setupApp } from "./helpers";
import { resetLoginThrottle } from "@/lib/services/auth";
import { setGoogleVerifierForTests } from "@/lib/services/google";
import { hashToken } from "@/lib/session";

beforeAll(() => {
  setupApp();
});
afterAll(() => setGoogleVerifierForTests(null));

let n = 0;
const reg = (o: Record<string, unknown> = {}) => ({
  fullName: "New Student", email: `new${++n}@t.edu`, password: PASSWORD, raNumber: `RA${String(5000 + n).padStart(13, "0")}`,
  department: "CSE", academicYear: "1st Year", mentorId: idOf(EMAILS.thorne), ...o,
});

describe("student registration & RA Number validation", () => {
  it.each(["RA123", "RA23110030100456", "RA2311003010#45", "RA 311003010045", ""])("rejects invalid RA Number %j", async (ra) => {
    const r = await call(R.register.POST, { body: reg({ raNumber: ra }) });
    expect(r.status).toBe(400);
  });

  it("normalises a valid RA Number to upper case and persists it", async () => {
    const r = await call(R.register.POST, { body: reg({ raNumber: "ra9999999999999" }) });
    expect(r.status).toBe(201);
    expect(one<{ ra_number: string }>("select ra_number from students where user_id = ?", r.data.user.id)?.ra_number).toBe("RA9999999999999");
  });

  it("rejects duplicate RA Number and duplicate email", async () => {
    const first = reg();
    expect((await call(R.register.POST, { body: first })).status).toBe(201);
    const dupRa = await call(R.register.POST, { body: reg({ raNumber: first.raNumber }) });
    expect(dupRa.status).toBe(409);
    expect(dupRa.data.code).toBe("RA_EXISTS");
    const dupEmail = await call(R.register.POST, { body: reg({ email: first.email.toUpperCase() }) });
    expect(dupEmail.status).toBe(409);
  });

  it("enforces the password policy", async () => {
    for (const password of ["short1", "onlyletters", "12345678"]) {
      const r = await call(R.register.POST, { body: reg({ password }) });
      expect([400]).toContain(r.status);
    }
  });

  it("ignores a client-supplied role: the account is always a student", async () => {
    const r = await call(R.register.POST, { body: reg({ role: "super_admin", isActive: true }) });
    expect(r.status).toBe(201);
    expect(r.data.user.role).toBe("student");
    expect(one<{ role: string }>("select role from users where id = ?", r.data.user.id)?.role).toBe("student");
  });

  it("requires the Class Mentor to be an active faculty member", async () => {
    const r = await call(R.register.POST, { body: reg({ mentorId: idOf(EMAILS.maya) }) });
    expect(r.status).toBe(400);
    expect(r.data.code).toBe("INVALID_MENTOR");
  });
});

describe("account administration & role escalation", () => {
  it("unauthenticated and student callers cannot create accounts", async () => {
    const body = { email: "evil@t.edu", fullName: "Evil Admin", password: PASSWORD, role: "super_admin" };
    expect((await call(R.users.POST, { body })).status).toBe(401);
    const maya = await client(EMAILS.maya);
    expect((await maya.call(R.users.POST, { body })).status).toBe(403);
    expect((await maya.call(R.users.POST, { body: { ...body, role: "admin" } })).status).toBe(403);
  });

  it("nobody can create a Super Admin through the API; Admin is limited to Club Admins", async () => {
    const sa = await client(EMAILS.superAdmin);
    const ad = await client(EMAILS.admin);
    const base = { fullName: "Some Person", password: PASSWORD };
    expect((await sa.call(R.users.POST, { body: { ...base, email: "sa2@t.edu", role: "super_admin" } })).status).toBe(403);
    expect((await ad.call(R.users.POST, { body: { ...base, email: "ad2@t.edu", role: "admin" } })).status).toBe(403);
    expect((await ad.call(R.users.POST, { body: { ...base, email: "fac2@t.edu", role: "faculty", department: "CSE", designation: "Prof" } })).status).toBe(403);
    expect((await ad.call(R.users.POST, { body: { ...base, email: "ca2@t.edu", role: "club_admin" } })).status).toBe(200);
    expect((await sa.call(R.users.POST, { body: { ...base, email: "ad3@t.edu", role: "admin" } })).status).toBe(200);
    expect((await sa.call(R.users.POST, { body: { ...base, email: "fac3@t.edu", role: "faculty", department: "ECE", designation: "Lecturer" } })).status).toBe(200);
    expect((await sa.call(R.users.POST, { body: { ...base, email: "fac4@t.edu", role: "faculty" } })).status).toBe(400);
  });

  it("the ordinary profile endpoint cannot change the role (strict schema)", async () => {
    const s = await call(R.register.POST, { body: reg() });
    const cookie = cookieFrom(s.headers);
    const bad = await call(R.profile.PATCH, { cookie, body: { role: "super_admin" } });
    expect(bad.status).toBe(400);
    expect(one<{ role: string }>("select role from users where id = ?", s.data.user.id)?.role).toBe("student");
    const ok = await call(R.profile.PATCH, { cookie, body: { fullName: "Renamed Student" } });
    expect(ok.status).toBe(200);
  });

  it("deactivation kills existing sessions and blocks login; protected accounts are safe", async () => {
    const s = await call(R.register.POST, { body: reg() });
    const cookie = cookieFrom(s.headers);
    const email = s.data.user.email as string;
    expect((await call(R.me.GET, { cookie })).data.user?.email).toBe(email);
    const ad = await client(EMAILS.admin);
    expect((await ad.call(R.userById.PATCH, { params: { id: String(s.data.user.id) }, body: { isActive: false } })).status).toBe(200);
    expect((await call(R.me.GET, { cookie })).data.user).toBeNull();
    const login = await call(R.login.POST, { body: { email, password: PASSWORD } });
    expect(login.status).toBe(403);
    expect((await ad.call(R.userById.PATCH, { params: { id: String(idOf(EMAILS.superAdmin)) }, body: { isActive: false } })).status).toBe(403);
    expect((await ad.call(R.userById.PATCH, { params: { id: String(idOf(EMAILS.admin)) }, body: { isActive: false } })).status).toBe(400);
    const stu = await client(EMAILS.dev);
    expect((await stu.call(R.userById.PATCH, { params: { id: String(idOf(EMAILS.maya)) }, body: { isActive: false } })).status).toBe(403);
  });
});

describe("sessions, cookies and CSRF", () => {
  it("issues an HttpOnly, SameSite=Lax cookie and stores only a hash of the token", async () => {
    const r = await call(R.login.POST, { body: { email: EMAILS.maya, password: PASSWORD } });
    expect(r.status).toBe(200);
    const sc = (r.headers.get("set-cookie") ?? "").toLowerCase();
    expect(sc).toContain("httponly");
    expect(sc).toContain("samesite=lax");
    expect(sc).toContain("path=/");
    expect(sc).toContain("expires=");
    expect(sc).not.toContain("secure");
    const token = cookieFrom(r.headers).split("=")[1];
    expect(one("select 1 from sessions where id = ?", token)).toBeUndefined(); // raw token is never stored
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("marks the cookie Secure when configured for production", async () => {
    process.env.COOKIE_SECURE = "true";
    const r = await call(R.login.POST, { body: { email: EMAILS.maya, password: PASSWORD } });
    delete process.env.COOKIE_SECURE;
    expect((r.headers.get("set-cookie") ?? "").toLowerCase()).toContain("secure");
  });

  it("protected endpoints require a valid session; tampered/forged cookies are rejected", async () => {
    expect((await call(R.clubs.GET)).status).toBe(401);
    expect((await call(R.clubs.GET, { cookie: "campus_session=forged-token-value" })).status).toBe(401);
    expect((await call(R.me.GET, { cookie: "campus_session=" + "A".repeat(500) })).data.user).toBeNull();
    const good = await client(EMAILS.maya, true);
    const tampered = good.cookie.slice(0, -3) + (good.cookie.endsWith("aaa") ? "bbb" : "aaa");
    expect((await call(R.me.GET, { cookie: tampered })).data.user).toBeNull();
    expect((await call(R.me.GET, { cookie: good.cookie })).data.user.email).toBe(EMAILS.maya);
  });

  it("sessions expire server-side", async () => {
    const c = await client(EMAILS.priya, true);
    const token = c.cookie.split("=")[1];
    expect(one("select 1 from sessions where id = ?", hashToken(token))).toBeDefined();
    run("update sessions set expires_at = ? where id = ?", Date.now() - 1000, hashToken(token));
    expect((await call(R.me.GET, { cookie: c.cookie })).data.user).toBeNull();
    expect(one("select 1 from sessions where id = ?", hashToken(token))).toBeUndefined(); // expired row is purged
  });

  it("logout invalidates the session on the server (old cookie stops working)", async () => {
    const r = await call(R.login.POST, { body: { email: EMAILS.dev, password: PASSWORD } });
    const cookie = cookieFrom(r.headers);
    expect((await call(R.me.GET, { cookie })).data.user.email).toBe(EMAILS.dev);
    expect((await call(R.logout.POST, { cookie })).status).toBe(200);
    expect((await call(R.me.GET, { cookie })).data.user).toBeNull();
    expect((await call(R.clubs.GET, { cookie })).status).toBe(401);
  });

  it("wrong credentials give a generic 401 and repeated failures are throttled", async () => {
    resetLoginThrottle();
    const wrong = await call(R.login.POST, { body: { email: EMAILS.maya, password: "Wrong-password1" } });
    const unknown = await call(R.login.POST, { body: { email: "nobody@campus.edu", password: "Wrong-password1" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.data.error).toBe(unknown.data.error);
    for (let i = 0; i < 4; i++) await call(R.login.POST, { body: { email: EMAILS.maya, password: "Wrong-password1" } });
    const locked = await call(R.login.POST, { body: { email: EMAILS.maya, password: PASSWORD } });
    expect(locked.status).toBe(429);
    resetLoginThrottle();
    expect((await call(R.login.POST, { body: { email: EMAILS.maya, password: PASSWORD } })).status).toBe(200);
  });

  it("blocks cross-origin state-changing requests (CSRF) but allows same-origin", async () => {
    const c = await client(EMAILS.maya);
    const evil = await call(R.logout.POST, { method: "POST", cookie: c.cookie, headers: { origin: "http://evil.example" } });
    expect(evil.status).toBe(403);
    expect(evil.data.code).toBe("CSRF");
    expect((await call(R.logout.POST, { method: "POST", cookie: c.cookie, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await call(R.me.GET, { cookie: c.cookie, headers: { origin: "http://evil.example" } })).status).toBe(200); // safe method
    const fresh = await client(EMAILS.maya, true);
    expect((await call(R.logout.POST, { method: "POST", cookie: fresh.cookie, headers: { origin: "http://localhost:3000" } })).status).toBe(200);
    await client(EMAILS.maya, true);
  });

  it("the unrestricted demo-switch impersonation endpoint no longer exists", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/auth/demo-switch"))).toBe(false);
  });
});

describe("Google Sign-In (server-side ID token verification)", () => {
  const body = (extra: Record<string, unknown> = {}) => ({ idToken: "header.payload.signature-placeholder", ...extra });
  const profile = (o: Record<string, unknown> = {}) => ({ raNumber: `RA${String(7000 + ++n).padStart(13, "0")}`, department: "IT", academicYear: "2nd Year", mentorId: idOf(EMAILS.wright), ...o });

  it("fails closed when Google is not configured", async () => {
    setGoogleVerifierForTests(null);
    const r = await call(R.google.POST, { body: body() });
    expect(r.status).toBe(503);
    expect(r.data.code).toBe("GOOGLE_NOT_CONFIGURED");
  });

  it("rejects fabricated / malformed tokens through the real verifier", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    const r = await call(R.google.POST, { body: { idToken: "aaaa.bbbb.cccc-fabricated" } });
    delete process.env.GOOGLE_CLIENT_ID;
    expect(r.status).toBe(401);
    expect(r.data.code).toBe("GOOGLE_INVALID_TOKEN");
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("new Google identity needs a full student profile (incl. unique RA) before an account is created", async () => {
    setGoogleVerifierForTests(async () => ({ sub: "google-sub-1", email: "gstudent@college.edu", name: "Gina Google" }));
    const first = await call(R.google.POST, { body: body() });
    expect(first.status).toBe(200);
    expect(first.data.needsProfile).toBe(true);
    expect(first.headers.get("set-cookie")).toBeNull();
    expect(one("select 1 from users where email = ?", "gstudent@college.edu")).toBeUndefined();

    const dupRa = await call(R.google.POST, { body: body({ profile: profile({ raNumber: "RA2311003010045" }) }) });
    expect(dupRa.status).toBe(409);
    expect(dupRa.data.code).toBe("RA_EXISTS");
    expect((await call(R.google.POST, { body: body({ profile: profile({ raNumber: "SHORT" }) }) })).status).toBe(400);

    const created = await call(R.google.POST, { body: body({ profile: profile() }) });
    expect(created.status).toBe(200);
    expect(created.data.user.role).toBe("student");
    const row = one<{ google_sub: string; password_hash: string | null; role: string }>("select google_sub, password_hash, role from users where email = ?", "gstudent@college.edu");
    expect(row).toMatchObject({ google_sub: "google-sub-1", password_hash: null, role: "student" });
    expect(cookieFrom(created.headers)).toContain("campus_session=");
    expect((await call(R.login.POST, { body: { email: "gstudent@college.edu", password: PASSWORD } })).status).toBe(401); // no password login on Google-only accounts

    const again = await call(R.google.POST, { body: body() });
    expect(again.status).toBe(200);
    expect(again.data.user.id).toBe(created.data.user.id);
  });

  it("never auto-links an existing password account (account-takeover protection)", async () => {
    setGoogleVerifierForTests(async () => ({ sub: "google-sub-attacker", email: EMAILS.maya, name: "Maya Patel" }));
    const r = await call(R.google.POST, { body: body({ profile: profile() }) });
    expect(r.status).toBe(409);
    expect(one("select google_sub from users where email = ?", EMAILS.maya)).toEqual({ google_sub: null });
    const staff = await call(R.google.POST, { body: body() });
    expect(staff.status).toBe(409);
  });

  it("deactivated Google accounts cannot sign in", async () => {
    setGoogleVerifierForTests(async () => ({ sub: "google-sub-1", email: "gstudent@college.edu", name: "Gina Google" }));
    run("update users set is_active = 0 where google_sub = 'google-sub-1'");
    expect((await call(R.google.POST, { body: body() })).status).toBe(403);
    run("update users set is_active = 1 where google_sub = 'google-sub-1'");
  });
});
