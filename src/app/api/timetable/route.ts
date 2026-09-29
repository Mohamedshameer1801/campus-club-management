import { route } from "@/lib/http";
import { listStructures } from "@/lib/services/timetable";

export const GET = route(({ db }) => listStructures(db));
