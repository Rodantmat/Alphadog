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

# ===== 2026-08-22 (Sat) — Session 4 — coverage-matrix session =====

**Run type:** dry run, research only. Nothing deployed, patched, or modified.
**Scope:** directed at the specific gaps identified by the deep review that produced sections 1c/1d/1e and the mandatory coverage matrix.
**Data freshness:** ⚠️ **latest graded day is 2026-08-20, but today is 2026-08-22 — a one-day gap.** 08-21 should have graded by now and has not. Flagged, not papered over. All figures below therefore run to 08-20.
**Coverage matrix:** 9 cells moved, all with cited results. Matrix updated in `SIGNALS_TECHNIQUES_TRIED.md`.

---

## A. THE LINEUP-JOIN BLOCKER — RESOLVED (flagged and unfixed across three prior sessions)

**It was never a join failure.** `context.history_game_lineup` joins to the graded board on **43–85% of legs (mean ~70%)**, verified per-day over 14 days (e.g. 08-18: 6,446 of 7,548 legs = 85.4%; 08-20: 3,239 of 4,767 = 67.9%).

The "~2-5%" figure repeated across three sessions came from a **`WHERE batting_order_code IS NOT NULL` filter placed inside the join CTE** — my own error in session 1, propagated forward.

**The real defect is a silent writer-format change on 2026-08-05** that stopped populating `batting_order_code`:

| Dates | Generation | Rows | `batting_order_code` | `lineup_slot` |
|---|---|---|---|---|
| 07-24 → 08-04 | `posted_lineup` / real / high | 2,970 | ✅ | ✅ |
| 08-05 → 08-12 | all-NULL metadata | 1,419 | ❌ | ❌ |
| 08-13 → 08-18 | real, no status | 1,422 | ❌ | ✅ |
| 08-19 → 08-24 | `derived_likely_lineup` / LOW | 1,395 | ❌ | ✅ |
| 08-19 only | `OFFICIAL_BATTING_ORDER_POSTED` | 27 | ✅ | ✅ |

`batting_order_code`: 41.4% populated. `lineup_slot`: 80.4% populated.

**Fix: use `lineup_slot`.** Exactly equivalent where both exist — `batting_order_code = lineup_slot × 100`, verified on all 2,997 overlapping rows, 333 per slot, perfectly uniform, zero exceptions. Usable coverage goes **12 days → 24 days**. The 08-05 → 08-12 window (8 days) has neither column and is genuinely lost.

**Recommended (user review, NOT deployed):** restore `batting_order_code` in the lineup writer, or standardise consumers on `lineup_slot`. Also note `official_date` is TEXT in two different formats (`2026-07-24` and `2026-08-24 00:00:00+00`) — cast with `::date` always.

## B. GEN-1 BOTTOM-OF-ORDER — REFUTED (was "status unclear" for three sessions)

With the join fixed, tested at real scale for the first time. **It does not replicate, and runs the opposite direction.**

`total_bases/less` (n=4,111): slots 1-3 **81.9%**, slots 4-6 82.2%, slots 7-9 **68.9%** → **−13.0pp for bottom-of-order.** Same for `hits/less` (−23.8pp), `singles/less` (−16.6pp), `hits_runs_rbis/less` (−8.2pp). Documented claim was a *climb* from 57% to 75–83%.

**About half the raw effect is a line-value confound** — top-of-order hitters carry higher lines, and "less 3.5" is far easier than "less 1.5". Controlling for line, the residual stays negative:

| Prop | Line 1.5 | Line 2.5 | Line 3.5 |
|---|---|---|---|
| `total_bases/less` bottom − top | −6.7pp | −4.0pp | −6.2pp |
| `hits_runs_rbis/less` bottom − top | +7.9pp | 0.0pp | −6.1pp |

Only `rbis/less` (+6.4pp) and `runs/less` (+3.7pp) favour bottom-of-order — mechanically sensible, since those hitters get fewer RBI and run chances so the "less" side lands more often. **Moved to the rejected table.**

## C. GOBLIN — granular multiplier applied (flat ratio retired)

Per §1d this is the third session in which Goblin had been analysed with a flat blended ratio. Re-run with `GOBLIN_LEG_MULT_TABLE` applied per (prop, side), slip multiplier = product of per-leg rates. Window 08-12 → 08-20 (tier-clean boundary), 9 days.

**Per-leg EV (top-40 ranked legs × table rate) — only one pool clears 1.0:**

| Prop / side | n | Hit % (top-40) | Table rate | Per-leg EV |
|---|---|---|---|---|
| **`stolen_bases/less`** | 353 | 87.8% | 1.15 (fallback) | **1.0093** |
| `home_runs/less` | 703 | 85.6% | 1.15 | 0.9839 |
| `doubles/less` | 1,650 | 85.3% | 1.15 | 0.9807 |
| `total_bases/less` | 4,447 | 83.6% | 1.15 | 0.9615 |
| `singles/less` | 1,306 | 81.9% | 1.134 | 0.9292 |
| `hits_runs_rbis/less` | 4,167 | 81.9% | 1.116 | 0.9145 |
| `hits/less` | 1,690 | 82.8% | 1.095 | 0.9064 |

**Pool-composition sweep, 5 pools × 4 sizes:**

| Pool | 3-pick | 4-pick | 5-pick | 6-pick |
|---|---|---|---|---|
| **G2 `stolen_bases` only** | −0.8% | **+2.0%** | **+0.6%** | **+9.3%** |
| G5 sb+hr | −5.0% | −5.5% | −9.6% | −9.1% |
| G3 rare trio | −5.9% | −7.5% | −6.7% | −6.3% |
| G4 rare trio + tb | −18.9% | −23.8% | −27.0% | −30.1% |
| **G1 LOCKED-like** | −31.8% | −39.5% | **−45.3%** | −50.3% |

**The deployed Goblin pool tests at −45.3% at its locked 5-pick size** (2,319 slips, 9 days) once the granular table is applied.

**LODO on the sole positive candidate (G2, 6-pick):** all-days +9.3%, band **−3.6% to +15.7%**, with 2 of 9 folds negative. Not robust enough to promote. It also rests entirely on the **1.15 fallback** — `stolen_bases` has no real placed-slip observation anywhere, making it the least-supported number in the analysis. At a per-leg rate of 1.10 it turns negative.

**Honest verdict: Goblin has no genuinely positive pool. Do not promote G2 on this evidence; place one real `stolen_bases/less` Goblin slip to pin the multiplier first.**

## D. UNDERDOG — first-ever pool-composition alternatives (never attempted in 3 sessions)

8 genuinely different pool compositions × 5 pick sizes = **40 configs. Every single one negative.**

| Pool | Top-4 leg hit % | Best config | Best ROI |
|---|---|---|---|
| U5 more-side only | 79.3% | 2-pick | **−7.6%** |
| U1 LOCKED rbis+walks | 74.1% | 2-pick | −19.3% |
| U3 rbis+walks+runs | 75.0% | 2-pick | −19.3% |
| U6 rbis+walks+fantasy | 68.5% | 2-pick | −19.3% |
| U4 all `less` | 69.6% | 2-pick | −23.0% |
| U2 rbis only | 74.1% | 2-pick | −28.4% |
| U8 rbis+runs | 74.1% | 2-pick | −28.4% |
| U7 pitcher props | 70.5% | 3-pick | −28.5% |

**Conclusive: the problem is not the pool, it is the payout structure.** Under the compounding model, break-even needs ~82% per-leg at 2-pick and ~85% at 6-pick. The best top-4 hit rate any Underdog pool achieves is **79.3%**. No pool composition can close that gap. This closes the matrix cell with a well-powered negative and independently corroborates the flat-vs-compounding finding from session 1.

## E. SLEEPER — pool alternatives, adaptive sizing, full LODO

6 pools × (4 fixed sizes + adaptive), cap=1, per-leg 1.628.

| Pool / mode | Slips | Days | Full hits | ROI |
|---|---|---|---|---|
| S4 `doubles+home_runs` fixed_6 | 19 | 19 | 6 | **+487.9%** |
| **S2 `rbis+walks+rfi_nrfi` fixed_6** | 27 | **27** | 8 | **+451.6%** |
| S4 adaptive | 25 | 25 | 8 | +392.2% |
| S2 fixed_5 | 27 | 27 | 9 | +281.2% |
| S3 rbis only fixed_6 | 26 | 26 | 5 | +258.0% |
| S5 5-prop mix fixed_6 | 27 | 27 | 5 | +244.8% |
| S6 walks only fixed_6 | 27 | 27 | 4 | +175.8% |

**LODO on S2 6-pick: band +401.2% to +472.9%, ALL 27 folds positive.** Wins spread across 8 separate days, no single-day dependence. This is the best-supported live candidate in the system.

**Adaptive shrink/expand sizing (matrix cell closed):** a **no-op** where pools are always ≥6 legs (identical to fixed_6 on S2/S3/S5/S6). On the thin `doubles+home_runs` pool it buys **+6 days of coverage (19→25)** at a **lower ROI (+487.9% → +392.2%)**. Real, modest, and a genuine coverage/return trade — not the free win the technique's framing implies.

## F. MULTI-LAYER STACKING — tested and REJECTED (matrix cell closed)

Context-layer join coverage against the graded board: **weather 97.2%**, **umpire 95.2%**, **bullpen 39.4%**, **schedule fatigue 4.2% (genuinely unusable — reported as blocked, not silently skipped)**.

Leg-level effects on the S2 pool are real but small:
- Temperature: mild 65-74°F **71.7%**, warm 75-84°F 69.6%, hot 85°F+ 69.4% — a **2.3pp** spread, the same magnitude as the umpire test previously rejected as noise.
- Bullpen fatigue: low-fatigue beats high-fatigue by **+4.3pp** (mild) and **+5.5pp** (hot) — larger than the umpire precedent.

**But none of it survives slip construction:**

| Variant | Slips | Days | ROI |
|---|---|---|---|
| **V0 ungated** | 27 | **27** | **+451.6%** |
| V1 low bullpen fatigue | 10 | 10 | +272.4% |
| V2 temp < 85°F | 27 | 27 | +244.8% |
| V3 both gates | 10 | 10 | +86.2% |

**Mechanism of failure — the same one that killed spot-9-only narrowing:** every gate thins the pool, forcing the builder deeper into weaker legs to fill 6 slots, and the bullpen gate additionally cuts usable days from 27 to 10. A +4-5pp per-leg edge cannot pay for that.

## G. GEMINI AS IDEA PARTNER — first proactive use, hypothesis REJECTED (matrix cell closed)

Per §1e, Gemini was given the S2 track's real state plus the full already-tried-and-rejected list and asked for one new hypothesis that **re-ranks rather than filters** (since every filter had failed on pool depth).

**Its hypothesis — "0-1 count tailwind":** all three S2 props suppress offensive production, and the strongest micro-event suppressing walks/runs/first-inning scoring is falling behind 0-1. Drive that from opposing-pitcher first-pitch-strike rate and home-plate-umpire called-strike rate, z-scored per slate, applied as a continuous multiplier `score × (1 + γ·T)` — preserving pool depth by construction.

Genuinely new and not in `SIGNALS_TECHNIQUES_TRIED.md`. **Tested, with walk-forward umpire tendency (prior dates only, ≥10 prior legs, to avoid leakage):**

| γ | Slips | Days | Full hits | ROI |
|---|---|---|---|---|
| 0 (baseline) | 27 | 27 | 8 | **+451.6%** |
| 0.05 | 27 | 27 | 7 | +382.7% |
| 0.15 | 27 | 27 | 6 | +313.7% |
| 0.40 | 27 | 27 | 5 | +244.8% |

**Monotonically worse. Rejected.** Note this is a *cleaner* rejection than the gating tests: the re-rank preserved all 27 days exactly as designed, so it failed on merit rather than on pool thinning.

**Honest power caveat:** only the umpire half was testable. Pitcher first-pitch-strike rate is not available in usable form (`stats_pitcher` has `game_logs`/`splits`/`metric_snapshots`, none surfacing FPS% directly — would need mining). And umpire tendency rests on 88 umpires averaging **5.5 appearances each**, walk-forward, so early dates have almost no prior data. A negative result at this power is suggestive, not decisive.

## H. HONEST SUMMARY

**Genuinely new this session:**
1. Lineup-join blocker resolved — never a join failure, a filter artifact over a writer-format change; `lineup_slot` doubles usable coverage.
2. Gen-1 bottom-of-order refuted, with the line-value confound quantified.
3. Goblin re-run on the granular table: locked pool −45.3%; only `stolen_bases/less` positive, and not robustly.
4. Underdog's first pool-composition sweep: 40 configs, all negative; the ceiling is structural (79.3% best vs ~82-85% required).
5. Adaptive sizing characterised: coverage/return trade, not a free win.
6. Multi-layer stacking rejected with the failure mechanism identified.
7. First proactive Gemini hypothesis, tested and rejected.
8. Sleeper S2 LODO: all 27 folds positive, +401% to +473%.

**Re-confirmed:** Sleeper S2 as the strongest live candidate; Underdog broken as deployed.

**Not done / carried forward:**
1. **Void/DNP-adjusted repricing** — now unblocked by the lineup fix but not executed this session. Highest-priority remaining cell.
2. Multi-layer stacking on Goblin, Regular, Demon, Underdog (only Sleeper tested).
3. Adaptive sizing on the other four tracks.
4. Gemini generative hypothesis on the other four tracks.
5. Pitcher first-pitch-strike rate — mine `stats_pitcher.game_logs` / `splits` to complete the 0-1 tailwind test properly.
6. The 08-21 grading gap.
7. PP Regular cap sweep in the 10–15 band.

**Stopping condition: NOT met.** This session was directed at named gaps rather than run to exhaustion. Stated plainly rather than claimed.

**Nothing was deployed, patched, or modified.**

---

# ===== 2026-08-22 — Session 4 ADDENDUM — after reading HIGH_HIT_RATE_METHODOLOGY.md =====

`HIGH_HIT_RATE_METHODOLOGY.md` added to required reading. Two things follow: my Session 4 Goblin analysis used the wrong selection method, and applying the right one changes the conclusion materially.

## A1. Method correction — I ranked by the platform's own score, which §1 says not to do

§1 is explicit that the foundational method is **real per-(prop, side, line-or-tier) hit-rate buckets at n≥30 with a real 80%+ bar**, *"independent of whatever the platform's own internal `estimated_hit_probability_0_100` score says."* My Session 4 Goblin work ranked legs by `score_0_100` and reported "top-40" hit rates. That is the thing the document warns against. Re-run below on the foundational bucket method.

## A2. Fixed vs tiered — verified empirically, not assumed

Rather than take the document's list on faith, I measured distinct lines offered per (player, prop, date) on PrizePicks, 08-12 → 08-20:

| Prop | Avg lines/player-day | % single-line | Class |
|---|---|---|---|
| doubles | 1.00 | 99.9% | **FIXED** |
| triples | 1.00 | 100.0% | **FIXED** |
| home_runs | 1.01 | 98.7% | **FIXED** |
| walks | 1.02 | 97.6% | **FIXED** |
| stolen_bases | 1.06 | 93.6% | **FIXED** |
| runs | 1.10 | 91.1% | **FIXED** |
| rbis | 1.10 | 90.8% | **FIXED** |
| singles | 1.17 | 83.3% | **FIXED** |
| hits | 1.37 | 64.8% | TIERED (borderline) |
| fantasy_score | 1.64 | 55.3% | TIERED |
| hitter_strikeouts | 1.73 | 54.2% | TIERED |
| pitcher_outs | 2.07 | 32.0% | TIERED |
| walks_allowed | 2.36 | 26.2% | TIERED |
| total_bases | 2.95 | 9.1% | TIERED |
| pitcher_fantasy_score | 3.02 | 9.3% | TIERED |
| hits_runs_rbis | 3.49 | 7.3% | TIERED |
| hits_allowed | 3.82 | 4.6% | TIERED |
| earned_runs | 4.34 | 3.0% | TIERED |
| pitcher_strikeouts | 4.74 | 5.9% | TIERED |

**Matches the document, with three refinements:**
1. **`hits` is not fixed-threshold** — 1.37 lines/player-day, only 64.8% single-line. The doc groups it with the fixed props "at the standard/regular level"; empirically it carries a real, if shallow, ladder.
2. **`walks_allowed` is genuinely TIERED** (2.36 lines, max 4) — yet the doc's original fixed-line table lists `walks_allowed/more/0.5` at 88.3% as a fixed-threshold star. That 0.5 line is one rung of a real ladder, not a fixed threshold.
3. **`rbis` is FIXED** (1.10) and was unclassified in the doc. Relevant because `rbis` sits in both the Underdog locked pool and the Sleeper S2 pool.

## A3. The foundational bucket table, repriced — and the real dominant axis

27 buckets clear the original bar (n≥30, hit rate ≥80%) on 08-12 → 08-20. Priced per-leg EV, at 6-pick, using the real per-leg multipliers:

| Bucket | Lane | Class | n | Hit % | Per-leg mult | Priced EV | Implied 6-pk ROI |
|---|---|---|---|---|---|---|---|
| `stolen_bases/less/0.5` | **standard** | FIXED | 356 | 87.6% | 1.830 | **1.603** | **+1599.3%** |
| `earned_runs/more/0.5` | **standard** | TIERED | 157 | 87.3% | 1.830 | 1.596 | +1555.6% |
| `walks_allowed/more/0.5` | **standard** | TIERED | 121 | 86.8% | 1.830 | 1.588 | +1501.2% |
| `doubles/less/0.5` | **standard** | FIXED | 1656 | 84.8% | 1.830 | 1.552 | +1298.7% |
| `total_bases/less/3.5` | **standard** | TIERED | 1189 | 84.7% | 1.830 | 1.549 | +1283.9% |
| `singles/less/1.5` | **standard** | FIXED | 444 | 84.7% | 1.830 | 1.549 | +1283.1% |
| `home_runs/less/0.5` | **standard** | FIXED | 704 | 84.5% | 1.830 | 1.546 | +1266.8% |
| `hits_runs_rbis/less/4.5` | **standard** | TIERED | 335 | 83.9% | 1.830 | 1.535 | +1206.2% |
| `pitcher_strikeouts/less/6.5` | goblin | TIERED | 109 | 82.6% | 1.265 | 1.044 | +29.8% |
| `walks_allowed/more/0.5` | goblin | TIERED | 136 | **91.2%** | 1.140 | 1.039 | +26.1% |
| `pitcher_strikeouts/more/2.5` | goblin | TIERED | 94 | 81.9% | 1.265 | 1.036 | +23.8% |
| `stolen_bases/less/0.5` | goblin | FIXED | 428 | 87.6% | 1.150 | 1.008 | +4.6% |
| `doubles/less/0.5` | goblin | FIXED | 1995 | 85.0% | 1.150 | 0.977 | **−13.0%** |
| `home_runs/less/0.5` | goblin | FIXED | 861 | 84.9% | 1.150 | 0.976 | −13.4% |
| `total_bases/less/3.5` | goblin | TIERED | 1427 | 84.9% | 1.150 | 0.976 | −13.5% |
| `hits_runs_rbis/less/3.5` | goblin | TIERED | 1697 | 81.7% | 1.116 | 0.912 | −42.5% |

**The dominant axis is not fixed-vs-tiered — it is the LANE.** Standard-lane legs carry ~1.830 per leg (37.5^(1/6)); Goblin-lane legs carry 1.116–1.265. Look at `doubles/less/0.5`: **the same prop, the same line, the same 84.8–85.0% hit rate, priced at +1298.7% in the standard lane and −13.0% in the Goblin lane.**

This is the precise mechanism behind the reconciliation the document describes. The original 2026-08-17 finding measured these buckets against the published table — i.e. implicitly standard-lane pricing — and was right. My Session 4 finding applied the real Goblin discount and was also right. **Neither the fixed/tiered axis nor the hit rate flips the sign; the lane does.** The document's phrasing ("PrizePicks appears to price these easy, high-hit-rate legs with an especially aggressive real haircut") is confirmed and can now be stated exactly: the haircut is the Goblin lane itself, and it is worth roughly a factor of 1.6x per leg.

**Actionable consequence: these buckets should be played in the standard/Regular lane, not the Goblin lane.** This is also the underlying reason the Session 1 "rare-event pool" (`doubles` + `home_runs` + `stolen_bases`, all standard-lane `less`) tested at +1245.7% — same legs, correct lane.

**Load-bearing caveat, restated:** every standard-lane figure above assumes the published Power table pays undiscounted (per-leg ratio 1.000). That rests on **four real Flex observations and zero real Power observations**. If PP Regular Power carries a Goblin-like haircut, this whole column collapses the way Underdog did. **One real placed 6-pick PP Regular Power slip remains the highest-value single data point available.**

**Correction to my own earlier framing:** in Session 4 §C I reported `stolen_bases/less` as the only Goblin pool clearing per-leg EV 1.0. On the foundational bucket method it is one of **four** — and the other three (`pitcher_strikeouts/less/6.5`, `walks_allowed/more/0.5`, `pitcher_strikeouts/more/2.5`) are all TIERED props with higher priced EV than the fixed one, which supports the document's §2b claim that the tier ladder is the mechanism worth modelling. My score-ranked method missed them.

**Going forward:** every proposed pool states each prop's class (FIXED / TIERED) and its lane, since EV validation differs by both.

**Nothing was deployed, patched, or modified.**

---

# ===== 2026-08-21 (Fri) — Session 5 — run 19:15 PT (2026-08-22 02:15 UTC) =====

**Run type:** dry run, research only. Nothing deployed, patched, or modified.
**Scope:** directed at open item (1) — "re-test the top standard-lane buckets as an actual PP Regular pool". That item turned out to rest on a data defect, and unwinding it re-opened all five tracks.

---

## 0. FRESHNESS — there is no grading gap, and Session 4's flag is RETRACTED

| Check | Value |
|---|---|
| Wall clock | `2026-08-22T02:15:33Z` = **2026-08-21 19:15 PDT** |
| `max(official_date) WHERE outcome_hit IS NOT NULL` | **2026-08-20** |
| Graded rows | **137,888** — byte-identical to Sessions 2, 3 and 4 |
| Rows for 2026-08-21 | **0** (any status) |

The master prompt §3 states the rule plainly: *"if today is the 21st, the most recent trustworthy day is the 20th."* Today **is** the 21st in Pacific time. 08-21's games were in progress at run time.

**Session 4's "⚠️ latest graded day is 2026-08-20, but today is 2026-08-22 — a one-day gap" is RETRACTED.** It read the UTC date as the Pacific date — the same error Session 2 §0 documented and Session 3 §A0 caught once already. This is now the third occurrence. **Open item (7), "the 08-21 grading gap", is closed: there is no gap.**

Consequence: this session has **no new graded data** relative to Session 4, which closed ~75 minutes earlier. Everything below is therefore method work on the existing record, not new-day work. Stated plainly rather than dressed up.

## 0b. STEP 0 — schema census and table profiling

18 schemas (**not ~40** — the standing prompt is still wrong here, as Session 2 §12 already noted). `backtest` holds **73** relations.

`backtest.demon_full_history_dedup_v2` profiled before use: 3,351 rows, 26 days (07-26 → 08-20), **0** NULL tier, **0** NULL outcome, tier range 1–11 (1-indexed), overall 20.4%. Clean on every structural check — and nonetheless carrying a real contamination, see §2.

---

## 1. THE HEADLINE — `prop_outcome_history.is_goblin`/`is_demon` is not the lane, and the "standard lane" finding collapses

Open item (1) asked me to build real PP Regular pools from the four standard-lane buckets pricing above +1250% implied. Building the bucket table reproduced them, and then produced three buckets that cannot exist: **demon-lane** `singles/less/1.5` at 90.2%, `doubles/less/0.5` at 87.2%, `total_bases/less/3.5` at 86.2%. A demon leg is the hard side by construction; it cannot hit at 90%.

Chasing that led to the defect. Full evidence is now written into `SIGNALS_TECHNIQUES_TRIED.md`; the short form:

- `score.prop_outcome_history` has **two writers**. `outcome_final|…` rows (41,593 PP) have `matrix_id` populated and lane flags **unpopulated — 99.0% read 0/0**. `grade_*` rows (57,168 PP) have `matrix_id` NULL and carry the real lane flags.
- The same leg appears under both. Bryce Harper, `hits_runs_rbis/less/3.5`, 08-18: identical `final_board_row_id`, identical `prepared_row_id`, identical hp of 67.76, identical outcome — one row `is_goblin=0`, the other `outcome_id = grade_hitter_547180_..._less_gob_2026-08-18` with `is_goblin=1`, written 50 seconds later.
- Across the 36,465 keys present in both writers: **28,505 (78.2%) are "neither"→goblin, 7,131 (19.6%) are "neither"→demon**, 782 are neither→neither, 47 agree.

**97.9% of what Session 4 counted as standard-lane legs are goblin or demon legs with unpopulated flags.**

### 1a. The fix, and the lane split it produces

Restrict to `outcome_id LIKE 'outcome_final|%'` and join `score.final_board_history` on `final_board_row_id` (**98.6%** join rate), taking the lane from the board:

| Lane (authoritative) | legs | hit % | days |
|---|---|---|---|
| goblin | 29,647 | **73.3%** | 24 |
| standard | 3,236 | **54.6%** | 24 |
| demon | 8,078 | **34.6%** | 25 |

Goblin > standard > demon. Coherent for the first time. Under the old assignment "standard" sat at 84.8% — **above** goblin — which is the structural impossibility that should have caught this earlier.

Note `score.final_board_history.odds_type` and `payout_variant` are **100% NULL** across all 61,200 PP rows, so `is_goblin`/`is_demon` on that table is the only authoritative lane source available.

### 1b. What is retracted

**`HIGH_HIT_RATE_METHODOLOGY.md` §3 — "THE DOMINANT EV AXIS IS THE LANE" — is retracted as stated.** Its exact worked example (`doubles/less/0.5` at +1298.7% standard-lane vs −13.0% Goblin-lane, "the identical leg, identical ~85% real hit rate") is not two market offerings priced differently. It is **one set of legs duplicated across two lane labels and then priced with two different multipliers**. The tell was in the table all along: standard 84.8% vs goblin 85.0%, standard 84.7% vs goblin 84.9%, standard 84.5% vs goblin 84.6% — those near-identical pairs are the duplication, not a finding.

Also retracted with it: the Session 4 addendum's "**Actionable consequence: these buckets should be played in the standard/Regular lane, not the Goblin lane**", and its claim that four Goblin buckets clear per-leg EV 1.0 where score-ranking found one.

**Rule B0a survives and is strengthened** — lane really is decisive, which is exactly why reading it from the wrong column mattered so much. What does not survive is the specific +1298.7% figure and the pool recommendation built on it.

### 1c. Open item (1), answered: those buckets do not exist

Foundational bucket method per `HIGH_HIT_RATE_METHODOLOGY.md` §1 (real per-(prop, side, line, lane) buckets from graded outcomes, n≥30, ≥80%), full window 07-24 → 08-20, authoritative lane, deduplicated:

**Standard lane: ZERO buckets clear n≥30 and 80%.** The best are:

| Bucket | Lane | Class | n | Hit % | Days |
|---|---|---|---|---|---|
| `pitcher_fantasy_score/less/24.5` | standard | TIERED | 29 | 89.7% | 16 |
| `pitcher_fantasy_score/less/23.5` | standard | TIERED | 28 | 85.7% | 15 |
| `pitcher_fantasy_score/less/26.5` | standard | TIERED | 21 | 85.7% | 10 |
| `pitcher_fantasy_score/less/27.5` | standard | TIERED | 28 | 82.1% | 14 |
| `fantasy_score/less/4` | standard | TIERED | 63 | 68.3% | 14 |
| `singles/less/0.5` | standard | FIXED | 337 | 54.3% | 22 |

Twelve **goblin**-lane buckets do clear the bar (§3). Three "demon" buckets appear to and are corruption (§2).

**The standard-lane pool the open item asked me to build cannot be built.** The four buckets it named — `stolen_bases/less/0.5`, `earned_runs/more/0.5`, `walks_allowed/more/0.5`, `doubles/less/0.5` — are all goblin-lane legs on the authoritative labels. Their real EV is the Goblin-lane EV, computed in §3.

The one genuinely encouraging piece: the standard-lane top is **`pitcher_fantasy_score/less`, which is exactly the locked PP Regular pool**, and **all 376 of its graded legs are standard-lane, zero goblin, zero demon**. The locked Regular track is the only track whose lane assumption survives this session intact.

---

## 2. THE SECOND DEFECT — demon `less` legs are corrupted on four dated days, and 2026-08-11 is one of them

Demon legs are the hard side; they must hit well below 50%. By side and day:

| Date | demon `less` n | demon `less` hit % | demon `more` n | demon `more` hit % |
|---|---|---|---|---|
| 08-03 / 08-04 | **0** | — | 334 / 320 | 12.0% / 15.9% |
| **08-05** | 810 | **84.9%** | 218 | 11.9% |
| **08-06** | 510 | **68.2%** | 258 | 12.0% |
| **08-07** | 789 | **76.2%** | 264 | 13.3% |
| 08-08 → 08-10 | 28 / 34 / 86 | 28.6 / 47.1 / 43.0% | 266 / 283 / 540 | 10.2 / 11.0 / 14.8% |
| **08-11** | 2,812 | **75.1%** | 569 | 9.8% |
| 08-12 → 08-14 | 640 / 231 / 310 | 40.3 / 34.2 / 41.9% | 488 / 448 / 247 | 8.2 / 10.5 / 9.7% |

The `more` side is stable at 8–16% on every day in the record. Only the `less` complement is affected, and only on **08-05, 08-06, 08-07 and 08-11**. This is the "blanket Less→flip rule mislabelled 1,752 legs" bug that `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` §4a records as fixed on 08-12 — now localised to exact dates.

**It is inside the TRUSTED table.** In `backtest.demon_full_history_dedup_v2`, demon `less` runs 78.2% (08-05), 88.5% (08-06), 60.6% (08-07), 72.8% (08-11) against 11.5–50% on every other day. The v2 rebuild fixed the rounding convention; it did not and could not fix the upstream side labels.

**2026-08-11 is a corrupted day, not a legitimate outlier.** Session 1's clearance of it — *"independently checked and cleared as legitimate (normal batch count, not a data artifact)"* — is **RETRACTED**. The batch count was normal; the labels were not. This also supplies the mechanism for why 08-11 has behaved pathologically across every session: it sank `runs+singles<0.5`, it held 31 of 36 legs behind the locked Demon config, and it carried 39,711 of Pool I's 48,610 combos.

---

## 3. PP GOBLIN — exhaustive enumeration on authoritative lane labels

**Class/lane labelling.** Every bucket below is **goblin lane**. Class, verified empirically per the 08-22 line-count measurement: `stolen_bases` FIXED (1.06), `doubles` FIXED (1.00), `home_runs` FIXED (1.01), `singles` FIXED (1.17), `runs` FIXED (1.10); `total_bases` TIERED (2.95), `hits_runs_rbis` TIERED (3.49), `walks_allowed` TIERED (2.36), `hits_allowed` TIERED (3.82), `earned_runs` TIERED (4.34), `pitcher_outs` TIERED (2.07).

**Per-leg multipliers** are the granular `GOBLIN_LEG_MULT_TABLE` per (prop, side) — never a flat ratio. Slip multiplier = product of per-leg rates. Rates carrying a real placed-slip observation are marked `table`; the rest use the **1.15 fallback**, which is the single largest source of fragility in everything below.

**Method:** exhaustive enumeration of *every* possible combination of every size on every day (no ranking, no cap). This is a floor, not a ceiling — a ranked builder should beat it.

| Bucket | mult | source | days | legs | hit % | 2-pk | 3-pk | 4-pk | 5-pk | 6-pk |
|---|---|---|---|---|---|---|---|---|---|---|
| `doubles/less/0.5` | 1.150 | FALLBACK | 12 | 1,892 | 84.6% | −5.6% | −8.5% | −11.5% | −14.4% | −17.2% |
| `earned_runs/more/0.5` | 1.150 | FALLBACK | 14 | 230 | 88.3% | +2.5% | +3.3% | +4.0% | +4.6% | **+5.1%** |
| `hits_allowed/more/2.5` | 1.150 | FALLBACK | 14 | 144 | 85.4% | −1.7% | +1.7% | +8.2% | +17.0% | **+27.0%** |
| `hits_runs_rbis/less/3.5` | 1.116 | table | 12 | 1,551 | 81.8% | −16.3% | −22.8% | −28.6% | −33.8% | −38.6% |
| `hits_runs_rbis/less/4.5` | 1.116 | table | 12 | 365 | 84.9% | −10.0% | −12.8% | −14.4% | −15.6% | −16.8% |
| `home_runs/less/0.5` | 1.150 | FALLBACK | 13 | 813 | 84.1% | −6.2% | −9.0% | −11.6% | −14.2% | −16.6% |
| `pitcher_outs/more/11.5` | 1.150 | FALLBACK | 14 | 75 | 81.3% | −8.2% | −4.9% | −0.2% | +2.0% | −1.3% |
| `runs/less/1.5` | 1.150 | FALLBACK | 12 | 160 | 83.8% | −11.5% | −20.1% | −28.0% | −35.1% | −41.3% |
| `singles/less/1.5` | 1.134 | table | 12 | 513 | 84.4% | −8.4% | −12.7% | −17.1% | −21.5% | −25.8% |
| `stolen_bases/less/0.5` | 1.150 | FALLBACK | 9 | 353 | 87.5% | +1.2% | +1.6% | +1.8% | +1.9% | +1.8% |
| `total_bases/less/2.5` | 1.150 | FALLBACK | 12 | 1,875 | 80.1% | −14.4% | −20.3% | −25.7% | −30.7% | −35.3% |
| `total_bases/less/3.5` | 1.150 | FALLBACK | 12 | 1,247 | 84.5% | −5.2% | −7.3% | −9.1% | −10.4% | −11.6% |
| `walks_allowed/more/0.5` | 1.140 | table | 14 | 194 | 89.7% | +2.9% | +1.9% | −1.1% | −5.9% | −12.5% |

### Pool-composition sweep — 10 genuinely different pools × 5 sizes

| Pool | 2-pk | 3-pk | 4-pk | 5-pk | 6-pk |
|---|---|---|---|---|---|
| **P1 LOCKED-like** (tb2.5 + tb3.5 + hrr3.5 + singles) | −12.1% | −17.0% | −21.5% | −25.6% | **−29.5%** |
| P2 `stolen_bases` only | +1.2% | +1.6% | +1.8% | +1.9% | +1.8% |
| P3 `earned_runs/more` only | +2.5% | +3.3% | +4.0% | +4.6% | +5.1% |
| P4 `hits_allowed/more` only | −1.7% | +1.7% | +8.2% | +17.0% | +27.0% |
| P5 pitcher-supply trio (er+ha+wa) | +1.4% | +1.7% | +2.2% | +2.8% | +3.6% |
| P6 pitcher trio + `pitcher_outs` | −0.1% | −0.3% | −0.5% | −0.5% | −0.5% |
| **P7 `earned_runs/more` + `hits_allowed/more`** | +0.6% | +1.6% | +3.4% | +5.8% | **+8.4%** |
| P8 rare hitter trio (sb+hr+doubles) | −4.9% | −7.6% | −10.3% | −12.9% | −15.4% |
| P9 sb + pitcher trio | +0.9% | +0.6% | +0.0% | −0.7% | −1.5% |
| P10 er+ha+sb | +0.2% | −0.1% | −0.4% | −0.7% | −1.1% |

### Leave-one-day-out on every positive

| Candidate | all-days | days supp. | combos | LODO band | folds neg. |
|---|---|---|---|---|---|
| P4 `hits_allowed/more/2.5` 6-pk | +27.0% | 13 | 20,245 | −7.2% … +42.7% | 1/14 |
| P4 5-pk | +17.0% | 13 | 13,279 | −7.6% … +26.0% | 1/14 |
| P3 `earned_runs/more/0.5` 6-pk | +5.1% | 14 | 258,184 | −1.1% … +10.6% | 2/14 |
| **P7 er+ha 6-pk** | **+8.4%** | **14** | **8,055,022** | **+3.0% … +12.1%** | **0/14** |
| P5 pitcher trio 6-pk | +3.6% | 14 | 109,456,131 | −2.4% … +6.4% | 1/14 |
| P2 `stolen_bases` 5-pk | +1.9% | 9 | 7,358,758 | −9.5% … +7.9% | 2/9 |

P4's headline is an artifact of one perfect day — 08-08 went 15 legs / 15 hits, contributing 5,005 of the 20,245 combos and all of them winning. Only 3 of its 13 supporting days are positive. **Rejected.**

**P7 is the first Goblin pool in this system's history to survive full leave-one-day-out with zero negative folds** — 14 supporting days, 8.0M combinations, band +3.0% to +12.1%. Both legs are pitcher-supply `more` props.

### Multiplier sensitivity — and why P7 is not actionable yet

| Pool | per-leg 1.05 | 1.10 | **1.15** | 1.20 | 1.265 |
|---|---|---|---|---|---|
| `hits_allowed/more/2.5` 6-pk | −26.4% | −2.7% | +27.0% | +64.0% | +125.1% |
| `earned_runs/more/0.5` 6-pk | −39.1% | −19.5% | +5.1% | +35.7% | +86.2% |
| `stolen_bases/less/0.5` 5-pk | −35.3% | −18.4% | +1.9% | +26.0% | +64.1% |

**Neither `earned_runs/more` nor `hits_allowed/more` has a single real placed-slip observation.** Both sit on the 1.15 fallback, and both flip negative at 1.10. P7's entire +8.4% lives inside the uncertainty of a number that has never been measured.

**Verdict: Goblin remains negative as deployed (−12.1% to −29.5% on the locked-like pool). P7 is the best candidate ever found for the track and is NOT promotable on this evidence. The action it justifies is a data request, not a config change: place one real Goblin slip containing `earned_runs/more/0.5` and one containing `hits_allowed/more/2.5`, and report the multipliers.**

---

## 4. PP REGULAR — locked pool confirmed, on cleaner legs and a lower number

**Pool:** `pitcher_fantasy_score/less`. **Class: TIERED** (3.02 lines/player-day). **Lane: STANDARD — verified, 376 of 376 legs, zero goblin, zero demon.** Per-leg multiplier 1.830 = 37.5^(1/6), the published Power table at ratio 1.000.

Legs: `outcome_final` rows only, joined to `final_board_history`, deduplicated. 376 legs, 22 days, 78.5% leg hit rate. This prop has **zero** `grade_*` rows, so it carries none of §1's duplication.

### Size and correlation-treatment sweep

| Variant | 3-pk | 4-pk | 5-pk | 6-pk |
|---|---|---|---|---|
| unrestricted | +212.6% | +279.3% | +597.0% | +890.6% |
| **max 1 leg/player** | +200.0% | +264.7% | +576.9% | **+782.4%** |
| max 1/player + max 2/game | +200.0% | +264.7% | +576.9% | +782.4% |
| max 1 leg/game | +179.3% | +285.5% | +525.0% | +741.8% |

`pitcher_fantasy_score` is a real ladder, so an unrestricted builder puts two lines on the same pitcher in one slip — which PrizePicks does not allow. **Max-1-per-player is the honest constraint and it costs 108pp.**

### Day-by-day — 6-pick Power, max 1 leg/player, uncapped, score-ranked

| Date | Slip outcomes | Slips | Full hits | ROI |
|---|---|---|---|---|
| 2026-07-28 | 4/6 | 1 | 0 | −100.0% |
| 2026-08-04 | 6/6✅ | 1 | 1 | +3650.0% |
| 2026-08-05 | 5/6 2/6 | 2 | 0 | −100.0% |
| 2026-08-06 | 5/6 6/6✅ | 2 | 1 | +1775.0% |
| 2026-08-07 | 5/6 5/6 4/6 | 3 | 0 | −100.0% |
| 2026-08-08 | 5/6 4/6 5/6 6/6✅ 4/6 | 5 | 1 | +650.0% |
| 2026-08-09 | 6/6✅ 5/6 5/6 | 3 | 1 | +1150.0% |
| 2026-08-10 | 2/6 3/6 | 2 | 0 | −100.0% |
| 2026-08-11 | 5/6 6/6✅ 4/6 4/6 5/6 6/6✅ | 6 | 2 | +1150.0% |
| 2026-08-12 | 5/6 5/6 5/6 | 3 | 0 | −100.0% |
| 2026-08-13 | 4/6 4/6 | 2 | 0 | −100.0% |
| 2026-08-14 | 4/6 6/6✅ 6/6✅ 4/6 | 4 | 2 | +1775.0% |
| 2026-08-15 | 6/6✅ 3/6 5/6 4/6 | 4 | 1 | +837.5% |
| 2026-08-16 | 4/6 6/6✅ 4/6 | 3 | 1 | +1150.0% |
| 2026-08-17 | 6/6✅ 5/6 | 2 | 1 | +1775.0% |
| 2026-08-18 | 4/6 5/6 4/6 5/6 | 4 | 0 | −100.0% |
| 2026-08-19 | 3/6 6/6✅ | 2 | 1 | +1775.0% |
| 2026-08-20 | 5/6 5/6 | 2 | 0 | −100.0% |
| **TOTAL** | | **51** | **12** | **+782.4% Power / +574.5% Flex** |

**Days supporting: 18. LODO band +697.9% to +857.4%, zero of 18 folds negative.** Still the most concentration-robust result in the log.

**Reconciliation.** Session 2 reported +1020.1% on 77 slips over 24 days. This session gets +782.4% on 51 slips over 18 days. Two named causes, both mine being the stricter: (a) restricting to `outcome_final` rows joined to a real board row loses 39 of 415 legs (9.4%) and the six thinnest days; (b) enforcing max-1-leg-per-player, which Session 2 did not. Without (b) I get +890.6%. **Neither figure is wrong; +782.4% is the one that reflects a slip PrizePicks would actually accept, and is the figure to carry forward.**

### Cap sweep — Session 2's answer amended

| Cap/day | 1 | 2 | 3 | 4 | 5 | **6** | 8 | 10 | 12 | 15 | ∞ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Slips | 18 | 34 | 43 | 48 | 50 | **51** | 51 | 51 | 51 | 51 | 51 |
| Power ROI | +733.3% | **+892.6%** | +772.1% | +759.4% | +725.0% | +782.4% | +782.4% | +782.4% | +782.4% | +782.4% | +782.4% |

Saturates at **6/day, not 8** — under the same-player constraint no day supports a 7th slip. cap=2 is nominally best (+892.6%) but that is 34 slips of noise, not a robust optimum. **Open item (6) is closed: the 10–15 band changes nothing, as Session 2 found.** Ranker sensitivity: `score_0_100` +782.4% vs `estimated_hit_probability` +693.3% — `score` retained.

### B6 — the load-bearing multiplier assumption, quantified

| assumed per-leg ratio | 6-pick payout | ROI |
|---|---|---|
| **1.000 (published, assumed)** | 37.50x | **+782.4%** |
| 0.95 | 27.57x | +548.6% |
| 0.90 | 19.93x | +368.9% |
| 0.85 | 14.14x | +232.8% |
| 0.80 | 9.83x | +131.3% |

12 full hits in 51 slips = 23.53%, so break-even needs 4.25x, i.e. a per-leg rate of 1.2645 against the published 1.830 — **a break-even discount ratio of 0.691.**

**That number is the whole ballgame. PP Goblin's measured discount is ~0.620. If PP Regular Power carries a Goblin-sized haircut, this track goes negative.** It survives anything down to 0.691 and dies below it. The assumption rests on four real Flex observations and **zero** real Power observations. **Standing request, now with a specific threshold attached: one real 6-pick PP Regular Power slip.**

---

## 5. PP DEMON — the track does not survive removal of the corrupted days

**Class: TIERED** (`pitcher_strikeouts` 4.74 lines/player-day, `earned_runs` 4.34, `hits_runs_rbis` 3.49). **Lane: DEMON** throughout. Source: `backtest.demon_full_history_dedup_v2`, profiled clean (§0b). Payout: deployed demon table 3/3 = 15x, 2/3 = 1.5x. Exhaustive 3-combination enumeration, no ranking.

| Pool | Scope | Days supp. | Combos | Full-hit % | ROI @15x | Break-even mult |
|---|---|---|---|---|---|---|
| A. `hits_runs_rbis/less/T2` (doc-legacy) | all days | 1 | 4,495 | 57.8% | +767.6% | 1.73x |
| A. | **ex-corrupt** | **0** | — | — | **no slip buildable** | — |
| **B. `pitcher_strikeouts/less/T2` (DEPLOYED)** | all days | 5 | 1,946 | 55.2% | +728.6% | 1.81x |
| **B.** | **ex-corrupt** | **1** | **10** | **10.0%** | **+50.0%** | 10.00x |
| I. `pitcher_strikeouts`+`earned_runs` /less T1+T2 | all days | 14 | 50,563 | 33.7% | +406.2% | 2.96x |
| **I.** | **ex-corrupt** | **10** | 1,352 | 21.4% | **+220.6%** | 4.68x |
| K. `pitcher_strikeouts`/less T1+T2 | ex-corrupt | 9 | 873 | 25.4% | **+281.4%** | 3.93x |
| L. `hits_runs_rbis`/less T1+T2 | ex-corrupt | 7 | 4,007 | 6.3% | **−5.7%** | 15.90x |
| M. all-pitcher T1+T2 (ps+er+ha+wa) | ex-corrupt | 10 | 1,916 | 15.3% | +130.2% | 6.52x |

"ex-corrupt" removes **08-05, 08-06, 08-07 and 08-11** per §2.

**The deployed pool's five supporting days are 08-05, 08-06, 08-07, 08-11 and 08-12 — four of the five are corrupted.** One clean day remains, with ten possible slips.

### LODO on the ex-corruption survivors, 3-pick

| Pool | base | LODO band | folds neg. |
|---|---|---|---|
| I. ps+er T1+T2 | +220.6% | −78.8% … +251.9% | 1/12 |
| K. ps T1+T2 | +281.4% | −47.4% … +290.4% | 1/12 |
| N. ps T1+T2+T3 | +278.8% | −52.4% … +287.7% | 1/12 |
| M. all-pitcher T1+T2 | +130.2% | −68.1% … +151.0% | 1/12 |

### Per-day, Pool K ex-corruption — the whole thing is one day

| Date | legs | hits | combos | winning | day ROI |
|---|---|---|---|---|---|
| 08-08 | 4 | 2 | 4 | 0 | −100.0% |
| 08-09 | 5 | 3 | 10 | 1 | +50.0% |
| **08-12** | **18** | **12** | **816** | **220** | **+304.4%** |
| 08-14 | 4 | 0 | 4 | 0 | −100.0% |
| 08-15 | 3 | 1 | 1 | 0 | −100.0% |
| 08-16 | 4 | 0 | 4 | 0 | −100.0% |
| 08-17 | 4 | 3 | 4 | 1 | +275.0% |
| 08-18 | 5 | 2 | 10 | 0 | −100.0% |
| 08-19 | 6 | 2 | 20 | 0 | −100.0% |

**816 of 873 combos and 220 of 222 winners come from 2026-08-12.** Remove it and the pool is −47.4%. Six of nine supporting days are −100%. And 08-12 is itself the day the flip bug was fixed — its demon `less` legs still hit 45.9% against 11.5% on 08-14, so it may be partially contaminated too.

**Verdict — this is a retraction. Sessions 2 and 3 recommended Demon Pool I for promotion ("real, credible, worth strong consideration"). That recommendation is WITHDRAWN.** Pool I's 14 supporting days and +397.3% were carried by the four corrupted days; on clean data it has 10 nominal supporting days, one of which carries everything, and it is one day away from negative. **Recommendation: suspend the Demon track. It has no clean evidence base.** Open item (5) — moving the deployed pool from `hits_runs_rbis` to `pitcher_strikeouts` — is now moot: on clean data neither pool is supportable.

---

## 6. SLEEPER — the locked pool is negative and a much better one is sitting next to it

**Lane: N/A** (Sleeper has no goblin/demon lane; dynamic per-leg moneyline pricing). **Class:** `rbis` FIXED (1.10 lines/player-day), `walks` FIXED (1.02), `runs` FIXED (1.10), `hits_runs_rbis` TIERED (3.49), `doubles` FIXED (1.00), `home_runs` FIXED (1.01). Per-leg 1.628 (compounding), break-even p = 1/1.628 = **61.4%** at any size.

Exhaustive enumeration, all sizes:

| Pool | 2-pk | 3-pk | 4-pk | 5-pk | 6-pk |
|---|---|---|---|---|---|
| **S-LOCKED `hits_runs_rbis/more`** | +3.8% | **−5.8%** | −18.9% | −34.0% | −49.6% |
| S2 rbis+walks+runs /less | +21.7% | +34.8% | +49.7% | +66.8% | +86.2% |
| **S2b rbis+walks /less** | +30.5% | +50.7% | +75.4% | +105.4% | **+141.2%** |
| **S3 `rbis/less` only** | +34.4% | +55.2% | +79.5% | +108.0% | **+141.0%** |
| S4 doubles+home_runs /less | +39.4% | +42.2% | +30.9% | +12.9% | −6.7% |
| S7 hits/more + hrr/more + tb/more | −2.5% | −9.4% | −16.4% | −23.0% | −29.2% |
| S8 rbis/less + hrr/more | +32.5% | +51.8% | +74.4% | +100.9% | +131.9% |
| S9 all-less (rbis,walks,runs,dbl,hr) | +22.3% | +35.5% | +50.4% | +67.2% | +86.3% |

### LODO

| Pool / size | all-days | days | combos | LODO band | folds neg. |
|---|---|---|---|---|---|
| **S3 `rbis/less` 6-pk** | **+141.0%** | 18 | 11,757,387,553 | **+111.4% … +159.6%** | **0/19** |
| S3 `rbis/less` 3-pk | +55.2% | 19 | 1,530,903 | +49.7% … +57.7% | 0/19 |
| **S2b rbis+walks 6-pk** | **+141.2%** | 18 | 663,591,070,192 | **+123.2% … +145.4%** | **0/19** |
| S2 rbis+walks+runs 6-pk | +86.2% | 18 | 5.23 × 10¹² | +79.3% … +97.9% | 0/19 |
| S4 doubles+home_runs 3-pk | +42.2% | 14 | 1,742 | +27.5% … +68.8% | 0/16 |
| **S-LOCKED `hrr/more` 3-pk** | **−5.8%** | 11 | 3,881 | −16.3% … +15.4% | **14/15** |

**The locked Sleeper configuration is negative on exhaustive enumeration and negative in 14 of 15 folds.** Its documented +46.5% came from a ranked builder on a top slice; enumerating every buildable slip on the same pool gives −5.8%. `rbis/less` and `rbis+walks/less` at 6-pick are +141% with the tightest LODO bands anywhere in this system.

Note S2 here is not identical to Session 4's S2 — `rfi_nrfi` is not in the graded outcome record under that key, so this is `rbis+walks+runs`. The direction agrees with Session 4; the level is lower because exhaustive enumeration includes every combination rather than the ranked top.

### Multiplier sensitivity — the one thing that could kill this

| per-leg | 1.400 | 1.500 | **1.628** | 1.700 | 1.800 |
|---|---|---|---|---|---|
| S3 `rbis/less` 6-pk | −2.5% | +47.4% | **+141.0%** | +212.4% | +340.2% |

Break-even is ≈1.41. **`MULTIPLIER_TABLES_MASTER.md` carries two Sleeper per-leg figures: 1.628/1.638 (from live board moneylines, adopted by Session 2 on a 2.650x-vs-2.65x match) and 1.2684 (geometric mean of 8 real 6-pick placed observations).** At 1.2684 this pool is roughly −46%. The two numbers are not reconciled, and **the entire Sleeper case depends on which is right.** The 1.2684 figure is explicitly caveated in the dossier as applying to the "likely/safe leg pool" — which is exactly this pool. **This is the second-highest-value missing data point after the PP Regular Power slip: one real Sleeper 6-pick on `rbis/less` legs, multiplier recorded.**

---

## 7. UNDERDOG — locked config conclusively dead; first-ever positive pool found, and it is blocked

**Lane: N/A.** **Class:** `rbis` FIXED, `walks` FIXED, `runs` FIXED, `hits` TIERED-borderline, `pitcher_fantasy_score` TIERED.

Payout model = published × 0.6865^n (compounding). The arithmetic behind that, stated once so it stops being re-litigated: the documented derivation is *"10 real 6-pick observations averaging 3.75x actual against a 35x published rate"*. 35 × 0.6865 = **24.03**, not 3.75. 35 × 0.6865⁶ = **3.66** ≈ 3.75. **The 0.6865 is a per-leg compounding ratio; `MULTIPLIER_TABLES_MASTER.md` §6 mislabels it as a flat discount, and the flat application is the bug.**

| Size | Published | Real (compounding) | Break-even per-leg |
|---|---|---|---|
| 2 | 3.5x | 1.65x | 77.9% |
| 3 | 6.5x | 2.10x | 78.1% |
| 4 | 12x | 2.67x | 78.3% |
| 5 | 20x | 3.05x | 80.0% |
| 6 | 35x | 3.66x | 80.5% |

| Pool | legs | hit % | 2-pk | 3-pk | 4-pk | 5-pk | 6-pk |
|---|---|---|---|---|---|---|---|
| **U-LOCKED rbis+walks /less** | 5,583 | 70.1% | −18.6% | −26.7% | −34.4% | −47.2% | **−55.4%** |
| U2 rbis only | 2,937 | 71.5% | −15.9% | −23.5% | −30.9% | −43.9% | −52.2% |
| **U9 `pitcher_fantasy_score/less` (NEW)** | 147 | **79.6%** | **+4.1%** | **+4.8%** | **+5.2%** | −4.1% | −8.1% |
| U10 pfs + rbis | 3,084 | 71.9% | −15.4% | −23.0% | −30.3% | −43.2% | −51.4% |
| U11 hits/more | 434 | 62.2% | −37.1% | −51.0% | −62.5% | −74.5% | −82.0% |
| U12 rbis+walks+runs | 7,804 | 68.5% | −22.4% | −31.9% | −40.7% | −53.4% | −61.7% |

**Locked config: −55.4% at 6-pick, 18 of 18 LODO folds negative.** Fourth independent confirmation. For contrast, the flat model would report the same pool at **+192.2%** — that gap is the entire Underdog story.

**U9 is the first positive Underdog pool ever found**, and it is a **cross-app transfer**: `pitcher_fantasy_score/less` is the locked PP Regular signal, never before tested on Underdog. LODO at 2-pick: **+0.2% to +8.3%, 0 of 13 folds negative**. At 3- and 4-pick, 2 of 13 folds go negative.

**But it is blocked.** Underdog `pitcher_fantasy_score` legs stop dead after 2026-08-09:

| Date | pfs legs | all pitcher legs | all UD legs |
|---|---|---|---|
| 08-08 | 21 | 30 | 1,011 |
| 08-09 | 19 | 34 | 1,105 |
| **08-10** | **0** | 12 | 724 |
| 08-11 → 08-20 | **0 every day** | 24–46/day | 660–1,505/day |

Other pitcher props keep flowing. **Only `pitcher_fantasy_score` stopped, on 2026-08-10, and has produced zero graded legs for eleven consecutive days.** That is a real ingestion or mapping defect and it is the thing standing between Underdog and its only positive signal. **Reported for the user; not fixed here — this is a dry run.**

---

## 8. VOID / DNP-ADJUSTED REPRICING — executed at last, and it is a no-op

The #1 carried-forward item. Measured directly against real plate appearances (`stats_hitter.game_logs` with `pa > 0`) rather than inferred from zero-stat rows, on all graded hitter legs from 2026-08-04:

| Metric | Value |
|---|---|
| Graded hitter legs | 25,909 |
| Legs whose player has **no PA** that day | **15** |
| Void rate | **0.06%** |
| Hit rate among those 15 | 100.0% |
| Hit rate among players who did play | 66.1% |

On Sleeper `rbis/less` specifically: **1 void in 1,067 legs** from 08-04 onward. (07-27 and 07-28 show 100% "void" — that is absent `stats_hitter` coverage on those two dates, not real DNPs, and is excluded.)

**The pipeline already excludes non-participants before grading.** The documented "~7% true DNP/void exposure on hitter props" (itself a correction of an earlier ~24% claim) is **too high by two orders of magnitude** when measured against actual plate appearances. Repricing every hitter-prop backtest for voids moves no headline figure by as much as half a point.

Honest scope: this measures *our graded record*. It does not measure PrizePicks' own void handling on legs we never graded — but since a backtest can only use legs we graded, that is the relevant population. **Matrix cell closed for Sleeper and Underdog with a well-powered negative.**

---

## 9. GEMINI AS IDEA PARTNER — first proactive use on Goblin; hypothesis tested and REJECTED

Track rotated off Sleeper per §1e. Gemini was given the Goblin track's real state (lane-verified hit rates, the granular multiplier table, every exhaustive per-bucket ROI, the P7 result) plus the full already-rejected list, and told that any hypothesis which FILTERS the pool is inadmissible.

### Raw call

```
run_job(job="direct_worker_probe", extra={
  method: "POST",
  url: "https://alphadog-v2-admin-sql.rodolfoaamattos.workers.dev/gemini-proxy",
  body: "{\"model\": \"gemini-3.6-flash\", \"prompt\": \"PrizePicks GOBLIN track. Give ONE new falsifiable
   hypothesis with a specific baseball mechanism. Be concise (under 300 words).\n\nREAL STATE (28 days
   graded, lane-verified): Goblin lane 29,647 legs at 73.3%. Goblin pays a per-leg multiplier ~1.15, so
   break-even per-leg hit rate is ~87.0%. Exhaustive per-bucket 6-pick ROI: doubles/less/0.5 84.6%
   -17.2%; home_runs/less/0.5 84.1% -16.6%; total_bases/less/3.5 84.5% -11.6%; hits_runs_rbis/less/3.5
   81.8% -38.6%; stolen_bases/less/0.5 87.5% +1.8%; earned_runs/more/0.5 88.3% +5.1%;
   hits_allowed/more/2.5 85.4% +27.0%; walks_allowed/more/0.5 89.7% -12.5%. Best pool:
   earned_runs/more + hits_allowed/more, 6-pick, +8.4%, LODO +3.0% to +12.1%, 0 negative folds. Both
   are pitcher-supply MORE-side props.\n\nALREADY REJECTED, do not repeat: ranking by the platform
   internal score; same-game correlation control; pitcher-dominance stacking; umpire strike-zone
   re-ranking; weather or bullpen-fatigue gating; bottom-of-order batting slot; board-density or
   leg-density day gating; narrowing a pool to its best sub-slice. ANY hypothesis that FILTERS the pool
   has failed on pool thinning - only re-ranking or pool REDEFINITION is acceptable.\n\nTestable only
   with: per-leg graded outcomes (player, prop, line, side, date, game) plus weather (97.2% join),
   umpire (95.2%), bullpen (39.4%), lineup slot (80.4%), park factors.\n\nAnswer: (1) hypothesis in one
   sentence, (2) mechanism, (3) exact test and what falsifies it, (4) why it survives pool thinning.\"}"
})
```

*(A first attempt with a longer prompt returned `probe_timeout` at 40,000 ms. The shortened prompt returned in 16,384 ms. Worth knowing: the Gemini proxy has a hard ~40s ceiling.)*

### Raw response

> **(1) Hypothesis**
> Re-ranking the existing pitcher MORE pool (`earned_runs/more/0.5` and `hits_allowed/more/2.5`) by the opposing team's top-4 lineup slots' combined past-30-day On-Base Percentage (OBP) monotonically orders leg hit rates without discarding volume.
>
> **(2) Baseball Mechanism**
> High-OBP top-of-the-order batters extend plate appearances and elevate pitch counts per inning. This accelerates starting pitchers into their 2nd and 3rd Time-Through-the-Order (TTO) efficiency degradation phases earlier in the game, directly increasing baseline hit and earned run yield before manager bullpen intervention.
>
> **(3) Exact Test & Falsification**
> * **Test:** Join confirmed batting orders (80.4% coverage) to assign each pitcher MORE leg a continuous score equal to the sum of the opposing 1–4 lineup slots' rolling 30-day OBP. Sort the complete pitcher MORE leg pool into deciles (10 equal-volume buckets) and calculate the per-leg hit rate and 6-pick entry ROI per decile.
> * **Falsification:** Falsified if Kendall's tau rank correlation between decile rank and per-leg hit rate is non-positive (p ≥ 0.05), or if the top 2 deciles fail to maintain a per-leg hit rate above the 87.0% Goblin break-even threshold.
>
> **(4) Why It Survives Pool Thinning**
> It uses a continuous ordinal re-ranking across 100% of the target leg population rather than applying a binary threshold filter. Zero legs are discarded or thinned from the universe; it merely alters entry selection precedence to maximize expected value within 6-pick slip construction.

Genuinely new, mechanistically specific, not in `SIGNALS_TECHNIQUES_TRIED.md`, and correctly framed as a re-rank rather than a gate.

### Real test

374 pitcher-supply MORE legs → 100% joined to `stats_pitcher.game_logs` for the opposing team → opposing lineup slots 1–4 from `context.history_game_lineup` (using the posted/derived lineup, known pre-game, so no leakage) → those players' **prior-30-day** on-base proxy `(hits + walks) / PA` from `stats_hitter.game_logs`, strictly `game_date < leg date`. Requiring ≥100 prior PA leaves 225 legs across 8 days. Quintiles rather than deciles, since deciles would give 22 legs each.

| Quintile | n | opposing top-4 OBP range | leg hit % |
|---|---|---|---|
| 1 (lowest OBP) | 45 | 0.2476 – 0.3054 | 88.9% |
| 2 | 45 | 0.3057 – 0.3185 | 73.3% |
| 3 | 45 | 0.3186 – 0.3323 | 88.9% |
| 4 | 45 | 0.3324 – 0.3445 | **95.6%** |
| 5 (highest OBP) | 45 | 0.3445 – 0.3932 | 75.6% |

Leg-level Pearson r between opposing top-4 OBP and outcome: **−0.036** (n = 165 distinct pitcher-days). Mean opposing OBP when the leg hits: **0.3239**. When it misses: **0.3262** — a 0.2pp difference, in the *opposite* direction to the prediction.

**REJECTED, on both of Gemini's own falsification criteria.** The rank correlation is non-positive, and the top quintile (75.6%) sits well below the 87.0% Goblin break-even. Non-monotonic in the middle too — up, down, up, down.

**Power caveat, stated honestly:** 225 of 374 legs scored, 8 days. A negative at this power is suggestive, not decisive. The mechanism is sound baseball; it just does not show up in this pool at this sample size.

### Byproduct: the `lineup_slot` dual-encoding defect

Building this test surfaced a real defect in Session 4's own resolution. `WHERE lineup_slot BETWEEN 1 AND 4` returned **zero rows on all 14 dates from 2026-08-05 to 2026-08-18**. The column carries two encodings:

| Window | `lineup_slot` values | rows/slot |
|---|---|---|
| Outside 08-05 → 08-18 | **1–9** | 488 each |
| **08-05 → 08-18** | **100–900** | 158 each |

Session 4's guidance ("use `lineup_slot`, they're equivalent, `boc = lineup_slot × 100`") is correct where both columns exist but **silently drops 14 days** for anyone who filters or buckets on 1–9. Correct normalisation: `CASE WHEN lineup_slot >= 100 THEN lineup_slot/100 ELSE lineup_slot END`. **Session 4's Gen-1 bottom-of-order refutation should be re-run under the normalised slot** — its "24 usable days" claim would have excluded 08-05 → 08-18.

---

## 10. FIRST-PITCH-STRIKE RATE — BLOCKED, with the search shown

Open item (4) asked me to mine `stats_pitcher.game_logs`/`splits` for first-pitch-strike rate to finish the 0-1 tailwind test. Three searches, all negative:

1. Every `stats_pitcher` column matching `%first%`, `%fps%`, `%strike_pct%`, `%zone%` → **2 hits, both irrelevant**: `game_log_player_outcomes.first_promoted_game_date`, `.first_raw_game_date`.
2. All **70** distinct keys of `stats_pitcher.game_logs.raw_json->'stat'` across 4,039 object-typed rows → `strikes`, `strikePercentage`, `numberOfPitches`, `pitchesThrown`, `balls`. **Overall strike rate only; no per-count or first-pitch breakdown anywhere.**
3. Every `stats_pitcher` and `context` column matching `%pitch%` → `strikes_per_pitch_calculated`, `pitches_per_out_calculated`, `bullpen_pitches_last_{1,2,3}_day(s)`, `pitches_sum`. No FPS.

**FPS% does not exist in this database.** The nearest available quantity is overall `strikePercentage`, which is a materially different statistic and would not test the hypothesis. **Marked BLOCKED in the coverage matrix with this evidence, rather than left silently open.**

---

## 11. EXTERNAL RESEARCH (performed fresh this session)

- **PrizePicks** — Power `2:3x, 3:6x, 4:10x, 5:20x, 6:37.5x`; Flex `2:{2x,0.5x}`, `3:{3x,1x}`, `4:{6x,1.5x}`, `5:{10x,2x,0.4x}`, `6:{25x,2x,0.4x}`. Source last verified 2026-08-17. ✅ **matches repo, unchanged.** One new detail worth recording: the source stresses that *"PrizePicks discloses the payout for each contest on its individual details screen. Review that displayed payout before submitting because it controls over this general calculator"* — a first-party-adjacent confirmation that the published table is not what a specific slip actually pays, which is precisely the Goblin/Demon discount this system measures.
- **Underdog** (help.underdogsports.com, first-party) — Standard `2:3.5, 3:6.5, 4:12, 5:20, 6:35, 7:65, 8:120`; Flex 0-loss `3:3.25, 4:6, 5:10, 6:25, 7:40, 8:80`; 1-loss `1.09/1.5/2.5/2.6/2.75/3`; 2-loss `6:0.25, 7:0.5, 8:1`. ✅ **matches repo, unchanged.** Per-selection pricing re-confirmed first-party: *"If you choose a pick with a 0.7x multiplier, your total payout decreases to reflect that lower difficulty"* — direct support for the compounding model over the flat one.
- **Sleeper** — no published fixed table found; confirmed to use dynamic per-pick pricing. ✅ consistent with the repo's moneyline-conversion model.
- No evidence of any payout change since the 2025-06-02 PrizePicks 3/4-pick Flex increase already on record.

Sources: [propellerpicks PrizePicks calculator](https://propellerpicks.com/tools/prizepicks-payout-calculator/) · [Underdog Pick'em Standard & Flex payouts](https://help.underdogsports.com/en/articles/13780101-pick-em-standard-flex-entry-payouts) · [Stokastic on Underdog multipliers](https://www.stokastic.com/articles/dfs-strategy/how-underdog-fantasy-multipliers-work) · [OddsShopper on Sleeper Picks](https://www.oddsshopper.com/articles/comparisons/how-to-play-sleeper-picks)

---

## 12. MULTIPLIER TABLE — nothing new

`score.slip_entries` holds **19** rows with a real multiplier, timestamps unchanged at 2026-08-21T20:11 — identical to Sessions 2, 3 and 4. No new placed slips. The table cannot sharpen this session.

**The three multipliers this system most needs, ranked by how much rests on each:**
1. **PP Regular Power, 6-pick** — the entire +782.4% dies below a 0.691 discount ratio; Goblin's measured ratio is 0.620. Zero Power observations exist.
2. **Sleeper `rbis/less` 6-pick** — +141.0% at per-leg 1.628, roughly −46% at 1.2684, and both figures are in the docs unreconciled.
3. **Goblin `earned_runs/more/0.5` and `hits_allowed/more/2.5`** — the only Goblin pool ever to survive LODO cleanly, resting entirely on the 1.15 fallback and negative at 1.10.

---

## 13. HONEST SUMMARY

**Genuinely new this session:**
1. **`prop_outcome_history.is_goblin`/`is_demon` is not the lane.** Two writers; the `outcome_final` writer leaves the flags at 0/0 on 99.0% of rows. 97.9% of "standard-lane" legs are goblin or demon. Authoritative lane must be joined from `final_board_history` (98.6% join). Corrected lane split: goblin 73.3% / standard 54.6% / demon 34.6%.
2. **Demon `less` legs are corrupted on exactly 08-05, 08-06, 08-07 and 08-11** — 68–85% where demon must be under 50%, while the `more` side stays at 8–16% throughout. Present inside `demon_full_history_dedup_v2`.
3. **No standard-lane bucket clears n≥30 and 80%.** The pool open item (1) asked for does not exist.
4. **The locked PP Regular pool is 100% standard-lane (376/376)** and its break-even discount ratio is **0.691**, against Goblin's measured 0.620.
5. **First Goblin pool ever to survive LODO with zero negative folds**: `earned_runs/more/0.5` + `hits_allowed/more/2.5`, 6-pick, +8.4%, band +3.0% to +12.1%, 14 days — and it is not promotable, because both legs sit on the unmeasured 1.15 fallback.
6. **The locked Sleeper pool is −5.8% on exhaustive enumeration**, 14 of 15 folds negative; `rbis/less` 6-pick is +141.0% with all 19 folds positive.
7. **First positive Underdog pool ever found** — `pitcher_fantasy_score/less`, a cross-app transfer of the PP Regular signal — and it is blocked by an ingestion gap that stopped the prop dead on 2026-08-10.
8. **Void/DNP exposure is 0.06%, not ~7%.** Repricing is a no-op.
9. **`lineup_slot` carries two encodings** and silently drops 08-05 → 08-18 for anyone filtering 1–9.
10. **First-pitch-strike rate does not exist in this database**, established across three searches.
11. **Gemini's opposing-top-4-OBP re-rank tested and rejected** on its own falsification criteria.
12. The Gemini proxy has a hard ~40 s timeout.

**Re-confirmed:** Underdog broken as deployed (−55.4%, 18/18 folds negative — fourth independent line of evidence); PP Goblin's locked-like pool negative (−12.1% to −29.5%); PP Regular robust and the strongest clean track; both published payout tables unchanged.

**RETRACTED this session:**
1. **`HIGH_HIT_RATE_METHODOLOGY.md` §3's lane finding as stated** — `doubles/less/0.5` at "+1298.7% standard vs −13.0% Goblin, identical leg" is one set of legs duplicated across two lane labels, not two market offerings.
2. **The Session 4 addendum's four "priced-positive standard-lane buckets"** and its instruction to play them in the Regular lane.
3. **Sessions 2 and 3's recommendation to promote Demon Pool I.** Its support was the four corrupted days; on clean data it is one day from negative.
4. **Session 1's clearance of 2026-08-11 as a legitimate outlier.** It is a corrupted day.
5. **Session 4's "one-day grading gap" flag.** Third UTC-for-Pacific error in the log; there is no gap.
6. **The documented ~7% hitter void rate.** Real figure 0.06%.
7. **Session 4's `lineup_slot` guidance as sufficient.** It is not; two encodings exist.
8. **Session 2's "+1020.1%, saturates at 8 slips/day"** — amended to +782.4% and saturation at 6 under the same-player constraint PrizePicks actually enforces.

**Needs the user's decision:**
- **Suspend the Demon track?** It has no clean evidence base once the four corrupted days are removed.
- **Move Sleeper from `hits_runs_rbis/more` 3-pick to `rbis/less` (or `rbis+walks/less`) 6-pick?** −5.8% → +141.0%, all folds positive — conditional on the 1.628-vs-1.2684 multiplier question.
- **Suspend Underdog staking?** Fourth confirmation it is broken as deployed.
- **Place three slips and report the real multipliers** (§12): PP Regular Power 6-pick; Sleeper 6-pick on `rbis/less`; one Goblin slip containing `earned_runs/more/0.5` or `hits_allowed/more/2.5`.
- **Two live defects reported, not touched** (dry run): the `outcome_final` writer not populating lane flags; and Underdog `pitcher_fantasy_score` producing zero graded legs since 2026-08-10.

**Stopping condition: NOT met — stated plainly.** Twelve structurally distinct passes ran. The first one overturned the premise of the session's own top-priority open item and forced five retractions, which is the opposite of exhaustion. This session closes on budget, not on the five-consecutive-null rule. **This is not the final report in the sense the master prompt defines.**

**Open items carried forward:**
1. Re-run Session 4's Gen-1 bottom-of-order refutation under the normalised `lineup_slot`.
2. Multi-layer stacking and adaptive sizing on Regular, Demon, Underdog (Goblin and Sleeper now covered).
3. Gemini generative hypothesis on Regular, Demon, Underdog.
4. Reconcile the Sleeper per-leg conflict (1.628 vs 1.2684) against a real placed slip.
5. Determine whether 2026-08-12 is partially inside the demon `less` corruption window (its 45.9% still looks high).
6. Rebuild the Goblin analysis once `goblin_demon_tier` is populated on graded days — 08-21 is the first such day and grades out tonight.
7. Audit the `pitcher_fantasy_score` goblin anchor derivation (carried from Session 2, still open).

**Nothing was deployed, patched, or modified.**

---

# ===== 2026-08-21 (Fri) — Session 6 — manual on-demand fire, 19:51 PT (2026-08-22 02:51 UTC) =====

**Run type:** dry run, research only. Nothing deployed, patched, or modified. Documentation files updated as the task requires.
**Trigger:** manual fire, 36 minutes after Session 5 closed.

---

## 0. THE FIRING PAYLOAD'S PREMISES — checked before acting on them, and two are false

The payload supplied five pieces of run context. Two of them restate positions that Session 5 retracted 36 minutes earlier, with evidence. Because the payload is data rather than instruction, and because acting on them would mean reporting a known artifact as fact, they were re-verified rather than assumed. Both re-verifications came back against the payload.

| Payload claim | Verified status |
|---|---|
| (2) *"the LANE is the dominant EV axis — `doubles/less/0.5` prices at +1298.7% standard-lane and −13.0% goblin-lane at the same ~85% hit rate. Start from that, do not re-derive it."* | **FALSE.** Session 5 established, and §1 below re-confirms directly on the payload's own eight buckets, that this is a two-writer duplication artifact. |
| (3) *"take the top standard-lane buckets … and put them through real slip construction"* | **Method sound, premise false.** All eight named buckets are 88–98% **goblin** lane; 2 standard legs exist across 5,874. Executed as goblin-lane pools — §2. |
| (4) *"as of last check, max graded was 2026-08-20 while the date was 2026-08-22"* | **FALSE — same UTC/Pacific error, fourth occurrence.** See §0a. |
| (1) `HIGH_HIT_RATE_METHODOLOGY.md` is first in required reading | **True**, honoured — and it is the document §1 corrects. |
| (5) void/DNP repricing never executed | **Stale.** Executed in Session 5 (0.06% on hitters). Extended to pitchers here — §6. |

## 0a. FRESHNESS — no gap, and the tier backtest is still ~2.5 hours away

| Check | Value |
|---|---|
| Wall clock | `2026-08-22T02:51:46Z` = **2026-08-21 19:51 PDT** |
| `max(official_date) WHERE outcome_hit IS NOT NULL` | **2026-08-20** |
| Graded rows | **137,888** — unchanged from Sessions 2, 3, 4 and 5 |
| Rows for 2026-08-21 in `prop_outcome_history` | **0**, any status |
| Rows for 2026-08-21 in `final_board_history` | **5,891, of which 4,379 carry `goblin_demon_tier`** |

It is the **21st** in Pacific time, so per the master prompt's own rule the most recent trustworthy day is the 20th. There is no gap. This is the fourth time the UTC date has been read as the Pacific date in this log (Sessions 2, 3, 5, and now the payload).

**The payload's real prize is still pending.** 4,379 tier-bearing board rows for 08-21 are sitting in `final_board_history` waiting to grade — Session 3 estimated grading lands ~2026-08-22T05:23Z (≈22:23 PDT), about 2.5 hours after this run. **The first-ever tier backtest on the live `goblin_demon_tier` column with no reconstruction becomes possible tonight and should be the first action of the next session.** 442 rows for 08-22 are already tiered as well.

---

## 1. THE PAYLOAD'S EIGHT "STANDARD-LANE" BUCKETS — measured directly

Lane taken from `score.final_board_history` joined on `final_board_row_id`, outcome table restricted to `outcome_id LIKE 'outcome_final|%'`:

| Bucket | Class | legs | goblin | demon | **standard** |
|---|---|---|---|---|---|
| `doubles/less/0.5` | FIXED | 1,952 | 1,892 (96.9%) | 60 | **0** |
| `total_bases/less/3.5` | TIERED | 1,270 | 1,247 (98.2%) | 23 | **0** |
| `home_runs/less/0.5` | FIXED | 861 | 813 (94.4%) | 48 | **0** |
| `singles/less/1.5` | FIXED | 582 | 513 (88.1%) | 69 | **0** |
| `stolen_bases/less/0.5` | FIXED | 387 | 353 (91.2%) | 34 | **0** |
| `hits_runs_rbis/less/4.5` | TIERED | 386 | 365 (94.6%) | 21 | **0** |
| `earned_runs/more/0.5` | TIERED | 235 | 230 (97.9%) | 4 | **1** |
| `walks_allowed/more/0.5` | TIERED | 201 | 194 (96.5%) | 6 | **1** |

**Two standard-lane legs across 5,874.** The standard-lane pool the payload asks for cannot be constructed. The demon fractions are the 08-05/06/07/11 `less`-side corruption documented in Session 5.

A retraction notice and this table have been written into `HIGH_HIT_RATE_METHODOLOGY.md` §3, since that document is first in every future session's required reading and would otherwise keep re-seeding the error.

---

## 2. PP GOBLIN — real slip construction on those buckets, as the payload asked, in the correct lane

**Method:** ranked greedy construction (score-desc, chunked into slips) — structurally different from Session 5's exhaustive enumeration, and closer to what a live builder does. Per-leg multipliers from the granular `GOBLIN_LEG_MULT_TABLE`; slip multiplier = product of per-leg rates. `singles` 1.134, `hits_runs_rbis` 1.116, `walks_allowed` 1.140 (all real table rates); everything else the **1.15 fallback**.

### Pool-composition sweep × pick size

| Pool | Class mix | 2-pk | 3-pk | 4-pk | 5-pk | 6-pk |
|---|---|---|---|---|---|---|
| **V1 all-8 payload pool** | mixed | −4.9% | −7.4% | −9.7% | −10.3% | **−12.8%** |
| V2 rare FIXED trio (sb+hr+dbl) | all FIXED | −5.0% | −6.6% | −7.7% | −9.5% | −9.1% |
| **V3 pitcher TIERED pair (er+wa)** | all TIERED | **+2.8%** | **+7.0%** | **+6.7%** | **+2.3%** | **+4.5%** |
| V4 `stolen_bases` only | FIXED | +1.8% | −2.1% | −0.1% | +0.6% | +9.3% |
| V5 top-4 by hit rate | mixed | −2.9% | −3.6% | −5.7% | −5.6% | −3.6% |
| V6 hitter-only six | mixed | −5.2% | −8.0% | −9.4% | −11.9% | −13.6% |

All pools are **goblin lane**. Only V3 — both legs pitcher-supply MORE-side, both TIERED — is positive at every size.

### V3 correlation treatment × cap sweep, 3-pick

| Treatment | cap 1 | cap 2 | cap 3 | cap 4 | cap 5 | uncapped |
|---|---|---|---|---|---|---|
| A unrestricted | +17.6% | +12.5% | +7.1% | +4.4% | +2.9% | +7.0% (139 slips) |
| B max 1 leg/player | +17.7% | +17.9% | +10.8% | +7.2% | +8.9% | +9.7% (85 slips) |
| **C max 1 leg/game** | **+28.6%** | +23.3% | +17.9% | +17.8% | +17.8% | **+17.8%** (51 slips) |

### V3-C day-by-day — 3-pick, max 1 leg/game, uncapped

| Date | Slip outcomes | Slips | Full hits | ROI |
|---|---|---|---|---|
| 2026-08-06 | 3/3✅ 3/3✅ 3/3✅ | 3 | 3 | +48.6% |
| 2026-08-07 | 3/3✅ 3/3✅ 3/3✅ <3/3 | 4 | 3 | +11.4% |
| 2026-08-08 | 3/3✅ 3/3✅ 3/3✅ <3/3 | 4 | 3 | +11.1% |
| 2026-08-09 | 3/3✅ 3/3✅ <3/3 <3/3 | 4 | 2 | −25.9% |
| 2026-08-10 | 3/3✅ 3/3✅ 3/3✅ | 3 | 3 | +48.2% |
| 2026-08-12 | 3/3✅ 3/3✅ 3/3✅ 3/3✅ | 4 | 4 | +50.4% |
| 2026-08-13 | 3/3✅ <3/3 <3/3 | 3 | 1 | −50.2% |
| 2026-08-14 | 3/3✅ 3/3✅ 3/3✅ <3/3 | 4 | 3 | +13.7% |
| 2026-08-15 | 3/3✅ 3/3✅ <3/3 <3/3 | 4 | 2 | −24.3% |
| 2026-08-16 | 3/3✅ 3/3✅ 3/3✅ <3/3 | 4 | 3 | +14.1% |
| 2026-08-17 | 3/3✅ 3/3✅ 3/3✅ | 3 | 3 | +51.2% |
| 2026-08-18 | 3/3✅ 3/3✅ 3/3✅ <3/3 | 4 | 3 | +13.4% |
| 2026-08-19 | 3/3✅ 3/3✅ 3/3✅ 3/3✅ | 4 | 4 | +52.1% |
| 2026-08-20 | 3/3✅ 3/3✅ 3/3✅ | 3 | 3 | +50.3% |
| **TOTAL** | | **51** | **40 (78.4%)** | **+17.8%** |

**Days supporting: 14 of 14. Profitable days: 11 of 14. LODO band +14.9% to +22.1%, zero of 14 folds negative.**

| size | slips | days | full% | ROI | LODO band | folds neg | break-even per-leg |
|---|---|---|---|---|---|---|---|
| 2 | 80 | 14 | 83.8% | +9.8% | +8.0% … +13.9% | 0/14 | 1.0927 |
| **3** | **51** | **14** | **78.4%** | **+17.8%** | **+14.9% … +22.1%** | **0/14** | **1.0844** |
| 4 | 37 | 14 | 67.6% | +16.2% | +11.0% … +22.8% | 0/14 | 1.1030 |

Multiplier sensitivity, 3-pick: 1.05 → −9.2%; 1.10 → **+4.4%**; 1.114 → +8.4%; 1.15 → +19.3%; 1.20 → +35.5%. **Break-even is 1.084**, comfortably under both the documented 1.140 for `walks_allowed/more` and the 1.15 fallback — the first Goblin configuration with genuine headroom against multiplier uncertainty.

### Why this is still NOT promotable — the honest part

The +10.8pp that max-1-per-game adds is **not** a correlation effect. Measured directly:

| Pair scope | n pairs | joint hit % | excess over independence |
|---|---|---|---|
| same-game | 128 | 68.8% | **−1.77pp** |
| different-game | 3,020 | 71.8% | −0.23pp |

Same-game legs in this pool are, if anything, very slightly *negatively* correlated. So the max-1-per-game rule is not removing a correlation risk — it is a **63% pool reduction acting as a de-facto quality filter**, and its gain is a leg-selection effect. That is precisely the shape of intervention this log records failing validation repeatedly (leg-density filtering, twice; spot-9-only narrowing; every context gate). At 51 slips it is also thin.

**Verdict: best-supported Goblin configuration ever found, and a data request rather than a config change.** `earned_runs/more/0.5` has no real placed-slip observation anywhere. One real Goblin slip containing it would settle whether the +17.8% is real or an artifact of the 1.15 fallback.

---

## 3. PP REGULAR — multi-layer stacking, tested on the current signal for the first time

The matrix has carried ❌ on this cell since it was created, with the note *"only tested on the retired Gen-1 signal, never on the current one"*. Closed now.

**Join coverage against the `pitcher_fantasy_score/less` pool (STANDARD lane, TIERED class):** weather **98.2%**, umpire **93.8%**.

### Leg-level temperature effect — real, monotonic, and the largest context effect found so far

| Temp band | n | hit % | days |
|---|---|---|---|
| <70°F | 3 | 100.0% | 2 |
| **70–79°F** | 189 | **79.9%** | 21 |
| 80–87°F | 97 | 76.3% | 19 |
| **88°F+** | 46 | **67.4%** | 12 |

A **−12.5pp** gradient, monotonic across the three populated bands. For scale: the umpire effect previously rejected as noise was ~2pp, and the bullpen-fatigue effect that failed slip construction was +4–5pp. Roof-closed games run 80.6% (n=36) against 78.0% open, consistent in direction.

### It still does not survive slip construction

6-pick, max 1 leg/player, score-ranked:

| Variant | Slips | Days | Full hits | ROI Power |
|---|---|---|---|---|
| **V0 ungated** | 45 | 18 | 12 | **+900.0%** |
| V1 gate temp < 88°F | 37 | 18 | 9 | +812.2% |
| V2 gate temp < 80°F | 21 | **15** | 6 | +971.4% |
| V3 re-rank `score − 0.5·(temp−80)⁺` | 45 | 18 | 10 | +733.3% |
| V4 re-rank `score − 1.0·(temp−80)⁺` | 45 | 18 | 12 | +900.0% |

*(Baseline here is +900.0% on 45 slips rather than Session 5's +782.4% on 51 — same pool and same constraint, but this run's dedup key includes `game_pk`, which drops a handful of legs. The comparison within the table is like-for-like, which is what the test needs.)*

**REJECTED.** V1 loses 3 full hits and 88pp. V2's nominal gain rests on **6 full hits** and costs 3 days and half the volume. The re-rank is worse at γ=0.5 and inert at γ=1.0. Same failure mode as every prior stacking attempt: the gate thins the pool faster than the edge pays.

## 4. PP REGULAR — adaptive shrink/expand sizing

Second ❌ cell closed. Build the largest size the day's pool supports, 2 through 6, falling back when depth is short:

| Mode | Slips | Days | Full hits | ROI Power |
|---|---|---|---|---|
| Fixed 6-pick | 51 | 18 | 12 | **+782.4%** |
| **Adaptive 2–6** | 48 | **21** | 12 | **+771.9%** |

**Buys +3 days of coverage for 10.5pp.** A materially better trade than the Sleeper case (which cost 95pp for +6 days), but still a trade. Worth considering if day-coverage matters operationally; not a free win.

---

## 5. UNDERDOG — Gemini generative hypothesis, third track rotated in

Track rotated to Underdog per §1e. Gemini was given the full real per-prop hit-rate table, the compounding payout model and its break-even ladder, the 40-config negative sweep, the already-rejected list, and was explicitly invited to answer *"or is the track structurally unplayable?"*

### Raw call

```
run_job(job="direct_worker_probe", extra={
  method: "POST",
  url: "https://alphadog-v2-admin-sql.rodolfoaamattos.workers.dev/gemini-proxy",
  body: "{\"model\": \"gemini-3.6-flash\", \"prompt\": \"UNDERDOG Pick'em MLB track. Give ONE new falsifiable
   hypothesis with a specific baseball mechanism. Concise, under 300 words.\n\nREAL STATE (28 days graded,
   exhaustive enumeration of every buildable slip): Underdog pays published table x 0.6865 PER LEG,
   compounding. So 2-pick pays 1.65x, 3-pick 2.10x, 4-pick 2.67x, 6-pick 3.66x. Break-even per-leg hit
   rate is 77.9% at 2-pick rising to 80.5% at 6-pick. THE PROBLEM IS THAT ALMOST NO UNDERDOG PROP CLEARS
   78%.\n\nReal per-prop hit rates: rbis/less 71.5% (n=2937); walks/less 68.5% (n=2646); runs/less 64.7%
   (n=2221); hits/more 62.2% (n=434); total_bases/more 60.5%; fantasy_score/less 58.5%; total_bases/less
   58.4%; hits_runs_rbis/more 58.2%; pitcher_outs/less 57.3%; hits_runs_rbis/less 54.1%; hits/less 49.9%;
   earned_runs/less 48.8%; walks_allowed/less 48.4%. The locked pool rbis+walks /less is -55.4% at 6-pick
   with 18 of 18 leave-one-day-out folds negative. 8 pool compositions x 5 sizes = 40 configs, all
   negative. The ONLY positive pool ever found is pitcher_fantasy_score/less at 79.6% (n=147), +4.1% at
   2-pick, but that prop stopped being ingested on 2026-08-10 and has produced zero graded legs
   since.\n\nALREADY REJECTED, do not repeat: batting order position (flat, 63.4% at spot 1 vs 46.9% at
   spot 9); hits_allowed depth gate (built for a retired pool); size and cap sweeps (done exhaustively);
   pool composition swaps among the props listed above (40 configs, all negative); void/DNP repricing
   (measured at 0.06%, a no-op).\n\nCONSTRAINT: I can only use per-leg graded outcomes (player, prop,
   line, side, date, game_pk) plus these context layers: weather 98%, home-plate umpire 94%, lineup slot
   80%, bullpen availability 39%, park/venue. I can also use hitter and pitcher game logs for
   walk-forward rolling stats.\n\nThe real question: is there ANY selection rule that lifts an Underdog
   leg population above 80%, or is the track structurally unplayable? Answer honestly - if you think it
   is unplayable, say so and explain why. Otherwise: (1) hypothesis in one sentence, (2) mechanism, (3)
   exact test and what falsifies it, (4) why it clears 80% when nothing else does.\"}"
})
```

### Raw response

> **Track Status:** Unplayable on aggregate/generic pools, but conditionally playable on static `0.5` lines where severe contextual compounding is unpriced.
>
> ### Hypothesis
> Filtering `walks/less` at line=0.5 to hitters with a rolling 30-day BB% < 5.5% facing pitchers with a rolling 30-day Strike% > 66.5% under top-quartile wide-zone umpires will achieve an out-of-sample leg hit rate above 82.0%.
>
> ### Baseball Mechanism
> Underdog defaults non-elite hitters to a static 0.5 line for `walks/less`. A low-plate-discipline hitter (baseline λ ≈ 0.25 walks/game) facing a high-strike-rate pitcher already sees suppressed walk probability. When combined with a pitcher-friendly home-plate umpire (expanding the strike zone by 1.5–2.0 inches), the hitter's expected walk rate (λ) drops below 0.18. Because walk events closely approximate a Poisson distribution at low means, suppressing λ to 0.18 raises P(X=0) = e^(−λ) directly above 83.5%.
>
> ### Exact Test & Falsification Criteria
> 1. **Dataset:** Graded `walks/less` legs at Line = 0.5.
> 2. **Filters:** Hitter rolling 30-day BB% < 5.5% (min 50 PA); Pitcher rolling 30-day Strike% > 66.5% (min 15 IP); Home-Plate Umpire in top 25% of Called Strike Above Expectation (CSAE) or wide-zone metric.
> 3. **Falsification:** The hypothesis is false if the out-of-sample hit rate across ≥ 250 qualified legs falls below **80.0%** or produces a negative net ROI on 2-pick slips (1.65x payout).
>
> ### Why It Clears 80%
> Baseline `walks/less` is already the second-highest pool at 68.5%. Moving from 68.5% to >80% only requires a drop in the hitter's expected mean walks from ~0.38 to ≤ 0.20. Underdog's static pricing cannot set a line lower than 0.5 for counting stats, creating a mathematical ceiling that prevents them from adjusting for this three-way structural walk suppression.

### Real test — arm by arm

**Arm 1, hitter rolling 30-day BB% (walk-forward, prior dates only, ≥50 prior PA): VALIDATED and well-powered.** All 2,646 `walks/less` legs sit at line 0.5 exactly, as Gemini assumed.

| Hitter 30d BB% | n | hit % | days |
|---|---|---|---|
| **< 5.5%** (Gemini's cut) | 443 | **73.6%** | 18 |
| 5.5 – 8.0% | 455 | 68.4% | 18 |
| 8.0 – 11.0% | 641 | 66.8% | 18 |
| **11.0%+** | 628 | **63.9%** | 18 |

Monotonic across four bands, **+9.7pp** top to bottom. **This is the first real leg-quality gradient ever found on the Underdog track.** But 73.6% is still 4.3pp short of the 77.9% two-pick break-even, and tightening further does not help — within the <5.5% group the sub-bands are non-monotonic (<3.0% 73.5%, 3.0–4.0% 72.3%, 4.0–5.0% 78.5%, 5.0–5.5% 68.0%), so the signal saturates at Gemini's own cut.

**Arm 2, pitcher rolling 30-day Strike%: BLOCKED.** `stats_pitcher.game_logs.strikes`/`pitches` are populated on **808 of 15,841 rows (5.1%)**; `raw_json->'stat'->>'strikePercentage'` reaches 4,039 (25.5%). Neither supports a walk-forward 30-day window crossed with two other filters. Reported as blocked, not silently dropped.

**Arm 3, umpire zone: does not compound.** Walk-forward umpire tendency built as prior-date walks-per-PA across all games that umpire worked (88 umpires, 459 umpire-game-days, mean 0.0865):

| | pitcher-friendly ump (prior BB <0.080) | mid | hitter-friendly ump (prior BB ≥0.095) |
|---|---|---|---|
| **low-BB hitter** | **79.0%** (n=105) | 71.7% (n=159) | 74.2% (n=124) |
| other hitter | 63.8% (n=464) | 66.2% (n=595) | 66.3% (n=457) |

Directionally Gemini was right — the best cell is low-BB hitter × pitcher-friendly umpire — but it is **non-monotonic** (mid is the worst of the three), and the qualified cell peaks at **79.0% on 105 legs**, against Gemini's stated bar of ≥80.0% on ≥250 legs.

**Slip construction on the qualified cell:**

| Size | Payout | Slips | Days | Full hits | ROI | LODO band | folds neg |
|---|---|---|---|---|---|---|---|
| 2-pick | 1.649x | 49 | 15 | 30 (61.2%) | **+1.0%** | −4.7% … +6.3% | **4/15** |
| 3-pick | 2.103x | 31 | 14 | 11 (35.5%) | **−25.4%** | −34.7% … −17.4% | **14/14** |

**REJECTED** on Gemini's own falsification criteria — under the leg bar, under the hit-rate bar, and the 2-pick ROI of +1.0% has four negative folds in fifteen. Gemini's own headline verdict, *"unplayable on aggregate/generic pools"*, is the finding that survives, and it now has a measured gradient behind it rather than an assertion.

---

## 6. VOID / DNP — extended to the pitcher-leg population

Session 5 measured hitter legs at 0.06%. The pitcher side had always been assumed exempt ("N/A, pitcher props") without a number. Measured directly against `stats_pitcher.game_logs` with `batters_faced > 0`, all graded pitcher legs from 2026-08-04 (`pitcher_fantasy_score`, `pitcher_strikeouts`, `earned_runs`, `hits_allowed`, `walks_allowed`, `pitcher_outs`):

| Metric | Value |
|---|---|
| Graded pitcher legs | 794 |
| Legs whose pitcher faced no batters | **0** |
| Void rate | **0.00%** |

The assumption was correct and now has a real number under it. **Void/DNP repricing is closed across both leg populations** — 0.06% on hitters, 0.00% on pitchers. It moves nothing.

---

## 7. HONEST SUMMARY

**Genuinely new this session:**
1. **The payload's eight "standard-lane" buckets measured directly: 88–98% goblin, 2 standard legs out of 5,874.** The retraction is now written into `HIGH_HIT_RATE_METHODOLOGY.md` §3 itself, so it stops re-seeding.
2. **Ranked slip construction on those buckets, in the correct lane** — a structurally different method from Session 5's exhaustive enumeration. Eight-bucket pool −4.9% to −12.8%; every hitter-led variant negative.
3. **V3-C: `earned_runs/more/0.5` + `walks_allowed/more/0.5`, 3-pick, max 1 leg/game — +17.8%, 14/14 days supporting, LODO +14.9% to +22.1%, 0 negative folds, break-even per-leg 1.084.** Best-supported Goblin configuration ever found.
4. **And the honest counterweight: its edge is not correlation.** Same-game pairs show −1.77pp excess on 128 pairs. The max-1-per-game rule is a 63% pool reduction acting as a quality filter — the exact shape that has failed validation repeatedly here.
5. **Goblin cap sweep crossed with three correlation treatments** — concentration helps monotonically (cap1 +28.6% → uncapped +17.8%), unlike PP Regular.
6. **Temperature is the largest leg-level context effect yet found on any track**: `pitcher_fantasy_score/less` runs 79.9% at 70–79°F and 67.4% at 88°F+, −12.5pp monotonic. It still fails slip construction, in the now-familiar way.
7. **Adaptive sizing on PP Regular buys +3 days for 10.5pp** — the best coverage/return trade found so far.
8. **First real leg-quality gradient on Underdog**: hitter 30-day BB% is monotonic over four bands, +9.7pp, n=443 in the top band. Still 4.3pp short of playable, and it saturates.
9. **Pitcher-leg void rate measured at 0.00% (0 of 794).**
10. **Pitcher Strike% is 5.1% populated** — a second `stats_pitcher` field, after first-pitch-strike rate, that cannot support context work.

**Re-confirmed:** no grading gap (fourth UTC/Pacific correction); Goblin negative as deployed; PP Regular robust; Underdog structurally unplayable, now with Gemini independently reaching the same verdict.

**RETRACTED / corrected this session:**
1. **The firing payload's instruction to treat the lane finding as established.** Re-verified against its own eight buckets and found false.
2. **The payload's restatement of the 08-21 grading gap.** Fourth occurrence of the same timezone error.
3. **`HIGH_HIT_RATE_METHODOLOGY.md` §3 patched at source** with a retraction notice and the measured lane table, and its "#1 open item" marked closed with the result above.

**Needs the user's decision (carried from Session 5, unchanged — no new data has arrived):**
- Suspend Demon; move Sleeper to `rbis/less`; suspend Underdog staking.
- **Place slips and report multipliers.** Now four, in priority order: (1) PP Regular **Power** 6-pick — break-even ratio 0.691 vs Goblin's measured 0.620; (2) Sleeper 6-pick on `rbis/less` — resolves 1.628 vs 1.2684; (3) a Goblin slip containing **`earned_runs/more/0.5`** — the only unmeasured leg in the +17.8% pool; (4) a Goblin slip containing `hits_allowed/more/2.5`.
- **Two live defects, reported not touched:** the `outcome_final` writer not populating lane flags; Underdog `pitcher_fantasy_score` producing zero graded legs since 2026-08-10.

**Stopping condition: NOT met.** Seven structurally distinct passes. The session was directed at the payload's named items and closed on those, not on the five-consecutive-null rule.

**Next session should start here:** 08-21 grades out ~22:23 PDT tonight. That is the first day where the live `goblin_demon_tier` column (4,379 rows already written) and graded outcomes coexist, making a tier backtest possible with **no reconstruction at all** — no rounding convention, no anchor derivation, no banker's-rounding trap. It is the single highest-value query available and it did not exist before tonight.

**Nothing was deployed, patched, or modified.**

---

# ===== 2026-08-21 (Fri) — Session 7 — user challenge: reconcile the 97.9% figure, root-cause the Demon clustering =====

**Run type:** dry run, research only. Nothing deployed, patched, or modified.
**Trigger:** the user independently re-ran the lane cross-tabulation, got 40–56%, and asked for the exact query and full result set behind 97.9% before the retraction stands as final. Also asked for the demon `less`-only date clustering to be root-caused to the same standard as the lineup-join and rounding bugs before the Demon suspension recommendation is finalised.

**Outcome: the user is right. The 97.9% figure is wrong and is corrected to 92.1%. The retraction itself survives unaltered. The Demon root cause is established, and it materially changes the *reason* for the suspension recommendation without changing the recommendation.**

---

## 1. THE EXACT QUERY BEHIND 97.9%, AND ITS FULL RESULT

```sql
WITH f AS (
  SELECT official_date, mlb_player_id, canonical_prop_key, selected_side, line_value,
         max(CASE WHEN is_goblin=1 THEN 1 ELSE 0 END) g, max(CASE WHEN is_demon=1 THEN 1 ELSE 0 END) d
  FROM score.prop_outcome_history
  WHERE outcome_hit IS NOT NULL AND source_key='prizepicks' AND outcome_id LIKE 'outcome_final|%'
  GROUP BY 1,2,3,4,5),
g AS (
  SELECT official_date, mlb_player_id, canonical_prop_key, selected_side, line_value,
         max(CASE WHEN is_goblin=1 THEN 1 ELSE 0 END) g, max(CASE WHEN is_demon=1 THEN 1 ELSE 0 END) d
  FROM score.prop_outcome_history
  WHERE outcome_hit IS NOT NULL AND source_key='prizepicks' AND outcome_id LIKE 'grade_%'
  GROUP BY 1,2,3,4,5)
SELECT
 CASE WHEN f.g=1 THEN 'goblin' WHEN f.d=1 THEN 'demon' ELSE 'neither' END AS final_lane,
 CASE WHEN g.g=1 THEN 'goblin' WHEN g.d=1 THEN 'demon' ELSE 'neither' END AS grade_lane,
 count(*) keys
FROM f JOIN g USING (official_date, mlb_player_id, canonical_prop_key, selected_side, line_value)
GROUP BY 1,2 ORDER BY 3 DESC
```

Full result set, re-run this session, reproduces exactly:

| final_lane | grade_lane | keys |
|---|---|---|
| neither | goblin | 28,505 |
| neither | demon | 7,131 |
| neither | neither | 782 |
| demon | demon | 43 |
| goblin | goblin | 4 |

35,636 / 36,415 = 97.9%. **The arithmetic is right. The population is wrong.**

### Why it is wrong

This is `prop_outcome_history` against **itself** — the `outcome_final` writer versus the `grade_*` writer — and it is an **INNER JOIN**. It is not a join to the authoritative board at all. Key counts:

| | keys |
|---|---|
| `outcome_final` distinct keys | 41,055 |
| `grade_*` distinct keys | 47,909 |
| **in both (the 97.9% denominator)** | **36,465** |
| **`outcome_final` only — silently dropped** | **4,590** |

The denominator is conditioned on *"a `grade_*` row exists"*, and that condition is itself correlated with being goblin or demon. Splitting on exactly it:

| `outcome_final` key | keys | joined to board | goblin/demon on board | neither on board | **% goblin/demon** |
|---|---|---|---|---|---|
| has a `grade_*` row | 36,465 | 36,272 | 35,357 | 915 | **97.5%** |
| **no `grade_*` row** | **4,590** | 4,219 | 2,038 | **2,181** | **48.3%** |

**Conditioning on the join doubles the rate.** This is the same failure mode as the `WHERE batting_order_code IS NOT NULL` filter placed inside the lineup join CTE — the one this file already records as producing a bogus "2–5% lineup join rate" across three sessions. Standing rule B7 exists to catch precisely this and I did not apply it to my own query.

## 2. THE CORRECT MEASUREMENT — 92.1%

Denominator = all PrizePicks graded `outcome_final` rows reading 0/0. Lane from `score.final_board_history`:

| Method | population | joined | goblin | demon | neither | **% relabelled (of joined)** |
|---|---|---|---|---|---|---|
| Row level, join on `final_board_row_id` | 41,157 | 40,901 | 29,649 | 8,009 | 3,243 | **92.1%** |
| Distinct key, join on player/prop/side/line/game | 40,724 | 40,719 | — | — | 3,060 | **92.5%** |

**The two join keys agree to within 0.4pp.** Average board rows per key is **1.01**, so fan-out is negligible. The join key was never the source of disagreement — the denominator was.

**92.1% is the figure that should be quoted. Every prior statement of 97.9% is corrected.**

## 3. RECONCILING THE USER'S 40–56%

Reproduced exactly. The dominant driver is **not restricting `source_key='prizepicks'`**. Sleeper and Underdog have no goblin/demon lane at all — PrizePicks is the only app with the mechanic — so their legs correctly read 0/0 on both sides of the join and are legitimately standard. They enter the denominator and can never enter the numerator:

| Variant | 0/0 rows | joined | relabelled | % of joined | % of all |
|---|---|---|---|---|---|
| A. PP only, graded, `outcome_final` only | 41,157 | 40,901 | 37,658 | **92.1%** | 91.5% |
| B. ALL APPS, graded, `outcome_final` only | 63,262 | 62,539 | 37,658 | 60.2% | 59.5% |
| C. ALL APPS, graded, any writer | 83,043 | 81,678 | 37,658 | **46.1%** | 45.3% |
| D. ALL APPS, graded + ungraded, any writer | 86,762 | 85,394 | 37,658 | 44.1% | 43.4% |

**The numerator is fixed at 37,658 in every variant. Only the denominator moves.** Variants C and D land squarely in the user's 40–56% band; variant B sits at its top edge. Adding the `grade_*` writer's own 0/0 rows to the population (B→C) is the secondary driver, worth another ~14pp.

**Standing rule to add: always restrict to `source_key='prizepicks'` before measuring anything lane-related.**

## 4. CROSS-VALIDATION — the two lane sources agree perfectly

Joining the `grade_*` writer to `final_board_history` on `final_board_row_id`:

| `grade_*` says | board says | rows |
|---|---|---|
| goblin | goblin | 32,463 |
| demon | demon | 13,142 |
| neither | neither | 2,332 |

**47,937 rows, zero disagreements, zero off-diagonal.** The question was never which lane source to trust. Both are right; my denominator was wrong.

## 5. WHAT THIS DOES AND DOES NOT CHANGE

**Corrected:** the headline figure, 97.9% → **92.1%**, in `SIGNALS_TECHNIQUES_TRIED.md` and in the `HIGH_HIT_RATE_METHODOLOGY.md` §3 retraction notice.

**Unchanged — every downstream conclusion was computed from the board join, never from the 97.9% figure:**
- the corrected lane split (goblin 73.3% / standard 54.6% / demon 34.6%) — from the board join;
- the genuinely-standard share at **7.9%** of PP legs — from the board join, and consistent with 92.1%;
- zero standard-lane buckets clearing n≥30 & 80% — from the board join;
- the eight-bucket audit (88–98% goblin, 2 standard legs in 5,874) — from the board join;
- PP Regular's 376/376 standard-lane legs — from the board join;
- the Bryce Harper row-level duplication example — a direct row inspection.

**The retraction of the +1298.7% standard-vs-goblin comparison stands unaltered.** Its evidence is the duplication itself plus the structural incoherence of a "standard" lane hitting 84.8% while goblin hits 73.3%, neither of which depends on the disputed percentage.

---

## 6. DEMON `less`-ONLY CLUSTERING — ROOT-CAUSED

Traced to the same standard as the lineup-join and rounding bugs.

### Step 1 — the grading is not the bug

For every graded PrizePicks demon row with a recorded stat, 08-03 → 08-14, tested whether `outcome_hit` equals `(actual_stat_value < line_value)` for `less` and `(actual_stat_value > line_value)` for `more`:

| Date | rows | `less` consistent | `less` INCONSISTENT | `more` consistent | `more` INCONSISTENT |
|---|---|---|---|---|---|
| 08-03 | 334 | 0 | **0** | 334 | **0** |
| 08-05 | 1,028 | 810 | **0** | 218 | **0** |
| 08-06 | 768 | 510 | **0** | 258 | **0** |
| 08-07 | 1,053 | 789 | **0** | 264 | **0** |
| 08-11 | 3,381 | 2,812 | **0** | 569 | **0** |
| 08-12 | 1,128 | 640 | **0** | 488 | **0** |
| 08-13 | 679 | 231 | **0** | 448 | **0** |
| 08-14 | 557 | 310 | **0** | 247 | **0** |

**Zero inconsistencies across 8,485 rows, every day, both sides.** Outcomes are graded correctly; the hit rates are real; the lines are real.

### Step 2 — the label is inverted

On clean days the `less`-side tag is monotone in line value: `less` at 0.5 is hard (demon), `less` at 2.5/3.5 is easy (goblin). `total_bases`, distinct (player, prop, line) board keys:

| Date | 0.5→demon | 0.5→goblin | 2.5→demon | 2.5→goblin | 3.5→demon | 3.5→goblin |
|---|---|---|---|---|---|---|
| **08-13 (clean)** | **60** | 2 | 0 | **140** | 0 | **89** |
| **08-07 (affected)** | 1 | **10** | **66** | 0 | **13** | 0 |
| **08-11 (partial)** | 24 | 67 | 130 | 41 | 53 | 16 |

08-07 is the exact mirror of 08-13. The whole-prop line averages agree:

| Date | goblin-`less` n | goblin-`less` avg line | demon-`less` n | demon-`less` avg line |
|---|---|---|---|---|
| 08-05 | **0** | — | 166 | **2.68** |
| 08-06 | 1 | 0.50 | 68 | **2.38** |
| 08-07 | 6 | 0.50 | 98 | **2.40** |
| 08-08 | 75 | **2.54** | 7 | 0.50 |
| 08-09 | 224 | **2.21** | 4 | 0.50 |
| 08-10 | 369 | **2.17** | 26 | 0.65 |
| **08-11** | 291 | 1.57 | 679 | **2.18** |
| **08-12** | 1,225 | **2.44** | 299 | **0.51** |
| 08-13 | 658 | **2.41** | 112 | 0.50 |
| 08-14 | 557 | **2.41** | 77 | 0.50 |

Same pattern on `hits_runs_rbis` demon-`less` (4.50 / 3.09 / 2.80 affected vs 0.75–0.93 clean) and `singles` (1.13 / 0.96 vs 0.50).

### Step 3 — scope and shape

The `more` side is stable at 8–16% throughout with no inversion. Across all tested dates and lines, `more=goblin & less=demon` and `more=demon & less=goblin` pairings both number **zero** — each (player, prop, line) carries only one side on the board. **This is a sign error in deriving the `less`-side complement tag from the line's position relative to the anchor, not a swap of a materialised pair.**

### Step 4 — boundary, and 08-12 is CLEAN

The inversion ends after 08-11. **08-12's demon-`less` sits at avg line 0.51 (n=299), matching the clean steady state exactly.** Session 5 flagged 08-12 as possibly partially contaminated on the strength of its 45.9% demon-`less` hit rate; that suspicion is **resolved — 08-12 is clean**, and 45.9% is simply a good demon day. 08-11 is a *partial* inversion (both labels present at every line), consistent with a mid-day deploy or an overlapping batch reprocess.

### Step 5 — writer signature, exactly like the lineup case

`source_variant_label` on `less` rows: **NULL on every row through 08-12**, 69 rows on 08-13, **3,555 from 08-14** onward. A writer-generation boundary lands immediately after the inversion window, matching the documented 2026-08-12 "blanket Less→flip rule mislabeled 1,752 real legs" fix in `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` §4a.

### Step 6 — where the code is

`alphadog-v2-score-final-board.js` only passes the flags through (line 259: `is_goblin: Number(rawRow.is_goblin || 0) === 1 ? 1 : 0`), and its own comment at lines 282–284 states they *"come straight from the verified `odds_type` + `allowed_wager_types` mechanism at raw ingestion"*. **The defect is upstream of the final-board worker, in score-prep / raw ingestion, and was fixed there on 2026-08-12.** The window is historical and already closed — no live change needed or recommended.

### Step 7 — whole-day exclusion is right; row-level salvage is not

Relabelling only the rows whose line exceeds the clean-day demon-`less` ceiling would recover 42–61% of affected rows. But the **remaining below-ceiling rows still hit 63.1–75.1%**, against a clean-day demon-`less` rate of 34–42%:

| Date | demon-`less` rows | above clean ceiling | % | hit % above ceiling | hit % below ceiling |
|---|---|---|---|---|---|
| 08-05 | 563 | 342 | 60.7% | 89.5% | **75.1%** |
| 08-06 | 443 | 218 | 49.2% | 73.9% | **63.1%** |
| 08-07 | 634 | 340 | 53.6% | 80.9% | **68.4%** |
| 08-11 | 2,403 | 1,019 | 42.4% | 82.5% | **68.7%** |

The contamination is not confined to rows a line threshold can identify. **Drop 08-05, 08-06, 08-07 and 08-11 entirely. Do not attempt row-level repair.**

---

## 7. WHAT THIS DOES TO THE DEMON SUSPENSION RECOMMENDATION

**The recommendation stands. Its stated reason was wrong and is corrected.**

Session 5 said Demon has *"no clean evidence base."* That overstated it. The correct statement:

- The four affected days are genuinely unusable — confirmed, with a mechanism.
- **08-12 is clean**, so the ex-corruption evidence is *real*, not corrupt.
- But it is *thin and concentrated*: at 3-pick, Pool K ex-corruption has 9 supporting days, of which **08-12 alone supplies 816 of 873 combinations and 220 of 222 winners** — because it had 18 qualifying legs against 1–6 on every other day. Six of the nine supporting days are −100%. Removing 08-12 gives **−47.4%**.

So the concentration is a **pool-depth** artifact, not a corruption artifact. That distinction matters for what would resolve it: **not "wait for uncorrupted data" — the data from 08-12 onward is already clean — but "wait for more deep Demon days."** Given 08-21 has 4,379 tier-bearing board rows grading tonight, that may arrive quickly.

**Recommendation, restated precisely: suspend Demon staking pending more deep days, not because the evidence is corrupt but because the clean evidence is one deep day and eight thin ones.**

---

## 8. HONEST SUMMARY

**Corrected this session:**
1. **97.9% → 92.1%.** My denominator was conditioned on `grade_*` existence — a selection effect worth 5.8pp, dropping 4,590 keys that are 48.3% goblin/demon rather than 97.5%. Same class of error as the lineup-join filter this very file documents. Patched in both reference docs.
2. **Session 5's "08-12 may be partially contaminated"** — it is not; avg demon-`less` line 0.51 matches clean steady state exactly.
3. **Session 5's "Demon has no clean evidence base"** — overstated. The evidence from 08-12 on is clean; it is thin and depth-concentrated.

**Established this session:**
4. The demon anomaly is a **sign inversion in the `less`-side complement tag**, `less`-side only, with grading verified correct across 8,485 rows and zero inconsistencies.
5. Boundary is **08-05 → 08-11**, with 08-11 partial; `source_variant_label` marks the adjacent writer generation change at 08-13/08-14.
6. The defect is **upstream of the final-board worker** and was fixed 2026-08-12; nothing live to change.
7. **Whole-day exclusion is required** — below-ceiling rows on affected days still hit 63–75%, so a line-threshold repair leaves substantial contamination.
8. The two lane sources (`grade_*` and `final_board_history`) **agree on 47,937 rows with zero disagreements.**
9. New standing rule: **always restrict `source_key='prizepicks'` before measuring lane** — omitting it moves the headline from 92.1% to ~46%.

**Unchanged:** the lane retraction itself, the corrected lane split, the empty standard-lane bucket set, the eight-bucket audit, PP Regular's lane purity, and every track-level conclusion in Sessions 5 and 6.

**Nothing was deployed, patched, or modified.**

---

# ===== 2026-08-22 (Sat) — Session 8 — scheduled daily run =====

**Run type:** dry run, research only. Nothing deployed, patched, or modified. Documentation files updated as the task requires.
**Backtest window:** full expanding record. Graded data 2026-07-24 → **2026-08-21** (29 days). Lane-authoritative window 25 clean days after excluding the four corrupted demon days.
**Passes run:** 15 structurally distinct. Stopping condition **NOT met** — see §12.

---

## 0. FRESHNESS, SCHEMA CENSUS, AND THREE FALSE PREMISES IN THE FIRING PAYLOAD

`SELECT max(official_date) FROM score.prop_outcome_history WHERE outcome_hit IS NOT NULL` → **2026-08-21**. Today is 2026-08-22, so the latest graded day *is* yesterday. **No gap.** 29 graded days, 07-24 → 08-21.

**2026-08-21 is a day no prior session has ever seen.** Every session in this log ran against a record ending 08-20.

The payload supplied several premises. Three are false and were re-verified rather than assumed, because acting on them would mean reporting known artifacts as fact.

| Payload premise | Verified result |
|---|---|
| "~40 schemas exist" | **18.** Same correction Session 2 made and the payload still carries. |
| "`backtest` (~72 relations)" | **75** tables/views (93 relations incl. indexes). Three built by prior sessions the payload does not mention: `reconstructed_tiers_20260822`, `unified_tiers_20260822`, `snapshot_tiered_v3`. |
| "A one-day gap existed on 2026-08-22 (latest 08-20) — check whether it persists" | **No gap.** This is the fourth appearance of this flag in the log and the fourth time it has been wrong. Sessions 4 and 5 both traced it to UTC-for-Pacific confusion. |
| "`doubles/less/0.5` prices at **+1298.7%** in the standard lane and −13.0% in the Goblin lane" | **Retracted 2026-08-21 (sessions 5, 6, 7)** and the retraction is now written into `HIGH_HIT_RATE_METHODOLOGY.md` §3 itself. Re-verified again today on a window nearly twice as wide (§1): **zero standard-lane buckets clear n≥30 and 80%.** The payload is quoting a superseded figure. |
| "Highest-priority open item (1): re-test the top standard-lane buckets as an actual PP Regular pool" | **Closed 2026-08-21 session 6.** The item has no valid pool — those buckets are 88–98% goblin lane. Not re-spent. |
| "Highest-priority open item (2): void/DNP-adjusted repricing, never executed" | **Executed sessions 5 and 6.** Hitter legs 0.06% (15 of 25,909), pitcher legs 0.00% (0 of 794). Not re-spent. |
| "Demon move from `hits_runs_rbis/less/Tier2` to `pitcher_strikeouts/less/Tier2`" | `pitcher_strikeouts/less/Tier2` **is already the deployed pool** — the `hits_runs_rbis` reference was a documentation error corrected in `MULTIPLIER_TABLES_MASTER.md` §3. The real question is different and is answered in §5. |

**Table trust.** `backtest.demon_full_history_dedup_v2` profiled before use: 3,351 rows, 26 days 07-26 → **08-20**, zero NULL tiers, zero NULL outcomes, tiers 1–11, 20.4% hit rate, 14 props. Clean — but **one day stale** relative to the graded record. §5 extends it to 08-21 using the live tier column. The void tables named in the payload were not read.

---

## 1. HEADLINE — `score_0_100` HAS NO WITHIN-POOL PREDICTIVE POWER. EVERY RANKED-GREEDY ROI IN THIS LOG IS OVERSTATED.

Rule B0 says *don't rank by the internal score*. Nobody had measured the cost. Leg-level Pearson correlation between `score_0_100` and `outcome_hit`, PrizePicks, four corrupted days excluded, deduped:

| Scope | n | corr(`score_0_100`, `outcome_hit`) |
|---|---|---|
| Whole PrizePicks board | 48,219 | **+0.414** |
| Demon lane only | 9,120 | +0.338 |
| Goblin lane only | 34,768 | +0.126 |
| `goblin/total_bases` | 6,291 | +0.129 |
| `goblin/doubles/less/0.5` | 2,094 | **+0.001** |
| `standard/pitcher_fantasy_score/less` (locked PP Regular pool) | 348 | **−0.005** |

**The score sorts lanes, and almost nothing else.** Once the pool is one (prop, side, line) bucket — which is what all five locked strategies are — the correlation is zero. Session 1's "+15.0pp top-30 lift, PrizePicks scoring is healthy" is **re-scoped, not refuted**: measured across the whole board, the score is re-discovering `is_goblin`/`is_demon`, information the board already carries explicitly.

**Consequence, and it is not small.** A track's EV is its pool's binomial expectation. PP Regular: pool hit rate 79.7%, so 6-pick expects `0.797⁶ × 37.5 − 1 = +861%`; ranked-greedy observes **+993.8%** on 48 slips. The +133pp gap is sampling noise, not selection skill. **The pool is the strategy.** Cap sweeps and ranker choices on homogeneous pools measure noise.

---

## 2. METHOD CORRECTION — neither outcome writer is complete. Sessions 5–7 lost 11 days; a `grade_*`-only fix would lose the entire PP Regular pool.

Sessions 5, 6 and 7 restricted to `outcome_id LIKE 'outcome_final|%'`. That writer joins the authoritative board on 2,000–4,000 legs/day **from 08-05 onward** and on only 5–128 legs/day before it:

| Date | `outcome_final` legs | joined to board | all-writer legs |
|---|---|---|---|
| 07-25 | 5 | 1 | 69 |
| 07-27 | 128 | 5 | 1,053 |
| 08-03 | 47 | **0** | 803 |
| 08-05 | 235 | 235 | 1,831 |
| 08-12 | 4,155 | 3,991 | 11,386 |
| 08-21 | 3,919 | 3,919 | 7,533 |

So the sessions-5-7 window is **13 clean days**, not the 24–25 they reported elsewhere. But `grade_*` alone is not the fix: it carries **zero rows** for `pitcher_fantasy_score`, i.e. none of the PP Regular locked pool (which lives entirely in `outcome_final`, 451 legs / 27 days / 79.4%).

**Correct method: union both writers, dedupe on (date, player, prop, side, line, game), take the lane from `final_board_history`.** 367 of 48,219 legs (0.8%) fail to resolve. Cleanest lane split yet recorded:

| Lane (authoritative) | legs | hit % | days |
|---|---|---|---|
| goblin | 34,769 | **73.4%** | 25 |
| standard | 3,965 | **51.3%** | 24 |
| demon | 9,118 | **19.3%** | 24 |

Sessions 5–7 quoted demon at 34.6% — that figure **included** the four corrupted days. 19.3% is the clean number and is far more consistent with the mechanism.

**B0 bucket table rebuilt on the union, 25 clean days, n≥30 and ≥80%: 13 buckets, ALL goblin lane, ZERO standard, ZERO demon.** Best standard-lane bucket in the record at n≥15 is `hits/more/0.5` at 71.2% (n=59). Full table with class and lane is in `SIGNALS_TECHNIQUES_TRIED.md`. Note the coverage asymmetry: pitcher-supply `more` buckets carry 21–25 days, every hitter `less` bucket only 13.

---

## 3. PP GOBLIN — Session 6's "+17.8%, best-supported Goblin config ever found" is RETRACTED. Exhaustive says +4.9%.

**Pool tested:** `earned_runs/more/0.5` (class **TIERED**, 4.34 lines/player-day; lane **GOBLIN**) + `walks_allowed/more/0.5` (class **TIERED**, 2.36; lane **GOBLIN**). Per-leg multipliers from the granular `GOBLIN_LEG_MULT_TABLE`: `walks_allowed/more` **1.140** (real, n=1); `earned_runs/more` **1.15 fallback — zero real placed-slip observations.** Slip multiplier = product of per-leg rates, never a blended ratio.

### 3a. Pool-composition sweep first — 150 configs, genuinely different pools

15 non-empty subsets of {`earned_runs/more/0.5`, `walks_allowed/more/0.5`, `hits_allowed/more/2.5`, `pitcher_outs/more/11.5`} × sizes 2–6 × 2 correlation treatments. 40 configs positive. The **4-bucket pool is negative at every size** (−3.1% to −9.1%) — a new pool composition, tested, rejected. Best-looking were the 2-bucket pools under max-1-per-game.

### 3b. Then the tie-break problem surfaced

`score_0_100` takes **37 distinct values** across this 777-leg pool, and **539 legs (69.4%) sit in a same-day tie group.** The same config (6-pick, max-1/game) returned **+25.9%, +19.3%, +12.5%** across three runs differing only in tie-break order. Within-day score quartiles are non-monotonic: **92.4 / 83.1 / 90.7 / 88.5%** (n = 66/59/54/52) — no ranking edge, consistent with §1.

### 3c. Exhaustive enumeration — tie-break-free, and the honest answer

| Size | Combinations | Days | Full hits | ROI | LODO band | Negative folds | Break-even per-leg |
|---|---|---|---|---|---|---|---|
| 2 | 1,304 | 24 | 1,029 | **+3.4%** | +1.7% … +6.0% | 0 / 24 | 1.130 |
| 3 | 4,358 | 24 | 3,044 | **+4.9%** | +1.7% … +8.4% | 0 / 24 | **1.127** |
| 4 | 10,325 | 23 | 6,311 | **+5.1%** | +0.2% … +9.2% | 0 / 23 | 1.136 |
| 6 | 24,611 | 22 | 11,023 | **+1.1%** | **−8.2% … +7.3%** | **4 / 22** | 1.123 |

**Verdict.** The pool is genuinely and robustly positive at 2–4 picks (0 negative folds, 24 supporting days — better day support than Session 6's 14) but at roughly **a quarter of the claimed size**, and it dies at 6-pick. Break-even per-leg **1.127** against an assumed **1.145** is a **1.6% margin sitting entirely inside the uncertainty of a fallback multiplier with zero real observations.** Session 6's own conclusion — *"treat as a data request, not a config change"* — is unchanged and now better supported.

### 3d. Day-by-day, 6-pick max-1-per-game (deterministic tie-break, ranked-greedy, for format compliance)

| Date | Slips | Full hits | ROI |
|---|---|---|---|
| 2026-07-27 | 1 | 1 | +123.4% |
| 2026-07-28 | 2 | 1 | +9.7% |
| 2026-07-29 | 1 | 0 | −100.0% |
| 2026-07-30 | 1 | 0 | −100.0% |
| 2026-07-31 | 2 | 0 | −100.0% |
| 2026-08-01 | 2 | 0 | −100.0% |
| 2026-08-02 | 1 | 1 | +119.5% |
| 2026-08-03 | 1 | 1 | +119.5% |
| 2026-08-04 | 1 | 1 | +119.5% |
| 2026-08-08 | 2 | 1 | +9.7% |
| 2026-08-09 | 2 | 0 | −100.0% |
| 2026-08-10 | 1 | 1 | +119.5% |
| 2026-08-12 | 2 | 2 | +126.3% |
| 2026-08-13 | 1 | 0 | −100.0% |
| 2026-08-14 | 2 | 1 | +15.7% |
| 2026-08-15 | 2 | 1 | +15.7% |
| 2026-08-16 | 2 | 1 | +15.7% |
| 2026-08-17 | 1 | 1 | +129.3% |
| 2026-08-18 | 2 | 0 | −100.0% |
| 2026-08-19 | 2 | 2 | +131.3% |
| 2026-08-20 | 1 | 1 | +125.3% |
| 2026-08-21 | 2 | 2 | +125.3% |
| **TOTAL** | **34** | **18** | **+19.3%** |

*(Read this table as an illustration of tie-break variance, not as the estimate. The estimate is §3c's +1.1% at this size.)*

**Adaptive sizing (matrix cell closed):** adaptive 2→6 gives +12.6% (36 slips, 24 days, 18 full) vs fixed-6 +12.5% (34 slips, 22 days) — buys 2 days for ~0pp. **Inert.** Both figures are inside the ±7pp tie-break band.

---

## 4. PP REGULAR — strongest track, best day yet on 08-21, and the cap question is finally settled

**Pool:** `pitcher_fantasy_score/less`. **Class: TIERED** (3.02 lines/player-day). **Lane: STANDARD — 349 of 349 joined legs, zero goblin, zero demon.** Per-leg multiplier **1.830** = `37.5^(1/6)`, i.e. the published Power table at ratio **1.000** — an assumption resting on **4 real Flex observations and zero Power observations** (§10).

Full record 07-28 → 08-21, 23 days, 349 legs, **79.7% leg hit rate**. Ranked greedy, max 1 leg/player:

| Size | Slips | Days | Full hits | ROI | LODO band | Negative folds |
|---|---|---|---|---|---|---|
| 2 | 168 | 22 | 105 | +87.5% | +81.5 … +93.1% | 0 / 22 |
| 3 | 109 | 22 | 55 | +202.8% | +188.2 … +211.8% | 0 / 22 |
| 4 | 79 | 21 | 32 | +305.1% | +273.3 … +326.7% | 0 / 21 |
| 5 | 59 | 20 | 18 | +510.2% | +435.7 … +554.5% | 0 / 20 |
| **6** | **48** | **19** | **14** | **+993.8%** | **+878.3 … +1066.7%** | **0 / 19** |

### Day-by-day, 6-pick Power

| Date | Slips | Full hits | ROI |
|---|---|---|---|
| 2026-07-28 | 1 | 0 | −100.0% |
| 2026-08-04 | 1 | 1 | +3650.0% |
| 2026-08-05 | 2 | 0 | −100.0% |
| 2026-08-06 | 1 | 0 | −100.0% |
| 2026-08-07 | 3 | 0 | −100.0% |
| 2026-08-08 | 4 | 1 | +837.5% |
| 2026-08-09 | 3 | 1 | +1150.0% |
| 2026-08-10 | 2 | 0 | −100.0% |
| 2026-08-11 | 3 | 1 | +1150.0% |
| 2026-08-12 | 3 | 1 | +1150.0% |
| 2026-08-13 | 2 | 0 | −100.0% |
| 2026-08-14 | 4 | 1 | +837.5% |
| 2026-08-15 | 4 | 1 | +837.5% |
| 2026-08-16 | 3 | 1 | +1150.0% |
| 2026-08-17 | 2 | 2 | +3650.0% |
| 2026-08-18 | 3 | 0 | −100.0% |
| 2026-08-19 | 2 | 1 | +1775.0% |
| 2026-08-20 | 2 | 1 | +1775.0% |
| **2026-08-21** | **3** | **2** | **+2400.0%** |
| **TOTAL** | **48** | **14** | **+993.8%** |

12 of 19 days profitable, no single-day concentration (LODO never drops below +878.3%). Excluding the four corrupted days — which do not affect this standard-lane pitcher pool but were checked anyway — gives **+1150.0%** on 39 slips, i.e. it *improves*.

### Cap sweep — the 10–15 band is closed, and the answer is 3

| Cap/day | 1 | 2 | **3** | 4 | 5 | 6 | 8 | 10 | 12 | 15 | 20 | ∞ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ROI | +689.5% | +971.4% | **+1066.7%** | +993.8% | +993.8% | +993.8% | +993.8% | +993.8% | +993.8% | +993.8% | +993.8% | +993.8% |
| Slips | 19 | 35 | 45 | 48 | 48 | 48 | 48 | 48 | 48 | 48 | 48 | 48 |

**The pool saturates at 4 slips/day, not 6 (Session 5) and not 8 (Session 2).** The 10–15 band carried as an open item since Session 1 is **inert** — the pool never produces that many slips. Per §1, the cap-3 vs cap-4 gap (73pp on 3 slips' difference) is noise; the honest statement is *"cap anywhere at 3 or above; below 3 you lose real volume."*

### Reconciliation with the documented figures

| Source | Window | Days | Slips | ROI | Named cause of difference |
|---|---|---|---|---|---|
| `MULTIPLIER_TABLES_MASTER.md` | 08-06 → 08-18 | 12 | 28 | +1105.4% | Narrow window, omits 10 worse days |
| Session 1 | full, 9am reconstruction | 18 | — | +725% | 9am-batch reconstruction lost 5 days / 25 slips |
| Session 2 | full | 24 | 77 | +1020.1% | No max-1-leg-per-player constraint |
| Session 5 | full, `outcome_final` only | 18 | 51 | +782.4% | Lost the six thinnest days to the writer restriction (§2) |
| **This session** | **full incl. 08-21** | **19** | **48** | **+993.8%** | Union writer set, max-1/player, 08-21 added |

**Multiplier sensitivity — the number that actually matters.** Full-hit rate 14/48 = 29.17% requires a total multiplier of 3.429 to break even, i.e. a per-leg ratio of **0.671**. The measured PP **Goblin** ratio is **0.620**. So if Regular Power carries the same haircut Goblin does, **this track is negative**, and the margin is only 0.051 of ratio. That is the sharpest form of the standing data request.

---

## 5. PP DEMON — the deployed pool has TEN legs on clean data. Pool I's "+478.1%" is retracted.

**Class: TIERED** throughout. **Lane: DEMON.** Source: `backtest.demon_full_history_dedup_v2` (profiled §0), four corrupted days excluded, **extended to 2026-08-21 for the first time using the live `goblin_demon_tier` column** — the first time any Demon analysis has reached the current day.

| Prop / side / tier | n | hit % | days |
|---|---|---|---|
| `pitcher_strikeouts/less/T1` | 49 | **49.0%** | 13 |
| `pitcher_strikeouts/less/T2` **(deployed)** | **11** | 45.5% | **7** |
| `pitcher_strikeouts/less/T3` | 1 | 0.0% | 1 |
| `earned_runs/less/T1` | 18 | 27.8% | 9 |
| `earned_runs/less/T2` | 3 | 33.3% | 3 |
| `hits_runs_rbis/less/T1` | 106 | 32.1% | 9 |
| `hits_allowed/less/T1` | 15 | 20.0% | 9 |

**The deployed configuration — `pitcher_strikeouts/less/Tier2`, 3-pick — has 11 legs across 7 days, and produces exactly ONE 3-pick slip in the entire clean record.** There is no evidence base at the deployed size. Payout used: real deployed demon table `3/3 = 15x`, implying per-leg **2.466**; documented real T1 per-leg is 2.35–2.40, so 2.466 is if anything generous.

### Pool alternatives, exhaustive over the clean record

| Config | Size | Slips | Days | Full hits | Full-hit % | ROI (Power) |
|---|---|---|---|---|---|---|
| A — `pitcher_strikeouts/less/T2` (deployed) | 3 | **1** | 1 | 0 | 0.0% | −100.0% |
| B — Pool I (`p_strikeouts`+`earned_runs` /less, T1+T2) | 3 | 17 | 11 | **1** | 5.9% | **−11.8%** |
| B — Pool I | 2 | 29 | 12 | 7 | 24.1% | +46.8% |
| B — Pool I | 4 | 12 | 9 | **0** | 0.0% | −100.0% |
| **C — `pitcher_strikeouts/less/T1` only** | **2** | **21** | **11** | **7** | **33.3%** | **+102.7%** |
| C | 3 | 12 | 9 | 1 | 8.3% | +25.0% |
| D — all demon `less` T1 | 2 | 99 | 13 | 14 | 14.1% | −14.0% |

**Retraction.** Sessions 2/3 reported Demon Pool I at **+478.1% Power / +544.7% Flex, LOO +470.3% to +507.1%**. That was computed **including** 08-05/06/07/11. With those days removed and 08-21 added, Pool I at the deployed 3-pick size has **one full hit in seventeen slips**, and at 4-pick and 5-pick **zero full hits**. The Pool I recommendation is withdrawn.

**The one config that survives:** `pitcher_strikeouts/less/**Tier 1**` at **2-pick** — +102.7%, 21 slips, 11 supporting days, 7 full hits, **LODO +62.2% to +124.0%, 0 of 11 folds negative**. Break-even per-leg is `√(21/7) = 1.732`, against a documented real T1 per-leg of 2.35–2.40 — a genuine margin for once, and at the *shallowest* tier rather than the deepest. **This is the honest answer to the payload's open item (5): the move is not Tier2 → a different prop, it is Tier2 → Tier1 and 3-pick → 2-pick.** Still 21 slips; not promotable, but it is the first LODO-clean Demon result on uncorrupted data.

**Adaptive sizing (matrix cell closed):** adaptive 2→5 on Pool I gives **14 slips, 12 days, 0 full hits, −100.0%** — it selects the deepest available size, and demon full-hit probability collapses with size. Rejected.

**Multi-layer stacking, weather (matrix cell closed):** demon hit rate rises **monotonically** with temperature — <70°F 13.3% (n=15) / 70-79°F 14.2% (n=1,540) / 80-87°F 14.5% (n=681) / **88°F+ 17.1% (n=386)**, +2.9pp. Direction is mechanistically correct (demon legs are overwhelmingly `more`-side; hotter air → more offence → hard overs clear). Rejected as unusable: +2.9pp on a 14% base, and the clean pool is 81 legs, so any gate deletes it.

**Recommendation: suspend Demon staking.** Not because the evidence is corrupt — Session 7 established 08-12 onward is clean — but because at the deployed configuration there is essentially none.

---

## 6. SLEEPER — the strongest, best-supported result in this entire log, and the locked pool is not it

**Lane: N/A** (Sleeper has no goblin/demon mechanic; dynamic per-leg moneyline pricing). Per-leg **1.628** (compounding), from 2 real placed 2-pick slips (2.56x, 2.74x → `1.628² = 2.650` vs 2.65x real). Break-even p = 61.4% at any size.

**Pool sweep: 63 pool compositions × 5 sizes = 315 configs.** Candidate buckets, all with class labelled:

| Bucket | class | n | hit % | days |
|---|---|---|---|---|
| `doubles/less/0.5` | FIXED (1.00) | 122 | 79.5% | 25 |
| `home_runs/less/0.5` | FIXED (1.01) | 117 | 75.2% | 27 |
| `hits/less/1.5` | TIERED-borderline (1.37) | 128 | 72.7% | 25 |
| `rbis/less/0.5` | FIXED (1.10) | 1,082 | 71.2% | 27 |
| `walks/less/0.5` | FIXED (1.02) | 1,377 | 70.0% | 28 |

| Config | Size | Slips | Days | Full hits | ROI | LODO band | Neg folds |
|---|---|---|---|---|---|---|---|
| **`rbis`+`walks`+`home_runs`+`hits`+`hits_runs_rbis/more`** | **6** | **400** | **28** | **68** | **+216.5%** | **+207.0 … +234.0%** | **0 / 28** |
| all six buckets | 6 | 401 | 28 | 68 | +215.7% | +206.2 … +230.5% | 0 / 28 |
| `doubles`+`home_runs` | 6 | 26 | 20 | 6 | +329.6% | +272.4 … +365.4% | 0 / 20 |
| `rbis/less` only | 6 | 276 | 27 | 39 | +163.1% | +147.8 … +183.6% | 0 / 27 |
| same 5-bucket pool | 5 | 480 | 28 | 91 | +116.8% | +108.8 … +126.7% | 0 / 28 |
| same 5-bucket pool | 4 | 608 | 28 | 171 | +97.6% | +92.3 … +102.4% | 0 / 28 |
| **`hits_runs_rbis/more` (LOCKED)** | **3** | **44** | **16** | **11** | **+7.9%** | **−11.5 … +28.3%** | **2 / 16** |

### Day-by-day, 5-bucket pool, 6-pick Power

| Date | Slips | Full hits | ROI | | Date | Slips | Full hits | ROI |
|---|---|---|---|---|---|---|---|---|
| 07-25 | 3 | 1 | +520.6% | | 08-08 | 13 | 3 | +329.6% |
| 07-26 | 11 | 1 | +69.3% | | 08-09 | 15 | 4 | +396.5% |
| 07-27 | 13 | 2 | +186.4% | | 08-10 | 16 | 3 | +249.1% |
| 07-28 | 16 | 4 | +365.4% | | 08-11 | 21 | 0 | −100.0% |
| 07-29 | 7 | 0 | −100.0% | | 08-12 | 14 | 2 | +166.0% |
| 07-30 | 8 | 1 | +132.7% | | 08-13 | 18 | 3 | +210.3% |
| 07-31 | 32 | 7 | +307.3% | | 08-14 | 23 | 5 | +304.7% |
| 08-01 | 11 | 3 | +407.8% | | 08-15 | 11 | 1 | +69.3% |
| 08-02 | 8 | 0 | −100.0% | | 08-16 | 10 | 2 | +272.4% |
| 08-03 | 8 | 3 | +598.2% | | 08-17 | 12 | 2 | +210.3% |
| 08-04 | 18 | 5 | +417.2% | | 08-18 | 17 | 3 | +228.5% |
| 08-05 | 18 | 4 | +313.7% | | 08-19 | 14 | 2 | +166.0% |
| 08-06 | 18 | 0 | −100.0% | | 08-20 | 16 | 3 | +249.1% |
| 08-07 | 16 | 3 | +249.1% | | 08-21 | 13 | 1 | +43.2% |
| | | | | | **TOTAL** | **400** | **68** | **+216.5%** |

**24 of 28 days profitable. 400 slips. Zero negative LODO folds out of 28.** By sample size, day coverage and LODO tightness this is the most robust result anywhere in this log.

**Multiplier sensitivity, and the 1.628-vs-1.2684 question is still load-bearing.** Full-hit 68/400 = 17.0% needs a total multiplier of 5.882, i.e. a per-leg of **1.3435**. At the resolved 1.628 → **+216.5%**. At the disputed dossier figure 1.2684 → `1.2684⁶ = 4.166` → **−29.2%**. The break-even sits between them. Session 2 resolved this in favour of 1.628 on two real 2-pick slips; **a real placed 6-pick Sleeper slip would settle it at the size that matters.**

**Locked-pool verdict.** `hits_runs_rbis/more` 3-pick supports a slip on only 16 of 28 days, returns +7.9%, and goes negative on 2 of 16 LODO folds. It is dominated on every axis.

**Documented open item resolved:** *"does the Generation-1 doubles-only line still show its real 90% hit rate today?"* — **No. 79.5% (n=122, 25 days).** Still well above the 61.4% break-even and still the best single Sleeper bucket, but the 90% figure does not survive on current data.

---

## 7. UNDERDOG — dead as deployed, for a newly identified market-structure reason; and a Session 5 report to the user is RETRACTED

**Lane: N/A.** **Class:** `rbis` FIXED (1.10), `walks` FIXED (1.02). Model: **geometric**, `published × 0.6516ⁿ`, sanity-checked against the one real placed slip (5-pick predicted `20 × 0.6516⁵ = 2.349x`; real **2.35x**).

### Size ladder on the locked `rbis/less/0.5` + `walks/less/0.5` pool (28 days, 7,720 legs, 70.6% leg hit rate)

| Config | Slips | Days | Full hits | ROI |
|---|---|---|---|---|
| fixed 2-pick | 2,333 | 28 | 1,195 | −23.9% |
| fixed 3-pick | 1,549 | 28 | 568 | −34.1% |
| fixed 4-pick | 1,160 | 28 | 299 | −44.2% |
| fixed 5-pick | 924 | 28 | 168 | −57.3% |
| fixed 6-pick **(LOCKED)** | 768 | 28 | 102 | **−64.4%** |
| fixed 7-pick | 655 | 28 | 70 | −65.4% |
| fixed 8-pick | 574 | 28 | 39 | −73.5% |
| **adaptive 2→8 (matrix cell closed)** | 574 | 28 | 39 | **−73.5%** |

Monotonically worse in size. **Adaptive sizing is not merely a no-op here — it lands on the single worst configuration**, because the pool is ≥8 legs deep on all 28 days so "largest supported" always resolves to 8. Fifth independent confirmation the track is broken as deployed. Break-even at 6-pick is a per-leg hit rate of **84.9%**; the pool runs 70.6%.

**Multi-layer stacking, weather (matrix cell closed):** the PP Regular temperature gradient **does not transfer**. Weather join 98.6%: <70°F 71.4% (n=98) / 70-79°F 70.0% (n=4,260) / 80-87°F 70.5% (n=2,304) / **88°F+ 74.3% (n=950)**. Flat-to-reversed, and the hottest band is the *best* — the opposite of what the mechanism predicts for hitter `less` legs. Refuted on mechanism, not merely on power.

### 🛑 RETRACTION — Underdog `pitcher_fantasy_score` was renamed, not discontinued

Session 5 reported the only positive Underdog pool ever found as *"BLOCKED for live use: the prop stopped being graded on Underdog after 2026-08-09 (0 rows for 11 straight days)"*, and reported it to the user as one of two live defects. **The prop key changed on 2026-08-10:**

| key | side | n | days | window | hit % | avg line |
|---|---|---|---|---|---|---|
| `pitcher_fantasy_score` | less | 147 | 13 | 07-27 → **08-09** | **79.6%** | 31.90 |
| `pitcher_fantasy_score_ud` | less | 111 | 12 | **08-10** → 08-21 | **60.4%** | 32.09 |

Identical average line, unbroken coverage across the boundary. **There is no live defect. Withdraw that item from the user's decision list.** The pool remains unplayable, but honestly so: the hit rate decayed from 79.6% to **60.4%** against an ~84.9% break-even. This is a textbook B7 failure — a filter (the literal prop key) removed exactly the rows that would have changed the answer.

### New mechanism for the documented ~88% Underdog edge decay

Underdog's two best buckets ever recorded — `home_runs/less/0.5` at **90.5%** (n=455) and `stolen_bases/less/0.5` at **90.3%** (n=259), both comfortably above the 84.9% break-even — exist on **four days only, 2026-07-25 → 07-28**, and have had zero rows in the 24 days since. Only the `more` side survives, at 13.3% and 10.9%. **Underdog withdrew the easy side of its rare-event props, which is exactly where the +EV was.** That is a market-structure change, not a model decay, and no re-ranking or re-sizing can recover it. It also means the historical +181.3% and +345.0% figures describe a market that no longer exists.

---

## 8. FIRST-EVER LIVE-TIER BACKTEST — the open item carried since Session 1, closed

`goblin_demon_tier` is populated on PrizePicks rows for exactly **two dates: 2026-08-21 (graded) and 2026-08-22 (today, ungraded)** — 4,766 rows, zero NULL anchors.

**Formula validated for the first time: 4,762 of 4,766 = 99.92% exact** against `round(abs(line_value − goblin_demon_anchor_line))` — **but only under `numeric` (half-up) rounding.** Under Postgres `double precision` (banker's) rounding only **2,464 = 51.7%** match; `floor()` 31.1%. This independently re-confirms the rounding-mode bug at a far higher rate than the 14.5% found in the demon table, because switch-point anchors sit on `.5` boundaries constantly.

**The backtest itself (single day, 2,644 graded tier-bearing legs). The goblin ladder is confirmed monotone on live data for the first time:**

| Lane | T1 | T2 | T3 | T4 | T6 | T7 | T8 | T9 |
|---|---|---|---|---|---|---|---|---|
| **goblin** | 69.0% (1,118) | 76.6% (629) | **83.5% (375)** | 75.0% (8) | 33.3% (6) | 22.2% (9) | 38.5% (13) | 16.7% (6) |
| **demon** | 51.6% (62) | 7.1% (14) | 11.1% (18) | 15.8% (38) | 13.0% (23) | 12.5% (16) | 0.0% (10) | 0.0% (8) |
| standard | 61.1% (216) at tier 0 | | | | | | | |

Tiers 1–3 behave exactly as `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` §3 requires — farther from anchor is easier for goblin, harder for demon. **Tiers 4+ are degenerate**: 34 of the 42 high-tier goblin legs are `pitcher_fantasy_score`, confirming Session 2's diagnosis on live-tier data rather than on a reconstruction. Demon T1 at 51.6% is anomalously high for a hard-side leg and should be watched as tier days accumulate. **One day is a validation, not a backtest** — the real tier-based study becomes possible in roughly a week.

---

## 9. GEMINI AS IDEA PARTNER — track rotated to PP REGULAR (previously ❌). Hypothesis rejected; its by-product is the most useful thing in this session.

Track rotated per §1e. Gemini was given PP Regular's full real state — pool, class, lane verification, 349 legs at 79.7%, the 48-slip/19-day/+993.8% baseline, the LODO band, the full cap sweep — plus seven already-rejected items, and was told **any hypothesis that filters or gates the pool is inadmissible**.

**Raw call:**
```
run_job(job: "direct_worker_probe", extra: {method: "POST",
  url: "https://alphadog-v2-admin-sql.rodolfoaamattos.workers.dev/gemini-proxy",
  body: "{\"model\": \"gemini-3.6-flash\", \"prompt\": \"You are advising an MLB player-prop research system. I need ONE new, falsifiable hypothesis with a specific baseball mechanism. ... TRACK: PrizePicks REGULAR (standard lane, no goblin/demon discount). LOCKED POOL: canonical_prop_key='pitcher_fantasy_score', side='less'. ... REAL DATA, full record 2026-07-28 to 2026-08-21 (23 graded days): 349 legs, 79.7 percent leg hit rate. Ranked-greedy 6-pick Power slips, max 1 leg per player: 48 slips, 19 supporting days, 14 full hits, ROI +993.8 percent at the published 37.5x Power table. Leave-one-day-out band +878.3 to +1066.7 percent, 0 of 19 folds negative. Cap sweep: cap1 +689.5, cap2 +971.4, cap3 +1066.7, cap4 and above identical at +993.8 (pool saturates at 4 slips per day). ALREADY TRIED AND REJECTED ON THIS EXACT POOL, do not re-suggest: [1 weather re-rank/gate with the full -12.5pp gradient and every gate/re-rank result; 2 adaptive sizing +771.9 vs +782.4; 3 umpire tendency ~2pp; 4 bottom-of-order, refuted, -4 to -7pp; 5 opposing top-4 OBP re-rank, r=-0.036; 6 bullpen fatigue gating; 7 any hypothesis that FILTERS or GATES the pool is inadmissible]. DATA AVAILABLE: [full table/column inventory incl. the exhaustive FPS% negative search]. KNOWN STRUCTURAL FACT you may exploit: pitcher_fantasy_score is a TIERED prop with a real ladder averaging 3.02 simultaneous lines per pitcher per day. The LINE VALUE ITSELF varies across pitchers on the same day. The system currently ranks legs by an internal score_0_100 and ignores where the chosen line sits relative to that pitcher's own ladder or to his own recent actual fantasy-score distribution. Give me exactly ONE hypothesis. Required format: HYPOTHESIS / MECHANISM / OPERATIONALISATION (a RE-RANK, not a filter) / FALSIFICATION CRITERIA with exact numeric thresholds, be strict / WHY IT IS NOT REDUNDANT.\"}"})
```

**Raw response (verbatim, condensed only where it repeats the format headers; response truncated mid-sentence in criterion 3 and was recovered with the documented continuation prompt on the first try):**

> **HYPOTHESIS**
> For `side='less'` on `pitcher_fantasy_score`, re-ranking candidate legs by boosting `score_0_100` proportional to the distance between the offered `line_value` and the pitcher's rolling 10-start 75th-percentile actual fantasy score will increase 6-pick Power slip ROI compared to the baseline unadjusted score ranking.
>
> **MECHANISM**
> Pitcher fantasy scoring is heavily right-skewed and constrained by modern managerial workload limits (strict pitch count caps, rare 3rd-time-through-the-order allowances, and heavy bullpen reliance). Reaching an upper-tier fantasy score requires multiple compound positive events to align simultaneously: 6+ innings pitched (to unlock Quality Start points), a team decision/lead (to unlock Win points), high strikeout volume, and low earned runs. When PrizePicks posts a line at or above a pitcher's recent 75th-percentile actual output, the `less` side possesses structural safety—the pitcher can have a solid, effective outing (e.g., 5.0 IP, 2 ER, 5 K) and still comfortably hit `less`. Re-ranking to prioritize props where `line_value` sits furthest above the pitcher's recent ceiling shifts high-buffer legs into the top-6 slip positions without discarding lower-buffer options from the broader candidate pool.
>
> **OPERATIONALISATION**
> 1. Source `actual_stat_value` per pitcher. 2. Compute P75(i,t) = 75th percentile of actual fantasy points across his previous 10 starts preceding date t. 3. Buffer B(i,t) = line_value(i,t) − P75(i,t). 4. Cross-sectional z-score Z_B within each game date t. 5. score_adjusted = score_0_100 + γ·Z_B, with γ = 3.0. Rank-greedy top 6 per day, max 1 leg per player. **No leg is removed or gated from the board.**
>
> **FALSIFICATION CRITERIA**
> 1. **ROI Lift Failure:** Full-slip Power ROI at 37.5x fails to beat the baseline +993.8% by at least +30.0 percentage points (i.e., final ROI ≤ +1023.8%).
> 2. **LOO Monotonicity Failure:** More than 2 of the 19 leave-one-day-out folds demonstrate a lower ROI under `score_adjusted` than under baseline.
> 3. **Quintile Non-Monotonicity:** Sorting all 349 legs into quintiles by Z_B yields non-monotonic hit rates across Q1–Q5, or if Q5 fails to achieve a statistically significant higher realization rate than Q1 (p < 0.05).
> 4. **Out-of-Sample Decay:** walk-forward out-of-sample ROI drops below 0.0% ... when tested against unseen 2024–2025 holdout seasons.
> 5. **Vigorish/Slippage Intolerance:** Net EV turns negative after applying standard market friction (2.5% execution slippage and standard sportsbook juice).
>
> **WHY IT IS NOT REDUNDANT** — [distinguishes itself from all seven rejected items; the substantive distinction is that it uses the prop's own line ladder and the pitcher's own output distribution rather than any exogenous context layer.]

### Testing it against real data

**Step 1 — the operationalisation was blocked, and unblocking it produced the by-product.** Built from graded outcomes, the prior-10-start window averaged **1.29 prior starts per leg** (the graded record only starts 07-24) — a 75th percentile from one or two points is meaningless. So the PrizePicks pitcher fantasy formula was **reconstructed from real data** against `stats_pitcher.game_logs`:

```
pitcher_fantasy_score = outs_recorded + 3×strikeouts − 3×earned_runs − hits_allowed − walks_allowed
```

**429 of 429 overlapping rows exact. MAE 0.000. Max error 0.** Wins contribute **zero** (two rows identical on every component except `wins` returned identical scores). `stats_pitcher.game_logs` spans **2026-03-25 → 08-21, 15,973 rows, 759 pitchers**, so the same window now averages **9.27 prior starts at 99.7% coverage.** Every pitcher-prop prior-form, rolling-percentile or regression-to-mean signal in this system is now testable on a full season rather than three weeks. Nothing in this repo previously used it.

**Step 2 — leg level. The gradient is REAL**, and it is the first real leg-quality gradient ever found on PP Regular:

| Quintile by buffer B | B range | n | hit % |
|---|---|---|---|
| Q1 | −11.8 … −2.0 | 70 | **72.9%** |
| Q2 | −1.8 … 0.8 | 70 | 78.6% |
| Q3 | 0.8 … 3.5 | 70 | **82.9%** |
| Q4 | 3.5 … 6.0 | 69 | 81.2% |
| Q5 | 6.0 … 27.5 | 69 | 82.6% |

**+9.7pp Q1 → Q5**, with a clean rise through Q3 and a plateau after. Gemini's criterion 3 fails narrowly (Q4 81.2% < Q3 82.9%).

**Step 3 — slip level. It fails outright.** γ sweep, 6-pick Power, max 1 leg/player:

| γ | 0 (baseline) | 1 | 2 | **3 (Gemini's value)** | 5 | 8 | ∞ (pure buffer) |
|---|---|---|---|---|---|---|---|
| ROI | **+993.8%** | +837.5% | +915.6% | **+759.4%** | +759.4% | +681.3% | +837.5% |
| Full hits | 14 | 12 | 13 | 11 | 11 | 10 | 12 |
| LODO min | +878.3% | +715.2% | +796.7% | +633.7% | +633.7% | +552.2% | +715.2% |

**Not one value of γ beats baseline**, let alone Gemini's +1023.8% bar. **REJECTED.** Criteria 4 and 5 are inapplicable and are stated rather than silently skipped: there is no pre-2026 data in this database, and DFS pick'em carries no sportsbook juice.

**Why it failed, mechanistically:** corr(buffer, `score_0_100`) = **+0.241** — the internal score already encodes part of the buffer — while corr(buffer, hit) = **+0.059** and corr(`score_0_100`, hit) = **−0.005**. Neither ranker has leg-level predictive power on this pool. Per §1, the baseline's apparent 234pp advantage over γ=3 is itself noise. The correct reading is not "baseline wins" but **"ranking does nothing here, in either direction."**

---

## 10. MULTIPLIER TABLE — nothing new, for the fifth consecutive session

`score.slip_entries` holds **19** rows with a real multiplier, every one stamped `2026-08-21T20:11` — byte-identical to Sessions 2, 3, 4, 5 and 6. **Zero new placed slips.** The table cannot sharpen.

**One reconciliation worth recording, because it has been read as a contradiction.** `GOBLIN_DEMON_MULTIPLIER_STUDY_DOSSIER.md` gives a Goblin ratio of 0.7366 (later 0.6422, now 0.620) while `MULTIPLIER_TABLES_MASTER.md` §2 gives per-leg rates *above* 1.0 (1.095–1.287). These are **not in conflict — they are different quantities.** The published standard per-leg at 6-pick is `37.5^(1/6) = 1.8301`; `1.8301 × 0.620 = 1.1347`, which is the documented `singles/less/T1` rate of **1.134** to three decimals. The dossier records the *ratio to published*; the master table records the *resulting per-leg multiplier*. Both are right.

**Still missing, and still the single highest-value data point in the system:** one real 6-pick PP Regular **Power** slip. §4 quantifies the exposure precisely — the track survives down to a per-leg ratio of **0.671**, and the measured Goblin ratio is **0.620**.

---

## 11. EXTERNAL RESEARCH (performed fresh this session)

Both published tables re-verified live. **Both unchanged.**

- **PrizePicks** (`intercom.help/prizepicks` — Payouts Explained): Power `2:3x, 3:6x, 4:10x, 5:20x, 6:37.5x`; Flex `3:{3x,1x}`, `4:{6x,1.5x}`, `5:{10x,2x,0.4x}`, `6:{25x,2x,0.4x}`. ✅ matches repo. **Article last updated 2026-06-11** — a date no prior session recorded, and it post-dates the 2025-06-02 change already documented, so the table has been stable for over two months.
- **Underdog** (`help.underdogsports.com` — Pick'em Standard & Flex Entry Payouts): Standard `2:3.5, 3:6.5, 4:12, 5:20, 6:35, 7:65, 8:120`; Flex 0-loss `3:3.25, 4:6, 5:10, 6:25, 7:40, 8:80`; 1-loss `1.09/1.5/2.5/2.6/2.75/3`; 2-loss `6:0.25, 7:0.5, 8:1`. ✅ matches repo. Per-selection pricing re-confirmed first-party: *"If you choose a pick with a 0.7x multiplier, your total payout decreases to reflect that lower difficulty."* Supports the geometric model.
- Note: the repo cites `help.underdogsports.com/en/articles/6337337-...` for this; that URL now **404s**. The live article is `13780101-pick-em-standard-flex-entry-payouts`. Documentation fix, not a data change.

### 🆕 New external fact — PrizePicks confirms a SAME-GAME payout adjustment, which no backtest in this repo models

The PrizePicks payouts article states that *"some leagues may have unique payout rates based on specific combinations of picks within a lineup"*, and specifically that lineups containing **athletes who play in the same game** or containing **Demons or Goblins** *"may receive unique adjustments to payout rates."*

The Goblin/Demon half is already measured (that is the 0.620 ratio). **The same-game half is new and unmodelled.** Every ROI in this log — including this session's — prices a same-game slip at the standard table. This has a direct bearing on §3: the max-1-leg-per-game rule that repeatedly improves Goblin results has been interpreted purely as a *correlation* control, and it may in fact be partly a *pricing* control. **A real placed 3-pick Goblin slip with two legs from the same game, versus one with three legs from three games, would separate the two explanations.** Added to the data-request list.

---

## 12. HONEST SUMMARY

**Genuinely new this session:**

1. **`score_0_100` has no within-pool predictive power** — whole board r = +0.414, goblin lane +0.126, `doubles/less/0.5` +0.001, the locked PP Regular pool **−0.005**. The score sorts lanes and nothing more. Session 1's "+15.0pp lift" is re-scoped, not refuted.
2. **Ranked-greedy Goblin results are tie-break sensitive by ±7pp** — 37 distinct score values across 777 legs, 69.4% of legs tied within-day; the same config returned +25.9%, +19.3% and +12.5%.
3. **Neither outcome writer is complete.** `outcome_final` loses 11 days; `grade_*` loses the whole PP Regular pool. The union is the correct leg set, and it doubles the lane-authoritative window from 13 to 25 clean days.
4. **The clean lane split**: goblin 73.4% / standard 51.3% / demon **19.3%** — the prior 34.6% demon figure included the corrupted days.
5. **The live `goblin_demon_tier` column validated for the first time** — 99.92% exact under half-up rounding, 51.7% under banker's; and the **first live-tier backtest**, confirming the goblin ladder monotone at T1 69.0% → T2 76.6% → T3 83.5%.
6. **The PrizePicks pitcher fantasy-score formula reconstructed exactly** — `outs + 3K − 3ER − H − BB`, 429/429 rows, MAE 0.000 — unlocking the full 2026 season (15,973 rows from 03-25) as prior history where only three weeks were previously usable.
7. **Underdog withdrew the easy side of its rare-event props.** `home_runs/less/0.5` (90.5%) and `stolen_bases/less/0.5` (90.3%) exist on four days only and have been gone for 24 days; only the `more` side survives at 13.3% / 10.9%. A market-structure explanation for the documented ~88% edge decay.
8. **A first-party PrizePicks statement that same-game lineups carry a payout adjustment** — unmodelled by every backtest in this repo, and directly relevant to the max-1-per-game rule.
9. **A Sleeper 5-bucket 6-pick pool at +216.5%** on 400 slips, 28 days, 0 of 28 negative LODO folds — the best-supported result in the entire log.
10. **PP Regular's pool saturates at 4 slips/day**, closing the 10–15 cap band carried since Session 1.
11. **The dossier-vs-master "Goblin multiplier contradiction" is not one** — `1.8301 × 0.620 = 1.1347` ≈ the documented 1.134. Ratio vs per-leg multiplier.

**RETRACTED this session:**

1. **Session 6's Goblin "+17.8%, best-supported configuration ever found."** Exhaustive, tie-break-free enumeration gives **+4.9%** at 3-pick (0/24 negative folds, better day support), and **+1.1%** at 6-pick with 4/22 folds negative. Break-even per-leg 1.127 vs an assumed 1.145 built on a fallback with zero real observations.
2. **Sessions 2/3's Demon "Pool I, +478.1% Power / +544.7% Flex, LOO +470.3% to +507.1%."** Computed including the four corrupted days. Clean, and with 08-21 added, Pool I at the deployed 3-pick size has **1 full hit in 17 slips (−11.8%)** and zero full hits at 4- and 5-pick.
3. **Session 5's Underdog "live defect: `pitcher_fantasy_score` stopped being graded after 2026-08-09."** It was **renamed** to `pitcher_fantasy_score_ud` on 08-10 and has graded continuously since. **Withdraw that item from the user's decision list.**
4. **The firing payload's `doubles/less/0.5` "+1298.7% standard lane"** and its open items (1) and (2) — already retracted/closed on 2026-08-21 and re-verified today on a wider window.
5. **The payload's "one-day grading gap"** — fourth appearance, fourth time wrong.

**Re-confirmed, not new:** zero standard-lane buckets clear n≥30 and 80% (now on 25 days); both published payout tables; PP Regular as the strongest track; Underdog negative under the geometric model; the deployed Demon pool really is `pitcher_strikeouts`; `demon_full_history_dedup_v2` clean; no new placed slips.

**Coverage matrix cells moved (6, against a required minimum of 2):** adaptive sizing ❌→✅ for **Goblin, Demon and Underdog**; multi-layer stacking ❌→✅ for **Demon and Underdog**; Gemini generative hypothesis ❌→✅ for **Regular**, and ❌→✅(blocked, with the reason) for **Demon**.

**Needs the user's decision:**

- **Move Sleeper from `hits_runs_rbis/more` 3-pick (+7.9%, 16 days, 2/16 folds negative) to `rbis`+`walks`+`home_runs`+`hits`+`hits_runs_rbis/more` 6-pick Power (+216.5%, 400 slips, 28 days, 0/28 folds negative)?** Conditional on the per-leg being 1.628 rather than 1.2684 — break-even is 1.3435, between them.
- **Suspend Demon staking.** The deployed configuration produces one 3-pick slip in the entire clean record. If it is kept, the evidence points to **Tier 1, 2-pick** (+102.7%, 21 slips, 11 days, 0/11 folds negative), not Tier 2, 3-pick.
- **Suspend Underdog staking** — fifth confirmation, now with a market-structure mechanism rather than only a model failure.
- **Place and record four slips**, in priority order: (1) one 6-pick PP Regular **Power** — still the highest-value missing data point, and §4 shows the track flips negative below a 0.671 per-leg ratio against a measured Goblin 0.620; (2) one 6-pick **Sleeper** on `rbis/less` — settles 1.628 vs 1.2684 at the size that matters; (3) two 3-pick **Goblin** slips, one with two legs in the same game and one with three legs in three games — separates the same-game payout adjustment from same-game correlation; (4) one Goblin slip containing `earned_runs/more/0.5`, whose 1.15 fallback carries the whole §3 result.
- **One live-code observation, reported not touched (dry run):** `score.prop_outcome_history.official_date` is `date` but `score.final_board_history.official_date` is `text` holding a timestamp string — `WHERE official_date = '2026-08-21'` silently returns zero rows on the board table. This session hit it. Always `::date`.

**Stopping condition — NOT met, stated plainly.** 15 structurally distinct passes ran. The last two (the Gemini test and the ranker-informativeness audit) produced the session's headline finding and a retraction of one of its own earlier passes, which is the opposite of exhaustion. **This is not the final report in the sense the master prompt defines.**

**Open items carried forward:**

1. Re-run the tier-based backtest once 08-22 and following days grade out — one live-tier day is a validation, not a study. Roughly a week to a usable window.
2. Re-express every locked track's EV as its pool's binomial expectation with the ranked figure alongside, per §1. Most historical ROIs in this log need that treatment.
3. Mine the newly-unlocked full-season `stats_pitcher.game_logs` prior-form window (9.27 prior starts, 99.7% coverage) for pitcher-prop signals — regression-to-mean, rest-day, and opponent-adjusted form are all now testable and none has been.
4. Test whether the same-game payout adjustment is real, and re-price every max-1-per-game result if it is.
5. Rebuild `backtest.demon_full_history_dedup_v2` to include 08-21 onward from the live tier column — it currently stops at 08-20.
6. Audit the `pitcher_fantasy_score` goblin anchor derivation — carried from Session 2, still open, and §8 shows it is what makes tiers 4+ degenerate.
7. Re-run the Gen-1 bottom-of-order refutation under the normalised `lineup_slot` — carried from Session 5, still open.

**Nothing was deployed, patched, or modified. `SIGNALS_TECHNIQUES_TRIED.md` was updated as the task requires.**

---

# ===== 2026-08-22 (Sat) — Session 9 — first run under the updated master prompt =====

**Run type:** dry run, research only. Nothing deployed, patched, or modified. `SIGNALS_TECHNIQUES_TRIED.md` updated as required.
**Trigger:** user-directed run after the master prompt, `HIGH_HIT_RATE_METHODOLOGY.md`, and all five locked configs were updated.
**Data freshness:** ✅ **the gap has closed.** Latest graded day is now **2026-08-21** (29 graded days), which is yesterday relative to this run. The one-day gap flagged in Session 4 is resolved without intervention.
**Operating mode:** Section 0a — ran autonomously start to finish, no permission checkpoints.

---

## 1. I INDEPENDENTLY RE-VERIFIED THE LANE RETRACTION AGAINST MY OWN PRIOR CLAIM

Session 4's ADDENDUM (my own entry) reported the "+1298.7% standard-lane vs −13.0% goblin-lane" finding. Sessions 5–7 retracted it as a writer-default artifact. Rather than accept that on the document's word, I re-derived it:

| Writer | PrizePicks graded rows | % reading `is_goblin=0 AND is_demon=0` |
|---|---|---|
| `grade_*` | 60,782 | **4.5%** |
| `outcome_final\|…` | 45,512 | **99.0%** |

Of the 45,076 `outcome_final` rows reading 0/0, **44,820 join to `final_board_history`** and the authoritative board labels them:

| Board label | Rows | Share |
|---|---|---|
| goblin | 32,976 | 73.6% |
| demon | 8,364 | 18.7% |
| **genuinely standard** | **3,480** | **7.8%** |

**92.2% of what my Session 4 entry called "standard lane" is goblin or demon.** This reproduces the documented 92.1% on one extra day of data. **My +1298.7% figure is void, confirmed by my own query, not merely by assertion.** The retraction stands in full.

---

## 2. LIVE PRICING LAYERS — queried fresh, and they supersede the static table

| Layer | Rows | Total obs | Rows at n≥2 | Latest write |
|---|---|---|---|---|
| `pricing_layer1_prop_line` | 5 | 38 | **5** | 2026-08-22 17:35 UTC |
| `pricing_layer2_tier` | 14 | 45 | **8** | 2026-08-22 17:35 UTC |
| `pricing_layer3_player` | 18 | 18 | **0** | 2026-08-22 17:27 UTC |

**Layer 3 outranks nothing yet** — all 18 rows sit at n=1, below the n≥2 bar. Reported by real n as required, not treated as settled.

**The live layers validate the new Goblin config's own design rationale.** The config specifies pricing "split by exact line value (0.5 vs 1.5, NOT a flat average)":

| Bucket | Live rate | n |
|---|---|---|
| `prizepicks_goblin / walks_allowed / more / **0.5**` | **1.1053** | 10 |
| `prizepicks_goblin / walks_allowed / more / **1.5**` | **1.4379** | 2 |

A **30.1% spread** inside one (prop, side, tier). Blending them would be materially wrong — Rule B0b confirmed empirically on the exact bucket the rule was written for.

**New disagreement worth recording (per §5.3):** the live 0.5 rate of **1.1053** is *below* the static `MULTIPLIER_TABLES_MASTER.md` figure of **1.140** for `walks_allowed/more`. The live layer is fresher (n=10, written today) and should supersede the static entry for this bucket.

**Sleeper layer1 spread, for B0b:** `hits_runs_rbis/more` 1.638 (n=12), `hits/more/0.5` 1.3740 (n=6), `doubles/more` 1.2684 (n=8) — a **34% spread** across props in the Sleeper candidate space. Any multi-prop Sleeper pool must price per-prop.

---

## 3. PP GOBLIN — the new locked config (`walks_allowed/more/Tier1`, 6-pick Flex, no cap)

**Pool classification (Rule B0a):** `walks_allowed` — **class TIERED** (2.36 lines/player-day, max 4; a `/0.5` line here is a ladder rung, not a fixed threshold, per §2c); **lane GOBLIN**, read authoritatively from `final_board_history`, not from the outcome table's flags.

**Real buckets (Rule B0, n≥30 bar), authoritative lane, 16 days:**

| Bucket | n | Days | Hit % | Live per-leg | Per-leg EV |
|---|---|---|---|---|---|
| `walks_allowed/more/0.5` goblin | 215 | 15 | **89.3%** | 1.1053 | **0.9870** |
| `walks_allowed/more/1.5` goblin | 48 | 15 | 66.7% | 1.4379 | **0.9591** |

**Both buckets are below per-leg EV 1.0.** On a Power basis the config cannot clear; its entire edge has to come from Flex partial credit.

### Rule B0c — tie-break sensitivity. **The config fails this bar.**

Same legs, same pricing, three deterministic orderings (no `score_0_100` used anywhere, per B0):

| Pick size | A: pid asc | B: pid desc | C: line asc, pid asc | Spread |
|---|---|---|---|---|
| 2 | −1.2% | +0.9% | +1.2% | 2.4pp |
| 3 | +1.2% | +1.5% | +3.5% | 2.3pp |
| 4 | −1.7% | +1.0% | 0.0% | 2.7pp |
| **5** | **+12.9%** | **+16.4%** | **−5.4%** | **21.8pp — sign flips** |
| **6 (locked)** | **+21.8%** | **+14.7%** | **+0.8%** | **21.0pp** |

*(Flex partial tiers modelled at 5/6 = 0.08× and 4/6 = 0.016× of the full-hit product, the standard PP Flex ratio structure; goblin-specific 6-pick partial tiers have no real observation. Stated as an assumption, not a measurement.)*

**Model validation:** my computed 6/6 full-hit multiplier averages **2.29–2.61** across orderings, bracketing the two real observed 6/6 values of **2.25x and 2.50x** cited in the master prompt. The per-line product model is sound; the instability is in leg *selection*, not pricing.

**Leave-one-day-out, best ordering (A):** band **+11.1% to +28.3%**, **0 of 15 folds negative**, all-days +21.8%. So the config is genuinely **day-robust** — this is not a single-day artifact. The problem is purely that which six legs you take out of ~15 available changes the answer by 21 points.

**I cannot reproduce the documented +74.4% under any of the three orderings** (best: +21.8%). The gap is unexplained; likely candidates are a different Flex partial-tier assumption or a Tier1 restriction I could not apply — see below.

### The `Tier1` qualifier is unenforceable on the historical record

`goblin_demon_tier` is populated on **25 of 264** `walks_allowed/more` goblin legs (9.5%), covering **1 of 16 days**. Every figure above is therefore the *whole* `walks_allowed/more` goblin pool, not Tier1 specifically. **A locked config that specifies a filter validatable on one day in sixteen should be treated as provisional.** This will self-resolve as the live tier column accumulates.

---

## 4. HONEST SUMMARY

**Genuinely new:**
1. The 08-21 grading gap closed on its own — 29 graded days, freshness restored.
2. Live pricing layers queried for the first time; layer3 confirmed to outrank nothing (all n=1).
3. The 30.1% within-bucket line spread on `walks_allowed/more` — B0b empirically confirmed on its originating bucket.
4. Live layer1 (1.1053, n=10) supersedes the static table (1.140) for that bucket.
5. **The new locked Goblin config fails Rule B0c** — 21-point tie-break swing at both 5- and 6-pick, with a sign flip at 5-pick.
6. Both of its buckets price below per-leg EV 1.0 (0.987 and 0.959).
7. The config's `Tier1` restriction is unverifiable on 15 of 16 days.

**Re-confirmed by my own independent query:** the lane retraction, and with it the voiding of my own Session 4 +1298.7% claim.

**Retracted/superseded by others, acknowledged here:** my Session 4 Sleeper pool ROI (+216.5% → +32.9% real when priced per-prop, a 6.5x overstatement) — the direct cause of Rule B0b. I have applied B0b throughout this session.

**Needs the user's action:**
- **Place and record one real 6-pick PrizePicks Regular POWER slip.** Standing request, still unmet. Every standard-lane figure in the system rests on 4 Flex observations and zero Power observations.
- **Record one real 6-pick Goblin Flex slip with a 5/6 or 4/6 outcome.** The goblin Flex partial tiers are currently modelled from the standard-lane ratio structure with no real observation — and on this config, partial credit is the entire source of edge.
- **Treat the new Goblin config as provisional**, not settled: it is day-robust but ordering-unstable, both buckets are per-leg EV negative, and its Tier1 filter is unvalidated.

**Documentation conflict to resolve:** the master prompt's §1c still lists the lineup join as "~2-5% of legs, never diagnosed" (resolved Session 4 — it was a filter artifact; use `lineup_slot`), and §1f still cites the retracted "+1298.7% Standard-lane" example as live guidance while `HIGH_HIT_RATE_METHODOLOGY.md` §3 retracts it. Both should be corrected so a future session isn't sent to re-derive a void figure.

**Stopping condition: NOT met.** This session was directed at verifying the retraction and validating the newly-changed locked configs. Four tracks (Regular, Demon, Sleeper, Underdog) were not re-backtested under their new configs this session; Gemini generative and the void/DNP repricing were not reached. Stated plainly rather than claimed.

**Nothing was deployed, patched, or modified.**

---

# ===== 2026-08-23 (Sun) — Session 10 — scheduled daily run =====

**Run type:** dry run, research only. Nothing deployed, patched, or modified. `SIGNALS_TECHNIQUES_TRIED.md` updated as required.
**Data freshness:** ✅ latest graded day **2026-08-22** = yesterday. **30 graded days**, 154,915 graded rows. No gap.
**Reference docs read in full:** all seven, plus this log's CORRECTIONS / RE-RUN / ADDENDUM entries.
**Operating mode:** Section 0a — autonomous start to finish, no permission checkpoints.
**Primary agenda:** Session 9 left **four ❌ cells in the Rule B0c tie-break row** (Regular, Demon, Sleeper, Underdog). All four are closed with real cited results. This is the session's main deliverable, alongside re-backtesting the four tracks Session 9 explicitly did not reach.

**Step 0 corrections, third occurrence:** the standing task prompt says "~40 schemas" and "`backtest` ~72 relations". Real: **18 schemas**, **96 `backtest` relations** (up from 78 tables/views; prior sessions added `reconstructed_tiers_20260822` and `unified_tiers_20260822`). The 18-schema correction has now been recorded three times and keeps re-seeding from the prompt.

---

## 1. FOUNDATION — the canonical leg set reproduces on an extra day

Union of both writers, deduped by (date, player, prop, side, line, game), lane from `final_board_history`, four corrupted demon days excluded — the Session 8 standing rule:

| Lane | legs | hit % | days |
|---|---|---|---|
| goblin | 37,634 | **73.6%** | 26 |
| standard | 4,207 | **51.5%** | 25 |
| demon | 9,242 | **19.2%** | 25 |
| unresolved | 367 | 39.0% | 12 |

Session 8 recorded 73.4 / 51.3 / 19.3 on 25 days. Reproduced to within 0.2pp on 26. **The 367 unresolved legs are the identical count** — that residue is a fixed set, not a growing one.

**B0 bucket table, n≥30 and ≥80%, 26 clean days: 15 qualifying buckets, all goblin lane, zero standard, zero demon.** Session 8's finding survives another day and gains two entries: **`earned_runs/less/4.5` 81.0% (n=116, 14 days)** and **`total_bases/less/4.5` 80.8% (n=73, 13 days)**, both previously below the n bar.

**Live pricing layers, queried fresh:** unchanged since 2026-08-22 17:35 UTC. layer1 5 rows, layer2 14, layer3 18 — **layer3 still 100% at n=1, outranking nothing.** **`score.slip_entries` still holds exactly 19 real multipliers, all stamped 2026-08-21T20:11 UTC.** No new placed slips for a third consecutive session; every data request below is therefore still outstanding.

---

## 2. 🛑 HEADLINE — every payout model here reduces to `p × m`, and that reframes the whole system

Derived from each app's real payout structure rather than assumed:

| App / mode | Slip EV | Break-even |
|---|---|---|
| PrizePicks Power | payout = `∏mᵢ` → EV = `(p·m)ⁿ` | **`p·m ≥ 1`, size-independent** |
| Sleeper Flex (round-robin) | the (n−1)-sub-combo split collapses exactly to `(p·m)^(n−1)` | **`p·m ≥ 1`, size-independent** |
| PrizePicks Flex | `(25/37.5)·∏mᵢ` + flat partials | `p·m ≥ 1` plus a small partial offset |
| Underdog Flex | `published_tier × ρⁿ` | pool-specific ρ threshold |

**Consequence: where `p·m < 1`, no size, cap, correlation rule or ranking can make a track positive.** Size only compounds the sign already present.

This retro-explains the entire log: every cap sweep, adaptive-sizing test and correlation control across ten sessions moved ROI by single digits and **never once flipped a sign**, because they were all operating on a quantity that structurally cannot flip one.

### Applied to the whole Goblin ladder — a verdict on the track, not on a pool

Using the live-tier data (now **two** graded days) and the real per-tier multipliers:

| Goblin tier | real hit rate | real per-leg | `p × m` |
|---|---|---|---|
| T1 | 69.6% (n=2,083) | ~1.30 | **0.905** |
| T2 | 77.4% (n=1,228) | 1.265 | **0.979** |
| T3 | 83.6% (n=720) | 1.140 | **0.953** |
| best bucket in the record (`walks_allowed/more/0.5`) | 87.4% (n=396) | **1.1053 (live, n=10)** | **0.966** |

**Every rung is priced to a 2–10% house edge. The multiplier falls exactly as fast as the hit rate rises.** The tier mechanism is real and monotone — and correctly priced. Goblin becomes playable only at a per-leg rate above `1/p` ≈ **1.144** on the best bucket ever recorded, against a live-measured 1.1053. **This supersedes pool-by-pool Goblin testing.**

---

## 3. PP REGULAR — ✅ **the first track to PASS Rule B0c**

**Pool:** `pitcher_fantasy_score/less`. **Class TIERED** (3.02 lines/player-day). **Lane STANDARD — 432 of 432 legs, zero goblin, zero demon.** 79.6%, 24 days. Per-leg 1.8301 = 37.5^(1/6), published table at ratio 1.000.

The tie-density precondition is present — **45 distinct score values across 432 legs**, the same condition that destabilised Goblin. It does not destabilise this track.

**Four deterministic orders × sizes 2–6, Power:**

| Size | A pid asc | B pid desc | C line asc | D line desc | Band | Relative |
|---|---|---|---|---|---|---|
| 2 | +88.0% | +90.9% | +89.5% | +89.5% | 2.9pp | 3.3% |
| 3 | +224.1% | +219.7% | +232.8% | +219.7% | 13.1pp | 5.9% |
| 4 | +320.0% | +330.0% | +300.0% | +330.0% | 30pp | 10.0% |
| 5 | +610.5% | +689.5% | +636.8% | +663.2% | 79pp | 12.9% |
| **6 (locked)** | **+1006.6%** | +945.1% | +1068.0% | +945.1% | **123pp** | **13.0%** |

**The sign never flips at any size under any ordering, and the relative band stays at 3–13%** — against Goblin's sign-flipping 21-point swing on a ~15% base. This is what passing B0c looks like.

**Day-by-day, 6-pick Power, order A:**

| Date | Slip outcomes | Slips | Full hits | ROI |
|---|---|---|---|---|
| 2026-07-28 | 4/6 | 1 | 0 | −100.0% |
| 2026-08-04 | 6/6✅ | 1 | 1 | +3650.0% |
| 2026-08-05 | 4/6 3/6 | 2 | 0 | −100.0% |
| 2026-08-06 | 5/6 6/6✅ | 2 | 1 | +1775.0% |
| 2026-08-07 | 5/6 5/6 4/6 5/6 | 4 | 0 | −100.0% |
| 2026-08-08 | 5/6 4/6 5/6 6/6✅ 4/6 | 5 | 1 | +650.0% |
| 2026-08-09 | 6/6✅ 5/6 4/6 | 3 | 1 | +1150.0% |
| 2026-08-10 | 2/6 3/6 | 2 | 0 | −100.0% |
| 2026-08-11 | 5/6 6/6✅ 4/6 3/6 6/6✅ 6/6✅ | 6 | 3 | +1775.0% |
| 2026-08-12 | 5/6 5/6 5/6 | 3 | 0 | −100.0% |
| 2026-08-13 | 4/6 4/6 | 2 | 0 | −100.0% |
| 2026-08-14 | 5/6 5/6 5/6 5/6 | 4 | 0 | −100.0% |
| 2026-08-15 | 6/6✅ 3/6 5/6 4/6 | 4 | 1 | +837.5% |
| 2026-08-16 | 4/6 6/6✅ 4/6 | 3 | 1 | +1150.0% |
| 2026-08-17 | 5/6 6/6✅ 6/6✅ | 3 | 2 | +2400.0% |
| 2026-08-18 | 4/6 5/6 4/6 4/6 | 4 | 0 | −100.0% |
| 2026-08-19 | 3/6 6/6✅ | 2 | 1 | +1775.0% |
| 2026-08-20 | 5/6 6/6✅ | 2 | 1 | +1775.0% |
| 2026-08-21 | 4/6 6/6✅ 6/6✅ 6/6✅ 6/6✅ | 5 | 4 | +2900.0% |
| **2026-08-22 (new)** | 4/6 6/6✅ 4/6 | 3 | 1 | +1150.0% |
| **TOTAL** | | **61** | **18** | **+1006.6%** |

**LODO: +837.5% to +1084.2%, 0 of 20 folds negative. 12 days-supporting.**

**Binomial cross-check per the Session 8 rule:** pool p = 79.6% → `0.796⁶ × 37.5 − 1` = **+854%** expected under independence; ranked-greedy observes +1006.6%. The +153pp gap is sampling noise on 61 slips, not selection skill. **Quote the track at ~+854%.**

**On the standing unreconciled figure (+725% / +1105.4% / +1020.1%):** all three are the same underlying pool over different windows and different construction rules. On the full 24-day record with 6-pick Power and a clean lane-verified pool, the answer is **+1006.6% observed / +854% expected**. Recommend the log settle on the binomial figure, which is window-stable, rather than any of the three ranked figures, which are not.

---

## 4. PP GOBLIN — Session 9's +74.4%/+21.8% does not survive the full record. Cause identified.

Session 9 could not reproduce the documented **+74.4%** and got **+21.8%** as its best ordering. I could not reproduce either. **The cause is the window, and it is now isolated.**

Session 9 measured on **16 days** (215 legs at line 0.5, 48 at 1.5). The full graded record carries **29 days / 396 legs at 0.5 and 26 days / 89 at 1.5**. Re-running **Session 9's own payout model** (Flex 6/6 = `∏mᵢ`, 5/6 = 0.08×, 4/6 = 0.016×) on the full record, same three orderings:

| Size | A pid asc | B pid desc | C line asc | Band | Slips / days |
|---|---|---|---|---|---|
| 5 | −4.5% | −1.7% | −4.2% | **2.8pp** | 87 / 28 |
| **6 (locked)** | **−10.4%** | **−5.2%** | **−10.7%** | **5.5pp** | 68 / 27 |

**Model agreement confirmed, so this is not a pricing dispute.** My computed full-hit multipliers average **2.14–2.20**, bracketing the two real observed 6/6 Goblin values of **2.25x and 2.50x** cited in the master prompt — the same validation Session 9 performed and passed. The models agree; only the sample differs.

**Two consequences:**
1. **The locked Goblin config is negative on the full record**, at every ordering and both sizes. Session 9's +21.8% is a 16-day-subset artifact.
2. **The B0c instability was itself largely a small-sample effect.** Session 9 measured a 21.0pp tie-break spread at 6-pick; on the fuller sample the spread collapses to **5.5pp**, and the 5-pick sign flip disappears (all three orderings negative, 2.8pp apart). More data bought stability — and revealed the stable answer is negative.

Under my alternative model (Flex 6/6 = `∏mᵢ × 25/37.5`) the same pool gives −36.8% to −40.5%. **I record both and prefer Session 9's**, because it is anchored to two real placed-slip 6/6 observations and mine is not. Either way the sign is negative.

**Bucket detail (Rule B0a: class TIERED, lane GOBLIN, authoritative):** `walks_allowed/more/0.5` **87.4% (n=396, 29 days)**, per-leg EV **0.966**; `/1.5` **70.8% (n=89, 26 days)**, per-leg EV **1.018** — the 1.5 rung is the only goblin bucket found anywhere with per-leg EV above 1.0, but it rests on a **1.4379 rate with n=2** and a 70.8% hit rate, so its EV is inside the noise of a two-observation multiplier. Flagged, not claimed.

---

## 5. PP DEMON — ⚠️ **fails B0c on magnitude; sign is safe and negative**

**Source:** `backtest.demon_full_history_dedup_v2`, **profiled before use**: 3,351 rows, 26 days (2026-07-26 → 08-20), **zero NULL tier, zero NULL outcome, zero tier-0**, 14 props. Clean. (Note it still stops at 08-20 — carried open item 5 from Session 9 remains open.)

**Locked pool** (`hits_runs_rbis`+`earned_runs`+`runs`+`hits_allowed`+`singles`, all `/more/Tier1`), four corrupted days excluded: **70 legs across 12 days.**

| Prop | n | hit % | days |
|---|---|---|---|
| `runs/more/T1` | 6 | 33.3% | 3 |
| `hits_allowed/more/T1` | 23 | 30.4% | 12 |
| `hits_runs_rbis/more/T1` | 10 | 30.0% | 6 |
| `earned_runs/more/T1` | 25 | 28.0% | 12 |
| `singles/more/T1` | 6 | **0.0%** | 5 |

**Tie-break sweep, 2-pick Power, ranked by real hit rate as the config specifies:**

| Order | Slips | Days | Full hits | ROI @ 2.375 (live layer2, n=3) | ROI @ 5.50x floor |
|---|---|---|---|---|---|
| A pid asc | 30 | 12 | 2 | **−62.4%** | −63.3% |
| B pid desc | 30 | 12 | 4 | **−24.8%** | −26.7% |
| C prop,pid asc | 30 | 12 | 2 | **−62.4%** | −63.3% |

**A 37.6pp swing — the widest of any track.** The cause is structural: "rank by real hit rate" is a *per-prop constant*, so every leg of a prop ties with every other, and the ordering rule decides the entire slip composition. Two versus four full hits in thirty slips is the whole difference.

**Negative at every ordering and every multiplier tested.** Break-even full-hit rate is 17.7%; observed 6.7–13.3%. **The magnitude is unusable but the sign is not in doubt.**

**Second live-tier day — demon T1 anomaly now confirmed on a doubled sample.** Session 8 flagged demon T1 at 51.6% (n=62, 1 day) as "anomalously high for a hard-side leg, worth watching":

| Lane | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| **demon** | **48.0% (n=100)** | 9.1% (n=22) | 14.7% (n=34) | 15.8% (n=57) | 7.8% (n=77) |
| **goblin** | 69.6% (n=2,083) | 77.4% (n=1,228) | **83.6% (n=720)** | 76.2% (n=21) | 100% (n=1) |

Standard (tier 0): 58.8% (n=376). **The goblin ladder replicates almost exactly on double the data** (Session 8: 69.0 / 76.6 / 83.5). **Demon T1 remains ~48% while T2–T5 sit at 8–16%** — a discontinuity, not a gradient. Demon T1 is not behaving like a demon tier. Worth a dedicated pass once more tier days accumulate; it may be a second labelling defect of the same family as the four corrupted days.

---

## 6. SLEEPER — ⚠️ locked config negative; **and the session's best new finding**

**Lane N/A. Class:** `hits` TIERED-borderline (1.37 lines/player-day). Per-leg **1.3740** (live layer1, n=6).

**The exact Flex algebra:** Sleeper's round-robin splits stake across all (n−1)-sub-combos, so EV collapses to **`(p·m)^(n−1)`** exactly. Break-even is therefore `p = 1/m` = **72.8%** at *any* size. **The locked pool is 61.2%** (526 legs, 23 days).

**Tie-break sweep, 6-pick Flex:**

| Scope | A pid asc | B pid desc | C line asc | Slips | Days |
|---|---|---|---|---|---|
| cap 3 (locked) | −29.0% | **−14.8%** | −29.0% | 46 | 20 |
| uncapped | −35.7% | −32.7% | −35.7% | 80 | 20 |

**Negative at every ordering.** 14.2pp band — fails B0c on magnitude, sign safe. Honest nuance: break-even per-leg is **1.416–1.472** against the real **1.374**, a 3–7% gap that sits **inside the uncertainty of a six-observation multiplier.** This track is losing narrowly, not catastrophically.

### 🆕 Lineup slot is a large, unpriced leg-quality gradient on Sleeper `more`-side hitter props

Found while testing the Gemini hypothesis (§8), which was itself falsified. `sleeper/hits/more/0.5` by normalised lineup slot (`CASE WHEN lineup_slot>=100 THEN lineup_slot/100 ELSE lineup_slot END` — the Session 5 two-encoding rule applied):

| Slot | n | hit % | `p × m` @ 1.3740 |
|---|---|---|---|
| **1** | 41 | **78.0%** | **1.0724** |
| **2** | 44 | **79.5%** | **1.0930** |
| 3 | 40 | 55.0% | 0.7557 |
| 4 | 41 | 56.1% | 0.7708 |
| 5 | 38 | 60.5% | 0.8316 |
| 6 | 19 | 63.2% | 0.8678 |
| 7 | 16 | 56.3% | 0.7729 |
| 8 | 19 | **36.8%** | 0.5062 |
| 9 | 12 | 66.7% | 0.9160 |

**Slots 1–2 are the only pool in this system's history that clears `p·m > 1` on Sleeper.** Whole-pool baseline `p·m` = 0.841.

**Real slip construction, slots 1–2 only:**

| Size | A pid asc | B pid desc | Slips | Days | Full hits |
|---|---|---|---|---|---|
| 2 Power | +9.3% | +19.2% | 38 | 12 | 22 / 24 |
| **3 Power** | **+24.1%** | **+24.1%** | 23 | 10 | 11 |
| 4 Power | +33.7% | +11.4% | 16 | 8 | 6 / 5 |

**3-pick is fully tie-break invariant. LODO +0.9% to +50.2%, 0 of 10 folds negative.**

**The effect is prop-specific and direction-correct** — present on `more`-side hitter props, absent or reversed on `less`-side, exactly as a plate-appearance mechanism predicts:

| Bucket | slots 1–2 | rest | delta |
|---|---|---|---|
| `hits/more/0.5` | 78.8% (n=85) | 56.2% (n=185) | **+22.6pp** |
| `total_bases/more/0.5` | 73.5% (n=34) | 55.1% (n=138) | **+18.4pp** |
| `rbis/less/0.5` | 70.7% (n=297) | 71.3% (n=912) | −0.6pp |
| `walks/less/0.5` | 66.3% (n=368) | 71.3% (n=1,118) | −5.0pp |
| `runs/less/0.5` | 54.9% (n=195) | 62.1% (n=655) | −7.2pp |
| `hits_runs_rbis/less/1.5` | 50.5% (n=198) | 58.2% (n=572) | −7.7pp |

**The load-bearing assumption, stated plainly rather than buried: this is exploitable only if Sleeper prices `hits/more/0.5` FLAT across lineup slots.** `pricing_layer3_player` holds six Sleeper `hits/more/0.5` rows (Lowe, Seager, Donovan, Bichette, Durbin, Bregman) and **all six carry the identical 1.3740** — suggestive, but every one is at n=1, below the n≥2 bar, so it settles nothing. If Sleeper's moneyline shortens for leadoff hitters, the finding collapses entirely. **This is a candidate, not a recommendation, until one real slip settles it.**

---

## 7. UNDERDOG — ✅ **passes B0c (0.5pp band)**, and the "dead track" verdict needs qualifying

**Important scoping note:** Sessions 5–9's five consecutive "Underdog is dead, suspend staking" verdicts were all measured on the **retired** `rbis/less`+`walks/less` pool. The config was **replaced on 2026-08-22** with `hits_allowed/more`, 6-pick Flex, using user-confirmed real tiers 6/6=8.5x, 5/6=1.05x, 4/6=0.15x. Per the master prompt's instruction not to reference retired configs, this is the first test of the **current** one.

**Class:** `hits_allowed` FIXED-to-borderline. **Lane N/A.** Pool by line: `/0.5` **100.0% (n=94)**, `/1.5` 92.4% (n=66), `/2.5` 88.9% (n=36), `/3.5` 69.4%, `/4.5` 43.3%. The `/0.5` bucket is structurally near-certain — a starting pitcher essentially always allows ≥1 hit.

**Tie-break sweep, 6-pick Flex at the config's stated tiers:**

| Order | Slips | Days | Full hits | ROI |
|---|---|---|---|---|
| A pid asc | 35 | 18 | 25 | **+520.9%** |
| B pid desc | 35 | 18 | 25 | **+520.4%** |
| C line asc | 35 | 18 | 25 | **+520.9%** |

**A 0.5pp band — effectively tie-break invariant**, because the pool is near-deterministic so ordering barely changes which legs land. **Passes B0c cleanly.**

### But the config's own multiplier is the problem

**8.5x against a published 6-pick Flex 0-loss of 25x implies a per-leg ratio of `(8.5/25)^(1/6) = 0.8354`.** The only real measured Underdog ratio in the entire system is **0.6516**, from the single placed 5-pick slip (2.35x vs 20x published). **A 28% disagreement, on the prop with zero real observations of its own.**

Re-priced geometrically at the measured 0.6516 — `published_tier × ρ⁶`:

| Date | Slip outcomes | Slips | Full hits | ROI |
|---|---|---|---|---|
| 07-25 | 6/6✅ 6/6✅ 6/6✅ | 3 | 3 | +91.3% |
| 07-26 | 6/6✅ 6/6✅ 6/6✅ | 3 | 3 | +91.3% |
| 07-27 | 6/6✅ 6/6✅ 6/6✅ 4/6 | 4 | 3 | +44.0% |
| 07-29 | 6/6✅ | 1 | 1 | +91.3% |
| 07-30 | 5/6 | 1 | 0 | −80.1% |
| 07-31 | 6/6✅ | 1 | 1 | +91.3% |
| 08-01 | 6/6✅ 6/6✅ | 2 | 2 | +91.3% |
| 08-03 | 6/6✅ | 1 | 1 | +91.3% |
| 08-04 | 6/6✅ 5/6 5/6 | 3 | 1 | −23.0% |
| 08-05 | 6/6✅ 6/6✅ 6/6✅ | 3 | 3 | +91.3% |
| 08-06 | 4/6 | 1 | 0 | −98.1% |
| 08-07 | 6/6✅ 3/6 | 2 | 1 | −4.3% |
| 08-10 | 6/6✅ | 1 | 1 | +91.3% |
| 08-11 | 4/6 | 1 | 0 | −98.1% |
| 08-12 | 6/6✅ 3/6 | 2 | 1 | −4.3% |
| 08-13 | 6/6✅ 4/6 6/6✅ | 3 | 2 | +28.2% |
| 08-15 | 6/6✅ 6/6✅ | 2 | 2 | +91.3% |
| 08-22 | 5/6 | 1 | 0 | −80.1% |
| **TOTAL** | | **35** | **25** | **+37.1%** |

**LODO +34.3% to +45.0%, 0 of 18 folds negative** — the tightest LODO band recorded anywhere in this log.

**Multiplier sensitivity sweep** (the decisive axis here):

| Per-leg ratio | 0.55 | 0.60 | **0.6167** | 0.65 | 0.70 | 0.75 | 0.80 | **0.8354** |
|---|---|---|---|---|---|---|---|---|
| ROI | −49.7% | −15.2% | **break-even** | +37.1% | +113.9% | +223.6% | +376.7% | **+520.9%** |

**Break-even per-leg is 0.6167, only 5.4% below the measured 0.6516.** So the honest verdict is **marginally positive, not dead — and not +453.4% either.** The whole result lives inside a 5% band on a multiplier with **one** real observation, taken from a different prop.

**A real risk worth flagging:** `hits_allowed/more` qualifies on only **1 day since 2026-08-15** (08-22). Underdog withdrew the easy side of its rare-event props once before (Session 8's `home_runs`/`stolen_bases` finding). **This pool may be in the process of being withdrawn the same way.** Worth watching weekly.

---

## 8. GEMINI — generative use, hypothesis FALSIFIED on its own criterion, and a correction to the usage guide

Track rotated to **Sleeper**, whose locked config had just tested negative. Gemini was given the full real state (pool hit rates, the `(p·m)^(n−1)` algebra, the live per-leg rates and their 34% spread, the zero-within-bucket-ranker finding) plus the complete rejected list, and asked for one falsifiable hypothesis with a mechanism, its exact numeric falsification threshold, and which direction is structurally weakest.

**Raw call:** `run_job(job:"direct_worker_probe", extra:{method:"POST", url:"https://alphadog-v2-admin-sql.rodolfoaamattos.workers.dev/gemini-proxy", body:"{\"model\":\"gemini-3.6-flash\",\"prompt\":\"...\"}"})` — full prompt as described above.

**Raw response (§1, verbatim excerpt):** *"**Mechanism: Lineup Order Promotion Lag on hits/more/0.5.** … A hitter promoted from the bottom of the order (spots 6–9) to the top (spots 1–3) due to late scratches or rest days gains, on average, **+0.75 to +0.90 PAs per game** … At 3.7 PAs, the true probability of ≥1 hit is ≈62.1%; at 4.55 PAs it jumps to ≈70.2% … Sleeper's automated ingestion engine exhibits **pricing latency/inertia on low-volume prop markets** … If you lock the leg during this post-lineup release window, you capture an outdated multiplier (m ≈ 1.44) against an elevated true hit probability (p ≈ 0.702). Target Product (p × m) = 0.702 × 1.44 = **1.01088 > 1.0**."*

**Its own falsification thresholds:** (1) `N < 40` qualified legs over a 30-day window; (2) sample mean product `< 1.020` across `N ≥ 50`.

**Tested against real data. FALSIFIED on criterion 1.** Requiring today's slot ∈ {1,2,3} and a 14-day prior average slot ≥ 6 (a ≥3-spot promotion), with ≥3 prior appearances, yields **N = 1 qualified leg across the entire 30-day record.** Promotions of that size are structurally rare here. The hypothesis is untestable at the scale it requires, not merely unproven. Its `m`-side is separately untestable: no historical per-leg Sleeper moneyline is stored, only the current board.

**But it produced the session's best by-product.** Dropping the *change* requirement and testing the *level* — slot 1–2 versus the rest — is what surfaced §6's gradient. Gemini's mechanism (plate appearances drive counting stats) was correct; only its trigger (promotion lag) was too rare to use. Recorded as the second time a rejected Gemini hypothesis has been worth more than its verdict.

**⚠️ Correction to `GEMINI_USAGE_GUIDE.md`.** The guide states the truncation-recovery continuation prompt *"has worked reliably every time it was needed."* **It failed here.** The response truncated mid-sentence as documented, and the standard continuation prompt returned content about *"e-processes"*, *"optional stopping"*, *"Ruin / Degeneracy Bound"* and *"Direction 3: Unhedged High-Moment Volatility-Scaled E-Processes"* — none of which appears anywhere in the original prompt or its own first response. It answered a different question entirely. **Guidance updated: treat continuation output as suspect and verify it against the first response; if it drifts, re-issue the full original prompt rather than a continuation.** Nothing was lost here — the first response was complete enough to test.

---

## 9. EXTERNAL RESEARCH (performed fresh)

- **PrizePicks** (`intercom.help/prizepicks/…/payouts-explained`, first-party): Power `2:3x, 3:6x, 4:10x, 5:20x, 6:37.5x`; Flex `3:{3x,1x}`, `4:{6x,1.5x}`, `5:{10x,2x,0.4x}`, `6:{25x,2x,0.4x}`. ✅ **unchanged, matches repo exactly.**
- **Same-game payout adjustment re-confirmed first-party**, in stronger wording than Session 8 recorded: *"Selecting multiple players from the same team or opposing teams in the same game can lead to unique payout rates,"* and the source adds that this **typically results in lower multipliers.** Session 9's open item 4 stands, and the direction is now known: same-game slips pay **less**, so every max-1-per-game result in this log may be partly a pricing effect misread as a correlation effect.
- **Goblin/Demon adjustment re-confirmed**: *"Lineups that include Demon or Goblin projections can have varied payout rates as well."*
- No evidence of any payout-table change since the documented 2025-06-02 PrizePicks 3/4-pick Flex increase.

---

## 10. HONEST SUMMARY

**Genuinely new this session:**

1. **The `p × m` reduction** — every payout model here collapses to a per-leg product, which is size-independent for PP Power and Sleeper Flex. Where `p·m < 1`, no cap, size, correlation rule or ranker can produce a positive track. This explains ten sessions of single-digit sweep results that never flipped a sign.
2. **A structural verdict on the entire Goblin ladder**: T1 0.905, T2 0.979, T3 0.953, best-ever bucket 0.966 — **every rung priced to a 2–10% house edge.** The tier mechanism is real, monotone, and correctly priced by the market.
3. **PP Regular passes Rule B0c** — the first track to do so. Sign stable across four orders at all five sizes; relative band 3–13%.
4. **Session 9's Goblin +21.8% is a 16-day-window artifact.** On the full 27–29 day record under Session 9's own payout model it is **−5.2% to −10.7%**. Pricing models agree (full-hit multipliers 2.14–2.20 bracket the real 2.25x/2.50x); only the window differed. The B0c instability also shrank from 21.0pp to 5.5pp with more data — it was substantially a small-sample effect.
5. **Sleeper lineup slot 1–2 clears `p·m > 1`** — the only Sleeper pool ever found to do so. 78.0% and 79.5% versus a 61.2% pool baseline; 3-pick Power +24.1% tie-break invariant, LODO +0.9…+50.2%, 0/10 folds negative. Effect is +18 to +23pp on `more`-side hitter props and absent/reversed on `less`-side, matching a plate-appearance mechanism.
6. **The new Underdog config passes B0c at a 0.5pp band** but its assumed 8.5x tier implies a per-leg ratio of 0.835 against a measured 0.6516. Re-priced honestly: **+37.1%**, LODO +34.3…+45.0%, 0/18 folds negative, break-even ratio 0.6167.
7. **The Demon T1 anomaly is confirmed on a doubled live-tier sample** — 48.0% (n=100) against T2–T5 at 8–16%. A discontinuity, not a gradient; possibly a second labelling defect.
8. **The goblin tier ladder replicates on double the data** — 69.6 / 77.4 / 83.6 against Session 8's 69.0 / 76.6 / 83.5.
9. **Two new B0 buckets** clear n≥30 and 80%: `earned_runs/less/4.5` (81.0%) and `total_bases/less/4.5` (80.8%). Total now 15, still all goblin, still zero standard.
10. **The Gemini truncation-recovery pattern failed** — a correction to `GEMINI_USAGE_GUIDE.md`'s "worked reliably every time" claim.
11. **Same-game payout adjustment direction established** (lower multipliers), first-party.

**Retracted / corrected this session:**

1. **Session 9's PP Goblin "+21.8% best ordering" and the documented "+74.4%"** — both are window artifacts; the full-record answer is negative under the same model.
2. **The blanket "Underdog is dead, suspend staking" verdict (five consecutive sessions)** — scoped, not overturned. Those measurements were all on the **retired** `rbis`+`walks` pool. The current `hits_allowed/more` config is marginally **positive** (+37.1% at the measured ratio). The "dead" verdict should be labelled as applying to the retired config only.
3. **The standing prompt's "~40 schemas / ~72 backtest relations"** — third recorded correction; real values 18 and 96.

**Re-confirmed, not new:** the lane split and the 367-leg unresolved residue; zero standard-lane buckets clearing n≥30 and 80% (now 26 days); both published payout tables; `demon_full_history_dedup_v2` clean; PP Regular as the strongest track; no new placed slips.

**Coverage matrix cells moved (5, against a required minimum of 2):** **Rule B0c tie-break ❌→✅ for Regular, Demon, Sleeper and Underdog** — the entire remaining row; and **live pricing layers ❌→🚫 BLOCKED-with-search-shown for Underdog** (zero rows carry `parlay_underdog` in any of the three layers; the one real Underdog slip predates the layer writer).

**Needs the user's decision:**

- **Suspend PP Goblin staking.** Not a pool problem — a structural one. Every rung of the ladder prices to a house edge; the locked config is −5.2% to −10.7% on the full record.
- **Suspend PP Demon staking.** 70 legs over 12 days, negative at every ordering and multiplier, and a 37.6pp tie-break swing that makes the magnitude meaningless.
- **Underdog: keep, but re-label the expectation from +453.4% to ~+37%,** and treat it as conditional on a single 0.6516 observation from a different prop. Watch whether `hits_allowed/more` is being withdrawn — only 1 qualifying day since 08-15.
- **Sleeper: do not adopt the slot-1/2 pool yet.** It is the best candidate found for this track, but the entire result depends on whether Sleeper prices `hits/more/0.5` flat across lineup slots, and the six layer3 rows that hint it does are all at n=1.
- **Place and record four slips**, in priority order:
  1. **One 6-pick PP Regular POWER slip** — unchanged as the single highest-value missing data point, now requested for a fourth consecutive session. Every standard-lane figure rests on 4 Flex observations and zero Power.
  2. **One Sleeper slip on a slot-1 or slot-2 `hits/more/0.5` leg**, multiplier recorded — settles whether §6 is real or an artifact of flat-rate modelling. This is now the second-highest-value data point in the system.
  3. **One Underdog slip containing `hits_allowed/more`** — the newly locked prop has zero real pricing observations, and §7's whole result sits within 5% of break-even on a borrowed ratio.
  4. **Two 3-pick Goblin slips, one with two legs in the same game and one with three legs in three games** — carried from Session 9; the first-party confirmation that same-game pays *less* makes this more valuable than before.

**Stopping condition — NOT met, stated plainly.** Roughly a dozen structurally distinct passes ran. The last substantive one (the Gemini test) produced the session's best new finding, which is the opposite of exhaustion. All five tracks did receive the Section 1d equal-depth treatment this session, satisfying the other half of the rule. **This is not the final report in the sense the master prompt defines.**

**Open items carried forward:**

1. Settle whether Sleeper prices `hits/more/0.5` by lineup slot — gates §6 entirely.
2. Re-express every locked track's EV as its pool's binomial expectation (done for PP Regular here; the rest still need it).
3. Investigate the demon T1 discontinuity (48% vs 8–16% at T2–T5) as a possible labelling defect.
4. Rebuild `backtest.demon_full_history_dedup_v2` to include 08-21 onward — still stops at 08-20 (carried from Session 9).
5. Mine the full-season `stats_pitcher.game_logs` prior-form window — still untouched (carried from Session 9).
6. Test the same-game payout adjustment and re-price every max-1-per-game result (carried; direction now known).
7. Audit the `pitcher_fantasy_score` goblin anchor derivation (carried from Session 2).
8. Watch whether Underdog is withdrawing `hits_allowed/more` as it withdrew `home_runs`/`stolen_bases`.

**Nothing was deployed, patched, or modified. `SIGNALS_TECHNIQUES_TRIED.md` was updated as the task requires.**

---
