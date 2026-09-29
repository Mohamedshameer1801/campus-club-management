# Architecture

## Layers

```
Browser (React pages, Tailwind, Recharts)            src/app/**/page.tsx, src/components
   |  fetch + HttpOnly session cookie
Route handlers (thin)                                src/app/api/**/route.ts   -> route()/publicRoute() wrapper in src/lib/http.ts
   |  1. CSRF origin check  2. session lookup  3. Zod validation  4. call a service  5. map errors (HttpError / Zod / SQLite)
Services (business rules, transactions)              src/lib/services/*.ts     -> authorisation via src/lib/authz.ts
   |  Drizzle ORM (better-sqlite3, synchronous, BEGIN IMMEDIATE for contended writes)
SQLite (WAL, foreign_keys=ON)                        drizzle/0000_init.sql + 0001_triggers.sql
```

Design decisions worth defending:
* **Services own the rules, routes own transport.** Every service takes the `db` handle, so the same code runs in production, seeding and tests.
* **Notifications and audit rows are written inside the same transaction** as the operation they describe: they cannot exist for a failed operation (tested).
* **Registration is atomic**: `BEGIN IMMEDIATE` transaction (status check, window check, duplicate check, capacity count, insert) *plus* a UNIQUE index and a capacity trigger as a database-level backstop. `better-sqlite3` is synchronous, so writers are serialised; two independent connections racing for the last seat are also covered by a test.
* **Defence in depth in the database**: triggers make illegal states unrepresentable even if application code regresses (event transitions, capacity, OD snapshot immutability/final decisions, certificate prerequisites, role scope, append-only audit log).
* **Google identities are never auto-linked to existing password accounts**, because e-mail ownership is not verified at password registration.
* **Time**: event dates/times are naive local values interpreted in the server's time zone.

## ER diagram (SQLite, 27 tables)

```mermaid
erDiagram
  users ||--o| students : "student profile"
  users ||--o| faculty_profiles : "faculty profile"
  users ||--o{ sessions : "opaque, hashed"
  users ||--o{ notifications : receives
  students }o--|| users : "class mentor (mentor_id)"
  users ||--o{ clubs : "club_admin_id"
  users ||--o{ clubs : "faculty_coordinator_id"
  clubs ||--o{ club_roles : "dynamic roles"
  club_roles ||--o{ role_permissions : grants
  permissions ||--o{ role_permissions : "closed set of 7"
  clubs ||--o{ club_memberships : ""
  users ||--o{ club_memberships : ""
  club_roles ||--o{ club_memberships : "role_id (same club only)"
  clubs ||--o{ events : hosts
  events ||--o{ event_approval_history : ""
  events ||--o{ event_registrations : "UNIQUE(event,user)"
  users ||--o{ event_registrations : ""
  event_registrations ||--o| attendance : "separate record"
  events ||--o{ qr_tokens : "hash only"
  qr_tokens ||--o{ qr_checkins : ""
  event_registrations ||--o| qr_checkins : ""
  event_registrations ||--o| od_requests : "one OD per registration"
  timetable_structures ||--o{ timetable_periods : ""
  timetable_structures ||--o{ od_requests : "id + version + frozen JSON snapshot"
  od_requests ||--o{ od_approval_history : ""
  event_registrations ||--o| certificates : "one per participation"
  clubs ||--o{ badge_definitions : "NULL club = campus-wide"
  badge_definitions ||--o{ awarded_badges : "UNIQUE(badge,user)"
  users ||--o{ awarded_badges : ""
  message_threads ||--o{ thread_participants : ""
  message_threads ||--o{ messages : ""
  users ||--o{ audit_logs : "append-only"
```

Key constraints: `students.ra_number` UNIQUE + `CHECK(length=15 AND NOT GLOB '*[^A-Z0-9]*')`; `events` CHECKs for status, date/time format, `end>start`, capacity>0, reason-when-rejected; `timetable_periods` CHECK `end>start`, duration>0, UNIQUE(structure, number); `users.email` lower-case CHECK; every FK is `RESTRICT` for historical data (archive instead of delete), `CASCADE` only for pure child rows (sessions, role permissions, thread participants).

Triggers (`drizzle/0001_triggers.sql`): `trg_registration_guard`, `trg_event_transition`, `trg_od_snapshot_immutable`, `trg_od_decision_final`, `trg_certificate_guard`, `trg_students_roles`, `trg_membership_role_scope_ins/upd`, `trg_audit_no_update/delete`.

## Permission matrix

| Capability | Super Admin | Admin | Club Admin (own club) | Dynamic role (own club, per permission) | Faculty Coordinator (assigned) | Class Mentor (assigned) | Student |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Create Admin / Faculty / Club Admin accounts | yes | Club Admin only | - | - | - | - | - |
| Activate / deactivate users | yes | not Admin/Super | - | - | - | - | - |
| Create / edit / archive clubs, assign staff | yes | yes | edit basics only | - | - | - | - |
| Timetable structures (create/edit/activate/delete) | **yes (only)** | no | no | no | no | no | no |
| Define club roles, assign roles | yes | yes | yes | no (`manage_members` may only remove/reinstate) | - | - | - |
| Create events / edit drafts | yes | yes | yes | `create_events` / `edit_events` | - | - | - |
| Submit event for approval | yes | yes | yes | `create_events` or `edit_events` | - | - | - |
| **Approve / reject event** | override only | no | no | no | **yes** | - | no |
| Start / complete / cancel event | yes | yes | yes | `edit_events` | - | - | - |
| Register for event | - | - | - | student only | - | - | yes (Approved, window open, seat free) |
| View registrations | yes | yes | yes | `manage_registrations` / `record_attendance` | yes | - | - |
| Record attendance, generate QR | yes | yes | yes | `record_attendance` | - | - | (QR check-in for self) |
| Issue certificates | yes | yes | yes | `issue_certificates` | oversight (view) | - | own only |
| Define badges / award badges | yes | yes | yes / yes | `award_badges` (award) | oversight (view) | - | - |
| Apply for OD | - | - | - | - | - | - | yes (needs registration) |
| **Approve / reject OD** | override only | no | no | no | no | **yes (assigned mentor only)** | no |
| Messages | - | - | yes (with faculty) | - | yes | yes | no |
| Audit log | yes | no | no | no | no | no | no |
| Portfolio | any student | any student | - | - | - | assigned mentees | own |

A faculty account can hold both responsibilities simultaneously (seed user `faculty@campus.edu`).

## Workflows

### Event lifecycle
```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> PendingFacultyApproval: submit (club staff)
  PendingFacultyApproval --> Approved: approve (assigned coordinator / SA override)
  PendingFacultyApproval --> Rejected: reject + mandatory reason
  Rejected --> PendingFacultyApproval: resubmit (after optional edit)
  Approved --> Ongoing: start
  Approved --> Completed
  Ongoing --> Completed
  Draft --> Cancelled
  PendingFacultyApproval --> Cancelled
  Rejected --> Cancelled
  Approved --> Cancelled
  Ongoing --> Cancelled
  Completed --> [*]
  Cancelled --> [*]
```
Only *Approved* events accept registrations. Drafts, pending and rejected events are invisible to students. Every transition is enforced twice (service + DB trigger) and recorded in `event_approval_history`.

### OD workflow
```mermaid
flowchart TD
  A[Student registers for an Approved event] --> B[Student selects the registration and applies for OD]
  B --> C{Registration belongs to caller?}
  C -- no --> X1[404 / NOT_REGISTERED]
  C -- yes --> D[Find timetable for the EVENT DATE: active, effective-from <= date, covers weekday]
  D --> E{Class periods overlap?}
  E -- none / non-working day / no timetable --> X2[422 - nothing to excuse]
  E -- yes --> F[Store frozen snapshot: periods, minutes, structure id + version]
  F --> G[Route to the student's assigned Class Mentor + notify]
  G --> H{Mentor decides}
  H -- approve/reject --> I[Status final, history row, student notified, audit]
  H -- other faculty --> X3[403]
  H -- already decided --> X4[409 / trigger OD_DECISION_FINAL]
```
Breaks (short/lunch) are reported as overlapping but never counted as missed academic periods. A partly overlapped class period counts with its full duration.

### Role management
```mermaid
flowchart LR
  CA[Club Admin] -->|create role + choose permissions from the closed list of 7| R[club_roles + role_permissions]
  CA -->|assign to an ACTIVE member of the same club| M[club_memberships.role_id]
  M -->|trigger: role.club_id must equal membership.club_id| OK[role active]
  M --> N[notify the member]
  OK -->|permissions apply only to that club_id| S[hasClubPermission]
  S -.never.-> I[institutional actions check user.role only]
```

### Timetable
```mermaid
flowchart TD
  SA[Super Admin only] --> V[Validate: end>start, no overlap, chronological, unique numbers, valid days/date]
  V -- gaps --> W[warnings returned, save allowed]
  V --> ACT{Activate?}
  ACT -- another active structure shares a day --> CF[409 unless replace confirmed; replaced ones deactivated + audited]
  ACT --> SAVE[version++ and audit log]
  SAVE --> H[Existing OD rows keep their own frozen snapshot; structures referenced by OD cannot be deleted]
```

### Certificates & badges
```mermaid
flowchart TD
  ATT[Attendance confirmed: manual or QR] --> AUTO[Auto badge rules: First Event, Three-Event Streak]
  EV[Event Completed] --> ISS
  ATT --> ISS{Issue certificate}
  ISS -- not completed / no confirmed attendance / duplicate --> REJ[400 / 409, DB trigger backstop]
  ISS --> CERT[unique ID CERT-YYYY-CLUB-XXXXXXXXXX + club template snapshot]
  CERT --> PDF[PDF download: owner, club staff, coordinator, admins]
  CERT --> VER[Public verify page: masked RA, no e-mail/department]
  BADGE[Club Admin defines badge] --> AW[Award to member/attendee] --> NT[notify + audit + awarded_badges history]
```

## API overview

Auth: `POST /api/auth/{login,register,logout,google}`, `GET /api/auth/{me,mentors}`, `PATCH /api/profile`
Users: `GET|POST /api/users`, `PATCH /api/users/:id`
Clubs: `GET|POST /api/clubs`, `GET|PATCH /api/clubs/:id`, `POST /api/clubs/:id/join`, `PATCH /api/clubs/:id/members`, `GET|POST|PATCH /api/clubs/:id/dynamic-roles`, `PUT /api/clubs/:id/certificate-template`
Events: `GET|POST /api/events`, `GET|PATCH /api/events/:id`, `POST /api/events/:id/{submit,approve,status,register,attendance}`, `GET /api/events/:id/{registrations,history}`
QR: `POST /api/qr/generate`, `POST /api/qr/verify-and-checkin`
Timetable: `GET /api/timetable`, `POST|PUT|PATCH|DELETE /api/timetable/manage`
OD: `GET /api/od`, `POST /api/od/{apply,calculate-overlap}`, `POST /api/od/:id/review`
Certificates: `GET|POST /api/certificates`, `POST /api/certificates/bulk-issue`, `GET /api/certificates/:id/pdf`, `GET /api/certificates/verify/:number` (public)
Badges: `GET|POST /api/badges`, `POST /api/badges/award`, `GET /api/badges/awarded`
Messaging: `GET /api/messages/contacts`, `GET|POST /api/messages/threads`, `GET|POST /api/messages/threads/:id`
Other: `GET|PATCH /api/notifications`, `GET /api/portfolio/:userId`, `POST /api/portfolio/{summary,pdf}`, `GET /api/analytics`, `GET /api/audit-logs`, `GET /api/health`

Errors are JSON `{ error, code }` with 400 (validation), 401, 403, 404, 409 (conflict/invalid transition), 422 (nothing to excuse), 429 (throttle).
