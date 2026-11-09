import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, refreshAccessToken } from "@/services/oauth";

export const dynamic = "force-dynamic";
const cors = { "access-control-allow-origin": "*" };
const err = (code: string, desc?: string, status = 400) =>
  NextResponse.json({ error: code, error_description: desc }, { status, headers: cors });

/** OAuth token endpoint: authorization_code (+PKCE) and refresh_token grants. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const body = form
    ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]))
    : ((await req.json().catch(() => ({}))) as Record<string, string>);

  const db = createAdminClient();
  const grant = body.grant_type;

  if (grant === "authorization_code") {
    if (!body.code || !body.client_id || !body.redirect_uri) return err("invalid_request", "code, client_id and redirect_uri are required");
    const res = await exchangeCode(db, { code: body.code, clientId: body.client_id, redirectUri: body.redirect_uri, codeVerifier: body.code_verifier });
    if (!res.ok) return err("invalid_grant", res.message);
    return NextResponse.json(res.data, { headers: cors });
  }
  if (grant === "refresh_token") {
    if (!body.refresh_token || !body.client_id) return err("invalid_request", "refresh_token and client_id are required");
    const res = await refreshAccessToken(db, body.refresh_token, body.client_id);
    if (!res.ok) return err("invalid_grant", res.message);
    return NextResponse.json(res.data, { headers: cors });
  }
  return err("unsupported_grant_type", `Unsupported grant_type: ${grant}`);
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}
