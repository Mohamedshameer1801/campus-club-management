import { route, body, intParam } from "@/lib/http";
import { decideEvent, decisionSchema } from "@/lib/services/events";

export const POST = route<{ id: string }>(async ({ req, db, user, params, ip }) => {
  const input = await body(req, decisionSchema);
  return { message: `Event ${input.decision.toLowerCase()}`, event: decideEvent(db, user, intParam(params.id), input, ip) };
});
