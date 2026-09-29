"use client";

import React from "react";
import { Award, Download, CheckCircle, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";

interface CertificateProps {
  id?: number;
  certificateNumber: string;
  studentName: string;
  raNumber?: string;
  department?: string;
  eventTitle: string;
  clubName: string;
  eventDate: string;
  participationRole: string;
  issuedAt: string;
}

export default function CertificateCard({
  id,
  certificateNumber,
  studentName,
  raNumber,
  department,
  eventTitle,
  clubName,
  eventDate,
  participationRole,
  issuedAt,
}: CertificateProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Certificate Header Action Bar */}
      <div className="bg-slate-950 px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-200">
            Official Institutional Credential
          </span>
          <span className="text-xs text-slate-500 font-mono">#{certificateNumber}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/verify-certificate/${certificateNumber}`}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium mr-2"
          >
            Public Registry <ExternalLink className="w-3 h-3" />
          </Link>
          {id && (
            <a
              href={`/api/certificates/${id}/pdf`}
              download
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </a>
          )}
          <button onClick={handlePrint} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold">
            Print
          </button>
        </div>
      </div>

      {/* Visual Formal Certificate Canvas */}
      <div className="p-8 sm:p-12 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden text-center border-8 border-slate-800/80 m-4 rounded-xl">
        {/* Decorative corner ornaments */}
        <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-amber-500/60" />
        <div className="absolute top-2 right-2 w-8 h-8 border-t-2 border-r-2 border-amber-500/60" />
        <div className="absolute bottom-2 left-2 w-8 h-8 border-b-2 border-l-2 border-amber-500/60" />
        <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-amber-500/60" />

        {/* Institutional Crest / Icon */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500/20 to-indigo-500/20 border-2 border-amber-500/40 flex items-center justify-center mx-auto mb-4 text-amber-400 shadow-inner">
          <Award className="w-8 h-8 stroke-[1.5]" />
        </div>

        <p className="text-xs tracking-widest uppercase font-semibold text-amber-400/90 mb-1">
          Campus Institutional Council
        </p>
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide uppercase mb-1">
          Certificate of {participationRole}
        </h2>
        <p className="text-xs text-slate-400 italic mb-6">
          Presented by {clubName} with verified collegiate attendance
        </p>

        <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">This is to certify that</p>
        <p className="text-2xl sm:text-3xl font-serif font-bold text-indigo-300 mb-1">
          {studentName}
        </p>
        <div className="flex items-center justify-center gap-3 text-xs text-slate-400 mb-6 font-mono">
          <span>RA: {raNumber || "-"}</span>
          <span>•</span>
          <span>{department || "Engineering"}</span>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed mb-8">
          has actively participated in and successfully fulfilled all attendance requirements for the campus event{" "}
          <strong className="text-white font-semibold">&ldquo;{eventTitle}&rdquo;</strong> held on{" "}
          <span className="text-indigo-300 font-semibold">{eventDate}</span>.
        </p>

        {/* Signatures & Seal */}
        <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-800/80 items-end max-w-lg mx-auto">
          <div className="text-center">
            <p className="font-serif italic text-sm text-indigo-200">Alex Rivera</p>
            <div className="w-24 h-0.5 bg-slate-700 mx-auto my-1"></div>
            <p className="text-[10px] text-slate-400 uppercase">Club Administrator</p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 rounded-full border border-amber-500/50 bg-amber-500/10 mx-auto flex items-center justify-center text-[10px] text-amber-300 font-bold tracking-tighter">
              SEAL
            </div>
            <p className="text-[9px] text-slate-500 mt-1 font-mono">{certificateNumber}</p>
          </div>

          <div className="text-center">
            <p className="font-serif italic text-sm text-indigo-200">Prof. Alan Thorne</p>
            <div className="w-24 h-0.5 bg-slate-700 mx-auto my-1"></div>
            <p className="text-[10px] text-slate-400 uppercase">Faculty Coordinator</p>
          </div>
        </div>
      </div>
    </div>
  );
}
