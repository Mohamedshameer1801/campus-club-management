"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg } from "@/lib/client";
import { btn, ErrorBox, Field, inputCls } from "./ui";
declare global {
  interface Window {
    google?: any;
  }
}

/** Real Google Sign-In: the browser obtains a Google ID token, the SERVER verifies it (signature, audience, issuer, expiry). */
export default function GoogleSignIn({ next = "/" }: { next?: string }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const holder = useRef<HTMLDivElement>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [needs, setNeeds] = useState<{ email: string; fullName: string } | null>(null);
  const [mentors, setMentors] = useState<{ id: number; fullName: string }[]>([]);
  const [profile, setProfile] = useState({ raNumber: "", department: "", academicYear: "1st Year", mentorId: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (token: string, p?: unknown) => {
      setBusy(true);
      setError(null);
      try {
        const r = await api("/api/auth/google", { body: { idToken: token, profile: p } });
        if (r.needsProfile) {
          setNeeds({ email: r.email, fullName: r.fullName });
          setIdToken(token);
          api("/api/auth/mentors").then((d) => setMentors(d.mentors)).catch(() => null);
        } else window.location.href = next;
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [next]
  );

  useEffect(() => {
    if (!clientId) return;
    const init = () => {
      window.google.accounts.id.initialize({ client_id: clientId, callback: (resp: any) => submit(resp.credential) });
      if (holder.current) window.google.accounts.id.renderButton(holder.current, { theme: "filled_black", size: "large", text: "continue_with", width: 320 });
    };
    if (window.google?.accounts?.id) init();
    else {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = init;
      document.head.appendChild(s);
    }
  }, [clientId, submit]);

  if (!clientId)
    return (
      <p className="text-[11px] text-slate-500 text-center border border-dashed border-slate-700 rounded-xl p-3">
        Google Sign-In is not configured on this server (set <code>GOOGLE_CLIENT_ID</code> and <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>). Email + password sign-in works normally.
      </p>
    );

  if (needs && idToken)
    return (
      <form
        className="space-y-3 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          submit(idToken, { ...profile, mentorId: Number(profile.mentorId) });
        }}
      >
        <p className="text-xs text-slate-300">
          Signed in with Google as <strong>{needs.email}</strong>. Complete your student profile to create your account.
        </p>
        <ErrorBox message={error} />
        <Field label="RA Number (15 letters/digits)" htmlFor="g-ra">
          <input id="g-ra" className={inputCls} maxLength={15} required value={profile.raNumber} onChange={(e) => setProfile({ ...profile, raNumber: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Department" htmlFor="g-dept">
          <input id="g-dept" className={inputCls} required value={profile.department} onChange={(e) => setProfile({ ...profile, department: e.target.value })} />
        </Field>
        <Field label="Academic year" htmlFor="g-year">
          <select id="g-year" className={inputCls} value={profile.academicYear} onChange={(e) => setProfile({ ...profile, academicYear: e.target.value })}>
            {["1st Year", "2nd Year", "3rd Year", "4th Year"].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </Field>
        <Field label="Class Mentor" htmlFor="g-mentor">
          <select id="g-mentor" className={inputCls} required value={profile.mentorId} onChange={(e) => setProfile({ ...profile, mentorId: e.target.value })}>
            <option value="">Select your mentor</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </Field>
        <button className={`${btn.primary} w-full`} disabled={busy}>
          Create account
        </button>
      </form>
    );

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={holder} />
      <ErrorBox message={error} />
    </div>
  );
}
