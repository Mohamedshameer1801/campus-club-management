import { getSqlite } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sqlite = getSqlite();
    sqlite.prepare("select 1").get();
    return Response.json({ ok: true, database: "sqlite", foreignKeys: sqlite.pragma("foreign_keys", { simple: true }) === 1 });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
