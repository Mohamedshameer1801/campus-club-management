import { route, body, intParam } from "@/lib/http";
import { forbidden } from "@/lib/errors";
import { hasClubPermission } from "@/lib/authz";
import { createRole, roleCreateSchema, roleUpdateSchema, rolesOfClub, updateRole } from "@/lib/services/clubs";

export const GET = route<{ id: string }>(({ db, user, params }) => {
  const id = intParam(params.id);
  if (!(hasClubPermission(user, id, "manage_members") || hasClubPermission(user, id, "create_events"))) throw forbidden();
  return { dynamicRoles: rolesOfClub(db, id) };
});
export const POST = route<{ id: string }>(async ({ req, db, user, params, ip }) => ({
  message: "Role created",
  dynamicRole: createRole(db, user, intParam(params.id), await body(req, roleCreateSchema), ip),
}));
export const PATCH = route<{ id: string }>(async ({ req, db, user, params, ip }) => ({
  message: "Role updated",
  dynamicRole: updateRole(db, user, intParam(params.id), await body(req, roleUpdateSchema), ip),
}));
