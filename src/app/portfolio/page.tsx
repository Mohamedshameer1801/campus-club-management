"use client";

import React, { useEffect, useState } from "react";
import { Award, Calendar, Download, GraduationCap, Printer, Sparkles, Users } from "lucide-react";
import { api, downloadFile, errMsg, toast } from "@/lib/client";
import { btn, Empty, ErrorBox, inputCls, Spinner } from "@/components/ui";
export default function PortfolioPage() {
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notStudent, setNotStudent] = useState(false);
  const [summary, setSummary] = useState<{ source: string; text: string; bullets: string[]; note: string } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/auth/me")
      .then(async ({ user }) => {
        if (user.role !== "student") return setNotStudent(true);
        setP((await api(`/api/portfolio/${user.id}`)).portfolio);
      })
      .catch((e) => setError(errMsg(e)));
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api("/api/portfolio/summary", { body: {} });
      setSummary(r);
      setText(`${r.text}\n\n${r.bullets.map((b: string) => `- ${b}`).join("\n")}`);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (notStudent) return <Empty title="Portfolios are generated for student accounts" hint="Class Mentors and administrators can open a student's portfolio through the API (owner, assigned mentor and institutional admins only)." />;
  if (error) return <ErrorBox message={error} />;
  if (!p) return <Spinner label="Compiling your verified portfolio..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><GraduationCap className="w-6 h-6 text-indigo-400" /> Activity portfolio</h1><p className="text-xs text-slate-400 mt-1">Built only from records verified in the campus database (attendance, certificates, badges, roles). Nothing here is typed in by hand.</p></div>
        <div className="flex gap-2 flex-wrap">
          <button className={btn.secondary} onClick={generate} disabled={busy}><Sparkles className="w-4 h-4" /> Draft summary text</button>
          <button className={btn.primary} onClick={() => downloadFile("/api/portfolio/pdf", "portfolio.pdf", { summary: text || undefined }).catch((e) => toast(errMsg(e), "error"))}><Download className="w-4 h-4" /> Export PDF</button>
          <button className={btn.secondary} onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</button>
        </div>
      </div>

      {summary && (
        <section className="bg-slate-900 border border-purple-900/60 rounded-2xl p-5 space-y-3 print:hidden" aria-label="Summary editor">
          <div className="flex items-center gap-2 text-xs"><span className={`px-2 py-0.5 rounded-full border font-bold ${summary.source === "ai" ? "bg-purple-950 text-purple-300 border-purple-800" : "bg-slate-800 text-slate-300 border-slate-700"}`}>{summary.source === "ai" ? "AI-assisted (external model)" : "Template-based (no AI)"}</span><span className="text-slate-400">{summary.note}</span></div>
          <label htmlFor="summary" className="sr-only">Editable summary</label>
          <textarea id="summary" rows={8} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-[11px] text-slate-500">This text is yours to edit. In the exported PDF it appears in a separate section labelled as student-written, distinct from the verified records.</p>
        </section>
      )}

      <article className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 print:bg-white print:text-black">
        <header className="flex flex-col sm:flex-row justify-between gap-4 border-b border-slate-800 pb-5">
          <div><h2 className="text-2xl font-extrabold text-white">{p.user.fullName}</h2><p className="text-xs text-slate-400 font-mono mt-1">RA {p.studentProfile.raNumber} - {p.studentProfile.department} - {p.studentProfile.academicYear}</p><p className="text-xs text-slate-400">Class Mentor: {p.studentProfile.mentorName}</p></div>
          <dl className="grid grid-cols-4 gap-2 text-center">{[["Clubs", p.stats.clubsCount], ["Attended", p.stats.eventsAttendedCount], ["Certificates", p.stats.certificatesCount], ["Badges", p.stats.badgesCount]].map(([k, v]) => <div key={k} className="bg-slate-950 rounded-xl px-3 py-2 border border-slate-800"><dt className="text-[10px] uppercase text-slate-500">{k}</dt><dd className="text-lg font-bold text-indigo-300">{v}</dd></div>)}</dl>
        </header>
        <section><h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-indigo-400" /> Clubs &amp; leadership roles</h3>{p.memberships.length === 0 ? <p className="text-xs text-slate-500">None recorded.</p> : <ul className="grid sm:grid-cols-2 gap-2">{p.memberships.map((m: any) => <li key={m.clubId} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs"><b className="text-white">{m.clubName}</b> <span className="text-slate-500">({m.category})</span><br /><span className={m.roleName ? "text-purple-300" : "text-slate-400"}>{m.roleName ?? "Member"}</span></li>)}</ul>}</section>
        <section><h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2"><Calendar className="w-4 h-4 text-emerald-400" /> Verified event attendance</h3>{p.attendedEvents.length === 0 ? <p className="text-xs text-slate-500">No confirmed attendance yet.</p> : <ul className="space-y-2">{p.attendedEvents.map((e: any) => <li key={e.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs flex flex-wrap justify-between gap-2"><span><b className="text-white">{e.title}</b> - {e.clubName}</span><span className="text-slate-400 font-mono">{e.eventDate} - verified by {e.checkInMethod === "QR" ? "QR check-in" : "organiser"}</span></li>)}</ul>}</section>
        <section><h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Volunteer &amp; organiser experience</h3>{p.experience.length === 0 ? <p className="text-xs text-slate-500">None recorded.</p> : <ul className="space-y-1 text-xs text-slate-300">{p.experience.map((x: any, i: number) => <li key={i}>{x.type}: <b className="text-white">{x.title}</b> - {x.club} ({x.date})</li>)}</ul>}</section>
        <div className="grid md:grid-cols-2 gap-6">
          <section><h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2"><Award className="w-4 h-4 text-amber-400" /> Certificates</h3>{p.certificates.length === 0 ? <p className="text-xs text-slate-500">None issued.</p> : <ul className="space-y-2">{p.certificates.map((c: any) => <li key={c.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs"><b className="text-white">{c.eventTitle}</b><br /><span className="text-slate-400">{c.clubName} - {c.participationRole}</span><br /><a className="font-mono text-amber-300 hover:underline" href={`/verify-certificate/${c.certificateNumber}`}>{c.certificateNumber}</a></li>)}</ul>}</section>
          <section><h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Badges &amp; achievements</h3>{p.achievements.length === 0 ? <p className="text-xs text-slate-500">None recorded.</p> : <ul className="space-y-2">{p.achievements.map((a: any, i: number) => <li key={i} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs"><b className="text-white">{a.title}</b><br /><span className="text-slate-400">{a.club} - {a.date}</span></li>)}</ul>}</section>
        </div>
        <footer className="pt-4 border-t border-slate-800 text-[10px] text-slate-500">{p.provenance}</footer>
      </article>
    </div>
  );
}
