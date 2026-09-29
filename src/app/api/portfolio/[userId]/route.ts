import { route, intParam } from "@/lib/http";
import { getPortfolio } from "@/lib/services/portfolio";

export const GET = route<{ userId: string }>(({ db, user, params }) => ({ portfolio: getPortfolio(db, user, intParam(params.userId, "userId")) }));
