import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateScores } from "@/services";
import { notifyDueFollowups } from "@/services/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called every 15 minutes (Supabase pg_cron → pg_net, or Vercel Cron on Pro).
 * Requires header:  Authorization: Bearer <CRON_SECRET>
 *  1. sends push notifications for follow-ups that just became due
 *  2. refreshes scores whose "recent activity" bonus expired
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const push = await notifyDueFollowups(db);
  const scores = await recalculateScores(db, { stale: true });
  return NextResponse.json({
    ok: push.ok && scores.ok,
    followups: push.ok ? push.data : { error: push.message },
    scores: scores.ok ? scores.data : { error: scores.message },
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
