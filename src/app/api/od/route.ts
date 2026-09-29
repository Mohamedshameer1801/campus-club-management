import { route } from "@/lib/http";
import { listOd } from "@/lib/services/od";

export const GET = route(({ db, user }) => ({ onDutyRequests: listOd(db, user) }));
