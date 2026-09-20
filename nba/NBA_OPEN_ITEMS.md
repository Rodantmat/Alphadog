# NBA OPEN ITEMS — deferred, dropped, partial, bugs, caveats

**Purpose.** Everything that is NOT finished, NOT shipped, or NOT to be trusted at face value, plus
every bug and error found along the way. Nothing here is fixed by the documentation pass — it is
recorded so it can be fixed deliberately afterwards.

**Status vocabulary**
| Status | Meaning |
|---|---|
| `DEFERRED` | intentionally postponed, will be done |
| `DROPPED` | decided against, will NOT be done |
| `PARTIAL` | built but incomplete |
| `BLOCKED` | cannot proceed without something external |
| `CAVEAT` | works, but has a condition you must know |
| `BUG-FIXED` | a real defect found and fixed — kept because the pattern recurs |
| `BUG-OPEN` | a real defect found and NOT yet fixed |

Every entry carries the transcript it came from and the date it was added here.

---

## FROM T1 — `2026-09-03-03-22-04-nba-expansion-phase1-static.txt`
*added 2026-09-20*

### BLOCKED-PERMANENT · Cloudflare Workers cannot reach nba.com
Every domain in the family — `stats.nba.com`, `cdn.nba.com`, `core-api.nba.com`, `data.nba.net` —
fails identically from Cloudflare Workers. Proven with a read-only multi-endpoint probe, not assumed.
**This is why every NBA scrape runs on GitHub Actions instead.** Not fixable; it is the architecture.

### CAVEAT · plain `requests` is TLS-fingerprinted and tarpitted
Three consecutive timeouts (not rejections — silent hangs). A proxy did NOT help, which ruled out IP
blocking and pointed at TLS fingerprinting. **`curl_cffi` with browser impersonation is mandatory** for
every NBA scraper. Any new scraper written with plain `requests` or `urllib` will hang.

### CAVEAT · a new MCP tool cannot be used in the session that creates it
`github_trigger_workflow` was added to `alphadog-v2-admin-sql.js` and deployed, but the conversation's
tool list is fixed at session start, so it was unusable that session — and a reconnect did not help.
**Workaround in use: file-based workflow triggers** (`nba/TRIGGER_NBA_SCRAPE.txt`,
`nba/TRIGGER_NBA_PROBE.txt`), which need no new tool.

### BUG-FIXED · `abbreviation` empty for all 30 teams
The first successful scrape returned blank abbreviations because `TeamAbbreviation` is not in that
endpoint's actual response. Caught by verifying the committed file rather than the scraper's own meta
claim. **Pattern: always verify the artefact, never the success report.**

### BUG-FIXED · deploy path bug on the first NBA worker
First deploy of `alphadog-v2-nba-static-teams` failed on a path error in the patched
`generate_wrangler_configs.py`; fixed and redeployed clean.

### CAVEAT · balldontlie is a fallback, not the source
`balldontlie_api_key` is stored in `nba_config.external_credentials`, but the owner's stated preference
is that data come from nba.com itself, as MLB's does. Treat balldontlie as contingency only.

---

## FROM THE LIVE SESSION 2026-09-19/20 (not yet a transcript file)
*added 2026-09-20 — these are current and unfixed unless marked*

### BUG-OPEN · PrizePicks is NOT wired for NBA in the live pipeline
`main.py` at the repo root is the **MLB** producer: `league_id=2` is a literal in all four candidate
URLs and `OUTPUT_JSON` is fixed to `prizepicks_mlb_current.json`. It honours a
`PRIZEPICKS_PROJECTIONS_URLS` override, so it CAN be pointed at NBA — but it would then write the NBA
board into the MLB file and the next MLB run would overwrite it.
**Mitigation built 2026-09-20:** `nba/scrape_prizepicks_nba_board.py`, a separate producer with its own
URLs (`league_id=7`), its own output (`boards/prizepicks_nba_current.json`) and its own env namespace
(`PP_NBA_*`). **Live-tested: 192 projections, 104 demons / 52 goblins / 36 standard.**
Still open: `main.py` itself is untouched, and COMPASS fact 176 still describes the old plan.

### PARTIAL · `board_tiers` is a TWO-way taxonomy; the board is now FOUR-way
`nba_market.board_tiers` (2.2M legs) derives `kind` from the Odds API **price** (`price=100` → demon,
`price=-137` → goblin). Every row is **Over-only**, which was correct while demons/goblins were
more-only (confirmed: zero Under rows on alternates in 2024-25, and the official help centre said so
through 2025-08).
**PrizePicks enabled LESS in 2026-08** (MLB + WNBA first; owner screenshots confirm it live on WNBA).
Under the four-way rule a **demon-Less sits BELOW the anchor**, which the price-based label would call
a goblin. **The rule, already worked out in T13:** below the anchor, More = goblin / Less = demon;
above it, More = demon / Less = goblin — a function of (position vs anchor, side), never the emoji.
**`nba_market.board_tiers_ud` (Underdog) ALREADY implements this** — see T13. The PrizePicks version
does not. `nba/build_board_tiers_v2.py` was written 2026-09-20 to close it; **not yet verified**.

### CAVEAT · tier sign convention breaks under the four-way rule
v1 signs tiers by KIND (goblin negative, demon positive). That fails once a demon can sit below the
anchor. v2 signs by **position** (negative below, positive above) so the sign always means direction.

### DEFERRED · PrizePicks per-leg multipliers are not on any public surface
Ruled out exhaustively 2026-09-19: **zero hits** for `multiplier|payout|factor|coefficient` across
691,431 lines of the live board payload (a demon carries only `odds_type`, `adjusted_odds` as a
BOOLEAN, and `line_score`); ~20 guessed API paths all DataDome-403 even through the working proxy with
`curl_cffi` chrome124 and a US/California egress; `app.prizepicks.com` is itself DataDome-walled so its
bundles cannot be scanned the way the Underdog ladder was; and **eight independent commercial scrapers
expose the LABEL only** while the same vendors expose real multipliers for Underdog, Sleeper and Pick6.
The factor is priced **server-side at entry build** — which is exactly why the app shows nothing on one
leg and a multiplier on the second.
**The capture to do:** from a COMPUTER browser (free), log in, DevTools → Network → Fetch/XHR, add leg
1, CLEAR, add leg 2, then "Copy as cURL" — the method that solved the Underdog and Fliff APIs. iOS
cannot do it free (iOS 17+ blocks `javascript:` bookmarklets).
**Owner's correction to keep in view:** the factor is NOT one number per tier — it varies by rung,
side, prop, player form and team form, so slip-by-slip inference needs an enormous sample and is never
certain.

### DEFERRED · Sleeper ladder, Chalkboard
Sleeper has no alternate lines (one line per player+stat, priced via per-side multipliers).
Chalkboard is app-only with no web app and is in no aggregator we hold → phone-proxy capture only.

### DROPPED · data-freshness gate
At a single 1:15 PM PT cutoff every leg carries the same report generation, so a freshness term
penalises uniformly and discriminates nothing. The uncertainty it would proxy for is already priced by
N1 probability-weighted availability. Late tips do get more post-cutoff amendment, but those amendments
are unusable when slips are placed once at ~1:30.

### DROPPED · scenario precompute as a daily job
Its value was "enumerate every availability branch now, SELECT the realised one at a later window".
With ONE window there is nothing to select with, so enumeration is pure cost (~0.5–1M rows/day).
`nba_score.scenario_realised` and its calibration stay as a MEASUREMENT (the finding that the
most-likely branch is right only ~17% of the time with three uncertain players remains true) but it no
longer runs daily.

### BUG-FIXED · the 2:30 PM PT cutoff was drift, traced to its origin
The 2026-09-09 session recorded a list of OBSERVED injury-PDF snapshot timestamps
(12:30 / 1:00 / **2:30** / 3:30 / 4:00 / 6:45 / 7:45 PM) — **Eastern**, from the PDF filenames —
alongside the correct policy on the same line ("game-day 11am–1pm local"). **2:30 PM ET is 11:30 AM
PT.** It was promoted to "the 2:30 PM PT day-of report" and repeated as established in COMPASS facts
41, 68, 73, 74 and 96. `nba_asof.py` shows the true source: `PHASE2_CUTOFF_LOCAL = "17:45"  # 2:45 PM
PT (after the 5:30 PM ET day-of report)` — a league **bulletin**, not a filing deadline.
**Corrected: the real constraint is 11am–1pm LOCAL to each game's market, so Pacific clubs file last at
1:00 PM PT → cutoff 1:15 PM PT.** `nba_asof.py` already had `PHASE1_CUTOFF_LOCAL = "16:00"` = 1:00 PM PT.

### CAVEAT · the injury backfill is HOURLY, not 15-minute
48 snapshots per game-date (real archived PDFs, Eastern timestamps). The league publishes every 15
minutes. Any cutoff analysis finer than ±1 hour needs the 15-minute archive. The season also crosses
DST.

### BUG-FIXED · `float(x or 0)` returns NaN — NaN is truthy
In `build_availability_delta.py`, one player with NaN minutes poisoned `wsum` → `share` → `gain` →
every downstream probability, writing **6,748 NaN overrides** that would have gone straight into the
scorer. A NaN hit probability is worse than a missing one because it looks like data. Fixed with an
explicit `v != v` check plus a hard guard that drops any NaN before write and reports the count.

### BUG-FIXED · market_key → prop mapping would have dropped 44% of the board
`replace(market_key,'player_','')` yields `points_rebounds_assists`, which matches nothing in our
baseline (we call it `pra`). Six of the largest groups — pra, pts_reb, pts_ast, reb_ast, stocks,
threes_made — **23,286 legs, 44% of the board** — would have scored nothing, silently. Same magnitude
as the historical combos gap. Fixed with an explicit verified mapping table.

### BUG-FIXED · a caught exception left a poisoned transaction
`try/except` around a read of a not-yet-existing table swallowed the error but left psycopg in a failed
transaction, so every later query died with `InFailedSqlTransaction` and the traceback pointed at an
innocent query 60 lines away. **`conn.rollback()` in the except is mandatory.**

### BUG-FIXED · loader reads over HTTP, not from local disk
`load_baseline_ladder.py` fetches the ladder artefact from `raw.githubusercontent` — so a ladder built
in the runner but **not committed** is invisible to it and the load 404s. Both P2 and P3 needed an
explicit commit step between merge and load.

### BUG-FIXED · the per-pair build needs a merge step
The builder writes `nba_baseline_ladder_<asof>_<pair>.json` per invocation; the loader reads
`nba_baseline_ladder_<asof>.json`. Without a merge the loader finds nothing. The loader also has its
own guard — *"ABORT: artifact has no combo props"* — so combos must exist BEFORE the merge.

### BUG-FIXED · five wrong env var names in the new pipelines
`ASOF`→`BT_ASOF`; `BT_MODE=combos`→ separate scripts `build_combos_ladder.py`/`build_periods_ladder.py`;
`BT_WINDOW`→`BT_CUTOFF=phase1`; `IR_MODE`→`INJURY_MODE`; `SPORT`→`SLEEPER_SPORTS`.
Also: `SLEEPER_OUT_DIR` defaults to `.` (repo ROOT) where the file is never committed and the archiver
never sees it; `ARCHIVE_LABEL` defaults to `routine`, so the decision snapshot must set `window`
explicitly or the grader and every backtest lose the decision moment.

### CAVEAT · `final_hp` stays denormalised — deliberate, tested
The columns it shares with `baseline_history` look like ~25 GB of duplication. Two claims against
slimming were tested and ONE WAS WRONG: "the join duplicates rows" is **false** (verified 140,130 in →
140,130 out, exactly 1:1; a planner ESTIMATE was misread as an actual), and "32.9 s per day" was
**cold cache** (`read=50707`; warm it is `shared hit=28514 read=1`). **The real reason to keep it** is
that slip-strategy work means days of backtesting across many dates at once — the cold-cache case —
where joining forces repeated `baseline_history` reads on a **2 GB RAM** server. Revisit only if the
server is upgraded AND the workload stops being backtest-heavy.

### CAVEAT · `VACUUM FULL` cannot run on `final_hp`
It needs free disk equal to the table size (13 GB) and the disk pressure that makes it necessary is
what prevents it. Plain `VACUUM` is the safe alternative; it reclaimed ~4 GB and cleared dead tuples to
zero on 2026-09-19.

### CAVEAT · a 0-scan index may still be load-bearing
`board_outcomes_leg_uidx` shows **0 scans but is UNIQUE** — it enforces no-duplicate-legs. Scan count
is the wrong test for a unique index. Only `board_outcomes_nm_idx` (343 MB, 0 scans, superseded by the
temp-table approach) was genuinely droppable, and was dropped.

### PARTIAL · P3's reallocation path verified on ONE date only
The whole chain was proven on **2025-11-29** (Klay Thompson flips to OUT after P2 builds → 3,446
teammate overrides at ~1.3 pp each → his own 828 legs zeroed → board scored → his Overs 0.0122 /
Unders 0.9834). A season scan found only **4 dates** where a ladder-carrying player flipped to OUT
after P2, so the branch is genuinely rare. On 2026-01-15 it correctly wrote nothing: all 20
"newly OUT" players had no ladder rows because they were already known out overnight.

### PARTIAL · ladder depth is too shallow for the books, too deep for low-count props
Measured on a real slate (2026-01-15, 60k+ board legs joined to our anchors): books ladder out to
roughly **85–90% of the anchor**, consistently. Fixed `±10` is wrong in both directions — points needs
13 and gets 10 (1,294 rungs interpolated); steals/blocks/stocks/turnovers need 1–2 and get 10 (zero
interpolated). Per-prop `LADDER_DEPTH` table added to `classification_ladder_v12.py`;
**the scoped expansion has not completed.**

### CAVEAT · `fantasy_score` has never appeared in the NBA board archive
A scan of both seasons found `player_fantasy_points` on exactly one date (2026-09-12), and that same
snapshot carries `player_first_inning_runs` — **it is MLB data**. Fantasy score and the period props
reach us only through the DFS scrapers, which is what the live pipeline reads. Mapped in
`score_board_legs.py` so they score correctly the moment they arrive.

### DEFERRED (owner-sequenced) · leg correlation, live plumbing
Leg correlation is slip-building-stage work and will be treated there, not in this pipeline.
Live plumbing is LAST — nothing is live until the NBA season opens in October.
</content>
</parameter>
<parameter name="message">docs: NBA open items - deferred, dropped, partial, bugs, caveats