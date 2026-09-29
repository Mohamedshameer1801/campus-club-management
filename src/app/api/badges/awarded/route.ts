import { route } from "@/lib/http";
import { listAwarded } from "@/lib/services/badges";

export const GET = route(({ db, user }) => ({ awarded: listAwarded(db, user) }));
