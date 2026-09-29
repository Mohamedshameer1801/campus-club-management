"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  XCircle,
  Search,
  Award,
  Calendar,
  CheckCircle2,
  Building2,
  Loader2,
  ArrowLeft,
} from "lucide-react";

export default function PublicVerifyCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [searchId, setSearchId] = useState(id === "search" ? "" : id);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const verifyCertificate = async (certNum: string) => {
    if (!certNum.trim()) return;
    try {
      setLoading(true);
      setSearched(true);
      const res = await fetch(`/api/certificates/verify/${encodeURIComponent(certNum.trim())}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error("Verify error:", err);
      setResult({ isValid: false, error: "Verification server error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id && id !== "search") {
      verifyCertificate(id);
    }
  }, [id]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    verifyCertificate(searchId);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 animate-in fade-in">
      <Link
        href="/certificates"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Credentials
      </Link>

      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">Public Certificate Verification</h1>
        <p className="text-xs text-slate-400">
          Verify official collegiate credentials registered in the campus ledger.
        </p>
      </div>

      {/* Search Input */}
      <form
        onSubmit={handleSearch}
        className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg"
      >
        <Search className="w-4 h-4 text-slate-400 ml-2" />
        <input
          type="text"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          placeholder="Enter Certificate ID, e.g. CERT-2026-TCC-99410"
          className="flex-1 px-2 py-2 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow"
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Verify
        </button>
      </form>

      {/* Result Display */}
      {searched && (
        <div className="animate-in fade-in">
          {result?.isValid ? (
            <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Verified Institutional Credential
                </div>
                <span className="font-mono text-xs text-slate-400 font-semibold">
                  #{result.certificate.certificateNumber}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="block text-slate-500 font-medium text-[11px]">Recipient</span>
                  <span className="font-bold text-white text-sm">{result.certificate.studentName}</span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-[11px]">
                    Institutional RA (Masked)
                  </span>
                  <span className="font-mono font-semibold text-indigo-300">
                    {result.certificate.maskedRANumber}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-[11px]">Event Title</span>
                  <span className="font-bold text-white">{result.certificate.eventTitle}</span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-[11px]">Hosting Club</span>
                  <span className="font-semibold text-slate-300">{result.certificate.clubName}</span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-[11px]">Event Date</span>
                  <span className="font-semibold text-slate-300">{result.certificate.eventDate}</span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-[11px]">Role</span>
                  <span className="font-semibold text-amber-400">
                    {result.certificate.participationRole}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 text-center">
                Verified against official institutional participation & attendance database. Personal identifier data is masked for student privacy compliance.
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-red-800/60 rounded-3xl p-8 text-center space-y-3">
              <XCircle className="w-10 h-10 text-red-400 mx-auto" />
              <h3 className="text-base font-bold text-white">Certificate Verification Failed</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No verified institutional certificate matching this ID was found in the official registry. Please verify the certificate number.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
