import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyApiKey, logApiCall } from "@/services/apiKeys";
import { verifyAccessToken } from "@/services/oauth";
import { registerZyntraTools, type McpAuth } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SERVER_INFO = { name: "zyntra-lead-id", version: "1.0.0" };

/** Builds the MCP handler for a request, with the caller's auth baked into the tools. */
const handler = createMcpHandler(
  (server) => {
    // Tools are registered per-connection in withMcpAuth's wrapper via extra; see below.
    void server;
  },
  { serverInfo: SERVER_INFO },
);

/**
 * Verify a bearer token: either a Zyntra API key (zyn_live_…) or an OAuth
 * access token (zyn_at_…). Returns AuthInfo with the actor + scopes in `extra`.
 */
async function verifyToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;
  const db = createAdminClient();

  if (bearer.startsWith("zyn_at_")) {
    const tok = await verifyAccessToken(db, bearer);
    if (!tok) return undefined;
    return {
      token: bearer,
      clientId: tok.clientId,
      scopes: tok.scopes,
      extra: { actor: "Claude (connector)", keyId: null, scopes: tok.scopes },
    };
  }

  const key = await verifyApiKey(db, bearer);
  if (!key) return undefined;
  return {
    token: bearer,
    clientId: key.id,
    scopes: key.scopes,
    extra: { actor: key.name, keyId: key.id, scopes: key.scopes },
  };
}

/** Wrap the base handler so tools are registered with this caller's auth context. */
function authedHandler(req: Request) {
  const perRequest = createMcpHandler(
    (server) => {
      const info = (req as unknown as { auth?: AuthInfo }).auth;
      const extra = (info?.extra ?? {}) as { actor?: string; keyId?: string | null; scopes?: string[] };
      const auth: McpAuth = {
        actor: extra.actor ?? "AI",
        keyId: extra.keyId ?? null,
        scopes: (extra.scopes as McpAuth["scopes"]) ?? ["read"],
      };
      const db = createAdminClient();
      registerZyntraTools(server, auth, (tool, ok) => {
        void logApiCall(db, { keyId: auth.keyId, surface: "mcp", route: `tool:${tool}`, method: "CALL", status: ok ? 200 : 500, durationMs: 0 });
      });
    },
    { serverInfo: SERVER_INFO },
  );
  return perRequest(req);
}

const protectedHandler = withMcpAuth(authedHandler, verifyToken, {
  required: true,
  requiredScopes: ["read"],
});

export { protectedHandler as GET, protectedHandler as POST, protectedHandler as DELETE };
void handler;
