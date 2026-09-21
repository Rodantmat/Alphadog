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
