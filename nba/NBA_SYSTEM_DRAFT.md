# NBA Project — System Draft (Phase 2)

*Design document only — no implementation here. Written after Phase 1 (live verification, see NBA_PROJECT_LOG.md 2026-08-31 entry) and against the operating model the person locked in on 2026-08-31 (also logged there). Read NBA_ARCHITECTURE_BLUEPRINT.md, NBA_LESSONS_LEARNED_FROM_MLB.md, and NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md first.*

---

## 1. Naming convention (locks the collision-avoidance decision the blueprint flagged as required before the first NBA table/worker)

**Worker files & job_keys**: `alphadog-v2-nba-<domain>-<thing>.js`, job_key `nba-<domain>-<thing>` (mirrors MLB's existing `alphadog-v2-<domain>-<thing>` / `<domain>-<thing>` pattern exactly, with an unambiguous `nba-` token inserted). Example: MLB's `alphadog-v2-static-teams.js` / `static-teams` → NBA's `alphadog-v2-nba-static-teams.js` / `nba-static-teams`.

**Repo location**: every NBA worker file, wrangler config, and schema file lives inside the existing `/nba/` repo folder (not the repo root, where every MLB worker currently lives) — e.g. `/nba/alphadog-v2-nba-static-teams.js`, `/nba/wrangler.alphadog-v2-nba-static-teams.jsonc`, `/nba/schema_nba_ref_db.sql`. This gives a second, independent way (folder, not just filename prefix) to guarantee zero accidental mixing with MLB files, per the person's explicit instruction.

**Postgres schemas**: new, separate schemas, `nba_`-prefixed, parallel to MLB's existing ones — `nba_ref`, `nba_calendar`, `nba_stats` (NBA has no hitter/pitcher split — see Section 3), `nba_team`, `nba_daily`, `nba_context`, `nba_market`, `nba_archive`, `nba_score`, `nba_scoring`, `nba_backtest`, `nba_classification`, `nba_certifier`, `nba_context_cert`. Every one of these is a brand-new schema — none reuse or extend an MLB schema, per the person's explicit "completely independent data universe" instruction.

**CORRECTED 2026-08-31 — no exception, full separation**: the person explicitly overruled the control-plane-reuse exception below (originally proposed citing blueprint Section 7e) — *"nothing will share same space, tables, folders, all separated for each sport."* NBA gets its own `nba_control` and `nba_config` schemas, with its own `nba_control.job_queue`/`job_runs` and `nba_config.worker_definitions`/`worker_schedules` — full duplicates of the pattern, zero rows shared with MLB's `control.*`/`config.*`. This is a deliberate, real duplication of otherwise-generic plumbing, accepted as the cost of the person's explicit "fully separate universe, no exceptions" requirement — do not silently re-introduce sharing here in a later session because it looks more efficient.

**Canonical ID format**: `nba_<entity>_<source_id>` for every NBA entity ID (e.g. `nba_team_id`, `nba_player_id`, `nba_game_id`) — decided once, applied everywhere, before the first NBA table is created, per the blueprint's naming-discipline lesson.

---

## 2. Reused vs. new (confirms and slightly refines Domain Mapping Section 4 against what Phase 1 actually found live)

**Reused as-is (shared, sport-agnostic infrastructure)**:
- Cloudflare Workers + `wrangler` deploy mechanics, the GitHub Actions auto-deploy pipeline, `generate_wrangler_configs.py` (NBA workers get added to its template — watch for the hardcoded binding whitelist-tuple gotcha the blueprint flags).
- The Hyperdrive/Postgres connection pattern (`prepare: false`, `max: 3-5`).
- The MCP admin-bridge worker (`alphadog-v2-admin-sql.js`) and its `run_sql_postgres`/GitHub tool surface.
- `config.worker_definitions` / `config.worker_schedules` / `control.job_queue` / `control.job_runs` (bookkeeping only — see Section 1's exception).
- The ParlayAPI account/key (`config.external_credentials`, `credential_key='parlay_api_key'`) — same paid account, `basketball_nba` sport key. **Coverage for this sport key is still not independently verified — see Section 5, open question 1.**
- The "certification center" UI, once NBA data exists in a shape it can read — per the person's explicit instruction, no separate NBA UI is planned.
- The entire statistical research standard (Lessons doc Parts A–F), the differential-write pattern, the chunking pattern, the tri-state (real/derived/temporary) data-quality tagging, the two-layer interpretable-rule + calibration-loop scoring architecture, the "preset dictionary" precompute-once principle, the config-table-driven tunable-variable discipline (now doubly required, since the person independently re-stated it as a hard rule this session).

**Must be built fresh, NBA-specific**:
- Every schema and table listed in Section 1.
- The full prop taxonomy (Section 3).
- Every enrichment factor (arena, fatigue/rest, injury, referee, pace, matchup, etc. — see Section 3/4 of the Domain Mapping doc; still to be locked per-factor, per the person's own framing).
- The board-mining workers for PrizePicks/Sleeper/Underdog (the live MLB versions are hardcoded to `baseball_mlb` at multiple layers, confirmed directly in Phase 1 — not safely reusable via a parameter, need real NBA-specific worker files, consistent with the naming convention in Section 1).
- The scoring engine's actual formula/model (Phase 3d).
- The full multiplier/pricing study (a first, direct NBA observation study — no live season yet to observe against; see Section 5).

---

## 3. Prop taxonomy (starting point — refine in Phase 3a with real data-source verification)

Per Domain Mapping Section 1, first-class NBA prop families from day one (no bolt-on treatment):
- **Single-stat**: points, rebounds, assists, three-pointers made, steals, blocks, turnovers.
- **Combo**: points+rebounds+assists (PRA), points+rebounds, points+assists, rebounds+assists.
- **Binary/rare-event**: double-double, triple-double.
- **Fantasy points**: platform-specific formulas — each platform's exact formula must be independently verified (Lessons doc item 14), not assumed identical.

NBA has **no pitcher-side ("opposing role") prop family** — every NBA prop is offense-side, which simplifies the taxonomy relative to MLB's hitter/pitcher split. This also means **no `stats_hitter`/`stats_pitcher` schema split for NBA** — a single `nba_stats` schema (game logs, splits, rolling metrics) covers all NBA player props, one real structural simplification worth locking now rather than rediscovering later.

Goblin/Demon/Standard-style tier variants: assumed to exist per-platform for NBA (a platform-level mechanic, not sport-specific) but **tier count and tier spacing must be verified per prop directly against each platform's live board once one exists** — not assumed identical to MLB's.

---

## 4. Layer ordering — confirms the person's 3-run model maps directly onto the blueprint's proven 4-layer order, with one clarification

The person's stated 3-run operating model (static differential / delta daily / master run) is the same proven dependency order the blueprint documents, just packaged into 3 manually-triggered runs instead of the blueprint's 4 abstractly-named layers:

| Person's run | Blueprint's layer(s) | What it does |
|---|---|---|
| **Static differential** | Layer 0 (implicit prerequisite, not separately numbered in the blueprint) | Calendar, teams, players, rosters, arenas, referees — rarely/sporadically changing |
| **Delta daily** | "Base" + "Delta" (Section 4k) + Baseline/Classification (Section 4b) | Backfilled base + daily incremental game logs → feeds the classification layer → baseline hit-probability % and confidence |
| **Master run**, 4 stages | Board → Daily Context → Market → Scoring (Section 3, load-bearing order) | Exactly the blueprint's 4-stage order, unchanged |

**One clarification worth locking explicitly, since the person's own framing implies it but doesn't state it in these terms**: the classification/baseline step (end of "delta daily") must fully complete and be queryable **before** "master run" stage 2 (Daily Context) or stage 4 (Scoring) can run against it — this is the same real ordering dependency the blueprint documents for Board→Daily Context (Section 3), extended one level earlier. Recommend: **static differential → delta daily (incl. baseline) → master run stages 1–4, always in that order**, and never parallelize delta-daily's baseline step against master-run's scoring step for the same slate/date.

**No orchestrator, confirmed as the explicit design**: each of the 3 runs, and each stage within master run, and each worker within a stage, is triggered manually via a Claude Coworker scheduled task — worker by worker, verified individually — with no auto-dispatch machinery layered on top, exactly matching MLB's current (post-retirement-of-the-earlier-orchestrator) operating model per blueprint Section 5.

---

## 4b. Real operating cadence — locked 2026-09-03, mirrors the existing MLB system exactly

The person confirmed the actual real-world trigger schedule for the 3 runs, matching MLB's system as-is (not a new NBA-specific invention):

- **Static differential (weekly run)**: once a week, early morning — **Mondays 2:00am Pacific**. Matches the already-built `alphadog-v2-nba-weekly-differential` worker's intended cadence (built 2026-09-02, not yet wired to any actual schedule until this confirmation).
- **Delta daily**: once a day, morning — **~11:00am** (person's stated time; matches Pacific per the weekly run's stated timezone, giving a large safety buffer well past the ~2:00am ET latest-possible-game-end + 10-15min data-finalization window confirmed via research and Gemini consultation on 2026-09-03). This run must, in order: (1) ingest yesterday's newly-completed games into `nba_stats.player_game_log`/`nba_team.team_game_log` (a real, not-yet-built "Daily Delta Ingestion" worker — the one-time historical backfill built 2026-09-03 only covers the completed 2025-26 season, it is not an ongoing daily job), (2) run a pre-flight completeness check (compare games scheduled for yesterday per `nba_calendar.games` against games showing Final in the fresh pull — halt and warn on a mismatch rather than silently proceeding on an incomplete night), (3) only then recompute the baseline (EWMA rates, minutes role, variance, trend — per `NBA_BASELINE_METHODOLOGY.md`).
- **Master run (Board → Daily Context → Market → Scoring Engine)**: once, sometimes twice a day — **2 hours before the first scheduled game of the day**, with an optional second run later "only if needed" (e.g. a late injury designation change or significant line movement after the first run). **Real design implication, not a fixed clock time**: since NBA game start times vary day to day, this trigger time must be computed dynamically from the real data already in `nba_calendar.games` (today's earliest `game_datetime_utc`) minus 2 hours — not a hardcoded time-of-day like the other two runs. The optional second run is exactly the cheap, fast re-run the two-stage baseline/enrichment separation (Section 0 of `NBA_BASELINE_METHODOLOGY.md`) was designed to make possible — it only needs to re-run the Scoring Engine against the already-cached baseline plus fresh enrichment/market data, not recompute anything expensive.

**No cron/orchestrator automation** — these times are the real, intended Claude Coworker-scheduled-task trigger times (per Section 4's existing "no orchestrator" confirmation), not in-code scheduling logic to be built into any NBA worker.

---


1. **ANSWERED (2026-08-31) — ParlayAPI historical NBA coverage**: the person states ParlayAPI should have real backdata from past NBA seasons, and will definitely have NBA boards + live market data once the season starts. Still needs a real, direct test (not yet performed — same tooling gap as Phase 1) before being trusted as more than a stated expectation, but this is no longer an open design fork — treat ParlayAPI as the locked source for NBA market/board data (Sleeper, Underdog, and historical odds) pending that verification.
2. **ANSWERED (2026-08-31) — fully separate, no shared tables anywhere**: confirmed and extended (see Section 1's correction) — this applies to every schema including the control-plane, not just `market`.
3. **ANSWERED (2026-08-31) — PrizePicks NBA board source**: same technique as MLB's board scraper (`alphadog-v2-prizepicks-github-board.js`, which reads a scraper-produced JSON file committed to the GitHub repo — see `prizepicks_mlb_current.json` at repo root), scoped to NBA. Needs a new, NBA-scoped scraper (or a scope parameter on the existing scraper's *upstream* piece, which sits outside this repo — TBD once that upstream scraper is located) producing an NBA-equivalent JSON file, consumed by a new `alphadog-v2-nba-prizepicks-github-board.js` inside `/nba/`.
4. **ANSWERED (2026-08-31) — referee/official data**: MLB's equivalent concept is called "umpire" in the existing schema/code (`ref.umpire_tendency`, `backtest.recomputed_umpire_tendency`) — use this as the concrete reference point when researching what a real NBA officiating-tendency table should look like (structure, source, what MLB actually tracks per-umpire) rather than searching for "referee" against MLB's own codebase.
3. **Which specific enrichment factors get built for v1, and in what order?** The person named categories (referee, arena, fatigue, injury, "and many more") but said explicitly these are "yet to be locked." Phase 3c is where this gets decided with real source verification per factor — not assumed here.
4. **A referee dictionary was named for the static-differential run** — MLB's own factor mapping (Domain Mapping Section 2) doesn't carry an MLB referee-tendency analogue into NBA at all; the person is proposing a genuinely new, NBA-specific factor category not covered by the transfer package. Needs its own real source-verification pass in Phase 3a/3c (does the NBA's own official API expose referee assignments/tendencies, per the blueprint's Section 4i discipline of checking the sport's own official API before any third-party source).
5. **Exact list of "static differential" entities** — the person named calendar/teams/players/rosters/arenas/referees; confirm this is the full v1 list or whether anything else (e.g. an alias table, a stadium/arena-context table analogous to MLB's park factors) belongs in the same run.
6. **With no live season for ~1 month, what's the real, useful scope of "backfill + design" work right now** — i.e., which specific static/historical data sources can genuinely be probed and locked today (Section 1's next concrete step), versus which board/market/live-context work has to wait until the season starts regardless of how much design work is done in advance. Recommend addressing this concretely as the very next step, before opening multiple new per-domain chats, so each new chat has a real, doable task rather than one blocked on live data.

---

## 6. Immediate next step recommended (not yet executed — for confirmation)

Given no live season exists yet, the person's own priority ("start probing and testing sources, and locking source for each piece of data" for backfill/static/historical/market-where-possible) points to starting concretely with **Phase 3a (static data)** and the historical portion of **Phase 3b (incremental/delta data)** — both fully backfillable today — while treating Phase 3c (board/daily-context/live-market) as design-and-source-identification only until the season provides real live board data to mine. This matches the Domain Mapping doc's own prioritized startup plan (Section 5, items 1–4) and the person's instruction to spin up one new chat per big data domain.
