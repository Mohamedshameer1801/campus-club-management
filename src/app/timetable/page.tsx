"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Plus, Shield, Trash2 } from "lucide-react";
import { api, errMsg, toast } from "@/lib/client";
import { btn, ConfirmDialog, Empty, ErrorBox, Field, inputCls, Modal, PageHeader, Spinner } from "@/components/ui";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TYPES = ["Class Period", "Short Break", "Lunch Break"];
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const blank = () => ({ id: 0, name: "", workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], effectiveFrom: new Date().toISOString().slice(0, 10), isActive: false, periods: [{ periodLabel: "Period 1", startTime: "09:00", endTime: "09:50", periodType: "Class Period" }] });

const typeStyle = (t: string) => (t === "Class Period" ? "bg-slate-950 border-slate-800" : t === "Lunch Break" ? "bg-amber-950/20 border-amber-900/50" : "bg-teal-950/20 border-teal-900/50");

export default function TimetablePage() {
  const [structures, setStructures] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [replace, setReplace] = useState<null | (() => void)>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [t, me] = await Promise.all([api("/api/timetable"), api("/api/auth/me")]);
      setStructures(t.allStructures);
      setUser(me.user);
      setSelected((cur) => cur ?? t.allStructures[0]?.id ?? null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const isSA = user?.role === "super_admin";
  const current = structures.find((s) => s.id === selected);

  const problems = useMemo(() => {
    if (!draft) return { errors: [] as string[], warnings: [] as string[] };
    const errors: string[] = [], warnings: string[] = [];
    draft.periods.forEach((p: any, i: number) => {
      if (mins(p.endTime) <= mins(p.startTime)) errors.push(`Row ${i + 1} (${p.periodLabel}): end time must be after start time`);
      if (i > 0) {
        const prev = draft.periods[i - 1];
        if (mins(p.startTime) < mins(prev.startTime)) errors.push(`Row ${i + 1}: not in chronological order`);
        else if (mins(p.startTime) < mins(prev.endTime)) errors.push(`Row ${i + 1} overlaps row ${i}`);
        else if (mins(p.startTime) > mins(prev.endTime)) warnings.push(`Gap of ${mins(p.startTime) - mins(prev.endTime)} min before row ${i + 1}`);
      }
    });
    if (draft.workingDays.length === 0) errors.push("Select at least one working day");
    return { errors, warnings };
  }, [draft]);

  const save = async (replaceConflicting = false) => {
    setFormError(null);
    const body = { ...draft, replaceConflicting, structureId: draft.id || undefined, periods: draft.periods.map((p: any, i: number) => ({ ...p, periodNumber: i + 1 })) };
    try {
      const r = await api("/api/timetable/manage", { method: draft.id ? "PUT" : "POST", body });
      toast(`Timetable saved${r.warnings?.length ? ` (${r.warnings.length} warning(s): ${r.warnings[0]})` : ""}`, "success");
      setDraft(null);
      setSelected(r.structure.id);
      load();
    } catch (e: any) {
      if (e.code === "ACTIVE_CONFLICT") setReplace(() => () => save(true));
      else setFormError(errMsg(e));
    }
  };

  const toggle = async (s: any, replaceConflicting = false) => {
    try {
      await api("/api/timetable/manage", { method: "PATCH", body: { structureId: s.id, isActive: !s.isActive, replaceConflicting } });
      toast(s.isActive ? "Structure deactivated" : "Structure activated", "success");
      load();
    } catch (e: any) {
      if (e.code === "ACTIVE_CONFLICT") setReplace(() => () => toggle(s, true));
      else toast(errMsg(e), "error");
    }
  };

  const setP = (i: number, k: string, v: string) => setDraft({ ...draft, periods: draft.periods.map((p: any, j: number) => (j === i ? { ...p, [k]: v } : p)) });

  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader
        icon={<Clock className="w-6 h-6 text-indigo-400" />}
        title="Institutional timetable structures"
        subtitle="Defines period timings (not subject timetables). The OD engine picks the active structure that covers the event's date and weekday. Approved OD records keep their own frozen snapshot, so edits here never rewrite history."
        actions={isSA ? <button className={btn.primary} onClick={() => { setDraft(blank()); setFormError(null); }}><Plus className="w-4 h-4" /> New structure</button> : <span className="text-xs text-slate-400 flex items-center gap-1"><Shield className="w-4 h-4 text-indigo-400" /> Editing is restricted to Super Admin</span>}
      />
      <ErrorBox message={error} />
      {structures.length === 0 ? <Empty title="No timetable structures" hint="A Super Admin must define and activate one before OD requests can be calculated." /> : (
        <div className="grid lg:grid-cols-3 gap-6">
          <ul className="space-y-2" aria-label="Structures">
            {structures.map((s) => (
              <li key={s.id}>
                <button onClick={() => setSelected(s.id)} aria-pressed={selected === s.id} className={`w-full text-left p-4 rounded-2xl border ${selected === s.id ? "bg-slate-800 border-indigo-500/60" : "bg-slate-900 border-slate-800 hover:border-slate-700"}`}>
                  <div className="flex justify-between gap-2"><b className="text-sm text-white">{s.name}</b><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.isActive ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-slate-800 text-slate-400 border-slate-700"}`}>{s.isActive ? "Active" : "Inactive"}</span></div>
                  <p className="text-[11px] text-slate-400 mt-1">{s.workingDaysList.join(", ")}</p>
                  <p className="text-[11px] text-slate-500">Effective {s.effectiveFrom} - version {s.version}</p>
                </button>
              </li>
            ))}
          </ul>
          <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            {current && (<>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div><h2 className="text-lg font-bold text-white">{current.name}</h2><p className="text-xs text-slate-400">Version {current.version} - {current.workingDaysList.join(", ")} - effective {current.effectiveFrom}</p></div>
                {isSA && <div className="flex gap-2">
                  <button className={btn.secondary} onClick={() => { setDraft({ ...current, periods: current.periods.map((p: any) => ({ ...p })) }); setFormError(null); }}>Edit</button>
                  <button className={btn.secondary} onClick={() => toggle(current)}>{current.isActive ? "Deactivate" : "Activate"}</button>
                  <button className={btn.danger} aria-label="Delete structure" onClick={() => setConfirmDelete(current)}><Trash2 className="w-4 h-4" /></button>
                </div>}
              </div>
              <ol className="space-y-2">{current.periods.map((p: any) => (
                <li key={p.periodNumber} className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${typeStyle(p.periodType)}`}>
                  <span className="text-sm text-white font-semibold">{p.periodNumber}. {p.periodLabel} <span className="text-xs text-slate-400 font-normal">({p.durationMinutes} min)</span></span>
                  <span className="flex items-center gap-2"><code className="text-xs text-indigo-300 bg-slate-900 px-2 py-1 rounded border border-slate-800">{p.startTime} - {p.endTime}</code><span className="text-[10px] font-bold text-slate-300 border border-slate-700 rounded-full px-2 py-0.5">{p.periodType}</span></span>
                </li>))}</ol>
            </>)}
          </section>
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit timetable structure" : "New timetable structure"} wide>
        {draft && (
          <form onSubmit={(e) => { e.preventDefault(); if (problems.errors.length === 0) save(); }} className="space-y-4">
            <ErrorBox message={formError} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Structure name" htmlFor="tn"><input id="tn" className={inputCls} required minLength={3} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Effective from" htmlFor="te"><input id="te" type="date" className={inputCls} required value={draft.effectiveFrom} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} /></Field>
            </div>
            <fieldset><legend className="text-xs font-medium text-slate-300 mb-1">Working days</legend><div className="flex flex-wrap gap-2">{DAYS.map((d) => <label key={d} className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${draft.workingDays.includes(d) ? "bg-indigo-950 border-indigo-600 text-indigo-200" : "bg-slate-950 border-slate-700 text-slate-400"}`}><input type="checkbox" className="sr-only" checked={draft.workingDays.includes(d)} onChange={(e) => setDraft({ ...draft, workingDays: e.target.checked ? [...draft.workingDays, d] : draft.workingDays.filter((x: string) => x !== d) })} />{d.slice(0, 3)}</label>)}</div></fieldset>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active (only one active structure may cover a given day)</label>
            <div className="space-y-2">
              <div className="flex justify-between items-center"><b className="text-xs text-slate-300 uppercase tracking-wider">Ordered periods</b><button type="button" className="text-xs text-indigo-400 flex items-center gap-1" onClick={() => { const last = draft.periods[draft.periods.length - 1]; setDraft({ ...draft, periods: [...draft.periods, { periodLabel: `Period ${draft.periods.length + 1}`, startTime: last?.endTime ?? "09:00", endTime: last?.endTime ?? "10:00", periodType: "Class Period" }] }); }}><Plus className="w-3.5 h-3.5" /> Add period</button></div>
              {draft.periods.map((p: any, i: number) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-950 border border-slate-800 rounded-xl p-2">
                  <span className="col-span-1 text-center text-xs text-slate-500">{i + 1}</span>
                  <input aria-label={`Period ${i + 1} label`} className={`${inputCls} col-span-3`} value={p.periodLabel} onChange={(e) => setP(i, "periodLabel", e.target.value)} required />
                  <input aria-label={`Period ${i + 1} start`} type="time" className={`${inputCls} col-span-2`} value={p.startTime} onChange={(e) => setP(i, "startTime", e.target.value)} required />
                  <input aria-label={`Period ${i + 1} end`} type="time" className={`${inputCls} col-span-2`} value={p.endTime} onChange={(e) => setP(i, "endTime", e.target.value)} required />
                  <select aria-label={`Period ${i + 1} type`} className={`${inputCls} col-span-3`} value={p.periodType} onChange={(e) => setP(i, "periodType", e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                  <button type="button" aria-label={`Remove period ${i + 1}`} disabled={draft.periods.length === 1} className="col-span-1 text-slate-500 hover:text-red-400 disabled:opacity-30" onClick={() => setDraft({ ...draft, periods: draft.periods.filter((_: any, j: number) => j !== i) })}><Trash2 className="w-4 h-4 mx-auto" /></button>
                </div>))}
              <p className="text-[11px] text-slate-500">Duration is calculated automatically from start and end times.</p>
            </div>
            {problems.errors.length > 0 && <ul role="alert" className="text-xs text-red-300 bg-red-950/50 border border-red-900 rounded-xl p-3 list-disc list-inside">{problems.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
            {problems.warnings.length > 0 && <ul className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900 rounded-xl p-3 list-disc list-inside">{problems.warnings.map((e) => <li key={e}>Warning: {e}</li>)}</ul>}
            <button className={`${btn.primary} w-full`} disabled={problems.errors.length > 0}>Save structure</button>
          </form>
        )}
      </Modal>
      <ConfirmDialog open={!!replace} title="Replace conflicting active structure?" message="Another active structure already covers one or more of these days. Only one may be active per day. Confirming deactivates the conflicting structure(s); this is audit-logged." confirmLabel="Replace" onCancel={() => setReplace(null)} onConfirm={() => { const r = replace; setReplace(null); r?.(); }} />
      <ConfirmDialog open={!!confirmDelete} danger title={`Delete "${confirmDelete?.name}"?`} message="Structures referenced by OD requests cannot be deleted (they are preserved for auditability - deactivate them instead). Deletion is audit-logged." confirmLabel="Delete" onCancel={() => setConfirmDelete(null)} onConfirm={async () => { const s = confirmDelete; setConfirmDelete(null); try { await api(`/api/timetable/manage?id=${s.id}`, { method: "DELETE" }); toast("Structure deleted", "success"); setSelected(null); load(); } catch (e) { toast(errMsg(e), "error"); } }} />
    </div>
  );
}
