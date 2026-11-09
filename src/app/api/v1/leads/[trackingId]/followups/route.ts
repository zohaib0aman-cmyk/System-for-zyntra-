import { withApi, fromService, readJson } from "@/lib/api/handler";
import { followupSchema } from "@/lib/api/schemas";
import { opSetFollowup } from "@/lib/api/operations";

export const dynamic = "force-dynamic";

export const POST = withApi("write", async ({ db, actor, req, params }) => {
  const { due_at, note } = await readJson(req, followupSchema);
  return fromService(await opSetFollowup(db, actor, decodeURIComponent(params.trackingId), due_at, note), 201);
});
