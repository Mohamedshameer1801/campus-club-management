import { z } from "zod";
import { route, body } from "@/lib/http";
import { checkInWithQr } from "@/lib/services/qr";

// Only the token is read from the body. Any "userId"/"studentId" a client might add is ignored:
// the attendee is always the authenticated session user.
export const POST = route(async ({ req, db, user }) => {
  const b = await body(req, z.object({ token: z.string().min(8).max(600) }));
  const r = checkInWithQr(db, user, b.token);
  return { message: "Check-in verified", ...r };
});
