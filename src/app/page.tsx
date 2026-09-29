"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Award, Calendar, CheckCircle2, ClipboardCheck, FileText, Users } from "lucide-react";
import { api, errMsg, fmtDate } from "@/lib/client";
import { DemoBadge, Empty, ErrorBox, Spinner, StatusBadge } from "@/components/ui";
const COLORS = ["#64748b", "#f59e0b", "#10b981", "#ef4444", "#0ea5e9", "#a855f7", "#475569"];

function Kpi({ label, value, hint, icon, href }: { label: string; value: React.ReactNode; hint?: string; icon: React.ReactNode; href?: string }) {
  const body = (
    <div className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 h-full">
      <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
        {label}
        {icon}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const Chart = ({ children }: { children: React.ReactElement }) => (
  <div className="h-64 w-full">
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  </div>
);
const tip = { contentStyle: { background: "#0f172a", border: "1px solid #334155", borderRadius: 12, fontSize: 12 } };

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [a, setA] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api("/api/auth/me"), api("/api/analytics"), api("/api/events")])
      .then(([m, an, ev]) => {
        setUser(m.user);
        setA(an);
        setEvents(ev.events);
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error || !user) return <ErrorBox message={error ?? "Could not load the dashboard"} />;
  const upcoming = events.filter((e) => ["Approved", "Ongoing"].includes(e.status)).slice(0, 4);

  return (
    <div className="space-y-8">
      <div className="rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 border border-indigo-800/60 p-6 sm:p-8">
        <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">{user.role.replace("_", " ")} dashboard</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">Welcome back, {user.fullName}</h1>
        <p className="text-sm text-slate-300 mt-2 max-w-2xl">
          {user.role === "student" && "Browse clubs, register for approved events, apply for On-Duty (sent to your Class Mentor), check in by QR and collect certificates and badges."}
          {user.role === "faculty" && "Approve or reject event proposals as Faculty Coordinator and review On-Duty requests as Class Mentor."}
          {user.role === "club_admin" && "Run your club: roles, events, faculty approval, registrations, attendance, certificates and badges."}
          {(user.role === "admin" || user.role === "super_admin") && "Institution-wide view of clubs, events, approvals and participation."}
        </p>
        {a?.demoDataPresent && (user.role === "admin" || user.role === "super_admin") && (
          <p className="mt-3 text-[11px] text-fuchsia-300 flex items-center gap-2"><DemoBadge /> Figures below include seeded demo records (flagged DEMO) alongside any real data.</p>
        )}
      </div>

      {a?.student && (
        <section aria-label="Student overview" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Joined clubs" value={a.student.joinedClubs.length} hint={a.student.joinedClubs.map((c: any) => c.code).join(", ") || "None yet"} icon={<Users className="w-4 h-4 text-blue-400" />} href="/clubs" />
            <Kpi label="Events attended" value={a.student.attendedEvents} hint="Confirmed attendance" icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
            <Kpi label="OD approval rate" value={a.student.odApprovalRate === null ? "-" : `${a.student.odApprovalRate}%`} hint={`${a.student.approvedODs} approved, ${a.student.pendingODs} pending of ${a.student.totalODs}`} icon={<FileText className="w-4 h-4 text-purple-400" />} href="/od" />
            <Kpi label="Certificates / badges" value={`${a.student.certificates} / ${a.student.badges}`} hint="Verified on your portfolio" icon={<Award className="w-4 h-4 text-amber-400" />} href="/portfolio" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">Upcoming registered events</h2>
              {a.student.upcomingRegistered.length === 0 ? <p className="text-xs text-slate-400">No upcoming registrations. <Link href="/events" className="text-indigo-400">Browse events</Link></p> : (
                <ul className="space-y-2">{a.student.upcomingRegistered.map((e: any) => (
                  <li key={e.regId}><Link href={`/events/${e.eventId}`} className="flex justify-between text-xs bg-slate-950 rounded-xl p-3 hover:bg-slate-800"><span className="text-white font-medium">{e.title}</span><span className="text-slate-400 font-mono">{e.eventDate} {e.startTime}</span></Link></li>
                ))}</ul>
              )}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">Recent OD applications</h2>
              {a.student.odHistory.length === 0 ? <p className="text-xs text-slate-400">No OD applications yet.</p> : (
                <ul className="space-y-2">{a.student.odHistory.map((o: any) => (
                  <li key={o.id} className="flex items-center justify-between text-xs bg-slate-950 rounded-xl p-3"><span className="text-slate-300">{fmtDate(o.appliedAt)} - {o.minutes} academic min</span><StatusBadge status={o.status} /></li>
                ))}</ul>
              )}
            </div>
          </div>
        </section>
      )}

      {a?.clubAdmin && (
        <section aria-label="Club overview" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <Kpi label="Members" value={a.clubAdmin.totals.members} icon={<Users className="w-4 h-4 text-blue-400" />} />
            <Kpi label="Upcoming events" value={a.clubAdmin.totals.upcomingEvents} icon={<Calendar className="w-4 h-4 text-indigo-400" />} />
            <Kpi label="Completed events" value={a.clubAdmin.totals.completedEvents} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
            <Kpi label="Pending approvals" value={a.clubAdmin.totals.pendingApprovals} icon={<ClipboardCheck className="w-4 h-4 text-amber-400" />} />
            <Kpi label="Registrations" value={a.clubAdmin.totals.registrations} icon={<FileText className="w-4 h-4 text-purple-400" />} />
            <Kpi label="Attended" value={a.clubAdmin.totals.attended} icon={<Award className="w-4 h-4 text-amber-400" />} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-white mb-3">Registrations vs attendance by club</h2>
            <Chart>
              <BarChart data={a.clubAdmin.clubs}><CartesianGrid stroke="#1e293b" /><XAxis dataKey="code" stroke="#94a3b8" fontSize={11} /><YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} /><Tooltip {...tip} /><Legend /><Bar dataKey="registrations" fill="#6366f1" name="Registrations" /><Bar dataKey="attended" fill="#10b981" name="Attended" /></BarChart>
            </Chart>
            <div className="overflow-x-auto mt-4"><table className="w-full text-xs text-left"><thead className="text-slate-400 text-[10px] uppercase"><tr><th className="py-2 pr-3">Club</th><th>Members</th><th>Upcoming</th><th>Completed</th><th>Pending</th><th>Attendance rate</th></tr></thead><tbody className="divide-y divide-slate-800">{a.clubAdmin.clubs.map((c: any) => (<tr key={c.clubId}><td className="py-2 pr-3 text-white font-medium"><Link href={`/clubs/${c.clubId}`} className="hover:underline">{c.name}</Link></td><td>{c.members}</td><td>{c.upcomingEvents}</td><td>{c.completedEvents}</td><td>{c.pendingApprovals}</td><td>{c.attendanceRate === null ? "-" : `${c.attendanceRate}%`}</td></tr>))}</tbody></table></div>
          </div>
        </section>
      )}

      {a?.faculty && (
        <section aria-label="Faculty overview" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Events awaiting approval" value={a.faculty.eventsAwaitingApproval.length} hint="As Faculty Coordinator" icon={<ClipboardCheck className="w-4 h-4 text-amber-400" />} href="/approvals" />
            <Kpi label="OD awaiting review" value={a.faculty.odAwaitingReview} hint="As Class Mentor" icon={<FileText className="w-4 h-4 text-emerald-400" />} href="/od" />
            <Kpi label="Events decided" value={`${a.faculty.decisions.eventsApproved} / ${a.faculty.decisions.eventsRejected}`} hint="approved / rejected" icon={<Calendar className="w-4 h-4 text-indigo-400" />} />
            <Kpi label="OD decided" value={`${a.faculty.decisions.odApproved} / ${a.faculty.decisions.odRejected}`} hint="approved / rejected" icon={<CheckCircle2 className="w-4 h-4 text-purple-400" />} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">Mentee participation (verified attendance)</h2>
              {a.faculty.participation.length === 0 ? <p className="text-xs text-slate-400">No mentees assigned.</p> : <ul className="space-y-2">{a.faculty.participation.map((m: any) => (<li key={m.ra} className="flex justify-between text-xs bg-slate-950 rounded-xl p-3"><span className="text-white">{m.name} <span className="text-slate-500 font-mono">{m.ra}</span></span><span className="text-emerald-300">{m.attended} attended</span></li>))}</ul>}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">Recent event decisions</h2>
              {a.faculty.decisions.events.length === 0 ? <p className="text-xs text-slate-400">No decisions yet.</p> : <ul className="space-y-2">{a.faculty.decisions.events.map((d: any) => (<li key={d.id} className="flex justify-between items-center text-xs bg-slate-950 rounded-xl p-3"><span className="text-white">{d.title}</span><StatusBadge status={d.action} /></li>))}</ul>}
            </div>
          </div>
        </section>
      )}

      {a?.admin && (
        <section aria-label="Institution overview" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Clubs" value={a.admin.totalClubs} hint={`${a.admin.activeClubs} active`} icon={<Users className="w-4 h-4 text-blue-400" />} href="/clubs" />
            <Kpi label="Club memberships" value={a.admin.totalMembers} hint={`${a.admin.crossClubParticipants} students in 2+ clubs`} icon={<Users className="w-4 h-4 text-indigo-400" />} />
            <Kpi label="Events" value={a.admin.totalEvents} hint={`${a.admin.pendingApprovals} pending approval`} icon={<Calendar className="w-4 h-4 text-purple-400" />} href="/events" />
            <Kpi label="Registrations / attended" value={`${a.admin.totalRegistrations} / ${a.admin.confirmedAttendance}`} hint={`${a.admin.approvedODs} OD approved, ${a.admin.pendingODs} pending`} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} href="/od" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5"><h2 className="text-sm font-bold text-white mb-3">Club activity</h2>
              <Chart><BarChart data={a.admin.clubs}><CartesianGrid stroke="#1e293b" /><XAxis dataKey="code" stroke="#94a3b8" fontSize={11} /><YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} /><Tooltip {...tip} /><Legend /><Bar dataKey="members" fill="#6366f1" name="Members" /><Bar dataKey="totalEvents" fill="#f59e0b" name="Events" /><Bar dataKey="attended" fill="#10b981" name="Attended" /></BarChart></Chart></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5"><h2 className="text-sm font-bold text-white mb-3">Events by status</h2>
              <Chart><PieChart><Pie data={a.admin.eventStatus.filter((s: any) => s.count > 0)} dataKey="count" nameKey="name" outerRadius={85} label>{a.admin.eventStatus.map((_: any, i: number) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}</Pie><Tooltip {...tip} /><Legend /></PieChart></Chart></div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5"><h2 className="text-sm font-bold text-white mb-3">Most active clubs</h2>
            <ol className="space-y-2">{a.admin.mostActiveClubs.map((c: any, i: number) => (<li key={c.clubId} className="flex justify-between text-xs bg-slate-950 rounded-xl p-3"><span className="text-white">{i + 1}. {c.name}</span><span className="text-slate-400">{c.totalEvents} events - {c.registrations} registrations - {c.attended} attended</span></li>))}</ol></div>
        </section>
      )}

      <section aria-label="Upcoming events">
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold text-white">Published events</h2><Link href="/events" className="text-xs text-indigo-400 flex items-center gap-1">All events <ArrowRight className="w-3.5 h-3.5" /></Link></div>
        {upcoming.length === 0 ? <Empty title="No published events yet" hint="Events appear here once their Faculty Coordinator approves them." /> : (
          <div className="grid md:grid-cols-2 gap-3">{upcoming.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-bold text-indigo-300 bg-indigo-950 border border-indigo-800 px-2 py-0.5 rounded">{e.club?.code}</span><StatusBadge status={e.status} />{e.isDemo && <DemoBadge />}</div>
              <p className="font-bold text-white text-sm">{e.title}</p>
              <p className="text-xs text-slate-400 mt-1 font-mono">{e.eventDate} - {e.startTime}-{e.endTime} - {e.venue}</p>
              <p className="text-[11px] text-slate-500 mt-1">{e.registeredCount}/{e.maxCapacity} registered</p>
            </Link>))}</div>
        )}
      </section>
    </div>
  );
}
