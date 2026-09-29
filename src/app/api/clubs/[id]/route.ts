import { route, body, intParam } from "@/lib/http";
import { getClub, updateClub, updateClubSchema } from "@/lib/services/clubs";

export const GET = route<{ id: string }>(({ db, user, params }) => ({ club: getClub(db, user, intParam(params.id)) }));
export const PATCH = route<{ id: string }>(async ({ req, db, user, params, ip }) => ({
  message: "Club updated",
  club: updateClub(db, user, intParam(params.id), await body(req, updateClubSchema), ip),
}));
