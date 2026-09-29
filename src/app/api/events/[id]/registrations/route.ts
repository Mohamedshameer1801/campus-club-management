import { route, intParam } from "@/lib/http";
import { listRegistrations } from "@/lib/services/events";

export const GET = route<{ id: string }>(({ db, user, params }) => ({ registrations: listRegistrations(db, user, intParam(params.id)) }));
