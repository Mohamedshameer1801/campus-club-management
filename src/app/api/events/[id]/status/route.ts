import { route, body, intParam } from "@/lib/http";
import { changeStatus, statusChangeSchema } from "@/lib/services/events";

export const POST = route<{ id: string }>(async ({ req, db, user, params, ip }) => {
  const { status } = await body(req, statusChangeSchema);
  return { message: `Event marked as ${status}`, event: changeStatus(db, user, intParam(params.id), status, ip) };
});
