import { NextResponse, type NextRequest } from "next/server";
import { parseFilters } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";
import { exportLeads, type ExportFormat } from "@/services";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Exports the current filtered + sorted view. Auth is enforced by RLS (owner only). */
export async function GET(req: NextRequest) {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") === "pdf" ? "pdf" : "xlsx") as ExportFormat;
  const columns = sp.get("columns")?.split(",").filter(Boolean) ?? null;
  const { filters, sort } = parseFilters(sp);

  const res = await exportLeads(db, filters, format, sort, columns, { actor: "owner" });
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: 400 });

  return new NextResponse(Buffer.from(res.data.bytes), {
    headers: {
      "content-type": res.data.contentType,
      "content-disposition": `attachment; filename="${res.data.filename}"`,
      "cache-control": "no-store",
    },
  });
}
