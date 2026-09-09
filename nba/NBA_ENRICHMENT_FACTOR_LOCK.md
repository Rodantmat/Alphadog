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

---
---

# Pass 2 (2026-09-09) — Prop-line signal sets and slip-level factors

*What the slip engine consumes: for each leg, the baseline probability plus a set of DAILY SIGNALS, each with a
direction, an anchor-band-dependent magnitude, a trap, and an engine role (rank booster / gate / confidence / correlation
flag). Magnitudes marked **[measured]** come from our own two-season data; **[published]** from public research
(RotoGrinders, Unabated, HoopMargin, propeller-type sources) and are to be re-measured; **[folklore]** is widely repeated
but unmeasured and is NOT to be used until measured. Engine role legend: **RB** rank booster, **G** gate (filter),
**C** confidence modifier, **X** correlation flag.*

## P2.1 Points (anchors: FRINGE <9.5 · ROLE 9.5–17.5 · STARTER 17.5–25.5 · STAR 25.5–31.5 · SUPERSTAR >31.5)

| Signal (exact data point) | Mechanism | Direction / magnitude at anchor | Low vs mid vs high anchor | Trap | Engine |
|---|---|---|---|---|---|
| Teammate with usage ≥28% listed OUT (first game of the absence) | usage vacuum → FGA/FTA up for same-position starters and the direct backup | More +3–8 pp [published; 7–8 usage pts freed, market prices 5–6] | mid anchors gain most; SUPERSTAR already at max usage; FRINGE only gains if minutes come with it | replacement is a low-usage defender; team slows down without the star; second/third game (market and our history have adjusted) | RB high; X (pairs badly with another teammate's points More) |
| Player is the direct backup of an OUT starter at the same position | minutes +8–15 and usage +3–5 pts [published] | More +5–10 pp on ROLE anchors | largest relative move on FRINGE/ROLE; the ceiling moves | coach splits the minutes across two players; spot starter is a defender | RB high |
| Market spread ≥ 11.5 against or for the player's team (favored starter) | 4Q sit: Iron Men play 37% of normal Q4 minutes in blowouts, 45% sit entirely [measured] | Less on STAR/SUPERSTAR anchors +4–8 pp of Less (i.e., More −4…−8) [measured from state effects]; favored bench More | devastating on high anchors; neutral/positive on FRINGE | trap game stays close (derived spread disagrees with market → weight both); underdog stars also sit (lost blowouts 36.9% over-rate [measured]) | G on high-anchor More when spread ≥11.5; RB for favored bench More |
| Market total ≥ 232 (or ≥ +6 vs our pace-implied total) | more possessions and a shootout script | More +1–4 pp, scales with anchor [published] | proportional; highest absolute gain on STAR | pace driven by turnovers (opponent forces TOs) lowers efficiency | C; small RB on high anchors |
| Line is ≥2.5 below the player's last-10 median WITH the same context (no teammate returned) | market lag on a stable role change | More +2–6 pp [published] | strongest on ROLE/STARTER | the L10 was inflated by absences that have ended; hot streak (shooting) is noise [published: hot/cold streaks regress] | RB medium, conditioned on context match |
| 2nd game back from an 8+ game absence (restriction likely 24–28 min) | minutes cap | Less on STAR anchors +6–10 pp of Less; 1st game back stronger [measured on our data next pass] | high anchors cannot be reached on 20–24 min | "no restriction" quote from the coach removes it | G on high-anchor More; RB Less |
| Player's last-5 minutes trend ≥ +4 vs season with no injury context | role expansion | More +2–4 pp | ROLE/STARTER | garbage-time minutes in blowouts inflate the trend (filter competitive games — our baseline already does) | C |
| Opponent's primary rim protector OUT (for slashers/bigs) or top perimeter defender OUT (for guards) | rate: rim finishing / shot quality | More +2–4 pp [published] | mid/high anchors | backup is an elite defender | RB medium |
| Crew in the top quartile of fouls/game (for elite foul-drawers: FTA/36 top decile) | FT rate | More +1–3 pp on points (larger on FTM) [published] | high anchors (stars draw fouls) | player adapts aggression | C on points; RB on FTM |
| Close-game leverage (spread ≤ 4 and play-in/seeding stakes) | rotation shortening; stars +2–4 minutes; stars score 1.09× per minute in close Q4s [measured] | More +2–3 pp on STAR anchors; 4Q/2H props more | high anchors | coach is a long-rotation coach regardless | RB for 2H/4Q; C for full game |
| Season phase October (carryover) / April (tank, rest) | baseline already deflates October ~5% and lifts April; the enrichment version is the *conditional* one (this team is tanking; this star is shut down) | Less veterans on tanking teams −4…−8 pp; More young players + variance | all anchors | phase cell double-counting → apply only the residual | G (shut down = void risk); C |

**Folklore, not to be used until measured:** revenge games, "national TV motivation", home/away in isolation, generic "B2B = under".

## P2.2 Rebounds (LOW <3.5 · MID 3.5–6.5 · HIGH 6.5–9.5 · ELITE >9.5)

| Signal | Mechanism | Direction / magnitude | Anchor dependence | Trap | Engine |
|---|---|---|---|---|---|
| Teammate primary rebounder (REB/36 top on team) OUT | vacated boards + minutes for the backup big | More +3–6 pp for the replacement big; +1–3 for other starters [published] | HIGH/ELITE for the backup; MID for wings | team rebounds worse collectively; opponent OREB rises | RB high; X (two teammates' rebounds More compete) |
| Opponent starting C OUT or opponent bottom-quartile DREB% | more available boards at the rim | More +2–4 pp for the matched big | HIGH/ELITE | backup C is elite (Drummond-type) | RB medium |
| Opponent 3PA share top quartile (long rebounds) | long misses favor guards/wings | More +2–4 pp for guard/wing rebound lines | LOW/MID | efficient 3P team (fewer misses); check opp miss rate — baseline factor 0.33 [measured] | RB medium for guards |
| Opponent OREB% top quartile | opponent crashes → fewer *defensive* boards for our big | Less +1–3 pp for our bigs (baseline opp OREB −0.11 [measured]) | HIGH/ELITE | scheme changes by opponent | C |
| Market spread ≥ 11.5 | 4Q sit for starters; blowout minutes for bench bigs | Less on ELITE bigs' high anchors; More for backup bigs | ELITE hit hardest | trap game | G/RB as for points |
| Total ≥ 232 | more shots → more misses | More +1–3 pp | proportional | efficiency-driven totals | C |
| Crew low-foul (bottom quartile) for physical bigs | fewer foul-outs, more minutes | More +1–2 pp minutes-driven | HIGH/ELITE | — | C |
| ELITE-band big vs a small-ball opponent (opp C minutes < 20 recent) | mismatch boards | More +2–4 pp | ELITE | opponent goes big for this matchup | RB medium |

Measured facts to carry: rebounds dispersion is flat (var/mean 1.25–1.35) at every level — rebounds are the most *shape-stable* prop; the ELITE band's ±3–5 tail residual is a ~10-player effect (use confidence, not direction).

## P2.3 Assists (LOW <2.5 · MID 2.5–5.5 · HIGH 5.5–8.5 · ELITE >8.5)

| Signal | Mechanism | Direction / magnitude | Anchor dependence | Trap | Engine |
|---|---|---|---|---|---|
| Primary ball-handler OUT; player becomes the primary handler | role change: touches and potential assists up | More +4–8 pp for the new handler [published] | LOW/MID players gain most (non-playmakers promoted) | inefficient playmaker → turnovers not assists | RB high |
| Player's top assist target (finisher/shooter) OUT | fewer conversions of passes | Less −3…−5 pp for ELITE passers [published] | ELITE/HIGH | player shifts to scoring (points More — correlation) | RB Less; X (assists Less ↔ points More) |
| Opponent blitzes/doubles the primary handler (scheme flag) | forced kick-outs | More +2–5 pp for the handler | HIGH/ELITE | crisp rotations turn kick-outs into turnovers | RB medium |
| Teammates' recent 3P% hot vs season (shooter quality) | conversion of the same passes | More +1–3 pp | HIGH/ELITE | shooting regresses | C only |
| Close game projected (spread ≤ 4) | hero ball: assists 0.88–0.96× per minute for stars in close Q4s [measured] | Less on 4Q/2H assists for stars; full-game small | HIGH/ELITE, period props | — | RB Less for 4Q assists; C full game |
| Pace/total up | more possessions | More +1–3 pp | proportional | — | C |
| Blowout risk (spread ≥ 11.5) | 4Q sit | Less on high anchors | HIGH/ELITE | — | G |

Measured: assists are near-Poisson (var/mean ~1.1–1.2) with left skew for HIGH players — the "less" side on high anchors is the structurally harder side to price; use confidence.

## P2.4 3PM / 3PA (3PM: LOW <1.5 · MID 1.5–2.5 · HIGH 2.5–4.5 · ELITE >4.5)

| Signal | Mechanism | Direction / magnitude | Anchor dependence | Trap | Engine |
|---|---|---|---|---|---|
| Teammate high-3PA player OUT | attempt redistribution (3PA moves before 3PM — attempts are Poisson, makes binomial [measured]) | More on 3PA +3–6 pp; on 3PM +2–4 pp | MID/HIGH | replacement is a non-shooter (attempts vanish, not move) | RB high for 3PA; medium for 3PM |
| Opponent allowed-3PA share top quartile (baseline factor exists) — daily version: opponent's best perimeter defender OUT | more open looks | More +2–4 pp | HIGH/ELITE | opponent switches to zone | RB medium |
| Opponent drop coverage (scheme flag) for pull-up shooters; aggressive help for spot-up shooters | shot type availability | More +2–4 pp for the matching archetype | HIGH/ELITE | scheme adapts | RB medium (needs playtype data — we have Synergy play types) |
| Total ≥ 232 / pace up | more attempts | More +1–3 pp | proportional | — | C |
| Blowout for favored shooters | 4Q sit | Less on ELITE | ELITE | garbage-time bench shooters More | G |
| Line-shooting regime (league 3PA swing) | the baseline's 3PA regime residual | apply the current-season Platt only | all | — | C |

Rule: for 3PM never use makes-based streaks (binomial noise); use attempt signals. LOW-band 3PM (line 0.5/1.5) is a coin-flip prop unless attempts ≥ 5.

## P2.5 FGA (LOW <7.5 · MID 7.5–12.5 · HIGH 12.5–17.5 · ELITE >17.5)

The cleanest usage prop (certified 0.9/1.3 both seasons). Signals: teammate usage vacuum (strongest single More signal, +4–8 pp [published]); direct-backup minutes; blowout gate on ELITE; total/pace; role change; restriction (Less). Trap: efficiency-driven scorers (fewer attempts per point). Engine: FGA More is the preferred way to express a usage-vacuum thesis when points lines have already moved.

## P2.6 FTM (LOW <1.5 · MID 1.5–3.5 · HIGH 3.5–5.5 · ELITE >5.5)

| Signal | Mechanism | Direction / magnitude | Anchor | Trap | Engine |
|---|---|---|---|---|---|
| Crew top-quartile fouls/game (tendency table) | more whistles | More +2–4 pp for FTA/36 top-decile players [published] | HIGH/ELITE | player passivity vs tight whistle | RB high (first-order for this prop) |
| Opponent OPP_FTA_RATE top quartile (baseline factor) — daily version: opponent's foul-prone big starting/out | fouls committed | More +2–3 pp | HIGH/ELITE | — | RB medium |
| Close game projected | late-game intentional fouling: stars' FTA 1.18× in close Q4s [measured] | More on ELITE FTM in close games; 4Q FTM props | ELITE | blowout removes it | RB for 4Q/2H FTM |
| Usage vacuum | more drives | More +2–4 pp | MID/HIGH | replacement drives less | RB medium |

## P2.7 Blocks / Steals / Stocks (blocks: LOW <0.6 · MID 0.6–1.6 · HIGH >1.6; steals same)

| Signal | Mechanism | Direction / magnitude | Anchor | Trap | Engine |
|---|---|---|---|---|---|
| Opponent paint-scoring share top quartile (baseline opp paint 0.30/0.37 [measured]) — daily: opponent rim-attacking star IN and their stretch-5 OUT | rim attempts | More blocks +3–6 pp for rim protectors [published; our baseline carries the static part] | MID/HIGH | opponent settles for floaters vs an elite protector | RB medium (residual over baseline) |
| Opponent TOV% top quartile (baseline opp TOV 0.27/0.26 [measured]) — daily: opponent primary handler OUT (replacement sloppier) | live-ball turnovers | More steals +3–5 pp | MID/HIGH | ball out of hands / slow pace | RB medium |
| Foul trouble risk with a high-foul crew | minutes | Less blocks for foul-prone bigs −2…−4 pp | HIGH | — | C/G |
| Blowout risk | fringe minutes (FRINGE Q4 ratio 2.4 [measured]) | More for bench bigs' 0.5 lines; Less for starters | LOW lines for bench | — | RB/G |
| Zero-inflation: player's P(0) by mean band (baseline zero-adjust [measured]) | shape | confidence on 0.5 lines | LOW | — | C |

Measured: steals regress 17% over the next 20 games, blocks 6% — never chase a stocks hot streak; these are the noisiest props on the board (baseline: close-not-certified). Engine rule: stocks legs only as 2-pick anchors with a strong opponent signal, never as filler in 5–6 leg slips.

## P2.8 Turnovers / Personal fouls

Turnovers More: opponent forced-TO% top quartile (baseline factor exists; daily: opponent's disruptive guard IN), player becomes primary handler (usage vacuum → turnovers More, +3–7 pp [published]), pace up. Turnovers Less: blowout (fewer possessions for starters), restriction. Fouls More: high-foul crew, matchup vs a foul-drawing star (opponent FTA rate), tight game late (intentional fouls). Fouls Less: blowout (sits), low-foul crew. Both are zero-adjusted, top-decile regression 13–14% [measured]: treat as confidence-limited props.

## P2.9 Combos (PRA, P+R, P+A, R+A), fantasy, stocks

- The combos inherit the component signals; the engine adds them with the **component covariance** (measured: ρ points–rebounds 0.13 Iron Men → 0.46 fringe — minutes-driven). A usage vacuum is the strongest PRA/fantasy More driver because it lifts all components together.
- Fantasy: the most stable full-game prop (certified 1.0/0.8) — variance averages across components; the best anchor leg for large slips. Turnover penalty (−1) matters for high-usage handlers under pressure defenses.
- Combo Less legs under blowout risk are stronger than single-stat Less legs (all components truncate together).
- Stocks inherits blocks+steals noise — same rule as P2.7.

## P2.10 Double-double

Signals: the two categories' calibrated marginals (already in the baseline copula), plus any rebounds/points More signal on a big (opponent C out, teammate rebounder out) and the blowout gate (kills the second category). Engine: DD only for players whose weaker category's P(≥10) is ≥ 0.55 after enrichment; never for 0.3–0.5 candidates in multi-leg slips.

## P2.11 Period props

- **1Q / 1H** (cleanest; blowout irrelevant [measured Q1 ratio ≈1.00]): starter confirmation (A5) is the primary signal; 1Q usage share vs full-game share (scripted first plays — measurable from our quarter files); day games; opponent starting lineup quality; a returning player's restriction usually does NOT affect 1Q (they start and play the first stint) — 1Q More on a restricted star is a real, underpriced spot (verify).
- **2H / 4Q** (state-driven): market spread ≤ 6.5 → More for stars (3-part mixture; stars 9.0 min / 3% sit in close games vs 3.5 / 45% in blowouts [measured]); spread ≥ 11.5 → gate More on stars, RB More on bench; P(OT) 5.3% at pick'em → OT-inclusive lines get a small More; hero-ball assists Less; stars' FTA 1.18× in close Q4s; bench scoring 0.84× in close Q4s (bench 4Q More only in blowouts).

---

## P2.12 Slip-level factors (for the slip engine)

**Correlation (must be modeled, not hand-waved).** Use the same copula machinery as the double-double: per-pair correlation from history, shrunk to population by relationship type.
- Negative: two teammates' points/FGA More (usage competition); handler points More + handler assists Less is *positively* correlated (shoot-or-pass) — so points More + assists More on the same handler is negative; two teammates' rebounds More; starter More + same-team bench More in a non-blowout.
- Positive: passer assists More + shooter 3PM More (measurable from lineup data); player More + opponent player More in a high-total game; all "Less" legs on both teams in a projected blowout (starters), all bench "More" legs in the same blowout; component legs of the same player (points + PRA) — near-duplicates, cap at one per player.
- Period vs full: 1Q More + full-game Less on a favored star in a blowout is a *coherent* pair; 4Q More + full-game More on a star in a close game is coherent; mixing periods and full game across the same player otherwise stacks correlation.
- Engine: compute the joint hit probability of a candidate slip via simulation on the copula; rank by **marginal EV of adding a leg to this slip**, not by leg probability alone.

**Payout math.** For all-or-nothing entries with payout m on n legs, the per-leg breakeven (independent legs) is m^(−1/n) (e.g., 3× on 2 → 57.7%; 5× on 3 → 58.5%; 6× on 3 → 55.0%; 10× on 4 → 56.2%). Flex entries need the full distribution: EV = Σ P(k hits) × payout(k), computed from the joint (correlated) hit distribution. **Payout tables and void rules change and differ per app — read them from the apps at season start and store them in `nba_config` (design rule: never hardcode); do not rely on remembered tables.** Void handling is app-specific (a voided leg reduces the entry size on PrizePicks; treat other apps' rules as unverified until read).

**Prop stability for slip construction — from OUR certification (not folklore):** most stable full-game legs: FGA, points, rebounds, fantasy/PRA, assists, 3PM (ladder ≤1.5 pp, bands within 2.5 on both seasons); use as anchors in 4–6 leg slips. Confidence-limited: blocks, steals, turnovers, fouls, stocks, low-volume 3PM, DD candidates in the 0.3–0.5 zone; use only as 2-pick anchors with a strong daily signal. Period props: 1H and 4Q points certified; 1Q rebounds/assists/threes near standard; 2H points at standard on one season.

**Gates (hard filters before ranking):** (1) player Questionable at lock with no beat confirmation → exclude (or app-dependent); (2) high-anchor More on any starter with market spread ≥ 11.5 → exclude; (3) team in flux (trade window / ≥2 rotation players out / new coach) → confidence cap; (4) information older than the last report snapshot → confidence cap; (5) leg whose board line is ≥1.5 units from our anchor without a known cause → hold (news we lack).

**Leg quality score inputs (what the engine ranks on):** enriched probability; edge vs the board's implied 50% (and vs sportsbook consensus when available); confidence (information freshness, sample thinness, team flux, prop stability class); correlation-adjusted marginal EV in the slip; prop stability class; number and agreement of independent daily signals (a usage vacuum + a favorable opponent absence + a high total agreeing is stronger than one signal of the same nominal size).

---

## P2.13 What gets measured on our own data next (pass 3, before any coefficient is trusted)

1. Usage vacuum by archetype and usage tier: for every absence (3 seasons), the beneficiaries' FGA/36, points, assists, rebounds vs their own baseline, split by relationship (direct backup, same position, other starters, roll-man of an absent playmaker) and by game-of-absence (1st/2nd/3rd+).
2. First-game-back minutes and rate by games missed (1–2 / 3–7 / 8+), starter vs bench; 1Q share on restricted games.
3. Rest-spot base rates under the policy: P(star DNP) by B2B/3-in-4 × home/road × national TV × opponent strength × age/mileage × month.
4. Opponent absences: opponent C out → our bigs' rebounds/points/blocks; opponent primary defender out → matched scorer.
5. Market vs derived spread (once ParlayAPI game lines are pulled): does the market delta improve the state-mixture weights for 4Q/2H props beyond the derived spread?
6. Crew tendencies from `game_officials` (2025-26) → FTM/PF/minutes effects; decide if the two-season officials backfill is worth ~2,460 calls.
7. 3-in-4 / time-zone / day-game effects conditional on playing.
8. The folklore list (revenge, national TV, home/away alone) — measure and retire or keep.
Each becomes a `factor_profile_cells` entry keyed by prop × direction × variation band × role tier, validated on two seasons exactly like the baseline.

---
---

# Pass 3 (2026-09-09) — What was still missing: the matchup family, coach logic, report nuance, market structure; double-count discipline; correlations to test

Sources this pass: RotoGrinders' minutes methodology (injuries → blowout → matchup-specific minutes → coach tendency → foul
trouble; "don't double count what the projection already has"), the feature-engineering literature on defender assignment
and scheme (drop/hedge/blitz/switch; "Aggression+" for turnovers), the nba.com endpoint catalog (`leagueseasonmatchups`,
`boxscorematchupsv3`, `leaguedashptdefend`, `leaguedashptteamdefend`, hustle and clutch dashboards, `boxscoremiscv3` with
foulsDrawn/pointsPaint), DARKO's defensive component, and an adversarial Gemini pass. Verdicts below are tagged
**[free, backfillable]**, **[free, live only]**, **[paid]**, **[no evidence]**.

## P3.1 New factor family: MATCHUP (player-level, not position-level)

**M1 `primary_defender_quality`** — Mech R. The minutes-weighted quality of the defenders expected to guard the player
tonight. Sub-tiers: expected primary defender's defended-FG% delta (`leaguedashptdefend`), his matchup-specific allowed
points/possession vs this player or vs the player's archetype (`leagueseasonmatchups`: MATCHUP_MIN, PARTIAL_POSS,
PLAYER_PTS, MATCHUP_FGA/FG3A/FTA, SFL), DARKO defensive DPM; the defender's status (OUT → the assignment shifts to the next
man). Dir: elite primary defender → Less on points/FGA/3PM for the matched scorer (−2…−5 pp at mid/high anchors,
published range; measure); defender OUT → More. Var: strongest on STAR anchors (stars draw the best defender). Trap:
switching schemes dilute the assignment; cross-matching. Source: **[free, backfillable]** — season matchup table is one
bulk call per season; per-game matchups via `boxscorematchupsv3` (~1,230 calls/season) if per-game assignment history is
wanted. Engine: RB medium (residual over the opponent-profile factor).

**M2 `defensive_scheme_proxy`** — Mech R. Opponent coverage tendencies: free proxies = our Synergy play-type defense
(already built: PRBallHandler/Spotup/Isolation defense efficiency and frequency), opponent shot profile allowed by zone
(`leaguedashteamptshot`/shot locations — have shot quality), zone/switch frequency (not free; Second Spectrum). Dir:
pull-up shooter vs drop → More 3PA/points; handler vs blitz → More assists, More turnovers; roll-man vs drop → More
points/rebounds at the rim. **[free proxies now; scheme rates paid]**. Engine: RB medium for 3PM/assists/turnovers.

**M3 `hustle_and_deflection_profile`** — Mech R (defensive props). Opponent's deflections allowed / contested shots /
charges drawn and the player's own deflection rate (hustle dashboard) as steals/blocks predictors beyond TOV%/paint share.
**[free, backfillable by season]**. Engine: RB for stocks legs (the only way to make stocks legs slip-worthy).

**M4 `clutch_usage_profile`** — Mech R (period props). Player's clutch usage/FTA share (`leaguedashplayerclutch`) →
who takes the shots and free throws in close fourth quarters (stars 1.09× points, 1.18× FTA in close Q4s [measured] — this
sub-factor says *which* stars). **[free, backfillable]**. Engine: RB for 4Q/2H points and FTM in projected close games.

## P3.2 New: COACH ROTATION LOGIC (the granular version of P(start) and the state mixture)

**K1 `coach_rotation_profile`** — Mech M. Per coach (not per team — coaching changes reset it): rotation length (players
with ≥10 min in competitive games), starter pull timing in blowouts (we measured team-level starter pull 0.81–1.10 in won
blowouts — attribute to the coach), first-substitution minute in Q1 (from quarter files: Q1 minutes distribution of
starters), closing-lineup stability, foul-trouble hook tendency (needs play-by-play for the exact rule; proxy = starters'
minutes in games with 2+ first-half fouls, from box scores + quarter files). Dir: short-rotation coach → More for starters
in leverage games; quick-pull coach → stronger Less on starters' high anchors under blowout risk. **[free, computable
now]**. Engine: multiplies the blowout gate and the leverage booster; confidence when the coach is new.

## P3.3 New: INJURY-REPORT NUANCE (the Questionable problem)

**N1 `questionable_resolution_rate`** — P(plays | Questionable) by team and by reason class (illness resolves high; soft
tissue lower; "return to competition reconditioning" ~ restriction) — backfillable from the PDF archive (status as
known) × box scores (truth). Some teams are systematically conservative or misleading; this is measurable per team. Dir:
confidence and the P(plays) weight; also the *teammates'* enrichment must be run under both branches (plays / sits) and
blended by P(plays). **[free, backfillable]**. Engine: G/C; branch-blended probabilities for teammates.

**N2 `injury_type_class`** — Illness / soft tissue (hamstring, calf, groin) / joint (ankle, knee) / back / concussion /
reconditioning / rest. Soft-tissue returns carry re-aggravation and minutes-restriction risk; illness returns do not.
Source: the report's reason text. **[free, backfillable]**. Engine: modulates A3 (restriction) and C.

## P3.4 New: PICK'EM MARKET STRUCTURE (board-time, later phase, recorded here for completeness)

**S1** PrizePicks line shading vs sportsbooks (structural gaps, typically on stars and on "popular" Mores); **S2** Underdog
odds-adjusted picks (some legs carry a multiplier ≠ 1 — the multiplier is information: the house's own probability);
**S3** Sleeper multipliers (same); **S4** Goblin/Demon existence as a shading signal (owner: G/D layers later, but the
*existence* of a Demon line tells you where the house expects the standard line to be beaten). **[live only; historical
prop lines paid]**. Engine: these are the strongest single ranking inputs once the board exists.

## P3.5 Double-count discipline (apply as residuals, or not at all)

The baseline already carries: opponent profile (DEF rating, miss rate, OREB%, TOV%, forced TOV%, FTA rate, paint share,
3PA allowed), pace, home, B2B, DvP, with/without teammate (derived backup), P(start), season phase, carryover, blowout
mixture on the derived spread, OT probability.
- **National TV**: mostly a rest-protection rule (A4) — as a *motivation* factor, no evidence; keep only inside A4.
- **Altitude**: captured by home/away and the market total; keep as a sub-tier of D2 only for visitors on B2B; expect ≈0.
- **Referee crew**: the baseline has player foul-drawing and opponent fouls-committed; the crew adds a *tertiary* modulation
  — build the tendency table, but accept it only if the FTM/PF effect is significant on two seasons; expect small.
- **Opponent absences (B4) and matchup (M1)** overlap: M1 supersedes B4 when the matchup table is built; until then B4.
- **Market spread (B1)** vs the baseline's derived spread: apply the *delta*, not the level.
- **Contract year, holidays, post-All-Star, revenge**: no evidence → not in the registry (recorded as retired).

## P3.6 Correlations to test on our three seasons (for the slip engine; published ranges)

Positive: same-player points + assists for high-usage handlers (r ≈ +0.3…+0.5); teammate A assists + teammate B points/3PM
(+0.2…+0.4, higher for 3PM with a pass-first PG); same-player points + rebounds for interior scorers (+0.3…+0.4; we
measured population ρ 0.13 Iron Men → 0.46 fringe — role-dependent); game total up + all Mores (diffuse positive).
Negative: teammate scorers' points (−0.1…−0.3); frontcourt teammates' rebounds (−0.2…−0.4); large spread + all starters'
counting stats (state correlation, strongest of all). All of these are computable from our game logs and lineup data now,
per pair type and role tier, and become the slip engine's copula inputs.

## P3.7 Registry additions (pass 3) and what is retired

Added to `nba_config.factor_registry` (layer=enrichment): `primary_defender_quality`, `defensive_scheme_proxy`,
`hustle_deflection_profile`, `clutch_usage_profile`, `coach_rotation_profile`, `questionable_resolution_rate`,
`injury_type_class`, `pickem_market_structure`. Retired (no evidence): contract year, holiday games, post-All-Star,
revenge/milestone; `national_tv_marquee` and `altitude_venue` demoted to sub-tiers of A4 and D2.

## P3.8 The honest state of the lock after three passes

The factor set is now complete at the level of *mechanisms*: availability and role (A1–A9, N1–N2), game state (B1–B5,
K1), matchup (M1–M4, B4), market (C1–C4, S1–S4), officials/schedule (D1–D2), confidence (E1–E4). What remains is not more
factors but **measurement**: every magnitude in P2 and P3 tagged [published] must be re-measured on our data, and only
those that hold on two seasons (same sign, useful size) become cells. Next: build the two backfills that unlock
measurement of the largest factors — the injury-report PDF archive (statuses as known) and the matchup/hustle/clutch season
tables — then run the pass-3 measurement list.
