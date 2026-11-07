import { withApi, apiOk, apiError } from "@/lib/api/handler";
import { opDueFollowups } from "@/lib/api/operations";

export const dynamic = "force-dynamic";

export const GET = withApi("read", async ({ db }) => {
  const r = await opDueFollowups(db, "due");
  return r.ok ? apiOk({ count: r.data.length, followups: r.data }) : apiError(500, "server_error", r.message);
});
