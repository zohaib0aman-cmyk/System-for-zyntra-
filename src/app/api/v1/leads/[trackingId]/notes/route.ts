import { withApi, fromService, readJson } from "@/lib/api/handler";
import { noteSchema } from "@/lib/api/schemas";
import { opAddNote } from "@/lib/api/operations";

export const dynamic = "force-dynamic";

export const POST = withApi("write", async ({ db, actor, req, params }) => {
  const { note } = await readJson(req, noteSchema);
  return fromService(await opAddNote(db, actor, decodeURIComponent(params.trackingId), note), 201);
});
