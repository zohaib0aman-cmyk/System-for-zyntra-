import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ApiScope, OAuthClientRow } from "@/lib/database.types";
import { dbError, type DB, type ServiceResult } from "./types";

/**
 * Minimal OAuth 2.1 authorization server for the MCP connector, following the
 * MCP authorization spec: Dynamic Client Registration + authorization code
 * with PKCE (S256). Public clients only (no client secret) — claude.ai uses
 * PKCE. Access tokens last 1 hour; refresh tokens 30 days.
 */
export const OAUTH_ACCESS_PREFIX = "zyn_at_";
export const OAUTH_REFRESH_PREFIX = "zyn_rt_";
const ACCESS_TTL_SECONDS = 3600;
const REFRESH_TTL_SECONDS = 30 * 86400;
const CODE_TTL_SECONDS = 600;
export const OAUTH_SCOPES: ApiScope[] = ["read", "write"];

const sha256 = (s: string) => createHash("sha256").update(s).digest();
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const sha256url = (s: string) => createHash("sha256").update(s).digest("base64url");

function parseScopes(scope: string | string[] | undefined): ApiScope[] {
  const raw = Array.isArray(scope) ? scope : (scope ?? "read write").split(/\s+/);
  const out = raw.filter((s): s is ApiScope => s === "read" || s === "write");
  return out.length ? [...new Set(out)] : ["read"];
}

// ---- Dynamic Client Registration -----------------------------------------

export type ClientRegistration = {
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  scope?: string;
  token_endpoint_auth_method?: string;
};

export async function registerClient(db: DB, reg: ClientRegistration): Promise<ServiceResult<OAuthClientRow>> {
  const redirect_uris = (reg.redirect_uris ?? []).filter((u) => /^https?:\/\//.test(u) || u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1"));
  if (redirect_uris.length === 0) {
    return { ok: false, code: "validation", message: "At least one valid redirect_uri is required.", fieldErrors: {} };
  }
  const client_id = "zyn_client_" + randomBytes(16).toString("hex");
  const { data, error } = await db
    .from("oauth_clients")
    .insert({
      client_id,
      client_secret: null, // public client (PKCE)
      client_name: reg.client_name?.slice(0, 120) ?? null,
      redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      scopes: parseScopes(reg.scope),
    })
    .select("*")
    .single();
  if (error) return dbError(error);
  return { ok: true, data };
}

export async function getClient(db: DB, clientId: string): Promise<OAuthClientRow | null> {
  const { data } = await db.from("oauth_clients").select("*").eq("client_id", clientId).maybeSingle();
  return data ?? null;
}

// ---- Authorization code ---------------------------------------------------

export async function createAuthCode(
  db: DB,
  input: {
    clientId: string;
    userId: string;
    redirectUri: string;
    scopes: ApiScope[];
    codeChallenge?: string | null;
    codeChallengeMethod?: string | null;
  },
): Promise<ServiceResult<string>> {
  const code = "zyn_code_" + randomBytes(24).toString("base64url");
  const { error } = await db.from("oauth_auth_codes").insert({
    code,
    client_id: input.clientId,
    user_id: input.userId,
    redirect_uri: input.redirectUri,
    scopes: input.scopes,
    code_challenge: input.codeChallenge ?? null,
    code_challenge_method: input.codeChallengeMethod ?? null,
    expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });
  if (error) return dbError(error);
  return { ok: true, data: code };
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

async function issueTokens(db: DB, clientId: string, userId: string | null, scopes: ApiScope[]): Promise<ServiceResult<TokenResponse>> {
  const access = OAUTH_ACCESS_PREFIX + randomBytes(32).toString("base64url");
  const refresh = OAUTH_REFRESH_PREFIX + randomBytes(32).toString("base64url");
  const { error } = await db.from("oauth_tokens").insert({
    access_hash: sha256hex(access),
    refresh_hash: sha256hex(refresh),
    client_id: clientId,
    user_id: userId,
    scopes,
    expires_at: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) return dbError(error);
  return {
    ok: true,
    data: { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope: scopes.join(" ") },
  };
}

/** Exchanges an authorization code (with PKCE) for tokens. */
export async function exchangeCode(
  db: DB,
  input: { code: string; clientId: string; redirectUri: string; codeVerifier?: string },
): Promise<ServiceResult<TokenResponse>> {
  const { data: row, error } = await db.from("oauth_auth_codes").select("*").eq("code", input.code).maybeSingle();
  if (error) return dbError(error);
  if (!row) return { ok: false, code: "validation", message: "invalid_grant", fieldErrors: {} };
  // Single-use: delete immediately.
  await db.from("oauth_auth_codes").delete().eq("code", input.code);

  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, code: "validation", message: "invalid_grant", fieldErrors: {} };
  if (row.client_id !== input.clientId) return { ok: false, code: "validation", message: "invalid_client", fieldErrors: {} };
  if (row.redirect_uri !== input.redirectUri) return { ok: false, code: "validation", message: "invalid_grant", fieldErrors: {} };

  if (row.code_challenge) {
    if (!input.codeVerifier) return { ok: false, code: "validation", message: "invalid_grant: PKCE verifier required", fieldErrors: {} };
    const expected =
      row.code_challenge_method === "plain" ? input.codeVerifier : sha256url(input.codeVerifier);
    const a = Buffer.from(expected);
    const b = Buffer.from(row.code_challenge);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, code: "validation", message: "invalid_grant: PKCE check failed", fieldErrors: {} };
    }
  }
  return issueTokens(db, row.client_id, row.user_id, row.scopes as ApiScope[]);
}

export async function refreshAccessToken(db: DB, refreshToken: string, clientId: string): Promise<ServiceResult<TokenResponse>> {
  const hash = sha256hex(refreshToken);
  const { data: row } = await db.from("oauth_tokens").select("*").eq("refresh_hash", hash).is("revoked_at", null).maybeSingle();
  if (!row || row.client_id !== clientId) return { ok: false, code: "validation", message: "invalid_grant", fieldErrors: {} };
  // Rotate: revoke the old token row, issue a new pair.
  await db.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
  return issueTokens(db, row.client_id, row.user_id, row.scopes as ApiScope[]);
}

export type VerifiedOAuth = { userId: string | null; clientId: string; scopes: ApiScope[] };

/** Verifies an OAuth access token (used by the MCP bearer auth). */
export async function verifyAccessToken(db: DB, token: string | undefined | null): Promise<VerifiedOAuth | null> {
  if (!token || !token.startsWith(OAUTH_ACCESS_PREFIX)) return null;
  const hash = sha256hex(token);
  const { data } = await db.from("oauth_tokens").select("*").eq("access_hash", hash).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  void db.from("oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return { userId: data.user_id, clientId: data.client_id, scopes: data.scopes as ApiScope[] };
}

export { parseScopes, sha256, CODE_TTL_SECONDS };
