"use client";

import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import NotificationDropdown from "./NotificationDropdown";
import { Toaster, Spinner } from "./ui";
import { api } from "@/lib/client";
const PUBLIC_PREFIXES = ["/login", "/register", "/verify-certificate"];
const ROLE_LABEL: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", club_admin: "Club Admin", faculty: "Faculty", student: "Student" };

function navFor(user: any): { label: string; href: string }[] {
  const links = [{ label: "Dashboard", href: "/" }, { label: "Events", href: "/events" }, { label: "Clubs", href: "/clubs" }];
  const r = user.role;
  if (r === "faculty") links.push({ label: "Event Approvals", href: "/approvals" }, { label: "OD Reviews", href: "/od" });
  if (r === "student") links.push({ label: "My OD", href: "/od" }, { label: "Portfolio", href: "/portfolio" });
  links.push({ label: "Certificates", href: "/certificates" }, { label: "Badges", href: "/badges" });
  links.push({ label: "Timetable", href: "/timetable" });
  if (r === "faculty" || r === "club_admin") links.push({ label: "Messages", href: "/messages" });
  if (r === "super_admin" || r === "admin") links.push({ label: "OD Overview", href: "/od" }, { label: "Users", href: "/admin/users" });
  if (r === "super_admin") links.push({ label: "Audit Log", href: "/audit" });
  return links;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  useEffect(() => {
    let live = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => live && setUser(d.user ?? null))
      .catch(() => live && setUser(null));
    return () => {
      live = false;
    };
  }, [path]);

  useEffect(() => {
    if (user === null && !isPublic) router.replace("/login?next=" + encodeURIComponent(path + window.location.search));
  }, [user, isPublic, router, path]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => null);
    setUser(null);
    router.replace("/login");
  }, [router]);

  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[70] focus:bg-indigo-600 focus:text-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      {demo && <div className="bg-fuchsia-950/60 text-fuchsia-200 text-[11px] text-center py-1 border-b border-fuchsia-900 print:hidden">Demo environment - seeded records are flagged DEMO and are fictional.</div>}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold">C</span>
            <span className="text-base font-bold text-white hidden sm:block">Campus<span className="text-indigo-400">Hub</span></span>
          </Link>
          {user && (
            <nav aria-label="Main" className="hidden lg:flex items-center gap-1 overflow-x-auto">
              {navFor(user).map((l) => (
                <Link key={l.href + l.label} href={l.href} aria-current={path === l.href ? "page" : undefined} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${path === l.href ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30" : "text-slate-300 hover:text-white hover:bg-slate-800"}`}>
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <NotificationDropdown />
                <div className="hidden sm:block text-right leading-tight">
                  <p className="text-xs font-semibold text-white">{user.fullName}</p>
                  <p className="text-[10px] text-slate-400">{ROLE_LABEL[user.role]}{user.studentProfile ? ` - ${user.studentProfile.raNumber}` : ""}</p>
                </div>
                <button onClick={logout} aria-label="Log out" title="Log out" className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800">
                  <LogOut className="w-4 h-4" />
                </button>
                <button onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open} className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800">
                  {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </>
            ) : (
              <Link href="/login" className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg">Sign in</Link>
            )}
          </div>
        </div>
        {user && open && (
          <nav aria-label="Mobile" className="lg:hidden border-t border-slate-800 px-4 py-2 grid grid-cols-2 gap-1">
            {navFor(user).map((l) => (
              <Link key={l.href + l.label} href={l.href} onClick={() => setOpen(false)} className="px-3 py-2 rounded-md text-sm text-slate-200 hover:bg-slate-800">
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main id="main" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {user === undefined && !isPublic ? <Spinner label="Checking your session..." /> : user === null && !isPublic ? <Spinner label="Redirecting to sign in..." /> : children}
      </main>
      <Toaster />
    </div>
  );
}
