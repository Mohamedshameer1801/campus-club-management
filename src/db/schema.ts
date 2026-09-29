import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  check,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import {
  ROLES,
  CLUB_CATEGORIES,
  EVENT_STATUSES,
  PERIOD_TYPES,
  OD_STATUSES,
  PARTICIPATION_ROLES,
  NOTIFICATION_TYPES,
  MEMBERSHIP_STATUSES,
  ATTENDANCE_STATUSES,
  CHECKIN_METHODS,
  BADGE_RULES,
  THREAD_CONTEXTS,
} from "@/lib/constants";

const nowMs = sql`(cast(strftime('%s','now') as integer) * 1000)`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs);
const bool = (name: string, def: boolean) => integer(name, { mode: "boolean" }).notNull().default(def);
const inList = (col: AnySQLiteColumn, list: readonly string[]) =>
  sql`${col} in (${sql.raw(list.map((v) => `'${v}'`).join(","))})`;

const DATE_GLOB = "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]";
const TIME_GLOB = "[0-2][0-9]:[0-5][0-9]";

// ---------------------------------------------------------------- identity
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    googleSub: text("google_sub"),
    fullName: text("full_name").notNull(),
    role: text("role", { enum: ROLES }).notNull().default("student"),
    avatarUrl: text("avatar_url"),
    isActive: bool("is_active", true),
    isDemo: bool("is_demo", false),
    createdAt: createdAt(),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_google_sub_uq").on(t.googleSub),
    check("users_role_chk", inList(t.role, ROLES)),
    check("users_email_lower_chk", sql`${t.email} = lower(${t.email})`),
    check("users_name_chk", sql`length(trim(${t.fullName})) > 0`),
    check("users_auth_method_chk", sql`${t.passwordHash} is not null or ${t.googleSub} is not null`),
  ]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // SHA-256 of the opaque cookie token (the raw token is never stored)
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]
);

export const students = sqliteTable(
  "students",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    raNumber: text("ra_number").notNull(),
    department: text("department").notNull(),
    academicYear: text("academic_year").notNull(),
    mentorId: integer("mentor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("students_user_uq").on(t.userId),
    uniqueIndex("students_ra_number_uq").on(t.raNumber),
    index("students_mentor_idx").on(t.mentorId),
    // RA Number: exactly 15 characters, upper-case letters and digits only.
    check("students_ra_number_format_chk", sql`length(${t.raNumber}) = 15 and ${t.raNumber} not glob '*[^A-Z0-9]*'`),
    check("students_dept_chk", sql`length(trim(${t.department})) > 0 and length(trim(${t.academicYear})) > 0`),
  ]
);

export const facultyProfiles = sqliteTable(
  "faculty_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    department: text("department").notNull(),
    designation: text("designation").notNull(),
    isMentor: bool("is_mentor", true),
    isCoordinator: bool("is_coordinator", true),
  },
  (t) => [uniqueIndex("faculty_user_uq").on(t.userId)]
);

// ---------------------------------------------------------------- clubs
export const clubs = sqliteTable(
  "clubs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    category: text("category", { enum: CLUB_CATEGORIES }).notNull(),
    description: text("description").notNull(),
    logoUrl: text("logo_url"),
    clubAdminId: integer("club_admin_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    facultyCoordinatorId: integer("faculty_coordinator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    isArchived: bool("is_archived", false),
    certificateTemplate: text("certificate_template"), // JSON, validated by the API
    isDemo: bool("is_demo", false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("clubs_name_uq").on(sql`lower(${t.name})`),
    uniqueIndex("clubs_code_uq").on(t.code),
    index("clubs_admin_idx").on(t.clubAdminId),
    index("clubs_coordinator_idx").on(t.facultyCoordinatorId),
    check("clubs_category_chk", inList(t.category, CLUB_CATEGORIES)),
  ]
);

export const permissions = sqliteTable("permissions", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

export const clubRoles = sqliteTable(
  "club_roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clubId: integer("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("club_roles_club_name_uq").on(t.clubId, sql`lower(${t.name})`)]
);

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: integer("role_id").notNull().references(() => clubRoles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key").notNull().references(() => permissions.key, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })]
);

export const clubMemberships = sqliteTable(
  "club_memberships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clubId: integer("club_id").notNull().references(() => clubs.id, { onDelete: "restrict" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    roleId: integer("role_id").references(() => clubRoles.id, { onDelete: "set null" }),
    status: text("status", { enum: MEMBERSHIP_STATUSES }).notNull().default("active"),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    uniqueIndex("club_memberships_club_user_uq").on(t.clubId, t.userId), // no duplicate membership rows
    index("club_memberships_user_idx").on(t.userId),
    check("club_memberships_status_chk", inList(t.status, MEMBERSHIP_STATUSES)),
  ]
);

// ---------------------------------------------------------------- events
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clubId: integer("club_id").notNull().references(() => clubs.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    eventDate: text("event_date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    venue: text("venue").notNull(),
    maxCapacity: integer("max_capacity").notNull(),
    posterUrl: text("poster_url"),
    createdById: integer("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    facultyCoordinatorId: integer("faculty_coordinator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: text("status", { enum: EVENT_STATUSES }).notNull().default("Draft"),
    rejectionReason: text("rejection_reason"),
    facultyRemarks: text("faculty_remarks"),
    registrationClosesAt: text("registration_closes_at"), // optional ISO local datetime; default = event start
    isDemo: bool("is_demo", false),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    index("events_club_idx").on(t.clubId),
    index("events_status_idx").on(t.status),
    index("events_date_idx").on(t.eventDate),
    index("events_coordinator_idx").on(t.facultyCoordinatorId),
    check("events_status_chk", inList(t.status, EVENT_STATUSES)),
    check("events_date_chk", sql`${t.eventDate} glob ${sql.raw(`'${DATE_GLOB}'`)}`),
    check("events_time_chk", sql`${t.startTime} glob ${sql.raw(`'${TIME_GLOB}'`)} and ${t.endTime} glob ${sql.raw(`'${TIME_GLOB}'`)} and ${t.endTime} > ${t.startTime}`),
    check("events_capacity_chk", sql`${t.maxCapacity} > 0`),
    check("events_rejection_reason_chk", sql`${t.status} <> 'Rejected' or length(trim(coalesce(${t.rejectionReason}, ''))) > 0`),
  ]
);

export const eventApprovalHistory = sqliteTable(
  "event_approval_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
    actorId: integer("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(), // Submitted | Resubmitted | Approved | Rejected | Status:<new>
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    remarks: text("remarks"),
    isOverride: bool("is_override", false),
    createdAt: createdAt(),
  },
  (t) => [index("event_history_event_idx").on(t.eventId)]
);

export const eventRegistrations = sqliteTable(
  "event_registrations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    registeredAt: integer("registered_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    uniqueIndex("event_registrations_event_user_uq").on(t.eventId, t.userId), // no duplicate registrations
    index("event_registrations_user_idx").on(t.userId),
  ]
);

// Attendance is deliberately a separate table: a registration is never an attendance record.
export const attendance = sqliteTable(
  "attendance",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    registrationId: integer("registration_id").notNull().references(() => eventRegistrations.id, { onDelete: "restrict" }),
    status: text("status", { enum: ATTENDANCE_STATUSES }).notNull(),
    method: text("method", { enum: CHECKIN_METHODS }).notNull(),
    markedBy: integer("marked_by").references(() => users.id, { onDelete: "set null" }),
    markedAt: integer("marked_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    uniqueIndex("attendance_registration_uq").on(t.registrationId),
    check("attendance_status_chk", inList(t.status, ATTENDANCE_STATUSES)),
    check("attendance_method_chk", inList(t.method, CHECKIN_METHODS)),
  ]
);

export const qrTokens = sqliteTable(
  "qr_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(), // SHA-256 of the CSPRNG token
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdBy: integer("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    isActive: bool("is_active", true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("qr_tokens_hash_uq").on(t.tokenHash), index("qr_tokens_event_idx").on(t.eventId)]
);

export const qrCheckins = sqliteTable(
  "qr_checkins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenId: integer("token_id").notNull().references(() => qrTokens.id, { onDelete: "restrict" }),
    registrationId: integer("registration_id").notNull().references(() => eventRegistrations.id, { onDelete: "restrict" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    checkedInAt: integer("checked_in_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [uniqueIndex("qr_checkins_registration_uq").on(t.registrationId)]
);

// ---------------------------------------------------------------- timetable & OD
export const timetableStructures = sqliteTable(
  "timetable_structures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    workingDays: text("working_days").notNull(), // comma separated weekday names
    effectiveFrom: text("effective_from").notNull(),
    isActive: bool("is_active", false),
    version: integer("version").notNull().default(1),
    createdBy: integer("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    check("timetable_effective_chk", sql`${t.effectiveFrom} glob ${sql.raw(`'${DATE_GLOB}'`)}`),
    check("timetable_version_chk", sql`${t.version} >= 1`),
    check("timetable_days_chk", sql`length(trim(${t.workingDays})) > 0`),
  ]
);

export const timetablePeriods = sqliteTable(
  "timetable_periods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    structureId: integer("structure_id").notNull().references(() => timetableStructures.id, { onDelete: "cascade" }),
    periodNumber: integer("period_number").notNull(),
    label: text("label").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    periodType: text("period_type", { enum: PERIOD_TYPES }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
  },
  (t) => [
    uniqueIndex("timetable_periods_number_uq").on(t.structureId, t.periodNumber),
    check("timetable_periods_type_chk", inList(t.periodType, PERIOD_TYPES)),
    check("timetable_periods_time_chk", sql`${t.startTime} glob ${sql.raw(`'${TIME_GLOB}'`)} and ${t.endTime} glob ${sql.raw(`'${TIME_GLOB}'`)} and ${t.endTime} > ${t.startTime}`),
    check("timetable_periods_duration_chk", sql`${t.durationMinutes} > 0`),
  ]
);

export const odRequests = sqliteTable(
  "od_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    registrationId: integer("registration_id").notNull().references(() => eventRegistrations.id, { onDelete: "restrict" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
    mentorId: integer("mentor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: text("status", { enum: OD_STATUSES }).notNull().default("Pending"),
    reason: text("reason").notNull(),
    // Frozen at application time; DB triggers forbid later modification.
    timetableStructureId: integer("timetable_structure_id").notNull().references(() => timetableStructures.id, { onDelete: "restrict" }),
    timetableName: text("timetable_name").notNull(),
    timetableVersion: integer("timetable_version").notNull(),
    affectedPeriodsSnapshot: text("affected_periods_snapshot").notNull(),
    totalAcademicMinutes: integer("total_academic_minutes").notNull(),
    mentorRemarks: text("mentor_remarks"),
    decidedBy: integer("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    isOverride: bool("is_override", false),
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    uniqueIndex("od_requests_registration_uq").on(t.registrationId), // one OD per registration
    index("od_requests_mentor_status_idx").on(t.mentorId, t.status),
    index("od_requests_user_idx").on(t.userId),
    check("od_requests_status_chk", inList(t.status, OD_STATUSES)),
    check("od_requests_minutes_chk", sql`${t.totalAcademicMinutes} > 0`),
  ]
);

export const odApprovalHistory = sqliteTable(
  "od_approval_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    odId: integer("od_id").notNull().references(() => odRequests.id, { onDelete: "restrict" }),
    actorId: integer("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(), // Submitted | Approved | Rejected
    remarks: text("remarks"),
    isOverride: bool("is_override", false),
    createdAt: createdAt(),
  },
  (t) => [index("od_history_od_idx").on(t.odId)]
);

// ---------------------------------------------------------------- certificates & badges
export const certificates = sqliteTable(
  "certificates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    certificateNumber: text("certificate_number").notNull(),
    registrationId: integer("registration_id").notNull().references(() => eventRegistrations.id, { onDelete: "restrict" }),
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    clubId: integer("club_id").notNull().references(() => clubs.id, { onDelete: "restrict" }),
    participationRole: text("participation_role", { enum: PARTICIPATION_ROLES }).notNull().default("Participant"),
    templateSnapshot: text("template_snapshot"),
    issuedBy: integer("issued_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    uniqueIndex("certificates_number_uq").on(t.certificateNumber),
    uniqueIndex("certificates_registration_uq").on(t.registrationId), // no duplicate issuance per participation
    index("certificates_user_idx").on(t.userId),
    index("certificates_club_idx").on(t.clubId),
    check("certificates_role_chk", inList(t.participationRole, PARTICIPATION_ROLES)),
  ]
);

export const badgeDefinitions = sqliteTable(
  "badge_definitions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clubId: integer("club_id").references(() => clubs.id, { onDelete: "restrict" }), // NULL = campus-wide badge
    name: text("name").notNull(),
    description: text("description").notNull(),
    icon: text("icon").notNull().default("Award"),
    criteria: text("criteria").notNull(),
    ruleKey: text("rule_key", { enum: BADGE_RULES }), // verifiable system rule, NULL = manual award
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("badge_definitions_club_name_uq").on(t.clubId, sql`lower(${t.name})`),
    // NULL club ids are distinct in SQLite unique indexes, so campus-wide badges get their own partial unique index.
    uniqueIndex("badge_definitions_global_name_uq").on(sql`lower(${t.name})`).where(sql`${t.clubId} is null`),
    check("badge_rule_chk", sql`${t.ruleKey} is null or ${t.ruleKey} in ('first_event','three_events')`),
  ]
);

export const awardedBadges = sqliteTable(
  "awarded_badges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    badgeId: integer("badge_id").notNull().references(() => badgeDefinitions.id, { onDelete: "restrict" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    awardedBy: integer("awarded_by").references(() => users.id, { onDelete: "set null" }), // NULL = system rule
    reason: text("reason").notNull(),
    awardedAt: integer("awarded_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [uniqueIndex("awarded_badges_badge_user_uq").on(t.badgeId, t.userId), index("awarded_badges_user_idx").on(t.userId)]
);

// ---------------------------------------------------------------- notifications, messaging, audit
export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull().default("info"),
    link: text("link"),
    isRead: bool("is_read", false),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_read_idx").on(t.userId, t.isRead),
    check("notifications_type_chk", inList(t.type, NOTIFICATION_TYPES)),
  ]
);

export const messageThreads = sqliteTable(
  "message_threads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subject: text("subject").notNull(),
    contextType: text("context_type", { enum: THREAD_CONTEXTS }).notNull().default("general"),
    eventId: integer("event_id").references(() => events.id, { onDelete: "restrict" }),
    odRequestId: integer("od_request_id").references(() => odRequests.id, { onDelete: "restrict" }),
    createdBy: integer("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    check("threads_context_chk", inList(t.contextType, THREAD_CONTEXTS)),
    check(
      "threads_context_ref_chk",
      sql`(${t.contextType} = 'general' and ${t.eventId} is null and ${t.odRequestId} is null) or (${t.contextType} = 'event' and ${t.eventId} is not null) or (${t.contextType} = 'od' and ${t.odRequestId} is not null)`
    ),
  ]
);

export const threadParticipants = sqliteTable(
  "thread_participants",
  {
    threadId: integer("thread_id").notNull().references(() => messageThreads.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    lastReadAt: integer("last_read_at", { mode: "timestamp_ms" }),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] }), index("thread_participants_user_idx").on(t.userId)]
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    threadId: integer("thread_id").notNull().references(() => messageThreads.id, { onDelete: "cascade" }),
    senderId: integer("sender_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_thread_idx").on(t.threadId), check("messages_body_chk", sql`length(trim(${t.body})) > 0`)]
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    details: text("details"),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_actor_idx").on(t.actorId)]
);

export type User = typeof users.$inferSelect;
export type Club = typeof clubs.$inferSelect;
export type EventRow = typeof events.$inferSelect;
