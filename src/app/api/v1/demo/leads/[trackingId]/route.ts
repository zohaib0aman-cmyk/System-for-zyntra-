import { NextResponse } from "next/server";
import { withApi } from "@/lib/api/handler";

export const dynamic = "force-dynamic";

/** Requests/minute per key for the demo endpoint (higher than the normal API). */
const DEMO_RATE_LIMIT = 300;

/** Tracking IDs look like ZYN-IN-GJ-000123. */
const TRACKING_ID_RE = /^ZYN-[A-Z]{2}-[A-Z]{2}-\d{6,}$/;

/**
 * Public-facing display details for ONE lead, for the demo site.
 *
 * Only these fields are ever returned:
 *   tracking_id, brand_name, logo_url, city, state, niche, whatsapp
 * Private data (notes, phone, email, owner_name, status, score, tags, …) is
 * never selected from the database here, so it cannot leak.
 *
 * Auth: Authorization: Bearer <api key with the "read" scope>.
 */
export const GET = withApi(
  "read",
  async ({ db, params }) => {
    const trackingId = decodeURIComponent(params.trackingId ?? "").trim().toUpperCase();
    const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

    if (!TRACKING_ID_RE.test(trackingId)) return notFound();

    const { data, error } = await db
      .from("leads")
      // Narrow select: the private columns are never read.
      .select("tracking_id,brand_name,logo_url,city,state,niche,whatsapp")
      .eq("tracking_id", trackingId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: { code: "server_error", message: error.message } }, { status: 500 });
    }
    if (!data) return notFound();

    return NextResponse.json({
      tracking_id: data.tracking_id,
      brand_name: data.brand_name,
      logo_url: data.logo_url ?? null,
      city: data.city ?? null,
      state: data.state,
      niche: data.niche ?? null,
      whatsapp: data.whatsapp ?? null,
    });
  },
  { rateLimit: DEMO_RATE_LIMIT },
);
