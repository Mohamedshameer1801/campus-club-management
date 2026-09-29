import { z } from "zod";
import { route, body } from "@/lib/http";
import { publicOrigin } from "@/lib/origin";
import { generateQr } from "@/lib/services/qr";

export const POST = route(async ({ req, db, user, ip }) => {
  const b = await body(req, z.object({ eventId: z.coerce.number().int().positive(), validityMinutes: z.coerce.number().int().min(1).max(60).optional() }));
  return { message: "QR code generated", ...(await generateQr(db, user, b.eventId, b.validityMinutes, publicOrigin(req), ip)) };
});
