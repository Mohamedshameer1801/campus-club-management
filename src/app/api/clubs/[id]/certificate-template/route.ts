import { route, intParam } from "@/lib/http";
import { setCertificateTemplate } from "@/lib/services/clubs";

export const PUT = route<{ id: string }>(async ({ req, db, user, params, ip }) => ({
  message: "Certificate template saved",
  template: setCertificateTemplate(db, user, intParam(params.id), await req.json().catch(() => ({})), ip),
}));
