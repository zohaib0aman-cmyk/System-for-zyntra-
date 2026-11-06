import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBackup, latestBackup } from "@/services";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily automatic backup. Schedule once a day (Vercel Cron or Supabase pg_cron).
 * Requires header:  Authorization: Bearer <CRON_SECRET>
 * Skips if a backup was already made in the last 20 hours (safe to call more often).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const force = req.nextUrl.searchParams.get("force") === "1";
  const last = await latestBackup(db);
  if (!force && last && Date.now() - new Date(last.created_at).getTime() < 20 * 3_600_000) {
    return NextResponse.json({ ok: true, skipped: "a backup was made in the last 20 hours", last: last.created_at });
  }
  const r = await createBackup(db, "auto", "system");
  return NextResponse.json({
    ok: r.ok,
    backup: r.ok ? { lead_count: r.data.lead_count, size_bytes: r.data.size_bytes } : { error: r.message },
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
