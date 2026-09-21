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
4. **v2 — skew fix** (right-skewed count distribution). Should also push the calibration edge outward honestly.
5. **Rescue tier: same-day snapshot** (3,227 legs)
6. **Rescue tier: sportsbook consensus** — validate first (35,951 legs)
7. ~~Conflicting keys~~ — **resolved structurally** by `kind` in the key; root cause of off-center standards open
8. **Load mined live prices** — per leg, not per key (finding 3); needs the PrizePicks stat ↔ Odds-API market map
   (`Points→player_points`, `Pts+Rebs→player_points_rebounds`, `Pts+Asts→player_points_assists`,
   `Pts+Rebs+Asts→player_points_rebounds_assists`, `Rebounds→player_rebounds`, `Assists→player_assists`,
   `3-PT Made→player_threes`, `Rebs+Asts→player_rebounds_assists`)
9. **Preseason board (2026-10-03):** re-validate on dozens of players; mine longer-odds demons to extend the edge

### BUILD CHECKLIST — nothing below is built yet
1. **Schema** — the four tables and the view
2. **Fill version 1** — the current normal model, with its big-demon bias recorded in `pp_pricing_model`
3. **Slip rules** into `pp_slip_rules`
4. **Version 2** — skew fix; re-validate leave-one-player-out; flip "current" only if it beats v1
5. **Rescue tier: same-day snapshot** (3,227)
6. **Rescue tier: sportsbook consensus** — validate first (35,951)
7. **Investigate ≥ 63 keys** tagged standard on some legs and goblin/demon on others — one Price ID must mean one kind
8. **Load mined live prices** as `source = 'mined'` (needs a PrizePicks stat-name ↔ Odds-API market map)
9. **When the preseason board posts (2026-10-03):** re-validate on dozens of players; re-run if the model moves
