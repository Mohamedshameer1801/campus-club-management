import { route, body } from "@/lib/http";
import { awardBadge, awardSchema } from "@/lib/services/badges";

export const POST = route(async ({ req, db, user, ip }) => ({ message: "Badge awarded", award: awardBadge(db, user, await body(req, awardSchema), ip) }));
