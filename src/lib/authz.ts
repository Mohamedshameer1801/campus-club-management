// Centralised, pure authorization policy. Every API route/service goes through these predicates.
import type { Permission } from "./constants";
import type { SessionUser } from "./session";
import { forbidden } from "./errors";

type U = Pick<SessionUser, "id" | "role" | "managedClubIds" | "clubRoles" | "coordinatedClubIds">;

export const isSuperAdmin = (u: U) => u.role === "super_admin";
export const isInstAdmin = (u: U) => u.role === "super_admin" || u.role === "admin";
export const isClubAdminOf = (u: U, clubId: number) => u.role === "club_admin" && u.managedClubIds.includes(clubId);

/** Club administration (roles, settings, role assignment): the club's Club Admin or an institutional admin. */
export const canManageClub = (u: U, clubId: number) => isInstAdmin(u) || isClubAdminOf(u, clubId);

/**
 * Club-scoped permission. Dynamic roles only ever grant PERMISSIONS for the club they belong to;
 * they never influence institutional checks, which look at `user.role` only.
 */
export function hasClubPermission(u: U, clubId: number, perm: Permission): boolean {
  if (canManageClub(u, clubId)) return true;
  return u.clubRoles.some((r) => r.clubId === clubId && r.permissions.includes(perm));
}

export const isCoordinatorOf = (u: U, coordinatorId: number) => u.role === "faculty" && u.id === coordinatorId;
/** Only the assigned Faculty Coordinator may decide an event; Super Admin may explicitly override. */
export const canDecideEvent = (u: U, ev: { facultyCoordinatorId: number }) => isCoordinatorOf(u, ev.facultyCoordinatorId) || isSuperAdmin(u);
/** Only the student's assigned Class Mentor may decide an OD request; Super Admin may explicitly override. */
export const canDecideOd = (u: U, od: { mentorId: number }) => (u.role === "faculty" && u.id === od.mentorId) || isSuperAdmin(u);
/** True when the decision is an administrative override rather than the ordinary responsible faculty. */
export const isOverrideDecision = (u: U, responsibleId: number) => !(u.role === "faculty" && u.id === responsibleId);

export function requireRole(u: U, ...roles: SessionUser["role"][]) {
  if (!roles.includes(u.role)) throw forbidden();
}
export function requireInstAdmin(u: U) {
  if (!isInstAdmin(u)) throw forbidden("Institutional administrator access required");
}
export function requireSuperAdmin(u: U) {
  if (!isSuperAdmin(u)) throw forbidden("Super Admin access required");
}
export function requireClubPermission(u: U, clubId: number, perm: Permission) {
  if (!hasClubPermission(u, clubId, perm)) throw forbidden(`Missing club permission: ${perm}`);
}
