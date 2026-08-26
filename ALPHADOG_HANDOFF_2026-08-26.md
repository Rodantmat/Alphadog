# AlphaDog v2 — Complete Handoff (2026-08-26)

*Compiled from this full session's work plus prior transcript history. Every number here is either a real, confirmed observation with its source stated, or explicitly marked as unresolved/needs-verification. Read this fully before doing anything else.*

---

## 0. MOST CRITICAL, MUST-DO-FIRST ITEMS

### 0a. `pitcher_fantasy_score` formula bug — RESOLVED. CONFIRMED DEAD, NOT a viable strategy. (Corrected after a full 5-day transcript re-pass — my first version of this handoff had this critically wrong, treating it as "unresolved" and "the single strongest historical finding." It is neither.)

**Full resolution, found in `/mnt/transcripts/2026-08-25-08-23-15-alphadog-aug24-25-formula-board-study-rebuild.txt`:**

1. **Root cause confirmed**: the deployed outcome-grading code (`propValueFromRow` → `sourceAgnosticPitcherFantasyBaselineValue`) used a baseline formula that excluded PrizePicks' real win-bonus and quality-start-bonus terms. The true PrizePicks formula, verified against 6 independent real graded values (e.g., Drew Rasmussen, target=40): `outs + 3×K − 3×earned_runs + 6×wins + 4×quality_starts`.
2. **Code fixed and deployed**: `alphadog-v2-phase3a-first-inning-pitcher-context.js` patched with the correct formula, verified exact-match against 6 real values.
3. **Historical data retroactively fixed**: all 1,487 existing `pitcher_fantasy_score` PrizePicks rows were recomputed with the correct formula (not just going-forward).
4. **The real, final, honest result on the complete corrected dataset (512 legs)**: **52.7% hit rate — statistically indistinguishable from a coin flip.** The entire "+725% to +1105%" backtest that this system (and my own first handoff) treated as its strongest finding was built entirely on the broken formula. **There is no edge here. Do not use this prop for Regular. Move it to the "unsuccessful tries" list, not "best chances."**
5. **One real, flagged, NEVER-VERIFIED follow-up gap**: `propValueFromRow` has no `source_key` parameter, so it cannot distinguish PrizePicks' formula from Sleeper's real, separately-weighted `pfsSl` formula. This means **Sleeper's own `pitcher_fantasy_score` rows may still be silently using the wrong (PrizePicks) formula** — this was explicitly flagged as a needed follow-up and, as far as I can find, was never actually checked or fixed. **Check this in the new chat if Sleeper `pitcher_fantasy_score` data is ever used.**
6. The earlier, separate discrepancy report (08-24: user saw 3 real days of losses vs. the system showing 9/9 real wins) is very likely explained by this same root cause — the system's "9/9 wins" figure was itself computed from the broken formula's data, and would have been wrong.

### 0b. Two of three live strategies are currently confirmed NEGATIVE ROI with corrected pricing
This session found and fixed major multiplier miscalibrations. Once corrected to match real, user-confirmed app values:
- **PrizePicks Sim A** (hits/less + total_bases/less, Goblin, 6-pick Flex): backtest flips from +194% (wrong 1.318/1.480 rates) to **-27.4%** (real rates, see Section 3)
- **Underdog** (rbis/less, 2-pick Standard): backtest flips from +89.0% (wrong flat 3.5x) to **-14.0%** (real formula, see Section 5)
- **Sleeper**: multiplier formula corrected (EV-parity Flex discount) but full backtest re-run not yet done — real historical Sleeper moneyline prices were never saved before 2026-08-26, so no clean re-backtest is possible; only forward data from today onward is trustworthy for this.

**Recommendation already given to the user**: pause new PrizePicks Sim A and Underdog RBIs/less slip generation until a genuinely positive replacement is found. This has NOT been explicitly confirmed/actioned by the user yet as of this handoff — check with them first thing.

### 0c. Demon — a real, important nuance found on the 5-day re-pass: it was suspended once, for a DIFFERENT config, and that does not invalidate the separate pitcher_strikeouts/Tier2 finding
On 2026-08-23, a **different** Demon configuration — a 5-prop combined pool, all on the `/more` side, Tier1, 2-pick Power — was found to be catastrophically broken: real per-leg EV as low as 0.19 (8.0% hit rate against the deployed 2.375x multiplier), confirmed via an exhaustive real-multiplier-range stress test (even the most generous real multiplier ever observed on any Demon leg, 62x, still didn't overcome the bad hit rates). The explicit conclusion and action taken that session was **"suspend Demon entirely."**

This is a **different, separate** finding from `pitcher_strikeouts/less/Tier2` (Section 4b), which was validated independently (both before and after this 08-23 suspension event) and rests on the `/less` side, not `/more`. The 08-23 finding does not appear to directly contradict or retest the `pitcher_strikeouts/less/Tier2` result — but **confirm this explicitly in the new chat**: check the live deployed code's actual current Demon configuration (it may currently be disabled/suspended entirely as a residual of the 08-23 event, or it may have been narrowed back down to just the `/less` pool afterward — this was not fully confirmed in my re-pass given context constraints).

### 0d. Next steps, in priority order
1. Confirm the live deployed Demon config's actual current state (0c above) — is it disabled, or running `pitcher_strikeouts/less/Tier2` specifically?
2. Re-verify `pitcher_strikeouts/less/Tier2` on current data now that 0a is resolved and known-dead
3. Check whether Sleeper's `pitcher_fantasy_score` rows share the PrizePicks formula bug (Section 0a, point 5) — never verified
4. Then proceed to the full 2/3/4/5/6 flex/power day-by-day snapshot backtest across all three apps, all variants (Goblin/Demon/Regular — note Regular's `pitcher_fantasy_score` is now confirmed dead, so Regular needs an entirely new signal, not a re-verification), fixed AND variable lines, hit-rate-by-player AND hit-rate-by-prop-line methodologies — with mandatory Gemini validation on each distinct logic tried (see Section 8)
5. Explicitly include pitcher props (Section 3) — still almost entirely unexplored beyond the Goblin/Demon `pitcher_strikeouts` data points

---

## 1. SYSTEM ARCHITECTURE

### 1a. What AlphaDog is
A real MLB player-prop analysis and slip-generation system covering three apps: **PrizePicks** (three sub-tracks: Goblin, Demon, Regular/Standard), **Sleeper**, and **Underdog**. Real Postgres database (Hyperdrive-backed, accessed via the `Alphadog Bridge` MCP connector's `run_sql_postgres`), full GitHub repo (`Rodantmat/Alphadog`) accessed via `github_get_file`/`github_put_file`/`github_patch_file`/`github_grep_file`, and Gemini access via `run_job` to `alphadog-v2-admin-sql.rodolfoaamattos.workers.dev/gemini-proxy`.

### 1b. The real trigger mechanism — Cowork/Master_Full_Run
**Dead code, do not use**: native Cloudflare crons, `alphadog-v2-master-runner.js`, `alphadog-v2-market-runner.js`.
**Real trigger**: Claude Cowork sessions running `coworker/prompts/Master_Full_Run.txt`, scheduled 4x/day at **1am, 9am, 1pm, 5pm Pacific** (29 direct HTTP calls across layers). The **9am Pacific run is the one that matters** for backtesting against what the user actually acts on — it finishes ~9:30-9:45am Pacific, real slips get placed ~10-10:30am Pacific against that specific run's output.

**Real, confirmed drift issue**: actual completion times drift from the 9am/1pm/5pm/1am schedule (timeouts, stale-batch reconciliation, retries observed). Don't assume an exact time window will find the run — search for the batch CLOSEST to the target time and sanity-check it's plausible (not hours off), not an exact match.

**A real, confirmed trap — do not repeat it**: `score.daily_first_snapshot_batches` (columns: `official_date`, `final_board_batch_id`, `captured_at`) was built to capture "first snapshot of each day" but does NOT reliably do this. Verified directly: the batch captured for `official_date=2026-08-21` started at 00:15 UTC on 08-21, which is 5:15pm Pacific on 08-20 — the previous day's regularly-scheduled 5pm run, which happened to be first to tag rows with tomorrow's `official_date` (early games can roll over). **Do not trust this table's "first snapshot" as the real 9am board state.**

**Verified correct method** to reconstruct a historical day's real 9am-Pacific board:
```sql
-- Pacific 7:00am-12:00pm = UTC 14:00-19:00 during PDT (UTC-7), or UTC 15:00-20:00 during PST (UTC-8)
-- Wide window on purpose - real completion times drift.
SELECT final_board_batch_id, started_at, status
FROM score.final_board_batches
WHERE started_at >= '<target_date>T14:00:00Z' AND started_at <= '<target_date>T19:00:00Z'
  AND status LIKE 'completed%'
ORDER BY started_at ASC LIMIT 1;
```
Then reconstruct using `score.final_board_history` (retains every batch; `final_board_current` only holds the latest) filtered to that specific `final_board_batch_id`. If no batch falls in that window, or the closest one is implausibly far from 9am, **say so explicitly** rather than silently substituting a different run. Per this session's explicit user instruction: **if the 9am run isn't available, use the 1pm/2pm run as fallback**, but always state which was used.

### 1c. Pipeline layers (for context on where data comes from)
- **Classification/baseline pipeline**: `alphadog-v2-base-classification-v5.js`, `alphadog-v2-base-certifier*.js` — computes baseline probabilities per prop
- **Enrichment/scoring engine pipeline**: Phase 2a/2b/3a/3b/3c workers (run environment, weather, batting order, matchup factors, etc.) feed into `alphadog-v2-scoring-runner*.js` → `hp_board_current` → `alphadog-v2-score-final-board.js` → `score.final_board_current`/`final_board_history`
- **Score Prep**: `alphadog-v2-score-prep.js` writes `score.board_prepared_current`/`board_prep_batches` — an intermediate stage between raw ingestion and final scoring. **Important, real finding this session**: this table carries `row_payload_json` with a `source_prices` key containing REAL raw moneyline data (over_price/under_price) for Sleeper AND Underdog, sourced more directly than the ParlayAPI capture. This table is CURRENT-ONLY (gets overwritten) — see Section 6 for the permanent archive built this session.
- **Market layer**: `alphadog-v2-market-line-shape-classifier.js` (Layer 3, Steps 18-19) — mines PrizePicks/Sleeper/Underdog/Fliff board data via ParlayAPI into `market.context_probe_player_props` → archived to `archive.market_prop_context_history`
- **Outcome grading**: real game outcomes graded into `score.prop_outcome_history` (columns: `outcome_hit`, `actual_stat_value` where available, `line_value`, `selected_side`, `canonical_prop_key`, `is_goblin`, `is_demon`, `official_date`, `game_pk`, `mlb_player_id`)

### 1d. Known historical pipeline bugs (fixed, but know the history — from `MULTIPLIER_TABLES_MASTER.md`)
1. Contaminated "less" rows on more-only lines (PrizePicks Goblin/Demon rows with `is_under_allowed=0` incorrectly getting a phantom `selected_side='less'` row) — fixed at raw ingestion filter
2. Scoring engine join missing `selected_side` match — fanned out 16,650→25,085 rows, killed final-board for 5 runs — fixed
3. Non-atomic board replace (DELETE then separate INSERT, not transactional) — could return "0 of 0" to a concurrent reader — fixed via `pgClient.begin(...)`
4. Duplicate scoring rows from overlapping retries — needed a DB-level unique constraint + `ON CONFLICT`, not just app-level filtering — recurred once after a first fix
5. Client/server field-name mismatch on slip save (`j.saved` vs `j.saved_slips`) — every save silently reported "0 saved" despite genuinely saving — fixed 2026-08-21
6. **NEW, this session (2026-08-26)**: `real_multiplier_flex_tiers` was double-JSON-encoded in `score.slip_entries` (JSONB column holding a JSON-encoded string, not a native object) — required `(col #>> '{}')::jsonb` to properly parse/patch, not a direct cast
7. **NEW, this session**: HTML `placeholder=` attributes were used instead of `value=` for the real-multiplier confirmation input fields across Sleeper/Goblin/Regular rendering — placeholders are never actually submitted with a form, causing empty/stale values to save. Fixed to `value=` in all ~10 occurrences.
8. **RESOLVED, now confirmed dead**: the `pitcher_fantasy_score` outcome-grading bug (Section 0a) — was exactly this same bug family (a broken formula, not a side/threshold flip as I first suspected). Fixed and retroactively re-graded; the underlying prop has no real edge (52.7% hit rate).

---

## 2. THE EXHAUSTIVE MULTIPLIER LIST — SOURCE, WHY IT MATTERS, HOW TO USE IT

The user provided a hand-confirmed, real multiplier table across many PrizePicks prop/side/variant combinations on 2026-08-25 (found in `/mnt/transcripts/2026-08-26-00-50-08-alphadog-aug25-multiplier-calibration.txt` and its continuation `2026-08-26-02-21-58-alphadog-aug25-multiplier-calibration-b.txt`). **This is the ground-truth reference — always check it before assuming any per-leg rate.**

### 2a. Why this matters — the root cause of this session's biggest error
Earlier in this session (before this handoff), I deployed a PrizePicks "Sim A" strategy using per-leg rates of 1.318 (hits) and 1.480 (total_bases), sourced from an OLDER internal table (`MIXED_TOP55_REAL_TABLES`) that had **mislabeled data**: the 1.318 rate was actually real `hits_runs_rbis/less/Goblin` data (2:1.7, 3:2.3, 4:2.9, 5:3.75, 6:5.25 → per-leg ~1.27-1.32), mistakenly applied to plain `hits`. The REAL `hits/less/Goblin` data from the exhaustive list is completely different: **2:1.4, 3:1.5, 4:2.2, 5:2.6, 6:3.5** (per-leg ~1.18-1.23). `total_bases/less/Goblin` (line 1.5) WAS correct at 10.5 for 6-pick (per-leg ~1.48).

This was caught because the user's 7 real saved slips (mixed hits+total_bases, 6-pick) clustered at 2.25-2.5x for the full-hit tier — nowhere near the 6.6-10.5x my wrong table predicted. **Important, unresolved nuance**: mixing DIFFERENT props together in one Flex slip does NOT simply multiply their individual per-leg rates — there's a real, separate discount effect for mixed-prop pools that the user explicitly flagged as needing investigation ("you did not gave me any mixed slips yet, to see if the multipliers change behavior when mixed together") and that was **never properly resolved this session**. The final "1.15 for both" fix I deployed was a reaction to the mixed-pool numbers, not the true pure-single-prop rate — **it is likely still wrong for pure single-prop slips**. See 2c below for the corrected, real per-prop values to use going forward; the mixed-pool interaction question remains genuinely open.

### 2b. Complete real per-leg rate table (PrizePicks Goblin, from the exhaustive list, per-leg = full_value^(1/n))
| Prop | Side | Variant | Real 6-pick full value | Real per-leg rate |
|---|---|---|---|---|
| doubles | less | Goblin | 2.4 | 1.157 |
| hits | less | Goblin | 3.5 | 1.232 |
| hits | less | Demon | 108 | 2.18 (roughly flat 2.15-2.21 across sizes) |
| hits | less | Standard | 37.5 | 1.83 (matches universal Standard rate) |
| hits_runs_rbis | less | Goblin T1 | *(incomplete — only 2:1.7, 3:1.9 given, needs 4/5/6)* | ~1.24-1.30 |
| hits_runs_rbis | less | Goblin T2 (line 2.5) | 5.25 | 1.318 |
| hits_runs_rbis | less | Demon | 167 | 2.35 |
| hits_runs_rbis | less | Standard | 37.5 | 1.83 |
| hits_runs_rbis | more | Goblin (line 0.5) | 5.75 | 1.339 (4-6 pick data only) |
| home_runs | less | Goblin | 2.3 | 1.149 |
| rbis | less | Goblin | 5 | 1.308 |
| runs | less | Goblin | 9 | 1.442 |
| singles | less | Goblin (line 0.5) | 6.5 | 1.366 |
| singles | less | Goblin (line 1.5) | 17 | 1.604 — **real, confirmed line-value sensitivity: 0.5 and 1.5 pay genuinely differently at the same tier** |
| singles | less | Standard | 37.5 | 1.83 |
| stolen_bases | less | Goblin | 2.4 | 1.157 |
| total_bases | less | Demon | 106 | 2.18 |
| total_bases | less | Goblin (line 1.5) | 10.5 | 1.480 |
| total_bases | less | Standard | *(6-pick incomplete)* | 1.83 (extrapolated) |
| walks | less | Goblin (line 0.5) | 6.5 | 1.366 |
| walks | less | Standard | 37.5 | 1.83 |

**Standard/Regular lines converge to ~1.73-1.83 per-leg REGARDLESS of specific prop** — confirms a universal published table for Regular, not per-prop pricing (this matches the real published PP tables already known: Power `2:3,3:6,4:10,5:20,6:37.5`; Flex `3:{3:3,2:1},4:{4:6,3:1.5},5:{5:10,4:2,3:0.4},6:{6:25,5:2,4:0.4}`).

### 2c. Real p×m analysis done this session (single-prop pools only, using exact line-matched hit rates)
| Prop (line) | Real hit rate | Real per-leg rate | p×m |
|---|---|---|---|
| doubles/less | 84.4% | 1.13 | 0.954 |
| home_runs/less | 85.1% | 1.13 | 0.961 |
| stolen_bases/less | 87.6% | 1.14 | 0.998 |
| rbis/less | 71.0% | 1.30 | 0.923 |
| walks/less (0.5) | 70.0% | 1.32 | 0.924 |
| hits/less | 77.5% | 1.21 | 0.938 |
| hits_runs_rbis/less (T2, 2.5) | 74.2% | 1.31 | 0.972 |
| runs/less | 67.9% | 1.44 | 0.977 |
| total_bases/less (1.5) | 68.1% (n=5,498) | 1.47 | **1.0015** — essentially neutral |
| **singles/less (1.5)** | **83.4% (n=1,591)** | **1.57** | **1.31 — real, substantial edge** |

**Singles/less/1.5 is the single most promising finding of this session** — and per the 5-day re-pass, this is corroborated independently: `/mnt/transcripts/2026-08-26-03-29-40-alphadog-aug25-fliff-integration-prizepicks-deepdive.txt` reports a real, already-built day-by-day slip-construction backtest for `Singles/less` showing **ROI 272-410% across many stable K/threshold combinations** — described there as "dominating, far outperforming the current deployed strategy," with the note that this magnitude warranted the same skepticism as an earlier too-good-to-be-true Underdog finding, and day-by-day reliability checking was in progress. **This means a real slip-construction backtest may already exist for this signal — check that transcript in full before rebuilding it from scratch.** My own p×m analysis this session (Z=16.35, p<0.00001) is consistent in direction and statistical strength with this, though I derived it independently via single-leg p×m rather than a full slip backtest. **Honest limitation carried over**: real trading capacity is thin (~94 legs across only 17 active days in my own analysis window) — reconcile this against whatever day-count the 272-410% figure used.

### 2d. Real, important nuances documented by the user directly (verbatim insights, do not lose these)
- "when a player recently recorded a hit on that line, the multiplier is higher for less and lower for more when compared to a player who has not hit the line recently" — real, unexploited signal, never tested
- PrizePicks now has Flex for 2-pick (previously assumed Power-only for some tracks) — needs to be incorporated into any 2-pick backtest
- Same-team players in one slip get "a little discount" on Standard lines specifically (user's own observation, seen in real H+R+RBI and Walks Standard data)
- High-variance props (pitcher_strikeouts, fantasy_score, pitching outs) must be compared by **Goblin/Demon tier**, not by exact line value, since the line varies too much game-to-game for a fixed-line comparison to be meaningful. Low-variance props (h+r+rbi, hits, total_bases) are usually 0.5 or 1.5. Hard/fixed props (home runs, stolen bases, doubles, runs, rbis, walks) are almost always 0.5.

---

## 3. PITCHER PROPS — WHAT EXISTS, WHAT'S MISSING

The user correctly flagged that pitcher props were almost entirely absent from this session's analysis. Real data that DOES exist (from `MULTIPLIER_TABLES_MASTER.md`, `GOBLIN_LEG_MULT_TABLE`):

| Prop | Side | Tier | Real per-leg rate | n |
|---|---|---|---|---|
| pitcher_strikeouts | less | Goblin T2 | 1.265 | 2 |
| pitcher_strikeouts | less | Goblin T3 | 1.140 | 1 |
| walks_allowed | more | Goblin T1 | 1.140 | 1 |

**Real Goblin tier-distance test** (same two players, same game, `pitcher_strikeouts`): Tier 1 (closest to anchor) per-leg ~1.30, Tier 2: 1.265, Tier 3: 1.140 — confirms for Goblin, farther tier = LOWER multiplier (objectively easier = market pays less). This is the OPPOSITE direction from Demon (farther tier = HARDER = pays MORE — real per-leg growth factor per tier step ≈1.40x, confirmed via 2-pick real data: Tier1 ~2.35-2.40, Tier2 ~3.81, Tier4 ~6.52).

**The one real, historically-documented Demon exception**: `pitcher_strikeouts/less/Tier2` (NOT `hits_runs_rbis` — that was a real, confirmed documentation error found by a coworker session on 2026-08-22 and corrected; the live deployed pool was always `pitcher_strikeouts`). Real confirmed multiplier: implied per-leg 3.087x (from a real 6-pick slip that returned 865x). Real hit rate 71.6% (n=67) → per-leg EV 2.21, genuinely substantial. Real leave-one-day-out backtest (08-11 excluded): **+311.9% Power / +378.5% Flex** across 4 real days (56.5%→27.5% full-hit rate once 08-11 removed — the more conservative, honest number). **This needs re-verification against current data as the FIRST priority after the fantasy_score fix (Section 0a/0c).**

**Anchor/tier mechanics** (critical for ANY tier-based selection): if an explicit regular line exists, anchor = that line exactly. If no explicit regular line exists (raw feed has zero `odds_type='standard'` row), the implied "switch point" = midpoint between the highest "below" line (More=Goblin) and lowest "above" line (Less=Goblin) — confirmed live on 7 real pitchers, matched the app every time. **Known caveat**: PrizePicks' raw `odds_type` field is NOT always reliable — confirmed 3 times it disagreed with the real app. Tier = `round(abs(line - anchor))`, always positive magnitude.

**Table-selection warning**: `backtest.tiered_full_fixed` is confirmed STALE/rotten for Demon tier analysis (752 NULL-tier rows on `hits_runs_rbis/less` alone, tier numbering doesn't match the live formula — shows tier=0 on genuine demon legs, which is structurally impossible). Use `backtest.demon_full_history_dedup` instead — built later, switch-point-aware, matches the live tier definition exactly.

**What's still completely unexplored for pitcher props**: fantasy_score (blocked on the grading bug), pitcher_outs, earned_runs, hits_allowed, runs_allowed, first-inning props. None of these have been backtested this session at all.

---

## 4. PRIZEPICKS — FULL CURRENT STATUS

### 4a. Goblin (Sim A — currently deployed, CONFIRMED NEGATIVE, needs pausing/replacing)
- Deployed: hits/less + total_bases/less, Goblin only, 6-pick Flex, top-55-by-appearance + ≥92% hit rate
- **Real, corrected backtest with the true 1.15-ish per-leg rate (now known to be imprecise per Section 2a): -27.4% ROI** (121 slips, 38 full hits, 31.4% hit rate) — flipped from the wrongly-calibrated +194%/+133.2%
- Code location: `alphadog-v2-certification-center.js`, `MIXED_TOP55_REAL_TABLES`, `buildMixedTop55Slips`, `autoSelectMixedTop55Legs`
- **Action needed**: re-verify with the corrected PURE per-prop rates from Section 2b (not the mixed-pool-reactive 1.15), and resolve the mixed-pool discount question before concluding this is dead — the -27.4% number used an imprecise blended rate.

### 4b. Demon (thin, historically promising, needs re-verification)
- Historical: `pitcher_strikeouts/less/Tier2`, 3-pick Flex, no cap, real table `3/3=15x, 2/3=1.5x`
- Every OTHER Demon tier tested shows p×m<1 structurally (Demon compounds losses as slip size grows when p×m<1) — cross-checked by Gemini, confirmed mathematically sound
- Rejected Demon signals (do not re-test without new data): `runs+singles<0.5` (driven by one outlier day), batting order position (Demon legs concentrate on top-of-order stars — structural scarcity of bottom-of-order legs), highest-available-line heuristic (superseded by tier-distance framework)

### 4c. Regular/Standard — Gen2 confirmed dead; Gen1 is the only remaining candidate (see Section 0a)
- Two generations: Gen1 (historical, replaced) = bottom-of-order batting position + total_bases<1.5, 6-pick Power, +837.5% real ROI, 3/6 days won — **since Gen2 is now confirmed dead, Gen1 needs a fresh re-test on current data; it is not a "combine with Gen2" situation anymore**
- Gen2 (`pitcher_fantasy_score/less` mispricing) — **CONFIRMED DEAD (Section 0a)**. The formula bug was found, fixed, and retroactively re-graded across all 1,487 historical rows; the real, corrected hit rate is 52.7% (a coin flip) on the full 512-leg dataset. The previously reported +725%/+1105.4% backtest numbers no longer mean anything — they were computed from broken outcome data. **Do not use this prop for Regular going forward.**
- Real published tables: Power `2:3,3:6,4:10,5:20,6:37.5`; Flex `3:{3:3,2:1},4:{4:6,3:1.5},5:{5:10,4:2,3:0.4},6:{6:25,5:2,4:0.4}`
- Rejected stacking tests: umpire tendency on top of bottom-of-order (noise, ~2pp spread), narrowing to spot-9-only (made it WORSE — thin pool can't build good 6-picks even with a better per-leg rate)

---

## 5. UNDERDOG — FULL CURRENT STATUS

- Current deployed: `rbis/less`, 2-pick Standard, real top-25-by-appearance + ≥66% hit rate
- **This session's major finding and fix**: the assumed flat 3.5x "Standard" table was WRONG for this pool — real user-saved multipliers (12 real observations) ranged 1.49-1.86x (mean 1.62, std only 0.093 — extremely tight). Root cause (Gemini-validated): 3.5x only applies to genuinely balanced ~50/50 legs; RBIs/less/0.5 legs are heavy favorites (65-90%+ real probability), and Underdog prices heavy-favorite Standard legs dynamically like a real sportsbook parlay, not via the flat published table.
- **Real, derived formula** (Gemini EV-parity derivation): `M = (1-H)/(p1×p2)`, H≈0.0766 (house margin, fit to the 12 real observations — a starting prior, not a final fit). `p1,p2` = each leg's real market-implied probability from Underdog's own live moneyline (`market.underdog_board_current.raw_line_json`, real fields `over_price`/`under_price`, JSON-string-encoded same as Sleeper — needs `(col #>> '{}')::jsonb` unwrap).
- Deployed in: `underdog2PickRealMultiplier()` (server, `alphadog-v2-certification-center.js`) and mirrored client-side in `recomputeMultiplier()`'s `parlay_underdog` branch.
- **Real, corrected backtest: -14.0% ROI** (307 slips, 163 full hits, 53.1% hit rate) — flipped from the wrongly-calibrated +85.8%/+89.0%.
- **Older, separate historical findings not yet re-tested against current pool**: `hits_allowed` depth gate (skip day if <6 legs) flipped an old 5-prop mixed pool from -6.8% to +181.3% — the concept may generalize to the current `rbis/less` pool, never tested. An even older locked config (`rbis/less`+`walks/less`, 6-pick Power, cap=1/day) showed +345.0% on the largest real sample of any strategy this system has found (4,553/4,340 real graded outcomes) — **this is a DIFFERENT, larger pool than the current 2-pick rbis-only config and was never properly compared against it.** Worth investigating whether this older 6-pick dual-prop config still holds and beats the current thin 2-pick approach.
- Real published table (official, pre-discount): Standard `2:3.5,3:6.5,4:12,5:20,6:35,7:65,8:120`; Flex `3:{3:3.25,2:1.09},4:{4:6,3:1.5},5:{5:10,4:2.5},6:{6:25,5:2.6,4:0.25},7:{7:40,6:2.75,5:0.5},8:{8:80,7:3,6:1}`. The OLD, now-superseded "flat 0.6865 discount" model doesn't apply to the current heavy-favorite pool — use the new per-leg formula instead for any RBIs/less-style heavy-favorite pool; the flat discount may still be valid for genuinely balanced Standard pools if any get tested.

---

## 6. SLEEPER — FULL CURRENT STATUS

- Current deployed: `singles/less`, 5-pick Flex, real ≥55% rolling hit rate (60-day, min 3 obs), ranked by real per-leg multiplier
- **Real per-leg formula** (validated against real app examples): `DecimalOdds = 1+price/100` (price>0) or `1+100/abs(price)` (price<0); `Multiplier = 1 + (DecimalOdds-1)×0.95`
- **This session's major finding and fix**: the naive per-leg PRODUCT over-predicted real Flex full-hit payouts by 12-39% (worse at larger sizes) — validated accurate for Power/2-pick (ratio 0.98-1.01) but not Flex. Real cause: Sleeper discounts the top Flex payout to fund partial-hit (insurance) tiers, which independent-leg multiplication ignores.
- **Real, Gemini-derived EV-parity correction**: `flex_full_hit = power_equivalent_product × f(n, p̄)`, where `f(n,p̄) = 1/(1 + c1·n·x + c2·(n(n-1)/2)·x²)`, `x=(1-p̄)/p̄`, `p̄` = average real implied probability across the slip's legs. Starting priors: c1=0.10, c2=0.01 (fit to 7 real Flex observations — genuinely a starting point, refine as more real data comes in). Clamped to [0.50, 0.95].
- **Real, size-specific partial-tier ratios** (also derived from the 7 real observations, replacing a flat 10%/3% guess): n=4: oneBelow≈0.24; n=5: oneBelow≈0.23, twoBelow≈0.049; n=6: oneBelow≈0.11, twoBelow≈0.021.
- Deployed in: `sleeperFlexFactor()` (server), mirrored client-side in the Sleeper branch of `realMultFieldsHtmlForSize()` and `recomputeMultiplier()`.
- **No clean re-backtest possible yet** — real historical Sleeper moneyline prices were never saved before this session (2026-08-26). A permanent archive (`archive.sleeper_source_prices_history`) and a capture endpoint (`POST /capture-sleeper-source-prices` on the market-line-shape-classifier worker) were built this session — **this needs to be wired into the daily Master_Full_Run routine to run automatically** (was identified but not yet actioned as of this handoff).
- Older historical finding, never re-tested: Doubles-only, 90% real hit rate, variable 2-6 size, min-4-pick gate → +12.7% real backtest. Superseded by `hits_runs_rbis/more` (an even older config) without a direct comparison ever being run against either the doubles approach OR the current singles/less approach.

---

## 7. UI/APP BUGS FIXED THIS SESSION (all confirmed deployed and live)

1. `/api/slips/high-hit` was calling the wrong (PrizePicks-only Goblin) qualifying function for Sleeper/Underdog — always returned zero for both. Fixed to call each platform's own dedicated function.
2. `recomputeMultiplier()` (client-side, runs on leg-uncheck) had no case for `source_key==="prizepicks"` (only the old `"prizepicks_goblin"` name) — fell through to `return 0`, causing a "0x" badge bug on uncheck. Fixed.
3. `recomputeMultiplier()`'s Sleeper branch still used the OLD naive per-leg product, never updated with the new flexFactor discount — fixed to mirror the server formula.
4. `GOBLIN_LEG_MULT_TABLE_CLIENT` had stale/missing entries for `hits`/`total_bases` — fixed (though note Section 2a: even the "fixed" 1.15 value here needs re-verification against the real per-prop rates in Section 2b).
5. `real_multiplier_flex_tiers` used `placeholder=` instead of `value=` in ~10 HTML input-rendering locations — fixed across Sleeper/Goblin/Regular.
6. Tier-count bug: Sleeper/Goblin Flex fields always showed 3 tiers regardless of slip size — fixed so 2-pick shows Power-only (single field), 3/4-pick show 2 fields, 5/6-pick show 3 fields.
7. Underdog's `entry_mode` was already correctly `"power"` — confirmed no fix needed there, the top-level `entry_mode!=='flex'` check already routes it correctly.
8. 7 already-saved PrizePicks slips from today had their `real_multiplier_flex_tiers` "6" value corrected (twice — first to match a since-superseded estimate, then to the corrected 1.15-based one; **this second correction is also now suspect per Section 2a and may need a third pass** once the true per-prop rates are locked in).

---

## 8. GEMINI USAGE PATTERN (established, working well)

Call via `run_job` to `POST https://alphadog-v2-admin-sql.rodolfoaamattos.workers.dev/gemini-proxy` with body `{"model":"gemini-3.6-flash","prompt":"..."}`. **Critical, repeatedly-confirmed lesson**: dropping a large amount of data on Gemini in one prompt causes drift — the user's own explicit instruction is "work with gemini, do multiple small passes." The working pattern used successfully this session:
1. First pass: present the real data + a few sharp, specific questions, get a diagnosis
2. Second pass: reference the first pass's conclusion explicitly, ask for the next specific piece (e.g., the exact formula, or a statistical test) — do NOT re-paste all the original data, just enough context to anchor the continuation
3. Third pass (if needed): validate/stress-test the derived formula against real held-out data

This produced genuinely rigorous results this session: the Sleeper Flex EV-parity formula, the Underdog heavy-favorite pricing diagnosis, and the Singles/1.5 statistical validation (Z=16.35, p<0.00001) were all derived this way, not guessed.

---

## 9. PARLAY API / KEYS STATUS

- ParlayAPI is a real, paid, actively-billed connector (the user directly confirmed it costs real money daily) that feeds moneyline/odds data for PrizePicks, Sleeper, Underdog, AND Fliff into the Market layer (Layer 3 of Master_Full_Run) via `alphadog-v2-market-line-shape-classifier.js`.
- Historical `/closing-odds` endpoint on ParlayAPI does NOT return Sleeper or Fliff historical data even though both are listed as active bookmakers — confirmed via direct testing. This means TRUE historical backfill for Sleeper (and Fliff) pricing is **not recoverable** — it was never captured by anyone, this is a hard data-availability wall, not a bug to fix.
- Going forward (2026-08-26 onward): Sleeper's `market.sleeper_board_current` and Underdog's `market.underdog_board_current` both carry real, live `raw_line_json` with `over_price`/`under_price` — this data IS now being captured live (confirmed working) but has no historical depth before today for Sleeper specifically. Underdog's equivalent table may have more history — not yet checked.
- The Score Prep stage (`score.board_prepared_current.row_payload_json->source_prices`) is a SEPARATE, likely more-authoritative direct capture of Sleeper/Underdog pricing (not via ParlayAPI) — also current-only, archived this session via `archive.sleeper_source_prices_history` (see Section 6).
- **API key storage, confirmed from live code** (`alphadog-v2-market-line-shape-classifier.js`): the real key is looked up from `config.external_credentials` (`credential_key='parlay_api_key'`, stored as JSON `{password:"..."}`), with a fallback to the `PARLAY_API_KEY` Cloudflare secret if the DB lookup fails. Auth header name/prefix configurable via `PARLAY_API_AUTH_HEADER_NAME`/`PARLAY_API_AUTH_HEADER_PREFIX` env vars (default header: `X-API-Key`).
- **Book classification, confirmed from live code**: `PARLAY_OWNED_BOOKS_EXCLUDED_FROM_DECISION = ["prizepicks","sleeper"]` (excluded from vendor-comparison decisions since we own this board data directly). `PARLAY_PICKEM_BOOKS_QUARANTINE = ["underdog","betr","pick6","parlayplay","dabble"]` — Underdog is explicitly quarantined as a non-primary comparison book in this classifier. Fliff is grouped under `props_core_us_books` alongside real sportsbooks (DraftKings, FanDuel, etc.) — treated as a genuine odds-comparison book, not a DFS pick'em book.
- **Fliff status** (from `2026-08-26-03-29-40` and `2026-08-26-19-59-44` sessions): confirmed live and already being mined via the market pipeline; no historical backfill available (same wall as Sleeper/Underdog); archiving was reportedly fixed on 2026-08-26. Not otherwise used in any locked strategy as of this handoff.
- **Market-runner disabled**: at least one 08-25/26 session found `alphadog-v2-market-runner.js` disabled in the real schedule — consistent with Section 1b's note that this file is dead code; the real trigger is Cowork/Master_Full_Run, not this file. Worth a final confirmation in the new chat that nothing still depends on it.

---

## 10. UNSUCCESSFUL TRIES — COMPLETE LIST (do not re-test without genuinely new data)

| Signal | App | Real result | Why rejected |
|---|---|---|---|
| `runs+singles<0.5` | Demon | +296.7% (looked promising) | Entirely driven by one outlier day (08-11); 7/8 real days were losses |
| Batting order position | Demon | Noisy, thin samples | Demon legs concentrate on top-of-order stars — structural scarcity of bottom-of-order legs |
| Batting order position | Underdog | Flat, no trend (63.4%→46.9%, opposite direction) | No exploitable pattern |
| Batting order position | Sleeper | Contradictory (61.9% vs 31.6% at adjacent spots) | Noisy, too thin |
| Umpire tendency + bottom-of-order | PP Regular | ~2pp spread on n=83-107 | Statistically indistinguishable from noise |
| Narrowing bottom-of-order to spot-9-only | PP Regular | 0/6 real wins (worse than broader 7-9 pool's 3/6) | Best per-leg rate doesn't help if pool too thin to build good 6-picks |
| Leg-density/day-quality filtering | Demon (tested twice, different signals) | Promising on small samples, failed on more data both times | Confirmed pattern — treat any future leg-density hypothesis with extra skepticism |
| Correlation-control (max 1 leg/game) | PP Goblin | REMOVING it slightly IMPROVED ROI at scale | Real, counter-intuitive — still carries real tail risk (rainouts/blowouts) a backtest can't price |
| Same-game correlation generally | PP Goblin | Weak positive (+1.05pp, n=1,276 pairs) | Real but negligible |
| Pitcher-dominance stacking (opposing batters underperform when their pitcher's Goblin leg hits) | PP Goblin | Real but tiny (+0.43pp on 26,114 pairs vs Gemini-predicted +10.2pp) | Directionally correct, far too weak to exploit |
| **This session's Sim A** (hits+total_bases mixed, Goblin, 6-pick Flex) | PrizePicks | **-27.4% with corrected rates** | Wrong per-leg calibration inflated the original backtest; may need re-test with truly correct pure-prop rates (Section 4a) |
| **This session's RBIs/less 2-pick** | Underdog | **-14.0% with corrected formula** | Wrong flat 3.5x assumption inflated the original backtest |
| **`pitcher_fantasy_score/less` (PrizePicks Regular, "Generation 2")** | PrizePicks | **52.7% real hit rate on the corrected, retroactively-fixed dataset (512 legs) — statistically a coin flip** | The entire +725%/+1105% backtest was built on a broken outcome-grading formula (missing win/quality-start bonuses); once fixed and retroactively re-graded, no edge exists at all. **Confirmed dead, not merely unresolved.** See Section 0a. |
| 5-prop combined Demon pool, `/more` side, Tier1, 2-pick Power | PrizePicks Demon | Real per-leg EV as low as 0.19 (8.0% hit rate) | Catastrophically negative under every real multiplier tested, including the most generous ever observed (62x). Distinct from the separate, still-plausible `pitcher_strikeouts/less/Tier2` finding. Demon was suspended entirely following this (2026-08-23) — confirm current live state before assuming any Demon config is active. |

---

## 11. BEST CURRENT CHANCES (in priority order, corrected after the 5-day re-pass)

1. **`PrizePicks Goblin: singles/less/1.5`** — now the strongest lead overall. Statistically overwhelming single-leg edge (p×m=1.31, Z=16.35, p<0.00001) AND an independently-reported real slip-construction backtest showing +272-410% ROI (Section 2c) — these two should be reconciled and the full backtest re-confirmed/re-read in `2026-08-26-03-29-40-alphadog-aug25-fliff-integration-prizepicks-deepdive.txt`. Thin trading volume is the main real risk (~17-32 active days depending on window).
2. **Underdog's older 6-pick `rbis/less`+`walks/less` config** (+345.0%, largest real sample of any finding this system has produced) — never properly compared against the current, now-negative 2-pick config; may still be the better approach
3. **`PrizePicks Demon: pitcher_strikeouts/less/Tier2`** — re-verify on current data (historically +311.9%/+378.5% ex-outlier), AND first confirm whether Demon is even currently live/enabled given the 08-23 suspension of a different config (Section 0c)
4. **PrizePicks Regular Gen1** (bottom-of-order + total_bases<1.5, +837.5%) — since Gen2 (`pitcher_fantasy_score`) is now confirmed dead (Section 0a), Regular has NO currently-valid signal; Gen1 is the only real, previously-validated Regular candidate left and should be re-tested fresh, not "combined with Gen2" as my first handoff wrongly suggested
5. **Pitcher props generally** — almost entirely unexplored beyond the Goblin/Demon `pitcher_strikeouts` data points in Section 3; a real, structured tier-based study (not fixed-line) is a clean, unexplored opportunity. Note: `pitcher_fantasy_score` itself is now confirmed dead for PrizePicks (Section 0a) — don't re-test it there, but Sleeper's version of this prop was never actually checked for the same formula bug and remains a genuine open question
6. **The mixed-prop-pool discount question** (Section 2a) — genuinely unresolved, affects any future multi-prop Flex slip design for PrizePicks Goblin

**A broader, honest pattern worth naming**: this session and the 5-day re-pass together found THREE separate cases of a strategy's real backtest being built on materially wrong underlying data (PrizePicks Sim A's per-leg rates, Underdog's flat multiplier assumption, and now PrizePicks Regular's outcome-grading formula) — each time, fixing the data flipped a strongly-positive headline number to flat-to-negative. **Treat any currently-"strong" backtest number in this system with real skepticism until its underlying inputs (multiplier AND outcome-grading formula) have been independently re-verified, not just its win-rate arithmetic.**

---

## 12. IMMEDIATE NEXT STEPS FOR THE NEW CHAT (corrected)

1. Read this document fully, including Section 0's corrections — the first version of this handoff got the `pitcher_fantasy_score` status and priority order wrong; this version reflects a genuine 5-day transcript re-pass.
2. Confirm the live deployed Demon config's actual current state (Section 0c) — check whether it's disabled or running `pitcher_strikeouts/less/Tier2` specifically.
3. Re-run the real, day-by-day, 10am-Pacific-snapshot-with-1pm-fallback backtest for `pitcher_strikeouts/less/Tier2` (Demon) using `demon_full_history_dedup`, not `tiered_full_fixed`.
4. Read `2026-08-26-03-29-40-alphadog-aug25-fliff-integration-prizepicks-deepdive.txt` in full for the reported Singles/less/1.5 real slip-construction backtest (+272-410% ROI) — reconcile against my own single-leg p×m analysis (Section 2c) before treating either as final.
5. Check whether Sleeper's `pitcher_fantasy_score` shares the PrizePicks formula bug (Section 0a point 5) — flagged in the original fix session but never actually verified.
6. Since PrizePicks Regular's Gen2 signal is now confirmed dead, re-test Gen1 (bottom-of-order + total_bases<1.5) fresh on current data — Regular currently has no valid signal at all.
7. Build the comprehensive 2/3/4/5/6-pick Flex/Power backtest the user originally requested, across all three apps, all PrizePicks variants, fixed AND variable lines, hit-rate-by-player AND hit-rate-by-prop-line methodologies, with mandatory Gemini validation per distinct approach.
8. Explicitly include pitcher props in that study (Section 3).
9. Circle back to the unresolved mixed-prop-pool discount question (Section 2a) if time allows.
10. Confirm with the user whether to pause live PrizePicks Sim A and Underdog RBIs/less slip generation, per Section 0b — recommended but not confirmed as of this handoff.
11. Keep Section 11's closing pattern in mind throughout: three separate strategies in this system's history looked strongly positive until their underlying data was independently re-verified, then flipped to flat/negative. Apply the same skepticism to anything currently marked "locked" or "strong."
