import { route, body } from "@/lib/http";
import { bulkIssue, bulkSchema } from "@/lib/services/certificates";

export const POST = route(async ({ req, db, user, ip }) => {
  const r = bulkIssue(db, user, await body(req, bulkSchema), ip);
  return { message: `${r.issuedCount} certificate(s) issued (${r.alreadyIssued} already existed)`, ...r };
});
