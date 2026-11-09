import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerClient } from "@/services/oauth";

export const dynamic = "force-dynamic";
const cors = { "access-control-allow-origin": "*" };

/** Dynamic Client Registration (RFC 7591). Public PKCE clients only. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { client_name?: string; redirect_uris?: string[]; scope?: string; grant_types?: string[] };
  const db = createAdminClient();
  const res = await registerClient(db, {
    client_name: body.client_name,
    redirect_uris: body.redirect_uris ?? [],
    scope: body.scope,
    grant_types: body.grant_types,
  });
  if (!res.ok) return NextResponse.json({ error: "invalid_client_metadata", error_description: res.message }, { status: 400, headers: cors });
  return NextResponse.json(
    {
      client_id: res.data.client_id,
      client_name: res.data.client_name,
      redirect_uris: res.data.redirect_uris,
      grant_types: res.data.grant_types,
      token_endpoint_auth_method: "none",
      scope: res.data.scopes.join(" "),
    },
    { status: 201, headers: cors },
  );
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}
