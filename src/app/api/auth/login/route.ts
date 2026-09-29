import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute, body } from "@/lib/http";
import { applySessionCookie } from "@/lib/session";
import { loginWithPassword } from "@/lib/services/auth";

export const POST = publicRoute(async ({ req, db, ip }) => {
  const { email, password } = await body(req, z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) }));
  const r = await loginWithPassword(db, email, password, ip, req.headers.get("user-agent"));
  const res = NextResponse.json({ message: "Login successful", user: r.user });
  applySessionCookie(res, r.token, r.expiresAt);
  return res;
});
