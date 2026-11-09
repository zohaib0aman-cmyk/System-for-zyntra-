import { withApi, fromService, readJson } from "@/lib/api/handler";
import { exportSchema } from "@/lib/api/schemas";
import { parseApiFilters } from "@/lib/api/schemas";
import { opExport } from "@/lib/api/operations";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Returns the export file inline as base64 (so an AI can hand it back to the
 * user) plus a data: URL. Body: { format, filters, columns, sort }.
 */
export const POST = withApi("read", async ({ db, actor, req }) => {
  const body = await readJson(req, exportSchema);
  const { filters, sort } = parseApiFilters(body.filters ?? {});
  const res = await opExport(db, actor, body.format, filters, sort, body.columns);
  if (!res.ok) return fromService(res);
  const d = res.data;
  return fromService({
    ok: true as const,
    data: {
      filename: d.filename,
      content_type: d.content_type,
      lead_count: d.lead_count,
      download_url: `data:${d.content_type};base64,${d.base64}`,
      base64: d.base64,
    },
  });
});
