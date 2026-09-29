"use client";

import React, { useState } from "react";
import { Shield, Check, X, Loader2, AlertCircle } from "lucide-react";

interface DynamicRoleModalProps {
  clubId: number;
  clubName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AVAILABLE_PERMISSIONS = [
  { id: "create_events", label: "Create Events", desc: "Draft and create new event proposals" },
  { id: "edit_events", label: "Edit Events", desc: "Modify event details, timings, and posters" },
  { id: "manage_registrations", label: "Manage Registrations", desc: "View attendee rosters and registrations" },
  { id: "record_attendance", label: "Record Attendance", desc: "Mark attendance & generate dynamic QR check-ins" },
  { id: "manage_members", label: "Manage Members", desc: "Approve, review, or assign club roles" },
  { id: "issue_certificates", label: "Issue Certificates", desc: "Generate official completion credentials" },
  { id: "award_badges", label: "Award Badges", desc: "Award club-specific achievement badges" },
];

export default function DynamicRoleModal({
  clubId,
  clubName,
  isOpen,
  onClose,
  onSuccess,
}: DynamicRoleModalProps) {
  const [roleName, setRoleName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([
    "create_events",
    "manage_registrations",
    "record_attendance",
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const togglePerm = (permId: string) => {
    if (selectedPerms.includes(permId)) {
      setSelectedPerms(selectedPerms.filter((p) => p !== permId));
    } else {
      setSelectedPerms([...selectedPerms, permId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) {
      setError("Please provide a name for this dynamic role.");
      return;
    }
    if (selectedPerms.length === 0) {
      setError("Please select at least one permission for this role.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/clubs/${clubId}/dynamic-roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleName: roleName.trim(),
          permissions: selectedPerms,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create dynamic role");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create dynamic role");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5">
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mb-2">
            <Shield className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white">Define Dynamic Club Role</h3>
          <p className="text-xs text-slate-400">
            For {clubName} • Custom roles and runtime scoped permissions
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-xl flex items-start gap-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Role Title
            </label>
            <input
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g. Vice President, Event Coordinator, Logistics Lead"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Club-Scoped Permissions
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {AVAILABLE_PERMISSIONS.map((perm) => {
                const isChecked = selectedPerms.includes(perm.id);
                return (
                  <div
                    key={perm.id}
                    onClick={() => togglePerm(perm.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      isChecked
                        ? "bg-purple-950/40 border-purple-500/50"
                        : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border text-white transition-colors ${
                        isChecked
                          ? "bg-purple-600 border-purple-500"
                          : "border-slate-600 bg-slate-900"
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white leading-tight">
                        {perm.label}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{perm.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Note: Dynamic permissions are strictly isolated to this club and cannot escalate to Super Admin institutional operations.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Role
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
