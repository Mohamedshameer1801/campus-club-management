"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Users } from "lucide-react";
import { api, errMsg, toast } from "@/lib/client";
import { btn, DemoBadge, Empty, ErrorBox, Field, inputCls, Modal, PageHeader, Spinner } from "@/components/ui";
const CATEGORIES = ["Technical", "Cultural", "Sports", "Literary", "Social"];

export default function ClubsPage() {
  const [clubs, setClubs] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [staff, setStaff] = useState<{ admins: any[]; faculty: any[] }>({ admins: [], faculty: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", code: "", category: "Technical", description: "", clubAdminId: "", facultyCoordinatorId: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, me] = await Promise.all([api("/api/clubs"), api("/api/auth/me")]);
      setClubs(c.clubs);
      setUser(me.user);
      if (["super_admin", "admin"].includes(me.user.role)) {
        const u = await api("/api/users?roles=club_admin,faculty");
        setStaff({ admins: u.users.filter((x: any) => x.role === "club_admin" && x.isActive), faculty: u.users.filter((x: any) => x.role === "faculty" && x.isActive) });
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const join = async (club: any) => {
    try {
      await api(`/api/clubs/${club.id}/join`, { body: {} });
      toast(`You joined ${club.name}`, "success");
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api("/api/clubs", { body: { ...f, clubAdminId: Number(f.clubAdminId), facultyCoordinatorId: Number(f.facultyCoordinatorId) } });
      toast("Club created", "success");
      setOpen(false);
      load();
    } catch (err) {
      setFormError(errMsg(err));
    }
  };

  const inst = user && ["super_admin", "admin"].includes(user.role);
  return (
    <div>
      <PageHeader icon={<Users className="w-6 h-6 text-indigo-400" />} title="Clubs & societies" subtitle="Browse recognised student organisations, see their leadership and join as a student." actions={inst && <button className={btn.primary} onClick={() => { setOpen(true); setFormError(null); }}><Plus className="w-4 h-4" /> Create club</button>} />
      <ErrorBox message={error} />
      {loading ? <Spinner /> : clubs.length === 0 ? <Empty title="No clubs yet" hint="An administrator can create the first club." /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {clubs.map((c) => (
            <article key={c.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-bold text-indigo-300 bg-indigo-950 border border-indigo-800 px-2 py-0.5 rounded">{c.category}</span><span className="flex items-center gap-2">{c.isDemo && <DemoBadge />}{c.isArchived && <span className="text-[10px] text-amber-300 border border-amber-800 rounded px-1.5">ARCHIVED</span>}<span className="text-xs font-mono font-bold text-slate-400">{c.code}</span></span></div>
                <h2 className="text-lg font-bold text-white">{c.name}</h2>
                <p className="text-xs text-slate-400 mt-1 line-clamp-3">{c.description}</p>
                <p className="text-xs text-slate-400 mt-3"><strong className="text-slate-300">Club Admin:</strong> {c.admin?.fullName}<br /><strong className="text-slate-300">Faculty Coordinator:</strong> {c.coordinator?.fullName}</p>
                <div className="grid grid-cols-2 gap-2 mt-3 text-center"><div className="bg-slate-950 rounded-xl p-2"><span className="block text-[10px] text-slate-500 uppercase">Members</span><b className="text-white">{c.memberCount}</b></div><div className="bg-slate-950 rounded-xl p-2"><span className="block text-[10px] text-slate-500 uppercase">Published events</span><b className="text-indigo-300">{c.eventCount}</b></div></div>
              </div>
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800">
                <Link href={`/clubs/${c.id}`} className="text-xs font-semibold text-indigo-400 flex items-center gap-1">Details <ArrowRight className="w-3.5 h-3.5" /></Link>
                {user?.role === "student" && !c.isArchived && (c.myMembership?.status === "active" ? <span className="text-xs text-emerald-300">Member{c.myMembership.roleName ? ` - ${c.myMembership.roleName}` : ""}</span> : <button className={btn.secondary} onClick={() => join(c)}>Join club</button>)}
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Create club">
        <form onSubmit={create} className="space-y-3">
          <ErrorBox message={formError} />
          <Field label="Club name" htmlFor="cn"><input id="cn" className={inputCls} required minLength={3} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Short code (2-10)" htmlFor="cc"><input id="cc" className={`${inputCls} font-mono`} required pattern="[A-Za-z0-9]{2,10}" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Category" htmlFor="ccat"><select id="ccat" className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Description" htmlFor="cd"><textarea id="cd" rows={3} className={inputCls} required minLength={10} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Club Admin" htmlFor="ca"><select id="ca" className={inputCls} required value={f.clubAdminId} onChange={(e) => setF({ ...f, clubAdminId: e.target.value })}><option value="">Select a Club Admin</option>{staff.admins.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>)}</select></Field>
          <Field label="Faculty Coordinator" htmlFor="cf"><select id="cf" className={inputCls} required value={f.facultyCoordinatorId} onChange={(e) => setF({ ...f, facultyCoordinatorId: e.target.value })}><option value="">Select a Faculty Coordinator</option>{staff.faculty.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></Field>
          <button className={`${btn.primary} w-full`}>Create club</button>
        </form>
      </Modal>
    </div>
  );
}
