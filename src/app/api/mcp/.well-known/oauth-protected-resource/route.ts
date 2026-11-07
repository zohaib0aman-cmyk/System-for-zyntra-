import { NextResponse, type NextRequest } from "next/server";
import { publicBaseUrl } from "@/lib/api/baseUrl";

export const dynamic = "force-dynamic";
const cors = { "access-control-allow-origin": "*" };

export function GET(req: NextRequest) {
  const base = publicBaseUrl(req);
  return NextResponse.json(
    { resource: `${base}/api/mcp`, authorization_servers: [base], scopes_supported: ["read", "write"], bearer_methods_supported: ["header"] },
    { headers: cors },
  );
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}
