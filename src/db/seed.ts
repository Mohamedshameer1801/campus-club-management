import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { DB } from "./index";
import {
  users, students, facultyProfiles, clubs, clubRoles, rolePermissions, clubMemberships, timetableStructures, timetablePeriods, events, eventApprovalHistory,
  eventRegistrations, attendance, odRequests, odApprovalHistory, certificates, badgeDefinitions, awardedBadges, messageThreads, threadParticipants, messages,
} from "./schema";
import { audit, localDate, notify } from "@/lib/services/common";
import { calculateOverlap } from "@/lib/services/timetable";

function shift(days: number, direction: 1 | -1 = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + direction);
  return localDate(d);
}

/**
 * Reproducible DEMO data. Every user/club/event created here carries is_demo = 1 so it is always distinguishable
 * from real records. Refuses to run on a non-empty database.
 */
export function seedDatabase(db: DB): { seeded: boolean; message: string } {
  if (db.select({ id: users.id }).from(users).limit(1).get()) return { seeded: false, message: "Database already contains data - seed skipped" };
  const password = process.env.DEMO_PASSWORD || "Password123!";
  const hash = bcrypt.hashSync(password, Math.max(4, Number(process.env.BCRYPT_ROUNDS ?? 10)));

  db.transaction((tx) => {
    const mk = (email: string, fullName: string, role: "super_admin" | "admin" | "club_admin" | "faculty" | "student") =>
      tx.insert(users).values({ email, passwordHash: hash, fullName, role, isDemo: true }).returning().get();
    const superAdmin = mk("superadmin@campus.edu", "Dr. Robert Vance (Super Admin)", "super_admin");
    const admin = mk("admin@campus.edu", "Dean Sarah Jenkins (Admin)", "admin");
    const alex = mk("clubadmin@campus.edu", "Alex Rivera (Club Admin)", "club_admin");
    const jordan = mk("clubadmin2@campus.edu", "Jordan Blake (Club Admin)", "club_admin");
    const thorne = mk("faculty@campus.edu", "Prof. Alan Thorne (Coordinator + Mentor)", "faculty");
    const wright = mk("mentor@campus.edu", "Prof. Eleanor Wright (Mentor + Coordinator)", "faculty");
    const maya = mk("maya@student.campus.edu", "Maya Patel", "student");
    const dev = mk("dev@student.campus.edu", "Dev Sharma", "student");
    const priya = mk("priya@student.campus.edu", "Priya Nair", "student");
    void admin;

    tx.insert(facultyProfiles).values([
      { userId: thorne.id, department: "Computer Science & Engineering", designation: "Associate Professor", isMentor: true, isCoordinator: true },
      { userId: wright.id, department: "Electronics & Communication", designation: "Assistant Professor", isMentor: true, isCoordinator: true },
    ]).run();
    tx.insert(students).values([
      { userId: maya.id, raNumber: "RA2311003010045", department: "Computer Science & Engineering", academicYear: "3rd Year", mentorId: thorne.id },
      { userId: dev.id, raNumber: "RA2311003010088", department: "Computer Science & Engineering", academicYear: "2nd Year", mentorId: thorne.id },
      { userId: priya.id, raNumber: "RA2311003010102", department: "Information Technology", academicYear: "3rd Year", mentorId: wright.id },
    ]).run();

    const turing = tx.insert(clubs).values({
      name: "Turing Coding & AI Club", code: "TCC", category: "Technical", description: "Competitive programming, AI and systems engineering community.", clubAdminId: alex.id, facultyCoordinatorId: thorne.id, isDemo: true,
      certificateTemplate: JSON.stringify({ headerTitle: "Certificate of Achievement", accentColor: "#2563eb", signatoryName: "Alex Rivera", signatoryTitle: "Club Administrator", bodyText: "", footerText: "Turing Coding & AI Club - DEMO DATA" }),
    }).returning().get();
    const robotics = tx.insert(clubs).values({ name: "Robotics & IoT Innovators", code: "ROBO", category: "Technical", description: "Hands-on robotics, embedded firmware and drone engineering.", clubAdminId: alex.id, facultyCoordinatorId: thorne.id, isDemo: true }).returning().get();
    const literary = tx.insert(clubs).values({ name: "Campus Literary & Debate Society", code: "CLDS", category: "Literary", description: "Parliamentary debate, creative writing and public speaking.", clubAdminId: jordan.id, facultyCoordinatorId: wright.id, isDemo: true }).returning().get();

    const mkRole = (clubId: number, name: string, perms: string[]) => {
      const r = tx.insert(clubRoles).values({ clubId, name, createdBy: alex.id }).returning().get();
      for (const p of perms) tx.insert(rolePermissions).values({ roleId: r.id, permissionKey: p }).run();
      return r;
    };
    mkRole(turing.id, "President", ["create_events", "edit_events", "manage_registrations", "record_attendance", "manage_members", "issue_certificates", "award_badges"]);
    const techLead = mkRole(turing.id, "Technical Lead & Event Coordinator", ["create_events", "edit_events", "manage_registrations", "record_attendance", "issue_certificates"]);
    mkRole(turing.id, "Logistics Lead", ["manage_registrations", "record_attendance"]);

    tx.insert(clubMemberships).values([
      { clubId: turing.id, userId: maya.id }, { clubId: turing.id, userId: priya.id, roleId: techLead.id },
      { clubId: robotics.id, userId: maya.id }, { clubId: robotics.id, userId: dev.id },
    ]).run();

    // timetable (Mon-Fri, effective long before any event)
    const tt = tx.insert(timetableStructures).values({ name: "Standard Academic Timetable 2025-26", workingDays: "Monday,Tuesday,Wednesday,Thursday,Friday", effectiveFrom: "2025-01-01", isActive: true, createdBy: superAdmin.id }).returning().get();
    const periods: [number, string, string, string, "Class Period" | "Short Break" | "Lunch Break"][] = [
      [1, "Period 1", "09:00", "09:50", "Class Period"], [2, "Period 2", "09:55", "10:45", "Class Period"], [3, "Morning Break", "10:45", "11:05", "Short Break"],
      [4, "Period 3", "11:05", "11:55", "Class Period"], [5, "Period 4", "12:00", "12:50", "Class Period"], [6, "Lunch Break", "12:50", "13:40", "Lunch Break"],
      [7, "Period 5", "13:40", "14:30", "Class Period"], [8, "Period 6", "14:35", "15:25", "Class Period"], [9, "Period 7", "15:30", "16:20", "Class Period"],
    ];
    for (const [n, label, s, e, type] of periods) {
      const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      tx.insert(timetablePeriods).values({ structureId: tt.id, periodNumber: n, label, startTime: s, endTime: e, periodType: type, durationMinutes: m(e) - m(s) }).run();
    }
    audit(tx, superAdmin.id, "CREATE_TIMETABLE", "timetable_structures", tt.id, "seed: standard timetable");

    const mkEvent = (v: Partial<typeof events.$inferInsert> & Pick<typeof events.$inferInsert, "clubId" | "title" | "description" | "eventDate" | "startTime" | "endTime" | "venue" | "maxCapacity" | "createdById" | "facultyCoordinatorId">) =>
      tx.insert(events).values({ ...v, status: "Approved", isDemo: true }).returning().get();

    const hack = mkEvent({ clubId: turing.id, title: "Campus HackFest 2026: AI & Systems", description: "Day-long build sprint for AI applications and distributed systems prototypes.", eventDate: shift(6), startTime: "09:30", endTime: "15:30", venue: "Central Auditorium & Lab 401", maxCapacity: 120, createdById: alex.id, facultyCoordinatorId: thorne.id, facultyRemarks: "Approved. Lab access verified." });
    const master = mkEvent({ clubId: turing.id, title: "Full-Stack Web & API Masterclass", description: "Hands-on workshop building production REST services.", eventDate: shift(-14, -1), startTime: "11:00", endTime: "16:00", venue: "Tech Block Seminar Hall", maxCapacity: 80, createdById: alex.id, facultyCoordinatorId: thorne.id });
    const sprint = mkEvent({ clubId: turing.id, title: "Open Source Sprint (live now - QR demo)", description: "Live contribution sprint. Use this event to demo dynamic QR check-in.", eventDate: localDate(), startTime: "09:00", endTime: "17:00", venue: "Lab 402", maxCapacity: 40, createdById: alex.id, facultyCoordinatorId: thorne.id });

    // registrations must be inserted while events are Approved (DB trigger); statuses are advanced afterwards
    const reg = (eventId: number, userId: number) => tx.insert(eventRegistrations).values({ eventId, userId }).returning().get();
    const rHackMaya = reg(hack.id, maya.id);
    reg(hack.id, dev.id);
    const rMasterMaya = reg(master.id, maya.id);
    const rMasterDev = reg(master.id, dev.id);
    reg(sprint.id, maya.id);
    reg(sprint.id, dev.id);
    tx.insert(attendance).values([
      { registrationId: rMasterMaya.id, status: "Attended", method: "QR", markedBy: maya.id },
      { registrationId: rMasterDev.id, status: "Absent", method: "Manual", markedBy: alex.id },
    ]).run();
    tx.update(events).set({ status: "Completed" }).where(eq(events.id, master.id)).run();
    tx.update(events).set({ status: "Ongoing" }).where(eq(events.id, sprint.id)).run();

    const pending = tx.insert(events).values({ clubId: robotics.id, title: "Autonomous Drone Navigation Seminar", description: "Flight controller setup and computer-vision waypoint navigation.", eventDate: shift(10), startTime: "10:00", endTime: "13:00", venue: "Robotics Lab B-12", maxCapacity: 50, createdById: alex.id, facultyCoordinatorId: thorne.id, status: "Pending Faculty Approval", isDemo: true }).returning().get();
    tx.insert(events).values({ clubId: literary.id, title: "National Parliamentary Debate Championship", description: "Inter-collegiate Asian Parliamentary debate tournament.", eventDate: shift(16), startTime: "09:00", endTime: "17:00", venue: "Main Amphitheatre", maxCapacity: 200, createdById: jordan.id, facultyCoordinatorId: wright.id, status: "Draft", isDemo: true }).run();
    const rejected = tx.insert(events).values({ clubId: turing.id, title: "Late-Night Gaming Marathon", description: "Overnight gaming tournament in the seminar hall.", eventDate: shift(8), startTime: "18:00", endTime: "23:00", venue: "Seminar Hall", maxCapacity: 60, createdById: alex.id, facultyCoordinatorId: thorne.id, status: "Pending Faculty Approval", isDemo: true }).returning().get();
    tx.update(events).set({ status: "Rejected", rejectionReason: "Campus policy does not permit late-night events without security cover. Propose a daytime slot and resubmit." }).where(eq(events.id, rejected.id)).run();

    const hist = (eventId: number, actorId: number, action: string, from: string, to: string, remarks?: string) =>
      tx.insert(eventApprovalHistory).values({ eventId, actorId, action, fromStatus: from, toStatus: to, remarks: remarks ?? null }).run();
    for (const e of [hack, master, sprint]) { hist(e.id, alex.id, "Submitted", "Draft", "Pending Faculty Approval"); hist(e.id, thorne.id, "Approved", "Pending Faculty Approval", "Approved"); }
    hist(pending.id, alex.id, "Submitted", "Draft", "Pending Faculty Approval");
    hist(rejected.id, alex.id, "Submitted", "Draft", "Pending Faculty Approval");
    hist(rejected.id, thorne.id, "Rejected", "Pending Faculty Approval", "Rejected", "Campus policy does not permit late-night events without security cover.");

    // OD requests (timetable snapshot computed by the real overlap engine)
    const od = (regId: number, userId: number, ev: typeof hack, status: "Pending" | "Approved", reason: string, mentorId: number) => {
      const calc = calculateOverlap(tx, ev.eventDate, ev.startTime, ev.endTime);
      if (!calc.structure) throw new Error("seed: no timetable");
      const row = tx.insert(odRequests).values({
        registrationId: regId, userId, eventId: ev.id, mentorId, status, reason, timetableStructureId: calc.structure.id, timetableName: calc.structure.name, timetableVersion: calc.structure.version,
        affectedPeriodsSnapshot: JSON.stringify(calc.affectedPeriods), totalAcademicMinutes: calc.totalAcademicMinutes,
        ...(status === "Approved" ? { decidedBy: mentorId, decidedAt: new Date(), mentorRemarks: "Approved for academic enrichment." } : {}),
      }).returning().get();
      tx.insert(odApprovalHistory).values({ odId: row.id, actorId: userId, action: "Submitted", remarks: reason }).run();
      if (status === "Approved") tx.insert(odApprovalHistory).values({ odId: row.id, actorId: mentorId, action: "Approved", remarks: "Approved for academic enrichment." }).run();
      return row;
    };
    od(rHackMaya.id, maya.id, hack, "Pending", "Representing the CSE department as team lead at HackFest.", thorne.id);
    od(rMasterMaya.id, maya.id, master, "Approved", "Attending the Full-Stack Masterclass workshop.", thorne.id);

    tx.insert(certificates).values({ certificateNumber: "CERT-DEMO-TCC-000001", registrationId: rMasterMaya.id, eventId: master.id, userId: maya.id, clubId: turing.id, participationRole: "Participant", issuedBy: alex.id, templateSnapshot: turing.certificateTemplate }).run();

    const b = (clubId: number | null, name: string, description: string, icon: string, criteria: string, ruleKey: "first_event" | "three_events" | null = null) =>
      tx.insert(badgeDefinitions).values({ clubId, name, description, icon, criteria, ruleKey, createdBy: superAdmin.id }).returning().get();
    const champion = b(turing.id, "Code Champion", "Outstanding algorithmic problem solving.", "Code", "Top rank in a club coding contest.");
    b(turing.id, "Hackathon Finisher", "Delivered a working project at a hackathon.", "Trophy", "Submit a working hackathon project.");
    b(robotics.id, "Hardware Tinkerer", "Built and tested a working microcontroller prototype.", "Cpu", "Pass the hardware lab verification.");
    const first = b(null, "First Event", "Attended a first campus event.", "Star", "One event with confirmed attendance.", "first_event");
    b(null, "Three-Event Streak", "Attended three campus events.", "Flame", "Three events with confirmed attendance.", "three_events");
    b(null, "Club Volunteer", "Volunteered for a club event.", "HeartHandshake", "Volunteer certificate holder.");
    b(null, "Event Organizer", "Organised a campus event.", "ClipboardList", "Organizer role at an event.");
    b(null, "Event Winner", "Won a campus competition.", "Medal", "Winner certificate holder.");
    tx.insert(awardedBadges).values([
      { badgeId: first.id, userId: maya.id, awardedBy: null, reason: "Awarded automatically: One event with confirmed attendance." },
      { badgeId: champion.id, userId: maya.id, awardedBy: alex.id, reason: "Solved all benchmark problems in the March coding sprint." },
    ]).run();

    notify(tx, thorne.id, { title: "OD application awaiting your review", message: "Maya Patel (RA2311003010045) requested OD for HackFest.", type: "od", link: "/od" });
    notify(tx, thorne.id, { title: "Event awaiting your approval", message: `"${pending.title}" was submitted by Alex Rivera.`, type: "event", link: "/approvals" });
    notify(tx, maya.id, { title: "Registration confirmed", message: `You are registered for "${hack.title}".`, type: "event", link: `/events/${hack.id}` });
    notify(tx, maya.id, { title: "Badge awarded", message: 'You were awarded the "Code Champion" badge.', type: "badge", link: "/portfolio" });

    const thread = tx.insert(messageThreads).values({ subject: "Safety checklist for the Drone Seminar", contextType: "event", eventId: pending.id, createdBy: alex.id }).returning().get();
    tx.insert(threadParticipants).values([{ threadId: thread.id, userId: alex.id, lastReadAt: new Date() }, { threadId: thread.id, userId: thorne.id }]).run();
    tx.insert(messages).values([
      { threadId: thread.id, senderId: alex.id, body: "Dear Prof. Thorne, the battery-safety checklist for the drone seminar is attached to the proposal." },
      { threadId: thread.id, senderId: thorne.id, body: "Thanks Alex - I am reviewing it and will decide on the approval today." },
    ]).run();
    audit(tx, alex.id, "CREATE_CLUB_ROLE", "club_roles", techLead.id, "seed: dynamic roles for Turing club");
  });
  return { seeded: true, message: `Demo data created. All demo accounts use the password from DEMO_PASSWORD (default "Password123!").` };
}
