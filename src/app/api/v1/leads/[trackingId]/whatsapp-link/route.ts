import { withApi, fromService, searchParamsToFilters } from "@/lib/api/handler";
import { opWhatsAppLink } from "@/lib/api/operations";

export const dynamic = "force-dynamic";

export const GET = withApi("read", async ({ db, req, params }) => {
  const template = searchParamsToFilters(req).get("template");
  return fromService(await opWhatsAppLink(db, decodeURIComponent(params.trackingId), template));
});
