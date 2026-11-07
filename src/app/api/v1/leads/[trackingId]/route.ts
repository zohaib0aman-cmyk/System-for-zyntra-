import { withApi, fromService, readJson } from "@/lib/api/handler";
import { leadUpdateSchema } from "@/lib/api/schemas";
import { opGet, opUpdate } from "@/lib/api/operations";

export const dynamic = "force-dynamic";

export const GET = withApi("read", async ({ db, params }) => {
  return fromService(await opGet(db, decodeURIComponent(params.trackingId)));
});

export const PATCH = withApi("write", async ({ db, actor, req, params }) => {
  const fields = await readJson(req, leadUpdateSchema);
  return fromService(await opUpdate(db, actor, decodeURIComponent(params.trackingId), fields));
});
