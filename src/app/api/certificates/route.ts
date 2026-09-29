import { route, body } from "@/lib/http";
import { issueCertificate, issueSchema, listCertificates } from "@/lib/services/certificates";

export const GET = route(({ req, db, user }) => {
  const e = Number(new URL(req.url).searchParams.get("eventId"));
  return { certificates: listCertificates(db, user, Number.isInteger(e) && e > 0 ? e : undefined) };
});

export const POST = route(async ({ req, db, user, ip }) => ({
  message: "Certificate issued",
  certificate: issueCertificate(db, user, await body(req, issueSchema), ip),
}));
