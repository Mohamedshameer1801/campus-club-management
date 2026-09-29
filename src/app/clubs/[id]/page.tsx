"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Shield } from "lucide-react";
import { api, errMsg, toast } from "@/lib/client";
import { btn, ConfirmDialog, DemoBadge, Empty, ErrorBox, Field, inputCls, Spinner, StatusBadge } from "@/components/ui";
import DynamicRoleModal from "@/components/DynamicRoleModal";
type Tab = "roles" | "members" | "events" | "certificate";

export default function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [club, setClub] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("roles");
  const [error, setError] = useState<string | null>(null);
  const [roleModal, setRoleModal] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; run: () => Promise<any> }>(null);
  const [tpl, setTpl] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const c = (await api(`/api/clubs/${id}`)).club;
      setClub(c);
      setTpl((cur: any) => cur ?? c.certificateTemplate);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  if (error && !club) return <div><ErrorBox message={error} /><Link href="/clubs" className="text-xs text-indigo-400">Back to clubs</Link></div>;
  if (!club) return <Spinner />;
  const p = club.permissions;

  const run = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      toast(ok, "success");
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const tabs: [Tab, string][] = [["roles", `Roles (${club.dynamicRoles.length})`], ["members", `Members (${club.memberCount})`], ["events", `Events (${club.events.length})`]];
  if (p.canEditTemplate) tabs.push(["certificate", "Certificate template"]);

  return (
    <div className="space-y-6">
      <Link href="/clubs" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /> Back to clubs</Link>
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col lg:flex-row justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2"><span className="text-xs font-bold text-indigo-300 bg-indigo-950 border border-indigo-800 px-3 py-1 rounded-md">{club.category}</span><span className="text-xs font-mono text-slate-400">{club.code}</span>{club.isDemo && <DemoBadge />}{club.isArchived && <span className="text-xs text-amber-300 border border-amber-800 rounded px-2">Archived</span>}</div>
          <h1 className="text-3xl font-extrabold text-white">{club.name}</h1>
          <p className="text-sm text-slate-300">{club.description}</p>
          <p className="text-xs text-slate-400">Club Admin: <b className="text-white">{club.admin?.fullName}</b> - Faculty Coordinator: <b className="text-white">{club.coordinator?.fullName}</b></p>
        </div>
        <div className="flex flex-wrap lg:flex-col gap-2 lg:min-w-[200px]">
          {p.canManage && !club.isArchived && <button className={btn.primary} onClick={() => setRoleModal(true)}><Plus className="w-4 h-4" /> Define club role</button>}
          {p.canArchive && <button className={club.isArchived ? btn.secondary : btn.danger} onClick={() => setConfirm({ title: club.isArchived ? "Restore club?" : "Archive club?", message: club.isArchived ? "The club becomes visible and joinable again." : "Archived clubs disappear for students, refuse new members and cannot create events. History is preserved.", run: () => api(`/api/clubs/${id}`, { method: "PATCH", body: { isArchived: !club.isArchived } }) })}>{club.isArchived ? "Restore club" : "Archive club"}</button>}
        </div>
      </section>

      <div role="tablist" className="flex gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${tab === k ? "bg-indigo-950 text-indigo-300 border border-indigo-800" : "text-slate-400 hover:text-white"}`}>{label}</button>)}
      </div>

      {tab === "roles" && (club.dynamicRoles.length === 0 ? <Empty title="No club roles defined" hint={p.canManage ? "Create roles such as President or Event Coordinator and choose exactly which club permissions they carry." : "Only the Club Admin sees role details."} /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{club.dynamicRoles.map((r: any) => (
          <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between"><b className="text-white text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-purple-400" />{r.roleName}</b><span className="text-[10px] font-bold text-purple-300 border border-purple-800 rounded px-2 py-0.5">scoped to {club.code}</span></div>
            <div className="flex flex-wrap gap-1.5">{r.permissions.map((x: string) => <span key={x} className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700 font-mono">{x}</span>)}</div>
          </div>))}</div>
      ))}

      {tab === "members" && (club.members.length === 0 ? <Empty title="Member list is restricted" hint={`${club.memberCount} active member(s). Full rosters are visible to the club's staff, its coordinator and administrators.`} /> : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 overflow-x-auto"><table className="w-full text-xs text-left">
          <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="py-2 px-2">Name</th><th className="px-2">Email</th><th className="px-2">Role</th><th className="px-2">Status</th>{(p.canManage || p.canManageMembers) && <th className="px-2 text-right">Manage</th>}</tr></thead>
          <tbody className="divide-y divide-slate-800">{club.members.map((m: any) => (
            <tr key={m.membershipId}>
              <td className="py-2 px-2 text-white font-semibold">{m.fullName}</td><td className="px-2 text-slate-400">{m.email}</td>
              <td className="px-2">{p.canManage && m.status === "active" ? (<><label className="sr-only" htmlFor={`r${m.membershipId}`}>Role for {m.fullName}</label><select id={`r${m.membershipId}`} className="px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs" value={m.roleId ?? ""} onChange={(e) => run(() => api(`/api/clubs/${id}/members`, { method: "PATCH", body: { membershipId: m.membershipId, roleId: e.target.value ? Number(e.target.value) : null } }), "Role updated")}><option value="">General member</option>{club.dynamicRoles.map((r: any) => <option key={r.id} value={r.id}>{r.roleName}</option>)}</select></>) : (m.roleName ?? <span className="text-slate-500">General member</span>)}</td>
              <td className="px-2"><StatusBadge status={m.status === "active" ? "Approved" : "Cancelled"} /> <span className="text-slate-400">{m.status}</span></td>
              {(p.canManage || p.canManageMembers) && <td className="px-2 text-right">{m.status === "active" ? <button className="text-red-400 hover:underline" onClick={() => setConfirm({ title: `Remove ${m.fullName}?`, message: "They lose any club role and leave the club. They cannot rejoin on their own.", run: () => api(`/api/clubs/${id}/members`, { method: "PATCH", body: { membershipId: m.membershipId, status: "removed" } }) })}>Remove</button> : <button className="text-emerald-400 hover:underline" onClick={() => run(() => api(`/api/clubs/${id}/members`, { method: "PATCH", body: { membershipId: m.membershipId, status: "active" } }), "Member reinstated")}>Reinstate</button>}</td>}
            </tr>))}</tbody></table></div>
      ))}

      {tab === "events" && (club.events.length === 0 ? <Empty title="No events to show" /> : (
        <div className="grid md:grid-cols-2 gap-4">{club.events.map((e: any) => (
          <Link key={e.id} href={`/events/${e.id}`} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-2 block">
            <div className="flex justify-between gap-2"><b className="text-white text-sm">{e.title}</b><StatusBadge status={e.status} /></div>
            <p className="text-xs text-slate-400 line-clamp-2">{e.description}</p><p className="text-xs text-slate-500 font-mono">{e.eventDate} {e.startTime}-{e.endTime}</p>
          </Link>))}</div>
      ))}

      {tab === "certificate" && tpl && (
        <form className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 max-w-xl" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/clubs/${id}/certificate-template`, { method: "PUT", body: tpl }), "Certificate template saved"); }}>
          <p className="text-xs text-slate-400">Customises the PDF certificates issued by this club. In the body text you can use {"{name}"}, {"{event}"}, {"{club}"}, {"{date}"} and {"{role}"}.</p>
          <Field label="Certificate heading" htmlFor="t1"><input id="t1" className={inputCls} maxLength={60} value={tpl.headerTitle} onChange={(e) => setTpl({ ...tpl, headerTitle: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Accent colour" htmlFor="t2"><input id="t2" type="color" className="w-full h-10 bg-slate-950 border border-slate-700 rounded-xl" value={tpl.accentColor} onChange={(e) => setTpl({ ...tpl, accentColor: e.target.value })} /></Field>
            <Field label="Signatory name" htmlFor="t3"><input id="t3" className={inputCls} maxLength={60} value={tpl.signatoryName} onChange={(e) => setTpl({ ...tpl, signatoryName: e.target.value })} /></Field>
          </div>
          <Field label="Signatory title" htmlFor="t4"><input id="t4" className={inputCls} maxLength={60} value={tpl.signatoryTitle} onChange={(e) => setTpl({ ...tpl, signatoryTitle: e.target.value })} /></Field>
          <Field label="Body text (optional)" htmlFor="t5"><textarea id="t5" rows={3} maxLength={240} className={inputCls} value={tpl.bodyText} onChange={(e) => setTpl({ ...tpl, bodyText: e.target.value })} /></Field>
          <Field label="Footer text (optional)" htmlFor="t6"><input id="t6" className={inputCls} maxLength={120} value={tpl.footerText} onChange={(e) => setTpl({ ...tpl, footerText: e.target.value })} /></Field>
          <button className={btn.primary}>Save template</button>
        </form>
      )}

      <DynamicRoleModal clubId={Number(id)} clubName={club.name} isOpen={roleModal} onClose={() => setRoleModal(false)} onSuccess={() => { toast("Club role created", "success"); load(); }} />
      <ConfirmDialog open={!!confirm} danger title={confirm?.title ?? ""} message={confirm?.message ?? ""} confirmLabel="Confirm" onCancel={() => setConfirm(null)} onConfirm={() => { const c = confirm; setConfirm(null); if (c) run(c.run, "Done"); }} />
    </div>
  );
}
