import { route } from "@/lib/http";
import { getAnalytics } from "@/lib/services/analytics";

export const GET = route(({ db, user }) => getAnalytics(db, user));
