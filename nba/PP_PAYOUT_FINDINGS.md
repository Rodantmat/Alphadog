# PRIZEPICKS PAYOUT FINDINGS — NBA
*Recorded 2026-09-21. Separate from the 12 mandated documents; fold into `NBA_MULTIPLIERS.md` and
`NBA_GOBLIN_DEMON.md` when the documentation sweep reaches this session.*

Every claim is tagged **VERIFIED** (measured against PrizePicks directly) or **PARTIAL** (pattern seen,
rule not yet pinned down). Raw data: `nba/data/pp_payouts/*.json`.

---

## 1. ACCESS — how the multiplier is reached

**The price lives in `POST https://api.prizepicks.com/game_types`** — a quote for an exact combination,
fired by the app when a second leg is added. **Nothing is placed.** VERIFIED 2026-09-20 (owner capture).

```json
{"new_wager": {"amount_bet_cents": 2000,
               "picks": [{"wager_type": "over", "projection_id": "…"}, …],
               "pick_protection": false},
 "game_mode": "prizepools"}
```

**It is reachable server-side, anonymously.** VERIFIED probe 4, 2026-09-21.
| Setting | Requirement |
|---|---|
| Fingerprint | `curl_cffi` **chrome146** — chrome124 and chrome136 were captcha'd |
| User-Agent | **never set manually** — curl_cffi supplies one consistent with its own TLS |
| Session | a `Session`, so the `datadome` cookie carries across calls |
| Warm-up | one board GET first; even when that GET is blocked it earns the cookie |
| Egress | `PROXY_URL` |

**PrizePicks issues its own anonymous `_prizepicks_session` + `CSRF-TOKEN`** — no owner account is ever
involved.

**Board source:** `api.prizepicks.com/projections` returns 403 from the runner;
**`partner-api.prizepicks.com/projections` serves it.**

**There is no single-leg price.** A 1-pick quote returns **422 — "Must have at least 2 predictions for a
valid pricing lineup."** VERIFIED probe 5, 2026-09-21. So the per-leg multiplier is mined as a 2-pick
against a standard partner: `factor = payout / 3`, **de-compressed first** when the payout exceeds ~9.1×.

**PrizePicks' per-leg pricing reconstructs as a symmetric normal tail around the standard line**, with a
spread specific to each player-stat: the implied sigma is consistent within a ladder to a median CV of
**0.11** (32 ladders), with **no systematic skew** (demon side wider in 14 of 28; median ratio 1.00). Floor
goblins must be excluded — their price is clamped, not a probability. **Mining is exact and this is not**,
so mining is the method; the reconstruction is for sanity checks.

**Tooling:** `nba/pp_payout_map.py` · workflow `.github/workflows/nba-pp-payout-map.yml` · trigger
`nba/TRIGGER_NBA_PP_MAP.txt` (`max_quotes: N`, `altalt: N`) · output
`nba/data/pp_payouts/pp_payout_map_<utc>.json`.

### Why probes 1–3 failed
- **Probe 3 sent a Chrome 139 User-Agent on a Chrome 124 TLS handshake.** The mismatch is a primary
  DataDome bot signal. The working board scraper is consistent (TLS 124 + UA 124).
- No session, so no `datadome` cookie was ever carried.
- No warm-up.
- Probes 1–2 guessed GET endpoint names; the real price is a POST carrying the legs.

---

## 2. RESPONSE STRUCTURE — VERIFIED

```
payouts      : { "<n_picks>": { "<n_correct>": multiplier }, "is_adjusted": bool }
payouts_srp  : the REVERSION schedule — what the slip pays if legs are voided
```

**`payouts_srp` is void handling.** An n-pick slip carries n−1 arrays: the payout after one void, two
voids, and so on. Each inner triple is `[all remaining hit, one miss, two miss]`, which is why Flex rows
carry partials such as `[3, 1, 0]`. This is the DNP re-pricing any slip backtest must model — now taken
straight from PrizePicks.

The app banner *"Reversion lineup payouts are different than standard"* refers to this.

---

## 3. POWER PLAY — VERIFIED

**Base payouts (prizepools mode):** 2-pick **3.0×** · 3-pick **6.0×** · 4-pick **10.0×**.
The 3-pick base of 6× was confirmed on fresh standard legs; it is not a priced leg.

**Each leg is priced by its line, not by its rung.** Demon +2 ranges 5.25×–7.5× across players and
stats; goblin −1 ranges 2.2×–2.8×. The further a line sits from standard, the larger the adjustment.

**Flat 25% edge against PrizePicks' own probability.** Power expected value across 177 two-pick slips:
**0.748, standard deviation 0.012.**

**PrizePicks' implied probability for any leg:**
```
p = 1.5 / (that leg's 2-pick payout paired with a standard)
```
Compare this with the model's own probability — where ours exceeds theirs by enough to clear the edge
is where value lives.

**Multiplicative and partner-independent.** Wembanyama 11.5 Reb demon quoted 3.25× against two
different standard partners.

**Longshot compression above ~9×:**
```
payout = product                          for product ≤ 9.1
payout = 9.1 × (product / 9.1) ^ 0.857    for product > 9.1
```
Fitted on 20 alt×alt pairs, then **confirmed out of sample** on three pairs never quoted together:

| Pair | Raw product | Predicted | Actual |
|---|---|---|---|
| SGA Double-Double 0.5 D + Brunson Points 29.5 D | 14.25× | 13.25× | **13.5×** |
| Wembanyama Blocks 4.5 D + LeBron Rebounds 9.5 D | 17.25× | 15.75× | **15.5×** |
| Cunningham PRA 49.5 D + Wembanyama Assists 5.5 D | 26.0× | 22.5× | **22.5×** |

**Consequence:** a naive multiplicative model overstates demon-stack payouts — by ~13% at 20×.

**Goblin floor.** Every deepest goblin priced at **2.1×** regardless of depth (17%–24% below standard).
The floor is **per goblin and multiplies**: two floor goblins paid **1.4×**, not 2.1×. That result also
places each floor goblin's true value just under 2.086, displayed as 2.1.

**Rounding:** 0.1 steps below 3×, 0.25 steps at and above.

### Confirmation record (owner's screen)
| Slip | Predicted | Actual |
|---|---|---|
| Tatum P+R goblin 34.5 + Wemby P+R goblin 34.5 | 2.3× | **2.3×** |
| Wemby Reb demon 11.5 + Brunson Points demon 29.5 | 4.5× (4.25–5.0) | **4.75×** |
| Brunson Points goblin 24.5 + Tatum PRA demon 44.5 | 3.25× | **3.25×** |

---

## 4. FLEX PLAY — MECHANISM VERIFIED, TIER RULE PARTIAL
*Updated 2026-09-21 with run 2 (160 stratified alt×alt pairs).*

**Flex runs on the same economics as Power.** On alt×alt pairs Flex EV = **0.747**; Power EV = **0.748**.
Same flat 25% edge. **Flex does not make or lose value versus Power — it redistributes the same expected
value into a consolation.** At the top it compresses like Power: tiers 1.25 and 1.5 sit at EV 0.66–0.68.

**Consolation tiers step by 0.25:** 0.25 · 0.5 · 0.75 · 1.0 · 1.25 · **1.5**.

**The tier is driven by risk.** P(both hit), P(both miss) and the Power payout each sort the tiers at
~75–77% — they are one underlying quantity. **P(exactly one) scores 15.6% — not the driver.** (Run 1
could not test this: whenever one leg is a standard at 50%, P(exactly one) is 0.50 regardless. Run 2's
alt×alt pairs, where it varies, settled it.)

**Tier cut points on 2-pick Power** (share of the two adjacent tiers falling on the correct side):
| Boundary | Cut | Reliability |
|---|---|---|
| 0.25 → 0.5 | **2.40×** | 99% |
| 0.5 → 0.75 | 8.00× | 84% |
| 0.75 → 1.0 | 12.00× | 68% |
| 1.0 → 1.25 | 19.00× | 92% |
| 1.25 → 1.5 | 25.50× | 80% |

**The full payout is solved from the EV target:**
```
Flex full = (EV_target − consolation × P(exactly one)) / P(both hit)    snapped to the Flex grid
```
| Tier | EV target | In-sample exact | Within one step |
|---|---|---|---|
| 0.5 (2.4×–8×) | **0.7712** (sd 0.017) | 115 / 142 | **138 / 142** |
| 0.25 (< 2.4×) | **0.7410** | 61 / 87 | — |

Leg probabilities come from each leg's 2-pick price vs a standard, **de-compressed first** — prices above
9.1× are themselves compressed and would bias the big demons.

**Flex full-payout grid:** 0.1 steps from 1.2× to 2.0× · 0.2 to 4.0× · then 4.5, 5.0 · whole numbers
5–12 · then 14, 16, 22.

**Still open:** the ~23% of tiers a single risk measure mis-sorts — most likely because PrizePicks uses
exact internal probabilities that can only be recovered approximately from rounded prices.

---

## 4a. MULTI-PICK POWER — PARTIAL
*Recorded 2026-09-21.*

| Size | Result |
|---|---|
| 3 picks | Model (base × leg factors, then 2-pick compression) within ~1% on 2 of 3 |
| 4 picks | Demon-heavy slips pay **15–29% more** than the compressed prediction |

**The 2-pick compression curve does not transfer directly to larger slips.** Directional pattern: a
goblin-heavy 3-pick paid *less* than predicted while demon-heavy 4-picks paid *more* — **slip size appears
to widen the gap between goblins and demons**, consistent with the owner's console run (goblin factor
0.667 at 2 picks → 0.583 at 3).

Bases for 5 and 6 picks are unmeasured: with 3 games on the board, all-standard 5/6-pick slips cannot be
built from distinct games. Workaround in run 3: compare same-size slips to each other — the base cancels
in the ratio.

### ⚠ Data defect in runs 1 and 2 — multi-pick compositions mislabeled
`pick_distinct(pool, 0)` returned **one** leg instead of none: it appended before checking the count. So
"1 goblin, 0 demons" silently became 1 goblin + 1 demon, collapsing `1g = 1d = gd`, `2g = ggd`, `2d = gdd`.
**Only the FLEX section called it with zero**; ALTALT, LEG, UNDER, SAMEGAME, BASE and VALIDATE are
unaffected, so every 2-pick finding stands. The legs *recorded* in each slip are correct, so the data was
salvaged by relabelling from contents. **Fixed** in `nba/pp_payout_map.py`; run 3 is the first clean run.

**Why the mock missed it:** it counted slips per *label*, not whether each slip *contained* what its label
claimed. A composition-content check (29/29 correct after the fix) now exists.

### Clean result — run 3 (22/22 compositions verified by content)
Method: for each slip, multiply its legs' own 2-pick factors, then take the **base that product implies**
(`payout ÷ product`). If the multiplicative model held, every slip of a size would imply the same base.

| Size | Goblin-heavy slips imply | Demon-heavy slips imply | All-standard, measured | Mean of mixed slips |
|---|---|---|---|---|
| 3 | 5.13 | 5.41–5.47 | **6.00** | 5.42 |
| 4 | 9.29 | 10.25–10.58 | **10.0** | 9.87 |
| 5 | 17.16 | 19.06–19.25 | — | 18.26 |
| 6 | 32.54 | 36.37 | — | 34.56 |

**Goblins cost more in larger slips than their 2-pick price implies** — goblin-heavy slips imply the lowest
base at every size, ~10% below demon-heavy ones. **The 3-pick 6× base applies to all-standard slips only:**
with any goblin or demon the effective base falls to ~5.1–5.5.

**Working approximation:** payout ≈ mixed-slip base × product of the legs' 2-pick factors, with bases
**5.4 / 9.9 / 18.3 / 34.6** for 3–6 picks. Good to about **±6%**; goblin-heavy slips sit low. Adequate for
rough EV, not for exact prediction. **The exact multi-pick rule remains open**, as do the all-standard
bases for 5 and 6 picks (the published 20× and 37.5× are plausible but unverified here).

**A method error caught on the way:** a shortcut — dividing the `1g`, `1d` and `gd` slips to cancel the
base — assumed they shared the same goblin and demon. They did not: `gd` must avoid the goblin's game, so it
substituted a different demon. The result (a goblin factor of 2.96, a 3-pick base of 1.52) was impossible,
which is what exposed it. **Verify shared legs before any cancellation.**

### Flex — confirmed out of sample (owner's screen, 2026-09-21)
| Slip | Power pred → actual | Flex pred → actual |
|---|---|---|
| LeBron PRA 34.5 D + SGA P+R 29.5 G | 3.25 → **3.25** | 2.2/0.5 → **2.2/0.5** |
| Tatum P+R 39.5 D + Wemby Points 29.5 D | 5.75 → 5.5 | 4.0/0.5 → 3.8/0.5 |
| Tatum Points 24.5 G + Brunson 3PM 1.5 G | 1.9 → **1.9** | 1.6/0.25 → **1.6/0.25** |

Consolation tier **3/3**, including across the 2.4× boundary. The one full-payout miss is inherited from the
Power miss: feeding the actual 5.5× back in gives 4.0 × 5.5/5.75 = 3.83 → **3.8**, exact.

---

## 5. FOUR-WAY TAXONOMY — VERIFIED IN THE PRICING ENGINE

**Goblins and demons sent as Less are priced, in reverse:**
| Leg | As More | As Less |
|---|---|---|
| Brunson PRA goblin 34.5 | ~2.7× | **3.5×** (demon-priced) |
| SGA P+A goblin 34.5 | ~2.6× | **3.75×** |
| Brunson P+A demon 44.5 | high | **1.8×** (goblin-priced) |
| Wembanyama Reb demon 11.5 | 3.25× | **2.8×** |

Matches the documented rule: below the anchor More is the goblin and Less the demon; above it, reversed.

**The app shows only a More button on goblin/demon cards, yet the pricing engine supports Less.**
Whether PrizePicks would *accept* such an entry is untested and deliberately not tested — it would
require placing one.

---

## 6. SAME-GAME — VERIFIED, NARROW

Standard + standard from the same game paid **3.0×, 3.0×, 2.9×** — no meaningful discount.
**All three pairs were opponents.** Teammate pairs are untested. n = 3.

---

## 7. CORRECTIONS TO EXISTING DOCUMENTS

| Document says | Measured |
|---|---|
| Pricing is a discrete step function per tier; goblin pays flat | **Priced per line.** Only the deepest goblins are flat — at the 2.1× floor |
| PrizePicks discounts same-game 35–40% | **Not observed** for opponent pairs (MLB figure; teammates untested) |
| Season opens 2026-10-03 | **That is preseason.** Regular season opens **2026-10-20** (`nba_calendar.games`, prefix 002) |
| Goblin/demon Less side absent (UI observation) | **Priced by the engine**; hidden by the UI |

---

## 8. OPEN

- **Flex consolation-tier rule above 5×** — run 2 targets it
- **Teammate same-game discount**
- **Multi-pick Power beyond the base** — the goblin factor drifted with size (0.667 → 0.583 → 0.65);
  compression may explain it
- **State dependence** — every measurement is `prizepools`; other modes and states are unmeasured
- **Line movement over time** — needs scheduled runs

---

## 9. PER-LEG PRICING LOGIC — for replicating two seasons of history
*Recorded 2026-09-21. Mining only works on LIVE projections, so history requires the logic.*

**PrizePicks prices each line as the tail probability of a count distribution centered on the standard line,
with spread `c × √(standard line)`:**
| Stat family | c | Consistency |
|---|---|---|
| Points, P+R, P+A, PRA | **≈ 2.0** (1.93–2.06) | CV 0.11–0.15, all 6 players |
| Rebounds, Assists, 3-PT Made | **≈ 1.25** (1.23–1.28) | CV 0.13–0.21 |
| Rebs+Asts | ≈ 1.4 | CV 0.11 — **only 5 legs, thin** |

`p = P(stat > line)` → `factor = 0.5 / p` → goblin floor ≈ 2.08× (2-pick) → compression → rounding.
The spread depends on the stat and the standard line — **not on the player**.

**Leave-one-player-out** (115 legs, model never saw the player): **72% within one rounding step, median error
4.0%, median bias −0.04%.** Error concentrates in **big demons (> 9.1×): bias +4.8%, error 8.5%** — a bell curve's
right tail is too thin for count stats. **Fix pending:** a right-skewed count distribution (gamma / negative
binomial).

### History coverage (VERIFIED against Postgres)
- `nba_market.board_snapshots`, bookmaker `prizepicks`: **2024-10-22 → 2026-04-12**, 2.2M rows.
- Goblins/demons live only in the 8 `_alternate` markets — **all 8 map to a fitted stat family.** Blocks, steals,
  blocks+steals and turnovers have **no alternates** → factor 1.
- **Alternates were More-only in both seasons: zero Under rows** (1.45M alternate rows, all Over).
- Price flag in alternates: `100` = demon, `-137` = goblin (`NBA_GOBLIN_DEMON.md` §4).
- **Match centers by snapshot, never by date:** 18% of day-ladders (37,719) had their standard move intraday.

### Price ID design — AGREED with the owner
**Leg side exists:** `nba_market.board_tiers_v2` gives every leg its four price-determining facts —
`base_market, anchor_line, line, side` — plus `anchor_type` (how the center was found). **Those four facts are
the Price ID.** 2,199,354 PrizePicks legs → **8,573 Price IDs** (6,945 goblin/demon, 1,691 standard).

**Price side — to build:**
| Table | Holds |
|---|---|
| `nba_market.pp_price_key` | Price ID ↔ (base_market, anchor_line, line, side) |
| `nba_market.pp_price` | Price ID × **model_version** → implied_p, factor, **source** (model / mined / override) |
| `nba_config.pp_pricing_model` | each version's parameters, which is current, its validation scores |
| `nba_config.pp_slip_rules` | bases, compression, rounding grids, Flex tiers and EV targets |
| view `pp_leg_price` | every leg + its Price ID + current factor, computed on the fly |

**Keyed on raw facts, not model parameters** (the stat, not its family) — so any future model is just a new
version, with no re-tagging. **Exposed through a view, not a stamped column**: the tier builder rebuilds
`board_tiers_v2`, which would wipe a stamped column.

### Legs with no center — 43,370 (2.0%), `anchor_type = 'none'`
Mostly **lone demon lines on small stats** (92% demons; threes 36%, assists 33%, rebounds 13%; 19,827 are a single
line). The formula needs a center, so these get a Price ID with a **NULL price and a reason code — never a
guessed center.** Guessing is dangerous twice over: a demon's price is most sensitive to the center, and using
the model's own projection as the center would make the backtest circular.

| Rescue tier | Legs | Center source | Rule |
|---|---|---|---|
| same-day snapshot | 3,227 | PrizePicks' own standard, another snapshot, one value all day | safe |
| sportsbook consensus | 35,951 (22,690 with 3+ books) | books' line, same player/stat/day | **only if validated** against PP standards on explicit ladders |
| standard moved | 5 | ambiguous | unpriced |
| no center anywhere | 4,187 | — | unpriced |

Each rescue tier gets its own `anchor_type`. After rescue, genuinely unpriced ≈ **4,192 legs (0.2%)**.

### BUILD STATUS — updated 2026-09-21 (items 1–3 BUILT and verified)

**BUILT, in Postgres:**
| Object | Contents |
|---|---|
| `nba_market.pp_price_key` | **8,831 Price IDs** covering all **2,199,354** PrizePicks legs — key = `(base_market, anchor_line, line, side, kind)` |
| `nba_market.pp_price` | version `pp-leg-v1-normal`: implied_p, factor, source (`model` / `rule` / `unpriced`), reason |
| `nba_config.pp_pricing_model` | v1 registered as current: parameters, validation scores, known biases |
| `nba_config.pp_slip_rules` | 13 slip-level rules, each marked verified / partial / unverified |
| `nba_market.pp_norm_cdf(x)` | normal CDF (Abramowitz–Stegun), verified exact to 6 decimals |
| view `nba_market.pp_leg_price` | every leg + Price ID + current price; a leg with no key yet still appears (`no_price_key_yet`); a `mined` price outranks the model |

**Coverage (verified through the view — every leg accounted for):**
| | Legs | Share |
|---|---|---|
| Demons priced | 743,853 | 33.8% — 2-pick 3.10–11.95× |
| Goblins priced | 583,661 | 26.5% — 2-pick 2.08–2.92× |
| Standards (factor 1) | 745,526 | 33.9% |
| **Unpriced — outside calibration** | **82,944** | **3.8%** |
| Unpriced — no center | 43,370 | 2.0% |
| **Total priced** | **2,073,040** | **94.26%** |

**Three findings from the build itself:**
1. **`kind` had to join the key.** 2,475 legs are labelled standard while their line differs from the center
   (727 IDs). A standard is its own center and pays factor 1; pricing purely by position would have charged them
   as goblins/demons. With `kind` in the key they price at 1, flagged `standard_label_off_center`. Every goblin and
   demon label agrees with its position (0 mismatches). **Root cause of the off-center standards not investigated.**
2. **The calibration edge.** v1 initially priced far demons at up to **15,000×** — a bell curve's tail extrapolated
   far past the evidence (history has demons at 2–4× their center; every mined demon sat within ~+47%). The edge is
   evidence-based: the longest-odds demon mined is **Brunson Rebounds 5.5, 11.5× (implied_p 0.1254)**. Beyond it →
   unpriced, `outside_calibration`. Stored as `calibrated_min_implied_p` — move it only when mining observes longer odds.
3. **Same key, different players, different real prices** — up to ~10% (Pts+Asts 32.5 → 44.5 demon: 9.5× vs 10.5×,
   mined minutes apart). Most likely PrizePicks prices alternates off its **unrounded** projection, of which the
   standard line is a rounding. **For history this is irreducible — it is the accuracy ceiling of any key-level model.**
   **Consequence: mined prices must be stored per leg (per player / projection), never per generic key.**

**Validation against PrizePicks' real current prices:** 112 of 114 mined live legs have their exact key in history
(103 keys, covering 123,571 historical legs). v1 vs mined: **median error 3.1%, median bias 0.0000.** (v1's constants
were fitted on these legs; the out-of-sample figure remains leave-one-player-out: 72% within one rounding step.)

### REMAINING
4. ~~v2 — skew fix~~ — **DONE 2026-09-21, now CURRENT.** See "v2 — THE PER-LEG LOGIC" below.
5. ~~Rescue tier: same-day snapshot~~ — **DONE.** See "RESCUE TIERS" below.
6. ~~Rescue tier: sportsbook consensus~~ — **DONE, lower confidence.** See "RESCUE TIERS" below.
7. ~~Conflicting keys~~ — **RESOLVED 2026-09-21.** Structurally by `kind` in the key; root cause found:
   **all 2,475 off-center standards come from snapshots where PrizePicks' base market showed exactly two standard
   lines at once** (avg 1.09 apart — most likely the line moving mid-capture). The tier builder **always takes the
   higher standard as the center** (5,704 of 5,704 alt legs in those ladders). **PrizePicks' own flags confirm the
   rule:** of the 251 goblins sitting *between* the two standards — the only legs whose kind depends on the choice —
   **247 are flagged goblin (98.4%)**, i.e. PrizePicks built the ladder around the higher line. Only 8 of 5,704 flags
   contradict the builder (0.14%). The lower standard prices correctly at factor 1.
8. ~~Load mined live prices~~ — **DONE 2026-09-21.** See "MINED PRICES — PER LEG" below.
   (`Points→player_points`, `Pts+Rebs→player_points_rebounds`, `Pts+Asts→player_points_assists`,
   `Pts+Rebs+Asts→player_points_rebounds_assists`, `Rebounds→player_rebounds`, `Assists→player_assists`,
   `3-PT Made→player_threes`, `Rebs+Asts→player_rebounds_assists`)
9. **Preseason board (2026-10-03):** re-validate on dozens of players; mine longer-odds demons to extend the edge

### v2 — THE PER-LEG LOGIC (current model, `pp-leg-v2-sqrt`)
**PrizePicks prices each line as a tail probability on the square-root scale, centered on the MEDIAN projection:**
```
P(over the line) = 1 − Φ( 2 × (√line − √center) / c )      general form: power-normal, λ = 0.5
```
| Family | c | Reading |
|---|---|---|
| Rebounds / Assists / Threes | **1.08** | ≈ **Poisson** — a pure Poisson count gives exactly 1.0 on the square-root scale |
| Points / P+R / P+A / PRA | **1.87** | variance ≈ 3.5 × mean — points arrive in twos and threes |
| Rebs+Asts | 1.34 | 5 legs — thin |

**Head-to-head, leave-one-player-out (115 legs, constants refitted inside every fold):**
| Model | Within 1 step | Median error | Big-demon bias |
|---|---|---|---|
| normal (v1) | 70% | 4.5% | **+4.8%** |
| gamma, median on line | 72% | 4.3% | −3.3% (overcorrects) |
| gamma, **mean** on line | 39% | 8.7% | +1.4% — **PrizePicks centers on the median, not the mean** |
| **square root, λ = ½ (v2)** | **80%** | **3.8%** | **−0.5%** |
| λ fitted blind per fold | 76% | 4.0% | −1.2% — chose λ = 0.40–0.55 every fold |

λ = ½ was named in advance as the variance-stabilizing transform for count data; the blind per-fold fit
converging on 0.40–0.55 is the independent confirmation. The 76% row is the strictly out-of-sample figure.

**Against PrizePicks' real current prices** (mined keys found in history; both models fitted on these legs):
v1 median error 3.07%, big-demon bias +1.93%, 112 priced · **v2 3.16%, +0.15%, 114 priced.**

**Coverage of two seasons:** v2 prices **2,102,700 legs = 95.61%** (v1: 94.26%). Demons outside calibration
fall from 82,944 to **53,284** — v2's fatter tail places some far historical demons inside the range of odds
actually mined. v2's edge: `implied_p ≥ 0.1253` (furthest mined demon in v2 terms: Rebounds 11.0 → 15.5, 9.0×).

**Safety fix made at the switch:** the view now LEFT-joins the current model, so if no version were ever current,
every leg would still appear with `no_current_model` instead of silently vanishing.

### RESCUE TIERS — centers for legs the tier builder could not anchor (applied 2026-09-21)
Rescued centers live in **`nba_market.pp_anchor_rescue`** — never written into `board_tiers_v2`, which the tier
builder owns and rebuilds. The view applies a rescue **only where PrizePicks' own price flag confirms it**
(`flag_agrees`): the flag (`100` = demon, `-137` = goblin) must match the leg's position against the rescued center.
Each rescued leg reports `anchor_type = 'rescued:<tier>'`, so it can always be told apart from an observed center.

| Tier | Candidates | Flag-confirmed | Priced | Outside calibration |
|---|---|---|---|---|
| **same_day_snapshot** — PrizePicks' standard seen in another snapshot, one value all day | 3,227 | **3,104 (96.2%)** | 2,643 | 461 |
| **sportsbook_consensus** — median of the books' lines, same player/stat/day; PrizePicks posted no standard | 35,951 | **30,273 (84.2%)** | 25,139 | 5,134 |

**Tier B validation** (on 146,938 ladders where both exist): the books' consensus lands within ½ point of
PrizePicks' standard on **92.5–99.9%** by market — threes 99.5% exact, points family 61–72% exact, assists/rebounds
~60–66% exact (a 3.4% center error on assists moves a demon's price ~8%).

**⚠ Tier B selection bias — read before relying on it.** The validation population (ladders *with* a PrizePicks
standard) is not the rescue population (ladders *without* one). PrizePicks may skip the standard precisely *because*
its projection disagrees with the market. Evidence: **5,652 tier-B candidates sit exactly on the books' line yet carry
a demon/goblin flag** — PrizePicks' center was elsewhere. The flag check removes flagrant cases; half-point center
errors that don't flip a leg's kind can still pass. **Treat tier B as lower confidence; filter it out by `anchor_type`
when precision matters.**

### COVERAGE — final for this build (verified through the view)
| Center source | Legs | Priced | Share |
|---|---|---|---|
| explicit | 1,780,149 | 1,747,376 | 98.2% |
| switch_point | 375,835 | 355,324 | 94.5% |
| rescued: same_day_snapshot | 3,104 | 2,643 | 85.1% |
| rescued: sportsbook_consensus | 30,273 | 25,139 | 83.0% |
| none (no center) | 9,993 | 0 | — |
| **Total** | **2,199,354** | **2,130,482** | **96.87%** |

Progression: v1 94.26% → v2 95.61% → + tier A 95.73% → + tier B **96.87%**. Price IDs: **9,036**.
The 9,993 still without a center = flag-rejected rescues (123 A + 5,678 B) + 5 whose standard moved + 4,187 with no
center anywhere.

### MINED PRICES — PER LEG (built 2026-09-21)
**Mined prices are stored per leg, never per generic Price ID.** Two players with the identical key
`(market, center, line, side, kind)` carry different real prices (up to ~10%) — PrizePicks prices off its unrounded
projection. Collapsing mined prices into a key would pin one player's price onto every historical leg sharing it;
for history the model — effectively an average across players — is the better estimate.

| Object | Contents |
|---|---|
| `nba_market.pp_mined_leg` | one row per mined leg per run, keyed `(run_file, projection_id, partner_projection_id)` — PrizePicks' own per-leg identity; quoted 2-pick Power + Flex, de-compressed factor, implied probability |
| view `nba_market.pp_mined_vs_model` | every mined leg beside the current model's price for its key (compression read from `pp_slip_rules`) — **a standing validation: each load re-tests the model** |

**Removed from `pp_leg_price`:** the generic-key "mined outranks model" layer. It was inert (nothing loaded) but a
trap for the first mined load. Live legs will attach their own mined price per leg when the live pipeline exists.

**Loaded:** run 1 (156 legs). Runs 2–3 were byte-identical in price (0 changed rows across 45 minutes) — to be
backfilled by the loader. **Validation (v2):** 115 legs matched a Price ID; median error **3.11%**, bias **−0.73%**.
7 mined legs are stats with no historical market (Blocked Shots, Double-Double); **34 (22%) have no standard line on
the live board** — for live legs that is harmless, since the mined price itself is exact.

### DELTA MINING, DRIFT MONITOR, SLIP FUNCTIONS — built 2026-09-21 (second session)

**Delta mining (monitoring).** `nba/pp_payout_map.py` gained `mode: delta`: it reads the already-mined
`(projection_id, line)` pairs from `pp_mined_leg` and quotes **only new legs**, plus a **DRIFT sample** of already-mined
legs (rotating hourly, default 10) re-quoted to catch repricing when a line does not move. No database → a loud
warning and every leg counts as new, never silently skipped. **`nba/load_pp_mined_legs.py`** loads every map file not
yet in `pp_mined_leg` (self-healing: a failed load retries next run). Workflow chains map → commit → load.
**The schedule is DISABLED** (commented cron in the workflow) — how often PrizePicks is queried is an owner decision;
scheduled runs are forced into delta mode.

**First delta run (06:11 UTC):** board unchanged → **0 new legs, 10 drift re-quotes**; the loader **backfilled runs 2
and 3 automatically** (files 4, new rows 322). `pp_mined_leg`: **478 rows, 156 distinct legs, 4 runs.**

**Drift monitor — view `nba_market.pp_price_drift`:** first vs latest price per leg, `repriced` flag.
**First finding: 0 of 156 legs repriced across 2 h 46 m** (10 legs quoted 4×). Prices a month before tip-off are
stable; movement is expected near game time (injuries, line moves) — where delta monitoring matters.

**Slip-payout functions — pricing logic now lives in the database, reading `pp_slip_rules`:**
| Function | Does |
|---|---|
| `pp_slip_power(factors numeric[])` | 2-pick: base × factors, compressed, rounded (`verified`); 3–6: all-standard base (`verified` 3–4, `unverified` 5–6) or mixed-slip effective base × factors (`partial`, ±6%). A NULL leg → no price, never guessed |
| `pp_slip_flex2(p1, p2, power2)` | 2-pick Flex: consolation tier by risk, full payout solved from the EV target, snapped to the grid; `verified` for tiers 0.25/0.5, `partial` above |
| `pp_round_step(x, lo, hi)` | the Power rounding grid |
`flex_ev_targets` gained the higher tiers (0.75 → 0.757 · 1.0 → 0.743 · 1.25 → 0.677 · 1.5 → 0.658) with sample sizes
(22 / 12 / 4 / **1**) — marked partial.

**Validated against all 10 slips the owner confirmed on screen** (legs' mined factors in, database functions only):
**Power 10/10 within one rounding step, 6 exact. Flex tier 9/10; full payout 7/10 exact.** The labels are honest:
every `verified` slip is exact or one step off, the one-step Flex misses (#4, #9) are inherited from their Power miss,
and the only real miss (#6's tier) sits in the region labelled `partial`. Slip #4's Power miss: both legs are floor
goblins displayed 2.1× but truly ~2.08× — mined factors come from displayed, rounded prices. **Stored mined data is
kept raw** (observations stay observations; corrections belong in pricing logic).

**Item 1 feasibility (model probability vs PrizePicks'):** the two sides join cleanly — **11,279 of 11,279**
model-scored PrizePicks legs match a priced leg (10,982 carry a price). **But `board_scored` holds only 2 dates**
(2025-11-29, 2026-01-15 — sample replays), not two seasons. **Item 1 across two seasons first needs the model to score
all 378 dates** — a scoring-pipeline replay job, not a pricing gap. `board_scored.kind` is NULL for PrizePicks rows;
props use short codes (`pra`, `threes_made`, …) mapped to Odds-API markets in the join. First glimpse on the 2 dates:
avg model p 0.454 vs PrizePicks implied 0.469.

**Lesson recorded:** verify commits through the **GitHub API**, never `raw.githubusercontent.com` — its CDN caches
for minutes and ignores cache-busting query strings (it returned a pre-patch copy after two successful patches).

### PRICING THE SEASON — v2-full, one stored formula, live refresh (2026-09-21, owner direction)
**Owner's rule:** price with the best logic available now; if prices change, change them in the database.

**`pp-leg-v2-sqrt-full` is CURRENT.** Identical formula and constants to `pp-leg-v2-sqrt`, with one switch —
`price_beyond_edge: true` — so legs past the calibration edge are **priced and flagged
`extrapolated_beyond_mined_range`** instead of left unpriced. v2 extrapolates sanely (as a 2-pick with a standard:
median 17.0×, p90 36.3×, p99 89.2×; 118 legs above 50×). The conservative `pp-leg-v2-sqrt` stays stored beside it.

| Status (view `pp_leg_price`) | Legs | Share |
|---|---|---|
| priced within the evidence | 1,384,956 | 63.0% |
| standards (factor 1) | 745,526 | 33.9% |
| **priced, extrapolated (flagged)** | **58,879** | **2.7%** |
| no center — unpriced | 9,993 | 0.45% |
| **Total priced** | **2,189,361** | **99.55%** |

**`nba_market.pp_price_version(version)` — the ONE copy of the per-leg formula.** Prices every not-yet-priced key
under a version, reading everything from its `params_json` (power-normal family: `lambda` defaults to 1 = v1's normal;
0.5 = v2). Replaces a statement pasted four times — the way copies of a formula drift. **Verified bit-for-bit:** v2-full
vs the hand-priced v2 across all 9,036 keys — **0 differences outside the gap, not even at 1e-9**; all 982 gap keys
priced from the identical probability.

**`nba_market.pp_refresh_prices(p_since date default current_date - 3)` — prices the live season as it arrives:**
rescues centers for recent no-center legs (tiers A and B, flag-checked, date-bounded), creates missing Price IDs, then
prices every missing key under **every** registered version. **Idempotent — run over all of history it returned
0 / 0 / 0 / 0.** The loader calls it at the end of every run, so each scheduled run prices whatever new legs have landed
in `board_tiers_v2` — which depends on the board archive and tier builder running during the season.

**Schedule:** enabled every 6 hours (delta mode). Owner: secondary this early; kept because a run costs ~10–20 quotes.

### MODEL HISTORY FOR ITEM 1 — scoring both seasons (2026-09-21)
**Why.** Item 1 compares the model's probability with PrizePicks' price on every leg of two seasons. On
2026-09-21 the model had scored 2 of 325 ladder dates.

**The expensive half already existed.** `nba_score.baseline_history` (13 GB, ~19.3M rows) holds P2's ladder for
**325 dates — 162 (2024-25) + 163 (2025-26)**, every regular-season date. The scorer (`nba/score_board_legs.py`)
is point-in-time by design: that date's ladder plus the latest calibration cells published at or before it.
New runner: `nba/score_history.py` + `.github/workflows/nba-score-history.yml` (optional calibration rebuild,
then 8 parallel chunks; each date its own process and its own season). `BS_APPS` is documented in the scorer's
header but never read — it always scores every app.

**THE CALIBRATION WIPE (found 2026-09-21).** `nba_score.ladder_calibration_asof` was EMPTY. P2 test run
`35483301157` deleted it at **2026-09-20 03:24 UTC (8:24 PM PT, Sep 19)**: P2 passed `AC_SEASONS` = one season,
the builder deleted EVERY season, `final_hp` held only one graded 2025-26 date, so it computed **zero cells and
committed them over the whole history** ("wrote 0 as-of cells"). `certify_pipeline.py` caught it and failed the
job red (`FAILED CHECKS: as-of calibration available`) — nobody followed up.
**Fixed:** the builder now defaults to every season in `final_hp` (oldest first), computes everything before
touching the table, **refuses to write an empty build**, and replaces only the rebuilt seasons in one
transaction. P2 no longer passes a season.

**The lost calibration cannot be recovered, and was stale.** Postgres' insert counter (9,577) is cumulative
across builds — not the table's size (my misread; I had predicted the rebuild would reproduce it). Re-scoring
2026-01-15 matched yesterday's scores on ladder probability and confidence for all 52,560 legs, but every
calibrated leg's shift differed (points ~13–16× larger now): the lost table was built from an older `final_hp`.
The rebuild is fitted on exactly the probabilities the scorer corrects — `final_hp.baseline_hp` equals the
scorer's ladder probability on all 5,283 PrizePicks legs tested. Yesterday's scores are preserved in
`nba_score.board_scored_snapshot_20260920`.

**Two silent bugs fixed along the way:**
| Bug | Effect | Fix | Proof |
|---|---|---|---|
| Builder derived props with `replace('player_','')` → `threes`, `points_rebounds_assists` | threes + all four combos NEVER calibrated (only points/rebounds/assists) | map outcome keys to our names as the scorer does | cells 3,639 → **9,904**, all 8 props |
| Scorer's phase rule was month-only; the fit splits Feb 15 / Mar 16 | wrong phase's cells on **60 of 348** days (Feb 1–14, Mar 16–31) | scorer uses the fit's rule | disagreeing days → **0** |

**Full run — deadlocks, fixed, resumed.** Run `35572323173` (launched 12:18 AM PT, Sep 21) rebuilt calibration
(9,904 cells), then scored only **144 of 325 dates**; the other 181 failed on **Postgres deadlocks**. Cause: the
scorer ran `CREATE UNIQUE INDEX IF NOT EXISTS` in its write transaction on every run. Postgres takes a SHARE lock on
the table *before* discovering the index exists and holds it to commit; two scorers both held SHARE, then each waited
on the other for ROW EXCLUSIVE to delete its date. P3 scores one date alone, so it never surfaced — 8 parallel
chunks triggered it constantly. Victims rolled back whole (nothing half-written). **Fixed:** the index is created
only when missing. The runner gained `SH_SKIP_BUILT_AFTER` (resume without redoing good dates) and one retry pass;
the rerun skips dates scored after the 9,904-cell calibration was written (07:22:34 UTC).

**Open decisions (owner):**
1. **Calibration magnitude.** Average |shift| 0.09–0.15 log-odds per prop, max 0.72 (~17 points at even odds).
   The ladder recipe discards Platt shifts above 0.15; the as-of builder has no guard. Item 1's Q2b measures
   whether the large shifts help or hurt out of sample — decide with that result.
2. **2025-26 has no own-season calibration.** `final_hp` covers one 2025-26 date, so 2025-26 inherits 2024-25's
   cells. Running the final engine across 2025-26 would fix that (heavier job).

**Item 1 is prepared:** `nba/sql/item1_model_vs_price.sql` — per-leg base table (model score + latest-snapshot
price + outcome) and five questions: coverage; model vs PrizePicks pricing as predictors (Brier, by kind); does
calibration help, and do the large shifts help; is the model's claimed edge real (value buckets); a selection
backtest at thresholds 1.1006 / 1.1547 / 1.25 / 1.40, one leg per player-prop-day. Leg value = 2 × factor × hit;
breakeven per leg 1.1547 (2-pick Power) and 1.1006 (3-pick). Leg-level value ignores compression above 9.1× and
rounding, so it overstates big demons; extrapolated prices are excluded from every verdict.

### ITEM 1 RESULTS — the model against PrizePicks' prices, two seasons (2026-09-21)
All 325 dates scored (point-in-time). Table `nba_market.pp_model_vs_price`: 1,092,800 model-scored PrizePicks legs
(316,585 + 776,215), 99.6% priced, 1,078,919 usable (priced + graded, extrapolated prices excluded).
Leg value = 2 × factor × hit; fair = 1.0; breakeven 1.1547 (2-pick Power), 1.1006 (3-pick).

| | 2024-25 | 2025-26 |
|---|---|---|
| Brier, demons (model / PrizePicks) | 0.1853 / **0.1812** | 0.1897 / **0.1841** |
| Brier, goblins | 0.2232 / **0.2128** | 0.2277 / **0.2202** |
| Brier, standards (PP = flat 50%) | 0.2567 / **0.2500** | 0.2551 / **0.2500** |
| Top bucket (model value ≥ 1.50): claimed → realized | 1.729 → 1.155 ± 0.015 | 1.798 → 1.132 ± 0.009 |
| Best selection (≥ 1.40, one leg per player-prop-day) | 1.151 ± 0.013 | 1.107 ± 0.010 |
| Calibration gain, shifts > 0.30 (Brier) | +0.0121 | +0.0050 |

1. **PrizePicks' pricing is the better forecast on every kind, both seasons.** On standards the model is worse than
   a flat 50%.
2. **But the model ranks.** Realized value climbs with its claim in both seasons (0.89 → 1.155; 0.86 → 1.13).
3. **It is heavily overconfident.** Only ~21% (2024-25) and ~17% (2025-26) of the top bucket's claimed edge
   materialized.
4. **No threshold clears the 2-pick breakeven in either season.** The 3-pick breakeven is cleared only at ≥ 1.40:
   clearly in 2024-25, not significantly in 2025-26 — and those picks are 58% / 80% demons, whose leg-level value
   slip compression will cut.
5. **Tail bias by kind:** goblins under-predicted (0.644 vs 0.685 actual; 0.626 vs 0.659), demons over-predicted
   (0.263 vs 0.246; 0.296 vs 0.257) — the ladder's tails are too wide.
6. **Demons underpay as a class:** actual 0.246 vs implied 0.267; 0.257 vs 0.286 (~ −8 to −10% value). Standards are
   fair (0.500 vs 0.500).
7. **Calibration helps out of sample in both seasons, and the larger the shift, the more it helps** — a 0.15 guard
   would remove the most useful corrections (answers open decision 1).

**Caveats:** prices are our reconstruction (v2, ~80% within one step); leg value ignores compression and rounding;
legs are not independent (SEs optimistic); the model's design was developed looking at these seasons, so these
results are an upper bound — live 2026-27 is the real test; 2025-26 calibration is inherited only.

### ORIGINAL BUILD CHECKLIST (2026-09-21, before the build) — SUPERSEDED by BUILD STATUS above
*Kept for the record. Items 1–3 are built; item 7 is resolved structurally; see BUILD STATUS and REMAINING.*
1. **Schema** — the four tables and the view
2. **Fill version 1** — the current normal model, with its big-demon bias recorded in `pp_pricing_model`
3. **Slip rules** into `pp_slip_rules`
4. **Version 2** — skew fix; re-validate leave-one-player-out; flip "current" only if it beats v1
5. **Rescue tier: same-day snapshot** (3,227)
6. **Rescue tier: sportsbook consensus** — validate first (35,951)
7. **Investigate ≥ 63 keys** tagged standard on some legs and goblin/demon on others — one Price ID must mean one kind
8. **Load mined live prices** as `source = 'mined'` (needs a PrizePicks stat-name ↔ Odds-API market map)
9. **When the preseason board posts (2026-10-03):** re-validate on dozens of players; re-run if the model moves
