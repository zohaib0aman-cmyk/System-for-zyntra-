"use client";

import { useState } from "react";
import { CopyButton, CopyField } from "./CopyField";

const TABS = ["Claude (web & phone)", "Claude Code / desktop", "ChatGPT", "Any AI (REST)"] as const;
type Tab = (typeof TABS)[number];

export function ConnectGuide({ baseUrl }: { baseUrl: string }) {
  const [tab, setTab] = useState<Tab>("Claude (web & phone)");
  const mcpUrl = `${baseUrl}/api/mcp`;
  const apiBase = `${baseUrl}/api/v1`;
  const openapi = `${baseUrl}/api/v1/openapi.json`;

  const mcpJson = JSON.stringify({ mcpServers: { zyntra: { url: mcpUrl, headers: { Authorization: "Bearer YOUR_API_KEY" } } } }, null, 2);
  const curl = `curl ${apiBase}/leads/search?q=silk \\\n  -H "Authorization: Bearer YOUR_API_KEY"`;
  const curlAdd = `curl -X POST ${apiBase}/leads \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"brand_name":"New Brand","state":"GJ","phone":"98765 43210","niche":"Clothing Brand"}'`;

  return (
    <div className="space-y-4">
      <div className="card bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-inset ring-brand-100">
        First, create a key in <a href="/settings/connections" className="font-semibold underline">AI Connections</a>. Then follow the steps for your AI below.
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${tab === t ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Claude (web & phone)" && (
        <Card title="Claude — claude.ai (web and phone app)">
          <p>Claude connects to Zyntra as a <b>custom connector</b> using a secure login (OAuth) — no API key to paste.</p>
          <Steps
            steps={[
              <>In the Claude app, open <b>Settings → Connectors</b> (on the phone: <b>Settings → Connectors</b>) and tap <b>Add custom connector</b>.</>,
              <>Paste this MCP URL:</>,
            ]}
          />
          <CopyField value={mcpUrl} />
          <Steps
            start={3}
            steps={[
              <>Tap <b>Connect</b>. Claude opens Zyntra’s login — sign in with your owner account and tap <b>Allow</b>.</>,
              <>Done. In a chat, enable the <b>Zyntra</b> connector, then try: <i>“Find ZYN-IN-GJ-000001”</i> or <i>“Add a lead: Surat Silk House, Gujarat, 98765 43210.”</i></>,
            ]}
          />
          <Note>The connector can read and add/update leads, but cannot delete anything or manage keys.</Note>
        </Card>
      )}

      {tab === "Claude Code / desktop" && (
        <Card title="Claude Code & Claude Desktop (API key)">
          <p>These use an MCP config file with your API key.</p>
          <p className="font-medium">MCP URL</p>
          <CopyField value={mcpUrl} />
          <p className="font-medium">Config (replace YOUR_API_KEY)</p>
          <CodeBlock code={mcpJson} />
          <Steps
            steps={[
              <>Claude Code: add it with one command →</>,
            ]}
          />
          <CopyField value={`claude mcp add --transport http zyntra ${mcpUrl} --header "Authorization: Bearer YOUR_API_KEY"`} mono />
          <Steps
            start={2}
            steps={[<>Claude Desktop: paste the config above into <b>claude_desktop_config.json</b> (Settings → Developer → Edit Config), then restart.</>]}
          />
        </Card>
      )}

      {tab === "ChatGPT" && (
        <Card title="ChatGPT — Custom GPT with an Action">
          <Steps
            steps={[
              <>In ChatGPT, go to <b>Explore GPTs → Create</b>, then the <b>Configure</b> tab → <b>Create new Action</b>.</>,
              <>Under <b>Schema</b>, choose <b>Import from URL</b> and paste the OpenAPI URL:</>,
            ]}
          />
          <CopyField value={openapi} />
          <Steps
            start={3}
            steps={[
              <>Under <b>Authentication</b>, choose <b>API Key</b> → Auth Type <b>Bearer</b>, and paste your Zyntra key.</>,
              <>Save. Now ask the GPT: <i>“Show me all Hot clothing brands in Gujarat”</i> or <i>“Add these leads …”.</i></>,
            ]}
          />
          <Note>Use a key with the <b>write</b> scope if you want the GPT to add or edit leads.</Note>
        </Card>
      )}

      {tab === "Any AI (REST)" && (
        <Card title="Any AI or tool — REST API">
          <p className="font-medium">Base URL</p>
          <CopyField value={apiBase} />
          <p className="font-medium">Auth header</p>
          <CopyField value="Authorization: Bearer YOUR_API_KEY" mono={false} />
          <p className="font-medium">Search leads</p>
          <CodeBlock code={curl} />
          <p className="font-medium">Add a lead</p>
          <CodeBlock code={curlAdd} />
          <p className="font-medium">OpenAPI spec</p>
          <CopyField value={openapi} />
          <Note>Rate limit: 120 requests/minute per key. Every call is logged. Deleting leads and restoring backups are not available through the API.</Note>

          <div className="border-t border-slate-100 pt-3">
            <p className="font-medium">Demo / landing site endpoint</p>
            <p className="mb-2 text-sm text-slate-600">
              For a public demo page: returns <b>only</b> brand name, logo, city, state, niche and WhatsApp for one lead —
              never notes, phone, email, owner, status or score. Use a <b>read-only</b> key. Rate limit 300/min.
            </p>
            <CopyField value={`${apiBase}/demo/leads/ZYN-IN-GJ-000123`} />
            <div className="mt-2">
              <CodeBlock code={`curl ${apiBase}/demo/leads/ZYN-IN-GJ-000123 \\\n  -H "Authorization: Bearer YOUR_READONLY_KEY"`} />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </div>
  );
}
function Steps({ steps, start = 1 }: { steps: React.ReactNode[]; start?: number }) {
  return (
    <ol className="space-y-1.5 text-sm text-slate-700">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{start + i}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">{children}</p>;
}
function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100"><code>{code}</code></pre>
      <div className="absolute right-2 top-2"><CopyButton text={code} /></div>
    </div>
  );
}
