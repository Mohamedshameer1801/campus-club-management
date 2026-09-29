-- Reference data: the closed set of club-scoped permissions (dynamic roles can only ever hold these).
INSERT INTO `permissions` (`key`, `description`) VALUES
  ('create_events', 'Create events'),
  ('edit_events', 'Edit event details'),
  ('manage_registrations', 'Manage registrations'),
  ('record_attendance', 'Record attendance'),
  ('manage_members', 'Manage club members'),
  ('issue_certificates', 'Issue certificates'),
  ('award_badges', 'Award badges');
--> statement-breakpoint
-- Registration guard (defence in depth behind the application transaction): only Approved events, never over capacity.
CREATE TRIGGER `trg_registration_guard` BEFORE INSERT ON `event_registrations`
BEGIN
  SELECT RAISE(ABORT, 'EVENT_NOT_OPEN') WHERE (SELECT `status` FROM `events` WHERE `id` = NEW.`event_id`) <> 'Approved';
  SELECT RAISE(ABORT, 'EVENT_FULL') WHERE (SELECT count(*) FROM `event_registrations` WHERE `event_id` = NEW.`event_id`) >= (SELECT `max_capacity` FROM `events` WHERE `id` = NEW.`event_id`);
END;
--> statement-breakpoint
-- Event lifecycle guard: only the edges of the documented state machine are legal.
CREATE TRIGGER `trg_event_transition` BEFORE UPDATE OF `status` ON `events`
WHEN OLD.`status` <> NEW.`status` AND NOT (
  (OLD.`status` = 'Draft' AND NEW.`status` IN ('Pending Faculty Approval', 'Cancelled')) OR
  (OLD.`status` = 'Pending Faculty Approval' AND NEW.`status` IN ('Approved', 'Rejected', 'Cancelled')) OR
  (OLD.`status` = 'Rejected' AND NEW.`status` IN ('Pending Faculty Approval', 'Cancelled')) OR
  (OLD.`status` = 'Approved' AND NEW.`status` IN ('Ongoing', 'Completed', 'Cancelled')) OR
  (OLD.`status` = 'Ongoing' AND NEW.`status` IN ('Completed', 'Cancelled'))
)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_EVENT_TRANSITION');
END;
--> statement-breakpoint
-- OD records: frozen timetable snapshot and final decisions.
CREATE TRIGGER `trg_od_snapshot_immutable` BEFORE UPDATE OF `affected_periods_snapshot`, `total_academic_minutes`, `timetable_structure_id`, `timetable_name`, `timetable_version`, `registration_id`, `user_id`, `event_id`, `mentor_id`, `applied_at` ON `od_requests`
BEGIN
  SELECT RAISE(ABORT, 'OD_SNAPSHOT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_od_decision_final` BEFORE UPDATE OF `status` ON `od_requests`
WHEN OLD.`status` <> 'Pending'
BEGIN
  SELECT RAISE(ABORT, 'OD_DECISION_FINAL');
END;
--> statement-breakpoint
-- Certificates require a Completed event and CONFIRMED attendance for that very registration.
CREATE TRIGGER `trg_certificate_guard` BEFORE INSERT ON `certificates`
BEGIN
  SELECT RAISE(ABORT, 'CERT_EVENT_NOT_COMPLETED') WHERE (SELECT `status` FROM `events` WHERE `id` = NEW.`event_id`) <> 'Completed';
  SELECT RAISE(ABORT, 'CERT_NO_CONFIRMED_ATTENDANCE') WHERE NOT EXISTS (SELECT 1 FROM `attendance` WHERE `registration_id` = NEW.`registration_id` AND `status` = 'Attended');
END;
--> statement-breakpoint
-- Identity rules: students must be student-role users, mentors must be faculty.
CREATE TRIGGER `trg_students_roles` BEFORE INSERT ON `students`
BEGIN
  SELECT RAISE(ABORT, 'STUDENT_ROLE_REQUIRED') WHERE (SELECT `role` FROM `users` WHERE `id` = NEW.`user_id`) <> 'student';
  SELECT RAISE(ABORT, 'MENTOR_MUST_BE_FACULTY') WHERE (SELECT `role` FROM `users` WHERE `id` = NEW.`mentor_id`) <> 'faculty';
END;
--> statement-breakpoint
-- Dynamic club roles are scoped to their own club.
CREATE TRIGGER `trg_membership_role_scope_ins` BEFORE INSERT ON `club_memberships`
WHEN NEW.`role_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'ROLE_OUT_OF_CLUB_SCOPE') WHERE (SELECT `club_id` FROM `club_roles` WHERE `id` = NEW.`role_id`) <> NEW.`club_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `trg_membership_role_scope_upd` BEFORE UPDATE OF `role_id`, `club_id` ON `club_memberships`
WHEN NEW.`role_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'ROLE_OUT_OF_CLUB_SCOPE') WHERE (SELECT `club_id` FROM `club_roles` WHERE `id` = NEW.`role_id`) <> NEW.`club_id`;
END;
--> statement-breakpoint
-- Audit log is append-only.
CREATE TRIGGER `trg_audit_no_update` BEFORE UPDATE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_audit_no_delete` BEFORE DELETE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE');
END;
