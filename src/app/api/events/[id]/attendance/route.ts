import { route, body, intParam } from "@/lib/http";
import { attendanceSchema, markAttendance } from "@/lib/services/events";

export const POST = route<{ id: string }>(async ({ req, db, user, params, ip }) => {
  const r = markAttendance(db, user, intParam(params.id), await body(req, attendanceSchema), ip);
  return { message: `Attendance marked as ${r.attendanceStatus}`, registration: r };
});
