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
