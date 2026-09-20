# NBA GLOSSARY — every term, and exactly where to find it

**Purpose.** When a term comes up and you need the source, this tells you which transcript, which
context, and which document section. Any material term appearing more than once belongs here.

**How to use it.** Find the term, note the transcript ID, then:
`grep -o "<term>[^\"]\{0,300\}" /mnt/transcripts/<file>.txt`

**Transcript IDs**
| ID | File | Dates covered |
|---|---|---|
| T1 | `2026-09-03-03-22-04-nba-expansion-phase1-static` | 08-31 → 09-03 |
| T2 | `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete` | 09-03 |
| T3 | `2026-09-03-22-24-13-nba-expansion-phase3a-final-complete` | 09-03 |
| T4 | `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete` | 09-03 |
| T5 | `2026-09-09-01-49-59-nba-expansion-phase3c-starter-status-complete` | 09-03 cont'd |
| T6 | `2026-09-09-02-15-50-nba-expansion-phase3d-delta-complete` | 09-09 |
| T7 | `2026-09-09-03-51-16-nba-classification-baseline-design-research` | 09-09 |
| T8 | `2026-09-09-20-48-33-nba-classification-baseline-backtest-calibration` | 09-09 |
| T9 | `2026-09-09-22-10-00-nba-baseline-production-pipeline` | 09-09 |
| T10 | `2026-09-10-01-31-13-nba-enrichment-backfill-pipeline-2026-09-09` | 09-09 |
| T11 | `2026-09-10-04-53-47-nba-enrichment-backfill-dfs-boards-2026-09-10` | 09-10 |
| T12 | `2026-09-11-21-01-23-nba-board-scrapers-fliff-docs-2026-09-10` | 09-10 |
| T13 | `2026-09-13-01-03-48-nba-boards-grader-market-2026-09-10` | 09-10 |
| T14 | `2026-09-13-20-53-23-nba-boards-grader-market-baseline-history-2026-09-11-12` | 09-11/12 |
| T15 | `2026-09-18-17-12-53-nba-enrichment-factors-a2-n1-reliability-audit-2026-09-12` | 09-12 |
| T16 | `2026-09-19-18-20-09-nba-enrichment-blowout-matchup-2026-09-13` | 09-13 |
| LIVE | the 2026-09-19/20 session (not yet a transcript file) | 09-18 → 09-20 |

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Terms from T1 (10 passes), T2 (1 pass), the journal, and the live session. |

---

## A

**A2 — teammate redistribution** · T15, T16 · The enrichment factor that redistributes an absent
player's production. **Five panels failed, then fully RETRACTED** — the certified anchor wins every
slice, and worst where the mechanism predicted it should win. COMPASS fact 91.

**A3 — return ramp** · T10, T16 · Minutes ramp after a return. Assigned to BASELINE by the parity doc,
so never an enrichment candidate. Gated at leg level: zero gain.

**A5 — lineup change** · T15 · **REJECTED/CLOSED.** A derived as-of proxy is redundant — the
allocator's recent-5 minutes already encode starting. *"No projected lineups needed → no leak to
mitigate."* **This is why P3 has no lineup scrape.**

**admin-sql** → see *bridge*.

**anchor** · T13, LIVE · The standard line a ladder is measured from. Two cases: **explicit** (a
standard line is on the board) and **switch_point** (the *invisible anchor* — see below).

**as-of** · T10, T14, LIVE · Every value computed from only what was knowable at that day's cutoff.
The governing rule of the whole system. `nba/nba_asof.py` holds the cutoffs.

**availability delta** · LIVE · `nba/build_availability_delta.py` — what changed between P2's overnight
report and P3's 1:15 PM view. Only material availability moves matter.

## B

**B4 — opponent availability / rim protection** · T15, T16 · Closed in three formulations, 0 of 5 props.

**baseline** · T4, T7, T8, T9 · *"The heart of the system"* (owner, T1). The historical-only projection
producing hit probability and confidence. **Strictly historical — enrichment is separate** (the
architecture correction in T4).

**baseline_history** · T14 · `nba_score.baseline_history`, 19.34M rows. *"Certified never meant
stored"* — the harness discarded per-leg probabilities; this table is what the engine READS.

**Betr** · T13 · DFS app. GraphQL, owner's Keycloak token, tiers REGULAR → EDGE_4.

**blowout** · T16 · Non-negotiable factor. Upgraded from an r=0.46 proxy to the **real market spread**.
A 13+ favourite blows open 39.7% vs 0.4%. Winning blowouts cost starters MORE minutes than losing ones.

**board_snapshots** · T11, T13 · `nba_market.board_snapshots` — every board leg, all apps, all
snapshots. **Has a `multiplier` column.**

**board_tiers / board_tiers_ud** · T13 · Tier classification. **The `_ud` version already implements
the four-way rule; the PrizePicks version does not.**

**bridge** · T1 · `alphadog-v2-admin-sql.js`, the MCP worker exposing every tool. New workers need a
binding + enum + dispatch branch. **A new tool is unusable in the session that adds it.**

**BT_ vars** · T8, T9, LIVE · The baseline builder's environment: `BT_ASOF`, `BT_PROPS`, `BT_CUTOFF`
(baseline|phase1|phase2), `BT_REPLAY`, `BT_INJURY`, `BT_LADDER_STEPS`, `BT_SAVE_COMPONENTS`,
`BT_TRAIN`/`BT_TEST`.

## C

**certification center** · T1 · **The UI — it already exists (MLB's) and will be integrated.** An
aggregator of legs and a slip builder. *"the main UI will be the same."* **Nothing to build.**

**combos** · T9, T14 · Multi-stat props (pra, pts_reb, pts_ast, reb_ast, stocks) via joint simulation.
**Need `BT_SAVE_COMPONENTS` singles pickled FIRST.** A missing combos build = 44% of the board.

**confidence** · T15, LIVE · **A data thermometer, not a probability.** Starts at 99, deducts for named
deficiencies. Measures EPISTEMIC uncertainty only. Mean 0.92–0.95.

**curl_cffi** · T1 · Browser TLS impersonation. **Mandatory** for stats.nba.com — plain `requests` is
fingerprinted and tarpitted, and a proxy does NOT help.

**Claude Coworker** · T1 · **The scheduler.** Each of the three runs is triggered by a Coworker
scheduled task, worker by worker. *"no runner, orchestrator or anything like, it only breaks the run."*
**Coworker is what replaced the orchestrator.**

**Cloudflare-to-Cloudflare** · T1 · The root cause of the nba.com block. stats.nba.com is itself
Cloudflare-fronted, and Worker→Cloudflare-site traffic is flagged at the WAF/edge. **The request never
reaches the app layer** (error 520). No header tuning fixes it.

**`FALLBACK_AFTER_FETCH_ERROR`** · T1 · *(full value: **`STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR`**)*
The `source_key` written when the live fetch fails and the certified static list is used.
**Check it before trusting a load.** Its counterpart is `NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`.

**`BASE_HITTER_GAME_LOGS_WORKER`** · T1 · The MLB precedent NBA workers copy for bridge dispatch —
**a direct call that bypasses the queue entirely**, matching the owner's no-orchestrator rule.

**"mlb calls referees Umpire"** · T1 · The owner's own search key for finding the referee analogue.
**He supplied it**; it is why `ref.umpire_tendency` became the model rather than the factor being
treated as new territory.

**`nba_api` (swar/nba_api)** · T1 · The Python package whose docs supplied **the canonical header set
and the static TEAM_ID list**. **Issue #155** tracks stats.nba.com's changing header requirements —
**look there first if it breaks again.**

**`startswith("alphadog-v2-nba-")`** · T1 · The guard on every NBA branch in the two shared deploy
scripts. **Provably zero-impact on MLB.** Any future edit must keep it.

## D

**DARKO** · T2, T3 · DPM ratings, SvelteKit hydration extraction, 530/530.

**DataDome** · LIVE · The wall on `app.prizepicks.com` and its payout endpoints. **Not defeated** —
proxy + chrome124 still 403.

**data_quality** · T1 · `DEFAULT 'derived'` on reference tables from the first DDL. Sourced vs derived
distinguished from day one.

**delta** · T6, LIVE · The day-by-day incremental store. **Its one dangerous failure is a SILENT hole** —
row counts still rise. Audited against the schedule by `nba/check_delta_gaps.py`.

**demon** · T13, LIVE · A harder-than-standard rung. **Above the anchor with More; BELOW it with Less.**
Hit 32.9/21.3/14.8% at T+1/+2/+3, needing 1.48/2.30/3.31× against a ~1.75–1.9× ceiling →
**only demon T1 is ever worth solving.**

## E–F

**edge** · LIVE · Distance above break-even, its own column. Answers *"is this an opportunity"* —
distinct from score, which answers *"how good is this leg"*.

**enrichment** · T10, T15, T16 · The factor layer on top of the baseline. **Ten candidates tested,
none survived at leg level.**

**factor_gate_results** · T16 · `nba_score.factor_gate_results` — every verdict, in the database.
*"A verdict that only exists in stdout is not a verdict."*

**file trigger** · T1 · `nba/TRIGGER_NBA_SCRAPE.txt`, `nba/TRIGGER_NBA_PROBE.txt`. Exists because
**`workflow_dispatch` cannot be fired by a push, but `on: push: paths:` can**, and the owner refused
manual triggering.

**Fliff** · T12 · Reverse-engineered from web bundles.

**four-way taxonomy** · T13, LIVE · **Below the anchor: More = goblin, Less = demon. Above it:
More = demon, Less = goblin.** A function of (position vs anchor, side), **never the emoji**.
Live since 2026-08 on MLB/WNBA.

## G–I

**goblin** · T13, LIVE · An easier-than-standard rung. **Below the anchor with More; ABOVE it with
Less.** Hit 74.1/68.7/61.9% at T−3/−2/−1 but observed factors take 40–53% → **−EV at every tier.**

**grader** · T13 · `nba/grade_board_outcomes.py` → `nba_market.board_outcomes`, 6.9M legs.
**Leg truth and operator settlement are separate.**

**Hyperdrive** · T1 · Cloudflare's connection layer to DigitalOcean Postgres.

**invisible anchor / switch point** · T13 · When no standard line is offered, the anchor is derived from
where goblins flip to demons. *"10.5 goblin, 11.5 goblin, 12.5 demon → 12 is the anchor."*
**Validated on 42,600 ladders.** 419,205 legs carry one.

## L–N

**ladder** · T13, LIVE · The rungs around an anchor. Per app: PrizePicks in the raw feed; Underdog
`alternate_projections`; Fliff separate proposals; Betr tiers; **Sleeper has none**.

**M1 — defender quality** · T11, T16 · Rejected on a crude metric, then **rebuilt as a two-way ridge**
(`nba_ref.defender_ratings`, 111,768 ratings) and wired on 4 props — **all gains from the INTERACTION
form, not the main effect.**

**N1 — availability model** · T15, T16 · Status resolution. **79% of Questionables are coin flips at
the cutoff** because the Active List locks 60 minutes before tip.

## P–S

**parity** · T10, T14 · `NBA_DAILY_PARITY_AND_BACKFILL.md`. Every daily factor backfilled day by day,
producing exactly what the live pipeline would have produced. **§5 forbids carrying a constant between
days** — the rule that caught the pasted calibration table.

**patcher pattern** · T9 · Production builders are string-transformers over the certified backtest
recipes, so the certified file is never forked.

**phase** · T16, LIVE · Season regime: `1_oct_nov`, `2_dec_asb`, `3_post_asb`, `4_push`.

**score** · LIVE · 0–100. **Confidence ENHANCES around a 0.85 neutral, never taxes.**
A product would kill good legs.

**scenario precompute** · T16, LIVE · Enumerate availability branches, store only the realised one.
**Dropped as a daily job** — with one window there is nothing to select with.

## T–W

**tarpit** · T1 · Silent connection stalling instead of an explicit block. Three timeouts diagnosed it.

**tier** · T13, LIVE · Rungs out from the anchor. **v1 signs by kind; v2 must sign by POSITION**, since
a demon-Less sits below the anchor.

**window** · T11, LIVE · The decision snapshot label. **1:15 PM PT** (corrected from 2:45 — see
OPEN_ITEMS). Set by `ARCHIVE_LABEL`, which **defaults to `routine`**.

---

## PENDING
Terms from T3–T16 are added as each transcript completes its passes. T1 is at pass 10 (clean count 0);
T2 at pass 1.
</content>
</parameter>
<parameter name="message">docs: NBA glossary - terms mapped to transcripts