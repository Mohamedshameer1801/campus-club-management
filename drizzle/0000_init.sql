CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`registration_id` integer NOT NULL,
	`status` text NOT NULL,
	`method` text NOT NULL,
	`marked_by` integer,
	`marked_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`registration_id`) REFERENCES `event_registrations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "attendance_status_chk" CHECK("attendance"."status" in ('Attended','Absent')),
	CONSTRAINT "attendance_method_chk" CHECK("attendance"."method" in ('Manual','QR'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_registration_uq` ON `attendance` (`registration_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`details` text,
	`ip_address` text,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE TABLE `awarded_badges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`badge_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`awarded_by` integer,
	`reason` text NOT NULL,
	`awarded_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`badge_id`) REFERENCES `badge_definitions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`awarded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `awarded_badges_badge_user_uq` ON `awarded_badges` (`badge_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `awarded_badges_user_idx` ON `awarded_badges` (`user_id`);--> statement-breakpoint
CREATE TABLE `badge_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`club_id` integer,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`icon` text DEFAULT 'Award' NOT NULL,
	`criteria` text NOT NULL,
	`rule_key` text,
	`created_by` integer,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "badge_rule_chk" CHECK("badge_definitions"."rule_key" is null or "badge_definitions"."rule_key" in ('first_event','three_events'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `badge_definitions_club_name_uq` ON `badge_definitions` (`club_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `badge_definitions_global_name_uq` ON `badge_definitions` (lower("name")) WHERE "badge_definitions"."club_id" is null;--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`certificate_number` text NOT NULL,
	`registration_id` integer NOT NULL,
	`event_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`club_id` integer NOT NULL,
	`participation_role` text DEFAULT 'Participant' NOT NULL,
	`template_snapshot` text,
	`issued_by` integer NOT NULL,
	`issued_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`registration_id`) REFERENCES `event_registrations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "certificates_role_chk" CHECK("certificates"."participation_role" in ('Participant','Winner','Runner-up','Volunteer','Organizer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_number_uq` ON `certificates` (`certificate_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_registration_uq` ON `certificates` (`registration_id`);--> statement-breakpoint
CREATE INDEX `certificates_user_idx` ON `certificates` (`user_id`);--> statement-breakpoint
CREATE INDEX `certificates_club_idx` ON `certificates` (`club_id`);--> statement-breakpoint
CREATE TABLE `club_memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`club_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`role_id`) REFERENCES `club_roles`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "club_memberships_status_chk" CHECK("club_memberships"."status" in ('active','left','removed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `club_memberships_club_user_uq` ON `club_memberships` (`club_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `club_memberships_user_idx` ON `club_memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `club_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`club_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `club_roles_club_name_uq` ON `club_roles` (`club_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `clubs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`logo_url` text,
	`club_admin_id` integer NOT NULL,
	`faculty_coordinator_id` integer NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`certificate_template` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`club_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`faculty_coordinator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "clubs_category_chk" CHECK("clubs"."category" in ('Technical','Cultural','Sports','Literary','Social'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clubs_name_uq` ON `clubs` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `clubs_code_uq` ON `clubs` (`code`);--> statement-breakpoint
CREATE INDEX `clubs_admin_idx` ON `clubs` (`club_admin_id`);--> statement-breakpoint
CREATE INDEX `clubs_coordinator_idx` ON `clubs` (`faculty_coordinator_id`);--> statement-breakpoint
CREATE TABLE `event_approval_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`actor_id` integer NOT NULL,
	`action` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`remarks` text,
	`is_override` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `event_history_event_idx` ON `event_approval_history` (`event_id`);--> statement-breakpoint
CREATE TABLE `event_registrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`registered_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_registrations_event_user_uq` ON `event_registrations` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `event_registrations_user_idx` ON `event_registrations` (`user_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`club_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`event_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`venue` text NOT NULL,
	`max_capacity` integer NOT NULL,
	`poster_url` text,
	`created_by_id` integer NOT NULL,
	`faculty_coordinator_id` integer NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`rejection_reason` text,
	`faculty_remarks` text,
	`registration_closes_at` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`faculty_coordinator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "events_status_chk" CHECK("events"."status" in ('Draft','Pending Faculty Approval','Approved','Rejected','Ongoing','Completed','Cancelled')),
	CONSTRAINT "events_date_chk" CHECK("events"."event_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "events_time_chk" CHECK("events"."start_time" glob '[0-2][0-9]:[0-5][0-9]' and "events"."end_time" glob '[0-2][0-9]:[0-5][0-9]' and "events"."end_time" > "events"."start_time"),
	CONSTRAINT "events_capacity_chk" CHECK("events"."max_capacity" > 0),
	CONSTRAINT "events_rejection_reason_chk" CHECK("events"."status" <> 'Rejected' or length(trim(coalesce("events"."rejection_reason", ''))) > 0)
);
--> statement-breakpoint
CREATE INDEX `events_club_idx` ON `events` (`club_id`);--> statement-breakpoint
CREATE INDEX `events_status_idx` ON `events` (`status`);--> statement-breakpoint
CREATE INDEX `events_date_idx` ON `events` (`event_date`);--> statement-breakpoint
CREATE INDEX `events_coordinator_idx` ON `events` (`faculty_coordinator_id`);--> statement-breakpoint
CREATE TABLE `faculty_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`department` text NOT NULL,
	`designation` text NOT NULL,
	`is_mentor` integer DEFAULT true NOT NULL,
	`is_coordinator` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `faculty_user_uq` ON `faculty_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `message_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject` text NOT NULL,
	`context_type` text DEFAULT 'general' NOT NULL,
	`event_id` integer,
	`od_request_id` integer,
	`created_by` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`od_request_id`) REFERENCES `od_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "threads_context_chk" CHECK("message_threads"."context_type" in ('general','event','od')),
	CONSTRAINT "threads_context_ref_chk" CHECK(("message_threads"."context_type" = 'general' and "message_threads"."event_id" is null and "message_threads"."od_request_id" is null) or ("message_threads"."context_type" = 'event' and "message_threads"."event_id" is not null) or ("message_threads"."context_type" = 'od' and "message_threads"."od_request_id" is not null))
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`sender_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `message_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "messages_body_chk" CHECK(length(trim("messages"."body")) > 0)
);
--> statement-breakpoint
CREATE INDEX `messages_thread_idx` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`type` text DEFAULT 'info' NOT NULL,
	`link` text,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notifications_type_chk" CHECK("notifications"."type" in ('event','od','role','badge','attendance','certificate','message','info'))
);
--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`is_read`);--> statement-breakpoint
CREATE TABLE `od_approval_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`od_id` integer NOT NULL,
	`actor_id` integer NOT NULL,
	`action` text NOT NULL,
	`remarks` text,
	`is_override` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`od_id`) REFERENCES `od_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `od_history_od_idx` ON `od_approval_history` (`od_id`);--> statement-breakpoint
CREATE TABLE `od_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`registration_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`event_id` integer NOT NULL,
	`mentor_id` integer NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`reason` text NOT NULL,
	`timetable_structure_id` integer NOT NULL,
	`timetable_name` text NOT NULL,
	`timetable_version` integer NOT NULL,
	`affected_periods_snapshot` text NOT NULL,
	`total_academic_minutes` integer NOT NULL,
	`mentor_remarks` text,
	`decided_by` integer,
	`decided_at` integer,
	`is_override` integer DEFAULT false NOT NULL,
	`applied_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`registration_id`) REFERENCES `event_registrations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`mentor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`timetable_structure_id`) REFERENCES `timetable_structures`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "od_requests_status_chk" CHECK("od_requests"."status" in ('Pending','Approved','Rejected')),
	CONSTRAINT "od_requests_minutes_chk" CHECK("od_requests"."total_academic_minutes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `od_requests_registration_uq` ON `od_requests` (`registration_id`);--> statement-breakpoint
CREATE INDEX `od_requests_mentor_status_idx` ON `od_requests` (`mentor_id`,`status`);--> statement-breakpoint
CREATE INDEX `od_requests_user_idx` ON `od_requests` (`user_id`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`key` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qr_checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_id` integer NOT NULL,
	`registration_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`checked_in_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`token_id`) REFERENCES `qr_tokens`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registration_id`) REFERENCES `event_registrations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qr_checkins_registration_uq` ON `qr_checkins` (`registration_id`);--> statement-breakpoint
CREATE TABLE `qr_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qr_tokens_hash_uq` ON `qr_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `qr_tokens_event_idx` ON `qr_tokens` (`event_id`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` integer NOT NULL,
	`permission_key` text NOT NULL,
	PRIMARY KEY(`role_id`, `permission_key`),
	FOREIGN KEY (`role_id`) REFERENCES `club_roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_key`) REFERENCES `permissions`(`key`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`ra_number` text NOT NULL,
	`department` text NOT NULL,
	`academic_year` text NOT NULL,
	`mentor_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`mentor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "students_ra_number_format_chk" CHECK(length("students"."ra_number") = 15 and "students"."ra_number" not glob '*[^A-Z0-9]*'),
	CONSTRAINT "students_dept_chk" CHECK(length(trim("students"."department")) > 0 and length(trim("students"."academic_year")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_user_uq` ON `students` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_ra_number_uq` ON `students` (`ra_number`);--> statement-breakpoint
CREATE INDEX `students_mentor_idx` ON `students` (`mentor_id`);--> statement-breakpoint
CREATE TABLE `thread_participants` (
	`thread_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`last_read_at` integer,
	PRIMARY KEY(`thread_id`, `user_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `message_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `thread_participants_user_idx` ON `thread_participants` (`user_id`);--> statement-breakpoint
CREATE TABLE `timetable_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`structure_id` integer NOT NULL,
	`period_number` integer NOT NULL,
	`label` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`period_type` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	FOREIGN KEY (`structure_id`) REFERENCES `timetable_structures`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "timetable_periods_type_chk" CHECK("timetable_periods"."period_type" in ('Class Period','Short Break','Lunch Break')),
	CONSTRAINT "timetable_periods_time_chk" CHECK("timetable_periods"."start_time" glob '[0-2][0-9]:[0-5][0-9]' and "timetable_periods"."end_time" glob '[0-2][0-9]:[0-5][0-9]' and "timetable_periods"."end_time" > "timetable_periods"."start_time"),
	CONSTRAINT "timetable_periods_duration_chk" CHECK("timetable_periods"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timetable_periods_number_uq` ON `timetable_periods` (`structure_id`,`period_number`);--> statement-breakpoint
CREATE TABLE `timetable_structures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`working_days` text NOT NULL,
	`effective_from` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "timetable_effective_chk" CHECK("timetable_structures"."effective_from" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "timetable_version_chk" CHECK("timetable_structures"."version" >= 1),
	CONSTRAINT "timetable_days_chk" CHECK(length(trim("timetable_structures"."working_days")) > 0)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`google_sub` text,
	`full_name` text NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`avatar_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`last_login_at` integer,
	CONSTRAINT "users_role_chk" CHECK("users"."role" in ('super_admin','admin','club_admin','faculty','student')),
	CONSTRAINT "users_email_lower_chk" CHECK("users"."email" = lower("users"."email")),
	CONSTRAINT "users_name_chk" CHECK(length(trim("users"."full_name")) > 0),
	CONSTRAINT "users_auth_method_chk" CHECK("users"."password_hash" is not null or "users"."google_sub" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_uq` ON `users` (`google_sub`);