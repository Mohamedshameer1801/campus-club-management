import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { route, publicRoute, body } from "@/lib/http";
import { notFound } from "@/lib/errors";
import { notifications } from "@/db/schema";

export const GET = publicRoute(({ db, user }) => {
  if (!user) return { notifications: [], unreadCount: 0 };
  const rows = db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.id)).limit(100).all();
  return { notifications: rows, unreadCount: rows.filter((n) => !n.isRead).length };
});

export const PATCH = route(async ({ req, db, user }) => {
  const b = await body(req, z.object({ notificationId: z.coerce.number().int().positive().optional(), markAll: z.boolean().optional() }));
  if (b.markAll) {
    db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, user.id)).run();
    return { message: "All notifications marked as read" };
  }
  if (!b.notificationId) return { error: "notificationId or markAll required" };
  // Ownership enforced in the WHERE clause: another user's notification id changes nothing and 404s.
  const r = db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, b.notificationId), eq(notifications.userId, user.id))).run();
  if (r.changes === 0) throw notFound("Notification not found");
  return { message: "Notification marked as read" };
});
