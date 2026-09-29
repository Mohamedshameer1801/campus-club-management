"use client";

import React, { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { api, errMsg, fmtDate } from "@/lib/client";
import { Empty, ErrorBox, inputCls, PageHeader, Spinner } from "@/components/ui";
export default function AuditPage() {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api("/api/audit-logs?limit=300").then((d) => setLogs(d.auditLogs)).catch((e) => setError(errMsg(e)));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!logs) return <Spinner />;
  const shown = logs.filter((l) => `${l.action} ${l.entityType} ${l.details ?? ""} ${l.userName ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader icon={<ScrollText className="w-6 h-6 text-indigo-400" />} title="Audit log" subtitle="Append-only record of sensitive actions (enforced by database triggers): accounts, clubs, roles, approvals, timetable changes, attendance, certificates and badges. Visible to Super Admin only." />
      <label htmlFor="af" className="sr-only">Filter audit log</label>
      <input id="af" className={`${inputCls} max-w-sm mb-4`} placeholder="Filter by action, entity, actor or detail..." value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? <Empty title="No matching entries" /> : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 uppercase text-[10px]"><tr><th className="p-3">When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody className="divide-y divide-slate-800">{shown.map((l) => (
              <tr key={l.id}><td className="p-3 text-slate-500 whitespace-nowrap">{fmtDate(l.createdAt)}</td><td className="text-white">{l.userName ?? "system"} <span className="text-slate-500">{l.userRole?.replace("_", " ")}</span></td><td className="font-mono text-indigo-300">{l.action}</td><td className="text-slate-400">{l.entityType} #{l.entityId}</td><td className="text-slate-300 max-w-md truncate" title={l.details ?? ""}>{l.details}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
