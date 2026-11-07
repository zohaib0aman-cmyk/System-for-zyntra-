import { withApi, fromService, readJson } from "@/lib/api/handler";
import { bulkLeadsSchema } from "@/lib/api/schemas";
import { opAddLeadsBulk } from "@/lib/api/operations";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withApi("write", async ({ db, actor, req }) => {
  const { leads } = await readJson(req, bulkLeadsSchema);
  return fromService(await opAddLeadsBulk(db, actor, leads));
});
