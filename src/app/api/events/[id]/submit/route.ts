import { route, intParam } from "@/lib/http";
import { submitEvent } from "@/lib/services/events";

export const POST = route<{ id: string }>(({ db, user, params, ip }) => ({ message: "Event submitted for faculty approval", event: submitEvent(db, user, intParam(params.id), ip) }));
