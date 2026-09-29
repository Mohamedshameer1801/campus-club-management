import type { DBLike } from "@/db";
import { auditLogs, notifications } from "@/db/schema";
import type { NOTIFICATION_TYPES } from "@/lib/constants";

export function audit(
  db: DBLike,
  actorId: number | null,
  action: string,
  entityType: string,
  entityId: string | number,
  details?: string,
  ip?: string
) {
  db.insert(auditLogs)
    .values({ actorId, action, entityType, entityId: String(entityId), details: details ?? null, ipAddress: ip ?? null })
    .run();
}

/** Always call inside the same transaction as the operation being announced, so it only exists if the operation succeeded. */
export function notify(
  db: DBLike,
  userId: number,
  n: { title: string; message: string; type: (typeof NOTIFICATION_TYPES)[number]; link?: string }
) {
  db.insert(notifications).values({ userId, title: n.title, message: n.message, type: n.type, link: n.link ?? null }).run();
}

/** Local calendar date (YYYY-MM-DD) - event dates/times are naive local values. */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function eventStart(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}:00`);
}
export function eventEnd(date: string, endTime: string): Date {
  return new Date(`${date}T${endTime}:00`);
}
