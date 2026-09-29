import { route, intParam } from "@/lib/http";
import { eventHistory } from "@/lib/services/events";

export const GET = route<{ id: string }>(({ db, user, params }) => ({ history: eventHistory(db, user, intParam(params.id)) }));
