import { withApi, fromService, searchParamsToFilters, readJson } from "@/lib/api/handler";
import { parseApiFilters, leadInputSchema } from "@/lib/api/schemas";
import { opList, opAddLead } from "@/lib/api/operations";

export const dynamic = "force-dynamic";

export const GET = withApi("read", async ({ db, req }) => {
  const { filters, sort, limit, offset } = parseApiFilters(searchParamsToFilters(req));
  return fromService(await opList(db, filters, sort, { limit, offset }));
});

export const POST = withApi("write", async ({ db, actor, req }) => {
  const input = await readJson(req, leadInputSchema);
  const res = await opAddLead(db, actor, input);
  return fromService(res, res.ok && res.data.created ? 201 : 200);
});
