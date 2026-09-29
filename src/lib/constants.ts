// Shared constants (safe to import from both server and client code).
export const ROLES = ["super_admin", "admin", "club_admin", "faculty", "student"] as const;
export type Role = (typeof ROLES)[number];

export const CLUB_CATEGORIES = ["Technical", "Cultural", "Sports", "Literary", "Social"] as const;

export const PERMISSIONS = [
  "create_events",
  "edit_events",
  "manage_registrations",
  "record_attendance",
  "manage_members",
  "issue_certificates",
  "award_badges",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  create_events: "Create events",
  edit_events: "Edit event details",
  manage_registrations: "Manage registrations",
  record_attendance: "Record attendance",
  manage_members: "Manage club members",
  issue_certificates: "Issue certificates",
  award_badges: "Award badges",
};

export const EVENT_STATUSES = [
  "Draft",
  "Pending Faculty Approval",
  "Approved",
  "Rejected",
  "Ongoing",
  "Completed",
  "Cancelled",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

// Valid lifecycle transitions. Approval/rejection is additionally restricted to the assigned
// Faculty Coordinator (see authz.ts); this map only describes which edges exist.
export const EVENT_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  Draft: ["Pending Faculty Approval", "Cancelled"],
  "Pending Faculty Approval": ["Approved", "Rejected", "Cancelled"],
  Rejected: ["Pending Faculty Approval", "Cancelled"],
  Approved: ["Ongoing", "Completed", "Cancelled"],
  Ongoing: ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
};

export const PERIOD_TYPES = ["Class Period", "Short Break", "Lunch Break"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const OD_STATUSES = ["Pending", "Approved", "Rejected"] as const;
export const PARTICIPATION_ROLES = ["Participant", "Winner", "Runner-up", "Volunteer", "Organizer"] as const;
export const NOTIFICATION_TYPES = ["event", "od", "role", "badge", "attendance", "certificate", "message", "info"] as const;
export const MEMBERSHIP_STATUSES = ["active", "left", "removed"] as const;
export const ATTENDANCE_STATUSES = ["Attended", "Absent"] as const;
export const CHECKIN_METHODS = ["Manual", "QR"] as const;
export const BADGE_RULES = ["first_event", "three_events"] as const;
export const THREAD_CONTEXTS = ["general", "event", "od"] as const;

export const RA_NUMBER_REGEX = /^[A-Z0-9]{15}$/;
