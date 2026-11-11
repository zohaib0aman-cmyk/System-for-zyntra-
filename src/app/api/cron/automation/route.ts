import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAutomationSettings, runAutomation } from "@/services/automation";
import { notifyDueFollowups } from "@/services/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Called every 5 minutes by Supabase pg_cron (public.automation_tick).
 * Auth: Bearer <automation_settings.cron_secret> (or the CRON_SECRET env var).
 * Sends demo links to new leads, runs due follow-ups, and pushes due follow-up reminders.
 */
async function handle(req: NextRequest) {
  const db = createAdminClient();
  const s = await getAutomationSettings(db);
  const auth = req.headers.get("authorization") ?? "";
  const ok =
    (s?.cron_secret && same(auth, `Bearer ${s.cron_secret}`)) ||
    (process.env.CRON_SECRET && same(auth, `Bearer ${process.env.CRON_SECRET}`));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const automation = await runAutomation(db);
  const push = await notifyDueFollowups(db);
  return NextResponse.json({ ok: true, automation, followups: push.ok ? push.data : { error: push.message }, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
