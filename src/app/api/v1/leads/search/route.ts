import { withApi, fromService, searchParamsToFilters } from "@/lib/api/handler";
import { opSearch } from "@/lib/api/operations";

export const dynamic = "force-dynamic";

export const GET = withApi("read", async ({ db, req }) => {
  const sp = searchParamsToFilters(req);
  const q = sp.get("q") ?? "";
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 30) || 30, 1), 200);
  return fromService(await opSearch(db, q, limit));
});
