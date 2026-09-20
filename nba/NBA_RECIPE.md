# NBA RECIPE — how the system was built, step by step

**Purpose.** The cake recipe. Every step in the order it happened, so the build could be reproduced or
audited. Where a step exists because an earlier attempt failed, the failure is part of the recipe —
that is the useful part.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Steps 0–7 from T1 (6 passes) and T2 (1 pass). Later steps outlined from the journal, pending their own transcript passes. |

---

## STEP 0 — The founding constraints *(T1)*
Before any code:
1. **This is an EXPANSION**, joining a live, Postgres-native MLB system. Not a migration, not a
   from-scratch build.
2. **No MLB edits, ever. Everything additive.**
3. **Fully separate universe** — own schemas, own control plane, own folder, own workers.
   *(This overruled an initial proposal to share the job queue.)*
4. **Every tunable lives in the database**, never hardcoded.
5. **Research is mandatory** — deep online research, plus Gemini for complicated decisions, treated as
   reference and verified independently.
6. **Every session logs to `nba/NBA_PROJECT_LOG.md`.**

**The owner's three-run model**, which is the ancestor of today's P1/P2/P3:
- **Run 1 — static differential**: calendar, teams, players, rosters, arenas, referees.
- **Run 2 — delta daily**: game logs + incremental mining, **and the baseline — "the heart of the
  system"** — a multi-layer logic classifier (player × prop-line × variation × direction, each with its
  own thresholds/caps/bonuses/penalties) producing **hit probability % and confidence**.
- **Run 3 — master run, 4 stages**: Board → Daily Context (each factor with a fallback so it is never
  empty) → Market/Odds → Scoring Engine.
- **Explicitly NO orchestrator.** Each run triggered manually, worker by worker, verifying each.
- **Locked dependency: the baseline must finish before Daily Context or Scoring touch it.**

---

## STEP 1 — Recon before building *(T1)*

1. Read the three handoff documents **in full** (Blueprint 95,803 B, Lessons 57,066 B, Domain 18,034 B).
2. **Verify the claim, don't inherit it.** Queried `information_schema` directly and confirmed **zero
   NBA anything** existed. Found 18 MLB schemas, 116 workers, and the exact shapes of
   `worker_definitions`, `job_queue`, `worker_run_log`, `ref.teams`, `ref.umpire_tendency`.
3. **Corrected the handoff where it was wrong** — a `sport`/`league` column DOES exist on the Sleeper
   and Underdog board tables, contrary to the blueprint. Committed the correction as a banner.
   *(It changed nothing: the live code hardcodes `baseball_mlb` in the probe URL, the row filter and
   the league literal, so the column is not wired for dispatch.)*

---

## STEP 2 — Lock the namespace *(T1)*

1. **Naming**: workers `alphadog-v2-nba-<domain>-<thing>.js`, job_key `nba-<domain>-<thing>`.
2. **Folder**: everything inside `/nba/` — a second, independent guarantee against mixing.
3. **14 schemas in one statement.** No hitter/pitcher split; one `nba_stats`.
4. **Reference tables** with `source_key`, `raw_json` and `data_quality DEFAULT 'derived'` from the
   very first DDL — sourced vs derived distinguished from day one.
5. **Control plane**: `nba_config.worker_definitions` (8 cols, simpler than MLB's 16),
   `system_settings` seeded with the operating constants, `external_credentials` for secrets,
   `nba_control.worker_run_log` / `job_runs`.

---

## STEP 3 — Build the first worker, and discover the blocking constraint *(T1)*

1. Wrote `nba/alphadog-v2-nba-static-teams.js`, syntax-checked before commit.
2. **Extended the two shared deploy scripts additively**, created `worker_manifest_nba.json`.
3. Deployed — failed on a path bug — fixed — deployed clean.
4. **And then it could not fetch anything.** Added a `/debug-fetch` route to see the raw body.
5. Rewrote headers to the canonical set from `nba_api`. **Still blocked.**
6. Added a multi-endpoint probe: **`stats.nba.com`, `cdn.nba.com`, `core-api.nba.com` and
   `data.nba.net` ALL return 403/520/526 from a Worker.**
   **→ Conclusion: a Cloudflare edge block on the whole family. Not fixable. Change the architecture.**

---

## STEP 4 — Move scraping to GitHub Actions *(T1)*

1. Found the pattern in MLB's own `.github/workflows/scrape.yml`: **scrape on a GitHub runner, commit
   the JSON, have the Worker read the committed file.**
2. Built `nba/scrape_nba_stats_teams.py` + an isolated `.github/workflows/nba-scrape.yml`
   (**weekly Monday 09:00 UTC** — the ancestor of P1's cron).
3. **Four failures, each diagnosed rather than guessed:**
   | # | Symptom | Diagnosis | Fix |
   |---|---|---|---|
   | 1 | 30 s timeout | slow response, not rejection | raise timeout, add retries |
   | 2 | 3× timeout | consistent hang = anti-bot **tarpit** | — |
   | 3 | timeout **through the proxy** | **rules out IP blocking** | — |
   | 4 | — | **TLS fingerprinting** | **`curl_cffi` browser impersonation → SUCCESS** |
4. **HTTP 200, 30 teams, real data.**

---

## STEP 5 — Make it self-triggering *(T1)*

1. Added a `github_trigger_workflow` tool to the bridge — **unusable in the session that added it**
   (tool list fixed at start); a parallel chat confirmed it was missing there too, and that
   **`GITHUB_TOKEN` is correctly not exposed** and **`workflow_dispatch` cannot be fired by a push**.
2. Owner: *"the whole point is for me to do not run it manually."*
3. **`on: push: paths:` CAN be fired by a push** → the workflow watches `nba/TRIGGER_NBA_SCRAPE.txt`.
   **Still the fallback mechanism today.**

---

## STEP 6 — Close the loop, and verify it properly *(T1 → T2)*

1. First scrape returned **empty abbreviations** — `TeamAbbreviation` is not in that endpoint.
   Caught by reading the committed file, **not the scraper's own meta claim**. Fixed.
2. Rewired the Worker to read the committed file, with fallbacks.
3. First run failed with `"Unexpected end of JSON input"` — requested the GitHub API's **raw**
   content-type, parsed it as the **base64 envelope**. Fixed.
4. **SUCCESS end to end**: `source_key: NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`.
5. **Verified in Postgres**, not from the response.

---

## STEP 7 — Repeat the pattern for every static entity *(T2)*

**The four-step wiring, established here and used for every worker since:**
1. `nba/worker_manifest_nba.json`
2. `generate_wrangler_configs.py`
3. `alphadog-v2-admin-sql.js` — bindingMap **+** dispatch branch **+** tool enum
4. `nba_config.worker_definitions` row

**Entities, in order, each with its own lesson:**
- **Players** (`commonallplayers`) → 582/525 active, 1,822 aliases.
  **Lesson: the fleet deploys alphabetically, so `admin-sql` must deploy LAST.**
- **Arenas** → three failures: a git push race (**fix: retry with rebase**), then null columns, then
  **the endpoint genuinely no longer carries them** → switched to `teamdetails`/`TeamBackground`.
  **Lesson: dump the real response before patching the parser.**
- **Officials** → no stats-API source exists; used **Wikipedia**, which needs **plain `requests`, not
  `curl_cffi`**. 80 officials.
  **Lesson: not every source takes the same transport.**
- **Bio / tracking / team stats** → found by research (web + Gemini, cross-checked):
  `leaguedashplayerbiostats`, `leaguedashptstats`, team stats — **one call for the whole league**,
  far cheaper than the per-team loop arenas needed.

---

## STEPS 8+ — outlined from the journal, pending their own transcript passes

| Step | What | Transcript |
|---|---|---|
| 8 | **DARKO DPM** — four failures before the real mechanism: check for embedded data first → page is SSR, not JS-walled → guessed pagination got 50/530 and was **honestly flagged** → it's **SvelteKit not Next.js** → self-caught `//` vs `#` slip → **the full dataset is in the `kit.start()` hydration script** → JS bare decimals (`.534094`) are invalid JSON and need repair → **530/530, Jokić +6.76**. Stored as **`player_impact_rating`, NOT `darko`** (single-maintainer bus factor). **The weekly differential layer** — 6 tables, 3 snapshot/log pairs; had to exist BEFORE the next upsert because the writers overwrite; proven by **simulating** a change, not by observing zero events; a race and a **Hyperdrive cache artifact** diagnosed along the way. **Schedule 2,666 games** (1,400 + 1,266 already published) — and the **1 MB Contents API silent-empty bug** → `raw.githubusercontent.com`. **Play types** (11 types × 2 groupings × 2 levels = 44 calls after the cheap path failed), **tracking detail** (8 families, 4,652 rows), **shot quality** | T3 |
| 9 | 3-season game-log backfill (**79,358 player-game + 7,380 team-game rows**), advanced stats via a **2-call `MeasureType=Advanced` correction** (Gemini had estimated 1,230), career totals with the empirically-resolved **`TEAM_ID=0`** traded-player row, splits, **baseline methodology** (EWMA per-36 + Bayesian shrinkage → separate faster minutes → pace/defence → **anchor to team-implied totals**; rolling variance **for over-under pricing specifically**; trend via a second faster EWMA **dampened so it doesn't double-count**), **THE ARCHITECTURE CORRECTION — the owner's: baseline strictly historical and CACHEABLE, enrichment volatile and cheap.** GBDT/NN considered and **rejected with conditions**. Risks named: **double-counting, order-of-operations, baseline staleness on trades** | T4 |
| 10 | **Shot Quality Delta** built — two bugs (`+` needs `%2B`; **`leaguedashplayershotlocations` returns `resultSets` as a DICT, not a list**) — 582/582, Jokić +8.06%. **The position column was empty for 3 sessions** (scraper never extracted it, worker never wrote it) → fixed via **`playerindex`**, 582/582. **Defence-vs-Position** — 630 rows, free from data already held. **Starter status**: `boxscoretraditionalv2` returned **HTTP 200 with ZERO rows** — 1,228 "successes" → 799 rows; caught by comparing against expected magnitude; **v3 fixed it**, 32,179 rows, **12,300 = 10 × 1,230** | T5 |
| 11 | Manual chunked load (33 × 44 KB) abandoned when **the MCP enum refreshed between turns** and the Worker loaded the rest in 25 s. **Per-game officials** — `boxscoresummaryv2` found **documented unreliable after 2025-04-10** BEFORE building; v3 tested on 5 samples; **`if rows is not None` passes `[]`** → 3 games short; 3 games have no officials on NBA.com's side (all 2025-11-19). **Lineup synergy** — 8,000 rows, 4 bulk calls; **PK omitted `team_id`** (traded players pair up on two teams) and **failed loudly**. **The injury-PDF discovery** (`ak-static.cms.nba.com/referee/injury/`, back to 2021-22). **The daily delta worker** — completeness check took **three attempts** to reach `GAME_ID` prefix **`002` = 1230 = 1230** | T6 |
| 12 | **THE SEASON-HARDCODING FIX** — *"every weekly scraper hardcodes `Season=2025-26`; on Oct 3 the whole cycle would **silently keep pulling last season's frozen data while reporting success**"* — shared `active_stats_season()` across 9 scrapers, then **the same bug again in the per-game WRITERS** (`_2025_26`). **`stat_decay_config`** — 13 per-stat alphas, **α spread 6.7×, stabilisation spread 30×**, each with a stored rationale. The **30 KB documentation checkpoint**. **The MLB port**: the three-generation trap (two dead versions say so in their headers), the live v6 logic read line by line, **`MAX_TIERS=24`/`MIN_PER_TIER=15`/`TIER_BLEND_K=5` ported verbatim while the recency blend was REJECTED**. **The baseline boundary redefined.** The minutes model, the prop-by-prop factor lock, the 3-app prop map, the peer-reviewed factor sweep | T7 |
| 13 | **The five-dimension tiering architecture** materialised into `nba_config` (28 props, 29→67 factors, 460 relevance rows, 35 cells, 6 role tiers). **The nine-iteration calibration** → 0.7–1.0 pp on all 13 rungs, **`0 misses of 37` on BOTH seasons**. **A real bug in MLB's own guard** — symmetric floor forced 0.002 → 0.25. **The FRINGE anomaly was leakage.** **The permanent rule: a band cell is kept only if its sign is consistent across seasons.** *"Rung-aggregates hide errors."* | T8 |
| 14 | **All 11 single-stat props** under the two-season standard — 6 certified, 4 close, 1 regime. **The factor layer measured** (Brier +0.1–0.3%; home/B2B ≈0 everywhere). **Combos certified** (P+R 0.9, fantasy 0.8) — *"joint structure, never a direct fit"*. **DD calibrated.** **The period layer** — 3-part mixture, `P(OT)` at 5.3% pick'em, OT isolated as full-game − quarters. **The production builder** — *"the backtest harness on a past day IS already the production computation"* — reproduces the ladder exactly. **The loader. Loop closed end to end** | T9 |
| 15 | Factor lock (5 passes), return-ramp, day-before injury report, **the parity rule**, injury PDF scraper | T10 |
| 15 | Injury shard migration, per-game starters/officials, M1 defender quality, **ParlayAPI vs OddsAPI validation**, DFS board puller, overnight queue | T11 |
| 16 | Own scrapers for PP/Sleeper/UD/Fliff, **Fliff reverse-engineered from web bundles**, same-moment diffs proving our scrapers beat ParlayAPI | T12 |
| 17 | All five boards, two-season backfill, **grader**, **tier mapping incl. the invisible anchor**, per-book calibration | T13 |
| 18 | **Day-by-day baseline history (18.78M rows)**, combos gap, ladder depth, stage assignment by publish time | T14 |
| 19 | Enrichment engine, **A2 five failed panels**, N1 status resolution, prop reliability audit, live board archiver | T15 |
| 20 | **A2 retracted**, defender ratings rebuilt, **blowout on the real market spread**, matchup via market-implied totals, 60-season-prop rebuild, phase-aware calibration | T16 |
| 21 | **The final calculation engine** — final HP, confidence, score, edge; as-of calibration parity fix; the three pipelines | live session |
</content>
</parameter>
<parameter name="message">docs: NBA recipe - how the system was built, step by step