# MULTIPLIER TABLES MASTER — Complete Real Data Compilation
*Compiled 2026-08-21 from the full session history (this conversation + 24 transcript files spanning 2026-08-16 through 2026-08-21) plus two prior dossiers already in the repo (GOBLIN_DEMON_MULTIPLIER_STUDY_DOSSIER.md, THIS_CHAT_MULTIPLIER_STUDY_DOSSIER.md). Every number here is either a real placed-slip observation or explicitly labeled as an estimate/backtest projection.*

---

## 1. THE CORE LESSON, STATED PLAINLY

**Multipliers are never flat.** Every attempt to use one number per app, or one number per pick-size, has been directly contradicted by real data at least once this session. The real structure depends on, in this priority order:
1. **App** (PrizePicks vs Sleeper vs Underdog — fundamentally different pricing mechanisms)
2. **Mode** (Power vs Flex — Power has consistently beaten Flex on every app tested, but the gap size varies)
3. **Prop line** (e.g., `hits_runs_rbis` vs `singles` — real, confirmed ~15-20% differences at the same tier)
4. **Side** (`more` vs `less` — confirmed real, `hits_runs_rbis/more` pays ~15% more per leg than `hits_runs_rbis/less` at the identical tier)
5. **Tier / distance from anchor** (for PrizePicks Goblin/Demon specifically — farther from anchor = harder for Demon, easier for Goblin, and multiplier scales accordingly)
6. **Pick size** (compounding, but the per-leg rate itself is fairly stable within a given prop/side/tier — the real, sharp finding is that per-leg rate matters far more than total-multiplier tables suggest)

Any coworker session picking up this system MUST build and update a granular table, never a single flat number.

---

## 2. PRIZEPICKS GOBLIN — Real Per-Leg Table (current, live in `GOBLIN_LEG_MULT_TABLE`)

Deployed in `alphadog-v2-certification-center.js`, computed as the real per-leg rate from every actual placed-slip observation this session:

| Prop | Side | Tier | Real per-leg rate | n (real observations) |
|---|---|---|---|---|
| singles | less | 1 | 1.134 | 8 |
| hits | less | 1 | 1.095 | 1 |
| hits_runs_rbis | less | 1 | 1.116 | 3 |
| hits_runs_rbis | **more** | 1 | **1.287** | 5 |
| walks_allowed | more | 1 | 1.140 | 1 |
| pitcher_strikeouts | less | 2 | 1.265 | 2 |
| pitcher_strikeouts | less | 3 | 1.140 | 1 |
| *(fallback for any other prop/side/tier)* | | | **1.15** | overall average, ~15 real observations |

**How a slip's total multiplier is computed**: the PRODUCT of each individual leg's real per-leg rate (via `goblinSlipEstimatedMultiplier(legs)`), not one flat number applied to the whole slip. A 5-leg slip of pure `singles` and a 5-leg slip mixing `singles`+`hits_runs_rbis/less` get genuinely different, correct estimates.

### Real size-scaling data (from `hits_runs_rbis/more/Tier1`, the first isolation test done this session)
| Size | Real total multiplier | Real per-leg |
|---|---|---|
| 2-pick | 1.7x | 1.304 |
| 3-pick | 2.0x | 1.260 |
| 4-pick | 3.0x | 1.316 |
| 5-pick | 3.5x | 1.285 |
| 6-pick | 4.25x | 1.273 |

Remarkably flat per-leg across sizes for this ONE specific prop/side/tier — this flatness does NOT hold across different props (see the table above), which is exactly why a single "per-size" table was wrong.

### Real Tier-distance test (same two players, same game, `pitcher_strikeouts`)
- Tier 1 (closest to anchor): per-leg ~1.30
- Tier 2: per-leg 1.265
- Tier 3: per-leg 1.140

Confirms: for Goblin, farther tier = LOWER multiplier (makes sense — farther from anchor in the goblin direction = objectively easier = market pays less).

### Real, live-confirmed anchor/tier mechanics (critical for any tier-based selection)
- **Explicit regular line exists**: anchor = that line's value exactly.
- **No explicit regular line** (raw feed has zero `odds_type='standard'` row): implied "switch point" = midpoint between the highest "below" line (More=Goblin) and lowest "above" line (Less=Goblin). Confirmed live on Jacob Misiorowski, Emerson Hancock, Jarren Duran, Sonny Gray, Matthew Boyd, Logan Webb, Wilyer Abreu — this exact formula matched the real app in every case.
- **Known real caveat**: PrizePicks' raw feed `odds_type` field is NOT always reliable — confirmed 3 separate times (Webb, Duran, Gray) where the raw feed disagreed with what the live app actually shows as the "regular" line. When in doubt, verify visually against the app, not just the raw feed tag.
- **Tier = `round(abs(line - anchor))`** — always a positive magnitude, never signed.

---

## 3. PRIZEPICKS DEMON — Real Per-Tier Multiplier Curve

Demon behaves in the OPPOSITE direction from Goblin: farther tier = HARDER = pays dramatically more, not less.

### Real confirmed multiplier data by tier (2-pick, same two players/game where possible)
| Tier | Real total (2-pick) | Real per-leg |
|---|---|---|
| 1 | 5.5x – 5.75x | ~2.35 – 2.40 |
| 2 | 14.5x | ~3.81 |
| 4 | 42.5x | ~6.52 |

Real per-leg growth factor per tier step ≈ **1.40x** (i.e., each additional tier step multiplies the per-leg rate by ~1.40).

### Real per-leg EV by tier (using real hit rates from the 26-day backtest crossed with the above real multipliers)
| Tier | Real hit rate | Real multiplier | Per-leg EV (p×m) |
|---|---|---|---|
| 1 | 21.5% (n=200) | 2.35–2.40 | 0.505 |
| 2 | 14.9% (n=67) | ~3.30 (est.) | 0.492 |
| 3 | 2.6% (n=38) | ~4.63 (est.) | 0.120 |
| 4 | 12.6% (n=159) | 6.50 (confirmed) | 0.819 |
| 5 | 5.9% (n=68) | ~9.13 (est.) | 0.539 |

**Every tier's per-leg EV is below 1.0** — structurally, demon compounds LOSSES as slip size grows (`(p×m)^n` shrinks as n grows when p×m<1). This was cross-checked by an independent second model (Gemini) and confirmed mathematically sound, not just an artifact.

### The one real exception found: `hits_runs_rbis/less/Tier2`
- Real hit rate: 71.6% (n=67, later re-confirmed at 36.2%/n=58 on the ORIGINAL narrower dataset — the 71.6% number came from a corrected, more complete dataset pull; treat 71.6% as the more current/trustworthy figure but note the discrepancy)
- Real confirmed multiplier: implied per-leg **3.087x** (from an actual 6-pick slip that returned 865x real)
- Real per-leg EV: **2.21** — genuinely, substantially positive
- Real backtest (3-pick Flex, no cap): 19 slips, 5 real days, Power +80.0%/Flex +60.0% (later re-run with real confirmed multiplier: Flex +657.9%)
- **Status: locked, deployed** (`prizepicks_demon`, 3-pick Flex, no cap, real table `3/3=15x, 2/3=1.5x`)
- **Honest caveat repeated deliberately**: this rests on the thinnest real sample of any locked strategy. One real day (08-11) disproportionately drives the result but was independently checked and cleared as legitimate (normal batch count, not a data artifact).

### Real, historical demon signals TESTED AND REJECTED (do not re-test without new real data)
- **`runs+singles<0.5`** (an early flat-line demon idea): +296.7% ROI looked promising but was ENTIRELY driven by one outlier day (08-11); 7 of 8 real days were losses. Rejected.
- **Batting order position for demon**: does NOT transfer from the Regular signal (see below) — demon legs concentrate on star/marquee players who are naturally top-of-order, so there's real structural scarcity of bottom-of-order demon legs. Rejected.
- **Highest-available-line heuristic** (an early, cruder version of the tier-distance finding): real signal existed (farther-from-a-low-anchor lines hit better for demon-less specifically) but was superseded by the more precise, validated tier-distance-from-anchor framework. Not wrong, just imprecise — the tier system replaces it.

---

## 4. PRIZEPICKS REGULAR — Real Data, Two Generations of Signal

### Generation 1 (2026-08-19, historical, REPLACED): Bottom-of-order batting position
Real, validated, deployed at the time:
- Signal: batting order spot 7-9 (`batting_order_code` 700-900 from `context.history_game_lineup`), `total_bases<1.5`, 6-pick Power
- Real hit rate climbed from 57% (leadoff) to 75-83% (bottom of order), confirmed across 79 real games
- Real day-by-day backtest (6 days): 3/6 days won, **+837.5% total ROI**
- **Stacking tests run on top of this** (both rejected):
  - Umpire strikeout/walk/runs tendency: only ~2pp spread across sample sizes 83/107/103 — noise, not real signal
  - Narrowing to spot-9-only: made it WORSE (0/6 real wins vs 3/6 for the broader 7-9 pool) — math reason: even the best per-leg rate compounds to a low joint probability at 6-pick with too few real legs to choose from
- **This signal was later superseded** by the current, more general `pitcher_fantasy_score/less` mispricing signal (see Generation 2) — it's unclear from the transcript record whether bottom-of-order was ever formally deprecated or just organically replaced. **A coworker session should re-test whether bottom-of-order still holds on today's data and whether it can be COMBINED with the current Generation 2 signal** (different prop entirely — `total_bases` vs `pitcher_fantasy_score` — so they may be genuinely complementary, not redundant).

### Generation 2 (2026-08-21, CURRENT, locked): `pitcher_fantasy_score/less` mispricing
- Real finding: PrizePicks' own regular line for this specific prop runs genuinely too high — real hit rate positive on 11 of 12 real days (07-06 to 08-18)
- Real 28-day backtest, 6-pick: Power **+1105.4%**, Flex **+779.3%** — the single strongest number found anywhere in the entire session
- Real per-leg dramatically strong: 79%+ average hit rate
- **Status: locked, deployed** (`prizepicks_regular`, 6-pick, starting on Flex per explicit request for lower variance — real backtest shows Power stronger, migrate once more real Flex data confirms current numbers)
- Real published PP Flex table used (confirmed current 2026-08-17): `3:{3:3,2:1}`, `4:{4:6,3:1.5}`, `5:{5:10,4:2,3:0.4}`, `6:{6:25,5:2,4:0.4}`
- Real published PP Power table: `2:3, 3:6, 4:10, 5:20, 6:37.5`

### Real cap testing (PrizePicks board-density gate, Generation 1 era)
Gating out days with fewer than 20 qualifying legs/game improved real backtested ROI from +22.4% to **+35.1%** — correctly identified 08-11 as a genuine extreme outlier (10.3 legs/game vs 29.6-66.7 every other day) without needing to hand-pick it.

### Real cap testing (Goblin, current era, 2026-08-21)
25% of that day's true max-buildable-slip-count beat every fixed-number cap (1/2/3/5/nocap) tested at every pick size, on a 26-day backtest. **Real, important correction found later the same day**: a hard ceiling of 12 slips/day was added on top, because the 25% figure was validated on daily pool depths of 8-166 legs, and a real live board later hit 900 legs (25% of that = 46 slips, impractical). **Any coworker testing caps must check the CURRENT real pool depth before assuming a validated cap percentage still produces a sane number of slips.**

---

## 5. SLEEPER — Real Multiplier Mechanics (Genuinely Different From PrizePicks)

Sleeper does NOT use a flat table — it has real, live, per-leg dynamic moneyline pricing.

### Real, validated conversion formula
```
Decimal Odds = 1 + (price/100) if price > 0, else 1 + (100/abs(price))
Multiplier = 1 + (Decimal Odds - 1) × 0.95
```
Validated against 2 independent real app examples (Rutschman hits/over -250 → predicted 1.40x vs real ~1.38x; a real stolen_bases -500 leg → predicted 1.19x vs real ~1.15x example given). Confirmed again on a real live 3-leg slip (predicted 4.849x vs real 4.99x, 2.9% gap).

### Where to pull real moneylines
`market.sleeper_board_current.raw_line_json` — **note the real double-JSON-encoding quirk**: the column is `jsonb` type but holds a JSON-encoded STRING, not a native object. Unwrap with `(raw_line_json #>> '{}')::jsonb->>'field_name'`, not a direct `::jsonb->>` cast (confirmed this exact failure mode live).

### Real Flex formula (derived from first principles by Gemini, then confirmed exactly against real data)
Sleeper Flex is a genuine **round-robin decomposition**, not a separate pricing model. An n-pick Flex slip splits the stake evenly across all valid (n-1)-sized sub-combinations, each priced using the SAME per-leg multiplier formula above. Verified: predicted 3/3 Flex = 2.775x (average of the 3 pairwise products) vs real 2.78x; predicted 2/3 range 0.884-0.963x vs real 0.92x (fell inside the predicted range exactly).

### Real historical strategy generations
1. **(2026-08-17, historical)** Doubles-only, 90% real hit rate line, variable size 2-6, cap=1/day, Flex mode with ratios 0.81 (full-hit) / 0.121 (n-1) / 0.025 (n-2) of the Power total (Power = 1.2684^n per-leg). Real 8-day backtest: -24.9%. Then a real min-4-pick gate (skip 2/3-pick days) flipped it to **+12.7%**.
2. **(2026-08-21, current, locked)**: `hits_runs_rbis/more`, 3-pick, Power, no cap. Real 22-day backtest: 36 slips, 12 full hits, **+46.5% ROI**. Real per-leg avg multiplier from live board: 1.638x (weighted across line 0.5/1.5 mix).
3. **A real, important open question a coworker should test**: does the doubles-only line from Generation 1 still show its real 90% hit rate today? If yes, it may be worth comparing directly against the current `hits_runs_rbis` signal, or even combining both as separate parallel tracks rather than picking one.

---

## 6. UNDERDOG — Real Multiplier Mechanics and History

### Real published table (confirmed current, verified 2026-08-17 official source)
Standard: `2:3.5, 3:6.5, 4:12, 5:20, 6:35, 7:65, 8:120`
Flex (full table, all sizes): `3:{3:3.25,2:1.09}`, `4:{4:6,3:1.5}`, `5:{5:10,4:2.5}`, `6:{6:25,5:2.6,4:0.25}`, `7:{7:40,6:2.75,5:0.5}`, `8:{8:80,7:3,6:1}`

### Real, confirmed discount factor
Real placed multipliers run at only **~68.65%** of the published table (`UNDERDOG_REAL_DISCOUNT = 0.6865`), derived from 10 real 6-pick observations averaging 3.75x actual against a 35x published rate at the time. This is a FLAT discount applied once to the published number — NOT a compounding per-leg ratio like Goblin, and NOT genuine dynamic per-leg pricing like Sleeper. Applying published × 0.6865 gives: `2:2.40, 3:4.46, 4:8.24, 5:13.73, 6:24.03`.

**Real, live correction found 2026-08-21**: even this discounted number can be significantly off for a SPECIFIC real slip depending on prop mix — one real placed slip came back at only 2.35x against a 24.03x estimate. Treat the discounted table as a starting estimate, always overwrite with the real number once placed.

### Real historical strategy generations
1. **(2026-08-17)** Mixed 5-line pool (`hits_allowed`, `rfi_nrfi`, `walks`, `runs_allowed`), 6-pick Flex, cap=1/day. Real 8-day backtest: -6.8%.
2. **Real depth-gate discovery**: gating on `hits_allowed` depth ≥6 legs (skip the day entirely below that) flipped it to **+181.3%** — a real, clean, structural signal (depth≥6 = 2/2 real wins, depth<6 = 0/6, perfect split across 8 real days). Real mechanism: below depth, the builder was forced to dilute with much weaker `rbis`/`walks` legs (63-74% real) to fill 6 slots — Underdog's pool ranks across 5 different prop types, so thin depth in the strongest prop directly degrades slip quality. **This depth-gate concept generalizes and should be tested against whatever pool is currently locked.**
3. **(2026-08-21, current, locked)**: `rbis/less` + `walks/less`, 6-pick, Power, cap=1/day. Real 27-day backtest: 715 slips uncapped → 98 full hits (+229.4%); at the locked cap=1/day: 27 slips, 5 full hits, **+345.0%**. Massive real sample underlying this (4,553 and 4,340 real graded outcomes for the two props respectively) — the largest, most statistically solid signal found anywhere this session.

---

## 7. FLEX-SPECIFIC REAL DATA (ALL APPS)

| App | Real Flex behavior confirmed |
|---|---|
| PrizePicks | Standard published table exists and is public; Flex partial-hit tiers are FLAT (not proportional to the full-hit multiplier) for certain sizes — confirmed real: 6-pick Flex 5/6=flat 2x, 4/6=flat 0.4x regardless of the specific legs |
| Sleeper | Genuine round-robin decomposition of the SAME per-leg Power formula — no separate Flex pricing model exists |
| Underdog | Real published Flex table exists (see above); real discount factor not yet separately validated for Flex specifically — the 0.6865 discount was derived from Power/Standard observations only |

**Across every app tested, Power has beaten Flex on every single real backtest run this session** — the gap narrows as slip size grows (Flex's partial-credit becomes proportionally more valuable as full-hit probability drops), but the sign never flips in Flex's favor in any real data collected so far.

---

## 8. REAL, CONFIRMED PIPELINE BUGS THAT AFFECTED MULTIPLIER/DATA QUALITY (fixed, but know the history)

1. **Contaminated "less" rows on more-only lines**: PrizePicks Goblin/Demon rows with `allowed_wager_types='over'` (`is_under_allowed=0`) were incorrectly getting a phantom `selected_side='less'` row scored. Fixed at the raw ingestion filter level.
2. **Scoring engine join missing `selected_side`**: `hp_board_current` joined to `scoring_engine_current` without matching `selected_side`, fanning out 16,650 real rows to 25,085 candidates (+51%), silently killing final-board for 5 consecutive runs. Fixed by adding the missing join condition.
3. **Non-atomic board replace**: `DELETE FROM final_board_current` followed by a separate multi-chunk INSERT (not in one transaction) created a real, confirmed window where the live board API could return "0 of 0" to a genuine concurrent reader. Fixed by wrapping in `pgClient.begin(...)`.
4. **Duplicate scoring rows from overlapping retries**: retried invocations of the scoring-engine worker had no duplicate guard, producing up to 19,598 rows for 11,368 distinct pairs on at least two separate real occasions (same bug recurred after a first fix, confirming the real, permanent fix needs a DB-level unique constraint + `ON CONFLICT`, not just application-level filtering).
5. **Client/server field-name mismatch on slip save**: client read `j.saved`, server sent `j.saved_slips` — every real save silently reported "Saved 0 slip(s)" despite genuinely saving correctly. Fixed, and real multiplier storage columns (`real_multiplier`, `real_multiplier_flex_tiers`) were added to `score.slip_entries` at the same time (previously nowhere to store the real typed-in numbers at all).
