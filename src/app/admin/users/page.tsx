"use client";

import React, { useCallback, useEffect, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { api, errMsg, fmtDate, toast } from "@/lib/client";
import { btn, ConfirmDialog, DemoBadge, ErrorBox, Field, inputCls, Modal, PageHeader, Spinner } from "@/components/ui";
export default function UsersPage() {
  const [me, setMe] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [f, setF] = useState({ fullName: "", email: "", password: "", role: "club_admin", department: "", designation: "", isMentor: true, isCoordinator: true });

  const load = useCallback(async () => {
    try {
      const m = await api("/api/auth/me");
      setMe(m.user);
      setUsers((await api("/api/users")).users);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const roles = me?.role === "super_admin" ? ["admin", "faculty", "club_admin"] : ["club_admin"];

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api("/api/users", { body: { ...f, department: f.role === "faculty" ? f.department : undefined, designation: f.role === "faculty" ? f.designation : undefined } });
      toast("Account created", "success");
      setOpen(false);
      setF({ ...f, fullName: "", email: "", password: "" });
      load();
    } catch (err) {
      setFormError(errMsg(err));
    }
  };

  if (loading) return <Spinner />;
  const shown = users.filter((u) => `${u.fullName} ${u.email} ${u.role}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div>
      <PageHeader icon={<Users className="w-6 h-6 text-indigo-400" />} title="User accounts" subtitle="Create staff accounts and activate or deactivate users. Deactivation ends the user's sessions immediately. Students self-register; Super Admin accounts cannot be created or deactivated through the app." actions={<button className={btn.primary} onClick={() => { setOpen(true); setFormError(null); }}><UserPlus className="w-4 h-4" /> Create account</button>} />
      <ErrorBox message={error} />
      <label htmlFor="uf" className="sr-only">Filter users</label>
      <input id="uf" className={`${inputCls} max-w-sm mb-4`} placeholder="Filter by name, email or role..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="p-3">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th className="pr-3 text-right">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-800">{shown.map((u) => (
            <tr key={u.id}>
              <td className="p-3 text-white font-semibold">{u.fullName} {u.isDemo && <DemoBadge />}</td><td className="text-slate-400">{u.email}</td><td className="text-slate-300">{u.role.replace("_", " ")}</td>
              <td><span className={u.isActive ? "text-emerald-400" : "text-red-400"}>{u.isActive ? "Active" : "Deactivated"}</span></td><td className="text-slate-500">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "never"}</td>
              <td className="pr-3 text-right">{u.id !== me.id && u.role !== "super_admin" && (u.role !== "admin" || me.role === "super_admin") && <button className={u.isActive ? "text-red-400 hover:underline" : "text-emerald-400 hover:underline"} onClick={() => setConfirm(u)}>{u.isActive ? "Deactivate" : "Activate"}</button>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Create account">
        <form onSubmit={create} className="space-y-3">
          <ErrorBox message={formError} />
          <Field label="Role" htmlFor="ur"><select id="ur" className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}</select></Field>
          <Field label="Full name" htmlFor="un"><input id="un" className={inputCls} required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label="Email" htmlFor="ue"><input id="ue" type="email" className={inputCls} required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Initial password" htmlFor="up" hint="8+ characters, letters and digits. Share it securely."><input id="up" type="password" autoComplete="new-password" className={inputCls} required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          {f.role === "faculty" && <>
            <div className="grid grid-cols-2 gap-3"><Field label="Department" htmlFor="ud"><input id="ud" className={inputCls} required value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field><Field label="Designation" htmlFor="ug"><input id="ug" className={inputCls} required value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field></div>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={f.isMentor} onChange={(e) => setF({ ...f, isMentor: e.target.checked })} /> Can be a Class Mentor</label>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={f.isCoordinator} onChange={(e) => setF({ ...f, isCoordinator: e.target.checked })} /> Can be a Faculty Coordinator</label>
          </>}
          <button className={`${btn.primary} w-full`}>Create account</button>
        </form>
      </Modal>
      <ConfirmDialog open={!!confirm} danger={confirm?.isActive} title={`${confirm?.isActive ? "Deactivate" : "Activate"} ${confirm?.fullName}?`} message={confirm?.isActive ? "They are signed out everywhere and cannot sign in until reactivated. Their history is preserved." : "They will be able to sign in again."} confirmLabel={confirm?.isActive ? "Deactivate" : "Activate"} onCancel={() => setConfirm(null)} onConfirm={async () => { const u = confirm; setConfirm(null); try { await api(`/api/users/${u.id}`, { method: "PATCH", body: { isActive: !u.isActive } }); toast("Account updated", "success"); load(); } catch (e) { toast(errMsg(e), "error"); } }} />
    </div>
  );
}
