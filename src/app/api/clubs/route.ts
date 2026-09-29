import { route, body } from "@/lib/http";
import { createClub, createClubSchema, listClubs } from "@/lib/services/clubs";

export const GET = route(({ db, user }) => ({ clubs: listClubs(db, user) }));
export const POST = route(async ({ req, db, user, ip }) => ({ message: "Club created", club: createClub(db, user, await body(req, createClubSchema), ip) }));
