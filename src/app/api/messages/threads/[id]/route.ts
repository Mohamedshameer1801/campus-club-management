import { route, body, intParam } from "@/lib/http";
import { getThread, messageSchema, postMessage } from "@/lib/services/messages";

export const GET = route<{ id: string }>(({ db, user, params }) => getThread(db, user, intParam(params.id)));
export const POST = route<{ id: string }>(async ({ req, db, user, params }) => ({
  message: "Message sent",
  data: postMessage(db, user, intParam(params.id), (await body(req, messageSchema)).body),
}));
