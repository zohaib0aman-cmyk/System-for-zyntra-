import { NextResponse, type NextRequest } from "next/server";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { publicBaseUrl } from "@/lib/api/baseUrl";

export const dynamic = "force-dynamic";

/** Public: ChatGPT reads this to import the Action. No auth (it's only a schema). */
export function GET(req: NextRequest) {
  const spec = buildOpenApiSpec(publicBaseUrl(req));
  return NextResponse.json(spec, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" } });
}
