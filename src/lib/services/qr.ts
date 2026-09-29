import crypto from "node:crypto";
import QRCode from "qrcode";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { events, eventRegistrations, attendance, qrTokens, qrCheckins } from "@/db/schema";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { requireClubPermission } from "@/lib/authz";
import { hashToken, type SessionUser } from "@/lib/session";
import { audit, notify } from "./common";
import { evaluateAutoBadges } from "./badges";

/** Accepts the raw token or the full check-in URL encoded in the QR code. */
export function extractToken(raw: string): string {
  const s = raw.trim();
  if (s.includes("token=")) {
    try {
      const t = new URL(s, "http://local").searchParams.get("token");
      if (t) return t;
    } catch {
      /* fall through */
    }
  }
  return s;
}

export async function generateQr(db: DB, actor: SessionUser, eventId: number, minutes: number | undefined, origin: string, ip?: string) {
  const ev = db.select().from(events).where(eq(events.id, eventId)).get();
  if (!ev) throw notFound("Event not found");
  requireClubPermission(actor, ev.clubId, "record_attendance");
  if (ev.status !== "Ongoing") throw conflict('QR check-in can only be opened while the event is "Ongoing" - start the event first', "EVENT_NOT_ONGOING");
  const mins = Math.min(60, Math.max(1, Math.floor(minutes ?? 5)));
  const token = crypto.randomBytes(24).toString("base64url"); // 192 bits from the OS CSPRNG
  const expiresAt = new Date(Date.now() + mins * 60_000);
  db.transaction((tx) => {
    tx.update(qrTokens).set({ isActive: false }).where(and(eq(qrTokens.eventId, eventId), eq(qrTokens.isActive, true))).run(); // one live code per event
    tx.insert(qrTokens).values({ eventId, tokenHash: hashToken(token), expiresAt, createdBy: actor.id }).run();
    audit(tx, actor.id, "GENERATE_QR", "events", eventId, `valid ${mins} min`, ip);
  });
  const checkinUrl = `${origin}/checkin?token=${token}`;
  const qrDataUrl = await QRCode.toDataURL(checkinUrl, { width: 320, margin: 2 });
  return { token, expiresAt, qrDataUrl, checkinUrl, event: { id: ev.id, title: ev.title } };
}

/**
 * Server-side QR check-in. The identity is ALWAYS the authenticated session user - the request body cannot name a student.
 * Validates: token authenticity (hash lookup), still active (not superseded), expiry, event status, registration, duplicates.
 */
export function checkInWithQr(db: DB, user: SessionUser, rawToken: string) {
  const token = extractToken(rawToken);
  if (!token || token.length > 128) throw badRequest("Invalid QR code", "QR_INVALID");
  return db.transaction(
    (tx) => {
      const row = tx.select().from(qrTokens).where(eq(qrTokens.tokenHash, hashToken(token))).get();
      if (!row || !row.isActive) throw badRequest("This QR code is invalid or has been replaced by a newer one", "QR_INVALID");
      if (row.expiresAt.getTime() <= Date.now()) throw badRequest("This QR code has expired - ask the organiser to refresh it", "QR_EXPIRED");
      const ev = tx.select().from(events).where(eq(events.id, row.eventId)).get();
      if (!ev) throw notFound("Event not found");
      if (ev.status !== "Ongoing") throw conflict(`Check-in is closed: the event is "${ev.status}"`, "EVENT_NOT_ONGOING");
      const reg = tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.eventId, ev.id), eq(eventRegistrations.userId, user.id))).get();
      if (!reg) throw forbidden("You have no registration for this event, so you cannot check in");
      const existing = tx.select().from(attendance).where(eq(attendance.registrationId, reg.id)).get();
      if (existing?.status === "Attended") throw conflict("Your attendance for this event is already confirmed", "ALREADY_CHECKED_IN");
      if (existing) tx.update(attendance).set({ status: "Attended", method: "QR", markedBy: user.id, markedAt: new Date() }).where(eq(attendance.id, existing.id)).run();
      else tx.insert(attendance).values({ registrationId: reg.id, status: "Attended", method: "QR", markedBy: user.id }).run();
      tx.insert(qrCheckins).values({ tokenId: row.id, registrationId: reg.id, userId: user.id }).run();
      notify(tx, user.id, { title: "Check-in successful", message: `Your attendance at "${ev.title}" was verified by QR check-in.`, type: "attendance", link: `/events/${ev.id}` });
      evaluateAutoBadges(tx, user.id);
      return { eventId: ev.id, eventTitle: ev.title, attendanceStatus: "Attended" as const };
    },
    { behavior: "immediate" }
  );
}
