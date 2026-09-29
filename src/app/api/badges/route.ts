import { route, body } from "@/lib/http";
import { badgeCreateSchema, createBadge, listBadgeDefinitions } from "@/lib/services/badges";

export const GET = route(({ db }) => ({ badges: listBadgeDefinitions(db) }));
export const POST = route(async ({ req, db, user, ip }) => ({ message: "Badge created", badge: createBadge(db, user, await body(req, badgeCreateSchema), ip) }));
