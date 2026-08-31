# NBA Project — Architecture Blueprint (transferred from AlphaDog/MLB)

*This document tells you how the MLB system is actually built, end to end, so the NBA system can reuse the same architecture instead of reinventing it. Read this before writing any code. Companion documents: `NBA_LESSONS_LEARNED_FROM_MLB.md` (mistakes to avoid, statistical methodology) and `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` (MLB→NBA concept mapping, prioritized first steps).*

---

## 1. Infrastructure stack (reuse identically)

- **Compute**: Cloudflare Workers, one JS file per logical worker, deployed via `wrangler`.
- **Database**: Postgres via Cloudflare Hyperdrive (`postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false })`). All three connection options matter — `prepare: false` in particular avoids a specific, previously-encountered failure mode (see lessons doc). `max: 3-5` is the proven small-pool size for Workers' short-lived invocation model.
- **Legacy/reference layer**: D1 databases exist as **read-only reference only** — never write new data to D1. If porting a table, migrate it to Postgres first.
- **Deploy pipeline**: GitHub repo → `alphadog-v2-github-auto-deploy.yml` (or equivalent) → auto-deploys on push. `generate_wrangler_configs.py` (or equivalent) regenerates every `wrangler.*.jsonc` from a Python template **before every deploy** — never hand-edit a wrangler config file expecting it to survive, it will be silently overwritten.
- **MCP bridge**: A dedicated admin worker (`alphadog-v2-admin-sql.js` equivalent) exposes `run_sql`/`run_sql_postgres`, `github_get_file`/`github_put_file`/`github_patch_file`/`github_grep_file`/`github_list_dir`, and a Gemini proxy endpoint. Build this first — it's the tool surface every subsequent session (including yours) will actually use.
- **Real-money/board data provider**: ParlayAPI (`parlay-api.com`) — the same paid service already integrated for MLB, covers NBA too (`basketball_nba` sport key, `player_points`/`player_rebounds`/`player_assists`/etc. market keys, and DFS pick'em bookmaker keys including `prizepicks`, `underdog`, `sleeper`, `betr`, `pick6`). Key stored in `config.external_credentials` (`credential_key='parlay_api_key'`), env-var fallback `PARLAY_API_KEY`. Reuse the same key/account — no need to re-onboard.

## 2. Database schema convention (per-domain Postgres schemas, not one flat DB)

MLB uses named Postgres schemas mapped to logical domains, each with a stable naming convention. Recommended direct port for NBA (same names, new tables inside them):

| Schema | Purpose |
|---|---|
| `ref` | Static reference: teams, players, aliases, stadiums/arenas, prop taxonomy |
| `calendar` | Game calendar/schedule, live game status (`is_live`, `is_final`, `game_time_utc`) |
| `stats_hitter` / `stats_pitcher` (→ rename for NBA, see domain mapping doc) | Player game logs, splits, rolling metrics |
| `team` | Team-level game logs, starter/rotation history |
| `daily` | Same-day context: lineups, confirmed starters/rotations, availability, matchup context |
| `context` | Historical snapshots of daily-context factors (short retention by design in MLB — see lessons doc for why this bit them) |
| `market` | Live board/odds state per platform (PrizePicks/Sleeper/Underdog), current-only tables |
| `archive` | Permanent historical archives of anything `market`/`context` only holds current-state for |
| `score` | Scoring engine output: prepared board, final board, outcome grading, pricing/multiplier study tables |
| `backtest` | Point-in-time reconstruction tables and ad-hoc research tables (walk-forward datasets, real-multiplier studies) |
| `control` | Job queue, worker registry, scheduled jobs, session logs |
| `config` | Worker definitions, external credentials, system settings |

**Naming discipline that mattered in MLB, keep it identical**: use ONE canonical ID format from day one (MLB had a real, multi-table bug from mixing bare numeric team IDs with a prefixed format like `mlb_133` — grep for format inconsistency proactively, don't wait for it to surface as a downstream symptom). For NBA, decide the ID convention (e.g., `nba_<team_id>`) before writing the first table and apply it everywhere.

## 3. Pipeline architecture — the four-layer, ordered full-run pattern

MLB's real, current architecture (confirmed, not the abandoned earlier "orchestrator + auto-scheduled cron" design — see Section 5):

1. **Board layer**: pull each platform's raw board (PrizePicks own scraper + ParlayAPI for Sleeper/Underdog), normalize into a common shape, write to `market.*_board_current`.
2. **Daily Context layer**: same-day contextual factors — lineups/rotations, player availability, matchup context, injury status. Depends on Board having run first (MLB had a real, documented ordering bug from running these out of order: *"Board/Score Prep must run before Daily Context. Daily context sidecars filter by prepared-board pickable/current rows; running them before board refresh produced false VALID_ZERO/NOT_APPLICABLE... despite calendar/source availability."*).
3. **Market layer**: mine sportsbook/DFS pricing data (via ParlayAPI) for cross-referencing and multiplier-study purposes, write to `market.context_probe_*` and archive to `archive.market_prop_context_history`.
4. **Scoring layer**: the actual prediction/probability engine — baseline model → enrichment factors (each a "phase" file) → matrix builder → scoring engine → hit-probability board → final board (curated, tiered PRIMARY/REVIEW output).

**This four-stage order is load-bearing, not arbitrary** — replicate the same ordering for NBA and don't parallelize stages 1→2 without re-verifying the same dependency doesn't exist.

## 4. Enrichment factor architecture (the "phase" files)

MLB organizes enrichment into named phases, each a separate worker file even when many are near-identical boilerplate around one factor:
- **Phase 2A**: game/environment-level factors (run environment, park impact, weather impact, roof impact — NBA equivalent: pace, home/road, back-to-back, altitude if relevant, arena factors)
- **Phase 2B**: player-role/matchup factors (batting order/lineup role, bullpen matchup, handedness matchup, lineup protection, opposing starter matchup, recent form — NBA equivalent: role/minutes projection, opponent defensive matchup, positional matchup, rest/schedule spot, recent form)
- **Phase 3A/3B/3C**: per-prop-family context builders (one per prop or prop-cluster)

**Critical lesson before building any of these**: MLB's own factor layer had a live, undetected bug — one factor (`stolen_base_family`) had **zero variance across every row** (a real defect: wired into the scoring engine, contributing literally nothing) and was only caught because it accidentally became useful as a placebo/noise-floor calibrator during later statistical work. Before trusting ANY new NBA enrichment factor, verify it actually has variance (`stddev(factor_value) > 0`) as a first sanity check — this is cheap and MLB never did it proactively.

Each enrichment factor should have `relevant_prop_keys` explicitly declared (which props it applies to) rather than applying blindly — MLB's `defensive_quality_oaa` factor is correctly scoped this way (`["hits","singles","doubles","hits_allowed"]`), and this scoping should be explicit and reviewable, not implicit in code logic scattered across files.

### 4a. Enrichment/calibration methodology — a real, dense case study worth internalizing before writing the scoring engine

MLB ran a real audit that found its scoring engine was well-calibrated at the baseline level but badly overconfident once enrichment factors moved the number away from baseline. The diagnostic technique that found this is genuinely powerful and cheap, worth running on NBA's scoring engine from day one: **split graded legs by how far the enrichment layer moved the final probability away from the baseline model's own number, then compare predicted-vs-actual separately for each bucket.** MLB found baseline-dominated legs nearly perfectly calibrated (~1 point gap) while heavy-enrichment legs showed a 5+ point overconfidence gap — this single check immediately localizes whether a calibration problem lives in the baseline model or the enrichment layer, without debugging every factor individually first.

**On the calibration technique itself**: reject additive/histogram-binning calibration (a lookup table adding flat corrections per probability bin) — it produces real, serious problems: discontinuities (a tiny input change causing a huge output jump at a bin boundary), non-monotonicity (a genuinely higher raw probability mapping to a lower calibrated one), and boundary violations (results pushed outside 0-100%). Use a real, continuous, monotonic-by-construction transformation instead (Platt scaling — fit `A·logit(raw_p) + B` in logit space, or isotonic/beta calibration). **Critically, be willing to reject a fit even when it's statistically valid** if the resulting real-world shift is implausibly large — MLB correctly rejected two Platt fits that passed monotonicity but implied unreasonably large corrections, on the reasoning that a huge "fix" is itself a sign something about the fit or the underlying factor is wrong, not proof the correction is needed.

**Five concrete enrichment-factor bug patterns, all real, all worth actively checking for in NBA's own factors:**
1. **A cumulative/season-total stat used as if it were a per-game rate**, with no division by games played anywhere in the code — causing one factor to swamp every other factor combined. Tell: check whether a factor's source field name says "total" while its consuming code treats it as "per game."
2. **One factor's lookup table left uncapped while every sibling factor in the same system has explicit caps** — the inconsistency itself is the red flag; audit cap presence across the *whole* factor registry at once, not factor-by-factor.
3. **Macro-environment multicollinearity** — several factors all correlating with the same underlying signal (e.g., a market-derived game total already prices in park/weather/pace effects that separate factors also try to capture), so naively multiplying or summing them double- and triple-counts the same real information. **Fix: RSS (root-sum-squares) aggregation for a genuinely correlated factor cluster** — this has the desirable property of zero dampening when only one factor in the cluster fires (matches its individual magnitude exactly) with increasing dampening as more correlated factors stack together, rather than either naively multiplying (over-counting) or arbitrarily zeroing out extra factors (under-using real information). Keep factors that measure genuinely independent information out of this treatment — only correlated clusters need it.
4. **A factor showing the identical contribution value across wildly different real cases** (e.g., an elite player and an average player getting the exact same adjustment) — a sign the factor is simply hitting its own cap for nearly everyone, not actually discriminating, even though the code "runs" without error.
5. **Amplifying, rather than shrinking, a thin-sample signal.** Standard, correct statistical practice always shrinks a thin-sample estimate toward a prior; MLB found a real case doing the opposite (multiplying a signal up for players with limited games played) justified by a "validation" that only proved the signal correlated with outcomes — which is scale-invariant and would show the same correlation whether the true correction should shrink or amplify. **Correlation with outcomes proves a signal carries information; it does not by itself prove which direction or magnitude of adjustment is correct** — that needs its own, separate validation.

**Two operational disciplines worth adopting alongside the above:**
- **Before re-diagnosing an apparently-still-present issue, verify you're looking at fresh data generated *after* the relevant fix deployed, not stale data from before it.** MLB nearly wasted real effort re-finding already-fixed bugs because the scoring pipeline hadn't been re-run since a fix shipped.
- **Confirming a fix looks structurally correct on the input side (bad values gone, caps behaving, no more amplification) is not the same as confirming the output side actually improved** — that requires waiting for real games to be played and graded. Don't conflate the two; state explicitly which one you've verified.

**A calibration-specific instance of the "file name/liveness" trap (Section 6 above)**: a worker's own health-check response can explicitly self-report as dead/deprecated while its formulas still represent the real design lineage the currently-live replacement is based on — informative to read, but never assume the live version is identical without independently checking the actually-live code too. Formulas can and do diverge between a documented "legacy" version and what's really running.

## 5. Trigger/scheduling reality — build this correctly from day one

**MLB's real, current operating model** (after abandoning an earlier, more automated design): manual or Cowork-session-driven, layer-by-layer execution, NOT continuous automated cron dispatch. The full orchestrator/auto-scheduler machinery that was built earlier was later **retired** in favor of running each layer by hand or via a scheduled Cowork/Claude session (currently 4x/day: 1am, 9am, 1pm, 5pm Pacific for MLB). **Do not build an elaborate auto-scheduling orchestrator for NBA before you have a working manual pipeline** — MLB's own history shows the automated version accumulated real, hard-to-detect problems (see Section 6) before being scaled back to manual/scheduled-session control.

**A real, confirmed architecture gap in MLB, worth designing around from the start for NBA**: the system could not originally distinguish "genuinely zero games today" (e.g., All-Star break) from "something is broken and returned zero rows." Build an explicit, first-class "no games scheduled" state into the NBA pipeline from day one — don't let a natural zero-game day (e.g., no games scheduled) silently look identical to a real failure.

## 6. Hard lessons about system self-knowledge (read before assuming anything is "live")

MLB's own history contains a genuinely important, repeated pattern: **file names, job_key names, and "is this worker active" assumptions are frequently wrong**, and this cost real debugging time more than once. Specific, transferable lessons:

- **A single physical worker file can serve many unrelated logical roles**, selected at runtime by a `mode` parameter, not by which file it is. MLB's most extreme case: one 700KB+ file serves ~24 different logical functions across multiple job_key aliases. **Never assume "one file = one job."** When building the NBA system, if you're tempted to reuse an existing file for a new purpose via a mode switch, that's consistent with the established pattern — but document the mode dispatch table explicitly in one place, don't let it become implicit.
- **A worker's own literal file name can be a complete dead stub** while all its real work happens under other job_key/mode aliases that have nothing to do with the file's name. Don't trust a file name as a description of current behavior.
- **"Wired but not implemented" is a known, recurring failure shape**: a dispatch guard function and call site can exist and route to a handler function that was never actually written, causing a crash only when that specific path is finally exercised. When wiring a new NBA worker into any dispatch table, verify the handler function actually exists, don't just verify the routing compiles.
- **A large batch of near-identical placeholder/stub files can look real from the outside** (plausible file sizes, real-looking names) while being 100% unimplemented dummies that were scaffolded early and abandoned when the design changed (MLB has 19 such per-prop "score" workers, all returning a hardcoded `DUMMY_READY`/`DUMMY_ONLY_NOT_REAL_DATA` response, never once invoked). If NBA's design also considers "one worker per prop," learn from MLB's abandonment of that idea in favor of a unified scoring engine — build the unified version first.
- **Before assuming any schedule/cron is live or dormant, check the actual job-queue execution history directly** (`control.control_job_queue` or equivalent), not the `enabled` flag alone and not a note/comment in the config row. MLB found a real case of a cron flag and its own explanatory note directly contradicting each other, and separately found "long dormant" job types (the 11 aliases in Section 7.9 of the system map) that still had live, wired UI buttons despite months of zero real invocations.

## 7. Deploy and infra gotchas to build around from day one

- Never hand-edit a generated `wrangler.*.jsonc` — if the deploy pipeline uses a generator script, add any new binding/secret to the generator's own source template, not the output file.
- A specific, real generator gotcha in MLB: the wrangler-config generator had a **hardcoded whitelist tuple** of which workers get certain bindings (e.g., Hyperdrive) — a new worker not in that tuple silently deploys without the binding it needs, producing a confusing downstream error with no obvious connection to the actual cause. If NBA's deploy pipeline has an equivalent generator, check for and avoid the same whitelist-omission trap.
- **Bulk inserts over individual-row inserts, always**, for anything with more than a handful of rows per invocation (`postgres.js`'s `sql(arrayOfObjects, ...columnNames)` helper, chunked ~150-200 rows per statement). MLB initially suspected bulk inserts of being unsafe after a scary "Network connection lost" error, wasted real time reverting to slow individual inserts, and later found the actual cause was a connection config issue (`prepare: false` was the fix), not bulk inserts themselves.
- **Chunking/multi-tick continuation for large jobs**: Cloudflare Workers have real execution-time constraints. The proven MLB pattern: process a bounded slice per invocation, track continuation state, and only mark a source "fully synced" on the FINAL tick once the complete fresh dataset has been seen — never per-tick, or intermediate ticks will incorrectly treat unprocessed rows as stale/inactive.
- **Freshness gates/watermarks** for any external source with no cheap "what changed since X" signal: skip an expensive full re-mine if a certified/promoted run completed within a bounded freshness window (MLB used 20 hours for daily-ish sources, 3 hours for market/pricing sources it wanted fresher). Always allow an explicit `force_refresh` override.
- **Differential write pattern** (the actual core design philosophy worth replicating exactly): load current state from Postgres first, compare each incoming row field-by-field, and only INSERT/UPDATE rows that genuinely differ; rows that are identical get a cheap `active=1, updated_at=now()` touch only. Scope this differential/dedup logic **by source**, not just by natural key — MLB had a real bug where scoping only by natural key caused one source's fresher data to be silently blocked because a different source had already "satisfied" the same key.

## 8. Verification/testing discipline to build in from the start

MLB's single most reliable verification pattern, worth adopting immediately: **corrupt-and-fix testing** — deliberately change or delete a real row directly in the database (flip a value, simulate a trade/roster change, delete a row) and confirm the pipeline correctly detects and repairs it on the next run, rather than only ever testing the happy path.

Before declaring any bug fixed, verify against real data — MLB's own explicit, repeated lesson (from direct user feedback) was that presenting a plausible-sounding root cause as a confirmed fix, without checking, led to the same failure recurring immediately after being "fixed" multiple times in the same session.

## 9. Pipeline scrutiny discipline — a whole methodology, built from a real multi-bug night, worth adopting wholesale

MLB built a dedicated scrutiny guide after a single night of independent verification turned up multiple serious, silent bugs that every automated check had missed. The core philosophy, worth internalizing before NBA's pipeline is even fully built: **a pipeline's own "PASS"/"COMPLETE" self-report is the starting point for scrutiny, never the conclusion.** Every real bug MLB found was caught by independently re-deriving a claim against live data — SQL queries against real tables, real deployed code read directly — never by trusting a second read of the same status field the run already reported.

**Three general techniques that found real bugs no automated check would have:**
1. **Systematic whole-universe comparison** — diff the live config against the real formula/logic for *every* entry in a universe at once (every prop, every source, every combo), not just the one currently suspected.
2. **Leg-by-leg manual tracing** — pick real high-confidence outputs, pull raw source data by hand, compute the expected value independently, and explain any gap through documented mechanisms (shrinkage, calibration, etc.) rather than accepting "looks close enough."
3. **Tracing a real user-reported symptom back to raw source data** — when someone reports a concrete discrepancy, trust the report and trace it to the actual raw payload rather than defending the system's own output first.

**Six specific, named failure modes, each with a real precedent and a fix pattern — build checks for all six into NBA's pipeline from the start:**

1. **Reconciliation trusting a still-actively-writing batch.** A background writer may still be genuinely writing after the calling request has timed out; reading a row count once and treating it as final can catch a batch mid-write. Fix: require the row count to be stable across two reads separated by a real wait (several seconds) before trusting it as final.
2. **Reconciliation trusting a permanently-dead writer** — indistinguishable from #1 by stability alone (both show a stable count), but the actual data composition tells them apart. A died-mid-write batch characteristically recovers as 100% one category and 0% of whatever would have been written later in the write order. Fix: before trusting a stable count, independently check what real upstream data supports for each expected category — if a category with clear real upstream supply is completely absent from the recovered set, refuse to reconcile and force a fresh rebuild.
3. **A completion check satisfied by stale evidence from a previous run, not fresh evidence from this run.** A staleness-window or reference-count check can pass purely from leftover evidence a *prior*, unrelated successful run produced. Fix: find the check that can only be satisfied by this specific run's own fresh output (e.g., `MAX(updated_at)` per entity falling *inside this run's own execution window*, not just "recent enough in general").
4. **A "deactivated" correction/config still silently applying live**, because the deactivation label doesn't actually defeat the exact filter condition the live code uses (e.g., a substring-match filter that a mere prefix doesn't actually break). Fix: read the exact filter condition in the live code, and confirm the deactivation genuinely fails that specific condition — don't just check that a human-readable "deactivated" label exists somewhere.
5. **Raw source-API field ambiguity silently corrupting a value**, when a heuristic is built on a *different* field that merely correlates with the ambiguity rather than genuinely disambiguating it. Fix: look for the source's own genuine disambiguating field (often a human-readable label string) instead of a heuristic built on a value that isn't actually unique to one case.
6. **Silent config/formula drift across a whole universe** (props, sources, combos) with no error thrown — the output is just silently wrong-but-plausible, invisible to spot-checking whichever entry currently seems suspicious. Fix: periodically diff the live config against the actual formula/logic for the *entire* universe in one pass, not just the suspected entry.

**Board/output composition checks, not just row counts**: verify that BOTH expected output categories (e.g., a PRIMARY/high-confidence tier and a REVIEW/lower-confidence tier) are present in plausible proportions — a 100%/0% split is a red flag even when the total row count exactly matches expectations. A corrupted batch can produce a row count that perfectly matches the log while being wrong in composition.

**General verification discipline, applies everywhere**: never accept a claimed table/column/fix location without checking it exists exactly where claimed (a claim can be true about a different table than your first assumption — verify the actual target, don't dismiss from checking the wrong place first); wait for real propagation delays (connection-pool-fronted reads can show stale results for seconds to tens of seconds after a write) before re-checking; confirm an actual deploy succeeded (check the real workflow run status) before testing against a fix — a correct-looking diff that never actually deployed produces a false "still broken" result unrelated to the fix's real correctness; and explicitly distinguish a genuine bug from a legitimate real-world anomaly (cross-source duplicate offers, doubleheaders, genuine no-shows/scratches can all look like bugs at a glance and are not) — chasing an anomaly to a verified, correct explanation is as much a part of rigorous scrutiny as finding an actual bug.
