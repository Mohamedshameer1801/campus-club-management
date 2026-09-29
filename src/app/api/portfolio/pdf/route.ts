import { z } from "zod";
import { route, body } from "@/lib/http";
import { getPortfolio, renderPortfolioPdf } from "@/lib/services/portfolio";

export const POST = route(async ({ req, db, user }) => {
  const b = await body(req, z.object({ userId: z.coerce.number().int().positive().optional(), summary: z.string().max(4000).optional() }));
  const p = getPortfolio(db, user, b.userId ?? user.id); // authorisation lives in getPortfolio
  const bytes = await renderPortfolioPdf(p, b.summary);
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="portfolio-${p.studentProfile.raNumber}.pdf"`, "cache-control": "private, no-store" },
  });
});
