import { z } from "zod";
import { route, body } from "@/lib/http";
import { previewOverlap } from "@/lib/services/od";

export const POST = route(async ({ req, db, user }) => previewOverlap(db, user, (await body(req, z.object({ eventId: z.coerce.number().int().positive() }))).eventId));
