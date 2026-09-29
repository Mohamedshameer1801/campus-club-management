import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute, body } from "@/lib/http";
import { applySessionCookie } from "@/lib/session";
import { registerStudent, studentProfileSchema } from "@/lib/services/auth";

// Unknown keys (e.g. a malicious "role") are stripped by the schema; the service always creates role = student.
const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
}).and(studentProfileSchema);

export const POST = publicRoute(async ({ req, db }) => {
  const b = await body(req, schema);
  const r = await registerStudent(db, { email: b.email, password: b.password, fullName: b.fullName, profile: b }, req.headers.get("user-agent"));
  const res = NextResponse.json({ message: "Registration successful", user: r.user }, { status: 201 });
  applySessionCookie(res, r.token, r.expiresAt);
  return res;
});
