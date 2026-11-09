import { api, check, makeKey, summary, db } from "./helpers.mjs";

console.log("REST API tests");
const readKey = await makeKey("Test Read", ["read"]);
const writeKey = await makeKey("Test Write", ["read", "write"]);

// Auth
check("no key -> 401", (await api("/leads")).status === 401);
check("bad key -> 401", (await api("/leads", { key: "zyn_live_nope" })).status === 401);
check("valid key -> 200", (await api("/leads", { key: readKey })).status === 200);

// Scope
check("read key cannot POST (403)", (await api("/leads", { method: "POST", key: readKey, body: { brand_name: "X", state: "GJ" } })).status === 403);

// Add + duplicate merge
const add = await api("/leads", { method: "POST", key: writeKey, body: { brand_name: "Test Co", state: "KA", phone: "9800011122", niche: "Clothing Brand" } });
check("add lead 201", add.status === 201 && add.json.created === true, JSON.stringify(add.json));
const tid = add.json.lead?.tracking_id;
check("tracking id format", /^ZYN-IN-KA-\d{6}$/.test(tid || ""), tid);
const dup = await api("/leads", { method: "POST", key: writeKey, body: { brand_name: "Test Co", state: "KA", phone: "+91 98000 11122", email: "d@x.com" } });
check("duplicate merges (not new)", dup.status === 200 && dup.json.merged === true, JSON.stringify(dup.json));

// Validation
const bad = await api("/leads", { method: "POST", key: writeKey, body: { state: "KA" } });
check("missing brand_name -> 400", bad.status === 400, JSON.stringify(bad.json));

// Bulk
const bulk = await api("/leads/bulk", { method: "POST", key: writeKey, body: { leads: [ { brand_name: "Bulk A", state: "MH" }, { brand_name: "Bulk B", state: "TN" }, { brand_name: "Test Co", state: "KA", phone: "9800011122" } ] } });
check("bulk 2 added 1 merged", bulk.json.added === 2 && bulk.json.merged === 1, JSON.stringify(bulk.json));

// Get + actor in timeline
await api(`/leads/${tid}/status`, { method: "POST", key: writeKey, body: { status: "Interested" } });
const got = await api(`/leads/${tid}`, { key: readKey });
check("get profile has tags/score/timeline", got.json.tracking_id === tid && Array.isArray(got.json.recent_activity));
check("timeline shows actor 'Test Write'", got.json.recent_activity.some(a => a.actor === "Test Write"), JSON.stringify(got.json.recent_activity.map(a=>a.actor)));

// Search
const search = await api(`/leads/search?q=${encodeURIComponent("98000 11122")}`, { key: readKey });
check("phone search finds lead", search.json.results?.some(r => r.tracking_id === tid));

// Stats, due, whatsapp, export
check("stats", (await api("/stats", { key: readKey })).json.total_leads > 0);
check("due followups", Array.isArray((await api("/followups/due", { key: readKey })).json.followups));
check("whatsapp link", (await api(`/leads/${tid}/whatsapp-link?template=First%20intro`, { key: readKey })).json.url?.startsWith("https://wa.me/"));
const exp = await api("/exports", { method: "POST", key: readKey, body: { format: "xlsx", filters: { state: "KA" } } });
check("export returns base64 xlsx", exp.json.base64?.length > 100 && exp.json.filename?.endsWith(".xlsx"));

// Rate limit headers
check("rate-limit headers present", (await api("/stats", { key: readKey })).headers.get("x-ratelimit-limit") === "120");

// Revoked key rejected
await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("key_prefix", readKey.slice(0,17));
check("revoked key -> 401", (await api("/leads", { key: readKey })).status === 401);

summary();
