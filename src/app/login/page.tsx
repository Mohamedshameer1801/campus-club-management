"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api, errMsg } from "@/lib/client";
import { btn, ErrorBox, Field, inputCls } from "@/components/ui";
import GoogleSignIn from "@/components/GoogleSignIn";

const DEMO_PASSWORD = "Password123!";
const DEMO_ACCOUNTS = [
  ["superadmin@campus.edu", "Super Admin"],
  ["admin@campus.edu", "Admin"],
  ["clubadmin@campus.edu", "Club Admin (Turing + Robotics)"],
  ["clubadmin2@campus.edu", "Club Admin (Literary)"],
  ["faculty@campus.edu", "Faculty: Coordinator + Class Mentor"],
  ["mentor@campus.edu", "Faculty: Mentor + Coordinator (Literary)"],
  ["maya@student.campus.edu", "Student (Turing member)"],
  ["dev@student.campus.edu", "Student (Robotics member)"],
  ["priya@student.campus.edu", "Student with a dynamic club role"],
];

function safeNext(): string {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email, password } });
      window.location.href = safeNext();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Sign in</h1>
        <p className="text-xs text-slate-400 mt-1">Campus Club Management Platform</p>
      </div>
      <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4" aria-label="Sign in form">
        <ErrorBox message={error} />
        <Field label="Email address" htmlFor="email">
          <input id="email" type="email" autoComplete="username" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className={`${btn.primary} w-full`} disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
        <div className="relative text-center">
          <span className="text-[11px] text-slate-500 bg-slate-900 px-2 relative z-10">or, for students</span>
          <div className="absolute inset-x-0 top-1/2 border-t border-slate-800" />
        </div>
        <GoogleSignIn next={safeNext()} />
        <p className="text-xs text-slate-400 text-center">
          New student?{" "}
          <Link href="/register" className="text-indigo-400 hover:underline">
            Create an account
          </Link>
        </p>
      </form>

      {demo && (
        <section aria-label="Demo accounts" className="bg-fuchsia-950/30 border border-fuchsia-900 rounded-2xl p-4">
          <h2 className="text-xs font-bold text-fuchsia-300 uppercase tracking-wider">Demo accounts (local demo data only)</h2>
          <p className="text-[11px] text-slate-400 mt-1 mb-3">
            These are seeded, fictional accounts. Choosing one only fills the form - you still authenticate with the demo password <code className="text-fuchsia-300">{DEMO_PASSWORD}</code>. This helper is disabled unless <code>NEXT_PUBLIC_DEMO_MODE=true</code>.
          </p>
          <ul className="grid gap-1">
            {DEMO_ACCOUNTS.map(([e, label]) => (
              <li key={e}>
                <button type="button" onClick={() => { setEmail(e); setPassword(DEMO_PASSWORD); }} className="w-full text-left px-3 py-1.5 rounded-lg bg-slate-900/70 hover:bg-slate-800 text-xs">
                  <span className="text-white font-medium">{label}</span> <span className="text-slate-500">{e}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
