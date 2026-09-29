import { publicRoute } from "@/lib/http";
import { verifyCertificate } from "@/lib/services/certificates";

// Public: no authentication, minimal (masked) data.
export const GET = publicRoute<{ certificateNumber: string }>(({ db, params }) => verifyCertificate(db, decodeURIComponent(params.certificateNumber).trim()));
