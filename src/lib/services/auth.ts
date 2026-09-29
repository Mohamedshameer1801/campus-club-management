import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DB, DBLike } from "@/db";
import { users, students, facultyProfiles } from "@/db/schema";
import { HttpError, badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { RA_NUMBER_REGEX, ROLES, type Role } from "@/lib/constants";
import { createSession, loadSessionUser, destroyUserSessions, type SessionUser } from "@/lib/session";
import { isSuperAdmin, requireInstAdmin } from "@/lib/authz";
import { audit, notify } from "./common";
import { verifyGoogleIdToken } from "./google";

export const bcryptRounds = () => Math.max(4, Number(process.env.BCRYPT_ROUNDS ?? 10));

export function normalizeRaNumber(raw: string): string {
  const ra = raw.trim().toUpperCase();
  if (!RA_NUMBER_REGEX.test(ra)) throw badRequest("RA Number must be exactly 15 alphanumeric characters (A-Z, 0-9)", "INVALID_RA_NUMBER");
  return ra;
}

export function validatePassword(pw: string) {
  if (pw.length < 8 || pw.length > 72) throw badRequest("Password must be 8-72 characters", "WEAK_PASSWORD");
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw badRequest("Password must contain both letters and digits", "WEAK_PASSWORD");
}

export const studentProfileSchema = z.object({
  raNumber: z.string().trim().min(1, "RA Number is required"),
  department: z.string().trim().min(2).max(100),
  academicYear: z.string().trim().min(1).max(30),
  mentorId: z.coerce.number().int().positive(),
});
export type StudentProfileInput = z.infer<typeof studentProfileSchema>;

// ---- brute-force throttle (in-memory, per process: documented limitation)
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
export function resetLoginThrottle() {
  attempts.clear();
}
function checkThrottle(key: string) {
  const a = attempts.get(key);
  if (!a) return;
  if (Date.now() - a.first >= WINDOW_MS) attempts.delete(key);
  else if (a.count >= MAX_FAILS) throw new HttpError(429, "Too many failed attempts. Please try again later.", "RATE_LIMITED");
}
function recordFailure(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first >= WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() });
  else a.count++;
}

let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password-1", bcryptRounds()));

function assertMentor(db: DBLike, mentorId: number) {
  const m = db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, mentorId)).get();
  if (!m || m.role !== "faculty" || !m.isActive) throw badRequest("Class Mentor must be an active faculty member", "INVALID_MENTOR");
  const fp = db.select().from(facultyProfiles).where(eq(facultyProfiles.userId, mentorId)).get();
  if (fp && !fp.isMentor) throw badRequest("Selected faculty member is not a Class Mentor", "INVALID_MENTOR");
}

function createStudentTx(
  db: DB,
  input: { email: string; fullName: string; passwordHash: string | null; googleSub: string | null; profile: StudentProfileInput; method: string }
): number {
  const ra = normalizeRaNumber(input.profile.raNumber);
  return db.transaction((tx) => {
    if (tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get())
      throw conflict("An account with this email address already exists", "EMAIL_EXISTS");
    if (tx.select({ id: students.id }).from(students).where(eq(students.raNumber, ra)).get())
      throw conflict(`RA Number ${ra} is already registered`, "RA_EXISTS");
    assertMentor(tx, input.profile.mentorId);
    // The role is ALWAYS "student" here; nothing from the request can influence it.
    const u = tx
      .insert(users)
      .values({ email: input.email, passwordHash: input.passwordHash, googleSub: input.googleSub, fullName: input.fullName.trim(), role: "student" })
      .returning()
      .get();
    tx.insert(students)
      .values({ userId: u.id, raNumber: ra, department: input.profile.department, academicYear: input.profile.academicYear, mentorId: input.profile.mentorId })
      .run();
    notify(tx, u.id, {
      title: "Welcome to Campus Hub",
      message: `Your student profile (RA ${ra}) is ready. Browse clubs and events to get started.`,
      type: "info",
      link: "/clubs",
    });
    notify(tx, input.profile.mentorId, {
      title: "New mentee registered",
      message: `${input.fullName.trim()} (${ra}) selected you as Class Mentor.`,
      type: "info",
      link: "/od",
    });
    audit(tx, u.id, "REGISTER_STUDENT", "users", u.id, `method=${input.method}`);
    return u.id;
  });
}

export async function registerStudent(
  db: DB,
  input: { email: string; password: string; fullName: string; profile: StudentProfileInput },
  userAgent?: string | null
) {
  validatePassword(input.password);
  const passwordHash = await bcrypt.hash(input.password, bcryptRounds());
  const id = createStudentTx(db, {
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName,
    passwordHash,
    googleSub: null,
    profile: input.profile,
    method: "password",
  });
  const session = createSession(db, id, userAgent);
  return { user: loadSessionUser(db, id) as SessionUser, ...session };
}

export async function loginWithPassword(db: DB, email: string, password: string, ip: string, userAgent?: string | null) {
  const e = email.trim().toLowerCase();
  const key = `${ip}|${e}`;
  checkThrottle(key);
  const u = db.select().from(users).where(eq(users.email, e)).get();
  const ok = await bcrypt.compare(password, u?.passwordHash ?? getDummyHash());
  if (!u || !u.passwordHash || !ok) {
    recordFailure(key);
    throw new HttpError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }
  if (!u.isActive) throw new HttpError(403, "This account has been deactivated. Contact the campus administrator.", "ACCOUNT_DISABLED");
  attempts.delete(key);
  const session = db.transaction((tx) => {
    tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id)).run();
    return createSession(tx, u.id, userAgent);
  });
  return { user: loadSessionUser(db, u.id) as SessionUser, ...session };
}

export type GoogleLoginResult =
  | { needsProfile: true; email: string; fullName: string }
  | { needsProfile: false; user: SessionUser; token: string; expiresAt: Date };

export async function loginWithGoogle(db: DB, idToken: string, profile: StudentProfileInput | undefined, userAgent?: string | null): Promise<GoogleLoginResult> {
  const claims = await verifyGoogleIdToken(idToken);
  let user = db.select().from(users).where(eq(users.googleSub, claims.sub)).get();
  if (!user) {
    if (db.select({ id: users.id }).from(users).where(eq(users.email, claims.email)).get())
      // Deliberately NOT auto-linked: e-mail ownership is not verified at password registration, so linking
      // would let someone who pre-registered a victim's address take over the victim's Google login.
      throw conflict("An account with this email already exists. Sign in with your password instead.", "EMAIL_EXISTS");
    if (!profile) return { needsProfile: true, email: claims.email, fullName: claims.name };
    const id = createStudentTx(db, { email: claims.email, fullName: claims.name, passwordHash: null, googleSub: claims.sub, profile, method: "google" });
    user = db.select().from(users).where(eq(users.id, id)).get();
  }
  if (!user) throw notFound();
  if (!user.isActive) throw new HttpError(403, "This account has been deactivated", "ACCOUNT_DISABLED");
  const uid = user.id;
  const session = db.transaction((tx) => {
    tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, uid)).run();
    return createSession(tx, uid, userAgent);
  });
  return { needsProfile: false, user: loadSessionUser(db, uid) as SessionUser, ...session };
}

// ------------------------------------------------------------------ administration
export const createAccountSchema = z
  .object({
    email: z.string().trim().email().max(200),
    fullName: z.string().trim().min(2).max(120),
    password: z.string().min(8).max(72),
    role: z.enum(ROLES),
    department: z.string().trim().min(2).max(100).optional(),
    designation: z.string().trim().min(2).max(100).optional(),
    isMentor: z.boolean().optional(),
    isCoordinator: z.boolean().optional(),
  })
  .strict();

const CREATABLE: Record<string, Role[]> = { super_admin: ["admin", "faculty", "club_admin"], admin: ["club_admin"] };

export async function createAccount(db: DB, actor: SessionUser, input: z.infer<typeof createAccountSchema>, ip?: string) {
  requireInstAdmin(actor);
  if (!(CREATABLE[actor.role] ?? []).includes(input.role))
    throw forbidden(`Your role cannot create ${input.role} accounts`);
  validatePassword(input.password);
  if (input.role === "faculty" && (!input.department || !input.designation))
    throw badRequest("Faculty accounts require department and designation");
  const hash = await bcrypt.hash(input.password, bcryptRounds());
  return db.transaction((tx) => {
    const email = input.email.toLowerCase();
    if (tx.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) throw conflict("An account with this email already exists", "EMAIL_EXISTS");
    const u = tx.insert(users).values({ email, passwordHash: hash, fullName: input.fullName, role: input.role }).returning().get();
    if (input.role === "faculty")
      tx.insert(facultyProfiles)
        .values({ userId: u.id, department: input.department as string, designation: input.designation as string, isMentor: input.isMentor ?? true, isCoordinator: input.isCoordinator ?? true })
        .run();
    audit(tx, actor.id, "CREATE_ACCOUNT", "users", u.id, `role=${input.role} email=${email}`, ip);
    return { id: u.id, email: u.email, fullName: u.fullName, role: u.role, isActive: u.isActive };
  });
}

export function listUsers(db: DB, actor: SessionUser, roles?: Role[]) {
  requireInstAdmin(actor);
  const rows = db
    .select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role, isActive: users.isActive, isDemo: users.isDemo, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(roles && roles.length ? inArray(users.role, roles) : undefined)
    .all();
  return rows;
}

export function listMentors(db: DB) {
  return db
    .select({ id: users.id, fullName: users.fullName, department: facultyProfiles.department, designation: facultyProfiles.designation })
    .from(users)
    .innerJoin(facultyProfiles, eq(facultyProfiles.userId, users.id))
    .where(and(eq(users.role, "faculty"), eq(users.isActive, true), eq(facultyProfiles.isMentor, true)))
    .all();
}

export function setUserActive(db: DB, actor: SessionUser, targetId: number, active: boolean, ip?: string) {
  requireInstAdmin(actor);
  const target = db.select().from(users).where(eq(users.id, targetId)).get();
  if (!target) throw notFound("User not found");
  if (target.id === actor.id) throw badRequest("You cannot change your own activation status");
  if (target.role === "super_admin") throw forbidden("Super Admin accounts cannot be deactivated through the API");
  if (target.role === "admin" && !isSuperAdmin(actor)) throw forbidden("Only Super Admin can manage Admin accounts");
  db.transaction((tx) => {
    tx.update(users).set({ isActive: active }).where(eq(users.id, targetId)).run();
    if (!active) destroyUserSessions(tx, targetId);
    audit(tx, actor.id, active ? "ACTIVATE_ACCOUNT" : "DEACTIVATE_ACCOUNT", "users", targetId, target.email, ip);
  });
  return { id: targetId, isActive: active };
}

export const profileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    avatarUrl: z.string().url().max(500).nullable().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
  })
  .strict(); // any attempt to send `role` etc. is rejected

/** Ordinary profile endpoint: can never change role, email, RA number or mentor. */
export async function updateProfile(db: DB, user: SessionUser, input: z.infer<typeof profileUpdateSchema>) {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.fullName) patch.fullName = input.fullName;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
  if (input.newPassword) {
    const row = db.select().from(users).where(eq(users.id, user.id)).get();
    if (!row?.passwordHash || !input.currentPassword || !(await bcrypt.compare(input.currentPassword, row.passwordHash)))
      throw forbidden("Current password is incorrect");
    validatePassword(input.newPassword);
    patch.passwordHash = await bcrypt.hash(input.newPassword, bcryptRounds());
  }
  if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");
  db.transaction((tx) => {
    tx.update(users).set(patch).where(eq(users.id, user.id)).run();
    if (patch.passwordHash) destroyUserSessions(tx, user.id); // force re-login everywhere
    audit(tx, user.id, "UPDATE_PROFILE", "users", user.id, Object.keys(patch).filter((k) => k !== "passwordHash").join(",") + (patch.passwordHash ? ",password" : ""));
  });
  return { user: loadSessionUser(db, user.id), passwordChanged: Boolean(patch.passwordHash) };
}
