# NBA Enrichment Factor Lock — Pass 1 (2026-09-09)

*Owner directive: find every factor that gives any edge at the enrichment level, per prop line, per direction, per line
variation, with sub-factors and tiers; find how to mine each daily; find how to backfill two seasons so the enrichment
layer can be backtested like the baseline. Multiple passes until nothing is left. This is pass 1: the factor registry,
mechanisms, per-prop/direction/variation behavior, sources, timing, and backfill plans. Pass 2 = Gemini/web critique of
this list + quantification on our own data. Pass 3 = mining scrapers + backfills. Nothing here is frozen until it is
measured on two seasons, exactly like the baseline.*

Related: `NBA_COMPASS.md` (realignment), `NBA_CLASSIFICATION_BASELINE_DESIGN.md` §6–7 (baseline factor registry, delta
principle), `NBA_ENRICHMENT_FACTORS_RESEARCH.md` (static/weekly factors, already built), 09-09 checkpoint §8 (43 of 173
roster players were DNP on a replayed day — the single largest thing the baseline cannot know).

---

## 0. Position in the pipeline and the delta principle

```
baseline ladder (as-of history, calibrated)            <- built daily by nba-baseline.yml
  -> BOARD (PP/Sleeper/Underdog lines)                   <- later (off-season: no board)
  -> DAILY CONTEXT (this document: mined factors, each with a fallback so it is always populated)
  -> MARKET (game lines: spread/total; prop lines where available)
  -> ENRICHMENT ENGINE: delta multipliers on MINUTES and/or RATE + variance + confidence, never re-evaluating the baseline
  -> FINAL: probability per leg, score, confidence, slip
```

Rules carried from the baseline: log-rate additive combination; missing factor = zero contribution + confidence penalty
(never guessed); every coefficient fit on data and validated on two seasons; owner granulation rule (granulate where
under-fit, never flatten); cells keyed by prop × direction × variation band × role tier exactly like
`nba_config.factor_profile_cells`.

Enrichment runs 2–3× per day. **Information timing (all times ET unless noted, from the official injury-report policy and
the PDF archive):**

| When | What becomes known | Reliability |
|---|---|---|
| T−1 day, 5 PM local | Official injury report: day-before statuses (Out/Doubtful/Questionable/Probable/Available + reason incl. "Rest" / "Injury Management") | official, but Questionable = coin flip |
| Game day 11 AM–1 PM local (8–10 AM for tips ≤5 PM); B2B second night 1 PM local | Game-day report; most Questionables resolve to Probable/Out | high |
| ~9 AM ET | Referee crew assignments (official.nba.com/referee-assignments) | official |
| Continuous, sharpest near tip | Market: spread, total, moneyline; prop lines (sportsbooks) | high (limits rise near tip) |
| ~30–90 min before tip | Confirmed starting lineups (beat reporters, aggregators, then nba.com) | high |
| 15–30 min before tip | Final injury bulletin / late scratches / minutes-restriction quotes | highest edge, shortest window |

The official PDF archive is enumerable: `https://ak-static.cms.nba.com/referee/injury/Injury-Report_YYYY-MM-DD_HH_MMAM.pdf`
(observed snapshots at 12:30 PM, 01:00 PM, 02:30 PM, 03:30 PM, 04:00 PM, 06:45 PM, 07:45 PM …). **This makes a
two-season backfill of statuses AS THEY WERE KNOWN pre-game feasible** — far stronger than inferring "out" from box-score
inactives, because it preserves the Questionable/Probable uncertainty the enrichment engine must price.

---

## 1. Factor registry (enrichment layer)

Legend — **Mech**: A availability, M minutes, R rate/usage, V variance, G game state, P pricing. **Dir**: which side the
factor pushes and the asymmetry. **Var**: how the effect changes across line variations (low/mid/high anchors) and role
tiers. **Backfill**: how to reconstruct two seasons for backtesting. **Pub**: publicly overrated (O) / underpriced (U).

### Group A — Availability and role (largest effects; the 43-of-173 problem)

**A1 `injury_status_self`** — Mech A/M. The player's own status. Sub-tiers: Out, Doubtful (~<25% plays), Questionable
(~50%), Probable (~75–95%), Available; reason class (injury vs illness vs rest vs personal vs suspension vs G-League); day-
before vs game-day report; last snapshot before tip. Dir: Out/Doubtful → leg void/avoid; Questionable → confidence penalty
both sides + P(plays) weighting; Probable → mild Less on minutes (early exit risk) . Var: Questionable hurts high-anchor
More most (needs full minutes). Source: official PDF snapshots; beat reporters for the tie-break. Backfill: PDF archive
(statuses as known) + box-score DNP/inactive (truth). Pub: U for the *Questionable → actual minutes* mapping.

**A2 `teammate_out_redistribution`** — Mech M/R. The strongest daily edge. When a teammate is Out, his minutes and usage
redistribute. Sub-tiers: (a) out player's archetype — primary ball-handler / primary scorer / primary rebounder-rim
protector / 3&D wing / backup; (b) out player's usage tier (≥30%, 25–30, 20–25, <20) and minutes tier; (c) the
beneficiary's relationship — direct backup (minutes), same-position starter (usage), other starters (usage share), roll-man
whose playmaker is out (rate DOWN); (d) game number of the absence (1st game = most mispriced; by the 3rd the market and the
baseline's own history have adjusted); (e) multiple absences (interactions). Published magnitude: a ~32%-usage star sitting
frees ~7–8 usage points; markets capture ~5–6 pre-tip; bench→starter promotion adds +3–5 usage points beyond the minutes
bump. Dir: More on the beneficiaries' counting stats (right-skew: high lines become disproportionately likelier), Less for
players whose production depends on the absent playmaker (assist-dependent centers/finishers). Var: the More effect grows
with the line anchor; role: bench→starter > co-star > specialist. Source: A1 applied to teammates + our with/without table
(baseline already carries the derived backup). Backfill: box-score inactives + our game logs give the ACTUAL redistribution
for every absence over 3 seasons — measurable now, by archetype. Pub: direct backup priced (O); archetype-specific second-
order effects (U).

**A3 `returning_player_restriction`** — Mech M/R/V. First games back from a multi-game absence. Sub-tiers: games missed
(1–2 / 3–7 / 8+); game-back index (1st / 2nd–3rd / 4th+); announced restriction (coach quote: "~20 minutes", "no
restriction"); starter vs bench return. Dir: Less on the returning player's minutes and counting stats (and on his
fill-ins, who revert); after restriction lifts, the fill-ins' Less persists. Var: very strong Less on high anchors for
the returner (cannot reach ceiling on 20 minutes). Source: beat reporters (restriction quotes, 1–2 h pre-tip) + our own
first-game-back history. Backfill: fully measurable from game logs (first game after ≥N DNPs → minutes and rate vs
baseline), 3 seasons. Pub: U (market treats return as binary).

**A4 `rest_dnp_probability`** — Mech A. Star rest (DNP-Rest / "injury management"). Now RULE-DRIVEN by the Player
Participation Policy (2023-24+): stars (All-Star/All-NBA in the last 3 seasons) may not rest healthy in national-TV or Cup
games; teams must balance home/road rest with a preference for home; two stars may not rest the same game; pre-approved
B2B allowances for age ≥35 or ≥34,000 minutes / ≥1,000 games. Sub-tiers: B2B second night (most common spot), 3-in-4,
national TV (protects), home vs road, opponent strength (weak opponent → more rest), age/mileage, star designation, prior
rest count this month, post-OT first night, late season / clinched / eliminated. Dir: for the star: P(plays) down (void
risk); for teammates: A2. Var: n/a for the star (availability), A2 for others. Source: the day-before report catches most
(reason "Rest"); the schedule + standings give the prior. Backfill: game logs + schedule + national-TV flag (schedule file:
verify broadcaster field) — the rest-spot base rates by sub-tier are measurable now. Pub: O for "B2B = sits" generically;
U for the policy-driven structure.

**A5 `lineup_change`** — Mech M/R. Confirmed starters vs the baseline's P(start). Sub-tiers: spot start (injury), permanent
promotion/demotion, small-ball / two-big shifts, closing lineup changes. Dir: promoted → More (minutes + usage); demoted →
Less; other starters' usage share adjusts. Var: promoted bench player: strongest More on mid anchors (his ceiling moves).
Source: confirmed lineups 30–90 min pre-tip; nba.com official. Backfill: our starter-status history (2025-26 built; 2023-24
and 2024-25 backfill via boxscoretraditionalv3). Pub: U for demotions (Less side).

**A6 `late_scratch`** — Mech A/M/R. A1/A2 arriving inside the last 30 minutes (often after some slates lock). Dir: same as
A2 but with maximal mispricing. Operational: the engine must re-run one game on demand. Backfill: same as A2 with a
timestamp filter (last PDF snapshot vs earlier ones) to measure how often late changes occur and their size.

**A7 `trade_new_arrival_window`** — Mech M/R/V. Games 1–5 after a trade or signing, for the new player and the affected
incumbents. Dir: new arrival Less (integration) with high variance; incumbents' usage in flux. Primary use: confidence
penalty for the whole team's props during the window. Source: transaction wire; our game logs detect team changes.
Backfill: game logs (team change) — measurable now (first-5-games effect sizes by role).

**A8 `rookie_and_two_way_limits`** — Mech A/M/V. Rookie ramp (minutes trend in first 20 games), two-way contract game
limits (50 NBA games), G-League assignments/recalls. Dir: two-way near limit → availability risk; rookies → variance
penalty. Source: transactions + roster status. Backfill: game logs + contract status (limited). Low priority.

**A9 `suspension_personal`** — Mech A. League suspensions, personal/bereavement leave. Binary; handled as Out. Source:
injury report reason class + wire.

### Group B — Game state and motivation

**B1 `market_spread_delta`** — Mech G→M. Market spread vs our DERIVED spread (r=0.46 vs margin; market ≈0.55+). Apply the
difference to the minutes mixture weights (P(blowout), P(close), won/lost side). Sub-tiers: |spread| 0–3 / 3–6 / 6–10 /
10–14 / 15+; delta vs derived (market more/less confident); favorite vs dog. Dir: starters on either side of a big spread →
Less on high anchors (4Q sit); favored bench/fringe → More (garbage time); close game → More for stars' 4Q/2H props and
OT-inclusive lines. Var: the Less is strongest on high anchors for stars; period props (4Q/2H) react most. Source: odds
API / ParlayAPI game lines (locked source; live at season start). Backfill: closing (and opening) spreads for 2023-24 →
2025-26 from ParlayAPI's historical game lines (owner-locked source) — measurable now once pulled. Pub: correctly priced
at the game level; U for the *period-prop* consequences.

**B2 `market_total_delta`** — Mech G→R. Game total vs our pace-implied total: a proxy for possessions and scoring
environment the static pace factor cannot see (injuries on both sides, style). Dir: high total → More on counting stats
(points, 3PM, assists, rebounds via misses), low total → Less. Var: scales with the anchor (multiplicative on rate).
Source/backfill: same as B1.

**B3 `motivation_leverage`** — Mech G→M/R/V. Play-in/seeding races (rotation shortening: stars +2–4 minutes), clinched /
eliminated (rest, young players), tanking (veterans shut down; variance up), rivalry / revenge / milestone (narrative,
small). Sub-tiers: standings context by date; games remaining; magnitude at stake. Dir: leverage → More for key starters,
Less for deep bench; tanking → Less veterans / More + variance young. Source: standings computed from game logs; wire for
shutdowns. Backfill: fully computable from game logs + standings (measure April sub-structure — our season-phase cell
already carries the average; this is the *conditional* version). Pub: revenge games O; leverage rotations U.

**B4 `opponent_availability`** — Mech R (opponent side). A1/A2 applied to the OPPONENT: their rim protector out → More for
our bigs' points/rebounds and rim finishers; their primary defender out → More for the matched scorer; their star out →
blowout risk shifts (B1 interacts). Dir/Var: rate-side, prop-specific. Backfill: opponent inactives from game logs —
measurable now. Pub: U (public uses static DvP, which the baseline already beats).

**B5 `overtime_and_pace_live`** — Mech G. Market-implied P(OT) (near-pick'em) and implied pace from total/spread. Mostly
absorbed by B1/B2; kept as a sub-factor for 2H/4Q OT-inclusive lines.

### Group C — Market and line intelligence

**C1 `book_vs_pickem_gap`** — Mech P. Sportsbook consensus/sharp line vs the pick'em line for the same prop. Sub-tiers: gap
0.5 / 1.0 / 1.5+; juice asymmetry on the book side; sharp (Pinnacle) vs consensus. Dir: direct More/Less signal; the
strongest public-market signal available. Var: a 1-point gap matters more on low anchors (relative). Source: odds API
(prop lines) — **not available in the off-season; prop-line history is a paid dataset** (owner decision; BigDataBall). Pub:
U (pick'em lines are static; the book market is live).

**C2 `line_movement`** — Mech P. Direction, size, and speed of prop-line movement through the day; steam across books.
Sub-tiers: opener vs current; move ≥1.0; move after news vs without news. Source/backfill: same as C1 (paid).

**C3 `game_line_movement`** — Mech G. Spread/total movement (free via game lines) as a news-detector: a spread jump of ≥2
points without a public injury report is a leading indicator of an unannounced absence. Source: ParlayAPI game lines;
backfill: opening vs closing from the same archive.

**C4 `pickem_line_vs_baseline_anchor`** — Mech P (internal). The board line vs our baseline anchor: where the app posts a
line far from our anchor, the leg is either an edge or a warning (news we lack). Used with C3 as a sanity gate. Available
once the board exists.

### Group D — Officials, venue, schedule (smaller, real)

**D1 `referee_crew`** — Mech V/R/M. Crew foul rate, FT rate, technical/flagrant rate, pace. Sub-tiers: crew percentile of
fouls/game; crew home bias; crew tendency vs specific play types (verify). Dir: high-foul crew → More FTM/points for elite
foul-drawers, More PF for foul-prone, Less minutes for foul-prone bigs; low-foul crew → More minutes/rebounds for physical
bigs. Var: FTM and fouls props react most; points marginally. Source: official assignments ~9 AM ET; our
`nba_stats.game_officials` (2025-26 built) + backfill 2023-24/2024-25 via boxscoresummaryv3 for the tendency table (MLB
`ref.umpire_tendency` pattern). Backfill: yes. Pub: O for points, U for fouls/FTM/minutes of foul-prone players.

**D2 `schedule_density_travel`** — Mech M/R. Beyond the baseline's B2B (measured ≈0 conditional on playing): 3-in-4, 4-in-5,
long road trips, time-zone change direction (east→west late games), day games, post-OT nights. Published claim: 3-in-4
third game −5–8% efficiency (verify on our data). Dir: Less on rate for fatigued teams; interacts with A4 (rest). Source:
schedule + arena time zones (static). Backfill: fully computable now. Pub: O generically; verify.

**D3 `altitude_venue`** — Mech R. Denver/Utah for visiting teams, especially on B2B; baseline home/away carries most of
it. Small; keep as a sub-tier of D2. Backfill: computable.

**D4 `national_tv_marquee`** — Mech A/M. Under the participation policy, national-TV games *protect* star availability and
lengthen star minutes (rotation shortening in marquee games — verify). Source: schedule broadcaster field (verify present).
Backfill: computable if the field exists in the schedule file.

### Group E — Confidence and variance modifiers (not direction)

**E1 `news_recency_penalty`** — hours since last confirmed information; Questionable unresolved at run time → confidence
down. **E2 `team_flux_penalty`** — trade window, new coach, ≥2 rotation players out → variance up. **E3 `sample_thinness`**
— rookies/new arrivals with no carryover (baseline already flags). **E4 `information_freshness`** — snapshot age of every
mined factor; fallback used → confidence penalty (design rule).

---

## 2. Per-prop matrix (which factors matter, and the direction asymmetry)

| Prop | Primary enrichment factors (in order) | Direction notes |
|---|---|---|
| points | A2 (scorer/ball-handler out), A3, B1 (blowout Less on high anchors), B2, A5, D1 (foul-drawers), B3 | More right-skew under redistribution; Less under blowout risk and restrictions |
| rebounds | A2 (rebounder out → More for other bigs), B4 (opp rim protector out), B2 (misses), D1 (physical bigs), B1 | More for bigs when either team's big is out |
| assists | A2 archetype-specific (playmaker out → backup PG More; scorer out → assists may DROP for the PG), A3, B2, A5 | Most archetype-sensitive prop |
| 3PM / 3PA | A2 (attempt redistribution), B2, B4 (opp perimeter defender out), A5 | Attempts move before makes |
| FGA | A2 (cleanest usage redistribution), B1, B2 | Highest-signal prop for A2 |
| FTM | A2, D1 (crew), B4 (opp foul rate), B1 (late-game fouling in close games → More) | Crew is a first-order factor here |
| blocks / steals | B4 (opp rim attempts / turnover rate change with absences), D1, B1 (blowout minutes) | Noisiest props; enrichment mostly via minutes |
| turnovers / fouls | D1, B1, A2 (ball-handler out → More turnovers for the replacement), B3 | |
| combos (PRA, P+R, P+A, R+A, fantasy, stocks) | inherit component factors + covariance (A2 redistributes across components) | Fantasy: A2 dominates |
| double-double | A2/B4 for bigs; B1 (blowout kills the second category) | |
| periods 1Q/1H | A5 (starters), A1, D2 (day games); NOT B1 (measured ≈1.00 in Q1) | Cleanest props; minutes-driven |
| periods 2H/4Q | B1 (market spread → state mixture weights), B5 (OT), A4, B3 (leverage) | The most market-sensitive props |

---

## 3. Variation-band and role modulation (principles to be measured, not assumed)

1. Redistribution (A2/A5) is multiplicative on rate and additive on minutes → right-skew: the More probability on high
   anchors rises faster than the Less on low anchors falls. Cells must be keyed by anchor band.
2. Restriction (A3) and blowout risk (B1) truncate the ceiling → the Less on high anchors is the strongest effect; low
   anchors barely move.
3. Availability uncertainty (A1 Questionable, A4) is a confidence effect, not a direction effect, except that it lowers
   the More on high anchors (partial minutes) — treat as a minutes-mixture weight.
4. Role tier: bench→starter promotions produce the largest relative moves; stars produce the largest absolute moves; fringe
   players in blowouts produce the largest *variance*.
5. Periods: 1Q/1H respond to A5/A1 only; 2H/4Q respond to B1/B5/B3.

---

## 4. Backfill plan (two seasons, for the enrichment backtest)

| Factor | Truth source (what happened) | Pre-game source (what was known) | Status |
|---|---|---|---|
| A1/A2/A4/A6/B4 statuses | box-score inactives / DNP from our game logs (3 seasons, have) | official PDF archive by timestamp (enumerate snapshots; parse) | PDF backfill scraper to build |
| A3 first-game-back | game logs (have) | PDF + restriction is unknown historically (measure the *typical* restriction by games missed) | measurable now |
| A5 lineups | starter status 2025-26 (have); 2023-24/24-25 via boxscoretraditionalv3 | same | backfill to build (~2,460 calls) |
| A7 trades | game logs team changes (have) | transaction wire (dates) | measurable now |
| B1/B2/C3 game lines | ParlayAPI historical game lines (locked source; NBA 2007+) | opening/closing | pull to build |
| B3 standings/leverage | computed from game logs (have) | same | computable now |
| C1/C2 prop lines | paid (BigDataBall) — owner decision | — | blocked pending decision |
| D1 officials | game_officials 2025-26 (have); backfill 2 seasons via boxscoresummaryv3 | daily assignments page | backfill to build (~2,460 calls) |
| D2/D3/D4 schedule | schedule + arenas (have; verify broadcaster field) | same | computable now |

**Measurable immediately on our own data (pass 2 targets)**: A2 redistribution by archetype and usage tier (all absences,
3 seasons); A3 first-game-back minutes and rate by games missed; A4 rest-spot base rates by sub-tier under the policy;
A7 first-5-games effects; B3 April conditional structure; B4 opponent-big-out effects on rebounds/blocks; D2 3-in-4 and
time-zone effects; and the size of what the baseline's derived backups already capture (so enrichment prices only the
*residual* — the delta principle).

---

## 5. Open questions for pass 2 (Gemini + web critique, then data)

- Exact list of snapshot times in the PDF archive (enumerate a month) and the parse format (team, player, reason, status).
- Does the schedule file carry the broadcaster (national TV) field? If not, source.
- Referee tendency table design: crew-level vs individual official; minimum games; what actually moves FTM/PF (verify with
  our 2025-26 officials data before backfilling two more seasons).
- Which A2 archetype interactions are real at our sample sizes (playmaker-out → roll-man rate down is the key claim).
- Whether the market spread's information beyond our derived spread is large for period props specifically.
- Line-movement-as-news-detector (C3) threshold and lead time.
- Overrated list to test explicitly on our data: revenge games, home/away in isolation, generic B2B, generic DvP.
