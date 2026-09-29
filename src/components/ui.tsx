"use client";

import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { STATUS_STYLES } from "@/lib/client";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_STYLES[status] ?? STATUS_STYLES.Draft}`}>{status}</span>;
}

export function DemoBadge() {
  return <span title="Seeded demo record" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-800">DEMO</span>;
}

export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" className="py-16 text-center text-slate-400 flex items-center justify-center gap-2 text-sm">
      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" aria-hidden /> {label}
    </div>
  );
}

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="py-12 px-6 text-center bg-slate-900 border border-slate-800 rounded-2xl">
      <p className="text-sm font-semibold text-white">{title}</p>
      {hint && <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="p-3 mb-4 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-200 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function PageHeader({ icon, title, subtitle, actions }: { icon?: ReactNode; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          {icon}
          {title}
        </h1>
        {subtitle && <p className="text-xs text-slate-400 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const btn = {
  primary: "px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
  secondary: "px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 border border-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
  success: "px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300",
  danger: "px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300",
};
export const inputCls = "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-400";

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-300 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`bg-slate-900 border border-slate-800 rounded-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} p-6 shadow-2xl max-h-[90vh] overflow-y-auto focus:outline-none`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Confirmation dialog for destructive / irreversible actions. */
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel }: { open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="text-sm text-slate-300 mb-5">{message}</p>
      <div className="flex gap-3">
        <button className={`${btn.secondary} flex-1`} onClick={onCancel}>
          Cancel
        </button>
        <button className={`${danger ? btn.danger : btn.primary} flex-1`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; type: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { message: string; type: string };
      const id = ++n;
      setItems((cur) => [...cur.slice(-3), { id, ...d }]);
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 5000);
    };
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {items.map((t) => (
        <div key={t.id} role={t.type === "error" ? "alert" : "status"} className={`px-4 py-3 rounded-xl border text-xs shadow-xl flex items-start gap-2 ${t.type === "error" ? "bg-red-950 border-red-700 text-red-100" : t.type === "info" ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-emerald-950 border-emerald-700 text-emerald-100"}`}>
          {t.type === "error" ? <AlertCircle className="w-4 h-4 shrink-0" /> : t.type === "info" ? <Info className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
