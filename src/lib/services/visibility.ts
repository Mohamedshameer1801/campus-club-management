import type { SessionUser } from "@/lib/session";
import { hasClubPermission, isInstAdmin } from "@/lib/authz";

export interface EventVisibilityInput {
  status: string;
  clubId: number;
  createdById: number;
  facultyCoordinatorId: number;
}

/**
 * Students (and everybody else) must never see an unapproved event. Draft/Pending/Rejected events are only visible to
 * institutional admins, the owning club's managers, the event creator and the assigned Faculty Coordinator (post-submission).
 */
export function canSeeEvent(u: SessionUser, ev: EventVisibilityInput, hasRegistration: boolean): boolean {
  if (isInstAdmin(u)) return true;
  if (ev.status === "Approved" || ev.status === "Ongoing" || ev.status === "Completed") return true;
  const clubManager = hasClubPermission(u, ev.clubId, "create_events") || hasClubPermission(u, ev.clubId, "edit_events");
  if (ev.status === "Cancelled") return hasRegistration || clubManager || (u.role === "faculty" && u.id === ev.facultyCoordinatorId);
  if (clubManager || ev.createdById === u.id) return true;
  return u.role === "faculty" && u.id === ev.facultyCoordinatorId && ev.status !== "Draft";
}
