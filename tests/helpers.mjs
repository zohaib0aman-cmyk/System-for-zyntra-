import { createClient } from "@supabase/supabase-js";

export const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3123";
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SECRET = process.env.SUPABASE_SECRET_KEY;

export const db = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

let pass = 0, fail = 0;
export function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}
export function summary() {
  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

/** Create an API key directly in the DB (SHA-256 of a random key), returning the plain key. */
import { createHash, randomBytes } from "node:crypto";
export async function makeKey(name, scopes) {
  const plain = "zyn_live_" + randomBytes(32).toString("base64url");
  const key_hash = createHash("sha256").update(plain).digest("hex");
  const key_prefix = plain.slice(0, 17);
  const { error } = await db.from("api_keys").insert({ name, key_hash, key_prefix, scopes });
  if (error) throw new Error("makeKey: " + error.message);
  return plain;
}

export async function api(path, { method = "GET", key, body } = {}) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}
