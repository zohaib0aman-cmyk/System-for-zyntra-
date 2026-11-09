import { NextResponse, type NextRequest } from "next/server";
import { publicBaseUrl } from "@/lib/api/baseUrl";

export const dynamic = "force-dynamic";

const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "*" };

export function GET(req: NextRequest) {
  const base = publicBaseUrl(req);
  return NextResponse.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      scopes_supported: ["read", "write"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: cors },
  );
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}
