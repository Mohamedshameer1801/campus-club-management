"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, QrCode, XCircle } from "lucide-react";
import { api, errMsg } from "@/lib/client";
import { btn, Field, inputCls, Spinner } from "@/components/ui";

/** Landing page for the dynamic QR code: /checkin?token=... (the student must be signed in; identity comes from the session). */
export default function CheckinPage() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");

  const checkin = async (token: string) => {
    setState("loading");
    try {
      const r = await api("/api/qr/verify-and-checkin", { body: { token } });
      setMessage(`Attendance confirmed for "${r.eventTitle}".`);
      setState("ok");
    } catch (e) {
      setMessage(errMsg(e));
      setState("error");
    }
  };

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    if (t) checkin(t);
  }, []);

  return (
    <div className="max-w-md mx-auto text-center space-y-5">
      <QrCode className="w-10 h-10 text-indigo-400 mx-auto" aria-hidden />
      <h1 className="text-2xl font-bold text-white">QR check-in</h1>
      {state === "loading" && <Spinner label="Verifying your check-in..." />}
      {state === "ok" && (
        <div role="status" className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-2xl text-emerald-200 text-sm flex items-center gap-2 justify-center">
          <CheckCircle2 className="w-5 h-5" /> {message}
        </div>
      )}
      {state === "error" && (
        <div role="alert" className="p-4 bg-red-950/60 border border-red-800 rounded-2xl text-red-200 text-sm flex items-center gap-2 justify-center">
          <XCircle className="w-5 h-5 shrink-0" /> {message}
        </div>
      )}
      {(state === "idle" || state === "error") && (
        <form
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-left space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            checkin(manual);
          }}
        >
          <Field label="Paste the check-in code or link" htmlFor="tok">
            <input id="tok" className={`${inputCls} font-mono`} value={manual} onChange={(e) => setManual(e.target.value)} required />
          </Field>
          <button className={`${btn.primary} w-full`}>Check in</button>
        </form>
      )}
      <Link href="/events" className="text-xs text-indigo-400 hover:underline">
        Back to events
      </Link>
    </div>
  );
}
