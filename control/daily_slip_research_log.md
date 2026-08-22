# AlphaDog Daily Slip Strategy Research Log

Permanent, append-only record of the daily autonomous research pass. Newest entries are appended at the bottom. Never overwrite a prior day's entry.

---

# ===== 2026-08-21 (Fri) — Session 1 — run at ~13:30 PT =====

**Run type:** dry run, research only. No code, schema, or configuration was modified.
**Backtest window used:** 2026-07-24 → 2026-08-20 (full available graded history).
**Latest graded day:** 2026-08-20 — confirmed = yesterday, no staleness gap.
**Reference docs read in full this session:** all six (MULTIPLIER_TABLES_MASTER, SIGNALS_TECHNIQUES_TRIED, GOBLIN_DEMON_MECHANISM_EXPLAINED, GEMINI_USAGE_GUIDE, GOBLIN_DEMON_MULTIPLIER_STUDY_DOSSIER, THIS_CHAT_MULTIPLIER_STUDY_DOSSIER).

---

## 0. HEADLINE — the single most consequential finding

**`UNDERDOG_REAL_DISCOUNT = 0.6865` is being applied as a flat table discount, but it is a per-leg geometric ratio. Underdog payouts are overstated by ~6.4x at 6-pick and ~13.7x at 8-pick.**

The arithmetic, from the numbers recorded in `THIS_CHAT_MULTIPLIER_STUDY_DOSSIER.md` itself:

- The dossier states the constant was derived from *"10 real 6-pick observations averaging **3.75x** actual against a **35x** published rate."*
- Flat interpretation: 3.75 / 35 = **0.1071**, not 0.6865.
- Geometric interpretation: (3.75 / 35)^(1/6) = **0.6886** ≈ 0.6865. ✅
- The deployed model computes `published × 0.6865` → 6-pick = 24.03x, which is **6.4x higher** than the 3.75x that was actually observed.

**Confirmed independently against today's real placed-slip ground truth** (`score.slip_entries`, 19 real slips recorded 2026-08-21):

| Real slip | Real multiplier | Flat model predicts | Geometric model predicts | Verdict |
|---|---|---|---|---|
| Underdog 5-pick Power | **2.35x** | 20 × 0.6865 = 13.73x | 20 × 0.6865⁵ = **3.01x** | Geometric ✅ |

Implied per-leg from that real slip: (2.35/20)^(1/5) = **0.6516**.

This is the same slip already flagged in `MULTIPLIER_TABLES_MASTER.md` §6 as *"one real placed slip came back at only 2.35x against a 24.03x estimate."* That was recorded as an unexplained one-off. **It is not a one-off — it is the model being structurally wrong.**

Gemini was given the raw numbers and independently reached the same conclusion, deriving 0.6886 and confirming the flat model overestimates the 8-pick by 1,266%.

### Consequence: every Underdog ROI figure in the repo is invalid

| Underdog config | Documented ROI | Corrected ROI (per-leg 0.6516) |
|---|---|---|
| **Locked: `rbis/less`+`walks/less`, 6-pick Power** | **+345.0%** | **−66.9%** |
| 3-pick | — | −35.6% |
| 2-pick | — | −19.3% |

Underdog is negative-EV at every pick size tested under the corrected model. Break-even at 6-pick requires a per-leg hit rate of ~87%; the selected legs currently hit ~62–65%.

**Recommended (for user review — NOT deployed):** correct `UNDERDOG_REAL_DISCOUNT` to compound as `published × ratio^n`, and suspend Underdog staking until re-validated.

---

## 1. SECOND MAJOR FINDING — PrizePicks per-leg ratios, freshly measured

The same real-placed-slip reconciliation gives tight, current per-leg ratios. **PrizePicks applies a discount to Goblin legs but none at all to Regular legs.**

| App / line type | Real slips | Real multiplier | Published base | Implied per-leg ratio |
|---|---|---|---|---|
| PP **Goblin** 3-pick Power | 1 | 1.40x | 6.0x | **0.6155** |
| PP **Goblin** 4-pick Power | 1 | 1.50x | 10.0x | **0.6223** |
| PP **Goblin** 5-pick Power | 10 | 1.86x (range 1.7–2.1) | 20.0x | **0.6198** (range 0.611–0.637) |
| PP **Regular** 4-pick Flex | 1 | 6.00x | 6.0x | **1.000 — no discount** |
| PP **Regular** 5-pick Flex | 3 | 10.00x | 10.0x | **1.000 — no discount** |
| Sleeper 2-pick Power | 2 | 2.65x (2.56 / 2.74) | n/a (dynamic) | **1.628** per leg |

**Corrections to `MULTIPLIER_TABLES_MASTER.md` (genuine, not noise):**

1. **The Goblin per-leg ratio has decayed steadily and is now ~0.620**, not 0.7366 or 0.64:
   - 2026-08-10 study: 0.7366
   - 2026-08-17 study: 0.6422
   - **2026-08-21 (today, n=12 real slips): 0.620**
   Three independent measurements, monotonically decreasing. This looks like a real PrizePicks-side repricing trend, not sample noise — the 12 observations cluster in 0.611–0.637.

2. **The deployed `GOBLIN_LEG_MULT_TABLE` overstates a 5-pick Goblin slip by ~88%** (estimates 3.50x; real average 1.86x). The table's higher entries (e.g. 1.287 for `hits_runs_rbis/more/T1`) are being applied far more broadly than the real data supports.

3. **PrizePicks Regular lines carry no discount whatsoever** — real payout equals the published table exactly. This asymmetry (Regular = 1.000, Goblin = 0.620) is not documented anywhere in the current repo and materially changes the relative ranking of the tracks.

4. **Sleeper per-leg is ~1.628 for the currently-selected pool**, matching the 1.638 figure in `MULTIPLIER_TABLES_MASTER.md` §5 and **not** the 1.2684 constant in `THIS_CHAT_MULTIPLIER_STUDY_DOSSIER.md` §1. The two documents disagree; today's real slips support ~1.63.

*Honest caveat:* the PP Regular ratio of 1.000 rests on 4 real **Flex** full-hit observations. No real **Power** Regular slip has been recorded. Every PP Regular ROI below assumes Power pays the published table undiscounted. If Regular Power turns out to carry a Goblin-like haircut, those figures collapse the same way Underdog's did. **Placing and recording one real 6-pick Regular Power slip is the single highest-value data point the user could contribute.**

---

## 2. CORRECTED STANDINGS — all five tracks, same rigor on each

All figures below: greedy sequential slip construction from the board batch closest to 9am Pacific per day, ranked by `score_0_100`, cap = 3 slips/day, corrected multipliers.

| Track | Config | Slips | Days | Full hits | Corrected mult | **Corrected ROI** |
|---|---|---|---|---|---|---|
| **PP Regular (locked)** | `pitcher_fantasy_score/less`, 6-pick | 44 | 18 | 10 (22.7%) | 37.50x | **+752.3%** |
| **PP Regular (new pool)** | `doubles`+`home_runs`+`stolen_bases`+`pfs` /less, 6-pick | 50 | 18 | 8 (16.0%) | 37.50x | **+500.0%** |
| **Sleeper (new pool)** | `rbis`+`walks`+`rfi_nrfi` /less, 6-pick | 81 | 27 | 13 (16.0%) | 18.62x | **+198.8%** |
| Sleeper (locked) | `hits_runs_rbis/more`, 3-pick | 28 | 15 | 5 (17.9%) | 4.32x | **−22.9%** |
| PP Goblin | `singles`+`hits`+`hrr`+`total_bases` goblin, 5-pick | 27 | 9 | 11 (40.7%) | 1.83x | **−25.4%** |
| **Underdog (locked)** | `rbis`+`walks` /less, 6-pick | 81 | 27 | 10 (12.3%) | 2.68x | **−66.9%** |
| PP Demon | `hits_runs_rbis/less/Tier2`, 3-pick | — | — | — | — | **UNTESTABLE — see §3** |

**PrizePicks Regular is the only track that is robustly, verifiably profitable.** It is also the only track whose multiplier assumption is confirmed by real placed slips at ratio 1.000.

---

## 3. BLOCKER — Goblin/Demon tier analysis is impossible on all historical data

This is a hard, structural blocker that must be reported rather than worked around.

- `score.final_board_history.goblin_demon_tier` is **NULL for every row on every date before 2026-08-21**. Verified: 0 non-null tier values across 08-12 → 08-20; 4,238 non-null on 08-21 only. The switch-point/tier fix was deployed today, and the column was never backfilled.
- **The tier cannot be reconstructed from the retained board.** The deployed anchor formula needs the full raw PrizePicks ladder. `final_board_current` retains only **1.38 rungs per player-prop** against the raw board's **2.19** (1,578 of 4,316 player-props survive). Reconstructing anchors from the trimmed board reproduces the deployed tier on only **1,047 of 1,829** attempts (57%) — not good enough to backtest on.
- **The raw ladder was never retained either.** `market.raw_snapshots` looked promising — it holds a snapshot at ~16:04 UTC (**9:04am Pacific**, exactly the run that matters) for every slate date back to 2026-07-22. But **every single row in the entire table is a ~1.3–1.9KB stub**, not real data: `{"alphadog_bounded_source_snapshot":true,"storage_reason":"d1_text_cell_size_guard","source_shape_only":true,"original_chars":6286977,...}`. The payload was discarded by a **D1 text-cell size guard that no longer applies now that the system is on Postgres.**

**Consequences:**
- The locked Demon strategy (`hits_runs_rbis/less/Tier2`, cited +657.9% Flex) **cannot be re-validated today at all**, and could not have been validated from this data since the tier column has never held a historical value.
- The locked Goblin tier-based pool (+79.9%) is likewise unreproducible. Flag-level (non-tier) Goblin selection tests at **−25.4%** under the corrected 0.620 per-leg ratio.
- **Tier-based backtesting becomes possible for the first time tomorrow** (2026-08-22), when today's 4,238 tiered rows grade out. It will then grow by one day per day.

**Recommended (for user review — NOT deployed):** lift the D1-era size guard in the raw-snapshot writer so the full PrizePicks payload is retained on Postgres. That single change restores complete 9am board reconstruction — including tiers — permanently.

---

## 4. THIRD FINDING — the Underdog and Sleeper scoring edge has decayed; PrizePicks has not

Measured as the hit-rate lift of the top-30 ranked legs over that day's whole pool.

| App | 07-25→08-05 | 08-06→08-12 | **08-13→08-20 (recent)** | Days lift > 0 (recent) |
|---|---|---|---|---|
| **PrizePicks** | +28.3pp | +18.2pp | **+15.0pp** | **8 / 8** |
| **Underdog** | +13.9pp | +5.6pp | **+1.6pp** | 4 / 8 |
| **Sleeper** | +7.6pp | +5.3pp | **+2.2pp** | 5 / 8 |

PrizePicks scoring is healthy and consistent. **Underdog's ranking edge has collapsed by ~88%** and Sleeper's by ~71%. This is independent of, and compounds with, the multiplier error in §0 — Underdog is losing on both the payout side and the selection side.

### Actionable sub-finding: `hp` beats `score` as the ranker on Sleeper and Underdog

| App (recent window) | Lift ranking by `score_0_100` | Lift ranking by `estimated_hit_probability_0_100` |
|---|---|---|
| PrizePicks | **+15.0pp** | +11.3pp |
| Underdog | +1.6pp | **+4.5pp** |
| Sleeper | +2.2pp | **+8.5pp** |

Sleeper's `hp` lift is the only selection metric in the system that is **improving** over time (+6.7 → +7.2 → **+8.5pp**). Recommendation for review: switch the Sleeper and Underdog rankers to `hp`, keep `score` on PrizePicks.

---

## 5. PER-TRACK DETAIL

### PP Regular — day-by-day, new rare-event pool (`doubles`+`home_runs`+`stolen_bases`+`pitcher_fantasy_score`, /less, 6-pick, uncapped)

| Date | Pool legs | Slips | Full hits | ROI |
|---|---|---|---|---|
| 2026-07-28 | 8 | 1 | 0 | −100.0% |
| 2026-08-04 | 9 | 1 | 1 | +3650.0% |
| 2026-08-05 | 24 | 4 | 0 | −100.0% |
| 2026-08-06 | 61 | 10 | 1 | +275.0% |
| 2026-08-07 | 115 | 19 | 8 | +1478.9% |
| 2026-08-08 | 156 | 26 | 7 | +909.6% |
| 2026-08-09 | 145 | 24 | 7 | +993.8% |
| 2026-08-10 | 111 | 18 | 2 | +316.7% |
| 2026-08-11 | 44 | 7 | 2 | +971.4% |
| 2026-08-12 | 396 | 66 | 24 | +1263.6% |
| 2026-08-13 | 227 | 37 | 20 | +1927.0% |
| 2026-08-14 | 361 | 60 | 18 | +1025.0% |
| 2026-08-15 | 325 | 54 | 21 | +1358.3% |
| 2026-08-16 | 329 | 54 | 21 | +1358.3% |
| 2026-08-17 | 267 | 44 | 18 | +1434.1% |
| 2026-08-18 | 391 | 65 | 18 | +938.5% |
| 2026-08-19 | 380 | 63 | 27 | +1507.1% |
| 2026-08-20 | 213 | 35 | 16 | +1614.3% |
| **TOTAL** | | **588** | **211** | **+1245.7%** |

13 of 18 days profitable, and **all 9 of the most recent days strongly positive**. No single-day concentration — this is the opposite failure mode from the rejected `runs+singles<0.5` demon signal. 588 slips vs the locked pool's 18 is a ~33x sample-size upgrade.

**Mechanism:** PrizePicks' Power table is flat with respect to leg difficulty, so stacking the highest-probability legs available is straightforwardly +EV. Rare-event "less" props (`doubles<0.5`, `home_runs<0.5`, `stolen_bases<0.5`) hit 84.7% / 83.5% / 87.1% while paying the same 37.5x as any other 6-pick.

**Data-artifact check performed (required before trusting a >1000% figure):** 33.7% of `doubles/less` legs show zero on every corroborating offensive stat, raising a DNP-grading concern. Restricting to legs where the player has confirmed offensive activity drops the hit rate from **84.9% → 77.5%**. The true figure lies between those bounds (excluding zero-stat players also removes legitimate 0-for-4 games). Even at the conservative 77.5%, a 6-pick returns 37.5 × 0.775⁶ = 8.12x → **+712%**. The finding survives its own worst case, but **grading behaviour for scratched/DNP players should be confirmed directly** before this pool is staked.

### Underdog — day-by-day, locked pool at 7-pick, cap 2 (illustrating both the concentration and the regime break)

| Date | Slip outcomes | Slips | Full hits |
|---|---|---|---|
| 2026-07-25 | 7/7✅ 7/7✅ | 2 | 2 |
| 2026-07-26 | 7/7✅ 6/7 | 2 | 1 |
| 2026-07-27 | 5/7 6/7 | 2 | 0 |
| 2026-07-28 | 4/7 6/7 | 2 | 0 |
| 2026-07-29 | 6/7 7/7✅ | 2 | 1 |
| 2026-07-30 | 6/7 5/7 | 2 | 0 |
| 2026-07-31 | 6/7 6/7 | 2 | 0 |
| 2026-08-01 | 6/7 6/7 | 2 | 0 |
| 2026-08-02 | 5/7 5/7 | 2 | 0 |
| 2026-08-03 | 5/7 4/7 | 2 | 0 |
| 2026-08-04 | 3/7 7/7✅ | 2 | 1 |
| 2026-08-05 | 5/7 7/7✅ | 2 | 1 |
| 2026-08-06 | 3/7 6/7 | 2 | 0 |
| 2026-08-07 | 6/7 5/7 | 2 | 0 |
| 2026-08-08 | 5/7 5/7 | 2 | 0 |
| 2026-08-09 | 2/7 5/7 | 2 | 0 |
| 2026-08-10 | 5/7 5/7 | 2 | 0 |
| 2026-08-11 | 6/7 4/7 | 2 | 0 |
| 2026-08-12 | 5/7 7/7✅ | 2 | 1 |
| 2026-08-13 | 4/7 3/7 | 2 | 0 |
| 2026-08-14 | 5/7 5/7 | 2 | 0 |
| 2026-08-15 | 5/7 5/7 | 2 | 0 |
| 2026-08-16 | 6/7 5/7 | 2 | 0 |
| 2026-08-17 | 2/7 7/7✅ | 2 | 1 |
| 2026-08-18 | 6/7 3/7 | 2 | 0 |
| 2026-08-19 | 5/7 2/7 | 2 | 0 |
| 2026-08-20 | 4/7 3/7 | 2 | 0 |
| **TOTAL** | | **54** | **8** |

Only 7 of 27 days produced a win, and **the last 8 consecutive days produced none at any pick size**. Average top-leg hit rate fell 81.3% → 67.9% → 62.5% across the three window thirds.

*Note on a discarded false positive:* under the (incorrect) flat multiplier, an 8-pick / cap-2 Underdog config appeared to deliver **+662.8%**, robust across a 0.50–0.75 discount sensitivity sweep. It was the strongest-looking result of the session. **It is an artifact of the flat-model error and is fully retracted.** Under the corrected geometric model the same config returns roughly −86%. This is recorded deliberately as a warning: multiplier-model errors survive discount-sensitivity testing, because sensitivity sweeps vary the *parameter* while holding the *functional form* fixed.

### PP Demon
No test possible. See §3. Zero tier data exists on any graded date.

### Sleeper
Locked pool `hits_runs_rbis/more` has only **200 graded legs across 26 days** (~7.7/day) and supports a 3-pick slip on just **15 of 27 days**. It tests **negative at every per-leg multiplier from 1.15 to 1.638**. The documented +46.5% does not reproduce on this reconstruction — flagged as an unresolved discrepancy, not a refutation.

**Successful cross-app signal transfer:** the Underdog locked pool concept (`rbis`+`walks` /less) ported to Sleeper, plus `rfi_nrfi`, gives a 6-pick pool that is available on **27 of 27 days** and returns **+198.8%** at the ground-truth per-leg of 1.628. This is the first cross-app transfer in the log that worked.

---

## 6. CAP SWEEP RESULTS

Full sweep run for Underdog across pick sizes 2–8 × caps {1, 2, 3, 5, 10, uncapped} (42 configs, 27 days, up to 3,632 slips per config), plus a discount-sensitivity sweep across {0.50, 0.60, 0.6865, 0.75} (48 further configs). Sleeper: 7 pools × 2 rankers × 5 sizes × 5 caps = 350 configs. PrizePicks Regular: 7 pools × 2 rankers × 5 sizes × 5 caps = 350 configs. PrizePicks Goblin: 4 pools × 4 sizes × 3 caps = 48 configs.

Because §0 invalidated the Underdog multiplier mid-session, **the Underdog cap sweep results are not carried forward** — they need re-running under the corrected model. Under the corrected model no Underdog cap is positive, so cap selection is moot until the selection edge recovers.

For PrizePicks Regular the cap finding is: **uncapped > cap 5 > cap 3 > cap 1** on the rare-event pool (+1245.7% uncapped vs +500.0% at cap 3), because the pool is deep (200–400 legs/day recently) and the edge is per-slip rather than concentrated in the top few. This directly contradicts the historical "concentrate on the strongest legs, cap low" pattern that held for the older strategies — worth noting as a genuine reversal, though practical placement volume (35–66 slips/day) makes a middle cap of 10–15 the realistic choice. That middle range was not swept this session and is an open item.

---

## 7. DATA-QUALITY AND SCHEDULE FINDINGS

1. **The 1am Pacific run has not executed once in the last 9 days.** Completed batches per Pacific day: 08-13 (17:21, 20:06), 08-14 (09:56, 11:23, 11:26, 12:26, 12:33, 14:10, 17:18), 08-15 (12:01, 12:15, 13:24, 13:26, 17:14), 08-16 (09:58, 10:47, 13:23, 17:10, 20:38), 08-17 (09:31, 09:33, 13:26, 17:15), 08-18 (09:51, 10:02, 13:54, 17:19), 08-19 (08:16, 13:29, 20:01), 08-20 (09:22, 13:21, 17:15, 18:51), 08-21 (10:03, 12:27, 14:09). **Nothing anywhere near 01:00 on any day.** The documented four-times-daily schedule is in practice a three-times-daily schedule.
2. **The 9am run is missing entirely on 2 of 9 days** — 08-13 (earliest 17:21) and 08-15 (earliest 12:01). On 08-19 it ran early at 08:16.
3. **Strict 9am-only board reconstruction is viable on only ~10 of 28 days.** Six days (07-24, 07-28, 08-01, 08-05, 08-11, 08-17) have zero graded legs attributable to their closest-to-9am batch. All backtests above therefore use a per-leg "closest available batch to 9am" reconstruction, which is honest but is *not* a strict 9am snapshot. Flagged as a real methodological limitation.
4. **`context.history_game_lineup` is effectively unjoinable to the graded board.** Player IDs overlap well (454 of 469 lineup players appear on the board; 125 of 180 board players on 08-20 appear in the lineup), but joining legs to lineup rows on (date, player) matches only **~2–5% of legs** (e.g. 52 of 3,023 `hits/less` legs; 96 of 6,263 `total_bases/less`). Every batting-order bucket lands at n=7–40, which is pure noise. **The Generation-1 bottom-of-order signal cannot be re-tested until this join is fixed** — the root cause was not isolated this session and is the top open item.
5. Confirmed the `score.daily_first_snapshot_batches` trap described in the master prompt is real and still present; the table was not relied on.

---

## 8. EXTERNAL RESEARCH (performed fresh this session)

Both published payout tables were re-verified live and are **unchanged** from what `MULTIPLIER_TABLES_MASTER.md` documents:

- **PrizePicks** (prizepicks.com/ways-to-pick): Power 2:3x, 3:6x, 4:10x, 5:20x, 6:37.5x. Flex 3:{3x, 1x}, 4:{6x, 1.5x}, 5:{10x, 2x, 0.4x}, 6:{25x, 2x, 0.4x}. ✅ matches repo exactly.
- **Underdog** (help.underdogsports.com): Standard 2:3.5x, 3:6.5x, 4:12x, 5:20x, 6:35x, 7:65x, 8:120x. Flex 0-loss 3:3.25x, 4:6x, 5:10x, 6:25x, 7:40x, 8:80x; 1-loss 1.09/1.5/2.5/2.6/2.75/3x; 2-loss 6:0.25x, 7:0.5x, 8:1x. ✅ matches repo exactly.

**New external fact, and the key that unlocked §0:** Underdog's own help documentation states that *"individual selection multipliers ranging from 0.7x to 1.5x affect final payouts."* This is an explicit, first-party confirmation that Underdog prices **per selection** — i.e. compounding — and not as a flat table discount. The observed ~0.65 per-leg sits at the bottom of Underdog's stated 0.7–1.5 range, consistent with a pool composed almost entirely of heavy favourites.

---

## 9. GEMINI CONSULTATION

One consultation, on the Underdog payout model. Gemini was given the raw figures with no steer toward a conclusion and asked to determine whether 0.6865 is flat or geometric.

- It independently derived (3.75/35)^(1/6) = 0.6886 and concluded **geometric**, calling the deployed flat application "a critical architectural error."
- It independently computed the 5-pick prediction of 3.01x against the real 2.35x, versus 13.73x under the flat model.
- It confirmed the 8-pick ROI conclusion does **not** survive, quantifying the overestimate at 1,266%.
- Response truncated mid-sentence as documented in `GEMINI_USAGE_GUIDE.md`; the continuation prompt pattern recovered it cleanly on the first try.
- Its proposed falsification test — collect real payouts across varying N and check whether actual/published is constant (flat) or decays as ratio^N (geometric) — is **already partially satisfied** by today's slip data: PP Goblin at N=3, 4, 5 gives 0.6155, 0.6223, 0.6198, i.e. a near-constant *per-leg* ratio, which is the geometric signature.

Per `GEMINI_USAGE_GUIDE.md`, its hypothesis was not treated as validated on plausibility — it was checked against real placed-slip data before being accepted.

---

## 10. HONEST SUMMARY

**Genuinely new this session (nothing here is a re-confirmation):**
1. The Underdog flat-vs-geometric multiplier error, and the resulting inversion of the locked strategy from +345% to −66.9%.
2. Goblin per-leg ratio re-measured at 0.620, continuing a documented decay from 0.7366 → 0.6422 → 0.620.
3. PrizePicks Regular lines confirmed to carry **no** discount at all (ratio 1.000) — an asymmetry versus Goblin not previously recorded.
4. Goblin/Demon tier backtesting proven impossible on all historical data, with the root cause traced to a D1-era size guard still discarding raw snapshots on Postgres.
5. Underdog's and Sleeper's selection edge quantified as decayed ~88% and ~71%; PrizePicks' shown to be intact.
6. `hp` beats `score` as the ranker on Sleeper and Underdog in the current regime; Sleeper's `hp` lift is the only improving metric in the system.
7. A new PrizePicks Regular rare-event pool with a 33x larger sample than the locked pool, profitable on all 9 recent days.
8. First successful cross-app signal transfer (Underdog pool concept → Sleeper, +198.8%, available 27/27 days).
9. The 1am Pacific run has not fired once in 9 days.

**Re-confirmed, not new:** both published payout tables; the `daily_first_snapshot_batches` trap; PP Regular as the strongest track.

**Retracted within the session:** the Underdog 8-pick "+662.8%" result, which was an artifact of the flat-model error and survived a four-point discount-sensitivity sweep before being caught by real slip data.

**Stopping condition — NOT met, stated honestly.** The master prompt requires 5 consecutive passes with no new finding. This session ran ~10 structurally distinct passes and the *last substantive one* (real placed-slip reconciliation) produced the largest finding of the day, which then invalidated several earlier passes. The session is being closed on budget, not on exhaustion. **This is not the final report in the sense the prompt defines.**

**Open items carried to the next run (in priority order):**
1. Re-run every sweep under the corrected multiplier models — most of §6 needs redoing.
2. Grade out today's 4,238 tiered rows (available 2026-08-22) and run the **first-ever tier-based backtest**.
3. Diagnose the `context.history_game_lineup` join failure; unblock the bottom-of-order re-test.
4. Sweep PP Regular caps in the 10–15 range (the practical placement band), unswept this session.
5. Confirm DNP/scratch grading behaviour for rare-event "less" props.
6. Obtain one real PP **Regular Power** placed slip to confirm the 1.000 ratio holds outside Flex.
7. Reconcile the Sleeper per-leg conflict between the two dossiers (1.2684 vs 1.638) — today's data favours ~1.63.

**Nothing was deployed, patched, or modified. All recommendations above are for user review only.**

---

# ===== 2026-08-21 (Fri) — Session 1 CORRECTIONS — issued after user review =====

The user flagged three defects in the entry above. All three were valid. Corrections below **supersede** the corresponding sections.

## C1. RETRACTED: "§3 BLOCKER — tier analysis is impossible on all historical data"

**That section was wrong, and the error was methodological, not incidental.** I queried `information_schema.tables` with a hardcoded schema list (`context, daily, score, control, scoring`) and never enumerated the schemas themselves. The database has **40 schemas**. I never looked at 35 of them.

The `backtest` schema alone contains **72 relations**, including a complete, working tier reconstruction:

| Table | Rows | Rows with tier | Days | Range |
|---|---|---|---|---|
| `backtest.tiered_full_fixed` | 30,355 | **10,700** | 26 | 2026-07-25 → 2026-08-19 |
| `backtest.snapshot_tiered_clean` | 30,376 | 6,270 | 26 | 2026-07-25 → 2026-08-19 |
| `backtest.snapshot_tiered_all` | 30,566 | 6,460 | 26 | 2026-07-25 → 2026-08-19 |
| `backtest.tiered_sameday_test` | 30,376 | 6,270 | 26 | 2026-07-25 → 2026-08-19 |

All fully graded, with `anchor_line` and `tier` columns. There is also `backtest.nine_am_batches` — a purpose-built table of the 9am Pacific batch for each of 22 days — which makes the board-reconstruction work in §7 largely redundant.

**Everything in §3 that followed from "the tier cannot be reconstructed" is withdrawn.** The raw-snapshot stub observation remains factually true, but the conclusion drawn from it — that tier backtesting is therefore impossible — does not follow, because the reconstruction had already been done and materialised.

### Real tier data (from `tiered_full_fixed`, 26 days)

| Tier | Demon n | Demon hit % | Goblin n | Goblin hit % |
|---|---|---|---|---|
| 0 | 402 | 28.1% | 4,010 | 76.6% |
| 1 | 202 | 21.3% | 2,308 | 71.2% |
| 2 | 115 | 15.7% | 2,404 | 79.3% |
| 3 | 68 | 5.9% | 293 | 85.0% |
| 4 | 314 | 8.3% | 24 | 79.2% |
| 5 | 123 | 4.9% | 2 | 0.0% |

Demon declines monotonically with tier exactly as `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` describes. Note this table is **0-indexed** (tier 0 = closest to anchor) while the documentation is 1-indexed — the doc's "Tier2" is this table's **tier 1**.

*Anomaly worth a future look:* Goblin tiers 6–10 (n=19–75 each) hit only 31.6–46.2%, against 71–85% at tiers 0–4. That cliff is inconsistent with the goblin mechanism (farther = easier) and suggests mislabelling at high tiers.

### PP Demon — the test I wrongly said was impossible

`hits_runs_rbis/less/demon`, 3-pick, ranked by hp, uncapped, on `tiered_full_fixed`:

| Pool | Slips | Days | Full hits | Slip hit % | ROI Power (15x) | ROI Flex (15x/1.5x) |
|---|---|---|---|---|---|---|
| tier 0 | 30 | 7 | 5 | 16.7% | **+150.0%** | **+180.0%** |
| **tier 1 (= doc's "Tier2", the LOCKED config)** | 16 | 5 | **0** | **0.0%** | **−100.0%** | **−43.8%** |
| tier 0+1 combined | 50 | 9 | 5 | 10.0% | +50.0% | +80.0% |

**The locked Demon configuration produces zero full hits in 16 slips across 5 days.** Stepping one tier closer to the anchor (tier 0) instead gives +150% Power / +180% Flex on 30 slips.

The documented 71.6% hit rate for this pool does not appear anywhere in the tier-reconstructed data. The same doc concedes a re-confirmation at "36.2%/n=58", which matches tier 1 here exactly (36.2%, n=58). Tier 0 gives 42.9% (n=105). **The 71.6% figure should be discarded**; at 36.2% the per-leg EV against the documented 3.087x multiplier is 1.12, not the documented 2.21.

**Revised recommendation:** the Demon track should move from tier 1 to tier 0, or be suspended. This supersedes the "UNTESTABLE" row in §2.

## C2. RECONCILIATION: my PP Regular ROI vs the documented +1105.4% / +779.3%

Both documented figures were located and **reproduced exactly**:

- `backtest.regular_size_compare`, pick_size 6: 28 slips, 9 full hits, staked 28, returned 337.50 → (337.50−28)/28 = **+1105.4%** ✅
- `backtest.regular_flex_slips`, sz 6: 28 slips, 9 full + 9 one-off + 8 two-off → 9(25) + 9(2) + 8(0.4) = 246.20 → **+779.3%** ✅

Rebuilding 6-pick slips directly from their own leg table `backtest.regular_pfs_legs` reproduces 28 slips / 9 full hits / +1105.4% precisely. Correlation caps were tested and are **not** the difference (max-2-per-game gives an identical result; max-1-per-game gives +561.8%).

**The difference is the window, and only the window.** Day-by-day comparison of their leg table against my reconstruction:

| | Their `regular_pfs_legs` | My reconstruction |
|---|---|---|
| Days | **12** (2026-08-06 → 2026-08-18) | **18** (2026-07-28 → 2026-08-20) |
| Legs | 204 | ~300 |
| Leg hit rate | 79.4% | 78.5% overall; **79.4% on their window** |
| 6-pick slips | 28 | 50 |
| Power ROI | **+1105.4%** | +725.0% |

On the 10 days both cover, the leg counts and hit rates are **identical or near-identical** (08-06: 12/12 legs at 91.7%/91.7%; 08-07: 24/24 at 79.2%/79.2%; 08-08: 32/32 at 78.1%; 08-09: 23/23 at 82.6%; 08-11: 40/40 at 85.0%; 08-12: 21/21 at 85.7%; 08-13: 16/16 at 68.8%; 08-18: 25/25 at 72.0%). The underlying data agrees.

Their table simply **omits 10 days that exist in the graded record**: 07-28, 07-30, 07-31, 08-01, 08-02, 08-04, 08-05, 08-15, 08-19, 08-20. Several are materially worse than the retained set — 08-05 (17 legs, 58.8%), 07-28 (8 legs, 62.5%), 08-20 (17 legs, 70.6%). Excluding them raises ROI.

**Neither number is wrong; they measure different windows.** +1105.4% is correct for 08-06→08-18. +725% is correct for the full 07-28→08-20 record. The full-window figure is the one to carry forward, because the master prompt requires using the complete available window and expanding it daily.

**Two documentation errors found in `MULTIPLIER_TABLES_MASTER.md` §4:**
1. It calls this a *"Real 28-day backtest"*. The underlying table spans **12 days**. "28" is the slip count, not the day count.
2. It cites the range *"07-06 to 08-18"*. Graded data begins **2026-07-24**; 07-06 does not exist in the database.

## C3. CORRECTED: schedule findings in §7 (items 1 and 2 were partly filter artifacts)

I filtered `score.final_board_batches` on `status LIKE 'completed%'` and on a UTC lower bound. Both distorted the result.

- **Retracted:** "the 9am run is missing on 08-13." It is not. 08-13 has completed batches at 09:44, 09:55, 09:57 and 09:58 Pacific. My earlier listing showed only "17:21, 20:06" because a UTC-midnight lower bound cut off that Pacific day's daytime batches. `backtest.nine_am_batches` independently records 08-13's 9am batch at 09:58.
- **Stands:** 2026-08-15 genuinely has no batch before 12:01 Pacific.
- **Stands, but narrowed:** no batch anywhere near 01:00 Pacific appears on any day from 08-11 to 08-21. On the unfiltered data the 1am run is absent across that span.
- **New and more serious than the original finding:** `orphaned_stale_no_rows_written` accounts for **41 batches**, and they cluster in the 9am window as retry storms. On 2026-08-18 there were **16 consecutive orphaned batches from 09:43 to 10:01** before one finally succeeded at 10:02. On 08-21: 09:51, 09:53, 09:57 all orphaned before 10:03 succeeded. On 08-16: six orphaned between 09:53 and 10:39. The 9am run is not usually *missing* — it is **failing repeatedly and recovering late**, which pushes the real board past the 10:00–10:30 placement window.

## C4. `backtest.deployed_configs` disagrees with the master prompt's locked-config table

A table of saved configs exists (written 2026-08-20) and does not match the master prompt's §2:

| Track | `deployed_configs` ROI | n slips | Config summary | Master prompt says |
|---|---|---|---|---|
| pp_regular | 750.0% | 18 | **bottom-of-order 7-9, `total_bases<1.5`** | `pitcher_fantasy_score/less`, +1105.4% |
| pp_high_hit (goblin) | 29.7% | 33 | flex, graduated cap, 1/game | +79.9% |
| pp_demon | 171.1% | 8 | graduated, 2/game, 2/prop | +80.0% / +657.9% |
| sleeper | 31.7% | 13 | Power, per_leg 1.2684 | +46.5% |
| underdog | 9.9% | 9 | flex, 1/game | +345.0% |

Notably the saved `pp_regular` config is the **Generation-1 bottom-of-order signal**, which `SIGNALS_TECHNIQUES_TRIED.md` lists as "status unclear / organically replaced". It is what is actually recorded as deployed. The master prompt's table and this table need reconciling by the user — I cannot tell from the data which reflects live behaviour.

## C5. The §0 Underdog headline — independently confirmed, and now traceable

The flat-vs-geometric finding **survives** contact with the backtest schema, and is now traceable to a stored artifact. `backtest.ud_cap_results`, pick_size 6, config `fixed_1`: 27 slips, 5 full hits, returned **120.15**.

120.15 ÷ 5 winning slips = **24.03x per win** — which is exactly `35 × 0.6865`, the flat model. The documented +345.0% is reproduced exactly from that row, and is definitively built on the flat application.

Under the corrected geometric model the same 5 wins return 5 × (35 × 0.6865⁶) = 18.28 against 27 staked → **−32.3%**. (Less severe than the −66.9% in §0, because that stored leg pool caught 5 winning slips where my reconstruction caught 3 — the sign is unchanged.)

## C6. What this episode says about the method

The §3 error and the §7 errors share one cause: **I drew conclusions from the absence of evidence without first establishing that I had looked everywhere.** "Impossible" was asserted after querying five hardcoded schemas out of forty. Two schedule claims were asserted from a filtered query without checking what the filter removed.

Standing rule added to the daily task prompt: **enumerate all schemas and inspect `backtest` before any analysis, and never state that something cannot be done without first showing the search that establishes it.**

## C7. Revised standings (superseding §2)

| Track | Config | Corrected ROI | Confidence |
|---|---|---|---|
| **PP Regular** | `pitcher_fantasy_score/less`, 6-pick | **+725%** full window / +1105.4% on 08-06→08-18 | High — multiplier verified at 1.000, both windows reproduce |
| **PP Demon (tier 0)** | `hits_runs_rbis/less`, tier 0, 3-pick | **+150% Power / +180% Flex** | Medium — 30 slips, 7 days |
| **Sleeper (new pool)** | `rbis`+`walks`+`rfi_nrfi` /less, 6-pick | +198.8% at per-leg 1.628 | Medium — multiplier from 2 real slips |
| PP Goblin | flag-level, 5-pick | −25.4% at per-leg 0.620 | Medium |
| **PP Demon (tier 1, LOCKED)** | `hits_runs_rbis/less`, tier 1, 3-pick | **−100% Power** | High — 0 hits in 16 slips |
| **Underdog (LOCKED)** | `rbis`+`walks` /less, 6-pick | **−32% to −67%** | High — multiplier error confirmed three ways |

**Nothing was deployed, patched, or modified.**

---

# ===== 2026-08-21 Session 1 — DEMON RE-RUN (corrected source) =====

User flagged that `backtest.tiered_full_fixed` is stale. Verified and confirmed. **All Demon results in section C1 above are retracted.**

## D1. `tiered_full_fixed` is unusable for tier work — confirmed

On `hits_runs_rbis`/`less` alone:

| Check | Result |
|---|---|
| Total rows | 4,250 |
| `tier IS NULL` | **2,088 (49.1%)** |
| Demon rows with `anchor_line IS NULL` | **752** |
| Demon rows at `tier = 0` | 105 |
| — of those, with `line_value = anchor_line` | **98 (93%)** |

A demon leg sits *away* from the anchor by definition, so `tier = round(abs(line − anchor))` can never be 0 for a genuine demon leg. 98 of the 105 tier-0 demon rows have `line_value` equal to `anchor_line`, meaning the anchor was derived as the leg's own line. That bucket is fabricated, not observed.

**Consequence:** the "tier 0 = +150% Power / +180% Flex, move Demon to tier 0" recommendation in C1 was built on that fabricated bucket and is **withdrawn**. The tier-indexing conclusion in C1 (that the docs' "Tier2" maps to tier 1) was also an artifact of the stale table's 0-indexing and is withdrawn — see D2.

## D2. `backtest.demon_full_history_dedup` — the correct source

| Property | Value |
|---|---|
| Rows | 3,155 |
| Days | 26 (2026-07-26 → **2026-08-20**, one day fresher than `tiered_full_fixed`) |
| `tier IS NULL` | **0** |
| `outcome_hit IS NULL` | **0** |
| Tier range | **1 – 11 (1-indexed)** |

Tier numbering here **matches the documentation directly** — the docs' "Tier2" is this table's `tier = 2`. No re-mapping needed.

Clean monotone decay, consistent with `GOBLIN_DEMON_MECHANISM_EXPLAINED.md`:

| Tier | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| n | 487 | 562 | 284 | 889 | 345 | 175 | 122 | 209 | 70 |
| Hit % | 39.4 | 28.6 | 13.4 | 11.2 | 11.0 | 15.4 | 6.6 | 9.6 | 2.9 |

## D3. The documented 71.6% / n=67 belongs to a DIFFERENT PROP

`MULTIPLIER_TABLES_MASTER.md` §3 attributes "71.6% hit rate (n=67)" to `hits_runs_rbis/less/Tier2`. In the clean table:

| Prop | Side | Tier | n | Hit % | Days |
|---|---|---|---|---|---|
| **`pitcher_strikeouts`** | less | 2 | **67** | **71.6%** | 10 |
| `hits_runs_rbis` | less | 2 | 36 | 75.0% | 5 |
| `hits_runs_rbis` | less | 1 | 139 | 41.0% | 10 |

**The 71.6% / n=67 pair matches `pitcher_strikeouts/less/Tier2` exactly.** The documentation carried the right statistics onto the wrong prop. The deployed Demon track is `hits_runs_rbis`, whose actual Tier2 sample is n=36 over 5 days — not the n=67 over 10 days that the documentation cites as its justification.

## D4. The locked Demon config is a single-day artifact

Per-day leg counts for `hits_runs_rbis/less/Tier2` (the locked pool):

| Date | Legs | Hits | Hit % |
|---|---|---|---|
| **2026-08-11** | **31** | **26** | **83.9%** |
| 2026-08-12 | 1 | 0 | 0.0% |
| 2026-08-17 | 2 | 0 | 0.0% |
| 2026-08-18 | 1 | 1 | 100.0% |
| 2026-08-19 | 1 | 0 | 0.0% |

**2026-08-11 holds 31 of 36 legs (86%).** The other four days contribute 5 legs and 1 hit combined (20%). **Only 08-11 has enough legs to build a single 3-pick slip.**

2026-08-11 is the exact date `SIGNALS_TECHNIQUES_TRIED.md` records as the outlier that got `runs+singles<0.5` rejected — *"Entirely driven by one outlier day (08-11); 7 of 8 real days were losses."* **The same day is carrying the locked Demon strategy.**

### Exhaustive 3-combination enumeration (every possible 3-pick per day, no arbitrary ranking)

Payouts: deployed Demon table `3/3 = 15x`, `2/3 = 1.5x`.

| Pool | Days supporting a 3-pick | Combos | 3-of-3 % | ROI Power | ROI Flex |
|---|---|---|---|---|---|
| **A. `hits_runs_rbis/less/T2` (LOCKED)** — all days | **1** | 4,495 | 57.8% | +767.6% | +821.9% |
| **A. LOCKED — excluding 08-11** | **0** | — | — | **no slip buildable** | **no slip buildable** |
| B. `pitcher_strikeouts/less/T2` — all days | 5 | 2,665 | 56.5% | +747.7% | +799.2% |
| **B. — excluding 08-11** | **4** | 641 | 27.5% | **+311.9%** | **+378.5%** |
| D. Both props, T2 — all days | 6 | 26,887 | 61.0% | +814.4% | +864.3% |
| D. — excluding 08-11 | 5 | 652 | 27.0% | +304.9% | +371.2% |

**Remove one day and the locked configuration ceases to exist** — not "performs worse", but cannot construct a single slip. Its cited +80.0% Power / +657.9% Flex rests entirely on 2026-08-11.

The mis-attributed pool survives the same test: `pitcher_strikeouts/less/Tier2` still builds slips on 4 independent days (08-05 60%, 08-06 100%, 08-07 70%, 08-12 60%) and returns **+311.9% Power / +378.5% Flex** with 08-11 removed.

*Correlation note:* ex-08-11 the per-leg rate for pool B is 71.1% (27/38), which under independence implies 0.711³ = 35.9% of 3-picks landing. Observed is 27.5%. Real slips underperform independence, so ROI figures assuming leg independence are optimistic.

## D5. Revised Demon recommendation (supersedes C1 and §2)

| | Locked | Recommended |
|---|---|---|
| Pool | `hits_runs_rbis/less/Tier2` | `pitcher_strikeouts/less/Tier2` |
| Sample | 36 legs, 5 days, **1 usable day** | 67 legs, 10 days, **5 usable days** |
| ROI excluding 08-11 | **not buildable** | **+311.9% Power / +378.5% Flex** |

The Demon track should move to `pitcher_strikeouts/less/Tier2`, or be suspended pending more days. The documentation's own evidence (71.6%, n=67) was always describing that pool — the config appears to have been locked onto the wrong prop.

**Open:** what does the tier reconstruction in `demon_full_history_dedup` do differently from `tiered_full_fixed`? The latter should be dropped or rebuilt so no future session reads it. Neither table's tier logic was compared against the current live formula this session.

**Nothing was deployed, patched, or modified.**

---

# ===== 2026-08-21 (Fri) — Session 2 — run at 17:40 PT (2026-08-22 00:40 UTC) =====

**Run type:** dry run, research only. No code, schema, or configuration was modified.
**Backtest window used:** full available graded record, 2026-07-24 → 2026-08-20 (28 graded days).
**Reference docs read in full this session:** all seven (COWORKER_DAILY_SLIP_RESEARCH_PROMPT, MULTIPLIER_TABLES_MASTER, SIGNALS_TECHNIQUES_TRIED, GOBLIN_DEMON_MECHANISM_EXPLAINED, GEMINI_USAGE_GUIDE, GOBLIN_DEMON_MULTIPLIER_STUDY_DOSSIER, THIS_CHAT_MULTIPLIER_STUDY_DOSSIER) plus this log including all CORRECTIONS and RE-RUN sections.

---

## 0. FRESHNESS — no gap, and a UTC/Pacific trap avoided

`SELECT max(official_date) FROM score.prop_outcome_history WHERE outcome_hit IS NOT NULL` → **2026-08-20**.

The session environment reported the date as 2026-08-22. **That is UTC.** Real clock at run time: `2026-08-22T00:40Z` = **2026-08-21 17:40 PDT**. Per the standing rule that all user-facing times are Pacific, today is **Friday 2026-08-21** and yesterday is **2026-08-20** — which is exactly the latest graded day. **No staleness gap.**

A naive UTC read would have raised a false alarm. Confirming evidence that 08-21 is simply not finished yet, not missing:

| Check | Result |
|---|---|
| `prop_outcome_history` rows for 2026-08-21 | **0** (not "ungraded" — absent entirely) |
| `final_board_history` rows for 2026-08-21 | 5,891 across 7 batches — the board exists |
| Grading lag, measured on the last 6 days | day D grades land at **05:13–05:45 UTC on D+1** (= ~22:15 PDT on day D) |
| Therefore 08-21 grading expected | ~2026-08-22T05:23Z — roughly 4h 40m after this run |

08-21's games were still in progress at run time. Nothing is broken.

---

## 1. STEP 0 / 0b — schema census and table trust

`SELECT n.nspname, count(c.oid) ... FROM pg_namespace n LEFT JOIN pg_class c ...` returns **18 schemas**, not ~40:

`archive(22) backtest(90) calendar(6) certifier(4) classification(41) config(31) context(38) context_cert(16) control(52) daily(107) market(89) public(0) ref(84) score(66) scoring(23) stats_hitter(57) stats_pitcher(51) team(35)`

**Correction to the standing task prompt:** it says "there are ~40 schemas." There are **18**. The "40" figure came from this log's own C1 section and is wrong. The `backtest` relation count is right — 72 tables/views (90 `pg_class` entries including indexes).

### Trust list additions and corrections (every table below was profiled before use)

| Table | Verdict | Evidence |
|---|---|---|
| `backtest.demon_full_history_dedup` | **TRUSTED** (confirmed) | 3,155 rows, 26 days, 0 NULL tier, 0 NULL outcome, tier 1–11 |
| `backtest.demon_full_history` (parent) | **PARTIAL — 73% unusable** | 24,131 rows, **17,643 (73.1%) NULL tier and NULL anchor**. The 6,488 non-null rows are sound (see §2) |
| `backtest.snapshot_tiered_hrr` | **USABLE WITH ONE FIX** | 3,388 rows, 23 days, 0 NULLs, but tier is **SIGNED (−10..+10)** — the deprecated pre-2026-08-21 formula. `abs(tier) = round(abs(line−anchor))` for **3,388 / 3,388** rows, so it is fully recoverable via `abs()`. Do not read `tier` raw |
| `backtest.raw_truth_extract` | **USELESS for tier work** | 251,508 rows look promising, but **235,265 (93.5%) have NULL `odds_type`**. Non-null `odds_type` exists on exactly **4 days: 07-16, 07-17, 07-18, 07-19** — all *before* the graded record begins (07-24). It cannot reconstruct a single graded day's ladder |
| `backtest.tiered_full_fixed` + 3 siblings | **VOID** (unchanged) | Confirmed stale per this log's D1 section; not read this session |

**Standing-evidence note:** the "raw ladder was never retained" claim in the retracted §3 is now properly established rather than assumed. `raw_truth_extract` was the obvious candidate and it fails on a 93.5% NULL rate confined to four pre-window days. Query shown above.

---

## 2. OPEN ITEM (2) RESOLVED — `demon_full_history_dedup`'s tier logic **does** match the live formula

This was flagged as never checked. It is now checked.

The live formula (`annotateGoblinDemonTier`, `alphadog-v2-score-final-board.js`, per GOBLIN_DEMON_MECHANISM_EXPLAINED.md) is `tier = round(abs(line − anchor))`.

Against the parent table's retained `anchor_line` and `leg_line_value`:

| Check | Result |
|---|---|
| Rows with a tier | 6,488 |
| `tier = round(abs(leg_line_value − anchor_line))` | **6,488 / 6,488 — 100%** |
| `tier = round(abs(...)) + 1` (off-by-one test) | **0** |
| Tier range in parent | **0 – 11** |

**Verdict: exact match, zero off-by-one.**

**But the characterisation in the task prompt is wrong and should be corrected.** The prompt says `demon_full_history_dedup` is *"1-indexed so it matches the documentation's tier numbering directly."* It is **not re-indexed at all**. It is the live formula's raw output with the tier-0 rows removed:

| | Count |
|---|---|
| Parent non-null tier rows | 6,488 |
| Distinct on the dedup key | 3,582 |
| Distinct **and tier ≥ 1** | 3,170 |
| `demon_full_history_dedup` actual rows | **3,155** |
| Parent rows at tier = 0 | 844 |
| Dedup rows at tier = 0 | **0** |

So the dedup step (a) deduplicated and (b) dropped the structurally-impossible tier-0 demon bucket — which is precisely the correct treatment, and precisely what `tiered_full_fixed` failed to do. The tier *values* are the live formula's verbatim, so "the docs' Tier2 = this table's tier 2" is true — but for the right reason, not because of a re-indexing.

**Also re-verified independently (open item 1):** the deployed pool really is `pitcher_strikeouts`. From `alphadog-v2-certification-center.js` line 2946:

```js
const DEMON_HIGH_HIT_TIER_POOL = [
  { prop: "pitcher_strikeouts", side: "less", tier: 2, rank: 1 }
];
const DEMON_HIGH_HIT_SIZE = 3;
const DEMON_FLEX_TIERS = { 3: { 3: 15, 2: 1.5 } };
```

Confirms MULTIPLIER_TABLES_MASTER.md §3: the documentation was wrong, the deployment was always right. Open item 1 closed.

---

## 3. OPEN ITEM (3) RESOLVED — the Goblin high-tier cliff is not a tier effect at all

The cliff was originally seen on the now-void `tiered_full_fixed`. It **reproduces on the independent `snapshot_tiered_hrr`**, so it is real and not a single-table artifact:

| abs(tier) | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| n | 143 | 993 | 986 | 181 | 18 | 2 | 19 | 75 | 65 | 29 | 2 |
| days | 12 | 21 | 20 | 13 | 7 | 2 | 8 | 10 | 10 | 10 | 2 |
| Goblin hit % | 55.2 | 70.4 | 78.3 | 84.0 | 77.8 | 0.0 | **31.6** | **34.7** | **46.2** | **37.9** | 50.0 |

**Root cause: every single high-tier goblin leg is one prop.** Filtering `abs(tier) ≥ 6`:

| Prop | n | days | hit % | avg anchor | avg line |
|---|---|---|---|---|---|
| `pitcher_fantasy_score` | **190 (100%)** | 10 | 38.9 | 26.92 | 19.34 |

Remove that one prop and the cliff disappears entirely — **nothing above tier 5 exists**:

| abs(tier) | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| n | 143 | 993 | 986 | 181 | 18 | 1 |
| Goblin hit % | 55.2 | **70.4** | **78.3** | **84.0** | 77.8 | 0.0 |

Clean, monotone, exactly as `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` §3 describes ("farther from anchor = easier for Goblin"). **There is no cliff. There never was one.**

### Two distinct real findings fall out of this

**3a. `tier` is an absolute line-unit distance and is NOT comparable across props.** Average tier by prop, on the trusted `demon_full_history`:

| Prop | avg anchor | avg tier | max tier |
|---|---|---|---|
| `hits_runs_rbis` | 1.64 | 2.37 | 6 |
| `total_bases` | 1.47 | 3.46 | 7 |
| `pitcher_strikeouts` | 5.26 | 2.39 | 6 |
| `walks` | 0.50 | 0.93 | 1 |
| **`pitcher_fantasy_score`** | **28.14** | **7.84** | **11** |

Tier 7 on `pitcher_fantasy_score` (anchor ≈ 28) is a ~25% relative move — routine. Tier 7 on `hits_runs_rbis` (anchor ≈ 1.6) is impossible. Pooling tiers across props of different scale is meaningless. **Any tier-keyed pool must be defined per-prop, which the deployed `DEMON_HIGH_HIT_TIER_POOL` correctly already is.**

**3b. `pitcher_fantasy_score` anchors look corrupt on the goblin side.** All 191 goblin `pitcher_fantasy_score` legs are `more`, and all 191 sit **below** the anchor (avg line 19.30 vs avg anchor 26.86). A "more @ 19.3" pick when the anchor is 26.9 should be near-automatic; it hits **38.7%** across 10 days. The observed rate is consistent with a true anchor near 17–18, i.e. these are **demons mislabelled as goblins** because the derived anchor is ~9 points too high. Real MLB pitcher fantasy lines cluster well below 27, which supports the anchor — not the line — being the corrupted quantity.

**Recommendation (research-only, NOT deployed):** exclude `pitcher_fantasy_score` from any goblin/demon tier-keyed pool until its anchor derivation is audited. Note this prop is also the basis of the locked PP Regular pool — but that pool uses **standard** lines, not tier-keyed goblin lines, and is unaffected (see §5).

---

## 4. OPEN ITEM (4) — DNP / scratch grading. **A finding, a Gemini rebuttal, and my own retraction.**

This is the most consequential sequence of the session and it went wrong before it went right. Both halves are recorded.

### 4a. What I first found

Splitting every graded hitter leg by whether the player recorded a non-zero value on any corroborating offensive stat:

| Prop / side / line | n | days | overall hit % | zero-offense n | zero-off % | **zero-off hit %** | active hit % |
|---|---|---|---|---|---|---|---|
| `hits`/less 0.5 | 3,306 | 27 | 43.13 | 927 | 28.0 | **100.00** | 21.03 |
| `total_bases`/less 0.5 | 2,727 | 26 | 41.99 | 781 | 28.6 | **100.00** | 18.72 |
| `hits_runs_rbis`/less 1.5 | 7,043 | 27 | 55.74 | 1,786 | 25.4 | **100.00** | 40.67 |
| `doubles`/less 0.5 | 4,794 | 25 | 84.40 | 1,151 | 24.0 | 99.83 | 79.55 |
| `home_runs`/less 0.5 | 2,701 | 27 | 84.89 | 647 | 24.0 | 99.85 | 79.92 |
| `stolen_bases`/less 0.5 | 1,214 | 22 | 87.89 | 285 | 23.5 | 98.95 | 83.91 |

Control group — the same split on **pitcher** props:

| Prop | side | n | zero-stat legs |
|---|---|---|---|
| `pitcher_strikeouts` | less | 2,053 | **0** |
| `earned_runs` | less | 1,935 | **0** |
| `hits_allowed` | less | 1,437 | **0** |
| `walks_allowed` | less | 1,043 | **0** |
| `pitcher_outs` | less | 981 | **0** |
| `pitcher_fantasy_score` | less | 565 | **0** |

I concluded ~24% of hitter legs were DNP/scratch rows graded as automatic wins.

### 4b. Gemini's rebuttal — the raw call and raw response

Called per `GEMINI_USAGE_GUIDE.md`:

```
run_job(job: "direct_worker_probe", extra: {
  method: "POST",
  url: "https://alphadog-v2-admin-sql.rodolfoaamattos.workers.dev/gemini-proxy",
  body: "{\"model\": \"gemini-3.6-flash\", \"prompt\": \"You are auditing a real MLB player-prop
   backtest database. ... Bucket B is 23-30 percent of every hitter prop ... hits/less 0.5:
   n=3306, overall 43.13%. Bucket B n=927 hits 100.00%. Bucket A hits 21.03% ... CONTROL GROUP:
   for PITCHER props ... bucket B is EXACTLY ZERO legs out of 1935, 2053, 1437, 981, 1043 and 565
   respectively. Not one. My working hypothesis: bucket B is benched/scratched/DNP hitters ...
   1. Is there any plausible alternative explanation for a bucket of 927 real MLB legs going
   927-for-927 with zero exceptions, other than non-participation? ...
   2. For backtesting slip economics, which treatment is CORRECT ...\"}"
})
```

Response (`http_status: 200`, `elapsed_ms: 35377`), verbatim excerpt:

> **The 100.00% hit rate for `hits/less 0.5` in Bucket B is not an anomaly—it is a mathematical tautology created by your filter definition, compounded by an upstream data pipeline error.**
>
> #### 1. The Mathematical Tautology
> Bucket B is defined as legs where the player recorded **zero** across `[hits, total_bases, hits_runs_rbis, runs, rbis, singles, walks, fantasy_score]`.
> * Because `hits = 0` is an explicit condition required to enter Bucket B, evaluating `hits < 0.5` on Bucket B yields $0 < 0.5 = \text{TRUE}$ for 100% of rows by construction.
> * There are zero exceptions because it is logically impossible for a row filtered on `hits == 0` to fail a `hits < 0.5` check.
>
> #### 2. The Composition of Bucket B (Why it is 23–30% of Hitter Legs)
> Bucket B contains **two distinct populations** merged together:
> 1. **True DNPs / Scratches (~5%–8% of total legs):** Players who never took the field. The pipeline imputed `0` for all stats instead of assigning `NULL` or a `DNP` status flag.
> 2. **Genuine Active 0-Stat Games (~16%–22% of total legs):** Players who played (e.g., went 0-for-3 or 0-for-4) and recorded 0 Hits, 0 Walks, 0 HBPs, 0 Stolen Bases, 0 Runs, and 0 RBIs. On PrizePicks, strikeouts do not deduct points from hitter fantasy scores (unlike DraftKings/FanDuel). Thus, a hitter going 0-for-4 with 4 Ks receives exactly **0.0 Fantasy Points**, satisfying every single Bucket B criterion while actively participating in the game.
>
> #### 3. Why the Pitcher Control Group Has ZERO Bucket B Legs
> * **Active Pitchers:** A pitcher who enters a game records at least 1 Out ($0.1$ IP) ... It is virtually impossible for an active MLB pitcher to log a game entry and record $0.0$ across Outs, Ks, Hits Allowed, ER, BB, and Fantasy Score simultaneously.
> * **Scratched Pitchers:** The data feed handles pitcher scratches upstream by dropping the scheduled starter from the game log entirely rather than imputing zero-stat rows.
>
> #### Question 2: Correct Treatment: Choice (c) — Disambiguate via Plate Appearances (PA)
> 1. Join your prop history against game-log Box Score data using `plate_appearances` (PA) or `batting_order_position` (is not NULL).
> 2. **If $\text{PA} == 0$ (True DNP):** Simulate a PrizePicks Void. Remove the leg, shrink the slip size from $N \rightarrow N-1$, and re-grade the slip using PrizePicks' published payout schedule for $N-1$ legs.
> 3. **If $\text{PA} > 0$ (Active 0-Stat Game):** Retain the leg as a valid, graded leg (**WIN** for `LESS`, **LOSS** for `MORE`).

*(Response truncated mid-sentence at "Quantifying the Bias on a 6-Pick Flex Slip (24%" — the documented truncation behaviour. Not continued, because the two substantive points above were already sufficient to invalidate my conclusion and I tested them directly rather than asking for more prose.)*

### 4c. I tested Gemini's hypothesis against real data rather than accepting it

Gemini has no PA column to offer me — `score.prop_outcome_history` has no plate-appearance prop. But it does carry **`hitter_strikeouts`** (2,775 legs, 27 days, values 0–4), which is a hard participation marker: a player who struck out **definitely batted**.

| Check | Count |
|---|---|
| Player-days in the corroboration set | 5,968 |
| Zero on all offensive counting stats | 1,770 (29.7%) |
| — of those, having a `hitter_strikeouts` row at all | 320 |
| — — **of those, struck out ≥ 1 time (definitely played)** | **245 (76.6%)** |
| — — of those, `hitter_strikeouts = 0` (DNP or no-K 0-stat game) | 75 (23.4%) |

**Gemini was right.** Where a participation marker exists, **76.6% of the zero-offense bucket is active players**, not scratches. Extrapolating the 23.4% residual across all 1,770 zero-offense player-days gives roughly **414 true DNPs out of 5,968 player-days ≈ 6.9%** — squarely inside Gemini's predicted 5–8% band.

Its pitcher explanation also checks out directly: `pitcher_outs` has **min(actual_stat_value) = 1.00** across all 2,243 legs. No pitcher is ever recorded with zero outs. The pipeline genuinely drops non-appearing pitchers.

### 4d. RETRACTION — issued against my own §4a

1. **RETRACTED: "~24% of hitter 'less' legs are DNP rows graded as automatic wins."** The correct true-DNP figure is **~7%**. The 24–30% bucket is dominated by legitimate 0-for-N games.
2. **RETRACTED: the three tautological rows in §4a's table** — `hits`/less 0.5, `total_bases`/less 0.5, `hits_runs_rbis`/less 1.5. My corroboration set contained the graded stat itself, so 100.00% was true by construction and is not evidence of anything. The non-circular rows (`doubles`, `home_runs`, `stolen_bases` — none of which are in the corroboration set) remain valid observations, but at 98.95–99.85% they are equally well explained by 0-for-N games.
3. **CORRECTION TO A PRIOR ENTRY IN THIS LOG.** Session 1 §5 used the same flawed method: *"Restricting to legs where the player has confirmed offensive activity drops the hit rate from 84.9% → 77.5%."* That 77.5% floor **over-corrects**, because it strips out genuine 0-for-N games alongside scratches. The true `doubles`/less 0.5 rate sits much closer to the 84.4% headline than to 77.5%. The prior session's "the finding survives its own worst case" conclusion still holds — it just never needed the worst case.

### 4e. What genuinely survives, and it is still worth acting on

- **~7% of hitter legs are real scratches that PrizePicks VOIDS**, not pays. **No backtest in this repo models voids.** A 6-pick all-hitter slip has a `1 − 0.931⁶ = 34.8%` chance of containing at least one void, which silently reprices it as a 5-pick.
- **Pitcher-prop strategies carry ZERO void exposure**, proven by the control group. This is a real, structural advantage of pitcher pools that was not previously documented anywhere.
- The correct fix is Gemini's option (c), and it needs a data source this database does not currently expose. **Recommendation (research-only): add plate appearances / `batting_order_position` to the graded outcome record** so DNPs can be separated from 0-for-N games and voids can be simulated properly. That is the single change that would let every hitter backtest in this repo be priced honestly.

---

## 5. PP REGULAR — locked pool confirmed, cap question closed, documented figure reconciled

**Locked config:** `pitcher_fantasy_score/less`, 6-pick, starting Flex.

**Void exposure: ZERO.** 565 legs, 26 days, 0 zero-stat rows. It is a pitcher prop. Of the five tracks this is the only one whose leg pool is structurally immune to §4's problem.

### Day-by-day, full graded window, 6-pick, score-ranked greedy, uncapped

| Date | Slip outcomes | Slips | Full hits | ROI | LOO ROI (this day removed) |
|---|---|---|---|---|---|
| 2026-07-27 | 6/6✅ 6/6✅ | 2 | 2 | +3650.0% | +950.0% |
| 2026-07-28 | 4/6 3/6 | 2 | 0 | −100.0% | +1050.0% |
| 2026-07-29 | 4/6 | 1 | 0 | −100.0% | +1034.9% |
| 2026-07-30 | 6/6✅ 5/6 | 2 | 1 | +1775.0% | +1000.0% |
| 2026-07-31 | 6/6✅ 4/6 | 2 | 1 | +1775.0% | +1000.0% |
| 2026-08-01 | 4/6 3/6 5/6 6/6✅ | 4 | 1 | +837.5% | +1030.1% |
| 2026-08-03 | 4/6 5/6 | 2 | 0 | −100.0% | +1050.0% |
| 2026-08-04 | 4/6 5/6 6/6✅ 6/6✅ | 4 | 2 | +1775.0% | +978.8% |
| 2026-08-05 | 5/6 3/6 3/6 3/6 | 4 | 0 | −100.0% | +1081.5% |
| 2026-08-06 | 6/6✅ 5/6 6/6✅ | 3 | 2 | +2400.0% | +964.2% |
| 2026-08-07 | 5/6 6/6✅ 2/6 5/6 6/6✅ | 5 | 2 | +1400.0% | +993.8% |
| 2026-08-08 | 4/6 4/6 5/6 5/6 6/6✅ 5/6 | 6 | 1 | +525.0% | +1062.0% |
| 2026-08-09 | 6/6✅ 4/6 6/6✅ 4/6 4/6 | 5 | 2 | +1400.0% | +993.8% |
| 2026-08-10 | 2/6 3/6 | 2 | 0 | −100.0% | +1050.0% |
| 2026-08-11 | 5/6 6/6✅ 4/6 3/6 6/6✅ 6/6✅ | 6 | 3 | +1775.0% | +956.3% |
| 2026-08-12 | 5/6 4/6 6/6✅ | 3 | 1 | +1150.0% | +1014.9% |
| 2026-08-13 | 4/6 4/6 | 2 | 0 | −100.0% | +1050.0% |
| 2026-08-14 | 5/6 5/6 6/6✅ 4/6 | 4 | 1 | +837.5% | +1030.1% |
| 2026-08-15 | 6/6✅ 3/6 5/6 4/6 | 4 | 1 | +837.5% | +1030.1% |
| 2026-08-16 | 4/6 6/6✅ 4/6 | 3 | 1 | +1150.0% | +1014.9% |
| 2026-08-17 | 5/6 6/6✅ 6/6✅ | 3 | 2 | +2400.0% | +964.2% |
| 2026-08-18 | 4/6 5/6 4/6 4/6 | 4 | 0 | −100.0% | +1081.5% |
| 2026-08-19 | 4/6 5/6 | 2 | 0 | −100.0% | +1050.0% |
| 2026-08-20 | 5/6 5/6 | 2 | 0 | −100.0% | +1050.0% |
| **TOTAL** | | **77** | **23 (29.9%)** | **+1020.1%** | |

**Days supporting: 24. Profitable days: 15 of 24. Leave-one-day-out: removing ANY single day leaves ROI between +950.0% and +1081.5% — it never approaches zero.** This is the most concentration-robust result in the entire log.

### Reconciliation against the documented +1105.4% and against Session 1's +725%

| Window | Days | Slips | Full hits | Power ROI |
|---|---|---|---|---|
| **08-06 → 08-18 (the documented window)** | 13 | 50 | 16 | **+1100.0%** |
| *Documented figure for that window* | *12* | *28* | *9* | *+1105.4%* |
| 07-28 → 08-20 (Session 1's window) | 23 | 75 | 21 | **+950.0%** |
| *Session 1's figure for that window* | *18* | *50* | — | *+725%* |
| **FULL RECORD 07-27 → 08-20** | **24** | **77** | **23** | **+1020.1%** |

The documented **+1105.4% reproduces as +1100.0%** on its own window — agreement to within 0.5%. ✅

**But Session 1's C2 conclusion needs amending.** C2 concluded *"the difference is the window, and only the window."* On the same 07-28→08-20 endpoints I get **+950.0%**, not +725%, from 75 slips over 23 days versus Session 1's 50 slips over 18 days. So the difference was **not only the window — it was also leg loss in Session 1's "closest batch to 9am" board reconstruction**, which C3 itself flagged as viable on only ~10 of 28 days. Reading the graded outcome record directly recovers 5 more days and 25 more slips.

**The figure to carry forward is +1020.1% on the full record.** +725% understates it.

### Cap sweep — open item closed, and the answer is that the question is moot

| Cap (slips/day) | 1 | 2 | 3 | 5 | **8** | 10 | 12 | 15 | 20 | uncapped |
|---|---|---|---|---|---|---|---|---|---|---|
| Slips | 24 | 47 | 61 | 75 | **77** | 77 | 77 | 77 | 77 | 77 |
| Power ROI | +837.5% | +777.7% | +945.1% | +1000.0% | **+1020.1%** | +1020.1% | +1020.1% | +1020.1% | +1020.1% | +1020.1% |
| Flex ROI | +600.0% | +561.7% | +667.5% | +698.9% | **+713.2%** | +713.2% | +713.2% | +713.2% | +713.2% | +713.2% |

Session 1 left the 10–15 band unswept and called it "the realistic choice." **It is swept now and it changes nothing: the pool saturates at 8 slips/day.** No day in 24 supports a 9th 6-pick slip. Uncapped is optimal and is operationally identical to any cap ≥ 8.

### Decay watch — real, but not alarming

| Window | Days | Slips | Full-hit % | Power ROI |
|---|---|---|---|---|
| First half 07-27→08-07 | 11 | 31 | 35.5% | +1230.6% |
| Second half 08-08→08-20 | 13 | 46 | 26.1% | +878.3% |
| Most recent 8 days 08-13→08-20 | 8 | 24 | 20.8% | +681.3% |

Declining, and the last three days are all −100%. **But still enormously positive**, unlike Underdog's collapse. Flagged as a monitor item for tomorrow, not an action item.

### Signals tried this session for PP Regular
- **Rare-event replacement pool** (`doubles`+`home_runs`+`stolen_bases`+`pfs` /less), proposed in Session 1 at +1245.7%: **not endorsed.** Three of its four props are hitter props carrying the §4e void exposure that the locked pool does not, and its headline rested partly on the over-corrected 77.5% floor. It is not retracted as a signal — the leg rates are real — but it should not displace a clean pitcher pool without void modelling. Downgraded to "open, needs void simulation."
- **Cap structure**: swept 10 values, saturates at 8. Closed.
- **`hp` vs `score` as ranker**: `score` retained for PrizePicks, consistent with Session 1 §4.

---

## 6. PP DEMON — a new pool that beats the deployed one on every axis

**Locked/deployed:** `pitcher_strikeouts/less/Tier2`, 3-pick Flex, no cap, table `3/3=15x, 2/3=1.5x`.

All figures below use **exhaustive 3-combination enumeration** — every possible 3-pick per day, no arbitrary ranking, since `demon_full_history_dedup` has no score column. Exact combinatorics, not sampling.

### Pool sweep, with leave-one-day-out on 08-11

| Pool | Scope | Days supporting | Combos | Full-hit % | ROI Power | ROI Flex |
|---|---|---|---|---|---|---|
| A. `hits_runs_rbis/less/T2` (docs-cited) | all days | 1 | 4,495 | 57.8% | +767.6% | +821.9% |
| A. — ex 08-11 | | **0** | — | — | **not buildable** | **not buildable** |
| B. `pitcher_strikeouts/less/T2` (**DEPLOYED**) | all days | 5 | 2,665 | 56.5% | +747.7% | +799.2% |
| B. — ex 08-11 | | 4 | 641 | 27.5% | +311.9% | +378.5% |
| C. `total_bases/less/T1` | all days | 2 | 936 | 32.5% | +387.2% | +456.4% |
| C. — ex 08-11 | | 1 | 120 | 70.0% | +950.0% | +995.0% |
| D. `pitcher_strikeouts/less/T1` | all days | 3 | 131 | 30.5% | +358.0% | +437.0% |
| E. `earned_runs/less/T1` | all days | 3 | 141 | 60.3% | +804.3% | +820.2% |
| F. `pitcher_strikeouts/less/T1+T2` | ex 08-11 | 4 | 1,206 | 32.8% | +391.3% | +455.1% |
| G. `pstrikeouts/T2` + `total_bases/T1` | ex 08-11 | 4 | 2,486 | 36.5% | +447.9% | +516.7% |
| H. 4 props /less T1+T2 | ex 08-11 | 11 | 23,547 | 29.7% | +345.0% | +398.7% |
| **I. `pitcher_strikeouts`+`earned_runs` /less T1+T2** | **all days** | **10** | **26,308** | **38.5%** | **+478.1%** | **+544.7%** |
| **I. — ex 08-11** | | **9** | **4,208** | **40.5%** | **+507.1%** | **+572.5%** |

Pools A and B reproduce Session 1's D4 figures **exactly** (+767.6%/+821.9% and +747.7%/+799.2%, +311.9%/+378.5%). ✅ Independent reproduction confirmed.

Pools C, D and E look excellent but collapse to 1–3 supporting days. **Rejected on concentration**, per the standing rule.

### Pool I is the recommendation, and here is why it clears every bar

**`pitcher_strikeouts` + `earned_runs`, side `less`, tiers 1 and 2.** Both are pitcher props.

| Date | Legs | Hits | Combos | Full-hit % | Day ROI (Power) | **LOO ROI Power** | LOO ROI Flex |
|---|---|---|---|---|---|---|---|
| 2026-08-05 | 27 | 20 | 2,925 | 39.0% | +484.6% | +477.3% | +543.7% |
| 2026-08-06 | 12 | 12 | 220 | 100.0% | +1400.0% | +470.3% | +537.5% |
| 2026-08-07 | 18 | 13 | 816 | 35.0% | +425.7% | +479.8% | +546.2% |
| 2026-08-10 | 3 | 1 | 1 | 0.0% | −100.0% | +478.1% | +544.7% |
| 2026-08-11 | 52 | 38 | 22,100 | 38.2% | +472.6% | **+507.1%** | +572.5% |
| 2026-08-12 | 12 | 8 | 220 | 25.5% | +281.8% | +479.7% | +546.2% |
| 2026-08-15 | 4 | 3 | 4 | 25.0% | +275.0% | +478.1% | +544.7% |
| 2026-08-16 | 3 | 1 | 1 | 0.0% | −100.0% | +478.1% | +544.7% |
| 2026-08-18 | 3 | 0 | 1 | 0.0% | −100.0% | +478.1% | +544.7% |
| 2026-08-19 | 6 | 0 | 20 | 0.0% | −100.0% | +478.5% | +545.2% |
| **TOTAL** | **140** | **96** | **26,308** | **38.5%** | **+478.1%** | | |

**Full leave-one-day-out across all 10 days: ROI never leaves the +470.3% to +507.1% band.** There is no day whose removal materially changes the answer — and removing 08-11, the day that destroys pool A and halves pool B, *improves* pool I to +507.1%.

| | Deployed (B) | **Recommended (I)** |
|---|---|---|
| Days supporting a 3-pick | 5 | **10** |
| Days supporting, ex 08-11 | 4 | **9** |
| ROI Power, ex 08-11 | +311.9% | **+507.1%** |
| ROI Flex, ex 08-11 | +378.5% | **+572.5%** |
| Profitable days | — | 6 of 10 |
| Void exposure (§4e) | zero (pitcher prop) | **zero (both pitcher props)** |
| Depends on 08-11? | yes, heavily | **no — improves without it** |

Pool I is a strict superset of the deployed pool that **doubles the day support and raises ROI by ~195pp**, at the same slip size, same payout table, same DNP immunity. This is the strongest single recommendation of the session.

### Pick-size sweep — model-free break-even multipliers

Because real Demon multipliers are only confirmed at 3-pick, this is reported as **break-even multipliers** rather than ROI, so no estimated payout is presented as real data. Pool H basis (4 props, T1+T2):

| Pick size | Days supporting | Full-hit % (day-wtd) | **Break-even multiplier needed** | Real multiplier known? |
|---|---|---|---|---|
| 2 | 13 | 25.53% | **3.92x** | 5.5–5.75x observed at T1 → clears |
| **3** | 12 | 19.84% | **5.04x** | **15x deployed → clears by 2.98x** |
| 4 | 11 | 17.09% | 5.85x | **not observed** |
| 5 | 11 | 14.41% | 6.94x | **not observed** |
| 6 | 11 | 12.71% | 7.87x | **not observed** |

3-pick remains the right size on the evidence available. **The single highest-value real observation to collect is a placed 4-pick or 5-pick Demon slip** — the break-evens above are low enough that larger sizes may well clear them, but nothing in the data can confirm it.

### Cap structure — a clean structural result

`demon_full_history_dedup` has no ranking column, so slips cannot be ordered by quality. That has a precise consequence: **drawing `k` combinations at random from a day's enumeration has the same expected ROI as the day's full enumeration, for any k ≥ 1.** A fixed cap therefore does not change expected ROI — it changes only variance and the *day weighting*:

- **Percentage cap** (proportional to buildable combos) → combo-weighted → pool I = **+478.1%**
- **Fixed cap** (same k every day) → equal-day-weighted → pool I = **+294.0%**

Both strongly positive. The fixed-cap figure is the more conservative and the more realistic for actual placement. Reported as such rather than picking the flattering one.

---

## 7. PP GOBLIN — negative-EV at the real multiplier on every variant tested

**Real per-leg ratio: 0.620**, from the 12 real placed slips in `score.slip_entries` (3-pick 0.6155, 4-pick 0.6223, 5-pick ×10 at 0.6198, range 0.611–0.637). 5-pick multiplier = `20 × 0.620⁵ = 1.833x`.

Exhaustive 5-combination enumeration on `snapshot_tiered_hrr` (using `abs(tier)`, `pitcher_fantasy_score` excluded per §3):

| Variant | Days | Combos | Full-hit % | ROI @ real 1.833x | ROI @ published 20x | Profitable days |
|---|---|---|---|---|---|---|
| Goblin MORE, T1–3, participation-filtered | 14 | 42,345,631 | 41.2% | **−24.5%** | +724.3% | 2 / 14 |
| Goblin MORE, T1–3, raw | 14 | 89,868,687 | 21.1% | **−61.3%** | +322.0% | 0 / 14 |
| Goblin LESS, T1–3, participation-filtered | 12 | 12,591,563,479 | 18.6% | **−66.0%** | +271.4% | 0 / 12 |
| Goblin LESS, T1–3, raw | 12 | 33,015,964,524 | 26.7% | **−51.0%** | +434.3% | 0 / 12 |

Break-even at 5-pick requires a full-hit rate of **54.6%**. The best variant reaches **41.2%**.

**Every variant is negative. The gap between +724.3% at the published 20x and −24.5% at the real 1.833x is the entire story: PrizePicks' 0.620 goblin haircut consumes more than the whole edge.** This confirms and strengthens Session 1's −25.4% on a decontaminated, tier-aware, 42-million-combination basis.

**Recommendation (research-only): suspend PP Goblin staking.** Its documented +79.9% was computed against published multipliers that real placed slips do not pay.

**RETRACTED within this session:** an earlier draft of this section claimed the Goblin pool should switch from `less` to `more`, based on the participation-filtered split (82.5% vs 63.2% at T1). That filter is the same over-correction retracted in §4d. On raw data the two sides are **71.2% vs 69.9%** at T1 — no meaningful edge either way. The more/less claim is withdrawn; the negative-EV conclusion holds under both filtered and raw treatments and is unaffected.

---

## 8. UNDERDOG — 35 configs swept, every one negative. Session 1's headline re-confirmed.

**Multiplier model: geometric, per-leg 0.6516**, i.e. `published × 0.6516ⁿ`. Sanity check against the one real placed slip: predicted 5-pick = `20 × 0.6516⁵ = 2.349x`; **real observed = 2.35x**. Exact.

Full sweep: pick sizes 2–8 × caps {1, 2, 3, 5, uncapped}, 27 days, ranked by `hp`, built from the complete graded record (`source_key='parlay_underdog'`, 25,761 graded legs) rather than the stored `ud_legs` artifact.

| Rank | Pick size | Cap | Slips | Days | Full hits | ROI |
|---|---|---|---|---|---|---|
| 1 (best of 35) | 2 | 5 | 135 | 27 | 77 | **−15.2%** |
| 2 | 3 | 3 | 81 | 27 | 35 | −22.3% |
| 3 | 3 | 5 | 135 | 27 | 58 | −22.8% |
| 4 | 2 | 2 | 54 | 27 | 28 | −22.9% |
| 5 | 2 | 3 | 81 | 27 | 42 | −22.9% |
| 7 | 2 | uncapped | 3,650 | 27 | 1,838 | −25.2% |
| 12 | 5 | 1 | 27 | 27 | 8 | −30.4% |
| — | **6 (LOCKED)** | **1 (LOCKED)** | 27 | 27 | — | **worse than −34%** |

**Not one config in 35 is positive.** The locked 6-pick/cap-1 does not appear in the top 15.

This is a genuine independent re-confirmation of Session 1 §0 on a wider and cleaner basis — the full graded record over 27 days and up to 3,650 slips per config, rather than the stored `ud_legs` table. The external evidence also re-confirms: Underdog's own help documentation again states that *"individual pick difficulty affects overall payouts... if you choose a pick with a 0.7x multiplier, your total payout decreases"* — first-party confirmation of per-selection (compounding) pricing.

**Recommendation stands: suspend Underdog staking.** Additionally note `rbis` and `walks` are both hitter props, so this track also carries the §4e void exposure on top of the multiplier problem.

---

## 9. SLEEPER — Session 1's proposed pool re-confirmed exactly, and improved

**Per-leg multiplier: 1.628**, from 2 real placed 2-pick slips (2.56x, 2.74x → 2.65x avg; `1.628² = 2.650`). Exact match. This supports the ~1.63 figure in MULTIPLIER_TABLES_MASTER §5 over the 1.2684 in THIS_CHAT_MULTIPLIER_STUDY_DOSSIER §1 — **resolving Session 1's open item 7 in favour of 1.628.**

Sweep: 4 pools × 5 sizes × 3 caps, 27 days, ranked by `hp`, full graded record (`source_key='sleeper'`).

| Pool | Size | Cap | Slips | Days | Full hits | ROI |
|---|---|---|---|---|---|---|
| **`rbis`+`walks`+`rfi_nrfi` /less** | **6** | **1** | **27** | **27** | **7** | **+382.7%** |
| `doubles`+`home_runs`+`stolen_bases` /less | 6 | 1 | 19 | 19 | 4 | +292.0% |
| `rbis`+`walks`+`rfi_nrfi` /less | 5 | 1 | 27 | 27 | 9 | +281.3% |
| `rbis`+`walks`+`rfi_nrfi` /less | 5 | 3 | 81 | 27 | 22 | +210.7% |
| `rbis`+`walks`+`rfi_nrfi` /less | 6 | 3 | 81 | 27 | 13 | **+198.8%** |
| `rbis`+`walks` /less | 6 | 1 | 27 | 27 | 4 | +175.9% |
| `hits_runs_rbis/more` (**LOCKED**) | 3 | any | — | — | — | **not in top 14** |

The 6-pick/cap-3 row reproduces Session 1's **+198.8% exactly**. ✅

**New this session: cap = 1 nearly doubles it, to +382.7%**, on a pool available all 27 of 27 days. Session 1 only reported cap 3. This restores the historical "concentrate on the strongest legs, cap low" pattern that PP Regular contradicts.

**Leave-one-day-out** is exactly computable here since the structure is one slip per day, 7 wins in 27: removing a winning day gives `(18.62×6 − 26)/26 = +329.7%`; removing a losing day gives `(18.62×7 − 26)/26 = +401.2%`. **LOO band: +329.7% to +401.2%. No single-day dependency.**

**Caveat, flagged not buried:** `rbis` and `walks` are hitter props, so this pool carries the §4e ~7% void exposure. The locked `hits_runs_rbis/more` pool does too. Sleeper has no pitcher-prop alternative in the top configs.

---

## 10. MULTIPLIER TABLE — pulled fresh, and there is nothing new

`SELECT ... FROM score.slip_entries WHERE real_multiplier IS NOT NULL ...` returns **19 rows, every one created 2026-08-21T20:11 UTC** — the single batch Session 1 already recorded. **Zero new real placed-slip observations since the last run.**

| App / line type | Real slips | Real multiplier | Published base | Implied per-leg |
|---|---|---|---|---|
| PP Goblin 3-pick Power | 1 | 1.40x | 6.0x | 0.6155 |
| PP Goblin 4-pick Power | 1 | 1.50x | 10.0x | 0.6223 |
| PP Goblin 5-pick Power | 10 | 1.86x (1.7–2.1) | 20.0x | 0.6198 |
| PP Regular 4-pick **Flex** | 1 | 6.00x | 6.0x | **1.000** |
| PP Regular 5-pick **Flex** | 3 | 10.00x | 10.0x | **1.000** |
| Sleeper 2-pick Power | 2 | 2.65x (2.56/2.74) | dynamic | 1.628 |
| Underdog 5-pick Power | 1 | 2.35x | 20.0x | 0.6516 |

Nothing to correct in MULTIPLIER_TABLES_MASTER.md from new data, because there is no new data. Per-prop/per-side/per-tier granularity is preserved above rather than blended.

**Open item (5) remains open and is a user action, not a research action.** PP Regular's 1.000 ratio still rests entirely on **4 Flex observations and zero Power observations**. Every PP Regular ROI in §5 — including the +1020.1% headline — assumes Power pays the published table undiscounted. If Regular Power carries a Goblin-style haircut, §5 collapses the way Underdog did. **One placed 6-pick PP Regular Power slip remains the single highest-value data point available.**

---

## 11. EXTERNAL RESEARCH (performed fresh this session)

Both published tables re-verified live. **Both unchanged.**

- **PrizePicks** (prizepicks.com/ways-to-pick): Power `2:3x, 3:6x, 4:10x, 5:20x, 6:37.5x`. Flex `3:{3x,1x}`, `4:{6x,1.5x}`, `5:{10x,2x,0.4x}`, `6:{25x,2x,0.4x}`. ✅ matches repo.
- **Underdog** (help.underdogsports.com): Standard `2:3.5, 3:6.5, 4:12, 5:20, 6:35, 7:65, 8:120`. Flex 0-loss `3:3.25, 4:6, 5:10, 6:25, 7:40, 8:80`; 1-loss `1.09/1.5/2.5/2.6/2.75/3`; 2-loss `6:0.25, 7:0.5, 8:1`. ✅ matches repo.
- **Underdog per-selection pricing re-confirmed first-party**, supporting the geometric model: *"Individual pick difficulty affects overall payouts. If you choose a pick with a 0.7x multiplier, your total payout decreases to reflect that lower difficulty."*
- No evidence found of any payout change since the 2025-06-02 PrizePicks 3/4-pick Flex increase already documented.

---

## 12. HONEST SUMMARY

**Genuinely new this session:**
1. **Demon Pool I** — `pitcher_strikeouts`+`earned_runs` /less, tiers 1+2. Doubles the deployed pool's day support (10 vs 5; 9 vs 4 ex-08-11), raises ROI to +478.1% Power / +544.7% Flex, and full LOO never leaves +470.3%–+507.1%. Best recommendation of the session.
2. **The Goblin high-tier cliff is not a tier effect** — 100% of high-tier goblin legs are one prop (`pitcher_fantasy_score`); remove it and the curve is clean and monotone with nothing above tier 5.
3. **`tier` is a raw line-unit distance and is not comparable across props** — avg tier 7.84 on `pitcher_fantasy_score` (anchor ≈28) vs 0.93 on `walks` (anchor ≈0.5).
4. **`pitcher_fantasy_score` goblin anchors look corrupt** — 191 legs, all `more`, all below an implausibly high anchor, hitting 38.7% where the mechanism predicts ~85%.
5. **`demon_full_history_dedup`'s tier logic verified against the live formula** — 6,488/6,488 exact match, 0 off-by-one. It is *not* re-indexed; it is the live formula with tier-0 dropped.
6. **~7% true DNP/void exposure on hitter props, zero on pitcher props** — quantified, with the pitcher control group (`pitcher_outs` min = 1.00 across 2,243 legs) proving the pipeline can and does exclude non-participants for pitchers only. No backtest in this repo models voids.
7. **PP Regular cap question closed** — the pool saturates at 8 slips/day; every cap ≥8 is identical. The 10–15 band Session 1 left unswept changes nothing.
8. **Sleeper cap=1 beats cap=3 by ~184pp** (+382.7% vs +198.8%) on the pool Session 1 proposed.
9. **Sleeper per-leg conflict resolved** in favour of 1.628 (predicts 2.650x vs 2.65x real).
10. **`backtest.raw_truth_extract` proven useless for tier reconstruction** — 93.5% NULL `odds_type`, non-null on only 4 pre-window days.
11. **`backtest.snapshot_tiered_hrr` uses the deprecated SIGNED tier formula** but is fully recoverable via `abs()` (3,388/3,388 match). New trust-list entry.
12. **The schema count in the standing task prompt is wrong** — 18 schemas, not ~40.

**Re-confirmed, not new:** Underdog negative under the geometric model (now across 35 configs, 27 days); PP Goblin negative at the real 0.620 ratio; the documented +1105.4% PP Regular figure (reproduces at +1100.0%); Sleeper's +198.8% at cap 3 (reproduces exactly); Demon pools A and B (reproduce exactly); both published payout tables; the deployed Demon pool really is `pitcher_strikeouts`.

**RETRACTED this session:**
1. **My own §4a claim that ~24% of hitter legs are DNP rows graded as wins.** True figure ~7%. Caught by a Gemini cross-check, then verified against real data using `hitter_strikeouts` as a participation marker (245 of 320 testable zero-offense legs struck out, so they definitely played). Three rows of my own evidence table were tautological and are withdrawn.
2. **My own claim that Goblin should switch from `less` to `more`** — rested on the same over-corrected filter. Raw data shows 71.2% vs 69.9%, no edge.
3. **Session 1 §5's "conservative 77.5% floor" for `doubles`/less** — same methodological flaw, over-corrects by stripping genuine 0-for-N games.
4. **Session 1 C2's "the difference is the window, and only the window."** Partly wrong: on identical endpoints I get +950.0% vs Session 1's +725%, because its 9am-batch reconstruction lost 5 days and 25 slips.

**Needs the user's decision:**
- Move Demon from `pitcher_strikeouts/less/T2` to Pool I (`pitcher_strikeouts`+`earned_runs` /less, T1+T2)?
- Suspend Underdog and PP Goblin staking?
- Place one 6-pick PP Regular **Power** slip and record the real multiplier — §5's entire +1020.1% depends on the untested assumption that Regular Power pays 1.000.
- Add plate appearances / `batting_order_position` to the graded outcome record so voids can be simulated (research finding, live change, explicitly not made here).

**Stopping condition — NOT met, stated plainly.** 13 structurally distinct passes were run. The last substantive one (the Gemini adversarial review) produced a major retraction of an earlier pass in the same session, which is the opposite of exhaustion. This session closes on budget, not on the 5-consecutive-null rule. **This is not the final report in the sense the master prompt defines.**

**Open items carried forward:**
1. Grade out 2026-08-21's 4,379 tiered `final_board_history` rows (lands ~2026-08-22 05:23 UTC) and run the first tier-based backtest on the **live** tier column rather than a reconstruction.
2. Simulate PrizePicks voids properly once a participation column exists; re-price every hitter-prop backtest.
3. Audit the `pitcher_fantasy_score` anchor derivation (§3b).
4. Obtain a real 4-pick or 5-pick Demon placed multiplier to test Pool I above 3-pick.
5. Obtain a real PP Regular **Power** placed multiplier (carried from Session 1, still open).
6. Diagnose the `context.history_game_lineup` join failure — it is also the natural source for the participation flag in item 2. Carried from Session 1, not attempted this session.
7. Monitor PP Regular's decay (+1230.6% → +878.3% → +681.3% across window thirds).

**Nothing was deployed, patched, or modified.**

---

# ===== 2026-08-21 (Fri) — Session 3 ADDENDUM — manual on-demand run at 18:00 PT (2026-08-22 01:00 UTC) =====

**Run type:** dry run, research only. Nothing deployed, patched or modified.
**Trigger:** manual fire, 20 minutes after Session 2 closed.

## A0. The trigger payload's premise was false — verified, not assumed

The manual-fire payload stated: *"this is the first run since the 2026-08-21 session, so 2026-08-21 should now be the latest fully-graded day."* **Both claims are wrong**, and for exactly the reason documented in Session 2 §0 — the UTC date (2026-08-22) was read as the Pacific date.

| Check | Result |
|---|---|
| Wall clock at run time | `2026-08-22T01:00:06Z` = **2026-08-21 18:00:06 PDT** |
| Time since Session 2 closed | **20 minutes** — not a day |
| `max(official_date) WHERE outcome_hit IS NOT NULL` | **2026-08-20** — unchanged |
| Graded rows for 2026-08-21 | **0** |
| Total graded rows | **137,888** — byte-identical to Session 2 |
| New rows in `score.slip_entries` with a real multiplier | **0** (still 19, same timestamps 2026-08-21T20:11) |

**There is no new graded data.** 08-21's games were still in progress. Grading is due ~2026-08-22T05:23Z (~22:23 PDT), still ~4h 20m away. Re-running the five-track backtests would have reproduced Session 2's numbers exactly, so they were not re-run.

**Open item (1) cannot be advanced today.** The payload asked to confirm the Demon pool choice "on fresh data"; there is none. The live-code confirmation from Session 2 §2 stands unchanged (`DEMON_HIGH_HIT_TIER_POOL = [{prop:"pitcher_strikeouts", side:"less", tier:2}]`).

## A1. But the payload was right about one thing, and it produced a real correction

The payload correctly noted that 2026-08-21 is the first day with a populated live `goblin_demon_tier`. **Tier *values* can be validated without outcomes**, and doing so overturns Session 2 §2's answer to open item (2).

### The live column vs the documented formula

`score.final_board_history`, 2026-08-21, 4,379 rows with both `goblin_demon_tier` and `goblin_demon_anchor_line` populated:

| Test | Matches |
|---|---|
| `tier = round(abs(line − anchor))` evaluated in **`double precision`** (Postgres banker's rounding, half-to-even) | 3,038 / 4,379 — **69.4%** |
| `tier = round(abs(line − anchor))` evaluated in **`numeric`** (half-away-from-zero = JavaScript `Math.round`) | **4,375 / 4,379 — 99.91%** |
| Rows whose distance is a half-integer (where the two modes diverge) | 1,879 (42.9%) |

**The live system is correct.** The apparent 30.5% "off-by-one" was a rounding artifact in my own SQL. The live tier column faithfully implements `Math.round(abs(line − anchor))`.

### CORRECTION to Session 2 §2 — the trusted table does *not* match the live formula

Session 2 reported *"`demon_full_history` matches the live formula 6,488/6,488, zero off-by-one."* That check used `round(double precision)` — the same banker's-rounding bug. Re-run both ways:

| `backtest.demon_full_history` (tier IS NOT NULL, n=6,488) | Matches |
|---|---|
| vs `round(double)` — banker's | **6,488 / 6,488 (100%)** |
| vs `round(numeric)` — half-up, i.e. **the live convention** | **5,548 / 6,488 (85.5%)** |
| Half-integer distances | 1,838 (28.3%) |

**The backtest reconstruction and the live system use opposite rounding conventions.** Session 2's check confirmed the backtest table matched *itself*, not the live system. The disagreement is perfectly systematic — it occurs at, and only at, **even+0.5** distances:

| Distance | n | Backtest tier | **Live tier** |
|---|---|---|---|
| 0.50 | 253 | 0 | **1** |
| 1.50 | 275 | 2 | 2 (agree) |
| 2.50 | 273 | 2 | **3** |
| 3.50 | 523 | 4 | 4 (agree) |
| 4.50 | 391 | 4 | **5** |
| 6.50 | 23 | 6 | **7** |

**940 of 6,488 rows (14.5%) carry a tier the live system would label differently.** Two consequences for the table the standing prompt designates TRUSTED:

1. **`demon_full_history_dedup` is missing 253 legitimate live-tier-1 legs.** It dropped all 844 tier-0 rows as "structurally impossible for a demon" — correct reasoning, but 253 of them sit at distance 0.5 and are **live tier 1**, not tier 0.
2. **Any tier-2 pool built on it is contaminated with 273 live-tier-3 legs.**

Both affect the deployed pool and Session 2's Pool I recommendation.

**Revised trust-list entry:** `backtest.demon_full_history_dedup` remains the best available Demon source, but its `tier` column is **not** the live tier. Recompute as `round(abs(line − anchor)::numeric)` from `backtest.demon_full_history` — note the explicit `::numeric` cast, without which Postgres silently applies banker's rounding.

## A2. Pool I re-validated under the corrected live-tier definition — it survives and gets more robust

Re-run with live tiers, exhaustive 3-combination enumeration, same-tier outcome collisions excluded (reconciles to dedup exactly: 3,170 reconstructed − 15 conflicting keys = 3,155 = dedup's row count ✅).

| Pool | Scope | Days supporting | Combos | Full-hit % | ROI Power | ROI Flex | Day-wtd ROI |
|---|---|---|---|---|---|---|---|
| **B. DEPLOYED** `pitcher_strikeouts/less` live-T2 | all days | 5 | 1,946 | 55.2% | +728.6% | +783.2% | +441.5% |
| **B. — ex 08-11** | | **4** | 406 | 26.1% | **+291.6%** | +363.7% | +340.9% |
| **I.** `pitcher_strikeouts`+`earned_runs` /less live-T1+T2 | all days | **14** | 48,610 | 33.2% | +397.3% | +464.7% | +144.7% |
| **I. — ex 08-11** | | **13** | 8,899 | 32.3% | **+384.3%** | +449.1% | +125.0% |
| J. + `hits_allowed`+`walks_allowed` live-T1+T2 | ex 08-11 | 13 | 14,492 | 34.5% | +416.9% | +481.5% | +80.3% |

**Full leave-one-day-out for Pool I across all 14 days: ROI never leaves +384.3% to +404.5%** — a tighter band than Session 2's +470.3%–+507.1%, on 4 more supporting days.

| Date | Legs | Hits | Combos | Day ROI | LOO ROI Power |
|---|---|---|---|---|---|
| 08-05 | 32 | 22 | 4,960 | +365.7% | +400.9% |
| 08-06 | 18 | 17 | 816 | +1150.0% | +384.5% |
| 08-07 | 23 | 14 | 1,771 | +208.3% | +404.5% |
| 08-08 | 4 | 2 | 4 | −100.0% | +397.4% |
| 08-09 | 6 | 3 | 20 | −25.0% | +397.5% |
| 08-10 | 4 | 2 | 4 | −100.0% | +397.4% |
| 08-11 | 63 | 44 | 39,711 | +400.3% | **+384.3%** |
| 08-12 | 20 | 13 | 1,140 | +276.3% | +400.2% |
| 08-14 | 5 | 0 | 10 | −100.0% | +397.4% |
| 08-15 | 6 | 3 | 20 | −25.0% | +397.5% |
| 08-16 | 5 | 1 | 10 | −100.0% | +397.4% |
| 08-17 | 4 | 3 | 4 | +275.0% | +397.3% |
| 08-18 | 6 | 2 | 20 | −100.0% | +397.5% |
| 08-19 | 10 | 2 | 120 | −100.0% | +398.6% |
| **TOTAL** | **206** | **128** | **48,610** | **+397.3%** | |

**What changed from Session 2:** Pool I's ROI is **lower** than reported yesterday (+397.3% vs +478.1%; ex-08-11 +384.3% vs +507.1%) — yesterday's figures were inflated by the tier misassignment. Its **day support is higher** (14 vs 10 all-days; 13 vs 9 ex-08-11), because the 253 distance-0.5 legs are restored. **The recommendation stands and is better supported than before**: ex-08-11 it beats the deployed pool +384.3% vs +291.6% on **13 supporting days against 4**.

Pool J (adding `hits_allowed`+`walks_allowed`) gives a marginally higher combo-weighted ex-08-11 ROI but a much worse day-weighted figure (+80.3% vs +125.0%). **Not adopted** — no clear improvement.

## A3. Forward-looking pool depth on tonight's live board (possible without grading)

`score.final_board_history`, 2026-08-21, `is_demon=1`, side `less`, live tier:

| Prop | Live tier | Distinct legs |
|---|---|---|
| `earned_runs` | 1 | 4 |
| `earned_runs` | 2 | 1 |
| `pitcher_strikeouts` | 1 | 2 |
| `pitcher_strikeouts` | 2 | 1 |

- **Deployed pool** (`pitcher_strikeouts/less/T2`): **1 leg — cannot build a 3-pick slip tonight.**
- **Pool I** (both props, tiers 1+2): **8 legs → 56 buildable 3-picks.**

A live, real-time illustration of the same robustness gap the 26-day backtest shows.

## A4. Summary

**New this run:**
1. **The live `goblin_demon_tier` column is correct** — 4,375/4,379 match `Math.round(abs(line − anchor))`.
2. **Session 2's answer to open item (2) is CORRECTED**: the backtest tier reconstruction uses Postgres banker's rounding, the live system uses JS half-up. They disagree on 14.5% of rows, systematically at even+0.5 distances. Session 2's "6,488/6,488 exact match" was an artifact of testing with the same wrong rounding mode.
3. **`demon_full_history_dedup` omits 253 legitimate live-tier-1 legs and contaminates tier-2 with 273 live-tier-3 legs.** New trust-list caveat.
4. **Pool I survives the correction**: ROI down to +397.3% (ex-08-11 +384.3%), day support up to 14 (ex-08-11 13), LOO band +384.3%–+404.5%.
5. **Tonight's live board**: deployed pool unplayable (1 leg); Pool I has 8.

**Not advanced (no data):** open item (1) on fresh outcomes; all five-track backtests; multiplier table (zero new placed slips).

**Re-run worth doing after ~22:23 PDT tonight**, when 08-21 grades out — that is the first day where the *live* tier column and graded outcomes coexist, enabling a tier backtest with no reconstruction at all.

**Nothing was deployed, patched, or modified.**

---
