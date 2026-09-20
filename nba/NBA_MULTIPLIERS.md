# NBA MULTIPLIERS

**Scope.** Everything about payout multipliers across every app: what each app exposes, what has been
proven unavailable and how, the formulas and conversion logic, the tests run, slip examples, and what
the calibration of a multiplier would require.

**The headline**: **PrizePicks per-leg multipliers are NOT on any public surface.** This was
established exhaustively, not assumed. Underdog, Sleeper, Fliff and Betr do expose them.

**Update log**
| Date | What |
|---|---|
| 2026-09-20 | Created. Material from T12–T13 (per-app ladder structures), the live session (the exhaustive PrizePicks ruling-out, COMPASS fact 106), and the goblin/demon economics. |

---

## 1. WHAT EACH APP EXPOSES

| App | Multiplier availability | Where |
|---|---|---|
| **PrizePicks** | ❌ **NOT exposed anywhere public** — see §2 | priced **server-side at entry build** |
| **Underdog** | ✅ **both sides' multipliers** | `alternate_projections` per line |
| **Sleeper** | ✅ **per-side multipliers** | one line per player+stat, priced by multiplier |
| **Fliff** | ✅ | alternate lines as separate proposals per market group |
| **Betr** | ✅ | tiers REGULAR / MINI_BOOSTED / BOOSTED / SUPER_BOOSTED / BOOSTED_4 / EDGE_1..4 |

**Sleeper is the clean case**: it has **no alternate lines**, so the multiplier *is* the pricing
mechanism — one line per player+stat, with a per-side multiplier. *(⚠ T7's verified inventory found
milestone lines 20+/25+/30+ on Sleeper — unresolved, see `NBA_GOBLIN_DEMON.md` §9.)*

---

## 2. PRIZEPICKS — RULED OUT EXHAUSTIVELY

**COMPASS fact 106. Four independent lines of evidence, all negative:**

### 2.1 The live board payload carries nothing
**Zero hits** for `multiplier|payout|factor|coefficient` across **691,431 lines** of the live board
payload.
**A demon row carries only**: `odds_type`, **`adjusted_odds` as a BOOLEAN**, and `line_score`.
**The boolean is the whole signal** — it says *"this rung is adjusted"*, not *by how much*.

### 2.2 Guessed API paths are DataDome-walled
**~20 plausible endpoints** tried, **all 403** — even through the working proxy with `curl_cffi`
chrome124 and a verified **US/California** egress.

### 2.3 The app's own bundles cannot be scanned
**`app.prizepicks.com` is itself DataDome-walled**, so the JS-bundle technique that solved the
**Underdog ladder** and the **Fliff API** cannot be applied.

### 2.4 Eight commercial scrapers expose the LABEL only
**Eight independent vendors** expose the goblin/demon **label** and nothing more — while **the same
vendors expose real multipliers for Underdog, Sleeper and Pick6.**
**That asymmetry is the tell**: the data is not hidden from scrapers by accident, it is not in any
response they can reach.

### 2.5 The conclusion
> **The factor is priced SERVER-SIDE at entry build.** Which is exactly why the app shows **nothing on
> one leg and a multiplier on the second** — the number does not exist until a slip is being
> constructed.

---

## 3. THE OWNER'S CORRECTION — the factor is not a constant

> *"the factor is **NOT one number per tier** — it varies by **rung, side, prop, player form and team
> form**, so **slip-by-slip inference needs an enormous sample and is never certain**."*

**This closes off the obvious workaround.** You cannot build a tier→multiplier lookup from a handful
of observed slips, because the mapping is not a function of tier alone. Any inference approach needs:
- a very large sample of observed slips,
- covering the same rung × side × prop cells,
- and still yields an estimate, not the value.

---

## 4. THE CAPTURE THAT WOULD WORK — deferred, not abandoned

**The method that solved Underdog and Fliff:**
1. From a **computer** browser (free), **log in**
2. DevTools → **Network → Fetch/XHR**
3. **Add leg 1**
4. **CLEAR** the network log
5. **Add leg 2**
6. **"Copy as cURL"** on the request that fires

**Step 4 is the important one** — clearing between legs isolates the single request that carries the
recomputed factor.

**⚠ iOS cannot do this free** — iOS 17+ blocks `javascript:` bookmarklets.

**Status: DEFERRED.** Recorded in `nba_config.classification_config` as
`deferred_prizepicks_multiplier_capture`.

---

## 5. WHY IT MATTERS — the EV arithmetic

**Everything in the goblin/demon economics currently rests on OBSERVED payout factors, not per-leg
truth.**

### 5.1 Goblins
| Tier | Hit rate | Observed factor |
|---|---|---|
| T−3 | **74.1%** | **40–53%** |
| T−2 | 68.7% | |
| T−1 | 61.9% | |

**→ −EV at every tier.**

### 5.2 Demons
| Tier | Hit rate | Break-even factor required |
|---|---|---|
| **T+1** | **32.9%** | **1.48×** |
| T+2 | 21.3% | **2.30×** |
| T+3 | 14.8% | **3.31×** |

**Observed ceiling ~1.75–1.9×** → **T+2 and T+3 can never clear break-even.**
**→ Only demon T+1 is ever worth solving.**

**With real per-leg multipliers these conclusions could be computed exactly rather than bounded.**

---

## 6. CONVERSION LOGIC — payouts to probabilities

**`nba_config.classification_config` key: `board_payout_conversion_rules`.**

**The general form**: a leg's break-even probability is `1 / factor`. A leg is +EV when
`hit_probability > 1 / factor`.
- Demon T+1 at 32.9% needs `1/0.329 = 3.04×`… **but the required factor of 1.48× reflects the
  slip-level payout structure, not a single-leg payoff** — a demon leg raises the whole slip's
  multiplier rather than paying out alone.

**This is why multipliers are a SLIP-level concept on PrizePicks**, and why the number is computed at
entry build.

---

## 7. THE MARKET SIDE — de-vigged book probability

Where a multiplier is unavailable, **the sportsbook market supplies the comparison instead.**

**`nba_market.rung_market` — 1.06M rungs, 206 MB**, built in monthly blocks:
`game_date`, `snapshot_label`, `player`, `market`, `line`, **`p_over_book`**, `p_over_sd`, **`books`**,
`built_at`.
**De-vigged book probability AT THE DFS RUNGS ONLY** — the rungs the apps actually offer, not every
book line.
**⚠ Keys on `player` (name) and `market`**, with the count in `books` — not player_id/prop/n_books.

**And the standing rule**: the market is *"**a confidence adjuster and ranking signal, not ground
truth**"* (COMPASS fact 62).

---

## 8. SLIP-LEVEL OBSERVATIONS — what exists

**`nba_score.real_slip_leg_observations`** — **139 legs**, `decomposition_method='equal_scale_v1'`.

**`equal_scale_v1`** is the decomposition assumption: a slip's observed total payout is attributed
across its legs **by equal scaling**. **That is an assumption, not a measurement** — and it is exactly
the assumption the owner's correction (§3) warns against generalising, since the true factor varies by
rung, side, prop and form.

**MLB precedent**: `score.real_slip_leg_observations` and `control.user_placed_slips_log` — the same
capture pattern exists on the MLB side.

---

## 9. OPEN ITEMS

1. **The PrizePicks capture is deferred** — needs one logged-in browser session on a computer.
2. **`equal_scale_v1` is an assumption.** 139 legs is far short of the *"enormous sample"* the owner
   correctly says slip-by-slip inference requires.
3. **Underdog/Sleeper/Fliff/Betr multipliers are available and ARE being scraped** — but whether they
   are being **used in scoring** is not established in the transcripts reviewed so far.
4. **`nba_market.board_snapshots` HAS a `multiplier` column** — populated for the apps that expose one.
   **Coverage per app is unverified.**
5. **The fantasy-score scale conflict** (+2 vs +3 on blocks/steals) changes payout arithmetic for
   `fantasy_score` legs — see `NBA_OPEN_ITEMS.md`.
</content>
</parameter>
<parameter name="message">docs: NBA multipliers - dedicated file per owner mandate