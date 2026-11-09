import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BASE_URL, check, makeKey, summary, db } from "./helpers.mjs";

console.log("MCP server tests");
const writeKey = await makeKey("MCP Claude", ["read", "write"]);
const readKey = await makeKey("MCP Reader", ["read"]);
const url = new URL(`${BASE_URL}/api/mcp`);
const connect = async (key) => {
  const t = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${key}` } } });
  const c = new Client({ name: "test", version: "1.0" });
  await c.connect(t);
  return { c, t };
};
const txt = (r) => r.content[0].text;

// No auth fails
let unauth = false;
try { await connect("zyn_live_bad"); } catch { unauth = true; }
check("invalid token rejected", unauth);

const { c, t } = await connect(writeKey);
const tools = (await c.listTools()).tools;
check("15 tools registered", tools.length === 15, String(tools.length));
check("read tools have readOnlyHint", tools.find(x => x.name === "search_leads")?.annotations?.readOnlyHint === true);
check("write tools not readOnly", tools.find(x => x.name === "add_lead")?.annotations?.readOnlyHint === false);

const add = await c.callTool({ name: "add_lead", arguments: { brand_name: "MCP Co", state: "DL", instagram: "mcpco" } });
const tid = JSON.parse(txt(add)).lead.tracking_id;
check("add_lead via MCP", /^ZYN-IN-DL-/.test(tid), tid);

const get = await c.callTool({ name: "get_lead", arguments: { tracking_id: tid } });
check("get_lead shows actor 'MCP Claude'", JSON.parse(txt(get)).recent_activity.some(a => a.actor === "MCP Claude"));

const search = await c.callTool({ name: "search_leads", arguments: { query: "MCP Co" } });
check("search_leads finds it", JSON.parse(txt(search)).results.some(r => r.tracking_id === tid));
await t.close();

// read-only key blocked from write
const ro = await connect(readKey);
const denied = await ro.c.callTool({ name: "add_lead", arguments: { brand_name: "No", state: "DL" } });
check("read-only key blocked from add_lead", denied.isError === true && /read-only/.test(txt(denied)));
await ro.t.close();

// actor recorded in DB
const { data } = await db.from("lead_activities").select("actor").eq("type", "created").order("created_at", { ascending: false }).limit(1);
check("DB timeline actor is the key name", data?.[0]?.actor === "MCP Claude", JSON.stringify(data));

summary();
