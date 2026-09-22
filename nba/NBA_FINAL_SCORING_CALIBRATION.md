# NBA FINAL SCORING ENGINE CALIBRATION

**Scope.** Everything governing the **final** numbers — final hit probability, confidence, score and
edge — i.e. the enrichment layer and the scoring engine that sits on top of the baseline.
The baseline's own calibration is a separate document: `NBA_BASELINE_CALIBRATION.md`.

**Update log**
| Date | What |
|---|---|
| 2026-09-20 | Created. Material from T4/T7/T8 (the two-layer contract), T9 (factor-layer size), T15–T16 (factor gates, blowout, matchup) and the live session (final HP, confidence v3, the enhancing score, as-of calibration parity). |

---

## 0a-T15-SUPERSESSION. 🔴🔴🔴 **READ THIS BEFORE §0a-T15 — A2 WAS CLOSED THE DAY AFTER IT SHIPPED, AND IT IS THE ONLY FACTOR T15 SHIPS** *(T15 pass 3, §T15.4a, 2026-09-22)*

⚠⚠ **RULE 5, BOTH DATES.** **§0a-T15 below is an accurate account of the 2026-09-12/13 round and every
figure in it stands.** ***Its headline does not.*** **A2 teammate redistribution — the single factor
that survived that round's gate — was closed on 2026-09-13, and it does not ship in any form.**

| Date | Verdict | Gate |
|---|---|---|
| **2026-09-12/13** | ✅ **A2 SHIPS as a minutes multiplier, 15 of 19 props** | **MAE on the mean** — minutes MAE, then per-prop MAE, then MAE under window-time information |
| **2026-09-13** 🔴 | ❌ **A2 IS CLOSED — "it does not ship in any of four forms"** *(COMPASS fact 91)* | **LOG-LOSS AT THE LEG LEVEL against the board anchor** |

### ✅ `[LIVE-AUDIT]` **VERIFIED IN FULL — every figure reproduces from `nba_score.factor_gate_results`** *(`SELECT`, 2026-09-22; the table holds **104 rows · 19 models · 45 slices · season `2025-26` only**)*

| Slice | n | **anchor** | `shrunk_novelty_A2` | `novelty_A2` | `flat_A2` |
|---|---|---|---|---|---|
| `all` | 15,024 | **0.7231** | 0.7540 *(−0.0308)* | 0.7592 *(−0.0361)* | **0.9034 *(−0.1803)*** |
| `fires` | 13,319 | **0.7206** | 0.7546 *(−0.0339)* | 0.7605 *(−0.0398)* | **0.9231 *(−0.2025)*** |
| **`high_novelty`** | 866 | **0.7436** | **0.7946 *(−0.0511)*** | 0.8112 *(−0.0676)* | 0.8353 *(−0.0917)* |
| `low_novelty` | 4,695 | **0.7147** | 0.7273 *(−0.0125)* | 0.7287 *(−0.0139)* | 0.9056 *(−0.1909)* |

🔑🔑 **THE DECISIVE FINDING IS THE SLICE, NOT THE TOTAL** — *fact 91's own words:* ***"the HIGH-NOVELTY
slice — the one place the mechanism predicted A2 SHOULD work, since a brand-new absence is information
the baseline CANNOT have — is where it does WORST (−0.051 vs −0.013 on low novelty). That is the
OPPOSITE of the hypothesis."*** **The mechanism's explanation**: *"a star's first game out is exactly
when a coach IMPROVISES, and the baseline's conservative projection handles that uncertainty better
than a confident multiplier. **Being more aggressive when the situation is least predictable is
backwards.**"*

### 🔑🔑 WHY THE TWO VERDICTS DISAGREE — **and it is the corpus's own rule that explains it**

*COMPASS fact 90, **"FOUR RULES FOR EVERY FUTURE FACTOR (earned the hard way this session)"** —
⚠ **1 of the thirty and ZERO of the twelve before this entry**, and **rule 2 is the one that closed A2**:*

| # | The rule | |
|---|---|---|
| **1** | **A null is only as strong as the feature that produced it** | *a crude defender metric produced false nulls that a proper two-way ridge overturned — which is why **COMPASS fact 85 says the M1/B4 rejections were WRONG*** |
| **2** 🔴🔴 | **MAE ON THE MEAN IS THE WRONG METRIC** — *the product is **P(stat > line)**, and a factor can **reshape the distribution without moving the mean**, so **grade at the LEG LEVEL on real board lines**.* | 🔑 ***Every verdict in §0a-T15 was decided on MAE. This rule is why A2's MAE win did not survive a leg-level gate — and, in the other direction, why B4's and M1's MAE nulls were not safe either.*** |
| **3** | **Never duplicate a baseline internal** | *a hand-built blowout shrink duplicated the recipe's `P(blowout\|spread)` mixture, and a rolling-mean funnel duplicated `proj_min` — **both made results worse*** |
| **4** | **Always compare against the system's OWN BEST COMPONENT, never a strawman built for the test** | *the `anchor` column above is that comparison made concrete* |

⚠⚠ **SO THE 88% WINDOW-KNOWLEDGE RESULT IN §0a-T15 §1 IS NOT WRONG AND IS NOT A REASON TO SHIP.** It
measures how much of A2's **minutes-MAE** value survives at window time. **Rule 2 says minutes MAE was
never the product.** 🔑 **Both facts hold together: A2 predicts minutes well and prices legs worse
than the anchor.** *That is the cleanest example in the corpus of §T14.3a's family — **a factor
measured on the wrong layer.***

### ⚠ THREE THINGS THIS SWEEP RECORDS AS QUALIFICATIONS, NOT AS DOUBTS

| | |
|---|---|
| **(a)** | **Fact 91 names FOUR forms tested** *(flat on the mean · component-level · novelty-weighted · magnitude-refit against the baseline's minutes residual)*; **`factor_gate_results` holds THREE** — `flat_A2`, `novelty_A2`, `shrunk_novelty_A2`, plus `anchor`. ⚠ **One of the four is NOT persisted**, so *"evidence… queryable"* is true of three forms. **NOT RECORDED**: which one is missing. |
| **(b)** | **The table carries season `2025-26` ONLY** *(`min` = `max`)*. ⚠ **A factor was closed on ONE season, while a PROP needs TWO to certify** *(the rule that rejected oreb twice, §0y in `NBA_BASELINE_CALIBRATION.md`)*. **Recorded as an asymmetry between the factor gate and the prop gate — not as a claim that the verdict is wrong.** |
| **(c)** | **`flat_A2` loses by 0.18–0.20 log-loss — an order of magnitude worse than the shrunk form.** ⚠ T15 shipped a **component-level** multiplier *(it adjusts `proj_min`)*, which is **not** `flat_A2`, so the shipped form's own leg-level number is **NOT RECORDED** unless it is the missing fourth. *Stated as an open identification, not an inference.* |

🔑 **AND THE DURABLE POINT FOR THE ENGINE**: **`nba_score.factor_gate_results` (`season, slice, model, n,
log_loss, brier, gain_vs_anchor`) is where factor verdicts now live** — *"queryable, **no longer parsed
from CI logs**"* — **the same move as the calibration checker** *(`NBA_BASELINE_CALIBRATION.md` §0y-1)*:
**a verdict that outlives the run that produced it.** ⚠ **Twice in two days, the fix for an unreadable
result was to stop depending on the log.**

---

## 0a-T15. 🔑🔑 **THE FIRST FACTOR RESULTS IN THE CORPUS THAT STATE EACH LAYER'S INFORMATION SET — and the CERTIFIED / PENALIZED / EXCLUDED policy** *(T15 pass 1, §T15.2a–c, written 2026-09-22 from the 2026-09-12/13 transcript)*

### 🔑🔑 1 · THE QUESTION §T14.3a ASKED, ANSWERED HERE FOR THE FIRST TIME

*§T14.3a's rule: **"any factor test using ONE report for BOTH layers measures DOUBLE-COUNTING, not
value."** Across the swept corpus **no factor result states which report each layer read.** T15 is the
first that does — **because the assistant discovered mid-session that it had been using one.***

> ***"both b4 tests used WHO ACTUALLY PLAYED, derived from box scores. that's POST-GAME TRUTH. at
> 2:30 pm pt the engine won't know that; it will know the day-of injury report and the projected
> lineups… so what i actually tested is b4 with PERFECT ABSENCE KNOWLEDGE."***

⚠ **And the consequence it drew is the one that matters, because it runs the other way:**

> ***"the inverse is the important consequence… **a2 was ALSO fitted and validated on perfect
> knowledge**. its +0.347 mae gain on pra assumes we know exactly who's out… **a2's live value will
> be lower than its measured value, and by an amount we haven't quantified.**"***

✅ **IT WAS THEN QUANTIFIED.** The allocator's absence input was rebuilt from the **2:30 pm report
as-of**, with Questionable weighted by the measured `p_plays` rather than treated as present or
absent, and the same held-out gate re-run — **out of sample on 13,989 player-games**:

| Information set | Minutes MAE |
|---|---|
| **A** — no absence knowledge | **6.210** |
| **C** — WINDOW knowledge *(2:30 pm report, N1-weighted)* | **4.580** |
| **B** — PERFECT knowledge *(post-game truth)* | **4.368** |

🔑 **Window knowledge captures 88% of the value of perfect knowledge.** *The gap between knowing
nothing and knowing everything is **1.84 minutes**; the 2:30 pm report delivers **1.63** of it.* ✅
**The cost of uncertainty — questionables resolving either way, late scratches — is 0.21 minutes.**

⚠ **AND THE NULL SURVIVES THE SAME TEST A PRIORI, which is why B4 did not need re-running:** *"if the
factor carries **no signal even with perfect information**, it cannot carry signal with the noisier
version available at 2:30. **A null under ideal conditions is a valid null under degraded ones.**"*
🔑 **The asymmetry is the durable rule: a POSITIVE result fitted on post-game truth is an UPPER BOUND
and must be re-measured at window time; a NULL fitted on post-game truth is already conservative.**

### ✅ 1b · **A2's FITTED ALLOCATOR, WRITTEN OUT** *(T15 pass 2, §T15.3b — migration item: 4 of the thirty, **0 of the twelve** before this)*

**`allocator_share = exp( 0.2214 + 0.3953·log(as-of min) + 0.5160·log(recent-5) + 0.0043·log1p(games) )`**,
**normalised × team minutes** — `nba/fit_minutes_allocator.py`.

🔑🔑 **THE FACTOR IS THE DIFFERENCE OF TWO ALLOCATIONS** — over **{played + ruled out}** vs **{played}**
— *which is what makes it conserving by construction rather than by tuning.*
`nba/build_redistribution_factors.py` → **`nba_score.redistribution_factors`, 51,806 rows,
conservation 1.0015.** ⚠ **Cold start = a bench prior of 8 minutes, NEVER dropped** *(dropping a
cold-start player would break conservation — the gate the five retracted panels could not clear)*.
**Two-season `min_mult` 1.3228 / 1.3147.** **Skips `stocks` / `blocks` / `steals` / `fouls`** — the
four of nineteen props that do not improve.

⚠ *The **0.5160** weight on recent-5 against **0.3953** on as-of minutes is why the A5 rejection
follows structurally: **recent-5 already dominates the allocation**, so a binary starter flag has
nothing left to add (§3 below).*

### ⚠⚠ 2 · THE POPULATION RULE T15 STATES IN ITS OWN WORDS — **the same class as §T14.3a**

🔴🔴 **AND THE CORPUS NOW CARRIES *THREE* A2 MINUTE-MAE TRIPLETS ON THREE DIFFERENT POPULATIONS**
*(T15 pass 2 cross-check, §T15.3b — none of the three is wrong, and none is comparable to the others)*:

| Triplet | Population | Contrast being drawn |
|---|---|---|
| **4.609** allocator vs **4.875** recent-5 | the allocator's own accuracy test | **is the allocator better than the naive minutes estimate?** |
| **4.641** with outs · **6.186** ignoring outs · **5.029** as-of mean | **held out on ABSENCE GAMES** | 🔑 *"allocating while IGNORING absences is WORSE than doing nothing"* |
| **6.210** none · **4.580** window · **4.368** perfect | **ALL 13,989 player-games** | **how much of perfect knowledge survives at the window (88%)** |

⚠⚠ **A reader who takes any two of these as the same measurement will conclude the factor got worse
or better between runs. It did neither — the POPULATION changed.** 🔑 **This is the population rule
applied to the corpus's own figures, and it is why every A2 number in these documents is now written
with its population attached.**

*A2's per-prop gain appears in this transcript at **three different magnitudes**, and all three are
correct:* **pra +0.347 · points +0.097** *(the original per-prop gate)* **vs points +0.054**
*(the window-time re-run)*. **The reason is the POPULATION, not the method:**

> ***"this test scores ALL player-games (13,989), whereas the earlier per-prop test scored ONLY GAMES
> WITH ABSENCES. diluted across every game including those with no absences at all, the average gain
> necessarily shrinks. **both numbers are correct for their population, and the operationally
> relevant one is the absence-game figure, since that's when the factor fires.**"***

⚠ **So a factor's quoted value is meaningless without its population, and the two populations differ
by roughly 6×.** *Recorded because the corpus quotes the +0.347 figure without its population.*

### ✅ 3 · THE FACTOR VERDICT TABLE AS T15 LEAVES IT *(the 09-12/13 round — see §T15.2h on the date)*

| Factor | Verdict in T15 | Population / information set | Figures |
|---|---|---|---|
| **A2** teammate redistribution *(minutes multiplier)* | ✅ **SHIPPED** | allocator fitted on roster state; **validated three ways** | conservation **0.9930**; allocator MAE **4.609** vs recent-5 **4.875**; OOS `p0` 4.830 / `p1` 4.733 / `p2` 4.753; **15 of 19 props improve**, gains scaling with minutes-dominance — pra **+0.347**, pts+reb +0.281, pts+ast +0.253, points +0.097 |
| **A2 rate response** | ❌ **REJECTED** | held-out | *"double-counts what minutes already carry"* |
| **N1** status resolution | ✅ **MEASURED** *(not a ship/reject — a measured input A2 now consumes)* | full report population, **both seasons** | see §4 below |
| **B4** opponent availability **v1** *(vacated minutes)* | ❌ **REJECTED** | **post-game truth**, 19 props | **0 of 19**; the earlier **+6.5% opponent signal was BLOWOUT CONTAMINATION** |
| **B4 v2** *(expected defender-quality change)* | ❌ **REJECTED** *(after the test itself was found broken — §T15.2f)* | **post-game truth**, **4,526** test rows, 11 props | **0 of 11**; betas collapsed to **−0.056…+0.029** once correct, *versus the spurious **+0.14…+0.22** from the broken version* |
| **B4 v3** RIM PROTECTION | ⚠⚠ **NOT TESTED IN T15 — COMMISSIONED BY IT** | — | see §5 below |
| **M1** defender-quality LEVEL | ⚠⚠ **NOT TESTED IN T15** | — | appears only as a **pending build item** (*"M1 wiring"*, *"M1 defender-quality integration into the harness"*). **Verified 2026-09-22**: `0 of 7`, `5,116`, `12,738`, `63.8%`, `0 of 5 props` — **zero hits in the transcript.** *COMPASS fact 84's M1 rejection and fact 86's v3 closure therefore belong to a LATER transcript, which `NBA_GLOSSARY.md` already attributes to **T16**.* |
| **A5** projected lineups | ❌ **REJECTED — REDUNDANT** | held-out, per prop | **negative on every prop**: points **−0.032**, rebounds −0.008, assists −0.008, pra **−0.035** |

🔑🔑 **THE A5 REJECTION DISSOLVES A LEAK RISK RATHER THAN MITIGATING IT** — *and this is the part the
parity document needs:* **A5 was leak risk #1** *(box-score `starter_status` is post-tip truth)*.
The mechanism of the null is structural, not a failure of the proxy:

> ***"the allocator already uses RECENT-5 MINUTES, which encodes starting status almost completely. a
> player who starts plays 30 minutes; the recent-minutes signal captures that CONTINUOUSLY, while a
> binary starter flag THROWS AWAY THE MAGNITUDE. adding it back as a coarse multiplier LOSES
> information… we don't need projected lineups at all, so there's nothing to leak. **the risk
> disappears rather than needing mitigation.**"***

⚠ *Also recorded from the research step: **the NBA does not require lineups before tipoff** — they
are announced **~30 minutes out**, i.e. AFTER the 2:30 pm window — and **projected lineups are
human-curated subscription products** set 24–30 hours ahead. **So at the window A5 must be derived
in-house or not at all**, which is what made the redundancy finding decisive rather than incidental.*

### ✅ 4 · N1 — **THE LEAGUE'S OWN PROBABILITY TABLE IS WRONG ON THREE OF FIVE STATUSES**

*Context from the research step: **the NBA overhauled injury reporting in December 2025**, fixing
league-defined probabilities and adding an explicit **AVAILABLE** status — **a mid-season format
change inside the 2025-26 data.** The assistant's rule: **"league-defined numbers are what teams are
TOLD to mean; what matters is what actually happens"** — so it measured them on the archive.*

| Status | n | **Measured `p_plays`** | League-defined | |
|---|---|---|---|---|
| Out | 10,150 | **0.001** | 0.00 | ✅ |
| Questionable | 1,456 | **0.503** | 0.50 | ✅ **a true coin flip** |
| Available | 1,220 | **0.828** | 1.00 | ❌ |
| Probable | 582 | **0.923** | 0.75 | ❌ |
| **Doubtful** | 312 | **0.006** | 0.25 | ❌🔴 **DOUBTFUL MEANS OUT** |

🔴 ***"treating doubtful as a 25% chance would be a SERIOUS ERROR; our a2 build already grouped it
with out, which this validates."*** ✅ **And after the selection-filter fix of §T15.2f, the two
statuses that matter split into two different factors wearing one label:**

| Status | **Rotation ≥15 min** | **Fringe <15 min** |
|---|---|---|
| Questionable | **0.552** *(n=1,074)* | **0.312** *(n=234)* |
| Available | **0.956** *(n=824)* | 0.555 *(n=236)* |
| Probable | **0.961** *(n=457)* | — |

⚠ **The 0.828 anomaly was deep-bench DNPs, not late scratches** — *"for the players the allocator
actually cares about, available means 0.956 and probable 0.961 — effectively playing."* 🔑 **And the
league's nominal 0.50 UNDERSTATES the population that matters**: questionable rotation players play
**55.2%**. *Further modulated by reason class — **G-League two-way 0.271**, back 0.488, soft tissue
0.539 — and by team — **Atlanta 0.326 → Golden State 0.676**.* 🔑 ***"that's a real, fittable
sub-factor, and it's exactly the cell structure the lock specified."***

### 🔑🔑 5 · B4 IS LEFT **CLOSED-WITH-A-SUBCASE**, AND T15 SPECIFIES THE TEST T16 RUNS

*⚠ 0 of the twelve and 0 of the thirty, probed 2026-09-22.* **B4 was not abandoned — the transcript
names the remaining formulation, its population, its gate, and says it must be run first:**

> ***"one piece is still genuinely open on the opponent side, and it's a different factor: b4's
> RIM-PROTECTION SUB-CASE — the blocks-against and interior-scoring channel, where losing a specific
> rim protector plausibly does move a driver's efficiency… it's testable the same way: fit the
> residual on absences of HIGH-BLOCK-RATE OPPONENTS ONLY, gate it on held-out mae. **if you want b4
> fully closed rather than closed-with-a-subcase, that's the one test remaining, and i'd run it
> before declaring the opponent side done.**"***

✅ **COMPASS fact 86 records exactly that test closing** *(v3 rim protection, 0 of 5 props, 12,738
test rows, 63.8% of games have a rim protector out)* — **so the T16 result answers a question T15
wrote, with the population T15 specified.** *Recorded because the corpus carries the answer without
the commission, which makes the v3 test look like an afterthought rather than a planned closure.*

⚠ **AND WHY THE NULL IS MECHANICALLY SENSIBLE RATHER THAN A GAP** — *the transcript's own reasoning,
which is what makes it a finding instead of a failure to find one:* **opponent defence is ALREADY IN
THE BASELINE** *(opponent defensive profile, DvP by position, pace, and the day-before
opponent-availability version)*, so **B4 was only ever the same-day RESIDUAL on top of it**. A
player's exposure **spreads across several defenders**, so losing one shifts expected defender quality
only slightly, and **the replacement is usually of similar quality — NBA rotations are compressed at
the top**. M1's genuinely large effect *(−5.5% to +6.7% across quintiles, 12 pp toughest-vs-easiest)*
is about **WHICH TEAM you face** — a baseline factor from the full opponent profile, **not a same-day
delta**. 🔑 **And opponent absences ARE priced, on the side where they demonstrably matter**: *"a2
runs on BOTH rosters… so opponent absences are priced on the absent team's own production, **not
smeared onto the other team's rate**."*

### 🔑🔑 6 · **CERTIFIED / PENALIZED / EXCLUDED — the three-tier policy the system did not have**

⚠⚠ **0 of the twelve AND 0 of the thirty** *(probed 2026-09-22, `grep -Eoih ".{0,80}(somewhere to
land|besides .in. or .out.|general policy it didn).{0,80}"`, both trees)* — **and it is a governing
rule, not a note.** *It exists because the owner refused a rejection **twice**:*

| Owner turn | The instruction |
|---|---|
| seg 827 | ***"NO, do not just reject — FIX IT: granulated, break in tier, figure it out, research, debug, test, simulate. WE CAN'T JUST BE DROPPING IMPORTANT PIECES."*** |
| seg 949 | *"yes, make the be**tt**er decision, **drop it OR PENALIZE IT ACCORDINGLY**"* |
| seg 962 | *"ok, find the **proper penalty level, FAIR TO IT**, and keep going"* |

✅ **The answer, in the assistant's words:** *"that also gives the system a general policy it didn't
have — **certified / penalized / excluded** — so future props have somewhere to land besides 'in' or
'out'. **that's probably worth more than the oreb fix itself.**"*

🔑🔑 **AND THE PENALTY IS *DERIVED*, NOT DECLARED — the rule that makes the tier usable.** *The
reliability scorer measures every prop on one ruler — **ECE, worst band, Brier, lift over a base-rate
model, both seasons** — and the penalty is **the amount the prop's volume-weighted ECE trails the
certified median (0.20 pp)**.*

⚠⚠ **RECORD BOTH DECISIONS (rule 5) — the assistant OVERTURNED ITS OWN PENALTY WITHIN MINUTES:**

| | Penalty written | Basis | Status |
|---|---|---|---|
| **First** | **one confidence tier down · barred from the top slip tier · at most ONE oreb leg per slip · skipped when the edge doesn't clear threshold** | the **worst-band** number (5.41 pp) | ❌ **RETRACTED — *"an OVERREACTION to a worst-band number"*** |
| **Second** ✅ | **−0.1 pp of stated confidence, ELIGIBLE EVERYWHERE, NO CAP**, with a flag only on legs landing in the one thin band | **volume-weighted ECE 0.28 vs certified median 0.20** | ✅ **the standing rule** |

🔑 *Why the first was wrong:* **that 5.41 pp miss lives in a single band of 744 legs out of 556,277**
— *"almost every oreb leg sits in bands that calibrate as well as any certified prop."* 🔑 **And the
scorer caught the over-correction within minutes of it being made**, which is the argument for the
tool: *"penalties are **derived rather than declared**, and any future prop lands on the same ruler."*

### ✅ 7 · THE ALL-PROPS RELIABILITY AUDIT — **ten props, a third of the table, had NO verdict at all**

⚠ **Before this audit, 10 of 30 props — roughly 5.4m rows of baseline probabilities — sat in the
history table with no reliability verdict**, because `score_prop_reliability.py` could not derive
their outcome from a box-score column: **7 period props** *(points q1/h1/h2/q4/q4_otx, rebounds q1,
assists q1, threes_made q1 — needing quarter-level data)*, **fantasy_score** *(needs the
1/1.2/1.5/3/3/−1 formula)*, **double_double** *(needs yes/no logic)*, and **stocks** *(in the combo
map, dropped by the column check)*. 🔑 **The owner pushed for the extension; it caught two props that
would have shipped as certified:**

| Prop | n | ECE | Worst band | Brier | Lift | Verdict |
|---|---|---|---|---|---|---|
| **fantasy_score** | **994,879** | 0.41 | **2.92** | 0.2022 | **5.2%** | 🔴 **−0.3 pp** |
| **double_double** | 47,912 | 0.57 | **7.32** *(worst in the system)* | 0.0592 | 17.7% | 🔴 **−0.4 pp** |
| oreb | 556,277 | 0.28 | 5.41 | 0.0501 | 25.8% | **−0.1 pp** |
| assists_q1 | 443,513 | 0.22 | 3.22 | 0.0360 | 26.1% | **−0.0 pp** *(rounding-level)* |
| stocks | 564,973 | 0.15 | 0.94 | 0.0536 | 25.0% | ✅ certified |
| threes_made_q1 | 432,907 | 0.17 | 2.03 | **0.0232 — best Brier in the system** | **27.3% — highest lift** | ✅ certified |

🔴 ***"fantasy_score is the one that matters commercially — nearly a million rows, our HIGHEST-VOLUME
prop, and it was NEVER VERIFIED."*** *Why it is weak is mechanical: it is a weighted sum of six noisy
counts, so **the errors compound while the predictable role signal gets diluted**.*

✅ **Final state: 27 certified · 3 penalized (fantasy_score −0.3, double_double −0.4, oreb −0.1) · 0
unverified**, where ten had no verdict that morning. *Quoted from the transcript; **not** re-taken
live — the audit's own summary calls the absence of new problems "the audit's real value".*

### 🔑🔑 8 · THE STRATEGIC FINDING FOR THE SLIP ENGINE — **the board's deepest markets are its least exploitable**

**Lift over a base-rate model** — *"the low-count props carry two to three times more predictive edge
than the high-volume combos, because a combo averages three noisy counts together while a single stat
is genuinely forecastable from role"*:

| High edge | Lift | | Low edge | Lift |
|---|---|---|---|---|
| threes_made_q1 | **27.3%** | | pts+ast | 9.2% |
| steals | 26.9% | | **pra** | **7.5%** |
| assists_q1 | 26.1% | | **fantasy_score** | **5.2%** |
| oreb | 25.8% | | | |
| stocks | 25.0% | | | |

🔑 ***"weighting slips toward VOLUME would be weighting toward the LEAST EDGE."*** ⚠ **This is a slip-
construction constraint, and it points the opposite way from board depth.**

---

## 0b. THE FOUNDING SCOPE DECISION — reuse vs rebuild
*Source: T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §4. Recorded 2026-09-20.*

**REUSE DIRECTLY (sport-agnostic):**
- The entire **infrastructure stack**
- The entire **statistical research standard** (all items in the lessons document)
- **The ParlayAPI integration pattern and account**
- **The PrizePicks board scraper architecture** — *"adjust sport filter"*
- **The Gemini adversarial-review usage pattern**
- **The differential/incremental write pattern, chunking pattern, deploy pipeline**

**MUST BE REBUILT SPORT-SPECIFICALLY:**
- **All prop taxonomy and canonical prop-key definitions**
- **All enrichment factors** — *"many removed, several new ones needed"*
- **The scoring engine's actual formula/model** — *"**probability estimation logic is sport-specific
  even if the PIPELINE STRUCTURE around it is reusable**"*
- **The full multiplier/pricing study** — *"MLB's specific numbers do not transfer; only the
  platform-level **mechanics** transfer as **informed priors, not answers**"*

### How the split held
| Item | Outcome |
|---|---|
| Infrastructure | ✅ reused — Workers, deploy pipeline, Hyperdrive, the bridge, `curl_cffi` (read out of MLB's scraper) |
| Research standard | ✅ reused — **all 27 lessons** plus Parts B–F. ⚠ *Corrected 2026-09-20 (pass 30): this row said **26**. **VERIFIED 27** by direct grep of `NBA_LESSONS_LEARNED_FROM_MLB.md` (`grep -c "^### [0-9]\+\."` → 27) and by grep of T1. **Lesson #27 was undocumented** — now at §14.* |
| **ParlayAPI** | ⚠ **reused then SUPERSEDED** — own scrapers beat it (~25% of rungs dropped) |
| PrizePicks scraper architecture | ✅ reused — but **a separate NBA producer** (`league_id=7`, own env namespace, own output), not a sport-filter swap |
| Gemini adversarial pattern | ✅ reused, **without the pre-stated falsification bar** (§14 #4) |
| Differential/chunking/deploy | ✅ reused |
| Prop taxonomy | ✅ rebuilt — 28 props |
| Enrichment factors | ✅ rebuilt — 25 baseline / 4 enrichment, **and ten later closed** |
| Scoring formula | ✅ rebuilt — *"the pipeline structure is reusable, the probability logic is not"* is exactly what happened: **`MAX_TIERS`/`MIN_PER_TIER`/`TIER_BLEND_K` ported verbatim while the recency blend was rejected** |
| Multiplier study | ⏸ **not started** — correctly gated on live board + graded outcomes |

**The one line that predicted the whole port**: *"probability estimation logic is sport-specific even
if the **pipeline structure** around it is reusable."*

---

## 0c. THE TWO-LAYER ARCHITECTURE — never collapsed into one
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

Framed as *"a genuinely rigorous, externally-benchmarked research effort worth adopting **wholesale,
not just its conclusions**"* — cross-validated against multiple independent published sources,
benchmarked against real industry-leading systems, and empirically validated against historical data
**before locking the enrichment design.**
> *"**The METHODOLOGY here is at least as valuable as any specific finding.**"*

### The architecture
| Layer | What it is |
|---|---|
| **Layer 1 — the actual scoring mechanism** | *"**rule-based, deterministic, FULLY INTERPRETABLE and DIRECTLY STEERABLE — NOT a black-box model**"* |
| **Layer 2 — a separate calibration loop** | *"running on **its own cadence**, that **compares what each real PROFILE CELL predicted against real observed outcomes** and proposes **SMALL, *SIZED* ADJUSTMENTS to that cell's parameters** — **NEVER a wholesale replacement prediction**"* |

**Three properties are load-bearing**: separate cadences, adjustments **sized** rather than
open-ended, and **never a replacement** — the calibration loop tunes the rule, it does not override it.

**✅ NBA implements exactly this.** Layer 1 is `classification_ladder_v12.py` (interpretable tiers,
explicit constants, every cell traceable). Layer 2 is `ladder_calibration_asof` — a **separate weekly
refit** proposing a **`log_odds_shift` per cell**, applied as `cal_shift`, **with `p_raw` retained** so
the rule's own output is never lost.

### ⚠ GBDT/ML — a calibration CROSS-CHECK, never the output
> *"**Gradient-boosted/ML models are a real, valuable input TO THE CALIBRATION LOOP SPECIFICALLY, NOT
> a replacement for the interpretable scoring layer** — MLB **EXPLICITLY TESTED AND REJECTED using
> GBDT AS THE FINAL OUTPUT**, because **it produces a BLACK-BOX RATE rather than an interpretable,
> directly-tunable rule**, and because **GBDT has DOCUMENTED, REAL, PEER-REVIEWED RARE-EVENT BIAS.**
> **Build NBA's scoring system the same way: an INTERPRETABLE RULE/PROFILE LAYER as the actual
> mechanism, with ANY ML MODEL RELEGATED TO A CALIBRATION CROSS-CHECK SIGNAL UNDERNEATH IT.**"*

**This settles the T4 GBDT decision with a second, independent reason.** T4 rejected GBDT/neural nets
on **resource and explainability** grounds (*"needs far more data and compute… sacrifices
explainability"*). **T1's blueprint adds a technical one: peer-reviewed RARE-EVENT BIAS** — which
matters acutely here, because **the goblin/demon tails ARE the rare events**, and they were
independently nominated as where the edge lives.

**And it defines the door that remains open**: GBDT is not banned — it is **relegated to a calibration
cross-check**. *(MLB has `gbdt_training_requests`; NBA has no equivalent, and the calibration loop
uses Platt rather than any ML signal.)*

---

## 0d. PER-FACTOR GRIDS, AND HOW TO COMBINE THEM
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

### Each factor gets its own independently-scoped grid
> *"**Give each factor ITS OWN INDEPENDENTLY-SCOPED GRID, with DEPTH EARNED BY REAL EVIDENCE, not
> applied uniformly.**
> MLB **confirmed MATHEMATICALLY that a FULL JOINT CROSS-PRODUCT across all factors would create TENS
> OF THOUSANDS OF CELLS against a training set of roughly 100,000 ROWS** — **meaning MOST CELLS WOULD
> NEVER SEE ENOUGH REAL DATA.**
> **Some factors genuinely need real TIERS, DIRECTION and GRADUATED BANDS; others are better served by
> a PURE CONTINUOUS FORMULA; others are closer to a BINARY GATE. DECIDE THIS PER FACTOR, FROM REAL
> EVIDENCE, not by applying the same structure to every factor FOR CONSISTENCY'S SAKE.**"*

**✅ This is exactly the T8 factor-tier table** — rest/B2B as **tiered bands**, altitude as
**continuous gated >1500 m**, DvP as **quantile bands**, pace as **continuous log**, scheme as
**binary gates**, blowout/OT/foul as **minutes inputs**. **Each form earned by its own evidence**, with
cutpoints *"data-driven (CART), validated out-of-sample, fixed for a season — never arbitrary."*

**The cell-count arithmetic is worth holding against NBA's own numbers**: MLB found tens of thousands
of cells against **~100,000 training rows**. **NBA has 79,358 player-games** — the same order — and a
cell key of **`factor × prop × tier × role_tier × direction × variation_band`**.
**`factor_relevance` (460 rows) is what prevents the cross-product**: it gates which factors are
candidates per prop *before* any tier logic. **35 fitted cells against 460 relevance rows is the
sparsity this warning predicts**, and it is being handled by gating rather than by fitting everything.

### Combine additively in LOG-RATE SPACE by default
> *"**Combine multiple applicable factors ADDITIVELY IN LOG-RATE SPACE (standard regression practice)
> as the DEFAULT combination method** — **this avoids NAIVE MULTIPLICATIVE STACKING silently
> double-counting correlated factors.**
> **Reserve the RSS (root-sum-squares) approach SPECIFICALLY for factor clusters KNOWN TO BE
> GENUINELY, STRONGLY CORRELATED with the same underlying signal** — **the two tech[niques are for
> different situations]**."*

**✅ NBA combines in log-rate space** — *"every coefficient is fit on train **in log-rate space**, so
unneeded factors go to zero on their own"* — and the enrichment record stores **`log_rate_adjustment`**
as its primary field, with `rate_multiplier` as the derived view.

**⚠ The RSS half is still absent** (§7k pattern 3), and this passage clarifies its scope: **RSS is not
the general combiner — additive log-rate is.** RSS applies **only to known-correlated clusters**, which
is why `factor_registry`'s **macro-cluster** column exists.

**So the design is: additive log-rate everywhere, RSS within a declared cluster.** NBA has the first
and the cluster labels, but not the second.

---

## 0e. THE ONE-TIME ARCHITECTURAL OPPORTUNITY — and how NBA used it
*Source: T1, blueprint §4e — "a real, avoidable complexity MLB is currently living with."
Recorded 2026-09-20.*

### The problem MLB lives with
> *"MLB's config-table-driven, two-layer factor design **was NOT built all at once — it was rolled out
> FACTOR BY FACTOR on top of an ALREADY-LIVE, HARDCODED JavaScript enrichment system**, and **as of
> MLB's most recent documentation, SOME factors have MIGRATED to the new config-cell system (getting
> the calibration loop and empirical validation infrastructure 'FOR FREE') while OTHER factors STILL
> LIVE ENTIRELY AS HARDCODED LOGIC in the same file, UN-MIGRATED.**
> **The real, practical cost: for ANY GIVEN FACTOR, a session doing enrichment work FIRST HAS TO CHECK
> *WHICH PARADIGM THAT SPECIFIC FACTOR CURRENTLY FOLLOWS* before doing anything else, since the two
> require GENUINELY DIFFERENT investigation and modification approaches.**"*

### The instruction
> *"**NBA has a real, ONE-TIME OPPORTUNITY MLB NO LONGER HAS: since there's NO EXISTING HARDCODED
> SYSTEM TO MIGRATE AWAY FROM, BUILD THE CONFIG-TABLE-DRIVEN, TWO-LAYER ARCHITECTURE FROM DAY ONE, FOR
> EVERY FACTOR FROM THE START** — **avoid EVER being in the position of maintaining TWO DIFFERENT
> FACTOR PARADIGMS SIDE BY SIDE in the same codebase.**"*

### ✅ NBA took the opportunity — for factors
**Every enrichment factor lives in the config layer from the start**: `factor_registry` (67),
`factor_relevance` (460), `factor_profile_cells` (35), with `classification_config` holding the
decisions. **There is no hardcoded-JS enrichment system, and no two-paradigm split for factors.**

### ⚠ But a two-paradigm split emerged elsewhere — in the RECIPE constants
**The warning is about maintaining two ways of doing the same thing. NBA avoided it for factors and
reproduced it for constants:**
| Paradigm | Holds |
|---|---|
| **Config tables** | `stat_decay_config` (13 per-stat), `role_tiers` (6), `factor_profile_cells`, `classification_config` (66), `minutes_mixture` |
| **Python literals in the recipes** | `MAX_TIERS`, `MIN_PER_TIER`, `TIER_BLEND_K`, `SHIFT_LAMBDA`, `BLOWOUT_MARGIN`, `COMPETITIVE_MARGIN`, `LADDER_DEPTH`, the Wilson threshold |

**And the practical cost the blueprint describes has already been paid once**: `minutes_mixture` in
the config specifies `dud_lognormal`, `tiered_inelastic` renormalisation and a **per-team**
`E[min|blowout]` — **none of which the recipe implements.** **To know what the system actually does, a
session must check which paradigm holds that specific value** — which is exactly the cost named.

**Note the asymmetry in severity**: `role_tiers` in the DB and `ROLE_TIERS` in the code **were verified
to agree**; `minutes_mixture` and the code **do not**. **The split is not uniformly harmful — it is
harmful where the two disagree and nothing asserts they should not.**

---

## 0f. THE "PRESET DICTIONARY" PRINCIPLE — precompute once, runtime is a LOOKUP
*Source: T1, blueprint §4g — **"MLB's own original, explicit design intent for its enrichment system,
and it's worth adopting directly for NBA rather than rediscovering."*** Recorded 2026-09-20.

> *"Given the true scale of **factor × variation × player-tier × prop-line × direction combinations is
> ENORMOUS**, the correct approach is **A LARGE, ONE-TIME RESEARCH AND DESIGN EFFORT THAT PRE-BUILDS
> AND LOCKS THE FULL FRAMEWORK IN ADVANCE** — **for EVERY raw factor, ENUMERATE EVERY REAL VARIATION
> IT CAN TAKE, and for EVERY variation, LOCK THE LOGIC SPLIT BY PLAYER TIER, PROP LINE AND
> DIRECTION** — **rather than COMPUTING NOVEL LOGIC PER LEG AT RUNTIME.**
> **Once this full framework is locked, the system's actual per-run job is REDUCED TO
> CLASSIFICATION / LOOKUP: IDENTIFY WHICH PRE-LOCKED CELL APPLIES to a given leg for each relevant
> factor combination — NOT COMPUTE ANYTHING FRESH.**
> **The heavy design and calibration work happens ONCE, UP FRONT; live sc[oring is a lookup].**"*

### ✅ This is the system NBA built — and it explains the shape of everything
**The five dimensions named here are exactly `factor_profile_cells`' key**:
`factor × prop × tier × role_tier × direction × variation_band`. **The "preset dictionary" IS the cell
table.**

**And it explains why the artefacts are the size they are:**
| Artefact | Rows | Role |
|---|---|---|
| `nba_score.baseline_history` | **19.3M** | the pre-built matrix — *"all the possibilities for all the players, for all prop lines, all variations, all directions"* (the owner, T7) |
| `nba_score.final_hp` | **38.7M** | the enriched lookup surface |
| `factor_relevance` | 460 | which cells are even candidates |
| `factor_profile_cells` | 35 | the locked logic per cell |

**The owner's own framing in T7 is this principle in his words** — *"it does **all the possibilities**…
**a FULL MATRIX of anything that later can be available on the app boards to be picked**"* — and
**`baseline_history` at 19.3M rows is that matrix, precomputed.**

### The consequence for runtime
**P3's job is classification and lookup, not computation.** That is why it can run in the light
afternoon window while P2 carries the heavy build overnight — **and it is the same caching argument
the owner made in T4** (*"the baseline is expensive but only changes after a game — it can be
cached"*), arrived at from the opposite direction.

### ⚠ Where NBA deviates — and it is deliberate
**The band cells and Platt shifts are refit weekly**, not locked once. **That is a refinement, not a
violation**: the blueprint's own two-layer design (§0c) specifies Layer 2 as *"a separate calibration
loop, running on its own cadence… proposing small, sized adjustments"* — **so the framework is locked
and the adjustments move.**

**The genuine deviation is `factor_profile_cells` holding only 35 rows against 460 relevance rows.**
The principle says *"for every raw factor, enumerate every real variation… and lock the logic."*
**Most cells were never locked** — they were tested and found to add nothing. **That is the ten-factor
audit outcome, and it means the preset dictionary is mostly empty by evidence rather than by
omission.**

---

## 0z. ⚠⚠ DATA-STATE WARNING — the 2025-26 partition of `final_hp` is one day deep
*Measured by live SQL 2026-09-20 (T1 pass 33). **Read this before trusting any 2025-26 figure in this
document that was computed from `nba_score.final_hp`.***

| season | distinct dates | rows |
|---|---|---|
| 2024-25 | **162** | **19,075,070** |
| **2025-26** | **1** — `2026-01-15` only | **140,130** |

**Documented table size: 38.7M. Live: 19,215,200.** The cause is a confirmed bug —
`nba/build_final_hp.py`'s `FE_DATE` scopes the read but not the `DELETE`, so a slate-scoped write
replaced the whole 2025-26 partition with one slate. Full entry at the top of `NBA_OPEN_ITEMS.md`;
row counts and recoverability in `NBA_DATABASE.md`.

**What this does and does not put in doubt:**
- **✅ The certified baseline result is NOT affected.** `nba_score.baseline_history` is **intact —
  VERIFIED, 163 dates × 30 props for 2025-26** — and the two-season certification
  (`NBA_BASELINE_CALIBRATION.md` §8) is computed from the backtest harness, not from `final_hp`.
- **✅ The 2024-25 season is complete** at 162 dates, so anything validated on the holdout season
  stands.
- **⚠ Anything in this document computed over 2025-26 `final_hp` rows since the loss was computed on
  one day.** That includes any enrichment-layer check, confidence distribution or
  `final_hp`-vs-`baseline_hp` movement statistic read from the table rather than recomputed.
  **Which figures those are is NOT ESTABLISHED** — the entries do not record whether they came from
  the table or from a harness run. **Flagged, not resolved.**
- **✅ Recoverable** by a full-history re-run; nothing needs re-scraping or re-fitting.

---

## 1. THE CHAIN

**⚠ BOARD-SCOPED WAS IN THE ORIGINAL SPEC, not a later decision.** From the handoff memory (T1):
> *"daily-context + market factors (**tiered logic varying by factor type, player, and prop
> line/variation/direction**) to produce **final hit probability, confidence, and score**; **this
> pipeline is BOARD-SCOPED ONLY (does not cover the full universe of variations like the baseline
> pipeline does)**."*

**So the division was specified from day one**: the **baseline** covers the full matrix of every
player × prop × line × side; the **scoring engine** covers only what the apps actually offer.
`nba/score_board_legs.py` implements exactly this.

```
baseline HP  →  availability delta  →  as-of calibration  →  FINAL HP
                                                                 ↓
                                              confidence (measured deductions)
                                                                 ↓
                                        score 0–100  +  edge (separate column)
```

**Output**: `nba_score.final_hp` — **38,686,696 rows**, both seasons, 30 props.
`season, game_date, game_id, player_id, prop, line, side, ladder_offset, anchor, baseline_hp,
final_hp, cal_shift, score, edge, confidence, conf_tier, c_exist, c_quality, c_market, prop_tier,
band, phase, n_uncertain, built_at`.
**UNIQUE `(game_date, player_id, prop, line, side)`** — `final_hp_uidx`, 5,024 MB, **259.9M scans**.

---

## 2. THE TWO-LAYER CONTRACT

### ⚠ The split was ALSO an operational decision, not only a correctness one
*Source: T1, `NBA_SYSTEM_DRAFT.md` §4b. Recorded 2026-09-20 (T1 pass 32) — **the stated purpose of the
two-layer split had not been recorded anywhere.***

This section documents the split as a **correctness** boundary: baseline applies static factors,
enrichment applies delta factors, *"no oscillation."* **§4b gives a second, independent reason it was
built that way** — and names it as the design intent:

> *"**The optional second run is exactly the cheap, fast re-run THE TWO-STAGE BASELINE/ENRICHMENT
> SEPARATION WAS DESIGNED TO MAKE POSSIBLE** — it only needs to **re-run the Scoring Engine against
> the already-cached baseline plus fresh enrichment/market data, NOT RECOMPUTE ANYTHING
> EXPENSIVE.**"*

**The two framings are compatible and neither implies the other.** A system could separate static
from delta purely for correctness and still rebuild both every run; **the caching is what makes the
separation pay operationally.** And `NBA_SYSTEM_DESIGN.md` §4 independently confirms the economics:
*"the refit uses only games strictly before today, so **it is identical at 1 AM and 1:15 PM**."*
**If it is identical at 1 AM and 1:15 PM, it is identical at 4 PM** — so a same-day re-score costs
the board scrape, the availability delta and the scoring, **not the refit.**

**⚠ The capability this was built for does not exist.** The cadence specified *"once, **sometimes
twice a day**"*, with the second run triggered by **a late injury designation change or significant
line movement**. **P3 ships one run, and neither trigger has a detector.** So the architecture pays
the cost of the split and **does not yet collect this part of the benefit.** Recorded in
`NBA_OPEN_ITEMS.md` → *FROM T1 PASS 32*.

> *"Baseline applies static factors; **enrichment applies DELTA factors**: **`market_spread −
> derived_spread`**, **`confirmed_out` superseding `questionable`**. **No oscillation, no
> double-count, and the value of live information becomes measurable on its own.**"* — T8

**Three properties follow:**
1. **Enrichment never recomputes** — it applies a *difference*.
2. **`market_spread − derived_spread`** is exactly what T16 built when it replaced the r=0.46 proxy.
3. **Expressing the live layer as a delta makes its contribution attributable** — which is what let the
   factor-gate harness reject ten candidates on evidence.

**And the caching reason the split exists at all** (T4):
> *"the baseline is expensive to compute but **only changes after a player plays a game — it can be
> cached**. Enrichment data (injuries, odds) **changes constantly**… Merge them, and **every minor
> daily update forces a full slow recompute**."*

---

## 3. THE AVAILABILITY DELTA

**`nba/build_availability_delta.py`** → `nba_score.availability_delta`.
Diffs the **day-before** report (what P2 built from) against the **day-of** report (P3's view), using
**ABSOLUTE timestamps**, not hour-of-day.

**Two branches:**
| Branch | What it does |
|---|---|
| **`now_out`** | a player newly OUT → his legs go to ~0 |
| **`reallocated`** | his minutes redistribute to teammates |

**Verified on 2025-11-29** (Klay Thompson scratched after P2 built):
- `now_out`: **828 overrides, 1 player**, avg move **0.2640**, max 0.9924
- `reallocated`: **3,446 overrides, 9 teammates**, avg move **0.0131** (~1.3 pp), max 0.0496,
  **0 NaNs**
- End to end: **58,395 legs scored**, Klay's **Overs 0.0122 / Unders 0.9834**

**⚠ The reallocation sensitivity parameter (0.15 per tier) is ESTIMATED, not measured.**
**⚠ Rare branch**: a season scan found only **4 dates** where a ladder-carrying player flipped to OUT
after P2.

**BUG-FIXED — `float(NaN or 0)` returns NaN** because **NaN is truthy**. One player with NaN minutes
poisoned `wsum` → `share` → `gain` → **6,748 NaN overrides** headed for the scorer. Fixed with an
explicit `v != v` check plus a hard guard that drops any NaN before write. **A NaN hit probability is
worse than a missing one because it looks like data.**

---

## 4. AS-OF CALIBRATION

**`nba_score.ladder_calibration_asof`** — 9,577 rows.
`season, as_of_date, prop, phase, band, side, log_odds_shift, n, source, built_at`.
**`source`** = **`own`** (current-season evidence) or **`prior_season`** (inherited same-phase cell).

**Applied as a LOG-ODDS SHIFT** (`cal_shift` on `final_hp`).

**⚠ It REPLACES `nba_score.ladder_calibration`, which was a PARITY VIOLATION** — a pasted constant
table carried across days. **Dropped.** The parity doc's §5 forbids carrying a constant between days,
and this is the case that rule caught.

**Refit rule**: weekly, **on everything graded strictly BEFORE today**, with prior-season inheritance
for cells without own evidence.
**Ordering**: grading must run **before** the refit, or yesterday's evidence is invisible to today's
cells — which is why P2 step 3 (grade) precedes step 14 (refit).

---

## 4b. TRI-STATE DATA-QUALITY TAGGING — a required companion design
*Source: T1, blueprint §4g. Recorded 2026-09-20.*

> *"**EVERY enrichment factor's real influence should be WEIGHTED BY THE RELIABILITY OF ITS OWN
> UNDERLYING DATA** — **how much data actually exists for that factor ON THAT SPECIFIC LEG, HOW FRESH
> IT IS, and WHETHER IT'S A REAL, DIRECTLY-OBSERVED VALUE OR A DERIVED/ESTIMATED FALLBACK.**
> MLB implements this as **an EXPLICIT TRI-STATE TAG — REAL / DERIVED / TEMPORARY — NOT a binary
> present-or-absent flag** — **letting downstream consumers WEIGHT A VALUE'S REAL TRUSTWORTHINESS
> rather than treating EVERY POPULATED FIELD AS EQUALLY RELIABLE.**
> **Build this into NBA's own data model FROM THE START**, and **decide EXPLICITLY, UPFRONT, whether
> the reliability weighting applies INSIDE the enrichment factor itself or downstream.**"*

**A populated field is not automatically a trustworthy one** — a binary flag cannot express that a
value is present *because something substituted for it*.

### ⚠ NBA expresses this through CONFIDENCE, not through a tag on the value
| Mechanism | Expresses | Form |
|---|---|---|
| `used_emp` (`baseline_ladder`) | empirical table vs parametric fallback | binary |
| `interpolated` (`board_scored`), −4 confidence | off-ladder rung interpolated | binary |
| `source` (`ladder_calibration_asof`) — `own` / `prior_season` | own vs inherited evidence | binary |
| **`anchor_type` (`board_tiers`) — `explicit` / `switch_point`** | **observed vs DERIVED anchor** | binary, closest in spirit |
| `c_exist` / `c_quality` / `f_prov` | provenance and data quality | **continuous deductions** |

**Routing reliability through the measured confidence model rather than a label is defensible and
arguably stronger** — `f_prov` is a measured deduction, not an assertion.

> 🔴🔴 **CONTRADICTED BY THE CODE — recorded 2026-09-21, §T9.37b.** **All three live definitions of
> `f_prov` are `used_emp`, rescaled**, and `used_emp` is listed **as binary two rows above** in the
> table this paragraph concludes:
>
> ```python
> build_confidence_v3.py:62   f_prov = d["used_emp"].fillna(False).astype(float) * 0.7 + 0.3   → {0.3, 1.0}
> build_final_hp.py:344 · score_board_legs.py:234   np.where(d["used_emp"]…, 1.0, 0.30)
> ```
>
> **`f_prov` takes exactly two values and the value is the label.** *So the same flag is counted once
> as a binary label and once as a continuous deduction, and the argument that the model is stronger
> than a label rests on a factor that **is** the label.* At weight **0.12** in
> `build_confidence_v3.py:85`, the whole spread it can express is **0.084** of raw confidence — and
> **`used_emp` is `true` on 99.73% of ladder rows**, including **all 30,989 rungs beyond their prop's
> measured `LADDER_DEPTH`** (§T9.33a, §T9.37a). 📌 **Scope: `f_prov` only. `c_exist` and `c_quality`
> were NOT CHECKED** — no definition of either was found under `nba/`.

**⚠ The undecided half is the second clause**: *"decide explicitly, upfront, whether the weighting
applies **inside the enrichment factor itself** or **downstream**."* **NBA applies it downstream.**
The enrichment record has a separate `confidence_adjustment` field, so a factor *can* move confidence
— **but no factor is recorded as weighting its own contribution by its data's reliability.**

**Two live cases where a "derived" or "temporary" tag would have been load-bearing:**
- **The derived-spread proxy (r=0.46)** stood in for the market spread until T16 replaced it.
  **Nothing in the data model marked its outputs as resting on a proxy.**
- **The availability delta's `0.15 per tier` sensitivity is ESTIMATED, not measured** — "temporary" in
  this taxonomy — **yet its overrides look identical to measured ones**, and they are the largest
  displacements the system produces (`now_out` avg 0.2640, max 0.9924).

---

## 5. CONFIDENCE — a data thermometer, not a probability

### 5.1 The principle
> **Confidence measures EPISTEMIC uncertainty only — our ignorance. The HP already states the
> aleatoric coin-flip.**

**A coin flip with perfect data should score HIGH confidence and 0.5 HP.** Any model that conflates the
two is wrong — which is exactly how the conformal attempt failed.

### 5.2 The measured deduction model — `nba_score.confidence_model`
**10 factors. Base 99, floor 55.** Starts at 99 and **deducts for named deficiencies**, with weights
**measured from realised-gap separation**.

| Factor | Budget |
|---|---|
| **`f_role`** | **55.6%** |
| eight others | **5.6% floor each** |
| **season phase** | Oct-Nov **0.80** · Dec-ASB **1.00** · post-ASB **0.88** · push **0.92** |

**Why `f_role` dominates**: **fringe players miss by 0.0283; iron-men by 0.0008 — a 35× gap.**
Those are the bottom and top bands of `ROLE_TIERS`.

**Mean confidence 0.92–0.95.** Per-leg factors (`f_role`, `f_prov`) are real, read from
`baseline_history` — **not placeholders**.

> 🔴🔴 **`f_phase` IS COMPUTED AND IS NOT IN THE SUM — recorded 2026-09-21, §T9.38a.**
> `build_confidence_v3.py`'s `FACTOR_COLS` declares **ten** factors; `f_phase` gets a **six-line
> justification with measured figures** (*"the calibration work measured the gap decaying **+1.46 /
> +1.30 / +0.88 / +0.13 pp** across those four… **a confidence question, not a probability one**"*), a
> rank map, and a place in the `attach` block — **and the `raw` expression sums nine terms without
> it.** ✅ **The nine weights total exactly 1.00**, so the omission is structural: `f_phase` could not
> be added without renormalising every other weight. **The factor is exported for inspection and has
> zero effect on the confidence it was written to adjust.**
>
> 📌 **The full weighted set** (`build_confidence_v3.py:85`): `f_complete` **0.16** · `f_depth`
> **0.14** · `f_prov` **0.12** · `f_role` **0.12** · `f_time` **0.10** · `f_vol` **0.10** · `f_agree`
> **0.10** · `f_exp` **0.08** · `f_books` **0.08**. ⚠ **Two of the nine are binary** — `f_prov`
> (`used_emp`, §T9.37b) and `f_time` (`np.where(n_uncertain > 0, 0.65, 1.0)`).
> ⚠ **And `f_depth` uses a hardcoded `14.0`** — exactly `LADDER_DEPTH["points"]` — **as the rung-distance
> scale for all twenty props** (§T9.38b), so `steals` at offset 10, five times its measured depth,
> scores identically to `points` at offset 10, inside its own.

### 5.3 Three earlier versions, and why each failed
| Attempt | Why it failed |
|---|---|
| **Equal-mass quartiles** | forces 25% into "low" **regardless of data quality** |
| **Hand-weighted pillars** | existence separated nothing; **quality INVERTED** |
| **Conformal** | **dominated by aleatoric noise** — a coin-flip with perfect data scored badly |

### 5.4 Interpolation penalty
An off-ladder rung interpolated in log-odds is **flagged** and costs **−4 confidence**.

---

## 6. THE SCORE — 0–100, ENHANCING, never taxing

### 6.1 The rule
**Pivot at 0.85 confidence.**
- **Above 0.85** → the score is **lifted toward 100**, by up to **half the remaining headroom**
- **Below 0.85** → **pulled down**, by up to **35%**

### 6.2 Why not a product
**A multiplicative score kills good legs.** Verified live:
| Leg | Multiplicative | Enhancing |
|---|---|---|
| 0.478 HP @ 0.949 conf | 45.39 | **65.06** |

**And it reorders correctly**: **0.434 HP @ 0.952 conf (62.71) outranks 0.468 HP @ 0.884 conf
(52.78)** — a slightly worse probability with materially better information wins.

### 6.3 Edge is a SEPARATE column
**`edge` = distance above break-even.**
- **`score`** answers *"how good is this leg?"*
- **`edge`** answers *"is this an opportunity?"*

**They are different questions and must not be fused.**

---

> 🔴 **WHAT THE FACTOR SET ACTUALLY IS — recorded 2026-09-21 (T10 pass 3, §T10.3a), because none of
> the twelve said.** T10 closes factor discovery, and its terminal state lived in exactly one
> document — `NBA_ENRICHMENT_FACTOR_LOCK.md` — and in **none** of the mandated twelve:
>
> > *"**discovery is closed: 34 factors, ~90 sub-factors, a minutes tree, thin factors, retirements**,
> > and a **baseline/enrichment split that puts everything derivable or day-before-published into the
> > baseline**. … the factor set is now **complete at the level of mechanisms**: availability and role
> > **A1–A9, N1–N2** · game state **B1–B5, K1** · matchup **M1–M4, B4** · market **C1–C4, S1–S4** ·
> > officials/schedule **D1–D2** · confidence **E1–E4**. What remains is not more factors but …"*
>
> ⚠ **And the twelve carry four different factor counts, none of them 34** — **67** (`factor_registry`,
> seeded at 29), **15** (the recipe's props), **10** (tested at T15/T16), **25** (band rows). *A reader
> of the twelve could not reconstruct what the factor set **is**, only how many rows various tables
> hold.* 📌 **The A/N/B/K/M/C/S/D/E code scheme appears in no mandated document**, though later
> transcripts refer to factors by those codes.
>
> ⚠ **Chronology preserved**: this is **T10's** state — the candidates. **The verdict below is
> T15/T16's**, and is not imported into T10's entry.

## 7. THE ENRICHMENT FACTORS — ten tested, none survived

**`nba_score.factor_gate_results`**: `season, slice, model, n, log_loss, brier, gain_vs_anchor,
shrink_beta, run_at`. **Every verdict lands in the database** — *"a verdict that only exists in stdout
is not a verdict."*

| Factor | Verdict |
|---|---|
| **A2 — teammate redistribution** | **five panels failed, then RETRACTED** — *"the certified anchor wins every slice, **and worst where the mechanism predicted it should win**"* (COMPASS 91). ⚠ **WHY they failed — recorded 2026-09-20 (T1 pass 72), from `build_redistribution_panel.py`'s own docstring, and previously in none of the twelve**: every version tried to attribute vacated minutes to a **specific** absent player, and each then had to isolate a "clean" sub-case — **v1** minutes floor, **v2** `pair_games>=5`, **v2b** `leaguedashlineups` (**API capped at 2,000 rows**), **v3** `single_absence` only (**kept 218 of ~1,150 team-games**). Each isolation **dropped the absorbers**. *"**The isolation WAS the bug, five times.**"* Conservation-gate values **0.10 / -0.05 / -0.37 / 0.25-0.49**. **v4 answered it structurally** — absences as features, one row per (team-game, remaining player), **conservation by construction** (shares of the team pool sum to 1), *"thousands of team-games, not 218"*. **Carry the method lesson, not the factor**: filtering to the clean sub-case can remove exactly the rows carrying the effect. → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 72*. |
| **A3 — return ramp** | assigned to **BASELINE** by the parity doc; gated at leg level: **zero gain** |
| **A5 — lineup change** | **REJECTED/CLOSED** — *"the allocator's recent-5 minutes already encode starting… **no projected lineups needed → no leak to mitigate**"* |
| **B4 — opponent availability / rim protection** | closed in **three** formulations, **0 of 5 props** |
| **M1 — defender quality** | rejected on a crude metric, then **rebuilt as a two-way ridge** (111,768 ratings) and wired on **4 props — but ONLY in the INTERACTION form, never as a main effect** |
| **N1 — availability model** | **79% of Questionables are coin flips at the cutoff** (AUC 0.630) — the Active List locks 60 min before tip |
| others | closed |

**The pattern**: *"the baseline already carries what these factors re-express."*
**T4 warned about exactly this** — the trend EWMA was to be *"dampened **specifically so it doesn't
double-count what the main average already captures**."*

---

## 7b. THE ENRICHMENT MULTIPLIERS AS ORIGINALLY DESIGNED *(T4)*

**The enrichment layer was specified as multipliers/coefficients/bonuses/penalties**, with each factor
carrying a fallback *"so it's never empty."* Three designs are worth keeping, because two of them were
later rejected and the third is the reason why.

### 7b.1 "Situational Minutes Adjustment"
> *"A set of **multipliers or deltas applied to the baseline MINUTES** based on today's specific
> context… **distinct modules in the `Daily Context` stage**."*

**Note it targets MINUTES, not rates** — consistent with the architecture's rule that blowout, OT and
foul risk are *"minutes-model inputs, not rate factors."*

### 7b.2 The playmaker-absence rule — **this is A2's ancestor, in pseudocode**
```python
# config
#   minutes_threshold                  e.g. 28.0
#   target_player_position_filter      e.g. "PG,SG"
#   assist_rate_bonus_multiplier       e.g. 1.15
def apply_playmaker_absence_bonus(player, game_context):
    ...
    player.projected_assist_rate *= config.assist_rate_bonus_multiplier
    return player     # Apply only once
```
**Three design details survived into the later work and one did not:**
- **`# Apply only once`** — an explicit guard against stacking. *(The same class of bug that later
  produced the **triple-stacked logit shift** — FRINGE points predicted 58.7% vs a raw 95%.)*
- **Every threshold is config, not a literal** — the no-hardcoding rule.
- **A flat 1.15× bonus** — this is the form A2 generalised, and **A2 was retracted after five failed
  panels**: *"the certified anchor wins every slice, and worst where the mechanism predicted it should
  win."*

### 7b.3 The Trend Factor — **and the dampening warning that turned out to be the whole story**
> *"`Trend_Factor < 0.95` (e.g. 0.90) → **they are in a slump**… This becomes a **final multiplier** in
> your projection pipeline, **but it should be DAMPENED. YOU DON'T WANT TO DOUBLE-COUNT.**
> **Dampened Application**: `Trend_Adjusted_Projection = Final_Projection × …`"*

**⚠ This warning, written at design time, is the verdict the entire enrichment audit eventually
reached.** Ten factors were tested in T15/T16 and **none survived**, with one recurring diagnosis:
***"the baseline already carries what these factors re-express."***

**The EWMA is the trend.** A separate trend multiplier applied on top of an EWMA-based projection
double-counts by construction — which is why the T4 methodology also specified the trend be carried by
**a second, faster EWMA compared against the primary, applied as a dampened adjustment
"specifically so it doesn't double-count what the main average already captures."**

**The lesson generalises**: before adding any enrichment multiplier, ask **what in the baseline already
encodes this signal**. The measured answer, ten times out of ten, was "the baseline does."

---

## 7c. THE ENRICHMENT APPLICATION RECORD — how a factor's contribution is audited

**⚠ T1 specified this design and named the payoff:**
> *"**Pass through ENRICHMENT-SIGNAL METADATA alongside EVERY graded outcome** — **which specific
> enrichment factors were ACTUALLY APPLIED to this leg, and WHICH WERE MISSING** — **this SINGLE
> DESIGN CHOICE directly ENABLES the kind of ENRICHMENT-FACTOR AUDIT described in §4a to be done LATER
> FROM STORED DATA, rather than requiring AN EXPENSIVE, ERROR-PRONE REVERSE-ENGINEERING EFFORT FROM
> PROBABILITY VALUES ALONE AFTER THE FACT.**"*

**✅ NBA built this.** Every enriched leg carries:
```json
{"prop_side": "more",
 "board_line_value": 0.5,
 "log_rate_adjustment": 0,
 "rate_multiplier": 1,
 "confidence_adjustment": 0,
 "factors_applied": 1,
 "breakdown": "[{\"factor_key\":\"player_availability\",\"status\":\"applied\",\"cell_id\":null,\"contribution\":…}]"}
```

**Note the specification's second half — *"and WHICH WERE MISSING"*** — which is why **`status` matters
as much as the value**, and why `factors_applied` counts them. **A zero contribution and an absent
factor are different states**, and the record distinguishes them.

**This is what made the ten-factor audit possible at all.** `factor_gate_results` could compare
log-loss and Brier **with and without each factor on identical legs**, rather than reverse-engineering
intent from probabilities.

**⚠ One gap against the specification**: T1 says *"alongside every **GRADED OUTCOME**."* NBA's record
lives on the **scoring** side (`final_hp` / the enrichment output), and **whether
`nba_market.board_outcomes` carries the enrichment metadata joined to the graded result is
unverified.** If it does not, the audit requires a join back to `final_hp` by
`(game_date, player_id, prop, line, side)` — **workable, but only while both tables retain the same
dates.**

**Four fields make the layer auditable per leg:**
| Field | Purpose |
|---|---|
| **`log_rate_adjustment`** | the additive adjustment **in log-rate space** — the space factors are fit in, so unneeded ones sit at 0 |
| **`rate_multiplier`** | the same adjustment expressed multiplicatively (1 = no change) |
| **`confidence_adjustment`** | **factors can move CONFIDENCE independently of the rate** — e.g. an interpolated rung costs −4 without touching the probability |
| **`factors_applied`** | the count, so a leg with 0 factors is distinguishable from one where every factor computed to zero |

**And `breakdown` carries a per-factor entry** with **`factor_key`, `status`, `cell_id`, and the
contribution** — so for any leg you can answer *"which factors fired, which cell did each read, and
how much did each move the number?"*

**`status` matters as much as the value**: a factor can be `applied`, or skipped — and the skip reason
(gated out by `factor_relevance`, no cell, under sample threshold) is recorded rather than silently
producing zero. **A zero contribution and an absent factor are different states.**

**This is the mechanism that made the ten-factor audit possible.** Because every application is
recorded with its cell and contribution, `factor_gate_results` could compare log-loss and Brier
**with and without each factor** on identical legs — which is how *"the certified anchor wins every
slice"* was established rather than asserted.

**The harness reports carry the fitted values too**: `role_minutes_multiplier_train_fit` and
`platt_fits` are written into each run's report alongside `ladder_steps`, `props`, `test_season` and
`generated_at` — **the no-pasted-constants rule made inspectable per run.**

---

## 7d. TWO CHEAP GUARDS MLB NEVER APPLIED *(T1, lessons document)*

### 7d.1 **Verify a factor actually HAS variance, first**
> *"for any factor, **verify it actually has variance (`stddev(factor_value) > 0`) as a FIRST sanity
> check** — **this is cheap and MLB NEVER DID IT PROACTIVELY**."*

**A factor with zero variance cannot explain anything**, yet it will fit, report a coefficient and
consume a cell. **One `stddev()` before any gate run catches it.**

**This is directly relevant to NBA's empty columns**: `nba_ref.arenas.altitude_ft` and `.timezone` are
**0 of 30 populated** — an altitude factor built today would have `stddev = 0` and this check would
have caught it immediately. **Same for any factor reading a column that was created but never filled.**

### 7d.2 **Declare `relevant_prop_keys` explicitly — never apply blindly**
> *"Each enrichment factor should have **`relevant_prop_keys` explicitly declared** (which props it
> applies to) **rather than applying blindly** — MLB's `defensive_quality_oaa` factor is correctly
> scoped this way."*

**NBA implements this as `nba_config.factor_relevance`** — 460 rows of `factor × prop →
full/partial/none`, described as *"the gate that runs BEFORE any tier logic."* **The lesson was
carried.**

### 7d.3 **Confidence-tier every research record**
> *"…(Flex-mode partial-credit payouts) that had been **built once from real data but NEVER RE-CHECKED
> against further real placed slips**. **Both were reported, but the second was explicitly labelled as
> a FIRST PASS rather than a settled figure.** **Carry the same explicit confidence-tiering into NBA's
> own research records — don't let a on[e-off measurement harden into a fact].**"*

**⚠ This applies directly to `NBA_MULTIPLIERS.md` §0.2**: the *"two independent real observations both
showed identical partial tiers 4/5 = 0.5 and 3/5 = 0.25"* finding is **exactly this shape** — a small
real-data measurement that looks settled. **It is labelled *"suggests these MAY be flat/constant"* in
the source, and that hedge must survive into any use of it.**

**The NBA analogue already in place**: the `BACKTEST-LOCKED` tag on `classification_config` entries
distinguishes earned values from seeds. **The same discipline, applied to config instead of prose.**

---

## 7e. THE TWO-TEST PARADOX — why a factor can be real and still worthless *(T1, lessons document)*

**The single most important methodological point in the factor work**, and it explains every one of
the ten rejections:

> *"[A factor showed real signal on residuals] **left over after the baseline's prediction** (a real,
> legitimate test — it answers ***'does this carry information the baseline doesn't already have?'***)
> — **but when the stricter, more directly relevant test was run** (***does ADDING this factor to the
> baseline actually improve the combined model's own correlation with real outcomes?***), **the same
> factor showed NO improvement, and even trended slightly NEGATIVE.**
> **Both tests were run correctly and neither is wrong on its own terms — they simply answer DIFFERENT
> QUESTIONS, and only the se[cond one matters].**"*

| Test | Question | Verdict it gives |
|---|---|---|
| **Residual correlation** | *"Does this carry information the baseline lacks?"* | can be **yes** for a useless factor |
| **Marginal contribution** | *"Does ADDING it improve the combined model?"* | **the only one that decides** |

**Why both can be true at once**: a factor can correlate with the residual while being collinear with
what the model already uses, or while adding variance faster than signal. **Residual correlation is
necessary, not sufficient.**

**This is exactly the shape of the NBA enrichment audit's outcome** — ten factors, each with genuine
domain rationale and often real residual correlation, and the measured verdict
*"the certified anchor wins every slice."* **`factor_gate_results` stores `gain_vs_anchor`, not
correlation** — the right metric, by construction.

**And A2's damning detail follows directly**: *"worst where the mechanism predicted it should win."*
A factor whose marginal contribution is **negative exactly where its story is strongest** is
describing something the baseline already models better.

## 7f. PRE-REGISTER THE DECIDING TEST *(T1)*

> *"**A signal's last, deciding check: PRE-REGISTER THE EXACT TEST BEFORE RUNNING IT.** Once the
> **leakage and circularity** issues above were both fixed, the investigation's final test of a
> remaining candidate factor was **explicitly pre-registered**."*

**Three guards, in order, and all three are needed:**
1. **Fix leakage** — as-of contamination (three instances in this system; see OPEN_ITEMS)
2. **Fix circularity** — e.g. prior strength measured against tier-mates is circular, since tier-mates
   were *selected* for similarity (T8: *"k≈2 against the population but k≈100–250 against tier-mates
   (circular)"*)
3. **Pre-register the deciding test** — so the result cannot be re-specified after it is seen

**NBA's structural equivalent**: `nba_score.factor_gate_results` fixes the metrics
(`log_loss`, `brier`, `gain_vs_anchor`, `shrink_beta`) **before any factor is run**, and every verdict
lands in the table. *"A verdict that only exists in stdout is not a verdict."*

---

## 7g. SAME-GAME CORRELATION — real, but smaller than folklore *(lesson #12)*

> *"External research (published DFS/sharp-bettor material) **correctly predicted that pick'em
> platforms price legs as INDEPENDENT even though same-game props are genuinely correlated** — but
> **[our] own measurement found the raw effect was INFLATED BY MULTIPLE CONTAMINATION SOURCES**:
> **pooling across props with different base rates**, **unweighted game-size averaging**, and
> **nested / nearly-deterministic SAME-PLAYER MULTI-LINE STACKING** — **and the clean, corrected
> effect was MUCH SMALLER than the initial headline number.**
> **Separately and decisively: when tested with a real LIVE-BOARD same-game vs cross-game slip
> comparison, the platform showed a REAL, LARGE PAYOUT DISCOUNT for same-game stac[king].**"*

**Three contamination sources, each of which inflates a measured correlation:**
| Source | Why it inflates |
|---|---|
| **Pooling across props with different base rates** | a mixture of populations shows association that exists in neither |
| **Unweighted game-size averaging** | high-scoring games dominate the raw average |
| **Nested / nearly-deterministic SAME-PLAYER MULTI-LINE STACKING** | two lines on the same player's same stat are not two observations |

**Note the third source is named precisely: same-player multi-line stacking** — i.e. taking
`points 20+` and `points 25+` on one player, or `points` and `PRA`. **That is Part C member #4.**

**The two findings compound against a same-game strategy, and both are quantified:**
> *"…the platform showed a **real, large payout discount for same-game stacking — A ~35–40% LOWER
> MULTIPLIER FOR THE IDENTICAL LEGS — which MORE THAN OFFSET the real (much smaller, **~8%**, ITSELF
> NOT STATISTICALLY CONFIRMED) correlation benefit.**
> **Do not assume same-game stacking is a working strategy for NBA without DIRECTLY TESTING the
> platform's own same-game discount, the same way — IT MAY BE ACTIVELY PRICED AGAINST, NOT FREE
> MONEY.**"*

| Side | Magnitude |
|---|---|
| **Correlation benefit** | **~8%** — *"much smaller… **itself NOT statistically confirmed**"* |
| **Platform's same-game discount** | **~35–40% lower multiplier on identical legs** |

**The discount is roughly 4–5× the benefit, and the benefit is not even statistically confirmed.**
That is the arithmetic behind *"default to cross-game"* (`NBA_MULTIPLIERS.md` §0.2f).

**And the instruction for NBA is to re-measure, not to inherit**: *"directly testing the platform's
own same-game discount, **the same way**"* — a live-board same-game vs cross-game slip comparison.
**That is the same free slip-builder quote as lesson #16** (the payout displays before placing), so
**one session answers both questions.**

**NBA relevance**: the combo work estimates **per-player covariance from that player's own per-game
P/R/A**, which avoids source 1 (no pooling across players or props) and source 3 (components modelled
jointly rather than stacked as independent lines). **Source 2 — weighting — is the one to check**,
since a per-player covariance averaged across games without volume weighting has the same exposure.
*(Lesson #6 independently requires volume weighting at the day level.)*

---

## 7h. THE MLB→NBA ENRICHMENT FACTOR MAPPING *(T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §2)*
*Written before any NBA code existed. Recorded 2026-09-20.*

| MLB factor | NBA equivalent, as stated |
|---|---|
| **Weather** (temp, wind, precip) | *"**Not applicable (indoor sport) — REMOVE THIS FACTOR FAMILY ENTIRELY, don't port it.** Confirmed a real time-saver: **MLB spent real effort on weather factors that MOSTLY FAILED ANYWAY**; NBA doesn't need to build this category at all."* |
| **Park factors** (dimensions, altitude) | *"**Arena factors — much smaller effect expected** (basketball courts are **standardized dimensions** unlike ballparks) — **but ALTITUDE (Denver) is a real, known effect in NBA and worth keeping as its own factor.**"* |
| **Roof / dome status** | *"Not applicable — remove."* |
| **Batting order / lineup position** | *"**Not directly applicable** — the NBA equivalent concept is more about **MINUTES / ROLE PROJECTION and STARTER-vs-BENCH statu[s]**"* |

### What this predicted, and how it turned out
- **Altitude** was singled out at the very start as *"a real, known effect… worth keeping as its own
  factor"* — and **six transcripts later peer-reviewed support arrived** (*J. Sports Sciences* 2025,
  p=0.005). **The column `nba_ref.arenas.altitude_ft` was created in T1's first DDL.** ⚠ **It is still
  0-of-30 populated.**
- **Court standardisation** is why arena factors were correctly expected to be small — unlike
  ballparks, the playing surface does not vary.
- **"Minutes / role projection and starter-vs-bench"** is exactly what the engine built: **`mu_role`
  and the six-band `ROLE_TIERS`**, with `f_role` later measured as carrying **55.6% of the confidence
  deduction budget**.
- **The weather instruction is a "don't build" decision recorded as a saving**, with the reason given:
  MLB's own weather factors *"mostly failed anyway."*

**The pattern worth noting**: three of four mapped MLB factor families were resolved as **remove, not
port** — and the one kept (altitude) plus the one reframed (lineup → minutes/role) are both central to
the system as built.

### ⚠ COMPLETENESS — the table above transcribes 4 of the source's 10 rows
*Added 2026-09-20 (T1 pass 61). The six missing rows, and how each turned out:*

| MLB factor | NBA equivalent, as stated | Outcome |
|---|---|---|
| **Bullpen fatigue / matchup** | *"Not applicable in the same form — NBA's closer conceptual equivalent is **teammate/rotation fatigue (back-to-backs, minutes load, load management/rest patterns)** — this is **likely a MORE important factor for NBA** than bullpen factors are for MLB"* | **absorbed into the baseline** via the calendar (rest days, B2B), not built as an enrichment factor |
| **Handedness matchup** | *"Not applicable in the same form — closer NBA equivalent: **positional/defensive matchup quality** (opponent's defensive rating at that position, **individual defender matchup if data supports it**)"* | became **`nba_team.defense_vs_position`** and **M1 defender level** — M1 works **only in interaction form**; **B4 closed in three formulations, 0 of 5 props** |
| **Recent form** | *"**Directly applicable, same concept — port directly.**"* | ✅ **the EWMA core of the baseline** — per-prop `alpha`, the most load-bearing single decision in the recipe |
| **Lineup protection** | *"Weaker/different analogue… closest concept might be **'usage rate change with a teammate out'** (**real, well-documented NBA effect**: injuries/absences to high-usage teammates measurably shift a player's own usage and production)"* | became **A2 teammate redistribution** — ⚠ **five panels failed and A2 was FULLY RETRACTED**; the certified anchor wins every comparison |
| **Opposing starter quality** | *"**Opposing team's defensive rating / opponent points-allowed-by-position — directly analogous concept.**"* | **in the baseline**, not the enrichment layer — *"opponent defence, pace matchup and blowout risk all belong in the baseline"* |
| **Quality of contact** (exit velocity, launch angle) | *"**Not applicable — remove entirely**, this is MLB-specific batted-ball physics with no basketball equivalent"* | ✅ never built — and `QUALITY_OF_CONTACT_METRICS_EXPANSION.md` was correspondingly left unread |

**⚠ The scorecard across all ten rows is worth stating plainly.** The handoff called the
teammate-usage effect **"real, well-documented"** — **it is the one prediction that was actively
tested and RETRACTED.** Its two most confident calls — *"likely a MORE important factor for NBA"*
(rotation fatigue) and the well-documented usage effect — **both ended up either folded into the
baseline or retracted**, while its *"port directly"* call (**recent form**) became the single most
load-bearing mechanism in the system.
**This is the third recorded case of a confident forward-looking handoff claim not surviving
contact**, after ParlayAPI (*PASS 49*) and the four NBA-specific factors (*PASS 52*) — and it
sharpens the same filter: **the handoff's descriptions of MLB's measured experience held; its
forecasts about NBA did not.**

---

## 7i. THE "PHASE FILE" ENRICHMENT ARCHITECTURE *(T1, the blueprint §4)*
*Recorded 2026-09-20.*

> *"MLB organises enrichment into **named phases, EACH A SEPARATE WORKER FILE even when many are
> near-identical boilerplate around ONE factor**."*

| Phase | MLB contents | **Stated NBA equivalent** |
|---|---|---|
| **2A — game/environment level** | run environment, park impact, weather impact, roof impact | **pace, home/road, back-to-back, altitude if relevant, arena factors** |
| **2B — player role/matchup** | batting order/lineup role, bullpen matchup, handedness matchup, lineup protection, opposing starter matchup, recent form | **role/minutes projection, opponent defensive matchup, positional matchup, rest/schedule spot, recent form** |
| **3A / 3B / 3C** | per-prop-family context builders — *"one per prop or prop-cluster"* | — |

**NBA did NOT follow the one-file-per-factor structure.** Enrichment is consolidated into
`build_final_hp.py` with the factor registry (`nba_config.factor_registry`, 67 rows) supplying the
per-factor definitions. **The phase taxonomy survives as the A/B/D/M/N factor codes**, not as files.

**Note how well the stated 2A/2B mapping predicted the built system**: *"role/minutes projection"*
became `mu_role` and `ROLE_TIERS`; *"opponent defensive matchup"* became the measured opponent
coefficients (blocks ← paint share 0.30/0.37, steals ← opp TO rate 0.27/0.26); *"rest/schedule spot"*
became A4; *"back-to-back"* and *"home"* were both **measured ≈0** because the minutes model already
carries them.

### ⚠ THE CRITICAL LESSON ATTACHED TO THIS SECTION
> *"**Critical lesson BEFORE BUILDING ANY OF THESE**: MLB's own factor layer had **a LIVE, UNDETECTED
> BUG — one factor (`stolen_base_family`) had ZERO VARIANCE ACROSS EVERY ROW** — **a real defect:
> WIRED INTO THE SCORING ENGINE, CONTRIBUTING LITERALLY NOTHING** — and **was ONLY CAUGHT BECAUSE IT
> ACCIDENTALLY BECAME USEFUL AS A PLACEBO / NOISE-FLOOR CALIBRATOR during later statistical work.**
> **Before trusting ANY new NBA enrichment factor, verify it actually has variance
> (`stddev(factor_value) > 0`) as a first sanity check — this is cheap and MLB NEVER DID IT
> PROACTIVELY.**"*

**Three things make this the sharpest warning in the blueprint:**
1. **It was wired into a live scoring engine**, contributing nothing, for an unknown period.
2. **It was caught BY ACCIDENT** — not by review, not by testing, but because someone later needed a
   placebo and noticed this factor was one.
3. **The detection cost is one line of SQL**, and it was never run.

**A zero-variance factor is worse than a missing one**: it occupies a slot, consumes a cell, reports a
coefficient, and passes every structural check — while carrying no information.

**Directly live for NBA**: `nba_ref.arenas.altitude_ft` and `.timezone` are **0-of-30 populated**, so
an altitude or jet-lag factor built today would have exactly this defect. **Worth running
`stddev()` across every factor column before the season, not just those two.**

**And the companion rule from the same section:**
> *"Each enrichment factor should have **`relevant_prop_keys` explicitly declared** (which props it
> applies to) rather than applying blindly — MLB's `defensive_quality_oaa` is correctly scoped this
> way (`["hits","singles","doubles","hits_allowed"]`) — and **this scoping should be EXPLICIT AND
> REVIEWABLE, NOT IMPLICIT IN CODE LOGIC SCATTERED ACROSS FILES.**"*

**NBA implements this as `nba_config.factor_relevance`** — 460 rows of `factor × prop →
full/partial/none`, *"the gate that runs before any tier logic."* **Explicit and reviewable, in a
table, exactly as specified.**

---

## 7j. ⚠ THE ENRICHMENT-DISPLACEMENT DIAGNOSTIC — cheap, and never run on NBA
*Source: T1, blueprint §4a — described as **"a real, dense case study worth internalizing BEFORE
writing the scoring engine."*** Recorded 2026-09-20.

### The finding it produced
> *"MLB ran a real audit that found its scoring engine was **WELL-CALIBRATED AT THE BASELINE LEVEL but
> BADLY OVERCONFIDENT once enrichment factors moved the number away from baseline**."*

### The technique
> *"**Split graded legs by HOW FAR THE ENRICHMENT LAYER MOVED THE FINAL PROBABILITY AWAY FROM THE
> BASELINE MODEL'S OWN NUMBER, then compare predicted-vs-actual SEPARATELY FOR EACH BUCKET.**"*

**The measured result:**
| Bucket | Calibration gap |
|---|---|
| **Baseline-dominated legs** | *"nearly perfectly calibrated — **~1 point gap**"* |
| **Heavy-enrichment legs** | ***"a 5+ POINT OVERCONFIDENCE GAP"*** |

> *"**This SINGLE CHECK immediately LOCALIZES whether a calibration problem lives in the BASELINE MODEL
> or the ENRICHMENT LAYER, WITHOUT DEBUGGING EVERY FACTOR INDIVIDUALLY FIRST.**"*

### ⚠ NBA has every input this needs, and has never run it
**`nba_score.final_hp` carries both numbers on every row**: **`baseline_hp`** and **`final_hp`**, plus
**`cal_shift`**. **The displacement is `final_hp − baseline_hp`, already stored — no computation
required beyond a bucketed group-by against `board_outcomes`.**

**Why it matters here specifically:**
- NBA's measured factor effect is **Brier +0.1–0.3%**, i.e. **the enrichment layer moves the number
  very little on average** — so most legs would fall in the baseline-dominated bucket.
- **But the average is not the question.** The diagnostic asks about the *tail* of displacement — the
  legs the enrichment layer moved **most** — and those are exactly the legs where availability deltas
  fire (`now_out` moves a leg by **0.2640 on average, max 0.9924**).
- **A `now_out` override is the largest displacement the system produces**, and it is applied with a
  **reallocation sensitivity parameter (0.15 per tier) that is ESTIMATED, not measured.**

**So the highest-displacement bucket is also the one with the least-validated parameter.** The
diagnostic is one query and would answer whether that matters.

**Recorded in `NBA_OPEN_ITEMS.md`.**

---

## 7k. FIVE CONCRETE ENRICHMENT-FACTOR BUG PATTERNS
*Source: T1, blueprint §4a — **"all real, all worth actively checking for in NBA's own factors."***
Recorded 2026-09-20.

### 1. A cumulative/season-total stat used as if it were a per-game rate
> *"**with no division by games played anywhere in the code** — causing **one factor to SWAMP EVERY
> OTHER FACTOR COMBINED**.
> **Tell: check whether a factor's source field name says 'TOTAL' while its consuming code treats it
> as 'PER GAME'.**"*

**Live surface**: **`nba_stats.player_career_season_totals`** (**3,644 rows**) is cumulative by name and content *(🔴 corrected 2026-09-21, §T10.22b — this read `nba_stats.player_career_totals`, which does not exist; and the correct table is the one whose stored self-subtotals are the documented §T4 double-count, so the wrong name pointed a reader away from the very defect)*;
`player_game_log` is per-game. **Any factor reading career totals must divide.**

### 2. One factor's lookup table left UNCAPPED while siblings have explicit caps
> *"**the INCONSISTENCY ITSELF is the red flag; audit cap presence across the WHOLE factor registry AT
> ONCE, not factor-by-factor.**"*

**Live surface**: `nba_config.factor_profile_cells` has dedicated **`cap` / `lift` / `penalty` /
`coefficient`** columns. **A single query — which cells have a null `cap` while their siblings do
not — is the audit this asks for. Not recorded as having been run.**

### 3. Macro-environment MULTICOLLINEARITY — and the RSS fix
> *"several factors **all correlating with the same underlying signal** (e.g. **a market-derived game
> total already prices in park/weather/pace effects that separate factors also try to capture**), so
> **naively multiplying or summing them DOUBLE- AND TRIPLE-COUNTS the same real information**.
> **Fix: RSS (ROOT-SUM-SQUARES) aggregation for a genuinely correlated factor cluster** — this has the
> desirable property of **ZERO DAMPENING when only one factor in the cluster fires (matches its
> individual magnitude exactly)**, with **increasing dampening as more correlated factors stack
> together** — rather than either **naively multiplying (over-counting)** or **arbitrarily zeroing out
> extra factors (under-using real information)**.
> **Keep factors that measure genuinely INDEPENDENT information OUT of this treatment — only
> correlated clusters need it.**"*

**⚠ This is a named, specific solution NBA does not use.** `nba_config.factor_registry` carries
**macro-clusters** (T8: *"layer-tagged, with macro-clusters"*) — **the cluster grouping RSS requires
already exists** — but no RSS aggregation is recorded anywhere.

**And the example is directly live**: the matchup factor uses **market-implied totals**
(`f_impl_own`/`f_impl_opp` = `total/2 ∓ spread/2`), which by this description **already price in
pace and opponent strength** that the pace and opponent-defence coefficients also capture.
**That is the exact multicollinearity named.**

**Note also how RSS relates to the architecture's own solution**: placing blowout/OT/foul risk in the
**minutes model** *"dissolves their correlation"* (T8) — **the same problem solved structurally rather
than by aggregation.** RSS is for clusters that cannot be re-homed that way.

### 4. A factor showing the IDENTICAL contribution across wildly different cases
> *"e.g. **an elite player and an average player getting the EXACT SAME adjustment** — **a sign the
> factor is simply HITTING ITS OWN CAP for nearly everyone, NOT ACTUALLY DISCRIMINATING**, even though
> **the code 'RUNS' WITHOUT ERROR.**"*

**The sibling of the zero-variance bug**: near-zero *effective* variance caused by a cap, rather than
by the input. **The `stddev()` check would NOT catch this** — the factor values differ upstream; the
contributions do not. **The check is on the CONTRIBUTION, not the input.**

**`final_hp`'s enrichment record stores per-factor contributions in `breakdown`**, so this is
measurable: **distinct contribution values per factor.**

### 5. AMPLIFYING, rather than shrinking, a thin-sample signal
> *"Standard, correct statistical practice **always shrinks a thin-sample estimate toward a prior**;
> MLB found a real case **doing the OPPOSITE — multiplying a signal UP for players with LIMITED GAMES
> PLAYED** — justified by a 'validation' that **only proved the signal CORRELATED with outcomes —
> which is SCALE-INVARIANT and would show the same correlation whether the true correction should
> SHRINK or AMPLIFY.**
> **Correlation with outcomes proves a signal CARRIES INFORMATION; it does NOT by itself prove WHICH
> DIRECTION OR MAGNITUDE of adjustment is correct — that needs its own, SEPARATE validation.**"*

**The scale-invariance point is the sharp one**: a correlation check cannot distinguish "shrink this"
from "amplify this", so passing it proves nothing about the adjustment's direction.

**NBA's structural defence is strong here** — empirical-Bayes shrinkage *"genuinely decays to zero as
a player's sample grows"*, and the per-prop `k_stab` values are **measured** (STL k=125, TOV k=60,
*"top-decile steals players regress 17% over the next 20 games"*). **Direction and magnitude were both
validated separately, which is exactly what this pattern demands.**

---

## 7l. TWO OPERATIONAL DISCIPLINES
*Source: T1, blueprint §4a. Recorded 2026-09-20.*

### 1. Verify you are looking at data generated AFTER the fix deployed
> *"**Before re-diagnosing an apparently-still-present issue, verify you're looking at FRESH DATA
> GENERATED *AFTER* THE RELEVANT FIX DEPLOYED, not stale data from before it.** MLB **nearly wasted
> real effort RE-FINDING ALREADY-FIXED BUGS** because **the scoring pipeline hadn't been RE-RUN since
> a fix shipped.**"*

**This is the stale-output trap, and it recurs throughout the NBA build** — every instance of
*"the patch aborted on an assertion; the file wasn't modified, so that output is the OLD run"* (T8,
T9) is the same failure caught in time. **The NBA habit of checking whether a patch actually applied
before reading numbers is this discipline in practice.**

### 2. Input-side correct ≠ output-side improved
> *"**Confirming a fix looks STRUCTURALLY CORRECT ON THE INPUT SIDE (bad values gone, caps behaving,
> no more amplification) is NOT the same as confirming THE OUTPUT SIDE ACTUALLY IMPROVED** — that
> **requires waiting for real games to be played and graded**. **Don't conflate the two; STATE
> EXPLICITLY WHICH ONE YOU'VE VERIFIED.**"*

**Directly applicable to the current state of this system.** Almost everything verified so far is
**input-side**: the season fix holds, the mixture is configured, the ladder reproduces exactly, the
availability delta produces no NaNs. **Output-side improvement cannot be confirmed until real games
are graded** — which is the same boundary as lesson #16's real-quote confirmation and the §18 sample
posture (*"fewer than 15 real days is not yet a result at all"*).

**The instruction is to state which one** — so, explicitly: **the NBA system is verified input-side
and calibrated against history; no output-side improvement claim is available until the season
grades.**

### ⚠ A calibration-specific instance of the "file name / liveness" trap
> *"**A worker's own health-check response can explicitly SELF-REPORT AS DEAD/DEPRECATED while its
> FORMULAS STILL REPRESENT THE REAL DESIGN LINEAGE the currently-live replacement is based on** —
> **informative to read, bu[t not the live logic]**."*

**This is the three-generation trap from T7 seen from the other side.** There, two MLB classification
files declared themselves *"CONFIRMED DEAD — do not build on this"* and the live one was a function
name (`runClassificationBaselineV6ToPostgres`). **Here the blueprint adds the nuance: a dead file is
still worth READING for design lineage — it is only worth not PORTING.**

**Both halves matter**: T7 read the live function line by line *and* correctly identified the dead
ones — *"porting from either dead version would have locked in wrong logic."*

---

## 7m. TWO DIAGNOSTIC-ONLY SAFEGUARDS, SPECIFIED FOR DAY ONE
*Source: T1, blueprint §4b. Recorded 2026-09-20.*

> *"**Two DIAGNOSTIC-ONLY (NEVER AUTOMATICALLY ACTING) safeguards worth building into NBA's scoring
> engine FROM DAY ONE, since they DIRECTLY TARGET THE EXACT FAILURE CLASSES documented elsewhere in
> this package.**"*

**"Never automatically acting" is part of the specification** — these surface problems; they do not
correct them.

### Safeguard 1 — the coverage-gap check
> *"**a coverage-gap check that surfaces any (PROP, SIDE, HIGH-CONFIDENCE BUCKET) combination showing
> a real, RESOLVED-OUTCOME DEVIATION past a threshold WITH ZERO ACTIVE CORRECTION COVERING IT** —
> **this is precisely the mechanism that would catch A SILENT FORMULA/CALIBRATION REGRESSION BEFORE IT
> RUNS FOR WEEKS UNDETECTED** (see the fantasy-score-formula saga)."*

**The key is the conjunction**: a real deviation **AND** no cell covering it. A deviation with a cell
is handled; a deviation with **no** cell is a blind spot.

**NBA has both halves of the input**: `board_outcomes` (6.9M graded legs, keyed prop/side/line) and
`factor_profile_cells` (35 fitted cells against a 460-row relevance matrix). **The 35-vs-460 gap is
exactly the surface this check would scan.**
**Not recorded as built.** And the stated purpose — catching a **silent calibration regression before
it runs for weeks** — is the failure mode an unattended season-long pipeline is most exposed to.

### Safeguard 2 — the role/context-discontinuity check
> *"**a role/context-discontinuity check that FLAGS when a player's MOST RECENT REAL PERFORMANCE
> CONTEXT DIFFERS SHARPLY FROM THEIR TRAILING SAMPLE** — e.g. **a bench player suddenly starting, a
> return from a long injury layoff** — **surfacing the real risk that A BASELINE SAMPLE MIXES AN OLD,
> NO-LONGER-RELEVANT CONTEXT WITH THE CURRENT ONE.**"*

**⚠ NBA built the CORRECTION but not the FLAG.** The engine already *acts* on both named cases:
| Named case | NBA's handling |
|---|---|
| *"a bench player suddenly starting"* | the **team-change discount** and the T7 **role-change detector** (starter flag flips 2+ games, or 3-game mean >3σ, or a trade → reset the window) |
| *"a return from a long injury layoff"* | the **return ramp** (A3) — measured multipliers by games missed |

**But the specification is for a DIAGNOSTIC that flags**, precisely because the correction may be
wrong. **A silently-applied window reset on a misread context produces a confident wrong number**, and
nothing surfaces it. *(This is the same concern as tier misclassification being "a quiet, indirect
source of a wrong final probability."*)

**Both safeguards are diagnostic-only by design, and neither is recorded as built.**

---

## 7m2. ⚠ AN HONEST OUT-OF-SAMPLE PASS IS **NECESSARY BUT NOT SUFFICIENT** — never auto-apply a correction
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` **§7f** — "a profound calibration lesson."*
***Recorded 2026-09-20 (T1 pass 29).***

**⚠ SELF-CORRECTION, same day, same pass.** This section was first written stating that blueprint §7f
was *"previously unswept."* **That was wrong, and it is corrected here rather than quietly edited.**
**§7f is already recorded — thoroughly — at `NBA_BASELINE_CALIBRATION.md` §5.6**, including the
verbatim case, the prescribed rule, the weekly-recalibration cadence, and a **VERIFIED code check**
(grep of the ladder calibration code, 2026-09-20) establishing that **NBA is structurally protected**:
the calibrated quantity is `p_over` and `p_less = 1 − p_more` by construction, so **there is no
separate Less population to be dominated**, and `offset` (the rung) is already in the fit key.
**Read §5.6 first — it is the primary record.**

**What is genuinely new in this pass, and why this section stays:**
1. **The cost precedent** — *"two props running with zero active correction for roughly two and a half
   weeks… 30–45 percentage point overconfidence gaps, undetected until someone manually checked"* —
   **not recorded anywhere before this pass.**
2. **The explicit causal link from §7f to the coverage-gap diagnostic** (§7m Safeguard 1). The
   blueprint states the precedent *"directly motivated"* it. The two were recorded as separate items.
3. **The enrichment-side application.** §5.6 answers the question for the **baseline Platt fit**.
   The **as-of calibration table that the enrichment layer consumes** is keyed
   `(season, as_of_date, prop, phase, band, side)` — **`side` is a real, populated dimension there**,
   which is a different exposure from the baseline's.

**The case, verbatim:**
> *"MLB found a real, concrete case where a statistical calibration fit genuinely **PASSED HONEST,
> HELD-OUT, OUT-OF-SAMPLE VALIDATION** (it beat both the raw baseline and a standard calibration
> method on real held-out error metrics) **and was still STRUCTURALLY WRONG** — the fit had been
> computed **WITHOUT DISTINGUISHING BETWEEN TWO SIDES OF A MARKET (over/under)**, and ended up
> **DOMINATED BY ONE SIDE'S PATTERN, SILENTLY MISAPPLIED TO THE OTHER SIDE**. The aggregate
> improvement metric **DID NOT CATCH THIS, because it was AVERAGED ACROSS BOTH SIDES.**"*

**The rule it produces**, stated in the source as *"a directly transferable, important lesson for
NBA's own calibration loop"*:
> *"an aggregate validation metric passing is **necessary but not sufficient** — always check whether
> a proposed correction is genuinely appropriate for **EVERY MEANINGFULLY DISTINCT SUBGROUP IT WILL BE
> APPLIED TO** (e.g. both sides of a market, every relevant tier), not just the pooled average, and
> **KEEP A HUMAN REVIEW STEP BEFORE APPLYING ANY CALIBRATION CORRECTION even when it has technically
> passed validation.**"*

**The operating cadence it recommends** — converged on from external ML model-monitoring research and
named in the blueprint as *"a concrete operational recommendation worth adopting directly"*:
> *"**WEEKLY RECALIBRATION CHECKS, with TRIGGER-BASED RE-FITTING and MANDATORY HUMAN REVIEW BEFORE
> APPLYING — NOT FULL UNATTENDED AUTOMATION.**"*

**The cost of not having it** — MLB's own precedent, stated as real and costly:
> *"two props running with **ZERO ACTIVE CORRECTION for roughly TWO AND A HALF WEEKS** after a
> root-cause fix, showing real **30–45 PERCENTAGE POINT OVERCONFIDENCE GAPS**, undetected until
> someone manually checked"*

— and the blueprint states this is what **directly motivated the coverage-gap diagnostic** recorded
above at **§7m, Safeguard 1**. The two sections are one design, split across the blueprint.

### What §7f means for NBA specifically
- **NBA's calibration refit is an unattended nightly step inside P2.** §7f's rule is that a
  correction must not be auto-applied on an aggregate pass alone. **Whether any per-subgroup check or
  human-review gate exists in the NBA refit is NOT RECORDED as built** — logged in
  `NBA_OPEN_ITEMS.md` under *FROM T1 PASS 29*.
- **NBA's subgroup dimensions are already enumerated by its own schema.**
  `nba_score.ladder_calibration_asof` is keyed `(season, as_of_date, prop, phase, band, side)`.
  **`side` is precisely the dimension MLB's failed fit collapsed.** A refit validated only on the
  pooled average across `side` would reproduce the documented failure exactly — and `phase` and
  `band` are two further subgroups the same argument covers.
- **Goblin/demon lines create further distinct subgroups inside a single prop** (a demon `More` and a
  goblin `Less` on the same player-prop are not one population) — see `NBA_GOBLIN_DEMON.md`.
- **Evidence tier**: this is a **transferred MLB finding as stated in T1**. It is **NOT RECORDED** as
  measured on NBA data, and no NBA instance of the failure has been observed or looked for.
- **Cross-reference**: this is the calibration-side twin of lesson **#2** (*"never apply a
  tier/pool-level multiplier to a heterogeneous population"*) — §7f is the same error committed by a
  *fit* rather than by a *multiplier*.

---

## 7n. THE OUTCOME-GRADING ENGINE — isolation design
*Source: T1, blueprint §4c. Recorded 2026-09-20.*

### Isolation-by-design as a SAFETY PROPERTY, not an accident
> *"The grader **ONLY EVER READS from historical board/game-log tables** and **ONLY EVER WRITES to a
> DEDICATED OUTCOME-HISTORY TABLE** — **it NEVER touches any table the LIVE BOARD-SERVING PATH
> reads.**
> **This means a bug in the grader CANNOT CORRUPT TODAY'S LIVE BOARD; its BLAST RADIUS is limited to
> producing wrong or missing *TRAINING* data**, which **a SEPARATE DOWNSTREAM VALIDATION STEP checks
> BEFORE any calibration correction is ever applied.**
> **Build NBA's outcome grader with this same isolation FROM DAY ONE — a real, LOAD-BEARING SAFETY
> PROPERTY, not an afterthought.**"*

**✅ NBA's grader has the read side right**: `grade_board_outcomes.py` reads `board_snapshots` and game
logs, writes `nba_market.board_outcomes` (6.9M legs) — a dedicated outcome table.

**⚠ But the blast radius is NOT fully contained, because of P2's ordering.** The pipeline runs
**grade (step 3) → … → calibration refit (step 14)** in the same workflow, and the refit writes
`ladder_calibration_asof`, which **`build_final_hp.py` reads on the next run.**

**So the path from grader to live numbers exists**: bad grades → bad `log_odds_shift` → bad
`final_hp`. **The isolation the blueprint describes depends on the second clause — *"a separate
downstream validation step checks before any calibration correction is ever applied"* — and no such
validation step between grading and the refit is recorded.**

**The ordering itself is correct and deliberate** (*"grading must run before the refit, or yesterday's
evidence is invisible to today's cells"*). **What is missing is the check between them.**

### Map every canonical prop to an explicit expression against raw game-log columns
> *"e.g. **a composite fantasy-score prop as an EXPLICIT WEIGHTED SUM of raw counting stats** — **keep
> this map IN ONE PLACE, VERSIONED**, and **FLAG any prop whose scoring formula HASN'T BEEN
> INDEPENDENTLY VALIDATED against a confirmed, authoritative spec AS A KNOWN, EXPLICIT GAP rather than
> silently trusting an assumed formula** — **this is the EXACT MECHANISM that would have caught the
> FANTASY-SCORE FORMULA BUG much earlier.**"*

**NBA has the map in two places, not one:**
| Location | Contents |
|---|---|
| `nba_ref.prop_taxonomy` (28 rows) | the canonical prop list |
| **`norm_market()` in `score_board_legs.py`** | board key → our prop name |
| `classification_ladder_v12.py`'s `PROPS` | prop → **source column** (`"col": "PF"`, `"col": "FGM"`) |

**The `PROPS` config IS the expression map for singles** — each prop names its raw game-log column.
**Combos and `fantasy_score` are where the explicit weighted sum lives, and that is the one flagged by
this rule**: the scale `1 / 1.2 / 1.5 / 3 / 3 / −1` was **validated against all three apps in T9** —
so **NBA did the validation this asks for**, though the result is recorded in a transcript rather than
versioned beside the map.

**The instruction not followed**: *"flag any prop whose formula hasn't been independently validated
**as a known, explicit gap**."* **`double_double` (sentinel −1.0), `stocks`, and the period props do
not carry such a flag.**

---

## 7o. BENCHMARK THE FACTOR LIST AGAINST A REAL, VERIFIED SYSTEM
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

> *"**Benchmark the planned factor list against REAL, PUBLICLY-VERIFIED SYSTEMS BEFORE FINALIZING
> it.** MLB checked its own factor list against **a real, independently-verified industry-leading
> system (a widely-used, real-track-record MLB projection product)** and **adopted SEVERAL CONCRETE
> REFINEMENTS from studying HOW THAT SYSTEM ACTUALLY IMPLEMENTS THINGS**:
> — **MATCHUP-SPECIFIC rather than TEAM-AGGREGATE defensive metrics**
> — **treating 'QUALITY OF SURROUNDING LINEUP' as a DISTINCT INPUT from a player's own slot number**
> — **ROLE-SPECIFIC ADJUSTMENTS for players who DON'T FIT A STANDARD USAGE PATTERN**
> **For NBA, do the equivalent.**"*

### The three refinements, mapped to NBA
| MLB refinement | NBA state |
|---|---|
| **Matchup-specific, not team-aggregate, defensive metrics** | ✅ **M1** — the two-way ridge defender ratings (111,768) are per-defender, **not** team DvP. ⚠ But wired **only in the INTERACTION form, never as a main effect**, and `defense_vs_position` (team-aggregate) is what most props read |
| **"Quality of surrounding lineup" as a DISTINCT input** | ⚠ **Partially.** **`nba_team.lineup_profile`** (8,000 rows) and `teamplayeronoffdetails` exist; *(🔴 corrected 2026-09-21, §T10.22b — this read `nba_stats.lineup_synergy`, which exists in no schema; the live table is `nba_team.lineup_profile` and its row count is exactly the 8,000 stated, which is what identifies them as the same object)*; the factor lock names *"teammate shooting quality"* as the assists penalty. **But A2 (teammate redistribution) was retracted, and no surviving lineup-quality factor is recorded** |
| **Role-specific adjustments for players who don't fit a standard usage pattern** | ✅ **`ROLE_TIERS`** is exactly this — six bands on projected minutes, with **FRINGE** as the explicit non-standard bucket, plus the **discontinuity override** for role changes |

**Two of three landed. The middle one is the gap** — and it is the one the research independently
flagged: T7's factor lock lists **"teammate shooting quality"** as a primary assists driver and
**"teammate competition / lineup geometry"** as a primary rebounds driver. **Neither is recorded as a
built, surviving factor.**

### ⚠ The benchmarking itself was never done for NBA
**The instruction is to check the factor list against a real, verified projection system and adopt
refinements from HOW IT IMPLEMENTS things** — not from its conclusions.

**NBA's research was source-rich but not system-benchmarked**: OpticOdds, Unabated, DataStreak,
RotoGrinders, Cleaning the Glass, peer-reviewed papers, Gemini. **All of these are sources of
findings; none is a working projection system whose implementation was studied.**

**The named MLB benefit was implementation detail** — *"studying how that system actually implements
things"* produced the matchup-specific-vs-aggregate distinction, which is precisely the kind of
structural choice a paper does not give you. **NBA has public equivalents available** (DARKO is already
used as a data source, and its methodology is published).

**Recorded in `NBA_OPEN_ITEMS.md`.**

---

## 7p. TWO BUILD-DISCIPLINE PRINCIPLES
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

> ⚠ **STATUS 2026-09-20 (T1 pass 36): this principle is NOT HOLDING in NBA.** **VERIFIED** by grep of
> all 190 `.py`/`.js` files plus the MCP admin bridge: **`nba_config.factor_registry` (67 rows),
> `factor_relevance` (460), `factor_profile_cells` (35) and `classification_config` are read by
> NOTHING** — those strings appear zero times in the codebase. `factor_profile_cells` is documented as
> holding *"the fitted lifts/penalties, in exactly MLB's cell form"*; **no code loads them.** The only
> `nba_config` table anything reads is `external_credentials`.
> **The principle below is the design. It is not the live behaviour.** Full entry, with a measured
> config-vs-code diff on the decay parameters: `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 36*.

### 1. Every tunable parameter gets its OWN DATABASE COLUMN
> *"**Every tunable numeric parameter gets its OWN DEDICATED DATABASE COLUMN, NEVER embedded as a
> LITERAL NUMBER INSIDE AN OPAQUE FORMULA-EXPRESSION STRING** — **this is what actually LETS A
> CALIBRATION LOOP ADJUST ONE SPECIFIC VALUE DIRECTLY rather than needing to PARSE AND REWRITE A
> FORMULA STRING.**"*

**This is the mechanical reason behind the owner's no-hardcoding rule**, and it is stronger than
"config is tidy": **a calibration loop cannot tune what it cannot address.** A value inside a formula
string is unreachable to an automated adjuster.

**✅ NBA follows it** — `factor_profile_cells` has **dedicated `cap` / `lift` / `penalty` /
`coefficient` columns**, and `stat_decay_config` gives each of `ewma_alpha`,
`min_lookback_games` and `shrinkage_stabilization_games` its own column.

**⚠ Where it is violated**: the certified recipes hold `MAX_TIERS`, `MIN_PER_TIER`, `TIER_BLEND_K`,
`SHIFT_LAMBDA`, `BLOWOUT_MARGIN`, `COMPETITIVE_MARGIN` and `LADDER_DEPTH` **as Python literals**.
They are env-overridable, **but not addressable by a calibration loop** — which is precisely the
capability this principle exists to preserve.

### 2. ⚠ AN UNAVAILABLE FACTOR MUST SAY SO — never a silent zero
> *"**When a factor CANNOT BE HONESTLY IMPLEMENTED because the real underlying data DOESN'T EXIST
> YET, SAY SO EXPLICITLY IN THE SYSTEM ITSELF** — **a clearly-labelled 'NOT YET AVAILABLE, NO VERIFIED
> DATA SOURCE' status** — **rather than APPROXIMATING IT WITH A GUESS or SILENTLY LEAVING IT AS A
> MISLEADING ZERO.**
> MLB found and named several such honest gaps: **an umpire-tendency factor HARDCODED TO AN EXPLICIT
> 'UNAVAILABLE' STATUS**, **a wind-direction factor BLOCKED ON MISSING PARK-ORIENTATION REFERENCE
> DATA** — **rather than faking plausible-looking values for either.**"*

**⚠⚠ NBA has the exact situation the umpire example describes, and it is NOT labelled.**
| Factor | State | Labelled? |
|---|---|---|
| **Altitude** | `arenas.altitude_ft` — **0 of 30 populated** | ❌ **no status; the column is simply empty** |
| **Jet lag / travel direction** | `arenas.timezone` — **0 of 30 populated** | ❌ no status |
| **D1 — referee tendency** | capture built, **0 rows until the season** | ⚠ *known* to be empty, but no explicit status field |
| Tier C props (first basket, high scorer) | *"need play-by-play we don't have"* | ✅ **correctly excluded from the taxonomy entirely** |

**An empty column and a declared "unavailable" status are different things.** A factor reading an
empty column produces **a silent zero or a NaN** — which is exactly the *"misleading zero"* named here,
**and exactly what the `stddev(factor_value) > 0` check exists to catch.**

**The MLB precedent is the model**: the umpire factor was **hardcoded to an explicit `unavailable`
status** — present in the registry, visibly not contributing, impossible to mistake for a measured
zero. **`nba_config.factor_registry` has 67 rows and could carry the same field.**

---

## 7q. THREE STANDING SEARCH / EVALUATION DISCIPLINES
*Source: T1, blueprint §4f — "two real, honest self-corrections worth adopting as standing search
disciplines." Recorded 2026-09-20.*

### 1. ⚠ "I searched every worker file I could think of" ≠ "I searched everywhere functionality could live"
> *"MLB found a real case where **an initial, CONFIDENT claim that 'NO AUTOMATED MINING WORKER EXISTS'
> for a specific data source WAS WRONG** — **the actual mining logic existed as AN INTERNAL STEP
> INSIDE A LARGER, DIFFERENTLY-NAMED RUNNER FILE, INVISIBLE TO A FILE-NAME-PATTERN SEARCH.**
> **Before concluding a piece of functionality DOESN'T EXIST anywhere in the NBA codebase, CHECK THE
> INTERNAL STEP LISTS OF LARGER RUNNER/ORCHESTRATOR-STYLE FILES TOO, not just file names that sound
> like they'd contain it.**"*

**⚠ This bears directly on several open items in this documentation.** Conclusions of the form *"X is
not recorded as built"* rest on transcript reading and targeted greps. **The named failure is
precisely a confident negative about a worker's existence.**

**Specific NBA cases where the functionality could be hiding inside a larger file:**
| Open conclusion | Where it could still live |
|---|---|
| *"no validation step between grading and the refit"* | inside `build_asof_calibration.py` itself |
| *"no magnitude sanity check on the fitted shift"* | inside the same refit script |
| *"no RSS aggregation"* | inside `build_final_hp.py`'s combination step |
| *"the P1 loader question"* | inside a writer Worker's own cron/`scheduled()` handler |
| *"dud mixture not implemented"* | ✅ **this one WAS checked by grep of the actual recipe** — 0 matches for `dud|mixture|p_dud` |

**The discipline to apply before treating any of these as settled**: read the internal step list of
the relevant runner, not just search for a file named after the function.

### 2. ⚠ Never assume a field name transfers across data providers
> *"MLB found a real case where **a mining plan was built around A SPECIFIC EXPECTED COLUMN NAME from
> ONE PLATFORM'S PUBLIC TERMINOLOGY**, and **had to be corrected once the ACTUAL TARGET PLATFORM'S
> REAL, LIVE COLUMN LIST WAS CHECKED DIRECTLY** and found to use **DIFFERENT TERMINOLOGY WITH A
> GENUINELY DIFFERENT DEFINITION — NOT JUST A RENAME, A DIFFERENT UNDERLYING CALCULATION.**
> **Before building ANY NBA data-mining pipeline around an assumed field from a new data source,
> VERIFY THE ACTUAL, CURRENT COLUMN/FIELD LIST DIRECTLY AGAINST THAT REAL SOURCE**, not against
> terminology borrowed from a different platform or from memory."*

**✅ NBA learned this the hard way, repeatedly, and the record is consistent with the warning:**
- *"**Documented columns may simply not exist any more** — dump the real response before patching a
  parser"* (`ARENA`/`ARENACAPACITY` gone from the standings endpoint)
- **The team advanced table has no `usg_pct`/`reb_pct`** — the mapper wrote nonexistent columns
- **The bio file uses `players`/`player_id`/`age`, not `records`/`PLAYER_ID`/`AGE`** — every age NaN
- **`leaguedashplayershotlocations` returns `resultSets` as a DICT, not a list**

**The stronger half of the warning is "not just a rename — a different underlying calculation."**
That is the **prop-definition mismatch** problem (lesson #14) applied to source fields rather than to
props: **the same name can mean a different computation.**

### 3. Check a candidate factor for REDUNDANCY before building it
> *"**Explicitly CHECK FOR REDUNDANCY with what already exists**:
> **(a) is the proposed new signal ACTUALLY JUST A NOISIER PROXY for an outcome the system ALREADY
> MEASURES DIRECTLY** (in which case adding it **contributes little**)?
> **(b) does REAL PUBLISHED RESEARCH show combining it with an existing signal ACTUALLY ADDS
> PREDICTIVE VALUE — OR NOT?**
> **(c) is its INTENDED EFFECT ALREADY IMPLICITLY CAPTURED BY A DIFFERENT, ALREADY-EXISTING
> MECHANISM?** — MLB found **a real case where a proposed new signal's ENTIRE BENEFIT was already
> captured by an existing mechanism APPLIED EARLIER IN THE PIPELINE, making the new signal GENUINELY
> redundant, not just partially so.**
> **Run this evaluation EXPLICITLY for EVERY NBA factor candidate BEFORE building it** — **several
> real, well-reasoned rejections came DIRECTLY out of this discipline, NOT from skipping factors
> arbitrarily.**"*

**Three distinct questions, and (c) is the one that caught NBA's factors.** *"Already captured by a
different mechanism **applied earlier in the pipeline**"* describes every rejection:
| Factor | Earlier mechanism that already captured it |
|---|---|
| **A5 — lineup change** | *"the allocator's **recent-5 minutes already encode starting**"* |
| **A3 — return ramp** | applied in the **baseline** as a minutes multiplier |
| **home / back-to-back** | *"**the minutes model already carries them**"* — measured ≈0 |
| **A2 — teammate redistribution** | the baseline's own minutes history |
| **B4 — opponent availability** | closed in three formulations, 0 of 5 props |

**Note (b) specifically asks whether published research supports the COMBINATION, not the factor
alone** — a factor with real standalone support can still add nothing on top of what exists. **That is
the two-test paradox (§7e) as a pre-build question rather than a post-hoc measurement.**

**Applying (a)–(c) BEFORE building would have saved the five A2 panels and the three B4
formulations.** Three questions, cheaper than every gate run they replace.

---

## 8. THE TWO NON-NEGOTIABLE FACTORS THAT DID LAND

### 8.1 Blowout — on the REAL market spread
Upgraded from the **r=0.46 derived proxy** to the **real market spread** *(🔴 **the coverage figure below is
corrected 2026-09-21 by §T11.12b: 2,454 of the 2,460 games in `nba_market.schedule_norm` is
**99.76%**, not 100% — the "100%" counted the games that were MAPPED, i.e. a denominator taken from
the numerator's own table. Six games are unmapped, and `game_lines_closing` is shorter still at
2,410 = 97.97%. The measurements themselves are unaffected in kind; the sample is 99.76% of the two
seasons rather than all of them.*)* (307,604 rows, 2,454 games,
100% coverage).
- A **13+ favourite blows the game open 39.7%** vs **0.4%**
- **Winning blowouts cost starters MORE minutes than losing ones** (ratio 0.8748 vs 0.9124)
- **Competitive games run starters +3.3% ABOVE baseline** (`v1 = 1.0333`)

**⚠ DataStreak's "the favourite's starters hit hardest" did NOT reproduce on our data** — favoured
starters **47.7%** over-rate, underdog starters **39.4%**. *"The losing side is benched **and** played
badly to get there."* **Minutes-wise the favourite is hit harder; outcome-wise the underdog is.**
The engine keys on **minutes**, so it captures the real mechanism.

### 8.2 Matchup — via market-implied totals
**`f_impl_own` / `f_impl_opp` = `total/2 ∓ spread/2`.**
**r = 0.4637 vs 0.2364 for the derived form** — the market-implied version is nearly twice as
correlated.

**This is step 5 of the T4 methodology** (*"anchor to team-implied totals… a real fix a practitioner
reported needing after getting 'wild numbers' from unanchored projections"*), shipping twelve
transcripts later.

---

## 9. SCENARIO PRECOMPUTE — measured, then dropped as a daily job

**`nba_score.scenario_realised`** — 1,942 rows; **only the realised branch is stored**.
**The finding stands**: with three uncertain players, **the most-likely branch is right only ~17% of
the time.**

**Dropped as a daily job** once the cutoff collapsed to one window: *"enumerate every availability
branch now, SELECT the realised one at a later window"* has no selector with a single window, so
enumeration (~0.5–1M rows/day) is pure cost. **N1 probability-weighted availability carries the
residual uncertainty instead.**

---

## 10. DATA FRESHNESS — dropped, with a reason

At a **single 1:15 PM PT cutoff every leg carries the same report generation**, so a freshness term
**penalises uniformly and discriminates nothing**. The uncertainty it would proxy for is already priced
by N1. **Late tips do get more post-cutoff amendment, but those amendments are unusable when slips are
placed once at ~1:30.**

---

## 11. BOARD SCORING — what actually gets scored

**`nba/score_board_legs.py` → `nba_score.board_scored`** (~58k legs/day).
`game_date, season, app, player_id, player, prop, line, side, kind, tier, game_id, baseline_hp,
cal_shift, final_hp, confidence, score, edge, interpolated, built_at`.

**BOARD-SCOPED**: every leg the apps actually **offer** — all rungs, both directions,
goblins/standards/demons — **not** the full internal ±10 ladder for rungs nobody offers.
**Off-ladder rungs are interpolated in log-odds and FLAGGED** (−4 confidence).

**⚠ `norm_market()` — the mapping that nearly cost 44% of the board.**
`replace(market_key,'player_','')` yields `points_rebounds_assists`, which matches nothing (we call it
`pra`). **Six groups — 23,286 legs, 44% — would have scored NOTHING, silently.**
| Board key | Our prop |
|---|---|
| `player_points_rebounds_assists` | `pra` |
| `player_points_rebounds` | `pts_reb` |
| `player_points_assists` | `pts_ast` |
| `player_rebounds_assists` | `reb_ast` |
| `player_blocks_steals` | `stocks` |
| `player_threes` | `threes_made` |
| `player_fantasy_points` | `fantasy_score` |
| `player_double_double` | `double_double` (sentinel −1.0, no ladder) |
| period keys | `points_q1`, `rebounds_q1`, … |

---

## 13. THE VALIDATION GATE FOR ANY STRATEGY *(T1, inherited from MLB's lessons document)*

### 13.1 It must be a **DAY-LEVEL BLOCK BOOTSTRAP** — and properly VOLUME-WEIGHTED

**Lesson #6 is stated as *"one of the single highest-value lessons from the entire research
program"*, and it errs in BOTH directions.**

#### Direction 1 — pooled-leg significance is inflated
> *"**Treating same-day legs as independent observations when computing standard error INFLATES
> APPARENT SIGNIFICANCE BY 3–5×**, because **legs within a day are correlated (a strong slate lifts
> everything together)**. Multiple cases of **a pooled Z-score of 3–5+ collapsing to a clustered
> t-statistic under 1.5** once properly clustered by day.
> **Always compute significance at the DAY level — treat each day as one observation, N = number of
> DAYS, not number of legs.**"*

#### Direction 2 — an UNWEIGHTED day-level test causes FALSE REJECTIONS
> *"**But a naive, UNWEIGHTED day-level test — treating a 7-leg day and a 38-leg day as equally
> informative observations — is itself a real, CONFIRMED SOURCE OF FALSE REJECTIONS**, not just a
> conservative simplification: **a real case where an unweighted daily t-test FAILED (t = 1.573) on
> data where a VOLUME-WEIGHTED version of the identical test PASSED DECISIVELY (t = 2.755)** — **an
> adversarial review caught this specific flaw.**
> **The correct method WEIGHTS each day's contribution.**"*

| Method | Error |
|---|---|
| Pooled at leg level | **inflates significance 3–5×** → false positives |
| Day level, **unweighted** | **t = 1.573 vs 2.755** on identical data → **false rejections** |
| **Day level, volume-weighted** | correct |

**⚠ This is the second recorded instance of over-strictness as a real error** — lesson #9 names the
same asymmetry from the other side. **Neither direction is the safe default.**

**Consequence for the bootstrap**: resample **entire days with replacement** — *"never individual
legs, which would reintroduce the same-day correlation problem"* — **and weight each day by its
volume.**

**The method, exactly as stated:**
> *"**The correct method WEIGHTS EACH DAY'S CONTRIBUTION BY ITS REAL LEG VOLUME when computing the
> day-level mean AND variance**, not by treating every day as an equal-weight data point.
> **Use day-level clustering to avoid PSEUDO-REPLICATION, but WEIGHT DAYS BY VOLUME WITHIN that
> clustering — doing only ONE HALF of this correctly can produce a wrong answer IN EITHER
> DIRECTION.**"*

**Both halves are required, and they guard different errors:**
| Half | Guards against |
|---|---|
| **Day-level clustering** | **pseudo-replication** — inflated significance (3–5×) |
| **Volume weighting within the clustering** | **false rejection** — t = 1.573 vs 2.755 |

**And the bootstrap is the stated successor**: *"the current, more rigorous standard **beyond a simple
weighted t-test**: a day-level block bootstrap."* **So the weighted clustered t-test is the floor, not
the target.**

### 13.2 The three conditions — all of them, not any one
> *"**The decisive gate: at least 95% of resamples positive, a 95% confidence interval whose lower
> bound sits ABOVE the breakeven point, and a leave-one-day-out check that never goes negative
> excluding any single day. ALL THREE CONDITIONS TOGETHER, not any one alone.**"*

| Condition | Guards against |
|---|---|
| **≥95% of resamples positive** | a result driven by ordering or a lucky run |
| **95% CI lower bound ABOVE breakeven** | a positive mean not distinguishable from break-even |
| **Leave-one-day-out never negative** | **a single day carrying the whole edge** |

**The third is the one most often skipped and most often fatal** — one outlier slate can make a season
look profitable.

### 13.3 The companion sanity test
From the multiplier work (`NBA_MULTIPLIERS.md` §0.3): compute `p × m`. If it implies the platform is
handing out a systematic edge on a liquid, repeatable line, **the multiplier attribution is wrong, not
the market.**

**Two real failure examples from MLB, both caught this way:**
- a result that *"**implied a payout below breakeven for even the highest-quality legs available — an
  absurd, unusable outcome**"*
- a result that *"**implied a selectivity that didn't actually exist**"*

**Status**: this gate applies to the **slip-strategy phase**, which has not begun. Nothing in the
baseline or scoring calibration has been through it, because it measures **profitability**, not
**honesty** — and calibration is the honesty property (§9).

---

## 14. THE STATISTICAL STANDARD, CONSOLIDATED

Every guard across both calibration documents, in the order they must be applied:

| # | Guard | Source |
|---|---|---|
| 1 | **Verify the factor has variance** — `stddev(factor_value) > 0` | T1 — *"cheap, and MLB never did it proactively"* |
| 2 | **Declare `relevant_prop_keys`** — never apply blindly | T1 → `factor_relevance`, 460 rows |
| 3 | **Fix leakage** — as-of contamination inflates apparent skill | 3 instances in this system |
| 4 | **Fix circularity** — tier-mate-relative measures are circular | T8: k≈2 vs k≈100–250 |
| 5 | **PRE-REGISTER the deciding test** | T1 |
| 6 | **Use MARGINAL contribution, not residual correlation** | T1 — the two-test paradox |
| 7 | **Sign must be consistent across seasons** to keep a cell | T8 — structure vs regime |
| 8 | **Disaggregate — rung aggregates hide cancelling errors** | T8 |
| 9 | **Test new factors against the props that already PASS first** | T9 |
| 10 | **Day-level block bootstrap** — resample days, never legs, **and weight by volume** | T1 #6 |
| 11 | **All three bootstrap conditions**, incl. leave-one-day-out | T1 |
| 12 | **`p × m` house-edge sanity test** | T1 |
| 13 | **Confidence-tier every record** — don't let one-offs harden | T1 |

**Items 1–9 gate a FACTOR. Items 10–13 gate a STRATEGY.**
**Nothing in the current system has been through 10–13**, because the slip-strategy phase has not
begun — and that is correct sequencing, not an omission.

---

## 14. THE RESEARCH STANDARD — all **27** lessons *(T1, `NBA_LESSONS_LEARNED_FROM_MLB.md`, Part A)*

**⚠ COUNT CORRECTION, 2026-09-20 (T1 pass 30). This heading read "all 26 lessons." Part A has 27.**
**VERIFIED** two ways on 2026-09-20: a direct grep of the source document
(`grep -c "^### [0-9]\+\." NBA_LESSONS_LEARNED_FROM_MLB.md` → **27**), and a grep of T1 itself, which
carries `### 27.` inside its pasted copy. **The "26" figure propagated from the work order into this
document and was never checked against the file.** **Lesson #27 had no entry anywhere in the twelve
documents** — it is added below, at the end of the list.

**⚠ AND THE PART LIST IS ALSO INCOMPLETE.** Every reference in these documents says *"Parts A–F."*
The current `NBA_LESSONS_LEARNED_FROM_MLB.md` carries **Parts A, B, C, D, E, F, G and H**:
- **Part G — "Lessons earned by the NBA baseline work itself (2026-09-09), now part of the standard"** — **10 numbered lessons**
- **Part H — "Lessons from the enrichment backfill, market and board-sourcing phase (2026-09-10)"** — **12 numbered lessons**

**Both POSTDATE T1** (2026-09-03), so they are **not T1 material** — they were appended by the
sessions that became **T7–T11**, and they are swept with those transcripts, not here. **They are
recorded now so the gap is not lost**: `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 30*. **The research
standard is 27 lessons + 22 NBA-earned lessons across Parts G and H = 49 numbered items, of which
this document currently carries 27.**

**Part A's own preamble, which sets how the standard must be used:**
> *"**The complete research standard (apply to EVERY NBA strategy candidate).**
> **This standard was built incrementally, EACH ITEM ADDED AFTER A REAL MISTAKE EXPOSED THE GAP IT NOW
> CLOSES. APPLY ALL OF THEM TOGETHER, EVERY TIME, NOT SELECTIVELY.**"*

**Two things follow.** Each lesson is a scar, not a preference — so **none is optional on the grounds
that it seems unlikely to apply here**. And the standard is **cumulative**: applying a subset is the
failure mode it was built to prevent, since every item exists because a prior effort skipped it.

**The document is described in the startup plan as *"the single most important document in this
transfer package — a research standard built the hard way, across dozens of strategy candidates,
almost all of which looked real at first and were later found to be artifacts."*** The plan requires
*"the full standard… **from the very first candidate**, not as a later addition once shortcuts have
already been taken."*

| # | Lesson |
|---|---|
| **1** | **The fair-odds gate — apply FIRST, before any hit-rate analysis** (`p × m`; see `NBA_MULTIPLIERS.md` §0.3) |
| **2** | **Never apply a tier/pool-level multiplier to a heterogeneous population** — MLB's costliest error; use `Σ wᵢ(pᵢ·mᵢ)` per cell |
| **3** | **Multiple, genuinely DIFFERENT research passes per candidate** — *"not the same query with a different threshold"* |
| **4** | **Gemini as a genuine ADVERSARY, not a rubber stamp** — *"asked to SET ITS OWN [test/criteria]"* |
| **5** | **The three-check discipline on every number before reporting it** — (a) correct lane/join, (b) …, (c) … |
| **6** | **Statistical significance done properly — DAY-LEVEL clustering, not pooled-leg-level, AND properly volume-weighted** |
| **7** | **Multiple-comparisons correction, scaled to what was ACTUALLY SEARCHED** |
| **8** | *(sequence continues)* |
| **9** | **Check your OWN statistical treatment for bias IN BOTH DIRECTIONS, not just for being "too strict"** |
| **10** | **Enumerate every possible data source before declaring something "untestable"** |
| **11** | **A plausible causal story is NOT evidence — test it directly, including your own** |
| **12** | **Same-game correlation is real but usually SMALLER than DFS-community folklore suggests** |
| **13** | **Platforms price probability DIRECTIONALLY but NOT PROPORTIONALLY** — *"a real, load-bearing finding"* |
| **14** | **Prop-definition mismatches across platforms are a real, repeated trap** — verify each platform's own formula |
| **15** | **Before trusting any grouping key or join in a new table, sanity-check that it actually ISOLATES [what you think]** |
| **16** | **Real backtest results, however rigorous, still need REAL-MONEY confirmation** |
| **17** | **Report the RANGE a finding actually spans, not the single best number found while searching** |
| **18** | **A concrete sample-size posture as a mechanical default for NBA** |
| **19** | **Language strength must NEVER exceed evidence strength** — *"a standing, mechanical discipline"* |
| **20** | **Define "success" against the honest baseline of NOT HAVING the component at all** |
| **21** | **Consult Gemini to check your METHOD, then RE-DERIVE [independently]** |
| **22** | **Always include a genuine CONTROL/BASELINE case**, and treat it as a required sanity check |
| **23** | **When an anomaly involves an interaction between two things, isolate it by RE-PAIRING each** |
| **24** | **Distinguish durable QUALITATIVE platform mechanics from exact NUMERIC values that drift over time** |
| **25** | **A "safety margin" can compound into an absurd result once exponentiated** |
| **26** | **Explicitly track a finding's CONFIDENCE TIER** — *"'first real pass' and 'independently re-validated' are NOT the same claim"* |

### The ones this project has already proved the hard way

#### ⚠ #15 IS THE DOMINANT FAILURE MODE — six separate instances in MLB alone
> *"**The DOMINANT SINGLE FAILURE MODE across MLB's entire research program (at least SIX distinct,
> separately-discovered instances) was a GROUPING KEY OR JOIN THAT FAILED TO ISOLATE the spec[ific
> thing it claimed to].**"*

**NBA has already had at least four of its own:**
| Instance | Effect |
|---|---|
| `norm_market()` naive `replace('player_','')` | **23,286 legs — 44% of the board — scored nothing, silently** |
| The splits PK omitting `season` | only one season can ever exist |
| The lineup PK omitting `team_id` | traded players collide (**failed loudly** — the good case) |
| The gap sample grouping on `matchup` | every game listed twice |

**This is the bug class to look for first in any new table.** *"Before trusting any grouping key or
join, sanity-check that it actually isolates what it claims to."*

#### #18 — THE SAMPLE-SIZE POSTURE, adopt as a mechanical default
> *"**fewer than 15 real days is NOT YET A RESULT AT ALL; 15–30 days is DIRECTIONAL ONLY; 30–70 days is
> usable WITH REAL CAVEATS STATED; 70+ days is GENUINELY REPORTABLE.**
> **Days of real, distinct data matter FAR MORE than total leg count — a large leg count concentrated
> in a handful of days is A SMALL-SAMPLE FINDING WEARING A LARGE-N DISGUISE.**"*

**This is the standard the NBA season should be measured against from opening night**, and it explains
why the bootstrap resamples **days**, not legs (§13.1).

#### #5 — the three checks on every number before reporting it
**(a) Correct lane/join** — *"via a VALIDATED JOIN, not a raw flag that may be stale or wrong"*
**(b) Corrupted/known-bad day exclusion** — exclude any day with a confirmed data-quality issue
**(c) Day-robustness / leave-one-day-out** — *"a pooled, aggregate result can be **entirely carried by
one or two outlier days**; always break down by day and check the sign holds broadly."*

**Check (a) is the guard against #15.** Check (c) is the same instinct as the bootstrap's third
condition, applied to every number rather than only to strategies.

#### #10 — enumerate every data source before declaring something untestable
*Stated in the source as **"the second-highest-value lesson from the whole program."***
> *"MLB repeatedly **assumed a question was unanswerable from real data, then later discovered
> HUNDREDS TO TENS OF THOUSANDS of relevant real rows sitting in a table nobody had checked**, because
> **the search stopped at the first or most obvious table**. Before concluding 'untestable',
> **systematically list every schema/table that could plausibly hold the answer** — **check what code
> actually WRITES where, INCLUDING TABLES THAT A GIVEN PIPELINE STAGE EXPLICITLY SKIPS — that's often
> exactly where undiscovered real data hides** — **don't stop at the first negative result.**"*

**NBA instances of the pattern:**
- `player_game_starter_status.comment` held **5,500+ labelled absence reasons** (4,319 coach's
  decisions, 975 DND-Injury) as a byproduct of the starter backfill — found only by inspecting the
  column.
- `nba_ref.arenas.altitude_ft` and `.timezone` are the inverse case: **columns that exist and are
  empty**, which a source enumeration would also surface.
- The T7 audit method — *"checking actual row counts across every table in every NBA schema, to catch
  anything that **exists structurally but is empty or stale**"* — is this lesson as a procedure.

#### #17 — report the range, not the best number found while searching
> *"Sweeping many cells, thresholds, or windows and **reporting only the maximum found is itself a
> form of selection bias**, distinct from but related to the multiple-comparisons correction in #7 —
> a real, concrete case of **a headline result (+106% over a 15-day window) shrinking to +52% once the
> window was honestly extended to 24 days**, **purely because the original number had been THE PEAK OF
> A SEARCH, not a stable estimate**. **Report the full range or the honest current estimate across all
> data available.**"*

**Figures as stated:** +106% over 15 days → **+52%** over 24 days.
**Related**: Rule B0c requires the same output for tie-break order — *"and the range reported."*

#### #1 — the fair-odds gate, applied FIRST
> *"Before trusting any high hit-rate finding, compute the implied house edge: **`p × m`**… If this
> implies the platform is handing out a large, systematic edge on a repeatable, high-volume line,
> **the multiplier attribution is wrong, not the market.**"*
Recorded in full at `NBA_MULTIPLIERS.md` §0.3.

#### #3 — multiple, genuinely DIFFERENT research passes per candidate
> *"**not the same query with a different threshold.** For each candidate signal, test:
> **raw historical hit rate vs the model's own probability estimate**; **player-level vs
> prop-line-level pooling**; **single-factor vs multi-layered combinations**; and **any
> domain-specific interaction** (MLB tested lineup-slot interaction because a real, documented gradient
> exist[ed])."*

**Four named axes for a genuinely different pass:**
| Axis | The two sides |
|---|---|
| Measurement | raw historical hit rate **vs** the model's own probability estimate |
| Pooling level | player-level **vs** prop-line-level |
| Structure | single-factor **vs** multi-layered combinations |
| Interaction | any domain-specific gradient known to exist |

**The NBA analogue of the fourth axis**: the M1 defender factor was found to work **only in the
INTERACTION form, never as a main effect** — which is this axis producing the result.
**And the second axis is the one Part C member #3 warns about** — pooling level changes the answer.

#### #4 — Gemini as a genuine adversary, used correctly
> *"Gemini should be asked to **SET ITS OWN FALSIFICATION BAR BEFORE SEEING THE RESULT** — **minimum
> sample size, required monotonicity, minimum edge over baseline** — **then the actual number is
> checked against that pre-stated bar.** Work in **MULTIPLE SMALL PASSES, not one large dump** — the
> explicit, repeated lesson was that **large single prompts ca[n]**…"*

**Three components of a pre-stated bar, named:** minimum sample size · **required monotonicity** ·
minimum edge over baseline.

**And the working interaction pattern, as stated:**
> *"**large single prompts caused DRIFT**; the working pattern is: **present data + sharp questions →
> get a diagnosis → reference that diagnosis EXPLICITLY in a follow-up pass for the next specific
> piece, WITHOUT RE-PASTING EVERYTHING.**"*

> *"**Gemini is valuable but NOT INFALLIBLE IN EITHER DIRECTION** — real cases of **Gemini correctly
> catching an analyst's own contamination the analyst missed**, and separate real cases of **Gemini
> being WRONG about a proposed [approach]**."*

**"Not infallible in either direction" is borne out in the NBA record**, which contains both:
| Gemini correct | Gemini wrong |
|---|---|
| surfaced garbage-time filtering (T2) | 1,230-call estimate for advanced stats — actually **2 bulk calls** (T4) |
| surfaced the schedule as *"the chassis"* (T3) | *"starters are inferable from game logs via `GS`"* — false (T5) |
| surfaced peer-reviewed altitude / jet-lag factors (T7) | *"Team Pace still needed"* — already covered (T5) |
| **self-corrected its own earlier on/off ranking** (T3) | *"tier globally"* — contradicted the proven per-combo architecture (T7) |
| gave the Shot Quality Delta methodology (T3) | *"potential assists aren't in our data"* — they are (T7) |
| proposed halftime foul count → **correctly rejected as in-game data** (T9) | |

**This is pre-registration (§7f) delegated to the adversary** — the bar is set by a party that has not
seen the result. **#21 completes the loop**: check the **method**, then **re-derive the conclusion
yourself**.

**Recorded NBA usage matches the adversarial framing** — the transfer list names *"the Gemini
adversarial-review usage pattern"*, and T3 records asking it *"to be skeptical rather than just keep
validating more searches."*
**What is not recorded**: any instance of Gemini being asked to state a falsification bar **before**
seeing a result. **The NBA uses were synthesis and critique, not pre-stated bars.**

#### #7 — multiple-comparisons correction, scaled to what was ACTUALLY searched
> *"When scanning many cells/props/thresholds for the best-looking result, **the significance bar must
> scale with how many things were searched** (Bonferroni or equivalent). **A single, PRE-REGISTERED
> confirmatory test on ONE specific cell should use an UNCORRECTED bar** — **using a scan-level bar on
> a single confirmatory test is ITSELF AN ERROR** (a real case: **a 40-cell-scan-corrected bar was
> wrongly used on what was actually a single pre-specified test, making a real, borderline-positive
> result look FAR MORE REJECTED than the evidence warranted**)."*

**So the correction is symmetric in its own way — both under- and over-correcting are errors:**
| Situation | Correct bar |
|---|---|
| **Scanning many cells for the best-looking result** | **corrected** (Bonferroni or equivalent), scaled to how many were searched |
| **A single, pre-registered confirmatory test** | **UNCORRECTED** — applying a scan-level bar here is an error |

**This is the third recorded instance of over-strictness being a real error** (#6's unweighted
day-test, #9's moving goalposts, and this). **And it makes pre-registration do double duty**: it is
both the guard against re-specifying after seeing the result (§7f) *and* the thing that earns an
uncorrected bar.

**NBA state**: the factor gate scanned many **prop × band × side** cells. **No correction is recorded**,
and **no per-cell pre-registration is recorded either** — so neither branch of #7 has been applied.
Recorded in `NBA_OPEN_ITEMS.md`.

#### #8 — "insufficient data / underpowered" is a DISTINCT verdict from "confirmed negative"
> *"**Don't collapse them.** A **non-significant result with a wide confidence interval that still
> contains a materially positive value is NOT the same as a confirmed-zero effect**. **State the
> actual POWER CALCULATION** (how many days would be needed to detect the effect size in question)
> **and track genuinely underpowered candidates in their own lis[t]**."*

**Direct relevance to the ten rejected enrichment factors.** `nba_score.factor_gate_results` stores
`n`, `log_loss`, `brier`, `gain_vs_anchor` and `shrink_beta` — **so the sample size is recorded per
verdict**, but the transcripts record the outcomes as rejections rather than splitting them into
*confirmed negative* vs *underpowered*.

**Two of the ten have stated sample constraints that suggest the distinction matters:**
- **A2** — the design specified confidence tiers on shared-absence games (**<5 / 5–14 / 15+**),
  because a with/without table on fewer than five games is close to noise.
- **B4** — *"closed in three formulations, 0 of 5 props"*, with no recorded power figure.

**What #8 asks for and is not recorded**: a power calculation per closed factor — *how many days would
be needed to detect an effect of the size in question* — and **a separate list for underpowered
candidates** rather than one rejection bucket.

**Note the opposite risk is also recorded** (#9): applying a stricter test only to surprising results
is its own bias. **#8 and #9 together say: keep the bar fixed, and classify the outcome honestly.**

#### #9 — **MOVING THE GOALPOSTS ONLY WHEN SOMETHING LOOKS PROMISING IS ALSO BIAS**
> *"MLB found and named a specific, subtle failure mode: **introducing a stricter statistical test
> SPECIFICALLY BECAUSE a result survived further than expected** (**moving the goalposts only when
> something looks promising**) **is a real form of bias, distinct from and just as important to avoid
> as being too lenient** on a promising-looking result. **When you find yourself reaching for a new,
> more ri[gorous test]…**"*

**Over-strictness is not the safe direction.** The asymmetry is what makes it bias: applying the harder
test **only** to results you did not expect systematically rejects real findings while letting
expected ones through unchallenged.

**The discipline this implies**: decide the test **before** seeing the result (#5's pre-registration),
and if a new check is genuinely warranted, **apply it to everything already accepted**, not only to the
surprising case.

**⚠ Directly relevant to this project's rejections.** Ten enrichment factors were rejected and the
anchor won every slice. **That is a legitimate outcome — but the guard against it being partly an
artifact is that `gain_vs_anchor`, `log_loss` and `brier` were fixed as the metrics before any factor
ran**, and every verdict lands in `factor_gate_results`. **The pre-registration is what makes the
rejections trustworthy**, not the rejections themselves.

#### #11 — **"MECHANISTICALLY COHERENT" IS A TRAP, NOT A CREDENTIAL**
> *"The **'mechanistically coherent' trap**: a prop's apparent correlation strength tracked a real,
> **physical-sounding narrative** (**a composite stat *should* correlate more with game environment**)
> that turned out to be **a pure artifact of a different confound — LINE-THRESHOLD VARIANCE — once
> tested properly**. **The physics-plausible story should have raised SUSPICION, NOT CONFIDENCE**,
> once **an independent check — DOES THIS ORDERING MAKE PHYSICAL SENSE GIVEN WHAT COMPONENTS ARE
> SHARED ACROSS PROPS — was available.**
> **Test your own favoured explanation with the same rigor you'd apply to someone else's.**"*

**The confound is structural**: props sit at different line levels, and **variance differs by line
level by construction** — so any cross-prop comparison that does not control for it manufactures an
ordering.

**The independent check is also named**: *does the ordering make physical sense given **what
components are shared across props**?* **Directly applicable to NBA's combos** — PRA shares components
with points, rebounds and assists, so an apparent PRA-vs-points difference may be a shared-component
artifact.

**A2 is the NBA instance of the trap**: a physically obvious mechanism (a teammate sits, his minutes
go somewhere) that failed five panels and *"worst where the mechanism predicted it should win."*

**A good story is a reason to test harder, not to believe.** And the confound named —
**line-threshold variance** — is structural: props with different line levels have different variance
by construction, so any cross-prop comparison that does not control for it will manufacture an effect.

**A2 is the NBA instance**: a physically obvious mechanism (a teammate sits, his minutes go somewhere)
that failed five panels and *"worst where the mechanism predicted it should win."*

#### #19 — **LANGUAGE STRENGTH MUST NEVER EXCEED EVIDENCE STRENGTH**
> *"…easy to **drift on gradually rather than violate all at once**: a finding that clears a **lenient
> bar should be DESCRIBED as clearing a lenient bar**, not described in the same confident language as
> one that cleared every available check.
> **If a claim needs a word like 'CONFIRMED', 'PROVEN', or 'VALIDATED', IT SHOULD HAVE ACTUALLY
> CLEARED THE FULL STANDARD IN THIS DOCUMENT** — **a strategy that merely 'AVOIDS BEING WORSE' than
> some baseline should NEVER be described using the same language reserved for one that's been shown
> to GENUINELY OUTPERFORM it.**
> **Calibrate every claim's wording to match exactly HOW MUCH SCRUTINY IT SURVIVED, not how appealing
> the underlying number looks.**"*

**Three words are gated** — *confirmed*, *proven*, *validated* — each requiring the **full standard**,
not merely a good number.

**The named trap is precise and directly live here**: *"avoids being worse"* ≠ *"outperforms"*. The
ten enrichment factors produced *"the certified anchor wins every slice"*, which establishes that
**the factors did not beat the anchor** — not that the anchor is proven superior in a stronger sense.

**Applied to this system's own vocabulary:**
| Claim | Correct word |
|---|---|
| Ladder calibration, both seasons, `0 misses of 37`, holdout with cells disabled | **certified** — cleared the stated leg-level standard |
| The four-way goblin/demon rule, 42,600 ladders | **verified** |
| Ten enrichment factors closed on `gain_vs_anchor` | **did not beat the anchor** — *not* "disproven" (#8) |
| Goblin/demon EV conclusions | **directional** — payout factors observed, not quoted from a slip (#16) |
| Flex partial tiers 4/5 = 0.5, 3/5 = 0.25 | **first pass** (#26) |
| `board_tiers_v2` | **built, unverified** |

**A mechanical discipline, not a stylistic one.** This project already distinguishes **CERTIFIED /
CLOSE / REGIME RESIDUAL / CONFIGURED-NOT-RUN / NOT-YET-CERTIFIED** per prop, and tags
`classification_config` entries **`BACKTEST-LOCKED`** when earned. **Those vocabularies exist to stop
exactly this drift.**

#### #20 — **THE BAR IS "BEATS NOT HAVING IT AT ALL" — and be willing to recommend REMOVAL**
> *"When evaluating whether **a complex component (an enrichment layer, a scoring adjustment, an
> entire strategy track)** is worth keeping, **the correct bar is whether it beats THE SIMPLEST
> AVAILABLE ALTERNATIVE — INCLUDING THE ALTERNATIVE OF NOT HAVING IT AT ALL** — **not whether it
> improves on some other, ALREADY-KNOWN-TO-BE-DEGRADED VERSION OF ITSELF.**
> [The] explicit standard for scoring-engine calibration work stated this directly: **success meant
> BEATING THE CLEAN BASELINE SIGNAL ON REAL, HELD-OUT DATA, not merely improving on the current,
> already-damaged enriched version — BECAUSE THAT SECOND, WEAKER BAR IS CLEARED AUTOMATICALLY BY
> DELETING THE COM[PONENT].**"*

**The closing clause is the whole argument**: a bar that a *deletion* clears is not a bar. If the
comparison is against a degraded version of the thing itself, removing it entirely wins — which proves
the comparison was meaningless.

**NBA implements exactly this.** `gain_vs_anchor` measures against **the certified anchor on held-out
data** — i.e. against *not having the factor* — **not against a weaker version of the factor.** That
is why ten closures are a legitimate outcome rather than an embarrassment: **the right question was
asked, and the honest answer was no.**

**And "be willing to recommend removal" has a live instance**: **A2 was RETRACTED**, not softened —
the panels were withdrawn rather than re-tuned.

**⚠ The corresponding open question** is Part F's: the bar is the anchor, and **the anchor itself has
not been leak-checked** to the standard Part F describes. *(Recorded in `NBA_OPEN_ITEMS.md`.)*

#### #21 — **THE STRUCTURED ORDER FOR AN ADVERSARIAL CONSULTATION**
> *"A specific, structured order… worked well throughout: **present the mechanics you've derived
> (INCLUDING ANY VERIFICATION ERRORS ALREADY FOUND), the signal itself and why it's believed clean,
> the full results INCLUDING EVERY CONTROL TESTED (not just the favourable ones), the specific test
> that's currently failing or in question, and END WITH DIRECT, NUMBERED QUESTIONS — explicitly
> including a version of 'AM I BEING TOO HARSH, OR TOO LENIENT?'**"*

**Five elements, in order:**
1. the mechanics derived — **including your own verification errors already found**
2. the signal, and why it is believed clean
3. the full results — **including every control tested, not just the favourable ones**
4. the specific test currently failing or in question
5. **direct, numbered questions — one of them asking "am I being too harsh, or too lenient?"**

**Element 5 is the guard against #9 and #6's over-strictness errors** — it asks the reviewer to check
the bar in *both* directions, not only for leniency.

#### ⚠ #21's nuance — a correct critique can carry an incorrect verdict
> *"**An adversarial reviewer can CORRECTLY DIAGNOSE A FLAW in your statistical method WHILE ITS OWN
> STATED FINAL VERDICT IS STILL COMPUTED USING THAT SAME FLAWED METHOD**, producing **a conclusion
> that doesn't actually follow from its own correct critique.**
> **Take a reviewer's methodological correction seriously, but ALWAYS RE-DERIVE THE ACTUAL NUMERIC
> CONCLUSION YOURSELF using the corrected method** — **don't accept a final verdict at face value just
> because the reasoning that led to it sounded right.**"*

**The failure mode is specific: the critique and the verdict come apart.** Sound reasoning followed by
a number computed the old way. **Separating "was the method criticism right?" from "is the stated
conclusion right?" is the whole discipline** — and the second must be recomputed, not accepted.

#### #22 — **A CONTROL CASE WITH A KNOWN ANSWER, as a required sanity check**
> *"MLB's original multiplier-observation study **deliberately included a real slip built ENTIRELY
> from unmodified, standard-priced legs** — with the explicit purpose of **confirming the study's own
> MEASUREMENT METHOD against a case with a known, predictable answer** (no special pricing applied at
> all). **It came back matching the** [expectation]."*

**The control validates the instrument, not the hypothesis.** A standard-priced slip has a
predictable payout; if the measurement method cannot reproduce it, nothing measured on goblin or demon
slips can be trusted. **Any NBA multiplier capture must include one standard-only slip for exactly
this reason.**

#### #23 — **RE-PAIR EACH SIDE INDIVIDUALLY BEFORE CONCLUDING**
> *"A **single specific pairing of two particular legs** produced **a result running opposite to every
> other similar pairing tested**. **Rather than either dismissing it as noise or assuming either
> individual leg was 'the problem'**, the correct diagnostic was to **RE-TEST EACH OF THE TWO LEGS
> PAIRED WITH A *DIFFERENT* PARTNER: both came back with ENTIRELY NORMAL RESULTS when paired
> differently, PROVING the anomaly was specific to THAT ONE EXACT COMBINATION**, not attributable to
> e[ither leg alone]."*

**The diagnostic is constructive, not dismissive.** Two failure responses are both named as wrong:
calling it noise, and blaming one member. **The test separates them**: if each leg behaves normally
with other partners, the interaction is real and belongs to the pair.

**NBA surfaces where this applies**: any same-game or same-team pairing finding; the M1 defender
factor (which works **only in interaction form**); and anything emerging from the
`factor × prop × tier × role_tier × direction × variation_band` cell space, where an anomaly is
by construction a property of a combination.

#### #25 — compounding safety margins
> *"a real, deployed constant applying **an extra, deliberate conservative discount ON TOP OF an
> already-real, already-conservative observed ratio** — **reasonable-looking as a single number** —
> but **once that doubly-discounted ratio was EXPONENTIATED across a full slip's worth of legs, the
> compounded result IMPLIED A PAYOUT BELOW BREAKEVEN FOR EVEN THE HIGHEST-QUALITY LEGS AVAILABLE — an
> absurd, unusable outcome that had gone unnoticed BECAUSE NOBODY HAD ACTUALLY RAISED THE SINGLE-LEG
> CONSTANT TO THE RELEVANT POWER BEFORE SHIPPING IT.**"*

**The diagnostic named is trivial and was skipped**: **raise the single-leg constant to the power of
the slip size before shipping it.** A 5% haircut per leg is **23% on a 5-pick slip**; a doubly-applied
one compounds past usability.

**Apply any conservatism ONCE, at slip level.** And **the ship-gate is one line of arithmetic** —
`constant ** n_legs` for the real slip sizes in use.

**Note this is the same failure the `p × m` gate catches from the other direction**
(`NBA_MULTIPLIERS.md` §0.3): a result implying *"a payout below breakeven for even the
highest-quality legs"* is the mirror of one implying an impossibly large edge. **Both are
attribution errors, and both are caught by computing the implied outcome before believing the
number.**

#### #27 — **FLEX-STYLE PARTIAL-CREDIT MECHANICS DIFFER PLATFORM TO PLATFORM — VERIFY, DON'T ASSUME**
*Added 2026-09-20 (T1 pass 30). **This lesson had no entry in any of the twelve documents.***

> *"MLB found **a real, concrete structural difference between platforms**: **one platform's
> partial-hit Flex payouts (for missing one or two picks out of a full slip) were FLAT, FIXED VALUES
> INDEPENDENT OF HOW LARGE THE UNDERLYING FULL-HIT MULTIPLIER WAS**, while **a DIFFERENT platform's
> partial-hit payouts SCALED PROPORTIONALLY WITH ITS OWN FULL-HIT MULTIPLIER**. **Don't assume every
> DFS platform's Flex-style partial-credit structure works the same way — VERIFY EACH PLATFORM'S
> ACTUAL MECHANIC (flat partial payouts vs. proportional-to-full-hit payouts) DIRECTLY FROM REAL
> OBSERVED DATA before building any EV model that depends on it**, since **the two structures produce
> meaningfully different expected values for the same underlying leg-hit distribution.**"*

**Why this one matters more than its position in the list suggests.** It is the only lesson that
names a **structural**, not numeric, difference between the platforms this system prices on — and
`NBA_MULTIPLIERS.md` currently holds **one observation, from one platform, treated as possibly
universal**.

**⚠ THE DIRECT COLLISION.** `NBA_MULTIPLIERS.md` §0.2 records *"two independent real observations both
showed identical partial tiers **4/5 = 0.5 and 3/5 = 0.25**… **suggests these may be flat/constant
values**"* and §0.2d builds on it: *"**the partial-tier table is the part that looks constant.**"*
**Those observations are PrizePicks.** **Lesson #27 says the flat shape is one of two structures that
exist in the wild, and that the other one scales with the full-hit multiplier.** So:
- **The "flat" finding is not contradicted** — flat is exactly what #27 says one platform does, and
  two independent observations is strong for that platform.
- **What is not licensed is the generalisation.** **Underdog, Sleeper, Betr and Fliff each need their
  own verification**, and #27 makes that an explicit requirement rather than a nice-to-have. This
  compounds with §0.2e's separate finding that **Underdog and Sleeper price per-leg dynamically**
  rather than off a flat table — a platform that prices legs dynamically is exactly the kind that
  would scale its partial tiers proportionally.
- **The consequence is EV, not cosmetics.** #27 states the two structures *"produce meaningfully
  different expected values for the same underlying leg-hit distribution."* A Flex EV model is a
  **weighted sum over the partial tiers**, so the tier shape is a first-order term, not a correction.

**Status**: **NOT RECORDED as verified for any platform other than PrizePicks.** Routed to
`NBA_MULTIPLIERS.md` §0.2h and `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 30*.
**Cross-references**: #24 (durable mechanics vs drifting numbers — **#27 is a durable mechanic, so it
is the kind that transfers**), #26 (confidence tier — the flat observation is labelled *first pass*),
#14 (prop-definition mismatches across platforms — the same trap one layer down).

#### ⚠ The two with no visible NBA implementation
- **#7 multiple-comparisons correction** — the factor gate scanned many prop × band × side cells;
  the exemption is *"a single, PRE-REGISTERED confirmatory test on one specific cell"*, and gate runs
  were not pre-registered per cell
- **#17 report the RANGE, not the best number** — *"reporting only the maximum found is itself a form
  of selection bias, distinct from but related to #7"*

---

## 16. PART E — THE CONSECUTIVE-CLEAN-PASS STANDARD *(MLB's internal work log)*

**The owner's rule for this documentation effort is MLB's own verification bar, and it is documented
in the lessons package:**

> *"MLB's own internal, continuously-updated work log documents an explicit, formal rule that is
> **STRICTER than anything captured elsewhere in this package**, and worth adopting directly as NBA's
> own standing verification bar: **before considering any system deeply verified, require a set number
> (MLB used TWO) of genuinely CONSECUTIVE CLEAN investigation passes — EACH USING DIFFERENT REAL
> SAMPLES AND DIFFERENT ANGLES — with ZERO new issues found. If any pass turns up something new, NO
> MATTER HOW MINOR, THE COUNTER RESETS TO ZERO, regardless of how many clean passes preceded it.**
> This is a materially stricter standard than 'run one thorough check and move on', and it **directly
> produced real value in MLB**."*

**Three things this pins down:**
1. **MLB used TWO consecutive clean passes. The owner set THREE for this work** — a deliberately
   stricter bar than the source standard.
2. ***"Each using DIFFERENT real samples and DIFFERENT ANGLES"*** — a pass is not a re-run. **Repeating
   the same query is not a second pass.** *(This is why the targeted-sweep approach on T1 needed 23
   passes before a full sequential read could even begin to count.)*
3. **"No matter how minor" resets the counter** — the rule is explicit that severity does not matter.

**This is also lesson #3 in operational form** — *"multiple, genuinely different research passes per
candidate — not the same query with a different threshold."*

## 17. THE SINGLE MOST VALUABLE STANDING HABIT

> *"**Whenever an early result looks unexpectedly strong, or an aggregate number looks structurally
> odd, DECOMPOSE IT BY EVERY PLAUSIBLE CONFOUNDING DIMENSION — day, prop, tier, variant, player —
> BEFORE BELIEVING IT.** **This exact discipline caught the MAJORITY of MLB's false positives** before
> they were reported or acted on."*

**Five named dimensions: day · prop · tier · variant · player.**

**This is the same instinct as *"rung-aggregates hide errors"*** (T8), generalised: an aggregate that
looks good can be the average of a large positive and a large negative, or can be carried by one
sub-group. **Decomposition is the default response to a strong result, not a follow-up.**

**Applied in this system already**: the leg-level standard disaggregates by **band × direction ×
rung**; the factor gate reports per **slice**; the bootstrap's leave-one-day-out condition covers
**day**. **The dimension with the least coverage is `variant`** — i.e. goblin/standard/demon — which is
consistent with the tails never having been separately certified.

---

## 18. PART D — SELECTION METHODOLOGY, Rules B0–B0c
*Source: T1, `NBA_LESSONS_LEARNED_FROM_MLB.md`, Part D. Recorded 2026-09-20.*

Stated in the source as: *"the original, foundational rule set — everything else in this document is
downstream of it. Apply these to NBA from the very first candidate, not as a later refinement."*

### Rule B0 — build real graded-outcome buckets; never rank by the platform's displayed score
> *"The entire selection logic must be: **build a real, historical, per-(PROP, SIDE, LINE-OR-TIER)
> hit-rate table from ACTUAL GRADED OUTCOMES**, then **select from buckets that clear a real
> SAMPLE-SIZE and HIT-RATE bar** (MLB's original bar: **n ≥ 30 real observations, ≥ 80% hit rate**) —
> independent of whatever the platform's own internal displayed probability/confidence score says.
> **Never trust a platform's own confidence/probability display as a substitute for your own real
> graded-outcome analysis.**"*

**NBA state:** `nba_market.board_outcomes` holds the required table — **6.9M graded legs, 327 dates**,
keyed by prop, side and line, `leg_result` ∈ `over_win` / `under_win` / push / DNP /
`unmatched_player` / `unmatched_not_in_season`.
**No selection bar has been set for NBA** — selection belongs to the slip-strategy phase, not begun.
Related: COMPASS 62 records the market as *"a confidence adjuster and ranking signal, not ground
truth."*

### Rule B0a — every proposed pool must state both its prop CLASS and its pricing LANE
> *"**(1) CLASS** — does it have a **real ladder of multiple simultaneous lines** ('tiered' props) or
> **only one sensible threshold** ('fixed' props)?
> **(2) LANE** — **which specific pricing tier/variant is it actually being offered in** (Standard vs
> Goblin vs Demon)?
> **Class and lane are INDEPENDENT, and LANE IS USUALLY THE DOMINANT DRIVER OF REAL EV, MORE THAN
> CLASS.**"*

**The measured example, as stated in the source:**
> *"**the IDENTICAL leg, IDENTICAL ~85% hit rate** — pricing at **roughly +1300% in one lane and
> roughly −13% in another** — **a swing of over 1,300 percentage points from LANE ALONE**, with the
> underlying prop's class held constant."*

**NBA representation of the two axes:**
| Axis | Where it lives |
|---|---|
| CLASS (tiered vs fixed) | derivable from `LADDER_DEPTH` and the board — points p95 = 13 rungs (tiered); `double_double` carries sentinel −1.0 and no ladder (fixed) |
| LANE (standard/goblin/demon) | `nba_market.board_tiers.kind` + `tier` — **v1 derives `kind` from PRICE and is Over-only** |

**Consequence recorded in `NBA_GOBLIN_DEMON.md` §9.**

### Rule B0b — multi-prop pools must be priced per-leg by each leg's own real rate
*Source: T1, Part D. Recorded 2026-09-20.*

> *"never a single blended/averaged rate. A real, quantified example: **a reported pool combining five
> different props at one assumed blended multiplier showed +216.5% ROI; the real per-leg rates for
> those same five props actually spanned an 82% RANGE (roughly 1.15× to 2.09×), and re-pricing the
> identical pool with each leg's own real rate brought the honest result down to +32.9%** — **a ~6.5×
> OVERSTATEMENT from blended pricing alone, NOT FABRICATION, just a wrong assumption.**
> **Any pool spanning more than one prop/side/tier bucket must price each leg independently from its
> own real, current rate.**"*

**Figures as stated:** +216.5% → **+32.9%**; per-leg multiplier spread **1.15× to 2.09×** (82% range);
overstatement factor **~6.5×**.

**Relation to other recorded rules:** this is the same arithmetic as lesson #2
(*"never apply a tier/pool-level multiplier to a heterogeneous population"* — `Σ wᵢ(pᵢ·mᵢ)`, not
`p̄·m̄`). B0b states it for **pools spanning multiple props**; lesson #2 states it for **populations
within a tier**.

**NBA state:** no pools have been built — slip-strategy phase not begun.

### Rule B0c — a ranked-greedy backtest must be tested against multiple tie-break orders
*Source: T1, Part D. Recorded 2026-09-20.*

> *"When legs are selected by ranking within a bucket and **many legs share the same or very similar
> scores**, the specific tie-break rule (which of several equally-ranked legs gets picked) **can by
> itself swing a backtest's reported ROI dramatically** — a real case of **the same configuration
> swinging from +25.9% to +12.5% PURELY from tie-break order, with 69% OF LEGS TIED within a day on
> the ranking field used**.
> **Any backtest built by ranking legs within a bucket must be re-run with at least one alternate,
> equally-legitimate deterministic tie-break order (e.g. an ID sorted ascending vs descending) and
> THE RANGE REPORTED.**"*

**Figures as stated:** +25.9% → +12.5% from tie-break order alone; **69% of legs tied** within a day
on the ranking field.

**Relation to other recorded rules:** the required output — *"the range reported"* — is lesson #17
(*"report the range a finding actually spans, not the single best number found"*), applied to
tie-breaks.

**NBA state:** the certified backtest ranks by **rate tier within role tier** (quantile), and the
scoring engine produces a continuous `score` 0–100. **No ranked-greedy selection backtest has been
run** — that belongs to the slip-strategy phase.
**Relevant when it is**: `score` is continuous and unlikely to tie, but any bucket-level selection
(e.g. "top N legs in a tier") inherits this requirement.

---

## 20. PART F — LOOKAHEAD BIAS IN A BASELINE MEASUREMENT
*Source: T1, `NBA_LESSONS_LEARNED_FROM_MLB.md`, Part F. Recorded 2026-09-20.*

Framed in the source as *"the exact same rigor discipline, independently required and applied on the
**scoring/calibration side**, not just the strategy-research side"*, and:
> *"**an entire multi-day investigation's founding premise turned out to rest on a LOOKAHEAD-BIAS BUG
> IN THE BASELINE MEASUREMENT ITSELF, not in the thing actually being evaluated.**"*

### The sequence, as recorded
| Step | Figure |
|---|---|
| Baseline's own discrimination appeared strong | **+39.76 pp within-cell** |
| Live, fully-enriched model appeared much weaker | **+5.31 pp** |
| Apparent conclusion | *"the enrichment layer was actively destroying a good baseline"* |
| **Days of factor-by-factor diagnostic work followed** | — |
| **Cause found by a parallel thread** | *"the **'baseline as of date D' calculation genuinely included day D's own game results** — **a real lookahead bug, not a subtle statistical artifact**"* |
| Corrected baseline, using only data available **before** the prediction date | **+5.32 pp** |
| Live enriched model | **+5.31 pp** |

> *"**The entire premise was wrong: it was never 'enrichment destroys a strong baseline.' Both the
> baseline and the enrichment layer perform almost identically, and both are genuinely modest.**"*

### The generalisable rule, as stated
> *"**Before investigating why a component seems to underperform a supposedly-strong reference point,
> VERIFY THE REFERENCE POINT ITSELF as rigorously as the thing being blamed** — **a 'before' or
> 'control' measurement is JUST AS CAPABLE of containing a lookahead-bias or leakage bug as the
> 'after' measurement everyone's default instinct is to scrutinize.** …**check the control group with
> the same suspicion as the treat[ment].**"*

The source places it in the same family as lesson #11 (*a plausible causal story is not evidence*) and
Part C (*grouping-key contamination*), *"but applied to a baseline/reference measurement rather than a
candidate finding."*

It also records that the diagnostic work was not wasted: *"real bugs and data gaps were found and
remain valid — but the **framing** the whole investigation was measured against never actually
existed."*

### NBA state
- **Same bug class, same system family**: `backtest.baseline_v6_asof` leaking day D into `as_of_date =
  D` is recorded in T1 as relayed 2026-08-29 (see §3.10b of `NBA_BASELINE_CALIBRATION.md`).
- **NBA instances of as-of contamination**: the FRINGE anomaly (*"a season-wide mean using future
  games"*, T8) and the pasted calibration table (parity violation, live session).
- **NBA's verification surface**: `classification_ladder_v12.py` is `shift(1)`-based by construction,
  and the T9 production note states *"the backtest harness on a past day IS already the production
  computation — every feature is `shift(1)`-based."*
- **Corroborating figure**: NBA's own measured factor-layer effect is **Brier +0.1–0.3%** (T9), with
  the recorded note *"real but small… not where the big gains are."*

**Recorded as an open verification in `NBA_OPEN_ITEMS.md`.**

---

## 19. WHERE EDGE IS NOW EXPECTED TO COME FROM

### ⚠⚠ 15.0a THE HARD CONSTRAINT — two of the three platforms are measured EFFICIENT
> *"**Underdog/Sleeper's own EV-parity pricing, measured directly against real placed-slip data at
> scale (14,000+ REAL LEGS), showed `p × m` FLAT AND SLIGHTLY BELOW 1.0 ACROSS THE ENTIRE PROBABILITY
> RANGE** — these platforms price efficiently enough that **no simple probability-based selection
> works**."*

**They price per-leg DYNAMICALLY.** A better `p` earns nothing when `m` moves to match it.

**PrizePicks does not.** Its pricing is a **discrete step function over tiers** — *"a fixed multiplier
per tier"* — so **within a tier the price does NOT adapt to the leg's true probability.**

**That is the whole edge hypothesis, stated precisely:**
| Platform | Pricing | Can a better `p` pay? |
|---|---|---|
| Underdog, Sleeper | per-leg dynamic, `p × m` ≈ 1.0 flat | **No** — measured on 14,000+ legs |
| **PrizePicks** | **step function per tier** | **Yes, in principle** — the price is fixed within the tier |

**Two PrizePicks-specific mispricings follow:**
1. **The tier step** — two legs in one tier with materially different true probabilities carry the
   same factor (lesson #13: **~15% multiplier change for a ~2.6× probability gap**)
2. **Flex insurance tiers** — mispriced for pools far from their calibration profile; *"found true in
   principle for MLB but the real magnitude, when tested, still fell short"*

## 15.0c EXTERNAL CONFIRMATION THAT THE OPPORTUNITY EXISTS
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

> *"**A real, useful piece of EXTERNAL VALIDATION worth carrying into NBA's own thinking:
> PROFESSIONAL SPORTSBOOKS THEMSELVES ACKNOWLEDGE that PLAYER-PROP MARKETS — ESPECIALLY FOR
> LOWER-PROFILE PLAYERS — ARE LESS EFFICIENTLY PRICED THAN GAME LINES.**
> **This is real, EXTERNAL CONFIRMATION that a GENUINE OPPORTUNITY EXISTS IN PROPS BROADLY, not
> something specific to baseball, and IT LIKELY APPLIES TO NBA PLAYER PROPS TOO.**"*

**Two things this adds to the edge picture:**

**1. It is sportsbook-side acknowledgement, not our own inference.** The claim that props are less
efficiently priced than game lines comes from the market makers themselves — which is a different
class of evidence from our measurements.

**2. The qualifier is specific and actionable: *"ESPECIALLY FOR LOWER-PROFILE PLAYERS."***
That points at the **low-line, low-minutes end of the board** — and it aligns with two independent
findings already recorded:
- **T7.15c**: *"for **low-line players (5.5 pts, 0.5 3PM)** the bet is **almost entirely on minutes
  and dud risk**"* — a different model regime, not merely a smaller number
- **`f_role`**: **fringe players miss by 0.0283 vs iron-men at 0.0008 — a 35× gap**

**So the place the market is least efficient is also the place our own model is least accurate.**
**That is not automatically an opportunity** — it may simply be where the irreducible noise is — **but
it is the intersection worth measuring first**, and it is measurable directly from `board_outcomes`
by role tier.

**⚠ Note the tension with §15.0a**: Underdog and Sleeper were measured at **`p × m` flat ≈ 1.0 across
the entire probability range** on 14,000+ real legs — i.e. **efficient**. **The sportsbook
acknowledgement is about SPORTSBOOK prop markets, not DFS pick'em pricing.** They are different
products, and the two findings do not contradict: **books may price props loosely while DFS operators
price their own product tightly.**

**What that implies for `rung_market`** (1.06M de-vigged book rungs): if book prop lines are
acknowledged as less efficient, then **the market-derived probability is a weaker reference than it
would be for game lines** — consistent with COMPASS 62's *"a confidence adjuster and ranking signal,
**not ground truth**."*
**MLB confirmed the tier mispricing and never harvested it** — *"every walk-forward selection attempt
(raw trailing hit rate, model-probability quintiles, appearance frequency) REGRESSED TO THE POOL
AVERAGE."*

**The mispricing is not the hard part — SELECTION is.** Everything in this document is selection
machinery, and the one asset MLB's failures lacked is a **calibrated** probability rather than a
trailing rate or a quintile rank.

**So the hypothesis is now narrow and testable:**
> **A calibrated per-leg probability, applied within PrizePicks' fixed-multiplier tiers, identifies
> which legs sit on the favourable side of a step the platform does not adjust for.**

**Unproven. One strong prior against (MLB's three failed selection methods). Two platforms already
excluded by measurement. And it is exactly what a live board tests.**

---

T9 predicted two sources. **One delivered, one did not.**
| Named source | Outcome |
|---|---|
| **Combo structure** | ✅ certified — P+R 0.9, R+A 0.9, fantasy 0.8 pp on the holdout |
| **Live enrichment** | ❌ ten candidates, **none survived** |

**The factor layer itself is small**: **Brier +0.1–0.3%**; *"a ±3% pace edge moves a 20-point player
~0.7 points — about **2 pp of probability**."*

**By elimination, the remaining edge rests on:**
1. **Calibration quality** — *"when the recipe says 75%, roughly 75% hit"*, which is what makes slip EV
   computable at all
2. **Combo structure** — per-player, archetype-dependent covariance
3. **The board-scoped tails** — *"the #1 area where a sharp baseline earns the most, because **naive
   book models mis-price tails**"*

**That third item is now a hypothesis by elimination, not just by design**, and it is testable the
moment real goblin/demon board data is in hand. **It should determine what the slip-building phase
optimises for.**