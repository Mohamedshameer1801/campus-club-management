import { desc, eq } from "drizzle-orm";
import { route } from "@/lib/http";
import { requireSuperAdmin } from "@/lib/authz";
import { auditLogs, users } from "@/db/schema";

export const GET = route(({ req, db, user }) => {
  requireSuperAdmin(user);
  const limit = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 100));
  const rows = db
    .select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, details: auditLogs.details, ipAddress: auditLogs.ipAddress, createdAt: auditLogs.createdAt, userName: users.fullName, userRole: users.role })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.id))
    .limit(limit)
    .all();
  return { auditLogs: rows };
});
