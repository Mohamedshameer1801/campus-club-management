"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Award, Plus } from "lucide-react";
import { api, errMsg, fmtDate, toast } from "@/lib/client";
import { btn, Empty, ErrorBox, Field, inputCls, Modal, PageHeader, Spinner } from "@/components/ui";

const ICONS = ["Award", "Star", "Trophy", "Code", "Cpu", "Medal", "Flame", "HeartHandshake", "ClipboardList"];

export default function BadgesPage() {
  const [me, setMe] = useState<any>(null);
  const [defs, setDefs] = useState<any[]>([]);
  const [awarded, setAwarded] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(false);
  const [award, setAward] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [nb, setNb] = useState({ clubId: "", name: "", description: "", icon: "Award", criteria: "" });

  const load = useCallback(async () => {
    try {
      const [m, d, a, c] = await Promise.all([api("/api/auth/me"), api("/api/badges"), api("/api/badges/awarded"), api("/api/clubs")]);
      setMe(m.user);
      setDefs(d.badges);
      setAwarded(a.awarded);
      setClubs(c.clubs);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const inst = me && ["super_admin", "admin"].includes(me.role);
  const manageable = clubs.filter((c) => inst || me?.managedClubIds?.includes(c.id));
  const canAwardFor = (b: any) => !b.ruleKey && (b.clubId ? inst || me?.managedClubIds?.includes(b.clubId) || me?.clubRoles?.some((r: any) => r.clubId === b.clubId && r.permissions.includes("award_badges")) : inst);

  const openAward = async (b: any) => {
    setAward({ badge: b, userId: "", reason: "" });
    setFormError(null);
    try {
      if (inst) setStudents((await api("/api/users?roles=student")).users);
      else if (b.clubId) setStudents((await api(`/api/clubs/${b.clubId}`)).club.members.filter((m: any) => m.status === "active").map((m: any) => ({ id: m.userId, fullName: m.fullName, email: m.email })));
    } catch (e) {
      setFormError(errMsg(e));
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api("/api/badges", { body: { ...nb, clubId: nb.clubId ? Number(nb.clubId) : null } });
      toast("Badge defined", "success");
      setCreate(false);
      setNb({ clubId: "", name: "", description: "", icon: "Award", criteria: "" });
      load();
    } catch (err) {
      setFormError(errMsg(err));
    }
  };

  const submitAward = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api("/api/badges/award", { body: { badgeId: award.badge.id, userId: Number(award.userId), reason: award.reason } });
      toast("Badge awarded - the student was notified", "success");
      setAward(null);
      load();
    } catch (err) {
      setFormError(errMsg(err));
    }
  };

  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader icon={<Award className="w-6 h-6 text-amber-400" />} title="Badges" subtitle="Reusable achievement badges. Club badges are defined by the Club Admin and awarded only to members or attendees; campus-wide rules (First Event, Three-Event Streak) are awarded automatically from verified attendance." actions={me && (inst || me.managedClubIds?.length > 0) && <button className={btn.primary} onClick={() => { setCreate(true); setFormError(null); }}><Plus className="w-4 h-4" /> Define badge</button>} />
      <ErrorBox message={error} />
      <section aria-label="Badge definitions" className="mb-10">
        <h2 className="text-sm font-bold text-white mb-3">Badge definitions</h2>
        {defs.length === 0 ? <Empty title="No badges defined" /> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{defs.map((b) => (
            <article key={b.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between gap-2"><b className="text-white text-sm">{b.name}</b><span className="text-[10px] font-mono text-slate-500">{b.icon}</span></div>
              <p className="text-xs text-slate-300">{b.description}</p>
              <p className="text-[11px] text-slate-500">Criteria: {b.criteria}</p>
              <div className="flex items-center justify-between pt-1"><span className="text-[10px] font-semibold text-indigo-300">{b.clubName ?? "Campus-wide"}{b.ruleKey ? " - automatic" : ""}</span>{canAwardFor(b) && <button className={btn.secondary} onClick={() => openAward(b)}>Award</button>}</div>
            </article>))}</div>
        )}
      </section>
      <section aria-label="Issued badges">
        <h2 className="text-sm font-bold text-white mb-3">{me?.role === "student" ? "My badges" : "Issued badges (your scope)"}</h2>
        {awarded.length === 0 ? <Empty title="No badges issued yet" /> : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto"><table className="w-full text-xs text-left">
            <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="p-3">Badge</th><th>Student</th><th>Reason</th><th>Awarded by</th><th>When</th></tr></thead>
            <tbody className="divide-y divide-slate-800">{awarded.map((a) => (<tr key={a.id}><td className="p-3 text-white font-semibold">{a.name} <span className="text-slate-500 font-normal">{a.clubName ?? "Campus-wide"}</span></td><td className="text-slate-300">{a.studentName} <span className="font-mono text-slate-500">{a.raNumber}</span></td><td className="text-slate-400 max-w-xs">{a.reason}</td><td className="text-slate-300">{a.awardedByName}</td><td className="text-slate-500">{fmtDate(a.awardedAt)}</td></tr>))}</tbody></table></div>
        )}
      </section>

      <Modal open={create} onClose={() => setCreate(false)} title="Define a badge">
        <form onSubmit={submitCreate} className="space-y-3">
          <ErrorBox message={formError} />
          <Field label="Scope" htmlFor="bc"><select id="bc" className={inputCls} value={nb.clubId} onChange={(e) => setNb({ ...nb, clubId: e.target.value })} required={!inst}>{inst && <option value="">Campus-wide</option>}{!inst && <option value="">Select a club</option>}{manageable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Name" htmlFor="bn"><input id="bn" className={inputCls} required minLength={2} value={nb.name} onChange={(e) => setNb({ ...nb, name: e.target.value })} /></Field>
          <Field label="Description" htmlFor="bd"><input id="bd" className={inputCls} required minLength={5} value={nb.description} onChange={(e) => setNb({ ...nb, description: e.target.value })} /></Field>
          <Field label="Award criteria" htmlFor="bcr"><input id="bcr" className={inputCls} required minLength={3} value={nb.criteria} onChange={(e) => setNb({ ...nb, criteria: e.target.value })} /></Field>
          <Field label="Icon" htmlFor="bi"><select id="bi" className={inputCls} value={nb.icon} onChange={(e) => setNb({ ...nb, icon: e.target.value })}>{ICONS.map((i) => <option key={i}>{i}</option>)}</select></Field>
          <button className={`${btn.primary} w-full`}>Save badge</button>
        </form>
      </Modal>
      <Modal open={!!award} onClose={() => setAward(null)} title={`Award "${award?.badge.name ?? ""}"`}>
        {award && <form onSubmit={submitAward} className="space-y-3">
          <ErrorBox message={formError} />
          <Field label="Student" htmlFor="as" hint={students.length === 0 ? "No eligible students are visible to you. Club Admins see their club's members." : undefined}><select id="as" className={inputCls} required value={award.userId} onChange={(e) => setAward({ ...award, userId: e.target.value })}><option value="">Select student</option>{students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.email})</option>)}</select></Field>
          <Field label="Reason" htmlFor="ar"><textarea id="ar" rows={2} className={inputCls} required minLength={3} value={award.reason} onChange={(e) => setAward({ ...award, reason: e.target.value })} /></Field>
          <button className={`${btn.primary} w-full`}>Award badge</button>
        </form>}
      </Modal>
    </div>
  );
}
