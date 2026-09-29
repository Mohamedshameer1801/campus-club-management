import { route, body, intParam } from "@/lib/http";
import { eventPatchSchema, getEvent, updateEvent } from "@/lib/services/events";

export const GET = route<{ id: string }>(({ db, user, params }) => ({ event: getEvent(db, user, intParam(params.id)) }));
export const PATCH = route<{ id: string }>(async ({ req, db, user, params, ip }) => ({
  message: "Event updated",
  event: updateEvent(db, user, intParam(params.id), await body(req, eventPatchSchema), ip),
}));
