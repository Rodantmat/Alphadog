# NBA GOBLIN / DEMON IDENTIFICATION

**Scope.** Everything about goblin and demon ingestion for PrizePicks: parsing, anchors, **invisible
anchors / switch points**, standard-line anchors, **more and less above and below the anchor**,
ladders, tier signs, and the taxonomy change that made v1 obsolete.

**Status: this is the single most important OPEN correctness issue on the board layer.**
`nba_market.board_tiers` (v1, 2.2M legs) uses a **two-way** taxonomy that was correct when built and
is now wrong. `nba/build_board_tiers_v2.py` implements the four-way rule; **not yet verified**.

**Update log**
| Date | What |
|---|---|
| 2026-09-20 | Created. Material from T13 (the rule, the invisible anchor, validation), T7 (the More-only verification), the live session (the four-way correction, PrizePicks NBA producer). |

---

## 1. THE RULE

### 1.0 PrizePicks' OWN DESCRIPTION *(captured verbatim in T8)*
> **Demons** — *"max payout **up to 2000× your Lineup fee** if you pick correctly. **You must pick More
> on a Demon projection.**"*
> **Goblins** — *"identified by a **GREEN ICON** on the board and they're **designed to keep you in the
> green**. These are **safer picks** that make it easier to land consistent victories."*

**Three things this pins down:**
1. **The visual key**: goblins carry a **green icon**. Any parser working from rendered UI rather than
   the feed should key on `odds_type`, not colour — but the colour confirms the label.
2. **"You must pick More on a Demon projection"** — **the More-only rule, in PrizePicks' own words**,
   which is why the v1 two-way taxonomy was correct when built.
3. **2000× is the platform's stated maximum slip payout**, not a per-leg factor. The per-leg factor
   remains unavailable (see `NBA_MULTIPLIERS.md`).

**⚠ Statement 2 is now OUT OF DATE** — PrizePicks enabled Less in 2026-08. **The official
documentation is itself a dated source**, which is exactly why §4 exists.

### 1.1 The rule as it stands today

> **Below the anchor: More = GOBLIN, Less = DEMON.**
> **Above the anchor: More = DEMON, Less = GOBLIN.**

**The label is a function of `(position vs anchor, side)` — NEVER of the emoji alone, and never of the
price.**

**Why**: a goblin is the *easier* side, a demon the *harder* side. Below the anchor, taking More is
easier. Above the anchor, taking More is harder. **The direction of "easier" flips at the anchor.**

### 1.1 Worked example
Anchor 12.0:
| Line | Side | Label |
|---|---|---|
| 10.5 | More | **goblin** (easier — below anchor) |
| 10.5 | Less | **demon** (harder — below anchor) |
| 13.5 | More | **demon** (harder — above anchor) |
| 13.5 | Less | **goblin** (easier — above anchor) |

### 1.2 The SQL, as implemented in `build_board_tiers_v2.py`
```sql
CASE
  WHEN p.line < a.anchor AND side LIKE 'o%' THEN 'goblin'   -- below, More  = goblin
  WHEN p.line < a.anchor AND side LIKE 'u%' THEN 'demon'    -- below, Less  = demon
  WHEN p.line > a.anchor AND side LIKE 'o%' THEN 'demon'    -- above, More  = demon
  WHEN p.line > a.anchor AND side LIKE 'u%' THEN 'goblin'   -- above, Less  = goblin
END
```

---

## 2. THE ANCHOR — two cases

### 2.1 Explicit anchor
A standard line is present on the board for that player × prop. **Use it.**

### 2.2 **INVISIBLE ANCHOR / SWITCH POINT**
When **no standard line is offered**, the anchor is derived from **where goblins flip to demons**.

> *"**10.5 goblin, 11.5 goblin, 12.5 demon → 12 is the anchor.**"*

The anchor sits **between the highest goblin and the lowest demon**.
**Validated on 42,600 pure goblin→demon ladders.** **419,205 legs carry a switch-point anchor.**

`nba_market.board_tiers.anchor_type` ∈ **`explicit`** | **`switch_point`**.

### 2.3 A third method, used for books that price every rung
From `nba_market.board_tiers_ud` (Underdog):
> *"the anchor is **the FAIR rung — implied probability closest to 50%** — not a flagged one."*

**Use this where every rung carries a price**; use the switch point where only labels exist.

---

## 3. THE TIER SIGN

**v1 signs tiers by KIND** (goblin negative, demon positive). **That breaks under the four-way rule**,
because a demon-Less now sits *below* the anchor.

**v2 signs by POSITION**: **negative below the anchor, positive above**.
**So `(tier sign, side)` reconstructs the label**, and the sign always means direction.

| tier sign | side | label |
|---|---|---|
| − (below) | More | goblin |
| − (below) | Less | demon |
| + (above) | More | demon |
| + (above) | Less | goblin |

---

## 4. WHY v1 IS NOW WRONG — the taxonomy change

**v1 derives `kind` from the Odds API PRICE** (`price=100` → demon, `price=-137` → goblin), and
**every v1 row is Over-only**.

**That was CORRECT when built.** Verified twice:
- T7's 3-app inventory: *"PrizePicks: Demon and Goblin variants — **both More-only (confirmed
  officially)**, so the 'less' side exists only on standard lines."*
- Confirmed in the 2024-25 archive: **zero Under rows on alternates**.
- PrizePicks' own help centre said so through **2025-08**.

**PrizePicks enabled LESS in 2026-08** (MLB and WNBA first; owner screenshots confirm it live on
WNBA).

**Consequence**: a **demon-Less now sits BELOW the anchor** — and the price-based v1 label calls it a
**goblin**. **The two-way taxonomy cannot express the board any more.**

---

## 4. THE LADDER CONFIG — `nba_config.classification_config.ladder`

> ### ⚠ NOTHING READS THIS TABLE — **VERIFIED 2026-09-20 (T1 pass 36)**
> A grep of all 190 `.py`/`.js` files in `nba/` **and** the MCP admin bridge finds
> **`classification_config` zero times.** The stored JSON below is a **recorded design, not a live
> setting**: the ladder's actual steps and bounds are **hardcoded** in
> `nba/backtest/classification_ladder_v12.py` (`LADDER_STEPS`, and `step` per prop inside the `PROPS`
> dict).
> **Editing this JSON by SQL changes nothing and raises no error** — which matters here because the
> ladder config is the most obvious thing a future reader would reach for when adjusting rung depth.
> **Not claimed**: that the JSON disagrees with the code. On the sibling table
> `stat_decay_config` a full diff **did** find disagreement on 7 of 10 stats, so **this one warrants
> the same check and has not had it.** `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 36*.

**The actual stored JSON:**
```json
{"anchor": "recency_blended_projection",
 "clip_floor": 0.5,
 "ceiling_pct_more": 85,
 "floor_pct_less": 15,
 "goblin_pct": [25, 35],
 "demon_pct":  [70, 80]}
```
*Note: "Player-anchored ladder, **owner: 5–6 steps minimum each side**"*

**So the percentile placement is configured, not folklore:**
| Rung class | Percentile of the player's own outcome distribution |
|---|---|
| **Goblin** | **25th–35th** |
| Standard | median |
| **Demon** | **70th–80th** |
| Useful range | **15th (floor, less) – 85th (ceiling, more)** |
| `clip_floor` | **0.5** — the natural line floor |

**The anchor is `recency_blended_projection`** — the ladder is **player-anchored, never global**, and
**everything is a percentile of that player's own distribution.**

**This matches the three independent sources**: books ladder a 24.5 player **~19.5 to ~31.5 ≈ ±1 SD**;
Unabated prices off the full outcome distribution; Gemini independently proposed the same percentile
bands. **And the measured `LADDER_DEPTH` (p95 = 13 rungs for points) agrees to within one rung.**

---

## 5.0d **THE PRICING FUNCTION'S SHAPE** *(Part B of the lessons document — platform mechanics)*

> *"**PrizePicks Goblin/Demon-style tiered pricing: pricing is DISCRETE / STEP-FUNCTION (a fixed
> multiplier PER TIER), not continuous per-leg pricing.** As tier distance from the **anchor** line
> increases, **the easier direction (Goblin-style) pays progressively LESS, while the harder direction
> (Demon-style) pays progressively MORE, roughly GEOMETRICALLY — ~1.4× growth factor per tier step in
> MLB's case, likely different but DIRECTIONALLY SIMILAR for NBA.**"*

**This is the single most useful structural statement about the pricing.** Four things follow:

1. **Pricing is a STEP FUNCTION over tiers, not a continuous function of the line.** The multiplier is
   attached to the **tier index**, not to the rung's actual probability. **Which is exactly why the
   mispricing exists**: two legs in the same tier with materially different true probabilities carry
   the same factor.
2. **It is keyed on DISTANCE FROM THE ANCHOR** — so **the anchor must be right or the tier index is
   wrong**, and with it the price. **That is what makes the invisible-anchor derivation (§2.2)
   load-bearing rather than cosmetic.**
3. **Demons grow ~geometrically, ~1.4× per step in MLB.** Against our measured NBA break-evens —
   T+1 needs **1.48×**, T+2 **2.30×**, T+3 **3.31×** — a 1.4× geometric ladder gives roughly
   1.4 / 1.96 / 2.74. **T+1 is the only tier where the offered growth plausibly clears the
   requirement**, which is an independent route to the same conclusion as §5.2.
4. **Goblins pay progressively LESS as they get safer** — and §5.0c says the safe variant prices
   *flat regardless of rarity*. **Reconciled: flat WITHIN a tier, stepping DOWN between tiers.**

**⚠ The ~1.4× is an MLB number and lesson #24 says the numerics decay.** Treat as a prior for the
*shape*, not the value. **Measuring NBA's actual step ratio is one of the first things a live board
makes possible** — and it needs only the tier index and the factor, not a full per-leg capture.

> *"**PrizePicks Flex payout tables can have a genuinely diff[erent structure]**"* — see
> `NBA_MULTIPLIERS.md` §0.2b.

---

## 5.0c **THE DURABLE PRICING MECHANICS** *(lesson #24 — held across MLB's entire history)*

**These three qualitative behaviours survived MLB's whole run; the exact numeric ratios attached to
them did not.**

| Behaviour | Detail |
|---|---|
| **One variant prices FLAT** | *"one Goblin/Demon-style variant **prices flat REGARDLESS of the underlying event's rarity**"* |
| **The other SCALES with rarity** | *"the **higher-risk variant scales its payout with how rare the specific event is**"* |
| **Pairing is irrelevant to pricing** | *"**game or team pairing has NO EFFECT on pricing**"* |

**Read together with the four measured mechanics in `NBA_MULTIPLIERS.md` §0.1**, this gives the shape
of the pricing function:
- **The safe variant (goblin) is flat** — its payout does not respond to how safe the specific line is.
  **So a goblin on a 40%-clear line and one on a 15%-clear line pay the same.** That is precisely the
  *"directionally but not proportionally"* mispricing of lesson #13, seen from the goblin side.
- **The risky variant (demon) scales with rarity** — so demon pricing *does* respond to the event,
  which is why demon T+1 can clear break-even while T+2 and T+3 cannot.
- **Pairing has no effect on PRICING**, yet §0.1 records that *"same-team/same-game legs get a small
  multiplier discount."* **These are not contradictory**: the discount is applied at **slip
  construction**, not in the leg's own price. **Correlation is priced at the slip level, not the leg
  level.**

### ⚠ THE NUMBERS DECAY — the mechanics do not
> *"the ***exact* numeric ratios quoted in that same original research were later confirmed to have
> GENUINELY DECAYED AND CHANGED OVER TIME as the platform's own real pricing evolved.**"*

**And the instruction for NBA, stated explicitly:**
> *"**For NBA, EXPECT THE ANALOGOUS QUALITATIVE PLATFORM MECHANICS TO TRANSFER** — **if a DFS platform
> prices a 'safer' variant FLAT and a 'riskier' variant with RARITY-SCALING for one sport, the same
> underlying BUSINESS LOGIC likely governs the equivalent NBA-side variants** — **but ALWAYS treat the
> exact quoted numbers from any historical MLB study as A STARTING HYPOTHESIS TO RE-VERIFY FRESHLY ON
> REAL NBA DATA, NEVER as a current, reliable value in its own right.**"*

**The reason the mechanics transfer is named: it is the platform's BUSINESS LOGIC**, not a
sport-specific pricing model. The same company applies the same structure across sports.

**So the split is clean:**
| Transfers as a working hypothesis | Must be re-measured on NBA data |
|---|---|
| safe variant prices **flat** | the actual flat value |
| risky variant **scales with rarity** | the **~1.4× per-step** growth factor |
| **pairing does not affect leg pricing** | the size of the slip-level same-game discount |
| step-function over tiers, keyed on anchor distance | tier count, tier spacing (T4: *"must be verified per prop"*) |

**⚠ And even the mechanics have a shelf life** — the More-only rule was a durable mechanic **until
2026-08**. *(§4)*

---

## 5.0b ⚠ **THE STRUCTURAL MISPRICING — real, measured, and never exploited**

**Lesson #13, the one the handoff calls *"a real, load-bearing finding"*:**
> *"**Platforms price probability DIRECTIONALLY but NOT PROPORTIONALLY** — a real, load-bearing
> finding, **but exploiting it requires solving player-level selection, which MLB NEVER MANAGED**.
> Sportsbook-vs-DFS comparison confirmed **the Goblin/tiered-pricing mechanism moves its payout only a
> SMALL FRACTION of what a linear/proportional pricing model would require for a given probability
> gap** — in MLB's case, **roughly a 15% multiplier change for a ~2.6× TRUE-PROBABILITY GAP**.
> **This means there IS a real, structural mispricing — but MLB never found a way to IDENTIFY IN
> ADVANCE which specific legs sit on the high-probability side of that gap; every walk-forward
> selection attempt (raw trailing hit rate, model-probability quintiles, appearance frequency)
> REGRESSED TO THE POOL AVERAGE.** **If NBA replicates this finding, treat [it the same way].**"*

### What this means concretely
**A 2.6× swing in true probability buys only a ~15% change in payout.** The pricing is
*ordered* correctly — harder rungs pay more — but the **magnitude is nowhere near proportional.**
**So the mispricing is structural and large**, and it sits exactly where goblins and demons live.

### Why it was never harvested — and what the real problem is
**The mispricing is not the hard part. SELECTION is.** Three walk-forward approaches all failed:
| Attempt | Result |
|---|---|
| raw trailing hit rate | **regressed to the pool average** |
| model-probability quintiles | **regressed to the pool average** |
| appearance frequency | **regressed to the pool average** |

**Every method that looked like it identified high-probability legs in advance stopped working out of
sample.**

### ⚠ THE INSTRUCTION FOR NBA, STATED EXPLICITLY
> *"**If NBA replicates this finding, treat 'THE MECHANISM IS REAL' and 'WE CAN EXPLOIT IT' as TWO
> COMPLETELY SEPARATE, BOTH-UNSOLVED QUESTIONS** — [MLB] solved neither the second one."*

**Two questions, tracked separately:**
| Question | Status |
|---|---|
| **Is the mechanism real?** | **Yes** — measured: ~15% multiplier change for a ~2.6× probability gap; step-function pricing keyed on tier index |
| **Can it be exploited?** | **Unsolved.** Three walk-forward methods regressed to the pool average |

**Confirming the first says nothing about the second.** And the source is explicit that **both were
unsolved** — the mechanism being *measured* is not partial progress toward exploiting it.

### ⚠ THIS IS THE CENTRAL QUESTION FOR NBA
**Everything this system has built is an attempt at exactly the thing MLB could not do: identify, in
advance, which legs sit on the favourable side of that gap.** The certified ladder, the leg-level
calibration, the per-band cells, the confidence model — **all of it is selection machinery.**

**And NBA has one asset MLB's failed attempts lacked**: *"when the recipe says 75%, roughly 75% hit,
on every band, both seasons, out of sample"* — **a calibrated probability**, not a trailing rate or a
quintile rank. **Model-probability quintiles failed for MLB; whether a CALIBRATED probability succeeds
where an uncalibrated one regressed is the open empirical question**, and it is testable the moment a
live board exists.

**The honest framing**: the structural mispricing is confirmed to exist. **Whether it is harvestable
is unproven, and one strong prior says it is not.** Treat any early positive result here with lesson
#26's confidence tiering and §13's full bootstrap gate.

---

## 5. THE ECONOMICS — measured

### ⚠ 5.0 READ THESE PER CELL, NOT AS AGGREGATES
**MLB's costliest single error was pairing an aggregate hit rate with a multiplier from a different,
thinner cell** — *"producing a **phantom positive edge** that took a full Gemini adversarial pass to
catch."*
**The correct form is `Σ wᵢ(pᵢ · mᵢ)`, volume-weighted per cell — never `p̄ · m̄`.**

**The tables below are tier aggregates.** The hit rates come from one population (mostly safe,
high-volume goblin cells) and the payout factors from another (thin demon cells). **Matching them
across tiers is exactly the error above.** The directional conclusions survive, but **any EV figure
built from these must be recomputed cell by cell — tier × prop × side.**

### 5.1 Goblins are −EV at every tier
| Tier | Hit rate |
|---|---|
| T−3 | **74.1%** |
| T−2 | 68.7% |
| T−1 | 61.9% |

**But observed payout factors take 40–53%** → **−EV at every tier**.

### 5.2 Demons — only T+1 is ever worth solving
| Tier | Hit rate | Break-even factor needed |
|---|---|---|
| **T+1** | **32.9%** | **1.48×** |
| T+2 | 21.3% | 2.30× |
| T+3 | 14.8% | 3.31× |

**Against a ~1.75–1.9× observed ceiling** → **T+2 and T+3 can never clear it.**
**→ Only demon T+1 is ever worth solving.**

### 5.3 Why the tails matter anyway
> *"we're not modelling the mean, **we're modelling the right tail (80th–99th percentile)**. A Gaussian
> will be systematically wrong there… likely **the #1 area where a sharp baseline earns the most**,
> because **naive book models mis-price tails**."*

**And the ladder placement, from three converging sources**: books ladder a 24.5 player **~19.5 to
~31.5 ≈ ±1 SD**; Unabated prices off the full outcome distribution; **Goblin ≈ 25th–35th percentile,
Standard ≈ median, Demon ≈ 70th–80th, useful range ≈ 15th–85th.**

---

## 6. INGESTION — where the data comes from

### 6.1 The NBA producer
**`nba/scrape_prizepicks_nba_board.py`** — **completely separate from `main.py` (MLB)**.
- **`league_id=7`** (COMPASS fact 176) — MLB is `league_id=2`, hardcoded in `main.py`
- Own output: **`boards/prizepicks_nba_current.json`**
- Own env namespace: **`PP_NBA_*`**
- **Multiple candidate URLs** — `partner-api` and `api`; **the `partner-api` host answered while `api`
  was blocked**, which is why candidates are mandatory
- `curl_cffi` chrome124, proxy preflight, retry with captcha cooldown, atomic write
- **Candidate selection by FUTURE-PICKABLE ROWS**, not by payload size

**Live-tested (off-season): 200 OK, 192 projections, 192 future-pickable,
`{demon: 104, standard: 36, goblin: 52}`.**

### 6.2 The raw feed's fields
A demon row carries **`odds_type`**, **`adjusted_odds` as a BOOLEAN**, and **`line_score`**.
**It does NOT carry a multiplier** — see `NBA_MULTIPLIERS.md`.

### 6.3 Per-app ladder structure
| App | Structure |
|---|---|
| **PrizePicks** | rungs in the raw feed, labelled standard / goblin / demon |
| **Underdog** | `alternate_projections` per line, **with both sides' multipliers** |
| **Sleeper** | *"no alternate lines"* per the live session — **⚠ but T7's verified inventory found milestone lines 20+/25+/30+, "Sleeper's equivalent of Goblin/Demon ladders". Unresolved.** |
| **Fliff** | alternate lines as separate proposals per market group |
| **Betr** | tiers REGULAR / MINI_BOOSTED / BOOSTED / SUPER_BOOSTED / BOOSTED_4 / EDGE_1..4 |

---

## 6. THE RESEARCH STANDARD APPLIED TO THIS LAYER

**Six of the 27 lessons bear directly on goblin/demon work.** Full list in
`NBA_FINAL_SCORING_CALIBRATION.md` §14.

**⚠ CORRECTED 2026-09-20 (T1 pass 30). This line read "Five of the 26 lessons."** Two things were
wrong: **the standard has 27 lessons, not 26** (**VERIFIED** — `grep -c "^### [0-9]\+\."` on
`NBA_LESSONS_LEARNED_FROM_MLB.md` → 27, and T1's own pasted copy carries `### 27.`), and **the
twenty-seventh is a sixth lesson bearing directly on this layer**:

**#27 — Flex-style partial-credit mechanics differ structurally between platforms: flat fixed partial
payouts on one, proportional-to-the-full-hit-multiplier on another. Verify per platform.**

**Why it lands on goblin/demon specifically.** Goblin and demon legs are the ones whose headline
multipliers move *most* — the whole layer is a ladder of multipliers rising away from the anchor
(*"~1.4× growth factor per tier step"*, §5.0d). **On a platform whose partial tiers are proportional
to the full-hit multiplier, a demon-heavy Flex slip's partial payouts move with the ladder; on a
flat-tier platform they do not.** So **the same demon ladder produces different Flex EV on the two
platform types**, and **the goblin/demon economics in §5 — computed against observed payout factors —
are Power-shaped reasoning that does not carry to Flex unless the tier shape is known.**
**NOT RECORDED as verified for any platform except PrizePicks.** See `NBA_MULTIPLIERS.md` §0.2h.

| Lesson | Applied here |
|---|---|
| **#2 — never apply a tier-level multiplier to a heterogeneous population** | §5.0 — the economics tables are tier aggregates; **EV must be recomputed per cell** |
| **#11 — a plausible causal story is not evidence** | *"goblins are safer so they must be +EV"* is a story; **measured, they are −EV at every tier** |
| **#13 — directional but not proportional** | §5.0b — the structural mispricing, **and MLB never harvested it** |
| **#24 — durable mechanics vs drifting numbers** | §5.0c — flat vs rarity-scaled pricing held for years; **the ratios decayed** |
| **#26 — confidence-tier every finding** | the ±6 ladder is **certified**; the tails beyond it are **not** |

### ⚠ #19 applied to this document
**Language strength must not exceed evidence strength.** So, precisely:
- The **four-way rule** is **verified** — validated on 42,600 ladders, and `board_tiers_ud` implements
  it.
- The **invisible anchor** is **verified** — 419,205 legs carry one.
- The **hit rates** are **measured** on our own graded outcomes.
- The **payout factors** are **observed, not read from a slip** — and lesson #16 records that
  *"multiple MLB findings survived every backtest check and were still overturned the moment a real
  placed slip's actual multiplier was checked against the assumed one."*
- Therefore the **EV conclusions are directional, not confirmed.**
- `board_tiers_v2` is **built but unverified**.

---

## 7. LADDER DEPTH — measured against the real board

> ### ⚠⚠ THE VOLUME-VS-DEPTH TRADEOFF — the handoff's named NBA-transferable pattern, never tested
> *Source: T1, `NBA_LESSONS_LEARNED_FROM_MLB.md` Part D, "a concrete, well-documented real
> NBA-transferable structural pattern worth testing for directly." **Recorded 2026-09-20 (T1 pass 56)
> — the pattern appeared in none of the twelve documents. Volumes below are VERIFIED by live SQL.***
>
> > *"MLB found that **a prop's real hit rate climbs meaningfully and repeatably as tier/ladder-depth
> > increases** (the farther a line sits from its real anchor, the safer the 'easy-direction' bet
> > becomes) — and **the genuinely usable sweet spot was NOT the theoretical deepest tier** (almost
> > always a thin, one-off, unreliable sample) **but THE DEEPEST TIER THAT STILL CARRIES REAL VOLUME**
> > (MLB's rule of thumb: **n ≥ 10–20 real observations**). If NBA's platforms offer an equivalent
> > tiered-line ladder… **test for this same volume-vs-depth tradeoff directly rather than assuming
> > either extreme.**"*
>
> **The volume half has never been read. It is one query, and the data is already there** —
> `nba_market.board_tiers_v2`, **~2.19M legs**:
>
> | tier | legs | distinct player-props | | tier | legs | distinct player-props |
> |---|---|---|---|---|---|---|
> | **−7** | 1 | 1 | | **0** | **788,680** | 5,447 |
> | **−6** | 21 | 14 | | **+1** | 109,544 | 3,544 |
> | **−5** | 207 | 87 | | **+2** | **351,329** | 3,811 |
> | **−4** | 1,600 | 547 | | **+3** | **244,731** | 3,501 |
> | **−3** | **62,542** | 2,052 | | **+4** | **117,010** | **2,758** |
> | **−2** | **165,711** | 3,103 | | **+5** | 3,794 | 902 |
> | **−1** | **353,579** | 3,819 | | **+6** | 515 | 236 |
> | | | | | **+7 / +8** | 85 / 5 | 56 / 5 |
>
> **Applying MLB's rule to these volumes:**
> - **Goblin side — the deepest tier with real volume is T−3** (62,542 legs, 2,052 player-props).
>   **T−4 falls to 1,600 — a 39× collapse**; T−5 is 207, T−6 is 21, T−7 is 1.
>   **§5's goblin economics already stop at T−3** — so the documented range matches the
>   volume-supported range, **but that was never the stated reason.** It is now.
> - **⚠⚠ Demon side — the deepest tier with real volume is T+4, and §5's economics stop at T+3.**
>   **T+4 carries 117,010 legs across 2,758 distinct player-props** — far above any thin-sample
>   threshold — and **is not priced anywhere in this document.** **T+5 is where the collapse
>   happens** (3,794, a 31× fall).
>   **This is exactly the sweet spot the lesson points at: not the theoretical deepest tier, but the
>   deepest one with real volume.** **NOT RECORDED as tested.**
> - **⚠ And the ladder is asymmetric in a way nothing records**: the goblin side decays monotonically
>   (−1 → −2 → −3 → −4 falling steadily), while the demon side does not — **T+1 (109,544) carries
>   LESS volume than T+2 (351,329) and T+3 (244,731).** **Why T+1 is under-offered relative to its
>   neighbours is NOT ESTABLISHED**, and it matters because **§5 records T+1 as "the only demon tier
>   ever worth solving."**
>
> **What this does not claim**: nothing here measures hit rate — the volumes come from
> `board_tiers_v2`, the rates from `board_outcomes`. **The pairing is the test the lesson asks for,
> and it has not been run.**

> ### ⚠ THE HANDOFF ASKED FOR THIS **PER PROP**, AND IT IS STILL POOLED
> *Recorded 2026-09-20 (T1 pass 49). Source: `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §1.*
>
> > *"Confirm these exist identically for NBA on each platform… **but verify TIER-COUNT and
> > TIER-SPACING CONVENTIONS PER PROP before assuming they match MLB's exactly.**"*
>
> **§10 records that the prediction was right** — the taxonomy exists for NBA. **The per-prop
> verification the same sentence asks for is NOT RECORDED as done.** The measurement below —
> *"books ladder to **~85–90% of the anchor**"*, from **60k+ board legs** — **is an aggregate across
> props**, and **§5.0's own standing rule is "read these per cell, not as aggregates."**
> **The instruction and this layer's own rule agree with each other; the measurement is still
> pooled.**
> ⚠ **Compounds with lesson #27** (§6): **tier spacing per prop and partial-credit structure per
> platform are both unverified, and both are first-order inputs to Flex EV.**

From 2026-01-15, **60k+ board legs joined to our anchors**. **Books ladder to ~85–90% of the anchor.**

| Prop | Anchor | p95 distance | Our ±10 | Fixed to |
|---|---|---|---|---|
| points | 15.9 | **13** | short | **14** |
| pra | ~18 | **16** | short | **16** |
| pts_reb | ~15 | 15 | short | 15 |
| pts_ast | ~14 | 14 | short | 14 |
| rebounds | 5.7 | 5 | wasteful | 6 |
| assists | 4.3 | 4 | wasteful | 5 |
| steals | 1.1 | 1 | **very** wasteful | 2 |
| blocks | 0.8 | 1 | **very** wasteful | 2 |

**`LADDER_DEPTH` added to `classification_ladder_v12.py`**, with `ladder_depth(prop)`.
**`BT_LADDER_STEPS` still overrides.** All four `LADDER_STEPS` usage sites patched; `_depth` scoped at
prop level.
**⚠ The scoped expansion (points, pra, pts_reb, pts_ast, fantasy_score deeper; steals/blocks/turnovers
shallower) has not completed.**

**Consistency check**: the design figure was *"anchor ±5–6 steps"*, i.e. 19.5→31.5 around 24.5 =
**±6 line-units = 12 rungs**, against a measured **p95 of 13 rungs**. **The design and the measurement
agree to within one rung.**

---

## 8. TABLES

### `nba_market.board_tiers` — 2.2M legs *(v1 — SUPERSEDED)*
`game_date`, `snapshot_label`, `player`, `base_market`, `side`, `line`, **`kind`**, `anchor_line`,
**`anchor_type`** (`explicit` | `switch_point`), **`tier`**, `nm`.
**`kind` derived from PRICE; Over-only. Do not trust the label on a Less row.**

### `nba_market.board_tiers_ud` *(Underdog)*
**Already implements the four-way rule**, and uses the **fair-rung** anchor. **This is the reference
implementation.**

### `nba_market.board_tiers_v2` *(PrizePicks, four-way)*
Built by `nba/build_board_tiers_v2.py`. **Position-signed tiers.** **Build queued; result not
confirmed.**

---

## 10. WHAT T1 PREDICTED ABOUT GOBLIN/DEMON — and it was right

From the handoff's transfer table *(T1)*:
> *"**Goblin/Demon/Standard variant tiers** | **Confirm these exist identically for NBA on each
> platform (PrizePicks in particular) — very likely yes, since it's a PLATFORM-LEVEL MECHANIC, not
> sport-specific**"*

**Correct.** The tiers exist identically for NBA; the live NBA board returns
`{demon: 104, standard: 36, goblin: 52}`.

**⚠ AND T4 ADDED THE CAUTION THAT MATTERS:**
> *"Goblin/Demon/Standard-style tier variants: assumed to exist per-platform for NBA (a platform-level
> mechanic, not sport-specific) **but TIER COUNT AND TIER SPACING must be verified PER PROP directly
> against each platform's live board once one exists — NOT assumed identical to MLB's**."*

**So two things were separated correctly:**
| Property | Transfers from MLB? |
|---|---|
| **The mechanism** (goblin = easier, demon = harder, anchored) | ✅ yes — platform-level |
| **Tier COUNT and tier SPACING, per prop** | ❌ **no — must be measured on the NBA board** |

**And that caution was vindicated twice.**
1. **Ladder depth measured on a real NBA slate came out per-prop and very uneven** — points p95 = 13
   rungs, steals and blocks = 1. **Assuming one spacing would have been wrong in both directions**
   (see §7).
2. **The mechanism itself then changed** — PrizePicks enabled Less in 2026-08, so even the
   platform-level half needs re-verification over time, not just across sports.

**The general rule**: *"MLB's specific numbers do not transfer; only the platform-level mechanics
transfer as informed priors, not answers"* — **and the mechanics have a shelf life.**

---

## 11. THE MLB REFERENCE DOCUMENT

`GOBLIN_DEMON_MECHANISM_EXPLAINED.md` exists on the MLB side and was one of the **eleven documents read
and integrated** into the NBA transfer package (T1). **It is the prior for the mechanism**; the NBA
numbers are our own.

---

## 12b. ⚠ THIS TAXONOMY CREATES THE SUBGROUPS BLUEPRINT §7f SAYS A CORRECTION MUST BE CHECKED AGAINST
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` §7f. Recorded 2026-09-20 (T1 pass 29).*

§7f's rule: *"always check whether a proposed correction is genuinely appropriate for **every
meaningfully distinct subgroup it will be applied to** (e.g. **both sides of a market, every relevant
tier**), not just the pooled average"* — after a real MLB fit passed honest out-of-sample validation
while being **dominated by one side and silently misapplied to the other**.

**"Both sides of a market, every relevant tier" is a literal description of this layer.** The four-way
rule (§1) means a single player × prop carries up to four distinct populations —
**More-above-anchor (demon), More-below (goblin), Less-below (demon), Less-above (goblin)** — and the
ladder adds rungs on top of that. **Per §5.0, these must be read per cell, never as aggregates**, and
that is already recorded as **MLB's costliest single error**.

**What §7f adds to what §5.0 already says:** §5.0 warns against pairing an aggregate *hit rate* with a
cell-specific *multiplier*. **§7f warns that a statistical *fit* commits the same error invisibly** —
and that **the validation metric will not tell you.** A calibration curve fit across all rungs can
beat its baseline overall and be wrong at **T−3 and T+3 specifically**, which are exactly the cells
this document says decide the layer's EV:
- **goblins hit 74.1 / 68.7 / 61.9% at T−3 / −2 / −1** but observed factors pay 40–53% → **−EV at
  every tier**
- **demons hit 32.9 / 21.3 / 14.8% at T+1 / +2 / +3**, needing **1.48 / 2.30 / 3.31×** against a
  **~1.75–1.9× ceiling** → **only demon T1 is ever worth solving**

**A pooled calibration check cannot distinguish "the ladder is calibrated" from "the ladder is
calibrated in the middle and wrong in the tails"** — and **T8 nominated the tails as *"the #1 area
where a sharp baseline earns the most."*** The certification's *"0 misses of 37"* is **an aggregate**.

**Status**: no per-kind × per-side × per-rung calibration check is **recorded as built**. Related and
already open: §9's tail-certification item (*"the single most important thing to certify once a live
board exists"*). Primary record of §7f: `NBA_BASELINE_CALIBRATION.md` §5.6.

---

## 13. ⚠ THE GRADER DEDUP KEY — the highest-risk item for this layer
*Source: T1, blueprint §4c. Recorded 2026-09-20.*

**A documented historical bug whose trigger column is exactly the one this document is about:**
> *"**A deduplication key that DIDN'T INCLUDE EVERY VARIANT-DISTINGUISHING COLUMN — in MLB's case, THE
> GOBLIN/DEMON TAGS** — caused **two genuinely different real market variants sharing the same
> underlying player/prop/line to SILENTLY COLLAPSE into a SINGLE GRADED ROW.** **The other variant's
> outcome was NEVER CREATED AT ALL, not even as a placeholder, WITH NO ERROR THROWN.**"*

### Why the four-way taxonomy makes this sharper for NBA than it was for MLB
**Under the two-way (More-only) world this bug required two *rungs* to collide.** Under the four-way
rule, **a goblin and a demon sit at the SAME rung**:

| Line vs anchor | More | Less |
|---|---|---|
| **Below** | **goblin** | **demon** |
| **Above** | **demon** | **goblin** |

**So at any single `(player, prop, line)` below the anchor there are now two legs with different
variant labels** — and they differ only by `side` **and** by the variant tag.

**Three conditions that would trigger the collapse:**
1. The grader's dedup/unique key omits the variant tag, **and**
2. `side` alone is treated as sufficient to distinguish rows, **and**
3. The variant label itself is wrong — **which it currently is**, since `board_tiers` v1 derives
   `kind` from **price** and is **Over-only**.

**Condition 3 is already true.** Conditions 1 and 2 are unverified.

### What is known about `board_outcomes`
Keyed on **prop, side and line**; `leg_result` ∈ `over_win` / `under_win` / `push` / `dnp` /
`unmatched_player` / `unmatched_not_in_season`.
**Whether it carries a variant dimension, and whether `ot_rule` is in its key, is unverified.**
*(`nba_score.baseline_ladder` does carry `ot_rule` in its PK — but that is a different table, and
`period`/`ot_rule` are exactly the other variant-distinguishing columns this rule covers.)*

**The source names the family explicitly**: *"this is the same **grouping-key** failure"* — Part C's
dominant bug class, appearing in the grader.

**Recorded in `NBA_OPEN_ITEMS.md`.**

---

## 12. OPEN ITEMS SPECIFIC TO THIS LAYER

**⚠ THE OWNER'S STANDING DIRECTIVE ON SEQUENCING (T9, v21):**
> *"**Goblins and demons should NOT be handled now — it is BOARD DEPENDENT** and will only have this
> information later."*
> *"Not part of this phase (by your decision): **Goblins/Demons (board-dependent)**, Tier C props
> (first basket, high scorer), and the live enrichment layer."*

**And the explicit consequence, stated in T9's own gap list:**
> *"**Goblin/Demon/milestone tails BEYOND the ±6 ladder rungs — NOT separately certified.**"*

**So the certified ±6 ladder does NOT extend to the tails the goblin/demon economics depend on.**
The rungs are built (`LADDER_DEPTH` now reaches 13–16 for the deep props) but **the leg-level
certification standard — band × direction × rung, confidence bands hitting their rate — was only met
within ±6.** **This is the single most important thing to certify once a live board exists**, because
T8 nominated the tails as *"the #1 area where a sharp baseline earns the most."*

## 9. OPEN ITEMS SPECIFIC TO THIS LAYER — and why v2 is a CORRECTNESS issue

### ⚠⚠ LANE IS THE DOMINANT DRIVER OF EV — so a wrong lane label is not cosmetic
**Rule B0a of the foundational selection methodology** (`NBA_FINAL_SCORING_CALIBRATION.md` §18):
> *"**Class and lane are independent, and LANE IS USUALLY THE DOMINANT DRIVER OF REAL EV, MORE THAN
> CLASS.**"*
> *"a single real, exact example — **the IDENTICAL leg, IDENTICAL ~85% hit rate** — pricing at
> **roughly +1300% in one lane and roughly −13% in another** — **a swing of over 1,300 percentage
> points from LANE ALONE.**"*

**`nba_market.board_tiers` v1 derives `kind` from PRICE and is Over-only.** Since PrizePicks enabled
Less in 2026-08, **a demon-Less sits below the anchor and v1 labels it a goblin** (§4).

**So the 2.2M-leg table carries a wrong label on the axis that drives EV most**, for an entire side of
the board. **`board_tiers_v2` is therefore a selection-correctness fix, not a taxonomy tidy-up** — and
it remains **built but unverified**.

**The order this implies:**
1. **Verify `board_tiers_v2`** — it corrects the dominant EV axis
2. **Certify the tails beyond ±6** — where the lane effect is largest
3. **Then** build pools, each stating **both class and lane** per B0a

### The rest

1. **`board_tiers_v2` is unverified** — the build was running at session end.
2. **`board_tiers` v1 is still the 2.2M-leg table** anything downstream would read.
3. **Sleeper milestone lines** — T7 says they exist, the live session says they don't. **Unpriced board
   surface if T7 is right.**
4. **Goblin/demon certification was deliberately deferred** by the owner: *"Goblins and demons should
   NOT be handled now — **it is board dependent** and will only have this information later."*
   The ±6 ladder was certified; **the tails beyond it were never separately certified.**
5. **Per-leg multipliers are unavailable** — see `NBA_MULTIPLIERS.md`. Without them the −EV/+EV
   conclusions rest on *observed* payout factors, not per-leg truth.