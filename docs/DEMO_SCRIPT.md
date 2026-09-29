# Demo video script (target 18-20 minutes, hard limit 25)

> The order below follows the workflow of the brief (setup -> approval -> registration -> OD -> attendance -> certificates -> analytics). **Re-order it to match Section 8.2 of the official PDF, which was not available when this script was written.**

Preparation: `npm run db:reset && npm run dev`, open two browser profiles (or one normal + one private window) so two users can be shown side by side. Password for all demo accounts: `Password123!`.

| Time | Who | Do | Say / show |
|---|---|---|---|
| 0:00 | - | Landing on `/login` | Stack, SQLite, "everything is enforced server-side"; demo accounts are labelled and still require the password - there is no impersonation switch. |
| 1:00 | Super Admin | **Users**: create a faculty and a club admin | Only Super Admin creates Admin/Faculty; Admin creates Club Admins; nobody can create a Super Admin. |
| 2:00 | Super Admin | **Timetable**: open the structure; *Edit* -> make two periods overlap -> live error; create a gap -> warning; save | Only Super Admin edits; duration is computed; only one active structure per day (try activating a second -> replace confirmation). |
| 4:00 | Super Admin | **Audit log** | Every timetable change is logged; the log is append-only (DB trigger). |
| 5:00 | Club Admin (`clubadmin@`) | **Clubs -> Turing**: define role "Volunteer Lead" with 2 permissions; assign it to a member; create an event and *submit* | Dynamic runtime roles, scoped to this club; the student is notified of the role. |
| 7:00 | Faculty (`faculty@`) | **Event approvals**: *Reject* with no reason (blocked), then with a reason | Only the assigned coordinator (or a Super Admin override) can decide; the event is still invisible to students. |
| 8:30 | Club Admin | Open the rejected event: reason visible -> *Edit* -> *Resubmit* | Rejected events need resubmission before publication. |
| 9:30 | Faculty | Approve | History timeline + notification to the club admin. |
| 10:00 | Student (`maya@`) | **Events**: register; show duplicate/full handling | Only approved events; atomic capacity (mention the 8-students-3-seats test). |
| 11:00 | Student | **My OD** -> apply: show affected periods and total minutes, breaks excluded | Timetable is chosen by the *event date*; routed to the assigned **Class Mentor**, not the coordinator. |
| 12:30 | Faculty (Class Mentor) | **OD reviews**: approve with remarks; then try `mentor@` on the same request (403 via API/other account) | Only the assigned mentor; decision is final; snapshot is frozen - edit the timetable and show the OD keeps its periods. |
| 14:00 | Club Admin | Open the seeded **Open Source Sprint (Ongoing)** -> *Generate attendance QR* | Time-limited, single live code, hash-only storage. |
| 14:45 | Student (phone / second window) | Open the QR URL (or `/checkin`, paste the code) | Identity comes from the session; duplicate scan rejected; attendance shows *QR*. Manual fallback button in the roster. |
| 16:00 | Club Admin | Mark an event *Completed*, **Issue to all attendees** | Only completed events + confirmed attendance (try a registered-only student: blocked). |
| 16:45 | Student | **Certificates**: download the PDF, open the public **verify** link | Unique ID, QR, template per club; verification page masks the RA Number. |
| 17:30 | Club Admin / Student | **Badges** (define + award; auto "First Event") -> **Portfolio**: draft summary (labelled template-based), edit, export PDF | Verified data only; nothing typed in by the browser is trusted. |
| 18:30 | Admin / Faculty / Club Admin | **Dashboards** | Real counts, permission-filtered; DEMO badges mark seeded data. |
| 19:15 | Terminal | `npm test` | 154 tests including concurrency, IDOR and DB-constraint suites. State the limitations honestly (Google not exercised with real credentials, UI not browser-tested). |

Checklist before recording: fresh `npm run db:reset`; no real secrets on screen; `.env` closed; browser zoom 110%.
