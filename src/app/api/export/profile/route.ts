import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exportLeadProfile } from "@/services";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get("id");
  if (!leadId || !/^[0-9a-f-]{36}$/i.test(leadId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const res = await exportLeadProfile(db, leadId, { actor: "owner" });
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: 400 });

  return new NextResponse(Buffer.from(res.data.bytes), {
    headers: {
      "content-type": res.data.contentType,
      "content-disposition": `attachment; filename="${res.data.filename}"`,
      "cache-control": "no-store",
    },
  });
}
