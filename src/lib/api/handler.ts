import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  logApiCall,
  verifyApiKey,
  type ApiScope,
  type VerifiedKey,
} from "@/services/apiKeys";
import type { DB, ServiceResult } from "@/services/types";

export const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25 MB (PDFs)

export type ApiContext = {
  db: DB;
  key: VerifiedKey;
  /** The timeline actor for this request (the key's name). */
  actor: string;
  req: NextRequest;
  params: Record<string, string>;
};

type Handler = (ctx: ApiContext) => Promise<Response> | Response;

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export function apiOk(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Maps a service-layer result to an HTTP response. */
export function fromService<T>(res: ServiceResult<T>, okStatus = 200): Response {
  if (res.ok) return NextResponse.json(res.data, { status: okStatus });
  switch (res.code) {
    case "validation":
      return apiError(400, "validation_error", res.message, { fields: res.fieldErrors });
    case "not_found":
      return apiError(404, "not_found", res.message);
    case "duplicate":
      return apiError(409, "duplicate", res.message, { duplicates: res.duplicates });
    default:
      return apiError(500, "server_error", res.message);
  }
}

/**
 * Wraps a REST route: Bearer API-key auth, scope check, rate limit, body-size
 * limit, request logging and uniform JSON errors. The handler only ever calls
 * the shared service layer.
 */
export function withApi(requiredScope: ApiScope, handler: Handler) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const started = Date.now();
    const db = createAdminClient();
    const route = new URL(req.url).pathname;
    let keyId: string | null = null;
    let status = 500;

    const finish = (res: Response): Response => {
      status = res.status;
      void logApiCall(db, { keyId, surface: "rest", route, method: req.method, status, durationMs: Date.now() - started });
      res.headers.set("x-zyntra-api", "v1");
      return res;
    };

    try {
      const token = bearerToken(req);
      const key = await verifyApiKey(db, token);
      if (!key) return finish(apiError(401, "unauthorized", "Missing or invalid API key. Send Authorization: Bearer <key>."));
      keyId = key.id;

      if (requiredScope === "write" && !key.scopes.includes("write")) {
        return finish(apiError(403, "forbidden", "This API key does not have the 'write' scope."));
      }
      if (!key.scopes.includes("read")) {
        return finish(apiError(403, "forbidden", "This API key does not have the 'read' scope."));
      }

      const rl = await checkRateLimit(db, key.id);
      if (!rl.allowed) {
        const res = apiError(429, "rate_limited", `Rate limit of ${rl.limit}/min exceeded. Try again shortly.`);
        res.headers.set("retry-after", String(Math.max(1, Math.ceil((new Date(rl.resetAt).getTime() - Date.now()) / 1000))));
        return finish(res);
      }

      const params = await context.params;
      const res = await handler({ db, key, actor: key.name, req, params: params ?? {} });
      const out = res instanceof NextResponse ? res : new NextResponse(res.body, res);
      out.headers.set("x-ratelimit-limit", String(rl.limit));
      out.headers.set("x-ratelimit-remaining", String(rl.remaining));
      return finish(out);
    } catch (e) {
      if (e instanceof ZodError) {
        return finish(apiError(400, "validation_error", "Invalid request body.", { issues: e.issues }));
      }
      console.error(`[api] ${route}:`, e);
      return finish(apiError(500, "server_error", e instanceof Error ? e.message : "Unexpected error."));
    }
  };
}

function bearerToken(req: NextRequest): string | undefined {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}

/** Parses + validates a JSON body with a size guard. */
export async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) throw new ZodError([{ code: "custom", message: "Request body too large.", path: [] }]);
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new ZodError([{ code: "custom", message: "Request body too large.", path: [] }]);
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ZodError([{ code: "custom", message: "Body must be valid JSON.", path: [] }]);
  }
  return schema.parse(json);
}

export function searchParamsToFilters(req: NextRequest) {
  return new URL(req.url).searchParams;
}
