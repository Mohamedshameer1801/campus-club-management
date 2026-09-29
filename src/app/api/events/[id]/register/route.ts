import { route, intParam } from "@/lib/http";
import { registerForEvent } from "@/lib/services/events";

export const POST = route<{ id: string }>(({ db, user, params }) => ({ message: "Registered successfully", registration: registerForEvent(db, user, intParam(params.id)) }));
