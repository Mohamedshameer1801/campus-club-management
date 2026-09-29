import { z } from "zod";
import { route, body, intParam } from "@/lib/http";
import { setUserActive } from "@/lib/services/auth";

export const PATCH = route<{ id: string }>(async ({ req, db, user, params, ip }) =>
  setUserActive(db, user, intParam(params.id), (await body(req, z.object({ isActive: z.boolean() }))).isActive, ip)
);
