import { route, body } from "@/lib/http";
import { ROLES, type Role } from "@/lib/constants";
import { createAccount, createAccountSchema, listUsers } from "@/lib/services/auth";

export const GET = route(({ req, db, user }) => {
  const roles = (new URL(req.url).searchParams.get("roles") ?? "").split(",").filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  return { users: listUsers(db, user, roles) };
});

export const POST = route(async ({ req, db, user, ip }) => ({ user: await createAccount(db, user, await body(req, createAccountSchema), ip) }));
