# Compliance, audit and evidence report

Status legend: **V** = implemented and verified by automated tests - **I** = implemented, only partly verified (see note) - **P** = partial / deliberate deviation - **X** = not implemented.

> **Scope caveat.** The official problem-statement PDF was **not present in the workspace**, so "Section 4 / Section 8.2" of the PDF could not be read. Requirements below come from the team's master prompt (which says the PDF wins on conflict). **Before submission, re-check this matrix and `docs/DEMO_SCRIPT.md` against the PDF, especially the Section 8.2 demonstration order.**

## 1. Phase-1 audit of the baseline (commit `80ff2da`, Next.js + PostgreSQL)

| # | Finding in the baseline | Severity | Resolution |
|---|---|---|---|
| 1 | Session cookie was the plain numeric user id (forgeable -> take over any account) | Critical | Opaque 256-bit tokens, SHA-256 hash stored, expiry, server-side invalidation (`tests/auth.test.ts`) |
| 2 | `/api/auth/demo-switch` let anyone become Super Admin without credentials | Critical | Endpoint deleted; demo accounts now sign in with a password like anyone else |
| 3 | Faculty-approval bypass: `/api/events/:id/status` accepted `"Approved"` and had no transition rules | Critical | Status endpoint only allows Ongoing/Completed/Cancelled; state machine in service **and** DB trigger (`events.test.ts`, `db.test.ts`) |
| 4 | Database was PostgreSQL (brief mandates SQLite) | Critical | Migrated to SQLite + Drizzle migrations, `foreign_keys=ON`, CHECK/UNIQUE/FK/triggers |
| 5 | `/api/run-tests` returned hard-coded booleans (fake "test suite") | Critical (integrity) | Removed; replaced by 154 real tests against isolated SQLite files |
| 6 | No login/registration pages, no Google Sign-In, layout had no navigation and a light body under dark pages | Critical | Login/register/Google/QR-check-in pages, AppShell with role-aware navigation |
| 7 | Registration not atomic, no unique constraint (overbooking + duplicates possible) | High | `BEGIN IMMEDIATE` transaction + UNIQUE index + capacity trigger; concurrency tests |
| 8 | IDORs: any user could mark others' notifications read; registrations list, certificates list, portfolios, analytics, messages by event/club id were not scoped; any authenticated user could create badges; any faculty could award any club's badge | High | Object-level checks everywhere (`authz.test.ts`, `certificates-qr.test.ts`, `notifications-badges-messages.test.ts`) |
| 9 | OD used "the currently active timetable" (not the event date/weekday); OD could be re-decided; approved snapshot unprotected | High | Date/weekday-aware structure selection, final decisions, frozen snapshot + triggers (`timetable-od.test.ts`) |
| 10 | QR tokens from `Math.random()`, stored raw, no event-status check | High | 192-bit CSPRNG token, hash-only storage, expiry, one live code per event, event must be Ongoing |
| 11 | Portfolio "AI" summary trusted browser-supplied achievements and flagged template text `isAiVerified: true` | High | Server reads verified DB records only; output labelled *template-based* (AI optional and labelled) |
| 12 | No input validation, CSRF defence, throttling or password policy | High | Zod on every endpoint, Origin/Sec-Fetch-Site check, login throttle, password policy |
| 13 | Certificates were print-only HTML; dynamic roles were comma-separated strings; messaging had no threads; audit log mutable | Medium | Real PDFs; normalised roles/permissions with scope trigger; participant-only threads; append-only audit trigger |
| 14 | Hard-coded ids in UI forms, `alert()` feedback | Low | Selects fed by the API, toasts + confirmation dialogs |

## 2. Compliance matrix

| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| SQLite3 for all core data, FK enforcement on every connection | `src/db/index.ts`, `drizzle/` | `db.test.ts` (pragma + new connection), health endpoint reports `foreignKeys:true` | V |
| Constraints, indexes, transactions, migrations, seed, ER diagram | `schema.ts`, `0000_init.sql`, `0001_triggers.sql`, `seed.ts`, `docs/ARCHITECTURE.md` | `db.test.ts` (23 tests) | V |
| Persistence across restarts | file-based SQLite | `db.test.ts`, `e2e-workflow.test.ts` (fresh connection) | V |
| Student registration: unique 15-char alphanumeric RA (frontend + backend + DB) | `services/auth.ts`, register page, CHECK + UNIQUE | `auth.test.ts`, `db.test.ts` | V (UI validation not browser-tested) |
| Email/password auth, secure hashing, login/logout, protected routes | bcrypt, opaque sessions, `AppShell` gate | `auth.test.ts` (27 tests) | V |
| Google Sign-In with server-side ID-token verification | `services/google.ts` (`google-auth-library`: signature, audience, issuer, expiry, `email_verified`), `GoogleSignIn.tsx` | fail-closed (503), fabricated token rejected (401), account logic incl. RA uniqueness and no auto-link via a test-only verifier seam | **I** - never exercised with a real Google credential |
| Account creation by admins, activation/deactivation, profile without role change | `services/auth.ts`, `/admin/users` | `auth.test.ts` | V (no profile page in UI - API only) |
| Backend RBAC + object-level checks | `lib/authz.ts` + services | `authz.test.ts` (30 tests) | V |
| Super Admin capabilities incl. overrides, audit log, analytics | services + `/audit` | `authz`, `timetable-od`, `e2e` tests | V |
| Admin: manage clubs/users, monitor, analytics | services | `authz.test.ts` | **P** - "approve or escalate where permitted" not implemented (Admin cannot approve; only Super Admin overrides) |
| Club Admin scoped to own club | `hasClubPermission` | `authz.test.ts` | V |
| Dynamic roles (runtime names + club-scoped permissions, never institutional) | normalised tables, trigger | `authz.test.ts`, `db.test.ts` | V (UI creates roles; editing an existing role's permissions is API-only) |
| Faculty Coordinator vs Class Mentor (one account may hold both) | `canDecideEvent`, `canDecideOd` | seed user `faculty@campus.edu`; `timetable-od.test.ts` | V |
| Club management, archive, membership without duplicates | `services/clubs.ts`, UNIQUE(club,user) | `authz.test.ts`, `db.test.ts` | V (no logo upload; `logoUrl` is API-only) |
| Event lifecycle and valid transitions | `services/events.ts` + trigger | `events.test.ts` (15), `db.test.ts` | V |
| Rejected events show reason and need resubmission; students never see unapproved events | as above | `events.test.ts`, `authz.test.ts` | V |
| Registration: approved only, no duplicates/overbooking, window, atomic capacity | `registerForEvent` | `events.test.ts` (8 students / 3 seats; last seat; double-click), `db.test.ts` (two connections) | V |
| Timetable module (Super Admin only), validation, gap warnings, one active per day, versioning, audit | `services/timetable.ts`, `/timetable` | `timetable-od.test.ts` (24), `authz.test.ts` | V |
| OD: registration-linked, event-date timetable, breaks excluded, Class-Mentor routing, statuses, frozen history | `services/od.ts` | `timetable-od.test.ts` | V |
| Notifications (7 mandatory triggers, read/unread, only after success) | `notify()` inside transactions | `notifications-badges-messages.test.ts` | V (email notifications X - optional) |
| Contextual messaging Faculty<->Faculty / Faculty<->Club Admin with threads and privacy | `services/messages.ts`, `/messages` | `authz.test.ts`, `notifications-badges-messages.test.ts` | V (polling, no WebSocket - optional) |
| Attendance separate from registration; manual + QR | `attendance` table, `markAttendance`, `qr.ts` | `events.test.ts`, `certificates-qr.test.ts` | V |
| Certificates: PDF, unique ID, template, bulk, duplicates, only completed + attended, scoped listing, public verification | `services/certificates.ts`, `pdf.ts` | `certificates-qr.test.ts` (12) + live smoke test (real PDF download) | V |
| Badges: define, award (scoped), auto rules, history, notifications, oversight | `services/badges.ts`, `/badges` | `notifications-badges-messages.test.ts` | V |
| Dashboards (student, club admin, faculty, admin) from real data with Recharts | `services/analytics.ts`, `/` | `authz.test.ts` (scoping), `e2e-workflow.test.ts` (figures) | V for data; charts render-verified only by production build |
| Dynamic QR attendance (time-limited, registration-checked, no impersonation, manual fallback) | `services/qr.ts` | `certificates-qr.test.ts` | V |
| Student portfolio from verified records, PDF, optional AI | `services/portfolio.ts` | `notifications-badges-messages.test.ts` | V for template path; **I** for the optional external-AI path (no key available, untested) |
| Security: hashing, RBAC, validation, ORM queries, safe errors, env secrets, audit | throughout | `auth`, `authz`, `db` tests; live cookie/CSRF smoke test | V; CSP header **X**; CORS = same-origin only (no CORS headers) |
| Responsive, accessible, loading/empty/error states, confirmation dialogs | `components/ui.tsx`, pages | build + lint; labels/roles/aria written in | **I** - not browser- or device-tested, no automated accessibility audit |
| Swagger UI / Postman collection | - | endpoint table in `docs/ARCHITECTURE.md` | **X** |
| README, diagrams, seed, `.env.example`, coverage report, demo script, ZIP script | this repo | - | V (demo video / GitHub / Drive not producible here) |

## 3. Functional coverage (test files -> mandatory scenarios in the brief)

| Brief scenario | Test |
|---|---|
| Invalid / duplicate RA rejected | `auth.test.ts`, `db.test.ts` |
| Student cannot create a Super Admin | `auth.test.ts` (nobody can, via API) |
| Club Admin cannot edit institutional timetable | `authz.test.ts` |
| Unapproved event cannot accept registrations; rejected event needs resubmission | `events.test.ts`, `db.test.ts` |
| Duplicate registration rejected; concurrent registrations cannot exceed capacity | `events.test.ts`, `db.test.ts` |
| OD without registration rejected; routes to assigned mentor; other faculty refused | `timetable-od.test.ts` |
| Overlap maths, breaks excluded, boundaries, weekends, event-date structure selection | `timetable-od.test.ts` |
| Approved OD snapshot unchanged after timetable edit | `timetable-od.test.ts`, `db.test.ts` |
| Certificates need completed event + confirmed attendance | `certificates-qr.test.ts`, `db.test.ts` |
| Dynamic role permissions cannot escape club scope | `authz.test.ts`, `db.test.ts` |
| Notifications for required transitions | `notifications-badges-messages.test.ts` |
| Auth persistence, protected routes, API error handling | `auth.test.ts` |
| Full journey (setup -> approval -> OD -> QR -> certificate -> analytics -> audit) | `e2e-workflow.test.ts` |

## 4. Evidence (this commit)

| Check | Result |
|---|---|
| `npm test` (Vitest) | **154 passed, 0 failed, 0 skipped** in 8 files: auth 27, db 23, authz 30, events 15, timetable-od 24, certificates-qr 12, notifications-badges-messages 14, e2e-workflow 9 |
| `npx next typegen` / `tsc --noEmit` | 0 errors |
| `npm run lint` (ESLint) | 0 errors, 0 warnings |
| `npm run build` | success (68 routes: 49 API handlers, 19 pages) |
| `build_and_start` (production server + `/api/health`) | success; SQLite auto-migrated and seeded |
| Live HTTP smoke test (curl, production server) | login sets `Secure; HttpOnly; SameSite=lax`; student sees only Approved/Ongoing/Completed events; cross-origin POST -> 403; student -> timetable manage 403, audit 403; owner downloads real PDF (`%PDF-`); public verification masks the RA; `/api/auth/demo-switch` -> 404 |
| `npm audit --omit=dev` | **4 advisories (1 critical, 2 high, 1 moderate)** - direct dependency `next` (pinned by the starter) and transitive `sharp`. **Not remediated**: upgrade and re-test before any public deployment. |
| End-to-end test of the *UI* in a browser | **not performed** |

## 5. Known limitations and open issues

1. Official PDF not available (see caveat); Section 8.2 demo order unverified.
2. Google Sign-In: real-token verification is delegated to `google-auth-library` and has not been run with real credentials.
3. No browser/device/accessibility testing of the UI; visual polish is unreviewed. API-level and build-level checks only.
4. No OpenAPI/Swagger or Postman collection.
5. Admin "approve/escalate requests" not implemented; overrides are Super Admin only.
6. No password reset, no e-mail verification at registration (hence no auto-link of Google identities), no e-mail notifications, no WebSockets (polling every 10-15 s).
7. One Club Admin per club (`clubs.club_admin_id`) rather than a separate assignment table (one Club Admin may administer several clubs).
8. UI gaps (API exists): profile page, editing an existing club role's permissions, poster/logo inputs, cancelling a registration.
9. Login throttle is in-memory per process; no CSP header; cookies are `Secure` in production, so plain-http serving needs `COOKIE_SECURE=false`.
10. Event times are naive local times in the server's time zone. A partly overlapped class period counts with its full duration (policy choice, documented).
11. QR check-in needs the event to be *Ongoing*; students scan with their phone camera (URL) or paste the code - there is no in-app camera scanner.
12. `NEXT_PUBLIC_DEMO_MODE` shows the demo password on the login page - disable it (and `AUTO_SEED_DEMO`) for any real deployment.
13. Legacy PostgreSQL rows were only exported (JSON-lines), not imported; they were the original demo seed.
14. `drizzle-kit` mis-generates multi-argument expression indexes; worked around (composite + partial unique indexes).
15. Demo video, public GitHub repository, Google Drive folder and hosted ZIP cannot be produced from this environment; `scripts/make-submission-zip.sh` prepares a clean archive.
