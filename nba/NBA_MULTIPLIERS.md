# NBA MULTIPLIERS

**Scope.** Everything about payout multipliers across every app: what each app exposes, what has been
proven unavailable and how, the formulas and conversion logic, the tests run, slip examples, and what
the calibration of a multiplier would require.

**The headline**: **PrizePicks per-leg multipliers are NOT on any public surface.** This was
established exhaustively, not assumed. Underdog, Sleeper, Fliff and Betr do expose them.

**Update log**
| Date | What |
|---|---|
| 2026-09-20 | Created. Per-app structures (T12–T13), the exhaustive PrizePicks ruling-out (live session, COMPASS 106), goblin/demon economics. |
| 2026-09-20 (2nd pass) | **T1 re-pass**: the MLB multiplier-calibration programme, the four measured mechanics, the real Flex partial-tier observations, the house-edge sanity test, and the inherited MLB document set. |

---

## 0. THE INHERITED MLB PROGRAMME *(T1 — the handoff memory and lessons document)*

**A live multiplier-calibration programme already existed on the MLB side** when the NBA build began,
and its method and findings are the informed prior for NBA.

> *"currently calibrating **real per-leg Power/Flex multipliers per prop line / side /
> variant (goblin/demon/standard) / tier** by **placing real test slips on today's board and reporting
> back the actual app-displayed numbers**"*

**The governing rule of that work:**
> *"**all test legs must come from the current/live board**"*
> *"**no rushing, must be fully understood before locking any numbers**"*

### 0.1 **FOUR MEASURED MECHANICS OF THE PRIZEPICKS MULTIPLIER**
> *"identified **real nuances in the multiplier system**:"*
1. **Same-team / same-game legs get a small multiplier DISCOUNT** — correlation is priced.
2. **The absolute line value affects the rate EVEN WITHIN the same nominal goblin/demon tier** — a
   demon on a 28.5 line and a demon on a 6.5 line do not pay the same.
3. **Recent player form (hit the line recently or not) shifts the multiplier.**
4. **PrizePicks now offers Flex for 2-pick slips** (previously Power-only).

**⚠ These four are the mechanism behind the owner's later correction** — *"the factor is NOT one number
per tier; it varies by rung, side, prop, player form and team form."* **Points 2 and 3 are that
statement's evidence**, and point 1 adds a slip-composition term the tier view cannot express at all.

### 0.2 Real Flex partial-tier observations — the one thing that DID look constant
> *"real, confirmed **5-pick Flex** data for the Mixed Top-55/92% strategy (Total Bases + H+R+RBI +
> Hits, **Goblin, less side**): **two independent real observations both showed identical partial tiers
> 4/5 = 0.5 and 3/5 = 0.25**, matching the confirmed **6-pick** tiers for Hits/H+R+RBI — **suggests
> these may be flat/constant values**."*

**So the STRUCTURE is separable**: the **partial-payout tiers** (4-of-5 → 0.5×, 3-of-5 → 0.25×) look
**flat and constant**, while the **per-leg multiplier** varies by every dimension in §0.1.
**That is a genuinely useful decomposition** — the slip-shape payout can be tabulated; only the leg
factor resists.

### 0.2b POWER vs FLEX — the two slip types

**Every multiplier is quoted per slip type.** The calibration work was explicitly
*"per-leg **Power/Flex** multipliers per prop line / side / variant / tier."*

| Type | Payout shape |
|---|---|
| **Power** | **all legs must hit** — one multiplier, no partial credit |
| **Flex** | **partial payouts allowed** — a lower headline multiplier, plus a partial-tier table |

**The partial-tier table is the part that looks constant** (§0.2): **4/5 = 0.5 · 3/5 = 0.25**, matching
the confirmed 6-pick tiers.
**PrizePicks now offers Flex on 2-pick slips** (previously Power-only) — so the available slip shapes
themselves change over time and must be re-checked, not assumed.

**Why this matters for pricing**: the two types have **different break-evens for the same legs**.
Power is a pure product of hit probabilities; Flex is a weighted sum over the partial tiers, which
makes it **less sensitive to a single miss and therefore more tolerant of a weak leg**. Any slip-EV
computation must know which type it is pricing.

## 0.2d **FLEX vs POWER — a genuinely different probability structure**

> *"**PrizePicks Flex payout tables can have a genuinely DIFFERENT EFFECTIVE PROBABILITY STRUCTURE than
> Power for the same legs.**"*

### 0.2d.1 ⚠ **THE SINGLE-TIER NON-ARBITRAGE PRINCIPLE — a validity check for any Flex table**
> *"a mechanism exists — the **'Single-Tier Non-Arbitrage Principle'** — **check that NO SINGLE
> partial-hit payout tier ALONE implies positive EV even DISCARDING every other outcome, since that is
> a MATHEMATICAL IMPOSSIBILITY for a properly-priced table** — for **detecting corrupted / misremembered
> Flex tables**."*

**A free correctness test that needs no market data.** Take one partial tier in isolation — say
4-of-5 pays 0.5× — and compute its EV **assuming every other outcome pays zero**. If that alone is
positive, **the table is wrong**, because no operator prices a slip where one partial outcome is
independently profitable.

**This applies directly to the figures in §0.2**: the 4/5 = 0.5 and 3/5 = 0.25 tiers are a
**two-observation, never-re-checked** finding (§0.2c). **Run the non-arbitrage check on them before
anything depends on them** — it is arithmetic, not a study.

### 0.2d.2 **Flex can flip an EV-negative Power pool positive — in principle**
> *"**Flex partial-credit structure can THEORETICALLY make an EV-negative Power pool EV-POSITIVE if the
> underlying leg probabilities are FAR FROM WHAT THE FLEX TABLE'S INSURANCE TIERS WERE CALIBRATED
> FOR** — **this was found true IN PRINCIPLE for MLB but the real magnitude, when tested, STILL FELL
> SHORT.**"*

**The mechanism is real and the size was insufficient.** The insurance tiers are priced for a typical
leg-probability profile; a pool whose legs sit far from that profile is mispriced **by the table
itself**, independently of any per-leg factor.

**This is a second, structurally distinct mispricing** from lesson #13's tier-step gap — **and it is
the one a well-calibrated model is best placed to find**, since it needs exactly what this system
produces: **honest per-leg probabilities**, to compare against what the table assumes.
**Tested once on MLB, real but too small. Untested on NBA.**

## 0.2e **UNDERDOG AND SLEEPER PRICE PER-LEG DYNAMICALLY — and they price EFFICIENTLY**

> *"**Underdog and Sleeper price per-leg DYNAMICALLY** (closer to real sportsbook-style pricing)
> rather than off one flat published table — **a flat assumed multiplier (e.g. '2-pick always pays
> 3.5×') is RELIABLY WRONG once legs are meaningfully far from 50/50**; **real per-leg pricing
> COMPRESSES TOWARD FAIR ODDS much more than a flat-table assumption predicts, ESPECIALLY FOR HEAVY
> FAVOURITES.**"*

### ⚠⚠ 0.2e.1 **THE MEASURED RESULT AT SCALE — and it is a hard constraint**
> *"**Underdog/Sleeper's own EV-parity pricing, when measured directly against real placed-slip data at
> scale (14,000+ REAL LEGS), showed `p × m` FLAT AND SLIGHTLY BELOW 1.0 ACROSS THE ENTIRE PROBABILITY
> RANGE** — i.e. **these platforms price efficiently enough that no simple probabi[lity-based
> selection works]**."*

**This is the most consequential platform finding in the handoff, and it is measured on 14,000+ real
legs, not inferred.**

**What it means:**
- **`p × m` flat across the whole probability range** → there is **no probability band where these
  platforms systematically overpay**.
- **Slightly below 1.0** → a consistent, modest house edge, as expected.
- **Therefore: no simple probability-based selection beats Underdog or Sleeper.** Being right about
  `p` is not enough when `m` moves to match.

### The strategic consequence — where edge can and cannot live
| Platform | Pricing | Implication |
|---|---|---|
| **Underdog, Sleeper** | **per-leg dynamic, EV-parity, `p × m` flat ≈ 1.0** | **a better `p` alone earns nothing** — the price adapts |
| **PrizePicks** | **discrete step function per tier** | **the price does NOT adapt within a tier** — this is where a better `p` can pay |

**So the two mispricings this project can plausibly harvest are both PrizePicks-specific:**
1. **The tier step function** (`NBA_GOBLIN_DEMON.md` §5.0d) — a fixed multiplier per tier, so two legs
   in one tier with different true probabilities pay the same.
2. **The Flex insurance tiers** (§0.2d.2) — mispriced for pools far from their calibration profile.

**And it sharpens `NBA_FINAL_SCORING_CALIBRATION.md` §15 considerably.** The remaining edge hypothesis
is not merely *"the tails"* — it is **specifically PrizePicks' tier structure**, because Underdog and
Sleeper have been measured, at scale, to leave nothing on the table for a probability-based method.

**⚠ Caveat per lesson #24**: this is an MLB-era measurement of platform behaviour. **The mechanic
(dynamic vs step pricing) is the durable part; the efficiency result should be re-measured on NBA
data** — but it is a strong prior.

## 0.2c ⚠ THE CONFIDENCE TIER ON §0.2's FINDING — do not let it harden

The MLB lessons document flags this exact measurement as a cautionary case:
> *"…(**Flex-mode partial-credit payouts**) that had been **built once from real data but NEVER
> RE-CHECKED against further real placed slips**. Both were reported, but **the second was explicitly
> labelled as a FIRST PASS rather than a settled figure**. **Carry the same explicit
> confidence-tiering into NBA's own research records.**"*

**So the 4/5 = 0.5 and 3/5 = 0.25 tiers are a TWO-OBSERVATION finding**, and the source's own wording
is *"**suggests** these **may** be flat/constant values"* — not a confirmed table.

**Treat as: plausible, unverified, and never re-checked.** Any slip-EV computation using them should
carry that tier explicitly, and the figures should be re-measured against fresh placed slips before
anything depends on them.

**The general rule this comes from**: **don't let a one-off measurement harden into a fact.** NBA's
structural version of the same discipline is the **`BACKTEST-LOCKED`** tag on
`nba_config.classification_config` — which distinguishes values earned by evidence from seeds.
**The multiplier work has no equivalent tag, and needs one.**

## 0.2f **PRIZEPICKS DISCOUNTS SAME-GAME CORRELATION — build CROSS-GAME by default**

> *"**PrizePicks discounts same-game correlation MEANINGFULLY** (**confirmed via a real, direct
> same-game-vs-cross-game live slip comparison**) — **ALWAYS BUILD CROSS-GAME unless a same-game
> correlation strategy has been specifically, directly tested and found to SURVIVE this discount.**"*

**This is the most directly actionable rule in the multiplier body of work**, and it is confirmed by
direct experiment rather than inferred.

**It reconciles two things that look contradictory elsewhere:**
- §5.0c (lesson #24): *"game or team pairing has **no effect on PRICING**"* — true of the **leg's own
  price**.
- §0.1: *"same-team/same-game legs get a **small multiplier discount**"* — applied at **slip
  construction**.
**Correlation is priced at the SLIP level, not the LEG level — and the discount is meaningful enough
to default against.**

**And it interacts with lesson #12** (`NBA_FINAL_SCORING_CALIBRATION.md` §7g): same-game correlation is
**real but smaller than folklore**, *and* **the platform already prices against it**. **So a same-game
correlation strategy has to clear a real discount to win a smaller-than-advertised effect.** Default
cross-game; require direct evidence to deviate.

## 0.2g **NO DFS PLATFORM PUBLISHES PER-LEG MULTIPLIERS VIA API — budget for a permanent study**

> *"**DFS platforms generally do NOT publish their own per-leg multiplier via API** — **expect to build
> a MANUAL, ONGOING multiplier-observation study (real placed slips, recorded and tabulated) as a
> FIRST-CLASS, PERMANENT RESEARCH ARTIFACT**, the same way MLB built its Excel/spreadsheet-style
> player/prop hit-rate-and-multiplier matrix. **Budget for this as ONGOING WORK, not a one-time
> task.**"*

**This reframes §2 and §4.** The exhaustive ruling-out of PrizePicks' public surfaces is not a
setback — **it is the expected state**, and the handoff anticipated it. **The deliverable is not a
scrape; it is a maintained observation matrix**, kept current because *"the exact numeric ratios…
genuinely decayed and changed over time"* (lesson #24).

**⚠ Note the tension with §1**: Underdog, Sleeper, Fliff and Betr **do** expose theirs. So the
permanent manual study is **PrizePicks-specific**, and the other four should be read from the feed —
*"there is no reason to assume anything for them: read the value."*

---

## 0.3a2 ⚠ **LESSON #16 — THE WARNING THAT BEARS HARDEST ON OUR POSITION**

> *"Real backtest results, however rigorous, **still need real-money confirmation before being
> trusted**. **MULTIPLE MLB findings survived EVERY backtest check (day-robustness, significance,
> adversarial review) and were STILL OVERTURNED the moment a real placed slip's ACTUAL MULTIPLIER was
> checked against the ASSUMED one.**"*

### ⚠ THE CHECK IS FREE — the payout displays before placing
> *"**Whenever a candidate's viability depends on a specific multiplier number, GET THAT NUMBER FROM A
> REAL, CURRENT SLIP-BUILDER QUOTE — WHICH COSTS NOTHING, THE PAYOUT DISPLAYS BEFORE PLACING — as the
> FINAL, DECISIVE STEP.** **Don't deploy real money on an assumed or extrapolated multiplier.**"*

**This removes the main objection to doing it.** Building the slip and reading the displayed payout
requires **no stake** — the number is shown at construction. **So "real-money confirmation" is a
misnomer: the confirmation is free; only the deployment costs money.**

**And it is the same surface as the capture in §4** — a logged-in slip builder, legs added one at a
time. **One session produces both the per-leg factor and the confirmation.**

**Read that against where NBA stands: we have NO real PrizePicks per-leg multipliers at all.**

| | MLB when it was burned | NBA today |
|---|---|---|
| Statistical rigour | full — day-robustness, significance, adversarial review | the same standard, applied |
| **Real multiplier** | **assumed — and wrong** | **not available at all** |

**So every EV conclusion in `NBA_GOBLIN_DEMON.md` §5 rests on the exact assumption that overturned
multiple fully-vetted MLB findings.** The observed 40–53% goblin factors and the ~1.75–1.9× demon
ceiling are **inferred**, not read from a slip.

**This does not invalidate the work** — the directional conclusions are robust to a wide range of
factors, and the ladder's *calibration* (the honesty property) does not depend on multipliers at all.
**But it means no EV or ROI claim can be believed until a real slip-builder quote confirms the
factor** — and that quote is free.

**The ordering this implies**: calibration first (done), selection second (the open question),
**quote confirmation third — free, and not optional.**

## 0.3 **THE HOUSE-EDGE SANITY TEST** — a named guard against believing a bad number

### 0.3a **MLB's COSTLIEST SINGLE ERROR — mismatched cells**

**The rule, stated in full:**
> *"**Never apply a tier/pool-level multiplier to a HETEROGENEOUS POPULATION.**
> **If a 'tier' or pool is actually MULTIPLE SUB-CELLS WITH DIFFERENT TRUE PROBABILITIES**, compute
> **`Σ wᵢ(pᵢ · mᵢ)` weighted by REAL VOLUME PER CELL** — **never a single blended rate.**"*

**The test is whether the tier is homogeneous in `p`, not whether it is a valid grouping.** A tier can
be a perfectly correct label and still contain sub-cells with materially different true probabilities —
**and it usually does, because the tier is defined by DISTANCE FROM THE ANCHOR, not by probability.**

**The recorded failure:**
> *"an **aggregate hit rate driven by ULTRA-SAFE CELLS was paired with a multiplier from a DIFFERENT,
> SMALL-VOLUME CELL**, producing a **PHANTOM POSITIVE EDGE** that **took a full Gemini adversarial
> pass to catch**."*

**⚠ This is a live risk for NBA.** The goblin/demon economics in `NBA_GOBLIN_DEMON.md` §5 pair
**measured tier hit rates** with **observed payout factors**. **Those must be matched cell for
cell** — tier × prop × side — **not compared as tier aggregates.** The directional conclusions happen
to be robust, **but the arithmetic behind them must be per-cell to be trusted.**

**And note how it connects to the pricing mechanism** (`NBA_GOBLIN_DEMON.md` §5.0d): the multiplier
**attaches to the tier index**, while `p` varies **within** the tier. **So heterogeneity in `p` within
a fixed `m` is not an accident of grouping — it is the structure of the product**, and therefore
always present.

### 0.3b The `p × m` test itself
> *"Before trusting any high hit-rate finding, **compute the implied house edge: `p × m`** where `p` is
> the real hit rate and `m` is the real per-leg multiplier. **If this implies the platform is handing
> out a large, systematic edge on a repeatable, high-volume line, THE MULTIPLIER ATTRIBUTION IS WRONG,
> NOT THE MARKET** — go find the real multiplier before believing the hit rate."*

**This is the single most useful rule in the multiplier work.** `p × m` materially above 1.0 on a
liquid, repeatable line is a measurement error, not an edge.

### 0.4 MLB's own multiplier documents (inherited, referenced in the handoff)
`MULTIPLIER_TABLES_MASTER.md` · **`GOBLIN_DEMON_MECHANISM_EXPLAINED.md`** ·
`HIGH_HIT_RATE_METHODOLOGY.md` · `SIGNALS_TECHNIQUES_TRIED.md` ·
`COWORKER_DAILY_SLIP_RESEARCH_PROMPT.md` · `MASTER_DELTA_SCRUTINY_GUIDE.md` · `GEMINI_USAGE_GUIDE.md` ·
`CALIBR…` (+ more) — **eleven documents read and integrated into the NBA transfer package.**

### 0.5 **What transfers and what does not** — stated explicitly in the handoff
> *"**The full multiplier/pricing study — MLB's specific numbers DO NOT transfer**; **only the
> platform-level *mechanics* (Part B of the lessons document) transfer as informed priors, not
> answers.**"*

**And the sequencing rule:**
> *"**Only once real board data + real outcome grading exist for a genuine multi-week window, begin the
> multiplier-observation study**… using the full **16-item standard** from the lessons document **from
> the very first candidate**, not as a later addition once shortcuts have already been taken."*

**→ The NBA multiplier study is correctly NOT started.** It is gated on a multi-week window of live
board + graded outcomes, which does not exist until the season runs.

### 0.6 Two UI rules carried from MLB
- *"A **real multiplier value the person has manually entered must never be lost or reset** on a UI
  re-render."*
- *"Slip-leg checkboxes default to checked."* Plus a **backup-leg substitution system** for when a
  recommended leg becomes unavailable.

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
mechanism. *(⚠ T7's verified inventory found milestone lines 20+/25+/30+ on Sleeper — unresolved, see
`NBA_GOBLIN_DEMON.md` §9.)*

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

## 4b. THE CAPTURE PROTOCOL — what a valid multiplier study requires

**Beyond the mechanics in §4, three lessons constrain how any capture must be run:**

### 4b.1 **A CONTROL SLIP WITH A KNOWN ANSWER — required, not optional** *(#22)*
> *"MLB's original multiplier-observation study **deliberately included a real slip built ENTIRELY from
> unmodified, standard-priced legs** — with the explicit purpose of **confirming the study's own
> MEASUREMENT METHOD against a case with a known, predictable answer** (no special pricing applied at
> all). **It came back MATCHING THE PREDICTED BASELINE EXACTLY, WHICH IS WHAT GAVE THE REST OF THE
> STUDY'S MORE INTERESTING FINDINGS REAL CREDIBILITY.**
> **For any NBA real-world observational study — a multiplier study, a pricing study, an A/B-style
> comparison — deliberately include at [least one control case].**"*

**The control validates the instrument, not the hypothesis.** A standard-only slip has a predictable
payout; **if the method cannot reproduce it, nothing measured on goblin or demon slips can be
trusted.**

**And the stated benefit runs the other way too**: the control matching exactly is **what made the
interesting findings credible**. Without it, a surprising demon result has no way to distinguish a
real effect from a broken measurement.

**Any NBA capture must open with one standard-only slip.**

### 4b.2 **ALL TEST LEGS FROM THE CURRENT/LIVE BOARD** *(the owner's rule, §0)*
> *"**all test legs must come from the current/live board**"* · *"**no rushing, must be fully
> understood before locking any numbers**"*

### 4b.3 **RE-PAIR BEFORE CONCLUDING ON ANY INTERACTION** *(#23)*
An anomaly in a **pairing** is a property of the pair, not of either leg. **Re-pair each leg with other
partners before attributing the effect to either one.** Directly relevant to §0.1's finding that
*"same-team/same-game legs get a small multiplier discount"* — that is an interaction claim, and
isolating it needs the same-team leg re-paired with non-same-team partners.

### 4b.4 **The sample-size posture applies** *(#18)*
**Fewer than 15 real days is not a result at all; 15–30 directional; 30–70 with caveats; 70+
reportable.** **Days, not leg count** — *"a large leg count concentrated in a handful of days is a
small-sample finding wearing a large-N disguise."* **A multiplier study run over a week is not a
study.**

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