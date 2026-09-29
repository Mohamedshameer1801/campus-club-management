import { route, intParam } from "@/lib/http";
import { joinClub } from "@/lib/services/clubs";

export const POST = route<{ id: string }>(({ db, user, params }) => ({ message: "Joined club", membership: joinClub(db, user, intParam(params.id)) }));
