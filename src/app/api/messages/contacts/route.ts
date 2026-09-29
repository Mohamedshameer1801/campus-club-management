import { route } from "@/lib/http";
import { contacts } from "@/lib/services/messages";

export const GET = route(({ db, user }) => ({ contacts: contacts(db, user) }));
