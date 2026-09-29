"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Search,
  Filter,
  Plus,
  CheckCircle2,
  AlertCircle,
  QrCode,
  ArrowRight,
  Loader2,
  FileText,
} from "lucide-react";
import QRCheckinModal from "@/components/QRCheckinModal";
import { toast } from "@/lib/client";

export default function EventsDirectoryPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clubFilter, setClubFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // Creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    clubId: "",
    title: "",
    description: "",
    eventDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    startTime: "10:00",
    endTime: "13:00",
    venue: "",
    maxCapacity: 100,
    submitImmediately: true,
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // QR Modal
  const [selectedEventForQR, setSelectedEventForQR] = useState<any>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [eventsRes, clubsRes, meRes] = await Promise.all([
        fetch("/api/events"),
        fetch("/api/clubs"),
        fetch("/api/auth/me"),
      ]);

      if (eventsRes.ok) {
        const ed = await eventsRes.json();
        setEvents(ed.events || []);
      }
      if (clubsRes.ok) {
        const cd = await clubsRes.json();
        setClubs(cd.clubs || []);
        
      }
      if (meRes.ok) {
        const md = await meRes.json();
        setUser(md.user);
      }
    } catch (err) {
      console.error("Events fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRegister = async (eventId: number) => {
    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to register");
        return;
      }
      toast("Successfully registered for the event!");
      loadData();
    } catch (err) {
      console.error("Register error:", err);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.clubId && manageableClubs[0]) createForm.clubId = String(manageableClubs[0].id);
    try {
      setCreateLoading(true);
      setCreateError(null);
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create event");
      }
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create event");
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.title.toLowerCase().includes(search.toLowerCase()) ||
      ev.description.toLowerCase().includes(search.toLowerCase()) ||
      ev.venue.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === "all" || ev.status === statusFilter;
    const matchesClub = clubFilter === "all" || ev.clubId.toString() === clubFilter;

    return matchesSearch && matchesStatus && matchesClub;
  });

  const manageableClubs = clubs.filter(
    (c) => user && (user.role === "super_admin" || user.role === "admin" || user.managedClubIds?.includes(c.id) || user.clubRoles?.some((r: any) => r.clubId === c.id && r.permissions.includes("create_events")))
  );
  const canCreate =
    user &&
    (user.role === "super_admin" ||
      user.role === "admin" ||
      user.role === "club_admin" ||
      user.clubRoles?.some((r: any) => r.permissions.includes("create_events")));

  return (
    <div className="space-y-6">
      {/* Page Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-indigo-400" />
            Campus Events Directory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Discover workshops, hackathons, seminars, and submit On-Duty applications.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedEventForQR({})}
            aria-label="Open QR check-in"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-all shadow-sm"
          >
            <QrCode className="w-4 h-4 text-indigo-400" />
            QR Check-in
          </button>

          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/30"
            >
              <Plus className="w-4 h-4" />
              Create Event
            </button>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events, venues, topics..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <select
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Clubs</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id.toString()}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="Approved">Approved (Open for Registration)</option>
            <option value="Pending Faculty Approval">Pending Faculty Approval</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Completed">Completed</option>
            <option value="Draft">Draft</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          Loading campus events...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <Calendar className="w-10 h-10 text-slate-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-white">No matching events found</p>
          <p className="text-xs text-slate-400 mt-1">Try modifying your filters or search keywords.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((ev) => {
            const isRegistered = Boolean(ev.userRegistration);
            const isFull = ev.registeredCount >= ev.maxCapacity;

            return (
              <div
                key={ev.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between transition-all"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                      {ev.club?.code || "CAMPUS"}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        ev.status === "Approved"
                          ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                          : ev.status === "Completed"
                          ? "bg-purple-950 text-purple-400 border-purple-800"
                          : ev.status === "Pending Faculty Approval"
                          ? "bg-amber-950 text-amber-400 border-amber-800"
                          : ev.status === "Rejected"
                          ? "bg-red-950 text-red-400 border-red-800"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      {ev.status}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white line-clamp-1">{ev.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
                    {ev.description}
                  </p>

                  <div className="space-y-2 text-xs text-slate-400 mt-4 border-t border-slate-800/80 pt-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{ev.eventDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      <span>
                        {ev.startTime} - {ev.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="truncate">{ev.venue}</span>
                    </div>
                  </div>

                  {/* Capacity Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>Roster capacity</span>
                      <span className="font-semibold text-white">
                        {ev.registeredCount} / {ev.maxCapacity}
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            (ev.registeredCount / (ev.maxCapacity || 1)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="bg-slate-950/70 p-4 border-t border-slate-800 flex items-center justify-between gap-2">
                  <Link
                    href={`/events/${ev.id}`}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    View Details <ArrowRight className="w-3 h-3" />
                  </Link>

                  {user?.role === "student" && ev.status === "Approved" && (
                    <>
                      {isRegistered ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-800/80 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 className="w-3 h-3" /> Registered
                          </span>
                          <Link
                            href={`/od?eventId=${ev.id}`}
                            className="text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-lg shadow transition-all"
                          >
                            Apply OD
                          </Link>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRegister(ev.id)}
                          disabled={isFull}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold transition-all shadow"
                        >
                          {isFull ? "Event Full" : "Register Now"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-1">Create New Collegiate Event</h3>
            <p className="text-xs text-slate-400 mb-4">
              Submit your event proposal for Faculty Coordinator approval.
            </p>

            {createError && (
              <div className="p-3 mb-4 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Select Club</label>
                <select
                  value={createForm.clubId}
                  onChange={(e) => setCreateForm({ ...createForm, clubId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  required
                >
                  {manageableClubs.map((c) => (
                    <option key={c.id} value={c.id.toString()}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Event Title</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Autonomous Robotics Hackathon 2026"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Explain event agenda, technical deliverables, and prerequisites..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Event Date</label>
                  <input
                    type="date"
                    value={createForm.eventDate}
                    onChange={(e) => setCreateForm({ ...createForm, eventDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={createForm.startTime}
                    onChange={(e) => setCreateForm({ ...createForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">End Time</label>
                  <input
                    type="time"
                    value={createForm.endTime}
                    onChange={(e) => setCreateForm({ ...createForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Venue</label>
                  <input
                    type="text"
                    value={createForm.venue}
                    onChange={(e) => setCreateForm({ ...createForm, venue: e.target.value })}
                    placeholder="e.g. Auditorium Hall 4"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Capacity</label>
                  <input
                    type="number"
                    value={createForm.maxCapacity}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, maxCapacity: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="submitImmediately"
                  checked={createForm.submitImmediately}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, submitImmediately: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600"
                />
                <label htmlFor="submitImmediately" className="text-xs text-slate-300">
                  Submit immediately for Faculty Coordinator approval (otherwise save as Draft)
                </label>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-300 bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
                >
                  {createLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {createForm.submitImmediately ? "Submit for Approval" : "Save Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Check-in Modal */}
      {selectedEventForQR && (
        <QRCheckinModal
          isOpen={Boolean(selectedEventForQR)}
          onClose={() => setSelectedEventForQR(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
