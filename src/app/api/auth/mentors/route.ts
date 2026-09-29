import { publicRoute } from "@/lib/http";
import { listMentors } from "@/lib/services/auth";

export const GET = publicRoute(({ db }) => ({ mentors: listMentors(db) }));
