import { OAuth2Client } from "google-auth-library";
import { HttpError } from "@/lib/errors";

export interface GoogleClaims {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}
export type GoogleVerifier = (idToken: string) => Promise<GoogleClaims>;

let testVerifier: GoogleVerifier | null = null;
/** Test seam only - ignored unless NODE_ENV === "test". Real verification is never bypassed in dev/production. */
export function setGoogleVerifierForTests(v: GoogleVerifier | null) {
  if (process.env.NODE_ENV === "test") testVerifier = v;
}

const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/**
 * Verifies a Google ID token server-side: signature (Google's published certs), audience (our client id),
 * issuer, expiry and email_verified. Anything else (fabricated tokens, other apps' tokens) is rejected.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleClaims> {
  if (testVerifier) return testVerifier(idToken);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(503, "Google Sign-In is not configured on this server", "GOOGLE_NOT_CONFIGURED");
  if (!idToken || idToken.length > 4096) throw new HttpError(401, "Invalid Google credential", "GOOGLE_INVALID_TOKEN");
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const p = ticket.getPayload();
    if (!p || !p.sub || !p.email) throw new Error("missing claims");
    if (!p.iss || !ISSUERS.includes(p.iss)) throw new Error("bad issuer");
    if (p.aud !== clientId) throw new Error("bad audience");
    if (!p.exp || p.exp * 1000 < Date.now()) throw new Error("expired");
    if (p.email_verified !== true) throw new Error("email not verified");
    const allowed = process.env.GOOGLE_ALLOWED_DOMAIN?.trim().toLowerCase();
    if (allowed && p.email.toLowerCase().split("@")[1] !== allowed) throw new Error("domain not allowed");
    return { sub: p.sub, email: p.email.toLowerCase(), name: p.name ?? p.email, picture: p.picture };
  } catch {
    throw new HttpError(401, "Google credential could not be verified", "GOOGLE_INVALID_TOKEN");
  }
}
