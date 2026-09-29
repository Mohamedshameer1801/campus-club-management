"use client";

import React, { useState } from "react";
import { QrCode, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";

interface QRCheckinModalProps {
  eventId?: number;
  eventTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function QRCheckinModal({
  eventId,
  eventTitle,
  isOpen,
  onClose,
  onSuccess,
}: QRCheckinModalProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError("Please paste or enter the dynamic QR attendance code.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      // In case user pasted a JSON string from the QR code
      let cleanedToken = tokenInput.trim();
      try {
        if (cleanedToken.startsWith("{") && cleanedToken.includes("token")) {
          const parsed = JSON.parse(cleanedToken);
          if (parsed.token) cleanedToken = parsed.token;
        }
      } catch (err) {
        // use raw token
      }

      const res = await fetch("/api/qr/verify-and-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: cleanedToken,
          eventId: eventId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Check-in failed");
      }

      setMessage(data.message || "Attendance confirmed successfully via Dynamic QR!");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1800);
    } catch (err: any) {
      setError(err.message || "Failed to confirm check-in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto mb-3">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Dynamic QR Check-in</h3>
          <p className="text-xs text-slate-400 mt-1">
            {eventTitle
              ? `Check-in for: ${eventTitle}`
              : "Scan or enter the dynamic event check-in token"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-xl flex items-start gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl flex items-start gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleCheckin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Enter QR Token or Raw Scanned String
            </label>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="e.g. QR-1-X9K2A-Z4 or JSON payload"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Token is cryptographically verified with time-limited expiration and single-use identity protection.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-600/30"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Verify & Check In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
