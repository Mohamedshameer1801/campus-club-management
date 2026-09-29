"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Award, CheckCircle2, FileText, Pencil, Play, QrCode, Send, ShieldCheck, XCircle } from "lucide-react";
import { api, errMsg, fmtDate, toast } from "@/lib/client";
import { btn, ConfirmDialog, DemoBadge, Empty, ErrorBox, Field, inputCls, Modal, Spinner, StatusBadge } from "@/components/ui";
import QRCheckinModal from "@/components/QRCheckinModal";
const ROLES = ["Participant", "Winner", "Runner-up", "Volunteer", "Organizer"];

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<any>(null);
  const [regs, setRegs] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<any>(null);
  const [checkin, setCheckin] = useState(false);
  const [decision, setDecision] = useState<null | "Approved" | "Rejected">(null);
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [confirm, setConfirm] = useState<null | "Cancelled" | "Completed">(null);
  const [editing, setEditing] = useState<any>(null);
  const [role, setRole] = useState("Participant");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const ev = (await api(`/api/events/${id}`)).event;
      setEvent(ev);
      setError(null);
      api(`/api/events/${id}/history`).then((d) => setHistory(d.history)).catch(() => null);
      if (ev.permissions.canViewRegistrations) api(`/api/events/${id}/registrations`).then((d) => setRegs(d.registrations)).catch(() => null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok || r?.message) toast(ok ?? r.message, "success");
      await load();
      return true;
    } catch (e) {
      toast(errMsg(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (!event) return <div><ErrorBox message={error ?? "Event not found"} /><Link href="/events" className="text-xs text-indigo-400">Back to events</Link></div>;
  const p = event.permissions;
  const attended = regs.filter((r) => r.attendanceStatus === "Attended").length;

  const submitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api(`/api/events/${id}/approve`, { body: { decision, rejectionReason: decision === "Rejected" ? reason : undefined, facultyRemarks: remarks || undefined } });
      toast(`Event ${decision?.toLowerCase()}`, "success");
      setDecision(null);
      load();
    } catch (err) {
      setFormError(errMsg(err));
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const { title, description, eventDate, startTime, endTime, venue, maxCapacity } = editing;
      await api(`/api/events/${id}`, { method: "PATCH", body: { title, description, eventDate, startTime, endTime, venue, maxCapacity: Number(maxCapacity) } });
      toast("Event updated", "success");
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errMsg(err));
    }
  };

  const genQr = () => act(async () => setQr(await api("/api/qr/generate", { body: { eventId: Number(id), validityMinutes: 5 } })), "New QR code generated (valid 5 minutes)");

  return (
    <div className="space-y-6">
      <Link href="/events" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /> Back to events</Link>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/clubs/${event.clubId}`} className="text-xs font-bold text-indigo-300 bg-indigo-950 border border-indigo-800 px-3 py-1 rounded-md">{event.club?.name}</Link>
              <StatusBadge status={event.status} />
              {event.isDemo && <DemoBadge />}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{event.title}</h1>
            <p className="text-sm text-slate-300 whitespace-pre-line">{event.description}</p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-800 text-xs">
              {[["Date", event.eventDate], ["Time", `${event.startTime} - ${event.endTime}`], ["Venue", event.venue], ["Faculty Coordinator", event.coordinator?.fullName ?? "-"]].map(([k, v]) => (
                <div key={k}><dt className="text-[11px] text-slate-500">{k}</dt><dd className="font-semibold text-white">{v}</dd></div>
              ))}
              <div><dt className="text-[11px] text-slate-500">Registered</dt><dd className="font-semibold text-white">{event.registeredCount} / {event.maxCapacity}</dd></div>
            </dl>
          </div>

          <div className="flex flex-col gap-2 lg:min-w-[230px]" aria-label="Actions">
            {p.canRegister && <button className={btn.primary} disabled={busy} onClick={() => act(() => api(`/api/events/${id}/register`, { body: {} }), "You are registered!")}>Register for event</button>}
            {event.userRegistration && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-center text-xs text-emerald-300 font-semibold">
                <CheckCircle2 className="w-4 h-4 inline mr-1" /> Registered - attendance: {event.userRegistration.attendanceStatus}
              </div>
            )}
            {p.canApplyOd && <Link href={`/od?eventId=${event.id}`} className={btn.primary}><FileText className="w-4 h-4" /> Apply for On-Duty</Link>}
            {event.userRegistration && event.status === "Ongoing" && <button className={btn.secondary} onClick={() => setCheckin(true)}><QrCode className="w-4 h-4" /> QR check-in</button>}
            {p.canDecide && <button className={btn.success} onClick={() => { setDecision("Approved"); setFormError(null); }}><ShieldCheck className="w-4 h-4" /> Review proposal</button>}
            {p.canEdit && <button className={btn.secondary} onClick={() => { setEditing({ ...event }); setFormError(null); }}><Pencil className="w-4 h-4" /> Edit event</button>}
            {p.canSubmit && <button className={btn.primary} disabled={busy} onClick={() => act(() => api(`/api/events/${id}/submit`, { body: {} }))}><Send className="w-4 h-4" /> {event.status === "Rejected" ? "Resubmit for approval" : "Submit for faculty approval"}</button>}
            {p.canChangeStatus && event.status === "Approved" && <button className={btn.secondary} disabled={busy} onClick={() => act(() => api(`/api/events/${id}/status`, { body: { status: "Ongoing" } }))}><Play className="w-4 h-4" /> Start event</button>}
            {p.canGenerateQr && <button className={btn.secondary} disabled={busy} onClick={genQr}><QrCode className="w-4 h-4" /> {qr ? "Refresh QR code" : "Generate attendance QR"}</button>}
            {p.canChangeStatus && event.status === "Ongoing" && <button className={btn.secondary} disabled={busy} onClick={() => setConfirm("Completed")}>Mark completed</button>}
            {p.canChangeStatus && ["Draft", "Pending Faculty Approval", "Rejected", "Approved", "Ongoing"].includes(event.status) && <button className={btn.danger} onClick={() => setConfirm("Cancelled")}>Cancel event</button>}
          </div>
        </div>

        {event.status === "Rejected" && (
          <div role="alert" className="mt-5 p-4 bg-red-950/60 border border-red-800 rounded-xl flex gap-3 text-xs">
            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            <div><p className="font-bold text-red-300">Rejected by the Faculty Coordinator</p><p className="text-red-100 mt-1">{event.rejectionReason}</p><p className="text-red-300/80 mt-1">Edit the event if needed and resubmit it - it stays hidden from students until approved.</p></div>
          </div>
        )}
        {event.facultyRemarks && event.status !== "Rejected" && <p className="mt-4 text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-xl p-3"><ShieldCheck className="w-4 h-4 inline text-emerald-400 mr-1" /> Faculty remarks: &ldquo;{event.facultyRemarks}&rdquo;</p>}
      </section>

      {qr && (
        <section className="bg-slate-900 border border-indigo-500/40 rounded-3xl p-6 text-center space-y-3" aria-label="Attendance QR code">
          <p className="text-xs font-semibold text-emerald-300">Live attendance code - expires {new Date(qr.expiresAt).toLocaleTimeString()}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data-URL QR code */}
          <img src={qr.qrDataUrl} alt="Attendance QR code for this event" className="w-64 h-64 mx-auto bg-white p-3 rounded-2xl" />
          <p className="text-[11px] text-slate-400 break-all font-mono">{qr.checkinUrl}</p>
          <p className="text-[11px] text-slate-500">Students scan this with their phone (they must be signed in and registered). Generating a new code invalidates the previous one.</p>
        </section>
      )}

      {history.length > 0 && (
        <section aria-label="Approval history" className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-3">Approval history</h2>
          <ol className="space-y-2 text-xs">{history.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-3 gap-y-1 bg-slate-950 rounded-xl p-3"><span className="text-slate-500 w-36">{fmtDate(h.createdAt)}</span><span className="text-white font-semibold">{h.action}{h.isOverride ? " (override)" : ""}</span><span className="text-slate-400">by {h.actor}</span>{h.remarks && <span className="text-slate-300 italic">&ldquo;{h.remarks}&rdquo;</span>}</li>
          ))}</ol>
        </section>
      )}

      {p.canViewRegistrations && (
        <section aria-label="Registrations and attendance" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><h2 className="text-base font-bold text-white">Registrations &amp; attendance</h2><p className="text-xs text-slate-400">A registration is not attendance. Confirm attendance to unlock certificates. Confirmed: <strong className="text-emerald-400">{attended}</strong> / {regs.length}</p></div>
            {p.canIssueCertificates && (
              <div className="flex items-center gap-2">
                <label htmlFor="role" className="sr-only">Participation role</label>
                <select id="role" className={`${inputCls} w-auto`} value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                <button className={btn.primary} disabled={busy} onClick={() => act(() => api("/api/certificates/bulk-issue", { body: { eventId: Number(id), defaultRole: role } }))}><Award className="w-4 h-4" /> Issue to all attendees</button>
              </div>
            )}
          </div>
          {regs.length === 0 ? <Empty title="No registrations yet" /> : (
            <div className="overflow-x-auto"><table className="w-full text-xs text-left">
              <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="py-2 px-2">Student</th><th className="px-2">RA Number</th><th className="px-2">Department</th><th className="px-2">Method</th><th className="px-2">Status</th><th className="px-2 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-800">{regs.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 px-2 text-white font-semibold">{r.fullName}</td><td className="px-2 font-mono text-indigo-300">{r.raNumber}</td><td className="px-2 text-slate-300">{r.department}</td><td className="px-2 text-slate-400">{r.checkInMethod ?? "-"}</td><td className="px-2"><StatusBadge status={r.attendanceStatus} /></td>
                  <td className="px-2 text-right space-x-1 whitespace-nowrap">
                    {p.canRecordAttendance && !r.hasCertificate && <>
                      {r.attendanceStatus !== "Attended" && <button className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => act(() => api(`/api/events/${id}/attendance`, { body: { registrationId: r.id, attendanceStatus: "Attended" } }))}>Attended</button>}
                      {r.attendanceStatus !== "Absent" && <button className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200" onClick={() => act(() => api(`/api/events/${id}/attendance`, { body: { registrationId: r.id, attendanceStatus: "Absent" } }))}>Absent</button>}
                    </>}
                    {p.canIssueCertificates && r.attendanceStatus === "Attended" && !r.hasCertificate && <button className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white" onClick={() => act(() => api("/api/certificates", { body: { eventId: Number(id), registrationId: r.id, participationRole: role } }))}>Issue certificate</button>}
                    {r.hasCertificate && <span className="text-emerald-400">Certificate issued</span>}
                  </td>
                </tr>))}</tbody>
            </table></div>
          )}
        </section>
      )}

      <Modal open={!!decision} onClose={() => setDecision(null)} title="Faculty Coordinator decision">
        <form onSubmit={submitDecision} className="space-y-4">
          <ErrorBox message={formError} />
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Decision">
            {(["Approved", "Rejected"] as const).map((d) => <button type="button" key={d} role="radio" aria-checked={decision === d} onClick={() => setDecision(d)} className={`py-2 rounded-xl text-xs font-bold border ${decision === d ? (d === "Approved" ? "bg-emerald-950 border-emerald-500 text-emerald-300" : "bg-red-950 border-red-500 text-red-300") : "bg-slate-950 border-slate-800 text-slate-400"}`}>{d === "Approved" ? "Approve" : "Reject"}</button>)}
          </div>
          {decision === "Rejected" ? <Field label="Rejection reason (required)" htmlFor="rr"><textarea id="rr" required rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field> : <Field label="Remarks (optional)" htmlFor="rm"><textarea id="rm" rows={2} className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>}
          <button className={`${decision === "Rejected" ? btn.danger : btn.success} w-full`}>Submit decision</button>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit event">
        {editing && (
          <form onSubmit={saveEdit} className="space-y-3">
            <ErrorBox message={formError} />
            <Field label="Title" htmlFor="et"><input id="et" className={inputCls} required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Description" htmlFor="ed"><textarea id="ed" rows={3} className={inputCls} required value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Date" htmlFor="edt"><input id="edt" type="date" className={inputCls} value={editing.eventDate} onChange={(e) => setEditing({ ...editing, eventDate: e.target.value })} /></Field>
              <Field label="Start" htmlFor="es"><input id="es" type="time" className={inputCls} value={editing.startTime} onChange={(e) => setEditing({ ...editing, startTime: e.target.value })} /></Field>
              <Field label="End" htmlFor="ee"><input id="ee" type="time" className={inputCls} value={editing.endTime} onChange={(e) => setEditing({ ...editing, endTime: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Venue" htmlFor="ev"><input id="ev" className={inputCls} value={editing.venue} onChange={(e) => setEditing({ ...editing, venue: e.target.value })} /></Field>
              <Field label="Capacity" htmlFor="ec"><input id="ec" type="number" min={1} className={inputCls} value={editing.maxCapacity} onChange={(e) => setEditing({ ...editing, maxCapacity: e.target.value })} /></Field>
            </div>
            <button className={`${btn.primary} w-full`}>Save changes</button>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        danger={confirm === "Cancelled"}
        title={confirm === "Cancelled" ? "Cancel this event?" : "Mark event as completed?"}
        message={confirm === "Cancelled" ? "Registered students are notified and the event can no longer be reopened. This cannot be undone." : "Completing the event closes check-in and allows certificates to be issued to confirmed attendees."}
        confirmLabel={confirm === "Cancelled" ? "Cancel event" : "Mark completed"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const s = confirm; setConfirm(null); act(() => api(`/api/events/${id}/status`, { body: { status: s } })); }}
      />
      <QRCheckinModal eventId={Number(id)} eventTitle={event.title} isOpen={checkin} onClose={() => setCheckin(false)} onSuccess={load} />
    </div>
  );
}
