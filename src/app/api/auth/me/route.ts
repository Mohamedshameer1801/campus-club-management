import { publicRoute } from "@/lib/http";

export const GET = publicRoute(({ user }) => ({ user }));
