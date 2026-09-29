# Campus Club Management Platform

Digitises college club administration: clubs, dynamic club roles, events with mandatory **Faculty Coordinator approval**, atomic registration, attendance (manual + dynamic **QR**), **On-Duty (OD)** requests routed to the student's **Class Mentor** with timetable-overlap calculation, notifications, contextual messaging, PDF **certificates** with public verification, badges, analytics dashboards and a verified **student portfolio**.

> **Read this first - honest status.** Every claim below is backed by the automated test-suite or by a manual smoke test that is described in [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md), together with what is **not** verified (e.g. Google Sign-In has not been exercised with real Google credentials; the official problem-statement PDF was not available in the workspace, so requirement mapping follows the team's master prompt and must be re-checked against the PDF).

## Stack (and how it maps to the original brief)

| Brief (master prompt) | This repository | Why |
|---|---|---|
| React + Vite, Tailwind, React Router, Axios, Recharts, Lucide | **Next.js 16 (App Router)**, React 19, Tailwind 4, `fetch`, **Recharts**, **Lucide** | The existing project is Next.js; the hardening brief said to retain that architecture. |
| FastAPI + Pydantic | Next.js Route Handlers + **Zod** validation | same layering: routes -> services -> DB |
| SQLAlchemy + Alembic | **Drizzle ORM** + generated SQL migrations in `drizzle/` | |
| **SQLite3** only | **SQLite3** via `better-sqlite3` (WAL, `PRAGMA foreign_keys=ON` on every connection) | mandatory |
| Pytest | **Vitest** (154 tests, real SQLite files) | |
| ReportLab / QR library | **pdf-lib** + `qrcode` | |
| Swagger UI / Postman | *not provided* (endpoint table in `docs/ARCHITECTURE.md`) | listed as a gap |

## Quick start (fresh clone)

```bash
git clone <your-repo-url> campus-club-platform && cd campus-club-platform
cp .env.example .env            # review the values; nothing secret is required to run locally
npm ci
npm run db:reset                # creates ./data/campus.db, applies migrations, seeds DEMO data
npm run dev                     # http://localhost:3000
```

Production build:

```bash
npm run build
COOKIE_SECURE=false npm start   # COOKIE_SECURE=false ONLY when serving plain http (e.g. http://localhost)
```

The app also creates + migrates the database automatically on first request; with `AUTO_SEED_DEMO=true` it seeds demo data when the database is empty.

### Commands

| Command | Purpose |
|---|---|
| `npm test` | 154 automated tests (auth, sessions, RBAC/IDOR, DB constraints, lifecycle, concurrency, timetable, OD, certificates, QR, notifications, messaging, portfolio, end-to-end journey) |
| `npm run typecheck` / `npx tsc --noEmit` | TypeScript |
| `npm run lint` | ESLint (currently 0 errors / 0 warnings) |
| `npm run build` | production build |
| `npm run db:migrate` \| `db:seed` \| `db:reset` | apply migrations / seed demo data / wipe + migrate + seed |
| `npx drizzle-kit generate` | create a new SQL migration after editing `src/db/schema.ts` |

### Environment (`.env.example`)

| Variable | Meaning |
|---|---|
| `DATABASE_PATH` | SQLite file (default `./data/campus.db`) |
| `COOKIE_SECURE` | force `Secure` cookies on/off (default: on in production) |
| `TRUSTED_ORIGINS` | extra origins allowed by the CSRF origin check |
| `BCRYPT_ROUNDS` | password hashing cost (default 10) |
| `APP_URL` | public base URL used inside certificate QR codes |
| `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_ALLOWED_DOMAIN` | Google Sign-In (students). Unset = the endpoint fails closed (503) and the button explains why. |
| `AUTO_SEED_DEMO`, `NEXT_PUBLIC_DEMO_MODE`, `DEMO_PASSWORD` | demo data + the demo-account helper on the login page (turn **off** for real deployments) |
| `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` | optional OpenAI-compatible endpoint for portfolio wording. Unset = deterministic template text, labelled as such. |

## Demo accounts (fictional, seeded, flagged `DEMO` in the UI)

All use the password from `DEMO_PASSWORD` (default `Password123!`). There is **no impersonation switch** - you sign in normally.

| Email | Role | Notes |
|---|---|---|
| `superadmin@campus.edu` | Super Admin | timetable editor, audit log, overrides |
| `admin@campus.edu` | Admin | clubs/users scope, analytics |
| `clubadmin@campus.edu` | Club Admin | Turing (TCC) + Robotics (ROBO) |
| `clubadmin2@campus.edu` | Club Admin | Literary (CLDS) - used to show cross-club isolation |
| `faculty@campus.edu` | Faculty | **Faculty Coordinator (TCC, ROBO) *and* Class Mentor** of Maya and Dev |
| `mentor@campus.edu` | Faculty | Coordinator (CLDS) and Class Mentor of Priya |
| `maya@student.campus.edu` | Student `RA2311003010045` | Turing + Robotics member, has a certificate + badges |
| `dev@student.campus.edu` | Student `RA2311003010088` | Robotics member |
| `priya@student.campus.edu` | Student `RA2311003010102` | holds the dynamic role *Technical Lead & Event Coordinator* in Turing |

Seed data includes an Approved event, a Completed event (with QR attendance, an approved OD and a certificate), a Pending event, a Draft, a Rejected event with a reason, and an **Ongoing** event for the QR demo. Dates are relative to "today" so registration windows stay valid.

### Google Sign-In setup
1. Google Cloud Console -> APIs & Services -> Credentials -> *OAuth client ID* (Web). Add your origin (e.g. `http://localhost:3000`) under *Authorized JavaScript origins*.
2. Put the client id in `GOOGLE_CLIENT_ID` **and** `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; optionally `GOOGLE_ALLOWED_DOMAIN`.
3. The browser obtains an ID token; **the server verifies** signature, audience, issuer, expiry and `email_verified` with `google-auth-library`. A new Google identity must supply a unique 15-character RA Number, department, year and Class Mentor before an account exists. Existing password accounts are **never auto-linked** (account-takeover protection).

## Security model (summary)
* Opaque 256-bit session tokens in `HttpOnly; SameSite=Lax; Secure(prod)` cookies; only the SHA-256 hash is stored; 7-day expiry; logout/deactivation/password-change delete sessions server-side.
* CSRF: SameSite + Origin/`Sec-Fetch-Site` verification on every state-changing request. Login throttling (in-memory).
* All authorisation is server-side in `src/lib/authz.ts` + services; object-level checks (owner / mentor / coordinator / club scope) everywhere; dynamic roles carry only a closed set of club-scoped permissions and can never grant institutional power.
* Zod validation on every input; parameterised queries via Drizzle; no secrets in code.
* Database defence in depth: CHECK/UNIQUE/FK constraints plus triggers that enforce the event state machine, registration capacity, frozen OD snapshots, certificate prerequisites, club-role scope and an append-only audit log.

## Repository map
```
src/db/            schema.ts (SQLite, Drizzle) - index.ts (connection + migrations) - seed.ts
drizzle/           0000_init.sql (generated) - 0001_triggers.sql (guards + reference data)
src/lib/           authz.ts session.ts http.ts constants.ts + services/ (auth clubs events od timetable qr certificates badges messages portfolio analytics pdf)
src/app/api/       thin route handlers (auth, clubs, events, od, timetable, certificates, badges, qr, messages, portfolio, analytics, audit-logs, users, health)
src/app/           pages (login, register, dashboard, events, clubs, approvals, od, timetable, certificates, badges, portfolio, messages, admin/users, audit, checkin, verify-certificate)
tests/             8 Vitest files + helpers (isolated SQLite per file)
docs/              ARCHITECTURE.md (ER + workflows + API) - COMPLIANCE.md (audit, matrix, limitations) - DEMO_SCRIPT.md
scripts/           make-submission-zip.sh - export-legacy-postgres.sh
```

## Documentation
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - layers, ER diagram, permission matrix, event/OD/role/timetable/certificate workflows, API table
* [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) - Phase-1 audit findings, compliance matrix, functional coverage report, test evidence, **known limitations**
* [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) - demo video script

## Submission ZIP
`scripts/make-submission-zip.sh` builds the archive from **committed** files (`git archive`), then fails if it contains `.env`, database files, `node_modules`, the legacy Postgres export or anything that looks like a credential.

## Legacy data note
The project previously ran on PostgreSQL. Before migrating, every legacy table was exported to JSON-lines (`data/legacy-postgres-export/`, git-ignored; re-runnable via `scripts/export-legacy-postgres.sh`). The legacy row counts equalled the original demo seed exactly, i.e. no user-created data existed; there is no automatic PostgreSQL -> SQLite importer.
