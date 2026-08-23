# SIGNALS, TECHNIQUES, AND LAYERS TRIED — Complete Log
*Every method attempted across this session (2026-08-16 through 2026-08-21), validated or rejected, with the real reason. A coworker session must read this before starting daily research, both to avoid blindly repeating a rejected test AND to know it's allowed — encouraged — to re-test any of these fresh against current data, since real conditions change.*

---

## VALIDATED AND CURRENTLY LOCKED

| Strategy | App | Signal | Real result |
|---|---|---|---|
| Goblin | PrizePicks | Per-leg tier-based multiplier table, 5-pick Power, 25% daily cap | Backtest +79.9%, being actively re-validated against real per-leg pricing (see MULTIPLIER_TABLES_MASTER.md) |
| Regular | PrizePicks | `pitcher_fantasy_score/less` real mispricing | +1105.4% Power / +779.3% Flex, 28-day real backtest |
| Demon | PrizePicks | `hits_runs_rbis/less/Tier2`, 3-pick Flex, no cap | +80.0% Power / +657.9% Flex (real multiplier), thin sample (19 slips, 5 days) |
| Sleeper | — | `hits_runs_rbis/more`, 3-pick Power, no cap | +46.5%, 36 slips, 22-day backtest |
| Underdog | — | `rbis/less` + `walks/less`, 6-pick Power, cap=1/day | +345.0%, largest real sample of any strategy (4,553 / 4,340 real graded outcomes) |

---

## VALIDATED, HISTORICAL, STATUS UNCLEAR (re-test these fresh)

**Real, repeated pattern worth naming**: every item in this table has now survived at least one full coworker research session untouched. Do not let this list simply persist unchanged — each entry represents real, already-identified work that has not yet been done. A session that produces zero movement on this table two runs in a row is not being genuinely exhaustive, regardless of what else it found.

| Signal | App | Real result when tested | Why status is unclear |
|---|---|---|---|
| Bottom-of-order (batting spots 7-9), `total_bases<1.5` | PrizePicks Regular | +837.5% ROI, 3/6 real days won | Appears to have been organically replaced by the `pitcher_fantasy_score` signal without being formally compared or combined. **Different prop entirely — may be genuinely complementary, not redundant. Test combining both.** |
| Board-density gate (skip if <20 legs/game) | PrizePicks | Real backtest ROI +22.4% → +35.1% | Built for the OLD 3×6-pick Flex strategy, not re-tested against the current locked Goblin/Regular pools |
| `hits_allowed` depth gate (skip if <6 legs) | Underdog | Real backtest ROI -6.8% → +181.3% | Built for the OLD 5-prop mixed pool, not re-tested against the current locked `rbis`+`walks` pool — worth checking if an analogous depth gate helps the current pool |
| Doubles-only, 90% real hit rate | Sleeper | Real 8-day backtest, gated to min-4-pick: +12.7% | Superseded by `hits_runs_rbis/more` without a direct comparison ever being run. **Worth re-testing both in parallel on current data.** |

---

## MANDATORY COVERAGE MATRIX — updated every session, gaps must shrink over time

**This matrix exists because the same real gaps survived three full coworker research sessions untouched (verified 2026-08-22).** Every session must update this table with real results, not just add new rows elsewhere and leave this one stale. A ✅ means genuinely tested against the CURRENT locked pool for that track with a real, reported result. A ❌ means genuinely never done. Do not mark ✅ without a real result you can cite.

| Technique | Goblin | Regular | Demon | Sleeper | Underdog |
|---|---|---|---|---|---|
| Granular per-(prop,side,tier) multiplier (never a flat blended ratio) | ✅ **(08-21 s5)** `GOBLIN_LEG_MULT_TABLE` applied per (prop,side) over **exhaustive** combination enumeration, lane verified from `final_board_history`. Locked-like pool (tb2.5+tb3.5+hrr3.5+singles) **−12.1% (2-pk) to −29.5% (6-pk)**. Best pool `earned_runs/more/0.5`+`hits_allowed/more/2.5` 6-pick **+8.4%** | N/A (single prop, published table at 1.000 — **break-even per-leg ratio measured at 0.691, see s5**) | ✅ | N/A (dynamic per-leg formula; **1.628 vs 1.2684 conflict is load-bearing, see s5**) | ✅ (compounding model confirmed; s5 shows flat model would report +192.2% where compounding gives −55.4%) |
| Multi-layer stacking (weather / bullpen fatigue / park factors / schedule fatigue) | ✅ **(08-21 s5) REJECTED** — lineup×hitter-stats stack (opposing top-4 rolling 30d OBP) on the pitcher-supply MORE pool: quintile hit rates 88.9 / 73.3 / 88.9 / 95.6 / 75.6% (non-monotonic), leg-level r = **−0.036** | ✅ **(08-21 s6) REJECTED — tested on the CURRENT signal at last.** Weather joins the `pitcher_fantasy_score/less` pool at **98.2%** (umpire 93.8%). Leg-level temperature effect is real, monotonic and **larger than any context effect previously found**: 70-79°F **79.9%** (n=189) → 80-87°F 76.3% (n=97) → 88°F+ **67.4%** (n=46), a **−12.5pp** gradient. It still does not survive slip construction: ungated **+900.0%** (45 slips, 18 days, 12 full) → gate temp<88°F **+812.2%** (37 slips, 9 full) → gate temp<80°F +971.4% but on **21 slips / 6 full hits / 15 days**, losing 3 days and half the volume → re-rank `score − γ·(temp−80)` at γ=0.5 **+733.3%**, at γ=1.0 +900.0% (unchanged selection). Same failure mode as every prior stack | ✅ **(08-22 s8) REJECTED, but the gradient is real and mechanistically coherent.** Weather × Demon, `context.history_game_weather` joined on `game_pk` (98.6% join), `demon_full_history_dedup_v2` ex the four corrupted days: demon hit rate rises **monotonically** with temperature — <70°F 13.3% (n=15) / 70-79°F 14.2% (n=1,540) / 80-87°F 14.5% (n=681) / **88°F+ 17.1% (n=386)**, a +2.9pp spread. Direction is correct (demon legs are 87% `more`-side; hotter air → more offence → hard overs clear more often). Not exploitable: +2.9pp on a 14% base, and the clean Demon pool is only 81 legs over 13 days, so any temperature gate removes the pool entirely | ✅ **(08-22 s4) REJECTED** — leg-level lift real (+4.3–5.5pp low bullpen fatigue) but does NOT survive slip construction: ungated +451.6% → bullpen-gate +272.4% → temp-gate +244.8% → both +86.2% | ✅ **(08-22 s8) REJECTED — the PP Regular temperature gradient does not transfer.** Same layer, same method, locked `rbis/less/0.5`+`walks/less/0.5` pool, 7,720 legs, weather join **98.6%**: <70°F 71.4% (n=98) / 70-79°F 70.0% (n=4,260) / 80-87°F 70.5% (n=2,304) / **88°F+ 74.3% (n=950)**. Flat-to-**reversed** and non-monotonic. The mechanism predicts the opposite sign (hot → more offence → hitter `less` legs fail more), so this refutes the mechanism on hitter props rather than merely failing to reach significance. No slip-level test run: a +4.3pp effect in the wrong direction cannot rescue a pool that is −23.9% to −73.5% before any gate |
| Shrink/expand adaptive sizing | ✅ **(08-22 s8) REJECTED** — on the `earned_runs/more/0.5`+`walks_allowed/more/0.5` goblin pool (max-1/game), adaptive 2→6 gives **+12.6%** (36 slips, 24 days, 18 full) vs fixed-6 **+12.5%** (34 slips, 22 days). Buys +2 days for ~0pp — inert, not a win. Both figures are ranked-greedy and therefore inside the ±7pp tie-break band (see the tie-break row below); exhaustive says the pool is +1.1% | ✅ **(08-21 s6)** build the largest size the day's pool supports (2–6), score-ranked, max 1 leg/player: **48 slips, 21 days, 12 full hits, +771.9%** vs fixed-6's +782.4% on 18 days. **Buys +3 days of coverage (18→21) at a cost of 10.5pp** — a far better trade than the Sleeper case, but still a trade, not a free win | ✅ **(08-22 s8) REJECTED** — Pool I (`pitcher_strikeouts`+`earned_runs` /less, T1+T2), corrupted days excluded, 08-21 added via the live tier column: adaptive 2→5 = **14 slips, 12 days, 0 full hits, −100.0%**. Adaptive picks the deepest size available and demon full-hit probability falls off a cliff with size; fixed-2 is the only non-catastrophic size (−16.1%) | ✅ **(08-22 s4)** no-op where pools are always ≥6 legs (identical to fixed_6); on the thin `doubles+home_runs` pool it buys +6 days coverage (19→25) at a lower ROI (+487.9% → +392.2%) | ✅ **(08-22 s8) REJECTED — it lands on the worst size.** Locked `rbis/less`+`walks/less` pool is ≥8 legs deep on all 28 days, so "largest size the day supports" collapses to fixed-8, the single worst config: **−73.5%** (574 slips, 28 days, 39 full). Full size ladder under the geometric model (`published × 0.6516ⁿ`): 2-pk −23.9%, 3-pk −34.1%, 4-pk −44.2%, 5-pk −57.3%, 6-pk −64.4%, 7-pk −65.4%, 8-pk −73.5%. Monotonically worse in size; fifth independent confirmation the track is dead as deployed |
| Pool-composition alternatives tested (not just size/cap sweeps on one fixed pool) | ✅ **(08-21 s5)** 10 pools × 5 sizes, exhaustive enumeration; only pitcher-supply MORE pools positive | ✅ **(08-21 s5) RESOLVED** — the "rare-event standard-lane pool" does not exist: on authoritative lane labels **zero** standard-lane buckets clear n≥30 & 80%; best is `pitcher_fantasy_score/less/24.5` at 89.7% but n=29. Locked pool is 100% standard-lane (376/376 legs) | ✅ (Pool I) — **but see s5: Pool I's support is a data artifact** | ✅ (rbis+walks+rfi_nrfi found; s5 exhaustive: locked `hits_runs_rbis/more` 3-pick is **−5.8%**, `rbis/less` 6-pick **+141.0%**) | ✅ **(08-22 s4)** 40 configs all negative; **(08-21 s5)** first-ever positive found — `pitcher_fantasy_score/less`, see cross-app row |
| Cap sweep (fixed AND percentage, multiple values) | ✅ **(08-21 s6)** full sweep on the surviving pool (`earned_runs/more`+`walks_allowed/more`, 3-pick) × 3 correlation treatments × caps 1,2,3,4,5,∞. Unrestricted: cap1 +17.6%, cap3 +7.1%, cap∞ +7.0%. Max-1/player: cap2 +17.9%, cap∞ +9.7%. **Max-1/game: cap1 +28.6%, cap2 +23.3%, cap∞ +17.8%** (saturates at 4/day). Monotonically decreasing in cap — concentration helps, matching Sleeper and Underdog and unlike PP Regular | ✅ **(08-21 s5)** re-swept on deduped lane-verified legs: cap 1,2,3,4,5,6,8,10,12,15,∞. Best cap=2 (+892.6%); saturates at **6**/day, not 8 | ⚠️ partial (percentage vs fixed shown, not a full multi-value sweep) | ✅ | ✅ |
| **Rule B0c — tie-break sensitivity (≥2 deterministic orders)** | ✅ **(08-22 s9) FAILS THE BAR.** New locked config `walks_allowed/more` goblin, 6-pick Flex, priced per-line from the live layers: tie-break A (pid asc) **+21.8%**, B (pid desc) **+14.7%**, C (line asc, pid asc) **+0.8%** — a **21-point swing on ordering alone**, 37 slips / 15 days / same legs. At 5-pick the sign flips: +12.9% / +16.4% / **−5.4%**. Day-robustness is NOT the problem — LODO on tie-break A is **+11.1% to +28.3%, 0 of 15 folds negative**. Per B0c this is not yet a real finding. **(08-23 s10) DISAGREEMENT, unresolved.** Re-built on the full record (all goblin-lane `walks_allowed/more` at lines 0.5+1.5, 68 slips / 27 days vs s9's 37 / 15) and priced with slip payout = `∏(per-leg rate) × 25/37.5` for Flex full-hit: **−40.3% / −36.8% / −40.5%** across the same three orders — sign-stable but *negative*, not positive. The gap is the Flex partial-tier treatment and the pool footprint, not the data. Reconcile before either number is used | ✅ **(08-23 s10) PASSES THE BAR — the first track to do so.** Locked `pitcher_fantasy_score/less`, standard lane (432 legs, 100% standard, 79.6%, 24 days, **45 distinct scores** — same tie-density as Goblin). Four orders (pid asc / pid desc / line asc / line desc), sizes 2–6, Power: 2-pk **+88.0…+90.9%**, 3-pk **+219.7…+232.8%**, 4-pk **+300.0…+330.0%**, 5-pk **+610.5…+689.5%**, 6-pk **+945.1…+1068.0%**. Sign never flips; relative band 3.3% (2-pk) → 13.0% (6-pk). 6-pick order A: 61 slips, 20 days, 18 full, **+1006.6%**, LODO **+837.5…+1084.2%, 0/20 folds negative**. Binomial expectation at p=79.6% is +854%, so the ranked figure is inside sampling noise per the s8 rule | ✅ **(08-23 s10) FAILS THE BAR on magnitude, but the sign is safe.** Locked 5-prop `/more/Tier1` pool on `demon_full_history_dedup_v2`, four corrupted days excluded: **only 70 legs / 12 days**. 2-pick Power, three orders: **−62.4% / −24.8% / −62.4%** at per-leg 2.375 (live layer2, n=3) — a **37.6pp swing** driven by 2 vs 4 full hits in 30 slips, the widest band of any track. Ranking "by real hit rate" is a per-prop constant, so ties are structural and ordering decides everything. Negative at every order and at the 5.50x floor (−26.7…−63.3%). Break-even full-hit is 17.7%; observed 6.7–13.3% | ✅ **(08-23 s10) FAILS THE BAR on magnitude, sign safe.** Locked `hits/more/0.5`, 6-pick Flex, priced at the live layer1 rate **1.3740 (n=6)**. Sleeper Flex is round-robin so EV reduces exactly to **(p·m)^(n−1)** — break-even p = 1/m = **72.8%**; the pool is **61.2%** (526 legs, 23 days). Three orders at cap 3: **−29.0% / −14.8% / −29.0%** (14.2pp band); uncapped **−35.7% / −32.7% / −35.7%**. Negative at every order. Break-even per-leg is 1.416–1.472 against the real 1.374, so the margin sits inside the uncertainty of a 6-observation multiplier | ✅ **(08-23 s10) PASSES THE BAR — effectively tie-break invariant.** New locked `hits_allowed/more`, 6-pick Flex: three orders give **+520.9% / +520.4% / +520.9%** — a **0.5pp band** on 35 slips / 18 days / 25 full hits. The pool is near-deterministic (`/0.5` 100.0% n=94, `/1.5` 92.4%, `/2.5` 88.9%), so ordering barely matters. **But the config's assumed 8.5x full-hit tier implies a per-leg ratio of 0.835, vs the only real measured Underdog ratio of 0.6516.** Re-priced geometrically at 0.6516: **+37.1%**, LODO **+34.3…+45.0%, 0/18 folds negative**. Break-even ratio **0.6167** — only 5.4% below the measured rate |
| **Live pricing layers (`score.pricing_layer1/2/3`) queried fresh, not static table** | ✅ **(08-22 s9)** layer1 n=5 rows all n≥2; layer2 n=14 (8 at n≥2); layer3 n=18 **all n=1, so it outranks nothing yet** per the n≥2 rule. Live rates **confirm the new config's line-split rationale**: `walks_allowed/more/0.5` = **1.1053 (n=10)** vs `/1.5` = **1.4379 (n=2)**, a **30% spread** — a blended average would be materially wrong (Rule B0b). Live 0.5 rate is **below** the static table's 1.140 for the same bucket → **the live layer supersedes `MULTIPLIER_TABLES_MASTER.md` here** | N/A (published table) | ⚠️ layer2 demon rows exist but `__any_prop__` aggregates at n=1–3 | ✅ layer1 `hits/more/0.5` = 1.3740 (n=6), `hits_runs_rbis/more` = 1.638 (n=12), `doubles/more` = 1.2684 (n=8) — **a 34% spread across the Sleeper pool, B0b applies** | ❌ no rows |
| Cross-app signal transfer attempted | — | ✅ **(08-21 s5)** `pitcher_fantasy_score/less` ported PP Regular → Underdog: **+4.1% (2-pk) / +4.8% (3-pk) / +5.2% (4-pk)**, 147 legs, 13 days, LODO at 2-pick **+0.2% to +8.3%, 0 negative folds** — the only positive Underdog pool ever found. **BLOCKED for live use: the prop stopped being graded on Underdog after 2026-08-09 (0 rows for 11 straight days)** | — | ✅ (Underdog pool ported in) | ✅ **(08-21 s5)** receiving end of the PP Regular transfer above |
| Void/DNP-adjusted real pricing applied to backtest ROI | ✅ **(08-21 s6)** pitcher-leg population measured directly: **0 of 794** graded pitcher legs (`pitcher_fantasy_score`, `pitcher_strikeouts`, `earned_runs`, `hits_allowed`, `walks_allowed`, `pitcher_outs`, from 08-04) belong to a pitcher who faced no batters — **0.00%**. Confirms the long-standing "N/A, pitcher props" assumption with a real number rather than an assertion | ✅ **(08-21 s6)** same measurement, 0.00% | ✅ **(08-21 s6)** same measurement, 0.00% | ✅ **(08-21 s5) EXECUTED — effectively a no-op.** Measured against real plate appearances (`stats_hitter.game_logs.pa>0`): **15 of 25,909 graded hitter legs (0.06%)** belong to a player with no PA that day. On Sleeper `rbis/less` specifically, 1 of 1,067 legs from 08-04 on. The pipeline already excludes non-participants before grading. **The documented ~7% figure is too high by two orders of magnitude** | ✅ **(08-21 s5)** same measurement, same hitter-leg population — 0.06%. Repricing moves no Underdog ROI materially |
| Gemini consulted for a NEW, previously-untested hypothesis (not fact-checking an existing claim) | ✅ **(08-21 s5) REJECTED** — "opposing top-4 lineup OBP re-rank" (TTO-acceleration mechanism). Tested walk-forward (prior-30d OBP only, ≥100 prior PA), 225 legs / 8 days. Both of Gemini's own falsification criteria met: rank correlation non-positive (r = −0.036) and the top quintile (75.6%) sits below the 87.0% Goblin break-even. Raw call and raw response in the s5 log entry | ✅ **(08-22 s8) REJECTED at slip level, but it produced the session's most valuable by-product.** Hypothesis: re-rank `pitcher_fantasy_score/less` by the **upper-tail buffer** `B = line_value − P75(pitcher's prior-10-start actual fantasy score)`, z-scored within day, added to `score_0_100` at γ=3. Gemini set its own bar at ≥ +1023.8% (baseline +30pp) and required strict Q1→Q5 monotonicity. **Leg-level gradient is real**: quintiles by B give 72.9 / 78.6 / 82.9 / 81.2 / 82.6% (n≈70 each), **+9.7pp Q1→Q5** — the first real leg-quality gradient ever found on PP Regular. **Slip level fails outright**: γ=0 (baseline) +993.8%, γ=1 +837.5%, γ=2 +915.6%, **γ=3 +759.4%**, γ=5 +759.4%, γ=8 +681.3%, γ=∞ +837.5% — no value beats baseline. Gemini's monotonicity criterion also fails, narrowly (Q4 81.2% < Q3 82.9%). Criteria 4–5 (2024-25 holdout, sportsbook juice) are inapplicable — no pre-2026 data in this database and DFS pick'em carries no juice; stated rather than silently skipped. Raw call and raw response in the s8 log entry | ✅ **(08-22 s8) — attempted, BLOCKED by pool depth, stated rather than skipped.** The same buffer construction is defined for Demon, but the clean Demon pool (`pitcher_strikeouts`+`earned_runs` /less, T1+T2, four corrupted days removed) is **81 legs over 13 days**, and at the deployed 3-pick size yields **17 slips with 1 full hit**. No re-rank can be evaluated against 17 slips; a γ sweep on that base is unfalsifiable in either direction. Re-open once Demon has ≥5 deep days | ✅ **(08-22 s4) REJECTED** — "0-1 count tailwind" re-rank (umpire called-strike z-score, γ sweep). Monotonically worse: γ=0 +451.6%, γ=0.05 +382.7%, γ=0.15 +313.7%, γ=0.40 +244.8% | ✅ **(08-21 s6) REJECTED, but it found a real gradient.** Hypothesis: `walks/less/0.5` filtered to hitter 30d BB% < 5.5% × pitcher 30d Strike% > 66.5% × wide-zone umpire clears 82%. Gemini set its own bar at ≥80.0% on ≥250 legs. **Arm 1 validated and well-powered** — hitter BB% is monotonic over four bands: <5.5% **73.6%** (n=443) / 5.5-8.0% 68.4% / 8.0-11.0% 66.8% / 11.0%+ **63.9%**, a **+9.7pp** spread, the first real leg-quality gradient ever found on Underdog. **Arm 2 BLOCKED** — pitcher Strike% is populated on only 808 of 15,841 `stats_pitcher.game_logs` rows (5.1%; 4,039 = 25.5% via `raw_json->'stat'->>'strikePercentage'`). **Arm 3 fails to compound** — within low-BB hitters, pitcher-friendly ump 79.0% (n=105) / mid 71.7% / hitter-friendly ump 74.2%: non-monotonic. Qualified cell peaks at **79.0% on 105 legs**, under both of Gemini's thresholds. Slip construction: 2-pick **+1.0%** (49 slips, 15 days, LODO −4.7%…+6.3%, **4/15 folds negative**); 3-pick **−25.4%**, 14/14 folds negative. Gemini's own headline verdict — *"unplayable on aggregate/generic pools"* — is confirmed |
| First-pitch-strike rate available for the 0-1 tailwind test | 🚫 **BLOCKED (08-21 s5), with the search shown.** Searched (a) every `stats_pitcher` column matching `%first%`/`%fps%`/`%strike_pct%`/`%zone%` → only `first_promoted_game_date`, `first_raw_game_date`; (b) all **70** distinct keys of `stats_pitcher.game_logs.raw_json->'stat'` across 4,039 object rows → `strikes`, `strikePercentage`, `numberOfPitches`, `pitchesThrown` (overall only, no per-count split); (c) every `stats_pitcher`/`context` column matching `%pitch%` → `strikes_per_pitch_calculated`, `pitches_per_out_calculated`, bullpen pitch counts. **FPS% is nowhere in this database.** Nearest proxy is overall `strikePercentage`, a materially different quantity | 🚫 same | 🚫 same | 🚫 same | 🚫 same |

**Every session must move at least two ❌ cells to ✅ or ⚠️→✅, with a real cited result.** A session that adds new findings elsewhere but leaves this matrix unchanged has not met the exhaustiveness bar. If a cell is genuinely blocked, say so explicitly in that cell rather than leaving it silently blank.

### 🛑 HEADLINE FINDING 2026-08-22 (session 8) — `score_0_100` has NO within-pool predictive power. Every ranked-greedy ROI in this log is overstated.

Rule B0 already says *do not rank by the platform's internal score*. This is the measurement of how much that matters, and it is larger than anyone assumed. Leg-level Pearson correlation between `score_0_100` and `outcome_hit`, PrizePicks graded legs, four corrupted days excluded, deduped by (date, player, prop, side, line, game):

| Scope | n | corr(`score_0_100`, `outcome_hit`) |
|---|---|---|
| Whole PrizePicks board | 48,219 | **+0.414** |
| Demon lane only | 9,120 | +0.338 |
| Goblin lane only | 34,768 | +0.126 |
| `goblin` / `total_bases` only | 6,291 | +0.129 |
| `goblin` / `doubles` / `less` / 0.5 only | 2,094 | **+0.001** |
| `standard` / `pitcher_fantasy_score` / `less` (the locked PP Regular pool) | 348 | **−0.005** |

**The score's apparent power is almost entirely lane separation.** It sorts goblin from demon — a fact already carried explicitly by `is_goblin`/`is_demon` — and once the pool is a single (prop, side, line) bucket, which is the situation *every one of the five locked strategies is in*, the correlation is zero. Session 1's "+15.0pp top-30 lift, PrizePicks scoring is healthy" is **not refuted but is re-scoped**: it was measured across the whole board, where the score is re-discovering the lane.

**Two direct consequences, both standing rules from now on:**

- **The pool is the strategy. Ranking within it adds nothing measurable.** A track's EV should be quoted as its pool's binomial expectation, with the ranked-greedy figure reported alongside as an *observation*, not as the estimate. Worked example, PP Regular: pool hit rate 79.7%, so a 6-pick under independence expects `0.797⁶ × 37.5 − 1 = +861%`; ranked-greedy construction observes +993.8%. The +133pp gap is sampling noise on 48 slips, not selection skill.
- **Corollary: cap sweeps on a homogeneous pool are measuring noise.** Any cap ranking that moves ROI by less than the pool's own binomial standard error should be reported as inert rather than as a preference.

### 🛑 SECOND FINDING (session 8) — ranked-greedy Goblin results are TIE-BREAK SENSITIVE, by roughly ±7pp

`score_0_100` takes only **37 distinct values** across the 777-leg `earned_runs/more/0.5` + `walks_allowed/more/0.5` goblin pool, and **539 of 777 legs (69.4%) sit inside a same-day tie group.** Ranked-greedy construction is therefore dominated by how ties are broken. The identical config (6-pick, max-1-per-game) returned **+25.9%, +19.3% and +12.5%** across three runs differing only in tie-break order.

**Exhaustive enumeration removes the dependency and is the honest number.** All combinations over the max-1-per-game pool, granular `GOBLIN_LEG_MULT_TABLE` per leg (`walks_allowed/more` 1.140 real; `earned_runs/more` **1.15 fallback, no real placed-slip observation**):

| Size | Combinations | Days | Full hits | ROI | LODO band | Negative folds |
|---|---|---|---|---|---|---|
| 2 | 1,304 | 24 | 1,029 | **+3.4%** | +1.7% … +6.0% | 0 / 24 |
| 3 | 4,358 | 24 | 3,044 | **+4.9%** | +1.7% … +8.4% | 0 / 24 |
| 4 | 10,325 | 23 | 6,311 | **+5.1%** | +0.2% … +9.2% | 0 / 23 |
| 6 | 24,611 | 22 | 11,023 | **+1.1%** | **−8.2% … +7.3%** | **4 / 22** |

**This retracts Session 6's "+17.8%, the best-supported Goblin configuration ever found."** The pool is real but marginal: +4.9% at 3-pick, break-even per-leg **1.127** against an assumed **1.145** — a 1.6% margin sitting entirely inside the uncertainty of a fallback multiplier that has zero real observations. Within-day score quartiles on this pool are non-monotonic (92.4 / 83.1 / 90.7 / 88.5%), consistent with the headline finding above. **Treat as a data request, not a config change** — unchanged in substance from Session 6's own verdict, but at a quarter of the claimed size.

### ✅ RESOLVED (session 8) — neither outcome writer is complete. Use the UNION, not either alone.

Sessions 5, 6 and 7 all restricted to `outcome_id LIKE 'outcome_final|%'`. That writer's rows only join to the authoritative board from **2026-08-05 onward** (5–128 legs/day before that, vs 2,000–4,000 after), which silently costs **11 days** of history. But the `grade_*` writer is not a drop-in replacement either: it carries **zero rows** for `pitcher_fantasy_score`, i.e. the entire PP Regular locked pool.

| Method | days with usable lane | carries PP Regular pool? |
|---|---|---|
| `outcome_final` only (sessions 5–7) | 13 clean | ✅ |
| `grade_*` only | 25 clean | ❌ **misses the locked pool entirely** |
| **UNION, deduped by (date, player, prop, side, line, game), lane from `final_board_history`** | **25 clean** | ✅ |

Under the union, only **367 of 48,219 legs (0.8%)** fail to resolve a lane. Resulting split, four corrupted days excluded — the cleanest yet recorded, and the first where demon sits where the mechanism requires:

| Lane | legs | hit % | days |
|---|---|---|---|
| goblin | 34,769 | **73.4%** | 25 |
| standard | 3,965 | **51.3%** | 24 |
| demon | 9,118 | **19.3%** | 24 |

Session 5–7's demon figure of 34.6% **included** the four corrupted days; 19.3% is the clean number. **Standing rule: build the leg set from both writers, dedupe, and take the lane from `final_board_history`.**

### ✅ B0 BUCKET TABLE REBUILT ON THE UNION (session 8) — still zero standard-lane buckets

n≥30 and ≥80%, 25 clean days: **13 qualifying buckets, all goblin lane, zero standard, zero demon.** Best standard-lane bucket in the whole record at n≥15 is `hits/more/0.5` at **71.2% (n=59)** — nowhere near the bar. Session 6's finding survives a near-doubling of the window.

| Bucket (all **goblin** lane) | class | n | hit % | days |
|---|---|---|---|---|
| `walks_allowed/more/0.5` | TIERED | 311 | 88.1% | 24 |
| `stolen_bases/less/0.5` | FIXED | 398 | 87.4% | 10 |
| `hits_runs_rbis/less/4.5` | TIERED | 399 | 84.7% | 13 |
| `hits_allowed/more/2.5` | TIERED | 202 | 84.7% | 25 |
| `doubles/less/0.5` | FIXED | 2,094 | 84.6% | 13 |
| `home_runs/less/0.5` | FIXED | 896 | 84.0% | 13 |
| `total_bases/less/3.5` | TIERED | 1,415 | 84.0% | 13 |
| `pitcher_outs/more/11.5` | TIERED | 98 | 83.7% | 21 |
| `singles/less/1.5` | FIXED | 561 | 83.6% | 13 |
| `runs/less/1.5` | FIXED | 173 | 83.2% | 13 |
| `earned_runs/more/0.5` | TIERED | 338 | 83.1% | 25 |
| `hits_runs_rbis/less/3.5` | TIERED | 1,736 | 81.7% | 13 |
| `pitcher_strikeouts/less/6.5` | TIERED | 131 | 80.9% | 13 |

Note the day-coverage split: the **pitcher-supply `more` buckets carry 21–25 days**, every hitter `less` bucket only 13. That asymmetry, not hit rate, is why the pitcher-supply pools keep surfacing as the only testable Goblin candidates.

### ✅ RESOLVED (session 8) — the live `goblin_demon_tier` column, validated for the first time, and the first live-tier backtest

Carried as an open item since Session 1. `goblin_demon_tier` is populated on PrizePicks rows for exactly **two dates: 2026-08-21 (graded) and 2026-08-22 (today, ungraded)** — 4,766 rows, zero NULL anchors.

**Formula validation, 4,762 of 4,766 = 99.92% exact** against `round(abs(line_value − goblin_demon_anchor_line))` — *but only under `numeric` (half-up) rounding*. Under Postgres `double precision` (banker's) rounding only **2,464 of 4,766 = 51.7%** match. This independently re-confirms the rounding-mode bug at a far higher rate than the 14.5% found in the demon table, because switch-point anchors land on `.5` boundaries constantly. `floor()` matches 31.1%, `ceil()` matches the same 4,762.

**First live-tier backtest (2026-08-21, single day, 2,644 graded tier-bearing legs).** The goblin ladder is confirmed monotone on live data for the first time:

| Lane | T1 | T2 | T3 | T4 | T6 | T7 | T8 | T9 |
|---|---|---|---|---|---|---|---|---|
| **goblin** | 69.0% (n=1,118) | 76.6% (n=629) | **83.5% (n=375)** | 75.0% (n=8) | 33.3% (n=6) | 22.2% (n=9) | 38.5% (n=13) | 16.7% (n=6) |
| **demon** | 51.6% (n=62) | 7.1% (n=14) | 11.1% (n=18) | 15.8% (n=38) | 13.0% (n=23) | 12.5% (n=16) | 0.0% (n=10) | 0.0% (n=8) |

Standard (tier 0): 61.1% (n=216). Tiers 1–3 behave exactly as `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` §3 predicts. **Tiers 4+ are degenerate and should be excluded from any tier-based selection**: 34 of the 42 high-tier goblin legs are `pitcher_fantasy_score`, confirming Session 2's diagnosis (tier is a raw line-unit distance, not comparable across props) on live-tier data rather than on a reconstruction. Demon T1 at 51.6% is anomalously high for a hard-side leg and is worth watching as more tier days accumulate.

### ❌ RETRACTED (session 8) — Underdog `pitcher_fantasy_score` was NOT discontinued. It was RENAMED.

Session 5 reported the only positive Underdog pool ever found as *"BLOCKED for live use: the prop stopped being graded on Underdog after 2026-08-09 (0 rows for 11 straight days)"* and reported it to the user as a live defect. **That is wrong.** The prop key changed:

| `canonical_prop_key` | side | n | days | window | hit % | avg line |
|---|---|---|---|---|---|---|
| `pitcher_fantasy_score` | less | 147 | 13 | 07-27 → **08-09** | **79.6%** | 31.90 |
| `pitcher_fantasy_score_ud` | less | 111 | 12 | **08-10** → 08-21 | **60.4%** | 32.09 |

Identical average line, unbroken date coverage across the boundary, no gap. **No live defect exists; retract that report to the user.** The pool is still unplayable, but for a different and honest reason: the hit rate decayed from 79.6% to **60.4%**, against a 6-pick Underdog break-even of ~84.9% under the geometric model. B7 applies — a filter (the literal prop key) removed exactly the rows that would have changed the answer.

**Related, and a real mechanism for the documented ~88% Underdog edge decay:** Underdog's two best buckets ever recorded, `home_runs/less/0.5` (**90.5%**, n=455) and `stolen_bases/less/0.5` (**90.3%**, n=259), exist on **four days only, 2026-07-25 → 07-28**, and have zero rows since. Only the `more` side survives, at 13.3% and 10.9%. **Underdog withdrew the easy side of its rare-event props** — which is precisely where the +EV was. This is a market-structure explanation, not a selection-model one, and no re-ranking can recover it.

### ✅ NEW CAPABILITY (session 8) — the PrizePicks pitcher fantasy-score formula, reconstructed exactly

Derived from real data, not assumed:

```
pitcher_fantasy_score = outs_recorded + 3×strikeouts − 3×earned_runs − hits_allowed − walks_allowed
```

Validated against every overlapping row of `stats_pitcher.game_logs` and graded `actual_stat_value`: **429 of 429 exact, MAE 0.000, max error 0.** Wins contribute **zero** (two rows identical on every component except `wins` returned identical scores).

**Why this matters far beyond the hypothesis that produced it.** `score.prop_outcome_history` only reaches back to 2026-07-24, so any prior-form window built from graded outcomes averaged **1.29 prior starts per leg** — useless. `stats_pitcher.game_logs` spans **2026-03-25 → 08-21, 15,973 rows, 759 pitchers**, so the same window now averages **9.27 prior starts at 99.7% coverage**. Every pitcher-prop prior-form, rolling-percentile, or regression-to-mean signal is now testable on a full season instead of three weeks. Nothing in this repo previously used it.

### ✅ RESOLVED 2026-08-22 (session 2) — the lineup-join blocker

**It was never a join failure.** `context.history_game_lineup` joins to the graded board on **43–85% of legs (mean ~70%)**, verified per-day across 14 days. The "~2-5%" figure reported across three sessions was an artifact of a `WHERE batting_order_code IS NOT NULL` filter applied inside the join CTE.

**Actual root cause — a silent writer-format change on 2026-08-05.** The table has four write generations:

| Dates | lineup_status / source | Rows | `batting_order_code` | `lineup_slot` |
|---|---|---|---|---|
| 07-24 → 08-04 | `posted_lineup` / real / high | 2,970 | ✅ populated | ✅ populated |
| 08-05 → 08-12 | all-NULL metadata | 1,419 | ❌ NULL | ❌ NULL |
| 08-13 → 08-18 | real, no status | 1,422 | ❌ NULL | ✅ populated |
| 08-19 → 08-24 | `derived_likely_lineup` / derived / LOW | 1,395 | ❌ NULL | ✅ populated |
| 08-19 only | `OFFICIAL_BATTING_ORDER_POSTED` | 27 | ✅ populated | ✅ populated |

`batting_order_code` is populated on only **41.4%** of rows and stopped being written on 2026-08-05. `lineup_slot` is populated on **80.4%**.

**The fix: use `lineup_slot`, not `batting_order_code`.** They are exactly equivalent where both exist — `batting_order_code = lineup_slot × 100`, verified on all 2,997 overlapping rows (333 rows per slot, perfectly uniform, zero exceptions). Switching raises usable coverage from **12 days to 24 days**. The 08-05 → 08-12 window (8 days) has neither column and is genuinely lost. The 08-19 → 08-24 window is `derived`, LOW confidence — usable but flag it.

### 🛑 CRITICAL DATA DEFECT FOUND 2026-08-21 (session 5) — `prop_outcome_history.is_goblin` / `is_demon` are NOT the lane

**Do not read the lane from `score.prop_outcome_history`. Read it from `score.final_board_history`, joined on `final_board_row_id`.**

The graded-outcome table has **two writers** and they disagree:

| Writer (by `outcome_id` prefix) | PP rows | goblin | demon | neither | `matrix_id` |
|---|---|---|---|---|---|
| `outcome_final\|…` | 41,593 | 170 | 266 | **41,157 (99.0%)** | always populated |
| `grade_*` | 57,168 | 38,626 | 15,783 | 2,759 | always NULL |

The `outcome_final` rows carry **unpopulated lane flags defaulting to 0/0** — that is not a "standard lane" tag.

### ⚠️ FIGURE CORRECTED 2026-08-21 (session 7) — the headline was 97.9%, the correct number is 92.1%

The original cross-tabulation was `outcome_final` rows against `grade_*` rows, **inner-joined**, over the 36,465 keys present in both writers:

| `outcome_final` says | `grade_*` says | keys |
|---|---|---|
| neither | **goblin** | 28,505 (78.2%) |
| neither | **demon** | 7,131 (19.6%) |
| neither | neither | 782 (2.1%) |
| agree on a lane | | 47 |

That arithmetic is right — 35,636 / 36,415 = 97.9% — but **the denominator is conditioned on "a `grade_*` row exists", which is itself correlated with being goblin or demon.** The inner join silently dropped **4,590** `outcome_final` keys that have no `grade_*` counterpart. Splitting on exactly that condition shows the size of the selection effect:

| `outcome_final` key | keys | joined to board | goblin/demon on board | neither on board | **% goblin/demon** |
|---|---|---|---|---|---|
| has a `grade_*` row | 36,465 | 36,272 | 35,357 | 915 | **97.5%** |
| **no `grade_*` row** | **4,590** | 4,219 | 2,038 | 2,181 | **48.3%** |

This is the same class of error as the `batting_order_code IS NOT NULL` filter inside the lineup join CTE — a filter applied inside the join that removes exactly the rows that would change the answer. Rule B7 exists to catch it and did not get applied here.

**The correct measurement uses the authoritative board as the denominator, unconditioned.** All PrizePicks graded `outcome_final` rows reading 0/0:

| Method | population | joined | goblin | demon | neither | **% relabelled** |
|---|---|---|---|---|---|---|
| Row level, join on `final_board_row_id` | 41,157 | 40,901 | 29,649 | 8,009 | 3,243 | **92.1%** |
| Distinct key, join on player/prop/side/line/game | 40,724 | 40,719 | — | — | 3,060 | **92.5%** |

**92.1% is the figure that should be quoted.** The two join keys agree to within 0.4pp (fan-out is negligible: 1.01 board rows per key), so the join key was never the issue — the denominator was.

**Where other numbers come from, for reproducibility.** A cross-check that does not restrict `source_key='prizepicks'` lands in the 40–56% band, because Sleeper and Underdog have no goblin/demon lane at all — their legs correctly read 0/0 on both sides and are legitimately standard:

| Variant | 0/0 rows | relabelled | % of joined |
|---|---|---|---|
| PP only, graded, `outcome_final` only | 41,157 | 37,658 | **92.1%** |
| ALL APPS, graded, `outcome_final` only | 63,262 | 37,658 | 60.2% |
| ALL APPS, graded, any writer | 83,043 | 37,658 | **46.1%** |
| ALL APPS, graded + ungraded, any writer | 86,762 | 37,658 | 44.1% |

The numerator is fixed at 37,658 in every variant; only the denominator moves. **Always restrict to `source_key='prizepicks'` before measuring lane.**

**The two lane sources agree perfectly**, which is worth recording: joining the `grade_*` writer to `final_board_history` on `final_board_row_id` gives 32,463 goblin/goblin, 13,142 demon/demon, 2,332 neither/neither — **47,937 rows, zero disagreements**. The problem was never which source to trust.

**Nothing downstream changes.** The lane split, the bucket table, the eight-bucket audit and the PP Regular lane check were all computed from the board join, not from the 97.9% figure. The retraction of the +1298.7% standard-vs-goblin comparison stands unaltered.

Worked example of the duplication itself: Bryce Harper, `hits_runs_rbis/less/3.5`, 2026-08-18 — two rows, same `final_board_row_id`, same `prepared_row_id`, same hp 67.76, same outcome. One is `outcome_final|…` with `is_goblin=0`; the other is `grade_hitter_547180_hits_runs_rbis_3p5_less_gob_2026-08-18` with `is_goblin=1`, written 50 seconds later. Same leg, two lane labels.

**The correct method, verified:** join `score.prop_outcome_history` (restricted to `outcome_id LIKE 'outcome_final|%'`) to `score.final_board_history` on `final_board_row_id` — **98.6% join rate** — and take `is_goblin`/`is_demon` from the board. Doing so gives a structurally coherent lane split for the first time:

| Lane (authoritative) | legs | hit % | days |
|---|---|---|---|
| goblin | 29,647 | **73.3%** | 24 |
| standard | 3,236 | **54.6%** | 24 |
| demon | 8,078 | **34.6%** | 25 |

Goblin > standard > demon, exactly as the mechanism requires. The previous assignment had "standard" at 84.8% — above goblin — which is structurally impossible and was the tell.

**What this retracts:** the `HIGH_HIT_RATE_METHODOLOGY.md` §3 headline (`doubles/less/0.5` at "+1298.7% standard-lane vs −13.0% Goblin-lane, same leg, same hit rate") is not two market offerings priced differently — it is **one set of legs, duplicated across two lane labels, then priced with two different multipliers**. The "same hit rate" in that table (84.8 vs 85.0, 84.7 vs 84.9) is the duplication signature, not a finding. See the session-5 log entry.

### 🛑 SECOND DATA DEFECT FOUND 2026-08-21 (session 5) — demon `less` legs are corrupted on four specific days

Demon legs must hit well below 50% by construction. Measured by side and day on PrizePicks:

| Date | demon `less` n | demon `less` hit % | demon `more` n | demon `more` hit % |
|---|---|---|---|---|
| 08-03 / 08-04 | **0** | — | 334 / 320 | 12.0% / 15.9% |
| **2026-08-05** | 810 | **84.9%** | 218 | 11.9% |
| **2026-08-06** | 510 | **68.2%** | 258 | 12.0% |
| **2026-08-07** | 789 | **76.2%** | 264 | 13.3% |
| 08-08 → 08-10 | 28 / 34 / 86 | 28.6 / 47.1 / 43.0% | 266 / 283 / 540 | 10.2 / 11.0 / 14.8% |
| **2026-08-11** | 2,812 | **75.1%** | 569 | 9.8% |
| 08-12 → 08-14 | 640 / 231 / 310 | 40.3 / 34.2 / 41.9% | 488 / 448 / 247 | 8.2 / 10.5 / 9.7% |

The `more` side is stable at 8–16% throughout. Only the `less` complement side is affected, and only on **2026-08-05, 08-06, 08-07 and 08-11**. This is the "blanket Less→flip" mislabelling that `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` §4a records as fixed on 2026-08-12, now localised to exact dates and quantified.

**It propagates into `backtest.demon_full_history_dedup_v2`** (the designated TRUSTED table). Within that table, demon `less` runs 78.2% / 88.5% / 60.6% / 72.8% on those four days against 11.5–50% elsewhere.

**Consequence: 2026-08-11 is not a "legitimate outlier day". It is a corrupted day**, and Session 1's clearance of it ("normal batch count, not a data artifact") is retracted. Every Demon result that leans on 08-05/06/07/11 — which is all of them — is built on mislabelled legs. **Exclude those four days from all Demon analysis.**

### 🔬 ROOT-CAUSED 2026-08-21 (session 7) — it is a sign inversion in the less-side complement tag

Traced the same way the lineup and rounding bugs were, rather than left as a dated pattern.

**Step 1 — the grading is not the bug.** For every graded PrizePicks demon row with a recorded stat, 08-03 → 08-14, checked whether `outcome_hit` equals `(actual_stat_value < line_value)` for `less` and `(actual_stat_value > line_value)` for `more`:

| Date | rows | `less` consistent | `less` INCONSISTENT | `more` consistent | `more` INCONSISTENT |
|---|---|---|---|---|---|
| 08-05 | 1,028 | 810 | **0** | 218 | **0** |
| 08-07 | 1,053 | 789 | **0** | 264 | **0** |
| 08-11 | 3,381 | 2,812 | **0** | 569 | **0** |
| 08-13 | 679 | 231 | **0** | 448 | **0** |

**Zero inconsistencies on any day, either side, across 8,485 rows.** The outcomes are correctly graded and the hit rates are real. The lines are real too.

**Step 2 — the label is the bug, and it is inverted.** On clean days the `less`-side tag is monotone in line value: a `less` at 0.5 is hard (demon), a `less` at 2.5 or 3.5 is easy (goblin). `total_bases`, by line, counting distinct (player, prop, line) board keys:

| Date | line 0.5 → less=demon | line 0.5 → less=goblin | line 2.5 → less=demon | line 2.5 → less=goblin | line 3.5 → less=demon | line 3.5 → less=goblin |
|---|---|---|---|---|---|---|
| **08-13 (clean)** | **60** | 2 | 0 | **140** | 0 | **89** |
| **08-07 (affected)** | 1 | **10** | **66** | 0 | **13** | 0 |
| **08-11 (partial)** | 24 | 67 | 130 | 41 | 53 | 16 |

08-07 is the exact mirror image of 08-13. The whole-prop averages say the same thing — `total_bases` demon-`less` sits at avg line **2.68 / 2.38 / 2.40 / 2.18** on 08-05/06/07/11 and at **0.50–0.51** on every clean day, while goblin-`less` holds the high lines (2.17–2.54) on clean days and is empty or at 0.50 on affected days. `hits_runs_rbis` demon-`less`: 4.50 / 3.09 / 2.80 affected vs 0.75–0.93 clean. `singles`: 1.13 / 0.96 vs 0.50.

**Step 3 — scope and shape.** The `more` side is stable at 8–16% throughout and shows no inversion. Across all three dates and all three lines, `more=goblin & less=demon` and `more=demon & less=goblin` pairings number **zero** — each (player, prop, line) carries only one side on the board. So this is **a sign error in deriving the `less`-side complement tag from the line's position relative to the anchor, not a swap of a materialised pair.**

**Step 4 — boundary, and 08-12 is CLEAN.** The inversion ends after 08-11. 08-12's demon-`less` sits at avg line **0.51 (n=299)**, matching the clean steady state exactly. **Session 5's suspicion that 08-12 might be partially contaminated is resolved: it is not.** 08-11 is a *partial* inversion — both labels present at every line — consistent with a mid-day deploy or an overlapping batch reprocess.

**Step 5 — writer signature, exactly like the lineup case.** `source_variant_label` on `less` rows: **NULL on every row through 08-12**, then 69 rows on 08-13, then 3,555 from 08-14 onward. A writer generation boundary lands immediately after the inversion window, consistent with the documented 2026-08-12 "blanket Less→flip rule mislabeled 1,752 real legs" fix in `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` §4a.

**Step 6 — where the code is.** `alphadog-v2-score-final-board.js` only passes the flags through (`is_goblin: Number(rawRow.is_goblin || 0)…`, line 259), and its own comment at lines 282–284 states they "come straight from the verified `odds_type` + `allowed_wager_types` mechanism at raw ingestion". **The defect is upstream of the final-board worker, in score-prep / raw ingestion, and was fixed there on 2026-08-12.** No live change made or recommended here — the window is historical and already closed.

**Step 7 — whole-day exclusion is the correct remedy, not row-level salvage.** Relabelling only the rows whose line exceeds the clean-day demon-`less` ceiling would recover 42–61% of the affected rows, but the *remaining* below-ceiling rows on those days still hit **63.1–75.1%** against a clean-day demon-`less` rate of 34–42%. The contamination is not confined to the rows a line threshold can identify. **Drop 08-05, 08-06, 08-07 and 08-11 entirely; do not attempt row-level repair.**

| Date | demon-`less` rows | above clean ceiling | % | hit % above ceiling | hit % below ceiling |
|---|---|---|---|---|---|
| 08-05 | 563 | 342 | 60.7% | 89.5% | **75.1%** |
| 08-06 | 443 | 218 | 49.2% | 73.9% | **63.1%** |
| 08-07 | 634 | 340 | 53.6% | 80.9% | **68.4%** |
| 08-11 | 2,403 | 1,019 | 42.4% | 82.5% | **68.7%** |

### ❌ REFUTED 2026-08-21 (session 5) — Session 4's `lineup_slot` guidance is incomplete and silently drops 14 days

Session 4's rule was "use `lineup_slot`, not `batting_order_code`; `batting_order_code = lineup_slot × 100`." That is true where both exist, but `lineup_slot` itself carries **two encodings**:

| Window | `lineup_slot` values | rows per slot |
|---|---|---|
| Outside 2026-08-05 → 2026-08-18 | **1–9** | 488 each |
| **2026-08-05 → 2026-08-18** | **100–900** | 158 each |

Any query filtering `lineup_slot BETWEEN 1 AND 9`, or bucketing slots 1–3 / 7–9, **silently drops the entire 08-05 → 08-18 window** (14 days, 1,422 rows) with no error and no NULLs. Verified: `WHERE lineup_slot BETWEEN 1 AND 4` returns exactly 0 rows on each of those 14 dates.

**Correct rule:** `slot = CASE WHEN lineup_slot >= 100 THEN lineup_slot/100 ELSE lineup_slot END`.

Session 4's Gen-1 bottom-of-order refutation should be re-run under the normalised slot before its "24 usable days" claim is trusted — its slot buckets would have excluded 08-05 → 08-18 entirely.

### ❌ REFUTED 2026-08-22 (session 2) — the Gen-1 bottom-of-order signal

With the join fixed, the "status unclear" bottom-of-order signal was re-tested at real scale for the first time. **It does not replicate — it runs the opposite direction.**

Raw, by batting slot, PrizePicks standard `less` legs (24 days):

| Prop | Slots 1-3 | Slots 4-6 | Slots 7-9 | Bottom − Top |
|---|---|---|---|---|
| `total_bases/less` (n=4,111) | 81.9% | 82.2% | 68.9% | **−13.0pp** |
| `hits/less` (n=1,814) | 83.3% | 78.6% | 59.5% | **−23.8pp** |
| `singles/less` (n=1,553) | 69.0% | 56.1% | 52.4% | **−16.6pp** |
| `hits_runs_rbis/less` (n=4,382) | 70.5% | 73.3% | 62.4% | −8.2pp |
| `rbis/less` (n=1,452) | 67.5% | 77.3% | 74.0% | +6.4pp |
| `runs/less` (n=1,425) | 60.1% | 72.0% | 63.9% | +3.7pp |

The documented Gen-1 claim was that hit rate *climbs* from 57% (leadoff) to 75–83% (bottom of order) on `total_bases<1.5`. Real data says the reverse.

**Roughly half the raw effect is a line-value confound** — top-of-order hitters get higher lines, and a "less 3.5" is far easier than a "less 1.5". Controlling for line value, a consistent residual remains, still negative:

| Prop | Line | Slots 1-3 | Slots 7-9 | Bottom − Top |
|---|---|---|---|---|
| `total_bases/less` | 1.5 | 72.2% | 65.5% | −6.7pp |
| `total_bases/less` | 2.5 | 85.2% | 81.3% | −4.0pp |
| `total_bases/less` | 3.5 | 91.0% | 84.8% | −6.2pp |
| `hits_runs_rbis/less` | 1.5 | 43.8% | 51.6% | +7.9pp |
| `hits_runs_rbis/less` | 2.5 | 72.3% | 72.3% | 0.0pp |
| `hits_runs_rbis/less` | 3.5 | 85.7% | 79.6% | −6.1pp |

**Bottom-of-order is genuinely worse for `total_bases/less` at every line tested.** `hits_runs_rbis` shows no consistent direction. The only genuinely positive pairings are `rbis/less` and `runs/less` (+6.4pp / +3.7pp), which is mechanically sensible — bottom-of-order hitters get fewer RBI and run opportunities, so the "less" side hits more often. **Move the Gen-1 bottom-of-order row out of "status unclear" and into the rejected table.**

---



| Signal | App | Real result | Why rejected |
|---|---|---|---|
| `runs+singles<0.5` | Demon | +296.7% ROI (looked promising) | Entirely driven by one outlier day (08-11); 7 of 8 real days were losses |
| Batting order position | Demon | Noisy, thin (samples of 1, 4, 4) | Demon legs concentrate on star/top-of-order players — structural scarcity of bottom-of-order demon legs |
| Batting order position | Underdog | Flat, no trend (63.4% at spot 1, 46.9% at spot 9 — opposite direction) | No exploitable pattern in the real per-spot data |
| Batting order position | Sleeper | Contradictory (spot 8: 61.9%, spot 9: 31.6%) | Noisy, too thin to trust |
| Umpire tendency stacked on bottom-of-order | PrizePicks Regular | ~2pp spread across samples of 83/107/103 | Real, but statistically indistinguishable from noise |
| Narrowing bottom-of-order to spot-9-only | PrizePicks Regular | 0/6 real wins (worse than the broader 7-9 pool's 3/6) | Best per-leg rate doesn't help if the pool is too thin to assemble winning 6-pick combinations |
| Leg-density/day-quality filtering | Demon (tested independently, twice, on two different signals) | Looked promising on small samples both times, then failed once more real data arrived | Confirmed pattern: this specific type of filter has failed real validation multiple times in this system's history — treat any future leg-density hypothesis with extra skepticism and demand a large real sample before trusting it |
| Correlation-control (max 1 leg/game) for Goblin | PrizePicks | Removing it slightly IMPROVED real backtest ROI at scale (no-cap config) | Real, counter-intuitive finding — worth re-testing periodically since it carries real tail risk (rainouts/blowouts affecting multiple same-game legs at once) that a backtest can't fully price |
| Same-game correlation for Goblin generally | PrizePicks | Weak real positive correlation (+1.05pp on a 73% base, n=1,276 pairs) | Real but negligible — not worth building a strategy around |
| Pitcher-dominance stacking (theory: opposing batters under-perform when a pitcher goblin-legs hits) | PrizePicks Goblin | Real but tiny: +0.43pp lift on 26,114 real pairs, vs. a Gemini-predicted +10.2pp | Directionally correct, real, but far too weak in practice to exploit |

---

## NEW REAL FINDINGS — 2026-08-22 coworker session (independently verified by me where noted)

- **Rounding-mode bug — VERIFIED REAL by direct testing.** Postgres `round()` on a `double precision` column uses banker's/round-half-to-even (0.5→0, 2.5→2); the live deployed system's JavaScript `Math.round()` uses round-half-up (0.5→1, 2.5→3). I tested this myself directly and confirmed it. `backtest.demon_full_history_dedup`'s `tier` column was `double precision`, meaning it silently used the wrong rounding convention on every X.5-distance leg — 940 of 6,488 rows (14.5%) were affected. **Rebuilt as `backtest.demon_full_history_dedup_v2` using `numeric` rounding (matches live `Math.round()`) — use this table going forward, not the original.** Note: my rebuild produced 3,351 rows vs. the coworker's own reconciled 3,155 — a small, unresolved discrepancy worth a future session checking, not yet fully explained.
- **Demon "Pool I"**: `pitcher_strikeouts` + `earned_runs`, both `/less`, tiers 1+2 combined — beats the single-prop deployed pool on every axis once corrected for the rounding bug: 13-14 real supporting days (vs. the deployed pool's 4 ex-08-11), LOO band +384.3% to +404.5%. **Real, credible, worth strong consideration for promotion — needs your explicit decision, not yet deployed.**
- **Underdog reconfirmed negative** by a second, independent research pass (35 configs swept, none positive, locked config worse than -34%) — converges with the flat-vs-compounding discount bug independently verified the session before. Two separate lines of evidence now agree this track is broken as deployed.
- **Sleeper cap=1 refinement**: nearly doubles the deployed pool's ROI (+198.8% at cap=3 → +382.7% at cap=1, real 27/27 real days) — real, credible, worth considering.
- **Hard rule, added after a real gap found**: any Goblin analysis MUST use the granular per-(prop,side,tier) `GOBLIN_LEG_MULT_TABLE` (see `MULTIPLIER_TABLES_MASTER.md`), never a single flat per-leg ratio. A 2026-08-22 research pass used a flat "0.620" ratio for its entire Goblin analysis, directly contradicting this document's own core lesson (multipliers are never flat) — that specific finding should be re-run with the granular table before being trusted.

### 1. Depth of simulation
Every real finding that held up in this session came from testing **at real scale, not a handful of examples**. Concrete real precedents to match or exceed:
- The 26-day Goblin backtest swept 24+ full cap/size configurations, each computed against the complete real leg-level dataset (tens of thousands of rows), not samples.
- The per-prop Goblin multiplier table required cross-referencing every real placed-slip observation across the ENTIRE session history, not just the most recent day.
- The Underdog signal was validated against 4,553 and 4,340 real graded outcomes — the standard to aim for, not the exception.

**A coworker session should run thousands of real simulated slip constructions per hypothesis** (every reasonable combination of cap × size × pool definition × correlation treatment), not a token handful, before drawing any conclusion. If a real database table has fewer rows than needed for this depth, say so honestly rather than pad the number of "simulations" with synthetic or estimated data.

### 2. Zero bias toward existing/locked logic
**This is a hard requirement, not a suggestion.** Every day's research session must approach the data with fully fresh eyes:
- Do NOT start from "the locked strategy already works, let's just confirm it." Actively try to find something DIFFERENT or BETTER, including approaches that would replace a currently-locked strategy entirely.
- Do NOT dismiss a new signal just because a superficially similar one failed before (see the rejected list above) — re-test with current, real data; conditions genuinely change day to day (real example: the pipeline's own real completeness has materially improved multiple times this session, changing what a real backtest can even see).
- Do NOT assume the current pool definitions (which props/sides/tiers are included) are correct or final — actively test alternative pool compositions, additions, and removals every session.
- When comparing a new idea against the locked strategy, use the SAME real rigor on both sides — don't hold the new idea to a higher bar than the one already deployed.

### 3. What counts as a genuinely new pass
A "pass" (see the 5-pass stopping rule in the master prompt) must involve testing something structurally different from prior passes that day — not re-running the same test with trivially different parameters. Genuinely different axes to explore include (non-exhaustive, and the coworker should invent more):
- Different prop/side/tier combinations not yet in the locked pool
- Different cap structures (fixed numbers AND percentages, at multiple values each)
- Different pick sizes across the full 2-8 range each app supports
- Correlation treatment (with vs without same-game/same-team restrictions)
- Multi-layer signals (stacking two real, independently-plausible factors — see the umpire+bottom-of-order example above for the RIGHT way to test this, including how to properly rule one out)
- Hybrid pools (mixing legs from genuinely different tiers or props within one slip vs. keeping pools single-prop)
- Shrink/expand adaptive sizing (build the largest size the day's real pool supports, falling back to smaller sizes only when necessary — see the real Python implementation pattern already used for bottom-of-order, reusable as a template)
- Different multiplier assumptions (test sensitivity: does the conclusion change materially if the real per-leg rate is 10-20% different from the current table's estimate? this identifies which findings are robust vs. fragile)
