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

## 5. THE ECONOMICS — measured

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

## 7. LADDER DEPTH — measured against the real board

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

## 12. OPEN ITEMS SPECIFIC TO THIS LAYER

1. **`board_tiers_v2` is unverified** — the build was running at session end.
2. **`board_tiers` v1 is still the 2.2M-leg table** anything downstream would read.
3. **Sleeper milestone lines** — T7 says they exist, the live session says they don't. **Unpriced board
   surface if T7 is right.**
4. **Goblin/demon certification was deliberately deferred** by the owner: *"Goblins and demons should
   NOT be handled now — **it is board dependent** and will only have this information later."*
   The ±6 ladder was certified; **the tails beyond it were never separately certified.**
5. **Per-leg multipliers are unavailable** — see `NBA_MULTIPLIERS.md`. Without them the −EV/+EV
   conclusions rest on *observed* payout factors, not per-leg truth.
</content>
</parameter>
<parameter name="message">docs: NBA goblin/demon identification - dedicated file per owner mandate