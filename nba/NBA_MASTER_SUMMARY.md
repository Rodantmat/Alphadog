# NBA MASTER SUMMARY — every transcript, message by message

**Purpose.** A complete, per-transcript record of everything done across the whole NBA build. Nothing
summarised away: every decision, build, fix, dead end and finding, in the order it happened, with the
transcript it came from so you can go straight to the source.

**How to use it.** Each section is one transcript file in `/mnt/transcripts/`. Within a section,
entries run oldest → newest. When you need more detail than is here, open that transcript and grep the
term — the GLOSSARY maps terms to their transcript.

**Update protocol.** Every entry carries the date it was ADDED to this document, so new material is
distinguishable from old. Multiple passes are run per transcript; a transcript is only marked
`PASSES: N clean` when N consecutive passes found nothing new.

| Document | What it holds |
|---|---|
| `NBA_MASTER_SUMMARY.md` | this file — everything done, per transcript |
| `NBA_GLOSSARY.md` | every term → which transcript, which context |
| `NBA_RECIPE.md` | how the system was built, step by step |
| `NBA_SYSTEM_ARCHITECTURE.md` | workers, tools, sources, infrastructure |
| `NBA_DATABASE.md` | every table and column, what it holds |
| `NBA_WORKERS.md` | every worker/script, path, function |
| `NBA_SYSTEM_DESIGN.md` | the three pipelines in detail |
| `NBA_OPEN_ITEMS.md` | deferred, dropped, partial, bugs, caveats |

**Transcript inventory (16 files, ~44 MB, 2026-09-03 → 2026-09-19):**

| # | File | Status |
|---|---|---|
| 1 | `2026-09-03-03-22-04-nba-expansion-phase1-static.txt` | **pass 1 done 2026-09-20** |
| 2 | `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete.txt` | **pass 1 done 2026-09-20** |
| 3 | `2026-09-03-22-24-13-nba-expansion-phase3a-final-complete.txt` | pending |
| 4 | `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete.txt` | pending |
| 5 | `2026-09-09-01-49-59-nba-expansion-phase3c-starter-status-complete.txt` | pending |
| 6 | `2026-09-09-02-15-50-nba-expansion-phase3d-delta-complete.txt` | pending |
| 7 | `2026-09-09-03-51-16-nba-classification-baseline-design-research.txt` | pending |
| 8 | `2026-09-09-20-48-33-nba-classification-baseline-backtest-calibration.txt` | pending |
| 9 | `2026-09-09-22-10-00-nba-baseline-production-pipeline.txt` | pending |
| 10 | `2026-09-10-01-31-13-nba-enrichment-backfill-pipeline-2026-09-09.txt` | pending |
| 11 | `2026-09-10-04-53-47-nba-enrichment-backfill-dfs-boards-2026-09-10.txt` | pending |
| 12 | `2026-09-11-21-01-23-nba-board-scrapers-fliff-docs-2026-09-10.txt` | pending |
| 13 | `2026-09-13-01-03-48-nba-boards-grader-market-2026-09-10.txt` | pending |
| 14 | `2026-09-13-20-53-23-nba-boards-grader-market-baseline-history-2026-09-11-12.txt` | pending |
| 15 | `2026-09-18-17-12-53-nba-enrichment-factors-a2-n1-reliability-audit-2026-09-12.txt` | pending |
| 16 | `2026-09-19-18-20-09-nba-enrichment-blowout-matchup-2026-09-13.txt` | pending |
| — | live chat 2026-09-19/20 (not yet a transcript file) | pending |

---

## T1 — `2026-09-03-03-22-04-nba-expansion-phase1-static.txt`
**PHASE 1 (recon) · PHASE 2 (system draft) · PHASE 3a start (static data)**
*292 content blocks · added 2026-09-20 · PASSES: 1*

### T1.1 Orientation and recon
- Session opened from a **handoff package** of three prior documents, all read in full:
  `nba/NBA_ARCHITECTURE_BLUEPRINT.md` (96 KB), `nba/NBA_LESSONS_LEARNED_FROM_MLB.md` (57 KB),
  `nba/NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` (18 KB).
- Read memory `/areas/alphadog.md`; listed repo root and `nba/`.
- **Verified against the live database that NO NBA namespace existed anywhere** in Postgres — checked
  `information_schema.schemata`, then every table/column matching `%nba%`, `%sport%`, `%league%`.
- Inspected MLB's discriminators: `market.sleeper_board_current` (sport, league),
  `market.prizepicks_board_current` (league), `ref.teams`, `control.*`, `config.worker_definitions`.
- Phase 1 findings committed as a banner to `nba/NBA_ARCHITECTURE_BLUEPRINT.md`.

### T1.2 Owner directives captured (the operating model)
- **NBA season is OFF** — this is preparation. Backfill static + past-season + market data where possible.
- Probe and **lock a source for each data type** before building on it.
- **ParlayAPI** expected to have past-season NBA data and will have live boards/market when the season starts.
- **PrizePicks board comes from a scraper scoped to NBA**, mirroring MLB's, living in GitHub.
- **All NBA work is additive-only. No MLB edits authorised.**
- Committed to `nba/NBA_PROJECT_LOG.md` (created here) and `nba/NBA_SYSTEM_DRAFT.md` (created here).
- Memory file `/areas/alphadog-nba.md` created.

### T1.3 The separate-universe decision (owner overruled the first proposal)
- First proposal was a shared control plane; **owner overruled it** — NBA gets its own everything.
- **14 NBA-only Postgres schemas created in one command**: `nba_ref`, `nba_calendar`, `nba_team`,
  `nba_stats`, `nba_daily`, `nba_context`, `nba_market`, `nba_score`, `nba_config`, `nba_control`,
  and others. Fully separate from MLB's.
- First tables: `nba_ref.teams` (team_id PK, nba_team_id, abbreviation, full_name, nickname,
  location_name, conference, division, arena_id, active, source_key, raw_json, created_at),
  plus players/arenas/officials, and `nba_config.worker_definitions` / `nba_config.system_settings`
  modelled on MLB's `config.worker_definitions` and `control.job_queue` / `control.worker_run_log`.

### T1.4 First worker, and the deploy-pipeline extension
- Built `nba/alphadog-v2-nba-static-teams.js` (syntax-checked with `node --check` before commit).
- **Extended the two SHARED deploy scripts additively** — `generate_wrangler_configs.py` and
  `github_mobile_deploy_workers.py` — with an isolated NBA branch (Hyperdrive, `nodejs_compat`,
  NBA vars), never touching MLB's paths. Created `nba/worker_manifest_nba.json`.
- Registered the worker in `nba_config.worker_definitions` (job_key `nba-static-teams`,
  group `01 Static`, phase `static`).
- First deploy FAILED on a path bug → patched → **deployed clean** to
  `alphadog-v2-nba-static-teams.rodolfoaamattos.workers.dev`.

### T1.5 THE BLOCKING DISCOVERY — Cloudflare cannot reach nba.com
- Worker deployed fine but **could not fetch `stats.nba.com`**. Added a `/debug-fetch` route to see
  the raw body rather than a truncated error.
- Rewrote headers to the canonical set real NBA scrapers use (Host, Referer, `x-nba-stats-origin`,
  researched via web search + `nba_api` docs). **Still blocked.**
- Added a read-only multi-endpoint probe: **`cdn.nba.com`, `core-api.nba.com` and `data.nba.net` ALL
  fail identically.** Conclusion: a **Cloudflare edge block on the whole nba.com family**, not a
  header problem and not endpoint-specific.
- Stored `balldontlie_api_key` (owner-supplied) in a new `nba_config.external_credentials` table,
  mirroring how `PARLAY_API_KEY` is held — **never in chat memory**.
- Owner preference recorded: **data should come from nba.com itself, like the MLB API** — so
  balldontlie stays a fallback, not the plan.

### T1.6 THE FIX — GitHub Actions as the scraping network
- Found the pattern by reading MLB's `.github/workflows/scrape.yml`: **MLB's PrizePicks scraper runs on
  GitHub Actions runners (a different network from Cloudflare), commits JSON to the repo, and the
  Worker reads the committed file.**
- Built `nba/scrape_nba_stats_teams.py` + a new isolated workflow `.github/workflows/nba-scrape.yml`
  (does not touch `scrape.yml`).

### T1.7 Four consecutive failures, each diagnosed, before it worked
1. **30 s timeout** — not a rejection, a slow/soft response → raised timeout, added retries.
2. **Timeout again, 3 attempts** — a consistent hang. Diagnosed as an anti-bot **tarpit** (silently
   stalling rather than returning a block).
3. **Timeout through the PROXY too** — which *ruled out IP blocking entirely* and pointed at
   **TLS fingerprinting** (Python `requests` has a recognisable handshake).
4. **`curl_cffi` (browser TLS impersonation) — SUCCESS.** HTTP 200, 30 teams, real live data.
   → This is the origin of `curl_cffi` as the standard transport for every NBA scraper since.

### T1.8 The self-trigger problem, and the file-based solution
- Building the scraper wasn't enough — it had to be **triggerable without the owner acting manually**.
- Added a real `github_trigger_workflow` tool to the MCP bridge (`alphadog-v2-admin-sql.js`), deployed
  it — **but the conversation's tool list was fixed at session start, so the new tool was unusable in
  that session.** Owner reconnected; the dispatch still never fired.
- Owner: *"no, the whole point is for me to do not run it manually."*
- **SOLUTION: a file-based trigger.** `.github/workflows/nba-scrape.yml` patched to fire on a push to
  `nba/TRIGGER_NBA_SCRAPE.txt`; writing that file (a capability already held) fires the workflow.
  **This mechanism is still in use** — later generalised to `nba/TRIGGER_NBA_PROBE.txt`.

### T1.9 Data-quality catch and the end-to-end loop
- First successful scrape returned **`abbreviation` empty for all 30 teams** — the `TeamAbbreviation`
  column isn't in that endpoint's real response. Patched the scraper, re-triggered, verified the fix
  against the actual committed file (not the meta claim).
- Rewired the Worker to **read the GitHub-committed file first**, falling back to a direct fetch, then
  to a certified static list. Deployed.
- **Verified independently in Postgres**, not from the worker's own report:
  `SELECT COUNT(*) FROM nba_ref.teams WHERE active=1` and a 5-row sample with real IDs, cities,
  conferences and divisions.

### T1.10 Artefacts created in T1
`nba/NBA_PROJECT_LOG.md` · `nba/NBA_SYSTEM_DRAFT.md` · `nba/worker_manifest_nba.json` ·
`nba/alphadog-v2-nba-static-teams.js` · `nba/scrape_nba_stats_teams.py` ·
`.github/workflows/nba-scrape.yml` · `nba/TRIGGER_NBA_SCRAPE.txt` ·
`nba/data/nba_teams_current.json` + `_meta.json` · 14 Postgres schemas ·
`nba_ref.teams` and siblings · `nba_config.worker_definitions`, `system_settings`,
`external_credentials` · memory `/areas/alphadog-nba.md` ·
patches to `generate_wrangler_configs.py`, `github_mobile_deploy_workers.py`, `alphadog-v2-admin-sql.js`

### T1.11 Findings that still govern the system
- **Cloudflare Workers cannot reach the nba.com family at all** → every NBA scrape runs on GitHub Actions.
- **`curl_cffi` browser impersonation is mandatory** — plain `requests` is TLS-fingerprinted and tarpitted.
- **A proxy alone does not help** against fingerprinting (proved: same timeout through the proxy).
- **A new MCP tool is not usable in the session that creates it** (tool list fixed at session start).
- **File-based workflow triggers** are the reliable self-service mechanism.
- **Verify in the database, never from the worker's own success claim.**

---

## T2 — `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete.txt`
**PHASE 3a — static/enrichment layer: players, arenas, officials, bio/tracking/team stats, research**
*417 content blocks · added 2026-09-20 · PASSES: 1*

*Note: T2 opens by REPLAYING the last ~60 blocks of T1 (the file-trigger build, the four timeout
failures, the `curl_cffi` breakthrough, the abbreviation fix). Those are documented in T1.x and are not
repeated here. New material starts at T2.1.*

### T2.1 The end-to-end loop actually closes
- Owner: *"so continue the work, i dont even need the new chat"* — the session continues rather than
  handing off.
- First `run_job` after rewiring the worker FAILED with **`"Unexpected end of JSON input"`**.
  Diagnosed precisely: the code requested the GitHub API's **raw** content-type but then tried to parse
  it as the **base64-JSON envelope**. Not a permissions problem. Patched, redeployed, re-triggered.
- **SUCCESS: `source_key: NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`** — real nba.com data flowing
  automatically through GitHub Actions → committed file → Worker → Postgres, with no manual step.
- Verified independently in Postgres (active teams, total, aliases, distinct source_keys).
- **Honest nuance recorded**: `source_key` only updates on rows that actually CHANGED — 25 of 30 teams
  had identical data and kept their old key. Not a bug; an upsert property worth knowing.

### T2.2 Players worker (the pattern becomes repeatable)
- Source located by research: **`commonallplayers`** (`IsOnlyCurrentSeason` parameter).
- Built `nba/scrape_nba_stats_players.py` + `nba/alphadog-v2-nba-static-players.js`.
- **The four-step wiring pattern is established here** and reused for every later worker:
  1. `nba/worker_manifest_nba.json`, 2. `generate_wrangler_configs.py`,
  3. `alphadog-v2-admin-sql.js` (bindingMap + dispatch branch + tool enum),
  4. `nba_config.worker_definitions` row.
- **BUG FOUND — deploy ORDER**: the fleet deploys **alphabetically from the file diff**, so
  `alphadog-v2-admin-sql.js` (which now depends on the new worker existing) sorted BEFORE
  `nba/alphadog-v2-nba-static-players.js` and failed. **Permanent fix: `github_mobile_deploy_workers.py`
  patched so admin-sql always deploys LAST.** This fix protects every future NBA worker.
- Result verified in Postgres: **582 players, 525 active, 1,822 aliases**, real names.

### T2.3 Arenas — three source failures before the right endpoint
- Owner instruction: *"research online and check all data that is static and can be mined now,
  including enrichment factors that does not change often."*
- Built `nba/scrape_nba_stats_arenas.py`, added as a third workflow step (depends on committed teams).
- **FAILURE 1 — git push race**: all three scrapes succeeded (30 teams, 582 players, 30 arenas) but the
  final `git push` was rejected non-fast-forward by a concurrent push.
  **Permanent fix: retry-with-rebase loop in the workflow** — still in use in every pipeline today.
- **FAILURE 2 — wrong columns**: `ARENA` / `ARENACAPACITY` came back null for all 30. Added a
  diagnostic to dump the real column names.
- **FAILURE 3 — the endpoint no longer carries them at all.** Confirmed genuinely absent, not a
  parsing bug. Researched and switched to **`teamdetails` → `TeamBackground` result set**.
- **SUCCESS**: 30/30 arenas with genuine current sponsor names (Rocket Arena, Frost Bank Center,
  Xfinity Mobile Arena). Some capacities null **because the source itself lacks them** — recorded
  honestly rather than filled in.
- Built `nba/alphadog-v2-nba-static-arenas.js`, wired the four ways, verified in Postgres.

### T2.4 Officials — a non-NBA source, deliberately
- Research found the NBA stats API has no referee-roster endpoint; **Wikipedia's "List of NBA referees"**
  does, with the real 2025-26 roster (74 staff + 7 non-staff, with jersey numbers), citing the NBA's
  own directory.
- Built `nba/scrape_nba_officials.py` with a **deliberately robust wikitext parser** — multiple real
  formats are plausible (same-line `||` vs separate-line cells, wikilinks, bold for active).
- **BUG: the officials script needs plain `requests`, not `curl_cffi`** (Wikipedia's API is designed
  for programmatic access and needs no bot bypass) — it was never installed in the workflow. Fixed.
- **Second fix in the same patch: the commit step must not hard-fail when one scraper produces no
  output.**
- Result: **80 officials parsed** (matches the expected ~81), names spot-checked against the source.
- Built `nba/alphadog-v2-nba-static-officials.js`, wired, verified 80/80 in Postgres.

### T2.5 The research pass (owner-directed, Gemini + web)
- Owner: *"use Gemini as well to give you insight, check online, check how systems deal with which data
  they use, what can be weekly (static or semi-static) data, like player age, speed…"*
- Web research on prop-model factors (usage rate, pace, rest, defensive rating), plus
  **`Alphadog Bridge:call_gemini`** for an independent synthesis — the two agreed.
- **Three new sources found, each ONE CALL for the whole league** (far cheaper than the per-team
  looping arenas required):
  - **`leaguedashplayerbiostats`** — age, height, weight, draft background, usage rate, efficiency
  - **`leaguedashptstats`** (SpeedDistance) — player tracking
  - team stats endpoint
- Written up as a permanent document: **`nba/NBA_ENRICHMENT_FACTORS_RESEARCH.md`**.

### T2.6 Bio / tracking / team-stats build
- `nba_ref.players` extended: `age`, `college`, `country`, `draft_year`, and more (`ALTER TABLE … ADD
  COLUMN IF NOT EXISTS`).
- Built `nba/scrape_nba_player_bio.py`, `nba/scrape_nba_player_tracking.py`,
  `nba/scrape_nba_team_stats.py` — all single-call, all added to the same workflow.
- Session continues into on/off-court splits and the DARKO research that completes in T3.

### T2.7 Artefacts created in T2
`nba/scrape_nba_stats_players.py` · `nba/alphadog-v2-nba-static-players.js` ·
`nba/scrape_nba_stats_arenas.py` · `nba/alphadog-v2-nba-static-arenas.js` ·
`nba/scrape_nba_officials.py` · `nba/alphadog-v2-nba-static-officials.js` ·
`nba/scrape_nba_player_bio.py` · `nba/scrape_nba_player_tracking.py` · `nba/scrape_nba_team_stats.py` ·
`nba/NBA_ENRICHMENT_FACTORS_RESEARCH.md` · `nba_ref.players` column extensions ·
4 more `nba_config.worker_definitions` rows

### T2.8 Findings that still govern the system
- **The four-step worker wiring pattern** (manifest → generator → admin-sql ×3 → registry).
- **admin-sql must deploy LAST** — alphabetical fleet deploy order otherwise breaks new bindings.
- **git push must retry with rebase** — concurrent pushes race.
- **An endpoint's documented columns may simply not exist any more** — diagnose by dumping the real
  response, then find the right endpoint (`teamdetails`/`TeamBackground`), don't patch around it.
- **Not every source needs `curl_cffi`** — Wikipedia needs plain `requests`; mixing them up breaks the run.
- **One-call-per-league endpoints are strongly preferred** over per-team loops.
- **`source_key` only changes on changed rows** — an upsert property, not a failure.
</content>
</parameter>
<parameter name="message">docs: NBA master summary - transcript 1 pass 1 complete