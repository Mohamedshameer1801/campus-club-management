import { route, body, intParam } from "@/lib/http";
import { odReviewSchema, reviewOd } from "@/lib/services/od";

export const POST = route<{ id: string }>(async ({ req, db, user, params, ip }) => {
  const input = await body(req, odReviewSchema);
  return { message: `OD ${input.decision.toLowerCase()}`, onDutyRequest: reviewOd(db, user, intParam(params.id), input, ip) };
});
