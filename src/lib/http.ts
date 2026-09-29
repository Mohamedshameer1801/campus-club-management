import { NextResponse } from "next/server";
import { ZodError, type ZodType, type z } from "zod";
import { getDb, type DB } from "@/db";
import { getSessionUser, type SessionUser } from "./session";
import { HttpError, badRequest, unauthorized, notFound } from "./errors";

export interface RouteArgs<P, U> {
  req: Request;
  db: DB;
  user: U;
  params: P;
  ip: string;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * CSRF defence (in addition to SameSite=Lax cookies): state-changing requests that carry an Origin
 * header must come from our own host or a configured trusted origin.
 */
export function originAllowed(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    let o: URL;
    try {
      o = new URL(origin);
    } catch {
      return false;
    }
    const trusted = (process.env.TRUSTED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (trusted.includes(o.origin)) return true;
    return !!host && o.host === host;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  return true; // non-browser client
}

function mapDbError(e: unknown): { status: number; error: string; code: string } | null {
  const msg = e instanceof Error ? e.message : "";
  const code = (e as { code?: string } | null)?.code ?? "";
  const table: Record<string, [number, string]> = {
    EVENT_FULL: [409, "This event has reached its maximum capacity"],
    EVENT_NOT_OPEN: [400, "This event is not open for registration"],
    INVALID_EVENT_TRANSITION: [409, "Invalid event status transition"],
    OD_SNAPSHOT_IMMUTABLE: [409, "Approved timetable snapshots cannot be modified"],
    OD_DECISION_FINAL: [409, "This OD request has already been decided"],
    CERT_EVENT_NOT_COMPLETED: [400, "Certificates can only be issued for completed events"],
    CERT_NO_CONFIRMED_ATTENDANCE: [400, "Certificates require confirmed attendance"],
    ROLE_OUT_OF_CLUB_SCOPE: [400, "Role does not belong to this club"],
    AUDIT_LOG_IMMUTABLE: [409, "Audit logs are append-only"],
    STUDENT_ROLE_REQUIRED: [400, "User is not a student"],
    MENTOR_MUST_BE_FACULTY: [400, "Mentor must be a faculty member"],
  };
  for (const key of Object.keys(table)) if (msg.includes(key)) return { status: table[key][0], error: table[key][1], code: key };
  if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") return { status: 409, error: "A matching record already exists", code: "DUPLICATE" };
  if (code === "SQLITE_CONSTRAINT_CHECK") return { status: 400, error: "Value violates a data integrity rule", code: "CONSTRAINT" };
  if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") return { status: 409, error: "Referenced record is missing or still in use", code: "FOREIGN_KEY" };
  return null;
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof ZodError) {
    const error = e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return NextResponse.json({ error, code: "VALIDATION" }, { status: 400 });
  }
  const mapped = mapDbError(e);
  if (mapped) return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  console.error("Unhandled API error:", e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

type Ctx<P> = { params: Promise<P> };

function build<P, U extends SessionUser | null>(requireAuth: boolean, fn: (a: RouteArgs<P, U>) => unknown) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    try {
      if (!originAllowed(req)) throw new HttpError(403, "Cross-origin request blocked", "CSRF");
      const db = getDb();
      const user = getSessionUser(db, req);
      if (requireAuth && !user) throw unauthorized();
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await fn({ req, db, user: user as U, params, ip: clientIp(req) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Authenticated route: `user` is guaranteed. */
export function route<P = Record<string, string>>(fn: (a: RouteArgs<P, SessionUser>) => unknown) {
  return build<P, SessionUser>(true, fn);
}
/** Route that works with or without a session (login, public verification, ...). */
export function publicRoute<P = Record<string, string>>(fn: (a: RouteArgs<P, SessionUser | null>) => unknown) {
  return build<P, SessionUser | null>(false, fn);
}

export async function body<S extends ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(json);
}

export function intParam(value: string | null | undefined, name = "id"): number {
  const n = Number(value);
  if (!value || !Number.isInteger(n) || n <= 0) throw notFound(`Invalid ${name}`);
  return n;
}
