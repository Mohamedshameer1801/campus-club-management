"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { api, errMsg, fmtDate, toast } from "@/lib/client";
import { btn, Empty, ErrorBox, inputCls, Modal, PageHeader, Spinner, StatusBadge, Field } from "@/components/ui";
export default function ApprovalsPage() {
  const [user, setUser] = useState<any>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [decided, setDecided] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<any>(null);
  const [decision, setDecision] = useState<"Approved" | "Rejected">("Approved");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [me, ev, an] = await Promise.all([api("/api/auth/me"), api("/api/events?status=" + encodeURIComponent("Pending Faculty Approval")), api("/api/analytics")]);
      setUser(me.user);
      setPending(ev.events.filter((e: any) => e.permissions.canDecide));
      setDecided(an.faculty?.decisions.events ?? []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api(`/api/events/${target.id}/approve`, { body: { decision, rejectionReason: decision === "Rejected" ? reason : undefined, facultyRemarks: remarks || undefined } });
      toast(decision === "Approved" ? `"${target.title}" approved and published.` : `"${target.title}" rejected - the Club Admin was notified.`, "success");
      setTarget(null);
      setReason("");
      setRemarks("");
      load();
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (user && user.role !== "faculty" && user.role !== "super_admin") return <ErrorBox message="Only Faculty Coordinators (and Super Admin overrides) can approve events." />;

  return (
    <div>
      <PageHeader icon={<ClipboardCheck className="w-6 h-6 text-amber-400" />} title="Event approvals" subtitle="Proposals from the clubs you coordinate. Approved events become visible to students; rejected events must be edited and resubmitted by the Club Admin." />
      <ErrorBox message={error} />
      {pending.length === 0 ? (
        <Empty title="Nothing awaiting your approval" hint="New proposals from your clubs will appear here and you will be notified." />
      ) : (
        <div className="grid gap-4">
          {pending.map((ev) => (
            <article key={ev.id} className="bg-slate-900 border border-amber-900/50 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-indigo-300 bg-indigo-950 border border-indigo-800 px-2 py-0.5 rounded">{ev.club?.name}</span><StatusBadge status={ev.status} /></div>
                  <h2 className="text-lg font-bold text-white">{ev.title}</h2>
                  <p className="text-sm text-slate-300">{ev.description}</p>
                  <p className="text-xs text-slate-400 font-mono">{ev.eventDate} - {ev.startTime}-{ev.endTime} - {ev.venue} - capacity {ev.maxCapacity}</p>
                  <p className="text-xs text-slate-500">Proposed by {ev.creator?.fullName} - submitted {fmtDate(ev.updatedAt)}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link href={`/events/${ev.id}`} className={btn.secondary}>Details</Link>
                  <button className={btn.success} onClick={() => { setTarget(ev); setDecision("Approved"); }}>Approve</button>
                  <button className={btn.danger} onClick={() => { setTarget(ev); setDecision("Rejected"); }}>Reject</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <section className="mt-10" aria-label="Decision history">
          <h2 className="text-sm font-bold text-white mb-3">Your recent decisions</h2>
          <ul className="grid md:grid-cols-2 gap-2">{decided.map((d) => (<li key={d.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs"><span className="text-white">{d.title}</span><span className="flex items-center gap-2 text-slate-500">{fmtDate(d.createdAt)} <StatusBadge status={d.action} /></span></li>))}</ul>
        </section>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={`${decision === "Approved" ? "Approve" : "Reject"}: ${target?.title ?? ""}`}>
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox message={formError} />
          {decision === "Rejected" ? (
            <Field label="Rejection reason (required)" htmlFor="reason" hint="The Club Admin sees this and must resubmit after addressing it.">
              <textarea id="reason" required rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          ) : (
            <Field label="Remarks (optional)" htmlFor="remarks">
              <textarea id="remarks" rows={2} className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          )}
          <div className="flex gap-3">
            <button type="button" className={`${btn.secondary} flex-1`} onClick={() => setTarget(null)}>Cancel</button>
            <button className={`${decision === "Approved" ? btn.success : btn.danger} flex-1`} disabled={busy}>{decision === "Approved" ? "Confirm approval" : "Confirm rejection"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
