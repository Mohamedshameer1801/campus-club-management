import { route, intParam } from "@/lib/http";
import { publicOrigin } from "@/lib/origin";
import { certificatePdf } from "@/lib/services/certificates";

export const GET = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { bytes, filename } = await certificatePdf(db, user, intParam(params.id), publicOrigin(req));
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "private, no-store" },
  });
});
