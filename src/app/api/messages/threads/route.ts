import { route, body } from "@/lib/http";
import { createThread, listThreads, threadCreateSchema } from "@/lib/services/messages";

export const GET = route(({ db, user }) => ({ threads: listThreads(db, user) }));
export const POST = route(async ({ req, db, user, ip }) => ({ message: "Conversation started", thread: createThread(db, user, await body(req, threadCreateSchema), ip) }));
