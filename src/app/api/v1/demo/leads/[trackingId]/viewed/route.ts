import { NextResponse } from "next/server";
import { withApi } from "@/lib/api/handler";
import { recordDemoView } from "@/services/automation";

export const dynamic = "force-dynamic";

const TRACKING_ID_RE = /^ZYN-[A-Z]{2}-[A-Z]{2}-\d{6,}$/;

/**
 * The demo site calls this once when a lead has had their demo open for a few seconds.
 * The first view schedules the follow-up (call for high-value leads, AI WhatsApp for others).
 * Auth: the demo site's read-only API key (it can only report a view, nothing else).
 */
export const POST = withApi(
  "read",
  async ({ db, params }) => {
    const trackingId = decodeURIComponent(params.trackingId ?? "").trim().toUpperCase();
    if (!TRACKING_ID_RE.test(trackingId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const res = await recordDemoView(db, trackingId);
    if (!res.ok) return NextResponse.json({ error: res.code }, { status: res.code === "not_found" ? 404 : 500 });
    return NextResponse.json({ ok: true, first_view: res.data.first });
  },
  { rateLimit: 300 },
);
