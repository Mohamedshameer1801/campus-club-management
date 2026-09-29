"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Send,
  Loader2,
  Users,
  Info,
} from "lucide-react";

export default function OnDutyManagementPage() {
  const [user, setUser] = useState<any>(null);
  const [odList, setOdList] = useState<any[]>([]);
  const [registeredEvents, setRegisteredEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);

  // Overlap calculation preview
  const [overlapCalc, setOverlapCalc] = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Review modal for Class Mentor
  const [selectedODForReview, setSelectedODForReview] = useState<any>(null);
  const [reviewDecision, setReviewDecision] = useState<"Approved" | "Rejected">("Approved");
  const [mentorRemarks, setMentorRemarks] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [meRes, odRes, evRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/od"),
        fetch("/api/events"),
      ]);

      if (meRes.ok) {
        const md = await meRes.json();
        setUser(md.user);
      }
      if (odRes.ok) {
        const od = await odRes.json();
        setOdList(od.onDutyRequests || []);
      }
      if (evRes.ok) {
        const ed = await evRes.json();
        // Registered events for this user
        const regEvents = (ed.events || []).filter((e: any) => e.permissions?.canApplyOd);
        setRegisteredEvents(regEvents);
        if (regEvents.length > 0 && !selectedEventId) {
          setSelectedEventId(regEvents[0].id.toString());
          calculateOverlap(regEvents[0].id);
        }
      }
    } catch (err) {
      console.error("OD page load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const calculateOverlap = async (eventId: number) => {
    try {
      setCalcLoading(true);
      const res = await fetch("/api/od/calculate-overlap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) {
        const data = await res.json();
        setOverlapCalc(data);
      }
    } catch (err) {
      console.error("Calculate overlap error:", err);
    } finally {
      setCalcLoading(false);
    }
  };

  const handleEventSelect = (eventIdStr: string) => {
    setSelectedEventId(eventIdStr);
    if (eventIdStr) {
      calculateOverlap(Number(eventIdStr));
    } else {
      setOverlapCalc(null);
    }
  };

  const handleApplyOD = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId) {
      setApplyError("Please select a registered event.");
      return;
    }
    if (!reason.trim()) {
      setApplyError("Please state the reason for your OD application.");
      return;
    }

    try {
      setApplyLoading(true);
      setApplyError(null);
      setApplySuccess(null);

      const res = await fetch("/api/od/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: Number(selectedEventId),
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit OD application");
      }

      setApplySuccess("On-Duty application submitted and routed to your Class Mentor!");
      setReason("");
      loadData();
    } catch (err: any) {
      setApplyError(err.message || "Failed to submit OD application");
    } finally {
      setApplyLoading(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedODForReview) return;

    try {
      setReviewLoading(true);
      const res = await fetch(`/api/od/${selectedODForReview.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: reviewDecision,
          mentorRemarks: mentorRemarks.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit review");

      setSelectedODForReview(null);
      setMentorRemarks("");
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to submit decision");
    } finally {
      setReviewLoading(false);
    }
  };

  const isFaculty = user?.role === "faculty" || user?.role === "super_admin" || user?.role === "admin";
  const isStudent = user?.role === "student";

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Page Title */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-400" />
          On-Duty (OD) Academic Exemption System
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Automated timetable overlap calculations, Class Mentor approval routing, and immutable historical period snapshots.
        </p>
      </div>

      {/* Student: New OD Application Section */}
      {isStudent && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <FileText className="w-4 h-4" /> Step 1 & 2: Apply for On-Duty (OD)
          </div>

          {registeredEvents.length === 0 ? (
            <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 text-center text-xs text-slate-400">
              <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-300">
                You must first register for an approved event before applying for OD.
              </p>
              <Link
                href="/events"
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow"
              >
                Browse & Register for Events <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleApplyOD} className="space-y-6">
              {applyError && (
                <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{applyError}</span>
                </div>
              )}

              {applySuccess && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{applySuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Select Your Registered Event
                    </label>
                    <select
                      value={selectedEventId}
                      onChange={(e) => handleEventSelect(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                      required
                    >
                      {registeredEvents.map((ev) => (
                        <option key={ev.id} value={ev.id.toString()}>
                          {ev.title} ({ev.eventDate} • {ev.startTime}-{ev.endTime})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Reason for OD Application
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Representing department in collegiate AI Hackathon as team developer..."
                      rows={3}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Class Mentor Routing Rule:
                    </p>
                    <p className="text-[11px] text-slate-400">
                      This OD application routes specifically to your assigned Class Mentor (
                      <strong className="text-white">
                        {user?.studentProfile?.mentorName || "Prof. Alan Thorne"}
                      </strong>
                      ) for review, maintaining institutional academic separation from club organizers.
                    </p>
                  </div>
                </div>

                {/* Overlap Calculation Box */}
                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      Step 3: Timetable Engine Calculation
                    </span>
                    {calcLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />}
                  </div>

                  {overlapCalc ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                        <span className="text-slate-400">Affected Academic Periods:</span>
                        <span className="font-bold text-indigo-300 text-sm">
                          {overlapCalc.affectedPeriods.length} Class Periods
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                        <span className="text-slate-400">Total Academic Minutes:</span>
                        <span className="font-bold text-white text-sm">
                          {overlapCalc.totalAcademicMinutes} mins
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 font-semibold block mb-1">
                          Overlapping Class Periods:
                        </span>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {overlapCalc.affectedPeriods.map((p: any, idx: number) => (
                            <div
                              key={idx}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] flex items-center justify-between"
                            >
                              <span className="font-semibold text-white">{p.periodLabel}</span>
                              <span className="font-mono text-slate-400">
                                {p.startTime} - {p.endTime} ({p.durationMinutes}m)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-[10px] text-indigo-300 flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          Notice: Institutional lunch and short breaks are excluded from missed academic hours as required by institutional policy.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-500">
                      Select an event to calculate timetable overlap.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={applyLoading || !selectedEventId}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                >
                  {applyLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit On-Duty Application
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* OD Tracking & Mentor Review Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              {isFaculty ? "Student On-Duty Requests for Review" : "Your OD Application History"}
            </h3>
            <p className="text-xs text-slate-400">
              {isFaculty
                ? "Review academic period overlaps and approve/reject OD requests as Class Mentor."
                : "Auditable historical records with immutable frozen period snapshots."}
            </p>
          </div>
        </div>

        {odList.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No On-Duty applications recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Event</th>
                  {isFaculty && <th className="py-3 px-3">Student & RA Number</th>}
                  <th className="py-3 px-3">Event Date & Time</th>
                  <th className="py-3 px-3">Affected Periods</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Mentor Remarks</th>
                  {isFaculty && <th className="py-3 px-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {odList.map((od) => (
                  <tr key={od.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-semibold text-white">
                      {od.eventTitle}
                      <span className="block text-[11px] text-slate-400 font-normal mt-0.5">
                        {od.reason}
                      </span>
                    </td>
                    {isFaculty && (
                      <td className="py-3 px-3">
                        <span className="font-semibold text-white">{od.studentName}</span>
                        <span className="block font-mono text-[10px] text-indigo-300">
                          {od.raNumber} • {od.department}
                        </span>
                      </td>
                    )}
                    <td className="py-3 px-3 text-slate-300">
                      <span>{od.eventDate}</span>
                      <span className="block font-mono text-[11px] text-slate-500">
                        {od.startTime} - {od.endTime}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-indigo-300">
                        {od.affectedPeriods?.length || 0} Periods
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        ({od.totalAcademicMinutes} academic mins)
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          od.status === "Approved"
                            ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                            : od.status === "Rejected"
                            ? "bg-red-950 text-red-400 border-red-800"
                            : "bg-amber-950 text-amber-400 border-amber-800"
                        }`}
                      >
                        {od.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-300 italic">
                      {od.mentorRemarks || "-"}
                    </td>
                    {isFaculty && (
                      <td className="py-3 px-3 text-right">
                        {od.canReview ? (
                          <button
                            onClick={() => {
                              setSelectedODForReview(od);
                              setReviewDecision("Approved");
                              setMentorRemarks("");
                            }}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                          >
                            Review & Decide
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500">Decided</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Class Mentor Decision Modal */}
      {selectedODForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Class Mentor Review</h3>
            <p className="text-xs text-slate-400 mb-4">
              Review On-Duty application for {selectedODForReview.studentName} (
              {selectedODForReview.raNumber}).
            </p>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1.5 mb-4">
              <p>
                <strong>Event:</strong> {selectedODForReview.eventTitle}
              </p>
              <p>
                <strong>Affected Academic Span:</strong>{" "}
                {selectedODForReview.affectedPeriods?.length} Periods (
                {selectedODForReview.totalAcademicMinutes} mins)
              </p>
              <p>
                <strong>Student Reason:</strong> &ldquo;{selectedODForReview.reason}&rdquo;
              </p>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Mentor Decision
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReviewDecision("Approved")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      reviewDecision === "Approved"
                        ? "bg-emerald-950 text-emerald-400 border-emerald-500"
                        : "bg-slate-950 text-slate-400 border-slate-800"
                    }`}
                  >
                    ✓ Approve On-Duty
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewDecision("Rejected")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      reviewDecision === "Rejected"
                        ? "bg-red-950 text-red-400 border-red-500"
                        : "bg-slate-950 text-slate-400 border-slate-800"
                    }`}
                  >
                    ✕ Reject On-Duty
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mentor Remarks (Optional)
                </label>
                <textarea
                  value={mentorRemarks}
                  onChange={(e) => setMentorRemarks(e.target.value)}
                  placeholder="e.g. Approved. Academic makeup notes submitted to class teacher."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedODForReview(null)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-300 bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewLoading}
                  className={`flex-1 py-2 text-xs font-semibold text-white rounded-xl flex items-center justify-center gap-2 ${
                    reviewDecision === "Approved"
                      ? "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/30"
                      : "bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/30"
                  }`}
                >
                  {reviewLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
