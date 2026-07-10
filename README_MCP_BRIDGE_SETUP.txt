ALPHADOG MCP BRIDGE v2.0 — REAL FIX (Cloudflare's official agents/MCP SDK)
================================================================================

WHY THIS VERSION IS DIFFERENT
The previous hand-rolled JSON-RPC implementation kept failing on real tool
calls (check_bindings, run_sql, run_job) no matter what auth method was
used. That pointed to the transport itself being non-compliant with what
Claude's connector strictly expects. This version replaces that hand-rolled
transport with Cloudflare's own official library for exactly this use case
(Workers as a remote MCP server). The OAuth auto-approve flow that already
worked is kept as-is.

FILES IN THIS ZIP — ALL 5 NEED TO GO IN, NOT JUST THE .js FILE
1. alphadog-v2-admin-sql.js
   -> replaces the existing file at that path
2. wrangler.alphadog-v2-admin-sql.jsonc
   -> replaces the existing file at that path
   -> adds: nodejs_compat flag, a Durable Object binding (MCP_OBJECT ->
      AlphadogMcp class), and a migration. McpAgent requires Durable
      Objects to hold session state — this is not optional.
3. package.json
   -> NEW file, goes at the REPO ROOT (same level as worker_manifest.json)
   -> declares the 3 new npm dependencies: agents, @modelcontextprotocol/sdk, zod
4. generate_wrangler_configs.py
   -> replaces the existing file at the REPO ROOT
   -> without this, the next auto-deploy would silently wipe the new
      Durable Object binding and service binding, exactly like it wiped
      the CONTROL_ROOM binding before
5. alphadog-v2-github-auto-deploy.yml
   -> replaces the existing file at .github/workflows/alphadog-v2-github-auto-deploy.yml
   -> changes one step: "npm install -D wrangler" becomes "npm install",
      so the 3 new dependencies actually get installed before deploy

WHAT TO DO
1. Replace all 5 files at their paths above.
2. Commit + push to main. Auto-deploy handles the rest.
3. Watch the GitHub Actions run closely this time. If something is wrong
   with the package names/API, THIS IS WHERE IT WILL SHOW UP — as a clear
   build error in the Actions log, not a silent runtime mystery like
   before. Copy/paste me the exact error if the deploy step fails.
4. If deploy succeeds, check:
   https://alphadog-v2-admin-sql.<your-subdomain>.workers.dev/health
   Confirm version says "alphadog-v2-admin-sql-mcp-bridge-v2.0-sdk".

CONNECTING IT TO CLAUDE
1. In Claude: Settings -> Connectors -> delete the old "Alphadog Bridge" if present.
2. Add custom connector:
   Name: Alphadog Bridge
   URL: https://alphadog-v2-admin-sql.<your-subdomain>.workers.dev/mcp
   (plain URL, no ?token= needed)
   Leave OAuth Client ID / Secret blank.
3. Tap Add, then Connect. Should auto-approve instantly.
4. Set tool permissions to "Always allow" to skip per-call confirmation prompts.

HONESTY NOTE
This is Cloudflare's documented, officially supported pattern for exactly
this (Workers as remote MCP server for Claude/Claude Desktop). I could not
test-install or test-run these exact packages in my own sandbox (no
internet access there), so I can't guarantee zero issues on first deploy —
but unlike the previous approach, any problem here will surface as a
visible build/deploy error instead of a silent "it just doesn't work"
runtime failure. That's a real, meaningful difference for actually
debugging it if something's still off.
