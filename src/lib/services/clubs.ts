import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DBLike } from "@/db";
import { clubs, users, clubMemberships, clubRoles, rolePermissions, events, facultyProfiles } from "@/db/schema";
import { CLUB_CATEGORIES, PERMISSIONS, type Permission } from "@/lib/constants";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { canManageClub, hasClubPermission, isInstAdmin, requireInstAdmin } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { audit, notify } from "./common";
import { canSeeEvent } from "./visibility";

// ------------------------------------------------------------ certificate template
export const certificateTemplateSchema = z.object({
  headerTitle: z.string().trim().max(60).default("Certificate of Participation"),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB colour").default("#4f46e5"),
  signatoryName: z.string().trim().max(60).default(""),
  signatoryTitle: z.string().trim().max(60).default("Club Administrator"),
  bodyText: z.string().trim().max(240).default(""),
  footerText: z.string().trim().max(120).default(""),
});
export type CertificateTemplate = z.infer<typeof certificateTemplateSchema>;

export function parseCertificateTemplate(json: string | null | undefined): CertificateTemplate {
  try {
    return certificateTemplateSchema.parse(json ? JSON.parse(json) : {});
  } catch {
    return certificateTemplateSchema.parse({});
  }
}

// ------------------------------------------------------------ helpers
const brief = (db: DBLike, id: number) =>
  db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, id)).get() ?? null;

export function rolesOfClub(db: DBLike, clubId: number) {
  return db
    .select()
    .from(clubRoles)
    .where(eq(clubRoles.clubId, clubId))
    .all()
    .map((r) => ({
      id: r.id,
      clubId: r.clubId,
      roleName: r.name,
      permissions: db.select({ k: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.roleId, r.id)).all().map((x) => x.k),
    }));
}

function requireClub(db: DBLike, id: number) {
  const c = db.select().from(clubs).where(eq(clubs.id, id)).get();
  if (!c) throw notFound("Club not found");
  return c;
}

export const createClubSchema = z.object({
  name: z.string().trim().min(3).max(100),
  code: z.string().trim().regex(/^[A-Za-z0-9]{2,10}$/, "Code must be 2-10 letters or digits"),
  category: z.enum(CLUB_CATEGORIES),
  description: z.string().trim().min(10).max(1000),
  logoUrl: z.string().url().max(500).nullable().optional(),
  clubAdminId: z.coerce.number().int().positive(),
  facultyCoordinatorId: z.coerce.number().int().positive(),
});

export const updateClubSchema = createClubSchema
  .partial()
  .extend({ isArchived: z.boolean().optional() })
  .omit({ code: true })
  .strict();

function assertClubStaff(db: DBLike, adminId?: number, coordinatorId?: number) {
  if (adminId !== undefined) {
    const a = db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, adminId)).get();
    if (!a || a.role !== "club_admin" || !a.isActive) throw badRequest("Club Admin must be an active user with the club_admin role");
  }
  if (coordinatorId !== undefined) {
    const f = db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, coordinatorId)).get();
    if (!f || f.role !== "faculty" || !f.isActive) throw badRequest("Faculty Coordinator must be an active faculty member");
    const fp = db.select().from(facultyProfiles).where(eq(facultyProfiles.userId, coordinatorId)).get();
    if (fp && !fp.isCoordinator) throw badRequest("Selected faculty member is not eligible to coordinate clubs");
  }
}

// ------------------------------------------------------------ queries
export function listClubs(db: DB, user: SessionUser) {
  return db
    .select()
    .from(clubs)
    .all()
    .filter((c) => !c.isArchived || isInstAdmin(user) || canManageClub(user, c.id) || user.coordinatedClubIds.includes(c.id))
    .map((c) => {
      const memberCount =
        db.select({ n: sql<number>`count(*)` }).from(clubMemberships).where(and(eq(clubMemberships.clubId, c.id), eq(clubMemberships.status, "active"))).get()?.n ?? 0;
      const eventCount =
        db.select({ n: sql<number>`count(*)` }).from(events).where(and(eq(events.clubId, c.id), inArray(events.status, ["Approved", "Ongoing", "Completed"]))).get()?.n ?? 0;
      const myMembership =
        db
          .select({ status: clubMemberships.status, roleName: clubRoles.name })
          .from(clubMemberships)
          .leftJoin(clubRoles, eq(clubRoles.id, clubMemberships.roleId))
          .where(and(eq(clubMemberships.clubId, c.id), eq(clubMemberships.userId, user.id)))
          .get() ?? null;
      const { certificateTemplate: _omit, ...rest } = c;
      void _omit;
      return { ...rest, admin: brief(db, c.clubAdminId), coordinator: brief(db, c.facultyCoordinatorId), memberCount, eventCount, myMembership };
    });
}

export function getClub(db: DB, user: SessionUser, id: number) {
  const club = requireClub(db, id);
  const privileged = isInstAdmin(user) || canManageClub(user, id) || user.coordinatedClubIds.includes(id);
  if (club.isArchived && !privileged) throw notFound("Club not found");

  const canViewMembers = privileged || hasClubPermission(user, id, "manage_members");
  const members = canViewMembers
    ? db
        .select({
          membershipId: clubMemberships.id,
          userId: users.id,
          fullName: users.fullName,
          email: users.email,
          status: clubMemberships.status,
          roleId: clubMemberships.roleId,
          roleName: clubRoles.name,
          joinedAt: clubMemberships.joinedAt,
        })
        .from(clubMemberships)
        .innerJoin(users, eq(users.id, clubMemberships.userId))
        .leftJoin(clubRoles, eq(clubRoles.id, clubMemberships.roleId))
        .where(eq(clubMemberships.clubId, id))
        .all()
        .map((m) => ({ ...m, dynamicRoleId: m.roleId }))
    : [];
  const memberCount =
    db.select({ n: sql<number>`count(*)` }).from(clubMemberships).where(and(eq(clubMemberships.clubId, id), eq(clubMemberships.status, "active"))).get()?.n ?? 0;

  const clubEvents = db
    .select({
      id: events.id, title: events.title, description: events.description, eventDate: events.eventDate, startTime: events.startTime,
      endTime: events.endTime, status: events.status, clubId: events.clubId, createdById: events.createdById,
      facultyCoordinatorId: events.facultyCoordinatorId, isDemo: events.isDemo,
    })
    .from(events)
    .where(eq(events.clubId, id))
    .all()
    .filter((e) => canSeeEvent(user, e, false));

  const { certificateTemplate, ...rest } = club;
  return {
    ...rest,
    admin: brief(db, club.clubAdminId),
    coordinator: brief(db, club.facultyCoordinatorId),
    dynamicRoles: canViewMembers || hasClubPermission(user, id, "create_events") ? rolesOfClub(db, id) : [],
    events: clubEvents,
    members,
    memberCount,
    certificateTemplate: parseCertificateTemplate(certificateTemplate),
    permissions: {
      canManage: canManageClub(user, id),
      canManageMembers: hasClubPermission(user, id, "manage_members"),
      canEditTemplate: hasClubPermission(user, id, "issue_certificates"),
      canArchive: isInstAdmin(user),
    },
  };
}

// ------------------------------------------------------------ commands
export function createClub(db: DB, actor: SessionUser, input: z.infer<typeof createClubSchema>, ip?: string) {
  requireInstAdmin(actor);
  return db.transaction((tx) => {
    assertClubStaff(tx, input.clubAdminId, input.facultyCoordinatorId);
    const dupName = tx.select({ id: clubs.id }).from(clubs).where(sql`lower(${clubs.name}) = lower(${input.name})`).get();
    if (dupName) throw conflict("A club with this name already exists", "CLUB_EXISTS");
    const code = input.code.toUpperCase();
    if (tx.select({ id: clubs.id }).from(clubs).where(eq(clubs.code, code)).get()) throw conflict("A club with this code already exists", "CLUB_EXISTS");
    const c = tx
      .insert(clubs)
      .values({ name: input.name, code, category: input.category, description: input.description, logoUrl: input.logoUrl ?? null, clubAdminId: input.clubAdminId, facultyCoordinatorId: input.facultyCoordinatorId })
      .returning()
      .get();
    notify(tx, input.clubAdminId, { title: "You now administer a club", message: `You were assigned as Club Admin of ${c.name}.`, type: "role", link: `/clubs/${c.id}` });
    notify(tx, input.facultyCoordinatorId, { title: "You coordinate a new club", message: `You were assigned as Faculty Coordinator of ${c.name}.`, type: "role", link: `/clubs/${c.id}` });
    audit(tx, actor.id, "CREATE_CLUB", "clubs", c.id, `${c.name} (${c.code})`, ip);
    return c;
  });
}

export function updateClub(db: DB, actor: SessionUser, id: number, input: z.infer<typeof updateClubSchema>, ip?: string) {
  const club = requireClub(db, id);
  const inst = isInstAdmin(actor);
  if (!inst && !canManageClub(actor, id)) throw forbidden("You cannot modify this club");
  const instOnly = input.isArchived !== undefined || input.clubAdminId !== undefined || input.facultyCoordinatorId !== undefined;
  if (instOnly && !inst) throw forbidden("Only institutional administrators can archive a club or change its staff");
  return db.transaction((tx) => {
    assertClubStaff(tx, input.clubAdminId, input.facultyCoordinatorId);
    if (input.name && input.name.toLowerCase() !== club.name.toLowerCase()) {
      if (tx.select({ id: clubs.id }).from(clubs).where(sql`lower(${clubs.name}) = lower(${input.name})`).get()) throw conflict("A club with this name already exists");
    }
    const patch: Partial<typeof clubs.$inferInsert> = {};
    for (const k of ["name", "description", "category", "logoUrl", "isArchived", "clubAdminId", "facultyCoordinatorId"] as const) {
      if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
    }
    if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");
    const updated = tx.update(clubs).set(patch).where(eq(clubs.id, id)).returning().get();
    if (input.facultyCoordinatorId !== undefined && input.facultyCoordinatorId !== club.facultyCoordinatorId) {
      // events awaiting a decision follow the new coordinator
      tx.update(events)
        .set({ facultyCoordinatorId: input.facultyCoordinatorId })
        .where(and(eq(events.clubId, id), inArray(events.status, ["Draft", "Pending Faculty Approval", "Rejected"])))
        .run();
      notify(tx, input.facultyCoordinatorId, { title: "You coordinate a club", message: `You are now Faculty Coordinator of ${club.name}.`, type: "role", link: `/clubs/${id}` });
    }
    audit(tx, actor.id, input.isArchived === true ? "ARCHIVE_CLUB" : input.isArchived === false ? "UNARCHIVE_CLUB" : "UPDATE_CLUB", "clubs", id, Object.keys(patch).join(","), ip);
    return updated;
  });
}

export function joinClub(db: DB, user: SessionUser, clubId: number) {
  if (user.role !== "student") throw forbidden("Only students can join clubs");
  return db.transaction((tx) => {
    const club = requireClub(tx, clubId);
    if (club.isArchived) throw badRequest("This club is archived and not accepting members");
    const existing = tx.select().from(clubMemberships).where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.userId, user.id))).get();
    if (existing?.status === "active") throw conflict("You are already an active member of this club", "ALREADY_MEMBER");
    if (existing?.status === "removed") throw forbidden("You were removed from this club. Contact the Club Admin to be reinstated.");
    const m = existing
      ? tx.update(clubMemberships).set({ status: "active", joinedAt: new Date() }).where(eq(clubMemberships.id, existing.id)).returning().get()
      : tx.insert(clubMemberships).values({ clubId, userId: user.id, status: "active" }).returning().get();
    notify(tx, user.id, { title: "Club joined", message: `You are now a member of ${club.name}.`, type: "role", link: `/clubs/${clubId}` });
    notify(tx, club.clubAdminId, { title: "New club member", message: `${user.fullName} joined ${club.name}.`, type: "role", link: `/clubs/${clubId}` });
    return m;
  });
}

export const memberUpdateSchema = z.object({
  membershipId: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(["active", "removed"]).optional(),
});

export function updateMember(db: DB, actor: SessionUser, clubId: number, input: z.infer<typeof memberUpdateSchema>, ip?: string) {
  const club = requireClub(db, clubId);
  return db.transaction((tx) => {
    const m = tx.select().from(clubMemberships).where(and(eq(clubMemberships.id, input.membershipId), eq(clubMemberships.clubId, clubId))).get();
    if (!m) throw notFound("Membership not found in this club");
    const patch: Partial<typeof clubMemberships.$inferInsert> = {};
    if (input.roleId !== undefined) {
      // Role assignment is a Club Admin privilege (a manage_members holder must not be able to self-escalate).
      if (!canManageClub(actor, clubId)) throw forbidden("Only the Club Admin can assign club roles");
      if (m.status !== "active") throw badRequest("Roles can only be assigned to active members");
      if (input.roleId !== null) {
        const role = tx.select().from(clubRoles).where(eq(clubRoles.id, input.roleId)).get();
        if (!role || role.clubId !== clubId) throw badRequest("Role does not belong to this club", "ROLE_OUT_OF_CLUB_SCOPE");
      }
      patch.roleId = input.roleId;
    }
    if (input.status !== undefined) {
      if (!hasClubPermission(actor, clubId, "manage_members")) throw forbidden("Missing club permission: manage_members");
      patch.status = input.status;
      if (input.status === "removed") patch.roleId = null;
    }
    if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");
    const updated = tx.update(clubMemberships).set(patch).where(eq(clubMemberships.id, m.id)).returning().get();
    if (input.roleId) {
      const role = tx.select().from(clubRoles).where(eq(clubRoles.id, input.roleId)).get();
      notify(tx, m.userId, { title: "New club role assigned", message: `You were appointed "${role?.name}" in ${club.name}.`, type: "role", link: `/clubs/${clubId}` });
    }
    audit(tx, actor.id, "UPDATE_MEMBERSHIP", "club_memberships", m.id, JSON.stringify({ roleId: input.roleId, status: input.status }), ip);
    return updated;
  });
}

const permissionList = z.array(z.enum(PERMISSIONS)).min(1, "Select at least one permission").max(PERMISSIONS.length);
export const roleCreateSchema = z.object({ roleName: z.string().trim().min(2).max(60), permissions: permissionList });
export const roleUpdateSchema = z.object({ roleId: z.coerce.number().int().positive(), roleName: z.string().trim().min(2).max(60).optional(), permissions: permissionList.optional() });

export function createRole(db: DB, actor: SessionUser, clubId: number, input: z.infer<typeof roleCreateSchema>, ip?: string) {
  const club = requireClub(db, clubId);
  if (!canManageClub(actor, clubId)) throw forbidden("Only the Club Admin can create club roles");
  return db.transaction((tx) => {
    if (tx.select({ id: clubRoles.id }).from(clubRoles).where(and(eq(clubRoles.clubId, clubId), sql`lower(${clubRoles.name}) = lower(${input.roleName})`)).get())
      throw conflict("A role with this name already exists in the club", "ROLE_EXISTS");
    const role = tx.insert(clubRoles).values({ clubId, name: input.roleName, createdBy: actor.id }).returning().get();
    const perms = [...new Set(input.permissions)] as Permission[];
    for (const p of perms) tx.insert(rolePermissions).values({ roleId: role.id, permissionKey: p }).run();
    audit(tx, actor.id, "CREATE_CLUB_ROLE", "club_roles", role.id, `${club.name}: ${role.name} [${perms.join(",")}]`, ip);
    return { id: role.id, clubId, roleName: role.name, permissions: perms };
  });
}

export function updateRole(db: DB, actor: SessionUser, clubId: number, input: z.infer<typeof roleUpdateSchema>, ip?: string) {
  requireClub(db, clubId);
  if (!canManageClub(actor, clubId)) throw forbidden("Only the Club Admin can edit club roles");
  return db.transaction((tx) => {
    const role = tx.select().from(clubRoles).where(and(eq(clubRoles.id, input.roleId), eq(clubRoles.clubId, clubId))).get();
    if (!role) throw notFound("Role not found in this club");
    if (input.roleName) tx.update(clubRoles).set({ name: input.roleName }).where(eq(clubRoles.id, role.id)).run();
    if (input.permissions) {
      tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id)).run();
      for (const p of new Set(input.permissions)) tx.insert(rolePermissions).values({ roleId: role.id, permissionKey: p }).run();
    }
    audit(tx, actor.id, "UPDATE_CLUB_ROLE", "club_roles", role.id, JSON.stringify({ name: input.roleName, permissions: input.permissions }), ip);
    return rolesOfClub(tx, clubId).find((r) => r.id === role.id);
  });
}

export function setCertificateTemplate(db: DB, actor: SessionUser, clubId: number, input: unknown, ip?: string) {
  requireClub(db, clubId);
  if (!hasClubPermission(actor, clubId, "issue_certificates")) throw forbidden("Missing club permission: issue_certificates");
  const tpl = certificateTemplateSchema.parse(input);
  db.transaction((tx) => {
    tx.update(clubs).set({ certificateTemplate: JSON.stringify(tpl) }).where(eq(clubs.id, clubId)).run();
    audit(tx, actor.id, "UPDATE_CERTIFICATE_TEMPLATE", "clubs", clubId, tpl.headerTitle, ip);
  });
  return tpl;
}
