import { route, body } from "@/lib/http";
import { applyForOd, odApplySchema } from "@/lib/services/od";

export const POST = route(async ({ req, db, user, ip }) => ({
  message: "OD application submitted and routed to your Class Mentor",
  ...applyForOd(db, user, await body(req, odApplySchema), ip),
}));
