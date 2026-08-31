# Available Tools and Bridges — for any Claude chat working on AlphaDog (MLB or NBA)

*Compiled by direct inspection of the current tool set and live verification, not from memory or assumption. If a future session's tool list differs from this, trust the live list over this document and update it.*

---

## 1. The Alphadog Bridge MCP connector — the primary interface to the live system

This is a single MCP server (`Alphadog Bridge`) exposing the following tools. It is the only way any Claude chat reaches the live database, the GitHub repo, or the deployed workers — there is no other connector for this project.

| Tool | What it does |
|---|---|
| `github_get_file` | Read a file's current full content from the repo. |
| `github_grep_file` | Search inside a repo file server-side with regex + context lines, without pulling the whole file through the chat. Use for any file too large to safely read in full. |
| `github_list_dir` | List files in a repo directory (or repo root). |
| `github_put_file` | Create or fully overwrite a file and commit it directly to the branch — **this triggers the real GitHub Actions auto-deploy**, exactly like a manual commit would. |
| `github_patch_file` | Find-and-replace inside a file entirely server-side (old/new text never round-trips through the chat) — use for large files instead of get-then-put. |
| `github_list_workflow_runs` | Check recent GitHub Actions deploy run statuses. |
| `github_get_workflow_run_log` | Fetch the actual plain-text log of a specific deploy run, with optional grep filtering — use this instead of asking the person to paste deploy errors. |
| `run_sql` | Run SQL against the **D1** databases: `CONTROL_DB`, `CONFIG_DB`, `REF_DB`, `STATS_HITTER_DB`, `STATS_PITCHER_DB`, `TEAM_DB`, `DAILY_DB`, `MARKET_DB`, `CONTEXT_DB`, `SCORE_DB`, `ARCHIVE_DB`, `SCORING_DB`. SELECT always allowed; writes need `allow_write: true`. **Verified live on 2026-08-31: `check_bindings` reports all twelve of these D1 bindings as `false` on the current bridge worker** — confirm this tool actually reaches real data before trusting any result from it; it may need rewiring, or D1 access may now route through a different mechanism than originally configured. |
| `run_sql_postgres` | Run SQL against the real, live Postgres database via Hyperdrive — **this is the actual live migration target and where real current data lives**, per direct verification. SELECT/WITH always allowed; writes need `allow_write: true`. |
| `run_job` | Enqueue a job on the orchestrator via the Control Room (default), or call one specific pre-wired worker directly via the `target` param, bypassing the queue. **The `target` enum is fixed and pre-configured in the bridge worker's own code** — it currently supports: `CONTROL_ROOM`, `PHASE3A_WORKER`, `ORCHESTRATOR_WORKER`, `BASE_HITTER_GAME_LOGS_WORKER`, `BOARD_RUNNER_WORKER`, `DAILY_CONTEXT_RUNNER_WORKER`, `MARKET_RUNNER_WORKER`, `SCORING_RUNNER_WORKER`, `MASTER_RUNNER_WORKER`, `SCORE_PREP_WORKER`, `WEEKLY_DIFFERENTIAL_RUNNER_WORKER`, `DAILY_DELTA_RUNNER_WORKER`. **A brand-new worker (e.g., any new NBA worker) cannot be triggered this way until the bridge worker's own code is updated** — a new service binding added, and a new enum value wired to it. This is the correct, permanent fix for "how do I trigger my new worker from chat" (see Section 3 below), not a network-settings workaround. |
| `call_gemini` | Direct call to the Gemini API for adversarial statistical review — same real logic as this project's own `/gemini-proxy` route, exposed as a first-class tool. Runs server-side (uses the worker's own outbound network access, not the calling chat's sandboxed one). |
| `check_bindings` | Reports which D1 bindings, secrets, and vars are actually present on the bridge worker — without exposing secret values. Use this to verify assumptions about what's live before trusting a tool that depends on a specific binding. |

**Everything that touches the live system goes through this one connector.** There is no separate NBA-specific bridge — the same one serves both sports.

## 2. Claude's own native tools, available regardless of the MCP connector

These exist independent of the Alphadog Bridge and matter for this project in specific ways:

- **`web_search`** — searches the public web. Useful for external research (the same kind that found H1/H2 and the correlation literature during MLB's strategy work), and for checking NBA's own official API documentation, ParlayAPI's docs, or published NBA analytics research.
- **`web_fetch`** — fetches a URL's content, but **only for URLs that have already appeared in the conversation** (from a search result, or one the person pasted directly). It cannot be used to probe an arbitrary private URL like a `workers.dev` deployment that's never shown up in a search — confirmed by design, not a bug.
- **`bash_tool`** — a sandboxed Linux container with real but *restricted* network egress. **Verified live on 2026-08-31 by direct test**: a request to `https://alphadog-v2-nba-static-teams.rodolfoaamattos.workers.dev` was blocked with `x-deny-reason: host_not_allowed` — the container's network allowlist does not include `*.workers.dev` (or most arbitrary domains; it's scoped to package registries, GitHub, and a short list of infrastructure domains). **This means neither web_fetch nor bash_tool can be used to directly trigger or test a freshly-deployed Cloudflare Worker's live endpoint from chat.** The person can extend this allowlist in their own network egress settings if they want bash_tool to be able to reach `workers.dev` URLs directly in the future — that's a real, available fix, distinct from the `run_job` wiring fix in Section 1.
- **`create_file` / `str_replace` / `view` / `present_files`** — file operations inside the sandboxed container, for building local documents (like this one) before they're pushed to the real repo via `github_put_file`. These are **not** the same as the repo — nothing written here is visible to the person or persisted anywhere until explicitly pushed through the Alphadog Bridge tools.
- **`conversation_search` / `recent_chats` / `read_conversation`** — search and read past chat history. This is literally the mechanism that assembled the entire NBA reference package in `/nba/` — any future session can use these the same way to pull additional detail out of past sessions if something in the written reference docs turns out to be incomplete.
- Various UI-widget tools (chart display, quiz display, etc.) exist but have no real relevance to this project's actual work.

## 3. The concrete, actionable fix for "I can't trigger my new worker's live endpoint from chat"

This exact problem was hit live during NBA's first worker deployment (`alphadog-v2-nba-static-teams`), and it has two real, distinct fixes — pick based on what's actually needed:

1. **If the goal is a one-off manual test**: the person hits the URL directly from their own browser or a tool on their end (e.g., `POST` to the worker's `/run` endpoint) — this was already correctly identified as the immediate workaround.
2. **If the goal is letting any future Claude chat trigger this worker on demand, the same way it can already trigger `BOARD_RUNNER_WORKER` or `SCORING_RUNNER_WORKER`**: add a new service binding for the new worker to the Alphadog Bridge worker's own `wrangler.jsonc`, add a new `target` enum value in the bridge's `run_job` tool definition wired to that binding, and redeploy the bridge worker itself. This is a small, one-time change per new worker, and it's the properly "bridged" solution — it doesn't depend on the person's network settings and works the same way in every future chat, unlike a bash_tool network-allowlist change which only helps sessions that have bash_tool network access enabled.
3. **If bash_tool-based direct HTTP testing is wanted anyway** (useful for quick ad-hoc checks beyond just this one worker): the person can add `*.workers.dev` (or the specific subdomain) to their network egress allowlist in settings. This is a real, available option, confirmed by direct test to currently be the blocker.
