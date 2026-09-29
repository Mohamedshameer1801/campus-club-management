import { route, body } from "@/lib/http";
import { profileUpdateSchema, updateProfile } from "@/lib/services/auth";

export const PATCH = route(async ({ req, db, user }) => updateProfile(db, user, await body(req, profileUpdateSchema)));
