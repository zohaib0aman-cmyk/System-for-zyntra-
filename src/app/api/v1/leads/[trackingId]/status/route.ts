import { withApi, fromService, readJson } from "@/lib/api/handler";
import { statusSchema } from "@/lib/api/schemas";
import { opSetStatus } from "@/lib/api/operations";

export const dynamic = "force-dynamic";

export const POST = withApi("write", async ({ db, actor, req, params }) => {
  const { status } = await readJson(req, statusSchema);
  return fromService(await opSetStatus(db, actor, decodeURIComponent(params.trackingId), status));
});
