# Zyntra API / MCP tests

End-to-end tests for the Phase 5 REST API and MCP server. They run against a
local Supabase + a running dev server.

## Run

```bash
# 1. Start Supabase (Docker) and the app with your local env
npx supabase start
npm run build && npm start        # or: npm run dev

# 2. In another shell, seed an owner + sample data, then:
node tests/api.test.mjs            # REST API: auth, scopes, CRUD, bulk, merge, PDF
node tests/mcp.test.mjs            # MCP: tools, readOnlyHint, scopes, actor in timeline

# Config via env (defaults shown):
#   BASE_URL=http://127.0.0.1:3123
#   SUPABASE_URL=http://127.0.0.1:54321
#   SUPABASE_SECRET_KEY=<service-role key>   (REQUIRED — from `npx supabase status`)
```

Both scripts create their own API keys through the service layer, exercise the
endpoints, and print PASS/FAIL per check (exit code 1 on any failure).
