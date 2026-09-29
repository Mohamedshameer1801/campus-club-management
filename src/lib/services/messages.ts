import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DBLike } from "@/db";
import { messageThreads, threadParticipants, messages, users, events, clubs, odRequests, facultyProfiles } from "@/db/schema";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import type { SessionUser } from "@/lib/session";
import { audit, notify } from "./common";

const MESSAGING_ROLES = ["faculty", "club_admin"];

export const threadCreateSchema = z.object({
  subject: z.string().trim().min(3).max(150),
  recipientIds: z.array(z.coerce.number().int().positive()).min(1).max(10),
  contextType: z.enum(["general", "event", "od"]).default("general"),
  eventId: z.coerce.number().int().positive().optional(),
  odRequestId: z.coerce.number().int().positive().optional(),
  body: z.string().trim().min(1).max(4000),
});
export const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });

export function contacts(db: DB, user: SessionUser) {
  if (!MESSAGING_ROLES.includes(user.role)) throw forbidden("Messaging is available to faculty and club administrators");
  return db
    .select({ id: users.id, fullName: users.fullName, role: users.role, department: facultyProfiles.department })
    .from(users)
    .leftJoin(facultyProfiles, eq(facultyProfiles.userId, users.id))
    .where(and(inArray(users.role, ["faculty", "club_admin"]), eq(users.isActive, true), ne(users.id, user.id)))
    .all();
}

function involvedInEvent(db: DBLike, ev: typeof events.$inferSelect, uid: number, role: string) {
  const club = db.select().from(clubs).where(eq(clubs.id, ev.clubId)).get();
  return (role === "faculty" && uid === ev.facultyCoordinatorId) || (role === "club_admin" && club?.clubAdminId === uid) || ev.createdById === uid;
}

/** Contextual messaging: Faculty<->Faculty and Faculty<->Club Admin only, tied to an event / OD request where relevant. */
export function createThread(db: DB, actor: SessionUser, input: z.infer<typeof threadCreateSchema>, ip?: string) {
  if (!MESSAGING_ROLES.includes(actor.role)) throw forbidden("Messaging is available to faculty and club administrators");
  const recipientIds = [...new Set(input.recipientIds)].filter((id) => id !== actor.id);
  if (recipientIds.length === 0) throw badRequest("Choose at least one other recipient");
  return db.transaction((tx) => {
    const recips = tx.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(inArray(users.id, recipientIds)).all();
    if (recips.length !== recipientIds.length || recips.some((r) => !r.isActive || !MESSAGING_ROLES.includes(r.role)))
      throw badRequest("Recipients must be active faculty members or club administrators");
    const participants = [{ id: actor.id, role: actor.role as string }, ...recips.map((r) => ({ id: r.id, role: r.role as string }))];
    if (!participants.some((p) => p.role === "faculty")) throw badRequest("A conversation needs at least one faculty participant (Faculty\u2194Faculty or Faculty\u2194Club Admin)");

    let eventId: number | null = null;
    let odId: number | null = null;
    if (input.contextType === "event") {
      const ev = tx.select().from(events).where(eq(events.id, input.eventId ?? 0)).get();
      if (!ev) throw notFound("Event not found");
      if (!participants.every((p) => involvedInEvent(tx, ev, p.id, p.role))) throw forbidden("All participants must be involved in this event (coordinator, club admin or organiser)");
      eventId = ev.id;
    } else if (input.contextType === "od") {
      const od = tx.select().from(odRequests).where(eq(odRequests.id, input.odRequestId ?? 0)).get();
      if (!od) throw notFound("OD request not found");
      const ev = tx.select().from(events).where(eq(events.id, od.eventId)).get();
      const allowed = (p: { id: number; role: string }) => p.role === "faculty" && (p.id === od.mentorId || p.id === ev?.facultyCoordinatorId);
      if (!participants.every(allowed)) throw forbidden("OD conversations are limited to the student's Class Mentor and the event's Faculty Coordinator");
      odId = od.id;
    }
    const thread = tx.insert(messageThreads).values({ subject: input.subject, contextType: input.contextType, eventId, odRequestId: odId, createdBy: actor.id }).returning().get();
    for (const p of participants) tx.insert(threadParticipants).values({ threadId: thread.id, userId: p.id, lastReadAt: p.id === actor.id ? new Date() : null }).run();
    tx.insert(messages).values({ threadId: thread.id, senderId: actor.id, body: input.body }).run();
    for (const r of recips) notify(tx, r.id, { title: "New message", message: `${actor.fullName}: ${input.subject}`, type: "message", link: `/messages?thread=${thread.id}` });
    audit(tx, actor.id, "CREATE_THREAD", "message_threads", thread.id, `${input.contextType}${eventId ? ` event=${eventId}` : ""}${odId ? ` od=${odId}` : ""}`, ip);
    return thread;
  });
}

function requireParticipant(db: DBLike, user: SessionUser, threadId: number) {
  const p = db.select().from(threadParticipants).where(and(eq(threadParticipants.threadId, threadId), eq(threadParticipants.userId, user.id))).get();
  // Non-participants (including admins) get 404 so private threads cannot even be enumerated.
  if (!p) throw notFound("Conversation not found");
  return p;
}

export function listThreads(db: DB, user: SessionUser) {
  if (!MESSAGING_ROLES.includes(user.role)) throw forbidden("Messaging is available to faculty and club administrators");
  const mine = db.select({ threadId: threadParticipants.threadId, lastReadAt: threadParticipants.lastReadAt }).from(threadParticipants).where(eq(threadParticipants.userId, user.id)).all();
  return mine
    .map((m) => {
      const t = db.select().from(messageThreads).where(eq(messageThreads.id, m.threadId)).get();
      if (!t) return null;
      const last = db.select({ body: messages.body, createdAt: messages.createdAt, sender: users.fullName }).from(messages).innerJoin(users, eq(users.id, messages.senderId)).where(eq(messages.threadId, t.id)).orderBy(desc(messages.id)).get();
      const unread = db.select({ n: sql<number>`count(*)` }).from(messages).where(and(eq(messages.threadId, t.id), ne(messages.senderId, user.id), m.lastReadAt ? gt(messages.createdAt, m.lastReadAt) : undefined)).get()?.n ?? 0;
      const others = db.select({ name: users.fullName }).from(threadParticipants).innerJoin(users, eq(users.id, threadParticipants.userId)).where(and(eq(threadParticipants.threadId, t.id), ne(threadParticipants.userId, user.id))).all().map((x) => x.name);
      const ev = t.eventId ? db.select({ title: events.title }).from(events).where(eq(events.id, t.eventId)).get() : null;
      return { ...t, participants: others, lastMessage: last ?? null, unread, eventTitle: ev?.title ?? null };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function getThread(db: DB, user: SessionUser, id: number) {
  requireParticipant(db, user, id);
  const t = db.select().from(messageThreads).where(eq(messageThreads.id, id)).get();
  if (!t) throw notFound("Conversation not found");
  db.update(threadParticipants).set({ lastReadAt: new Date() }).where(and(eq(threadParticipants.threadId, id), eq(threadParticipants.userId, user.id))).run();
  const participants = db.select({ id: users.id, fullName: users.fullName, role: users.role }).from(threadParticipants).innerJoin(users, eq(users.id, threadParticipants.userId)).where(eq(threadParticipants.threadId, id)).all();
  const msgs = db.select({ id: messages.id, senderId: messages.senderId, senderName: users.fullName, senderRole: users.role, body: messages.body, createdAt: messages.createdAt }).from(messages).innerJoin(users, eq(users.id, messages.senderId)).where(eq(messages.threadId, id)).orderBy(messages.id).all();
  const ev = t.eventId ? db.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, t.eventId)).get() : null;
  return { thread: t, participants, messages: msgs, event: ev ?? null };
}

export function postMessage(db: DB, user: SessionUser, threadId: number, body: string) {
  requireParticipant(db, user, threadId);
  return db.transaction((tx) => {
    const m = tx.insert(messages).values({ threadId, senderId: user.id, body }).returning().get();
    tx.update(messageThreads).set({ updatedAt: new Date() }).where(eq(messageThreads.id, threadId)).run();
    tx.update(threadParticipants).set({ lastReadAt: new Date() }).where(and(eq(threadParticipants.threadId, threadId), eq(threadParticipants.userId, user.id))).run();
    const others = tx.select({ userId: threadParticipants.userId }).from(threadParticipants).where(and(eq(threadParticipants.threadId, threadId), ne(threadParticipants.userId, user.id))).all();
    for (const o of others) notify(tx, o.userId, { title: "New message", message: `${user.fullName} replied in a conversation`, type: "message", link: `/messages?thread=${threadId}` });
    return m;
  });
}
