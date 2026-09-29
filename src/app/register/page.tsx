"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api, errMsg } from "@/lib/client";
import { btn, ErrorBox, Field, inputCls } from "@/components/ui";
import GoogleSignIn from "@/components/GoogleSignIn";

export default function RegisterPage() {
  const [mentors, setMentors] = useState<{ id: number; fullName: string; department: string }[]>([]);
  const [f, setF] = useState({ fullName: "", email: "", password: "", raNumber: "", department: "", academicYear: "1st Year", mentorId: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/auth/mentors").then((d) => setMentors(d.mentors)).catch(() => null);
  }, []);

  const raOk = /^[A-Z0-9]{15}$/.test(f.raNumber);
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!raOk) return setError("RA Number must be exactly 15 letters/digits (A-Z, 0-9).");
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/register", { body: { ...f, mentorId: Number(f.mentorId) } });
      window.location.href = "/";
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Student registration</h1>
        <p className="text-xs text-slate-400 mt-1">Your RA Number is your permanent institutional identity - it must be unique.</p>
      </div>
      <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4" aria-label="Student registration form">
        <ErrorBox message={error} />
        <Field label="Full name" htmlFor="fullName">
          <input id="fullName" className={inputCls} required minLength={2} value={f.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        <Field label="Email address" htmlFor="email">
          <input id="email" type="email" autoComplete="email" className={inputCls} required value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" hint="8+ characters with letters and digits.">
          <input id="password" type="password" autoComplete="new-password" className={inputCls} required minLength={8} value={f.password} onChange={(e) => set("password", e.target.value)} />
        </Field>
        <Field label="RA Number" htmlFor="ra" hint={f.raNumber && !raOk ? `${f.raNumber.length}/15 - letters and digits only` : "Exactly 15 alphanumeric characters, e.g. RA2311003010045"}>
          <input id="ra" className={`${inputCls} font-mono ${f.raNumber && !raOk ? "border-red-700" : ""}`} maxLength={15} required aria-invalid={!!f.raNumber && !raOk} value={f.raNumber} onChange={(e) => set("raNumber", e.target.value.toUpperCase())} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department" htmlFor="dept">
            <input id="dept" className={inputCls} required value={f.department} onChange={(e) => set("department", e.target.value)} />
          </Field>
          <Field label="Academic year" htmlFor="year">
            <select id="year" className={inputCls} value={f.academicYear} onChange={(e) => set("academicYear", e.target.value)}>
              {["1st Year", "2nd Year", "3rd Year", "4th Year"].map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Class Mentor" htmlFor="mentor" hint="Your OD requests are routed to this faculty member.">
          <select id="mentor" className={inputCls} required value={f.mentorId} onChange={(e) => set("mentorId", e.target.value)}>
            <option value="">Select your Class Mentor</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName} - {m.department}
              </option>
            ))}
          </select>
        </Field>
        <button className={`${btn.primary} w-full`} disabled={busy}>
          {busy ? "Creating account..." : "Create account"}
        </button>
        <GoogleSignIn />
        <p className="text-xs text-slate-400 text-center">
          Already registered?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
