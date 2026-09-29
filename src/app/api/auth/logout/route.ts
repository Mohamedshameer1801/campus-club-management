import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/http";
import { SESSION_COOKIE, clearSessionCookie, destroySession, readCookie } from "@/lib/session";

export const POST = publicRoute(({ req, db }) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) destroySession(db, token); // server-side invalidation, not just cookie removal
  const res = NextResponse.json({ message: "Logged out" });
  clearSessionCookie(res);
  return res;
});
