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
| **2026-09-22** | 🔴 **BACKFILLED 2026-09-22, T20 pass 65 (§T20.70) — this row covers `13` commits that this log never recorded.** *T13–T18 material plus the live audits: **§0.9 the T13 multiplier research arc** (not-scrapable mechanism, base tiers) · **§0.9b.1 PrizePicks' own published rules** (Flex 6-pick 25×) · §0.9d.1 the live price census · **§0.9e.4 the Underdog `alternate_projections` ladder capture, owner-verified** · §0.9e.6 the fantasy-score formula settled for both apps with sources · §0.9i slip-composition rules re-scoped to the owner's ranking · **§6.0 the live contents of `board_payout_conversion_rules`** · **§T18.1/§T18.2 the PrizePicks multiplier hunt and its exhaustive result**. **Corrections in place: §0.9e.1 CORRECTION — Underdog has NO historical ladders (pass 1 recorded the opposite) · the `real_slip_leg_observations` absence flag propagated to its third site · LIVE-AUDIT §0.9c — the PrizePicks archive carries `0` multipliers and `100%` prices.*** |

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

**And it sharpens `NBA_FINAL_SCORING_CALIBRATION.md` §15.0c considerably.** *(Pointer corrected 2026-09-20, pass 74: §15 has no parent heading — only §15.0c exists. See the numbering audit in `NBA_OPEN_ITEMS.md` → FROM T1 PASS 74.)* The remaining edge hypothesis
is not merely *"the tails"* — it is **specifically PrizePicks' tier structure**, because Underdog and
Sleeper have been measured, at scale, to leave nothing on the table for a probability-based method.

**⚠ Caveat per lesson #24**: this is an MLB-era measurement of platform behaviour. **The mechanic
(dynamic vs step pricing) is the durable part; the efficiency result should be re-measured on NBA
data** — but it is a strong prior.

## 0.2h ⚠⚠ **LESSON #27 — PARTIAL-CREDIT STRUCTURE IS PLATFORM-SPECIFIC: FLAT *vs* PROPORTIONAL**
*Source: T1, `NBA_LESSONS_LEARNED_FROM_MLB.md` Part A, lesson **#27**. **Recorded 2026-09-20 (T1 pass
30) — this lesson had no entry in any of the twelve documents before now.** Its existence is
**VERIFIED** by direct grep of the source file and of T1; the research standard is **27 lessons, not
the 26 these documents recorded**.*

> *"MLB found **a real, concrete structural difference between platforms**: **one platform's
> partial-hit Flex payouts (for missing one or two picks out of a full slip) were FLAT, FIXED VALUES
> INDEPENDENT OF HOW LARGE THE UNDERLYING FULL-HIT MULTIPLIER WAS**, while **a DIFFERENT platform's
> partial-hit payouts SCALED PROPORTIONALLY WITH ITS OWN FULL-HIT MULTIPLIER**. **Don't assume every
> DFS platform's Flex-style partial-credit structure works the same way — VERIFY EACH PLATFORM'S
> ACTUAL MECHANIC… DIRECTLY FROM REAL OBSERVED DATA before building any EV model that depends on
> it**, since **the two structures produce meaningfully different expected values for the same
> underlying leg-hit distribution.**"*

### ⚠ This bears directly on §0.2 — read them together
**§0.2 is the strongest single result in this document**: *"two independent real observations both
showed identical partial tiers **4/5 = 0.5 and 3/5 = 0.25**… **suggests these may be flat/constant
values**"*, and §0.2d builds the whole separable-structure argument on it — *"the partial-tier table
is the part that looks constant, while the per-leg multiplier varies by every dimension in §0.1."*

**Lesson #27 does not overturn §0.2. It bounds it.**

| | What §0.2 established | What #27 adds |
|---|---|---|
| **Platform** | **PrizePicks only** — 5-pick and 6-pick Flex, MLB | flat is **one of two structures observed in the wild** |
| **Shape** | flat / constant tiers (0.5, 0.25) | the other structure **scales with the full-hit multiplier** |
| **Transferability** | implicitly treated as a property of Flex | **explicitly a property of a PLATFORM, to be verified per platform** |
| **Consequence** | a tabulatable slip-shape payout | *"meaningfully different expected values for the same underlying leg-hit distribution"* |

**So the separable decomposition in §0.2/§0.2d is valid for PrizePicks and NOT YET LICENSED
ELSEWHERE.** **Betr, Fliff, Underdog and Sleeper each require their own observation.**

### ⚠ The prior for who is which — and it points the wrong way for us
**§0.2e records, separately, that Underdog and Sleeper *"price per-leg DYNAMICALLY (closer to real
sportsbook-style pricing) rather than off one flat published table."*** **A platform that prices legs
dynamically is precisely the shape that would scale its partial tiers proportionally.** These two
findings were recorded independently and **have not been read against each other until now**: together
they make *"Underdog/Sleeper partial tiers are probably NOT flat"* the **informed prior**, not an open
question with no lean. **NOT RECORDED as measured. Do not act on the prior — measure it.**

### What this changes in the capture protocol
**§4b's protocol must answer a fifth question per platform**, and it is cheap because **the payout
displays before placing** (#16), so **no stake is required**:

| # | Question | Already in §4b? |
|---|---|---|
| 1–4 | the four questions §4b already lists | ✅ |
| **5** | **Does a partial-hit tier change when the full-hit multiplier changes?** Build two slips of the same shape with **materially different headline multipliers** and read the partial tiers off both. **Flat → identical partial values. Proportional → they move with the headline.** | ⚠ **NOT PRESENT — add it** |

**One extra observed slip per platform settles it.** That is the whole cost.

### Why this is first-order, not a refinement
**Flex EV is a weighted sum over the partial tiers.** If the tiers scale with the headline multiplier,
then **every tier term moves when the headline moves**, and an EV model built on flat tiers is wrong
in the same direction for every slip it prices — **a systematic bias, not noise.** It also
**compounds with §0.2d.2's finding** that Flex *"can theoretically make an EV-negative Power pool
EV-positive"* — that argument is entirely a function of the tier shape, so **it cannot be evaluated on
a platform whose tier shape is unverified.**

### Confidence tier on this entry
**Lesson #27 itself is VERIFIED** — quoted verbatim from the source document, existence confirmed by
grep on 2026-09-20. **Its application to any specific platform is NOT RECORDED**: no NBA-side
observation of partial tiers exists on any platform, and the MLB-side observation covers PrizePicks
alone. **Per #19, nothing here is stated more strongly than "verify each platform."**

---

## 0.2c ⚠ THE CONFIDENCE TIER ON §0.2's FINDING — do not let it harden

**Lesson #26, stated in full:**
> *"**'First real pass' and 'independently re-validated' are NOT the same claim.**
> [The] multiplier research distinguished, **explicitly and honestly**, between **figures that had been
> INDEPENDENTLY RE-DERIVED AND CONFIRMED TO MATCH ACROSS TWO SEPARATE SESSIONS ON DIFFERENT REAL
> DATES**, versus a related model (**Flex-mode partial-credit payouts**) that had been **built once
> from real data but NEVER RE-CHECKED against further real placed slips**. **Both were reported, but
> the second was EXPLICITLY LABELLED AS A FIRST PASS rather than a settled figure.**
> **Carry the same explicit confidence-tiering into NBA's own research records — don't let a
> once-derived, never-revalidated figure** [harden into a fact]."*

**The bar for the top tier is specific: independently re-derived, matching, across TWO SEPARATE
SESSIONS ON DIFFERENT REAL DATES.** Not two observations in one session, and not the same method run
twice.

**Applied to §0.2's finding**: the 4/5 = 0.5 and 3/5 = 0.25 partial tiers came from
*"**two independent real observations**"* — which is closer to the top tier than the Flex model that
prompted the warning. **But the source's own wording is *"suggests these MAY be flat/constant"***, and
the identical figure being the **cautionary example** in #26 means it should be read as
**first-pass until re-checked on NBA data**.

**Tier every figure in this document explicitly.** NBA's structural equivalent is the
**`BACKTEST-LOCKED`** tag on `nba_config.classification_config`, which separates earned values from
seeds. **The multiplier work has no equivalent tag and needs one.**

## 0.2f **PRIZEPICKS DISCOUNTS SAME-GAME CORRELATION — build CROSS-GAME by default**

> *"**PrizePicks discounts same-game correlation MEANINGFULLY** (**confirmed via a real, direct
> same-game-vs-cross-game live slip comparison**) — **ALWAYS BUILD CROSS-GAME unless a same-game
> correlation strategy has been specifically, directly tested and found to SURVIVE this discount.**"*

### The arithmetic, quantified in lesson #12
| Side | Magnitude |
|---|---|
| **Correlation benefit** | **~8%** — *"much smaller [than folklore]… **itself NOT statistically confirmed**"* |
| **The platform's same-game discount** | **~35–40% LOWER MULTIPLIER for the IDENTICAL legs** |

> *"…which **MORE THAN OFFSET** the real correlation benefit. **Do not assume same-game stacking is a
> working strategy for NBA without DIRECTLY TESTING the platform's own same-game discount, the same
> way — IT MAY BE ACTIVELY PRICED AGAINST, NOT FREE MONEY.**"*

**The discount is roughly 4–5× the benefit, and the benefit is not statistically confirmed.**

### How to test it for NBA — free, and the same session as everything else
**A live-board same-game vs cross-game slip comparison.** Since **the payout displays before placing**
(lesson #16), this costs nothing. **One logged-in session produces**: the control slip (§4b.1), the
per-leg factors (§4), the tier step ratio (`NBA_GOBLIN_DEMON.md` §5.0d), **and this discount**.

**It reconciles two things that look contradictory elsewhere:**
- §5.0c (lesson #24): *"game or team pairing has **no effect on PRICING**"* — true of the **leg's own
  price**.
- §0.1: *"same-team/same-game legs get a **small multiplier discount**"* — applied at **slip
  construction**.
**Correlation is priced at the SLIP level, not the LEG level.**

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

## 0.7-T18. 🔴🔴🔴 **THE MULTIPLIER HUNT'S RESULT — EXHAUSTIVE, DEFINITIVE, AND IT OVERTURNS THE STORED GOBLIN ESTIMATE** *(T18 pass 1, §T18.2)*

*§0.8-T18 below records what the owner ordered. **This is what the hunt found**, and COMPASS fact 106's
one-line *"not on any public surface"* is the summary of it.*

### ✅ **1 · THE BOARD PAYLOAD DOES NOT CARRY IT — the complete field list, and a zero grep**

**Every attribute PrizePicks sends per projection**: `adjusted_odds · board_time · custom_image ·
description · end_time · event_type · flash_sale_line_score · game_id · group_key · hr_20 · in_game ·
is_live · is_live_scored · is_promo · league_ppid · line_score · odds_type · projection_type · rank ·
refundable · start_time · stat_display_name · stat_type · status · today · tv_channel · updated_at`.
**Relationships**: duration, game, league, new_player, projection_type, score, stat_type. 🔴 **No
payout. No multiplier. No factor. No coefficient.**

✅ **AND A FULL-PAYLOAD GREP CONFIRMS IT**: `multiplier|payout|factor|coefficient` returns **ZERO
matches across 691,431 lines** of the live **17.6 MB `prizepicks_mlb_current.json`**. ⚠ **The two
odds-adjacent fields carry labels, not prices**: **`odds_type: "demon"`** and **`adjusted_odds: true`
— a BOOLEAN flag meaning "this leg is priced off-standard", never the amount.**

### ✅ **2 · THE ENDPOINT SWEEP — and the wall is PER-ENDPOINT, not per-IP**

*Run through the working scraper's exact transport — **`curl_cffi` with `impersonate="chrome124"` plus
the proxy** *(egress **50.120.60.213, US/California** — the correct jurisdiction)* — **the same path
that captured the 17.6 MB file**:

| Target | Result |
|---|---|
| `/payout_tables` · `/entries/quote` · `/entries/preview` · `/graphql` · `/stat_types` · `/projection_filters` | 🔴 **DataDome interstitial** (`geo.captcha-delivery.com`) |
| **`partner-api.prizepicks.com/payouts`** | ✅ **a clean `{"status":404,"error":"not found"}` — a REAL application response** |

🔑 **That 404 is the informative one**: *"that host isn't bot-walled, so 404 means **the path genuinely
does not exist there**."* ⚠ **And since the projections endpoint works through the identical path,
the block is per-ENDPOINT — PrizePicks guards anything beyond the public board.**

### 🔴 **3 · THE WEBPACK-BUNDLE TECHNIQUE THAT SOLVED UNDERDOG FAILS HERE**

*COMPASS fact 49 records the Underdog ladder being solved by **scanning webpack chunks** for the
endpoint the client calls. Applied to PrizePicks:*

| Target | Result |
|---|---|
| `app.prizepicks.com/board` | 🔴 **403 DataDome — the app SHELL itself is bot-walled, HTML included** |
| `www.prizepicks.com` | ⚠ **200, 20 bundles — but this is the MARKETING site, not the app** |
| the one `multiplier` hit | 🔒 **`volumeMultiplier` in a Lottie animation library — a false positive, killed** |

⚠⚠ ***"DataDome guards the CLIENT SHELL, not just the API — which is STRICTER than Underdog, where
the bundle scan worked."*** 🔑 **So the technique is not wrong; the target is harder.** *(iOS 17+
blocking bookmarklets closed the owner-side shortcut as well.)*

### 🔑🔑🔑 **4 · THE DECISIVE EVIDENCE IS MARKET-WIDE, NOT OUR OWN PROBES**

> ***"EIGHT independent commercial PrizePicks scrapers, all reverse-engineered, ALL list the same
> fields: 'odds types (standard, demon, goblin)' — **the LABEL, every time. NOT ONE exposes a
> PrizePicks multiplier.**"***

⚠ **And the same vendors advertise payout multipliers for the COMPETITORS**:

| App | What their scrapers extract |
|---|---|
| 🔴 **PrizePicks** | **"odds types (standard, demon, goblin)" — TIER LABELS ONLY** |
| Underdog | *"American and decimal odds, **payout multipliers**"* |
| Sleeper | *"over/under lines, **payout multipliers**"* |
| DraftKings Pick6 | *"over/under **multipliers**"* |
| Betr | tiers + values via GraphQL |

🔑 *"These are COMPETING vendors with every commercial incentive to extract more, and one lists **51
fields per prop** — yet none has a PrizePicks payout field. **That's about as close to proof as
reverse-engineering gets.**"* ✅✅ **AND IT EXPLAINS THE OWNER'S OBSERVATION EXACTLY**: *"one leg shows
nothing because **THERE IS NOTHING TO SHOW** — the factor only exists once the entry is priced
**SERVER-SIDE**, which is why the number appears on the second leg and why it sits behind the
**authenticated entry endpoint** that DataDome guards."*

### 🔴🔴🔴 **5 · THE OWNER'S SEVEN WNBA SCREENSHOTS — AND THEY OVERTURN THE STORED GOBLIN ESTIMATE**

*$20 entry, Power Play. **`implied product = displayed ÷ base`**:*

| Picks | Composition | Displayed | Base | **Implied product** |
|---|---|---|---|---|
| 4 | **4 goblins** | 2.1x | 10x | 🔴 **0.210** |
| 3 | **3 goblins (all rebounds)** | 1.8x | 6x | 🔴 **0.300** |
| 3 | 3 goblins | 2.7x | 6x | 0.450 |
| 3 | 1 demon + 2 goblins | 3.5x | 6x | 0.583 |
| 2 | 1 demon + 1 goblin | 2.2x | 3x | 0.733 |
| 2 | 1 goblin + 1 demon-less | 2.4x | 3x | 0.800 |
| 4 | **2 demons + 2 goblins** | 15.5x | 10x | **1.550** |

🔴🔴 **(a) GOBLINS ARE FAR MORE PUNITIVE THAN THE STORED ESTIMATE.** *Four goblins → 0.210 → **≈0.677
per leg** if equal; three rebounds goblins → 0.300 → **0.669 each**.* ⚠⚠ **The config says *"goblin
~0.75–0.90× typical"*. **The real number is nearer 0.67** — a 10–25% overstatement of what a goblin
leg is worth, in the direction that makes goblin slips look better than they are.**

🔑 **(b) DEMONS ARE STRONGER THAN GUESSED.** *Two demons + two goblins → 1.55; with goblins at ~0.68
each (0.46 product), **the two demons must contribute ~3.37 — roughly 1.84 each**, at the top of the
guessed 1.20–1.50 (extreme 1.75–1.9) range.*

✅ **(c) AND A SOLVABLE SYSTEM EXISTS**: **Naz Hillmon's 2.5-rebounds goblin appears in two slips and
Kamilla Cardoso in four at different lines** — *"same leg, different slips, **so the individual
factors can be PINNED rather than assumed equal**."* 🔑 **A few more HOMOGENEOUS slips (all legs same
prop/line/side) would read each factor exactly.**

⚠⚠ **AND THIS IS WHY IT MATTERS FOR THE STORED DATA**: `score.real_slip_leg_observations` holds **139
leg observations, all decomposed via `equal_scale_v1`** — *"**derived by ASSUMING every leg in a slip
carried an equal share — they are INFERRED from slip totals, not READ from the app.**"* 🔑 **The
screenshots are the first direct read, and they disagree with the inference.**

### ✅ **6 · THE PRICING LAW, AND WHY IT IS BOTH TRUE AND INSUFFICIENT**

*Already solved and documented at the repo root (`prizepicks_pricing_model_solved.md`,
`goblin_demon_multiplier_study_dossier.md`), **2026-09-05, from 22,470 graded legs**:*

> 🔑🔑 ***"PrizePicks prices every goblin leg FROM ITS PROBABILITY — not from line, tier, or distance
> arithmetic."*** **`multiplier × p_hit` is approximately CONSTANT across all 7 cells measured, with
> multipliers spanning 1.1067–1.2179.**

| | |
|---|---|
| **Distance is NOT monotonic** | +0.5 → 1.2017 · +1.0 → **1.1067** · +2.5 → 1.1129 · +3.0 → 1.1247 — *"**distance is only a COORDINATE; p is what is PRICED**"* |
| **The anchor matters because it determines p** | *"singles 1.5-less prices at **1.2017** when the anchor is 1.0, but **1.1067** when the anchor is 0.5 — **an 8.6% gap from the anchor alone**"* |
| **Prop identity barely matters once p is fixed** | two different props at the same line and distance priced within **1.06%** |
| **The read procedure** | *"a HOMOGENEOUS 4-pick where every leg shares prop, line, side and anchor… **per-leg = the 4th ROOT** of the displayed power multiplier"* |

✅ **AND THE STORED OBSERVATIONS CONFIRM THE OWNER'S "EACH GOBLIN IS DIFFERENT"**: *walks-allowed more
at the **1.5** line prices **1.4253–1.5009**; the **0.5** line **1.1150–1.1650** — **a 30% gap between
rungs of the same prop**, with **5% variation still present WITHIN a single line**, which is *"the
player-and-day-specific probability moving."**

🔑 **THE DERIVATION THAT FOLLOWS**: **`multiplier ≈ constant / p`**, with the constant fitted per sport
from the 139 placed-leg observations joined to the board snapshot at placement time — ✅ **and the
system now HAS a well-calibrated `p` (0.5643 log-loss).** ⚠⚠ **BUT THE OWNER KILLS THAT PATH**:
*"**the factor varies by rung, side, prop, player form, team form. That's a space too large to solve
with slips.**"* 🔑 **And his second argument is the stronger one: *"if the app RENDERS it, the client
RECEIVED it. The client cannot invent a number it wasn't given"*** — **which is what redirected the
hunt from inference to the client, and to the DataDome wall.**

### 🔴 **7 · WHAT REMAINS — and it is a five-minute job on the owner's side**

*Every route that does not require an authenticated session is closed. **The remaining one is the
owner's own browser**, and it has a precedent: **COMPASS facts 49 and 50 record Underdog and Fliff
being solved from cURLs the owner captured.** The recipe, as given:*

> **Open `app.prizepicks.com` logged in → DevTools → Network → filter **Fetch/XHR** → add the FIRST
> leg → **CLEAR the list** → add the SECOND leg. Whatever fires in that final step is the answer.
> Right-click → Copy → **Copy as cURL**.**

⚠ *Desktop DevTools is free; the iOS routes (**Inspect Browser** ~$5, or **HTTP Catcher / Proxyman**
for the native app) were offered as alternatives.* 🔑 **Recorded so the deferral carries its exit
condition rather than reading as a dead end.**

---

## 0.8-T18. 🔴🔴🔴 **THE PRIZEPICKS MULTIPLIER HUNT — what the owner OBSERVED, what he ordered, and why it was DEFERRED** *(T18 pass 0, §T18.1, owner, 2026-09-19; COMPASS fact 106's origin)*

*COMPASS fact 106 records only the conclusion — **"PRIZEPICKS PER-LEG MULTIPLIERS ARE NOT ON ANY PUBLIC
SURFACE (config `deferred_prizepicks_multiplier_capture`) — DEFERRED."** **This is the hunt.***

### 🔑🔑 **THE OBSERVED BEHAVIOUR THAT PROVES THE DATA EXISTS** *(2 of the thirty, **0 of the twelve**)*

> ***"The sequence is: I put ONE leg in the slip — **it doesn't show a multiplier**. When I put a
> SECOND leg, **then it's gonna show the multiplier**, and so on. **So that leg MUST CARRY A
> MULTIPLIER SOMEWHERE.**"***

🔑 **The inference is sound and it is the whole basis of the search**: *"**if it shows on the app, if
it shows on the slip, it MUST BE THERE on the app somewhere — or at least retrievable somehow.**"*

### 🔴🔴 **THE CORRECTION THAT MATTERS MOST, AND IT IS 0 OF THE TWELVE AND 0 OF THE THIRTY**

> ***"You're treating goblins as ONE THING and demons as ONE THING — **AND THEY ARE NOT.** **Each
> goblin on the ladder, each demon on the ladder — if they are MORE, if they are LESS — is
> DIFFERENT**: for different prop lines, for the tier, for the player form, **even for the team
> form.** … They're very complicated to just predict and find. **We're gonna need an extremely high
> number of slips and legs to try it out.**"***

⚠⚠ **READ THAT AGAINST §6.0's `board_payout_conversion_rules` AND §0.9e's per-app ladder**: *those
record multipliers at the TIER level. **The owner is saying the true granularity is per-rung ×
direction × prop × tier × player form × team form** — and that a tier-level table is therefore an
approximation, not the quantity.* 🔑 **That is why he wants the payload rather than a fitted model.**

### ✅ **THE TWO ACCEPTABLE OUTCOMES, STATED AS A SPEC**

> ***"Either we understand EXACTLY what's the logic behind it and we treat it internally, knowing that
> each goblin, demon, prop line has a specific way to tag them — **OR** we understand that it's
> VARIABLE, and then we need to **find it on the payload and GRAB IT**. So we have a proper
> multiplier: either because we understood the logic, or because we're getting the proper multiplier
> from the payload."***

⚠ **AND HIS RANKING OF THE TWO IS EXPLICIT**: *"the better path is… **understand on the JSON if you
can find that information. It's a lot easier** … instead of trying to figure out the full logic out
of the OUTCOMES. If that's the only way, we do it. **But that's going to be harder, longer, more
complex.**"* 🔑 **So the outcome-fitting approach the corpus documents is the owner's SECOND choice,
adopted because the first failed.**

### 🔑 **THE METHOD HE SPECIFIED — and the reason for it**

| | |
|---|---|
| **Probe a LIVE sport, not NBA** | *"**NBA season is not on yet. You can never forget that** — it's just gonna be on in October. That's why I'm telling you to try with **MLB or WOMEN'S NBA**."* ⚠ **and WNBA is preferred** — *"it's gonna be a lot closer… the multipliers are gonna be very, very similar"* |
| **Follow the ladder's own discovery path** | 🔑 *"**it's just like the ladder**: first find the path for the sports, then the proper prop lines, then **an EXTRA JSON that brings the ladder variations**. So now we're trying to explore even deeper."* ⚠ *"I do believe there are **extra additional JSONs, calls, paths and endpoints** — maybe we need to call different endpoints."* |
| **Calibrate against slips he actually placed** | 🔑🔑 *"on the system we have **A LOT OF SLIPS PLACED FOR MLB** and the multipliers that I found when I placed them… **be sure that you're using the board snapshot FROM THE TIME THAT I PLACED, because there are THREE different board snapshots.**"* ✅ **An owner-supplied ground-truth set with an explicit join caution.** |
| **Do not act on it** | *"**do not update anything yet — just bring the information back to me.**"* |

⚠ **WHAT THE CORPUS ALREADY HAD, in his words**: *"we already have decent information, **but that's on
TRIAL AND ERROR. It's not assertive, it's not coming from the app** — it's coming from research, from
slip testing… **the REGULAR lines are always the same, that we already have established. But the
GOBLINS AND DEMONS have different multipliers that WE DO NOT UNDERSTAND.**"*

### 🔴 **WHY IT WAS DEFERRED — and it is not "the data isn't there"**

*A browser-side probe was blocked: **"Safari cannot run the script because JavaScript is not allowed
to be used this way."*** ✅ **The owner then established the workaround exists** — *"so if I do that
from a computer, I can do that from my browser, and that's free, correct?"* — **and deferred it
anyway**: *"we're gonna add that to the DEFERRED things we need to do, like the ladder for Sleeper and
the Chalkboard that was on the deferred list. Add this also to the deferred list, **and we're gonna
try it later.**"* ⚠⚠ **So fact 106's *"not on any public surface"* is a statement about what was
reachable in that session, not a proven absence — the owner's own standard was *"exhaustively try
until a point you say there's nothing else we can do,"* and his assessment at the time was **"we
barely scratched the surface."*** 🔴 **Recorded so the deferral is not read as a negative result.**

---

## 0.9 🔑🔑 THE T13 MULTIPLIER RESEARCH ARC — **what the research actually LEARNED, and where it stopped**
*Recorded 2026-09-22 (T13 pass 1, §T13.2). **Transcript `2026-09-13-01-03-48`, the 250-segment
assistant-prose stratum read in order.** Novelty probed against baseline `4429380d`; duplication
probed against the WORKING tree over the twelve, **both pinned 2026-09-22T07:45:06Z**; controls
`demon` 46 of thirty / 12 of the twelve and `flex` 19 / 7 both fire. **Every hit opened (rule 26);
three candidates re-scoped and logged below.*** ⚠ **Rule 1: no multiplier value below comes from the
prose that reports it — each names the AUTHORITY that produced it.**

### 0.9a ⚠⚠ **THE PER-LEG MULTIPLIER IS NOT SCRAPABLE — and this is the arc's CONCLUSION, stated by the researcher**
**§2 already rules PrizePicks out on four negative lines of evidence. T13 adds the MECHANISM and the
researcher's own verdict**, which the twelve did not carry:

> *"there is **no fixed multiplier**… the payout is **computed at ENTRY LEVEL when you submit**"*
> *"payouts are set based on **the projections available AT THE TIME OF LINEUP SUBMISSION**"*
> *"the multipliers are **dynamic** — PrizePicks adjusts them, **including WITHOUT MOVING THE LINE**"*
> — and the closing self-assessment: ***"Have I figured out the PrizePicks multiplier? NO."***

🔑 **Two of these are load-bearing and are new**:
- ***The payout is a function of SUBMISSION TIME.*** A multiplier observed at 1:00 pm is not the
  multiplier paid at 1:45 pm. **Every stored multiplier therefore needs a capture timestamp**, and
  §4b's protocol does not currently require one. ⚠ **This interacts directly with the owner's
  latency requirement** *(T13 seg 571, `NBA_OPEN_ITEMS.md`)*: a slow pipeline does not merely place
  slips late, **it prices them against a quote that has already moved.**
- ***The line can stay still while the multiplier moves.*** So **line-movement monitoring cannot
  detect repricing**, and any inference of `m` from a line history is unsound.

**And the BOOST is a separate multiplicative term**: *"a **per-leg factor applied MULTIPLICATIVELY to
the base entry multiplier**"*, **which compounds**. Any observed payout may carry a boost the
observer cannot see — **a confound §4b's protocol must exclude, not average over.**

### 0.9b **THE BASE MULTIPLIER TABLE — the one set of hard numbers the arc produced**
*Authority: the researcher's statement of PrizePicks' published entry table. **A PUBLISHED TABLE, not
a measurement** — and it is the SLIP-SHAPE term of §0.2's decomposition, never the per-leg factor.*

| Slip type | Picks | Payout |
|---|---|---|
| **Power Play** | 2 | **3×** |
| **Power Play** | 3 | **6×** |
| **Power Play** | 4 | **10×** |
| **Power Play** | 5 | **20×** |
| **Power Play** | 6 | **37.5×** |
| **Flex** | 3 | **2.25×** all · **1.25×** on 2/3 |
| **Flex** | 4 | **5×** all · **1.5×** on 3/4 |

⚠ **Read this against §0.2 and §0.2h, not on its own.** §0.2's *"4/5 = 0.5 and 3/5 = 0.25"* are
**partial-tier FRACTIONS from MLB**; the rows above are **absolute NBA-era entry payouts**. They are
different quantities and **must not be multiplied together without re-deriving the convention.**
✅ **The Single-Tier Non-Arbitrage check (§0.2d.1) has NOT been run on these rows** — it is
arithmetic, not a study, and it is the cheapest next thing this document can do.

#### 0.9b.1 ✅ **PRIZEPICKS' OWN PUBLISHED RULES, captured verbatim in T13 — the AUTHORITY behind the table**
*The rows above are not the researcher's inference; T13 captured the operator's own copy.*
> *"**Power Play** remains **all-or-nothing**, where **every pick has to hit** to cash, with
> **multipliers up to 37.5×**. **Flex Play** offers a cushion: you can still cash smaller payouts if
> **one or two picks miss**, **topping out at 25× on a perfect 6-pick**."*
> *"**Demons** are harder to win, but including them opens the door for **higher payouts — up to
> 2000×**. **Goblins** are easier to win, but they **DECREASE your payout multipliers**."*
> *"**Pick 2–6 players.**"* · ⚠⚠ *"**MULTIPLIERS ARE SUBJECT TO CHANGE.**"*

🔑 **`Flex 6-pick = 25×` completes the table above** *(the Flex rows there stop at 4 picks)*, **and
`Power 6-pick = 37.5×` is now stated by the OPERATOR, not only by the researcher.**
⚠⚠ ***"Multipliers are subject to change" is PrizePicks' own confirmation of §0.9a*** — **the
dynamic-pricing claim is not an inference about the platform, it is the platform's own disclaimer.**
*(The `up to 2000×` demon ceiling is already on file — `NBA_GOBLIN_DEMON.md` §1.0, captured in T8.
**Confirmed, not new.**)*

#### 0.9b.2 ⚠ **AN INDEPENDENT CORROBORATION FROM OUTSIDE THE SWEEP'S SCOPE — recorded, not adopted**
🔴 **Rule 26: `37.5` is 1 of the thirty, and the single hit is `PP_PAYOUT_FINDINGS.md`** — **the
concurrent session's file, which this sweep does not write to and does not treat as its own prior
work** *(standing scope rule)*. **Opened, as rule 26 requires.** It records, from **live payout
mining** rather than from a published page: **`3.0 / 6.0 / 10.0 / 20.0 / 37.5×` for 2–6 picks**,
with 5- and 6-pick moving from *"published but unverified"* to **verified**.
✅ ***Two independent routes — the operator's published table (T13) and mined live payouts (the build
chat) — produce the same five numbers.*** **That is the strongest grounding any figure in this
document has**, and it is stated here as corroboration only; **the build chat's file remains its
own.**

📌 **The same file independently states `Voids (push/DNP) REVERT the slip one size down`** — which
**agrees with T13's settlement rule and with `NBA_COMPASS.md`'s *"PrizePicks reverts the lineup on a
DNP and tiers down on a tie."*** 🔑 ***Three independent sources, one answer*** — and see §0.9i for
why the sweep records this as a CONFIRMATION rather than a discovery.

### 0.9c 🔴 **THE PRODUCT CHANGED UNDERNEATH THE DATA — and the change is STATE-DEPENDENT**
*Authority: the researcher's source review, then **self-corrected two segments later**.*

- **PrizePicks retired against-the-house pick'em in the US on `August 22, 2025`**, replacing it with
  the **peer-to-peer `Pick'em Arena`**.
- ⚠ **The correction**: ***`Pick'em Arena` is STATE-DEPENDENT, not universal.*** The first statement
  was too strong and the researcher narrowed it in place.
- 📌 **The one question research could not settle and the app settles in ten seconds**: ***which
  regime applies in California*** — *the owner's own jurisdiction, and therefore the one that decides
  whether any of this is the right product at all.*
- **PrizePicks' own X account**: *"you can now **pick LESS on select demon & goblin picks**"* —
  ✅ **which is the public announcement behind the four-way rule in `NBA_GOBLIN_DEMON.md` §1.1**, and
  it is the first DATED source for it in this corpus.

🔑 **Why this is first-order**: **an against-the-house multiplier and a peer-to-peer entry fee are not
the same quantity.** If Arena applies, `p × m` (§0.3b) is not even the right test. ~~**NOT RECORDED:
which regime the system's own board scrape is reading.**~~

> ### ✅✅ `[LIVE-AUDIT]` **THE "NOT RECORDED" IS ANSWERED, 2026-09-22 (T20 pass 19, §T20.24) — THE SCRAPE READS NEITHER REGIME. IT READS A PRICE.**
> **`SELECT count(*), count(multiplier), count(price), min(game_date), max(game_date)
> FROM nba_market.board_snapshots WHERE bookmaker='prizepicks'` → 2026-09-22:**
>
> | rows | with `multiplier` | with `price` | span |
> |---|---|---|---|
> | **2,199,354** | 🔴 **0** | ✅ **2,199,354 (100%)** | **2024-10-22 → 2026-04-12** |
>
> 🔑🔑 ***The archived window STRADDLES the 2025-08-22 product change, and nothing in the data marks
> it.*** **The Odds API normalises PrizePicks to American odds, so the board history cannot
> distinguish against-the-house pick'em from `Pick'em Arena` — on either side of the change, for
> either regime, in any state.**
> ⇒ ***The question §0.9c raises is not merely unrecorded: it is UNANSWERABLE FROM THE ARCHIVE.***
> **`p × m` cannot be tested historically because `m` was never stored.** ⚠ **The regime question
> therefore remains an OWNER question about the live app, exactly as §0.9c says — but the corpus can
> now state WHY the data will never settle it, rather than leaving it as an open measurement.**
> ✅ **RULE 22 POSITIVE CONTROL — the column is live, not dead**: `underdog` carries **413,731
> multipliers of 939,719 rows, range `0.600 – 7.890`.** *(`draftkings` 0 of 3,652,647 and
> `betr_us_dfs` 0 of 780,765 — so the multiplier is a DFS-book field that only Underdog's feed
> populates.)*
> 📌 **Found because §T20.23's orphan audit flagged §0.9c as unreachable under all three citation
> grammars. *Nothing had led a pass back to this NOT RECORDED since it was written.***

### 0.9d ⚠ **THE −137 / −119 ANCHORS — RE-SCOPED, because the numbers were already on file**
🔴 **Rule 26 kill, partial — the SEVENTEENTH candidate re-scoped since T11.** `NBA_COMPASS.md`
*(one of the EIGHTEEN, not the twelve)* already states: *"standard legs hit **48.8%** (break-even
**54.3–57.8%** → PrizePicks' edge is **5.5–9 points**)"*. **So both break-even percentages, and a
consequence T13's prose never draws, were on file before this pass.** *`57.8` is **0 of the twelve**
and **2 of the thirty**, pinned 2026-09-22T07:45:06Z.*

**What T13 adds, and only this**:
- **The PRICES behind the percentages**: **−137 → 57.8%** and **−119 → 54.3%**.
- **The PAIRING TO SLIP SIZE**, which COMPASS states as an undifferentiated range:
  **−137 is the 2-pick break-even; −119 is the 5/6-pick Flex break-even.**
- **The attribution**: *"−137 is **PrizePicks' CANONICAL break-even price**"*, and **sharp tools
  price standard legs there.**

> ### ⚠⚠ 0.9d.1 **NARROWED 2026-09-22 (T13 pass 2, §T13.3b) — "NOT A PLACEHOLDER" WAS TOO STRONG, AND THE LIVE CENSUS SAYS WHY**
> **Pass 1 wrote *"not a placeholder or a sentinel."* A later segment of the SAME transcript calls it
> *"the same flat **−137 PLACEHOLDER**"*.** ✅ **The live price census settles it, and BOTH are right
> about different questions** *(`nba_market.board_snapshots`, pinned 2026-09-22T08:01Z)*:
>
> | bookmaker | market | side | rows | **distinct prices** | sentinel rows *(`price ≤ −10000`)* |
> |---|---|---|---|---|---|
> | **prizepicks** | standard | Over | 372,741 | **1** | 0 |
> | **prizepicks** | standard | Under | 372,569 | **1** | 0 |
> | **prizepicks** | alternate | Over | 1,454,044 | **2** | 0 |
> | **prizepicks** | alternate | **Under** | — | ***no rows at all*** | — |
> | **underdog** | standard | Over | 225,640 | **515** | 83 |
> | **underdog** | standard | Under | 224,377 | **167** | 83 |
> | **underdog** | alternate | Over | 244,897 | **826** | 7 |
> | **underdog** | alternate | Under | 242,845 | **341** | 7 |
>
> 🔑🔑 **THE RECONCILIATION**: ***the VALUE is a real market price; the COLUMN carries no
> information.*** **PrizePicks' standard lines hold ONE distinct price across 745,310 rows and its
> alternates hold TWO** *(§0h: `+100` and `−137`)* — **so by the only test that matters for a
> per-leg model, the PrizePicks price column IS a placeholder.** ⚠ **State it that way: `−137` is the
> canonical break-even PRICE and a constant COLUMN, and the two facts do not conflict.**
>
> 🔴 **AND THE SAME CENSUS FALSIFIES A CLAIM THE TRANSCRIPT MAKES ABOUT UNDERDOG.** It states
> *"Underdog alternates do carry real prices, **while standard lines are flat**."* **They are not:
> Underdog standard Over carries 515 distinct prices and standard Under 167.** ⚠ **The flat `−137` /
> `+100` pair appears on Underdog only in the `Yes`/`No` markets** *(984 and 976 rows, 2 distinct
> prices each)* — ***so the "flat Underdog standard" reading was taken off a Yes/No row or a
> PrizePicks row, and the transcript never corrects it.*** **Recorded here because a model that
> assumes Underdog's standard prices are flat throws away 450,017 genuinely priced rows.**
>
> ✅ **A THIRD INDEPENDENT CONFIRMATION that PrizePicks has no `Under` alternate**: the group simply
> does not exist in the price census — *after `board_tiers_v2` (§T12.7c) and the offset join
> (`NBA_GOBLIN_DEMON.md` §0h).* **Three tables, three queries, one answer.**
>
> 🔑🔑 **AND THE SENTINEL IS NOW IDENTIFIED AND COUNTED** — *which the open item asking for it could
> not do*: **`price ≤ −10000`, minimum `−100000`, on 180 Underdog rows (83 + 83 + 7 + 7) and ZERO
> PrizePicks rows.** ✅ ***So "excluding sentinel prices" has a concrete predicate and a population***
> — see `NBA_OPEN_ITEMS.md`, the market-join item.

⚠ **This matters to `NBA_GOBLIN_DEMON.md` §4.** That section reads `price=-137` as the *v1 code's
goblin sentinel*. **It is not a sentinel — it is the standard-leg market price**, which is why v1
could use it as a label at all. **The label is a CONSEQUENCE of the price, not a tag attached to it.**

### 0.9e 🔑🔑 **UNDERDOG IS THE SUBSTITUTE SOURCE — *"Underdog publishes exactly what PrizePicks hides"***
*Authority: **Underdog's own API — i.e. THE OPERATOR**, which is the distinction that answers the
owner's MLB-multiplier warning (T13 seg 848, `NBA_OPEN_ITEMS.md`): these are not our internal
numbers, they are the counterparty's.*

| Measured | Value | *of the twelve* |
|---|---|---|
| **Real tiered rungs** *(external example set)* | **1,401** | **0** |
| **Distinct ladders** *(external example set)* | **385** | **0** |
| ~~Distinct prices, Over~~ | ~~233~~ | **RETRACTED — see §0.9e.1** |
| ~~Distinct prices, Under~~ | ~~211~~ | **RETRACTED — see §0.9e.1** |
| ~~Price range~~ | ~~−2439 to +33xx~~ | **RETRACTED — see §0.9e.1** |

### 🔴🔴 0.9e.1 **CORRECTION — RECORDED 2026-09-22 (T13 pass 2, §T13.3a), SUPERSEDING THE ENTRY ABOVE AS FIRST WRITTEN 2026-09-22 (T13 pass 1)**
⚠⚠ **This entry, written one pass earlier, merged TWO DIFFERENT DATASETS and carried the one the
transcript itself retracts. Rule 27 exactly: a transcript's state on a subject is its LAST word, and
pass 1 recorded its first.** *Both dates are kept per rule 5.*

**THE TRANSCRIPT'S OWN RETRACTION**, at a later offset:
> *"That settles it, and **it corrects something I told you earlier — Underdog has NO LADDERS IN THIS
> ARCHIVE**. **464,053 of 465,618 player-markets have exactly ONE rung; only 1,565 have two or
> three.** … ***My earlier statement that we held "233,000 rows of real NBA tiered pricing" was
> WRONG***: we hold **483,000 rows of real Underdog pricing, but it's ONE RUNG EACH, not tiers.**"*

✅ **RE-TAKEN LIVE AGAINST `nba_market.board_snapshots`, pinned 2026-09-22T08:00Z** *(grouped by
`event_id · snapshot_label · player · market_key · side`, which is the grouping that reproduces the
transcript's shape)*: **937,524 player-market-sides · 936,353 with EXACTLY ONE rung (99.87%) · 889
with two or three · 282 with more · 939,719 rows.**
🔑 ***The population has roughly doubled since the transcript and the conclusion is STARKER, not
weaker*** *(99.66% → 99.87%)*. **Underdog's Odds API archive is one priced rung per player-market-
side. It is not a ladder.**

### ✅ WHAT SURVIVES, STATED AT THE RIGHT STRENGTH
| Dataset | What it is | Status |
|---|---|---|
| **PrizePicks historical tiers** | **the ONLY app with historical tier structure, and it is complete** — *866k graded legs, tiers −3 to +3, both anchor types* | ✅ **held in full** |
| **Underdog Odds API archive** | **483k rows of genuinely priced lines, ONE RUNG EACH** — *"an excellent second opinion on probability, but it can't teach us Underdog's tier economics"* | ✅ **real, and NOT tiers** |
| **Underdog LIVE ladders** | the `alternate_projections` endpoint built into the scraper, ***"which does return full ladders with real multipliers — already running every two hours"*** | ✅ **BUILT, MEASURED AND OWNER-VERIFIED — see §0.9e.4** |
| **The 1,401 rungs / 385 ladders** | an **external example set** used as a *"structural prior"*, **not our data** | ⚠ **and see §0.9e.2 — the arithmetic drawn from it was a UNITS ERROR** |
| **Sleeper** | *"no tiers at all — one line per player-stat, priced by side"* | 🔴 **nothing to map** |

🔑🔑 ***So the sentence pass 1 wrote — "the only per-leg multiplier dataset the project actually has"
— was true of the wrong table.*** **The per-leg tier dataset the project has is PRIZEPICKS' OWN, via
the grader and `board_tiers`** *(`NBA_GOBLIN_DEMON.md` §5.4)*, **and Underdog's contribution is a
priced second opinion on PROBABILITY, not on tier economics.**

### ✅✅ 0.9e.4 **THE UNDERDOG LADDER CAPTURE — BUILT, MEASURED, AND VERIFIED AGAINST THE OWNER'S OWN SCREENSHOT**
*Recorded 2026-09-22 (T13 pass 3, §T13.4f). **The opening prose stratum of the same transcript — the
capture that §0.9e.1's "live ladders" row points at.** This is the ONE Underdog tier dataset that is
real, and it is not the archive.*

**HOW IT WAS FOUND — and the method is the transferable part**: *"their web app hides its logic in
**~80 lazily-loaded code chunks**, so I gave the worker a tool to **grep all of them from the
runtime's chunk map**; **chunk 4113** held the call."* ⚠ **The preceding segments are five failed
guesses at plausible paths**, and the turn that ends them is explicit: *"**let me stop guessing and
read Underdog's own web bundle**."* 🔑 ***Read the bundle, don't guess the path*** — the same method
that solved Fliff.

**THE ENDPOINT**: **`GET /v3/over_unders/{id}/alternate_projections`** *(6 of the twelve carry the
name; the chunk and the method are in **0 of thirty**)*, **returning every rung of the ladder with
BOTH sides' multipliers and prices** — and 🔑🔑 **two probabilities per side that no other app
supplies**: ***Underdog's own fantasy implied probability AND a SPORTSBOOK REFERENCE probability***
*(e.g. higher 2.5: **72% vs 76%**)*. ⚠⚠ ***"That's the pick'em-SHADING signal from the factor lock,
served straight from the source"*** — **the gap between a pick'em price and the book consensus,
which §7 otherwise has to reconstruct, published inside one response.**
📌 **The same hunt surfaced Underdog's own LINE-MOVEMENT series — implied probability every 20
minutes per market — for the C3 factor** *(0 of thirty)*.

**THE MEASURED RUN**: **562 lines flagged `has_alternates` → 2,061 ladder legs, ZERO errors, ~2 extra
minutes per run.**

### ✅ AND THE OWNER CHECKED IT AGAINST HIS OWN SCREEN — *the only external validation of a multiplier in this corpus*
> *"your Underdog screenshot matches what the ladder pull captured **exactly**: **2.5 → 1.31× /
> 2.77× · 3.5 (main) → 1.87× / 1.87× · 4.5 → 2.65× / 1.33× · 5.5 → 5.11×** — **so Underdog is
> confirmed.**"*

🔑🔑 ***A real, complete, two-sided Underdog ladder with real multipliers, verified against the app's
own display.*** **Note the shape**: **the main rung is symmetric (1.87× / 1.87×)** and **the wings
are inverse — as one side's multiplier rises the other falls** *(2.65 / 1.33 at 4.5)*. ⚠ **This is
exactly §0.9f's probability-shift structure, visible in four rungs**, **and it is the strongest
answer available to lesson #16's demand that a multiplier be confirmed against a real quote
(§0.3a2).**
⚠⚠ **Stated at evidence strength**: **this is FOUR RUNGS of ONE market on ONE day, owner-verified.**
**It licenses the METHOD and the STRUCTURE; it is not a calibration.** *(And it is Underdog, not
PrizePicks — §0.9a's conclusion is untouched.)*

### 📌 0.9e.5 **WHERE EVERY APP'S LADDER LIVES — the capture status table, as T13 left it**
| app | ladder / variation object | status |
|---|---|---|
| **PrizePicks** | standard / goblin / demon rungs **in the feed** | ✅ captured |
| **Underdog** | **`alternate_projections`** rungs + fantasy & sportsbook probabilities | ✅ captured *(new in T13)* |
| **Fliff** | **alternate lines as SEPARATE PROPOSALS per market** | ✅ captured |
| **Betr** | **NINE tiers** *(regular · mini/boosted/super-boosted/boosted-4 · edge 1–4)* | ✅ captured — *see `NBA_SYSTEM_ARCHITECTURE.md` §0f-1* |
| 🔴 **Sleeper** | ⚠ **main line captured; alt stats EXIST and are NOT** | ⏳ **open** |

🔴 **SLEEPER IS THE ONE GAP, AND IT IS WELL-CHARACTERISED.** **The first conclusion was that Sleeper
has no ladder at all** — *"its GraphQL schema introspection is open and **has no alternate-line query
at all**… **Sleeper prices the ladder into the per-side multipliers on that single line**"* — ⚠ **and
the owner's screenshot overturned it**: *"**Sleeper clearly DOES have alt stats — 3+ 1.23×, 5+ 2.63×,
6+ 4.19×** — mine were in a different object than I looked."*
🔑 **The diagnosis**: *"the alt stats '3+ K', '5+ K' are **a DIFFERENT MARKET SHAPE — not
`over_under`**"*, **the public feed carries only `"normal"` lines**, **`line_type` is the alt marker
and the app must request them**, **REST parameters are ignored**, and **the GraphQL schema has no alt
query.** ⚠⚠ ***So Sleeper's alternates are reachable only by capture, and the transcript says so
plainly***: *"**guessing paths is the wrong tool here — the same lesson as Underdog. One capture from
your phone settles it.**" ***This is the second time in one transcript that path-guessing failed and
bundle-reading or capture succeeded.***

### ✅✅ 0.9e.6 **THE FANTASY-SCORE FORMULA, SETTLED FOR BOTH APPS — and it was a live MLB bug class**
*Recorded 2026-09-22 (T14 pass 1, §T14.2d). **The owner raised it twice and demanded multiple
sources.** `fantasy ×1.2` is **0 of the TWELVE** *(2 of the thirty)*, pinned 2026-09-22T08:53:42Z.*

**WHY IT WAS ASKED — a recorded failure, not a hypothetical**:
> *"We have **fantasy score**, and I think that Underdog also have fantasy score. **For MLB, the
> fantasy score was DIFFERENT to both apps.** So be sure that you have **the proper logic for BOTH
> apps**. And ***for a long time, we ran a BROKEN LOGIC*** — **it was not the correct points that was
> going for fantasy score.** So be sure: **research online, find reliable sources, MULTIPLE**, and be
> sure that we have both correct. ***They might be the same, but they might not.***"*

| app | formula | source |
|---|---|---|
| **Underdog NBA** | **points ×1 + rebounds ×1.2 + assists ×1.5 + steals ×3 + blocks ×3 − turnovers ×1** | **their official help centre, dated 2026-05-31** |
| **PrizePicks NBA** | ***the same formula*** | *"confirmed against their playbook's calculator partners **and the NBA's official fantasy standard**"* |

✅ ***Both identical for NBA, and both match what the recipe already computes.***
⚠ **TWO CAVEATS STATED AT THE TIME AND KEPT**: **PrizePicks' own chart *"didn't render as text"***, so
that confirmation is indirect — *"**I'll verify it against ONE LIVE GRADED LEG in week one**"*,
***an open verification item, not a closed one***; **and the DraftKings table was flagged as *"the
trap to avoid"***, a different scoring standard that looks like the same thing.
🔑🔑 **The transferable point is the owner's, not the formula**: ***a per-app scoring formula is a
place where a system can run wrong for a long time with NO ERROR***, **because every leg grades
cleanly against the wrong number. MLB did exactly that.**

### 🔴🔴 0.9e.2 **THE UNITS ERROR — `higher_multiplier` IS A MODIFIER, NOT A PAYOUT, AND THE CONCLUSION REVERSED**
**The researcher caught this himself, on the owner's correction, and re-derived it:**
> *"my tier analysis used **`higher_multiplier` from alternate projections AS IF IT WERE THE PAYOUT**.
> If those fields are modifiers rather than payouts, my 'demon T1 retains 0.74' conclusion is wrong."*
> *"Your correction was decisive — my earlier table was wrong, and **the conclusion REVERSES**."*

**The corrected value-retained table** *(true payout = decimal(american) × 0.963)*:

| Tier | modifier field | decimal | American | true payout | implied prob | **value kept** |
|---|---|---|---|---|---|---|
| **−1 goblin T1** | 0.70 | 1.36 | — | 1.31 | 71.5% | **0.932** |
| **0 anchor** | 1.19 | 2.31 | — | 2.22 | 46.0% | **0.933** |
| **+1 demon T1** | 3.21 | 5.82 | — | 5.60 | 23.6% | **0.910** |
| **+2** | 3.91 | 7.07 | — | 6.81 | 17.1% | **0.896** |
| **+3** | 4.51 | 8.12 | — | 7.82 | 13.6% | **0.883** |
| **+4** | 6.76 | 11.88 | — | 11.44 | 8.6% | **0.847** |

🔑 **THREE THINGS CHANGED, in the researcher's own words**:
1. ***"The hold is 7–15%, not 26–54%."*** — *"my earlier numbers implied Underdog keeps a quarter to
   half of every leg, **which should have struck me as implausible for a DFS operator — that was the
   tell I missed**."* ⚠ **That is `NBA_MULTIPLIERS.md` §0.3b's house-edge sanity test catching a
   real error, and it is the second instance on file.**
2. ***"The RANKING FLIPS."*** — *"I told you demon T1 was the best-priced rung on the board (0.74 vs
   0.55 anchor). **It isn't.** The anchor and goblin T1 are the best-priced (0.933, 0.932), and value
   **decays monotonically the deeper you go into demons** — down to 0.847 at T+4. **So on Underdog,
   deep demons are where the house edge concentrates, exactly the opposite of what I reported.**"*
3. ***"The cause was a UNITS ERROR"*** — the modifier was multiplied against a probability as though
   it were a payout.

✅ **AND WHAT SURVIVED THE REVERSAL IS THE PART THIS DOCUMENT DEPENDS ON**: *"**the structural rule I
drew from it — price by PROBABILITY SHIFT, not tier label — STILL HOLDS**, because that conclusion
came from the **per-stat comparison** and is unaffected."* ***§0.9f is therefore load-bearing and
independently grounded, not a casualty of this correction.***

### ✅ 0.9e.3 **THE FIX THAT WAS INSTALLED — the trap is now LABELLED, and the arithmetic is in config**
**Three code changes followed, and they are in 0 of the twelve**:
1. **Ladder de-dupe** on `(player, stat, line, is_main)`, keeping the freshest row by `updated_at`,
   **with the dropped count reported in the run metadata** — *80 genuine extra rows on 1,363 distinct
   keys, "the same rung harvested twice by different passes."*
2. 🔑🔑 **DERIVED PAYOUT FIELDS**: **`higher_payout` / `lower_payout` = `decimal(american) × 0.963`**,
   and **the raw fields RENAMED to `higher_multiplier_modifier_only` / `lower_multiplier_modifier_only`
   *"so the trap is LABELLED rather than inviting."*** ⚠ **A naming decision made specifically to
   stop a repeat — record it as such, not as a schema detail.**
3. **The verified conversion rules recorded in config**, *"so the NBA side uses the same arithmetic
   the MLB side has already validated against real placed slips"*:
   **PrizePicks / Underdog → `decimal × 0.963`** · **Sleeper → `1 + (decimal − 1) × 0.95`** ·
   **slip = the PRODUCT of legs.**
⚠ **`0.963` and `0.95` are in 0 of the twelve** *(pinned 2026-09-22T07:59:35Z)*, **and §6's
conversion section does not carry them.**

✅ **And §0.2e's prior still stands over all of it**: Underdog prices *dynamically and efficiently*,
**so it is simultaneously the best available second opinion and the platform where a better `p`
alone earns nothing.** Both remain true at once.

### 0.9f 🔑🔑 **THE RULE THAT FALLS OUT — model `m` on the PROBABILITY SHIFT, never on the TIER LABEL**
> *"model the multiplier as a function of the **PROBABILITY SHIFT**, **conditioned on stat and line
> magnitude** — ***never on the tier label***."*

✅ **This CONFIRMS the owner's own correction in §3** *(*"the factor is NOT one number per tier — it
varies by rung, side, prop, player form and team form"*)* **and turns it into a model specification.**
*`probability shift` is **0 of the twelve** and **1 of the thirty**, pinned 2026-09-22T07:45:06Z.*

**The per-stat evidence behind it** *(PRA, from the Underdog ladders)*: **average line 26.2** ·
**0.85 goblins per ladder** · **1.20 demons per ladder** · **goblin offset −3.56** ·
**demon offset +6.28**. ⚠ **The asymmetry is the point**: **demons sit nearly twice as far from the
anchor as goblins do**, and **a label-based model cannot express that at all.**
🔑 ***This is the measured form of the owner's "ladder depth is PROP-DEPENDENT" directive*** *(T13
seg 661, `NBA_OPEN_ITEMS.md`, 0 of thirty)* — **and it is one prop. The other props are NOT RECORDED.**

### 0.9g 🔴 **WHAT GEMINI PRODUCED — and why it was DISCARDED**
*The owner directed Gemini's use explicitly. **The result was thrown away, and the reason is a
reusable test.***

**The reliability test applied: CONSISTENCY ACROSS FRAMINGS.** The same scenarios were put to Gemini
more than once, and **the same scenario produced DIFFERENT numbers**:

| Scenario | First answer | Second answer |
|---|---|---|
| **2-pick + 1 demon** | **4×** | **3.6×** |
| **3-pick + 1 demon** | **6.5×** | **6×** |

> **Verdict**: the examples were **DISCARDED**, and the researcher recorded the negative result
> explicitly ***"so nobody re-runs this experiment later."***

✅ **Recorded here for exactly that reason.** 🔑 **And the test generalizes**: *an LLM-supplied
numeric constant is admissible only if it is STABLE ACROSS RE-ASKING* — **which is a free check, and
the cheapest one in this document.** ⚠ **`Gemini` is in 9 of the twelve as a review/adversarial tool;
this is the first record of it being used as a SOURCE OF NUMBERS and failing.**

### 0.9h 🔴 **THE LIMIT THE OWNER SET — the honest ceiling on all of the above**
> *"**we're never gonna be able to get exactly the way the PrizePicks multiplier works**, so we are
> doing our best work possible… **they do change, they do switch**."*

⚠⚠ **This is the owner's own confidence tier on the entire multiplier programme, and it is in 0 of
the thirty.** **It licenses §4b's observational study and FORBIDS any claim of a solved formula.**
**Read it before §5's EV arithmetic**, which is stated against *observed* factors precisely because
no derived ones exist.

### 0.9i 🔴 **THE SLIP-COMPOSITION RULES — RE-SCOPED, and the owner RANKS them below the tiering**
**THE OWNER'S OWN TURN, verbatim** *(T13; "chains" is the transcription as recorded)*:
> *"Yeah. **Those are rules, and the rules are very important as well.** Um, **same player, same
> game**. All of those are very important. And **DNP, TIE** — because sometimes **the line is not
> point five. It's a FLAT LINE, like twenty-one or ten, and that can be a TIE. And that chains
> multipliers.** … **all of those are EASIER TO LEARN. But what we need to get as SHARP AS POSSIBLE
> is the tiering with the goblins and demons.**"*

🔑🔑 ***This is a PRIORITY RULING, and it explains the shape of the whole transcript***: the
composition rules are *"easier to learn"* and were deliberately deferred; **the tiering is where the
effort was spent.** ⚠ **It also means the composition rules were never researched to the standard
the tier work was held to** — *so their absence from this corpus is a CHOICE, not an oversight, and
they remain owed.*

**⚠ 🔴 RULE 26 KILL — the settlement rule was already on file, and stated MORE COMPLETELY:**
`NBA_COMPASS.md` *(one of the EIGHTEEN)* carries: *"**Leg truth and operator settlement are
separate** — **PrizePicks REVERTS the lineup on a DNP and TIERS DOWN on a tie, Underdog VOIDS the
leg**; the slip engine applies the operator rule."* ***So the "third position" this pass set out to
record was already written, with the tie rule attached, which T13's own prose does not supply.***
**The candidate is killed as a discovery** *(the eighteenth since T11)* **and survives only as
corroboration** *(§0.9b.2: three independent sources agree).*

✅ **AND WHAT THE KILL EXPOSES, which is the real finding**: ***`tiers down` is 0 of the TWELVE***
*(pinned 2026-09-22T07:45:06Z)*. **PrizePicks' tie rule lives only in the eighteen.** **A flat line
— 21 points, 10 rebounds — can land exactly on the number**, and the operator's response is to
**tier the slip down**, which **changes the payout without any leg "losing."**
⚠⚠ **`grade_board_outcomes.py` correctly stores `push` and refuses to resolve it** *(§T12.6d: baking
either operator's rule into `leg_result` would spoil the data for the other)* — **so the tier-down
rule has NO implementation anywhere, and the slip engine is where it must live.** **NOT RECORDED:
whether it does.**

### 0.9j 🔑🔑 **WHAT WAS ACTUALLY LOST IS A LABEL, NOT THE INFORMATION — the reconstructability finding**
> *"Underdog's historical American prices **ARE REAL** for the alternate/boosted lines, **not
> placeholders**. That's the same information the multiplier encodes: ***a multiplier and a decimal
> price are TWO VIEWS OF ONE NUMBER.*** For their standard 'balanced' legs, **payout is fixed by
> slip size anyway.**"*
> *"So the payout structure is **RECONSTRUCTABLE FOR BOTH APPS**: **PrizePicks from its published
> payout tables · Underdog standard from slip-size tables · Underdog boosted/alternate from the
> prices we did store.** ***What we genuinely lost is Underdog's own multiplier LABEL — a
> convenience, not the information.***"*

⚠⚠ **This materially changes the posture of §1 and §2.** Those sections are written as an
availability audit that ends in *ruled out*. **The reconstruction argument says the audit's negative
result is about a CONVENIENCE FIELD**, and that **for Underdog the priced quantity is already in the
warehouse** *(§0.9e: 1,401 rungs, 233 distinct Over prices)*.
🔑 **It does NOT rescue PrizePicks.** *"PrizePicks from its published payout tables"* recovers the
**slip-shape** term only — **§0.9a's per-leg, submission-time, boost-compounded factor is exactly
what no table reconstructs**, which is why §0.9a remains the arc's conclusion.

📌 **AND THE SELF-CRITICISM ATTACHED TO IT, worth keeping**: *"**What I should have done: checked the
stored column after the first date**"* — ⚠ **a first-row schema check, before a long ingest, would
have caught the dropped label.** **This is a general ingest discipline and it is in 0 of the
thirty.**

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

**One logged-in session answers four separate questions.** Since **the payout displays before
placing** (#16), none of it requires a stake:
| # | Question | Method |
|---|---|---|
| 1 | **Is the measurement method sound?** | **a control slip of standard-priced legs only** (§4b.1) |
| 2 | **What is the per-leg factor?** | add legs one at a time, clearing the network log between (§4) |
| 3 | **What is the tier step ratio?** | compare factors across tier distance — needs only tier index + factor, not a full capture |
| 4 | **How large is the same-game discount?** | **same-game vs cross-game slips with identical legs** (§0.2f) |

**Beyond the mechanics in §4, four lessons constrain how any capture must be run:**

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

## 5b. ⚠ THE CONVERSION IS A CORRECTION — so blueprint §7f applies to it
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` §7f. Recorded 2026-09-20 (T1 pass 29).*

**§7f is about a calibration FIT, but its failure shape is the one this document keeps hitting.**
MLB's fit *"passed honest, held-out, out-of-sample validation… and was still structurally wrong — the
fit had been computed **without distinguishing between two sides of a market (over/under)**, and ended
up **dominated by one side's pattern, silently misapplied to the other**. The aggregate improvement
metric did not catch this, because **it was averaged across both sides.**"*

**Why it lands here specifically.** The owner's own correction at **§3** already states the multiplier
*"is **NOT one number per tier** — it varies by **rung, side, prop, player form and team form**."*
**§7f is the same statement arriving from the calibration side**, with a documented case of what
happens when the dimension is collapsed anyway. Together they say: **a payout-conversion rule
validated on a pooled average across `side` or across rungs can beat its baseline on aggregate error
and still be wrong for one whole population.**

**Where the exposure is concrete in this document:**
- **`board_payout_conversion_rules`** (§6) converts payouts to probabilities. **Whether its
  parameters are held per (`prop`, `side`, `rung`) or pooled is NOT RECORDED** here.
- **`equal_scale_v1`** (§8) decomposes slip payouts **by an explicitly equal split across legs** —
  **a pooled assumption by construction**, across **139 legs**. §7f's rule does not say the assumption
  is wrong; it says **an aggregate check cannot clear it**, and 139 legs cannot support a per-subgroup
  check either.
- **§0.3a's "costliest single error" — pairing an aggregate hit rate with a multiplier from a
  different cell — is §7f's failure with the two halves swapped.** One collapses the rate, the other
  collapses the fit. **Both are cured by the same discipline: check every subgroup the number will be
  applied to.**

**Nothing here is newly measured.** This is a cross-reference recorded so the multiplier work inherits
the standard. Primary record: `NBA_BASELINE_CALIBRATION.md` §5.6.

---

## 6. CONVERSION LOGIC — payouts to probabilities

**`nba_config.classification_config` key: `board_payout_conversion_rules`.**

> ## 🔑🔑 **6.0 THE KEY'S ACTUAL CONTENTS — READ LIVE 2026-09-22 (T13 pass 4, §T13.5e)**
> ⚠⚠ **This section has NAMED that key since it was written and carried NONE of what is in it.**
> **Read with `SELECT` only; nothing changed** *(rule 1)*. ***And it is a stronger authority than any
> transcript prose in this document, because of its `source` field.***
>
> ### ✅✅ `source` — **the strongest provenance any multiplier figure in this corpus has**
> > ***"owner MLB chat, verified against app screenshots + 19 PLACED SLIPS (2026-09-10)."***
>
> 🔑🔑 ***Nineteen REAL PLACED SLIPS.*** **That is precisely what lesson #16 demands** *(§0.3a2:
> "get that number from a real, current slip-builder quote — **the FINAL, DECISIVE step**")*, **and
> §4b's capture protocol treats it as still outstanding.** ⚠ **It is outstanding for PRIZEPICKS
> per-leg factors; it is NOT outstanding for the CONVERSION arithmetic, which has been confirmed
> against real placed slips already.** **The two must not be conflated again.**
>
> ### ✅ THE RULES, verbatim
> | app | rule | verified |
> |---|---|---|
> | **Sleeper** | **`payout_multiplier = 1 + (decimal − 1) × 0.95`** | ***"exact"*** |
> | **Underdog** | **`payout_multiplier = decimal(American price) × 0.963`** | **worked on three real legs** *(below)* |
> | **slip** | **`slip multiplier = PRODUCT of leg multipliers`** | ⚠ **see the haircut** |
>
> **The Underdog verification, as stored**: *"Feltner ER 2.5 under **+114 → 2.14 dec → app 2.06
> (0.963)**; Hagen Smith ER 0.5 over **+138 → 2.38 → app 2.31 (0.971)**; **under −189 → 1.53 → app
> 1.44 (0.942)**; **mean 0.96**; ***matches 0.963 fitted independently from 19 placed slips***."*
> 🔑 **Three legs spanning +138 to −189, a 0.942–0.971 spread around 0.963, and an independent fit
> agreeing** — *the constant is measured, not assumed.*
>
> ### 🔴🔴 **THE SLIP-LEVEL HAIRCUT — which this sweep recorded the product rule WITHOUT**
> > ***"observed 2–8% slip-level haircut vs the plain product; MODEL AS THE PLAIN PRODUCT
> > (conservative)."***
>
> ⚠⚠ **§T13.3c recorded *"slip = the PRODUCT of legs"* and omitted this.** ***The product is not
> exact — it is a deliberately CONSERVATIVE approximation of something 2–8% lower***, **and a
> 2–8% error at slip level is the same order as the edges this whole document hunts.** **Corrected
> here.**
>
> ### 🔑🔑 **`DO_NOT_USE` — the units-error trap is encoded as a FIELD, not just a comment**
> > ***"`higher_multiplier` / `lower_multiplier` from `alternate_projections` are MODIFIERS, not
> > payouts — using them as payouts produces a units error."***
>
> ✅ **That is stronger than the column rename §0.9e.3 records: the prohibition is machine-readable
> and lives beside the rule it protects.**
>
> ### ✅ `correction_2026_09_10` — **the reversal, stored in the system, with the per-stat evidence**
> > *"my earlier NBA-chat analysis used UD modifier fields as payouts and reported **demon T1 as the
> > best-priced rung (0.74 kept vs 0.55 anchor)**. **RECOMPUTED with the verified rule**: value kept
> > is **anchor 0.933 · goblin T1 0.932 · demon T1 0.910 · T+2 0.896 · T+3 0.883 · T+4 0.847** →
> > **UD hold is 7–15% and DECAYS with demon depth; deep demons are the WORST value, not the best.**
> > **The per-stat finding — *tier +1 is 1.18× at 43% on strikeouts vs 6.07× at 12% on batter walks
> > → price by probability shift, never by tier label* — is UNAFFECTED and still holds.**"*
>
> ✅ **Every figure matches §0.9e.2 exactly, and the system states the survival of §0.9f itself** —
> *so the probability-shift rule is carried by the CONFIG, not only by this sweep's reading of the
> prose.* 📌 **And the two per-stat numbers are MLB** *(strikeouts, batter walks)* — ⚠ **which
> §0.5's transfer rule governs: the MECHANIC transfers, the NUMBERS do not.**
>
> ### 🔴 `data_hygiene_todo` — **two OPEN items sitting in live config, in 0 of the twelve**
> 1. *"**ladder rows: de-dupe on `(player, prop, line)` keeping the freshest row** — multiple harvest
>    passes create duplicates at different prices; **a selector could otherwise pick the same leg
>    twice**."*
> 2. *"**derive the ladder payout from the American price rather than storing modifier fields under
>    payout-like names**."*
> ⚠ **§0.9e.3 records both as DONE from the transcript's description. The config still lists them as
> TODO.** ***Whether the config was simply never updated, or the work is genuinely outstanding, is
> NOT RECORDED*** — **and rule 31 says the code decides, which this pass did not check.**
> **Documented, not acted on.**

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
> 🔴 **`[LIVE-AUDIT]` 2026-09-21 (§T10.24b): this table is NOT in the database**, and it is not on
> `NBA_DATABASE.md`'s DROPPED-2026-09-19 list either. **Why is NOT RECORDED** — dropped by a session
> this sweep has not reached, or never created. *The point the 139 legs are cited to make — that
> **there is no usable NBA slip history** — is unaffected, and in fact stronger.* **Sibling of the
> `NBA_DATABASE.md` site flagged at §T10.22b; found because pass 22 flagged one of two.**

**`equal_scale_v1`** is the decomposition assumption: a slip's observed total payout is attributed
across its legs **by equal scaling**. **That is an assumption, not a measurement** — and it is exactly
the assumption the owner's correction (§3) warns against generalising, since the true factor varies by
rung, side, prop and form.

**MLB precedent**: `score.real_slip_leg_observations` and `control.user_placed_slips_log` — the same
capture pattern exists on the MLB side.

---

## 8b. ⚠ THE REQUIRED REPORT LAYOUT — and the normalization rule behind it
*Source: T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` **§7**. **Recorded 2026-09-20 (T1 pass 31) —
§7 was entirely undocumented.** Stated as **"the exact day-by-day table layout they expect for any
backtest or real-slip report — reuse directly for NBA."***

```
|Date     |Slips |Full hits|5/6  |≤4/6 |Staked |Return     |Profit      |ROI        |
|---------|------|---------|-----|-----|-------|-----------|------------|-----------|
|08-12    |5     |3        |2    |0    |$5     |$7.27      |+$2.27      |+45.4%     |
|**TOTAL**|**83**|**75**   |**8**|**0**|**$83**|**$183.20**|**+$100.20**|**+120.8%**|
```

**Three properties are specified, each for a reason:**
| Property | Stated reason |
|---|---|
| **One dollar per slip** | the reporting convention — it makes ROI directly readable off the staked column |
| **The TOTAL row bolded** | the owner is *"scanning on a phone screen"* |
| **Partial-hit columns (`5/6`, `≤4/6`) included explicitly** | *"so the actual failure mode — **how close a miss came to hitting** — stays visible rather than being collapsed into a single win/loss count"* |

**⚠ The partial-hit columns are not presentation — they are this document's subject.** `5/6` and
`≤4/6` **are the Flex partial tiers**. A report in this layout **is** the empirical distribution that
§0.2's tier table has to be priced against, and **the shape lesson #27 warns differs by platform**
(§0.2h) is exactly what those two columns measure. **A win/loss-only report cannot validate a Flex EV
model at all.**

### The normalization rule — stated as a real, confirmed push-back
> *"**ROI is the real target, not total profit** — **profit can be increased simply by wagering more,
> ROI cannot. Always normalize by CAPITAL DEPLOYED, not by slip or leg count.**"*

and the case that produced it:
> *"a **real, confirmed case**: comparing profit at a fixed dollar-per-slip rate when **capital
> deployed, not slip count, was the actual real-world constraint**. **Always identify what's genuinely
> fixed in the real scenario before choosing what to normalize by.**"*

**⚠ Note the tension, and it is deliberate**: the layout uses **$1/slip** as a *reporting* convention,
while the *decision* rule normalizes by **capital deployed**. **They are not the same thing** — the
convention makes the table readable; the rule governs what any comparison between strategies is
divided by. **Confusing the two is precisely the error the push-back names.**

### And the risk posture that governs what gets presented
> *"Will accept **a smaller real sample size in exchange for a materially higher ROI**, provided the
> underlying mechanism is sound — **the job is to present the real number and its real risk honestly,
> then let them choose, NOT to pre-filter options** based on an assumption about what they'd want."*

**Directly binding on this document.** The goblin/demon economics (`NBA_GOBLIN_DEMON.md` §5) and the
139-leg `equal_scale_v1` sample (§8) are both thin. **The rule is not "suppress thin results" — it is
"report the number and its real risk, and do not decide for the owner."** Pairs with **#26** (state
the confidence tier) and **#19** (language no stronger than the evidence).

**Status**: ⚠ **this layout has never been produced for NBA.** There is no NBA slip history to fill
it — ~~`nba_score.real_slip_leg_observations` holds **139 legs**~~, not dated slips. Recorded in
`NBA_OPEN_ITEMS.md`.
> 🔴 **`[LIVE-AUDIT]` FLAG PROPAGATED HERE 2026-09-22 (§T20.54) — THIS IS THE THIRD SITE.**
> **`nba_score.real_slip_leg_observations` is NOT in the database** *(re-verified live 2026-09-22
> against `pg_class`; first established §T10.22b, flagged at §8 of this document per §T10.24b)*.
> ⚠ **§T10.24b declared the correction complete — *"Now flagged in both"* — having named two sites.
> There were three, and this was the one in a `Status` block.** 🔑 **The point the 139 legs are cited
> to make — that there is NO usable NBA slip history — is unaffected and in fact stronger.**
> 📌 *Rule 40: "a correction is not a correction until it reaches every document that asserts the old
> figure" — and, as this shows, every PASSAGE of every document.*

---

## 8c. STANDING UI RULES THAT BIND THE MULTIPLIER SURFACE
*Same source, same pass.*

1. **Every deployed strategy needs a real backup-leg substitution system** for when a recommended leg
   becomes unavailable.
2. **Slip-leg checkboxes default to CHECKED.**
3. ⚠ **A real multiplier value the person has manually entered must NEVER be lost or reset on a UI
   re-render.**

**Rule 3 belongs to this document specifically.** §2 records that **PrizePicks multipliers cannot be
obtained programmatically** — *"ruled out exhaustively, four independent lines of evidence, all
negative"* — so **every PrizePicks multiplier in the system is a value a human typed in.** A
re-render that drops one destroys data that **cost a logged-in browser session to obtain** and that
**no API can re-fetch.** **The capture protocol in §4b produces exactly these hand-entered values.**

**Status**: the certification-center UI is inherited from MLB and recorded as *"nothing to build."*
**Whether it satisfies rules 1–3 for NBA legs is NOT RECORDED.**

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