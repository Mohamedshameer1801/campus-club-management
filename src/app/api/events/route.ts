import { route, body } from "@/lib/http";
import { createEvent, eventInputSchema, listEvents } from "@/lib/services/events";

export const GET = route(({ req, db, user }) => {
  const sp = new URL(req.url).searchParams;
  const clubId = Number(sp.get("clubId"));
  return { events: listEvents(db, user, { clubId: Number.isInteger(clubId) && clubId > 0 ? clubId : undefined, status: sp.get("status") ?? undefined }) };
});

export const POST = route(async ({ req, db, user, ip }) => {
  const ev = createEvent(db, user, await body(req, eventInputSchema), ip);
  return { message: ev.status === "Draft" ? "Event saved as draft" : "Event submitted for faculty approval", event: ev };
});
