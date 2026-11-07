import { withApi, fromService, readJson } from "@/lib/api/handler";
import { tagsSchema } from "@/lib/api/schemas";
import { opAddTags } from "@/lib/api/operations";

export const dynamic = "force-dynamic";

export const POST = withApi("write", async ({ db, actor, req, params }) => {
  const { tags } = await readJson(req, tagsSchema);
  return fromService(await opAddTags(db, actor, decodeURIComponent(params.trackingId), tags), 201);
});
