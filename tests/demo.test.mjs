import { api, check, makeKey, summary, db } from "./helpers.mjs";

console.log("Demo endpoint tests  (GET /api/v1/demo/leads/{tracking_id})");

const readKey = await makeKey("Demo Site", ["read"]);

// Pick any existing lead to look up.
const { data: lead } = await db
  .from("leads")
  .select("tracking_id,brand_name")
  .limit(1)
  .maybeSingle();
if (!lead) {
  console.log("  ! no leads in the database — run supabase/seed.sql first");
  process.exit(1);
}
const TID = lead.tracking_id;

// --- auth ---------------------------------------------------------------
check("missing key -> 401", (await api(`/demo/leads/${TID}`)).status === 401);
check("invalid key -> 401", (await api(`/demo/leads/${TID}`, { key: "zyn_live_nope" })).status === 401);

const ok = await api(`/demo/leads/${TID}`, { key: readKey });
check("valid read key -> 200", ok.status === 200, JSON.stringify(ok.json));

// --- payload ------------------------------------------------------------
const ALLOWED = ["tracking_id", "brand_name", "logo_url", "city", "state", "niche", "whatsapp"];
const keys = Object.keys(ok.json ?? {});
check("returns only the allowed fields", keys.length === ALLOWED.length && keys.every((k) => ALLOWED.includes(k)), JSON.stringify(keys));
check("tracking_id matches", ok.json?.tracking_id === TID);
check("brand_name present", ok.json?.brand_name === lead.brand_name);

const PRIVATE = ["notes", "phone", "email", "owner_name", "status", "score", "score_label", "tags", "priority", "source", "next_followup_at", "created_at"];
const leaked = PRIVATE.filter((f) => f in (ok.json ?? {}));
check("no private fields returned", leaked.length === 0, `leaked: ${leaked.join(", ")}`);

// --- not found ----------------------------------------------------------
const unknown = await api("/demo/leads/ZYN-IN-GJ-999999", { key: readKey });
check("unknown id -> 404", unknown.status === 404, String(unknown.status));
check("unknown id body is {error:'not_found'}", unknown.json?.error === "not_found", JSON.stringify(unknown.json));

const badFormat = await api("/demo/leads/not-a-real-id", { key: readKey });
check("bad format -> 404 not_found", badFormat.status === 404 && badFormat.json?.error === "not_found", JSON.stringify(badFormat.json));

// --- rate limit header shows the higher demo limit ----------------------
check("rate limit is 300/min", ok.headers.get("x-ratelimit-limit") === "300", ok.headers.get("x-ratelimit-limit"));

// --- the call is logged -------------------------------------------------
const { data: logs } = await db
  .from("api_logs")
  .select("route,status")
  .like("route", "%/demo/leads/%")
  .order("created_at", { ascending: false })
  .limit(1);
check("call logged in api_logs", (logs?.length ?? 0) > 0, JSON.stringify(logs));

summary();
