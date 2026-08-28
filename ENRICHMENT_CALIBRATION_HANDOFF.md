# ENRICHMENT CALIBRATION — HANDOFF BRIEF

**Written 2026-08-28 by the slip-calibration chat, for the chat that will own enrichment calibration.**

**Mission:** the AlphaDog v2 scoring engine has a clean, powerful baseline signal and an enrichment layer that makes it worse. Find out why, and fix it.

**Companion document:** `SLIP_BUILDING_CALIBRATION.md` in this repo — 27 parts. Part 2 is the enrichment finding, Part 18 the baseline rescale, Parts 6–7 the statistical methods, Appendix E the tooling.

---

## PART 0 — THE FINDING

### What is broken
`classification.baseline_v6_current.hit_probability_0_100` (**baseline**) is computed nightly from a player's own past performance. Board-agnostic, market-agnostic. **Excellent.**

`score.final_board_current.estimated_hit_probability_0_100` (**enriched**) is the baseline after contextual factors are applied. **Much worse at ranking legs.**

### The measurement (85,926 graded PrizePicks legs)
Within a (prop, line, side) cell, split into quartiles by each score:

| Quartile | **Baseline** hit % | **Enriched** hit % |
|---|---|---|
| Q1 | 46.92% | 65.60% |
| Q2 | 63.88% | 67.41% |
| Q3 | 74.39% | 67.90% |
| Q4 | **86.68%** | **70.91%** |
| **Spread** | **+39.76pp** | **+5.31pp** |

**Placebo noise floor is ±4pp.** The enriched score barely clears noise; the baseline is 10× it.

### THE MECHANISM — the damage is entirely WITHIN-CELL

| Quartile basis | Baseline spread | Enriched spread | Enriched retains |
|---|---|---|---|
| **Pooled across cells** | +64.9 to +69.5pp | +41.1 to +50.4pp | **~65–72%** |
| **Within cell** | **+39.8pp** | **+5.3pp** | **~13%** |

**The enrichment preserves BETWEEN-cell ordering — which prop/line is easier — and destroys WITHIN-cell ordering — which player is better at that prop/line.** It is largely re-encoding the cell base rate and discarding the player signal.

### Per-cell damage (n ≥ 500)
| Cell | n | SD baseline | SD enriched | **Variance retained** | **Within-cell corr** |
|---|---|---|---|---|---|
| `runs/less/0.5` | 4,268 | 10.53 | 4.70 | **0.446** | **0.4531** |
| `walks/less/0.5` | 5,151 | 13.69 | 6.16 | **0.450** | **0.4993** |
| `hits_runs_rbis/less/2.5` | 4,892 | 9.39 | 5.79 | 0.617 | **0.3997** |
| `total_bases/less/1.5` | 4,752 | 9.99 | 6.21 | 0.621 | 0.6693 |
| `rbis/less/0.5` | 5,504 | 8.59 | 5.39 | 0.628 | 0.6626 |
| `doubles/less/0.5` | 4,933 | 7.11 | 5.57 | 0.783 | 0.5720 |
| `hits/less/1.5` | 5,226 | 9.10 | 7.70 | 0.846 | 0.6747 |
| `total_bases/less/2.5` | 5,003 | 8.79 | 7.56 | 0.860 | 0.6375 |
| `hits_runs_rbis/less/3.5` | 4,187 | 7.67 | 7.43 | 0.969 | **0.3106** |
| `hits_runs_rbis/more/0.5` | 4,835 | 5.67 | 5.74 | **1.014** | **0.3738** |

**TWO DISTINCT FAILURE MODES:**
1. **Variance destruction** (`runs`, `walks` retain only 45%) — the enrichment compresses toward the cell mean.
2. **Reordering without compression** (`hits_runs_rbis/more/0.5` retains 101% of variance at 0.374 correlation) — it *scrambles* order while preserving spread. **This is worse: it is adding variance uncorrelated with truth.**

**START WITH `hits_runs_rbis/more/0.5` AND `hits_runs_rbis/less/3.5`** — lowest within-cell correlation (0.31–0.37) with no compression, proving factors are actively injecting noise.

### The enrichment multiplier
`score.prop_outcome_history.enrichment_rate_multiplier`: **n=36,326 populated of 130,710 (28%), mean 1.0554, SD 0.1339, range 0.6233–3.5721.**

- `corr(baseline, multiplier) = 0.0660` — nearly orthogonal to the baseline
- `corr(enriched, multiplier) = 0.1272`
- **Rows WITHOUT the multiplier still lose discrimination** (64.89pp → 41.07pp pooled). Both paths are damaged.

---

## PART 1 — REPRODUCE THIS FIRST

```sql
WITH j AS (
  SELECT poh.canonical_prop_key ck, poh.line_value lv, poh.selected_side ss,
    poh.outcome_hit oh,
    poh.estimated_hit_probability_0_100 enriched,
    b.hit_probability_0_100 baseline,
    poh.enrichment_rate_multiplier em
  FROM score.prop_outcome_history poh
  JOIN backtest.baseline_v6_asof b
    ON b.as_of_date = poh.official_date::date AND b.player_id = poh.mlb_player_id
   AND b.canonical_prop_key = poh.canonical_prop_key
   AND b.line_value = poh.line_value AND b.selected_side = poh.selected_side
  WHERE poh.source_key='prizepicks' AND poh.outcome_hit IS NOT NULL
    AND poh.estimated_hit_probability_0_100 IS NOT NULL
    AND poh.official_date::date NOT IN ('2026-08-05','2026-08-06','2026-08-07','2026-08-11')
),
cells AS (SELECT ck,lv,ss FROM j GROUP BY 1,2,3 HAVING COUNT(*) >= 300),
q AS (
  SELECT j.*,
    NTILE(4) OVER (PARTITION BY j.ck,j.lv,j.ss ORDER BY j.baseline) q_base,
    NTILE(4) OVER (PARTITION BY j.ck,j.lv,j.ss ORDER BY j.enriched) q_enr
  FROM j JOIN cells c ON c.ck=j.ck AND c.lv=j.lv AND c.ss=j.ss
)
SELECT 'BASELINE' layer, q_base quartile, COUNT(*) n,
  ROUND((100.0*SUM(oh)/COUNT(*))::numeric,2) hit_pct
FROM q GROUP BY 2
UNION ALL
SELECT 'ENRICHED', q_enr, COUNT(*), ROUND((100.0*SUM(oh)/COUNT(*))::numeric,2)
FROM q GROUP BY 2
ORDER BY 1,2;
```

**Expected: baseline 46.92 → 86.68 (+39.76pp), enriched 65.60 → 70.91 (+5.31pp).**

### Three things that make this correct — do not simplify them away
1. **`backtest.baseline_v6_asof`, NOT `classification.baseline_v6_current`.** The as-of table is point-in-time; using today's values for past dates is **lookahead bias**. Verified: pool matches as-of at correlation **1.0000**, today's values at only **0.59** (mean abs diff 8.8 points).
2. **Exclude `2026-08-05, 08-06, 08-07, 08-11`** — sign-inversion bug in raw ingestion, fixed 08-12.
3. **Partition NTILE by cell.** Pooling hides the defect — you get +41pp and conclude it's fine.

### The 1.8× duplication trap
Two graders write the same leg 2–3×. 134,205 raw rows → **74,520 deduped** (1.801×). Undeduped counts inflate t-statistics ~34%. Dedupe anything reported as a count or significance test:
```sql
SELECT DISTINCT ON (mlb_player_id, canonical_prop_key, line_value, selected_side, official_date::date) ...
ORDER BY mlb_player_id, canonical_prop_key, line_value, selected_side, official_date::date, resolved_at DESC
```

---

## PART 2 — WHERE THE ENRICHMENT LIVES

**⚠️ It is NOT in `alphadog-v2-score-final-board.js`.** That worker reads `estimated_hit_probability_0_100` from `score.hp_board_current` and carries it forward. **The enrichment happens upstream of `hp_board`.**

**The chain is:** `score-prep` → scoring runners → `hp_board_current` → `score-final-board` → `final_board_current`

**Candidate workers to read (in order):**
| File | Size | Why |
|---|---|---|
| `alphadog-v2-score-prep.js` | 96,858 | prepares scoring inputs |
| `alphadog-v2-scoring-runner.js` | 13,644 | orchestrates scoring |
| `alphadog-v2-scoring-runner-part2.js` | 16,833 | |
| `alphadog-v2-scoring-runner-matrix.js` | 12,436 | |
| `alphadog-v2-score-audit.js` | 447,813 | large; may contain the logic |
| `alphadog-v2-base-classification-v5.js` | 33,659 | classification layer |
| `alphadog-v2-base-baseline.js` | 23,516 | **the clean baseline — read for contrast** |

**One ordering detail already found in `score-final-board.js` line 188:**
```
COALESCE(h.hp_sort_0_100, (0.72 * estimated_hit_probability_0_100) + (0.28 * score_0_100))
```
A 72/28 blend of the enriched probability with `score_0_100`. **`score_0_100` was measured at +1.23pp — inside the ±4pp noise floor.** If that blend feeds anything downstream, 28% of the sort key is noise.

**Factor workers** (`phase2a`, `phase2b`, `phase3a/b/c` prefixes) compute individual contextual factors. Most are 5KB stubs; the substantive ones are `phase2a-run-environment` (71KB), `phase2b-recent-form` (65KB), `phase2b-pitcher-role` (75KB), `phase3a-first-inning-pitcher-context` (1.06MB).

**Existing documentation to read early:** `CALIBRATION_ENRICHMENT_AUDIT.md`, `FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md`, `FACTOR_REDESIGN_AND_QOC_FINDINGS.md`, `CORE_LOGIC_CALIBRATION_DOSSIER.md`.

---

## PART 3 — WHAT IS ALREADY KNOWN (do not re-derive)

### 3.1 The baseline is trustworthy — four independent checks
- **Calibrated**: predicted 75.0 → actual 75.8; 84.5 → 87.8; 92.3 → 96.8; 96.6 → 99.6. **Under-confident at the top** — the opposite of a leakage signature.
- **Passes the first-appearance test**: players with **zero prior history** show the same +40.0pp spread. Built from underlying MLB stats, not the system's own outcomes.
- **Positive in all 24 cells tested.**
- **Verified point-in-time** via `backtest.baseline_v6_asof` (74,825 rows, 30 days, 634 players).

### 3.2 ⚠️ The baseline was RESCALED on 2026-08-12
| Period | `≥90` legs/day | Top-2% avg baseline | **Top-2% hit rate** |
|---|---|---|---|
| 07-26 → 08-11 | 0–5 | 89.4 | **98.94%** |
| 08-12 → 08-22 | 39–189 | 96.2 | **98.86%** |

**Absolute number moved 7 points; performance moved 0.08pp.**

**Implications:** the signal is **ORDINAL, not cardinal**. Never compare absolute baseline values across the rescale. Never use Kelly sizing. **If you recalibrate enrichment, do not introduce a new absolute threshold** — it will break on the next rescale. **Find out what changed on 08-12** — `classification.baseline_history.formula_version` may tell you. Nobody has looked.

### 3.3 Signal audit — six named columns are really three signals
10 cells / 12,802 legs, tercile split within cell. **Noise floor ±4pp.**

| Signal | Effect | Cells positive | Verdict |
|---|---|---|---|
| `score_0_100` | +1.23pp | 7/10 | inside noise — **dead** |
| `hit_probability` | +0.89pp | 6/10 | inside noise — **dead** |
| **`confidence`** | **−0.29pp** | 3/10 | **actively harmful** |
| `opposing_pitcher_quality` | +3.05pp | 4/4 | weak, p=0.063 |
| `market_implied_total` | −1.59pp | 0/5 | coherent negative, p=0.031 |

**Also:** `estimated_hit_probability` ≡ `raw_score` (rank-identical); three confidence columns are rank-identical; `score_grade` ordering is **inverted** (BIN_ARCHIVE 85.75% > BIN_STRONG 85.07%); `probability_band`, `probability_grade`, `factor_status`, `correlation_risk_tier` are NULL/constant on every row.

**`confidence` at −0.29pp is a strong hint.** If enrichment weights factors by a confidence measure anti-correlated with truth, that is a plausible scrambling mechanism.

### 3.4 Factors with known signal
| Factor | Finding |
|---|---|
| `opposing_pitcher_quality` | Z=5.52, +4.46pp — survives |
| `park_factors` | Z=3.87, **−4.59pp** — survives with **NEGATIVE** sign |
| `umpire_tendency` | `walks_allowed` bottom tercile 92.8% vs 84.1% high (**−8.6pp**); −5.6pp in `earned_runs` |
| `stolen_base_family` | known-zero — **the placebo control** |
| `market_implied_total` | −1.59pp, coherent negative |
| `batting_order` | slot 1–6 → 3.9% DNP, 7–9 → 8.6%, no lineup row → **52.9%** |

**`park_factors` at −4.59pp deserves immediate attention.** If applied with a positive sign it subtracts signal on every leg it touches.

### 3.5 A mechanism the enrichment appears not to capture
**Pitcher "struggle vs volume"** — start length vs hit rate, MORE-side Goblin pitcher props:

| Prop | ≤4 IP | 5 IP | 6+ IP | Direction |
|---|---|---|---|---|
| `walks_allowed/0.5` | 93.44% | 92.21% | 82.22% | ↓ monotone |
| `earned_runs/0.5` | 93.33% | 88.89% | 79.14% | ↓ monotone |
| **`pitcher_strikeouts/2.5`** | 62.22% | 78.26% | **89.74%** | **↑ REVERSED** |

**The strikeouts reversal makes this a mechanism, not a fit.** Pitchers who walk or allow runs get pulled early; strikeouts are volume-dependent. **Check whether enrichment models expected start length.** A single directional "pitcher quality" adjustment is wrong on strikeouts by construction.

---

## PART 4 — RULED OUT (do not spend time here)

| Hypothesis | Test | Result |
|---|---|---|
| Lookahead bias | pool vs `baseline_v6_asof` | corr **1.0000**; vs current 0.59 |
| Baseline coverage bias | board legs with/without as-of row | 97.3% covered; missing 2.7% hit **worse** |
| Player concentration | legs per player | 259 players, max **2.7%** from one |
| Snapshot selection | board-wide vs pinned pool | 96.70% vs 98.04% |
| DNP survivorship | PA distribution | **no 0-PA legs**; 1-PA legs hit 100% |
| Cross-leg correlation | 646,204 pairs | **φ = −0.0018** |
| Same-game correlation | 124,947 pairs | φ = +0.0294 (mildly positive) |

---

## PART 5 — HOW TO INVESTIGATE

### 5.1 Five questions to answer from the code
1. **Is the adjustment multiplicative on a PROBABILITY scale, or on odds/logit?** Multiplying 0.95 by 1.05 exceeds 1.0 and must be clamped — **and clamping compresses the top of the distribution, exactly where the baseline's discrimination lives.** **This is the leading hypothesis.** `avg_multiplier = 1.0554` with `max = 3.5721` makes clamping near-certain.
2. **Are factor signs correct?** `park_factors` measured **−4.59pp**.
3. **Is there a confidence-weighting step?** `confidence` measured **−0.29pp**.
4. **Is a shrinkage / regression-to-mean step applied?** The 0.446 variance retention on `runs` looks like shrinkage toward the cell mean.
5. **Is any factor applied PER-CELL rather than per-leg?** That would exactly produce preserved between-cell ordering with destroyed within-cell ordering.

### 5.2 Isolate factor by factor
`enrichment_factors_applied` / `enrichment_factors_missing` are populated on 36,326 rows (may be double-JSON-encoded — unwrap with `(col #>> '{}')::jsonb`). Run the within-cell quartile test grouped by which factors fired. **Any factor whose presence lowers within-cell correlation is a suspect.**

### 5.3 A/B test variants
Score each with the within-cell quartile test:
- baseline alone (**control — target +39.8pp**)
- baseline + one factor at a time
- baseline + all factors, no clamp
- baseline + all factors on a **logit scale**
- current production (**control — +5.3pp**)

### 5.4 ⚠️ CIRCULARITY — the trap that nearly deployed a bad strategy
**Never score a variant with the same table used to select it.** EV-ranking legs by `baseline × rate` showed **+39 points** scored with the fitted table and **−5.6 points** on flat rates. The gain was the table crediting itself.

**Directly relevant here:** if you tune factor weights on outcomes and evaluate on the same outcomes, you will manufacture an improvement. **HOLD OUT DAYS.**

---

## PART 6 — METHODOLOGY STANDARD

### 6.1 Mandatory hygiene
1. Dedupe `prop_outcome_history` (1.8×) for counts and significance
2. Exclude the four corrupted dates
3. Use `backtest.baseline_v6_asof` for anything historical
4. Partition NTILE by cell for discrimination tests
5. Never merge board snapshots within a day

### 6.2 The placebo noise floor
Run any analysis on a zero-information factor. This program's floor is **±4pp**, measured on `stolen_base_family`. **Anything inside it is dead regardless of p-value.** Better practice: build a deliberate shuffled-contribution column.

### 6.3 ⚠️ Day-robustness must be VOLUME-WEIGHTED
Unweighted daily t-tests treat a 7-leg day like a 38-leg day. **This caused a false rejection.** Gemini caught it.
```python
w = n/n.sum(); m_w = (w*roi).sum()
var_w = (w*(roi-m_w)**2).sum() * len(roi)/(len(roi)-1)
t_w = (m_w - BE)/sqrt(var_w/len(roi))
```
Real impact: unweighted t = **1.573** (fails) vs weighted t = **2.755** (passes) on identical data.

### 6.4 Day-level block bootstrap (current standard)
**Resample DAYS with replacement, never legs** — legs within a day are correlated through slate conditions.
```python
B=20000; idx=rng.integers(0,len(rows),size=(B,len(rows)))
roi=np.array([ret[idx[b]].sum()/n[idx[b]].sum()-1 for b in range(B)])
```
**Gate: ≥95% of resamples positive AND 95% CI lower bound above zero AND leave-one-out never negative.**

### 6.5 The searched-grid problem
Sweeping 95 cells and reporting the maximum means part of it is selection. Happened twice: +106.4% on 15 days became +52.2% on 24. **Report the band, not the peak.**

### 6.6 Sample-size posture
| Rows | Interpretation |
|---|---|
| <15 | not a result |
| 15–30 | directional only |
| 30–70 | usable with caveats |
| 70+ | reportable |

**Days matter more than rows.**

### 6.7 Rejection discipline
- "Inconclusive" is never written as "dead" — there is a formal third bucket with weekly revisit
- Every rejection carries an explicit alternative-treatment check
- Nothing is untestable without exhaustive table enumeration first
- Benchmark errors run in both directions
- **Language strength must not exceed evidence strength**

---

## PART 7 — HOW RODOLFO WORKS

### 7.1 Context
Rodolfo owns and operates AlphaDog v2 alone, **exclusively from an iPhone with no terminal access**. You are his only interface to the database, repo, and deploy pipeline. He expects a **senior technical partner** — deep scrutiny, real root-cause analysis, calibration honesty, no claims of success without verified evidence against live data.

### 7.2 Output style
- **Direct. Lead with the answer.** No preamble, no restating the question, no filler.
- **Tables over prose** for anything with more than two numbers.
- **Bold the number that matters** — he scans on a phone.
- **"Continue" / "yes" / "keep going" = execute the next concrete step autonomously, no preamble.**
- No over-explanation, no hedging, no unsolicited scope-broadening.

### 7.3 What he pushes back on — and he is usually right
- **Language stronger than the evidence.** If you write "this proves", he will ask what it actually shows.
- **Wrong normalization.** He corrected a comparison of profit at $1/slip when *capital*, not slip count, was the constraint. **Always ask what is actually fixed.**
- **Accepting a limitation too easily.** He asked "why can't you expand the backtest? we have 32 days" — and was right; a threshold artifact had been mistaken for a data limit. **When you say something is impossible, check twice.**
- **Not showing the day-by-day.** Give it before he asks.

### 7.4 Decision-making
- **ROI is the target, not total profit** — "profit I can increase by betting more; ROI I cannot." But normalize by **capital deployed**, not by slip.
- He accepts smaller samples for materially higher ROI **if the mechanism is sound**. Give the number and the risk, then let him choose.
- When he says "do all checks, only then deploy" — do them all, including ones you expect to pass.
- He tracks operational reality you cannot see. **When he reports something odd, believe him and investigate.**

### 7.5 The day-by-day layout he expects
```
|Date     |Slips |Full hits|5/6 |≤4/6|Staked |Return     |Profit    |ROI        |
|---------|------|---------|----|----|-------|-----------|----------|-----------|
|08-12    |5     |3        |2   |0   |$5     |$7.27      |+$2.27    |+45.4%     |
|**TOTAL**|**83**|**75**   |**8**|**0**|**$83**|**$183.20**|**+$100.20**|**+120.8%**|
```
$1 per slip, bold the total, include partial-hit columns so the failure mode is visible.

### 7.6 Standing rules from prior sessions
- Every strategy must have the **backup-pool substitution system**
- All slip checkboxes **default to checked**
- **Real multipliers he types must never be lost on re-render**
- **Document everything into committed repo files**, not just chat

---

## PART 8 — TOOLING AND GOTCHAS

### 8.1 Bridge tools
```
run_sql_postgres(sql, allow_write, max_rows)
github_get_file / github_grep_file / github_patch_file / github_put_file / github_list_dir
github_list_workflow_runs        # confirm deploy
github_get_workflow_run_log      # FIRST tool on any deploy failure
call_gemini(prompt, model="gemini-3.6-flash")
```

### 8.2 SQL gotchas that cost hours
- **`ROUND(x,n)` needs `::numeric`** — `round(double precision, integer)` does not exist
- **Reserved words as aliases fail** — `do`, `end`
- **Double-JSON-encoded columns** — unwrap with `(col #>> '{}')::jsonb`
- **Type mismatches kill joins silently** — `line_value` is `numeric` in some tables, `double precision` in others; `player_id` is `text` in `baseline_v6_current`, `bigint` in `baseline_v6_asof`. **A mismatch forces a nested loop and times out rather than erroring.**
- **One statement per tool call** — batches silently corrupt tables
- **`allow_write: true`** required for anything not SELECT/WITH
- **Results cap at 500 rows** — aggregate in SQL
- **Large joins drop the Hyperdrive connection** — build intermediate tables in steps, index before joining

### 8.3 Deploy gotchas
- **`github_patch_file` needs a byte-exact, unique `old_str`.** Always `github_grep_file` first with `context_lines: 20-30`.
- **⚠️ CDN caching will lie to you.** `raw.githubusercontent.com` serves stale copies for minutes. **Verify with `github_grep_file` (API), never curl.** This produced two false "the change didn't land" conclusions.
- **⚠️ `node --check` does NOT validate client-side JS** — it lives inside a template literal. Extract and parse separately.
- **⚠️ A `ReferenceError` inside a template literal throws at request time, not parse time.** After renaming any constant, **grep for the old name.** This caught six stale references in one session.

### 8.4 Key tables
| Table | Contents | Notes |
|---|---|---|
| `classification.baseline_v6_current` | **the clean signal**, 196,940 rows | `player_id` is **text** |
| `backtest.baseline_v6_asof` | **point-in-time baseline**, 74,825 rows, 30 days | `player_id` is **bigint**; **use for backtests** |
| `classification.baseline_history` | has `formula_version` | **check for the 08-12 rescale** |
| `score.prop_outcome_history` | outcomes + enriched score + `enrichment_rate_multiplier` + factors | **1.8× duplication** |
| `score.hp_board_current` | **where the enriched score originates** | upstream of final board |
| `score.final_board_current` / `_history` | the board | history has `game_pk` |
| `stats_hitter.game_logs` / `stats_pitcher.game_logs` | per-game stats | **separate tables** |
| `context.history_game_lineup` | lineups, 8,619 rows, 38 days | all `derived_likely_lineup` |
| `archive.market_prop_context_history` | moneylines, 144k rows / 30 days | |

---

## PART 9 — USING GEMINI

`call_gemini(prompt, model="gemini-3.6-flash")`

**Prompt structure, in order:** mechanics derived (with verification errors) → the signal and why it is clean → **full results including controls** → the specific test that is failing → numbered questions including *"am I being too harsh?"*

**Ask it to state its bar first, then attack.**

**What it has actually caught:** the unweighted daily t-test misspecification (**overturned a false rejection**); Underdog's 2dp truncation (turned an approximate model into an exact one); the Flex/Power crossover derivation; **the live substitution-pool degradation hypothesis, which solved the biggest open question in the program.**

**⚠️ It once reached "REJECT" using a flawed statistic while simultaneously explaining the statistic was wrong.** Take its methodological corrections seriously and **re-derive its conclusion yourself.**

**For enrichment specifically, ask it about:** whether multiplicative adjustment on a probability scale with clamping explains within-cell variance destruction; whether logit-space adjustment preserves ordering; how to isolate jointly-applied factor contributions; what a correctly-specified contextual adjustment layer looks like.

---

## PART 10 — FIRST FIVE ACTIONS

1. **Run the Part 1 query.** Confirm +39.76pp vs +5.31pp. If different, find out what changed first.
2. **Run the per-cell variance table.** Confirm `runs`/`walks` at ~45% retention and `hits_runs_rbis/more/0.5` at 101% variance / 0.374 correlation.
3. **Find and read the enrichment code end to end.** It is upstream of `hp_board_current` — start with `score-prep`, the scoring runners, and `score-audit`. **Read before hypothesizing.**
4. **Answer the five questions in Part 5.1** — especially whether the adjustment is multiplicative on a probability scale with clamping.
5. **Report:** what the code does, which of the five is the cause, and the smallest testable fix. **Lead with the answer, use a table, bold the number that matters.**

---

## PART 11 — WHAT SUCCESS LOOKS LIKE

**A variant of the enrichment layer that beats +39.8pp within-cell discrimination on HELD-OUT days.**

Not "improves on the current +5.3pp" — that bar is cleared by deleting enrichment entirely, which is effectively what the deployed slip strategies already do.

**If enrichment cannot beat the raw baseline, the honest answer is to say so and recommend removing it.** That is a legitimate outcome and Rodolfo would rather hear it than see a marginal improvement dressed up as a fix.

**Context for the bar:** the deployed slip strategies currently earn measured backtest ROI of **+120.8% (PrizePicks), +84.0% (Sleeper), +55.5% (Underdog)** — all by **bypassing enrichment entirely** and selecting on the raw baseline. Whatever you build has to beat a signal that already works.
