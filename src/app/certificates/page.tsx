"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Award,
  ShieldCheck,
  Download,
  ExternalLink,
  Search,
  CheckCircle2,
  Loader2,
  Calendar,
} from "lucide-react";
import CertificateCard from "@/components/CertificateCard";

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedCert, setSelectedCert] = useState<any>(null);
  const [searchCertId, setSearchCertId] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [certRes, meRes] = await Promise.all([
        fetch("/api/certificates"),
        fetch("/api/auth/me"),
      ]);

      if (certRes.ok) {
        const cd = await certRes.json();
        setCertificates(cd.certificates || []);
        if (cd.certificates && cd.certificates.length > 0) {
          setSelectedCert(cd.certificates[0]);
        }
      }
      if (meRes.ok) {
        const md = await meRes.json();
        setCurrentUser(md.user);
      }
    } catch (err) {
      console.error("Certificates load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-400" />
            Official Institutional Credentials & Certificates
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tamper-evident certificates awarded only upon verified collegiate event completion and confirmed attendance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/verify-certificate/search"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 shadow-sm"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Public Verification Registry
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          Loading credentials...
        </div>
      ) : certificates.length === 0 ? (
        <div className="p-12 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-3">
          <Award className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Certificates Issued Yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Certificates are automatically generated and awarded after attending an approved collegiate event and having attendance confirmed by the organizers.
          </p>
          <Link
            href="/events"
            className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
          >
            Browse Approved Events
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Certificate Selector List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Issued Certificates ({certificates.length})
            </h3>
            <div className="space-y-2.5">
              {certificates.map((c) => {
                const isSelected = selectedCert?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCert(c)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-800 border-amber-500/60 shadow-lg"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[10px] text-amber-400 font-bold">
                        #{c.certificateNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300">
                        {c.clubName}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white line-clamp-1">{c.eventTitle}</h4>
                    <p className="text-xs text-slate-400 mt-1">Recipient: {c.studentName}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Role: {c.participationRole}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Printable Canvas */}
          <div className="lg:col-span-2">
            {selectedCert && (
              <CertificateCard
                id={selectedCert.id}
                certificateNumber={selectedCert.certificateNumber}
                studentName={selectedCert.studentName}
                raNumber={selectedCert.raNumber}
                department={selectedCert.department}
                eventTitle={selectedCert.eventTitle}
                clubName={selectedCert.clubName}
                eventDate={selectedCert.eventDate}
                participationRole={selectedCert.participationRole}
                issuedAt={selectedCert.issuedAt}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
