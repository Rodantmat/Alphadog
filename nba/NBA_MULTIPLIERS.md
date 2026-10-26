# NBA MULTIPLIERS

**Scope.** Everything about payout multipliers across every app: what each app exposes, what has been
proven unavailable and how, the formulas and conversion logic, the tests run, slip examples, and what
the calibration of a multiplier would require.

**The headline.** 🟢 **PrizePicks per-leg multipliers ARE obtainable** — `POST
https://api.prizepicks.com/game_types` returns a payout quote for a specific leg combination
*(`§0.9-T22`)*. **The pricing law is known**: multiplicative, partner-independent, compressed above
`9.1×` *(`§0.10-T22`)*, **house edge a flat `25%` on both slip types** *(`§0.12-T22`)*.

**Per-app coverage, live `2026-09-23`:** **Sleeper `100%`** · **`pick6` `94.89%`** · **Underdog
`44.03%`** · 🔴 **Fliff `0.00%`** *(`0` of `1,394`)* · 🔴 **Betr `0.00%`** *(`0` of `780,765`)*.
*(`§0.9-T22` §4. **Re-derive before quoting** — these move.)*

---

> # 📑 **INDEX — `NBA_MULTIPLIERS.md`**
> **Payout multipliers across every app** — what each exposes, the pricing law, the conversion logic,
> the tests run, and what calibrating a multiplier would require.
> 📏 **`176` sections · re-derived `2026-10-26` (T50 intake, RUN, `+11` = `§T50.3` and its 10 sub-headings)** · ~~`165` (T49 transcript batch)~~ · ~~`164` (T49 intake, `+1` = `§T49.3`)~~ · ~~`163` (`+1` = `§T48.3`, PrizePicks Flex closed by its quote engine; Sleeper settled)~~ · ~~`162` (`+1` = `§T47.3`, pricing laws; `m*`; the PrizePicks table question reopened)~~ · ~~`161` (`+1` = `§T44.3`, break-evens; a stale table back in §31v; `m_eff`)~~ · ~~`160` (`+1` = `§T43.3`, flat vs priced boards)~~ · ~~`159` (`+1` = `§T41.3`)~~ · ~~`158` (`+1` = `§T40.3`, tie value; break-even −9.16)~~ · ~~`157` (`+1` = `§T39.3`, UD payouts at source; thinning; PP tie rule)~~ · ~~`156` (`+1` = `§T38.3`, PP payouts verified at source; portfolio break-even)~~ · ~~`155` (`+1` = `§T37.3`, Underdog repriced to today's logic, balanced)~~ · ~~`154` (`+1` = `§T36.3`, the Underdog formula; `× 0.963` superseded)~~ · ~~`153` (`+1` = `§T34.3`, PP publishes no multipliers; per-line price; live Ways-to-Pick table; haircut → compression)~~ · ~~`152` (`+1` = `§T33.3`, Underdog's official table and the `0.963` scope)~~ · ~~`151` (`+1` = `§T32.3`, no duplicates)~~ · ~~**`150` sections · `2026-09-23`.**~~ 🆕 **`§T32.3` (end of file) — slip-level multiplier economics from the slip program's first night: break-evens by size and type, the Flex/Power crossover, Kelly by size, voids, goblins.** *Re-derive, never quote:* `` grep -cE '^(> *)*#{1,6} ' nba/NBA_MULTIPLIERS.md ``
>
> 🆕🔴🔴 **`2026-09-25` — NO SECTION WAS ADDED HERE, BUT THREE FINDINGS ELSEWHERE CHANGE WHAT THIS FILE RESTS ON. READ THEM FIRST.**
> | finding | why it matters to multipliers |
> |---|---|
> | 🔴🔴🔴 **`§T26.35`①** *(`NBA_WORKERS.md`)* | **P3's "board tiers" step ran a one-off index job and NEVER BUILT TIERS** *(= `T20-7`, now CLOSED)*. ⇒ ***the goblin/standard/demon classification this file's pricing law depends on was not being produced for the decision-moment board at all.*** 🔴 **Residual → `T26-1`: `BT2_APPS` is PrizePicks-ONLY, so no other app's board is classified** |
> | 🔴🔴 **`T16-2`** *(`NBA_OPEN_ITEMS.md`)* | **`18` of `30` props have NO tier rows** — *`board_tiers` covers only `12` markets because **PrizePicks offers goblin/demon tiers on those alone***. 🔑 *They need a SECOND path keyed on the standard board line, with no tier dimension* |
> | 🔴🔴🔴 **`§T25.3`** *(`NBA_BASELINE_CALIBRATION.md`)* | ***`34.72%` of `nba_market.prop_universe` is our own RECONSTRUCTED lines*** *(`8` props, `578,832` legs, ~`92%` graded)* — **and they are essentially `T16-2`'s no-tier list.** ⇒ ***a third of the priced universe has no tier classification and no real posted line*** ▶ **the first REAL lines for those props arrive at preseason `2026-10-03`, and that validation does not recur** |
>
> ⚠ **SCOPE, UNCHANGED**: *PrizePicks payout construction — goblin/demon floors, alternate-line spacing, void reversion, the slip simulator — belongs to **`nba/PP_PAYOUT_FINDINGS.md`** and the PrizePicks database objects, which are outside these twelve by standing constraint.* 🔑 **What is recorded here is the multiplier LOGIC and what the sweep can verify of it.**
>
> ⚠ **ANCHORS ARE HEADING TEXT, NEVER LINE NUMBERS.** 🔁 **To resolve a `§` pointer:** `` grep -rn "§T9.40b" nba/*.md `` *(all `32` files — the twelve are not closed under their own citations).*
> **Search the file for the quoted `§` label.**
> 📚 *Sweep method, census history, detector versions and retractions: **`NBA_SWEEP_RUN_LOG.md`**.*
> ⚠⚠ **THE FILE'S PHYSICAL ORDER IS NOT ITS LOGICAL ORDER** — *`§0.2d` sits before `§0.2c`, and every
> `T22`/`T23` section is appended at the end.* **This index is in LOGICAL order. The file is not.**
>
> ## ▶ FIND IT FAST — *by the question you arrived with*
>
> | if you need… | go to |
> |---|---|
> | 🟢 **the live payout endpoint**, its request body and response shape | **`§0.9-T22` §2** |
> | 🔑 **the pricing law** — multiplicative · partner-independent · the `9.1×` longshot cap | **`§0.10-T22` §§1–2** |
> | ✅ **proof the law holds** — out-of-sample on pairs never quoted together | **`§0.10-T22` §3** |
> | 🔑 **the house edge** *(flat `25%`, identical Power and Flex)* | **`§0.12-T22` §2** |
> | 🔑 **the per-leg price model** and its fitted constants `c` | **`§0.13-T22` §1** · ⚠ two constant sets, see `§0.15-T23` §4 |
> | 🔑 **why the price key is built from raw facts, not model parameters** | **`§0.13-T22` §2** |
> | ✅ **which apps actually expose a multiplier** *(measured, not assumed)* | **`§0.9-T22` §4** |
> | 🔑 **WNBA constants, and which families transfer to NBA** | **`§0.15-T23`** |
> | 🟢 **constants for `fantasy_score` / `fg_attempted` / `3pt_attempted`** *(NBA prices none of them)* | **`§0.15-T23` §1** |
> | ⚠ **the fantasy-score `+2` vs `+3` scale question** | **`§9. OPEN ITEMS` item 5** |
> | 🔴 **why three earlier scraping probes failed** *(TLS/UA mismatch, DataDome)* | **`§0.9-T22` §3** · **`§0.11-T22` ①** |
> | ⚠ **the same-game discount** — direction vs magnitude | **`§0.2f`** |
> | 🔑 **the house-edge sanity test** *(the named guard against a bad number)* | **`§0.3`** · **`§0.3a`** |
> | ⚠ **Flex vs Power — the probability structure** | **`§0.2d`** · **`§0.2d.1`** · **`§0.2d.2`** |
> | 🔴 **what is still open** | **`§9. OPEN ITEMS`** |
>
> ## 📋 EVERY SECTION, IN LOGICAL ORDER
>
> ### 🟢 **A · CURRENT STATE — the `T22`/`T23` layer. Read these first; they supersede parts of B.**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0.9-T22`** | **The hunt was solved.** The exit condition `§0.7-T18` wrote down was met exactly *(§1)* · **`POST /game_types`**, its body and response, `payouts_srp` *(§2)* · why three probes missed it — **it is a `POST`, behind DataDome + Cloudflare** *(§3)* · 🔴 **the `multiplier`-column census, measured live — `§0.2g`'s app list is wrong in both directions** *(§4)* · **the owner's four design decisions in his own words** *(§5)* · **the security decision: refuse to server-side the owner's cookies** *(§6)* | 🟢 |
> | **`0.10-T22`** | **The pricing law.** Multiplicative and partner-independent *(§1)* · **the compression `payout = 9.1 × (product/9.1)^0.857`** *(§2)* · ✅ **confirmed out of sample on three pairs never quoted together** *(§3)* · 🔴 **a naive model overstates demon stacks `~13%` at `20×`** *(§4)* · the goblin floor as it stood, with its supersession *(§5)* · the probability model was a contest, not an assumption *(§6)* | 🔑 |
> | **`0.11-T22`** | **Seven more, in pointer form.** ① the TLS/UA mismatch that killed the probes · ② the compression's error quantified · ③ 🔴 **a silent off-by-one that collapsed the experiment's conditions** · ④ leg probabilities must be de-compressed first · ⑤ 🔴 **three of this corpus's own claims audited — two did not survive** · ⑥ the Flex grid's coarseness is the measurement floor · ⑦ the other chat asked for its findings to be folded in here | 📋 |
> | **`0.12-T22`** | **`is_adjusted`** — the first DIRECT server-side evidence of a mechanic this file only ever inferred, plus the 2-pick base rates *(§1)* · 🔑 **the house edge: Power `EV 0.748`, Flex `0.747` — a flat `25%`, identical** *(§2)* · ✅ **the consolation tier is driven by RISK; `p(exactly one)` excluded at `15.6%`** *(§3)* | 🔑 |
> | **`0.13-T22`** | **The per-leg model and the key.** `c × √(standard line)` with its constants *(§1)* · 🔑 **the key-granularity principle — raw facts, not model parameters** *(§2)* · ✅ **`2,199,354` legs → `8,573` price ids, `256×`, cross-confirmed against a live `SELECT`** *(§3)* · ✅ **`63` inconsistent keys — caught, then resolved by putting `kind` in the primary key** *(§4)* · population facts that shape any backfill *(§5)* · **the state-resolution constraint on any collector** *(§6)* | 🔑 |
> | **`0.15-T23`** | **The WNBA fit table in full.** 🟢 **constants for three stats NBA does not price** *(§1)* · 🔴 **the match-rate column — `62%` at best, `28%` on rebounds: a precision ceiling on per-leg pricing** *(§2)* · a per-league refit cuts error `4–5×` *(§3)* · ⚠ **the `v2` parameterisation is named but not dated** *(§4)* | 🔑 |
>
> ### 📘 **B · THE INHERITED MLB PROGRAMME AND THE PER-APP SURVEY (`T1`, `T12`–`T18`)**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0.`** | The inherited MLB programme — the handoff memory and lessons document | |
> | **`0.1`** | **Four measured mechanics** of the PrizePicks multiplier | |
> | **`0.2`** | Real Flex partial-tier observations — *the one thing that DID look constant* | |
> | **`0.2b`** | **POWER vs FLEX** — the two slip types | |
> | **`0.2c`** | ⚠ **The confidence tier on `§0.2`'s finding — do not let it harden** | ⚠ |
> | **`0.2d`** | **Flex vs Power — a genuinely different probability structure**; `0.2d.1` the single-tier non-arbitrage check; `0.2d.2` *"Flex can flip an EV-negative pool positive — in principle"* ⚠ **closed by `§0.12-T22` §2: it cannot, by construction** | ⚠ |
> | **`0.2e`** | **Underdog and Sleeper price per-leg DYNAMICALLY, and EFFICIENTLY**; `0.2e.1` the measured result at scale | |
> | **`0.2f`** | **PrizePicks discounts same-game correlation — build CROSS-GAME by default** ⚠ *direction confirmed on NBA `2026-09-23`; the `35–40%` magnitude is an MLB number* | ⚠ |
> | **`0.2g`** | ~~No DFS platform publishes per-leg multipliers via API~~ 🟢 **SUPERSEDED IN PART — see `§0.9-T22`** | 🟢 |
> | **`0.2h`** | ⚠ **Lesson #27 — partial-credit structure is platform-specific: FLAT vs PROPORTIONAL** | ⚠ |
> | **`0.3`** | **The house-edge sanity test** — a named guard against believing a bad number; `0.3a` **MLB's costliest single error (mismatched cells)**; `0.3a2` Lesson #16; `0.3b` the `p × m` test ✅ *quote confirmation discharged `2026-09-21` — see the note in `§0.3`* | 🔑 |
> | **`0.4`–`0.6`** | MLB's own multiplier documents · what transfers and what does not · two UI rules carried from MLB | |
> | **`0.7-T18`** | 🔴 **The multiplier hunt's result — exhaustive and definitive** *(item 7's exit condition ✅ **DISCHARGED `2026-09-20`**)* | 🔴 |
> | **`0.8-T18`** | 🔴 The hunt — what the owner OBSERVED, what he ordered, why it was DEFERRED | 🔴 |
> | **`0.9`** | 🔑 **The `T13` multiplier research arc** — what the research learned and where it stopped | 🔑 |
> | **`1.`–`4b.`** | What each app exposes · **PrizePicks ruled out exhaustively** · the owner's correction *(the factor is not a constant)* · the capture that would work · **the capture protocol** | |
> | **`5.`–`7.`** | **Why it matters — the EV arithmetic**; `5b` the conversion is a correction, so blueprint `§7f` applies · conversion logic *(payouts → probabilities)* · the market side *(de-vigged book probability)* | |
> | **`8.`–`8c.`** | Slip-level observations · ⚠ the required report layout and its normalization rule · standing UI rules that bind the multiplier surface | |
> | **`9.`** | 🔴 **OPEN ITEMS** — *incl. item 5, the fantasy-score scale, **narrowed `2026-09-23`*** | 🔴 |
>
> 📌 **HOW TO READ THIS FILE**: ***section `A` is current; section `B` is the record it was built on,
> and parts of `B` are superseded IN PLACE with both dates (rule 40 — originals are never deleted).***
> **If `A` and `B` disagree, `A` wins and the `B` section will say so.**

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

## 🆕 0.2f-T23 **§T23.6 — FIVE SLIP-LEVEL LAWS MEASURED ON `2026-09-21`, NONE OF WHICH WERE IN THESE DOCUMENTS**
*Recorded `2026-09-23`, `T23` pass `6`. **Read this before `§0.2f` below — three of the five change
what that section's cross-game rule costs.***

### 🔴🔴 **1 · THERE IS A HARD PAYOUT CAP, AND OUR PRICING RAN `16×` PAST IT**
***PrizePicks never prices a single leg longer than an implied probability of about `0.072`. Paired
with a standard, that is a maximum `2`-pick of `18.5×`.***

| | |
|---|---|
| the evidence | **WNBA demons in THREE different stat families all stop at exactly `0.0720` and `18.5×`** |
| why that proves it is engine-level | 🔑 ***a cap that ignores each stat's own spread cannot come from the stat — it comes from the pricing engine, so it applies to NBA too*** |
| why NBA could never have shown it | ⚠ **NBA's own data never went far enough out the tail to reach the cap** |
| 🔴 **what it caught** | **our NBA pricing allowed extrapolated `2`-picks up to `306×`** — *a price PrizePicks does not offer and never has* |
| the correction | **`4,748` NBA legs repriced; maximum falls to `18.51×`; coverage unchanged; reversible in one step** |

🔑🔑 ***A neighbouring league was the only place a ceiling on THIS league's prices could be
observed.*** **That is the strongest argument in this corpus for the WNBA data being worth
collecting at all** — *and it arrived under an explicit owner constraint that WNBA is **only** a data
source for sharpening NBA, with no WNBA models, constants or WNBA-only stats. **The cap transfers;
WNBA's rebound and assist constants were tested, found to differ, and dropped.***

### 🔴 **2 · THE SLIP LAW FOR A SINGLE ALTERNATE: `payout = base × factor^a`, WITH `a` RISING BY SLIP SIZE**
| picks | `a` |
|---|---|
| `3` | **`1.008`** |
| `6` | **`1.069`** |

⇒ ***That exponent is why goblins pay BELOW the all-standard base in big slips and demons ABOVE it.***
**Fits to `1`–`2%` — PrizePicks' own rounding level — where the same slips were previously known only
to `±6%`.** ⚠ **Still partial**: *with two or more alternates at `4`–`6` picks, real payouts come in
about `7%` BELOW the law.* **Marked partial rather than guessed, because it was tested before being
registered.**

### ✅ **3 · THE ALL-STANDARD TABLES ARE NOW VERIFIED AT EVERY SIZE — INCLUDING THE TWO THE BACKTEST DEPENDED ON**
| picks | power | flex |
|---|---|---|
| `2` | `3×` | `2×` / `0.5×` |
| `3` | `6×` | `3×` / `1×` |
| `4` | `10×` | — |
| 🔴 **`5`** | **`20×`** | **`10×` / `2×` / `0.4×`** |
| 🔴 **`6`** | **`37.5×`** | **`25×` / `2×` / `0.4×`** |

⚠⚠ ***`5`- and `6`-pick power were UNVERIFIED until this run, and the standards backtest's larger
slips rested on them.*** **They are right.** 🔑 *A backtest result that depended on two published-but-
unmeasured constants is now a backtest that depends on two measured ones — **the result did not
change, and its evidential status did.***

### 🔴 **4 · SAME-GAME PICKS CUT FLEX *AND* POWER — and this entry is a worked example of getting that wrong**

🔴🔴 **RETRACTED AND REPLACED WITHIN THE SAME PASS.** *This item was first published as:*
~~*"**Same-game picks cut FLEX, not POWER.** A `3`-pick with two players from one game kept its `6×`
power and had its flex consolation cut from `1.0×` to `0.75×`. This qualifies `§0.2f`: the rule is
right for Flex and, on this observation, not applicable to Power."*~~

⚠ **BOTH HALVES OF THE EVIDENCE WERE AVAILABLE AND ONLY ONE WAS READ:**

| source | says |
|---|---|
| the `T23` segment I read | *a `3`-pick, two players from one game, **kept `6×` power**, flex consolation `1.0×` → `0.75×`* |
| 🔴 **`T23`, four segments later** | ***"slips with two players from the same game pay less, for example `2.9×` instead of `3.0×`. The standards backtest never prevented that."*** |
| 🔴🔴 **this very document, `§0.2f`, line ~`436`** | ***"opponents paid `2.9×` instead of `3.0×`"*** — **already recorded, with the Flex-partial cut alongside it** |

⇒ ✅ **THE CORRECT STATEMENT: same-game slips are discounted on POWER *and* on FLEX partials.** *The
`6×`-retained observation is a real data point about ONE `3`-pick and does not generalise; the `3.0 →
2.9` power cut is recorded independently in two places.* **(Refined by §T50.3.4, 2026-10-21: all-standard same-game Power IS cut, but only on some lineups (flag `power_adj`): 2-pick 3.0 x28 / 2.9 x6 / 2.8 x1 and 3-pick 6.0 x23 / 5.75 x4 of 37 quotes; 4-6 picks never; rule `power_same_game_v3` = 2.8 / 5.75. The 10-18 statement "Power never adjusted" is superseded.)**

🔑🔑 ***I wrote a conclusion into the very section that already refuted it, four hundred lines below
the refutation.*** **That is `§F7.9`'s defect experienced from the inside for the third time this
session** *(after `§F6.13` and `§F6.21`)*: **a figure repeated across a corpus with no pointer home
lets a writer contradict it without ever meeting it.** 📌 ***The check that would have caught it costs
one grep of the file being written to, and it is now part of the pass procedure rather than a
lesson.***

✅ **`§0.2f`'s cross-game default therefore stands UNQUALIFIED**, and `T23`'s own conclusion is the
operational form of it: ***"the next build will use legs from different games in every slip."***

### 🔴 **5 · `LESS` IS THE EXACT COMPLEMENT OF `MORE`, AND IT HAS ITS OWN FLOOR**
| | |
|---|---|
| the pricing relation | **`Less` is priced as the exact complement of `More`, from the same formula** — *for the same line the two probabilities sum to about `0.98`* |
| does NBA's formula already predict it? | ✅ **yes** — using NBA's own points-family constant, WNBA `Less` prices land **within `4.7%` on average, `91%` within `10%`** |
| 🔴 **the floor is DIFFERENT on `Less`** | **favourites on `Less` floor at `1.7×`, not the `2.08×` goblin floor** — **`28` of `36` demons whose price would have gone lower sat exactly at `1.7×`**; goblins on `Less` paid `3.25×`–`8.0×` |
| the trap that was caught first | ⚠ **the database would have silently discarded every `Less` price as a duplicate of its `More` price** |

⇒ **Pricing floors are now SIDE-AWARE.** *No existing NBA price changed, because NBA does not offer
`Less` on alternates yet — **so this is a rule installed before the board that needs it exists**,
which is the right order and worth noting as such.*

### 🔴🔴 **6 · `fantasy_score` IS PRICED BY A COMPLETELY DIFFERENT MECHANISM**
*The system's highest-volume prop, and the one `F6-3` already flags for its underived penalty.*

| | |
|---|---|
| rung structure | **exactly ONE goblin and ONE demon, placed SYMMETRICALLY around the standard** |
| the gap grows with the line | **`4.5` points on a `15.5` line · `6` on a `41`** |
| 🔑🔑 **prices are FIXED; the LINES move** | **every goblin pays `2.3×` in a `2`-pick and every demon `4.5×`–`4.75×`, FOR EVERY PLAYER** |
| the implied rungs | PrizePicks sets them at roughly **`65%`** and **`32%`** probability |
| `Less` mirrors it | *a demon taken `Less` pays the goblin's `2.3×`* |
| its own spread constant | **`≈2.26`** — *wider than points alone, as a weighted sum of several stats should be* |
| the scoring formula | ✅ **checks out**: `pts + 1.2·reb + 1.5·ast + 3·stl + 3·blk …` → 🆕 *the population the check ran on (`2026-10-14`, additional sweep `2`): `NBA_MASTER_SUMMARY.md` `§T23.22`* |

🔑🔑🔑 ***EVERY OTHER PROP HOLDS THE LINE AND MOVES THE PRICE. `fantasy_score` HOLDS THE PRICE AND
MOVES THE LINE.*** ⇒ ***`§T22.9`'s "priced by the line, not the rung" is exactly inverted here***, and
**any model that infers a probability from a `fantasy_score` multiplier will read the same number for
every player at every line.**

🔴 **AND THE PIECE THAT IS MISSING IS ARCHIVAL, NOT ANALYTICAL**: ***PrizePicks' `fantasy_score`
CENTRE LINE was never archived for NBA.*** *The plan is to rebuild it from the day's component lines
— **untestable until the preseason board of `2026-10-03` provides real NBA fantasy lines.*** ⚠ *The
board loader now captures fantasy and its components side by side, so the first full NBA map answers
it. **A dated, falsifiable open item with a known resolution date — recorded as such.***

### 🔴🔴 **7 · `§T23.7` — PRIZEPICKS' STANDARD LINE *IS* THE SPORTSBOOK CONSENSUS, AND EVERY LINE COMES FROM ONE PROJECTION**
*Measured across both seasons.*

| prop | PrizePicks vs the books' median |
|---|---|
| **points** | within `0.5` **`93%`** of the time · within `1.0` **`99.9%`** |
| **rebounds, assists** | within `0.5` **`99.7%`–`100%`** |
| 🔑 **threes, blocks, steals, turnovers** | ✅ **MATCHED EXACTLY** |

⇒ 🔑🔑 ***Book lines are an accurate stand-in for any prop the books quote — and they are INDEPENDENT
OF OUR MODEL, which is what keeps a back-simulated backtest honest.*** **That independence is the
whole value: a reconstructed line built from our own projection would manufacture edge or hide it.**

**AND EVERY PRIZEPICKS LINE IS BUILT FROM ONE PROJECTION PER PLAYER** *(verified on the WNBA board)*:
*two-player combos are **the SUM of the two component lines, within `0.3`**; offensive + defensive
rebounds **add up to** rebounds; `fantasy_score` is the **weighted sum of its components within about
one point**.* ⇒ ***The board is internally consistent by construction, so any prop missing from the
archive can be rebuilt from the props that are present.***

### 📐 **8 · THE FIXED-RUNG SPACING SCHEDULES — exact, symmetric, and reproduced on every ladder tested**
| prop | gap schedule |
|---|---|
| **`fantasy_score`** | **`gap = line × 0.07 + 3.2`**, rounded to the half point — ✅ ***reproduces every one of the `32` WNBA ladders*** |
| **FG attempted** | flat **`2.0`** |
| **`3`-PT attempted** | **`1.0`** *(`2.0` on higher lines)* |

### 🔴 **9 · THE FANTASY RECONSTRUCTION IS VALIDATED ON OUTCOMES — AND ITS GOBLINS ARE MISPRICED**
*No historical PrizePicks fantasy line exists, so the reconstruction was tested against REAL OUTCOMES
instead of against a line.*

| | |
|---|---|
| over the rebuilt centre, `1,315` player-nights | **hit `51.9%`** — *a true PrizePicks line should hit `50%`* |
| ⚠ the first version | hit only **`43%`**; *a fix to how missing stats are filled in corrected it* |
| fantasy **demons** on real NBA outcomes | ✅ **`31.9%`, against the `~32%` their price implies — exact** |
| 🔴🔴 fantasy **goblins** | **`73.5%`, against the `~65%` their price implies** |

🔑🔑 ***An `8.5`-point gap in the player's favour on fantasy goblins, on the system's highest-volume
prop.*** ⚠ **Not claimed as edge**: *the conservative mode's safety shift and lower payout cover it
until the preseason board settles whether it is real or an artefact of the reconstructed centre.*
📌 *This is the same prop `F6-3` flags for an underived `0.3 pp` penalty — **two independent findings
now point at `fantasy_score`, from opposite ends of the pipeline.***

### 🔴 **10 · `§T23.6`'s OWN FLOOR NUMBER IS SUPERSEDED BY `T23` ITSELF**
> ***"Correction: the `2.08×` goblin floor isn't universal. It varies BY STAT and BY LEAGUE, so I'll
> set NBA's from preseason data."***

⚠⚠ **This supersedes the floor as a CONSTANT in `NBA_GOBLIN_DEMON.md` `§5`** *(where it already went
`2.08` → `1.9` once)*. ⇒ ***The floor is not one number that was measured wrong twice. It is a
per-stat, per-league parameter that was being modelled as a scalar*** — **which is why each new
measurement moved it.** 🔑 *A parameter that keeps needing correction is usually a parameter with a
missing index.*

### ✅ **11 · CONSERVATIVE MODE — the margins, and the measurement that justifies them**
*Every safety number lives in **one table**, so changing one later is a single edit.* **Sized so the
real price sits at or above ours about `90%` of the time:**

| lever | margin |
|---|---|
| goblin leg payouts | **`−3%`** |
| demon leg payouts | **`−7%`** |
| 🔴 demons **beyond our evidence** | **`−17%`** |
| fantasy goblins / demons | **`2.3×` → `2.2×`** · **`4.5×` → `4.0×`** |
| simulated lines move **against** the pick | `fantasy_score` by a full point · combos by half a point |

📊 **THE RESULT, against `452` real quotes**: *conservative payouts sit at or below PrizePicks' real
payout **`96%`–`97%`** of the time, against **`55%`–`67%`** for the best estimate.* ✅ **The best
estimate is kept and can be switched back in one step.**

⚠ **AND AN OWNER-INTENT AMBIGUITY WAS FLAGGED RATHER THAN RESOLVED SILENTLY** — *the owner said demons
"a point less" and also "make it harder"; **for an over, harder means a HIGHER line**, so both goblins
and demons were moved UP, and the divergence was stated: **"If you meant something else for demons,
it's one number to change."*** 🔑 *`RULE 55` applied to an instruction rather than a measurement.*

⚠ **`RULE 54`.** *`WINDOW`: `T23`, `2026-09-21`, targeted WNBA runs plus NBA mined quotes. **The cap,
the `Less` complement and the `Less` floor are measured on WNBA and TRANSFERRED to NBA on the
engine-level argument** — that argument is stated above and is the claim to attack if any of the
three fails on the NBA preseason board. **`NOT DONE`: the flex CONSOLATION-TIER rule was pooled across
both leagues and remains unsolved** — *"it depends on something we can't observe"* — **and was dropped
deliberately because standard flex payouts are fixed and verified, so it does not block the standards
strategy.**

## 0.2f **PRIZEPICKS DISCOUNTS SAME-GAME CORRELATION — build CROSS-GAME by default**

> ✅⚠ **DIRECTION CONFIRMED ON NBA, MAGNITUDE NOT — 2026-09-23 (`§T22.5` ⑤, `§T24.1` §2).**
> 🔴 **The `35–40%` figure below is an MLB number**, and `T22` recorded it as **"NOT OBSERVED for
> opponent pairs; teammates untested"** on NBA.
> ✅ **`T24` supplies the first NBA observation**: *"same-game slips pay less — **a 2-pick of
> opponents paid `2.9×` instead of `3.0×`**, same-game Flex partials are cut — so slips must span
> different games."* ⇒ **`−3.3%` on that pair.**
> ⇒ 🔑 ***Build cross-game by default: the DIRECTION is confirmed. But do not quote `35–40%` for
> NBA*** — the only NBA measurement is an order of magnitude smaller, and it is one pair.
> ✅ **And the rule is now IMPLEMENTED, not just advised**: `nba_score.paper_pick_slips()` packs
> greedily with no two legs from one game *(test night `2026-01-15`: `45` picks → `15` slips,
> **`0` same-game**)*, and the resulting replay returns **`+14.5% ± 4.2%`** over `3,921` slips
> *(`§T24.1` §1 — **`AS STATED IN T24`**, and a REPLAY, not a traded record)*.

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

## 0.2g ~~**NO DFS PLATFORM PUBLISHES PER-LEG MULTIPLIERS VIA API — budget for a permanent study**~~ 🟢 **SUPERSEDED IN PART 2026-09-23 — SEE `§0.9-T22`**

> 🟢🟢 **SUPERSEDED IN PART (T22 pass 1, `§T22.1`, 2026-09-23). Correct when written (`2026-09-19`);
> the premise was overtaken on `2026-09-20`.** **PrizePicks DOES expose a machine-readable payout
> surface — `POST /game_types` — found by the owner's browser capture**, i.e. by the exact exit
> condition `§0.7-T18` item 7 had written down. ⚠ **What survives**: it **QUOTES a specific
> combination rather than publishing a table**, so a complete matrix must still be assembled by
> enumeration — *the permanent-study framing holds; the "no API" premise does not.*
> 🔴 **And the app list below is WRONG IN BOTH DIRECTIONS, measured live `2026-09-23T02:22:06Z`**:
> of the four it names, **only Sleeper is complete (`100%`)** — Underdog is `44.03%` and **Fliff and
> Betr are at `0.00%`** *(`0` of `1,394` and `0` of `780,765`)* — while **`pick6`, which it does not
> name, is `94.89%` populated with `415` distinct values.** ▶ **Full table: `§0.9-T22` §4.**

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
ceiling are **inferred**, not read from a slip. **(Both figures corrected by the T50 deep pass, 2026-10-26: ~~goblin factors take 40-53%; demon ceiling about 1.75-1.9x~~ -> measured goblin factors are G1 0.756, G2 0.698, G3 0.661 (cuts of 24%, 30%, 34%; range 0.614-0.934; universe mean 0.724) and the implied-probability times factor product sits at about 0.50 for every goblin, so goblins are closed as a standalone leg because p x m is about 0.50 per leg, below the 0.55 per-leg bar of a 3-pick Power (all-goblin 3-pick Power: minus 86.2%), not because of a 40-53% cut. Demon prices average D1 1.44x, D2 1.71x, D3 2.43x, maximum 5.76x; see the note under the T+2 / T+3 line further down. Source: subagent re-read of 10-22.)**

**This does not invalidate the work** — the directional conclusions are robust to a wide range of
factors, and the ladder's *calibration* (the honesty property) does not depend on multipliers at all.
**But it means no EV or ROI claim can be believed until a real slip-builder quote confirms the
factor** — and that quote is free.

**The ordering this implies**: calibration first (done), selection second (the open question),
**quote confirmation third — free, and not optional.**

> ✅✅ **QUOTE CONFIRMATION WAS PERFORMED `2026-09-21` — recorded 2026-09-23, `§T22.6`.**
> *`160` stratified `alt×alt` pairs quoted through `POST /game_types`.* **Result: the house edge is a
> flat `25%` and it is IDENTICAL on both slip types — Power `EV 0.748`, Flex `EV 0.747`.**
> ⇒ ***The EV/ROI claims this section suspended can now rest on quoted factors rather than inferred
> ones.*** ⚠ **Scope of that confirmation**: it is measured **on `alt×alt` pairs**; whether the flat
> `25%` holds on standard-containing slips is **`NOT RECORDED`.** ▶ **`§0.12-T22`.**

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

> ### 🔴🔴 **§T22.16 — AND THE SAME GOBLIN'S FACTOR CHANGES WITH SLIP SIZE — NON-MONOTONICALLY**
> *(`T22` pass `16`, `2026-09-21` NBA quotes, recorded `2026-09-23`. **A different measurement from
> the table above, and it undercuts the assumption that table rests on.**)*
>
> | slip size | the SAME goblin's implied factor |
> |---|---|
> | `2` picks | **`0.667`** |
> | `3` picks | **`0.583`** |
> | `4` picks | 🔴 **`0.650`** |
>
> ⚠⚠ **`T22`'s own words:** ***"The goblin factor drifts with slip size… I can predict `2`-pick
> slips; I can't yet predict larger ones honestly."***
>
> 🔑🔑 **WHY THIS MATTERS TO THE TABLE DIRECTLY ABOVE.** *That table derives a per-leg goblin factor
> by taking the **`n`-th root** of `displayed ÷ base` — which assumes **the per-leg factor is the same
> at every slip size.** **It is not.** `0.667 → 0.583 → 0.650` is not a trend that a root can absorb;
> **it goes down and then back up.*** ⇒ ***The `≈0.677` and `≈0.669` per-leg figures are valid AT
> THEIR OWN SLIP SIZES and must not be carried across sizes.***
>
> ⚠ **What this does NOT overturn**: *the table's headline conclusion — **goblins are far more
> punitive than the stored `0.75`–`0.90` estimate** — survives at every observed slip size, since
> `0.667`, `0.583` and `0.650` are all well below `0.75`.* **The direction of the correction holds;
> only its precision was overstated.**
>
> 📌 **AND IT EXPLAINS A BOUNDARY THE BUILD KEPT RUNNING INTO**: *`§T22.9`'s validated model is a
> `2`-pick model, and multi-pick stayed *"usable to about `±6%`; exact rule open."* **Non-monotonic
> drift is why — there is no single factor to solve for.** `RULE 55`: the mechanism is not recorded
> because the three points above are not enough to state one.*

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

### ~~🔴 **7 · WHAT REMAINS — and it is a five-minute job on the owner's side**~~ ✅ **DISCHARGED `2026-09-20` — SEE `§0.9-T22`**

> ✅✅ **DISCHARGED (T22 pass 1, `§T22.1`, recorded 2026-09-23).** ***The owner ran exactly the recipe
> below, on `2026-09-20`, and it worked on the first attempt***: adding the second leg fired
> **exactly one non-analytics call — `game_types`, `2.1 kB`** — everything else being `track`
> analytics *(`T22` SEG `25`)*. **It is a `POST` whose body carries the `projection_id`s**, which is
> why three prior anonymous `GET` probes from a GitHub runner found nothing *(SEG `29`)*.
> 🔑 **The deferral carried its exit condition, and the exit condition is what discharged it in one
> day. Kept in full as the worked example of why that habit is cheap.** ▶ **`§0.9-T22`.**

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

⚠ **Read this against §0.2, §0.2h and §0.9c, not on its own.** §0.2's *"4/5 = 0.5 and 3/5 = 0.25"* are
**partial-tier FRACTIONS from MLB**; the rows above are **absolute NBA-era entry payouts**. They are
different quantities and **must not be multiplied together without re-deriving the convention.**

> ⚠⚠ **`§0.9c` — AND THE TABLE ABOVE DOES NOT SAY WHICH PRODUCT, OR WHICH STATE, IT DESCRIBES**
> *(inbound pointer added 2026-09-22, T20 pass 85, §T20.90 — repairing a `T20-1` orphan; **no row
> above is struck or changed**.)* **`§0.9c` — *"THE PRODUCT CHANGED UNDERNEATH THE DATA — and the
> change is STATE-DEPENDENT"*, four headings below this one** *(authority: the researcher's source
> review, **self-corrected two segments later**)* — records that PrizePicks moved toward the
> peer-to-peer **`Pick'em Arena`** on **`2025-08-22`**, and that ***`Pick'em Arena` is
> STATE-DEPENDENT, not universal.***
> 🔑 **Why it belongs on THIS table and not only on its own heading**: the rows above are, by their
> own authority line, ***"A PUBLISHED TABLE, not a measurement"*** — **and a published entry table is
> published for one product in one jurisdiction.** *Nothing in the table names either.*
> 🔴 **`§T20.24` then established that the archive can never settle it** *(live, 2026-09-22)*: the
> board history **straddles the `2025-08-22` change with nothing marking it**, and The Odds API
> normalises PrizePicks to American odds — ***so `p × m` cannot be tested historically, because `m`
> was never stored.*** ⇒ ***Take these rows as the slip-shape term of §0.2's decomposition, dated to
> T13; do not treat them as a live price for a named state.***
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
- 🆕 *(additional sweep `6`, pass `385`, `§P385` — `T13` `2026-09-10 19:16Z`–`19:56Z`, the sources the research passes named)*: the narrowed statement was Stokastic's — *So Stokastic's blanket "retired in the US" is overstated* — and the same reply adds that *PrizePicks additionally now offers CFTC-regulated event contracts (Team/Culture Picks)*. At `19:22Z` one source was flagged unreliable and excluded: oddsreference.com, which describes Demons as shifting the line in the player's favour at a reduced multiplier — *exactly backwards from PrizePicks' own documentation*; the owner answered that the source was right that multipliers change (`§0.9a`), and the reply held the inversion. At `19:56Z`: *Passes 9 and 10 returned mostly the same Stokastic/HeatCheck/PrizePicks help-center material with no new primary observations*.
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
| 🔴 **Sleeper** | ⚠ **main line captured; alt stats EXIST and are NOT** | ⏳ **open** → 🆕 *captured and wired `2026-09-27` (`T31`: `lines/available_alt`, archived as `_alternate`; promos as `_promo`) — `NBA_MASTER_SUMMARY.md` `§T31.1` (pass 104)* 🆕 *(additional sweep `8`, pass 501, `§P501` T29 `22:00Z` on `2026-09-27`, AS STATED)* The discovery call: with no NBA picks open yet the owner captured WNBA to find the endpoint (*"no nba picks yet, we can try with wnba, just to find the endpoint"*), and the app's own board request was `/lines/available?sports[]=wnba&dynamic=true&include_preseason=true&enable_one_sided_lines=true&…` — `include_preseason=true` is a parameter the app sends that the build chat's scraper note did not list (the scraper's own call, `lines/available?dynamic=true`, is public and unauthenticated; the `available_alt` response, the board response with one-sided lines and the request headers were what the parser needed, with `Authorization` / `Cookie` values replaced by `REDACTED` and the header names kept to show whether alternate lines require login). 🆕 *(additional sweep `8`, pass 502, `§P502` T30 `22:05Z`, AS STATED)* What the filtered save file held, as the build chat counted it once the capture was cut to `api.sleeper.app`: *"the three we want (`available_alt` for wnba `16.9k`, `available` with one-sided lines `16.6k`, and `payouts/legs_boost_map`, a bonus)"* — so a `payouts/legs_boost_map` request exists on the Sleeper app's API beside the two board calls; the transcript names it only in passing and does not read its body, and no file in the repo calls it. |

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
seg 661, `NBA_OPEN_ITEMS.md`, 0 of thirty)* — **and it is one prop. The other props are NOT RECORDED.** → 🆕 *the other seven props' rows and the table's source line, as the transcript gives them (`2026-10-14`, additional sweep `2`): `NBA_MASTER_SUMMARY.md` `§T13.7`.*

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

**Observed ceiling ~1.75–1.9×** → **T+2 and T+3 can never clear break-even.** **(Superseded by the T50 deep pass, 2026-10-26: ~~about 1.75-1.9x observed ceiling, T+2 and T+3 can never clear~~ -> that was an early-sample figure. On the system's tier map (910,513 legs) demon prices average D1 1.44x, D2 1.71x, D3 2.43x with a maximum of 5.76x, and the engine cap is 18.5x on a 2-pick. Whether a deeper demon clears its break-even is decided per cell and per season (rebounds D3: price 2.20x, break-even 0.250, hit 0.307 at n=4, positive in 2025-26 and marginal in 2024-25), not by a fixed ceiling. The break-even factors 1.48x / 2.30x / 3.31x belong to the offset tiers T+1 / T+2 / T+3 only. Source: subagent re-read of 10-22.)**
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
> | **Underdog** | ~~**`payout_multiplier = decimal(American price) × 0.963`**~~ → ⚠ **SUPERSEDED `2026-10-03` by the solved formula `base(n) × ∏ mᵢ × C` — `§T36.3`** | **worked on three real legs** *(below)* |
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
   ~~**Coverage per app is unverified.**~~ ✅ **VERIFIED 2026-09-23 (T22 pass 1, `§T22.1`) — see `§0.9-T22` §4 below.**
5. **The fantasy-score scale conflict** (+2 vs +3 on blocks/steals) changes payout arithmetic for
   `fantasy_score` legs — see `NBA_OPEN_ITEMS.md`.
   > ✅ **NARROWED 2026-09-23 (`§T24.1` §3).** **`T24` reconstructed `32,170` player-nights using**
   > **`center = PTS + 1.2·REB + 1.5·AST + 3·STL + 3·BLK − TOV`** — ***`+3` for BOTH steals and
   > blocks*** — and **that model reproduced all `15` distinct WNBA lines** via
   > `gap = round_half(3.2 + 0.07 × center)`. ⇒ 🔑 **Corroboration BY CONSTRUCTION, not assertion.**
   > ⚠ **What it does NOT establish**: *that PrizePicks uses `+3`. It establishes that a model using
   > `+3` reproduces the observed line grid* — **a weaker and more useful claim.** 🔴 **Still
   > `AS STATED IN T24` (a SECONDARY source) and still open on NBA lines.** ▶ **`§T24.1` §3.**

---

# 0.9-T22. 🟢🟢🟢 **THE HUNT WAS SOLVED — `§0.2g` AND `§0.7-T18` ARE BOTH OVERTAKEN BY EVENTS** *(T22 pass 1, §T22.1, 2026-09-23)*

> ⚠⚠ **READ THIS BEFORE `§0.2g` AND `§0.7-T18`.** *Those sections are correct for what was known when
> they were written (`2026-09-19`, T18). **This document did not know the problem was solved on
> `2026-09-20`, because the transcript that solved it — `T22` — did not reach this sweep until
> `2026-09-23`.*** **Nothing below is retracted; it is superseded, with both dates.**

## 1. 🔑🔑🔑 **THE EXIT CONDITION `§0.7-T18` WROTE DOWN WAS MET, EXACTLY AS WRITTEN**

**`§0.7-T18` item 7 said**: *"Every route that does not require an authenticated session is closed.
**The remaining one is the owner's own browser**… Open `app.prizepicks.com` logged in → DevTools →
Network → filter **Fetch/XHR** → add the FIRST leg → **CLEAR the list** → add the SECOND leg.
Whatever fires in that final step is the answer."*

⇒ ✅ ***That is precisely what happened.*** **`T22` SEG `25`**: *"when the second leg went in,
**exactly one non-analytics call fired — `game_types`, 2.1 kB**. everything else there is `track`,
which is analytics."* 🔑 **A deferral that carried its exit condition was discharged by that exit
condition, one day later.** *Recorded because the corpus's habit of writing exit conditions is what
made this cheap.*

## 2. ✅ **THE ENDPOINT — `POST https://api.prizepicks.com/game_types`** *(AS STATED IN `T22`; not re-probed by this sweep)*

**It is a `POST`, and the body carries the specific legs:**
```json
{"new_wager": {"amount_bet_cents": 2000,
               "picks": [{"wager_type":"over","projection_id":"13975905"},
                         {"wager_type":"over","projection_id":"13976089"}],
               "pick_protection": false},
 "lat": …, "lng": …, "game_mode": "prizepools"}
```
**Response** — `data[].attributes.name` ∈ {`power play`, `flex play`}, and
`data[].attributes.payouts` = `{"<n_picks>": {"<n_correct>": multiplier}, "is_adjusted": bool}`,
alongside **`payouts_srp`** *(`{"power": […], "flex": […]}` — a second, separate schedule; `0` prior
mentions anywhere in the twelve)*.

> 🔑🔑🔑 **AND THE DECISIVE PROPERTY, WHICH CHANGES WHAT KIND OF ARTEFACT THIS IS:**
> ***"the server prices the specific combination you send. **NOT a lookup table — a quote** for these
> two projection ids, these sides, this stake."*** *(`T22` SEG `29`)*
> ⇒ ⚠ **`§0.2g`'s conclusion — "the deliverable is not a scrape; it is a maintained observation
> matrix" — is HALF right and its half matters.** *There IS a machine-readable surface, so the
> manual matrix is no longer the only route. **But because it quotes rather than publishes, a
> complete table still has to be ASSEMBLED by enumerating combinations — it cannot be downloaded.***
> 📌 ***The permanent-study framing survives; the "no API" premise does not.***

## 3. 🔑 **WHY THREE EARLIER PROBES MISSED IT — and it is one sentence**

> *"they **guessed GET endpoints anonymously from a runner**, and **this is a POST**."* *(SEG `29`)*

**Plus the wall, named**: **DataDome (`ct.captcha-delivery.com`) and Cloudflare
(`cdn-cgi/challenge-platform`) are both present** *(SEG `26`)* — *"that's why the earlier
unauthenticated probes from a GitHub runner got nothing."* ⚠ **`§0.7-T18` §2 recorded the wall as
PER-ENDPOINT; `T22` names the two products enforcing it.**

**Two more facts from the same probe, neither previously on file**: **`league_id=7` is live and is
NBA** · 🔴 **`milestones` returns `404` — not enabled for this account**, and it is *"likely their
version of Sleeper's 20+/25+/30+ markets"* ⇒ **relevant to the ladder work, and recorded as
`NOT AVAILABLE` rather than `NOT EXPLORED`.**

## 4. 🔴🔴 **THE `multiplier` COLUMN — MEASURED, AND `§0.2g`'s LIST IS WRONG IN BOTH DIRECTIONS**

*`nba_market.board_snapshots`, live `SELECT`, pinned **`2026-09-23T02:22:06Z`**. **This closes the
"Coverage per app is unverified" note this document has carried since it was written.***

| bookmaker | rows | with `multiplier` | **%** | distinct values | range |
|---|---|---|---|---|---|
| **sleeper** | `1,276` | `1,276` | ✅ **`100.00%`** | `204` | `1.15 – 3.52` |
| 🟢 **pick6** | `534,188` | `506,896` | ✅ **`94.89%`** | **`415`** | `0.50 – 46.60` |
| **underdog** | `939,719` | `413,731` | ⚠ **`44.03%`** | `167` | `0.60 – 7.89` |
| 🔴 **fliff** | `1,394` | **`0`** | 🔴 **`0.00%`** | — | — |
| 🔴 **betr_us_dfs** | `780,765` | **`0`** | 🔴 **`0.00%`** | — | — |
| 🔴 **prizepicks** | `2,199,354` | **`0`** | 🔴 **`0.00%`** | — | — |
| the nine sportsbooks *(fanduel `6,697,790` · draftkings `3,652,647` · betonlineag · bovada · betmgm · williamhill_us · fanatics · betrivers)* | — | **`0`** | `0.00%` | — | — |

> 🔴 **`§0.2g` states: *"Underdog, Sleeper, Fliff and Betr **do** expose theirs… read the value."***
> ⇒ **MEASURED: of those four, only Sleeper is complete. Underdog is under half. *Fliff and Betr are
> at ZERO — `0` of `1,394` and `0` of `780,765`.*** ⚠ *Whether that is the app not exposing it or the
> scraper not capturing it is **`NOT RECORDED`** — the column is the same either way, and the
> distinction is a scraper question this sweep does not answer.*
> 🟢 **AND THE LIST OMITS ITS BEST MEMBER: `pick6` is `94.89%` populated with `415` distinct values —
> the richest multiplier source in the database, and it appears in `§0.2g` not at all.**
> 📌 ***`prizepicks` at `0.00%` of `2,199,354` rows is EXPECTED and is the whole reason `§0.7-T18`
> existed*** — *the Odds-API feed carries its lines and not its payouts. It is stated here so the
> zero is not later mistaken for a scraper fault.*

## 5. 🔑🔑 **THE OWNER'S OWN DESIGN DECISIONS, IN HIS WORDS** *(all `0` prior mentions in the twelve)*

| | the decision | why it matters |
|---|---|---|
| 🔑🔑 **PRICE BY ID, NOT PER LEG** *(SEG `468`)* | *"instead of pricing each leg, cant we **'price id' them**? … if multipliers change, **we just change them on the database** instead of changing all multipliers on 2 seasons of data, and for each leg we add an id, pertinent to the formula you figured out, **so the price is centralized in the db and the price ids are tagged on each leg**, with the proper granularity to cover all we know and **also leave space for possible mistakes**."* | ***This is the owner's architecture, not the assistant's.*** It is the rationale behind the price-key indirection, and the last clause — *"leave space for possible mistakes"* — is a design allowance for exactly the kind of correction the goblin floor later needed. |
| **CURRENT multipliers over HISTORICAL, and it is not optional** *(SEG `434`)* | *"we will need to have multipliers for the 2 seasons backdata, **that is not an option**, and it is **much better we calculate with fresh, current multipliers than old multipliers that will not represent what we will have now**."* | A stated constraint with a stated reason. ⚠ *It sits in tension with lesson #24's "the exact numeric ratios genuinely decayed and changed over time" — **the owner's answer to decay is to reprice with today's values rather than preserve yesterday's**, which is a choice, not an oversight.* |
| **UNPRICED, NEVER GUESSED** *(SEG `493`)* | *"what do you mean by **the 43,370 legs with no center are explicitly unpriced, never guessed**"* | ✅ *The principle is already on file (`8` hits); **the owner's interrogation of it is not** — he stopped the build to ask what it meant before accepting it.* |
| **PRIORITY ORDER** *(SEG `12`)* | *"the apps deep scraping factors that we have open: **the multiplier on prizepicks**, the chalkboard, the ladder for sleeper or underdog… **the multiplier on pp is priority 1**"* — and *"i also want to find **the keep my million board in underdog**"* | 🔴 **`keep my million` appears `0` times in the twelve.** *An open owner request with no item and no record.* ▶ **Filed below.** |

## 6. ✅✅ **A SECURITY DECISION WORTH PRESERVING** *(SEG `30`, SEG `49`)*

*The obvious implementation — lift the owner's cookies into a server-side scraper — was considered
and **refused**, with the reason stated:*

> *"rather than extracting your cookies into a script — **DataDome and Cloudflare tie them to your
> browser fingerprint, so they'd die on a server anyway** — i'll write you a snippet you paste into
> the DevTools console **on the PrizePicks page itself**. it runs as you, in your real browser…
> **no tokens ever leave your machine**."*
> *"a different IP and fingerprint plus a location that doesn't match is **exactly what gets a
> real-money account flagged**."*

🔑 ***Two independent reasons — it would not work, and it would risk the account — and the second is
the one that would still apply if the first stopped being true.*** **Recorded as the standing
pattern for any future authenticated capture.**

---

> 📌 **EVIDENCE TIERS ON THIS SECTION** *(clause (iii), pre-registered)*: ✅ **VERIFIED by live
> `SELECT` this pass** — everything in `§4`. ⚠ **AS STATED IN `T22`** — the endpoint, its body and
> response shape, the DataDome/Cloudflare identification, `league_id=7`, the `milestones` `404`, and
> every quoted owner decision *(quotations are verbatim from the transcript; **the endpoint was NOT
> re-probed by this sweep, and must not be** — that would be a live write against a real-money
> account)*. 🔴 **`NOT RECORDED`** — whether Fliff/Betr's `0%` is the app or the scraper.
> ⚖️ **SCOPE**: *the `pp_*` Postgres objects and the concurrent session's files were **not queried and
> not touched** (`§T21.0 §5`).*

---

# 0.10-T22. 🔑🔑🔑 **THE PRICING LAW ITSELF — MULTIPLICATIVE, PARTNER-INDEPENDENT, AND COMPRESSED ABOVE `9.1×`** *(T22 pass 2, §T22.2, 2026-09-23)*

> ⚠ **THIS IS THE LAW THIS DOCUMENT EXISTS FOR, AND IT WAS NOT IN THIS DOCUMENT.** *The compression
> parameters appear **`7` times in `NBA_MASTER_SUMMARY.md` and `NBA_OPEN_ITEMS.md` and `0` times
> here** *(pinned `2026-09-23T02:27:36Z`)* — **a placement defect of exactly the kind `§T21.3`
> diagnosed**: the finding was recorded, in the file the sweep writes to by reflex rather than the
> one that owns the subject. **The structural property, the validation and the consequence were on
> file nowhere at all.**

## 1. ✅ **THE STRUCTURE — multiplicative and PARTNER-INDEPENDENT** *(AS STATED IN `T22` SEG `301`)*

> *"**multiplicative and partner-independent.** Wembanyama `11.5 REB` demon quoted **`3.25×` against
> two different standard partners**."*

🔑 **This is the property that makes a price-per-leg model possible at all.** *If a leg's factor
depended on its partner, there would be no such thing as "the price of a leg" — only the price of a
slip — and the owner's price-id design (`§0.9-T22` §5) could not work.* ⇒ ***The architecture rests
on this observation, and the observation rests on one controlled comparison: same leg, two different
partners, same quote.*** ⚠ **`n = 1` player-stat for the partner-independence claim as stated here;
its strength is the control, not the sample.**

## 2. 🔑🔑 **THE COMPRESSION — the longshot cap, with both parameters**

```
payout = product                                    for product ≤ 9.1
payout = 9.1 × (product / 9.1) ^ 0.857              for product > 9.1
```

⚠ *Parameters `t = 9.1`, `k = 0.857`.* **Fitted on `20` alt×alt pairs.**

## 3. ✅✅ **AND IT WAS CONFIRMED OUT OF SAMPLE — *on pairs never quoted together***

| pair | raw product | **predicted** | **actual** |
|---|---|---|---|
| SGA `double_double 0.5` D + Brunson `points 29.5` D | `14.25×` | `13.25×` | **`13.5×`** |
| Wembanyama `blocks 4.5` D + LeBron `rebounds 9.5` D | `17.25×` | `15.75×` | **`15.5×`** |
| Cunningham `pra 49.5` D + Wembanyama `assists 5.5` D | `26.0×` | `22.5×` | **`22.5×`** |

> 🔑🔑🔑 **THIS IS THE METHODOLOGY `T1`'s LESSONS DEMAND, ACTUALLY EXECUTED.** *`§0.3`'s house-edge
> sanity test and `T1`'s research standard both exist because MLB's costliest errors were models
> that "looked real at first and were later found to be artifacts."* ***A curve fitted on 20 pairs
> and then held to three combinations it had never seen — one exact, two within `0.25×` — is the
> difference between a fitted shape and a law.*** ✅ **Recorded at full strength, because the corpus
> is quick to record defects and slow to record the discipline working.**

## 4. 🔴 **THE CONSEQUENCE, QUANTIFIED — and it runs against the house**

> *"a **naive multiplicative model overstates demon-stack payouts — by ~`13%` at `20×`**."*

⇒ ⚠⚠ ***Any EV computed by multiplying demon factors without the cap is optimistic, and the error
GROWS with the stack.*** **That is the dangerous direction**: it makes the longest-odds slips — the
ones a naive optimiser will reach for first — look better than they pay. 🔑 *`§0.3a`'s "MLB's
costliest single error" was mismatched cells; this is the same class, one layer up.*

## 5. ⚠ **THE GOBLIN FLOOR AS IT STOOD IN `T22`, AND ITS SUPERSESSION**

**As stated in `T22`** *(`2026-09-21`)*: *"**every deepest goblin priced at `2.1×` regardless of
depth**, `17%`–`24%` below standard."*

> 🔴 **SUPERSEDED `2026-09-21T21:47:40Z` — AFTER `T22` AND AFTER `T23`.** *The `2.08×` (`2.1×`
> displayed) floor **does not hold**: More-goblin two-pick quotes with a standard partner from a
> different game paid **`2.0×` on NBA** and **`1.9×`/`2.0×` on WNBA**. Pricing now floors at `1.9×`
> (`pp-leg-v2-sqrt-cap-conservative-floor190`, `goblin_floor_factor` `0.6333`).*
> ▶ **Full record and live verification: `§0g` above, and `§T12.6f`.**
> 📌 ***Recorded here as it stood, with both dates and a pointer — not silently overwritten.*** *The
> rule is `T21` SEG `1303`'s: "document `T3`'s version as it stood, dated, with no hindsight… do not
> let the later knowledge leak backward."* **`T22` believed `2.1×`; the correction came `~26` hours
> after `T22` ended.**

## 6. ⚠ **THE PROBABILITY MODEL WAS A CONTEST, NOT AN ASSUMPTION** *(SEG `647`, `0` prior mentions)*

*Four estimators were coded and compared, not chosen*: **`normal_v1`** · **gamma with the median on
the line** · **gamma with the mean on the line** · **gamma via the Wilson–Hilferty normal
approximation** *(`Φ((x/kθ)^⅓ − 1 + 1/9k) / √(1/9k)`, with `k` solved by `brentq` so the median
matches `μ`)*.

🔑 **Recorded because the corpus documents WHICH model is used and almost never WHICH ALTERNATIVES
LOST.** ⚠ **`NOT RECORDED`: the comparison's outcome and its metric** — *the segment carries the
implementations, not the scoreboard. That is a `T23` question, and it is named here rather than
guessed.*

---

> 📌 **EVIDENCE TIERS** *(clause (iii))*: ⚠ **AS STATED IN `T22`** — every figure in `§1`–`§4` and
> `§6`; *the quotes and the out-of-sample table are verbatim from the transcript, and **this sweep
> did not re-run the fit or re-probe the endpoint***. ✅ **VERIFIED** — the `§5` supersession, against
> the live `pp_slip_rules` row and pricing model at `§T12.6f` *(pinned `2026-09-22T07:01:38Z`/`07:02:02Z`)*.
> 🔴 **`NOT RECORDED`** — the estimator contest's winner and metric; the partner-independence sample
> beyond the single controlled pair. ⚖️ **`pp_*` objects not queried; nothing probed, changed or
> triggered.**

---

# 0.11-T22. 📋 **`T22` — SEVEN MORE, IN POINTER FORM** *(T22 pass 5, §T22.5, 2026-09-23)*

> ⚠⚠ **FORMAT NOTE, AND IT IS THE POINT OF THIS SECTION.** *`§T22.4` measured that prose entries
> cover `~5` transcript segments per pass, and that `T22`+`T23` need `~350` passes at that rate.
> **This section is written in the shape the owner's `T21-1` directive asks for — an assertive claim,
> then exactly where it lives — to test whether the format is the constraint.*** ⚠ **It is NOT the
> full conversion**: the directive says *"do not retro-convert, apply to new work only"*, and its
> precondition *(transcripts reachable)* is still unmet, **so each claim below is stated completely
> enough to act on WITHOUT fetching anything** — the hybrid, not the bare pointer. 🔴 **The full
> change remains `T21-1`, the owner's call.**

| # | the claim — assertive, standalone | where it lives | tier |
|---|---|---|---|
| **①** | 🔑🔑 **THE PROBES FAILED ON A TLS/UA MISMATCH, NOT ON THE ENDPOINT.** *"probe 3 sent a **Chrome 139 user-agent on a Chrome 124 TLS handshake** — the mismatch is a **primary DataDome bot signal**. The working board scraper is consistent: **TLS 124 + UA 124**. No session, so **no DataDome cookie was ever carried**. No warm-up."* ⇒ ***The corpus recorded the wall as "per-endpoint" (`§0.7-T18` §2); it was at least partly self-inflicted, and the fix is a one-line consistency rule that the board scrapers already follow.*** | `T22` SEG `300` | ⚠ AS STATED |
| **②** | ✅ **THE COMPRESSION'S ERROR IS QUANTIFIED, NOT JUST ITS FIT.** Raw product → compressed prediction → actual, with both misses: **`14.25 → 13.25 → 13.5`** *(raw off by `0.75`, compressed by `0.25`)* · **`17.25 → 15.75 → 15.5`** *(`1.75` vs `0.25`)* · **`26.0 → 22.5 → 22.5`** *(`3.5` vs **exact**)*. ⇒ **The naive model's error GROWS with the product — `0.75 → 1.75 → 3.5` — while the compressed model's stays at one display step or better.** | `T22` SEG `262` *(fuller than SEG `301`'s version, which omits the error columns)* | ⚠ AS STATED |
| **③** | 🔴🔴 **A SILENT OFF-BY-ONE COLLAPSED THE EXPERIMENT'S CONDITIONS INTO EACH OTHER.** *"multi-pick compositions mislabeled: **`pick_distinct(pool, 0)` returned ONE leg instead of NONE** — it appended before checking the count. So **'1 goblin, 0 demons' silently became 1 goblin + 1 demon**, collapsing **`1g = 1d = gd`, `2g = ggd`, `2d = gdd`**."* ⇒ ***Runs 1 and 2's multi-pick data were invalid — not noisy, but measuring a different thing than they were labelled.*** 🔑 **This is `T1`'s "looked real at first, later found to be an artifact" class, caught by the experimenter**, and the tell was that distinct conditions returned identical numbers. | `T22` SEG `359`; fix noted at SEG `345` *("run 3… first run with the `pick_distinct` fix")* | ⚠ AS STATED |
| **④** | ⚠ **LEG PROBABILITIES MUST BE DE-COMPRESSED BEFORE USE.** *"leg probabilities come from each leg's 2-pick price vs a standard, **de-compressed first — prices above `9.1×` are themselves compressed and would bias the big demons**."* ⇒ **Applying the inverse of `§0.10-T22`'s cap is a REQUIRED step in deriving a per-leg probability, and skipping it biases exactly the legs where the money is.** | `T22` SEG `358` | ⚠ AS STATED |
| **⑤** | 🔴 **THREE OF THIS CORPUS'S OWN CLAIMS WERE AUDITED AGAINST MEASUREMENT AND TWO DID NOT SURVIVE.** *"document says" vs "measured":* **(a)** *"pricing is a discrete step function per tier; goblin pays flat"* → 🔴 **only the DEEPEST goblins are flat** *(at the then-believed `2.1×` floor)*; the rest are **priced per line**. **(b)** *"PrizePicks discounts same-game `35-40%`"* → ⚠ **NOT OBSERVED for opponent pairs** — *it is an **MLB figure**, and **teammates were untested***. **(c)** *"season opens `2026-10-03`"* → 🔴 **the preseason date** *(the error `§T10.18b` corrected; see `NBA_OPEN_ITEMS.md`)*. ⇒ **`§0.2f` ("PrizePicks discounts same-game correlation — build CROSS-GAME by default") rests on an MLB number that NBA opponent pairs did not reproduce.** ⚠ *This does not overturn `§0.2f` — cross-game remains the safe default — **but its stated magnitude is not an NBA measurement and should not be quoted as one.*** | `T22` SEG `303` | ⚠ AS STATED |
| **⑥** | ⚠ **THE FLEX GRID IS COARSE AND ITS COARSENESS IS THE MEASUREMENT FLOOR.** Full-payout grid: **`0.1` steps `1.2×→2.0×` · `0.2` to `4.0×` · then `4.5`, `5.0` · whole numbers `5–12` · then `14, 16, 22`.** ⇒ **Above `5×` the display quantises to whole numbers, so "predicted vs actual" agreement there is worth at most ±0.5 — which is why `§0.10-T22`'s out-of-sample table calls `15.75 → 15.5` a hit.** | `T22` SEG `358` | ⚠ AS STATED |
| **⑦** | ⚖️ **THE OTHER CHAT ASKED FOR ITS FINDINGS TO BE FOLDED INTO THESE TWO DOCUMENTS.** *"these findings live only in this conversation. the documentation sweep won't reach this session for a long time. I'd write them to a new file — `nba/pp_payout_findings.md` — **separate from the twelve documents cowork is editing, so there's no collision**"*, and that file's own header: *"separate from the 12 mandated documents; **fold into `nba_multipliers.md` and `nba_goblin_demon.md` when the documentation sweep reaches this session**."* ⇒ 🔑 **The sweep HAS now reached this session — and it folded in the TRANSCRIPT, not the file.** *See `§T22.5` for why that distinction is the correct one and why the file stays untouched.* | `T22` SEG `259`, `299` | ✅ VERBATIM |

> 📌 **TIERS**: ⚠ **AS STATED IN `T22`** throughout; ✅ **VERBATIM** where quoted. **Nothing here was
> re-probed** — `/game_types` is a live call against a real-money account. ⚖️ **`pp_*` objects not
> queried; `PP_PAYOUT_FINDINGS.md` not read, not edited, not used as a source.**

---

# 0.12-T22. 🔑🔑🔑 **THE HOUSE EDGE IS A FLAT `25%` ON BOTH SLIP TYPES — AND `§0.3`'s "QUOTE CONFIRMATION, NOT OPTIONAL" IS DISCHARGED** *(T22 pass 6, §T22.6, 2026-09-23)*

> ⚠ **READ WITH `§0.3` AND `§0h-T22`.** *`§0.3` set the ordering — **"calibration first (done),
> selection second, quote confirmation third — free, and not optional"** — and said *"no EV or ROI
> claim can be believed until a real slip-builder quote confirms the factor."* ***`T22` is that quote
> confirmation. It was performed on `2026-09-21` against `160` stratified `alt×alt` pairs.***

## 1. ✅✅ **`is_adjusted` — THE FIRST DIRECT SERVER-SIDE EVIDENCE OF A MECHANIC THIS DOCUMENT ONLY EVER INFERRED** *(SEG `33`)*

**The payload, structure first**: `payouts: {"<n_picks>": {"<n_correct>": multiplier}, "is_adjusted": bool}`

| slip type | 2-pick base rate |
|---|---|
| **Power Play** | `2/2` correct → **`2.2×`** |
| **Flex Play** | `2/2` → **`1.8×`** · `1/2` → **`0.25×`** |
| both | **`is_adjusted: true`** |

> 🔑🔑🔑 ***"`is_adjusted` is the switch we'll learn from. **The server is explicitly telling you this
> combination's payout was MODIFIED FROM BASE.** That flag is the **first direct evidence of the
> goblin/demon adjustment that everything in `nba_multipliers.md` has only ever INFERRED**."***
> ⇒ **Everything in `§0.1`, `§0.2` and `§0.2c` about goblin/demon payout adjustment was read off
> observed slips and reasoned backwards. The server states it as a boolean.** ✅ *And `§0.2b`'s Flex
> mechanic at 2 picks — documented as observed — is now confirmed in the server's own response.*

## 2. 🔑🔑🔑 **THE HOUSE EDGE, MEASURED — AND IT IS THE SAME ON BOTH** *(SEG `357`, run 2, `160` stratified `alt×alt` pairs)*

| | EV |
|---|---|
| **Power** | **`0.748`** |
| **Flex** | **`0.747`** |

> ⇒ ✅✅ ***A FLAT `25%` EDGE, IDENTICAL ACROSS SLIP TYPES.***
> 🔑 ***"Flex does not make or lose value versus Power — **it REDISTRIBUTES the same expected value
> into a consolation**."***
> ⚠ **AND IT COMPRESSES AT THE TOP LIKE POWER DOES**: *"tiers `1.25` and `1.5` sit at **EV
> `0.66–0.68`**"* ⇒ **the deepest consolations are worse than the flat edge, by `7–9` points.**

> 🔴🔴 **WHAT THIS SETTLES, AND IT IS `§0.2d.2`'s CENTRAL QUESTION.** *`§0.2d.2` is titled **"Flex can
> flip an EV-negative Power pool positive — IN PRINCIPLE."*** ⇒ ***Measured: it cannot, by
> construction. The two run on one edge. Flex changes the SHAPE of the return, never its
> expectation*** — *so any strategy that reaches for Flex expecting free EV is reaching for a
> redistribution.* ⚠ **`§0.2d.2`'s arithmetic is not wrong — its premise (that the two pools could
> carry different edges) is what the measurement removes.**

## 3. ✅✅ **AND THE OPEN QUESTION FROM `§0h-T22` IS ANSWERED — BY EXACTLY THE EXPERIMENT IT CALLED FOR**

**`§0h-T22` §4** recorded a failed hypothesis *and* the reason it could not have succeeded, closing:
***"cracking the rule needs `alt×alt` slips."*** **Run 2 ran `160` of them.**

| candidate driver | how well it sorts the tiers |
|---|---|
| `p(both hit)` | **`~75–77%`** |
| `p(both miss)` | **`~75–77%`** |
| the Power payout | **`~75–77%`** |
| 🔴 `p(exactly one)` — *the failed hypothesis* | 🔴 **`15.6%`** |

> ⇒ 🔑🔑🔑 ***THE TIER IS DRIVEN BY RISK.*** *"`p(both hit)`, `p(both miss)` and the power payout
> **each sort the tiers at ~75–77% — they are ONE UNDERLYING QUANTITY**."*
> ⇒ **`p(exactly one)` is excluded at `15.6%`, definitively** — *"run 1 could not test this: whenever
> one leg is a standard at `50%`, `p(exactly one)` is `0.50` regardless. **Run 2's `alt×alt` pairs,
> where it varies, settled it.**"*
> ✅✅ ***This is the cleanest worked example of the research standard in the corpus: a hypothesis
> rejected, the rejection diagnosed as under-powered, the discriminating experiment SPECIFIED, then
> RUN, and the answer carried a quantitative separation of `77%` against `15.6%`.***

**And the tier ladder is longer than `§0h-T22` recorded**: consolation steps by `0.25` across
**`0.25 · 0.5 · 0.75 · 1.0 · 1.25 · 1.5`** — *two rungs beyond the four seen in run 1.*

---

> 📌 **TIERS**: ⚠ **AS STATED IN `T22`** — all figures; quotations verbatim. **Not re-probed by this
> sweep.** 🔴 **`NOT RECORDED`** — what the single risk quantity IS, in closed form *(three proxies
> sort it equally well; the transcript does not name the underlying variable)*; and the `alt×alt`
> `EV = 0.747/0.748` is measured **on `alt×alt` pairs specifically**, so whether the flat `25%` holds
> on standard-containing slips is **not** established here. ⚖️ **`pp_*` objects not queried.**

---

# 0.13-T22. 🔑🔑 **THE PER-LEG PRICING MODEL AND THE KEY THAT COMPRESSES TWO SEASONS `256×`** *(T22 pass 7, §T22.7, 2026-09-23)*

## 1. 🔑🔑🔑 **THE PER-LEG LAW, WITH ITS FITTED CONSTANTS** *(SEG `466`)*

> *"per leg: **PrizePicks prices each line as the probability of beating it under a count
> distribution centered on the STANDARD line, with spread `c × √(standard line)`**"*

| family | `c` *(`T22`, `≈`)* | 🔴 **`T23` SEG `487`, fitted, LATER THE SAME DAY** |
|---|---|---|
| **points family** | **`2.0`** | **`1.87`** |
| **rebounds · assists · threes** | **`1.25`** | **`1.08`** |
| **rebounds + assists** | **`1.4`** | **`1.34`** |

> ⚠⚠ **TWO CONSTANT SETS, BOTH RECORDED, NEITHER ASSERTED AS CURRENT** *(added T23 pass 3, `§T23.3`
> §4, 2026-09-23)*. *`T22`'s are prefixed **"`c ≈`"** and `T23`'s are **fitted values** from the
> WNBA comparison run, so a REFIT is the obvious reading — **but the sweep does not assert it.***
> 🔴 **`NOT RECORDED`: whether `T23`'s constants supersede `T22`'s or parameterise something
> different.** ⇒ ***Both are kept with their dates and sources; the twelve must not carry two
> constant sets as if both were current.*** 🔴 **OWNER/BUILD: which set is live?** ▶ **`§T23.3` §4.**

⇒ 🔑 ***The model is not fitted to the payouts — it is fitted to a DISTRIBUTION, and the payout falls
out of it.*** **That is why `§0.10-T22`'s compression is a separate, higher-level correction: the
per-leg price comes from the distribution, and the slip price then compresses above `9.1×`.**
⚠ **Two layers, two fits, and they are independently checkable** — *which is what made the
out-of-sample test at `§0.10-T22` §3 meaningful.*

## 2. 🔑🔑🔑 **THE KEY-GRANULARITY PRINCIPLE, AND IT IS THE RIGHT ONE** *(SEG `470`)*

> *"the key must be built from **the leg's RAW FACTS, not from my model's parameters**. Everything
> I've found says a leg's price is determined by **four observable things: the STAT, the STANDARD
> LINE, the LEG's LINE, and the SIDE**."*

> ⇒ ✅✅ ***A key made of observations survives a model change; a key made of model parameters does
> not.*** **This is the implementation of the owner's design at `§0.9-T22` §5** — *"the price is
> centralized in the db and the price ids are tagged on each leg"* — **and it is what makes his
> stated purpose achievable**: *"if multipliers change, we just change them on the database instead
> of changing all multipliers on 2 seasons of data."* 🔑 *Had the key carried `c`, or `λ`, or the
> goblin floor, every refit would have invalidated every tag.*

## 3. ✅ **THE COMPRESSION, AND IT CROSS-CONFIRMS AGAINST THE LIVE DATABASE** *(SEG `491`)*

| | |
|---|---|
| legs | **`2,199,354`** |
| distinct price ids | **`8,573`** *(`6,945` goblin/demon + `1,691` standards at factor `1`)* |
| **reduction** | 🟢 **`256×`** — *"two full seasons of PrizePicks pricing live in a table the size of a spreadsheet"* |

> ✅✅ **CROSS-CONFIRMED, and this one is not "as stated".** *My own independent `SELECT` at
> `2026-09-23T02:22:06Z` (`§0.9-T22` §4) returned **`prizepicks` = `2,199,354` rows in
> `nba_market.board_snapshots`.*** ⇒ ***The transcript's leg count and the live table agree
> EXACTLY, two days apart, from two different queries.*** **That is a genuine verification of the
> population the whole pricing build rests on.**

## 4. ✅✅ **AND THE COUNT CAUGHT A DEFECT — WHICH IS THE OWNER'S OWN DESIGN CLAUSE PAYING OUT**

> *"the count also caught a consistency problem worth surfacing now: **at least `63` keys are tagged
> STANDARD on some legs and GOBLIN/DEMON on others. One price id must mean one kind.** The build will
> **FLAG these rather than silently pick one** — that's exactly the kind of mistake the design should
> expose."*

> 🔑🔑🔑 **THIS IS `§0.9-T22` §5's LAST CLAUSE PAYING OUT.** *The owner asked for granularity
> *"to cover all we know and **also leave space for possible mistakes**."* ⇒ ***A key that can be
> INCONSISTENT is a key that can be CAUGHT being inconsistent. The `63` are the design working as
> specified, one day after it was specified.*** ~~⚠ 🔴 **`NOT RECORDED`: whether the `63` were
> subsequently resolved, and how.** *A `T23`/`T24` question — named, not assumed.*~~
>
> ## ✅✅ **RESOLVED `2026-09-22` — AND THE FIX IS IN THE KEY, EXACTLY WHERE THE DESIGN SAID IT SHOULD BE** *(recorded `§T24.1` §6, 2026-09-23)*
> **`T24` §5.1, engineering fix 2**: *"the first price table was **keyed WITHOUT `kind`**; **`34` of
> `2.19 M` key-snapshot groups carry the same line as two kinds** (`19` universe legs exposed), **so
> the price picked was ARBITRARY** — flags moved **`153 → 158` between refreshes**. Now **`kind` is
> in the primary key**, ties break window-snapshot-first then **lower factor**, and each leg takes the
> price matching its PrizePicks kind (else the lowest, **so no leg is dropped**). `1,289,896` price
> rows."* ⇒ ✅ **`T24`'s final audit reports `kind_price_mismatch` = `0`.**
> 🔑🔑 **NOTE WHAT THE SYMPTOM WAS**: ***the flag count MOVED BETWEEN IDENTICAL REFRESHES — `153 → 158`.***
> **A build that is not reproducible is the tell, and it was caught by running it twice.**
> 🔑 **And the remedy honours the granularity principle** *(§2 above)*: the defect was that the key
> omitted one of the leg's **raw facts**, and the fix was to put it back — **not to add a
> model parameter or a tie-break heuristic on top.**
> ⚠ **`AS STATED IN T24`** *(SECONDARY source; the `pp_*` tables were not queried by this sweep).*

## 5. ⚠ **TWO POPULATION FACTS THAT SHAPE ANY BACKFILL** *(SEG `466`)*

- 🔑 **`2025-26` carries about `3×` the ALTERNATE volume of `2024-25`** — *"PrizePicks expanded its
  ladders"* ⇒ ***any two-season backfill is DOMINATED by last season***, and a model fitted across
  both is effectively weighted to the wider ladders. ⚠ **A sampling fact with consequences for every
  two-season average in this corpus.**
- ✅ **`zero` Under rows on alternates across both seasons** — `1.45 M` alternate rows, every one
  `More`; standard lines carry both sides. *(Already on file at `7` hits — **killed as a finding**,
  recorded here only because it is the premise of the point above.)*

## 6. ⚠ **THE STATE-RESOLUTION CONSTRAINT ON ANY COLLECTOR** *(SEG `144`)*

> *"**payouts depend on which state the app resolves to** — that's why you're seeing `prizepools`.
> **The collector has to resolve to the state you actually play in, or it maps somebody else's
> pricing.**"* — and, on the obvious shortcut: *"**not recommended: a headless browser in the
> cloud.** DataDome is built to catch exactly that, and **pushing a real-money session through a
> datacenter IP at a different location is the pattern that gets accounts frozen.**"*

⇒ 🔑 ***A payout map is only valid for the jurisdiction it was collected in.*** **Any future
collection design must pin the state, and the `game_mode: "prizepools"` in `§0.9-T22`'s body is the
observable that records which one.**

---

> 📌 **TIERS**: ✅ **VERIFIED** — the `2,199,354` leg count *(independent live `SELECT`, `§0.9-T22` §4)*.
> ⚠ **AS STATED IN `T22`** — the `c` constants, the `8,573`/`256×` reduction, the `63` inconsistent
> keys, the `3×` alternate-volume ratio, the state constraint. 🔴 **`NOT RECORDED`** — how the `63`
> were resolved; whether `c` was re-fitted after the goblin-floor correction. ⚖️ **`pp_*` objects not
> queried; nothing probed or changed.**

---

# 0.15-T23. 🔑🔑 **THE WNBA FIT TABLE IN FULL — WITH THE MATCH RATE, AND CONSTANTS FOR THREE STATS NBA DOES NOT PRICE** *(T23 pass 4, §T23.4, 2026-09-23)*

*`T23` SEG `493`, the fuller version of `§T23.3` §3. **First WNBA map: `2026-09-21`, `10:41–10:55 AM
PT` — `400` quotes, `337` per-leg prices; `250` anchored by a same-board standard, `87` excluded for
having none.** NBA's **v2** constants against a fresh WNBA grid fit of `c` **under the same v2
formula**. All four blocks below score `0` in both trees.*

| stat | legs | **NBA `c`** | **WNBA `c`** | 🔑 **NBA `c` within 1 step** |
|---|---|---|---|---|
| points | `53` | `1.87` | `1.88` | **`62%`** |
| pts+rebs | `27` | `1.87` | `1.86` | **`67%`** |
| pts+rebs+asts | `32` | `1.87` | `1.94` | **`56%`** |
| pts+asts | `26` | `1.87` | `1.78` | ⚠ **`42%`** |
| 🔴 **rebounds** | `32` | `1.08` | **`1.32`** | 🔴 **`28%`** |
| 🔴 **assists** | `17` | `1.08` | **`1.28`** | 🔴 **`35%`** |
| **rebs+asts** | `24` | `1.34` | `1.46` | `50%` |
| 🟢 **`fg_attempted`** | `14` | 🔴 **— none** | 🟢 **`1.22`** | — |
| 🟢 **`fantasy_score`** | `14` | 🔴 **— none** | 🟢 **`2.08`** | — |
| 🟢 **`3pt_attempted`** | `8` | 🔴 **— none** | 🟢 **`1.16`** | — |

## 1. 🟢🟢 **THE OWNER'S PURPOSE WAS SERVED — THREE CONSTANTS FOR STATS NBA HAS NONE FOR**

*The instruction* (`§T23.1` §4) *was: "use the ones that are available for women NBA and are **not
available for men NBA** and **complete the gaps**."* ⇒ ✅ **`fg_attempted` `1.22`, `fantasy_score`
`2.08`, `3pt_attempted` `1.16` are exactly that** — **`36` legs of evidence across three stats the
NBA board does not currently price.**

🔑 **And `fantasy_score` at `2.08` is the highest constant in the table**, above the points family's
`1.87` — *consistent with a composite having wider dispersion than any of its parts, which is what
the `c × √(line)` form would predict.* ⚠ **`14` legs is a small fit and is stated as one.**

## 2. 🔴🔴 **THE MATCH RATE IS THE COLUMN THAT MATTERS, AND IT IS SOBERING EVEN WHERE IT "TRANSFERS"**

> **`62%` is the BEST single-stat agreement**, on points, where the constants match to `0.01`.

⇒ ⚠⚠ ***Even where the constant transfers exactly, NBA's `c` predicts the WNBA payout within one
display step only about two times in three.*** **That is a precision ceiling on the whole per-leg
pricing approach, and it is measured here for the first time.** 🔑 *It reframes "the points family
transfers": the FAMILY transfers, the individual PRICE is right `~⅔` of the time.*
🔴 **And where it fails it fails hard — `28%` on rebounds** *(a coin flip would do better on a
3-outcome question)*.

## 3. ✅ **REFITTING PER LEAGUE CUTS THE ERROR BY `4–5×`**

> *"rebounds and assists do not [transfer] — **refit error `~17–20%` → `~4%`**; league-specific."*

⇒ **A per-league refit is worth `~4–5×` on the families that don't transfer**, which is the
quantitative case for *"league-specific"* rather than a shared constant. ⚠ **`NOT RECORDED`**:
whether the NBA constants were themselves refit at the same precision, or whether `~4%` is the floor.

## 4. ⚠ **AND THE PARAMETERISATION IS NAMED: "NBA's `v2` constants… the same `v2` formula"**

🔑 *This is the first place in the corpus where the constant set is version-labelled.* ⇒ **It
supports the refit reading of the `T22`/`T23` discrepancy flagged above** *(`§0.13-T22`)* — **but
"v2" is not tied to a date or a model version here**, so 🔴 **`NOT RECORDED`: what `v2` is, and
whether `T22`'s `≈2.0/1.25/1.4` is `v1`.**

---

> 📌 **TIERS**: ⚠ **AS STATED IN `T23`** — every figure; **not re-run by this sweep**, and the WNBA
> table was not read *(it is the other session's object)*. 🔴 **`NOT RECORDED`** — what `v2` denotes;
> whether NBA was refit at the same precision; the WNBA playoff end date that bounds any further
> mining *(`§T23.3` §5)*. ⚖️ **`pp_*` objects not queried.**

---

## 🆕 §T32.3 — **WHAT THE SLIP PROGRAM'S FIRST NIGHT ESTABLISHED ABOUT MULTIPLIERS AT SLIP LEVEL** *(source `T32`, `2026-09-28/29`, recovered transcript; AS STATED from the build chat's `NBA_SLIP_BUILDING_STRATEGY.md` `§7a`–`§7i`, `§13b`, `§13e` — that file's numbers are not re-run here; recorded `2026-10-10`)*

🔑 **The governing rule, imported from MLB and then corrected the same night**: *every Power payout reduces to the per-leg product `p × m`* (recalibrated hit probability × the leg's real multiplier) — **if `p·m < 1` no size, cap or signal turns a Power slip positive** *(strategy `§6a`)*. ⚠ **Gemini's correction, adopted: this is POWER-ONLY.** Flex pays partial hits, so its EV is the full distribution `EV = Σ_k P(exactly k of N) · payout_k` over all `2^N` hit/miss combinations — a `p·m<1` pool can still be a +EV Flex slip *(`§6e`)*.

**The PrizePicks tables the program priced against** *(queried from `nba_market.pp_flex_standard_payout` and the Power tiers; ✅ consistent with this file's own `3/6/10/20/37.5×` rows above)*: Flex 6 = `25×`/`2×`/`0.4×` · 5 = `10×`/`2×`/`0.4×` · 4 = `6×`/`1.5×` · 3 = `3×`/`1×` · 2 = `2×`/`0.5×`.

| per-leg break-even, **identical legs** *(from the real functions)* | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|
| **Power** | `0.58` | `0.56` | `0.57` | `0.55` | `0.55` |
| **Flex** | `0.62` | `0.58` | `0.56` | `0.55` | `0.55` |

- 🔴 **REFUTED on the real tables**: the web/Gemini claim that *Flex has the lowest break-even* — for identical legs Flex's break-even is **≥** Power's; the published "6-Flex break-even `54.2%`" does not reproduce. **(WRONG, corrected by the T50 deep pass, 2026-10-26: ~~Flex's break-even is never below Power's; the 6-Flex 54.2% does not reproduce; table 0.56 / 0.57 / 0.56~~ -> solving EV = 1 on the verified tables, Power for 2 / 3 / 4 / 5 / 6 picks = 0.5774 / 0.5503 / 0.5623 / 0.5493 / 0.5466 and Flex = 0.6180 / 0.5774 / 0.5503 / 0.5425 / 0.5421. Flex needs a higher hit rate than Power at 2 and 3 picks and a LOWER one at 4, 5 and 6 picks; the published 6-Flex 54.2% reproduces. In the table above the 3-pick Power 0.56 should read 0.55, the 4-pick Power 0.57 should read 0.56 and the 4-pick Flex 0.56 should read 0.55. Source: subagent re-read of 10-22; same figures as the T50.3.1 line "Per-structure breakeven leg rates". The same wrong claim sits in COMPASS fact 91, which is not edited here.)**
- ✅ **Where Flex DOES win — heterogeneous legs** *(`§7e`)*: a 5-pick with one `0.72` anchor beats Power under Flex while the four satellites sit below **`~0.535`** (at `0.51`: Flex `+3.6%`, Power `−2.6%`); above it Power wins. ⇒ ***choose the slip type per candidate slip from the two real EVs, never globally.***
- **Size** *(`§7h`–`§7i`, Power ladder `3/6/10/20/37.5×`)*: at a realized `p = 0.61`, raw EV climbs with size (`+11.6% / +36.2% / +38.5% / +68.9% / +93.2%` for 2–6 picks) but the **Kelly fraction peaks at 3 picks** (`5.82% / 7.24% / 4.27% / 3.63% / 2.55%`); win frequency falls `37% → 23% → … → 5%`. At `p = 0.55` almost nothing clears.
- **Voids are a size reduction, not a loss** *(`§7f`)*: on `prop_universe` void/DNP `1.50%`, push `0.58%`; PrizePicks drops a voided leg and prices the slip one size down — the existing `nba_market.pp_power_after_voids(factors[], live)` already does this. **Never grade a void or push as a miss.**
- **Payout convention in force** *(`§7a`, config `board_payout_conversion_rules`, "verified against app screenshots + 19 placed slips `2026-09-10`")*: slip multiplier = **product of leg multipliers** (the real `2–8%` slip-level haircut left out, so the model is conservative); Sleeper `1+(dec−1)×0.95`; Underdog `decimal(American)×0.963` — ✅ the same two constants this file already records.
- 🔴 **Goblins at slip level** *(`§7p`, `§13b`)*: realized `0.71–0.74` hit but per-leg `m ≈ 0.65–0.73` ⇒ `p·m ≈ 0.48–0.52`; **all-goblin 3-pick Power, `2,011` real slips: `−86.2%` ROI.** Gemini's "+611% goblin Flex" used the **slip** payout (`6×`) for goblins that are priced **per leg** (`~0.7×`, product `~0.26×`) — refuted on real data. → `NBA_GOBLIN_DEMON.md` `§T32.4`.
- ⚠ **Every slip ROI produced in `T32` (`+8.9%` 2-pick, `+23.9%` all-combos 3-pick, `+101%` 4-pick at `cal_p ≥ 0.62`, Flex-5 `+132%`) is a `T32`-era figure** — *the pool those numbers ran on is examined again in `T33`; read them with the supersession note `§T33` adds, not as current.* 🔴 **`T33` VERDICT (`2026-09-29`)**: those pools held **`48%` simulated-line legs** and **`~14%` legs PrizePicks never posted at the window** — the ROI levels are **void**; the break-even table, the Flex/Power crossover rule, Kelly-by-size, the void rule and the goblin pricing above are arithmetic on real payout tables and **stand**. (`NBA_MASTER_SUMMARY.md` `§T33.0`.)

---

## 🆕 §T33.3 — **UNDERDOG'S OFFICIAL PAYOUT TABLE, AND WHAT `× 0.963` ACTUALLY APPLIES TO** *(source `T33`, `2026-09-29`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§15a`–`§15b`, sourced there to `help.underdogsports.com` "updated this week"; recorded `2026-10-10`)*

**Underdog (Pick'em), official, `2026-09-29`**:
| picks | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|
| **Standard** (all hit) | `3.5×` | `6.5×` | **`12×`** | `20×` | `35×` | `65×` | `120×` |
| **Flex** all hit | — | `3.25×` | `6×` | `10×` | `25×` | | |
| **Flex** one miss | — | `1.09×` | `1.4×` | **`2.5×`** | `2.6×` | | |
| **Flex** two misses | | | | | `0.25×` | | |
⇒ **On identical legs Underdog pays more than PrizePicks at every size that matters**: 4-pick `12×` vs PP Power `10×` (`+20%`), 3-pick `6.5×` vs `6×`, 5-pick Flex one-miss `2.5×` vs `2×`.

🔴 **SCOPE CORRECTION TO THIS FILE'S `× 0.963` RULE**: on the real UD window board, **every MAIN-line leg** for `turnovers`, `steals`, `blocks`, `blocks_steals`, `points`, `rebounds`, `assists`, `threes` carries a per-leg modifier of **exactly `1.0×`**; the sub-1.0 board average (`0.974`, P10 `0.83`) comes **entirely from alternate/ladder rungs**, which are separate rows. ⇒ **`board_payout_conversion_rules`' "UD = `decimal(American) × 0.963`" applies to Underdog's ALTERNATE rungs (priced by odds), not to its main lines** — read the `0.963` rows above with that scope. *(The `§`'s own sentence: "consistent with the above; main lines are 1.0×.")*

**Coverage — the catch**: UD lists the defensive props on only **`~11–20%`** of the player-days PrizePicks does (turnovers `829` of `4,053`; steals `403` of `3,402`; blocks_steals `441` of `3,845`; blocks `192` of `1,956`), and where both list a player **the line is identical (`100%`; UD never lower)**. ⇒ ***Underdog is a payout upgrade on the ~15% of legs it shares with PrizePicks, not a separate pool*** — build from the PP pool; place on UD when every leg is also there at the same line.

**App restrictions** *(`§15b`, official pages)*:
| | PrizePicks | Underdog |
|---|---|---|
| same player twice | ❌ | ❌ |
| teams per entry | same-game / same-team **allowed**, ~~no extra pricing on standard Flex/Power~~ (superseded by §T50.3.4, 2026-10-21: PrizePicks cuts some same-game lineups: Power 2.8 / 5.75, 3-/4-Flex 3/0.75 and 5/1.25) | **≥ 2 teams** |
| sizes | Flex `3–6`, Power `2–6` | Standard `2–8`, Flex `3–8` |
| void / tie | the leg drops, the entry shrinks one size (`pp_power_after_voids`) | ties/voids shrink the entry |
| correlation | — | **"correlated projections can modify your payout"** — a builder-time shift, readable only at placement |
🔑 **The one structural block this adds**: `stocks` = blocks + steals **contains** `steals` and `blocks` — a player's steals leg and stocks leg must never share a slip (measured same-player covariance `+0.032`, the only non-zero pair in the defensive family — `§15c`).

---

## 🆕 §T34.3 — **"PP DOES NOT EVEN PROVIDE MULTIPLIERS": THE SLIP PROGRAM'S PRICING, CORRECTED BY THE OWNER, THEN BY ITS OWN FOURTH PASS** *(source `T34`, `2026-09-30`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§19l`, `§19m`, `§23b`, `§24b`, `§26b`, `§29c`; ✅ = live `2026-10-10`)*

**The owner's two rulings (`2026-09-30 01:07Z / 01:08Z`, verbatim):** *"the full 2 seasons should use the current multipliers we have now, because the boards, legs, outcomes do not change, but the prices must reflect the current moment and reality"* · *"i believe you priced it with current knowledge of multipliers, because PP does not even provide multupliers, it should be on the documentation"*. Both were already true in the repo (`PP_PAYOUT_FINDINGS.md` §1/§9 — out of scope here, read-only cross-reference); the build chat had not read it before pricing.

**What the slip program had done wrong, and the rule it adopted (`§19m`):**
| | before | after |
|---|---|---|
| tier key | its own rank-distance inside a kind | **the system's tier** from `nba_market.pp_leg_price` (`anchor_line`, signed `tier`, `position_vs_anchor`); rescued-anchor legs (`tier = 0`, no Regular line) tiered from `line − anchor_line` |
| price | per-line prices **averaged into a tier mean** | **the per-line `factor` at the window snapshot** — *"PP prices per LINE, not per tier — only the deepest goblins sit on a flat 2.1× floor"* |
| break-even | a tier-average multiplier | **per leg**, from its own current price (`p_be = 0.55 / m` for a 3-pick Power) |
*The level had been current all along (its `factor` was this same model's output, leg for leg) — "the tier key and the averaging were wrong."* ✅ **Live**: `pp_leg_price` carries **one** `model_version`, `pp-leg-v2-sqrt-cap-conservative-floor190`, on both `window` (`1,168,508`) and `close` (`1,170,012`) legs.

**Facts the corrected map measured (all `AS STATED`):** Regular factor **exactly `1.000`** on all `311,160` Regular legs; goblins `0.614–0.934` (G1 avg `0.756`, G2 `0.698`, G3 `0.661`; floor `0.614` = the documented flat deepest-goblin floor); demons D1 `1.44` / D2 `1.71` / D3 `2.43` avg, max `5.76`; **`120` demons (`0.02%`) priced `0.96–0.99`** — half a point above the anchor, near-standard, never selectable as demons (`§19n`; `152` of `426,776` at `≤ 1.0` in `§24`'s invariant). **`implied_p × factor ≈ 0.5` with zero anomalies** — PP prices every goblin/demon so its implied probability times its multiplier is about one half (`§23b`, `§24`).

🔴 **PP lowered its demon payouts between seasons** (`§19l`) as it deepened the ladders: points D1 `1.46 → 1.22`, rebounds D2 `2.29 → 2.02`, assists D1 `1.50 → 1.26` (`§24a`); Regular stays `1.00`, goblins ~flat. ⇒ ***"The live-season gate must re-read the tier multipliers, not assume last season's."***

🔴 **The fourth certification pass, on external facts (`§24b`)** — *"a fourth run of the same 52 invariants would have passed again and proved nothing new: the list checks the system against itself"*:
1. **The payout table.** PrizePicks' support article (*"Payouts Explained"*) and two third-party sources showed **3-pick Power `5×`** (per-leg break-even `0.585`, not `0.55`). PrizePicks' own live *Ways to Pick* page showed: **Power `3`-pick `6×`, `4`-pick `10×`, `5`-pick `20×`, `6`-pick `37.5×`; Flex `4`-pick `6×/1.5×`, `3`-pick `3×/1×`, and a new `2`-pick Flex `2×/0.5×`** (*"live since 2026-09-18"*). ⇒ *the support article is stale*; the `0.55` bar stands. Invariant `L10.power_table_matches_live_page` added (fetch + compare).
2. **The slip payout rule.** Every mixed goblin/demon slip had been priced `base × Π(leg factors) × 0.95` — **the `0.95` haircut was the build chat's own number.** Replaced by the repo's measured compression (`0.10-T22` above): `payout = product` up to `9.1×`, then `9.1 × (product/9.1)^0.857`, with *"real 4-pick demon-heavy slips paid 15–29% more than even that."* Invariant `L10.slip_compression_rule_matches_oos_quotes` (reproduces the three OOS quotes within `1.6%`). ⇒ ***"price every slip with the compression rule, never a plain product, and never a flat haircut."***

**Structure findings that are pricing facts:** the **2-pick Flex `2×/0.5×` is out** — *"the 2×/0.5× table does not reward a 0.62 leg"* (core 2-Flex `+16%` / `−2%`; 2-pick Power thin but positive, `§26b`) · **two goblins hurt every structure** (*"the factor product ~0.5 crushes payout"*) while one goblin as the 5th leg of a 4-Regular Power lifts `+109% → +148%` (`§23b`; → `NBA_GOBLIN_DEMON.md` `§T34.2`) · **voided legs revert the slip to the smaller size per PrizePicks' `payouts_srp` rule; a slip left with `< 2` legs is refunded** — written into the live engine (`§29c` #4), replacing *"staying ungraded forever."*
⚠ **Same-game pricing, NBA vs MLB** (`§28a`): MLB measured PP discounting same-game slips `37%`; NBA's own real quotes show **opponent** same-game pairs at `3.0/3.0/2.9×` (no meaningful discount; superseded by §T50.3.4, 2026-10-21: standard same-game Power is cut on some lineups, 2-pick to 2.8 and 3-pick to 5.75) and **teammate pairs untested on NBA** ⇒ the engine bans teammate same-game pairs (V6) and allows opponents. → `NBA_OPEN_ITEMS.md` `T34-6`.

---

## 🆕🔴 §T36.3 — **THE UNDERDOG PAYOUT FORMULA, SOLVED FROM SCREENSHOTS + THE LIVE BOARD (`2026-10-02/03`) — AND THE `× 0.963` RULE SUPERSEDED** *(source `T36`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§30a`–`§30i`; sourced there to Underdog's help center "Pick'em Standard & Flex Entry Payouts", the owner's ten MLB-slip screenshots, a fresh scrape of Underdog's MLB board, and Gemini; ✅ = live `2026-10-10`)*

**Owner's order of work (`04:36Z`, verbatim)**: *"The multipliers for UD and slip structure differ to pp. you need to first look at the mob reference … Then exhaustive online research and Gemini insight to be sure you have the proper formula. Only after that we continue."* Then: *"you already have a bunch of screenshots … that should be enough"* · *"Do another complete pass, double check and certification before moving on."*

**The path, with its wrong turns kept (the build chat's own section-status map, `§30i`)**: `§30a` read the Odds-API feed's Underdog price as **`√3 ×` the multiplier** (an *encoding* — right, and now the exact recovery rule) and guessed *"table × product of multipliers"* · `§30c` read the MLB reference (`MULTIPLIER_TABLES_MASTER.md` §6 — *dynamic per-leg pricing; a flat discount disproven; six real 4-pick `RBIs 0.5 lower` entries paid `1.82–2.28×`*) and concluded *table × modifiers* · **`§30d` RETRACTED** — it compared against `decimal_price`, *"a different product's price"* · `§30e` superseded *(🆕 pass 32, the `10-03 04:57Z` reply, AS STATED: three more owner slips read as the independent-game shading **`0.967` / `~0.88` / `~0.84`** for 2 / 3 / 4 picks (*"roughly 0.96 per pick"*), same-game picks discounted (one kept *"only 77% of his price"*), Flex top tiers at *"about 43–50% of the maximum for 3 picks, 58–60% for 4, 54% for 5 and 73–76% for 6"*; it proposed capturing the app's own payout request (*"copy it as cURL"*) to fit the shading exactly — overtaken twenty minutes later by `§30f`'s formula from the same screenshots)* · **`§30f`–`§30h` current, certified in `§30i`.**

**THE FORMULA (`§30f`)**
- A pick's displayed price is its **fantasy decimal where it has one, otherwise its `decimal_price`**; its **modifier `mᵢ` = ½ ÷ Underdog's probability for that side**, rounded to 2 dp and **snapped to exactly 1.00 on balanced lines** (validated on `1,226` live options: decimal-priced `m = ½ × decimal_price`, ratio `1.0002 ± 0.004`; fantasy-priced `m = ½ ÷ p`, `0.9998 ± 0.010`).
- **Standard = base(n) × ∏ mᵢ × C**, base = **`3.5 / 6.5 / 12 / 20 / 35 / 65 / 120`** for 2–8 picks; a snapped 1.00 on a decimal-priced pick is replaced by `0.5 × price`. 🆕 *(pass 34, `2026-10-10`, `T36`'s `05:35Z` reply, AS STATED)* *"Every fantasy-priced pick showing 1.00 really is 1.00, and snapping never hides a higher value. Only one class differs: decimal-priced picks on balanced lines, where the true value can be lower (e.g. Díaz's 0.91)."* The live capture had been *"storing the wrong product's price for Underdog and dropping the modifier entirely"*; scraper and archiver fixed and *"verified live on Underdog's API: all 690 legs carry the new fields, Kwan stores 1.41 / 0.74 exactly, and snapped values are recomputed correctly (Ramírez 0.925)."* 🆕 *(pass 38, strategy `§30g`/`§30i` as `T36` wrote them, AS STATED)* The snapped-`1.00` audit: *"79% are genuinely 1.00 (true 0.99–1.01); snapping never hides a value above 1.00 (max 1.005); every low case (36, true 0.62–0.99) is a decimal-priced pick — all 126 fantasy-priced picks showing 1.00 are genuine"*; *"On the 78 lines showing 1.00 on both sides the true values are 1.00 / 1.00 (pair sum 1.976): no hidden side tilt."* The live capture: *"690 / 690 legs with the new fields, 571 / 571 non-snapped modifiers exact, snapped ones recomputed, 1,506 ladder rungs"*; before that, offline: *"non-snapped modifiers stored exactly (1,057 of 1,057), snapped ones recomputed (Díaz HRR higher → 0.91)"* (pass 50). The Flex fit behind the `7.2` base: *"Flex all-correct I3 0.995, I4 0.998 (7.2 base)"*, one-miss *"0.976–0.985"*.
- **Flex, all correct = F₀(n) × ∏ mᵢ × C**, F₀ = `3.25 / 7.2 / 10 / 25 / 40 / 80` for 3–8 picks *(the 4-pick behaves as `7.2×`, not the help page's `6×` — ~~the program prices it at the published `6` until confirmed~~ → **superseded (T50, 2026-10-21): 7.2 confirmed from Underdog's own estimate endpoint and applied with floor2 in every path, see §T50.3.6**)*; **Flex with j misses = Fⱼ(n) × ∏ m over the picks that hit × C**, F₁ = `1.09 / 1.4 / 2.5 / 2.6 / 2.75 / 3`, F₂ = `0.25 / 0.5 / 1` (6–8); the displayed "up to" is the best case.
- **C = the correlation factor** (Underdog's joint-probability model): `1` for picks from different games; same-game picks that move together discounted (`0.917` observed), that pull apart boosted (`+13%`, `+18%`). **The NBA engine builds one pick per game on Underdog, so C = 1.**
- **Voids/ties**: the pick is removed and the entry drops a size.
- 🔴 **The `1.04` constant**: every independent-game quote fitted `1.04 × base × ∏ m` to `0.1%` (Standard `1.039–1.040`, Flex all-correct `1.035–1.038`, one-miss `1.015–1.018`) — but it contradicts Underdog's statement that the base assumes `1.0×` per pick and *"looks like an account-level boost"* ⇒ **set aside: the program prices with base(n) × ∏ mᵢ (no `1.04`)** — conservative by 4% if it is structural. One owner check settles it (a 2-pick of two fantasy-priced `1.00×` picks: `3.50×` ⇒ no constant; `3.64×` ⇒ real). → `NBA_OPEN_ITEMS.md` `T36-3`.
**Economics** (`§30f`): per pick a Standard entry returns `(1.04 × base)^(1/n) × 0.5 / p_UD` ≈ **`0.954 / p_UD` (2 picks) … `0.910` (6)** (computed *with* the `1.04`; without it each figure is lower) — Underdog's pick'em margin **`4.6–9%`** against its own probability; a leg pays only where the model beats Underdog's probability by more than that. 🆕 *(pass 458, `2026-10-15`, `T36`'s `05:16Z` reply, AS STATED)* The figure the formula fit gave for it: *"Underdog's margin is 4.69% against its own probabilities (smallest on 2-pick, largest on 6-pick entries)."* — the lower end of the `4.6–9%` range above, by entry size.

**What this supersedes in this file**: the `0.10`-era row *"Underdog `payout_multiplier = decimal(American price) × 0.963`"* (*"worked on three real legs"*) and `§T33.3`'s `0.963` scope note — ***"The scraper's 'decimal × 0.963' helper is superseded by this formula"*** (`§30f`). *(Strike-never-delete: the old rows stay; read them through this section.)*

**What the archive's modifier means (`§30i`, `400,000+` graded legs)**: `0.5 ÷ m` predicts the hit rate monotonically in every band, both seasons; **main lines at `1.00` hit exactly `50.0%`** in both seasons (`114,279` and `92,438` legs) — Underdog's balanced mains are genuinely 50/50 *(⚠ forward pointer, pass 49: corrected in `T37` — the figure pooled both sides; see the *"Correction of `§30i`"* in `§T37.3` below)*; 2024-25 almost perfectly calibrated; **2025-26 alternates hit 3–6 points below what their modifier implies — *"Underdog's margin sits in the alternate rungs."*** ✅ `nba_score.ud_window_legs` (`450,206` legs, `m` column) — `NBA_DATABASE.md` `§T36.6`.
🔴 **The live capture was wrong until `§30h`**: `scrape_underdog_board.py` dropped the fantasy price and probability; `archive_live_boards.py` stored `american_price` (the other product's price for fantasy-priced options) **with no modifier** — *"every live Underdog row from October 20 would have carried the wrong price and none of the payout quantity."* Fixed before opening night (`1,057`/`1,057` non-snapped modifiers stored exactly in the offline check).

---

## 🆕 §T37.3 — **UNDERDOG'S PAST PRICED AT TODAY'S LOGIC: THE STRICT ATTEMPT (WITHDRAWN), THE BALANCED METHOD (ADOPTED), AND THE MARGIN REGIMES** *(source `T37`, `2026-10-03`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§30r`–`§30t`, `§30y`; ✅ = live `2026-10-10`)*
**The owner's two rulings** (verbatim in `NBA_MASTER_SUMMARY.md` `§T37.1`): price Underdog's history **at today's payout logic, with a confidence discount where unsure** (`08:11Z`) — the same principle as PrizePicks' current-multiplier rule (`§T34.3`); then **"you might be too strict … they are odds backed … You need to balance very well"** (`09:05Z`).
**Underdog's current logic, measured on its own MLB fields** (`archive.underdog_ladder_history`, `40,400` lines, 2026-09-10 → 27): modifier = 0.5 ÷ fantasy probability; **fantasy probability = the books' no-vig + `2.0–3.3` points** (larger on favourites; sd ≈ `0.005` — *"a deterministic formula"*), whole percents, **capped at 83%**; mains within 2 points of 50% no-vig are **always snapped to 1.00×**, 2–2.5 points two-thirds snapped, beyond always priced.
**NBA history against seven sportsbooks' no-vig** (same `window` snapshot — no closing-line leakage): **two margin regimes with one step** — 2024-25 priced lines **`+0.1 … +2.6` points every month**; **2025-26 `+2.1 … +7.7` points every month November–April**; *"October 2025 the switch-over"*. Mains: **`1.00×` in every month of both seasons**; `80–87%` of NBA mains sit inside today's snap zone. *"The most recent NBA evidence … is harsher than today's MLB rule, so treating it as current is, if anything, conservative."*
| method | what it did | outcome |
|---|---|---|
| **`§30r` strict** (`ud_window_legs_curr`, scenario `min(m_hist, m_cur)` + haircut 1% mains / 3% alternates) | overrode Underdog's per-leg decisions with a noisier 7-book consensus, took the stingier of then and now, **plus** a haircut — *"conservatism counted three times"* | same cells collapsed (weighted:points 5-Std `+163/+160% → +50/+56%`) — **mechanism: tier migration**, not per-leg price (picked mains repriced only `−0.5…−1%`) — 🔴 **SUPERSEDED** |
| **`§30s` balanced — scenario `delta`** (in `nba/build_ud_reprice.py`) | **every 2025-26 modifier and every 1.00× leg kept as Underdog priced it**; only **2024-25 priced lines** shifted by the measured regime drift at their no-vig (5-point bands: `+6.0` at 0.325 … `+2.6` at 0.675); discount **0.5% mains / 1% priced lines** (Gemini: a small discount on mains too) | re-certification close to the original; **2025-26 weighed first** (it needs no repricing — *"the cleanest evidence of performance under current NBA pricing"*) |
**De-vig method** (research, Clarke, Kovalchik & Ingram 2017): power beats proportional; methods differ by 1–2 points only on lopsided lines; the program's proportional de-vig is used *"consistently on both sides of every comparison."*
**The feed is faithful** (`§30s` probe, `nba/probe_ud_feed_vs_app.py`): on the same MLB games at the same moment, **`162`/`162` app-priced mains match the Odds API's multiplier within `0.02` — all filed under `_alternate` — and none shows `1.00×`; `22`/`22` snapped mains show `1.00×` in both** ⇒ *"the historical feed is a faithful record of what Underdog actually paid on every leg."*
**Pricing error is not the risk** (`§30r`, `§30t`): the uniform per-leg haircut at which each strategy's weaker season reaches zero is **`9–14%`** (strict build) and **`~11–12%`+** (balanced) — far above any plausible modifier error.
🔑 **The board-wide Under tilt — a pricing fact on both apps** (`§30y`): on **balanced** lines the Under wins **`51.0–52.7%`** on every PrizePicks prop for non-stars and up to **`56.7%` (steals) / `57.1%` (turnovers) for stars**; Underdog rebounds `52.9% / 52.5%`, threes `53.3%`, turnovers `53.5%` (stars `56.0%`) — *"the popularity effect of public Over money."* 🔴 **Correction of `§30i`** (and of `§T36.3` above): *"mains at 1.00 hit exactly 50.0%" pooled both sides (50% by construction); split by side, the Under carries a structural 1–3 point edge.*
🔴 **Late entry on Underdog is not viable** (`§30x`): only `45%` (2-pick), `18%` (4-Std), `8%` (6-Flex) of P5's slips are still fully on the close board at the same lines, and the ones that disappear were the **better** ones (2025-26 `+42/+122/+248%` vs survivors `+25/+30/−72%`) — *"Underdog pulls the lines that were going to win."*

---

## 🆕 §T38.3 — **PRIZEPICKS PAYOUTS VERIFIED AT THE SOURCE (`2026-10-04`), THE EXACT PAYOUT ENGINE, AND THE PORTFOLIO'S BREAK-EVEN** *(source `T38`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31k`, `§31m`)*
- **PrizePicks help center (updated `2026-09-09`)**: **Power `3 / 6 / 10 / 20 / 37.5×`** (2–6 picks); **Flex** 3/3 `3×`, 2/3 `1×`; 4/4 `6×`, 3/4 `1.5×`; 5/5 `10×`, 4/5 `2×`, 3/5 `0.4×`; 6/6 `25×`, 5/6 `2×`, 4/6 `0.4×` — ***"identical to the engine"***. Secondary sites quoting `2.25× / 1.25× / 5×` are outdated — *"a false alarm avoided by checking the primary source"* (the same lesson as `§T34.3`'s stale support article).
- Goblins/demons and same-game combinations carry altered rates — the engine uses per-leg factors and `compress()` above `9.1×` (*"e.g. 20× modelled ≈ 17.9× — conservative"*).
- **Exact expected payout of any slip** = Poisson-binomial over hits × the engine's own `grade()` — matches brute-force enumeration to **`1.8e-15`** on 300 random slips; break-even by a uniform log-odds shift: **3-pick Power `55.032%` = (1/6)^(1/3)**; 5-pick Flex `54.35%`.
- **The portfolio's break-even δ\* = `−9.24 pp`** of leg hit below certified (8 daily strategies, `6,186` slips) — *"Flex partial pays and demon multipliers make it more forgiving than a single Power slip; supersedes the rough 5–7 pp estimate."* (Per-season break-evens of the slips placed: `−10.98 pp` 2024-25, `−7.19 pp` 2025-26.) → ⚠ **superseded in `T39`**: the per-season independence value drifts with the slip mix; production fixes **`−8.99 pp`** (`§T39.3`).

---

## 🆕 §T39.3 — **UNDERDOG PAYOUTS AT THE SOURCE, BREAK-EVEN BY THINNING (BOTH APPS), AND PRIZEPICKS' TIE RULE** *(source `T39`, `2026-10-04/05`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31o`, `§31p`, `§31s`)*
- **Underdog help center** (*"Pick'em Standard & Flex Entry Payouts"*, updated within ~9 days): **Standard `3.5 / 6.5 / 12 / 20 / 35 / 65 / 120×`**; **Flex** 0 losses `3.25 / 6 / 10 / 25 / 40 / 80×`, 1 loss `1.09 / 1.4 / 2.5 / 2.6 / 2.75 / 3×`, 2 losses (6-/7-/8-pick) `0.25 / 0.5 / 1×`; the base assumes `1.0×` per pick; **a multiplier pick must be correct for its boost** — *"identical to `build_ud_slip_engine.grade()`"* (Standard: base × all factors; Flex: base × the HIT legs' factors). Third-party `3× / 10× / 1.5×` outdated. 2-pick Standard BE **`53.452%`** = √(1/3.5); 4-pick Flex `55.586%`.
- 🔑 **Break-even must keep the slips' real co-movement**: on Underdog the independence model predicted `+62.3%` at certified rates vs actual `+86.7%` — not the multipliers but **within-slip co-movement** (4-Std all-hit `19.5%` actual vs `15.9%` independent; 6-Flex `10.2%` vs `5.9%`). Method adopted on both apps: **thin the real joint outcomes** (keep each actual hit with probability p(s)/p, regrade with the engine's own `grade()`), exact at shift 0. **UD `−10.84 pp`** (stable `−10.82 / −10.68`); **PP pooled `−8.99 pp`** (independence `−9.24`; per-season independence `−10.98 / −7.19` vs thinning `−8.48 / −9.61` — the independence value is the unstable one).
- **PrizePicks' tie rule** (help center, *"Payouts"* / *"Tied Projections"*): a player landing exactly on the line is a **tie** — neither correct nor incorrect; **the lineup drops one payout tier** like a DNP but the pick is **not removed** for the minimum-pick / same-team rules; **a 2-pick Power with one correct pick and one tie pays `1.5×`**. Engine: tie-aware `grade()` (tied leg removed, revert one level; two undocumented cases — every leg tied, a 3+ pick slip reverting to one decided leg — **refunded**, a recorded conservative assumption).

---

## 🆕 §T40.3 — **WHAT A TIE IS WORTH, AND THE BREAK-EVEN AFTER WHOLE-NUMBER LEGS JOINED** *(source `T40`, `2026-10-07`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31s`)*
- **A tie's value inside a Power slip** = `M(n−1) / M(n)` of a win — with PrizePicks' Power table `3 / 6 / 10 / 20` that is **`0.5–0.6`**; the program values it at **`0.5`** (conservative) in the whole-number EV-equivalent price `p_eq`. PrizePicks' own wording (help center, *"Tied Projections"*): a tie is neither correct nor incorrect; the lineup drops one payout tier; minimum-pick rules unaffected.
- **Break-even after the recertification on the selection pool** (thinning, 8 daily strategies, `6,196` slips): **2024-25 `−8.48`, 2025-26 `−9.63`, pooled `−9.16 pp`** (independence `−9.37`, gap `0.21 < 1.0` → no method switch); portfolio ROI `+78.4% / +94.9% / +86.8%` (was `+77.8 / +94.0 / +86.0`). ⇒ **`EDGE_DELTA −0.0899 → −0.0916`** — *"the constant follows the certified system it monitors"* (✅ `live_slip_engine.py` line ~~`1391`~~ `1396` — *re-read sweep pass 26: `EDGE_DELTA = float(os.environ.get('LS_EDGE_DELTA', '-0.0916'))`; lines shifted by the build chat's `2026-10-10 05:37Z` commits*). Edge-monitor decisions on the new reference: same timing as before (2024-25 CONFIRMED at 120, 2025-26 at 60), no false alarm.

---

## 🆕 §T41.3 — **PRIZEPICKS' REVERSION SCHEDULE ON VOIDS, NOW IN BOTH GRADERS** *(source `T41`, `2026-10-07`; AS STATED from `§31t` (1) and the ledger F-1, citing `PP_PAYOUT_FINDINGS.md` — out of scope here, read-only — "79/79 verified")*
- A slip with voided legs **reverts to the r-pick table of the r legs LEFT**: Flex with 2 left → **`3×` Power-style**; **1 left → `1.5×` (× the survivor's factor, compressed) on a hit, `0` on a miss**; refund only when **no** leg is left.
- **Before `T41`**: the live grader pruned voids and paid the smaller *original-structure* table (a 3-Flex with one void paid the 2-pick Flex `2× / 0.5×` table — which PrizePicks does not do) and refunded a single survivor; the engine's `grade()` refunded single survivors too. Now both graders and certify L11 follow the schedule above.
- *Distinct from the tie rule* (`§T39.3`): a **tie** drops the lineup one tier but the tied pick still counts toward the minimum-pick rules; a **void** (DNP) is removed.

## 🆕 §T43.3 — **`T43` (`2026-10-08`): FLAT BOARDS VS PRICED BOARDS — THE RULES OF THE THREE APPS WITHOUT A BACKTEST, AND THE PRICE GATE** *(source `T43`; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31u` as first written — operator rules from the operators' help centres and reviews, `2026-10-08`)*
- **Sleeper** — every side of every prop carries **its own multiplier scaled to likelihood**: the `2026-10-07` capture of the 10-20 slate held `105` legs, multipliers **`1.45–2.21`** (e.g. Cunningham PRA 39.5 Over `1.75` / Under `1.71` — a `15.6%` two-way overround, the same as PrizePicks' 2-pick 3× = `1.732` per leg, but scaled). Payout multipliers are *"cumulative"* — the help centre states no formula; **at `T43` the build chat left it "verify in the app on one 2-pick entry before any slip is priced"** (*settled `2026-10-09` from the owner's own MLB record — later transcript*). Minimum 2 / maximum 8 picks, one per player, more than one team; a push or DNP voids the pick and the entry is graded *"as if the voided pick(s) were never included"*; a 2-pick left after voids is a 2-pick Max; an entry left with one team, or any 2-pick with a void, is refunded; Flex (3+ picks) pays with one miss, two misses only at 5+, minimum Flex multiplier `1.25×`; max win `$5,000` per entry.
- **Fliff** — a social sportsbook: American odds per prop; parlays = product; ~~no pick'em table~~ → **superseded (T50, 2026-10-25): Fliff has a Pick'Em product whose per-selection multipliers are public in the "skipper" feed (about 1.80 / 1.85); product rule, Flex 1 loss, SuperFlex 2 losses (amounts unknown); see §T50.3.9**.
- **Betr** — a fixed payout table like PrizePicks (standard legs only in our 131-day history; boosted tiers live-only).
- 🔑 **The price gate**: on a **flat** board the edge is the model's p above the table's break-even; on a **priced** board the operator has already priced p — a steals-Under at a model 60% is paid `~1.45×` (= 0.87/0.60), and `0.60 × 1.45 = 0.87 < 1`. A leg is playable only when **p × m ≥ 1 + margin** (Sleeper/Fliff, the certified margin in multiplier space — the `−9.16 pp` currency of the edge monitor) or above the flat break-even (Betr); the slip's expected payout comes from the operator's own payout function under its own void rules.

## 🆕 §T44.3 — **`T44` (`2026-10-08`): BREAK-EVENS QUOTED BY THE RESEARCH, A STALE TABLE THAT CAME BACK, AND WHAT AN UNDERDOG NUMBER IS** *(source `T44`; AS STATED from `§31v`, the `S5` research report and the ledger)*
- **Per-leg break-even = M^(−1/N)** (independent legs). `§31v` lists: PrizePicks 2-Power `57.7%`, **3-Power `58.5%`**, 4-Power `56.2%`, 5-Power `54.9%`, 5-Flex `≈54.3%`; Underdog standard `57.7 / 55.0 / 56.2 / 54.9%`.
- 🔴 **`§31v`'s 3-Power `58.5%` is the stale `5×` table.** It comes from the research report `S5`, which read PrizePicks' support article (*"3-Power 5×; 3-Flex 2.25×/1.25×; 4-Flex 5×/1.5×"*). The build chat had already established — and this file records (`§T34.3`, `§T38.3`) — that the article is stale and the live page and the engine pay **3-Power `6×` (break-even `55.03%` = (1/6)^(1/3)), 3-Flex `3×/1×`, 4-Flex `6×/1.5×`**. Nothing in the engine changed (it pays from its own table); the stale figure lives only in `§31v`'s research summary. → `NBA_OPEN_ITEMS.md` `T44-5`.
- **Underdog's displayed number is a payout MODIFIER, not a per-leg price**: `m_eff` = modifier × `ud_ref_per_leg`, at `T44` the 5-pick table root `20^(1/5) = 1.8206` *(revised to the 2-pick root `3.5^(1/2) = 1.8708` on `2026-10-09`, `§31aa` — later transcript)*. Replay `2026-04-10`: mean modifier `0.975` → `m_eff 1.776`; mean p `0.813` → `p × m_eff 1.507`.
- **Sleeper and Fliff numbers ARE per-leg prices** (per-side multiplier; American odds). Sleeper's slip payout is **not** published as a product: one documented 4-pick paid `14.6×` against a product of `17.8×` *(superseded by the 10-09 size-bonus rule and §T50.3.8: Max = product × a size bonus of 1.0797 at 3 picks and 1.102 at 4 picks, Flex = average of (n−1)-pick sub-slips each with its own size bonus)* → *"the effective per-leg price must be derived from the displayed payout, never assumed"*. Sleeper's two-way hold from quoted pairs `~12–13%` (`S5`) vs `15.6%` on our own 10-20 capture (`T43`). Sleeper caps: up to `100×`, `$5,000` max win, entries `$1–$500`; Flex example 5-pick `16.78× / 2.67× / 0.42×` vs Max `28.87×` (`S5`, AS STATED).
- **Betr's tables disagree across sources** (CBS: Perfect 2 = `2×` … 6 = `30×`; RotoWire: 2-pick `3×`; Squawka: a different Flex table) — *"read the in-app table."* Break-evens at `5× / 10× / 20× / 30×` (3–6 Perfect): `58.5 / 56.2 / 54.9 / 56.7%`.
- **Correlation is being priced by the operators**: Underdog applies correlation coefficients; PrizePicks / Underdog shade same-team stacks (same-player hardest); Betr's "Edge Combos" pay less than two independent picks; all apps require ≥ 2 teams per entry.

## 🆕 §T47.3 — **`T47` (`2026-10-09`): EACH APP'S PRICING LAW FROM ITS OWN HISTORY, THE BREAK-EVEN MULTIPLIER `m*`, AN UNDERDOG ROOT CORRECTED — AND A PRIZEPICKS TABLE QUESTION REOPENED** *(source `T47`; AS STATED from `§31aa`, the ledger's MULTIPLIER VALUE PROGRAM and the reports `S8` / `S9`; ✅ = live `2026-10-10`)*
- 🔑 **Pricing law, measured** (828,818 PrizePicks / 421,819 Underdog / 237,806 Pick6 graded legs; hit-rate × multiplier, fair = `0.500`):
  | | easier alternates | main line | harder alternates |
  |---|---|---|---|
  | PrizePicks | `0.48–0.49` | `0.500` | `0.43 → 0.39` |
  | Underdog | `0.47` | `0.499` | `0.47 → 0.37` |
  | Pick6 | `0.45–0.46` | `0.496` | `0.43 → 0.37` |
  Main lines are priced fairly; the cut is in the payout table; alternates add 3–7% (easier) / 13–26% (harder). **Pick6's multiplier scales its table like Underdog's** (1.00 on main lines; alternates only for Overs). **Sleeper's NBA board ≈ `1.78` per side — a `12.6%` cut**; if its payout is the product, a leg needs ~56%.
- 🔑 **Break-even multiplier**: **`m* = 1 / (p × root)`** — `root` = the app's per-leg payout on an even line: Underdog 2-pick `1.871` (= `3.5^(1/2)`), PrizePicks 5-Flex `1.843`, Sleeper / Fliff `1` (their number is already a per-leg price). Example: a 57% cell needs an Underdog multiplier ≥ `~0.94`.
- 🔴→🟢 **Underdog per-leg reference corrected**: `ud_ref_per_leg` `20^(1/5) = 1.8206` (5-pick root) → **`3.5^(1/2) = 1.8708`** (2-pick Standard root) — the old root *"priced every Underdog leg 2.7% low."* ✅ the config row reads `1.8708`, `cell_margin 0.03`.
- 🔑 **Underdog's tables, as fetched by `S9` (help centre, Oct 2026)**: Standard 2 `3.5×`, 3 `6.5×`, 4 `12×`, 5 `20×`, 6 `35×`, 7 `65×`, 8 `120×` (break-evens `53.45 / 53.58 / 53.73 / 54.93 / 55.29 / 55.08 / 54.97%`); Flex 3 `3.25/1.09`, 4 `6/1.4`, 5 `10/2.5`, 6 `25/2.6/0.25`, 7 `40/2.75/0.5`, 8 `80/3/1` — *"richer than older ones"* (ETR 2025: 3/6/10/20×); payout = table × ∏ per-pick modifiers (implied by the help page, not stated as a formula). A Multiplier Boost's increment is paid as bonus cash, and the boosted multiplier *replaces* the standard one — *"the boosted multiplier replaces the standard one, for example 20x becomes 50x"* (Underdog help article of `2026-05-19`, as `S9` quotes it).
- 🆕 *(additional sweep `7`, pass 479, `§P479` — `S9`'s Dabble row, which the twelve carried only in part)* **Dabble**: *"Rising entry multipliers plus a "Hedge" option"* — *"About 10x for a perfect 5-pick, up to 5000x; no per-pick formula published"* (RotoWire, `2026-09-13`, as `S9` quotes it). The `Hedge` option is named in that row only; `S9` gives no rule for it. No NBA Dabble multiplier is captured or interpreted.
- 🆕 *(additional sweep `9`, pass 569, `§P569` — `T47` 17:14Z summary of the multiplier program, AS STATED)* Two small statements the program's closing summary carries that the twelve held only in part. **Pick6**: *"our gated legs look about 13% better than an even line"* (the `1.12`–`1.15` gated value on file) — and the reason no action followed: *"Pick6 doesn't publish its payout table and we don't scrape it live, so I took no action"* (Pick6's multiplier was never interpreted for NBA — `T47-6`; nothing was changed for it, the program's changes being measurement only, nothing about staking). **The new-quote count**: after the replay's old model-based check (`12` of `12` Underdog legs, mean `1.55`), the summary says of the board that check read: *"That board is still tiny, so only one new quote has come in so far"* — the reply does not name the board or the quote in that sentence; recorded as said, with the Sleeper `10-20` board's `29` two-sided pairs (above) the only tiny NBA board the program names.
- ⚠ **PrizePicks Flex (and 3-Power) table — reopened in `T47`**: the help centre fetched `2026-10-09` shows **3-Power `5×`, 3-Flex `2.25/1.25`, 4-Flex `5/1.5`**; our mined quotes (`2026-09-21`) show **`3/1` and `6/1.5`** (and the engine pays 3-Power `6×`). `§T34.3` / `§T38.3` had settled the article as stale (the live page and a help-centre update of `2026-09-09` matched the engine); in `T47` the build chat writes *"This may depend on your state"* and lists it as a **10-20 in-app check**. Until then: the engine's certified table stands; **`§T44.3`'s "stale" verdict on `§31v`'s `58.5%` is downgraded to "disputed"** (→ `NBA_OPEN_ITEMS.md` `T44-5`, `T47-4`).
- ⚠ **This file's Sleeper rule** (§6.0: *"`payout_multiplier = 1 + (decimal − 1) × 0.95` — exact"*): per `S8`, the MLB code **replaced** it on `2026-08-31` with **`k(p) = 0.8928 − 0.0993·|p − 0.5|`, `multiplier = k/p`** (R² 0.9048, residual sd 0.0023) because the flat rule overstated every leg by ~11% (MAE 0.1973 on 84 legs) — ✅ verified in `alphadog-v2-certification-center.js` (MLB code; read-only). *For NBA the multiplier is read directly from Sleeper's board, so neither conversion is used; the §6.0 row stays as the config states it, annotated here.* Pick6, Betr, Fliff: no NBA multiplier captured or interpreted at `T47`.
- 🆕 *(additional sweep `5`, pass 369, `§P369` — the reply's closing source list, read to its end)* The `2026-10-09` `17:14Z` summary of the multiplier program cites three sources, none named in the twelve before:
  - Sleeper's "Player Picks Rules" support article;
  - RotoWire's "Betr Picks vs ParlayPlay" comparison;
  - the `implied` package's vignette on de-vig methods.

## 🆕 §T48.3 — **`T48` (`2026-10-09`): THE PRIZEPICKS FLEX TABLES CLOSED BY ITS OWN QUOTE ENGINE; SLEEPER'S SLIP PAYOUT SETTLED FROM OUR OWN RECORD** *(source `T48`; AS STATED from the ledger's *"THE 10-20 IN-APP CHECKS — PROBED"* and *"RETRIES … SLEEPER"*; cross-reference to the out-of-scope payout-map track only)*
- ✅ **PrizePicks — closed**: PrizePicks' own quote engine returns **3-Flex `3.0 / 1.0`, 4-Flex `6.0 / 1.5`, Power 3 = `6.0`, 4 = `10.0`, 2-pick `3.0`, 2-Flex `2.0 / 0.5`** — *"the mined tables the engines use, not the help centre's 2.25 / 1.25 and 5 / 1.5."* **This settles `§T47.3`'s reopened question in favour of the engine**; `§T44.3`'s "stale" verdict on `§31v`'s `58.5%` stands (→ `NBA_OPEN_ITEMS.md` `T44-5`, `T47-4`).
- ✅ **Sleeper — settled from our own MLB placed slips** (the owner's MLB work, 19 slips + screenshots, `2026-09-10`, stored in `classification_config['board_payout_conversion_rules']`): **slip multiplier = PRODUCT of the leg multipliers** (an observed 2–8% slip-level haircut vs the plain product — *"model the plain product, conservative"*); **Flex = a round-robin over the (n−1)-pick sub-combinations, each priced with the same per-leg product** (3/3 Flex predicted `2.775×` vs real `2.78×`; 2/3 inside `0.884–0.963×`, real `0.92×`). Outside sources agree (BettingUSA *"cumulative"*; OddsAssist 2-pick examples = products of the legs). *The per-leg conversion rule in that config row is the one `§T47.3` annotates (`S8`: replaced in the MLB code by `k(p)`); for NBA the per-side multiplier is read from Sleeper's board directly.* The build chat's own ledger first wrote Sleeper as *"not answerable without an account"* and struck it the same evening.
- **Fliff**: the 10-09 NBA board was still team markets only (426 legs) — the first NBA player-prop board will show in P3's log.

## 🆕 §T50.3 — **`T50` (`2026-10-17 -> 10-26`): PRIZEPICKS GRADER v3 REFIT ON 393 QUOTES, SAME-GAME POWER RULE, THE QUOTE GATE, UNDERDOG 7.2 + FLOOR2, BETR PRICED BY ITS OWN SERVER, SLEEPER AND FLIFF PICK'EM PRICING** *(source: AS STATED from the build chat's own files (certification ledger blocks of 10-17..10-25, `NBA_COMPASS.md` facts `166`-`185`, `PP_PAYOUT_FINDINGS.md` `0l`-`0r`, `BETR_BUILD_STATE.md`, `NBA_SLIP_BUILDING_STRATEGY.md`) for 10-17 -> 10-25; TRANSCRIPT where the T50 transcripts show it (main 10-25 23:37 PT -> 10-26 00:11 PT; subagents 10-20, 10-21, 10-22, 10-25). The build chat's own main conversation 10-17 13:17 PT -> 10-25 23:37 PT is NOT a transcript: only its compaction summary is transcript-grade. Times are PT. Facts that belong to sibling docs are only cross-referenced)*

> ✅ **WHAT THIS SECTION CHANGES.** (1) PrizePicks grading is now grader v3 (refit on 393 quotes), proven on 64/64 quotes of the 10-20 board and on 105,835 slips with 0 Python-vs-DB mismatches. (2) Same-game Power is now cut (2.8x for 2 picks, 5.75x for 3 picks); the older text saying Power is never adjusted, or that it is not cut, is superseded. (3) Underdog 4-pick Flex is 7.2, not 6.0, and every payout floors to 2 decimals. (4) Betr is priced by its own server, not a flat table. (5) Sleeper and Fliff Pick'Em rules are written down with their unverified parts labelled. (6) A slip only shows on the Slips screen if PrizePicks quoted it at no less than 0.95 times our payout.

### T50.3.1 — PrizePicks grader v3 (10-18 evening; ledger block 8, `PP_PAYOUT_FINDINGS` `0l`, COMPASS fact `169`; owner 10-18 17:41: be sure we are using the proper multipliers, prove each table)
- 🔑 **Proof run.** `pp_payout_map.py` with `PP_MODE=proof` answered 64/64 quotes on the 10-20 NBA board for the slip shapes the live strategies place, including slips with half the legs on Less (`P_LESS`) and slips with same-game players. All-standard Power 3 / 6 / 10 / 20 / 37.5 and all-standard Flex 3/1, 6/1.5, 10/2/0.4, 25/2/0.4 matched exactly.
- 🔑 **What the old grader got wrong.** `compress(base x fp)` compressed all-regular slips above 9.1x and under-paid them: 4-pick Power 9.87 (quote 10), 5-pick 17.87 (20), 6-pick 30.6 (37.5), 5-Flex 9.87 (10), 6-Flex 21.6 (25). With goblins or demons the old grader OVER-paid 3-pick Power by +7% on average and +23% at the maximum, and UNDER-paid 4-, 5- and 6-pick Power by 10%, 11% and 20%. The 09-21 DB law `pp_slip_power` was within +/-1% on old quotes but 6-20% over on the 10-18 5- and 6-pick quotes.
- 🔑 **Refit.** `research_pp_power_law_fit.py` fitted ln(q) = ln b + a ln fp + an NBA term on 393 quotes of 3-6 picks (NBA 277, WNBA 116); residual sd 0.033-0.048. The conservative law is the fit times k_n, where k_n is the 10th percentile of quote/law on NBA quotes, and the result is rounded DOWN on the payout grid (0.1 steps below 3x, 0.25 steps at or above 3x; function `grid_down`). Stored as `pp_slip_rules['power_alt_v3']`.
- 🔑 **`power_alt_v3` constants (b / a).** 3 picks 5.1492 / 0.9868; 4 picks 9.5795 / 1.0148; 5 picks 17.4639 / 1.0348; 6 picks 32.5230 / 1.0522. Mean 0.95 of the quote; the law sits above the quote on 1-8% of quotes (maximum +3% / +5% / +7% / +13% at 3 / 4 / 5 / 6 picks).
- 🔑 **Which branch prices what.** All-standard Power = the table exactly. Power with a goblin or demon: 2 picks keep `compress(3 x fp)` (product up to 9.1x, then 9.1 x (p/9.1)^0.857); 3-6 picks use `grid_down(b_n x fp^a_n)`. Flex with a goblin or demon uses `pp_slip_rules['flex_alt_tiers']` (`flex_alt_payout`). All-standard 3- and 4-Flex with a same-game pair use `pp_slip_rules['flex_same_game_v3']`. Anything else is the table. Code is `build_slip_engine.py` (`POWER`, `FLEX`, `compress`, `flex_alt_payout`, `pp_payout`, `grid_down`).
- 🔑 **`flex_alt_tiers`.** The lower envelope of quoted (factor product, payout) points, interpolated in ln(fp) and clamped at the ends, built from 917 quote tiers plus 22 probe points. Partial tiers are nearly flat in fp (3-Flex one miss about 1.0x up to fp 3.4; 5-Flex one miss about 2.0x up to fp 6.8; two misses 0.4x) while the all-hit tier rises faster than FLEX x fp. Before that fix the grader over-paid partial tiers 2-5x, and B_demon_3flex certified at +52 / +90% was -16 / +31% on the app's tiers. A missing rule raises an error ("never guessed").
- 🔑 **Where the v3 logic lives (twins).** `build_slip_engine.pp_payout` and `grade(same_game)`; DB functions `nba_market.pp_payout_v3` and `pp_slip_payout_v3` (file `nba/sql/pp_payout_v3.sql`); UI `main_ui/pricing.js` `nbaPayout`; certifier tests L10, L11, L11b. Live legs now carry `event_id`. `main_ui/common.js` loads the `pp_slip_rules` keys `base_power`, `flex_all_standard`, `flex_2pick_base`, `compression`, `flex_alt_tiers`, `power_alt_v3`, `flex_same_game_v3` (and, since 10-21, `power_same_game_v3`).
- 🔑 **Regrade and certification.** `regrade_pp_payout_v3.py` re-graded history, keeping the old value in `payout_grader_v2`; certification run reported 83 / 0 FAIL. The live twin slips `_wo` and `_wo_nosteals` still carried pre-10-10 Flex-with-alternates payouts and were corrected by v3; re-graded history slips 103,774 (`_wo`) + 101,170 (`_wo_nosteals`) equal the stored payouts exactly where both exist. Verification status 2026-10-20: Python vs DB grader 0 mismatches on 105,835 slips.
- 🔑 **~~2-pick Flex is not a PrizePicks product.~~ -> WRONG, corrected (T50 deep pass, 2026-10-26): 2-pick Flex IS offered by PrizePicks.** An all-standard 2-pick Flex pays 2x for two hits and 0.5x for one hit (both owner screenshots of 10-20 and the proof quotes matched the table; `pricing.js` carries it as `flex_2pick_base` read from `pp_slip_rules`). What does not exist in production is a quote-derived tier for a 2-pick Flex WITH a goblin or demon. A regular-line 2-pick Flex needs a 0.618 leg rate against 0.577 for a 2-pick Power. The earlier wording came from a 10-16 certifier comment ("Flex is 3-6 picks; no strategy builds 2-pick slips") that the docs copied (TRANSCRIPT, payout-map subagent 10-22). The rest of this bullet, about alternates, stands: Since 10-10 the engine pays a size-2 Flex with alternates 0 (no quote tier exists for n = 2); tables built before 10-10 keep the old FLEX(2,h) x product value, and every L11b mismatch was such a slip. No strategy builds 2-pick slips, so no live strategy, hurdle or mf / wo comparison is affected; 2-pick Flex is excluded from the L11b recompute and counted instead. A 2-pick Flex with an alternate does exist on the app (no production tier); research prices it from the `pp_mined_leg` quote envelope.
- 🔑 **SLIPQ.** `pp_payout_map.py` with `PP_MODE=slipq` maps each live PrizePicks slip to projection ids and asks PrizePicks to quote it (`nba_score.live_slip_quotes`), as a soft step of P3 after the Slip pick; the grade pays the quoted tier (grader kept in `live_slips.payout_model`) and the Slips screen shows it. Tested on two sample slips (a 3-pick at 6.75x; a 4-pick correctly unmapped); test rows deleted. ~~The `slips.js` label "adjusted by PrizePicks (same game)" appears when a quote replaces the model multiplier.~~ -> corrected (T50 deep pass, 2026-10-26): the label is appended to the quote note only when PrizePicks flagged the quoted lineup as adjusted for the slip's own structure (`power_adj` for Power, `flex_adj` for Flex, both stored in `live_slip_quotes`) AND every leg of the slip is a regular line. A quote that merely replaces the model multiplier carries the quoted multiplier and Flex tiers, keeps the model number as `model_multiplier` and names it in the note when the two differ, without that label (TRANSCRIPT, payout-map subagent 10-22).
- 🔑 **Void and single-survivor reversion (restated).** Power with r legs left pays the r-pick base; Flex with r >= 3 left uses the r-pick Flex table; 2 left on a Flex pays 3x Power-style, never the 2-pick Flex 2/0.5; one survivor pays `compress(1.5 x factor)` on a hit and loses on a miss; nothing left refunds. Verified 79/79. Single-survivor effect on the backtest: 1,120 of 478,900 slips (0.23%), 977.8 units paid against 1,120 refunds assumed (the old assumption was 142 units, 0.03% of stake, optimistic); portfolio ROI unchanged to the decimal.
- 🔑 **Hard leg cap and Less floor (restated, still current).** Implied p never goes below 0.072, so a 2-pick tops out at 18.5x and ~~a single demon at factor about 6.17~~ -> (precision, T50 deep pass, 2026-10-26: at the 0.072 cap the leg factor is 0.5 / 0.072 = 6.94, so a 2-pick would be 20.8x before compression; compression turns it into 18.5x, and 6.17 is 18.5 / 3, a payout-per-three, not a leg factor) (measured on WNBA, transferred to NBA; 4,748 NBA legs repriced; the earlier NBA extrapolation had allowed 2-picks up to 306x). Less is priced as the exact complement of More (S about 0.99) with a floor of 1.7x for Less favourites (factor 0.5667).
- 🔑 **Per-leg price model.** `pp_leg_price` version `pp-leg-v2-sqrt-cap-conservative-floor190`: tail probability of a count distribution with spread c x sqrt(line), c about 2.0 for points-family stats and about 1.25 for rebounds, assists and threes; factor = 0.5 / p. Fantasy score is priced by a different mechanism (fixed prices with moving lines; goblin 2.3x, demon 4.5-4.75x, priced conservatively 2.2 / 4.0; rungs spaced line x 0.07 + 3.2), and its centre line was never archived for NBA, so fantasy is back-simulated only.
- 🔑 **Per-structure breakeven leg rates, sizes 2-6 (digest B, 10-20 17:04 PT).** 2-pick Flex .618, 2-pick Power .577, 3F .577, 3P .550, 4F .550, 4P .562, 5F .543, 5P .549, 6F .542, 6P .547. 2-pick Flex pays 2x / 0.5x, so EV = p^2 + p. No regular-line cell holds .618 in both seasons with n >= 100 and every 2-pick Flex rule lost in both seasons (best: final_hp both top 2, 5 a day, -3.9% / -3.4%).
- 🔑 **Near-1.0 products pay the plain base.** A factor product of 1.047-1.05 on a 4-pick pays exactly 10x ("adj False").

### T50.3.2 — Goblin / demon Less and the 544-quote payout proof (10-20 opening night, `PP_PAYOUT_FINDINGS` `0n` first)
- 🔑 **Less on alternates.** `allowed_wager_types` was archived; PrizePicks opens Less on near-standard rungs of FOUR stats only (points, PRA, rebounds, assists). Less price is the complement of the More price (S 0.991) with the 1.7x favourite floor. The 10-20 archive holds no alternate Less rows because the filing landed after that run.
- 🔑 **544 quotes, sizes 2-6 (modes `grid` 340 slips with 0-3 alternates incl. Less; `stack` 204 slips of 3-6 picks mostly or only alternates).** Grader v3 over quote: Power 3-6 any mix including 3-6 alternate Less mean 0.91-0.97; 6-of-6 Less (23 quotes) mean 0.951, max 1.038; 5 Less 0.92-0.95, max 1.038; 4 Less 0.87-0.97, max 1.075; one all-standard 3-pick grid slip at 1.162 (outlier). Stacked Less is paid at least as the grader assumes. Flex 3-6 with alternates (`flex_alt_tiers`) is 0.84-1.00 of the quote and never above 1.012.
- 🔑 **The one overpay: 2-pick Power with an alternate.** 56 quotes of `compress(3 fp)`: one alternate plus a standard More is exact (1.000); one alternate plus a standard Less mean 0.989, p10 0.944; two alternates mean 0.983, p10 0.931, maximum overpay 11% (a goblin-Less plus a demon pair quoted 5.25, graded 5.83). Research multiplies by 0.93; production grader unchanged pending more quotes (42 quotes at the time; more needed).
- 🔑 **Owner screenshots, 2-pick standards (10-20 17:01 / 17:03 PT).** (a) SGA Fantasy Score 48.5 Less + Wembanyama Fantasy Score 54.5 Less (OKC vs SAS 18:30) paid Power 2.9x, Flex 2x / 0.5x. (b) Dort Steals 0.5 Less + Carter Steals 0.5 Less (ATL vs ORL, 10-21 16:00) paid Power 3x, Flex 2x / 0.5x. Both pairs are same game; this opened the same-game Power question (see T50.3.4).

### T50.3.3 — The 4,236-quote Flex / Power proof and the demon-stack overpay (10-22, ledger item 12, `PP_PAYOUT_FINDINGS` `0r`; `research_pp_flex234.py`, `research_pp_flex_payout_proof.py`, `_overpay.py`)
- 🔑 **Basis.** All 4,236 NBA lineups of 2-4 picks that PrizePicks priced for us (`pp_quote`, Power and Flex tables) were re-priced by grader v3 from the legs' mined factors: 4,886 alternate legs priced with the factor of the SAME run, 7 with another run's, 55 quotes skipped for a leg without a factor.
- 🔑 **All-standard.** 2 / 3 / 4-pick Flex and Power (57 / 45 / 28 quotes) are never above PrizePicks; Flex is exact; Power is exact except where the conservative same-game rule pays less (median ratio 0.96-1.00).
- 🔑 **Flex with goblins or demons is a LOWER bound.** 2-pick all-hit is at or below PrizePicks on 99.1% of quotes (mean ours / PP 0.921), one miss on 100% (0.924); 3-pick all-hit 88.3-88.7% (never more than 5% above, mean 0.96), one miss 96.5-98.3%; 4-pick all-hit 89.8-91.7% (mean 0.90-0.92), one miss 95.3-95.8% (0.89). Overpays are cents (at most +0.13) except 2-pick two goblins with fp below 0.5 (8 quotes, ours 1.40 vs PP 1.20), 2-pick goblin + demon (+0.20 to +0.80 on a handful) and one same-game 4-pick SLIPQ (ours 9.00 vs PP 7.00). Therefore every Flex number is a lower bound of what PrizePicks pays.
- 🔑 **RED: Power with alternates over-pays on big demon stacks.** 3-pick fp 15-78 (+5 to +130, for example 380 vs 250); 4-pick fp 27-259 (271 vs 39 on a same-game slip; 2,694 vs 1,500); 2-pick fp above 10 (+1 to +2.35). Below fp about 5, Power is at or under PrizePicks (within +0.75). `power_alt_v3` is not valid above fp about 5, so any backtest of multi-demon Power is overstated. The production grader was NOT changed (owner's call: cap `power_alt_v3` at the quoted envelope).
- 🔑 **Less-price check.** The archive's model price for a live Less leg sums with its More twin to 1.046-1.050 (2,399 pairs); PrizePicks' own quotes sum to 0.980 on demon rungs (46 pairs) and 0.989 on goblin rungs (29), so the archive pays Less legs 5-15% below PrizePicks (ranking / UI value only; PrizePicks pays its own price). Not changed. Research keeps PrizePicks' law (S 0.99, x 0.97); at the archive's 1.049 no Less cell or pattern holds (best +4% to +16%, lower bound at 5 days below 0).
- 🔑 **Owner's typed multipliers vs ours (10-21 PT).** The owner's PrizePicks 4-Flex 6x / 1.5x equals the plain table and his 5-Flex 11x / 2x / 0.4x sits between table and grader. Separately, for Underdog (ledger day two, 10-21): a first-batch 6-pick Flex (a Ty Jerome version) was deleted on his instruction; the Traore version he re-saved stands (app 15.22x / 1.67x / 0.31x against our 14.55x / 2.48x / 0.24x estimate). Every slip had a regular Less, so every quote was recorded as unmapped and the screen showed the model's estimate with the reason only in each card's small print.
- 🔑 **Found 10-22.** The two portfolio slips of that day were same-game demon slips that PrizePicks CUT (quotes 6x vs backtest 6.66x; 7x vs 9x) yet the screen showed PLAY. This is the case the quote gate (T50.3.5) was built for.

### T50.3.4 — Same-game rules (10-18 -> 10-22)
- 🔑 **The "same-game over-estimates" were a measurement error.** The proof script (`research_payout_proof.py`, lines 51-57) graded with no `event_id`, so `build_slip_engine.grade` derived `same_game = False` and the same-game rule never switched on. The reported 4-Flex 1.20x equals 6/5 and the 3-Flex one-miss 1.33x equals 1/0.75, exactly what `flex_same_game_v3` pays with the flag on. The premise of a 3-Power 1.043x gap is recorded in no doc and is dropped.
- 🔑 **Same-game Flex (10-18 proof run).** All-standard 3-Flex with a same-game pair: 3/1 becomes 3/0.75 (adjusted on 2 of 4 same-game slips). 4-Flex: 6/1.5 becomes 5/1.25 (adjusted on 1 of 3). 5- and 6-Flex never adjusted. An Over / Under pair and a NYK-PHI Bridges / Maxey Overs pair were not adjusted: PrizePicks' per-pair correlation is unobservable. `flex_same_game_v3` is applied to EVERY such slip (conservative, because PrizePicks adjusts only some pairs).
- 🔑 **Real gap, fixed 10-21: all-standard same-game POWER.** From the 104 standard-only quotes in `nba/data/pp_payouts` (sizes 2-6, each with the lineup flag `power_adj`): 2-pick across two games 20 of 20 paid 3x; 2-pick same game 12 paid 3x with `power_adj` false and 5 paid 2.9x / 2.8x, all with `power_adj` true (Assists + PRA, Points + PRA, correlated stats); all 82 slips of sizes 3-6 paid table Power; the only Flex deviation was a same-game 4-pick with `power_adj` true. The SGPOWER round (37 NBA quotes): 2-pick 3.0 x28 / 2.9 x6 / 2.8 x1; 3-pick 6.0 x23 / 5.75 x4; 4-6 picks never adjusted. Cuts fall on teammates taken the SAME direction (one pair of four). Candidate causes still unproven: the projections' `adjusted_odds` flag (8 of 152 standards on the 10-20 board) and star-vs-star or same-stat correlation pricing.
- 🔑 **New rule `pp_slip_rules.power_same_game_v3` = 2.8 for 2-pick and 5.75 for 3-pick (conservative).** Applied in `build_slip_engine.pp_payout`, `nba_market.pp_payout_v3` (`sql/pp_payout_v3.sql`) and `pricing.js`. Backtests were re-graded with the old payout kept in `payout_v3_pre_20261021`; certification 83/83 after test L3 was made side-aware. Any future same-game standard 2-pick Power strategy must use 2.8x, not 3x. The Underdog and grader work of 20:03-20:06 the same evening loaded the rule into the live engine and UI twin; the regrade workflow gained a `keep_col` input.
- ⚠ **Open gaps found by the 10-22 code audit.** (1) In `pp_payout` the goblin / demon branches are evaluated BEFORE the same-game check, so same-game is ignored whenever the slip has a goblin or demon, in both Power and Flex (`build_slip_engine.py` lines 177-185); this is consistent with, but not proven to be the cause of, the over-payment on the two same-game demon slips of 10-22 (6.66x vs the quote 6x, 9x vs 7x; per the digest, not re-verified). (2) `grade()` derives `same_game` from `event_id` only if EVERY leg has one, else False; `pricing.js` `nbaSameGame` returns false if ANY leg lacks `event_id` / `game_pk`. (3) Call sites that grade without the flag: `validate_slip_strategies.py` keeps stale local `POWER` / `FLEX` / `compress` copies (lines 217-220, unverified whether used beyond the regrade) and its regrade calls `pp_payout` without same-game (comment at line 239). (4) The slip builder allows same-game slips and only ranks them lower (cross-game first, then positive-pair, then neutral same-game; `SE_SAMETEAM` re-ranks same-team pairs); its grading passes `same_game` explicitly.
- 🔑 **Help-centre wording.** PrizePicks help says players from the same team, or both teams of one game, form a "same-game combination" with its own, typically lower payout rate; exact multipliers are not published. Correlated picks are shaded, same-player combinations most heavily. Help-centre tables (3-pick Power 5x, 3-Flex 2.25/1.25, 4-Flex 5/1.5) stay recorded as stale; validate against the multiplier locked at submission, never a hard-coded table.

### T50.3.5 — The quote gate (10-22 ~16:10 PT; owner 14:52 PT: "whatever shows there, I put ... don't let anything that's not allowed go on that screen"; 15:22 PT: "be sure you are reading and mapping properly the multipliers"; COMPASS fact `178`)
- 🔑 **Rule.** `live_slip_engine.pick()` records `pp_portfolio.backups` (4) extra portfolio slips in round-robin order as `placed_backup`. `nba/apply_quote_gate.py` is the step "Quote gate" of `nba-pp-payout-map.yml` (mode slipq), right after PrizePicks quotes every placed and backup slip. A slip FAILS when it has no quote, status is not 200, a leg is not on PrizePicks' board as built, there is no all-hit payout, or the all-hit payout is below `pp_portfolio.quote_min_ratio` (0.95) times `build_slip_engine.pp_payout`.
- 🔑 **Selection.** Walk backup order then unit order; the first n passing slips become `placed`; a failed placed slip becomes `placed_quote_skip` (graded `graded_quote_skip`); passing extras stay backups; the step is idempotent, writes notes on `streak_note`, and raises a warning when fewer than n pass.
- 🔑 **Screen.** Slips screen v1.4.38 hides every PrizePicks PLAY slip with no quote yet ("SKIP - waiting for PrizePicks' quote"; the note counts them) and all backup and quote-skip slips; a slip with a leg no longer on the board was already hidden in v1.4.37.
- 🔑 **Certified.** Dry run on 10-22 (`research_quote_gate_dry.py`): both slips fail on the ratio, 0 of 2 pass, nothing written. Production `pick()` with backups on 2025-11-15 and 2026-01-10 in a rolled-back transaction gave 2 placed + 4 `placed_backup` per day, replaced slips never staked, ledger restored. Backups never count as staked (staked profit reads status `graded` / `graded_void` only). Unit names carry the `P_` prefix (`PORTFOLIO_PREFIX`). Later config: portfolio B has `backups` 0 by design; its first slate 10-25 placed 3 and quote-skipped 3 (one leg, Over 1.5 turnovers, no longer on PrizePicks' board).

### T50.3.6 — Underdog: base(n) x modifier product, 4-pick Flex 7.2, floor2, prediction-market contracts, exchange pricing (10-18 -> 10-22; `PP_PAYOUT_FINDINGS` `0m`, `0n` second, `0p`, `0q`)
- 🔑 **Settled from own data (owner 10-18 22:48 PT: use the data we already have, research online, check documentation).** An entry pays base(n) x PRODUCT of `payout_multiplier` (the API field is the modifier, 1/2 of Underdog's probability), not the displayed per-pick number. Evidence: (1) the owner's 10-03 MLB screenshots fit base x product m to 0.1% at 2 / 3 / 4 picks with one constant (1.040 / 1.039 / 1.039), whereas a display-based payout would drift 1.036 / 1.055 / 1.074 (display runs 1.8% above sqrt(3.5) x m for m about 0.6-0.75); (2) the fit needed a decimal-priced pick at m = 1/2 x 1.82 = 0.91, not display / sqrt(3.5) = 0.973; (3) display is per-product: decimal-priced sides display 2 x m (172 sides, ratio 1.000), fantasy-priced sides about sqrt(3.5) x m (2,013 sides, ratio 1.000 at m = 1, curving to -3% at m 1.5 and -18% at m 8 on 7,646 ladder rungs; a Brown PTS 33.5 alternate has m 7.98 and shows 12.2); (4) Underdog's help text says the base multiplier assumes a standard 1.0x for every selection.
- 🔑 **Range of use.** Every Underdog engine leg sits at m 0.6-1.5 (1,029,494 backtest legs; F2 mean 0.838, R 0.995, B1 1.029-1.074; none above 1.5), so nothing changed in the backtests. Display vs modifier on the 10-20 main lines matches (median gap 0.012); ALTERNATE longshots diverge (median gap 0.074 on 1,386 alternates).
- ⚠ **The 1.04 constant is unproven and priced conservatively.** Ten owner screenshots (10-03, MLB) fit 1.04 x base(n) x product identically at 2, 3, 4 picks, yet the help page says two 1.00x picks pay 3.5x, not 3.64x, and the later probe found no 1.04 factor on fantasy picks (section 30h). Our archive cannot decide it: 38 real Underdog entries (`score.slip_entries`, 2026-08-21 -> 09-11) lack the per-pick modifier from placement time, and `archive.underdog_ladder_history` holds one slate captured after the entry. The engine prices WITHOUT 1.04; if it were real, Underdog slips would pay 4% more than assumed, so it can never make a slip look better than it is.
- 🔑 **`/v4/entry_slips/estimate` works without login for fantasy picks (10-21; owner 15:36 PT: go in the app, add legs, understand the multiplier logic).** Access: web bundle (`scan_webpack_chunks` on the app runtime), a GET with `options[i][id]`, `options[i][type]=OverUnderOption`, `fee=10`, `fee_source=cash`, the board's product / `product_experience_id` / `state_config_id` and the scraper's headers. Standard price = `odds.multiplier`; Flex = `flex.offerings[0].pricing[losses].odds.decimal`. `/v4/entry_slips/payout_outcome` returns only base tables. Probe `nba/research_ud_payout_probe.py`; quotes in `nba_market.ud_payout_quotes`.
- 🔑 **Pick kinds on the CA board (10-21 window).** 640 options priced FANTASY (`odds.fantasy`) and 1,770 priced as PREDICTION-market contracts (`odds.prediction`, UDX), 2,410 priced options in total. An entry with 2+ prediction picks needs a signed-in user ("User is required for entries that contain multiple prediction markets"). Signed-in estimates answered "Picks can't be combined" on 48 of 50 prediction-only tries (1,634 of 2,274 priced sides on the 13:22 board carry only a prediction price).
- 🔑 **Prediction picks price as ordinary picks.** The owner's real entries show it: a 4-pick Standard at 9.84 = 12 x 0.82 exactly with three prediction-only legs, and a 6-pick Flex placed as Flex with four prediction-only legs (owner screenshot 20:15 PT; placed legs differed from ours). So prediction-market picks are NOT a Flex blocker and the engine has no restriction. This supersedes an audit recommendation (a separate rule STD[n-1] x product of fantasy m x prediction decimal x about 0.95), which was NOT adopted. The one placeability rule: `nba_main_ui.ud_alt_policy.hide_prediction_market_alts` (default TRUE) drops alternate rungs of prediction-market lines flagged in `nba_market.ud_line_flags` (provider kalshi / udx; 7 of 7 sampled alternates were in the feed and not in the app).
- 🔑 **Fantasy picks proven (110 entries).** Standard = STD[n] x product of `payout_multiplier`, 51 of 54 within 0.5% (the 3 misses = line moved between scrape and quote); Flex all-hit = FLEX[n|0] x product to 0.05%. Across DIFFERENT games 47/47 Standard and 36/36 Flex were exact to the cent with floor2(base(n) x product); same-game entries were 4 of 7 exact, the rest x0.86-0.99 (correlation), and the engine never builds them. One prediction pick + fantasy picks (29 entries): Standard about STD[n-1] x product of fantasy m x the prediction pick's decimal price x 0.94-0.96 (smaller factor on longer prices), no Flex offered; our all-m model was off by 1-17%.
- 🔑 **Base tables.** Standard 2-6 = 3.5 / 6.5 / 12 / 20 / 35 (engine also carries 7: 65, 8: 120). Flex all-hit 3: 3.25; **4: 7.2 (the help page's 6 is wrong)**; 5: 10; 6: 25; 7: 40; 8: 80. Flex 3: 3.25 / 1.09; 4: 7.2 / 1.4; 5: 10 / 2.5; 6: 25 / 2.6 / 0.25; 7: 40 / 2.75 / 0.5; 8: 80 / 3 / 1.
- 🔑 **Flex partial pays the product of the HIT picks.** The partial shown in the app is the BEST case, FLEX[n|k] x the largest product of hit picks' m (the k lowest-m picks miss): 1 loss median ratio 0.996-0.999 per size (n 48), 2 losses 0.995 (n 12); one 5-pick at 0.869 is unexplained. Our screen showed the MEAN over miss sets, so the owner's typed 1.67x / 0.31x could never match; `pricing.js` now shows the best case (UI v1.4.36). What is actually paid on a loss = product of the picks that hit.
- 🔑 **Applied 2026-10-21 (owner 19:51 PT: recalculate the multipliers).** Before the fix every Underdog payout path used Flex 4|0 = 6.0 (only `research_ud_payout_probe.py` had 7.2) and none floored to 2 decimals. Now `build_ud_slip_engine.py`, `validate_ud_slip_strategies.py`, `research_postseason_program.py`, DB `nba_main_ui.ud_payout.flex["4|0"]` (old value kept in `ud_payout.changes`) and `pricing.js` carry 7.2 and floor2; the live engine floors at 20:03-20:06. Only 4-pick Flex slips with zero losses were affected; P5's 4-Standard and 6-Flex slots are not. Stored backtest results were regraded.
- ⚠ **Still open (research-only path).** `research_postseason_program.ud_grade` pays 0 when a Flex is left with 2 live picks (its UD_FLEX table has no n = 2), whereas the live engine `ud_live_slip_engine.payout`, `playoff_unders.ud_grade` and `pricing.js` pay a 2-pick-left Flex as a 2-pick Standard. Per the digest, not re-verified after the fix: the `ud_edge_monitor_research.py` docstring and the floor inside `ud_live_slip_engine.payout`.
- 🔑 **Haircuts differ by path (restated).** The postseason research program multiplies m by 0.995 for 1.00x legs and 0.99 for priced legs before grading; the backtest engine applies `UD_HC_MAIN` / `UD_HC_ALT`; the live engine and UI apply none. Tiers: R = 1.00, F1 0.90-0.99, F2 0.80-0.89, F3 below 0.80, B1 1.01-1.14, B2 1.15-1.39, B3 1.40 and above; duplicates keep the LOWEST m. Fallback m = round(decimal / sqrt(3), 2) at `ud_live_slip_engine.py` line 119.
- 🔑 **Exchange pricing (10-22, `0q`).** Every Underdog pick now carries m = 0.5 x the exchange decimal. On 1,152 sides of 10-20 / 10-21 matched at the SAME line to DraftKings / Bovada / Fliff no-vig, m x nv has mean 0.4666, median 0.4661, sd 0.0353, p10 0.446, p90 0.491; corr(m, 0.465 / nv) = 0.895; 96 sides sit exactly at 1.00; 70 sides have m x nv at or above 0.50, 4 at or above 0.535. Underdog is re-priced at m = round(0.465 / nv, 2). Fair-odds return is about 0.466 per unit of m, against Standard breakeven per-leg returns STD[n]^(-1/n) = 0.535 (2) / 0.536 (3) / 0.537 (4) / 0.549 (5) / 0.553 (6). Effect on P5: see the sibling sections on the P5 portfolio.
- 🔑 **Per-leg breakeven roots (restated).** PrizePicks 5-Flex 1 / 0.5425 = 1.8433; Underdog 2-Standard 3.5^(1/2) = 1.8708 (53.45%), 3-Standard 6.5^(1/3) (53.58%), 4-Standard 12^(1/4) (53.73%); Sleeper and Fliff root 1 (per-leg price already). Realised hit x m by multiplier bucket: PrizePicks (829k legs) easier alternates 0.476-0.489, main 0.500, harder 0.434 falling to 0.388; Underdog (422k) 0.466-0.470 / 0.499 / 0.466 (m 1.06) falling to 0.374 (m 1.41); Pick6 (238k) 0.449-0.463 / 0.496 / 0.431 falling to 0.369; alternates carry an extra margin of 3-7% on easy rungs and 13-26% on hard rungs.

### T50.3.7 — Betr: priced by its own server (10-18 19:47 PT -> 10-19; `PP_PAYOUT_FINDINGS` `0m`, `BETR_BUILD_STATE.md` section 8, COMPASS fact `169`; owner 19:47: you have the key, find out how it works)
- 🔑 **How the app prices.** `probe_betr_slip.py` read the bundle (`betr-app.bundle.js`, via CDP `Page.getResourceContent`; an in-page fetch fails) and found 36 GraphQL operations. Adding a pick makes the app send the QUERY `ValidateEntryWithRules(rulesIds, entry)` -> `validateEntryOnEntryRules`. The server answers per entry rule: PERFECT (`perfectRegularMultiplier`, `perfectBoostedMultiplier`, `toWin`), DYNAMIC = Flex (`dynamicMultipliers` of numberOfPicks / winningPicks / multiplier, `boostedMultipliers`), MYSTERY (2 picks only), RACE_TO_PLACE, plus validation errors (minimum 2 teams, maximum picks per tier, open-entry limits). It is a query, not a mutation; `CreateEntry` and `CancelEntry` exist and were never sent.
- 🔑 **Quote probe.** `probe_betr_quote.py` boots like the harvest, takes the app's own request headers from the wire (a plain bearer returns 401), prices any set of board picks in-page, read-only. About 400 entries; every answer is stored in `nba_market.betr_quote`. Rule row `nba_config.pp_slip_rules['betr_payout_v1']` (status verified; it had been stored as a double-encoded string and was fixed as an object on 10-19). Session valid until 11-15; the 10-26 board had not posted at about 22:30 PT on 10-25, so a fresh guess-check through `nba-browser-probe` is pending.
- 🔑 **Perfect (all must hit), regular lines, any MORE.** 2 picks 3; 3 -> 6; 4 -> 10; 5 -> 20; 6 -> 35; 7 -> 50; 8 -> 100; 9 -> 200; 10 -> 300 (the sequence 3 / 6 / 10 / 20 / 35 / 50 / 100 / 200 / 300 for sizes 2-10; PrizePicks Power is 3 / 6 / 10 / 20 / 37.5).
- 🔑 **Dynamic (Flex), regular.** 2: 2 / 0.5; 3: 3 / 1; 4: 6 / 1.5; 5: 10 / 2 / 0.4; 6: 20 / 1.5 / 1; 7: 35 / 2 / 1.25; 8: 50 / 2 / 1.5 / 1.25; 9: 100 / 2 / 1.5 / 1.25; 10: 200 / 2 / 1.5 / 1.25 / 1 (PrizePicks Flex is 3/1, 6/1.5, 10/2/0.4, 25/2/0.4).
- 🔑 **All-LESS discount, measured at every size 2-10 (10-19 15:58 PT sweep).** Perfect 2.75 / 5.5 / 9 / 18 / 31.5 / 45 / 90 / 180 / 270; Flex tops 1.75 / 2.75 / 5.5 / 9 / 18 / 31.5 / 45 / 90 / 180 with partial tiers (for example 10-pick 9 / 1.75, 8 / 1.25, 7 / 1.25, 6 / 1; 2-pick Flex 1.75 / 0.5, 3-pick 2.75 / 1, 4-pick 5.5 / 1.25; 5-pick Flex 9 / 1.75 / 0.25 against regular 10 / 2 / 0.4; 6-pick 18 / 1.25 / 1 against 20 / 1.5 / 1). From 5 picks the all-LESS top is 0.9x the regular table. The discount applies only when EVERY pick is LESS: five LESS of six still pays the full table (k LESS of n tested for n 2-6; one LESS on 9 stats). Same-game and same-team pairs: no adjustment.
- 🔑 **Tier mixes priced per entry.** EDGE_1..4 (easier lines) LOWER the payout (3-pick Perfect with one EDGE_1 4.25, EDGE_2 3.75, EDGE_3 3.5, EDGE_4 3.25); boosted tiers RAISE it (3-pick with one BOOSTED 10, MINI 7, SUPER 15, BOOSTED_4 25). Maximum 3-4 picks per tier; entries need 2+ teams. The live quote is the number for any real slip; the tier multiplier is not on the board.
- ✅ **Verified.** `betr_payout_v1` matches Betr's own stored quotes 230/230 on Perfect and 586/586 on Dynamic tiers, sizes 2-10 (per the digest, 10-19 `nba_market.betr_quote`). `pay_betr` in `research_sleeper_transfer.py` handles Perfect and Dynamic, regular and all-LESS, with Betr leg m = 1 (flat).
- 🔄 **Supersedes fact 136 / 31u "Betr: flat table like PrizePicks".** For Under-heavy PrizePicks strategies an all-Under 3-pick on Betr pays 5.5, not 6.
- ⚠ **Betr is PARKED in production (10-19 22:51 PT; owner: leave Betr out for now, debug, simulate and test it separately).** `p3_betr_wait.enabled` = false and Betr is removed from `nba_main_ui.apps`; the A/B simulation `sim_betr_ab.py` (workflow `nba-sim-betr-ab.yml`, rolled back) scored 8,920 legs with Betr on and 7,036 parked (2,320 Betr legs dropped). Research use is allowed; older text in this file that treats Betr as a live board predates the parking.

### T50.3.8 — Sleeper (10-09 owner screens, restated and extended 10-25) and PicksVS
- 🔑 **Rules.** Per-side multipliers come from the public board and match the app. Max (Power) = product of multipliers x a size bonus; Flex = average of the (n-1)-pick sub-slips, each with its OWN size's Max bonus. Verified: 2-pick Max 1.79 x 1.78 = 3.1862, app 3.18 (bonus 1.00); 3-pick Max product 5.5759, app 6.02 (x1.0797); 4-pick Max product 10.0365, app 11.06 (x1.102); 4-pick Flex 4/4 = round robin 5.639 x 1.0797, app 6.09; 3/4 hit app 1.52; 3-pick Flex all hit app 3.14 (round robin 3.1446), two hit 1.05. 10-25 22:21 PT: the Flex sub-slips carry their size's Max bonus (fits the owner's 4-pick Flex screen 6.09 / 1.52).
- ⚠ **Unverified.** The 5- and 6-pick screens (10-09) show Max 20.43 / 39.01 and Flex 9.42 / 1.92 / 0.39 and 21.67 / 1.86 / 0.37, but two leg multipliers were unknown, so the size bonuses are estimates only: `BONUS_EST` {2: 1, 3: 1.0797, 4: 1.102, 5: 1.144, 6: 1.227} in `research_sleeper_transfer.py` (5 and 6 are estimates, not verified). 5+ Flex also pays with two misses (0.39 / 0.37); our code prices those tiers at 0, which is conservative.
- 🔑 **Caps, overround, feed.** MAX payout cap 100x (from the web bundle text; attribution per the digest, not re-verified). Main pairs carry a flat 12.4% overround (p x m = 0.889 in every prop group and side; model price m = round(1 / (1.1238 p), 2)); the Over-only alternate ladder carries 17-56% (worse the longer the shot); 10-20 board overround 12.0-14.3%. Sleeper equals Fliff's feed: de-vigged chance equal within 1 point on 99% of 7,766 main legs (sd 0.29 points; DraftKings / Underdog / Bovada sd 1.5-2.2). Break-even per leg is 1 / multiplier (0.56 / m had put a 1.87x leg at 30%; UI test 105/105).
- 🔑 **Code.** `nba_market.sleeper_slip_payout` (`nba/sql/sleeper_slip_payout.sql`): Power = product x (1 - haircut), Flex = round-robin mean (one miss = sub-product / n, two misses 0); `classification_config['sleeper_payout']` haircut is 0.0 after the 10-09 proof (MLB range kept as `slip_haircut_mlb_observed`); `pricing.js` applies no haircut or bonus. Sleeper Picks pricing is NOT in the public web JS (bundle probes found only localisation strings); it needs a login.
- 🔑 **PicksVS (the owner's California Sleeper; support article "Sleeper Player Picks Rules", 2026-02-13).** Guaranteed payout = entry x VS Score (product of multipliers) plus a pool prize. Regular pools of up to 5,000 entries pay 100x to the top VS Score even if nobody is fully correct ("ignoring incorrect picks"); Intermediate and Beginner pools of 20 entries pay 3x (maximum USD 1); the higher of the two is paid, never both; one user holds at most 5% of a pool; "ez Pick" (1.0x, minimum entry 1.25x) lets an entry use one team only. The pool prize is worth at most 100 / pool size of the fee on average (2% at 5,000) and goes to the longest all-hit entries, whose base EV is -40% to -60%, so it is not usable unless pools are far smaller than 5,000 (pool fill is visible only in the app).
- 🔄 **10-25 22:07-22:35 PT.** Sleeper entry pricing probe (size bonus, Flex, VS score; no login), Sleeper pricing code read from every public web-app chunk, and Fliff Pick'Em entry quote from Fliff's own public API (read-only, no login, never places).

### T50.3.9 — Fliff Pick'Em (skipper feed) and Fliff sportsbook
- 🔑 **Fliff has a Pick'Em product.** Per-selection multipliers are public in the "skipper" feed (eu_odds about 1.80 / 1.85 typical, about 9.6% margin); `probe_fliff_pickem_quote.py` reads it (league ids are string keys of the form `fkey__sk_league__461`, games `fobj__conflict_event__N`). Rules: contest multiplier = product of selections (minimum 2 picks from at least 2 teams); Flex allows 1 loss and SuperFlex 2 losses (payout amounts unknown); a void in one game voids EVERY selection from that game (a void in a 2-pick refunds the entry). Quote and contest calls are private (they need the auth token) and the "Parlay Plus" quote needs a login, so the amounts are not mapped.
- 🔑 **Sportsbook side.** Fliff sportsbook main-pair overround 1.0904 over 5,971 pairs, so Fliff m = 1 / (1.0904 p). Caveat: the Fliff part of `research_sleeper_transfer.py` prices the Fliff SPORTSBOOK, while the owner plays Fliff Pick'Em (skipper multipliers similar, about 1.8 / 1.85). In code, `main_ui/board.js` converts American odds per side to decimal (a >= 100: 1 + a/100; a <= -100: 1 + 100/-a) and the slip is treated as the product with break-even min(0.99, 1/decimal); no Fliff slip grader exists in `nba/`.
- ⚠ **Not verified against the app.** No Fliff multiplier has been checked in the app. The Fliff scraper was rejected with api error 30040 (build 285 below the server's minimum 286); `scrape_fliff_board.py` now uses build 286 with a self-heal that raises the build one step (up to 8) on 30040 (see the sibling workers section).
- 🔄 **Superseded by §T50.3.** The older line "Fliff has no pick'em table" is replaced by this section.

### T50.3.10 — The standing rule: map by building slips in the app, then guess-and-check (owner 10-25, 22:05 / 22:24 PT)
- 🔑 **Rule.** Before pricing any pick'em app, map its per-leg AND per-slip-structure multipliers by building slips in the app or web itself (through Actions or workers, never the owner's own browser; no login if possible), then predict payouts for many slips and check them in the app; any doubt or mismatch means it is not mapped yet. Owner words: "the first thing is proper multipliers per leg and per slip structure"; "build slips and get the multipliers, as many as needed ... then guess exercise: build slips with the numbers you think are right, go to the app, add them and check, for all remaining apps".
- ⚠ **Owed at 10-26 00:11 PT.** Sleeper and Fliff price-quote probes (2-8 picks, Max and Flex, many slips) with guess-then-check to a 100% match; a Sleeper login did not work in the first 4 attempts (account is code-only), so Sleeper and Fliff structures stay unmapped; Betr fresh guess-check when the 10-26 board posts; record the rules in `pp_slip_rules` / `sleeper_payout` and COMPASS. See the sibling OPEN_ITEMS section.
- 🔑 **PrizePicks and Underdog meet the rule; Betr meets it for sizes 2-10.** Sleeper meets it for sizes 2-4 only; 5-6 stay estimates; Fliff Pick'Em does not meet it.

### T50.3-Z1. Deep-pass additions from the full-transcript re-read (2026-10-26): PrizePicks tables, help centre, price model
*(Source: TRANSCRIPT, the subagents of 10-21 / 10-22 as re-read in full on 2026-10-26, unless a bullet says otherwise. External-agent statements are the agent's claims, not adopted rules.)*
- 🔑 **Goblin floor reconciled (0.6333 vs 0.614).** The floor factor 0.6333 (1.9x on a 2-pick) is the real price floor of version `pp-leg-v2-sqrt-cap-conservative-floor190`. The conservative goblin margin of minus 3% turns it into 0.6143 (1.843x), which is the "floor 0.614" of the tier map and the "never under 1.843x" audit check. The earlier floor 0.6933 (2.08x) times 0.97 gives 0.6725 (2.018x), the figure a correction note called optimistic. So 0.614 is the conservative image of 0.6333, not a second floor. Whether the real floor varies by stat and league stays the open question of T23 item 10. (TRANSCRIPT, subagent 10-22; this closes the "not reconciled" wording in the goblin / demon doc's T50.2.10.)
- 🔑 **Per-leg constants re-checked on 103 usable NBA legs (2026-09-21).** Points 1.87 against best 1.90 (no gain); count stats 1.08 against 1.12; rebounds plus assists 1.34 against 1.30 (5 legs); nothing was changed. The earlier claim that rebound and assist constants are league-specific is NOT established: single NBA ladders prefer 1.08 (SGA rebounds, Brunson rebounds, Cunningham assists) or about 1.3 (Wembanyama rebounds, Brunson assists). NBA's 1.08 rests on 8 ladders from 4 players and beats 1.3 only modestly (6.2% against 8.4% mean error), so it is kept pending preseason data. Rejected: per-player dispersion, because a ladder's fitted c does not follow the player's own season dispersion (SGA points 1.92 vs 1.29; LeBron 2.12 vs 1.35; Tatum 1.98 vs 1.00); PrizePicks uses a family-level spread and ladder scatter is mostly estimation noise (2-4 legs per ladder, payouts rounded to 0.25).
- 🔑 **Fantasy score mechanics (2026-09-21 / 09-22; extends T23.6 item 6).** All 96 of 96 fantasy-score ladders have exactly one goblin and one demon per standard; the gap g runs from 4.5 at line 15.5 to 6.0 at line 41.0 (r = 0.97, always a whole or half point); Less mirrors the prices exactly (demon Less 2.3x, goblin Less 4.5-4.75x); a spread constant of about 2.26 gives 4.0% error against 7.0% at the points constant 1.87. The official formula PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK - TOV equals `nba_fantasy_pts` on 26,649 of the 26,651 rows of the 2025-26 game log with 0 disagreements (2 rows were not in the checked population). That PrizePicks uses the same weights is still to be confirmed on a live NBA board.
- 🔑 **Basis of the Less pricing (WNBA run 2026-09-21, 250 legs quoted More then Less back to back).** Goblins on Less paid 3.5-4.75x and demons on Less 1.7-2.8x, every such quote is_adjusted. P(More) plus P(Less) had a median of 0.978 (144 demon legs) and 0.986 (106 goblin legs). NBA's points-family formula (c 1.87, P(Less) = 1 - P(More)) priced 107 Less legs with 4.7% mean error, 91% within 10% and median ratio 1.02. Favourites floor at 1.7x (factor 0.5667): 28 of 36 legs whose complement fell below 1.7x paid exactly 1.7x. Less longshots paid 3.25-8.0x, so the 18.5x engine cap was not reached. The price-table primary keys now include side (a Less row sharing run, projection and partner with its More row had been dropped silently). Floors are side-aware: the goblin floor applies to More only, and `less_favorite_floor_factor` defaults to the goblin floor so older versions reproduce exactly; `pp-leg-v2-sqrt-cap` carries 0.5667. On that date there were 0 NBA alternate-on-Less keys and 799 standard-on-Less keys priced at factor 1; the refresh function produced 0 new prices over 9,036 keys.
- 🔑 **Mixed-slip void reversion, match rates (2026-09-22; extends the void bullet above).** From 2,662 stored reversion schedules, PrizePicks shows the payout of the r LOWEST-factor legs of the original slip. Within one price step it matches 99.5% / 96.6% / 91.3% for 2 / 3 / 4 legs left (mean ratio 0.997 / 1.004 / 1.002); a keep-highest rule matches only 0-20%. With 5 left only 57.5% match (ratio 1.019, because the old multi-alternate law ran low); with 1 left, 1.5 x factor runs about 6% under PrizePicks. Settling on the displayed worst case or on the actual survivors both pay at least as much as keep-lowest, so grading by keep-lowest is conservative.
- 🔑 **Superseded 09-21 slip laws, constants for the record (extends T23.6 item 2; replaced by grader v3, T50.3.1).** One alternate: payout = b x f^a with b / a = 5.330 / 1.008 (3 picks), 10.058 / 1.034 (4), 18.605 / 1.057 (5), 35.432 / 1.069 (6); R-squared at least 0.9993; mean error 0.9-1.6% against up to 4.6% for a linear base (this explained the old `base_power_mixed` of plus or minus 6%). Two or more alternates: 3 picks within 0.2-1.8% of the product law, 4-6 picks about 7% below it (obs / pred 0.92-0.97). Ratio to the one-alternate law by combined multiplier M: M under 12 gives 0.956-0.986 (a flat haircut of about 3%; goblin-only slips about 1.0); M at least 25 (4 slips, average 62) gives 0.748, fitted by the 2-pick exponent 0.857 with a knee at M about 8.2; one alternate never reaches the knee because the 0.072 leg cap limits it to about 7.95. Rebuilt `pp_slip_power`: payout = b_n x compress(product f^a_n) x haircut (1.0 for one alternate, 0.97 for 2 or more). Validation on 452 real quotes it never learned from (exact / within one step / mean error): 2-pick standards (19) 84% / 100% / 0.5%; 2-pick alternate x alternate (240) 54% / 95% / 2.0%; 3-6 picks all standard (16) 100% / 100% / 0.0%; one alternate (72) 33% / 81% / 1.2%; 2 or more alternates (105) 6% / 25% / 4.0%.
- 🔑 **Two figures for B_demon_3flex on the app's Flex tiers (amends the `flex_alt_tiers` bullet).** The code comment in `build_slip_engine.py` (10-09, first regrade) reads -12 / +33%, while the ledger and the `live_slip_engine.py` comment record -16 / +31% (2024-25 / 2025-26) after the full regrade. The ledger figure is the one to cite; the code comment was not updated.
<!-- T50 Z1 END -->

## 🆕 §T49.3b — **`T49` TRANSCRIPT BATCH (subagent `a92b2db`, `10-09 20:31 PT`, interrupted): THE PAYOUT CODE AS IT STOOD BEFORE THE FLEX-GRADER FIX, AND WHAT IT SAYS ABOUT THE ROOTS AND THE RULES** *(source: the transcript holds only the agent's code reading — no assistant turns and no report — interrupted at 20:31:25 PT before it reached the Fliff or Betr code, the board scrapers or the docs; statements below are read from the code it opened and are the pre-fix snapshot)*

- 🔑 **Two roots, two conversions (qualifies `§T49.3`'s "times the square root of 3.5").** The Underdog live engine falls back to `round(decimal / √3, 2)` when no stored modifier exists (`§30i`; `NBA_DATABASE.md` records the formula as exact on 210,155 of 210,155 rows in 2024-25 — a count that is not in these transcripts). The price-shop ledger uses `ud_ref_per_leg` = 3.5^½ = 1.8708 (`§31aa`, 10-09); before that it used 20^(1/5) = 1.8206, which priced every Underdog leg 2.7% too low. The root belongs to the conversion: modifier → per-leg multiple uses 1.8708 in the ledger; displayed decimal → modifier uses √3 in the live engine.
- 🔑 **Price-shop ledger formulas.** `p_x_m = p·m_eff`; `gate = (p − margin_pp)·m_eff ≥ 1` with `margin_pp` 0.0916; `v_cell = p_cell·m_eff`; `gate_cell = v_cell ≥ 1 + cell_margin` (0.03). Underdog `m_eff = m × 1.8708`; Fliff `m` is American odds converted to decimal (1 + 100/|a| for negatives, 1 + a/100 for positives); PrizePicks and Betr `m` is NULL (flat tables). `p_cell` is the distinct-leg hit rate per certified cell over both seasons, kept only when n ≥ 30 (PrizePicks cells from `slip_engine_legs_mf` and `_mf_nosteals`, Underdog from `ud_slip_engine_legs_dlt_orig2`, plus the `playoff_unders` rule). Kind is `alt`, `promo` or `std`; the standard listing is preferred on duplicates. The old Sleeper ledger root `m_eff = m × (1−h)^½` (0.9592 at 8%) is superseded (root now 1.0, recorded in `§T49.3`).
- 🔑 **Sleeper payout function, as specified in the code.** `nba_market.sleeper_slip_payout(p_mult double precision[], p_result text[], p_mode 'power'|'flex', p_haircut numeric default NULL)`; inputs are the displayed over/under multipliers from the Sleeper board; it returns a multiple of stake (1.0 = refund). Power = the product of the multipliers × (1−h), rounded to 4 decimals; Flex = the average over the n sub-combinations that drop one pick each × (1−h); voids drop the pick; fewer than 2 live picks returns 1.0; a Flex left with 2 live picks pays as a 2-pick Max. MLB basis: 19 placed MLB slips plus screenshots (2026-09-10); MLB 3/3 Flex predicted 2.775 vs real 2.78; 2/3 predicted 0.884–0.963 vs real 0.92; the slip haircut was 2–8% below the product on MLB. Seven verification cases (2026-10-09): 3/3 Flex of 1.6658 legs = 2.7749; 2/3 = 0.9250; 1/3 = 0; 2-pick Max 1.78 × 1.75 = 3.1150 (2.8658 with the 8% haircut); 2-pick with a void = 1.0; 3-pick Flex with a void = 3.06; 4/4 Flex 1.8/1.7/1.6/1.5 = 4.4715. **Open:** the function returns 0 for two or more misses ("pays only at 5+ picks, never verified"), while the owner's NBA screens record 5-pick Flex 9.42 / 1.92 / 0.39 and 6-pick 21.67 / 1.86 / 0.37 — so the function understates that tier, and no document records a change after this reading; its fallback is still `coalesce(…, 0.08)` and the ledger default 0.08, while the config tunable is now 0.0 (the fallback matters only if the row is missing).
- 🔑 **Underdog engine.** Tiers by modifier: R = 1.00; F1 0.90–0.99, F2 0.80–0.89, F3 below 0.80; B1 1.01–1.14, B2 1.15–1.39, B3 1.40 or more; duplicate legs keep the lowest modifier. Grading: a DNP or a push voids the pick; fewer than 2 remaining means a refund (payout NULL, profit 0); Standard pays STD[n′] × ∏m; Flex pays FLEX[(n′, misses)] × ∏m over the hits; a Flex left with 2 picks pays as a 2-pick Standard; a slate with no box scores is left ungraded and retried instead of voiding every leg as a DNP (10-08). The Flex table is copied in `build_ud_slip_engine.py`, `research_postseason_program.py` and `validate_ud_slip_strategies.py`; the last two stop at 6 picks (`(6,2)` = 0.25) with no 7- or 8-pick entries. Haircut knobs `UD_HC_MAIN` and `UD_HC_ALT` apply to payout factors only. Per-leg board fields: Underdog `multiplier` plus `price` (scraper `higher_payout` / `lower_payout` from American price), Sleeper multiplier, Fliff `price`. No Fliff or Betr slip-payout code exists (flat or odds-only on the board, priced for availability only); same-game rules and payout caps were not reached.
- 🔑 **PrizePicks grader and SQL mechanics (pre-fix).** `compress(base·fprod)` was applied to every Flex tier, partial ones included; `compress(p)` = p up to 9.1, then 9.1·(p/9.1)^0.857; a single survivor pays `compress(1.5·factor)`; a Flex reverting below 3 picks plays as Power. The Python grader multiplies the survivors' own factors, applies the r-leg base, then compresses; the SQL `pp_power_after_voids` keeps the lowest factors and pays a single survivor as `floor(1.5·min factor·10)/10` — `PP_PAYOUT_FINDINGS.md` calls the keep-lowest rule conservative; which rule each of the backtest, live and certifier graders uses after the Flex-grader fix is not stated in these transcripts (open). `pp_flex_standard_payout(legs, hits, original)` returns 1.5 for 1 leg, 3.0 for a reduced 2 legs, and 2.0 / 0.5 only for an untouched 2-pick. Power-with-alternates rule keys: `base_power`, `compression` (knee, exponent), `rounding_power` (`step_below_3`, `step_at_or_above_3`), `mixed_power_one_alt` (b, a), `mixed_power_multi_alt` (haircut, knee, exponent); one alternate pays b_n·(∏f)^a_n (the "verified law"); `pp_slip_power_conservative` takes its haircut from `pp_conservative_policy['slip_haircut']` by kind (`all_standard`, `two_pick_alternates`, `one_alternate`, `multi_alternate`) and rounds down to 0.1 below 3× and 0.25 from 3× up. The 10-07 certification fix for a single survivor refunded instead of paying 1.5× or losing touched 70 certified slips (35 hits, 35 misses).
- 🔑 **Stale lines in `PP_PAYOUT_FINDINGS.md` (a build-chat file, named only).** Its older lines say `verified` covers 3–4 picks and `unverified` 5–6, that 5- and 6-pick 20 / 37.5× are published but unverified, and that voids revert one size down with a refund below 2; the SQL returns `confidence = 'verified'` for any all-standard base, the same file matches reversion schedules 79 of 79 for n = 2–6, and the single-survivor 1.5× rule supersedes the refund. This documentation follows the later statements.
- 🔑 **Certifier L10 payout checks.** Out-of-sample compression points (14.25 → 13.5, 17.25 → 15.5, 26.0 → 22.5) must stay within 6% error; a plain product overstates demon stacks by about 13% at 20×; the 3-pick Power break-even is (1/6)^(1/3) = 0.5503; a live scrape of the PrizePicks ways-to-pick page (retry added 10-09) must show 2/3/4/5/6-pick Power at 3 / 6 / 10 / 20 / 37.5 (the support article is stale and still shows 3-pick Power 5×).
- 🔑 **Edge-monitor break-even** is −10.84 pp on the certified Underdog build (−10.82 / −10.68 per season); an independence model understates ROI by 24 points.

## 🆕 §T49.3 — **`T49` (`2026-10-09 → 10-16`): PAYOUTS PROVEN APP BY APP — THE PRIZEPICKS FLEX GRADER WAS WRONG FOR GOBLIN / DEMON SLIPS, SLEEPER AND UNDERDOG ENTRY RULES, THE QUOTE TRANSPORT** *(source `T49`: certification ledger blocks "PRIZEPICKS CHEAP QUOTE PATH FOUND; SLEEPER REPLICATED TO NBA" and "PAYOUTS PROVEN APP BY APP", `NBA_COMPASS.md` facts `150`–`151`, strategy `§31ad`, `PP_PAYOUT_FINDINGS.md` `§0j`–`§0k`; **AS STATED, no transcript**; owner `10-09 20:04 PT`: keep trying on PrizePicks and replicate Sleeper to NBA; `20:30 PT`: prove the other apps as well for the payouts and make everything sharp)*
- 🔑 **PrizePicks quote transport (blind for ten days, then restored).** From 2026-09-30 every `/game_types` quote from the payout map got the bot-wall interstitial (403) while the board GET kept working — nothing went red, so the payout map, the price-drift monitor and the `§31aa` multiplier work were blind (last 200s 09-29). First fix: a real Chrome opens the app, collects the wall's own cookies and quotes with `fetch()` from the page (minimal headers only — the device headers the curl path sent make Chrome send a CORS preflight the API refuses). Cheaper path found next: the wall keys on the TLS fingerprint being a CURRENT Chrome; the `primp` library's `chrome_153` emulation has the same JA4 as the real Chrome 154 (curl_cffi's newest, chrome150, is one extension short and cannot be patched to match), and it answers the quote endpoint from the runner's own address. The payout-map transport ladder is primp, then curl_cffi, then real Chrome, the newest primp target picked each run. Certified run: 78 of 78 quotes identical to the real-Chrome quotes, no browser. (Transport detail and the probes live in `PP_PAYOUT_FINDINGS.md`.)
- 🔴🔑 **The PrizePicks Flex law with alternates (goblins / demons) — from PrizePicks' own quotes (48 MIXED quotes, 40 all-demon 3- and 5-Flex probe quotes, the 2026-09 WNBA mining; 917 quote tiers in all).** In a Flex slip with alternates the one-miss and two-miss tiers barely move with the factor product: 3-Flex one miss about 1.0x for fp 0.8–3.4, 1.5x at 3.6–3.9, 2.0x at 5.4, 2.25–2.5x at 6.4–6.8, 3.5–3.75x at 11.7–13.1, 10x at 52.7; 5-Flex one miss about 2.0x up to fp 6.8, 8.5x at 9.8, 15–17.5x at 22–25; 5-Flex two misses 0.4x up to 6.8, 2x at 9.8, 3–4x at 22–53; while the ALL-HIT tier rises faster than FLEX x fp (5-Flex at fp 5.43: 87x, against FLEX x fp compressed 42x). The same picks re-quoted can differ by one rounding step (5-Flex 4 of 5: 15 vs 17.5): the tiers carry a per-leg term we cannot see.
- 🔴 **What was wrong and the fix.** `build_slip_engine.grade` paid FLEX[(n, hits)] times the product of leg factors on EVERY tier, so partial tiers were overpaid 2–5x; the demon strategies earned most of their certified payout there (B_demon_3flex 2024-25: 79% from the one-miss tier). "Demon Flex slips underpay anyway" (`§FLEX TIER RULE`, 2026-09-21) was true of the all-hit tier only. One grader now: `nba_config.pp_slip_rules['flex_alt_tiers']` (lower envelope per size and misses) read by `nba_market.pp_flex_alt_payout()` / view `pp_flex_alt_segments` and by `build_slip_engine.flex_alt_payout` — live pick, backtest, validator V3 null, certifier L11, playoff-unders cross-checks. All six backtest tables re-priced (488,474 slips; the old payout kept in `payout_grader_v1`); the curve rebuilds after every payout-map run and P5 step 3f regrades before certifying. Power slips and all-standard Flex are unchanged.
- 🔴 **ROI before to after (market-free twin, own cap, final week out; 2024-25 / 2025-26).** B_demon_3flex +52 / +90 to `-16` / +31; B_demon_5flex +70 / +204 to `-22` / +84; A_wsteals_5flex +69 / +96 to +36 / +79; A_core_5flex (retired) +76 / +97 to +51 / +79; C_wstocks_4flex +55 / +79 to +31 / +66 (**later corrected** in the 10-15 full pass: C strategies run on the no-steals twin, true record +1.5% / +52.5%); A_wrebounds_4flex +49 / +93 to +38 / +88; every Power strategy unchanged. Recertified: P5 66 of 66 PASS (L11's recompute 0 mismatches); B_demon_5flex and A_wsteals_5flex still PASS but fall out of the validator's top 30. Both demon Flex strategies set red / cap 0 by hand with the reason on the row (the weaker season is negative on the real tiers); back only through the red-release path (`NBA_SYSTEM_DESIGN.md` `§T49.7`, RELEASE_CAP 1).
- 🔑 **PrizePicks Power with alternates — proven and unaffected.** `pp_slip_power_conservative` (the price the engine uses) is never above the quote on all 48 mixed live quotes (closest 0.8% under); the best estimate `pp_slip_power` has mean absolute error 2.0% (worst +5.6% over, 7.9% under). Pricing model against the quotes: per leg conservative on average (goblins 0.97x, demons 0.93x), about 11% of legs more than 2% above the quote (max +17%); at slip level the grader's 3-Power price exceeds the quote only on goblin-plus-demon mixes (8 of 24, 1.10x), which no live strategy builds — a scope note for any future such composition.
- 🔑 **Underdog (entry rule proven on the new Underdog Sports app).** It shows "~" payouts and no per-pick multiplier; the board capture is proven against the owner's screenshots (the app shows Underdog's fantasy price; the tables equal the help center). Underdog pays table(n) x product of modifiers x C, the engine's formula (`§30`), with C = 1 across games and different from 1 only for same-game stacks (x0.90 on a same-team 3-Flex; 0.917 on a 6-pick with five legs from one game); the engine builds one pick per game, so its slips carry C = 1. `fantasy_decimal` = `display_decimal`; the payout modifier (two decimals) times the square root of 3.5 lands 0.01–0.02 off the display on alternate-priced picks. Tables re-verified, 2–8 picks, identical to `build_ud_slip_engine.STD/FLEX`: Standard 3.5 / 6.5 / 12 / 20 / 35 / 65 / 120; Flex 3.25 / 6 / 10 / 25 / 40 / 80; one loss 1.09 / 1.4 / 2.5 / 2.6 / 2.75 / 3; two losses 0.25 / 0.5 / 1. **Capture shape:** off game days the lobby's per-match lines answer only for that day's matches, so the scheduled NBA capture held 0 player legs; a probe forcing the production scraper onto 2026-10-20 captured all nine screenshot legs with the right lines. **One entry screen owed:** the modifier product 2.87x against the displayed prices' product 2.90x (the ledger adds that at the precision the app now shows the question is moot).
- 🔑 **Sleeper (replicated to NBA, then proven on NBA entry screens).** Rule: Power = the product; Flex = the round-robin mean over the (n minus 1)-pick sub-combinations; voids drop the pick; tunable `classification_config['sleeper_payout']`, function `nba_market.sleeper_slip_payout()`. Board capture proven against the owner's screenshot (lines and both multipliers identical; a MORE-only leg is the one-sided leg, `under_multiplier` null; Sleeper reprices live; overround 12.4%). Entry proven (no-submit): a 2-pick Max pays the plain product cut to the cent (3.1862 to 3.18); a 3-pick Flex the round-robin mean exactly (3.1446 to 3.14) with NO haircut, so `slip_haircut` 0.08 became 0.0 (the MLB 2–8% range kept as `slip_haircut_mlb_observed`). A Max bonus grows from 3 picks (x1.0797 at 3, x1.102 at 4; a 4-of-4 Flex x1.08), recorded as `max_size_bonus_observed` and NOT priced (`max_size_bonus_applied` 1.0) until a second size confirms it. Sleeper pays at least the plain product / round robin at every size seen; the price-shop ledger prices a Sleeper leg at the full multiplier (root 1.0). Bug fixed: the tunable had been stored as a double-encoded JSON string, so the ledger crashed reading it while the DB function silently used its 0.08 fallback. The ledger's earlier line "not answerable without an account" was struck the same evening.
- 🔑 **Betr and Fliff.** Measurement-only apps; proof deferred to their first NBA player boards (10-20). Betr's non-REGULAR tiers (BOOSTED, MINI_BOOSTED, SUPER_BOOSTED, BOOSTED_4, EDGE_1..4) carry a 0.5 placeholder in `value`, the real line being `nonRegularValue` (MORE only); 199 of 556 legs had been parsed as fake Over 0.5 rungs. Fixed in both harvesters; the per-tier multiplier is NOT on the board (Betr prices at slip time) — still the 10-20 item. `BETR_BUILD_STATE.md` `§8` records the board shape (raw tier samples kept in the harvest meta).
- 🔑 **Live hurdles on the true payouts.** The live strategy hurdles were recalibrated (`live_strategy_calib`, 2026-10-10): the 95th-percentile drawdowns are 1.2–4x larger than before (`NBA_DATABASE.md` `§T49.6`). Opening-night consequence: the Flex families carry less edge and more drawdown than certified on 10-08; the Power strategies are untouched.
- 🔑 **Larger entries, as the owner's no-submit screens showed (ledger, `10-09` evening).** Sleeper 4-pick Max (multipliers 1.79 / 1.75 / 1.80 / 1.78; two legs from one game): product 10.0365, app 11.06 (x1.102); 4-of-4 Flex round robin 5.639, app 6.09 (x1.08); 3-of-4 1.39–1.43, app 1.52; 5-pick Max 20.43, Flex 9.42 / 1.92 / 0.39; 6-pick Max 39.01, Flex 21.67 / 1.86 / 0.37 (two legs' multipliers not on screen). Underdog Sports app, 2-pick to 6-pick: a 2-pick of two 1.87x mains; 4-pick Max about 12x (the table's 12), Flex 6.69 / 1.3 against the table's 6 / 1.4; 5-pick with a 1.76x pick (modifier 1.76 / the square root of 3.5 = 0.9408) Max about 18.8x = 20 x 0.9408 = 18.82, Flex 8.74 / 2.32 against 9.41 / 2.35; 6-pick Max about 30.19x against 35 x 0.9408 = 32.93 (C = 0.917, five legs from one game). The app's displayed odds are Underdog's fantasy American odds (George AST MORE -182 = 1.55, LESS +113 = 2.13; White -176).
- 🔑 **Fliff and Betr, as the ledger states them.** Fliff is sportsbook pricing: per-leg American odds converted to decimal, a parlay multiplies; its NBA board was still team markets only. Betr publishes only "up to" totals by size (2 up to 3x … 8 up to 300x, review sites); its per-tier multiplier (REGULAR / BOOSTED / EDGE …) is not in the capture yet. Proof to come with the first NBA player boards: Betr's multiplier field; Fliff's first player props and one parlay screen.
- 🔑 **P5 verdicts after the regrade (10-10 recertification; the 10-13 re-run was identical, R_stocks_4power FAIL_STATE_GATED).** A_core_5flex PASS +97% to +79% (lower bound +33%; retired); A_wsteals_5flex PASS +86% (lower bound +47%) but not selected; R_stocks_4power FAIL at `-8%` on the true tiers (rotation-only, its own state gate holds it); "not selected" changes no state by design, which is why the demon pair was set red by hand.
- 🔑 **The "in-app" check for the all-standard tables, settled from PrizePicks' own quote engine (anonymous, 2026-10-09; `PP_PAYOUT_FINDINGS.md` `§0j`).** All-standard Power 2 = 3.0, 3 = 6.0, 4 = 10.0; Flex 2 = 2.0 / 0.5 (one hit), 3-Flex 3.0 / 1.0, 4-Flex 6.0 / 1.5 — exactly the mined tables the engines use (`pp_flex_standard_payout`), not the help center's 2.25 / 1.25 and 5 / 1.5. 5- and 6-pick from the 2026-09 mining (WNBA board quotes, all standard): Power 20 / 37.5, Flex 10 / 2 / 0.4 and 25 / 2 / 0.4. A goblin-plus-demon 2-pick (Tatum PRA 39.5 goblin + Cunningham REB 5.5 demon): Power 2.8, Flex 1.9 / 0.5. The owner's own account could still differ by state promotion; the quote is the operator's current default. If PrizePicks' wall ever refuses `chrome_153`, the first step is upgrading the `primp` library, the payout-map ladder falling to the real browser meanwhile.