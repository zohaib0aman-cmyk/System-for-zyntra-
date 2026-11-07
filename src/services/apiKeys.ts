import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ApiKeyRow, ApiScope } from "@/lib/database.types";
import { dbError, type DB, type ServiceResult } from "./types";
export type { ApiScope };

export type ApiKey = ApiKeyRow;
export const API_KEY_PREFIX = "zyn_live_";
export const RATE_LIMIT_PER_MINUTE = Number(process.env.API_RATE_LIMIT ?? 120);

/** SHA-256 hex of a key. Keys are high-entropy random, so a fast hash is fine. */
export function hashKey(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

function newPlainKey(): string {
  // zyn_live_<43 base64url chars> (32 random bytes)
  return API_KEY_PREFIX + randomBytes(32).toString("base64url");
}

export type CreatedApiKey = { id: string; name: string; scopes: ApiScope[]; plainKey: string; prefix: string };

/** Creates a key, returns the PLAIN key once (store the hash only). */
export async function createApiKey(db: DB, name: string, scopes: ApiScope[]): Promise<ServiceResult<CreatedApiKey>> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, code: "validation", message: "Give the key a name (e.g. “Claude”).", fieldErrors: {} };
  const validScopes = scopes.filter((s): s is ApiScope => s === "read" || s === "write");
  if (validScopes.length === 0) return { ok: false, code: "validation", message: "Choose at least the read scope.", fieldErrors: {} };

  const plainKey = newPlainKey();
  const key_hash = hashKey(plainKey);
  const key_prefix = plainKey.slice(0, API_KEY_PREFIX.length + 8); // zyn_live_ab12cd34

  const { data, error } = await db
    .from("api_keys")
    .insert({ name: clean, key_hash, key_prefix, scopes: validScopes })
    .select("*")
    .single();
  if (error) return dbError(error);
  return { ok: true, data: { id: data.id, name: data.name, scopes: data.scopes, plainKey, prefix: key_prefix } };
}

export async function listApiKeys(db: DB): Promise<ServiceResult<ApiKey[]>> {
  const { data, error } = await db.from("api_keys").select("*").order("created_at", { ascending: false });
  if (error) return dbError(error);
  return { ok: true, data: data ?? [] };
}

export async function revokeApiKey(db: DB, id: string): Promise<ServiceResult<null>> {
  const { error } = await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  if (error) return dbError(error);
  return { ok: true, data: null };
}

export type VerifiedKey = { id: string; name: string; scopes: ApiScope[] };

/**
 * Verifies a plaintext API key. Returns the key's id, name (used as the
 * timeline actor) and scopes, or null. Uses the service-role DB client.
 */
export async function verifyApiKey(db: DB, plain: string | undefined | null): Promise<VerifiedKey | null> {
  if (!plain || !plain.startsWith(API_KEY_PREFIX)) return null;
  const hash = hashKey(plain);
  const { data } = await db
    .from("api_keys")
    .select("id,name,scopes,key_hash,revoked_at")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  // Constant-time compare as defence in depth (the WHERE already matched the hash).
  const a = Buffer.from(hash);
  const b = Buffer.from(data.key_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // Best-effort last-used stamp (don't block the request).
  void db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return { id: data.id, name: data.name, scopes: data.scopes };
}

export type RateResult = { allowed: boolean; remaining: number; resetAt: string; limit: number };

export async function checkRateLimit(db: DB, keyId: string, limit = RATE_LIMIT_PER_MINUTE): Promise<RateResult> {
  const { data, error } = await db.rpc("api_rate_hit", { p_key: keyId, p_limit: limit, p_window_seconds: 60 });
  if (error || !data || data.length === 0) {
    // Fail open on a limiter error, but never crash the request.
    return { allowed: true, remaining: limit, resetAt: new Date(Date.now() + 60_000).toISOString(), limit };
  }
  const r = data[0];
  return { allowed: r.allowed, remaining: r.remaining, resetAt: r.reset_at, limit };
}

export async function logApiCall(
  db: DB,
  entry: { keyId: string | null; surface: "rest" | "mcp"; route: string; method: string; status: number; durationMs: number },
): Promise<void> {
  const { error } = await db.from("api_logs").insert({
    key_id: entry.keyId,
    surface: entry.surface,
    route: entry.route.slice(0, 200),
    method: entry.method,
    status: entry.status,
    duration_ms: entry.durationMs,
  });
  if (error) console.error(`[api_log] ${error.message}`);
}

export async function recentApiLogs(db: DB, limit = 50) {
  const { data, error } = await db
    .from("api_logs")
    .select("*, api_keys(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return dbError(error);
  return { ok: true as const, data: data ?? [] };
}
