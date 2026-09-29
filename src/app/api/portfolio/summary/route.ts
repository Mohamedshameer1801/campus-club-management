import { route } from "@/lib/http";
import { generateSummary } from "@/lib/services/portfolio";

// Reads the caller's verified records from the database - the request body is never trusted for achievements.
export const POST = route(async ({ db, user }) => {
  if (user.role !== "student") return { source: "template", text: "", bullets: [], note: "Portfolio summaries are generated for student accounts." };
  return generateSummary(db, user);
});
