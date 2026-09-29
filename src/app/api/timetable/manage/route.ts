import { z } from "zod";
import { route, body, intParam } from "@/lib/http";
import { requireSuperAdmin } from "@/lib/authz";
import { activeStatusSchema, createStructure, deleteStructure, setStructureActive, structureSchema, updateStructure } from "@/lib/services/timetable";

// Every handler authorises FIRST (Super Admin only), then validates input; every mutation is audit-logged in the service.
export const POST = route(async ({ req, db, user, ip }) => {
  requireSuperAdmin(user);
  return createStructure(db, user, await body(req, structureSchema), ip);
});

export const PUT = route(async ({ req, db, user, ip }) => {
  requireSuperAdmin(user);
  const b = await body(req, z.object({ structureId: z.coerce.number().int().positive() }).passthrough());
  return updateStructure(db, user, b.structureId, structureSchema.parse(b), ip);
});

export const PATCH = route(async ({ req, db, user, ip }) => {
  requireSuperAdmin(user);
  const b = await body(req, activeStatusSchema);
  return { structure: setStructureActive(db, user, b.structureId, b.isActive, b.replaceConflicting, ip) };
});

export const DELETE = route(({ req, db, user, ip }) => {
  requireSuperAdmin(user);
  return deleteStructure(db, user, intParam(new URL(req.url).searchParams.get("id")), ip);
});
