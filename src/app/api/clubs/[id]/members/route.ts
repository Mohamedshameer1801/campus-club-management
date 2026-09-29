import { route, body, intParam } from "@/lib/http";
import { memberUpdateSchema, updateMember } from "@/lib/services/clubs";

export const PATCH = route<{ id: string }>(async ({ req, db, user, params, ip }) => ({
  message: "Membership updated",
  membership: updateMember(db, user, intParam(params.id), await body(req, memberUpdateSchema), ip),
}));
