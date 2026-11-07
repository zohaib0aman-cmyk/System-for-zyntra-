import { withApi, fromService, searchParamsToFilters } from "@/lib/api/handler";
import { opStats } from "@/lib/api/operations";
import type { DashboardRange } from "@/services";

export const dynamic = "force-dynamic";
const RANGES = new Set(["7d", "30d", "90d", "all"]);

export const GET = withApi("read", async ({ db, req }) => {
  const range = searchParamsToFilters(req).get("range") ?? "30d";
  return fromService(await opStats(db, (RANGES.has(range) ? range : "30d") as DashboardRange));
});
