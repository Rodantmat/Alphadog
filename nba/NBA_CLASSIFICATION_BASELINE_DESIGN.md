# NBA Classification + Baseline — LOCKED DESIGN SKELETON (v1, 2026-09-09)

*This is the pre-developed skeleton the backtest will sharpen. Every number in it is a researched
starting point, not a final value: the backtest against 2023-24 / 2024-25 / 2025-26 is what
granulates tiers, moves band edges, and sizes lifts/penalties. What is LOCKED here is the
architecture, the dimensions, the factor set, and the rules — the values are seeds.*

*Research basis: the live MLB pipeline read line-by-line from real code and real DB rows
(`runClassificationBaselineV6ToPostgres`, `config.enrichment_profile_cells`,
`scoring.enrichment_leg_current`, `phase3c-certifier`), plus multi-source external research
(DataStreak 40,856-prop blowout study; RotoGrinders minutes methodology; OpticOdds; peer-reviewed
altitude/jet-lag studies; Chu & Swartz foul survival; DARKO per-stat decay; official PrizePicks /
Underdog / Sleeper scoring pages) and three independent Gemini critique passes. Where Gemini
conflicted with the owner's locked decisions or the proven MLB code, the locked decision won.*

---

## 0. The boundary (locked)

| Layer | Runs | Inputs | Examples |
|---|---|---|---|
| **Baseline** (this design) | Once, early in the day | Everything derivable from **static + historical** data, including the calendar (opponent, home/away, rest) | Per-minute rates, projected minutes from history, derived spread → P(blowout)/P(OT), with/without-teammate table from DNP history, P(start) from starter history, DvP, pace, rest/travel/altitude, foul risk |
| **Enrichment** (later, same engine, second factor set) | 2–3× per day | **Daily-mined** data only, applied as *corrections* to the baseline | Current injury report, confirmed lineups, market spread (as delta vs derived), referee assignment |

The baseline is deliberately **not naive**: it carries a derived backup for every important
daily factor, so it is never blind if live data is late.

---

## 1. The prop universe (locked, verified against all three apps' official pages)

**Tier A — core, all three apps (the full matrix):**
Points · Rebounds · Assists · 3PM · Blocks · Steals · Turnovers · P+R · P+A · R+A · Stocks
(Blk+Stl) · PRA · Fantasy Score. Fantasy scale is **identical on all three apps**:
Pt 1 / Reb 1.2 / Ast 1.5 / Blk 3 / Stl 3 / TO −1 (resolved from PrizePicks' official page; a
third-party source claiming 2/2 was outdated).

**Tier B — derivable from our data, app-specific:**
Period layers 1Q / 1H / 2H / 4Q (data verified: `playergamelogs` honors `Period=1..4`, 4 bulk
calls/season) · Double-Double · Triple-Double (Sleeper) · FTM · FGA · 3PA · Personal Fouls ·
per-quarter points (Underdog).

**Tier C — deferred (needs play-by-play we don't have):** First-5-minutes stats, first FG/3PT
attempt, first to 10, game/team high scorer.

**Line layers:** Standard (more/less) · Goblin (**More-only**, lower) · Demon (**More-only**,
higher) · Sleeper milestones (20+/25+/30+, More-only). Consequence: the "less" side exists only on
standard lines; the More-only layers are pure right-tail bets.

**App-specific OT rules that change the model:** PrizePicks/Underdog include OT in full-game and in
2H/4Q; Sleeper quarter markets exclude OT, 2H includes it. 1H is never 50% of full game (~48–49%).

---

## 2. Ladder anchoring (locked)

Player-anchored, never global. For each player × prop: **anchor** = recency-blended projected
outcome; ladder = anchor **±6 steps** (owner: 5–6 minimum each side) at the prop's natural unit,
clipped at 0.5. Ceiling for "more" / floor for "less" = percentile cutoffs of the player's own
outcome distribution (research: books ladder ≈ ±1σ ≈ 15th–85th pct; Goblin ≈ 25–35th, Demon ≈
70–80th). Beyond the cutoffs the same logic applies with no separate ladder.

---

## 3. The component model (locked — the one structural adaptation to MLB, owner-approved)

`outcome = minutes × rate_per_minute`, both as distributions, combined by simulation.

MLB tiers on a per-game rate because plate appearances are stable; NBA minutes are the single
largest error source, so they get their own model. Every MLB mechanism (tiers, tier priors,
empirical-Bayes shrinkage, empirical per-tier distributions, guards) is preserved and applied to
the **rate**; the minutes model is new.

### 3.1 Minutes model — three-component mixture
`P(M) = w_norm·TN(μ_role, σ_player) + w_blowout·TN(μ_role·f(spread), σ_player) + w_dud·LogN(μ_dud, σ_dud)`
- **Normal play**: truncated Normal on [0,48], fit on competitive games (margin <15, PF<6, no
  in-game DNP, ≥40% of own average minutes).
- **Blowout-reduced**: `f(spread)` from a **regression fit on our own 15+/20+ margin games**
  (starter flag × margin × μ_role), **team-specific** `E[min | blowout]` (coaches differ) — NOT
  the published `1.5% × (spread−7)` heuristic (too linear, player-agnostic).
- **Dud**: log-Normal, fit on competitive games in the player's bottom-15% minutes or PF≥5.
- **Weights**: `w_blowout = P(margin≥20 | derived_spread)` from an empirical lookup built on our 3
  seasons (bin by derived spread, count real blowouts); `w_dud` = player's own dud rate × PF/min;
  `P(OT)` from the same derived spread adds a 5-minute bump to non-dud components (PP/UD only).
- **Derived spread** (static): `net-rating diff + home court + rest diff` — validated against real
  historical market spreads from ParlayAPI (validation only; never a baseline input).
- **Team constraint**: 240 minutes/team enforced by **tiered renormalization** (stars inelastic,
  fringe elastic), never pro-rata.
- **P(start)**: probabilistic from starter history (started last game → high; 8 of last 10 but not
  last → medium; benched after a streak → low). The 90–95% "last-game-predicts-next" figure is
  measured on our own 1,230 games, not assumed.
- **With/without-teammate table** (the derived injury backup): from DNP/DND games in our logs;
  confidence tiers <5 games → generic role-based redistribution, 5–14 → shrunk blend, 15+ → trust.
- **Role-change detector**: starter flag flips 2+ games, or 3-game minutes mean >3σ from prior
  EWMA, or trade → reset window, use post-change games only.
- **Validation targets** (catch sign errors, never adopted as values): B2B veterans −1.5 to −3.0
  min, young stars −0.5 to −1.5, bench ≈0, amplified after OT and 3-in-4.

### 3.2 Rate model — the MLB port
Per prop, the rate is **per-36** (possession-adjusted where applicable). Recency blend uses
**per-stat windows** from `nba_config.stat_decay_config` (minutes/usage/attempt volume short;
3P%/FT%/contested-reb rate long; opponent defense ratings short — last 10–15 games).

---

## 4. The five tiering dimensions (locked)

### 4.1 Player tiers — two orthogonal systems that cross
- **Rate tier** (MLB port, exact): per prop+line+side combo, quantile rank on the recency-blended
  per-36 rate; `max_tiers=24`, `min_population_per_tier=15`; tier mean → shrinkage prior, blended
  toward population mean with `k=5`; population-level empirical-Bayes prior strength per combo.
  Tiers are **per variation** (per line) — owner-locked, matches the live MLB code exactly.
- **Role tier** (new, fixed thresholds on projected minutes — categorical, stable, interpretable):
  `IRON_MAN >36 · HIGH_USAGE_STARTER 32–36 · STARTER 27–32 · ROTATION 21–27 · BENCH 15–21 ·
  FRINGE <15`. This is what minutes-side factors act on.

### 4.2 Factor tiers — depth earned per factor (MLB principle), never uniform
| Factor | Form | Seeded structure | Model side |
|---|---|---|---|
| Rest / B2B / travel | Tiered bands | B2B_ROAD · B2B_HOME · REST_1 · REST_2 · REST_3PLUS; 3-in-4 / 5-in-7 flags; eastward-travel flag | rate + minutes |
| Altitude | Continuous, gated >1500m | `coef_a × (alt − 1500)` | rate (4Q-weighted) |
| Opponent DvP (by position) | Quantile bands | TOP5 · 6–25 · 26–75 · 76–95 · BOT5 | rate |
| Game pace | Continuous | `log(√(own_pace × opp_pace) / league_avg)` | rate |
| Opponent scheme | Binary gates × archetype | drop / switch / pack-paint (phase 2; needs playtype data we have) | rate |
| Blowout risk | Minutes-model input | `P(margin≥20 \| derived spread)`, bands <10% / 10–25 / 25–50 / >50 for cell conditioning | minutes |
| P(OT) | Minutes-model input | derived spread; +5 min bump | minutes |
| Foul risk | Minutes-model input + tiered | PF/min bands × opponent drive rate; referee crew table = artifact only | minutes / dud weight |
| With/without teammate | Binary gate | precomputed lift per (player, teammate_out) | rate + minutes |
| P(start) | Minutes-model input | threshold <0.9 raises dud weight | minutes |
| Season phase | Tiered (low confidence) | early / mid / post-ASB / late-eliminated | minutes; backtest decides |

**Cutpoints**: data-driven (CART on our 3 seasons), validated out-of-sample, **frozen for a
season**. Never arbitrary.

### 4.3 Variation bands — per-prop percentiles of the league line distribution
4–5 bands per prop, edges = percentiles of the league's line distribution for that prop (adapts as
the scoring environment shifts; per-player-relative bands rejected as unstable). Seeds (points):
`FRINGE <9.5 · ROLE 9.5–17.5 · STARTER 18.5–25.5 · STAR 26.5–31.5 · SUPERSTAR >31.5`.
What the dimension adds beyond per-line tiers: **factor effects change with expectation level** —
blowout risk is a large penalty for a 12.5-line role player and small for a 28.5-line star; an
elite defense penalizes the star heavily and the fringe player not at all; for low lines the
bet is almost entirely minutes/dud risk, for high lines usage/efficiency.

### 4.4 Direction — kept as a cell dimension (owner-locked; MLB-proven), AND distribution shape
Complementary, not redundant. The distribution shape handles the **base skew** (assists left via
compounding "and" dependencies + playmakers rested first; TO/stocks/3PM right via zero-inflation
and burst games). The direction dimension (`more / less / both`) handles **asymmetric factor
effects** — a blowout penalizes "more" far more than it helps "less" for a star. Gemini's
recommendation to drop the dimension was rejected on both grounds.

### 4.5 Prop line — the relevance matrix gates everything
Runs before any tier logic: each factor is `full / partial / none` per prop. A leg is only evaluated
against factors relevant to its prop.

| Factor | Full | Partial | None |
|---|---|---|---|
| Minutes model (all inputs) | every prop | — | — |
| Usage share | Points, FGA, 3PA, TO, PRA, P+R, P+A, Fantasy | Ast | Reb, Blk, Stl |
| Pace | Points, Reb, Ast, TO, combos, Fantasy | 3PM, Stl | Blk, FTM |
| Opp DvP (by position) | Points, Reb, Ast | 3PM, Blk, Stl | TO |
| Opp shot diet (3PA vs paint) | Reb, Blk | — | others |
| Opp miss rate (eFG) | Reb | — | others |
| Teammate competition (lineup geometry) | Reb | Ast | others |
| Teammate shooting quality | Ast, P+A, R+A, PRA | — | others |
| Opp rim-attempt rate | Blk | Fouls | others |
| Opp TO rate / ball security | Stl | — | others |
| Opp forced-TO rate | TO | — | others |
| Foul-drawing (PFD) × opp foul rate | FTM, Points | — | others |
| Scoring composition (%3PT/%paint) | variance shape for Points; 3PM | — | — |
| Rest/B2B/travel/altitude | all (rate + minutes) | — | — |
| Blowout / P(OT) / foul risk / P(start) | minutes model → all | — | — |

---

## 5. Per-prop lock table (drivers ranked; LIFT / PENALTY; shape; direction skew)

| Prop | Drivers (ranked) | Primary LIFT | Primary PENALTY | Shape | Skew |
|---|---|---|---|---|---|
| Points | Minutes · Usage · Pace×DvP · teammate-out redistribution | inherited usage | opp efficiency allowed | Normal (high line) / NegBin (low line) | — |
| Rebounds | Minutes (most linear) · lineup geometry · pace×opp miss rate · opp shot diet | second big absent | 3PA-heavy opp | tight NegBin (bigs = most stable prop) | — |
| Assists | Creator role (potential-AST/min) · Minutes · teammate shooting · opp scheme | role change | poor-shooting lineup | NegBin / hurdle | **left** |
| 3PM | 3PA volume ≫ 3P% · Minutes · opp 3PA allowed · C&S vs pull-up | attempt volume | run-off-line schemes | zero-inflated NegBin | right |
| Blocks | opp rim-attempt rate · BLK/min · role · Minutes | attacking opp | perimeter opp | zero-inflated NegBin | right |
| Steals | opp TO rate · STL/min · pace · scheme | sloppy opp | secure-ball opp | zero-inflated NegBin | right |
| Turnovers | usage/ball-handling · opp forced-TO · pace | high-usage night | — | NegBin, spikes regress | right |
| FGA / 3PA | Minutes · Usage · role · opp scheme · pace | role/green light | — | Normal — **lowest-variance offensive props** (no make-rate noise) | — |
| FTM | PFD rate × opp foul rate × FT% (long memory) | foul-happy opp/crew | — | NegBin | right |
| Fouls | PF/min · opp drive rate · guarding assignment · crew | — | — | Poisson, truncated at 6 | right |
| Combos (P+R, P+A, R+A, PRA, Stocks) | union of components + **covariance** | — | — | **joint simulation** of components | player-archetype dependent |
| Fantasy | components; Blk/Stl ×3 create HR-style lumpiness | — | — | **simulated from components, never fit directly** | right, fat tail |
| DD / TD | joint threshold ≥10 in 2/3 categories | opp weak in all categories | — | joint simulation frequency; **tier on P(DD), never on mean stats** (30/9.9 trap) | binary |
| 1Q | starters ≈ full quarter; opp 1Q defense; fast-starter; early pace | — | early foul trouble (minimal) | small counts → NegBin; **1Q usage ≠ full-game usage** | — |
| 1H | + bench-unit matchups; dud component returns | — | — | Q1+Q2 simulation; ≈48–49% of full | — |
| 2H / 4Q | **full mixture, bimodal/trimodal**; clutch usage; garbage-time accumulators; OT (PP/UD) | close game extends minutes | blowout | sample minutes first, outcome conditional | — |

**More-only layers (Goblin/Demon/milestones)**: the objective is the **80th–99th percentile
tail**, not the mean. Empirical per-tier distribution is primary; parametric fallbacks must be
fat-tailed (Student-t / skew), never plain Normal. Research consensus: this is the layer where a
sharp baseline earns the most; star Points/PRA on standard lines is where it should be most
conservative.

## 6. Hit-probability path (MLB port with the NBA component)
1. Rate tier + shrunk rate (§4.1) → per-minute rate distribution.
2. Minutes distribution (§3.1).
3. **Empirical per-tier outcome table** (primary when tier sample ≥300 games) — built
   **conditional on game state** (competitive vs blowout) so mixing with `P(blowout)` never
   double-counts; else parametric per §5 with within-player variance and a prediction interval.
4. Combos/Fantasy/DD/TD via joint simulation of components (covariance per player from own logs).
5. Guards (exact MLB port): Wilson clamp n<30, sample-size confidence ceiling, discontinuity
   override, monotonic ladder reconciliation.

## 7. Factor combination (exact MLB port)
Applicable factor contributions summed in **log-rate space** → `rate_multiplier = exp(Σ)`;
baseline HP → odds × multiplier → probability. Missing factor = **zero contribution + confidence
penalty**, never guessed. **Macro-clusters** (mandatory): game environment (pace, geometric mean
→ one feature); defensive pressure (DvP + scheme, jointly capped); game script (blowout + OT +
fouls → minutes model, not the rate engine). Live enrichment applies **delta** factors
(`market_spread − derived_spread`; `confirmed_out` supersedes `questionable`), never re-evaluates
static ones.

## 8. Calibration + backtest plan (what sharpens the skeleton)
- **Data**: 2023-24 (train) + 2024-25 (validation) to tune tier counts, band edges, cutpoints,
  decay alphas; **freeze**, then **walk-forward on 2025-26** with a one-month lag (retrain to
  Nov 1 → test November → deploy December …). Time-based splits only; all rolling stats strictly
  backward-looking.
- **Granulation rule** (owner): where the backtest shows a prop/variation/direction cell is
  under-fit, **add tiers there** — never flatten. MLB found 24 tiers plateaued; NBA re-establishes
  its own plateau per prop.
- **Cell shrinkage**: `w = k / (k + n)`, `k` = per-stat stabilization constant
  (`stat_decay_config.shrinkage_stabilization_games`); cells under 50–100 samples fully shrunk to
  prior; per-cell `k` re-estimated by bootstrap in the loop (MLB §6).
- **Post-hoc calibration**: Platt scaling `sigmoid(A·logit(P)+B)` per prop/side, fit walk-forward,
  applied only if monotonic, n≥1000, max shift ≤0.15 (exact MLB guards).
- **Validation cross-checks built in**: reproduce the DataStreak blowout curve on our logs;
  derived spread vs ParlayAPI historical spreads; B2B minute deltas vs published ranges; P(start)
  accuracy vs Gemini's 90–95% figure — all measured, none assumed.
- **Metrics**: Brier score, log-loss, reliability curves per prop/variation/direction; tail
  calibration specifically for More-only layers.

## 9. Schema (materialized in `nba_config`, mirrors MLB `config.*` exactly)
- `prop_taxonomy` — every Tier A/B prop with app coverage, unit, OT rule, natural floor, shape.
- `factor_registry` — every factor: form (band/continuous/gate), model side (rate/minutes),
  macro-cluster, research notes.
- `factor_relevance` — factor × prop → full/partial/none.
- `variation_bands` — per prop, percentile-edged bands.
- `role_tiers` — the six minutes thresholds.
- `factor_profile_cells` — factor × prop × rate_tier × role_tier × direction × variation_band with
  dedicated `cap / lift / penalty / formula_coefficient_a/b/c / min_real_sample_threshold /
  stabilization_reference_games / current_shrinkage_weight / automation_status / notes`.
- `calibration_log` — audit trail for the semi-automatic → automatic loop.
All tunables live in these tables. Nothing hardcoded.

---
*Skeleton locked 2026-09-09. Values are seeds. The backtest owns the sharpening.*
