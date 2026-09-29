import crypto from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import type { NextResponse } from "next/server";
import type { DBLike } from "@/db";
import { users, students, facultyProfiles, sessions, clubMemberships, clubRoles, rolePermissions, clubs } from "@/db/schema";
import type { Role, Permission } from "./constants";

export const SESSION_COOKIE = "campus_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  avatarUrl: string | null;
  studentProfile: {
    raNumber: string;
    department: string;
    academicYear: string;
    mentorId: number;
    mentorName: string;
  } | null;
  facultyProfile: { department: string; designation: string; isMentor: boolean; isCoordinator: boolean } | null;
  clubRoles: { clubId: number; roleId: number; roleName: string; permissions: Permission[] }[];
  managedClubIds: number[];
  coordinatedClubIds: number[];
}

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function loadSessionUser(db: DBLike, userId: number): SessionUser | null {
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (!u || !u.isActive) return null;

  const studentProfile =
    db
      .select({
        raNumber: students.raNumber,
        department: students.department,
        academicYear: students.academicYear,
        mentorId: students.mentorId,
        mentorName: users.fullName,
      })
      .from(students)
      .innerJoin(users, eq(users.id, students.mentorId))
      .where(eq(students.userId, u.id))
      .get() ?? null;

  const fp = db.select().from(facultyProfiles).where(eq(facultyProfiles.userId, u.id)).get();

  const roleRows = db
    .select({ clubId: clubMemberships.clubId, roleId: clubRoles.id, roleName: clubRoles.name })
    .from(clubMemberships)
    .innerJoin(clubRoles, eq(clubRoles.id, clubMemberships.roleId))
    .where(and(eq(clubMemberships.userId, u.id), eq(clubMemberships.status, "active")))
    .all();
  const clubRolesOut = roleRows.map((r) => ({
    ...r,
    permissions: db
      .select({ k: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, r.roleId))
      .all()
      .map((x) => x.k as Permission),
  }));

  const managedClubIds =
    u.role === "club_admin" ? db.select({ id: clubs.id }).from(clubs).where(eq(clubs.clubAdminId, u.id)).all().map((c) => c.id) : [];
  const coordinatedClubIds =
    u.role === "faculty"
      ? db.select({ id: clubs.id }).from(clubs).where(eq(clubs.facultyCoordinatorId, u.id)).all().map((c) => c.id)
      : [];

  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    avatarUrl: u.avatarUrl,
    studentProfile,
    facultyProfile: fp
      ? { department: fp.department, designation: fp.designation, isMentor: fp.isMentor, isCoordinator: fp.isCoordinator }
      : null,
    clubRoles: clubRolesOut,
    managedClubIds,
    coordinatedClubIds,
  };
}

export function createSession(db: DBLike, userId: number, userAgent?: string | null) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.insert(sessions)
    .values({ id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) ?? null })
    .run();
  // opportunistic cleanup of expired rows
  db.delete(sessions).where(lte(sessions.expiresAt, new Date())).run();
  return { token, expiresAt };
}

export function destroySession(db: DBLike, token: string) {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export function destroyUserSessions(db: DBLike, userId: number) {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function getSessionUser(db: DBLike, req: Request): SessionUser | null {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length > 128) return null;
  const row = db.select().from(sessions).where(eq(sessions.id, hashToken(token))).get();
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, row.id)).run();
    return null;
  }
  return loadSessionUser(db, row.userId);
}

export function applySessionCookie(res: NextResponse, token: string, expires: Date) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, secure: cookieSecure(), sameSite: "lax", path: "/", maxAge: 0 });
}
