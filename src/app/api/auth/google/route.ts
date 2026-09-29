import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute, body } from "@/lib/http";
import { applySessionCookie } from "@/lib/session";
import { loginWithGoogle, studentProfileSchema } from "@/lib/services/auth";

export const POST = publicRoute(async ({ req, db }) => {
  const b = await body(req, z.object({ idToken: z.string().min(10).max(4096), profile: studentProfileSchema.optional() }));
  const r = await loginWithGoogle(db, b.idToken, b.profile, req.headers.get("user-agent"));
  if (r.needsProfile) return { needsProfile: true, email: r.email, fullName: r.fullName };
  const res = NextResponse.json({ message: "Signed in with Google", user: r.user });
  applySessionCookie(res, r.token, r.expiresAt);
  return res;
});
