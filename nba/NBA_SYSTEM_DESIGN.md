# NBA SYSTEM DESIGN — the three pipelines

**Purpose.** Exactly what each pipeline does, in what order, why each step sits where it does, and the
constraints that shaped it. This is the operational spec.

---

> # 📑 **INDEX — `NBA_SYSTEM_DESIGN.md`**
> **What the system is for, and how the three pipelines deliver it** — `P1`, `P2`, `P3`, the `1:15 PM
> PT` cutoff, the calculation chain, the failure policy, and the explicit non-goals.
> 📏 **`216` sections · re-derived `2026-10-17` (T49 transcript batch, RUN, `+1` = `§T49.7b`)** · ~~`215` (T49 intake, `+1` = `§T49.7`)~~ · ~~`214` (T48 pass 1, `+1` = `§T48.7`)~~ · ~~`213` (T47 pass 1, `+1` = `§T47.7`)~~ · ~~`212` (T46 pass 1, `+1` = `§T46.7`)~~ · ~~`211` (T45 pass 1, `+1` = `§T45.7`)~~ · ~~`210` (T44 pass 1, `+1` = `§T44.7`)~~ · ~~`209` (T43 pass 1, `+1` = `§T43.7`)~~ · ~~`208` (T42 pass 1, `+1` = `§T42.7`)~~ · ~~`207` (T41 pass 1, `+1` = `§T41.7`)~~ · ~~`206` (T40 pass 1, RUN, `+1` = `§T40.7`)~~ · ~~`205` (T39 pass 1, RUN, `+1` = `§T39.7`)~~ · ~~`204` (T38 pass 1, RUN, `+1` = `§T38.7`)~~ · ~~`203` (T37 pass 1, RUN, `+1` = `§T37.7`)~~ · ~~`202` (T36 pass 1, RUN, `+1` = `§T36.7`)~~ · ~~`201` (T35 pass 1, RUN, `+1` = `§T35.7`)~~ · ~~`200` (T34 pass 1, RUN, `+1` = `§T34.7`, the slip system as designed at `T34`'s close)~~ · ~~`199` (T32 pass 1, RUN, `+1`)~~ · 🆕 **`§T32.7` (end of file) — P3's commit step: concurrency failure, fix, `2026-10-08` supersession.** · ~~**`198` sections · re-derived `2026-09-26` (pass 27, RUN)**~~ *(was `171` on `2026-09-23`, `193` on `2026-09-25`; the `+5` is §T26.70's; **`RULE 59` — re-derive AND RUN, never quote**):* `` grep -cE '^(> *)*#{1,6} ' nba/NBA_SYSTEM_DESIGN.md ``
>
> 🆕🆕🆕 **`§T26.70` ADDED `2026-09-26`** — 🔴🔴🔴 **THE FIRST `T26` PASS TO READ THE OWNER STRATUM WITH THE COVERAGE INSTRUMENT: THREE UNRECORDED OWNER RULINGS, ONE OF THEM A STANDING DECISION RULE.** ▶ 🔴🔴🔴 **RULING 1 — *NO ACCURACY MAY BE TRADED FOR SPEED***: *"if it's possible to **optimize it without losing anything, we do. but if there is any loss, it's not worth the trade**"*, and applied in the same transcript to a `P3` delta mode — *"it needs to represent **exactly the same** if it was running one by one. for classification, for baseline, for everything"*. **`7` vocabularies, `0` hits across all twelve.** ⇒ *belongs beside `§T26.27`'s "ALL PROPS STAY, NO EXCEPTION"; **"faster" is never on its own a reason**.* ▶ 🔴🔴 **RULING 2 — THE OWNER STATES THE PIPELINES RUN UNMONITORED**: *"**they run um, not monitored**, so get them to work"* — *the CONCEPT is in seven documents as the sweep's inference, **never as the owner's stated operating condition***. ⇒ ***`A1` and `A2`'s `SILENT`/`UNCAUGHT` rating is no longer editorial judgement — it is the condition the owner specified.*** ▶ 🔴 **RULING 3 — THE AT-REST CREDENTIAL FINDING IS ACCEPTED RISK**: *"the encrypted data, it doesn't really matter … nobody else accesses this database"*. ⚠⚠⚠ ***SCOPED TO THE DATABASE — it does NOT reach `F2-1`/`T22-1b`, which are a live credential in a PUBLIC repo; those stay OPEN.*** ✅✅ **AND IT RE-RATES `T26-5`**: *the corpus already says **"PRESEASON IS NOT A SLATE"** and I did not apply it when ranking `§T26.57` — the missing `2026-10-04` game costs one game's MARKET-STRUCTURE capture, **not an opening-night risk**; `T26-8` is now the reason to fix it and the drift is its evidence.* ⚠ *`2` of the `16` uncovered owner segments were FALSE TAIL caught by `RULE 20`'s novelty check — the preseason decision and the no-join rationale, both already recorded in different words.*
>
> ➡️➡️ **`2026-09-26` — TWO FINDINGS THAT LIVE IN `NBA_WORKERS.md` BUT ARE THIS FILE'S BUSINESS, BECAUSE BOTH ARE FAILURE-POLICY DEFECTS, NOT WORKER BUGS.**
>
> 🔴🔴🔴 **`§T26.63` — THE FAILURE POLICY CANNOT DISTINGUISH "NO DATA EXISTED" FROM "WE FAILED TO GET IT".** *This file's failure policy says a missing input must fail LOUD. The board path does the opposite, in two places:* ① *`archive_live_boards.py` — `if not rows: print(f"{app}: 0 rows parsed"); continue` — **an empty board is a successful capture**; its only hard guard catches a MISSING file, never an EMPTY one.* ② *`certify_pipeline.py`'s ONLY board gate is an aggregate — `count(*) FROM nba_market.board_snapshots WHERE game_date = %s`, threshold `> 0`, **no `bookmaker` breakdown** — so **one healthy app certifies the slate for all five**.* 🔴🔴 ***AND THE SIGNAL IS ALREADY COMMITTED AND UNREAD**: every DFS scraper writes a `*_nba_current_meta.json` with `ok`, `fetched_at`, `legs` and, for Betr, a dated `token_expires_at` — and `grep` finds **ZERO** consumers among `certify_pipeline.py`, `check_*.py` and `verify_*.py`. **A credential expiry dated `2026-10-10`, ten days before opening night, sits in a committed file in ISO-8601 that nothing reads.*** ⇒ **`T26-9`** — *the fix is a per-app freshness assertion over the five metas, not a new scraper.* ✅ *Today the ambiguity is benign — `underdog` `3` legs / `sleeper` `0` / `fliff` `0`, all `ok: true` today, because **the apps have not opened NBA markets** — which is exactly why it is worth fixing before boards open and the same green means something else.*
>
> 🔴🔴🔴🔴 **`§T26.61` — `11` OF `21` WRITER WORKERS ARE REACHABLE FROM NO SCHEDULE, AND `26` OF THE `41` TABLES THEY WRITE HAVE NO SCHEDULED WRITER.** *An operational spec that names three pipelines owes an account of what is NOT on them: P1 dispatches exactly `10` workers; `nba-daily-delta`'s only caller has no `cron`; the other `10` are referenced by nothing.* 🔑 *Root cause of `§T26.52`, `§T26.57` and `T8`'s idle differential at once, and it corrects `§T26.54` — **documented is not dispatched**.* ⇒ **`T26-8`**, a closed list; each of the eleven needs one word: **cron it, fold it into P1/P2/P3, or delete it.**
>
> 🆕🆕 **SECTIONS ADDED `2026-09-25` — `5` NEW, AND TWO ARE THE OWNER'S OWN WORDS ON HOW THE SYSTEM IS SUPPOSED TO WORK.** *Anchors are heading text; search the label.*
> | § | what it is |
> |---|---|
> | 🔑🔑🔑 **`§T26.27`** | **THE ARCHITECTURAL CHARTER, QUOTED** — ***P2 narrows by PLAYER, P3 by LEG*** *(two axes; conflating them is the error the owner heads off)* · 🔴 ***"the period props… WILL show up when the season starts… SO ALL PROPS STAY, NO EXCEPTION"*** · **and the INGREDIENTS-vs-PRODUCTS principle that resolves *"everything mined must be stored"* against the retention rule — stated in NO other file of the twelve** |
> | 🔑🔑 **`§T25.2`** | **THE OWNER SETS THE BUILD ORDER** — ***coverage → selection → profitability***, *with profitability **explicitly deferred***. ⚠ **Read every open item against this: an item the owner has deferred is not season-critical** |
> | 🔴🔴🔴 **`§T26.45`** | **`nba_market.board_rung_keys` IS A P3→P2 HARD DEPENDENCY** — *one producer (inside **P3**), **three consumers that `SystemExit`** (`build_final_hp` = **P2 step 6b**, the history loader, the prune). **A P3 failure on day `N−1` stops three P2 steps on day `N`**, and the recovery path is UNVERIFIED* ⇒ item **`T26-3`** |
> | ✅✅ **`§T26.21`** | **THE PRESEASON DECISION IS MEASURED, NOT ASSUMED** — *and the author corrects his own figure by a factor of `23`: **`11.5%` was inflated by a broken id join; the real share is `0.5%`***. 🔑 *Preseason is REJECTED as a player-statistics source and ACCEPTED as a market-structure source* |
> | 🔑 **`§T26.10`** | **PRESEASON IS NOT A SLATE** *(the ruling `§T26.21` supplies the evidence for)* |
>
> ⚠ **ANCHORS ARE HEADING TEXT, NEVER LINE NUMBERS** 🔁 **To resolve a `§` pointer:** `` grep -rn "§T9.40b" nba/*.md `` *(all `32` files — the twelve are not closed under their own citations).* **Search for the quoted `§` label.**
> 📚 *Sweep method, census history, detector versions and retractions: **`NBA_SWEEP_RUN_LOG.md`**.*
> 🔴 **THE `0z-*` AND `0a.*` BLOCKS RUN BACKWARDS.** *`0z-7` → `0z-5` → `0z-6` → `0z-3` → `0z-4` →
> `0z-2` → `0z`, and `0a` → `0a.1` → `0a.5` → `0a.6` → `0a.4` → `0a.3` → `0a.2`.* **Navigate by this
> index, not by number.**
>
> ## ▶ FIND IT FAST
>
> | if you need… | go to |
> |---|---|
> | 🔴🔴 **what the system is FOR, and the acceptance criterion it must meet** | **`§0z`** |
> | 🔴 **the build-order lock — what will NOT be built, and in what order the rest comes** | **`§0z-3`** |
> | 🔑🔑 **WHAT A GAME DAY LOOKS LIKE, END TO END** | **the `🗓 GAME DAY` block directly below** — *the whole sequence in order, with the section for each step* |
> | **what `P1` / `P2` / `P3` each do** | **`§2`** · **`§3`** · **`§4`** |
> | 🔑 **why the cutoff is `1:15 PM PT`** | **`§1`** |
> | 🔴🔴 **the two-pipeline decision, made in real time** *(COMPASS fact 107's reasoning)* | **`§0z-7`** |
> | ✅ **who rebuilds `final_hp`** *(nothing did, until `2026-09-24`)* | **`§4b`** — ***now `P2` step `6b`*** |
> | 🔴🔴 **where a pipeline can do LESS than it claims and still certify green** | **`THE SWALLOWED-FAILURE CENSUS`** *(h1)* |
> | 🔴🔴 **what certifies GREEN while broken — the twelve checks read adversarially** | **`WHAT CERTIFIES GREEN WHILE BROKEN`** *(h1)* — findings 1–4 |
> | 🔴 **the paper-trading strategy, specified end to end** | **`standards_3pick_v1`** *(h1)* |
> | 🔑 **the outcome grader — design vs what the code does** | **`§0a`** · **`§0a.1`** |
> | 🔑🔑 **baseline and enrichment are ONE system** *(the result that invalidates a whole class of work)* | **`§0a.5`** |
> | 🔑 **the two-phase clock, its two leakage traps, and the premise under it** | **`§0a.3`** |
> | 🔑 **market consensus — the owner's weighting directive and the build that FAILED** | **`§0a.2`** |
> | **the calculation chain** · **failure policy** | **`§5`** · **`§6`** |
> | ⚠ **the three explicit NON-GOALS** | **`§0.75`** |
> | ✅✅ ~~🔴🔴🔴~~ **THE SECOND DEADLOCK — FIXED `2026-09-23`, VERIFIED `2026-09-25` (`§T26.32`).** *The shape was `CREATE UNIQUE INDEX IF NOT EXISTS` **inside the write transaction**, which takes a FULL TABLE LOCK before discovering the index exists and holds it to commit — **`181` of `325` dates failed**.* ✅ **All `4` index-creating P2/P3 scripts now check `to_regclass(...) IS NULL` first; `7` were repaired in one campaign.** ⚠ **UNEXERCISED — recovery stays SERIAL until a parallel catch-up succeeds.** 🔴 *`build_defender_ratings.py` (P1) is the one unguarded script left in a pipeline.* ⚠ ~~*`17` files carry the pattern, `7` of them in `P2`/`P3`*~~ — **a STRING count; the guard leaves the string in place (`RULE 62`).*** ⚠ **SEASON-CRITICAL — this is the tool you would reach for to recover from `T23-2`, and it is the tool that breaks.** | **`§T23.5`** |
> | 📏 **what the leg scorer SKIPS, in its own docstring's numbers** | **`§T23.13`** |
>
> ### 🆕 §T26.13 — 🔑🔑 **`P2` DOES THE SAME WORK ELEVEN TIMES — AND THE HONEST LIMIT ON A DELTA**
>
> *`T26`, ~~`2026-09-24`~~ `2026-09-23` `21:07Z` (date corrected `2026-10-10`, pass 113 → `NBA_MASTER_SUMMARY.md` `§T26.R2`). **Read from the code, not from timings.***
>
> 🔴 **THE STRUCTURE.** *The baseline builder is invoked **once per prop pair** — **`8` pairs, plus `3`
> more for components = `11` invocations**. **Every invocation re-parses three seasons of player and
> team logs, then rebuilds all the league-wide fits** — minutes ratios, blowout bins, role tiers,
> four-factors — **before touching its own two props.*** ⇒ ***That prefix is prop-INDEPENDENT, so it is
> eleven identical rebuilds a night.***
>
> ✅ **The safe fix, and its test.** *Running all props in ONE process is **equivalent by
> construction** — same code, same inputs, same per-prop math; only the shared prefix stops repeating.*
> **The test is stated and is the right one:** ***"build one slate both ways and diff the merged ladder
> row for row. Identical or it doesn't ship."***
>
> ## ⚠⚠ **THE LIMIT ON A TRUE DELTA — and this is the part to carry**
>
> *Daily change comes from two places: **last night's games**, and **roster/status moves**.*
> ✅ **Sums and counts are ADDITIVE, so those update cleanly.**
> 🔴 ***THE PROBLEM IS THE TIER BOUNDARIES.*** **The empirical cells bin players by minutes and role,
> and adding a night can SHIFT A BOUNDARY — which reassigns players and changes probabilities.**
>
> ⇒ 🔑 ***"A delta is only 'exactly the same' if the BINNING IS RECOMPUTED from the updated
> aggregates, not carried forward."*** **That is the owner's own acceptance condition** *(seg `324`:
> "if it runs a delta mode, it needs to represent exactly the same as if it was running one by one")*
> **made precise: the incremental part is the aggregates; the binning must still be global.**
> ⚠ *Gated behind a byte-for-byte diff on several dates before shipping.* ***`NOT RECORDED`: whether
> that diff has been run.***
>
> ### 🆕 §T26.10 — 🔑 **PRESEASON IS NOT A SLATE** *(owner decision `2026-09-24`, live in the code)*
>
> ***Preseason is REJECTED for the projection pipeline and used for BOARD AND MULTIPLIER LEARNING
> ONLY.*** **No preseason pick ever reaches the paper log.**
>
> ✅ **Enforced, not merely stated** — `nba-p3-afternoon-light.yml` counts only regular-season games:
> ```sql
> SELECT min(game_datetime_utc), count(*) FROM nba_calendar.games
>  WHERE game_date = %s AND coalesce(game_label,'') <> 'Preseason'
> ```
> ⇒ **A preseason day takes the no-games path: the board is still CAPTURED and ARCHIVED, and scoring
> and paper picks are SKIPPED.** *The same gating is applied in `P2`, the prune and the certifier.*
>
> 🔑 **The owner's reasoning, `T26` segs `952`/`960`:** ***"the preseason should not really mix with the
> full season… it's very, very volatile. Some of the main stars are not even gonna play. If they play,
> they play very little. The rookies are gonna play a lot. So that may mess with the data instead of
> helping… What we can really use is for multipliers and for board learning."***
> ⚠ **PRESEASON OPENS `2026-10-03` — `8` days from this entry.** *The first live exercise of this path
> is a preseason day, and by design it will produce a board and no picks.*
>
> ## 🗓 GAME DAY, END TO END
>
> *All times **Pacific** — the owner's standing convention. **Everything below is re-derivable from
> the workflow files**; nothing here is a stored figure.*
>
> | when | what runs | detail | 🚩 state `2026-09-23` |
> |---|---|---|---|
> | **Mondays, `19:00 UTC`** | **`P1` — weekly static** *(`nba-p1-weekly-static.yml`)* | **`§2`** | ✅ **cron `0 19 * * 1`.** ⚠ *NOT the only live cron — `4` NBA workflows have one* |
> | 🆕 **`15:45 UTC` DAILY = `08:45 PT` (PDT) / `07:45` (PST)** | **`P2` — the heavy run.** ⚠⚠ **IT IS NO LONGER OVERNIGHT.** *Owner decision `2026-09-23`: **moved to the MORNING** because **D1 referee assignments publish `~6–7 AM PT` and are never archived** — the old `01:00 PT` target was five to six hours too early, **which is why `nba_ref.referee_assignments` held `0` rows while the step ran nightly**. The filename still says "overnight".* | **`§3`** | ✅ **cron `45 15 * * *` — LIVE.** *Measured full run **`2h10m`** (grading `34m`, periods `43m`, confidence refit `12m27s`, `final_hp` `2m03s`); `~1h55m` with the rolling `7`-day grading window* |
> | **morning** | **the game-day injury report lands `11am–1pm LOCAL TO THE GAME`** — *the last input to move, and the reason the cutoff sits where it does* | **`§1`** · `§0a.3` | ⚠ *for a `5pm`-or-earlier tip the report is `8–10am` local* |
> | **`21:15 UTC` = `1:15 PM PST` / `2:15 PM PDT` — THE CUTOFF** | **`P3` — afternoon light**: pulls the decision-snapshot board *(label `window`, never `routine`)*, scores legs, writes the paper picks | **`§4`** · **`§1`** | ✅ **cron `15 21 * * *` — LIVE**, and ✅ **`T23-2` FIXED: the season resolves from the date.** 🔴 ⚠ **The file's line `13` still reads "NO CRON YET" — a comment its own `on:` block contradicts** *(`§T26.1` §4)* |
> | **after** | ✅✅ **`final_hp` IS REBUILT — `P2` step `6b`** *(`build_final_hp.py`, after the calibration and confidence refits because it reads both)* | **`§4b`** | ✅ **`§4b` CLOSED ~~`2026-09-24`~~ `2026-09-23`.** *(date corrected pass 114 → `NBA_MASTER_SUMMARY.md` `§T26.R3`)* *Cause of the old gap: the script deleted season+prop while `FE_DATE` scoped the SELECT to one slate, so a daily run would have wiped the season's history. **The write scope was the bug, not the schedule.*** |
> | **recovery, any time** | re-running a range in PARALLEL | **`§T23.5`** | ✅✅ **FIXED `2026-09-23`, VERIFIED `2026-09-25` (`§T26.32`)** — *all `4` index-creating P2/P3 scripts guard with `to_regclass(...) IS NULL` first; `7` repaired in one campaign.* ⚠ **UNEXERCISED — keep recovery SERIAL until a parallel catch-up is observed to succeed.** 🔴 *`build_defender_ratings.py` (P1) still unguarded.* ⚠ ~~🔴🔴 **DEADLOCKS** — *`CREATE UNIQUE INDEX IF NOT EXISTS` inside the write transaction; `181` of `325` dates failed; `17` files carry the pattern, `7` in `P2`/`P3`* |
>
> ✅✅ **RE-VERIFIED LIVE `2026-09-25`.** ~~*Two of the three pipelines have no schedule, the one that
> produces picks aborts on every date of the new season, and the tool you would reach for to catch up
> deadlocks.*~~ ⇒ ***The first two are FIXED. The pipeline starts itself and runs the new season.***
> ✅✅ **`§T23.5` IS FIXED ON THE P2/P3 PATHS** *(`2026-09-23`; verified `2026-09-25`, `§T26.32`)* —
> **all `4` index-creating P2/P3 scripts check `to_regclass(...) IS NULL` before creating.**
> ⚠ ***KEEP RUNNING RECOVERY DATES ONE AT A TIME UNTIL A PARALLEL CATCH-UP HAS ACTUALLY SUCCEEDED*** —
> *the fix is sound and has never been exercised, and the failure it prevents cost `181` of `325`
> dates.* 🔴 **Residual: `build_defender_ratings.py` (P1) is the one unguarded script in any pipeline.**
> ⚠⚠ ~~*ONE REMAINS: the parallel catch-up still DEADLOCKS — `13` files carry
> `CREATE … INDEX IF NOT EXISTS`, `4` in `P2`/`P3`*~~ — **that count was the STRING, which the guard
> leaves in place; `RULE 62` was born from this reading** *(kept under `RULE 40`)*.
> ▶ **On the decision surface: `NBA_OPEN_ITEMS.md` → `ACT ON
> THIS` rows `1c`, `1d` and `4` (`T20-3`).**
>
> ## 📋 EVERY SECTION, IN LOGICAL ORDER
>
> ### 🎯 **A · WHAT IT IS FOR, AND WHAT IS AND IS NOT BEING BUILT**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0z`** | 🔴🔴 **THE OWNER'S STATEMENT OF WHAT THE SYSTEM IS FOR — and the ACCEPTANCE CRITERION it must meet** *(read before anything else)* | 🔴🔴 |
> | **`0z-3`** | 🔴🔴 **THE BUILD-ORDER LOCK — what will NOT be built, and in what order the rest comes** *(`T17`)* | 🔴🔴 |
> | **`0.75`** | **The three explicit NON-GOALS — what NBA was told NOT to build** | ⚠ |
> | **`0z-7`** | 🔴 **The two-pipeline decision, made in real time** — COMPASS fact 107's reasoning | 🔴 |
> | **`0z-2`** | 🔴 **Why ENUMERATION beats PREDICTION, measured — and it is the argument AGAINST the decision** | 🔴 |
> | **`0z-5`** | 🔴 **"Enrichment is thin BY DESIGN, not by failure"** — and the corpus's "ten rejected factors" | 🔴 |
>
> ### 🏗 **B · LINEAGE AND THE ORIGINAL PATTERN (`T1` → `T9`)**
> | § | what it covers |
> |---|---|
> | **`0`** | **LINEAGE — the owner's three-run model** *(`T1`)*, refined through `T4`–`T9` |
> | **`0.6`** | **The original wording** |
> | **`0.7`** | **The four-layer ordered full-run pattern** *(`T1`, the blueprint)* |
> | **`0.8`** | **CHAIN INDEPENDENCE — don't build one monolithic run** |
> | **`0.9`** | **Trigger / scheduling reality** — *"build this correctly from day one"* |
> | **`0.95`** | **The cadence as originally locked — three elements never recorded** |
>
> ### ⚙️ **C · THE THREE PIPELINES AS THEY STAND**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`1`** | 🔑 **THE CUTOFF — why `1:15 PM PT`** | 🔑 |
> | **`2`** · **`3`** · **`4`** | **`P1` — WEEKLY STATIC** · **`P2` — OVERNIGHT HEAVY** · **`P3` — AFTERNOON LIGHT** | |
> | **`4b`** | ✅ **`final_hp` — REBUILT BY `P2` STEP `6b`** *(closed ~~`2026-09-24`~~ `2026-09-23`, date corrected pass 114 → `NBA_MASTER_SUMMARY.md` `§T26.R3`; the section retains the history of the gap and its cause)* | ✅ |
> | **`5`** | **THE CALCULATION CHAIN** | |
> | **`6`** | **FAILURE POLICY** — *incl.* **`6b`** the pipeline-scrutiny methodology | |
> | **`7`** | **VERIFICATION STATUS** *(`2026-09-20`)* | |
>
> ### 🔴 **D · WHERE IT LIES TO YOU — the two adversarial audits**
> | section *(both are `h1`)* | what it covers | 🚩 |
> |---|---|---|
> | **`THE SWALLOWED-FAILURE CENSUS`** | 🔴 **Where a pipeline can do LESS than it claims and still certify green.** **Class A — `5` scripts where a partial failure is INVISIBLE** · ⚠ and it breaks a discipline this corpus already states · ✅ **Class B — correctly NOT defects, named so they are not re-found** · ✅✅ **the shell half, and it is CLEAN** | 🔴🔴 |
> | **`WHAT CERTIFIES GREEN WHILE BROKEN`** | 🔴 **The twelve checks, read adversarially.** **F1 — five of the twelve have NO DATE PREDICATE AT ALL** · 🔴🔴 **F2 — `> 0` means ONE ROW OUT OF SIXTY THOUSAND** · 🔴 **F3 — what is not checked at all** · ⚠ **F4 — the certifier's own clock is DST-naive, and the pipelines bypass it** | 🔴🔴 |
>
> ### 🔑 **E · THE DESIGN DECISIONS BEHIND THE ENGINE (`0a.*`)**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0a`** | 🔑 **THE OUTCOME GRADER — the design as the owner was given it, and what the code actually does** | 🔑 |
> | **`0a.1`** | 🔑 **The grader's build — what it caught, the storage decision, and a LIVE re-take of every figure** | 🔑 |
> | **`0a.2`** | 🔑 **MARKET CONSENSUS — the owner's WEIGHTING directive, the build that FAILED, and the design that replaced it** | 🔑 |
> | **`0a.3`** | 🔑 **THE TWO-PHASE CLOCK — where it was designed, the TWO LEAKAGE TRAPS, and the PREMISE under it** | 🔑 |
> | **`0a.4`** | 🔑 **The leakage test, the defect rule, and the scenario sizing** *(`T14`'s answers)* | 🔑 |
> | **`0a.5`** | 🔑🔑 **BASELINE AND ENRICHMENT ARE ONE SYSTEM — the measured result that invalidates a whole class of work** | 🔑🔑 |
> | **`0a.6`** | 🔑 **THE THREE-STAGE FUNNEL — where each link sits, and why** | 🔑 |
> | **`0z-4`** | 🔴 **The scenario calibration design, and the `17%`-vs-`90%` tension the corpus leaves UNRESOLVED** | 🔴 |
> | **`0z-6`** | ✅ **The availability model — how "`80%` confident-band accuracy" was actually reached** | ✅ |
>
> ### 📈 **F · THE PAPER-TRADING STRATEGY**
> | section | what it covers | 🚩 |
> |---|---|---|
> | **`standards_3pick_v1`** *(h1)* | 🔴 **Specified end to end**: selection *(`paper_pick_candidates`)* · packing *(`paper_pick_slips`)* · logging *(`log_paper_picks`)* · grading *(`grade_paper_picks`, called by `P2` step 3b)* · 🔴🔴 **the defect it exposes — the twelve-prop map is DUPLICATED** · ⚠ **`NOT RECORDED`: is the 3-leg slip a Power Play or a Flex?** | 🔴 |
>
> ### ⚠ **G · A RETRACTION, KEPT**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0z-8-T18-RETRACTION`** | ⚠⚠⚠ **This sweep OVERCLAIMED, and the retraction is recorded, not edited away** — **read this BEFORE `§0z-8-T18`** | ⚠⚠⚠ |
> | **`0z-8-T18`** | ⚠ **Superseded in part by the retraction above** — the `2:30 PM PT` trace | ⚠ |
>
> 📌 **HOW TO READ THIS FILE**: ***`A` is the mandate, `B` the lineage, `C` what runs, `D` how far to
> trust a green build, `E` why the engine is shaped as it is, `F` the strategy, `G` a correction kept
> in place.*** **If you are about to trust a passing certifier, read `D` first.**

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. P1/P2/P3 as built and tested in the live session; lineage from the owner's three-run model in T1. |
| **2026-09-21 → 09-22** | 🔴 **BACKFILLED 2026-09-22, T20 pass 65 (§T20.70) — this row covers `21` commits that this log never recorded.** *T15–T18 material plus the live audits: **§0a.1 the grader's build** (the alias catch, distinct-leg storage) and its stated intent · **§0a.2 market consensus** — the owner's weighting directive answered; `build_book_curves.py` exists but nothing reads it · **§0a.3 the two-phase clock** (delta scoring, the shapes/minutes split) · **§0a.4 the knowable-at-cutoff leakage test — 0 of thirty** · §0a.5 baseline and enrichment as one system (the A2 held-out result) · **§T16.3 why enumeration beats prediction (~17%/79%)** · §T17.1 the build-order lock (no orchestrator) · §T17.2 enrichment is thin BY DESIGN · **§T18.1 the two-pipeline decision's full reasoning** · §0z-8-T18 the 2:30 PM PT trace. **Corrections in place: the DNP-void design claim corrected from the grader's code · §0a.3 marked SUPERSEDED IN PART by COMPASS fact 107 · §0z-8-T18's trace claim RETRACTED · an unanchored "as of today" anchored · P1's cron time qualified PDT/PST.*** |

---

## 🔴🔴🔴 **§T26.70 — THE FIRST `T26` PASS TO READ THE OWNER STRATUM WITH THE INSTRUMENT: THREE UNRECORDED OWNER RULINGS, ONE OF THEM A STANDING DECISION RULE THAT GOVERNS EVERY OPTIMISATION IN THE SYSTEM — AND IT RE-RATES `T26-5`** *(`sweep_coverage.py tails --th 0.40`, `T26` OWNER stratum, 2026-09-26)*

> 📌 **`T26`'s twenty-six passes were all ITEM-driven. None had run the coverage instrument over the transcript itself.** *`score` puts `T26` at **`779` of `958` substantive segments uncovered (`81.3%`)**, and `tails` isolates **`16` uncovered `OWNER SAID` segments** — the stratum `RULE 32` says to read first and the one this transcript's passes had never opened.* ⚠ **Two of the sixteen turned out to be FALSE TAIL and are named below, because `RULE 20`'s novelty check catching a duplicate is a result, not a non-event.**

### 🔴🔴🔴 **RULING 1 — NO ACCURACY MAY BE TRADED FOR SPEED. A STANDING DECISION RULE, AND IT WAS IN NO DOCUMENT.**

> 📜 **OWNER, `T26`, `2026-09-24`** *(`sim 0.16` — the single least-covered owner segment in the transcript)*:
> > *"one more thing is that the timing is not bad. we need to sharp logic if possible, but the timing is not bad. so if it's possible to **optimize it without losing anything, we do. but if there is any loss, it's not worth the trade**."*
>
> ⚠⚠ **SEVEN VOCABULARIES, ZERO HITS ACROSS ALL TWELVE**: *`"not worth the trade"` · `"worth the trade"` · `"timing is not bad"` · `"without losing anything"` · `"any loss"` · `speed.{0,20}accuracy` · `optimi[sz]e.{0,25}loss`.* ⇒ **`RULE 20` satisfied: this is genuinely unrecorded.**
>
> 🔑🔑 **AND IT IS NOT AN ISOLATED REMARK — THE OWNER APPLIED THE SAME RULE TO A SPECIFIC PROPOSAL IN THE SAME TRANSCRIPT**, *asking for `P3` to be made lighter:*
> > *"if there is a way to run a **delta mode** or something like that. **But if it runs a delta mode, it needs to represent exactly the same if it was running one by one. For classification, for baseline, for everything.**"*
>
> ⇒ ***TWO STATEMENTS, ONE RULE: an optimisation is permitted only when it is EXACTLY equivalent. "Faster" is never on its own a reason.*** 🔑 **This belongs beside `§T26.27`'s "ALL PROPS STAY, NO EXCEPTION" as a governing constraint, and it has immediate teeth**: *any future proposal to scope, sample, delta or short-circuit `P2`/`P3` is answerable from this rule without asking again — and a proposal that loses anything is refused **even if it is much faster**, because the owner has already priced that trade at zero.*

### 🔴🔴 **RULING 2 — THE OWNER STATES, IN HIS OWN WORDS, THAT THE PIPELINES RUN UNMONITORED. THAT IS THE JUSTIFICATION FOR `A1` AND `A2`'s SEVERITY, AND IT IS HIS, NOT THE SWEEP'S.**

> 📜 **OWNER, `T26`, ~~`2026-09-24`~~ `2026-09-23` `23:26Z`** *(`sim 0.21`; date corrected `2026-10-10`, pass 112, → `NBA_MASTER_SUMMARY.md` `§T26.R1`)*:
> > *"all right, so fix p1, optimize p2, and also p1 if you need it, and get them both need to work. **they run um, not monitored, so get them to work**."*
>
> ⚠ *`"not monitored"` and `"unmonitored"`: **`0` hits in the twelve.** The CONCEPT "unattended" appears in seven of them — so the substance is not new — **but it appears as the sweep's own inference, never as the owner's stated operating condition.*** ⇒ 🔑🔑 ***That distinction is the whole value of this ruling: the ranked brief's `A1` (`T26-8`) and `A2` (`T26-9`) are rated `SILENT` and `UNCAUGHT` at the top of the list on the strength of "a silent failure costs a season before anyone looks". **The owner said the looking does not happen.** The rating is no longer the sweep's editorial judgement — it is the operating condition the owner specified, and `A1`/`A2` should be read that way.***

### 🔴 **RULING 3 — THE AT-REST CREDENTIAL FINDING IS ACCEPTED RISK. THE BOUNDARY MATTERS MORE THAN THE RULING.**

> 📜 **OWNER, `T26`, ~~`2026-09-24`~~ `2026-09-23` `19:39Z`** *(`sim 0.34`; date corrected `2026-10-10`, pass 112, → `NBA_MASTER_SUMMARY.md` `§T26.R1`)*:
> > *"so first about the two finds. **the encrypted data, it doesn't really matter. just i have access to it. nobody else accesses this database. so that's not really an issue.**"*
>
> ✅ *`"nobody else accesses"`: **`0` hits in the twelve** — the finding is recorded in three of them, **the owner's ruling on it in none.*** ⇒ **RECORDED AS AN ACCEPTED RISK**: *the `6` credentials stored in Postgres with no encrypt/decrypt step anywhere in the `190` files — two of them bare `36`-character values — are a risk the owner has seen, priced and accepted, on the stated ground that he is the only party with database access.*
>
> ⚠⚠⚠ **AND HERE IS THE PART A FUTURE READER MUST NOT GET WRONG — THE RULING IS SCOPED TO THE DATABASE AND DOES NOT REACH `F2-1` OR `T22-1b`.** *Those are a live credential **published in a PUBLIC GitHub repository**, still present in `2` commits. **"Nobody else accesses this database" is true of a private database and false of a public repo** — different exposure, different audience, different remedy (rotation, not acceptance). 🔴 ***`F2-1` and `T22-1b` remain OPEN and are not covered by Ruling 3.*** *This paragraph exists because the two findings were presented to the owner together, in one turn, as "the two finds" — and a reader skimming the ruling could easily extend it to both.*

### ✅✅ **AND THE RE-RATING THIS PASS OWES `§T26.57` / `T26-5`: THE CORPUS ALREADY ANSWERED THE QUESTION I RANKED ON**

> 🔑 **The owner's preseason segment scored `0.26` — apparently uncovered:**
> > *"pre-season, maybe not even be part of the data that's tracked. because it's **very, very volatile**. some of the main stars are not even gonna play. if they play, they play very little. um, the **rookies are gonna play a lot**. so that may **mess with the data** instead of helping. … because maybe that's not very, very useful. not reliable."*
>
> ✅ **FALSE TAIL — the novelty check found it recorded, in different words, in THIS FILE**: ***"PRESEASON IS REJECTED AS A PLAYER-STATISTICS SOURCE AND ACCEPTED AS A MARKET-STRUCTURE SOURCE"*** *and* ***"PRESEASON IS NOT A SLATE" (owner decision `2026-09-24`, live in the code)*** — *`prune_baseline_to_board.py` even carries it as a comment: "Preseason is rejected for the projection pipeline; only its boards are captured, so a preseason board with no baseline is the normal case."*
>
> ⚠⚠ ***BUT I DID NOT APPLY IT WHEN I RANKED `§T26.57`.*** *That section called the missing game — `0012600067 | UTA @ DEN | 2026-10-04` — a hit on "**the second day of preseason**" and `START HERE` carried it as "the one that changes what you do today". **Read against "preseason is not a slate", the cost is one game's MARKET-STRUCTURE capture, not a slate**: no baseline is expected for it, no projection is owed for it, and the `1,400` regular-season games are all loaded.* ⇒ ✅ **`T26-5` RE-RATED: the fix is still one dispatch-list entry and still worth doing before `2026-10-03`, but it is NOT an opening-night risk and should not outrank `A1`/`A2`.** 🔑 **`T26-8` remains the reason to make the fix — the loader is `1` of `10` undispatched workers — and the schedule drift is now its EVIDENCE rather than its own headline.**
>
> ⚠ *A second false tail in the same stratum, recorded for the same reason: the owner's* **"we intentionally did not make a join because we're going to do a lot of back testing soon"** *is already in `NBA_RECIPE.md`, quoted and attributed, beside the `1`-foreign-key finding.* ⇒ 🔑 **`2` of the `16` owner segments were duplicates the instrument could not see. `RULE 20`'s novelty check is what kept them out, and catching them is the reason the check exists.**

> 🔁 **RE-DERIVE** *(`RULE 59`)*:
> ```bash
> python3 nba/tools/sweep_coverage.py score --transcripts <local>   # T26: 779/958 uncovered, 81.3%
> python3 nba/tools/sweep_coverage.py tails --th 0.40 --outdir <dir>
> sed -n '/## OWNER SAID/,/## ASSISTANT/p' <dir>/2026-09-24-*-final-hp-restore.tail.md   # the 16
> ```

## 0z-7. 🔴🔴🔴 **THE TWO-PIPELINE DECISION, MADE IN REAL TIME — COMPASS FACT 107's REASONING, AND IT RESOLVES THE TENSION §0z-2 RECORDED** *(T18 pass 0, §T18.1, owner, 2026-09-19; **the largest owner stratum in the corpus — 57 turns, 26,633 chars, mean 467**)*

*§0z-2 records that fact 107 DROPPED the scenario precompute six days after the owner called it
non-negotiable, and flags that **"the measured 83% cost was never put beside it"**. **It was. This is
the argument, and the owner makes it himself across seven turns.***

### 🔴 **THE QUESTION HE ASKS FIRST — and it is a good one**

> ***"The 30 minutes before tip — is that the FIRST game of the day, or before EACH ONE of the games?
> … Miami plays at 4, so it releases a report at 2:30 and its very last 30 minutes before tip, at
> 3:30. Golden State is playing at 7 — **they also release at 2:30 p.m. Pacific**, and their very last
> report is 30 minutes before 7, so 6:30. **Because that DOES affect how we treat data freshness.**"***

🔑🔑 **AND HIS OWN OPERATING PATTERN IS WHAT DECIDES IT**: *"my idea is, after 2:30 we run the last
piece of pipeline… **I'm not going to be able to use the last 30 minutes before tip anyway.** I'm going
to put my slips around **3, 3:30**… **that's probably the only run of the day that matters for my
slips. So data freshness is gonna PENALISE LEGS THAT I'M GONNA USE ANYWAY** — **the data freshness is
more gonna HURT than HELP.**"*

### 🔴🔴🔴 **THEN HE RUNS THE SWEEP'S OWN METHOD ON THE ASSISTANT** *(0 of the twelve, 0 of the thirty)*

> ***"So who created the full NBA universe was YOU. This chat only, and no other AI, was Claude in
> this chat. **So if there is any discrepancy, IT'S YOU DRIFTING.** So you need to look at
> documentation, look at the chat transcripts — I know it's a lot of transcripts to look at — but
> **YOU were the one drifting. So you need to understand WHY you say 2:30 and now you're saying 1
> p.m.**"***

⚠⚠ **THAT IS THIS DOCUMENTATION SWEEP'S PREMISE, STATED BY THE OWNER BEFORE THE SWEEP EXISTED**: *a
discrepancy between what the system does and what the documents say is DRIFT, and the remedy is the
transcript archive.* 🔑 **And the instruction that follows it is the sweep's brief verbatim**: *"go to
the documentation and the compass, **see WHEN was the last time you updated, and then go to the CHAT
HISTORY AND TRANSCRIPT from that same date and time, and update everything from there to now. NO
EXCEPTION, NO EXCUSES, NO SKIPPING.**"*

### ✅✅ **THE ANSWER, AND IT COLLAPSES THREE DECISIONS INTO ONE**

> ***"We are OVERCOMPLICATING it. We need ONE SIMPLE ANSWER. **I do not need the LAST report. I need
> ONE DECENT REPORT** — players, lineups, injury report, referee, all the daily factors. Research and
> understand **what time, Pacific, that information comes**. And then we have our cutoff hour."***
>
> ***"The game-day injury report is the last thing that comes up, and the first report comes **around
> 11 a.m. to 1 p.m. Pacific**. … **We just need TWO pipelines, not three anymore** — the heavy one
> that runs early morning, and one that does the daily factors after 1 p.m., **around 1:30, or
> 1:15**… **And all that was because of the data freshness** … **so that one is DEFERRED. We're not
> gonna use that one.** … **And we do not need the simulations** — there was one simulator that would
> create all the possible situations for when we run the last pipeline to pick the correct outcome.
> **We do not need that anymore. That extra processing, extra data that we do not need anymore.**"***

🔑🔑🔑 **SO FACT 107's THREE CLAUSES — two pipelines · the 1:15 PM cutoff · the scenario simulator
dropped — ARE ONE DECISION WITH ONE REASON.** ***If the complete daily report arrives by 1 p.m., the
window moves to 1:15; if the window is 1:15 and the owner places slips at 3–3:30, there is no later
SELECTION MOMENT; and enumeration without a selection moment has nothing to resolve against.*** ✅
**§0z-2's open question — "does the single-window system assume the likeliest branch or carry the
uncertainty into the probability?" — is answered a third way: IT DOES NEITHER, because at 1:15 the
report is already complete for every team and there is little left to enumerate.**

⚠⚠ **AND THAT ALSO CLOSES OPEN ITEM T17-3.** *The freshness gates were recorded as "probably the
same" — a HEDGE. **They are not a hedge: they are DEFERRED on a stated mechanism** — they would
penalise legs the owner uses anyway, because his only run of the day is the 1:15 one.* 🔑 **A
correctness feature rejected not as wrong but as IRRELEVANT TO THE OPERATOR'S ACTUAL WORKFLOW.**

⚠ **ONE RECONCILIATION THE CORPUS NEEDS**: later in the same session the owner says ***"we still have
THREE pipelines — the WEEKLY STATIC, the heavy overnight one, and the light early-afternoon one."***
🔑 **Fact 107's "two pipelines" counts the DAILY pair; the weekly static run is a third and separate
one. Both statements are his, six turns apart, and they are not in conflict.**

### ✅ **THE THREE PIPELINES AS HE SPECIFIES THEM**

| # | Pipeline | Spec |
|---|---|---|
| **1** | **WEEKLY STATIC** | *"already configured, not running yet… **schedule once a week** because if there is any team change. **Use cron** … maybe **12 every Monday**"* — ✅ **cron may be set NOW** |
| **2** | **HEAVY OVERNIGHT DELTA** | *"mine the game logs every day and also do the classification and baseline calculations… **from 1 a.m.**"* ⚠ *"**it's a DELTA setup, a complement day by day — and CANNOT HAVE GAPS. Has to cover ALL teams, players, all games.**"* 🔴 **DO NOT SET CRON — "it's not going to have data to run until the beginning of the season"** |
| **3** | **LIGHT EARLY-AFTERNOON** | *"the daily mining, the daily factors, final scoring engine, final hit probability, final confidence, final score"* 🔴 **DO NOT SET CRON, same reason** |

🔑🔑 **AND THE VERIFICATION HE SPECIFIES IS A PARITY TEST**: ***"get one day from the PAST that we
already have a baseline calculation AND a final scoring calculation, and run it END TO END and see if
it MATCHES the data that we already have — BECAUSE IT NEEDS TO."*** ⚠ **That is the strongest
statement of the parity standard in the corpus: the new pipeline must REPRODUCE the stored history
exactly, not merely produce plausible numbers.** ⚠ *He also requires a forward simulation on a
scheduled game day, since live data will not exist until the opener.*

---

## 0z-5. 🔴🔴🔴 **"ENRICHMENT IS THIN BY DESIGN, NOT BY FAILURE" — and the corpus's "ten rejected factors" framing is WRONG** *(T17 pass 1, §T17.2)*

⚠⚠ **THIS CORRECTS A FRAMING THIS SWEEP HAS PUBLISHED.** *`NBA_FINAL_SCORING_CALIBRATION.md`
§0a-T15-SUPERSESSION-2 and §0a-T16 record a long sequence of factor rejections as a single coherent
result. **The author reached the same framing — "ten tested candidates, and the pattern is
consistent" — and then retracted it after re-reading the governing documents.***

> ***"**a3, a4, d2 and k1 were NEVER ENRICHMENT CANDIDATES.** §7's stage table already assigns all four
> to **BASELINE**, and §4 notes a3 is 'measured; in baseline v30'. **So my gate wasn't testing new
> factors — it was testing DUPLICATES of things the baseline already computes. The zero gains weren't
> a discovery; THE DOCUMENT PREDICTED THEM.** My 'ten rejected factors' framing was wrong: **several
> were never candidates.**"***

*The gate that produced them, for the record — **1,248,826 graded legs**: a3 return ramp **+0.00001**,
a4 rest/b2b/3-in-4 **−0.00002**, k1 coach change **−0.00002**, all three combined **−0.00003**.* 🔑
**Correct measurements of a question the stage table had already answered.**

🔑🔑🔑 **AND THE POSITIVE STATEMENT IS THE ONE TO CARRY**:

> ***"**ENRICHMENT IS THIN BY DESIGN, NOT BY FAILURE.** §7 lists what actually belongs in phase 2: the
> 2:30 day-of report, late scratches, projected lineups (rejected), the 2:45 line movement, the
> book-vs-pick'em gap, and the board itself. **That's the complete set.** The 0.004–0.014 movement I
> kept treating as a SHORTFALL **is the architecture working as specified — the heavy lifting belongs
> in the baseline.**"***

⚠⚠ **So the corpus's recurring "the baseline beats every enrichment factor" finding is TRUE but
MIS-FRAMED as a surprise.** ✅ **It is the design. The owner states it independently — *"all the
heavyweight needs to be on the baseline"* (§0z §5) — and §7 of the parity document enumerates phase 2's
complete contents.** 🔑 **The genuine discovery was never "factors fail"; it was that SEVERAL FACTORS
WERE TESTED AT THE WRONG STAGE, and the measurement cost was paid to re-derive what the stage table
already said.**

⚠ **The sweep's own failure alongside it**: *it read a long rejection sequence as a single finding
without checking whether the rejected items were ever candidates. **Rule 7's shape — grep the
distinctive term before asserting — applied to a FRAMING rather than to a fact.***

---

## 0z-6. ✅ **THE AVAILABILITY MODEL — how "80% confident-band accuracy" was actually reached, and the three bugs on the way** *(T17 pass 1, §T17.2; COMPASS fact 97's evidence)*

### 🔴 THREE BUGS, EACH CAUGHT BY A GUARD OR BY THE OWNER, NONE BY INSPECTION

| # | Bug | How it surfaced |
|---|---|---|
| **1** | **A BACKWARD-LOOKING TEAM ACCUMULATOR** — the scenario builder resolved a player's team from games he had already appeared in, so *"for the vast majority of questionable players the lookup is against a team they haven't appeared for yet"* | 🔑 **0 games with uncertainty for 2024-25 and 7 for 2025-26, against 363,689 and 827,562 injury rows** — *"a scenario layer that **silently finds no uncertainty** would have looked fine in production while doing nothing at all"* ✅ **Fixed by reading the team from the injury-report row itself, which carries `matchup` ("hou@okc") and the team's full name — *"I never used either"*** |
| **2** | **A UNIFORM TRAINING LABEL** — *"`divide by zero encountered in log` at `np.log(base / (1 − base))`, and accuracy 0.0000 across the board. **`base` is 0 or 1**, which means the played-flag lookup is failing"* | ✅ **A guard was added that ABORTS rather than reports**: *"abort: train base rate 0.0000 on 8 rows is not a plausible questionable play rate"* — 🔑 *"a guard like that would have **failed loudly** here instead of producing zeros"* |
| **3** | 🔴🔴 **FILTERING ON THE FINAL STATUS** — *"I filtered on `last_status == 'questionable'` — the status at the FINAL snapshot. But **by the final report, nearly every questionable has been resolved**. **Only 7 players stayed questionable to the end.** **The final status is the ANSWER, not the feature.**"* | ✅ **Fixed by reading the status at the 2:30 PM DECISION CUTOFF** — the last snapshot before the window *(COMPASS fact 98a)* |

### ✅ THE FOUR LAYERS, AND EACH ONE EARNS ITS PLACE

| Layer | accuracy | AUC |
|---|---|---|
| flat 0.552 | 0.5144 | **0.4781** *(worse than a coin flip)* |
| L1 hierarchical prior | 0.5582 | 0.5790 |
| L2 gradient boosting | 0.5825 | 0.6217 |
| **L3 stacked** | **0.5870** | **0.6299** |

⚠ **AND THE AUC GAP AGAINST THE PUBLISHED LITERATURE IS EXPLAINED RATHER THAN EXCUSED**: *"our AUC of
0.63 versus the published NBA injury-risk study's 0.83 is **expected: they predict INJURY OCCURRENCE
from workload over weeks; we predict **A COACH'S SAME-DAY INTENT, WHICH IS DELIBERATELY CONCEALED.**"*
🔑 **And the model's honesty is verified by its own uncertain band: *"the uncertain band's play rate is
0.529 — if the model were broken, that band would be SKEWED. It sits at the TRUE BASE RATE, meaning
the model correctly identifies WHICH CASES IT CANNOT CALL."***

### 🔑🔑 THE LEAGUE'S OWN RULES WERE THE FEATURE THAT GOT IT TO 80%

*Three rule-based discriminators, straight from the official source:* **(1) report deadlines differ by
tip time — the game-day report is due 11am–1pm local, but 8–10am for tips at 5pm or earlier**, *"so for
early games our 2:30 window is PAST the final deadline"*; **(2) road games have a different rule** —
*"a team may only list a player as out or doubtful for a road game if the player did not travel or is
not present in the visiting market"*, so **a road questionable means something different from a home
one**; **(3) the active list locks 60 minutes before tip — the true resolution moment.**

| | before | **after** |
|---|---|---|
| confident band size | 3.0% | **4.2%** |
| **confident band accuracy** | 65.0% | ✅ **80.0%** |
| leaning-play accuracy | 69.6% | 72.3% |
| genuinely uncertain | 80.5% | 79.0% |

### 🔑 THE ROLE SPLIT — **and the operational rule it implies**

| role | n | play rate | accuracy | confident share | **confident accuracy** |
|---|---|---|---|---|---|
| **fringe (<15 min)** | 254 | 0.343 | **0.658** | 11.8% | ✅ **86.7%** |
| rotation (15–25) | 429 | 0.539 | 0.580 | 2.8% | 66.7% |
| starter (25+) | 639 | 0.567 | 0.571 | 2.0% | 76.9% |

🔑🔑 ***"TRUST THE MODEL FOR FRINGE PLAYERS, AND ROUTE STARTERS AND ROTATION PLAYERS TO THE SCENARIO
LAYER — which is exactly the split the architecture already supports. NOT ONE THRESHOLD FOR
EVERYONE."*** ⚠ *"That's the psychological-warfare effect the research described: **teams hang the tag
on MEANINGFUL players deliberately**, and the resolving decision genuinely isn't made until warmups."*

### ⚠⚠ **MARKET MOVEMENT WAS REJECTED TWICE — and the second rejection is the honest one**

*The hypothesis was strong and the research backed it: **"one star player ruled out can swing a spread
by 4–5 points within minutes"** and **"beat reporters at shootaround, warmups, travel updates… move
markets before anything is official"** — **"the market knows before the report does."*** 🔴 **First
rejection (confident band 4.2% → 3.3%, accuracy 80.0% → 77.3%) was attributed to the author's own
join**: *"any miss defaults to **0.0**, which the model reads as **'no movement' rather than
'unknown'** — that dilutes a genuinely strong signal into noise."* ✅ **Re-tested with a proper NaN join
and a `has_move` indicator — and it STILL failed** *(0.6794 / 0.6191 / 73.5% against 0.6780 / 0.6216 /
79.6%)*. 🔑 **THE STRUCTURAL REASON**: *"**our window snapshot is 14:45 PT**, while the injury-driven
line moves happen **at shootaround and in the final 60 minutes before tip — AFTER our capture. We're
measuring a window that closes before the information arrives.** A **tip-60 snapshot** would test it
fairly; our current data cannot."* ⚠ **So the factor is not refuted — it is unmeasurable with the data
the system currently captures, and the capture change that would test it is named.**

### 🔑🔑 **AND A SELECTOR BUG WORTH MORE THAN THE MODEL — a yield metric that a human would reject**

*The automatic selector initially ranked **"per-tier + player history" top at 0.0469 purely because it
flagged 6.7% of cases**, despite **worse accuracy (70.5% vs 79.6%) and materially worse AUC (0.589 vs
0.622)**.* 🔴 ***"A WIDER BAND OF WEAKER CALLS ISN'T BETTER — A BAD CALL COSTS A LEG."*** ✅ **Fixed with
an ACCURACY FLOOR ≥75% applied BEFORE maximising share, with AUC as tie-break** — *"so the automatic
selector can't pick a configuration a human would reject on sight."* **Four configurations were then
rejected by the floor**, and the selected one is **pooled + player history: 79.6% confident accuracy on
4.1% of cases.** 🔑 **A selection metric is a model too, and this one was wrong in a way no amount of
model quality would have fixed.**

---

## 0z-3. 🔴🔴🔴 **THE BUILD-ORDER LOCK — what will NOT be built, and in what order the rest comes** *(T17 pass 0, §T17.1, owner, 2026-09-19; **0 of the twelve, 0 of the thirty**, positive controls passed)*

> ***"**Leg correlation is a SLIP-BUILDING level — we will not work on that until we have the final HP
> and score sharpened to perfection.** **Freshness gates** probably the same. **ORCHESTRATOR WILL NOT
> EXIST — just the daily functions, and THE CLAUDE WORKER WILL EXECUTE ONE BY ONE VIA PROMPT.** …We
> need to finish **all the enrichment factor pipeline, final HP, score and confidence REPLICATED TO
> THE FULL DATABASE** — only then do we move to the points you said. So **any open essential factors
> for this phase are still ENRICHMENT RELATED.**"***

🔑🔑 **THIS IS A GATE, AND IT DISPOSES OF THREE ITEMS THE CORPUS CARRIES AS OPEN WORK**:

| Item | Status under this turn |
|---|---|
| **leg correlation** | ⏸ **DEFERRED by decision** — slip-building level, blocked on final HP + score |
| **freshness gates** | ⏸ **"probably the same"** — ⚠ *hedged, not decided; the sweep records the hedge as a hedge* |
| 🔴 **the orchestrator** | ❌ **WILL NOT EXIST** — *"just the daily functions, and the Claude worker will execute one by one via prompt"* |

⚠ **THE ORCHESTRATOR DECISION IS NOT NEW — IT IS A DATED RE-ISSUE, AND THE KILL IS LOGGED.** *The
corpus already records it four independent ways* *(`"no orchestrator, confirmed as the explicit
design"` · `"there is deliberately no orchestrator"` · `"NBA has no orchestrator by design"` ·
`"explicitly NO orchestrator — each run triggered manually, worker by worker"`, **22 of the thirty and
18 of the twelve**)*, **including a note that the owner had already restated it in his own words.** 🔑
**What T17 adds is the MECHANISM in his words — *"the Claude worker will execute one by one via
prompt"* — which names WHO runs the daily functions, and that is the piece the four existing records
leave implicit.**

🔴🔴 **THE GATING CONDITION IS THE ONE TO CARRY**: ***"final HP, score and confidence REPLICATED TO THE
FULL DATABASE."*** ⚠⚠ **`[LIVE-AUDIT]` 2026-09-22: `nba_score.final_hp` holds 2024-25 at 162 dates and
2025-26 at ONE date** *(open item **T16-7**)* — **so by this turn's own condition the gate is not yet
met**, and the items behind it stay deferred. 🔑 **BUT READ IT WITH THE OWNER'S SCOPE WORD**: later in
the same session he asks *"so every single leg for the past two seasons, **BOARD SCOPED**, have a
final hit probability and a confidence percentage, correct?"* — ⚠⚠ **"BOARD SCOPED" is a much smaller
population than the full ladder, and whether `final_hp`'s expected size is the board-scoped set or the
full ladder is NOT RECORDED. That distinction decides whether T16-7 is a gap or a scoping choice, and
it is pass 1's highest-value question.**

⚠ **And a fourth disposal, on the market-movement factor**: *"market movement is going to be **too
weak with so close market mining data points** — so if the test doesn't show much evidence of
improvement, **better leave it out**."* 🔑 **The owner pre-authorising a rejection on a stated
mechanism, which is the inverse of his T16 anti-rejection order and shows the two are not a blanket
rule but a judgment about whether the FEATURE was fairly built.**

---

## 0z-4. 🔴🔴 **THE SCENARIO CALIBRATION DESIGN, AND THE 17%-vs-90% TENSION THE CORPUS LEAVES UNRESOLVED** *(T17 pass 0, §T17.1; **0 of the twelve, 0 of the thirty**)*

> ***"The scenario precompute should be run on the FULL SEASON — **for CALIBRATION only, because we
> already know the outcome**. It should be run on **EVERY SINGLE MATCH** for calibration, and then it
> should be **DELETED**. We just keep the real outcome… because it's gonna keep too much data that's
> unneeded — **that should be MILLIONS OF ROWS that's just gonna eat up space.** We need to run on the
> two seasons, get the proper logic that's gonna run daily, and then **we just keep the real outcome,
> NOT ALL THE UNIVERSE.**"***

✅ **COMPASS fact 95(c) is this design executed**: `nba/build_scenario_calibration.py`, **1,651 games
with uncertainty enumerated, only the realised branch stored** (`nba_score.scenario_realised`), *"the
unrealised universe is never written."* 🔑 **The owner specified both halves — enumerate everything to
CALIBRATE, store only the outcome to SURVIVE — and the storage argument is his, not an
implementation detail.** → 🆕 *the calibration by uncertain-player count (one to five), as the transcript gives it (`2026-10-14`, additional sweep `2`): `NBA_MASTER_SUMMARY.md` `§T17.6`.*

### ⚠⚠ AND THE TENSION THE SWEEP MUST RECORD RATHER THAN RESOLVE

| | |
|---|---|
| **COMPASS fact 96** *(measured)* | *"With three Questionable rotation players the most-likely branch is the realised one **only ~17%** of the time… **79% of Questionables are genuine coin flips at 2:30 BY DESIGN**… **NO MODEL REACHES 90% ON INFORMATION THAT DOES NOT EXIST YET — SELECTION DOES, once it arrives."*** |
| 🔴 **The owner, on being shown it** | ***"That's where calibration comes. We need to calibrate to the point where there's an extremely high number of assertivity. **So seventeen percent is definitely TERRIBLE. WE NEED A NINETIES. Very high.**"*** |
| *and* | *"probably you're gonna need to **split, have different tiers and layers, granulate different player profiles** to have more assertiveness… make it more complex, more steps if needed, **because we need extremely high assertiveness.**"* |

🔑🔑 **THE TWO ARE NOT THE SAME QUANTITY, AND NOTHING IN THE CORPUS SAYS SO.** *Fact 96's ~17% is **the
probability that the most-likely BRANCH is the realised one** — a property of the branch distribution
under genuine coin flips. The owner's "nineties" is **assertiveness of the final number**. **A system
can be 90%+ assertive about a leg's probability while being 17% likely to guess the roster — indeed
that is the enumeration architecture's entire claim.*** ⚠ **NOT RECORDED anywhere that these are
different quantities**, and the owner's reply reads as a rejection of the measurement rather than a
demand on a different axis. 🔴 **OWNER DECISION**: *confirm which quantity the "nineties" target
applies to.* ⚠⚠ **It matters now because COMPASS fact 107 (2026-09-19, the SAME DAY) DROPS the
scenario precompute** *(§0z-2 below)* — **so the mechanism that answers the 17% is being removed in
the same session the owner demands 90%.**

⚠ **Note also the granularity instruction — *"split, have different tiers and layers"* — lands two days
after COMPASS fact 97b measured PER-TIER SPLITTING as HARMFUL** *(AUC 0.62 → 0.59 on N1;
`NBA_BASELINE_CALIBRATION.md` §0z-T16-C)*. **Both dates on file; the tension is real and is the second
instance of it.**

---

## 0z-2. 🔴🔴🔴 **WHY ENUMERATION BEATS PREDICTION, MEASURED — and it is the argument AGAINST the decision that later dropped the scenario simulator** *(T16 pass 2, §T16.3, from COMPASS fact 96 — migration item, **0 of the twelve**)*

> 🔑🔑 ***"With three Questionable rotation players, the MOST-LIKELY BRANCH is the realised one only
> ~17% OF THE TIME — so assuming the likeliest outcome scores THE WRONG ROSTER IN 83% of those
> games."***

⚠⚠ **AND THE REASON IS STRUCTURAL, NOT A MODELLING SHORTFALL.** The availability model measures that
**79% of Questionables are genuine coin flips at 2:30 PM (play rate 0.522) — *BY DESIGN***:

| | |
|---|---|
| **teams use the tag to CONCEAL INTENT** | the label is strategic, not informational |
| **the Active List does not lock until 60 minutes before tip** | the fact does not exist at the window |
| **clubs file as late as 30 minutes out** | later than any pipeline stage |

> 🔑🔑🔑 ***"NO MODEL REACHES 90% ON INFORMATION THAT DOES NOT EXIST YET — SELECTION DOES, ONCE IT
> ARRIVES."***

✅ **That is the cleanest statement in the corpus of WHY the architecture enumerates branches rather
than predicting one**, and it is the justification for N1's unusual selection criterion — *confident-band
yield rather than log-loss, "because the model's job is ACTIONABLE CALLS and everything else routes to
the scenario layer"* *(`NBA_BASELINE_CALIBRATION.md` §0z-T16-C)*. 🔑 **The two facts are one design:
N1 answers what it can answer confidently; the scenario layer absorbs the 79% it cannot.**

### ⚠⚠ AND THIS IS WHERE THE CORPUS CONTRADICTS ITSELF ACROSS SIX DAYS — **both dates on file (rule 5)**

| Date | The position |
|---|---|
| **2026-09-13** | **The owner calls PRE-CALCULATED SCENARIOS for the last-minute injury report *NON-NEGOTIABLE*** *(§0z §3 below)* |
| **2026-09-14/15** | ✅ **BUILT** — COMPASS fact 95(c): `nba/build_scenario_calibration.py`, **1,651 games with uncertainty enumerated**, **only the realised branch stored** (`nba_score.scenario_realised`) — *"the unrealised universe is never written"* |
| **2026-09-14/15** | 🔑 **JUSTIFIED BY MEASUREMENT** — fact 96, the ~17% / 79% figures above |
| **2026-09-19** 🔴 | **COMPASS fact 107 (owner decision): TWO pipelines, cutoff 1:15 PM PT, and *"the scenario precompute is DROPPED — with a single window there is nothing to select with."*** |

🔑🔑 **THE REVERSAL IS COHERENT, AND THE COHERENCE IS THE POINT**: **enumeration only pays if a LATER
stage selects the realised branch.** *Collapse three stages into two and the selection moment
disappears, so the branches have nothing to resolve against — **fact 107's own reasoning**.* ⚠⚠ **BUT
THE MEASURED COST OF DROPPING IT IS THE 83% FIGURE, AND NO DOCUMENT PUTS THE TWO TOGETHER**: *with a
single window the system must either **assume the likeliest branch — wrong in 83% of three-Questionable
games — or carry the uncertainty into the probability itself.* 🔴 **NOT RECORDED which it does.**

🔑 **The `scenario_realised` design is worth keeping in view regardless**: **enumerate the universe,
store ONLY the realised branch.** *That is what makes enumeration affordable — the cost is compute at
phase 2, not storage — and it is why the 1,651-game build exists as evidence rather than as a
hypothesis.*

---

## 0z. 🔴🔴🔴 **THE OWNER'S STATEMENT OF WHAT THE SYSTEM IS FOR — AND THE ACCEPTANCE CRITERION IT MUST MEET** *(T16 pass 0, §T16.1, from the 2026-09-13 transcript; **nine of ten probes returned 0 of the twelve AND 0 of the thirty**, positive controls passed)*

⚠⚠ **T16's owner stratum is the design-authority stratum of this corpus** — **32 turns, 11,487 chars,
mean 359**, including the two longest owner turns the sweep has read *(3,220 and 2,095 chars)*. **It
is where the system's acceptance criterion, its non-negotiables and its layer split are stated in the
owner's own words, and almost none of it was on file.**

### 🔑🔑 1 · THE ACCEPTANCE CRITERION — **"decimals of difference"** *(0 of twelve, 0 of thirty)*

> ***"What I need from this system: with baseline and the final hit probability after enrichment, they
> need to be PRECISE. They need to be as SHARP AS POSSIBLE TO REALITY — **leg per leg, band per band,
> day by day, player by player, prop line per prop line, variation per variation, direction by
> direction.** … I need that the system has a formula that I'm gonna run every day, and that every day
> that hit probability percentage given to any specific leg, any specific day, any specific team, any
> specific prop line, variation or direction is gonna be extremely ASSERTIVE. … When I say extremely,
> **I want DECIMALS OF DIFFERENCE, or as close to that as possible.**"***

⚠ **The scope is explicit and it is the finest granularity stated anywhere in the corpus**: *leg ·
band · day · player · prop line · variation · direction* — **seven axes, all at once.** ✅ **And the
validation population is named**: *"any day that I get this full pipeline — baseline, enrichment,
everything together — and I run it on **any day of the past two seasons**, that needs to be extremely
sharp for any leg."* ⚠ **With one exclusion the owner states himself**: *"of course there are
situations that's gonna get out of the probability — the player is off, or an injury in the middle of
the game. **But besides the ABNORMALITIES, the system needs to be extremely sharp.**"*

### 🔑🔑🔑 2 · THE DISPOSAL RULE — **the owner ACCEPTS factor rejections, provided the final HP is sharp** *(0 of twelve, 0 of thirty)*

> ***"So if you say that's a fail, that's not needed, or it's being DOUBLE USED, or whatever — as soon
> as that final hit probability percentage is extremely [sharp] … then I'M FINE. I'm fine. That's what
> you need to understand."***

⚠⚠ **THIS IS THE DECISIVE CONTEXT FOR THE ENRICHMENT RETRACTION** *(`NBA_FINAL_SCORING_CALIBRATION.md`
§0a-T15-SUPERSESSION-2: the certified baseline beats every enrichment factor)*. 🔑 **The owner's
criterion is the OUTPUT's sharpness, not the number of factors that ship — so "the baseline already
carries it" is a PASS under his own standard, not a failure.** ⚠ *Recorded because the corpus records
the rejections and not the standard that makes them acceptable, which leaves a reader to infer that
six of seven candidates failing is a problem. **By this turn, it is not.***

⚠ **And he is explicit about what he does and does not want to be told**: *"you're explaining me a lot
of betas and alphas and shit that I'm not gonna understand. **You are researching. You are looking at
the articles, the studies, the systems out there. YOU are the one who needs to understand that** —
understand what meets the final level of assertiveness."*

### 🔴🔴 3 · THE THREE NON-NEGOTIABLE FACTORS, IN THE OWNER'S OWN WORDS *(the origin of COMPASS fact 95)*

> ***"There are factors that need to be PROPERLY TREATED. Whatever the fuck it is — in baseline, in
> enrichment, I don't care, but it needs to be properly treated.***
> ***· **BLOWOUT PREVENTION IS NON-NEGOTIABLE** — "blowouts are gonna happen, and when they happen
> everything gets screwed. Everything that was historically accurate in a blowout situation is not
> gonna be that way."***
> ***· **PRE-CALCULATED SCENARIOS FOR THE LAST-MINUTE INJURY REPORT AND LINEUPS** — "we need to have
> the precalculated scenarios for the last-minute injury report and lineups, pick up the correct one.
> That's NON-NEGOTIABLE."***
> ***· **TEAM MATCHUP IS NON-NEGOTIABLE** — "a team that plays a bad team, a weak attack, a weak
> defense, or a strong defense, a strong attack — those kinds of things are non-negotiable."***
> ***Everything else is bells and whistles… if it works great, if it helps great, if it does not, we
> deal with the best we can do with it."***

🔑🔑 **THE NON-NEGOTIABLE / BELLS-AND-WHISTLES SPLIT IS A PRIORITISATION RULE THE CORPUS DID NOT
CARRY** — *`non-negotiable` appears 13 times in the thirty and 6 in the twelve, but **the owner's own
three-item list with the "everything else" clause is new here***. ⚠ **AND NOTE WHAT IT MEANS FOR THE
SCENARIO SIMULATOR**: **the owner calls pre-calculated scenarios NON-NEGOTIABLE on 2026-09-13**, and
**COMPASS fact 107 records the scenario precompute as DROPPED by owner decision on 2026-09-19.**
**Both dates recorded (rule 5); the later one governs, and the reversal is the owner's own.**

⚠ *He also states the data position that underwrites the demand:* *"we have two seasons of full back
data, and a third season with more data that can help… **it's unbelievable that we cannot get [it]
with the data we have**."*

### 🔴🔴 4 · THE LAYER SPLIT — **THREE processing times, stated twice** *(0 of twelve, 0 of thirty in this form)*

> ***"You have to remember that we have THREE PROCESSING TIMES. We have the HEAVY one that we're gonna
> run OVERNIGHT. We have the PRE-FINAL one that's gonna run somewhat in the morning. And then we have
> the FINAL one that's just gonna get the real outcome out of the simulations and do a board."***
>
> *and, restated with clocks:* ***"the ones that's gonna carry the strong processing that's gonna take
> a while, that's gonna work OVERNIGHT. Then the SECOND phase, which is gonna run AFTER 1 PM, and the
> LAST phase that's gonna run AFTER 2:30 PM. **The second and the third need to be as LIGHT as
> possible.**"***

⚠⚠ **SUPERSEDED, AND BOTH DATES ARE ON FILE (rule 5)**: **COMPASS fact 107 (owner decision
2026-09-19) — *"TWO pipelines, cutoff 1:15 PM PT, and the scenario simulator is DROPPED"*, which fact
107 itself says supersedes the three-phase design in facts 41 and 68.** 🔑 **What T16 adds is the
clearest statement of the three-phase version and its clocks — and the LINEAGE OF THE 2:30 WINDOW:
*2:30 PM PT was the THIRD phase's start, and the third phase is the one that was dropped.***

🔴🔴 **AND THAT LEAVES A MISMATCH NO DOCUMENT PUTS SIDE BY SIDE** *(0 of twelve, 0 of thirty)*:
**COMPASS fact 73 records N1's probabilities as measured *"at the 2:30 PM PT cutoff"*** — the
`0.552` / `0.312` / doubtful-means-out values the engine reads — **while fact 107 puts the pipeline's
cutoff at 1:15 PM PT.** ✅ **Both clocks are individually well documented** *(`2:30 PM PT`: 35 of the
thirty, 13 of the twelve · `1:15 PM PT`: 42 and 32)* — **they have simply never been compared.** ⚠
**NOT RECORDED: whether probabilities fitted on a 2:30 as-of transfer to a 1:15 one.** *The sweep
notes only that fact 68's amended text says the report rule is 11am–1pm LOCAL, so Pacific clubs file
last at 1:00 PM PT — which makes 1:15 a plausible post-filing cutoff and the gap plausibly small.
**Plausibly small is not measured.***

### 🔑🔑 5 · **"BASELINE AND ENRICHMENT CANNOT BE TWO DIFFERENT THINGS"** *(0 of twelve, 0 of thirty)*

> ***"The baseline and enrichment cannot be two different things. They need to AGREE, and they need to
> work together and COMPLEMENT each other. **ALL THE HEAVYWEIGHT NEEDS TO BE ON THE BASELINE**, but
> they need to TALK and have the proper final product."***

🔑 **This is the owner stating, on 2026-09-13, the architecture that the enrichment reality check
would confirm empirically the same day** — *"all the heavyweight on the baseline"* is exactly what
`anchor 0.7150` beating every factor measures. ⚠ **And it is the owner's answer to the
double-counting problem before the measurement existed**: *"be sure that those factors are not
already in the baseline. **And if it is — if it's being used properly.**"*

### 🔴 6 · THE ORDER THAT REOPENED THE REJECTED FACTORS — *the origin of COMPASS fact 85* *(0 of twelve, 0 of thirty)*

> 🔴 ***"So IMPROVE IT! Why do we have a CRUDE defender feature? MAKE A DECENT ONE! **I never asked for
> crude** — same for all other pieces of this system! I always asked for RICH, DEEP, COMPLETE,
> RELIABLE!"***
>
> *and, generalising it across every prior rejection:* ***"For the previous items that failed,
> shouldn't you have done the same? Something more complex, and that does the job? **Was it not the
> same issue? BE SURE BEFORE MOVING ON.**"***
>
> *and again:* ***"I still think those rejected factors you are not handling properly. You need more
> complex, more granular, more comprehensive application and use of it."***

✅ **COMPASS fact 85 — *"THE M1/B4 REJECTIONS WERE WRONG, corrected 2026-09-13"* — and COMPASS rule
90.1 — *"a null is only as strong as the feature that produced it"* — are the RESULT of these turns.**
🔑 **The corpus carries the conclusion and not the instruction that produced it**, which matters
because *the instruction is general*: **it applies to every rejection, not only M1's.**

### ⚠ 7 · TWO STANDING TEST DIRECTIVES, SIBLINGS OF T15'S SAMPLE-FIRST RULE *(both 0 of twelve, 0 of thirty)*

| | |
|---|---|
| **TEST ALL PROP LINES, EVERY TIME** | ***"You need to test ALL prop lines EVERY TIME. Every time that you do something that affects all of them, you need to test all of them."*** *(restated: "be sure you did all the prop lines, all the thirty-or-so prop lines")* |
| **PARTIAL CALIBRATION IS NOT ACCEPTABLE** | ***"I CAN'T HAVE SOME OF THEM CALIBRATED AND SOME NOT. So do your work and finish."*** |

⚠⚠ **THE SECOND SITS IN TENSION WITH T15'S CERTIFIED / PENALIZED / EXCLUDED POLICY**
*(`NBA_FINAL_SCORING_CALIBRATION.md` §0a-T15 §6, 2026-09-12/13)*, **which exists precisely to let a
prop be partly trusted.** 🔑 **The two are reconcilable — the policy's own premise is that penalties
are DERIVED from measurement, so every prop IS calibrated and some carry a measured discount — but
the corpus records neither turn, so nothing reconciles them.** **Recorded as a tension to resolve, not
as a contradiction: the owner's turn is about a prop having NO verdict, which is the state the
all-props audit closed** *(27 / 3 / **0 unverified**)*.

⚠ *Sampling discipline is re-stated here too, matching T15's SAMPLE-FIRST rule:* *"all samples,
different times of the season, different players, different prop lines **before running the whole
thing** … you need to do a large amount of samples before replicating it."*

### ⚠ 8 · THE RESEARCH STANDARD, RE-ISSUED *(recorded as a re-issue — the standard itself is on file, 9 of the thirty and 9 of the twelve; **kill logged**)*

*"Ground this decision in multiple sourcing research, **no guessing, no assumptions**."* · *"Don't take
Gemini as absolute truth. Be sure to research other independent sources, reliable, **multiple** of
them."* 🔑 **Dated instance recorded because T15's decisive oreb fix came FROM Gemini** *(the archetype
correction)* — **so the standard and the dependency are in the same week.**

### ⚠ 9 · THE REALIGNMENT ORDER, AND WHAT IT SAYS ABOUT THE COMPASS

> ***"First, what I need you to do is REALIGN YOURSELF. Read the WHOLE compass file and get everything
> back together, because you start to forgetting things and you cannot forget anything. So I need you
> to completely see — **no skipping, no summarizing, no compacting** — the whole compass file. … I
> think you're OVERCOMPLICATING things, or you're OVERSIMPLIFYING things."***

🔑 **The COMPASS is the owner's designated realignment instrument**, which is the standing reason this
sweep reads it and never writes to it — ⚠ **and it is the document from which fact 69 was silently
deleted the day before** *(`NBA_OPEN_ITEMS.md` §T15.3a)*. **A realignment instrument with a silent hole
in it is a sharper problem than a numbering gap.**

### ⚠ 10 · THE OPERATING RECORD — *recorded as fact, without interpretation*

*The transcript's last stretch is the owner polling a long-running job:* **five identical turns —
*"check status, progress and sample to see if job is being properly done"*** — around *"how long for
it to finish? … everything has to be IN QUEUE, so it runs automatically"*, *"you did not give me a
time estimate… assertive and short answer"*, *"why is it going so slow? you said 2 hours, it has been
the double of it already"*, and ***"your lazy work is pissing me off, you are on opus medium, I am
paying $250 a month; your behavior is unacceptable."*** ⚠ **Recorded because it is part of the record
and because it dates a cost and a service expectation** *(`opus`: **0 of the thirty**)*; **the sweep
draws no conclusion from it.**

---

## 0a. 🔑 THE OUTCOME GRADER — **the design, as the owner was given it, and what the code actually does**
*Recorded 2026-09-21 (T12 pass 4, §T12.5b). **Transcript `2026-09-11-21-01-23`, owner segment 29 and
its answer, segment 37.** The grader itself is well documented — `grade_board_outcomes.py` is in 4 of
the twelve and `nba_market.board_outcomes` in 9 — **so what follows is the DESIGN STATEMENT and the
three elements of it that were in 0 of thirty.***

**The owner, segment 29, whole**: *"that being said get all available books when the time comes. we
will also need a **outcome grader**, but that should be **board scoped** i guess, so we would need
the boards."*

**The answer, segment 37**: ***"the grader is board-scoped BY NATURE: it grades the line that was
actually offered (player, stat, line, side, book) against what happened, so it needs the boards
first."***

| | |
|---|---|
| **input** | the **CLOSE snapshot** of every board line + our player game logs *(points, rebounds, assists, threes, blocks, steals, turnovers, double-doubles, combos computed; period markets from the periods data)* |
| **join** | **normalised player name** *(jr./iii/accents/apostrophes stripped)* **+ game date + team** — 🔴 ***and unmatched names get LOGGED rather than silently dropped*** *(**0 of thirty**)* |
| **rules that mirror the apps** | ~~**DNP → void**~~ 🔴 **SEE THE CODE CORRECTION BELOW — the grader deliberately does NOT do this** · 🔴 ***exact hit on a whole-number line → PUSH*** *(the rule is on file in substance; **this exact statement is 0 of thirty**)* · **goblins/demons graded on their own lines** · **Underdog multipliers carried so the slip engine can simulate real payouts** |
| **output** | **one row per graded line** — the training target for the slip engine and the ROI simulation |
| 🔴 **and its second job** | ***the same grader runs LIVE every morning on the previous night's boards, "which is how the derived-Sleeper fallback gets its ROLLING CALIBRATION"*** *(**0 of thirty** — and it is the mechanism that keeps the one board with no history usable)* |

### 🔴 CODE CORRECTION, 2026-09-22 (§T12.6d) — **"DNP → void" is the ANSWER's rule and NOT the grader's**
*The design above is what the owner was told. **`grade_board_outcomes.py` implements something
different, and better**, and its own docstring says why — read 2026-09-22, lines 9–23.*

> *line 9* — **`leg_result` = what the number did → `over_win` / `under_win` / `push` / `dnp` /
> `no_stat` / `unmatched_player` / `game_not_found`** *(seven values)*
> *line 14* — **"Underdog: DNP voids the leg."**
> *line 15* — 🔑🔑 ***"Baking either rule into `leg_result` would make the data useless for the other
> operator, so we store [what happened and let each consumer apply its own rule]."***

🔑 ***The apps disagree about DNP, so the grader refuses to choose***: **it records `dnp` as an
outcome and leaves void-vs-loss to the consumer.** **Recording "DNP → void" as the grader's rule —
as this entry did from the answer — would have made the table look like it had already taken
PrizePicks' side.** ⚠ **Rule 29's discipline applied to a DESIGN claim: read the implementation, not
the description of it.**

✅ **And the other three design rules ARE implemented — two of them under different names, which a
word search alone would have called missing** *(rule 26 caught it)*:
| stated rule | in the code |
|---|---|
| **unmatched names LOGGED, never silently dropped** | ✅ **and sharper**: *"A player with no box-score row is only a DNP if we can confirm he exists… otherwise **`unmatched_player`**, counted separately. **Never silently treat a join failure as a scratch**"* — **two distinct values, `unmatched_player` and `unmatched_not_in_season`, plus `game_not_found`** |
| **exact whole-number hit → push** | ✅ *"Lines like 21 or 10 (not 21.5) CAN tie. **Push is a real outcome, not a rounding artifact**"* — and `res = "push"` at line 242 |
| **goblins/demons graded on their own lines** | ✅ **as `is_alternate boolean`**, and by construction: the key is `(player, market, line, side)`, so a goblin's different line grades separately. ⚠ *The words "goblin"/"demon" appear **zero** times in the file — **a word count would have reported this rule missing***. |
| **Underdog multipliers carried** | ✅ **as the `price numeric` column** — *same trap, same resolution*. |

## 0a.1 🔑🔑 **THE GRADER'S BUILD — what it caught, the storage decision, and a LIVE re-take of every figure**
*Recorded 2026-09-22 (T13 pass 2, §T13.3d). **Transcript `2026-09-13-01-03-48`, the prose stratum
past segment 1,040 — where the grader §0a describes was actually BUILT.** Every live figure pinned
**2026-09-22T08:06Z**. `SELECT` only.*

### 🔴🔴 THE CATCH THAT JUSTIFIES THE WHOLE `unmatched` CATEGORY
**The smoke test returned 1,404 unmatched legs from just THREE distinct players** — and they were not
a join failure, they were **nickname and spelling mismatches between the books' naming and the NBA's
official register**:

| board name | NBA official |
|---|---|
| **Herb Jones** | Herbert Jones |
| **Nicolas Claxton** | Nic Claxton |
| **Moe Wagner** | Moritz Wagner |

> *"**Had I let `unmatched` silently become `dnp`, those 1,404 legs would have been graded as
> scratches — and Herb Jones alone would have vanished from every slate he played.** That's precisely
> the quiet corruption you were pointing at."*

🔑 ***The category §0a records as a design rule earned its place on its first real run.*** ✅ **The
fix is deliberately NOT a hand-list**: *"it needs to be **data-driven** rather than a hand-list,
since this will recur across 500+ players and two seasons"* — **the rule is `last-name-suffix +
first initial`**, unambiguous, *"which will catch the same class automatically across both seasons."*
✅ **And it was extracted into a SHARED MODULE, `nba/nba_names.py`** — *exact → override →
unambiguous alias* — **because *"the engine and grader must import the same code, so the mapping
can't drift."*** ⚠⚠ **That is a stated failure mode, not a convenience**: *"if it drifts we get
**silent mismatches instead of errors**."*

### ✅ THE FULL CASE TABLE, as the builder stated it
| case | handling |
|---|---|
| no box-score row, **plays this season** | `dnp` |
| no row, **known league-wide but not this season** | `unmatched_not_in_season` — **flagged, never silently a scratch** |
| **name unresolvable** | `unmatched_player` — flagged |
| **listed with 0 minutes** | 🔑 **`dnp`, NOT a 0-point under** |
| **exact landing on a whole-number line** | **`push`** |
| **alternates** | graded **on their own line**, tagged `is_alternate` |
| **double-double** | **yes/no logic, not over/under** |
| **both snapshots** | **graded separately** |
| **operator settlement** | 🔑 **kept OUT of the leg result** — *PrizePicks reverts on DNP and tiers down on a tie, Underdog voids; the slip engine applies the operator rule on top* |

⚠ **A FIGURE THE PROSE GIVES TWO WAYS** *(rule 16)*: pushes on three dates are reported as
**`182 found`** in one segment and **`80 in three dates`** in another. **Neither is re-derivable from
the other; the live count settles the order of magnitude below.**

### 🔑🔑 THE STORAGE DECISION — **grade DISTINCT LEGS, not one row per bookmaker**
> *"The outcome of **'Jokić over 24.5 points'** is a property of the **player, stat, line and side**.
> **It doesn't depend on which book offered it**, so grading it separately for DraftKings, FanDuel,
> PrizePicks and seven others **stores the same truth TEN TIMES**."*

**Caught mid-run**: *"it's graded 1.07M legs in 17 dates, so **the full run lands around 22M rows —
and most of that is redundant**."* ✅ **Measured on the smoke test: 45,606 legs for three dates
instead of 152,000 — a 3.3× reduction**, *"and larger across the full run since more books overlap
mid-season."* ⚠ **This is the design note `grade_board_outcomes.py` line 160 states** — *"the outcome
does not depend on bookmaker/snapshot"* — **with the number behind it.** 📌 *"Caught before it filled
the disk rather than after"*, **on a database that had hit its storage cap earlier the same session.**

### ✅ THE FULL RUN, RE-TAKEN LIVE — **and the partition CLOSES**
| | transcript | **LIVE 2026-09-22T08:06Z** |
|---|---|---|
| graded legs | **6,905,452** | ✅ **6,905,452** |
| dates | **327** | ✅ **327** |

| `leg_result` | legs | share |
|---|---|---|
| **`under_win`** | **3,877,761** | **56.16%** |
| **`over_win`** | **2,780,348** | **40.26%** |
| `dnp` | 205,425 | 2.97% |
| 🔴 **`unmatched_player`** | **31,687** | **0.46%** |
| `push` | 10,231 | 0.15% |
| | **6,905,452** | **100%** ✅ |

### 🔑🔑 THE UNDER-SKEW WAS FLAGGED AS A RED FLAG AND LEFT UNCONFIRMED — **it is now confirmed at scale**
**The builder refused to call it**: *"**58% under / 40.5% over.** A properly graded board should sit
near 50/50 on the standard lines… **I need to confirm that's the cause rather than a systematic
grading error**"*, and, on standard lines alone *(56.4% under / 43.3% over, alternates 60.6%)*:
*"the standard-line skew is plausible — **NBA player props are documented to go under more often than
over, since books shade overs for public money and blowouts truncate minutes** — **but on a
three-date sample I won't call it confirmed either way. It's a number to re-check on the full run.**"*
⚠ **The full-run distribution was promised and the segments read do not report it.**

✅ ***It is re-checked here, on all 6,905,452 legs: 56.16% under / 40.26% over — and 58.24% under
among DECIDED legs.*** 🔑 ***The three-date sample was right, and the skew is a property of the
board, not a grading error.*** ⚠ **Stated at evidence strength: this confirms the RATIO the sample
showed. Whether the CAUSE is over-shading and blowout-truncated minutes is the builder's explanation
and remains NOT RECORDED as measured.**

### 🔴 TWO THINGS THE LIVE TABLE SHOWS THAT THE TRANSCRIPT DOES NOT
1. 🔴🔴 ***`unmatched_player` IS NOT ZERO AT SCALE — 31,687 legs, 0.46%.*** **The transcript
   declares *"unmatched is now zero, all 1,404 legs resolved"* and *"zero unmatched"* — both on the
   THREE-DATE smoke test.** ***The full two-season run carries a residue roughly 23× the size of the
   original catch, and it is nowhere recorded.*** ⚠ **Exactly rule 25's failure shape: a fix proven
   on a sample, reported without the sample, and never re-taken at scale.** **WHICH players are NOT
   RECORDED** — *one `GROUP BY` would name them, and it was not run here* **(rule 1: documented, not
   fixed).**
2. 📌 **The table holds FIVE distinct `leg_result` values.** **§T12.6d records the docstring
   declaring SEVEN** *(`over_win` / `under_win` / `push` / `dnp` / `no_stat` / `unmatched_player` /
   `game_not_found`)*, **and the design above names an eighth, `unmatched_not_in_season`.**
   🔴 ***So `no_stat`, `game_not_found` and the not-in-season category have ZERO rows across 6.9M
   legs*** — **including the one category built specifically to stop a matching bug masquerading as
   a scratch.** ⚠ **Whether those branches are unreachable or simply never triggered is NOT
   RECORDED**, and **a guard that has never fired is not a guard that is known to work.**

## 0a.5 🔑🔑🔑 **BASELINE AND ENRICHMENT ARE ONE SYSTEM — the measured result that invalidates a whole class of factor tests**
*Recorded 2026-09-22 (T14 pass 2, §T14.3). **Source: `NBA_DAILY_PARITY_AND_BACKFILL.md` §9, an owner
directive dated 2026-09-13 — one of the EIGHTEEN, read in full for the first time by this sweep.**
Probed against the twelve, pinned 2026-09-22T09:03:53Z; every hit opened.*

> **THE OWNER'S DIRECTIVE**: *"**The baseline and the enrichment cannot be two different things.**
> They must agree, complement each other, and produce one final product. ***All the heavy lifting
> belongs in the baseline; the enrichment layer exists ONLY to carry what the baseline could not have
> known.***"*

### 🔴🔴 THE MEASUREMENT THAT FORCED IT — **held out on 6,996 real PrizePicks legs** *(`0.7299` / `1.0123` / `0.2652`: **0 of the TWELVE**)*
| | log-loss | Brier |
|---|---|---|
| **certified baseline ALONE** | **0.7299** | **0.2652** |
| 🔴 **baseline × A2** *(absence redistribution)* | **1.0123** | **0.3317** |
| baseline × defender | 0.7309 | 0.2656 |

🔑🔑 ***A2 measured WELL IN ISOLATION*** *(minutes MAE **4.641** with outs vs **6.186** ignoring them)*
***and made the system DRAMATICALLY WORSE when applied on top.*** **The cause is exact**: ***"the
baseline's `proj_min` ALREADY APPLIES THE INJURY REPORT"*** — *the 2026-03-15 replay went from 173
roster players to 161 with `BT_INJURY` on — **"multiplying by A2's `min_mult` REAPPLIES the same
reallocation a second time."***

### 🔑🔑🔑 AND IT IS THE THIRD INSTANCE OF ONE ERROR — **a named class with three data points**
| # | the patch | what it duplicated | result |
|---|---|---|---|
| **1** | **A2 absence redistribution** applied over the certified mean | the baseline's `proj_min`, which already applies the report | **log-loss 0.7299 → 1.0123** |
| **2** | a **hand-built blowout shrink** | the recipe's **`P(blowout \| spread)` mixture** *(`P_BLOWOUT_BINS` at 0/2/4/6/8/10/12/15, `BLOWOUT_MARGIN = 20`, `COMPETITIVE_MARGIN = 15`)* | **worse** |
| **3** | a **funnel rebuilt from ROLLING MEANS**, bypassing the anchor | the recipe's `proj_min` | **0.7951 vs 0.7299** — *"beaten by the very anchor it bypassed"* |

⚠⚠ ***"USE THE SYSTEM'S BEST COMPONENT; DO NOT REBUILD A WORSE ONE BESIDE IT."*** 🔑 **The blowout
constants are already in six of the twelve — what was NOT on file is that a patch on top of them was
TESTED AND LOST.** *(`double count` is in nine of the twelve as a concept; **the three measured
instances are not**.)*

### 🔴🔴🔴 **WHY THE HISTORICAL TESTS MISLED — and this invalidates a whole class of factor test**
> ***"In a REPLAY both layers read the SAME DAY'S REPORT, so the delta is EMPTY and A2 is PURE
> DUPLICATION.*** To measure enrichment honestly, **the baseline must be rebuilt on the DAY-BEFORE
> report and the factor applied against the DAY-OF report** — the production configuration.
> ***Any factor test using ONE report for BOTH layers measures DOUBLE-COUNTING, not value.***"*

🔑🔑 ***This is a test-design defect, not a modelling one, and it is silent***: **the factor does not
error, it just scores badly — or, worse, scores well for the wrong reason.** ⚠⚠ **Every held-out
factor result in this corpus should state which report each layer read.** **NOT RECORDED for any of
them.**

### ✅ THE RULE, AS STATED
```
baseline   (phase 1, overnight, day-BEFORE report)  = everything knowable then, done properly
enrichment (phase 2/3, from the day-of report)      = ONLY THE DELTA vs what the baseline assumed
```
*"A star already ruled out overnight is **priced into `proj_min`**; a scratch appearing at the window
is not. Enrichment applies A2 **only to players whose availability CHANGED after the baseline's
cutoff**, and only to their team and opponent. **Everything else carries the baseline's value forward
untouched.**"* *(`only the delta`: **0 of the TWELVE**.)*

### 🔑 THREE CONSEQUENCES FOR FACTOR WORK — **the second is a schema requirement**
1. **A factor may only touch a component the baseline does NOT contain, or be expressed as a DELTA
   against what the baseline assumed.**
2. 🔑🔑 ***"`proj_min` and `rate36` must be EMITTED by the recipe so enrichment adjusts the right
   COMPONENT rather than multiplying the product"*** — ***"multiplying a mean by a minutes multiplier
   is NOT the same operation as adjusting minutes and re-deriving the mean."*** ⚠ **`proj_min` and
   `rate36` appear in ONE of the twelve, as column names; the EMISSION REQUIREMENT is absent.**
3. **The defender factor is the clean case**: *"the baseline carries **TEAM-level** opponent defence,
   not **the specific defender**, so a player-level term is genuinely additive."* ✅ **It measured
   NEUTRAL on the anchor (0.7309 vs 0.7299)** — 🔑 ***"which is what 'no double count, small effect'
   looks like."*** **A stated signature for distinguishing a real small factor from a duplicate.**

## 0a.6 🔑🔑 **THE THREE-STAGE FUNNEL — where each link sits, and why**
*Same source, §8, dated 2026-09-13.* ⚠ **The stage COUNT is superseded by COMPASS fact 107's two
pipelines** *(§0a.3's banner)*; ***the link-by-link placement and its reasoning are not.***

**The funnel**: `minutes → team possessions → usage share → attempts → shot mix → efficiency →
points → P(over line)`

| link | input it needs | knowable | **stage** |
|---|---|---|---|
| `proj_min` base *(role tiers, blowout mixture, coach gate)* | prior-night box scores + morning spread | overnight | **1 — heavy** |
| **defender ratings** *(two-way ridge, 5 channels, weekly refit)* | prior games | overnight | **1 — heavy** |
| rate cells / dispersion / Platt *(the certified recipe)* | history as-of | overnight | **1 — heavy** |
| factor coefficients *(B2/B3/BF, usage allocation, A2 weights)* | history as-of | overnight | **1 — heavy** |
| team possessions *(pace)* | morning market total | ~overnight | **1**, refreshed if the line moved |
| **availability scenarios (joint per game)** | **the 1 PM ET report (~10 AM PT)** | mid-morning | **2 — scenarios** |
| minutes + usage allocation PER SCENARIO | who is out in that branch | mid-morning | **2 — scenarios** |
| 🔑 **expected defender** *(exposure-weighted over AVAILABLE opponents)* | the branch's opponent roster | mid-morning | **2 — scenarios** |
| shot mix + efficiency adjustments | expected defender for that branch | mid-morning | **2 — scenarios** |
| full ladder `P(stat > line)` per scenario | all of the above | mid-morning | **2 — scenarios** |
| select the realised branch | the day-of report | window | **3 — final** |
| market adjuster + rank + slip build | the window board and lines | window | **3 — final** |

### 🔑🔑 WHY EXPECTED DEFENDER IS STAGE 2, NOT STAGE 1 — *and the distinction generalises*
> *"It is **NOT a property of the opponent TEAM**; it is **exposure-weighted over the opponent
> players who will ACTUALLY BE AVAILABLE**. A different absence branch changes which defenders a
> player is exposed to, so it has to be recomputed per scenario. ***The RATINGS are stage 1 (they
> only need prior games); the JOIN is stage 2.***"*

🔑 ***"The ratings are stage 1; the join is stage 2" is a general test for placing any factor***, and
`expected defender` / `exposure-weighted` are **0 of the TWELVE**.

### ⚠ WHAT STAGE 3 MUST NOT DO
> *"**No refitting, no re-deriving, no scanning history.** It **selects** the precomputed branch,
> applies the market adjuster, joins the board and ranks. **Minutes at most. Everything expensive has
> already happened.**"*

## 0a.4 🔑🔑 **THE LEAKAGE TEST, THE DEFECT RULE, AND THE SCENARIO SIZING — T14's answers to the questions §0a.3 left open**
*Recorded 2026-09-22 (T14 pass 1, §T14.2). **Transcript `2026-09-13-20-53-23`, the prose stratum.**
⚠ **Much of T14's substance was written by T14 itself into `NBA_COMPASS.md`,
`NBA_PROJECT_LOG.md` and the new `NBA_DAILY_PARITY_AND_BACKFILL.md` — the EIGHTEEN. What follows is
the part that belongs in the TWELVE and was not here.** Probes pinned 2026-09-22T08:53:42Z.*

### 🔑🔑 THE LEAKAGE TEST, STATED AS A RULE — **`knowable at the cutoff` is 0 of the TWELVE AND 0 of the THIRTY**
**The first framing was *"observed-and-archived versus live-only"* — and the owner's push produced a
correction that replaces it:**
> *"**On referees I was WRONG.** Assignments are **published the MORNING of the game**, so they are
> known at our window. The crew that worked a game is therefore **a FAITHFUL RECONSTRUCTION of what
> would have been known** — using it for a historical day is **SIMULATION, not leakage**.
> ***The test isn't "was it ARCHIVED" but "WAS IT KNOWABLE AT THE CUTOFF."*** **Referees pass that
> test. Starters don't**: confirmed lineups drop around **tip−30, AFTER our window**, so for A5 we
> must derive a projection rather than use who actually started."*

🔑 ***This is strictly better than §0a.3's version of the same trap***, **which reasoned from where
the data came from.** ⚠⚠ **The archived/live distinction gets the referee case WRONG in both
directions: officials are never archived and are perfectly admissible; starters are archived and are
not.**

### 🔑🔑 THE DEFECT RULE — **an audit standard, not a preference**
> ***"Any factor whose source PUBLISHES BEFORE the window but is still computed in phase 2 is A BUG,
> not a design choice. That's the audit standard for the enrichment build."***

🔑 **It makes the phase assignment CHECKABLE**: *every factor has a publish time, and a factor sitting
in the late phase with an early publish time is a defect by definition.*
📌 **And it forced a concrete re-tag**: *"the registry still tags **referees, rest, schedule, coach
and matchup** as ENRICHMENT — per the stage rule they compute in the BASELINE phase, so the registry
needs re-tagging"* — **done later in the same session.**

### ✅ THE PER-FACTOR TIMING TABLE — **phase 2 is reduced to exactly FOUR things**
| phase | what it holds |
|---|---|
| **PHASE 1** *(early, unbounded time)* | **referee crew** *(morning)* · rest / travel / schedule · standings · coach profile · defender quality · weekly tables · 🔑 **the ENTIRE day-before injury picture** — statuses, opponent availability, and **teammate redistribution from the PREVIOUS day's report** |
| **PHASE 2** *(window → first tip)* | **exactly four**: ① pull the board · ② apply the day-of report and projected-lineup delta · ③ read the market · ④ **rescore ONLY the legs those deltas touch** |

⚠ **The cutoff times here are T13's and are SUPERSEDED — see §0a.3's banner** *(COMPASS fact 107:
overnight + 1:15 PM PT, no third phase)*. ***The SHAPE transfers; the clock does not.***

### 🔑🔑 THE ARRIVAL-ORDER TABLE — **what actually gates the start time**, and it is in 0 of the twelve
*Latest first, Pacific:*
| input | latest arrival |
|---|---|
| 🔑 **the league's GAME-DAY 1 PM ET injury report** | **~10:00 AM PT** — ***"the last discrete input before the window"***, published before the 5:30 PM ET final |
| morning board *(PrizePicks / Underdog)* | ~8–10 AM, from the 2-hour cron |
| projected lineups | ~8–10 AM, updated through the day — *"a consequence of the injury picture, not independent"* |
| morning market lines | overnight, continuous |
| **referee assignments** | **~6–7 AM** *(9–10 AM ET)* — *"earlier than you might expect"* |
| standings / leverage | ~11 PM the previous night |
| prior-night box scores, matchups, game logs | **~1–2 AM** *(with occasional stat corrections later)* |
| day-before injury report | already in hand |

🔑 ***So the heavy compute can begin as early as ~3 AM PT, and the only thing that must wait is the
SCENARIO ENUMERATION, which is the light part.*** ⚠ **And the 10 AM report is what makes it cheap**:
*"many 'questionable' names resolve there, so the scenario count at 10:30 is SMALLER than it would be
at 3 AM."*

### 🔑🔑 THE SCENARIO PRECOMPUTE, SIZED FROM THE SYSTEM'S OWN DATA — **answering the owner's "is that feasible?"**
**The unit is THE GAME, not the player** — *"a scenario is the **joint availability set of BOTH
teams**, so when Wembanyama is out it recomputes **his whole roster** (minutes, roles, starters)
**and the opponent's** (blocks-against, defender quality, scheme)."* ✅ ***Which is exactly the
combinatorial objection §T14.1e records the owner raising, answered by choosing the right unit.***

| quantity | measured |
|---|---|
| uncertain players per team on the day-before report | **typically 0–3** |
| scenarios per team | **≤ 8** |
| **joint scenarios per GAME** | **≤ 64 worst case, usually 8–16** |
| board legs/day, PrizePicks with the ladder | **avg 4,503 · max 8,700 · 107 players** |
| board legs/day across five apps | **~10–15k normal, ~20k a big Saturday** — ⚠ **but only ~110–130 DISTINCT PLAYERS** |
| 🆕 **Underdog** *(`§F6.27`)* | **avg `1,276` → `~3,500` live · max `2,574` · `106` players** — *"archive = main lines only; live ladder `~2–3×`"* |
| 🆕 **Sleeper · Fliff · Betr** *(`§F6.27`)* | **`~1,000–2,500` legs/day each**, live only |
| **full matrix per day** | singles at ±10 **22,400 rows** · + combos and fantasy **~36,000** · **× both sides ≈ 72,000 leg-probabilities** |
| scenario rows | **~30–60k per game ≈ 0.5–1M per day ≈ 50–100 MB/day**, **kept only until selection, then all but the chosen one deleted → ~7 MB/day, ~1.2 GB/season** |

> ### 🔬 §F6.27 — **RE-AUDITING `§F2.7`'s DIRECTION-(a) PROBE UNDER `RULE 58`, AND WHY THE UNDERDOG ROW WAS MISSING**
>
> *Added `2026-09-23`. **`§F2.7` scanned every HIGH-BAND segment — the band the judge calls COVERED —
> for numeric tokens absent from the twelve, and reported `309` missing tokens across `122` candidate
> segments from `3,331` high-band segments and `8,708` numeric tokens.** `RULE 58` says that result
> has to be re-checked, because `highband.py`'s `variants()` does comma-grouping **and nothing
> else** — the exact narrow set `§F6.23` had just shown to over-report absences by `72%`.*
>
> | on the `202` missing tokens the instrument stored | count |
> |---|---|
> | still absent, **narrow** variants *(as `§F2.7` computed)* | **`173`** |
> | still absent, **wide** variants *(percent forms, roundings)* | ✅ **`111`** |
> | ⇒ **demoted by `RULE 58`** | **`62` — `36%`** |
>
> ✅✅ **AND THE `111` SURVIVORS ARE OVERWHELMINGLY NOT FIGURES**, classified:
>
> | class | n | share |
> |---|---|---|
> | plain integers ≥`4` digits — *line numbers, file sizes, chunk offsets, process ids* | `59` | **`53.2%`** |
> | epoch-ms / run ids | `20` | `18.0%` |
> | NBA **team** ids *(`1610612739`…)* | `11` | `9.9%` |
> | NBA **player** ids | `7` | `6.3%` |
> | elapsed / high-precision timings | `3` | `2.7%` |
> | other | `11` | `9.9%` |
>
> ⇒ ***`§F2.7`'s CONCLUSION survives its arithmetic being wrong: the high band really does hold very
> few genuine missing figures.*** 🔑 **But the reason is not the one `§F2.7` gave.** *Its `TRANSIENT`
> filter checks a `±40`-character window for words like `run_id`, `bytes` or `.py`; **a bare
> `process 907042 waits for RowExclusiveLock` or a `total lines: 8146` in a tool result carries none
> of those words nearby and passes straight through.*** **The filter's design assumes the noise
> announces itself. It mostly does not.**
>
> ### ✅ The residue, read by hand — and it yielded exactly one table
>
> *Every non-identifier survivor was traced back to its segment. **Almost all are tool-output noise**
> — `{"returncode":0,"stdout":"num chunks: 5\n0 702831 …"}`, `"total_lines": 5075`, PostgreSQL
> ### 🔴🔴 **§T23.5 — A SECOND, STRUCTURALLY DIFFERENT DEADLOCK: `CREATE UNIQUE INDEX` INSIDE THE WRITE TRANSACTION**
> *(`T23` pass `5`, `2026-09-21`, recorded `2026-09-23`. **Distinct from the `psycopg.errors.DeadlockDetected ×2` already catalogued in `NBA_OPEN_ITEMS.md` — different mechanism, different trigger, different blast radius.**)*
>
> 🔴 **What happened**: *a historical scoring run over all `325` dates, fanned out across **`8`
> parallel jobs**, **scored `144` and failed `181` on Postgres deadlocks.***
>
> **The mechanism, and it is a reusable Postgres trap:**
> > *The scorer executes **`CREATE UNIQUE INDEX IF NOT EXISTS` inside its write transaction.
> > Postgres LOCKS THE TABLE BEFORE it discovers the index already exists, and holds that lock until
> > commit.** Two scorers running at once each held the lock, then each waited on the other to delete
> > its date.*
>
> 🔑🔑 ***`IF NOT EXISTS` is not a cheap no-op under concurrency. It is a full table lock that
> happens to do nothing.***
>
> ⚠⚠ **AND THE REASON IT WAS INVISIBLE FOR THE WHOLE LIFE OF THE SYSTEM IS THE IMPORTANT PART**:
> ***"`P3` scores ONE DATE ALONE, so this never showed until my `8` parallel jobs."***
> ⇒ 🔑 ***A defect that only exists under parallelism cannot be found by a pipeline that is never
> parallel.*** **`P3` will never surface it; any backfill, replay or catch-up run will surface it
> immediately.** *That is a class of bug this corpus has no other instance of, and it is worth
> stating as a class: **the production schedule is a narrower test than the recovery path it depends
> on.***
>
> ✅ **Fix recorded** *(applied by the concurrent session — the work is out of scope, the mechanism is
> not)*: **the index is created only when it is actually missing.** *Behaviour identical for a single
> run; the failed dates **rolled back cleanly**, so nothing was half-written, and the runner now
> resumes without redoing good dates and retries failures once.*
>
> ⚠ **`RULE 54`.** *`WINDOW`: one historical run, `2026-09-21`, `8` parallel jobs, `325` dates.
> **`144`/`181` is one observation, not a rate** — the split depends on job count and scheduling.
> **`NOT DONE` → ✅ DONE, same pass**: the audit below.*
>
> ### 📋 **THE AUDIT THIS FINDING PRESCRIBED, RUN `2026-09-23` RATHER THAN LEFT AS A SUGGESTION**
> *`grep -rl "CREATE UNIQUE INDEX IF NOT EXISTS\|CREATE INDEX IF NOT EXISTS" nba/*.py nba/*.js`*
>
> 🔴 **`17` FILES CARRY THE SAME PATTERN.** *Not one — seventeen.*
>
> | | files |
> |---|---|
> | 🔴🔴 **run by `P2`** | **`build_asof_calibration.py`** · **`build_confidence_v3.py`** · **`grade_board_outcomes.py`** · **`scrape_referee_assignments.py`** |
> | 🔴🔴 **run by `P3`** | **`build_availability_delta.py`** · **`build_rung_market.py`** · **`score_board_legs.py`** *(the file the incident happened in)* |
> | run by neither *(backfills, panels, one-offs)* | `backfill_game_line_snapshots` · `build_absence_panel` `_v2` `_v3` · `build_defender_ratings` · `build_final_hp` · `build_redistribution_factors` · `build_redistribution_panel` · `build_scenario_calibration` · `load_baseline_history` |
>
> 🔑🔑🔑 ***SEVEN OF THE SEVENTEEN ARE IN THE NIGHTLY PIPELINES, AND THE ONLY REASON NONE OF THEM HAS
> DEADLOCKED IS THAT `P2` AND `P3` RUN THEIR STEPS ONE AT A TIME.***
> ⚠ **The exposure is not theoretical and it has a date**: *the regular season opens `2026-10-20`.
> **Any catch-up, replay or backfill run — exactly what a missed night requires — is a parallel run
> over the same tables**, and `§T23.5` is the measured outcome of one: `181` of `325` dates failed.*
>
> ⚠ **STATED AT EVIDENCE STRENGTH** *(`RULE 1.6`)*: **the grep is a file-level match, verified.**
> *Whether each occurrence sits INSIDE a write transaction — which is what makes it a deadlock rather
> than a harmless startup statement — **was checked in `score_board_legs.py` only**, by `T23`, and is
> **NOT** verified for the other sixteen. **`17` is the population to audit, not the count of
> defects.*** 📌 *Recorded this way because the useful artefact is the LIST — a later reader can check
> sixteen files without re-deriving which sixteen.*

> process ids from the deadlock incident. **Several apparent gaps were demoted on inspection**: `65.8`
> is the fringe-accuracy `0.658` already in `2` documents; the whole `N1` role table (`254`/`429`/`639`,
> `0.343`, `86.7%`, `11.8%`) is already carried.*
>
> 🔑 **What survived is the board-size table's per-app rows — added above.** *The twelve carry the
> PrizePicks row and both aggregates; **`2,574`, `~3,500` and `~1,000–2,500 each` were in `0` of the
> twelve.*** ⇒ **It matters because these are the sizing inputs for `§F6.22`'s `10-15 min`
> end-to-end target: the aggregate says how much work a night is, the per-app rows say where it
> comes from and which scraper dominates.**
>
> ⚠ **`RULE 54` — and one deliberate omission.** *`T22`'s `anchor_type × pct_priced` table
> (`switch_point` `375,835` legs, `355,324` priced, `94.5%`) came up in the residue and **is NOT
> written up**: it is PrizePicks payout-mapping work, which belongs to the concurrent session and is
> out of this sweep's scope. **Recorded as a scope decision, not as an oversight.*** *`WINDOW`: the
> `202` tokens `highband.py` stored, which is its `top`-`25`-per-transcript cap, **not all `309`** —
> the demotion rate is measured on a sample, and the full re-run was not performed.*

🔑🔑 **AND WHY IT IS CHEAP, which is the load-bearing argument**: ***"the expensive part of the
baseline is FITTING — tier cutpoints, empirical cells, Platt — from three seasons of history. That
happens ONCE, overnight. SCORING a scenario is rescaling minutes × rate through cells that already
exist, then a CDF per rung: vectorized, and linear in rows. A million rows is seconds to a minute of
pandas, not hours."*** ⚠ **So the 3-hour baseline run is almost entirely the fit, and the per-day
work is not.**
📌 **Timing as estimated**: **overnight fit 3–4 h sequential, ~1–1.5 h on six parallel runners ·
scenario precompute 10–30 min at ~1M rows · selection 1–3 min.** ⚠ **Stated as an estimate with its
own caveat**: *"the honest range is wider than 15–30 minutes **until we measure it**, because the
scenario count per game is the unknown."*
✅ **And the goblin/demon LESS expansion does not threaten it**: *"it doesn't touch stages 1–2 at all,
because **the matrix already holds BOTH SIDES of every rung** — it only grows the board join, and
that's a lookup. Even a 40k-leg board is seconds."*

### 🔑 THE ONE CASE THE SCENARIOS DO NOT COVER
> *"**a SURPRISE** — a player ruled out at the window **who wasn't on the day-before report at all**,
> a true late scratch. That's the **delta-rule fallback**: recompute only the affected team… From
> our absence data those are **a small minority of days**."*
⚠ **The measurement that would pin both numbers — *"how many uncertain players per team on a typical
report, and how often the late report introduces a name that wasn't there"* — was proposed and is
NOT RECORDED as run.** → 🆕 *what each phase-2 input moves, as the build chat sized it (`2026-10-14`, additional sweep `2`): `NBA_MASTER_SUMMARY.md` `§T14.5`.*

## 0a.3 🔑🔑 **THE TWO-PHASE CLOCK — where it was designed, the TWO LEAKAGE TRAPS, and the PREMISE UNDER IT THAT WAS LATER FOUND WRONG**

> 🔴🔴🔴 **AND THE CLOCK IS IMPLEMENTED AN HOUR LATE FOR EVERY DAY OF DAYLIGHT SAVING TIME — `T20-12`, severity 6 of 7.** *Added here T20 pass 78 (§T20.83), 2026-09-22: **this document discusses the clock in ten places and never mentioned the defect**, and a person working on P2/P3 timing reads this page.* ▶ **`nba/build_availability_delta.py:39`** — `PT = timezone(timedelta(hours=-8))`, so `p3_cut` computes `13:15 −08:00` = **`21:15 UTC` year-round**, while **the real 1:15 PM PT during PDT is `20:15 UTC`**. *`p2_build` is shifted identically, and **there is no env override** — `DELTA_ASOF` supplies the date; the hours are computed inside the script.* ⚠ **THE BIGGER HALF IS GOOD NEWS AND IS WHY THIS IS SEVERITY 6, NOT 7: the SLATE DATE and the RUN GUARD are DST-CORRECT** — P2 `:60` / P3 `:67` use `TZ=America/Los_Angeles date +%F`, and P3's guard uses `TZ=America/Los_Angeles date +%H%M`. ***The problem is one constant in one Python file.*** 🔴 **LIVE FROM PRESEASON `2026-10-03` THROUGH `2026-10-31`** *(DST ends `2026-11-01`)* — **twelve of those nights are also T20-13's red-certifier window.** ▶ **Full item: `T20-12` in `NBA_OPEN_ITEMS.md` (§T20.50); re-derived and HELD at §T20.74 — zero DST-aware Python in the NBA scripts.** ⚠ *Documented, not fixed (rule 1).*
*Recorded 2026-09-22 (T13 pass 3, §T13.4c). **Transcript `2026-09-13-01-03-48`, the opening prose
stratum — where the architecture decision was taken.** ⚠ **The phase cutoffs and the freshness gates
are already on file** *(`phase1_cutoff` in 5 of the twelve, `freshness gate` in 6, pinned
2026-09-22T08:20:06Z)*; **what follows is what those entries do not carry.***

> ## ⚠⚠ **SUPERSEDED IN PART — 2026-09-22 (T13 pass 4, §T13.5b). THE ARCHITECTURE BELOW IS T13's (2026-09-10) AND IT WAS REPLACED ON 2026-09-19.**
> *Both dates kept (rule 5). **Source: `NBA_COMPASS.md` fact 107, an owner decision** — one of the
> EIGHTEEN, carrying a conclusion from a transcript this sweep has not read.*
> > **107. TWO PIPELINES, CUTOFF 1:15 PM PT — AND THE SCENARIO SIMULATOR IS DROPPED** *(owner
> > decision 2026-09-19; **supersedes the three-phase design in facts 41 and 68**)*.
> > **ARCHITECTURE: (1) a heavy OVERNIGHT pipeline** *(baseline/delta, can start ~3 AM PT)* **and
> > (2) a light 1:15 PM PT pipeline** for the day-of factors, board snapshot and rescore.
> > ***No third phase.***
> > **THE REAL TIMETABLE (Pacific), every daily factor**: prior-night box scores **~3 AM** ·
> > **referee assignments ~6–7 AM** · market spread/total from the **08:00** snapshot · projected
> > lineups through the morning · **boards on demand** · **game-day injury report 11am–1pm LOCAL TO
> > EACH GAME'S MARKET, so Eastern clubs file by 10 AM PT and PACIFIC clubs are last at 1:00 PM
> > PT.** ***The injury report is the binding constraint.***
>
> 🔑🔑 **So the live shape is OVERNIGHT + 1:15 PM PT, not 1 PM + 2:45 PM**, and **the scenario
> simulator is dropped.** ⚠ **What follows is still worth reading and is not obsolete**: ***the
> DELTA argument, the shapes-vs-minutes split, the freshness-gate failure mode and both LEAKAGE
> TRAPS are properties of ANY two-stage clock*** — **they transfer to the 1:15 PM pipeline
> unchanged.** **What does NOT transfer is the 2:45 PM PT cutoff and the three-phase framing.**
> 📌 **And the timetable above is the part the twelve did not carry at all**: ***referee assignments
> land ~6–7 AM PT and the market snapshot at 08:00*** — **both comfortably inside the overnight
> phase, which is why the day-of pipeline can be light.**

### 🔑🔑 THE BIGGEST SPEED WIN IS A **DELTA**, NOT A FASTER ENGINE — *and this is in 0 of the twelve*
> *"At 2:45, **most legs are unchanged** — same line, same player status. If the window run
> recomputes only **(a) legs whose line / side / multiplier moved since the morning board**, and
> **(b) every leg for players on teams touched by the final injury report or a lineup change**,
> you're typically **rescoring a few HUNDRED legs instead of a few THOUSAND**. ***Everything else
> carries its 1 pm score forward.***"*

🔑 **That is the answer to the owner's latency requirement** *(§T13.1d: "MLB runs ~30 min, leaving me
only 15 minutes")* — **and it is an architectural answer, not an optimisation one.**

> ### 📐 §F6.22 — **THE NUMERIC TARGET THAT REQUIREMENT WAS TURNED INTO, AND THE MEASUREMENT NOBODY RAN**
>
> *Added `2026-09-23`. Source: **LIVE** `nba_config.classification_config.pipeline_architecture_decision`.
> **The requirement, the complaint behind it and the delta answer are all above and in two other
> documents. The TARGET is in `0` of the twelve, and so is the step that was supposed to precede the
> build.***
>
> | | `VERBATIM` |
> |---|---|
> | 🎯 **the target** | *"full `2:45 PM` window pipeline **under `10-15 min` end to end** (owner needs time to place slips)"* |
> | 🔴 **the step before building** | *"**Before building the NBA engine, PROFILE the MLB pipeline stage by stage to find where its `~30 min` goes**; the same bottleneck will likely dominate NBA."* |
> | ⚠ **and a retracted rationale, recorded by its author** | *"MLB also runs on Postgres (not D1) — **my earlier speed rationale was wrong**."* |
>
> 🔑 ***The complaint is documented, the architectural answer is documented, the number the answer
> has to hit is not.*** **`10-15 min` is a testable acceptance criterion; "faster than MLB" is not.**
> 📌 *`RULE 55`'s shape once more — the conclusion without the figure under it.*
>
> 🔴 **AND THE PROFILING WAS A PREREQUISITE, NOT A SUGGESTION.** *"Before building the NBA engine" —
> the reasoning is that MLB and NBA run the same stack on the same Postgres, so **whatever consumes
> MLB's `~30` minutes is likely to consume NBA's too, and it has never been located.*** ⚠
> **`NOT RECORDED` anywhere reachable from this session: whether that profiling was ever run.**
> ✅ *Checked, and the check needs stating precisely because a naive grep is misleading:
> **`ALPHADOG_SYSTEM_MAP.md:487` does claim "all `9` full-run orchestration chains, stage-by-stage"**
> — **but that is a STRUCTURAL chain mapping, not a timing one.** A scan of that document for
> durations, elapsed times or per-stage figures returns **none**. ⇒ ***MLB's chains are mapped; MLB's
> `~30` minutes are not attributed to any stage in any document, config row or transcript this
> session can reach.****
> ⇒ **The `10-15 min` target is therefore held against an engine whose dominant cost is unmeasured,
> and the retracted "D1 is faster" line is the record of one wrong guess about it already.**
>
> ⚠ **`RULE 54`.** *`WINDOW`: the twelve, plus a repo search for an MLB timing report. **This pass
> did not run the profiling and does not propose it** — MLB is out of scope for this sweep, and the
> point recorded here is that the NBA target depends on a number from a system this sweep does not
> document.*
>
> ✅ **`RULE 58` RE-VERIFICATION — and it found a near-collision worth naming.** *The absence claim
> was re-probed case-insensitively and in variant spellings. **`10-15` (hyphen) returns `0`;
> `10–15` (EN DASH) returns `3` documents** — but none is this target: they are stats.nba.com's
> `10–15 min` finalisation lag, a `10–15 game` rolling window, `~10–15k` board legs/day, and, closest
> of all, **`NBA_OPEN_ITEMS.md`'s *"whether any run exceeds its `10–15 minute` gap"* — which is the
> spacing between the four `*/2` commit-back scrapers, a different quantity entirely.*** ⇒
> ***The pipeline's end-to-end target is absent; a reader who greps `10–15` will land on four things
> that are not it.*** 📌 *`RULE 58` cost `§F6.13` an entire retracted section an hour earlier; here
> it confirmed a claim instead of overturning one, which is the outcome the rule is for.*

### ✅ WHAT CAN MOVE TO THE EARLY PHASE, AND THE ONE THING THAT CANNOT
| moves early | why |
|---|---|
| **per-player distribution SHAPES** — *"the per-minute or per-possession rate distribution for each stat, fitted from the ladder"* | ***"these don't depend on who's out"*** |
| **conditional multipliers as TABLES, not applied values** — with/without-teammate, return-ramp curves, defender-quality by quintile, opponent scheme, pace, rest/travel, coach rotation profile, referee crew | precomputable off the clock |
| **board-shaped pre-scoring** off the morning board *(the 2-hour cron already has it)* | full scores for every leg as of the early cutoff |
| 🔴 **MINUTES — CANNOT MOVE** | ***"projected minutes depend on the final out list, so anything computed THROUGH minutes — the actual projection, and therefore `p_over` — has to wait"*** |

🔑 ***With the shapes precomputed, the window work is "a RESCALE plus a CDF EVALUATION per leg —
milliseconds each, thousands of legs."*** **The expensive part is not the maths; it is the
dependency on the out list.**

### ✅ THE FRESHNESS GATE'S FAILURE MODE, STATED — *and it is why the gate exists*
> *"each task writes a checkpoint row *(what it produced, at what timestamp)*. **The scoring step
> REFUSES to run on a board older than X minutes or without the day-of report, and SAYS SO LOUDLY
> instead of silently scoring stale data.** ***That's the failure mode that quietly costs money.***"*
> *"**idempotent + resumable tasks** returning a compact status line… **same pattern as the backfill
> log that just let us pause and resume mid-run.**"*
⚠ **The second sentence is the evidence for the first**: the design was argued from an incident in
the same session *(`NBA_DATABASE.md` §0v)*, **not from principle.**

### 🔴🔴 TWO LEAKAGE TRAPS, FLAGGED BEFORE BUILDING RATHER THAN AFTER
> **1. STARTERS.** *"Our starter status comes from **box scores** — that's **who ACTUALLY started,
> known only after tip**. At 2:45 you'd have reported/projected lineups, not that. ***If the
> historical run uses it, backtests will look great and live will underperform.*** Fix: **exclude
> actual starters from phase 2** and derive a projected starter/rotation proxy… **then validate that
> proxy against the actual data — which is fine to use as the EVALUATION TARGET, never as an
> INPUT.**"*
> **2. GAME LINES.** *"**`game_lines_closing` is CLOSING odds — also post-window.** For as-of market
> context we need **spread / total / moneyline AT THE WINDOW TIMESTAMP**. Cheap to add: the
> historical odds endpoint covers all games on a date in one request — ~30 credits per date, **about
> 10k credits for both seasons**."*

🔑🔑 **Trap 1 bears directly on this corpus's standing headline that two seasons of starter status
were scraped and never loaded** *(T11)*. ***For phase 2, loading it would be the leak.*** **The gap
remains real for the evaluation target and for phase-1 use — but its significance is narrower than
"missing data," and the entry that records it should say so.**

### ✅ AND BOTH OF T13's OPEN QUESTIONS ARE ANSWERED BY THE CORPUS — **RULE 33's FOURTH AND FIFTH INSTANCES**
**T13 left both traps open and asked the owner to choose.** ***Both were settled in the days after,
and the answers are in `NBA_COMPASS.md` — one of the EIGHTEEN, carrying conclusions from transcripts
this sweep has NOT YET READ.*** *(Read 2026-09-22T08:24Z.)*

**1. The projected-lineup proxy → REJECTED, and the trap DISSOLVED** *(COMPASS fact 82, dated
**2026-09-13** — three days after T13)*:
> *"**A5 PROJECTED LINEUPS — REJECTED AS REDUNDANT.** The parity doc flagged A5 as **leak risk #1**
> *(box-score `starter_status` is post-tip truth)*… ***The leak risk DISSOLVES rather than needing
> mitigation — we do not need projected lineups, so there is nothing to leak.***"*
🔑 ***T13 asked "proxy from the injury report alone, or mine a public source?" — the answer was
NEITHER***, reached by a held-out test rather than by choosing between the two options offered.

**2. 🔴🔴 THE `2:30 PM PT` INJURY REPORT — THE PREMISE UNDER T13's WHOLE WINDOW TRADE-OFF — IS A
TIMEZONE ERROR** *(COMPASS facts 104 and 107, owner decision dated **2026-09-19**)*:
> *"**THE 2:30 PM PT ANCHOR WAS MY DRIFT, traced to its origin**: the 2026-09-09 session recorded a
> list of **OBSERVED injury-PDF snapshot timestamps (12:30 / 1:00 / 2:30 / 3:30 / 4:00 / 6:45 / 7:45
> PM) — *EASTERN*, from the PDF filenames** — alongside the correct policy on the same line
> *("game-day 11am–1pm local")*. ***2:30 PM ET is 11:30 AM PT.*** It was then promoted to 'the 2:30
> PM PT day-of report' and **repeated as established in facts 68, 73, 74 and 96**."*
> *"The real binding constraint is **1:00 PM PT**, and the pipeline runs at **1:15–1:30 PM PT**."*
> *"the rule is **11am–1pm LOCAL to each game's market**, so **Pacific clubs file last at 1:00 PM
> PT**."*

⚠⚠ **T13's entire window argument is built on the drifted figure.** It offers the owner three
options framed as a *"genuine conflict with your own earlier rule"* — **strict `tip−2h` (2:00 pm PT
on a 4 pm slate) · `tip−2h` but never earlier than 2:45 · `tip−90min` "right at the report"** —
where **the conflict is entirely that a strict `tip−2h` would sit *"30 minutes BEFORE the final
injury report."*** ***There is no 2:30 PM PT report. The conflict did not exist.*** **The owner
answered *"resuming exactly as it was — 2:45 pm PT window + tip−30 close."***

✅ **THE DECISION SURVIVES ITS BROKEN REASON, and this is the point of recording it**: **the real
deadline is 1:00 PM PT, which is EARLIER than 2:45 PM PT**, ***so a 2:45 window still sits safely
after every club has filed*** — **and the 25.7M-row historical backfill taken at that timestamp is
NOT compromised.** 🔑 **A correct decision reached through a wrong premise is still worth correcting,
because the premise is what the next decision will be made from.**
🔴 **AND ONE CONSEQUENCE THAT IS NOT RESOLVED**: **the early-slate rule sets the window to `first tip
− 2 hours`**, which on the measured early slates *(tips 12:10–14:40 PT)* **puts it as early as ~10:40
AM PT** — ***before the 11am–1pm local filing window closes.*** ⚠ **Whether those early-slate window
snapshots precede their own games' injury filings is NOT RECORDED anywhere in this corpus**, **and
it is a different question from the post-tip problem the rule was built to fix.** **Documented, not
acted on** *(rule 1)*.

## 0a.2 🔑🔑 **MARKET CONSENSUS — the owner's WEIGHTING directive, the build that FAILED, and the design that replaced it**
*Recorded 2026-09-22 (T13 pass 2, §T13.3g). **§T13.1d flagged this owner directive as 0 of THIRTY and
deferred its substance. This is the substance.** All figures are the transcript's own measurements
unless marked live.*

**THE DIRECTIVE**: *"be sure that you **WEIGHT properly** — **there are markets that are MORE
RELIABLE than others**."*

### 🔴 THE NAIVE BUILD RAN, AND IT FAILED ON ITS OWN NUMBERS
> *"Consensus built — **3.69M rows** — but **average books per line is only 1.48**, which exposes a
> real limitation: **books post DIFFERENT LINES** (DraftKings at 24.5, FanDuel at 25.5), so
> **requiring both sides at the same line rarely finds agreement across books**. ***That's the wrong
> way to build it.***"*

🔑 ***A same-line join across books is structurally near-empty, and `1.48` is the number that proves
it.*** ⚠ **A "consensus" averaging 1.48 books is not a consensus** — **it is one book most of the
time**, and it would have entered the engine as the market's opinion.

### 🔴 WHAT THE RESEARCH CHANGED — three findings, and two of them overturn a default assumption
1. 🔑🔑 ***SHARPNESS IS MARKET-SPECIFIC, NOT BOOK-SPECIFIC.*** *"FanDuel ranks among the **sharpest
   for player props** while **not cracking the top five on moneylines**."* ⚠ ***"So a single global
   weight per book is WRONG"*** — **which is precisely the shape a naive implementation takes.**
2. 🔴🔴 ***PINNACLE IS NOT SHARP ON PLAYER PROPS.*** *"a 2026 study of **600M line movements** found
   its prop side **consistently gives away value**, despite its reputation on sides/totals."*
   ⚠ *"Good thing we don't have it; **bad assumption to have carried in**."* **Recorded because
   Pinnacle-as-the-sharp-reference is the default prior in this field and it is wrong for this
   market.**
3. 📌 **For NBA props specifically, books are *"more uniform"* than MLB** — ***so weights should be
   MODEST, not extreme.***

### 🔑🔑 AND THE METHOD IMPROVEMENT, which is the strongest claim in this block
> *"Those studies **infer sharpness from CLOSING LINE VALUE**. ***We have something stronger — 6.9M
> graded outcomes.*** We can measure **each book's calibration DIRECTLY against what actually
> happened, per market**, and **derive weights EMPIRICALLY instead of importing someone's table**."*

✅ ***The grader is what makes this possible*** — **`nba_market.board_outcomes`, 6,905,452 legs
verified live** *(§0a.1)* — **and it is the concrete payoff of building the grader first** *(the
ordering argument: "the grader is the TRAINING TARGET")*.

### ✅ THE REPLACEMENT DESIGN — four steps, in 0 of the twelve
| # | step |
|---|---|
| **1** | **Per book, build the implied CDF across ITS OWN ladder** — each rung's de-vigged probability, **MONOTONIZED**: *"probabilities must decrease as the line rises; 🔑 **crossing means STALE PRICES, which is itself a signal**"* |
| **2** | **Evaluate every book at the TARGET line** *(the PrizePicks or Underdog rung actually being considered)* **by interpolating its own curve** — *"now all books are comparable at the same point, which the naive join could only do **1.48 books at a time**"* |
| **3** | **Weight the books EMPIRICALLY**, per market, against the 6.9M graded outcomes — *"since sharpness is market-specific and NBA props are fairly uniform, **I expect modest weights, and we'll KNOW rather than assume**"* |
| **4** | 🔑 **Two snapshots give a MOVEMENT signal** — *"how a book's curve shifts from window to close **is the C3 factor**, and now **measurable at a FIXED line rather than a moving one**"* |

🔑🔑 **Step 1's monotonicity check is a free data-quality instrument**: *a crossing is not noise to
smooth, it is a stale price to flag.* 🔑 **And step 4 re-grounds an existing factor**: **C3 was a
line-movement factor measured against a line that itself moves; the CDF makes it measurable at a
fixed point.** ⚠ **Whether the C3 definition in this corpus was updated to match is NOT RECORDED.**

### ⚠ THE LADDER DEPTH THAT MAKES IT POSSIBLE — *the transcript's measurement, NOT re-taken*
**FanDuel averages 8.2 lines per player-market (up to 27) · DraftKings 5.3 · Caesars 3.8** —
*"a full implied distribution per player per market, not a single point."*
⚠⚠ **A live re-take was attempted and is UNANSWERED, not zero** *(rule 22)*: the per-book
distinct-line census over `board_snapshots` **exceeded the 180-second query limit at
2026-09-22T08:08Z**. ***These three figures therefore stand as the transcript's, dated 2026-09-10,
and are the only ones in this section not independently confirmed.***

### ✅✅ THE OPEN LOOP IS CLOSED — **2026-09-22 (T13 pass 4, §T13.5c): the CDF design WAS BUILT, IT BROKE THE DISK, AND IT WAS REPLACED BY A SCOPED VERSION**
*This entry, written one pass earlier, left *"whether the CDF design was ever built"* as a NAMED
DATED open loop. **The repository and the live schema answer it together, pinned
2026-09-22T08:35:32Z.** `SELECT` only.*

**`nba/build_book_curves.py` EXISTS, and its docstring is the design almost verbatim** — including
the two arguments this section records *(*"books post different lines (DK 24.5, FD 25.5), so
requiring both sides at the SAME line finds only ~1.5 books per line"* and *"published rankings
weight books by closing-line value… **Pinnacle is NOT sharp on props despite reputation**. We have
**6.9M graded outcomes**, so we measure each book's calibration against what actually happened")*.
✅ **It also carries the ladder-depth figures a live re-take could not produce** *(§0a.2's UNANSWERED,
rule 22)* — ***FanDuel averages 8.2 lines per player-market, DraftKings 5.3*** — **so the figures are
now confirmed from the code rather than from a timed-out query.**

**Its three declared outputs**: **`nba_market.book_curves`** *(per book·snapshot·date·player·market·line,
de-vigged `p_over`, **monotonized across the ladder**)* · **`nba_market.book_calibration`** *(per
book·market **log-loss + Brier + count, vs graded outcomes**)* · **`nba_market.market_fair`**
*(weighted fair `p_over` **evaluated at every DFS rung that was offered**)*. **Env: `DATABASE_URL`,
`STEP=curves|calibration|fair|all`.**

### 🔴🔴 **AND NONE OF THE THREE TABLES EXISTS**
*`information_schema.tables`, pinned 2026-09-22T08:35:32Z, **with positive controls** (rule 22):*
| table | exists |
|---|---|
| `nba_market.book_curves` | 🔴 **0** |
| `nba_market.book_calibration` | 🔴 **0** |
| `nba_market.market_fair` | 🔴 **0** |
| `nba_market.rung_market` *(control)* | ✅ **1** |
| `nba_market.board_outcomes` *(control)* | ✅ **1** |

🔑🔑 ***A builder whose docstring is the design, and not one of its three tables on the database***
— **exactly the shape of this corpus's standing headline that the two-hop architecture's second hop
is missing for a whole family.**

### ✅ **AND THE REASON IS IN THE CODE — IT WAS TRIED AND IT NEARLY FILLED THE DISK**
**`nba/build_rung_market.py` is the scoped replacement that DID land, and it says why**:
> *"**WHY SCOPED**: the engine only ever needs the book's opinion **at lines the DFS apps actually
> offered**. ***Materializing implied curves for all 15.4M book rows cost 3 GB and NEARLY FILLED THE
> DISK***; the scoped version is ~2.2M rows."*
> *"**WHY CHUNKED**: one month per transaction keeps WAL and temp spill small. ***A single
> `CREATE TABLE AS` over 27M rows ran 1h38m and pushed the disk to 91%.*** Monthly blocks finish in
> seconds each and can be resumed — the table records which months are done."*

🔑🔑 ***So the market layer's shape was set by the STORAGE CEILING, not by the modelling argument***
— **the same ceiling as the read-only incident** *(`NBA_DATABASE.md` §0v)*. **That is the connection
between the two, and neither entry had it.**

### ⚠ WHAT IS LIVE IS CLOSER TO THE DESIGN T13 REJECTED — **stated precisely**
**`nba_market.rung_market`, pinned 2026-09-22T08:35Z: 1,057,765 rows · 378 dates · columns
`game_date, snapshot_label, player, market, line, p_over_book, p_over_sd, books, built_at, nm` ·
`built_at` last 2026-09-11T03:39:32Z.**
**Its de-vig is *"per book across the two sides of the SAME line, then averaged across books"*** —
***the same-line family, not the interpolated-CDF family.*** ✅ **It is better than the 1.48 the
naive build measured — `avg(books)` is `2.11`, min 1, max 8 — because it is scoped to DFS rungs and
draws on eight books**, ⚠ **but it is still an average of whichever books happened to post that
exact line, and the empirical per-market WEIGHTING the owner asked for is not in it: there is no
weight column and no calibration table.**
🔑 ***So the owner's directive is answered in DESIGN and in CODE, and is NOT answered in DATA.***
**Documented, not acted on** *(rule 1)*.

### ✅ **AND `rung_market` INDEPENDENTLY CONFIRMS THE PLACEHOLDER FINDING — in the system's own words**
> *"**Flat DFS placeholder prices (−137 / +100) are EXCLUDED: they are NOMINAL PRICING, NOT ODDS.**"*

🔑🔑 ***The code uses the word "placeholder" for exactly the two prices `NBA_MULTIPLIERS.md` §0.9d.1
identified by census, and excludes them from the market layer.*** **That is a third independent
confirmation, this time from the system itself**, and **it settles the `−137` question as the system
already settled it.**
⚠ **BUT IT IS NOT THE SENTINEL EXCLUSION THE OPEN ITEM ASKS FOR.** `rung_market` excludes **the flat
DFS prices**; the arbitrage item requires excluding **`price ≤ −10000` sentinels** *(180 Underdog
rows, `NBA_OPEN_ITEMS.md`)*. ***Two different exclusions, and only the first is implemented.***
📌 **`BOOKS` in that builder is the eight sportsbooks explicitly** — `draftkings, fanduel, betmgm,
williamhill_us, betrivers, bovada, betonlineag, fanatics` — **so the DFS apps are excluded from the
market side by construction, which is correct and was nowhere recorded.**

### ✅ `[LIVE-AUDIT]` 2026-09-21 — **the grader ran**
**`nba_market.board_outcomes` ≈ 6,905,452 rows / 2,151 MB**, **`graded_at` 2026-09-20T02:39Z**;
**`nba_score.board_scored` ≈ 11,956,460 rows / 2,948 MB.** *So segment 37's "it'll be built the day
the boards land" is satisfied: the boards landed (27.06M) and the grading ran.* ⚠ **`reltuples`
estimates** *(rule 30)*. ⚠ **`nba_score.paper_picks` holds **0 rows** exactly** *(`reltuples` = −1,
never analysed)* — *the "`paper_picks`' purpose" question T11 left open is still open, and the table
is ~~empty as of today~~ **empty as of `2026-09-22`** — ✅ **`SELECT count(*) FROM
nba_score.paper_picks` → `0`, re-derived 2026-09-22 (§T20.27).** *An UNANCHORED "today" was the worst
of the four now-relative classes §T20.27 found: it drifts like a countdown **and** carries no base
date, so a later reader cannot even tell whether it was true when written. Anchored here.*

### 📌 And the code states a design intent that NO document carries
**§T11.5c records that `board_outcomes` has 6,905,452 rows with `bookmaker` and `snapshot_label`
entirely NULL.** 🔑 ***`grade_board_outcomes.py` says why, in two comments***: **line 160 —
*"distinct-leg key: the outcome does not depend on bookmaker/snapshot"*** — and **line 193 —
*"Grade DISTINCT legs, not one row per bookmaker: the outcome of (player, market, line, side)…"***
🔴 **Both are in the code and in ZERO documents** *(the only other carrier of "distinct legs" is the
out-of-scope `PP_PAYOUT_FINDINGS.md`)*. ⚠ **Stated as what the code SAYS, not as a verdict on the
design** *(rule 6)*: ***the corpus recorded the two NULL columns as a fact and did not record the
stated intent behind them.***

## 0. LINEAGE — the owner's three-run model *(T1)*, refined through T4–T9

### 0.1 THE ARCHITECTURE CORRECTION *(T4)* — why the split exists at all
The owner's correction, and the verified reason:
> *"the baseline is **expensive to compute but only changes after a player plays a game — it can be
> CACHED**. Enrichment data (injury news, line movement) **changes all day**… the fast-changing
> scoring engine can **re-run in milliseconds** without ever recomputing the expensive baseline.
> **Merge them, and every minor daily update forces a full slow recompute.**"*

**A caching argument, not a convenience.** This is the founding justification for P2/P3.

### 0.2 The boundary, and how it is enforced *(T7, T8)*
> *"**daily-mined = enrichment; derivable-from-history = baseline**"* — the baseline is
> *"**AGNOSTIC** of daily context and market."*
**Encoded as a column**: `nba_config.factor_registry` tags **25 baseline / 4 enrichment** (injury
report, confirmed lineups, market-spread delta, referee assignment). **Queryable, therefore
enforceable.**

### 0.3 The two-layer contract *(T8)*
> *"Baseline applies static factors; **enrichment applies DELTA factors**: `market_spread −
> derived_spread`, `confirmed_out` superseding `questionable`. **No oscillation, no double-count, and
> the value of live information becomes measurable on its own.**"*

### 0.4 The original cadence vs today *(T4, `NBA_SYSTEM_DRAFT.md` §4b)*
| Run | Original | Today | Note |
|---|---|---|---|
| Static differential | Mondays **2:00 am PT** | Mondays **12:00 PT** | nothing here is cutoff-sensitive |
| Delta daily | **~11:00 am** | **01:00 PT** planned | ⚠ **tighter than the 6am ET the lag research endorsed** |
| Master run | **2h before the first game — DYNAMIC** | **fixed 1:15 PM PT** | ⚠ **breaks on early-tip days** |

### 0.5 Three governing principles
- **The baseline must NEVER live-query stats.nba.com** — speed, stability, and **reproducibility**
  (*"a live query at 9am vs 10am could return different data if a correction posted in between"*).
- **Late NBA stat corrections are NOT chased** — *"a consistent point-in-time snapshot."*
  **⚠ Note the tension with T1's blueprint §4k**, which prescribes the opposite for outcome data:
  *"**a BOUNDED ROLLING RE-VERIFICATION WINDOW, not a single permanently-frozen cutoff** — commercial
  sports-data practice converges on **a 3–4 day, up to roughly a week, rolling correction pass**,
  since **official stat corrections are routinely issued multiple days after a game concludes.**"*
  **Both are right for different layers**: the **baseline** must be point-in-time or walk-forward
  parity breaks; **`board_outcomes`** is the label the calibration learns from, and a frozen wrong
  label is training on stale truth. **See `NBA_OPEN_ITEMS.md`.**
- **No pasted constants** — HCA, `P(blowout|spread)` and the blowout ratios are derived from TRAIN
  inside each run; `baseline_ladder_runs` records what each run derived.

---

## 0.6 The original wording

> *"the system is composed by 3 runs, each run will be ran by claude coworker, **so no runner,
> orchestrator or anything like, it only breaks the run** … individual worker by individual worker,
> path by path and making sure they are properly doing their jobs, **that is the way MLB system runs
> now and is running just fine**."*

| Owner's run | Today's pipeline |
|---|---|
| **Static differential** — calendar, teams, players, rosters, arenas, referees | **P1 Weekly Static** |
| **Delta daily** — game logs + incremental mining, **and the baseline, "the heart of the system"** | **P2 Overnight Heavy** |
| **Master run** — Board → Daily Context → Market/Odds → Scoring Engine | **P3 Afternoon Light** |

**Locked dependency, from T1:** *"the baseline must fully finish before master-run's Daily Context or
Scoring stages touch it."* → **P2 must complete before P3 runs.**

**There is deliberately no orchestrator.** Each pipeline is its own workflow with its own concurrency
group.

---

## 0.7 THE FOUR-LAYER ORDERED FULL-RUN PATTERN *(T1, the blueprint)*
*Recorded 2026-09-20. Described as MLB's **real, current** architecture — explicitly **"not the
abandoned earlier 'orchestrator + auto-scheduled cron' design."***

| # | Layer | Contents |
|---|---|---|
| **1** | **Board** | pull each platform's raw board (own PrizePicks scraper + ParlayAPI for Sleeper/Underdog), **normalise into a common shape**, write to `market.*_board_current` |
| **2** | **Daily Context** | *"same-day contextual factors — **lineups/rotations, player availability, matchup context, injury status**"* |
| **3** | **Market** | *"mine sportsbook/DFS pricing data for **cross-referencing and multiplier-study** purposes"* → `market.context_probe_*`, archived to `archive.market_prop_context_history` |
| **4** | **Scoring** | *"the actual prediction/probability engine — **baseline model → enrichment factors (EACH A 'PHASE' FILE) → matrix builder → scoring engine → hit-probability board → FINAL BOARD (curated, tiered PRIMARY/REVIEW output)**"* |

> *"**This four-stage order is LOAD-BEARING, NOT ARBITRARY** — replicate the same ordering for NBA and
> **DON'T PARALLELIZE STAGES 1→2 WITHOUT RE-VERIFYING the same dependency doesn't exist.**"*

**Layer 4's internal chain names two stages NBA has not built under those names:**
| MLB stage | NBA equivalent |
|---|---|
| baseline model | ✅ `classification_ladder_v12.py` → `baseline_ladder` / `baseline_history` |
| enrichment factors, **each a separate "phase" file** | ✅ `build_final_hp.py` + the factor registry — **consolidated, not per-factor files** |
| **matrix builder** | the full prop × line × side matrix — ✅ **`baseline_history` (19.3M rows) is the matrix** |
| scoring engine | ✅ `score_board_legs.py` |
| hit-probability board | ✅ `final_hp` (38.7M rows) |
| **FINAL BOARD — *"curated, tiered PRIMARY/REVIEW output"*** | ⏸ **NOT BUILT** — this is the slip/selection layer, correctly deferred |

**⚠ The PRIMARY/REVIEW tiering is the stated end product**, and NBA stops one stage short of it. That
is consistent with the owner's sequencing (*"goblins and demons… board dependent"*, selection deferred),
**but it means `board_scored` is the last artefact, not a curated board.**

### ⚠ THE DOCUMENTED ORDERING BUG — Board must run BEFORE Daily Context
> *"MLB had **a real, documented ordering bug from running these OUT OF ORDER**:
> ***'Board/Score Prep MUST run before Daily Context. Daily-context sidecars FILTER BY PREPARED-BOARD
> pickable/current rows; running them BEFORE board refresh produced FALSE `VALID_ZERO` /
> `NOT_APPLICABLE`… despite calendar/source availability.'***"*

**The failure mode is specific**: daily-context steps filter against the prepared board, so if the
board has not been refreshed they find nothing and record **`VALID_ZERO` / `NOT_APPLICABLE`** —
*"despite calendar/source availability"*, i.e. **the data existed and was reachable; the filter had
nothing to match.**

**How NBA relates:**
- **P3** runs **board → context → market → score** inside one workflow, so ordering is enforced by
  step order rather than by a queue.
- **The same dependency exists inside P3**: `score_board_legs.py` is **board-scoped**, so **if the
  board scrape has not landed it has nothing to score** — a small or empty run, not an error.
- **The NBA analogue of the false-`VALID_ZERO` symptom is a low leg count.** P3's certifier asserts
  the cutoff; **whether it asserts a minimum board size is worth confirming.**

**This is also the origin of the owner's locked dependency** — *"the baseline must fully finish before
master-run's Daily Context or Scoring stages touch it"* → **P2 must complete before P3.**

---

## 0.75 THE THREE EXPLICIT NON-GOALS — what NBA was told NOT to build
*Source: T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` **§6**, written before any NBA code existed.
Recorded 2026-09-20 (T1 pass 31) — the three facts existed in these documents as **things NBA did**;
they had never been recorded as **instructions NBA was given**.*

> 1. *"**Don't build a per-prop 'one worker per prop' architecture** — MLB tried this, abandoned it in
>    favour of a unified scoring engine, and **left 19 dead stub files behind as evidence**. **Build
>    the unified version from the start.**"*
> 2. *"**Don't try to port MLB's weather, quality-of-contact, or RFI/NRFI-style factors** — they have
>    **no basketball analogue** and building them would be **wasted effort**."*
> 3. *"**Don't invest in an elaborate auto-scheduling orchestrator BEFORE the manual pipeline works
>    end-to-end and has been verified against real data at least once.**"*

| # | Honoured? | Evidence in this system |
|---|---|---|
| 1 | ✅ | one unified engine — `nba/build_final_hp.py`; no per-prop worker was ever created |
| 2 | ✅ | no weather, quality-of-contact or RFI-analogue factor exists in `nba_config.factor_registry` |
| 3 | ✅ **then**, ⚠ **now** | **there is no orchestrator** — see §0.6 — but P2 and P3 **still have no cron** |

### ⚠ Non-goal 3 is a SEQUENCING rule, and the sequence has moved on
It forbids an orchestrator **"before the manual pipeline works end-to-end and has been verified
against real data at least once."** **It does not forbid scheduling.** It is the correct explanation
for why **P2 (§3) and P3 (§4) were built with `no cron yet`** — and **it stops applying the moment
that one verified end-to-end run exists.**

**Season opens 2026-10-20** *(corrected 2026-09-21, §T10.18b — this line read 2026-10-03; that is
preseason opening night, verified live: prefix 001 preseason 10-03→10-16, prefix 002 regular
10-20→2027-04-11)*. **Whether that verified end-to-end run has happened is NOT RECORDED** —
§7's verification table marks the pipelines' status, but the specific question non-goal 3 poses has
never been asked in these documents. **Flagged in `NBA_OPEN_ITEMS.md`, not resolved here.**

### ⚠ The owner restated non-goal 1's sibling independently, in his own words
Non-goal 3 came from the MLB handoff. **The owner arrived at the same conclusion separately** —
*"no runner, orchestrator or anything like, **it only breaks the run**"* (§0.6). **Two independent
sources, one rule**, which is why it is the most robust constraint in this document. **Note they are
not identical**: the handoff says *"not yet"*; the owner says *"not at all."* **The owner's is the
binding one.**

---

## 0.8 CHAIN INDEPENDENCE — don't build one monolithic run
*Source: T1, blueprint §4o. Recorded 2026-09-20.*

### The operational rule it comes from
> *"**When triggering a full run, backfill, or any multi-stage chain genuinely expected to take
> several minutes or more, DO NOT sit there REPEATEDLY POLLING or RE-CHECKING its status turn by
> turn** — that **burns real attention and session budget for no benefit, since THE JOB RUNS
> INDEPENDENTLY OF WHETHER ANYONE IS WATCHING IT.**
> **The correct pattern: TRIGGER IT, DO ONE REAL CONFIRMATION CHECK that it has genuinely started,
> REPORT THAT PLAINLY, and then STAND BY.**"*

### ⚠ The design consequence
> *"**DON'T design ONE GIANT COMBINED CHAIN where a SLOW EARLY STAGE SILENTLY DELAYS OR BLOCKS EVERY
> LATER STAGE for an UNBOUNDED amount of time.**
> **Each major layer — the BOARD layer, the DAILY-CONTEXT layer, the MARKET layer, the SCORING
> layer — should be ITS OWN GENUINELY INDEPENDENT, SELF-GATING, SELF-CONTINUING CHAIN that can be
> TRIGGERED ON ITS OWN and CHECKED ON ONLY WHEN ASKED** — **trigger one, let it finish in the
> background, then trigger the next** — **rather than A SINGLE MONOLITHIC RUN where an EARLY
> BOTTLENECK SILENTLY STALLS EVERYTHING DOWNSTREAM.**"*

### ⚠ NBA built the opposite for P3, deliberately
**P3 runs board → daily context → market → scoring as SEQUENTIAL STEPS IN ONE WORKFLOW.** The four
layers named here as *"genuinely independent chains"* are **one monolithic run** in NBA's design.

**The trade is real and cuts both ways:**
| One workflow (NBA's P3) | Four independent chains (prescribed) |
|---|---|
| ✅ **Ordering is enforced by construction** — the Board-before-Daily-Context bug (§0.7) cannot occur | ⚠ ordering must be managed |
| ✅ One concurrency group, one certifier, one failure surface | ⚠ four of each |
| ⚠ **A slow board scrape delays scoring** | ✅ a slow stage blocks only itself |
| ⚠ **An early failure means no scoring at all that day** | ✅ later layers can still run on prior data |

**NBA's mitigation is time budget, not independence**: P3 runs at **1:15 PM PT** against a first tip
no earlier than ~4 PM PT, so there is slack. **But the failure mode the blueprint names is exactly
"an early bottleneck silently stalls everything downstream", and P3 has that shape.**

**⚠ The sharpest case is the board scrape.** It is step one, it depends on an external DataDome-guarded
host, and **everything downstream is board-scoped** — so a board failure produces **a run that
completes with almost nothing scored**, rather than a loud stop.

**P1 and P2 are less exposed**: P1's steps are independent scrapers, and P2's heavy stages
(mine → grade → refit → build) have genuine data dependencies that justify sequencing.

**The operational half IS followed — in the LATER transcripts.** *"While that builds (~50 min for six
pairs), the loader worker"*, *"let me check the run directly rather than keep polling blindly."*

> ### ⚠ CORRECTION 2026-09-20 (T1 pass 38) — **it was NOT followed in T1, and the owner said so**
> **VERIFIED** by extracting every `bash_tool` call in T1. **The session's entire local execution is
> two syntax checks, two `cat`s, and **TWENTY-FIVE polling sleeps totalling 40.3 minutes** *(count and total corrected 2026-09-20, T1 pass 66 — **MEASURED** from the export's timestamps; the earlier "thirteen" counted distinct durations, not calls)*— `sleep 30, 40, 45, 50, 55, 60, 70,
> 90, 150, 240, 280, 290`, each `; echo done`, each waiting on a GitHub Actions run. **That is
> exactly what §4o prohibits.**
>
> **The owner interrupted it live** — owner message 6 of 15: *"**what is going on? what are these
> waits for?**"*
>
> **The cause is structural as well as behavioural**: T1 had **no way to await a run** —
> `github_trigger_workflow` was absent from the session's tool list (`NBA_MASTER_SUMMARY.md` §T1.17),
> so there was **no completion signal to subscribe to, only a run list to re-read.** The file-based
> trigger (`NBA_SYSTEM_ARCHITECTURE.md` §7) answers the first half; **the owner's objection answered
> the second.** **The evidence quoted above is from LATER transcripts — T1 is the counter-example.**

---

## 0.9 TRIGGER / SCHEDULING REALITY — "build this correctly from day one"
*Source: T1, blueprint §5. Recorded 2026-09-20.*

### MLB's real operating model, after abandoning automation
> *"**MLB's real, current operating model (AFTER ABANDONING AN EARLIER, MORE AUTOMATED DESIGN):
> MANUAL or COWORK-SESSION-DRIVEN, LAYER-BY-LAYER execution, NOT continuous automated cron
> dispatch.** The full **orchestrator/auto-scheduler machinery that was built earlier was later
> RETIRED** in favour of running each layer by hand or via a scheduled Cowork/Claude session
> — **currently 4× daily: 1am, 9am, 1pm, 5pm Pacific for MLB.**
> **DO NOT build an elaborate auto-scheduling orchestrator for NBA BEFORE you have A WORKING MANUAL
> PIPELINE** — **MLB's own history shows THE AUTOMATED VERSION ACCUMULATED REAL, HARD-TO-DETECT
> PROBLEMS before being scaled back to manual/scheduled-session control.**"*

**This is the origin of the owner's no-orchestrator rule** (*"so no runner, orchestrator or anything
like, **it only breaks the run**"*) — **it is not a preference, it is a retired architecture.**

> ### ⚠⚠ CONTRADICTION 2026-09-20 (T1 pass 44) — **the live code says FIVE windows, not four**
> **VERIFIED by grep of the live `generate_wrangler_configs.py`:**
> `MASTER_RUN_BASE_TIMES = ["16","20","0","5","9"]` with the inline comment
> **`# 9am/1pm/5pm/10pm/2am PT`** — and its reason: *"closes the **~11-hour overnight gap** the
> previous 3-time schedule left even when Cowork ran normally."*
>
> **The blueprint says four (1am, 9am, 1pm, 5pm). The code says five (9am, 1pm, 5pm, 10pm, 2am).**
> The overnight slot differs too — **2am in code, 1am in the blueprint.** **Flagged, not resolved**,
> but the standing precedence rule — *live code outranks documents* — points to the code, and the
> code's comment reads like the record of a later change.
>
> **The comparison below is built on the blueprint's four and should be read with that caveat.**
> On the code's five: **MLB's 10pm PT window has no NBA counterpart**, and **NBA's P2 at 01:00 PT
> falls between MLB's 10pm and 2am rather than matching a 1am run.**

**MLB's four daily windows — 1am / 9am / 1pm / 5pm PT — are worth comparing to NBA's three:**
| | MLB | NBA |
|---|---|---|
| Overnight | **1am PT** | **P2 at 01:00 PT** — the same hour |
| Morning | 9am PT | — *(NBA folds this into P2)* |
| Midday | **1pm PT** | **P3 at 1:15 PM PT** — near-identical |
| Late | 5pm PT | — |

**NBA runs three pipelines where MLB runs four sessions**, and the two shared times match almost
exactly. **The two NBA does not have are the 9am and 5pm windows** — and §4n's warning that *"one of
the four intended times NEVER FIRED AT ALL"* is a reason to measure rather than assume MLB's four are
real either.

### ⚠ "NO GAMES SCHEDULED" MUST BE A FIRST-CLASS STATE
> *"**A real, confirmed architecture gap in MLB, worth designing around from the start for NBA: the
> system COULD NOT ORIGINALLY DISTINGUISH 'GENUINELY ZERO GAMES TODAY' (e.g. ALL-STAR BREAK) from
> 'SOMETHING IS BROKEN AND RETURNED ZERO ROWS.'**
> **Build an EXPLICIT, FIRST-CLASS 'NO GAMES SCHEDULED' STATE into the NBA pipeline FROM DAY ONE —
> don't let a natural zero-game day SILENTLY LOOK IDENTICAL TO A REAL FAILURE.**"*

**The NBA calendar has real zero-game days**: the **All-Star break** (~5 days), and scattered dates.
**`nba_calendar.games` holds 2,666 games and knows exactly which dates are empty.**

**⚠ NBA's current signals are ambiguous in exactly the way described:**
| Signal | Zero games | Broken |
|---|---|---|
| P2's delta gap audit | 0 expected, 0 found → **passes** | 0 expected because the calendar read failed → **also passes** |
| P3's scored-leg count | 0 legs | 0 legs |
| The certifiers | assert freshness and row counts | — |

**The distinguishing information exists** — the schedule says whether games were expected — **but no
explicit "no games scheduled" state is recorded as implemented.**

> ## 🔴🔴🔴 **THE CERTIFIER ROW ABOVE IS FILLED IN — 2026-09-22, T20 pass 89 (`§T20.94`). THE ANSWER IS WORSE THAN "AMBIGUOUS": ON A ZERO-GAME DAY BOTH PIPELINES CERTIFY *RED*.**
> *(Read from `nba/certify_pipeline.py` directly — rule 21. **Nothing is changed; this states what the
> code does.** The table above left the certifier's "Broken" cell as a dash because nobody had opened
> the file against this question.)*
>
> | | zero games | broken |
> |---|---|---|
> | **`PIPE=p2`** *(4 checks)* | 🔴 **FAILS 2**: `baseline_history has today` requires `count(*) > 0` for `game_date = today`; `baseline props for today` requires `count(DISTINCT prop) >= 25`. **Both are `0`.** | identical |
> | **`PIPE=p3`** *(5 checks)* | 🔴 **FAILS 2**: `final_hp has today` requires `count(*) > 0`; `board archived today` requires `board_snapshots` rows for today. **Both are `0`.** | identical |
> | ✅ **`PIPE=p1`** *(3 checks)* | ✅ **PASSES** — its checks are **date-independent** *(`max(as_of_date)` within 8 days, `defender_ratings > 10k`, `player_name_map > 400`)* | would fail correctly |
>
> ⚠⚠ **AND `CERT_STRICT` DEFAULTS TO `1`** *(`certify_pipeline.py:32` — `strict = os.environ.get("CERT_STRICT","1") == "1"`)*, **and neither `nba-p2-overnight-heavy.yml` nor `nba-p3-afternoon-light.yml` sets it.** ⇒ ***`sys.exit(1)`. A red build, with the message "This pipeline did NOT produce what it promised."***
>
> ### 🔬 HOW MANY DAYS — **MEASURED LIVE, on a COMPLETED season** *(`nba_calendar.games`, `2026-09-22`)*
> **2025-26 — `2025-10-21 → 2026-04-12`, `174` calendar days, `167` with games ⇒ 🔴 `7` ZERO-GAME DAYS**:
> **`2025-11-27` (Thanksgiving) · `2025-12-24` (Christmas Eve) · `2026-02-14`, `2026-02-16`, `2026-02-17`, `2026-02-18` (All-Star break) · `2026-04-11`.**
> ⚠ *The prior above says "the All-Star break (~5 days), and scattered dates" — **the enumerated figure for a completed season is `7`, and the break contributes `4` of them, not 5.*** ⚠ **The 2026-27 calendar as currently loaded shows `18` in `174` days, but it holds `1,200` games against `1,238` for 2025-26 — **~30 short of a full regular season**, so that figure is NOT final and is recorded only as an upper bound *(rule 30)*.
>
> 🔴🔴 **THE COLLISION THAT MAKES THIS URGENT.** *`nba-p2-overnight-heavy.yml`'s own header gives the reason its cron was withheld:* > ***"a scheduled job failing nightly against an empty schedule trains everyone to ignore red builds."***
> ⇒ ***That reasoning was applied to the OFFSEASON and never to the CALENDAR. The in-season schedule
> reproduces the same condition at least `7` times a year, on both pipelines — `14` guaranteed red
> builds — the moment the crons go in.*** 🔴 **OWNER DECISION**: *the fix is small and is exactly the
> first-class state the MLB lesson above asked for — **gate the two date-scoped checks in each
> certifier on `nba_calendar.games` having rows for that date**, so a zero-game day certifies green
> and a genuine zero certifies red. **Not fixed here (rule 1); recorded with its evidence.***
> 📌 **Full day-by-day context: `NBA_RECIPE.md` `STEP 12 — THE GAME-DAY TIMELINE`, gap ③.**

---

# 🔴🔴🔴 **THE SWALLOWED-FAILURE CENSUS — WHERE A PIPELINE CAN DO LESS THAN IT CLAIMS AND STILL CERTIFY GREEN** *(written 2026-09-22, T20 pass 97, §T20.102)*

> 🔑 **WHY.** *`§T20.101` found one instance while reading a script for another reason: `P2`'s
> day-before injury enrichment sits in a `try/except` that prints one line and continues.* **This is
> the `SILENT` class the brief ranks above everything else, so it was counted rather than left as an
> anecdote.**
> ▶ **POPULATION RE-DERIVED `2026-09-22T22:07:03Z`** *(rule 15/17, not reused from `§T20.99`)*: **the
> `40` scripts the three pipelines call** — **`69` `except` handlers**, of which **`67` neither
> re-raise nor exit.**
> ⚠⚠ **THE BAR, FIXED BEFORE READING**: *a handler counts only if **(a)** it does not re-raise,
> **(b)** it does not exit non-zero, **(c)** it does not write a sentinel the pipeline later checks —
> **and the step still reports success while the certifier cannot tell.*** ***A retry loop is not a
> swallow. A designed fallback is not a swallow.***

## 🔴 CLASS A — **`5` SCRIPTS WHERE A PARTIAL FAILURE IS INVISIBLE**

| where | what is lost | why nothing catches it |
|---|---|---|
| 🔴🔴🔴 **`build_availability_delta.py:70-71`** — `for sh in idx.get("shards", []): try: rows.extend(fetch(...)) except Exception: pass` | **whole SHARDS of the injury-report archive** | ***`pass`. No message of any kind.*** The code then tests only `if inj.empty` — **so losing some shards yields a smaller-but-non-empty delta that looks normal.** `PIPE=p3`'s five checks never look at it. |
| 🔴🔴 **`baseline/build_baseline_ladder.py:103`** *(PRIOR, `§T20.101`)* **and `baseline/build_periods_ladder.py:80`** | **the entire day-before injury enrichment** | one printed line; the ladder builds; `PIPE=p2` counts rows and props, never enrichment |
| 🔴 **`build_defender_ratings.py:64-67`** | **matchup SHARDS** — one printed line per shard, `if not frames: return empty` | `PIPE=p1` checks `defender_ratings > 10000` rows — ***a partial build clears a floor that low*** |
| ⚠ **`scrape_nba_season_tables.py:133-139`** | **one team's COACHES** per failure | the file is written with fewer records; **`P1` has no coaches check at all** |

> ## 🔴🔴🔴 **THE SHARPEST FACT: `build_availability_delta.py:71` IS THE ONLY HANDLER OF THE `69` THAT LEAVES NO TRACE WHATSOEVER — AND WHAT IT FEEDS IS THE SCORED BOARD.**
> **`score_board_legs.py:189` reads `FROM nba_score.availability_delta WHERE game_date = %s`.**
> ⇒ ***A silently truncated availability delta does not merely degrade a report; it changes the legs
> `P3` scores, and the only evidence that anything happened is the absence of rows nobody counts.***

## ⚠ AND IT BREAKS A DISCIPLINE THIS CORPUS ALREADY STATES

**`NBA_MASTER_SUMMARY.md` records the rule for exactly this layer**: *"**Baseline build** (T14+) —
**fail loudly, no swallowing** — the outputs are interdependent; a silently missing prop pair is
**invisible** and corrupt"*, and `NBA_OPEN_ITEMS.md` repeats it: *"the baseline build **forbids
swallowing failures**."*
⇒ 🔴 ***The two baseline ladder builders each carry a swallowing handler. The discipline is
documented, and the code does not follow it.*** ⚠ **Recorded, not fixed (rule 1).**

## ✅ CLASS B — **CORRECTLY NOT DEFECTS, NAMED SO THEY ARE NOT RE-FOUND**

*The bar excluded far more than it kept.* **Retry loops** *(`last_error = str(exc); if attempt < 3:
time.sleep(5)` — about forty of the sixty-seven)* record the error and fall through. **Designed
fallbacks** are correct: the other bare `pass` in the whole set, **`scrape_underdog_board.py:91`**,
*looks like the worst case and is not* — `registry` is assigned a valid default on the line above and
seeded on the lines below. **Per-leg skips** in `archive_live_boards.py` increment a counter the run
reports. 📌 *Naming these is part of the finding: **`67` non-re-raising handlers reduce to `5`
scripts once the bar is applied**, and a census that had skipped the reading would have reported
thirteen times the true number.*

---

## ✅✅ **THE SHELL HALF — AND IT IS CLEAN** *(added 2026-09-22, T20 pass 98, §T20.103)*

> *The census above searched one language; a GitHub Actions step is a **shell** script and swallows
> differently. **The same bar was applied to the `run:` blocks** — pinned `2026-09-22T22:11:52Z`:
> **`39` steps, `20` `run: |` blocks** across the three pipelines.*

| construct | found | verdict |
|---|---|---|
| **`continue-on-error:`** | ✅ **`0`** in all three pipelines | *GitHub reports such a step green regardless — **none exists here.** ⚠ **And it is a deliberate choice, not an oversight**: `11` other NBA workflows DO carry it — `nba-backfill`, `nba-backtest`, `nba-boards-market`, `nba-daily-delta`, `nba-diagnostic`, `nba-game-officials`, `nba-measure-types`, `nba-pergame-backfill`, `nba-scrape`, `nba-season-tables`, `nba-starter-status` — and `§T2.10a` already documents that policy for the scrape jobs.* |
| **`\|\| echo failed`** | ✅ **`0`** | *the only two `\|\| echo` hits in all three files are **the headers declaring the policy**: `nba-p2-overnight-heavy.yml:15` — **"both fail the job loudly. No `\|\| echo failed` anywhere"** — and `nba-p1-weekly-static.yml:16`, **"FAILURE POLICY: steps report loudly."*** |
| **`\|\| true`** | **`4`** | ✅ **all four are `git add … \|\| true` inside commit steps, each followed by `git diff --cached --quiet`** — a CHECKED fallback, excluded by the bar, exactly as the `62` retry handlers were above |
| **explicit `set -euo pipefail`** | **`7` of `20` blocks** | see below |

### ⚠⚠ **THE THIRTEEN BLOCKS WITHOUT `set -euo pipefail` ARE NOT A DEFECT, AND CHECKING THAT IS THE POINT**

*A multi-command block with no `set -e` **looks** like the shell's `except Exception: pass` — and this
census was one patch away from publishing twelve of them as findings.* ▶ **What killed it**: **no
`shell:` and no `defaults:` override exists in any of the three files**, so GitHub's default `run`
shell on Linux applies — **`bash -e {0}`** — ***and `-e` is therefore already on: a command that is
not the last CAN fail the step.***
⚠ **THE PRECISE RESIDUAL, STATED RATHER THAN WAVED AWAY**: *`bash -e {0}` gives `-e` but **not
`-o pipefail` and not `-u`*** — so a failure inside a **shell pipeline** would still be masked in
those thirteen blocks. ▶ **Checked: there is not a single shell pipeline in any of them** *(the two
`|` characters found are inside Python f-strings — `print(f"PAPER_GRADED|{n} picks")`)*.
⇒ ✅ **RESIDUAL EXPOSURE: ZERO.**

> ## 🔑🔑 **THE CONTRAST IS THE FINDING.**
> ***The shell layer DECLARES a no-swallow policy in its own headers and keeps it completely. The
> Python layer declares nothing at the file level and holds the one handler that leaves no trace
> (`T20-17`).*** **The discipline was written down where it was already being followed, and is absent
> where it was not.**

---

# 🔴🔴🔴 **WHAT CERTIFIES GREEN WHILE BROKEN — THE TWELVE CHECKS, READ ADVERSARIALLY** *(written 2026-09-22, T20 pass 99, §T20.104)*

> 🔑 **THE QUESTION.** *The certifiers are the only automated statement this system makes about its own
> health. Four passes have each found an answer to this question in passing —* `§T20.94` *(zero-game
> days),* `§T20.96` *(38 early-tip days certify green),* `§T20.102` *("a partial build clears a floor
> that low"; "not one of the twelve covers enrichment"),* `§T20.103` *("`board archived today` is
> satisfied by PrizePicks alone")* — ***and nobody had asked it directly.***
> ▶ **All twelve re-derived from `nba/certify_pipeline.py` this pass** *(rule 15/17 — not reused)*:
> **`PIPE=p1` `3` · `p2` `4` · `p3` `5`.** **Row-count denominators taken live, 2025-26:**
> `baseline_history` **median `60,398` rows per game-day across `163` days** · `board_snapshots`
> (PrizePicks) **median `8,994` across `164` days**.

> ✅✅ **A THIRTEENTH CHECK EXISTS AND THIS SECTION DID NOT KNOW IT — added 2026-09-22, T20 pass 110
> (`§T20.115`).** **`nba-boards-market.yml:135–152`, step *"Assert the pull captured something"*:**
> `total = sum(n for _, n in rows); if total == 0: raise SystemExit("NO BOARD LEGS captured for {gd} -
> the scrapers ran but nothing landed.")` — **over `nba_market.board_snapshots` grouped by
> `bookmaker` for today's PT date.** 🔑 **Its own comment states the failure mode this whole section
> is about**: *"A board pull that captured nothing must be VISIBLE. **This is the failure that hides
> best: every step green, no legs in the table, and the scorer quietly prices an empty slate.**"*
> ⚠⚠ **IT IS NOT ONE OF `certify_pipeline.py`'s twelve** — it is **nine lines of Python inside a YAML
> `run:` block**, which is why every census that counted scripts missed it *(probes: `Assert the
> pull` and `NO BOARD LEGS` each **0 of 12, 0 of 30, 0 in the baseline tree**)*. ⚠ **DORMANT TODAY**:
> that workflow is `workflow_dispatch` only — *"**NO CRON YET**… **Cron goes in at season start**"* —
> and nothing else invokes it, **so it guards nothing until the cron is added.** 📌 ***Recorded as a
> POSITIVE: on this one point the corpus was more pessimistic than the system, and a section about
> what certifies green while broken owes the system its real guards as much as its gaps.***
> ⚠ **It is also the ONLY `raise` among the seven inline blocks that does not duplicate a repo
> script** — the full inline-code census is `§T20.115`, population **`7` blocks in `5` files across
> `39` in-scope workflows**, pinned `2026-09-22T23:25:43Z`.

## 🔴 FINDING 1 — **FIVE OF THE TWELVE HAVE NO DATE PREDICATE AT ALL**

| check | pipeline | SQL |
|---|---|---|
| `defender_ratings rows` | p1 | `SELECT count(*) FROM nba_ref.defender_ratings` — **whole table** |
| `player name map populated` | p1 | `SELECT count(*) FROM nba_ref.player_name_map` |
| `as-of calibration available` | p2 | `SELECT count(*) FROM nba_score.ladder_calibration_asof` |
| `confidence model loaded` | p3 | `SELECT count(*) FROM nba_score.confidence_model WHERE deduction > 0` |
| `defender_ratings refreshed` | p1 | tests `max(as_of_date)` ⇒ **ONE fresh row satisfies it** |

⇒ ***Once those tables are populated they can never fail again.*** **A run that wrote nothing certifies
green on all five**, because they describe the database's history rather than today's work.
🔴 **`as-of calibration available` is the one that reads worst**: *`P2` step 16 rebuilds the as-of
calibration and step 18 refits the confidence model — **the check that looks like it covers them
counts rows that were there yesterday.***

## 🔴🔴 FINDING 2 — **`> 0` MEANS ONE ROW OUT OF SIXTY THOUSAND**

| check | threshold | typical real value |
|---|---|---|
| `baseline_history has today` | **`> 0`** | 🔴 **median `60,398` rows** |
| `board archived today` | **`> 0`**, and **any bookmaker** | 🔴 **median `8,994` for PrizePicks alone** |
| `final_hp has today` | **`> 0`** | a full slate is tens of thousands |
| `baseline props for today` | **`>= 25`** of 30 | ⚠ **five props may be missing silently** |

⇒ ***A build that produced one row of sixty thousand passes.*** **And `board archived today` does not
name a bookmaker, so — as `§T20.103` showed for `P3`'s three-scraper step — Sleeper, Underdog and
Fliff can all be absent from a slate while the check is green.**

## 🔴 FINDING 3 — **WHAT IS NOT CHECKED AT ALL**

| pipeline | steps | checks | what they touch |
|---|---|---|---|
| **`P1`** | **9 steps, 14 scripts** | 3 | `defender_ratings`, `player_name_map` — ***teams, arenas, players, bio, season tables, team stats, on/off, playtypes, tracking, DARKO, shot quality and static context are unchecked*** |
| **`P2`** | **19 steps** | 4 | `baseline_history` ×3 + one static — ***grading last night's board, grading paper picks, market spreads, the blowout refit and the confidence refit are unchecked*** |
| **`P3`** | **11 steps** | 5 | `final_hp` ×3, `confidence_model`, `board_snapshots` — ***the availability delta (`T20-17`), the board tiers (`T20-7`) and the paper-pick log are unchecked*** |

⚠ **And `§T20.102` already established the summary line**: ***not one of the twelve covers
enrichment.***

## ⚠ FINDING 4 — **THE CERTIFIER'S OWN CLOCK IS DST-NAIVE, AND THE PIPELINES BYPASS IT**

**`certify_pipeline.py:27` — `PT = timezone(timedelta(hours=-8))`**, and `:33` —
`today = os.environ.get("CERT_DATE") or datetime.now(PT).date().isoformat()`.
✅ **In the pipelines this is harmless**: all three pass `CERT_DATE` explicitly from
`TZ=America/Los_Angeles date +%F`, which is **named-zone correct**.
🔴 **The fallback is the exposure, and it is a hand-run exposure**: *a certifier invoked without
`CERT_DATE` during PDT computes "today" from a fixed `-8` offset.* ⚠ **Within `T20-12`'s stated scope**
*("zero DST-aware Python in the NBA scripts") — cited, not re-raised* — **and one more instance of
`§T20.101`'s pattern: running it by hand is not the same job the pipeline runs.**

> ## ⚠⚠ **WHAT THIS IS AND IS NOT**
> ***None of the twelve is wrong.*** **Each tests what it says it tests**, and a check that is narrow
> by design is not a defect — `confidence model loaded` is meant to test the model, not the slate.
> ⇒ ***The finding is the GAP BETWEEN what certification is read as meaning ("the pipeline produced
> what it promised" — the certifier's own failure message) and what it measures.*** **Recorded as
> `T20-18`; not fixed (rule 1).**

**And it matters twice over for the season opener**: **2026-10-01 and 10-02 are genuinely zero-game
days** before opening night on the 3rd, **and they coincide with the `active_stats_season` edge case
already recorded.** A pipeline run on those dates should report *"no games scheduled"*, not silence
that looks like success.

### 5a. THE ROOT CAUSE, AND ITS SUBTLE NUANCE
*Source: T1, blueprint §5a — "the details matter more than the summary." Recorded 2026-09-20.*

**The bug itself was one line:**
> *"**A single line in the worker that *PRODUCES* the prepared board rows: AN UNCONDITIONAL THROW
> WHENEVER PREPARED ROWS WERE ZERO, WITH NO CHECK FOR *WHY* THEY WERE ZERO.**"*

**And the correct pattern already existed in the same codebase:**
> *"**A downstream daily-context worker had ALREADY SOLVED AN ANALOGOUS PROBLEM CORRECTLY**, reporting
> **a clean 'VALID ZERO' pass** instead of failing when its own input was legitimately empty.
> **The first, generalizable lesson: BEFORE BUILDING a new 'how do I distinguish a legitimate zero
> from a real failure' pattern, CHECK WHETHER AN EQUIVALENT, ALREADY-CORRECT PATTERN EXISTS ELSEWHERE
> IN THE SAME CODEBASE** — **it often does, and COPYING A PROVEN PATTERN BEATS INVENTING A NEW
> ONE.**"*

### ⚠⚠ BUT THE PATTERN COULD NOT BE COPIED NAIVELY — the producer/consumer distinction
> *"**The existing correct pattern worked BECAUSE THAT WORKER WAS A *DOWNSTREAM CONSUMER* of
> already-prepared rows** — **if its input was empty, that was AUTOMATICALLY a valid state, nothing
> upstream to double-check.**
> **The worker with the actual bug was DIFFERENT: it was the *PRODUCER* of the prepared rows in the
> first place, reading RAW BOARD DATA directly. It COULDN'T use 'my own input was empty' as a signal,
> BECAUSE THAT'S CIRCULAR** — the real question it needed answered was **'were there GENUINELY NO
> GAMES SCHEDULED TODAY AT ALL, INDEPENDENT of whether ANY SINGLE UPSTREAM DATA SOURCE happened to
> return anything.'**
> **That requires AN INDEPENDENT SOURCE OF TRUTH — A REAL GAME CALENDAR — NOT a SELF-REFERENTIAL CHECK
> on the worker's own inputs.**"*

**This is the precise reason `nba_calendar.games` must be the arbiter**, and it maps exactly onto
NBA's pipeline:
| Role | NBA component | Correct zero-check |
|---|---|---|
| **PRODUCER** — reads raw board/source data | the board scraper, the delta scraper | ❌ **cannot** use "my input was empty" — **must consult the calendar** |
| **CONSUMER** — reads already-prepared rows | `score_board_legs.py`, `build_final_hp.py` | ✅ an empty input **is** a valid zero |

**✅ NBA's delta worker already does this correctly.** Its **pre-flight completeness check compares
the calendar's Final count against the logged count** — *"halt and warn, don't silently proceed on an
incomplete night"* — **which is exactly "an independent source of truth, not a self-referential
check."** `check_delta_gaps.py` audits *"against the SCHEDULE, not itself"*, stated in those words.

**⚠ The producer NOT protected this way is the board scraper.** It reads raw DFS board data, and a
zero-projection return has no calendar cross-check recorded. **On a genuine no-games day it should
report a valid zero; on a DataDome block it should fail — and the two look identical from inside the
scraper.**

**And the first lesson applies directly**: NBA **already has the correct pattern** in the delta
worker's calendar-based pre-flight. ### ⚠⚠ THE DEEPER ROOT CAUSE — "correctly coded" is not "actually running"
> *"**The calendar tables that *SHOULD* have answered this question ALREADY EXISTED IN THE SCHEMA** —
> **but ONE HAD NEVER BEEN POPULATED AT ALL (ZERO ROWS, EVER), and THE OTHER WAS WEEKS STALE.**
> **The actual root cause WASN'T A MISSING FEATURE in the worker throwing the error — it was that THE
> ONE OTHER WORKER CAPABLE OF KEEPING THE REAL GAME CALENDAR FRESH HAD A FULLY-BUILT, REAL
> IMPLEMENTATION BUT HAD SIMPLY NEVER BEEN WIRED INTO ANY AUTOMATED SCHEDULE.**
> **For NBA: build the 'is a game genuinely scheduled today' calendar signal as ITS OWN
> INDEPENDENTLY-VERIFIED, ACTIVELY-SCHEDULED SOURCE OF TRUTH from day one, NOT something any
> individual pipeline stage tries to infer from its own inputs** — **AND CONFIRM WHATEVER WORKER
> MAINTAINS IT IS ACTUALLY RUNNING ON A REAL SCHEDULE, NOT JUST CORRECTLY CODED.**"*

### ✅ THE CALENDAR ITSELF IS SAFE — verified 2026-09-20
**`scrape_nba_schedule.py` runs in P2**, line 108, in the *"Baseline inputs — season files, quarters,
schedule"* step. **The calendar is refreshed nightly**, and it holds **2,666 games**.

**So NBA does not have MLB's exact failure**: its arbiter of truth is actively scheduled, and the
delta worker's pre-flight consults it rather than inferring from its own inputs.

### ⚠⚠ BUT NBA HAS THE IDENTICAL FAILURE ON A DIFFERENT WORKER
***"Fully-built, real implementation, never wired into any automated schedule"* is a verbatim
description of the weekly differential worker.**

| | MLB's calendar worker | **NBA's differential worker** |
|---|---|---|
| Implementation | fully built | **fully built (T3)** |
| Scheduled | **never wired** | **never wired** — P1 does not call it |
| Observable state | one table 0 rows ever, one weeks stale | **all three `*_differential_log` tables 0 rows; snapshot frozen 2026-09-03** |
| Consequence | zero-vs-broken indistinguishable | **trades, signings, renames undetected** |

**And the instruction — *"confirm whatever worker maintains it is ACTUALLY RUNNING on a real schedule,
NOT JUST CORRECTLY CODED"* — is the check that would have caught it.** It was caught here by querying
the tables, which is the same check applied to the output rather than the schedule.

**⚠ Also worth applying to the other never-scheduled items**: `scrape_nba_splits.py` and career
totals were **put on the weekly cycle in T7 and dropped in the P1 rebuild** — **correctly coded, not
running.**

**The generalisable form**: *"a fully-built implementation that was never scheduled"* is a distinct
failure class from a bug, and **the only reliable detector is observing the output, not reading the
code.**

---

## 0.95 THE CADENCE AS ORIGINALLY LOCKED — three elements never recorded
*Source: T1, `NBA_SYSTEM_DRAFT.md` **§4b — "Real operating cadence — locked 2026-09-03, mirrors the
existing MLB system exactly."*** *Recorded 2026-09-20 (T1 pass 32).*

**The cadence itself and its divergence from what was built are already recorded** in the comparison
table at §0.7. **Three elements of §4b were not**, and each is a design decision rather than a time.

### 1 · The master run's trigger was specified as a COMPUTATION, not a clock time
> *"**2 hours before the first scheduled game of the day**… **Real design implication, not a fixed
> clock time**: since **NBA game start times vary day to day**, this trigger time **must be COMPUTED
> DYNAMICALLY from the real data already in `nba_calendar.games` — today's earliest
> `game_datetime_utc` MINUS 2 HOURS** — **not a hardcoded time-of-day like the other two runs.**"*

**The mechanism was named, the table it reads was named, and the column was named.** §0.7 already
records the outcome — **P3 ships as a fixed `15 21 * * *` and *"breaks on early-tip days"*** — but not
that **the dynamic alternative was fully specified, sourced to an existing populated table, and
distinguished explicitly from the other two runs.** `nba_calendar.games` holds **2,666 games** and
carries `game_datetime_utc`, so **the input exists today.**
**⚠ The two constraints are not the same and both are real**: §1's **1:15 PM PT cutoff** is bounded
*below* by the injury report (*Pacific clubs file last, by 1:00 PM PT*); §4b's rule is bounded *above*
by the first tip. **On an early-tip day they conflict, and the conflict is structural, not a bug in
either.** Recorded in `NBA_OPEN_ITEMS.md`.

### 2 · The optional SECOND master run — and the architecture that exists to enable it
> *"**Once, sometimes TWICE a day**… with an **optional second run later 'only if needed'** (e.g. **a
> late injury designation change or significant line movement after the first run**). **The optional
> second run is exactly the cheap, fast re-run THE TWO-STAGE BASELINE/ENRICHMENT SEPARATION WAS
> DESIGNED TO MAKE POSSIBLE** — it only needs to **re-run the Scoring Engine against the
> already-cached baseline plus fresh enrichment/market data, NOT RECOMPUTE ANYTHING EXPENSIVE.**"*

**⚠ This is the stated PURPOSE of the two-layer split, and it had not been recorded anywhere.**
`NBA_FINAL_SCORING_CALIBRATION.md` §2 documents the two-layer contract as a *correctness* boundary
(baseline = static, enrichment = delta). **§4b says it was also, from the start, an
*operational* one: the split is what makes a second same-day run cheap.** The two framings are
compatible and neither implies the other.

**And §4's own reasoning already proves the second run is affordable**: *"the refit uses only games
strictly before today, so **it is identical at 1 AM and 1:15 PM**. What genuinely changes is
availability, and only for the affected teams."* **If it is identical at 1 AM and 1:15 PM, it is
identical at 4 PM.** **A second run costs the board scrape, the availability delta and the scoring —
not the refit.**

**Status: NOT RECORDED as built.** P3 (§4) documents one run with a cutoff and no second-run path,
and **the trigger conditions §4b names — a late designation change, significant line movement — have
no detector.** Recorded in `NBA_OPEN_ITEMS.md`.

### 3 · The ~11:00 AM delta time was DERIVED, not chosen
> *"**~11:00am** (person's stated time; matches Pacific…) giving **a large safety buffer well past the
> **~2:00am ET latest-possible-game-end + 10–15 min data-finalization window** — **confirmed via
> research and Gemini consultation on 2026-09-03.**"*

**The binding physical constraint on the overnight run is the latest possible game end plus the
league's own data-finalization lag** — *~2:00 AM ET + 10–15 min* — **and it was researched, not
assumed.** **P2 ships at 01:00 PT = 04:00 ET**, which is **~2 hours AFTER the constraint**, so the
shipped time satisfies it with less margin than the specified 11:00 AM but satisfies it. **Recording
the constraint matters more than the time**: it is the number any future re-timing of P2 must respect,
and it was previously only implicit.

### 4 · "No cron" meant something specific
> *"**No cron/orchestrator automation** — these times are **the real, intended Claude
> Coworker-SCHEDULED-TASK trigger times** (per Section 4's existing 'no orchestrator' confirmation),
> **NOT in-code scheduling logic to be built into any NBA worker.**"*

**The rule was never "nothing is scheduled."** It is **"no worker schedules itself."** **A scheduled
Cowork session firing a workflow is compliant; a `setInterval` or a self-triggering Cron Trigger
inside a Worker is not.** This resolves an ambiguity that reads through §0.75's third non-goal and
§0.6's *"it only breaks the run"* — **neither forbids the GitHub Actions cron that P1 already
carries.** **Flagged, not resolved**: whether a `.github/workflows` cron counts as *"in-code
scheduling logic"* is not stated anywhere, and P1 already has one.

---

## 1. THE CUTOFF — why 1:15 PM PT

**The binding constraint is the game-day injury report.** It is due **11am–1pm LOCAL to each game's
market**, so Eastern clubs file by 10 AM PT and **Pacific clubs are last at 1:00 PM PT**.

Every other daily input lands earlier:
| Input | Available by (PT) |
|---|---|
| Prior-night box scores | ~3 AM |
| Referee assignments | ~6–7 AM |
| Market spread / total | 08:00 snapshot |
| Projected lineups | through the morning |
| Boards | on demand |
| **Game-day injury report** | **1:00 PM** ← binding |

**⇒ One window at 1:15 PM PT holds every club's report.**

✅ **THE TRACE BELOW IS CORRECT AND IS CONFIRMED BY DIRECT MEASUREMENT** *(§0z-8-T18-RETRACTION,
2026-09-22)*: **the injury-PDF archive is hourly on the `:30` in Eastern — 48 snapshots per game
date — so `2:30 pm ET` is an ordinary daily filename and the 2026-09-09 seven-item list was a
hand-sample of it.** ⚠ *An intermediate section of this sweep briefly proposed a competing
"league-bulletin" origin; it was **retracted the same day** and the retraction is recorded above with
both states visible. The conclusion never moved: **1:00 PM PT binds, 1:15 PM PT is the cutoff**, now
also confirmed by the league's own published rule.*

**The 2:30 PM PT figure was drift** — traced to a list of observed injury-PDF timestamps in *Eastern*
(2:30 PM ET = 11:30 AM PT), and to `nba_asof.py`'s `PHASE2_CUTOFF_LOCAL = "17:45"  # after the 5:30 PM
ET day-of report` — a league **bulletin**, not a filing deadline. `nba_asof.py` already had
`PHASE1_CUTOFF_LOCAL = "16:00"` = **1:00 PM PT**, which is the correct anchor.

**Consequences:** no third pipeline; **scenario precompute dropped** (one window = nothing to select
with); **freshness gate dropped** (uniform penalty discriminates nothing).

---

## 2. P1 — WEEKLY STATIC
`.github/workflows/nba-p1-weekly-static.yml` · **cron `0 19 * * 1` = Mondays 12:00 PDT / **11:00 PST**** *(qualified 2026-09-22, §T20.49 / T20-11 — 11:00 PT for 133 of the season's first 145 days; the workflow's own `:28` comment inverts PDT and PST)* ·
concurrency `alphadog-nba-p1-weekly` · timeout 180 min

**Why weekly:** these tables are as-of weekly by construction. The cadence is the original one from T1
(`nba_differential_check_cadence = weekly`, cron `0 9 * * 1`), and the reasoning from T2 is explicit —
bio fields are *"truly static"* and season aggregates are *"semi-static, **stable enough for weekly
refresh: a single game barely moves a season average after 20+ games played**."*
**⚠ That reasoning does NOT hold in the first 20 games of a season**, and the cadence was never
revisited for October.

**Why Monday noon:** deliberately far from P2 (daily 01:00 PT) so the two cannot contend. The cron is
UTC so the local hour drifts an hour across DST — harmless, because **nothing here is
cutoff-sensitive**.

**Steps, in order (as actually built):**
1. Teams and arenas
2. Players and bio
3. Weekly as-of season tables (pt_defend, hustle, clutch, coaches, all_players)
4. Team stats, on/off, play types, tracking
5. DARKO and shot quality
6. **Defender ratings** (two-way ridge, weekly as-of) — writes Postgres
7. Static context (coach changes) — writes Postgres
8. Commit data files
9. **Certify** (`PIPE=p1`) — asserts freshness ≤ 8 days; **fails the job** if stale.
   *(Run live: correctly FAILED on defender ratings 6 days stale.)*

### ⚠ THREE THINGS P1 DROPPED IN THE REBUILD — verified 2026-09-20
| Missing | Was |
|---|---|
| **The weekly differential worker** | unwired since T3; **verified empty today**, snapshot frozen at 2026-09-03 |
| **`scrape_nba_splits.py`** | put on the weekly cycle in T7 |
| **Career totals** | put on the weekly cycle in T7 via the `mode: "weekly"` input |

*(The DvP recompute is fine — T7 placed it inside the **delta** worker, so it lives on P2's path.)*
**Splits and career totals are cumulative aggregates** — a 2025-26 snapshot gets steadily more wrong as
2026-27 runs.

> 📌 **UPDATE `2026-09-28`** — *the `mode: "weekly"` input was built (confirmed live in the worker's own code), but was never wired into any schedule — `nba_stats.player_career_season_totals`/`player_splits`/`nba_team.team_splits` are live-verified `20` days stale today, not on the weekly cycle this section describes. Full detail: `NBA_OPEN_ITEMS.md` T26-12, `NBA_WORKERS.md §T26.79`'s correction.*

### ⚠ AND THE LARGER QUESTION — does P1 load anything to Postgres?
**Only `build_defender_ratings.py` and `build_static_context.py` touch `DATABASE_URL`.** There is **no
loader step or `run_job`** for teams, players, bio, season tables, team stats, on/off, play types,
tracking, DARKO or shot quality — **all of which have writer Workers built in T1–T3.**
**Either those Workers are triggered separately (the Coworker model), or P1 refreshes committed JSON
that Postgres never sees.** **This is the top pre-season verification.**

---

## 3. P2 — OVERNIGHT HEAVY
`.github/workflows/nba-p2-overnight-heavy.yml` · **no cron yet** · concurrency
`alphadog-nba-p2-overnight` · timeout 330 min

**No cron until the season opens.** A job failing nightly against an empty schedule trains everyone to
ignore red builds. Target at season start: **daily 09:00 UTC = 01:00 PT**, after the last West-Coast
game finalises and eight hours before P3's cutoff.

**Steps, in order — and the order is load-bearing:**
1. **Daily delta ingestion** — bulk current-season refresh + per-game starters/officials
2. **Injury report (day-before filing)** — `INJURY_MODE=daily`; the availability input P2 builds from
3. **Referee assignments + per-game matchups** — BASELINE-stage factors (D1, M1), available 6–7 AM
4. **Season files, quarters, schedule**
5. **Commit mined data**
6. **DELTA GAP AUDIT** — `nba/check_delta_gaps.py`, against the SCHEDULE (or the team-log witness).
   **The one check that catches a silent hole.** Fails on missing dates, missing games, half-captured
   games, or a truncated-roster RATE above 0.5%.
7. **GRADE last night's board** — **must precede the calibration refit**, or yesterday's evidence is
   invisible to today's cells
8. **Market spreads and totals** — blowout and matchup run on the real market line
9. **Build baseline ladder, PER PROP PAIR** (8 pairs, ~8 min each). Calling the builder once would
   silently produce only the default pair.
10. **Components → combos → periods.** Combos need `BT_SAVE_COMPONENTS=1` singles pickled FIRST.
11. **MERGE the per-pair artefacts** into `nba_baseline_ladder_<asof>.json`
12. **COMMIT the merged ladder** — the loader fetches over HTTP from the repo, so an uncommitted
    ladder is invisible and the load 404s
13. **Load into Postgres** — the loader **refuses a singles-only slate**
14. **As-of ladder calibration** — refit on everything graded strictly before today
15. **Blowout model refit** · 16. **Confidence deduction refit**
17. **Certify** (`PIPE=p2`) — today's baseline exists, ≥25 props, zero invalid probabilities

**Replay:** `asof` + `skip_mining=true` reruns the calculation path on any past date.

---

## 4. P3 — AFTERNOON LIGHT
`.github/workflows/nba-p3-afternoon-light.yml` · **no cron yet** · concurrency
`alphadog-nba-p3-afternoon` · timeout 120 min

**Target cron at season start:** `15 21 * * *` = 1:15 PM PST (2:15 PDT, still 105 min before the
earliest 4 PM PT tip).

**It refuses to run for TODAY before 13:00 PT** — Pacific clubs may not have filed.

**P3 IS BOARD-SCOPED.** It scores every leg the apps actually OFFER — all prop lines, every rung the
> 📏 **§T23.13 — AND THE SCORER'S OWN DOCSTRING PUTS A NUMBER ON WHAT IT SKIPS** *(`T23` pass `13`, read from `nba/score_board_legs.py` line `5`ff, recorded `2026-09-23`)*: *the internal ladder it does NOT score is* ***"`+/-10` for every player × `30` props — `~140k` rows"***, *and the stated reason is* ***"scaling as the board grows with new goblins/demons and deeper ladders across four apps."***
> 🔑 *The exclusion was already documented in three places; **what it costs was not.** `~140k` rows per day is the size of the decision, and it is the difference between `board_scored` and `final_hp` being the live surface.*

app exposes, both directions, goblins/standards/demons — **not** the internal ±10 ladder for rungs
nobody offers.

**Why it must not rebuild:** an earlier version rebuilt all 8 pairs and **ran 35+ minutes without
finishing** — disqualifying. The cost is REFITTING the recipe over three seasons, and **that refit uses
only games strictly before today, so it is identical at 1 AM and 1:15 PM.** What genuinely changes is
availability, and only for the affected teams.

**Steps, in order:**
1. **Resolve slate date; assert the cutoff has passed**
2. **Day-of injury report** — the binding input
3. **Boards** — PrizePicks (own NBA producer, `league_id=7`), Underdog, Sleeper, Fliff.
   Each in its own step; `SLEEPER_SPORTS=nba` and `SLEEPER_OUT_DIR=boards` are mandatory
4. **Archive into Postgres** — **`ARCHIVE_LABEL=window`**, never the `routine` default
5. **Board tiers** — goblin/standard/demon with the anchor
6. **Market snapshot + rung market**
7. **Commit day-of data**
8. **Availability delta** — `DELTA_FROM=baseline`, `DELTA_TO=phase1`
9. **Score the board** — HP from P2's ladder at the exact rung, off-ladder rungs interpolated in
   log-odds and **flagged** (−4 confidence), delta applied, as-of calibration, confidence, score, edge
10. **Certify** (`PIPE=p3`) — legs scored, confidence non-null, score in 0–100, board captured

**NO lineup scrape** (A5 closed). **NO scenario precompute.** **NO freshness gate.**

### ⚠ P3 does NOT run `build_final_hp.py` — and a live comment says it does
*Recorded 2026-09-20 (T1 pass 33). **VERIFIED** by reading `.github/workflows/nba-p3-afternoon-light.yml`.*

**P3's scoring step is step 9 above — `python nba/score_board_legs.py`.** `build_final_hp.py` appears
in `nba-absence-panel.yml`, `nba-engine-test.yml` and `build_confidence_v3.py`, **and in no P-pipeline
workflow.** The two engines are distinct: **`build_final_hp.py` scores the internal ladder into
`nba_score.final_hp`; `score_board_legs.py` scores the board into `nba_score.board_scored`** — which
is what §4's *"P3 IS BOARD-SCOPED"* rule requires.

**The drift**: a comment inside `build_final_hp.py` asserts *"**P3 sets it** [`FE_DATE`] so the
afternoon pipeline rescores only today's legs (seconds) instead of all 38.7M (~90 minutes)."*
**That describes an architecture that does not exist**, and `NBA_WORKERS.md` had inherited the claim.
⚠ **It matters because `FE_DATE` is destructive** — it scopes the read and not the delete, and the
2025-26 partition of `final_hp` has already been reduced to a single date. **Top of
`NBA_OPEN_ITEMS.md`.**

**Blueprint §9 failure mode #6** — *"silent config/formula drift… the output is just silently
wrong-but-plausible"* — **in documentation rather than in config.** The fix §9 prescribes is the
**whole-universe comparison**: diff every documented step against the workflow that actually runs it.
**That diff has been run for P3's scoring step only.** The rest of P1, P2 and P3 are **NOT VERIFIED
step-by-step against their workflow files.**

---

## 4b. ✅ **`final_hp` — NOW REBUILT BY `P2` (step `6b`)** · ~~⚠ WHAT NO PIPELINE DOES — rebuilt by nothing~~

> ✅✅ **CLOSED ~~`2026-09-24`~~ `2026-09-23` (`20:30Z`), recorded `§T26.4`/`§T26.1`.** *(date corrected pass 114 → `NBA_MASTER_SUMMARY.md` `§T26.R3`)* ***`P2` runs `build_final_hp.py` at step `6b`,
> AFTER the as-of calibration and the confidence refit, because it reads both.*** **`FE_DATE` = the
> slate (seconds, not the ~`90` minutes a full rebuild takes); `FE_SEASONS` blank so the script
> resolves the live season; `FE_WRITE=1` or it only reports.**
>
> 🔑 **THE CAUSE THIS SECTION NEVER HAD.** *Why no pipeline owned it:* ***"`build_final_hp.py` deleted
> season+prop while `FE_DATE` scoped the SELECT to one slate, so a daily run would have wiped the
> season's history."*** ⇒ **The write scope was the defect, not the schedule** — *fixed `2026-09-23`,
> which is what made ownership possible.* ⚠ **The analysis below is retained as the record of the gap
> and its reasoning; read it as history, not as current state.**
*Recorded 2026-09-20 (T1 pass 34). **VERIFIED** by reading all three P-pipeline workflow files.*

The calculation chain in §5 below runs `baseline HP → availability delta → as-of calibration →
final HP`. **The last arrow is not wired into any pipeline.**

| Script | Writes | Run by |
|---|---|---|
| `build_final_hp.py` | `nba_score.final_hp` | **no P-pipeline.** Only `nba-absence-panel.yml` (`FE_WRITE` defaults `'0'`) and `nba-engine-test.yml` (`FE_WRITE: '0'`) |
| `score_board_legs.py` | `nba_score.board_scored` | **P3, step 9** |

**This is by design and worth stating plainly**: **P3 is board-scoped** (§4) — it scores the legs the
apps actually offer, not the internal ±10 ladder — so **`board_scored`, not `final_hp`, is the live
daily output.** `final_hp` is the **backtest/replication surface**, built on demand.

**⚠ Two consequences, neither previously recorded:**
1. **The `final_hp` data loss recorded in `NBA_OPEN_ITEMS.md` is PERSISTENT.** Nothing scheduled will
   notice or repair the 2025-26 partition reduced to a single date, and **no certifier checks its
   date coverage** — `certify_pipeline.py`'s P2 check counts `confidence_model` rows.
2. **§5's chain diagram reads as a nightly pipeline and is not one.** A reader tracing the chain
   would reasonably assume P2 or P3 produces `final_hp`. **Neither does.**

---

## 5. THE CALCULATION CHAIN

```
baseline HP  →  availability delta  →  as-of calibration  →  final HP
                                                                 ↓
                                              confidence (measured deductions)
                                                                 ↓
                                        score 0–100  +  edge (own column)
```

**Confidence** starts at 99 and deducts for named deficiencies, weights MEASURED from realised-gap
separation. Role carries the most (fringe players miss by 0.0283 vs iron-men at 0.0008).

**Score** pivots around a **0.85 confidence neutral**: above it the score lifts toward 100 by up to
half the remaining headroom; below it, down by up to 35%. **Verified**: 0.478 HP / 0.949 conf → 65.06,
and 0.434 HP / 0.952 conf **outranks** 0.468 HP / 0.884 conf.

---

## 6. FAILURE POLICY

**No `|| echo failed` anywhere.** That pattern left 44% of a slate missing while the job reported green.

Three safeguards, each answering a failure this project actually had:
| Safeguard | Answers |
|---|---|
| **Delta gap audit** | a silent hole corrupts every as-of value computed after it |
| **Certifier per pipeline** | a pipeline that cannot fail loudly cannot run unattended |
| **P3's cutoff assertion** | scoring a slate clubs have not filed for |

---

## 6b. PIPELINE SCRUTINY DISCIPLINE — the whole methodology
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` **§9** — built by MLB after **"a single night of
independent verification turned up multiple serious, silent bugs that every automated check had
missed,"** and offered as **"worth adopting wholesale."***
***Recorded 2026-09-20 (T1 pass 29) — previously unswept.***

### The core philosophy
> *"**A pipeline's own 'PASS'/'COMPLETE' SELF-REPORT is the STARTING POINT FOR SCRUTINY, NEVER THE
> CONCLUSION.** Every real bug MLB found was caught by **independently RE-DERIVING a claim against
> LIVE DATA** — SQL queries against real tables, real deployed code read directly — **never by
> trusting a second read of the same status field the run already reported.**"*

**This is the design rationale behind `nba/certify_pipeline.py` and `nba/verify_confidence.py`, and
behind the existing failure policy in §6** (*no `|| echo failed` anywhere*): a green job is evidence
that nothing raised, not evidence that the data is right.

### The three techniques that found real bugs no automated check would have
| # | Technique | What it is |
|---|---|---|
| 1 | **Systematic whole-universe comparison** | diff the live config against the real formula/logic for **every entry in a universe at once** (every prop, every source, every combo) — **not just the one currently suspected** |
| 2 | **Leg-by-leg manual tracing** | pick real **high-confidence** outputs, pull raw source data **by hand**, compute the expected value independently, and **explain any gap through a documented mechanism** (shrinkage, calibration) rather than accepting *"looks close enough"* |
| 3 | **Tracing a real user-reported symptom back to raw source data** | when someone reports a concrete discrepancy, **trust the report** and trace it to the **actual raw payload** rather than defending the system's own output first |

**Technique 1 applied to NBA would immediately surface the already-recorded `minutes_mixture` drift**
— config describing three components the recipe does not implement. That is failure mode #6 below,
live, today.

### The six named failure modes — §9 says build a check for each, from the start
Full table, with NBA build status, in `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 29*. In summary:

1. **Reconciliation trusting a still-actively-writing batch** — a background writer can still be
   writing after the calling request timed out. **Fix: require the row count stable across two reads
   separated by a real wait (several seconds).**
2. **Reconciliation trusting a permanently-dead writer** — *"indistinguishable from #1 by stability
   alone (both show a stable count), but the actual DATA COMPOSITION tells them apart."* A
   died-mid-write batch *"characteristically recovers as **100% one category and 0% of whatever would
   have been written later in the write order**."* **Fix: check what real upstream data supports per
   category; if a category with clear real supply is wholly absent, refuse to reconcile and force a
   fresh rebuild.**
3. **A completion check satisfied by stale evidence from a PREVIOUS run.** A staleness-window or
   reference-count check can pass *"purely from leftover evidence a prior, unrelated successful run
   produced."* **Fix: use a check only this run's own fresh output can satisfy — `MAX(updated_at)`
   per entity falling INSIDE this run's own execution window, not "recent enough in general."**
4. **A "deactivated" correction/config still silently applying live**, because the deactivation label
   *"doesn't actually defeat the exact filter condition the live code uses (e.g. a substring-match
   filter that a mere prefix doesn't actually break)."* **Fix: read the exact filter condition in the
   live code and confirm the deactivation genuinely fails it** — *"don't just check that a
   human-readable 'deactivated' label exists somewhere."*
5. **Raw source-API field ambiguity silently corrupting a value**, when the heuristic is built on *"a
   DIFFERENT field that merely CORRELATES with the ambiguity rather than genuinely disambiguating
   it."* **Fix: find the source's own genuine disambiguating field — often a human-readable label
   string.**
6. **Silent config/formula drift across a whole universe**, *"with NO ERROR THROWN — the output is
   just silently WRONG-BUT-PLAUSIBLE, invisible to spot-checking whichever entry currently seems
   suspicious."* **Fix: periodically diff live config against the actual formula for the entire
   universe in one pass.**

### Composition checks, not just row counts
> *"Verify that **BOTH expected output categories** (e.g. a PRIMARY/high-confidence tier and a
> REVIEW/lower-confidence tier) are present **in plausible proportions** — **a 100%/0% split is a red
> flag EVEN WHEN THE TOTAL ROW COUNT EXACTLY MATCHES EXPECTATIONS.** A corrupted batch can produce a
> row count that perfectly matches the log while being **wrong in composition.**"*

**Directly applicable to `nba_score.board_scored` and to the tier split.** **Not recorded as built.**

### General verification discipline — applies to every pipeline step
- **Never accept a claimed table/column/fix location without checking it exists exactly where
  claimed** — *"a claim can be true about a DIFFERENT TABLE than your first assumption — verify the
  actual target, don't dismiss from checking the wrong place first."*
- **Wait for real propagation delays.** *"Connection-pool-fronted reads can show STALE RESULTS FOR
  SECONDS TO TENS OF SECONDS after a write"* — directly relevant, since NBA reads Postgres through
  **Hyperdrive**, which is exactly a connection-pool front.
- **Confirm an actual deploy succeeded** (check the real workflow run status) **before testing against
  a fix** — *"a correct-looking diff that NEVER ACTUALLY DEPLOYED produces a false 'still broken'
  result unrelated to the fix's real correctness."*
- **Distinguish a genuine bug from a legitimate real-world anomaly.** *"Cross-source duplicate offers,
  doubleheaders, genuine no-shows/scratches can all look like bugs at a glance and are not —
  **chasing an anomaly to a verified, correct explanation is as much a part of rigorous scrutiny as
  finding an actual bug.**"*
  **NBA analogues**: the same player appearing on PrizePicks, Underdog, Sleeper, Betr and Fliff at
  different lines; **back-to-backs**; a late scratch after the 1:15 PM PT cutoff.

---

## 7. VERIFICATION STATUS *(2026-09-20)*

| Pipeline | Verified |
|---|---|
| **P1** | Certifier run live — correctly FAILED on stale defender ratings. **⚠ Three steps dropped; loader question open (§2).** |
| **P2** | Gap audit proven on all of 2024-25 (0 missing dates/games/half-captured; 2 truncated flagged). Full run pending. **`scrape_nba_per_game_delta.py` confirmed present.** |
| **P3** | **Full chain proven on 2025-11-29** — Klay Thompson flips OUT after P2 → 3,446 teammate overrides at ~1.3 pp → his 828 legs zeroed → 58,395 legs scored → **his Overs 0.0122, Unders 0.9834** |

### The production contract the pipelines implement
From `nba_config.classification_config.production_baseline_ladder`:
- **Builder**: a **patcher** over `classification_ladder_v12.py` — *"single source of truth; anchors
  assert"*
- **Slate**: schedule games on ASOF (`status != final`; replay allows final) × **each team's roster
  from its last 3 games** — not from `nba_ref.players`, which sidesteps the new-player lag
- **`asof_lag: 0 days`** — daily-exact walk-forward; **Platt fit on the season's prior months**
- **Validated**: replay 2026-03-15 — 7 games, 194 roster rows, **173 projected players, 4,498 rows**;
  **43 roster players were DNP — "enrichment removes"**

### The pipeline-level safeguards, and the failure each answers
| Safeguard | Answers |
|---|---|
| **Delta gap audit** (P2) | a silent hole corrupts every as-of value computed after it |
| **Pre-flight completeness check** (delta worker) | *"halt and warn, don't silently proceed on an incomplete night"* |
| **Certifier per pipeline** | a pipeline that cannot fail loudly cannot run unattended |
| **P3's cutoff assertion** | scoring a slate clubs have not filed for |
| **Anchor assertions in the patcher** | a drifted patch writing silently |
| **`known_empty_games`** | three permanently-empty games re-fetched every day forever |
| **`BT_CARRY`** | **October producing ZERO projections** |

**Open before opening day:** see `NBA_OPEN_ITEMS.md` — ranked, with the Postgres-loader question first.

---

## §0z-8-T18-RETRACTION — ⚠⚠⚠ THIS SWEEP OVERCLAIMED, AND THE RETRACTION IS RECORDED, NOT EDITED AWAY
*(written 2026-09-22, ~40 minutes after §0z-8-T18 below, by the same pass, on reading further into the
same stratum. **The §0w precedent governs: a correction by this sweep is recorded in place with both
states visible.**)*

🔴🔴 **§0z-8-T18 BELOW IS HEADED *"THE TRACE THIS SWEEP RECORDED IS PROBABLY THE WRONG ONE"* AND CALLS
THE PDF-SNAPSHOT TRACE *"the weaker of two."* ***BOTH CLAIMS ARE RETRACTED.*** **The PDF-snapshot
trace is CORRECT, and the evidence that settles it was 130 lines further into the stratum this same
pass was reading.**

### ✅ WHAT SETTLES IT — *the archive measured directly, in the transcript* (`bash_tool` SEG 545/546)

The author queried the backfill's own index and shards and printed what is actually there:

| | |
|---|---|
| 2025-26 index | **7 shards** |
| shard `2025-11` | **68,447 rows · 30 game dates** |
| snapshots per game date | **min 24 · median 48 · max 48** |
| example date 2025-11-04 | **48 timestamps, EVERY ONE at `:30` past the hour**, `2025-11-03T00:30:00-05:00` → `2025-11-04T23:30:00-05:00` |
| `source_url` sample | `https://ak-static.cms.nba.com/referee/injury/injury-report_2025-11-01_12am.pdf` |

🔑🔑🔑 ***The archive is HOURLY, ON THE HALF-HOUR, IN EASTERN (`-05:00`). `14:30-05:00` — "2:30 pm ET"
— is an ORDINARY DAILY FILENAME, present on every single game date.***

⇒ **The 2026-09-09 line *"observed snapshots at 12:30 pm, 01:00 pm, 02:30 pm, 03:30 pm, 04:00 pm,
06:45 pm, 07:45 pm"* was a HAND-SAMPLE of an hourly archive, not a schedule** *(and `01:00` / `06:45`
/ `07:45` are not on the `:30` grid at all, so the sample is not even a clean subset)*. **`2:30 pm`
needed no special origin: it was simply in the sample, and the sample was in Eastern.**

### ⇒ WHAT IS WITHDRAWN, EXACTLY

| §0z-8-T18 claimed | verdict |
|---|---|
| *"the trace this sweep recorded is probably the wrong one"* | ❌ **WITHDRAWN** — the recorded trace is right |
| *"the PDF story needs both an error and an unexplained selection among seven candidates"* | ❌ **WITHDRAWN** — the seven were a sample of forty-eight, so there is no privileged selection to explain in EITHER story; *"drift"* is the whole explanation |
| *"`2:30 PM PT` is a CORRECT conversion of a NAMED CONSTANT"* | ⚠ **DOWNGRADED to a COINCIDENCE, correctly computed.** `ENRICH_CUTOFFS_LOCAL = ["13:30","17:30"]` is real in live source and `17:30 ET = 2:30 PM PT` is exact — **but a matching number is not a causal link**, and the sweep had no evidence it was one |
| the league-rule quotations, the early-tip clause, the three bulletin times, T18-9, T18-10 | ✅ **ALL STAND** — independently sourced, all still absent from the thirty before this pass |

🔑🔑 **THE METHOD FAILURE, NAMED PLAINLY**: ***an arithmetic coincidence was promoted to a causal trace,
and the promotion happened because the pass wrote at the moment it found the coincidence instead of
at the end of the stratum.*** **That is rule 12's failure — *apply a rule in the pass that writes it*
— turned on rule 25: reading in order and in full is not only about coverage, it is about not
publishing from the middle of a document.** ⚠ **And the sweep had already named this exact failure at
§0w and called it *"the exact failure rule 6 exists to prevent, committed by this sweep."* It has now
been committed twice.**

---

### 🔴🔴 AND THE FINDING THAT REPLACES IT — *the cutoff was never measured*

**The author wrote `nba/measure_report_cutoff.py` for exactly this question**, and stated its standard
in the file's own docstring:

> *"policy says the last market to file is pacific, at 1 pm pt. **but policy is not evidence — measure
> it.**… if 1 pm pt covers ~100% of games and the 13:15→14:30 churn is negligible, the earlier cutoff
> is safe and phase 2 can run 75 minutes sooner. **if not, 2:30 stays — for a reason this time, not by
> inheritance.**"*

**It measures, per game-day, from the system's own two seasons of archived snapshots**: the earliest
snapshot in which each game's teams carry a real status; the share of game-days fully covered by
**10:00 / 11:00 / 12:00 / 13:00 / 13:15 / 14:00 / 14:30 / 15:00 PT**; the status churn between 13:15
and 14:30; and the same split **by tip time, "since early tips file 8-10am local."**

🔴🔴 **IT NEVER RETURNED A RESULT IN THIS TRANSCRIPT.**

| run | outcome |
|---|---|
| `35464255049` *(the probe workflow)* | ❌ **FAILED** — `ModuleNotFoundError: No module named 'pandas'`. *The probe workflow installs only `curl_cffi`.* |
| `35464467204` *(moved into `nba-engine-test.yml`, which does install pandas; dispatched `task=cutoff`)* | ⚠ **last seen `status: "pending", conclusion: null`** — **no `tool_result` anywhere in the 860 mechanism segments reports its output.** No coverage table, no churn figure, no by-tip-time split. |

⇒ ✅ **THE 1:15 PM PT CUTOFF RESTS ON POLICY REASONING — the league rule, which is authoritative — AND
NOT ON THE MEASUREMENT ITS OWN AUTHOR BUILT TO CHECK IT.** ⚠⚠ **Stated at evidence strength: the
cutoff is NOT unfounded** *(11 a.m.–1 p.m. local is the league's own rule, quoted from four
independent results in this transcript)*. **What is missing is the author's own stated standard —
"policy is not evidence, measure it" — applied to his own conclusion.** *Open item T18-11.*

🔑 **And the early-tip clause recorded at T18-9 was NOT news to the author** — his own docstring says
*"early tips file 8-10am local"*, written before this sweep found it. **It is news to the THIRTY, which
is what the novelty probe measures and all that was ever claimed.**

---

## §0z-8-T18 — ⚠ SUPERSEDED IN PART BY THE RETRACTION ABOVE *(2026-09-22)* — the `2:30 PM PT` trace
*(T18 pass 2, mechanism strata · written 2026-09-22 · **this section corrects the SWEEP's own causal
account, not the system's** — the operational conclusion is unchanged and is reinforced)*

⚠ **What is NOT in question.** **The binding constraint is still 1:00 PM PT and the cutoff is still
1:15 PM PT.** *That is unchanged, and this section strengthens it with an external authority the
sweep did not previously hold.* **§967, §1617, `NBA_OPEN_ITEMS` §*BUG-FIXED · the 2:30 PM PT cutoff
was drift* and `NBA_MASTER_SUMMARY` 15745–15752 are all correct in their CONCLUSION.** **What this
section revises is the ORIGIN STORY those entries attach to it.**

### THE RECORDED TRACE — *what the sweep says today*

> *"2:30 PM ET is 11:30 AM PT"* — the number came from a **2026-09-09 list of observed injury-PDF
> snapshot timestamps** *(12:30 / 1:00 / **2:30** / 3:30 / 4:00 / 6:45 / 7:45 PM)* that were
> **Eastern**, and it **lost its ET label** on the way into fact 41.

⚠ **That story requires an ERROR to produce the number, and it does not explain the SELECTION**:
**seven timestamps were in that list and nothing in it privileges 2:30 over 3:30 or 6:45.**

### ✅ THE COMPETING TRACE — *read from live source, 2026-09-22, `nba/nba_asof.py` (6,295 B, 126 lines)*

```
PHASE1_CUTOFF_LOCAL  = "16:00"   # 1:00 PM PT
PHASE2_CUTOFF_LOCAL  = "17:45"   # 2:45 PM PT (the owner's pick window; after the 5:30 PM ET day-of report)
ENRICH_CUTOFFS_LOCAL = ["13:30", "17:30"]
```

🔑🔑🔑 ***`17:30 ET = 2:30 PM PT`, EXACTLY.*** **And `13:30` and `17:30` are not arbitrary: the
module's own docstring names what they are** — *"ENRICH_CUTOFFS = 13:30, 17:30, and tip-30min → the
enrichment runs."*

⇒ **`2:30 PM PT` is a CORRECT conversion of a NAMED CONSTANT that has been in the source all along.**
**No timezone error is needed to produce it.** 🔑 **And unlike a seven-item list, `ENRICH_CUTOFFS_LOCAL`
has exactly two entries — so the selection question the PDF story cannot answer, this one answers by
construction.**

### ✅ THE EXTERNAL AUTHORITY, FOUND INSIDE T18 ITSELF *(mechanism stratum, `web_search`, SEG 483/484)*

*The session ran exactly **two** `web_search` calls in 1,205 segments. This was one of them.*
⚠ **Authority named, per rule 11: this is a web-search result quoted in T18, not a primary NBA rules
document. It is recorded as such.**

> *"teams are required to submit a game-day injury report **between 11 a.m. and 1 p.m. local time**
> and **between 8 and 10 a.m. for tip-offs 5 p.m. or earlier** on game days (besides the second game
> of a back-to-back)… For the second game of a back-to-back, teams must report the same information
> **by 1 p.m. local time** on the day of the game. **The league usually issues its own reports at
> 1:30 p.m., 5:30 p.m., and 8:30 p.m.**"*

**Three things fall out, and the first two are NOT RECORDED anywhere in the thirty** *(novelty probe
2026-09-22: `8 and 10 a.m.` **0/0** · `5 p.m. or earlier` **0/0** · `1:30 p.m., 5:30` **0/0** ·
`8:30 p.m` **0/0**)*:

**1. 🔑 THE EARLY-TIP CLAUSE.** For a tip-off at **5 p.m. local or earlier**, the filing window is
**8–10 a.m. local**, not 11 a.m.–1 p.m. ⇒ **on an all-early slate every report is in by 10 a.m.
local, and the binding Pacific constraint becomes 10:00 AM PT, not 1:00 PM PT.** **The 1:15 PM PT
cutoff is therefore CORRECT but CONSERVATIVE on such slates** — it is the worst case, not the only
case. ⚠ **The back-to-back clause keeps 1 p.m. local as the floor whenever a second-night team is on
the slate**, so the general answer does not move. *Open item T18-9.*

**2. 🔑 THE LEAGUE PUBLISHES THREE BULLETINS — 1:30 / 5:30 / 8:30 p.m. ET.** In Pacific that is
**10:30 AM / 2:30 PM / 5:30 PM PT**. 🔴🔴 ***The middle one IS "2:30 PM PT."*** **And
`ENRICH_CUTOFFS_LOCAL = ["13:30", "17:30"]` is the first two of them, to the minute.** *The sweep had
recorded only the 5:30 p.m. ET bulletin, via `PHASE2_CUTOFF_LOCAL`'s comment; there are three.*

**3. ✅ THE TEAM RULE IS CONFIRMED VERBATIM, FROM TWO INDEPENDENT PLACES.** The external source says
*"11 a.m. and 1 p.m. local time"*; `nba_asof.py`'s docstring, written long before, says *"game-day
report lands 11 AM-1 PM local; B2B second-night report 1 PM local."* **The correct rule was in the
source the entire time.**

### ⇒ THE REVISED ACCOUNT — *stated at evidence strength, with both stories kept*

🔑 ***The error was almost certainly one of CATEGORY, not of TIMEZONE: a league REPUBLICATION
BULLETIN (5:30 p.m. ET = 2:30 p.m. PT, a named constant in `nba_asof.py`) was promoted to "the
day-of injury report DEADLINE" — a team filing obligation it never was.*** **Fact 41 then wrote *"the
2:30 pm PT day-of injury report"*, and facts 73, 74 and 96 cited it as established.**

⚠⚠ **BOTH TRACES ARE KEPT AND NEITHER IS DELETED** *(rule 4 — a supersession carries both dates and a
pointer to the earlier entry)*. **The PDF-snapshot trace is recorded at §967, §1617,
`NBA_OPEN_ITEMS` and `NBA_MASTER_SUMMARY` 15745–15752, dated 2026-09-19 from the transcript's own
prose; this bulletin trace is dated 2026-09-22 and rests on live source plus an external authority.**
**The sweep does not have a document in which the author states which one he meant**, so:
⚠ **NOT RECORDED: which origin the author had in mind.** *What IS verified: the arithmetic
(`17:30 ET = 2:30 PM PT`), the constant's presence in live source, the league's three bulletin times
per the quoted source, and the fact that the bulletin story needs no error while the PDF story needs
both an error and an unexplained selection among seven candidates.*

🔴 **AND THE PRACTICAL CONSEQUENCE IS THE SAME EITHER WAY, WHICH IS WHY THIS IS A TRACE CORRECTION AND
NOT A REOPENING**: **a bulletin is not a deadline.** *Waiting for the 5:30 p.m. ET republication buys
nothing a 1:00 PM PT team-filing cutoff has not already secured, and it costs three and a half
hours.* ✅ **`nba-p3-afternoon-light.yml` already encodes the corrected reasoning inline and guards it
at runtime** — *"Refusing to run for TODAY before 13:00 PT — Pacific clubs file until 1:00 PM PT"*
*(verified live, line 74, 2026-09-22)*.

---

# 🔴🔴🔴 **`standards_3pick_v1` — THE PAPER-TRADING STRATEGY, SPECIFIED END TO END** *(written 2026-09-22, T20 pass 93, §T20.98)*

> 🔑 **WHY THIS SECTION EXISTS.** *`P3` step 4b logs the night's picks and `P2` grades them the next
> morning. **That record is the evidence the owner will use to decide whether any of this works** —
> and it is the youngest thing in the system: the workflow comments date it* ***"PAPER TRADING
> (2026-09-21)"***, *after T1–T18 closed.*
> ▶ **MEASURED `2026-09-22T21:44:53Z`, tree `e7419a5390cc422e557ba98a99f2b5c1669e0c21`**: the string
> `standards_3pick_v1` appeared in **2 of the twelve**, *and both occurrences are inside one SQL
> snippet this sweep itself quoted at `§T20.94`/`§T20.97`.* **In the sweep's BASELINE tree it appears
> in none of the twelve** — *its only baseline carrier is `PP_PAYOUT_FINDINGS.md`, which belongs to
> the concurrent build session and is out of this sweep's scope.*
> ⚠⚠ **AND ONE PRIOR MUST BE QUALIFIED BEFORE THE CLAIM IS MADE (rules 26/28/51).** *`§T12.6h`
> already recorded these objects on **`2026-09-22T07:01:11–23Z`**, under the heading* ***"The
> concurrent session's new objects, verified against the live database"***, *listing*
> ***"`nba_score.paper_pick_slips(p_date, p_threshold, p_snapshot)` and `paper_pick_candidates`
> likewise; `nba_score.paper_picks` has `event_id`."*** ⇒ ***Their EXISTENCE and SIGNATURES were on
> file. What follows — what they SELECT, how they PACK, how they GRADE, and the defect in §5 — was
> not.***
> 🔑 **THE SCOPE CALL, STATED RATHER THAN DODGED**: *these functions appear to be the concurrent
> session's work, **but `P2` and `P3` call `nba_score.log_paper_picks` and `nba_score.grade_paper_picks`
> directly**, so **what the in-scope pipelines execute is in scope to document.** The build session's
> OWN artefacts are not, and are pointed at rather than reproduced — `PP_PAYOUT_FINDINGS.md`,
> `prop_universe`'s counts (**mid-rebuild, not final**) and `sim_strategy`'s replay figures (§6).*
> ⇒ ***The mechanism the system will be judged by was named but never described in any document meant
> to describe the system.***
> ⚠ **Everything below is read from `pg_get_functiondef` and the workflow files, live `2026-09-22`.
> Nothing was run and nothing was written. `nba_score.paper_picks` and `nba_score.paper_results` both
> hold `0` rows — expected, not a defect: the system has never run against a live slate (`§T20.95`).**

## 1. SELECTION — `nba_score.paper_pick_candidates(p_date, p_threshold DEFAULT 1.30, p_snapshot DEFAULT NULL)`

*Its own header: **"identical for live logging and historical replay… Writes nothing."***

| step | rule, as coded |
|---|---|
| **snapshot** | default = **the most recently fetched PrizePicks snapshot for that date** — `ORDER BY s.fetched_at DESC, s.snapshot_label DESC LIMIT 1` — i.e. *"what is on the board at logging time"* |
| **book** | 🔴 **`bookmaker = 'prizepicks'` and `app = 'prizepicks'` ONLY.** *Underdog, Sleeper, Fliff and Betr are not eligible.* |
| **line type** | **standards only** — `market_key NOT LIKE '%alternate'` |
| **prop universe** | 🔴 **a HARDCODED twelve-prop map inside the function**: `points · rebounds · assists · threes_made · pts_reb · pts_ast · reb_ast · pra · blocks · steals · stocks · turnovers` |
| **model value** | **`mv = 2 × final_hp`** — an **even-money EV proxy**, not a PrizePicks payout |
| **threshold** | `mv >= p_threshold`, default **`1.30`** ⇒ ***exactly `final_hp >= 0.65`*** |
| **one per player** | `DISTINCT ON (player) ORDER BY player, mv DESC` — **the best prop and side, one leg per player** |
| **rank** | `row_number() OVER (ORDER BY mv DESC, player)` |

## 2. PACKING — `nba_score.paper_pick_slips(...)`

*Its own header, quoted:* > ***"Greedy game-aware packing (2026-09-21): picks in rank order; each goes
into the first open slip that has no leg from its game; a new slip opens when none fits; slips close
at 3 legs. Every slip spans three DIFFERENT games (PrizePicks pays same-game slips less: a 2-pick of
opponents paid 2.9x, and same-game Flex partials are cut)."***
📌 *Slip size **`3`** is hardcoded (`cnt[i] < 3`). The rationale is the same-game correlation discount
already on file at `NBA_MULTIPLIERS.md` §0.2f.*

## 3. LOGGING — `nba_score.log_paper_picks(p_date, p_threshold DEFAULT 1.30)`

**First log wins** *(`IF EXISTS … RAISE NOTICE … RETURN 0`)*, writing `strategy, game_date, player,
prop, line, side, model_value, final_hp, pick_rank, slip_no, threshold, snapshot_label, event_id` —
under **`PRIMARY KEY (strategy, game_date, player)`**. *Full idempotency analysis at `§T20.94`.*

> 🆕 *(pass 113, `2026-10-10`)* **Two changes since this reading** — the snapshot pinned to `window` (`2026-09-23`) and any date other than today refused unless `p_force` (`2026-09-24`) — → `NBA_MASTER_SUMMARY.md` `§T26.R2`.

## 4. GRADING — `nba_score.grade_paper_picks()`, called by `P2` step 3b

Joins `nba_market.board_outcomes` on `game_date, player, line, side` with
`replace(market_key,'_alternate','')`, takes `DISTINCT ON (strategy, game_date, player)` by
`snapshot_label DESC`, and sets **`void`** on `push`/`dnp`, **`hit`** when `over_win`/`Over` or
`under_win`/`Under`, else **`miss`**. **Only rows with `result IS NULL` are touched.**

## 5. 🔴🔴 THE DEFECT THIS SPECIFICATION EXPOSES — **THE TWELVE-PROP MAP IS DUPLICATED**

***The identical `m(prop, market_key)` VALUES list is hardcoded TWICE — once in
`paper_pick_candidates` and once in `grade_paper_picks` — with no shared source.***
⇒ 🔴 **A prop added to the selector and not to the grader produces picks that are logged and can
NEVER be graded**: the grader's `JOIN m ON m.prop = p.prop` simply drops them, they keep
`result IS NULL` for ever, and — because the function only touches ungraded rows — **nothing ever
reports them as missing.** *A silent, permanent gap in the record the system is judged by.*
⚠ **Recorded, not fixed (rule 1).** 🔑 *Note the list is also exactly twelve, which is the number
`§T20.24` measured live for the archived PrizePicks board — so **`§0v.4`'s backtest scope limit
propagates unchanged into the live selection rule.***

## 6. ⚠ `NOT RECORDED` — **IS THE 3-LEG SLIP A POWER PLAY OR A FLEX?** *(rule 6)*

**Nothing in `P2`, `P3`, the four functions or the twelve says which PrizePicks product a
`standards_3pick_v1` slip represents**, and the two are not close: `NBA_MULTIPLIERS.md` §0.9b records
**Power Play 3-pick = `6×` all-or-nothing** against **Flex 3-pick = `2.25×` all, `1.25×` on 2/3**.
⚠⚠ **The only statement anywhere is OUTSIDE this sweep's scope and is hours old**: `nba_score.sim_strategy`
holds a single row, **`std3_power_130`, created `2026-09-22T07:10:13Z`**, whose params carry
`slip_type: "power"` and whose note describes *"the paper-trading standards strategy
(standards_3pick_v1) rebuilt on the prop universe."*
🔴 **This sweep does NOT adopt that row**: it postdates the sweep's baseline, it is built on
`prop_universe` — **which the owner has stated is mid-rebuild and whose counts are not final** — and
it appears to belong to the concurrent build session. **Its replay figures are deliberately not
reproduced here.** ⇒ 🔴 **OWNER DECISION: the slip type belongs in the pipeline or the config, not
only in a validation row written by another session.**

📌 **Pointers**: `§T20.94` *(idempotency, and the `p3` certifier checks)* · `NBA_RECIPE.md`
`STEP 12` row 5 *(where 4b sits in the day)* · `NBA_MULTIPLIERS.md` §0.9b *(the payout table)* and
§0.2f *(the same-game discount this packing rule implements)* · `NBA_BASELINE_CALIBRATION.md` §0v.4
*(the twelve-stat-type scope limit)*.

---

## ✅✅ **§T26.21 — THE PRESEASON DECISION IS MEASURED, NOT ASSUMED — AND THE AUTHOR CORRECTS HIS OWN FIGURE BY A FACTOR OF `23` IN THE COURSE OF TAKING IT** *(T26 seg1008, ASSISTANT OUTPUT; the evidence behind `§T26.10`)*

**`§T26.10` records the RULING — *"preseason is not a slate"*. This is the EVIDENCE under it, and it
is one measured night.**

### 🔑 **THE MEASUREMENT — `2025-10-22`, THE SEASON OPENER**

| group | players | legs | predicted | actual | gap |
|---|---|---|---|---|---|
| **with prior-season history** | **`158`** | — | `0.4451` | `0.4499` | ✅ **`−0.5` points** |
| **without** | **`1`** | **`155`** | `0.5076` | `0.6323` | 🔴 **`12.5` points** |

> ***"the shape is exactly what you suspected, **in both directions**: the no-history group **is
> genuinely mis-scored** — a 12-point calibration gap versus 0.5 points for everyone else. the model
> has nothing to anchor them to. **but the group is tiny**: one player out of 159 on that night, 155
> legs out of 29,395 — **about 0.5% of legs**."***

🆕 *(additional sweep `8`, pass 498, `§P498` T26 01:03Z–01:09Z, AS STATED)* The five-date sample behind "swung on five dates", which the §T26.20 retraction names but this entry did not tabulate. The sample as first built: **24,849 legs across 291 players and 5 dates**, overall calibration **0.4459 predicted against 0.4578 actual** — well calibrated in aggregate. A first bucket looked wrong — **26% of legs in "0 games in the prior 30 days"**, implausible mid-season — and was an artefact, not a defect: one sample date was 2025-10-22, the season's second day, when nobody has 30-day history, so the bucket measured "early season", not "unknown player" (the formats matched and all 24,849 rows joined). The per-date gap (predicted − actual), prior-season players against no-prior-season players: 2025-10-22 −0.002 (6,372 legs) vs −0.102 (37 legs); 2025-11-19 −0.017 (5,446) vs −0.009 (419); 2025-12-17 −0.022 (1,303) vs +0.098 (54); 2026-02-25 −0.001 (3,553) vs −0.169 (227); 2026-03-25 −0.016 (6,916) vs −0.012 (522). The no-history gaps "swing wildly in both directions — −10, +10, −17 points" while their mean confidence is the same as everyone's, **0.94–0.96**: "the model is exactly as confident about players it knows nothing about." That was the T26 01:05Z conclusion (f_depth measures rung distance, not evidence depth); the both-direction swings were then read as variance, not bias, and the 307,000-leg test of §T26.20 retracted the defect. The 14,878-of-128,927-leg (11.5%) and 43-of-308-player figures quoted at 00:45Z were the join-inflated share corrected above, and the 18,050,652-row figure at 03:27Z is the mid-write progress of the final_hp restore whose completion test is 19,611,626.

### ⚠⚠⚠ **AND THE SELF-CORRECTION, WHICH IS THE ENTRY'S REAL VALUE**

> 🔑🔑🔑 ***"my earlier two-week figure of **11.5%** was **inflated by the broken id join**."***

**`11.5%` → `0.5%` — the earlier figure was `23×` too large, and the cause was a JOIN DEFECT, not a
sampling difference.** ⚠ **A `11.5%` mis-scored share is a season-critical gap that justifies building
a preseason pipeline. A `0.5%` share is a rounding error that cannot.** ⇒ ***The broken join was, on
its own, nearly enough to commission an entire data pipeline the system does not need.***
🔑 **`RULE 61`'s neighbour: a figure derived over a broken join is a claim about the JOIN.**

### ✅ **THE DECISION, AND ITS COST/BENEFIT STATED EXPLICITLY**

> ***"don't process preseason into the projection pipeline. it would add a volatile input to fix
> roughly half a percent of legs, **using exactly the statistics (minutes, volume) that the research
> says don't transfer**. **the cost is contamination risk across 99.5% of the board to maybe improve
> 0.5%.**"***

*External evidence cited in support:* ***"preseason volume and minutes don't persist, rotations are
chaotic, stars rest — only rate stats like three-point attempt rate carry into the season."***

### 🔑🔑 **BUT THE DECISION IS SPLIT, NOT BLANKET — AND THE SPLIT IS THE DESIGN**

> ***"what preseason is genuinely worth using for — and this matches your instinct — is **the board
> side**: prizepicks posts preseason lines, and those teach us **multiplier structure, tier behaviour
> and line-setting**, with **zero contamination risk, because none of it touches player
> statistics**."***

⇒ ✅ **PRESEASON IS REJECTED AS A PLAYER-STATISTICS SOURCE AND ACCEPTED AS A MARKET-STRUCTURE
SOURCE.** ⚠ **`§T26.10`'s gating implements the first half.** 🔴 **Whether anything implements the
second half — preseason board capture for multiplier/tier learning — is NOT RECORDED** *(`RULE 6`)*,
**and preseason opens `2026-10-03`, eight days from this entry.**

📌 **Read with `§T26.20`**, *which closes the same thread from the opposite side: the one plausible
reason to want preseason player data was pricing unknown players better, and at `307,000` legs unknown
players price out correctly already.*

---

## 🔑🔑🔑 **§T25.2 — THE OWNER SETS THE BUILD ORDER: COVERAGE FIRST, SELECTION SECOND — AND EXPLICITLY DEFERS PROFITABILITY** *(T25 seg183, OWNER SAID, 2026-09-22; `0` of the twelve before this entry)*

> 🔑🔑🔑 ***"yeah, you don't even need to worry about **break even and profit and these kind of things
> yet**. it's just **create the structure so we can work with the most prop lines**. and after that,
> we're going to work on **which leg has edge, which leg has not**. so it's just **to have the most
> possible prop lines workable**, with a **simulation for all the two months of data that you have,
> and multipliers.**"***

### ✅ **THIS IS A SEQUENCING DECISION, AND IT RESOLVES AN AMBIGUITY THE CORPUS CARRIES THROUGHOUT**

| phase | the owner's words | state |
|---|---|---|
| **1 · COVERAGE** | *"create the structure so we can work with the most prop lines"* | 🔑 **THE CURRENT PHASE** |
| **2 · SELECTION** | *"which leg has edge, which leg has not"* | ⏳ **explicitly AFTER** |
| **3 · PROFITABILITY** | *"break even and profit… **not yet**"* | ⏳ **explicitly DEFERRED** |

⚠⚠ **READ EVERY OPEN ITEM AGAINST THIS ORDER.** *The corpus contains numerous findings phrased as
edge-quality or profitability concerns. **By the owner's own sequencing they are not yet due** — and an
item deferred by the owner is not an item the sweep should escalate as season-critical.*

### 🔑 **AND IT IS THE SAME PRINCIPLE THAT DECIDED THE BASELINE'S WIDTH, ONE LEVEL UP**

📌 **`prune_baseline_to_board.py` states the coverage-first rule for the BASELINE**: ***"DAY-OF the
baseline is the full spectrum — it is built before anyone knows which lines the apps will post, and
**its width is what lets the scorer hit the exact rung**."*** ⇒ ***Widest possible coverage while the
answer is unknown, narrowed to what was actually offered once it is known*** *(`§T26.15`'s
board-scoping, and the retention rule).* 🔑 **The owner's instruction is that same shape applied to the
PRODUCT: get every line workable first; judge which ones are worth taking second.**

⚠ **SCOPE NOTE.** *The prop-universe pricing work this directive launched — goblin/demon floors,
alternate-line spacing, void reversion and the slip simulator's payout schedules — **belongs to
`nba/PP_PAYOUT_FINDINGS.md` and the PrizePicks objects, which are outside these twelve documents by
standing constraint.*** 🔑 **Recorded here is the DIRECTIVE and its consequence for how the twelve rank
their own open items — not the payout content.**

---

## 🔑🔑🔑 **§T26.27 — THE ARCHITECTURAL CHARTER IN THE OWNER'S OWN WORDS: WHAT P2 AND P3 EACH SCOPE, WHY *ALL PROPS STAY*, AND THE ONE PRINCIPLE THAT RESOLVES "STORE EVERYTHING" AGAINST "ONE SET PER DAY"** *(T26 seg340 · seg870 · seg952, OWNER SAID; the code comments cite these decisions, the twelve never quoted them)*

*`§T26.15` attributes board-scoping to an **"owner decision 2026-09-24"** and `build_final_hp.py` cites
it by date. **Here is the decision itself**, and it is more precise than the comment that cites it.*

### ① 🔑 **THE SCOPING RULE — P2 IS FULL SPECTRUM, P3 IS THE BOARD** *(seg952)*

> ***"one thing that you need to look on the p3 logic is that **board scope** — so **only legs that are
> on the board**. we don't calculate everything differently than p2. **p2 is NOT a board scope. it's
> the FULL SPECTRUM of the baseline**, and of course it is mining logs and splits and more factors. so
> **the recalculation on p2 should reflect just the players that have NEW DATA — not all the players,
> because if it's doing all the players is wrong, that's wasting time.** and for p3, board scope.
> **for now the only board that we're gonna have is probably prizepicks.**"***

| | scope | axis |
|---|---|---|
| **P2** | ✅ **full spectrum of the baseline** | 🔑 **narrowed by PLAYER — only those with new data** |
| **P3** | ✅ **the board only** | 🔑 **narrowed by LEG — only lines an app offered** |

🔑🔑 ***TWO DIFFERENT NARROWINGS ON TWO DIFFERENT AXES, AND CONFLATING THEM IS THE ERROR THE OWNER IS
HEADING OFF.*** ✅ *This is exactly what `prune_baseline_to_board.py` and `build_final_hp.py`
implement — the baseline stays wide, the scoring store is the board — and `§T26.15` measures the
result.*

### ② 🔴🔴 **"ALL PROPS STAY, NO EXCEPTION" — AND IT IS A RULING ABOUT THE FUTURE, NOT THE PRESENT** *(seg870)*

> 🔑🔑🔑 ***"the period props are not gonna show up right now, **but they will show up when the season
> starts**. so yes, it's needed. it IS needed. **same for fantasy score.** there are many prop lines
> that are not gonna be showing right now, but once the season really starts, they are gonna start
> showing up. **SO ALL PROPS STAY, NO EXCEPTION.**"***

⚠⚠ **THIS ANSWERS A QUESTION THE CODE WOULD OTHERWISE DECIDE BY ACCIDENT.** *Off-season there is no
board, so a board-scoped rule applied naively would delete the period props and `fantasy_score`
permanently — **and they are precisely the props that reappear when the season starts.***

✅✅ **AND THE CODE HONOURS IT, IN THE RIGHT PLACE:**

| store | behaviour with no board | correct? |
|---|---|---|
| `baseline_history` *(the ingredient)* | 🔑 ***"a prop with no board of any kind (historically the PERIOD props) **keeps its full ladder**: it is the raw material the derivation will run on"*** | ✅ **KEEPS** |
| `final_hp` *(the product)* | ***"an empty result means NO board carried this prop… so the correct content of `final_hp` for it is NOTHING"*** ⇒ `DELETE`s the slice | ✅ **CLEARS** |

⇒ ***"All props stay" is satisfied by keeping them in the INGREDIENT while clearing them from the
PRODUCT.*** 🔑 **A reader who sees `final_hp` drop from `30` props to `21` (`§T26.15`) and concludes
props were abandoned has read the product for the pantry.** 📌 *`§T25.3` measures the same boundary
from the prop-universe side: `8` simulated props, `578,832` legs, all retained.*

### ③ 🔑🔑 **"EVERYTHING MINED MUST BE STORED" — AND WHY THAT IS NOT A CONTRADICTION OF THE RETENTION RULE** *(seg340)*

> ***"everything that's mined, **every single factor needs to be saved, needs to be stored**. so all the
> app boards, all market, all the individual factors must be stored. **so we don't need to be
> backfilling it, because we will have it every day.** one more thing is **each one of the individual
> factors needs to have a FALLBACK**… research online, look at the documentation, debug the system,
> look at the data, **no guessing**."***

⚠⚠ **READ FLAT, THIS CONTRADICTS `§T26.7`** — *"one set of data per day, board-scoped after the day",
the rule under which `final_hp` fell `62.5%` and `baseline_history` was pruned.* 🔴 **One directive says
KEEP EVERYTHING; the other DELETES most of it.**

✅✅ **THE RESOLUTION IS A DISTINCTION BETWEEN WHAT CAN BE REBUILT AND WHAT CANNOT:**

| | can it be re-obtained? | rule |
|---|---|---|
| 🔴 **INGREDIENTS** — *app boards, market prices, mined factors, the day's observations* | ❌ **NO** — *a board that was posted and not captured is gone forever; `D1` crew assignments are explicitly **"never archived"*** | 🔑 **seg340: store every one, every day** |
| ✅ **PRODUCTS** — *baselines, ladders, `final_hp`, scores* | ✅ **YES** — *recomputable from the ingredients whenever wanted* | 🔑 **`§T26.7`: one set per day, overwrite, board-scope after** |

⇒ ***The two directives do not conflict: they apply to opposite sides of the same pipeline.*** 🔑 **And
it explains the retention rule's shape — the rule prunes PRODUCTS and never touches a captured board.**
⚠⚠ **THIS PRINCIPLE IS NOT STATED IN ANY OF THE TWELVE** *(it is written down only in
`nba/PP_PAYOUT_FINDINGS.md`, which is outside this sweep's scope)* — **so it is recorded here, in the
owner's own terms, because every retention question in the corpus turns on it.**

### ④ ⚠ **AND A PRESEASON INSTRUCTION THAT IS NARROWER THAN THE DECISION TAKEN** *(seg952)*

> ***"the preseason should NOT really mix with the full season, so the preseason games **should be
> SEPARATE**, and **should affect and be usable only for the BEGINNING of the season, to give it some
> backing, some more information**."***

⚠⚠ **NOTE WHAT THIS DOES AND DOES NOT SAY.** *The owner asks for **separation**, not exclusion — and
for limited early-season use.* 🔑 **`§T26.10` gates preseason OUT of the slate and `§T26.21` rules it
out of the projection pipeline entirely, on measured evidence** *(`0.5%` of legs, and the statistics
that would carry — minutes, volume — are the ones research says don't transfer)*. ✅ **That is a
STRONGER conclusion than the owner asked for, reached by measurement**, *and the owner authorised
exactly that at seg982:* ***"keep researching online, understanding if there is any useful point on
really processing the preseason. **I don't even care about it. Just if it adds up. If it doesn't add,
then don't worry about preseason.**"*** ⇒ ✅ **NO CONFLICT — the delegation covers it.** 📌 *But
`§T26.21`'s accepted half — preseason as a BOARD/market-structure source — is the part seg952 also
asks for, and it remains **NOT RECORDED as implemented** with preseason `8` days out.*

---

## 🔴🔴🔴 **§T26.45 — `nba_market.board_rung_keys` IS A HARD CROSS-PIPELINE DEPENDENCY — P3 PRODUCES IT, THREE SCRIPTS IN P2's PATH *ABORT* WITHOUT IT, AND IT IS NAMED IN `0` OF THE TWELVE** *(source reads + `SELECT` 2026-09-25)*

**`§T26.15` records `board_rung_keys` as the source of `final_hp`'s board scope. What no document
records is that it is a SINGLE POINT OF FAILURE SPANNING TWO PIPELINES.**

### 🔴 **THE DEPENDENCY, TRACED**

| | |
|---|---|
| **THE PRODUCER — one, and it is in P3** | `nba-p3-afternoon-light.yml:313` calls `` SELECT nba_market.refresh_board_rung_keys(d, d) ``, looping over `` SELECT DISTINCT game_date FROM nba_market.board_snapshots WHERE fetched_at > now() - interval '6 hours' `` |
| 🔴 **CONSUMERS THAT HARD-ABORT** | `build_final_hp.py:142` *(**P2 step 6b**)* · `load_baseline_history.py:74` · `prune_baseline_to_board.py:91` *(**P2**)* |
| **the abort** | `` raise SystemExit("ABORT: nba_market.board_rung_keys is empty for this scope — refresh it first") `` |
| **live state** | **`4,522,732` rows · `379` dates · `2024-10-22` → `2026-04-12` · `1` period (`FULL`)** |

### ⚠⚠ **THE ORDERING CONSEQUENCE, WHICH NOTHING STATES**

**P3 runs at `13:15` PT. P2 runs at `08:45` PT the NEXT morning** *(`§T26.26`)*. ⇒ ***P2's `final_hp`
build, its prune and the history loader all consume keys that P3 wrote the previous afternoon.***

🔴🔴 **SO A P3 FAILURE ON DAY `N−1` STOPS THREE P2 STEPS ON DAY `N`** — *and `build_final_hp` is the
step that `§4b` was reopened to give P2 in the first place.* ✅ **The failure is LOUD** *(`SystemExit`,
not a silent zero)* — **which is the right design and deserves saying**, given how much of this corpus
is the opposite. ⚠ **But it is a coupling a reader of the twelve cannot discover**: *`P2 → P3` is
documented as a one-way daily sequence; **this is a `P3 → P2` edge running backwards across the day
boundary**.*

⚠ **AND THE REFRESH WINDOW IS NARROW**: *the producer only refreshes dates whose boards were archived
in the **last `6` hours**.* ⇒ ***A P3 re-run later than that refreshes NOTHING*** — *the keys are not
rebuilt from the archive, only from what was just fetched.* 🔑 **A recovery path that re-runs P3 the
next day does not repair the missing keys, and the three consumers keep aborting.** 🔴 **NOT
DIAGNOSED whether `refresh_board_rung_keys(lo, hi)` called with an explicit range fixes it** — *it
takes two date arguments, so it very likely does, but **this sweep did not run it** (`RULE 6`,
read-only).* 📌 **That is the first thing to establish before opening night, because it is the recovery
procedure for the whole board-scoped chain.**

### ⚠ **AND IT IS `FULL`-PERIOD ONLY**

*`count(DISTINCT period) = 1`.* 🔑 **`build_final_hp` filters `period = 'FULL'` and is therefore
consistent** *(`§T26.17`)* — ⚠ **but `§T26.19` established that the period props now DO reach
`baseline_history` (`4,285,633` rows across `Q1`/`Q4`/`H1`/`H2`)**, *and the owner ruled at `§T26.27`
that **"ALL PROPS STAY, NO EXCEPTION"** because period props return when the season starts.*
🔴 **So when period props appear on real boards, `board_rung_keys` as currently built has no row for
them, and every board-scoped consumer will treat them as off-board.** **NOT RECORDED whether
`refresh_board_rung_keys` populates period rows when they exist** *(the column is there; the data is
not, because no board has carried them yet).*

### 📌 **TWO MORE ARTEFACTS AT `0` OF THE TWELVE, FOUND THE SAME WAY**

| artefact | what it does | why it matters |
|---|---|---|
| **`nba/load_injury_report.py`** + `.github/workflows/nba-injury-load.yml` | loads the injury file into `nba_daily.injury_report_snapshots` | 🔴 **the freshness check rates that table `BINDING`** *(`§T26.43`)*, and `§T26.30` shows the availability delta now reads it instead of HTTP shards — *"the loader the mining doc specified and nobody built"* |
| **`nba/verify_static_loads.py`** | verifies P1's static loads landed | *the direct answer to `§T26.28`'s class — P1 scraping and not committing* |

🔑 **All three are the `F5-1` class** *(`"7` of `21` workers + `27` scripts are named in `0` of the
twelve")* — ⚠ **but these were built on `2026-09-23`–`25` and are load-bearing TODAY**, *so they are
not backlog: they are the newest and least-documented parts of the critical path.*

---

## 🆕 §T32.7 — **P3's "COMMIT DAY-OF DATA" STEP: A CONCURRENCY FAILURE FOUND BY RUNNING IT, FIXED, AND LATER RE-FIXED** *(source `T32`, `2026-09-28 05:40–05:49Z`, recovered transcript; live-verified `2026-10-10`)*

**How it was found**: asked *"p1, p2, p3 and 5/6 board scrapers are complete and ready for all system steps, correct?"*, the build chat **ran P3 by hand instead of asserting it**. Preseason, so `games == 0` → capture + archive only, scoring skipped by design. **P3 failed at its last step**: the Betr and Underdog scrapers had pushed board files moments earlier, and the step's bare `git rebase` halted on a conflict in `underdog_nba_current_meta.json`.

**The `T32` fix**: `git rebase -X theirs origin/main`, on conflict abort and `git merge -X theirs`, `6` retries, and **a warning, not a failure, if every retry loses** — *the data is already in Postgres; the board files refresh on the next run.* Re-run green: *"Pipeline certified. 2/2 checks passed."*

⚠ **SUPERSEDED `2026-10-08` (round-2 certification, P3 #15)** — ✅ live `nba-p3-afternoon-light.yml:493–499`: every pipeline now pushes through **one shared helper, `nba/git_push_retry.sh`**, and the step's comment records a correction to the `T32` version: *its comment "claimed the remote's capture wins while `rebase -X theirs` actually kept THIS run's files (the replayed commit is 'theirs' during a rebase)"*. The failure policy is unchanged — **a push that cannot land is still a warning.** *(The round-2 audit itself is `T42`/`T43` material.)*

🔑 **Design point this preserves**: in this system **Postgres is the store of record and the committed board JSON is a convenience copy** — which is why losing a push race is allowed to warn rather than fail the pipeline.

---

## 🆕 §T34.7 — **THE SLIP SYSTEM AS DESIGNED AT `T34`'S CLOSE: CERTIFY → BUILD → VALIDATE → PLAY ON PAPER → REQUALIFY WEEKLY** *(source `T34`, `2026-09-30 → 10-01`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§24`–`§29c`; ✅ = live `2026-10-10`; later transcripts change parts of this — not pulled backward, RULE 6)*

**The owner's design order (`T34`, verbatim)**: candidates first (*"we are not building slips yet"*, `T33`), then *"apply all the signals and layers over all candidates"*, then *"at least 3 consecutive clean passes on each micro step … to have it properly certified and we can move to the next phase"*, then slips (*"Many building slips strategies should qualify and we will move for gates and hurdles after that"*), then the MLB gates (*"This is what validates the slip strategy"*), then *"a completely automated engine that is going to increment every day results there, make the adjustments in all steps and auto adjust the slip strategies automatically"*.

**1 — Certification as a design element** (`§24`, `§26a`): *"Nine of the eleven defects found in §19–§23 were one failure class (a join or key silently returning fewer/wrong rows while the downstream number looked plausible), so certification was built as reconciliation between layers plus explicit assertions, not inspection."* A **frozen** invariant list (L0 raw board → L1 outcome → L2 price → L3 tier → L4 ranks → L5 map → L6 bands → L7 features → L8 matrix → L9 certified ledger → L10 external facts → L11 slips); **certified = three consecutive runs, all PASS, no code change between them**; certified v1 (`52`), v2 (`54`), v3 (`66`), v4 (capped slips). 🔑 **The `§24b` lesson, made a rule**: *"internal consistency is necessary … but the two things it missed were both external facts the numbers rest on … any future phase must add its own external-fact checks, not just internal recomputes."*

**2 — Slip-building rules** (`§25`–`§28i`, the standing set): `≥ 2` teams · no player twice · **no teammate same-game pair** (V6) · **no pair with outcome correlation `≤ −0.08`** (pair-level map from real outcomes, `≥ 100` pairs per type; positive pairs allowed — *"positive correlation is free value the app does not price, and negative correlation is a hidden tax"*) · **`≤ 2` legs per cell family** · cross-game first in the ordering · payout by the compression rule · **cap 3 for 5-Flex and 3-Power, cap 1 otherwise**, fixed before looking at OOS · **shrink, never substitute** · `final7` (the last 7 days of a season) excluded. 🆕 *(pass 5, `2026-10-10`, strategy `§25c`, AS STATED)* **The correlation rule's first form was stricter**: `§25c` measured on 2025-26 that slips with two legs from the same game paid less than cross-game ones even with leg-level covariance `≈ 0` (`§15c`) — core 5-Flex **`+73%` same-game vs `+100%` cross-game, `+56%` same-team**, a `20–27`-point gap in four of six compositions; *"A Flex slip is a count of hits, and two legs sharing a game move the count together"* ⇒ rule **"one leg per game (and per team) in every slip"**. The owner's *"be sure your correlation tiles are not too tight"* (`2026-09-30 19:55Z`) led `§25d` to the pair-level map above, which forbids only the negative pairs. `§25c` also showed **the daily cap scales** (core 5-Flex `+78…+91%` from 1 to 10 slips a day, net `146 → 1,254` units; core 3-Power peaks at cap 3, `+92%`).

**3 — Qualification = the MLB bar translated** (`§28g`, supersedes `§27a–c`): Q1 select on `2024-25`, score on untouched `2025-26` · Q2 OOS `95%` day-blocked bootstrap lower bound `> 0` (`10,000` resamples, **whole days, never legs** — *"effective sample = DAYS, not slips"*, `T33`) · Q3 positive with teammate same-game slips removed · Q4 survivors exceed the **whole-board tier-rate null** (`0` in `100` draws) · Q5 no single cell `> 60%` of OOS profit unless declared as that cell's family · Q6 cap fixed by structure before OOS. **Sizing (G5)**: bankroll `≥ 2 ×` worst-season max drawdown `+ 1 u`. Result at close: **three families** — **A** steals-anchored Regular (`20` of `30` survive capped), **B** demon-only, **C** Regular without steals (anchor moves to turnovers) — *"a ranked ladder of defensive cells … the edge degrades gracefully down it"*, with **steals_R named as the single point of failure of family A**.

**4 — P4, the daily live engine** (`§29a`): PICK after P3 has scored and archived the window board → one slip set per active strategy at its live cap → `live_slips` / `live_pool`; GRADE after P2 has graded yesterday → ledger → hurdle machine → `live_strategy_state`. **Walk-forward by construction**; regular-season slates only, gated through `nba_calendar.games` (`game_label`) — the same source as P3's slate gate. The eight live strategies: `A_wsteals_5flex` (cap 3) · `A_core_5flex` (3) · `A_regular_5power` (1) · `A_wrebounds_4flex` (1) · `A_core_3power` (3) · `B_demon_5flex` (3) · `B_demon_3flex` (1) · `C_wstocks_4flex` (1).
**The hurdle machine after the perfection pass** (`§29c`): H1 **CUSUM on the chronological leg stream** (`k = 0.015`, `h` calibrated so the backtest's own stream alarms at most once per season; yellow at `0.75 h`, red at `h`) · H2 drawdown yellow `0.8 × MC95`, red `MC95` (Monte-Carlo, *"the historical max drawdown is one ordering of the trades"*) · H3 streak yellow `MC95`, red `MC99` · H4 14-day pool below the per-strategy floor (`8` Regular, `4` demon) · H5 first 21 days: reds downgraded · H6 final 7 days: off · **H7 portfolio hurdle** — one CUSUM on the pooled live steals legs across all family-A strategies (*"an H7 red is an edge failure: no grace"*) · **grace**: a red from drawdown/streak alone enters `critical` (cap 1) for 7 days from the episode start · **paper gate**: `≥ 50` slate days **and cap × 50 slips** **and** the live bootstrap lower bound `> 0` → `active` · an `off` strategy rolls to `paper` at the next season · **P5 PASS is the only path out of red**.
**5 — P5, the weekly requalification** (`§29b`): map + bands → candidate certifier → capped engine → **frozen certification (any FAIL stops the loop; nothing downstream runs on an uncertified chain)** → walk-forward validation → verdict per live strategy (`weekly_requal`). ***"What the automation does not do, by design: stake money; add or replace strategies; override a red; or run during preseason or the final week."*** One dated design item: once the live season has `≥ 40` slate days the validator's selection window must **roll** (select on everything before the last N days, test on the last N) — *"a reviewed change … not something to guess at now"* → `NBA_OPEN_ITEMS.md` `T34-5`.
✅ **Live `2026-10-10`**: `13` strategies in `live_strategy_state`, all `paper`; `live_slips` empty; P4 dispatch-only, P5 `workflow_call` + dispatch (`NBA_WORKERS.md` `§T34.4`).

---

## 🆕 §T35.7 — **THE SLIP SYSTEM AFTER `T35` (`2026-10-01`): THE DAY IS THE UNIT, DELTA MODE, NO SEPARATE SCHEDULES, SHADOW SLIPS, ONE SLIP STAKED ONCE** *(source `T35`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§29d`–`§29n` (passes 1–23) and `§29g`–`§29k`; ✅ = live `2026-10-10`; supersedes the parts of `§T34.7` named below — `§T34.7` is kept, RULE 40)*

**1 — The day is the only independent unit** (`§29g`). A day's defensive legs are the same 2–3 players across every slip (*"22 legs are 2–3 independent trials"*), so every leg-level test over-states its precision `~10×`. ⇒ **H1 and H7 are day-blocked z-tests** (trailing-14-slate-day mean of the daily hit vs the calibrated mean, in units of the backtest's own `sd_daily_hit`; yellow `z > 2`, red `z > 3`) — **superseding `§T34.7`'s CUSUM H1**. Simulated on the real pooled stream: `5–6` yellow days a season, `0` reds, `0` healthy weeks stopped. Two rule fixes: an H7 yellow **merges** with H1 yellow on family A (they are one signal there); **a red is sticky in every branch until P5's weekly PASS**. *A trailing test cannot see the first bad thing* — week 2 is handled by calendar, not detector.
**2 — Shadow slips** (`§29j`): a red (cap-0) strategy still builds its slips as `placed_shadow` → `graded_shadow` — never staked, never in net / drawdown / streak / paper gate — so its detector window keeps rolling and P5's PASS can stick. *"The shadow record is also the direct measure of what a stop cost."* (Fixes a **stop/restart deadlock**: a stopped strategy could not accumulate the clean days that would release it.)
**3 — Delta mode** (owner `18:35Z`, `§29h`): **exact and cumulative** — two seasons, then day 1 on top, then day 2 on top of that. P4 is delta by construction. P5 is delta where delta is exact (tier-map legs: `n_rank` per day; slip engine: per-day slips with phase bounds and the correlation map recomputed over the whole history) and **full where full is the exact form** (bands, certifier, invariants, validations — *"a bootstrap that only resampled the new day wouldn't be a bootstrap"*). Proven identical on `13,484` slips / `51,396` legs. **Precision split**: weekly `2,000` resamples / `30` nulls; full `10,000` / `100` monthly or after a model change. **The one stated caveat**: a historical rebuild re-scores past days with the final as-of calibration, so it is not bit-identical to what the live board saw — *"the live row is the true record."*
**4 — No separate schedules** (owner `19:44Z`, `§29i`): **pick = P3's final step** (on P3's resolved slate, gated by P3's `has_games`, which excludes preseason; the engine re-checks `board_scored`, `final_hp` and the priced window legs before building) · **grade = P2's final step** (before the afternoon pick, so states are current) · **requalification = P1's final job** (`needs: weekly`, `workflow_call`). P4/P5 workflows = manual entries only. ✅ Live: P5 called from P1; pick in P3; ⚠ grade now in `nba-p2a-results.yml` (P2 later split — RULE 6).
**5 — One slip, staked once** (`§29k` pass 14): an identical slip built by a second strategy the same day is recorded as **`dup`** and never staked (the paper gate counts dups toward the minimum). Deduplicated, max drawdown `188 → 129` for `14%` less net.
**6 — Families made true** (`§29k` pass 16): every non-A family builds from a pool with the steals cells removed (`EXCLUDE_BY_FAMILY`), and `calibrate` reads family C's statistics from the `_nosteals` table — *"the independence claim is now true in what is staked, which is the only place it matters."*
**7 — Structural drought rules in place by pass 23** (*"none of it predicts a drought; all of it is the portfolio being built better"*): `SE_DIVERSIFY` (≥ 4 cell families per 5-pick on broad boards) · **demon 5-Flex cap 6** · dedupe · weighted:steals cap 6 with core 5-Flex retired (~~*proposed; "goes into the validation chain"*~~ 🆕 *pass 14, `2026-10-10`: **applied the same night** — closing reply `22:33Z`: "Applied just now, as reviewed edits: demon 5-Flex cap 6, weighted-steals cap 6, core 5-Flex retired to shadow, diversify on by default"; ✅ code: `live_slip_engine.py:59` `A_wsteals_5flex` cap `6`, `:60` `A_core_5flex` cap `0` "RETIRED … kept for its shadow record", `:64` `B_demon_5flex` cap `6`*) · **small slates (≤ 4 games) at cap 1** · **week 2**: skip by calendar (`§29d`) → paper record built from the **steals-excluded pool** with a **low-event tilt** (`§29l`, pass 22) · **week 1 Over tilt** (pass 20) · final week off. *What became of each in the next transcript is `T36`'s.*
**8 — The owner's standard for "done" on droughts** (`21:33Z` — ~~*pass 24 note: these three owner messages, `21:33Z` / `21:48Z` / `22:36Z`, are of `2026-10-01` and sit in `T35`'s transcript; they govern `T36`'s passes*~~ *pass 28: that note is struck — this item belongs to `§T35.7`, where its `T35` attribution was right; pass 24 had misread it as `§T36.7`*): *"3 dry consecutive runs, as is nothing different to test or try"*; and the identification condition (`21:48Z`): a rotation must be **identifiable at the time**, *"not just because last season was bad."* The build chat met three dry drought passes at 21–23 (`§29n`) — and the owner kept it open (`22:36Z`: *"Leave it open as well and keep researching"*). ~~🆕 *(pass 21, `2026-10-10`, from `T36`'s Gemini consultations)* **The rotation's EXIT is a stated limitation** (pass 35):~~ *(pass 28: the struck pass-21 text below is `T36`'s and was placed in `T35`'s section against RULE 6 — it now stands in `§T36.7`)* ~~ Gemini was asked for an exit rule that releases on the first day of a recovery without re-entering on one isolated good day; tested, it *"released on a strong day and re-entered on the next 0/22 day, leaving the recovery days rotated exactly as before. The rotation's exit stays a stated limitation: it misses some of the steals-driven recovery days, and nothing from this pass improves it."* The same pass tested the **game total** from the DFS correlation literature — *"dry on both sides with the seasons disagreeing where it looked like anything."*~~

---

## 🆕 §T36.7 — **THE PRIZEPICKS ENGINE AT LAUNCH-READY (`2026-10-03`): A RANKING KEY, STATES WITH PLANS, LEG FILTERS, A DAILY CEILING** *(source `T36`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§29n` passes 24–70, `§29o`–`§29y`; ✅ = live `2026-10-10`; supersedes the week-2 and rotation parts of `§T35.7` #7 — kept, RULE 40)*

**The owner's design principle for bad stretches (`01:08Z`, `01:16Z`)**: *"do not force skipping, but identify if it is playable or not, different strategies, different structure, different prop lines, including week 2 … turn the losing dates into less loss or even small profits."* And the standard for a clean pass (`01:04Z`): *"A clean pass is when online research and Gemini insight are completely exhausted and do not return anything useful back."*

**The rule stack at launch** (eleven daily rules in one pick; build chat's count, pass 75):
| layer | rule | grounding |
|---|---|---|
| **ranking key** | **`SE_LOWFOUL`** — among slips of equal tier/edge, prefer more legs on players under **1.8** fouls/game (trailing 20, computed live at pick time); size ≥ 4 only | a **step** at 1.8; holds within every position and both minutes groups on the Over side; family A long droughts `−7% → +40–46%` (`§29r`) |
| **calendar state — week 1** | Over tilt on the defensive cells | week-1 Overs `74%` (both seasons) |
| **calendar state — week 2** | **signal-gated**: if the week-1 league steals+turnovers spike `≥ +3%`, play the low-event structure (steals-excluded pool, 2+ low-event Unders, cap 1); else a normal week at cap 1 | `+6.1%` / `+8.5%` spikes preceded both troughs; backtest `+137% / +138%`; replay #5 `+53%` |
| **calendar state — pre-break week** | **plan B** (only the three short steals-free plays positive both seasons: steals-free core 3-Power, demon 3-Flex, core+demon 3-Power) — `LS_ALLSTAR_PLAN` B/C/A/D | `§29u`; *"known a season ahead, so they are planned for, not detected"* |
| **calendar state — final week** | off (`final7`) | — |
| **calendar — late March** | cap raise 6 → 9 on full-cap active strategies (*"late-March raise"*) | weeks 22–24 the season's best |
| **drought state** | **rotation** — EWMA (λ `0.15`) of the daily steals **or** turnovers cell hit below `0.50` → family A builds steals-excluded; `R_stocks_4power` stakes; a full-pool **shadow** slip keeps the steals cell observed so the state can release | `§29p`, `§29t` |
| **slate size** | `≤ 4` games → cap 1 | `§29n` — the one day-level drought symptom |
| 🆕 **holiday caution** *(pass 14, `2026-10-10`)* | **New Year's Eve and MLK Day (third Monday of January) → every strategy at cap 1** | pass 59: both lost in both seasons (`−8 / −15`, `−9 / −10` u); *"two observations each is thin, but a cap-1 day is cheap if it's noise"*; Black Friday won both, Christmas flips — ✅ `live_slip_engine.py:598–603` |
| **leg filters** | steals Unders only at the **0.5** line; points Unders only at lines **`≤ 22.5`** (stars play through everything); `D_points_3power` Under-only | passes 45, 70, 34 |
| **portfolio** | dedupe; **`LIVE_MAX_DAILY_STAKE` 36** units across all strategies (Gemini, pass 43) | — |
| **hurdles** | day-blocked H1/H7, MC drawdown/streak, sticky red until P5 PASS; **state-gated strategies** (drought-only, pre-break-only) are recorded `FAIL_STATE_GATED` by P5 instead of turned red | `§29x` |
🆕 *(`T36` pass 2, `2026-10-10` — `NBA_MASTER_SUMMARY.md` `§T36.5`)* **Two guards from Gemini's adversarial review (`2026-10-02 ~02:15Z`)**: (1) **week-2 kill switch** — *"three graded days below 50% stop it for the rest of the week"* ✅ **live**, `live_slip_engine.py` ~~`:562–569`~~ `:563–574` *(re-read sweep pass 26; the guard itself is `:568–574`; lines shifted by the build chat's `2026-10-10 05:37Z` commits)* (after `≥ 3` graded week-2 slate days, staked-leg hit `< 0.50` ⇒ `week2_trough = False`, logged *"week-2 play STOPPED by its guard"*); (2) **rotation agreement** — the trailing-3 had to agree with the trailing-10 (false days `20 → 9`, AS STATED) — ⚠ **not in today's code**: the rotation fires on the **EWMA** alone (~~`:981–988`~~ `:992–993` *(re-read pass 42; lines shifted by the build chat's `2026-10-10 05:37Z` commits)*, `rotation = any(... 'cool')`; `trail10` is computed for the log only) — the EWMA of pass 33 replaced the trailing means. 🆕 *(placed here pass 28; first written pass 21 in `§T35.7` by mistake — from `T36`'s Gemini consultations)* **The rotation's EXIT is a stated limitation** (pass 35): Gemini was asked for an exit rule that releases on the first day of a recovery without re-entering on one isolated good day; tested, it *"released on a strong day and re-entered on the next 0/22 day, leaving the recovery days rotated exactly as before. The rotation's exit stays a stated limitation: it misses some of the steals-driven recovery days, and nothing from this pass improves it."* The same pass tested the **game total** from the DFS correlation literature — *"dry on both sides with the seasons disagreeing where it looked like anything."*
**The strategies at launch (✅ `live_strategy_state`, all `paper`)**: `A_wsteals_5flex`, `A_core_5flex` (*"the retired core 5-Flex ran as shadow"* in the dry run — `§29x`), `A_regular_5power`, `A_wrebounds_4flex`, `A_core_3power`, `B_demon_5flex`, `B_demon_3flex`, `C_wstocks_4flex`, **`D_points_3power`** (all-weather), **`R_stocks_4power`** (rotation-only), **`W_core_3power`**, **`W_coredemon_3power`** (pre-break week only), plus the `_ROTATION` state row.
**What the program concluded about "identifying droughts"** (`§29m`–`§29q`, 70 passes): *a single bad day has no pre-game symptom in any table* — the variance test shows the engine's profit **is** the day-level clustering, so a bad day is the clustering running the other way; **a long drought is a state, identifiable from inside within ~6–10 days**, and the response is **rotation, not stop**; fixed calendar troughs are **planned**. *"None of it predicts a drought; all of it is the portfolio being built better."*
🆕 *(pass 3, `2026-10-10`, from the `T36` commit message, AS STATED, ⚠ in-sample)* **What the low-foul key bought at the portfolio level (pass 76)**: at live caps, net **`+5,029`** (`2,260` / `2,769` by season), ROI `96%`, max dd `135` — vs the certified build's `+4,651` / `88%` / `158` ⇒ `+8%` net, `−15%` drawdown; the stress season `+1,900 → +2,260`; **bad-day share unchanged at `30%`** — *"the key raises the average and shortens the droughts, as pass 65 predicted."*
**Launch numbers, both seasons through the live engine on identical code** (`§29w`, ⚠ in-sample — the rules were discovered on these two seasons): 2024-25 `+2,344` / ROI `105%` / max dd `113` / `23%` of days losing 10+; 2025-26 `+2,627` / `113%` / `44` / `10%`.
**Launch checklist (build chat, `§29w`)**: `LS_MODE=reset` once before the first pick; the pick, grade and requal ride P3 / P2 (P2A) / P1; `live_monitor.sql` weekly for 21 days; plan switch `LS_ALLSTAR_PLAN`. ✅ Today `live_slips` is empty and all strategies are `paper` — the reset state.
**Two standing operational rules from this transcript**: *check `pg_stat_activity` and cancel orphaned backends before dispatching a rebuild* (a query that errored at the bridge kept running `5½ h` and held locks); *the engine's defaults are the launch configuration* — a manual rebuild with blank inputs must fall back to the validated defaults (it had switched the key and diversify **off**).

---

## 🆕 §T37.7 — **TWO BOARDS ON PAPER FROM OPENING NIGHT: THE UNDERDOG RULE SET, AND THE PRIZEPICKS LIVE LEG SOURCE** *(source `T37`, `2026-10-03/04`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§30n`–`§31f`; ✅ = live `2026-10-10`)*
**The principle the owner set** (`05:57Z`, `06:38Z`): rediscover everything per board — and test on the new board **what failed on the old one**.
**Underdog — the rule set at certification** (`§30p`, `§30u`–`§30v`, `§31e`): **one pick per game** (makes the correlation factor `C = 1`, so the formula is exact) · **exclude centers** · **stand down the pre-All-Star week and the final week** (UD's final-week stand-down was **off by one day** until `§31e`) · sizes 2–6 (7–8 not certified) · Standard over Flex at 3–5 picks · no throttle after a cold week · priced with the published tables, **no `1.04`**, 4-pick Flex at `6` · **flat one-unit stakes** (`§30w`: Kelly sizing is unrealistic against entry limits; a 25-unit-drawdown pause or half-stake rule trims the 95th-pct drawdown `34% → 24–30%` for `~3%` median cost — recorded, not adopted as a rule here). 🆕 *(pass 13, `2026-10-10`, `T37` closing replies, AS STATED)*: **quarter-Kelly was measured and rejected** — *"a median 45% drawdown for a portfolio this lumpy"*; **a cell-side rule was tested and rejected**: running the blocks, threes and turnovers cells **Under-only** (the leg grid had Unders passing `10–12` of `12` settings and Overs `0` of `12`) **lost** at the slip level (ROI `−6` / `−2` points, P5's core `−22…−23`), because at the settings the engine uses both sides score higher (blocks `0.591` vs `0.559`, threes `0.580` vs `0.562`, turnovers `0.648` vs `0.639`) — *"the Under edge is real, but the model already exploits it, since about 85% of its picks are Unders."* **PrizePicks' alarms in the same session** (`§30x`): A_core_3power drawdown alarm `70 → 96` units, streak alarm `16 → 24` days; W_core_3power `151 → 205`. ✅ *Live today (`live_strategy_calib`, recalibrated `2026-10-10 04:27Z`)*: A_core_3power MC95/MC99 drawdown `69.8 / 90.0`, streak95/99 `18 / 23`; W_core_3power `130.5 / 170.8`, `20 / 24` — later recalibrations have moved them.
**Underdog paper portfolio** (`§30v`): **P5 = the core (weighted:points 4-Standard + weighted:points 6-Flex, cap 1) + the `mains` 2-Standard (cap 2) — primary; P4 (core + weighted:points 2-Standard cap 2) runs as its shadow** — *"paper is free — both are scored, and the live replay decides."* The **points cell is the backbone** (removing it takes 6-Standard to `−9%`). *"Underdog stays paper"* — before staking: the live NBA-board pricing check (snap zone, margin regime) when NBA props post, then a paper period.
**Droughts on Underdog**: *"luck, not signal"* at the day level, but **week-scale clustering is real** (7-day block resampling widens the tails) — handled by **bankroll**, not skipping; an edge loss takes **~2 months** to detect by CUSUM. 🆕 *(pass 459, `2026-10-15`, `T37`'s `16:29Z` and `21:53Z` replies, AS STATED)* The bankroll sizing it came to: *"With the portfolio's worst drawdown around 48 units at ~3.6 one-unit slips a day, a bankroll of at least ~100 units (twice the worst drawdown) is the sensible floor"*; and later, for both apps at one-unit stakes, *"be able to absorb roughly 250 units of drawdown on PrizePicks and 60–80 units on Underdog P5"* (the transcript text prints the range without its dash).
**PrizePicks — the live leg source** (`§31`–`§31a`, the wiring audit): the live pick and grade had read `prop_universe` (a manually-built backtest table no pipeline refreshes) — **replaced by `load_board_legs_live`** (`pp_leg_price` → name normalization → `player_name_map` → `final_hp`; the window board's own event id; team from the event) and **box-score grading**; the old path kept as `LS_LEG_SOURCE=universe` for parity only. 🆕 *(pass 11, `2026-10-10`)* The grading switch is its own knob: **`LS_GRADE_SOURCE`** — `boxscore` (default: outcomes from `player_game_log` via the leg's stored `player_id` or the canonical resolver; DNP / push → no outcome → void, PrizePicks reversion) or `universe` (the backtest table, parity tests only) — ✅ `live_slip_engine.py:828`. Legs whose team or event cannot be resolved are **dropped and counted, never passed on empty** (*"None == None reads as 'same game / same team' in the engine's rules"*). 🆕 *(pass 13, `T37` `§31`–`§31e`, AS STATED)* **How the switch was proven**: on `30` historical slates, given the **same legs**, old and new paths built **`360` of `360`** strategy-slates identically; grading matched on **`1,146` of `1,146`** legs; every input difference was attributed — **`11,109`** legs on suffixed players (dropped by the old path through two name bugs), **`3,237`** on players PrizePicks names differently (*"Nicolas Claxton"*, *"Carlton Carrington"* — the old table predated the aliases), **`486`** with no game recorded in the old data, **`60`** first-games-after-an-offseason-trade (now dropped rather than guessed), and **`6`** = two legs (Oso Ighodaro, Scottie Barnes) where PrizePicks listed one line twice, as a valid goblin and as a mislabelled "standard" the pricing data already excludes — *"That pattern appears nowhere else among 1.09 million priced lines."* The new loader runs in **`3.8 s`** a slate (from over 2 minutes). **Underdog's stand-down calendar for 2026-27** (`§31e`, after the off-by-one fix): **February 12–18** (pre-All-Star week) and **April 4–11** (final week) — `0` differences from the backtest rule across `156` game dates; the December Cup gap is not mistaken for the break. **Calibration now uses the WIDER of the iid, 7-day and 14-day block envelopes** (`§30x`) — the iid envelope put A_core_3power's real drawdown at its 99th pct, i.e. a live alarm on ordinary history.
**Certified for paper trading from opening night** (`§31d`, re-certified `§31e`, `§31f`), with **stated limits**: (1) *"the new P2A / P2B / P3 split has not yet run on a live game day — opening night is the first; check P3's pick log, the Underdog paper log, and the next morning's grades"*; (2) the PP late pick finds nothing (close boards captured but not tiered/priced). Isolation by design: the Underdog pick/grade and the name-map refresh are `continue-on-error` — *"paper only, they can never disturb PrizePicks."*
✅ **Live**: `nba_score.live_slips` `0`, `nba_score.ud_live_slips` `0` (no regular-season slate yet).

---

## 🆕 §T38.7 — **DOMAIN, SLIDE AND STAKE: THREE ADDITIONS AFTER THE OWNER ASKED "WHY IS IT OFFERED IF IT IS WEAK?"** *(source `T38`, `2026-10-04`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31h`–`§31n`; ✅ = live `2026-10-10`)*
**1 — A domain check: the out-of-range board guard** (`§31j`). The engine ranks **relative to the day's board** with no absolute floor; the backtests ran on full boards. ⇒ **nothing is placed when the board holds fewer scored legs than the smallest board in the validated history** — PrizePicks **`179`** (2024-12-09; p01 `250`, median `2,360`; `LS_MIN_BOARD`), Underdog **`178`** (2024-11-14; p01 `234`, median `1,284`; `UDL_MIN_BOARD`) — with an explicit *"out of domain"* log. *"A domain check, not a performance claim (thin-but-validated boards stay positive historically)."*
**2 — A slide detector: the break-even edge monitor** (`§31k`–`§31l`). The hurdle machine catches collapses (H1 needs a `13–20 pp` deficit over 14 days); it cannot see a slow slide to break-even. The monitor asks one question per season — *is the portfolio above or below its own break-even?* — at **looks every 30 slates**, z on the exposure-weighted daily excess over the break-even of **the slips actually placed** (Newey-West SE, 7 lags), **confirm `z ≥ 3.28`, alarm `z ≤ −3.09`** (bootstrap-calibrated, not textbook), decisions sticky per season. Its honest limit: *"a system hovering within ~2 pp of break-even cannot be resolved inside one season by any honest test."* Scope: **PrizePicks only** at `T38`.
**3 — Sizing for the model's weakest leg type: star-line Unders at half stake** (`§31n`). `stake_weight = 0.5` on any slip holding a balanced Under at a star-level line (points ≥ 24.5, PRA ≥ 34.5, pts+ast / pts+reb ≥ 29.5); exclusion was tested and rejected (the replacement effect). **Separation of accounting**: grading, the hurdles and the drawdown/streak envelopes stay at **unit stake** (they were calibrated on full-stake series); `stake_weight` is the stake to actually use; weighted P&L = `stake_weight × profit`.
**The realistic expectation, as the build chat set it** (`§31m`, owner `06:54Z`): backtest `+78% / +94%` is in-sample; return moves `≈ 10–11` ROI points per point of leg hit; portfolio break-even `≈ 9 pp` below certified; **central `≈ +23% to +44%`** (legs 4–6 pp below certified); one season's luck `±18–25` points. 🆕 *(pass 6, `2026-10-10`, the first answer at `06:56Z`, AS STATED — superseded by `§31m` within the hour)*: built on a single-Power approximation (3-pick Power `+43%` at `62%` legs → `≈ 0` at `55%`; 5-pick Power `+83%` → `≈ 0`), it put the central leg rate at **`56–57%` (range `54–59%`)** and expected **PrizePicks `+5%` to `+20%` (≈ `+$150` to `+$600` at `$1`/slip), Underdog `0%` to `+15%`**, with *"roughly a 1-in-3 chance of a losing season even if the system has a real edge"* — the exact portfolio curve (Flex partial pays, demon multipliers) is what moved the break-even to `≈ 9 pp` and the central to `+23–44%`; its reasons for shrinkage stand (in-sample selection; the Under tilt is the easy part — balanced Unders alone hit `53–55%`; `36%` of Underdog lines gone by close; core 3-Power legs `58.6%` in 2024-25 vs `65.4%` in 2025-26). The auto-adjustment (owner `07:01Z`) *"protects against a decaying edge; it can't create edge or make the backtest's return level come true."*
**Testing pattern adopted** (`§31h`): a **sandboxed slate simulation** — real pipeline code, scratch writes, production reads, the real `pick()` rolled back, production verified untouched — is how a future slate is rehearsed.
🆕 *(pass 460, `2026-10-15`, `T38`'s `06:51Z` and `06:56Z` replies, AS STATED)* **The money-terms bankroll guidance that went with the realistic expectation** (at `$1` a slip): *"Accounting for droughts that cluster, the recommended bankroll is about $250 for PrizePicks and $60–80 for Underdog"* (the transcript prints the range without its dash), the worst drawdowns behind it `$137` (PrizePicks, 2024-25) and `$44` (Underdog, 2025-26); and the rule for going to real money: *"Legs at 57%+ with no alarms justifies moving to small real stakes, sized within the $250 PrizePicks / $60–80 Underdog bankroll guidance"* — against *"Sustained legs under about 55% means the edge isn't there."* (the same figures in units: `NBA_SYSTEM_DESIGN.md` `§T37.7`'s droughts line).

---

## 🆕 §T39.7 — **"THERE SHOULD BE NO GAPS": THE GAP PROGRAM'S RULE — PRICE EVERYTHING, SELECT ONLY WHAT PASSES** *(source `T39`, `2026-10-05/07`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31o`–`§31s`)*
**The owner's demand** (`07:51Z`, `00:33Z`): *"There should be no gaps! … cover it as well as any other!"* · *"No issues, no gaps, no fails. Everything needs to be sharp."* **The build chat's design answer — two separate questions per gap:** (1) **coverage** — can the system price this leg honestly? (2) **selection** — should the strategies take it? *"Coverage is closed when they are priced; selection uses them only if the two-season test passes (the replacement effect has sunk leg changes before)."* *"A gap closed badly is worse than an open one."*
| gap | coverage | selection |
|---|---|---|
| **G1 whole-number lines** (~5.4% of the PP window board) | ✅ priced (recalibrated adjacent rungs, tie model) → `final_hp_derived` | ❌ not admitted at gate 2 (`1.0% / 0.3%` of slips used one; mixed) — *reopened in `T40` (gate 2b)* |
| **G2 deep goblins / demons beyond the ±10-rung ladder** (~3.4–3.9% of demons; goblins the model rates far higher) | design: price beyond-depth rungs, **route** them to `final_hp_derived` at both producers | gate 2 pending — `T40` |
| **G3 rookies before ~5 games** | ❌ cannot be priced better than the line (tested) | never selected — *"a tested boundary, not an open gap"* |
| **G4 Underdog live game-prop keys** | ✅ fixed in the archiver (explicit key table, unknowns logged) | — |
**Roster rule** (`§31r`): the daily model must project **today's rosters** — current roster ∪ recent participants still on the team; traded, returning and opening-week players covered; **rookies with no history counted, not projected**. Parity argument: the certified history already carried these players' legs (built by the replay builder), so projecting them *restores* parity with the certified series.
**Monitors per app** (`§31o`–`§31q`): each app's break-even is **fixed** at its correlation-preserving thinning value (PP `−8.99 pp`, UD `−10.84 pp`), not recomputed per season from the placed slips (that drifted `±2.5 pp` with the slip mix); the PP monitor reads **every graded status** of the daily strategies (`k < 100`), including built-but-unstaked slips, because its backtest reference includes them.
**Certification method extended** (`§31q`): an **end-to-end integration test inside one transaction, rolled back** — the production entry points (pick → grade → monitor, both apps) on real slates, asserted, then restored to empty. **Re-certified for paper from opening night** on `2026-10-05`, with the stated observations only the season can make: the first live game day of the new chain; Underdog's live NBA pricing; *"a player traded before the weekly roster refresh"* — **closed by the daily roster rule**.
**The owner's alignment rule** (`01:03Z`, `19:15Z`): before continuing, read the documentation and the compass from step zero; *"every now and then be sure that you are aligned and you are not drifting."*

---

## 🆕 §T40.7 — **WHOLE-NUMBER LEGS IN THE SLIPS, DEEP RUNGS PRICED BUT ROUTED OUT, AND ONE LEG POOL FOR LIVE AND BACKTEST** *(source `T40`, `2026-10-07`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31s`; ✅ = live `2026-10-10`; updates `§T39.7`'s table — kept, RULE 40)*
| gap | `§T39.7` | after `T40` |
|---|---|---|
| **G1 whole-number lines** | priced, not selected | **ADMITTED to live selection** (owner `03:20Z`) behind `classification_config['whole_number_selection'].enabled` ✅ `true` — *"they can and should make to slips if they are strong"* |
| **G2 beyond-depth rungs** | design | **built**: priced every day, **routed** to `final_hp_derived` at both producers (`build_final_hp.py`, `score_board_legs.py`); **not admitted** to selection (gate 2 worse in both seasons) |
**The design principle the gate-2b fix made explicit — one currency per cell.** A cell ranks legs by score; certified half-point legs carry *raw* (mildly overconfident) scores certified on realized rates; a whole-number leg carries an *honest*, compressed probability. Mixing them makes a strong whole-number leg look weak. ⇒ translate each whole-number leg's EV-equivalent probability into the raw-score scale of its own (rank key, prop, tier, side) through an isotonic map fitted on the other season (live: pooled), and enter it at the **lowest raw score whose realized rate reaches `p_eq`**.
**The safety discount the owner asked for** (*"a little safety discount"*): one standard error of the calibration bin, subtracted before the tie adjustment; the tie valued at `0.5` of a win (Power `M(n−1)/M(n)` is `0.5–0.6` — `0.5` conservative). Research basis cited by the build chat: shrinkage under estimation uncertainty (logarithmic pooling with the line; Baker & McHale's shrunken Kelly) — *"our cross-season slope b ≈ 0.31 IS a logarithmic pool with the line's own 50%."* 🆕 *(additional sweep `5`, pass 362, `§P362` — the reply's closing source list, read to its end)* The owner-facing summary of `2026-10-07` `05:41Z` cites four sources:
- PrizePicks' help-centre page on DNPs, reboots and ties (the tie rule);
- Baker & McHale, "Optimal Betting Under Parameter Uncertainty: Improving the Kelly Criterion";
- "Classifier Calibration: a survey" (arXiv `2112.10327`);
- "Forecast combinations: an over 50-year review" (arXiv `2205.04216`).

Its own gloss: *"The tie handling comes from PrizePicks' own rule, and the safety discount follows the published approach of shrinking estimates when they're uncertain."*
**One leg pool for live and backtest** (the recertification): live selection now includes whole-number legs, so the certified slips, the weekly P5 requalification, the edge-monitor reference and `live_strategy_calib` are all rebuilt on **`tier_map_legs_sel`** — otherwise *"the monitors would have compared a live pool against a backtest of a different pool."* Every consumer that reads a leg hit is **tie-safe** (a tie = hit NULL = void).
**The research rule** (owner `03:23Z`): own research first; *"Gemini is a insight and validation tool, not the main path or the absolute truth."*

---

## 🆕 §T41.7 — **THE FULL-SYSTEM CERTIFICATION: HOW THE OWNER WANTS THE SYSTEM PROVEN, AND THE FIRST SLIP-SYSTEM FINDINGS** *(source `T41`, `2026-10-07`; owner directive verbatim in `NBA_MASTER_SUMMARY.md` `§T41.1`; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31t` and the build chat's ledger)*
**The method the directive produced** (ledger header): the system is one chain — scheduler → P1 → P2A → P2B → P3 → P4 (live slips) → P5 — plus the board scrapers; the passes **follow the data**: A chain & sequence · B mining · C loading · D calculations · E board scoring · F slip system · G reliability & caveats · H final product & docs. **Every finding carries evidence, fix, verification and status** (🔴 defect · 🟠 fixed, verification pending · 🟢 fixed and verified · ⚪ verified correct). Standing rules: sample first; test all props; tunables in the DB; one set per day; no MLB edits; COMPASS updated when a decision changes. *Caveats are addressed, not recorded* (owner).
**Slip-system findings in this window** (`§31t` (1)–(2)):
- **Void reversion follows PrizePicks** — a slip reverts to the payout table of the legs **left**: on a Flex, 2 left → `3×` Power-style; **1 left → `1.5×` (× factor) on a hit, 0 on a miss**, for ANY original size; refund only when nothing is left. Live grading now passes voids into the payout engine instead of pruning them first. Effect on the certified backtest: `1,120` single-survivor slips of `478,900` (`0.23%`) — the old refund assumption was `142` units (`0.03%` of stake) optimistic; ROI unchanged to the decimal.
- **Rule scopes restored**: the points-Under ≥ 23.5 cap belongs to `D_points_3power` (`MAX_LINE_BY_STRATEGY`); the week-2 trough play stakes only families A and C, the rest shadow.
**Calculation pass D-1** — the `final_hp` layer verified against stored outcomes; what looked like Under miscalibration is **adverse selection in which Unders are offered** (`NBA_BASELINE_CALIBRATION.md` `§T41.5`).
**Owner's repository rule** (`16:43Z`): *"keep everything in the same repository just order by folders"*.

## 🆕 §T42.7 — **CERTIFICATION ROUND 1 CLOSES, ROUND 2 OPENS: THE SLIP SYSTEM'S STATE MACHINE, ITS UNITS, ITS CLOCKS — AND THE ONE PLACE LIVE DOES NOT SCORE LIKE THE CERTIFIED HISTORY** *(source `T42`, `2026-10-07 18:36Z → 10-08 07:11Z`; owner messages verbatim in `NBA_MASTER_SUMMARY.md` `§T42.1`; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31t` (3)–(6) and the build chat's ledger)*
- **Red is sticky, and only one thing releases it.** `RED_STICKY` rides in a strategy's `hurdles`, is set on every red evaluation and is evaluated **before** the calendar windows (week-2, final-7) and before P5's verdicts; it is released **only** by a `REQUAL` text beginning with PASS (an old PASS text is dropped when a new red is set). **H5 opening window**: two yellows inside the first 21 days stay `yellow` (half cap) — the same 21-day rule H4 uses. **Manual release is the owner's, deliberately:** `UPDATE nba_score.live_strategy_state SET state='paper', live_cap=<cap>, hurdles = hurdles - 'RED_STICKY' WHERE strategy='<name>'` (`§31t` (3)); the simulation never touches the table. *Later in the window (round 2, P2A#5):* a P5 PASS releases a red **only when the live season's own walk-forward lower bound is positive** (`boot_lo` over the current season's slips from Nov 1, ≥ 40 days), else `REQUAL 'HOLD <date>'` — a PASS on frozen two-season data no longer clears a live failure. The clean-day hysteresis counts a slate once (P2A#12).
- **A floor is compared in the unit it was measured in.** `§31j`'s `179` is unique half-point scored legs; the guard now counts exactly that (whole-number legs, added in `§31s`, were never in the baseline). Underdog's `178` already did.
- **One season definition, one clock.** The Underdog edge monitor now takes its season from the PrizePicks engine's `regular_season_window` (season blocks split at the summer gap) — the 250-day window would have keyed `2026-10-25` to `2026-02-19` and silently re-keyed its looks in December; both engines read `America/Los_Angeles`, not a fixed UTC−8.
- **Certified constants stay in code** (`EDGE_DELTA`, the confirm/alarm z, `MIN_BOARD_LEGS`, `PAPER_DAYS`, hurdle thresholds): they are *certification outputs*, changed only by a recertification with its derivation in `§31`, not operating tunables — *"a silent DB override would be a new way for the monitored value to drift from the certified one."* (`nba_config.system_settings` holds worker defaults only.) A conscious reading of the "tunables in the DB" rule, recorded in the ledger (F-9).
- **One dead app never blocks the slate** (G-7, seen live `10-07 13:16 PT`): every board capture is a soft step; the archive labels as the decision snapshot (`window`) **only** the boards this run captured — a same-day morning file must never become the decision board; the Underdog pick runs whether or not the PrizePicks pick refused; the PrizePicks pick still refuses loudly without today's window board. 🆕 *(additional sweep `5`, pass 370, `§P370` — the archive step's switches by their own names, named in `T48`'s listed sentences; ✅ read in `nba-p3-afternoon-light.yml`)*: the step builds its app list from `BOARDS_OK` (the soft board step's output) plus `prizepicks` when `PP_OUTCOME` is `success`. With the dispatch input `skip_scrape=true` (`SKIP_SCRAPE`) it archives all five apps' files as found on disk. An empty list warns and exits `0`. ~~Betr is no longer archived here: since `2026-10-09` its own harvest archives its board with label `window`.~~ *(struck in the same pass: true of a normal run only — the `skip_scrape` list still names `betr`)* In a normal run Betr is not archived here: since `2026-10-09` its own harvest archives its board with label `window`. Only the `skip_scrape=true` list still includes `betr`.
- **A soft step may fail, but never silently** (G-1): the failed soft steps are named on the run's `pipeline_runs` row and as a run warning; the monitors were designed never to block the grade (`§31l`), so visibility — not blocking — was what was missing.
- **The live pick builds the way the certified history built** (P3#3): the `broad_day` diversification flag (on when ≥ 5 cell families — a cell with its `_U` suffix folded — hold ≥ 2 distinct players that day; ✅ code `2026-10-10`) is computed in `pick()` exactly as the backtest computes it and passed to every build.
- 🔴🔴 **The market term (P3#4, opened in this window; decided in `T43`).** The certified scores include a confidence deduction for sportsbook backing of each rung; the live pipeline has no sportsbook feed, so every live leg takes the full deduction. The effect is not a constant shift: it **re-orders the top-n inside cells** (the build chat's measurement: top-2 membership differs in 13% of cells, top-5 in 11%), and selection picks top-n. Options as framed by the build chat: **A** make the certified history market-free and re-certify (certified == live); **B** buy the sportsbook feed (~$119/month); **C** document the gap. Gemini (reference) rejected A's method and timing. In this window only scratch tables were built and market-free engines dispatched.
- **Owner's research question, deferred by the owner himself** (`05:56Z`): how to handle the apps **with no back data** — *"grounded on deep research, no guessing … We may just accept the same legs that we have back tested"* — **after** the full certification of the current system.

## 🆕 §T43.7 — **WHAT LIVE IS MEASURED AGAINST (THE MARKET-FREE TWIN), WHAT A SLATE IS, WHEN THE ENGINE MAY NOT PICK — AND HOW A BOARD WITHOUT HISTORY ENTERS** *(source `T43`, `2026-10-08 07:13Z → 10:59Z`, no owner message; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31t` (7)–(11) and `§31u` as first written; ✅ = live `2026-10-10`)*
- 🔑🔑 **Certified set vs measuring stick.** The certified **strategy set** (cells, sizes, structures, caps) stays as certified on the market-inclusive history. What the live engine is **measured against** — the hurdle calibration (H1 level and day-sd, MC95 drawdown, streak MC95/99), the steals-anchor reference, P5's live simulation, the edge-monitor reference, P5's verdicts and red-release gate — comes from the **market-free twin**: the certified selection rescored exactly as live scores (`f_books = 0`, `f_agree = 0.55`), its own slip engines and validations, rebuilt weekly by P5 (steps 3c / 5c). One switch: `classification_config['live_backtest_suffix']` (`"_mf"`, ✅) read by `live_slip_engine.bt_table()`; blank returns to the market-inclusive tables. *Why*: hurdles and monitors calibrated on a history live cannot reproduce would judge live against the wrong level. Round-3 clean form: market-free **as** the certified scoring, twins dropped. Option B (an odds feed) restores the term live instead.
- 🔑 **What a slate is**: a date with regular-season games, defined **once** as `nba_calendar.regular_season_games` (`game_id LIKE '002%'`) and read everywhere a pipeline, the scheduler, certify, prune or an engine asks "is today a slate?". Labels are not used (the NBA Cup Final carries a regular-season-looking label; play-in, playoff and All-Star days are not `Preseason`). The season-rollover guard keys on the id prefix in any pre-opener month.
- **When the engine may not pick**: after the slate's first tip (`post_tip()` in both engines — *"a late fallback pick is worse than no pick"*); a late P3 runs no delta, scoring, paper log, certify or pick. **When the ledger may not be wiped**: P4 `reset` only with `confirm=RESET`, refused once the regular season holds live slips (`force_reset=1` deliberately overrides) — **run once before 10-20's first pick**.
- **Grading always catches up**: grade mode without a date loops every ungraded slate `< today`, oldest first (a red P2A no longer orphans a slate); the Underdog grade never grades a slate whose box scores have not landed.
- **Whole-number neighbour prices are a separate class** (`whole_number_nb`): priced so *every leg has a price* (fact 134), **not selectable** — the live engine reads `'whole_number'` only — until the class has a backtest of its own.
- **Documentation drift named by the build chat** (`§31t` (11)): strategy `§29a` still states H1 as 0.04/0.07 over 100/150 legs, H2 as 1.0×/1.5× worst dd and a 1,000-slip paper gate; the code implements `§29c`/`§29g` (day-blocked z 2/3 vs the calibrated daily level, MC95 0.8×/1.0×, streak MC95/MC99, paper gate cap × 50, sticky red, variance-only red → `critical` cap 1 for a 7-day grace); `§28g`'s *"§27d hurdles stand"* is superseded the same way. *(The build chat attributes `§29a`'s wording to "the doc chat".)*
- 🔑🔑 **Boards without a backtest of their own — Sleeper, Fliff, Betr** (`§31u`, owner's question of `T42`): **the leg probability is operator-independent**; on a flat board (PrizePicks, Betr) the edge is p above the flat break-even on the certified cells; on a **priced** board (Sleeper, Fliff) the operator has already scaled the payout to its own probability — a leg the model sees at 60% paid `~1.45×` returns `0.87`, so the edge exists only where **p × m ≥ 1 + margin**. Hence: **pool = the owner's candidate** (legs inside a certified cell / line / tier — the only p with evidence) **and a price gate** (Sleeper/Fliff: p × m ≥ break-even + the certified margin in multiplier space; Betr: its flat break-even), each board entering as a **paper board** under the same state machine (adapters — line map, payout function, void rules — in `nba_config`), staked only after the paper gate and the sequential monitor. What an operator-history backtest would have added is replaced: board-selection effects measured live (every archived app is scored), line differences handled by the pool rule, payout interplay by the adapter, profit evidence by the paper phase. **`§29v`'s price reconstruction from sportsbook odds is dropped.** *(Owner to confirm at `T43`'s close.)*

## 🆕 §T44.7 — **MEASURE BEFORE YOU USE, KEEP EVERYTHING, AND GIVE THE POSTSEASON ITS OWN EVIDENCE** *(source `T44`, `2026-10-08 11:01Z → 21:03Z`; owner messages verbatim in `NBA_MASTER_SUMMARY.md` `§T44.1`; AS STATED from `§31u` (confirmation), `§31v`, `§31w` (design) and the ledger's RETENTION CERTIFICATION)*
- 🔑 **The owner's rule for the boards without history** (`10:07 PT`): use *"the legs that are already qualified by the other apps, especially the underdog"*; anything beyond only if research finds something *"very, very strong … very, very reliable"* — and *"it needs to be conservative."* `§31u` is confirmed on that basis.
- 🔑 **Price shopping is measured before it is used** (`§31v`): nothing staked, nothing changed in the engines. A daily ledger records, for every leg the PrizePicks engine (all placed statuses, shadow included) and the Underdog paper engine selected, every app's window listing of **the same leg** — listed / same line / nearest line and gap, the displayed number, the per-leg price `m_eff`, the model's p, `p × m_eff`, and **`gate_pass = (p − margin_pp) × m_eff ≥ 1`** with `margin_pp = 0.0916` (= `EDGE_DELTA`): a leg clears an app's price even if it hits 9.16 pp below the certified p. A venue-choice rule, if ever adopted, is derived from the ledger and backtested — never assumed. Ranked by evidence (`§31v`): (1) price-gated leg selection — ours; (2) cross-app shopping of the same backtested leg — real but unmeasured; (3) post-news stale lines — latency-bound, invites limits, not for a 1:15 PM window system; (4) correlated stacks — needs a joint model and is being shaded away; (5) promos — small. Gemini's added safeguard: a market-free model's blind spot is the stale line → **a line-divergence flag against the other apps' lines**.
- **A live sportsbook feed stays deferred** — it would change what was certified, and it can be judged **offline first** against the `1.5 M` scored sportsbook legs already held (*"a backtest, not a subscription"*). **Betr has history** (`142k` scored legs, 2025-26) — its own certification is a round-3 chain; until then it is a paper board.
- 🔑🔑 **Retention, as the owner ruled it** (ledger RETENTION CERTIFICATION): **ingredients are never lost; products are reconstructable from the recipe; one set per day (a rerun updates); the baseline is board-scoped once a slate is graded.** Accepted as designed and recorded: intraday board captures collapse into one row per label (the 2-hourly pulls stay as git commits of the board files); yesterday's `final_hp` is rebuilt by P2A from the complete board (the day-of values live in `board_scored`, the day's parameters in `model_params_history`); weekly derived tables are products rebuilt by P5; repo-only ingredients (pt_defend / hustle / clutch, matchups, quarter logs, pairs, coaches) are safe in git.
- 🔑🔑 **The postseason gets its own evidence** (`§31w`, owner `13:37 PT`: *"its own specifics … smart about it … weigh properly against the regular season"*): (1) **separate data, separate tables** — postseason logs, starters, officials, matchups, injury reports in their own files and **twin tables `<table>_postseason`**; mixing them into regular-season tables *"would have silently changed certified numbers"* (the foul view, daily-delta DvP and completeness, the engine's season block → final-7 / week rules, research backsims, `prop_universe` phases); (2) **walk-forward, postseason-aware history** — a postseason slate sees the regular season plus the postseason games before that night; regular-season slates keep exactly the certified inputs; (3) **its own calibration phase `5_postseason`**, shrunk toward `4_push` while thin; (4) **its own certification** — a strategy stakes on a postseason slate only if its postseason backtest passes the same V2 day-blocked bootstrap test, and small-slate board floors come from the postseason board-size distribution, not 179; (5) **live predicate `slate_games`** (002 + 004 + 005; All-Star 003 and the Cup final 006 stay out) wherever the question is *"is there a slate tonight"*; `regular_season_games` stays where the question is the regular-season calendar. *(Built and measured in `T45`.)*
- **Ready is not perfect** — the build chat's answer to the owner (`§T44.0` #6) is a design stance: the first live slate is the final test, *"which is exactly why it opens on paper, not money."*

## 🆕 §T45.7 — **HOW THE POSTSEASON IS WEIGHED AGAINST THE REGULAR SEASON, AND WHY NOTHING STAKES ON PLAYOFF NIGHTS (YET)** *(source `T45`, `2026-10-08 21:04Z → 10-09 02:49Z`; AS STATED from `§31w` AS BUILT and the ledger's POSTSEASON WIRING; ✅ = live `2026-10-10`)*
- 🔑🔑 **The weighting rule** (`classification_config['postseason_weighting']`, ✅ key present): a cell's postseason hit rate is shrunk toward its **certified regular-season p.m**: **`pm_w = (days·pm_post + K·pm_reg) / (days + K)`, `K = 50`** — the regular season counts as 50 postseason nights of evidence. A cell is **eligible** on a postseason slate iff `pm_w ≥ 0.55` **and** `pm_post ≥ 0.55 − 0.02` (the postseason must not contradict the prior) **and** `days ≥ 20` → `nba_score.cell_postseason_eligibility`. The correlation map stays the regular season's large sample.
- 🔑 **The strategy gate** (`postseason_strategy_gate`): a live strategy stakes on a postseason slate only with **PASS = pooled day-blocked 2.5% lower bound > 0 at k = 1, ROI > 0 in each postseason, ≥ 30 days, not retired** → `nba_score.postseason_strategy_verdict`. **The two-season verdict at `T45`: none passes → every strategy SHADOW** (built, graded, recorded outside the regular ledger). *"This is the conservative reading of 'weigh properly': the regular-season edge is not assumed to carry into a different regime without postseason evidence."* P5 step 7 re-certifies weekly during play-in / playoff weeks with each live night added. ✅ `2026-10-10` the verdict table holds 14 rows — the 11 regular strategies all SHADOW, plus three **playoff-unders strategies that PASS** (added `10-09`, later transcripts).
- **The postseason board floor** (`postseason_board_floor`) = the smallest validated postseason board: **485** unique scored legs (p10 579, median 1,056) — small slates are judged by their own distribution, not the regular season's 179.
- **The live path**: on a postseason slate the PrizePicks engine takes **`pick_postseason`** — postseason floor, eligible cells only, per-strategy verdict, cap 1, **no regular-season calendar rules** (week-2, final-7, All-Star), its own statuses `placed_post` / `placed_post_shadow` → `graded_post*` **outside the regular ledger**, box scores from both the regular and postseason logs; the Underdog paper engine records `stand_down:postseason` (stake 0).
- **What separates the two seasons in data**: postseason data in twin tables; postseason-aware consumers union them explicitly; the regular-season certified model **must not learn from the postseason** (the confidence-v3 fit excludes 004/005 legs — a leak closed when postseason rows started sharing `final_hp`).

## 🆕 §T46.7 — **WHAT THE SYSTEM EXPECTS OF 2026-27, AND WHAT THE PLAYOFFS ARE TO IT** *(source `T46`, `2026-10-09 02:50Z → 07:06Z`; AS STATED from the build chat's statements to the owner (verbatim in `NBA_MASTER_SUMMARY.md` `§T46.2`), strategy `§31x`, `§31y` and the ledger)*
- 🔑🔑 **The 2026-27 expectation is a range, derived from the certified curve**: backtest ROI is in-sample (the cells were chosen on the same seasons), so live will be lower; the PrizePicks portfolio loses **~10 ROI points per point of leg hit-rate** given up vs the certified rates and **breaks even ~9 points below** (the `−9.16 pp` monitor margin); 2024-25 legs ran ~3 points below certified → **realistic central `+23%` to `+44%`, plausible `+3%` to `+64%`**; one season's luck moves it ±18–25 points; the edge monitor confirms or alarms by about slate 60. Underdog stays paper until its live pricing check and a paper period pass.
- 🔑 **The regular-season system is untouched by the playoff work** — same certified tables, verdicts, stakes; the playoffs add **a separate, unstaked track** (one shadow slip per strategy per night, graded outside the regular ledger) that only stakes once a strategy passes the postseason gate with live nights included.
- 🔑🔑 **What the playoffs are, for this model** (`§31x`, three seasons): rotation players play slightly more but produce **0.10–0.12 fewer PRA per minute**; combined PRA lands **below** the regular-season average in 57–64% of playoff games; the model's confident **Overs fail (46% / 51%)**, its confident **Unders hold (57–58%)**. Through the whole regular-season method (`§31y`): the cell ranking still works (PrizePicks 26 profitable cells vs ~12 by chance, almost all Unders); **signal filters add nothing**; **no slip strategy survives an honest walk-forward between the two playoffs**; leg-level out-of-sample: **Unders `59.0% / 55.3%`**, Overs `49% / 44%`, demons / goblins `48% / 41%`. ⇒ on playoff nights: **no Overs, demons or goblins**; the one candidate is the model's top Unders.
- **"Playoff Unders" (`§31x`–`§31z`)**: each night the standard-line Unders the model gives ≥ 58% (8 main props, one prop per player, strongest first); PrizePicks 5- and 6-pick Flex, Underdog **2-pick** (its one-pick-per-game rule leaves 1–2-game nights only 2-pick slips). Computed edge at the leg-level out-of-sample Under rate: PrizePicks 5-Flex `~+25%`, 6-Flex `~+38%` (`+7%` / `+10%` on the weaker year alone), assuming independent legs — and *"same-game legs are unavoidable on playoff nights."* The build chat recommended it as **practice (shadow) from the 2027 play-in**; the owner instead ordered *"run all the gates, stress it out … wire the logic"* — the gates and the stake rule are `T47`.
- **The playoff Under strategies on the regular season**: weak (e.g. rebounds+assists Unders 5-Flex `+26% / +17%`, all-Unders 6-Flex `+6% / +32%`), Power versions with 60–80-unit drawdowns and 60–74-day losing streaks → *"the Under edge is specific to the playoffs, and the current regular-season strategies stay as they are."*

## 🆕 §T47.7 — **PLAYOFF UNDERS AS DEPLOYED, AND WHY MULTIPLIERS DO NOT BECOME A STRATEGY** *(source `T47`, `2026-10-09 07:07Z → 19:02Z`; AS STATED from `§31z`, `§31aa` and the ledger; ✅ = live `2026-10-10`)*
- 🔑🔑 **Playoff Unders, deployed** (`classification_config['playoff_unders']`, ✅ `stake_mode = 'gate'`; keys `enabled, rank, min_p, props, half_only, exclude_star, max_per_game, strategies, ud, stake_mode, note`): on a play-in / playoff slate the PrizePicks engine builds the Playoff Unders slips and **stakes those whose postseason verdict is PASS** (5-Flex, 4-Flex); the Underdog engine logs its 2-pick Standard as a paper entry at 1 unit (PASS); 3-Power records only; every regular strategy stays record-only on playoff nights; the weekly recertification re-tests with each live playoff night. **`stake_mode = 'shadow'`** turns every Playoff Unders slip record-only — the owner's single switch.
- **How it may be read**: the pooled ROI is in-sample; the slip-level walk-forward fails on PrizePicks; the edge is a **type of pick** (the model's chosen Unders hit `62%` vs `~54%` for all Unders on those lines), shown by all 60 whole-line 5-Flex variants being positive in both postseasons; out-of-sample estimate 5-Flex `+7%` to `+25%`; **4-Flex and 5-Flex are one bet at double size** (shared legs).
- 🔑🔑 **The owner's multiplier idea, tested as he framed it** (`§31aa`): a leg is worth playing on an app when the day's multiplier `m ≥ m* = 1 / (p_cell × root)`, with `p_cell` the **certified cell's backtest hit rate** (not the model's raw p, which is overconfident on other apps' lines — 74% said vs 57% realized on Underdog) and `root` the app's even-line per-leg payout. **Result: no generic price gate and no cross-app staking** — gated legs stayed below break-even on all three apps with history; slips built that way were never provably profitable; the certified edge lives where PrizePicks' line beats the market or where no other app posts the prop. ⇒ **current strategies kept; `m*` recorded daily as measurement only.** As a filter on certified Underdog slips it is *"a candidate, not a rule"* (2025-26 `+143%` vs `+10%`; 2024-25 no filtering possible).
- **Main lines fair, alternates taxed**: on main lines every app's hit-rate × multiplier ≈ `0.500` — the house cut is in the payout table; alternates carry a further 3–7% (easier) to 13–26% (harder) cut, growing with distance from the main line.

## 🆕 §T48.7 — **"NOT SOFT": THE OWNER'S RULE FOR BOARDS, ONE SWITCH FOR THE MARKET TERM, AND THE SYSTEM'S THREE BOARD MOMENTS** *(source `T48`, `2026-10-09 18:48Z → 10-10 02:35Z`; owner messages verbatim in `NBA_MASTER_SUMMARY.md` `§T48.1`; AS STATED from the ledger and strategy `§31ab`–`§31ac`; ✅ = live `2026-10-10`)*
- 🔑🔑 **"If any board is not working properly, it's not soft."** (owner, `22:35Z`) — a board capture that fails or returns nothing is a defect to fix, never a recorded caveat. Applied the same evening to the Betr harvester (new app) and to the ten-day PrizePicks quote blindness (green runs, no data).
- 🔑 **The owner delegates what does not need his hands**: the market-term flip (*"does not depend on me … you need to analyze and change things if needed"*), the in-app checks (*"You can also probe the apps for everything"*), the 30-day key (*"auto update in the system"*); he keeps the proxy plan for the first month and the transcript gap.
- 🔑🔑 **The market term: measure live, then flip four rows together** (`§31ac`): the live props feed (ParlayAPI) writes sportsbook rows in the history's shape and book set; **`market_feed.refresh_final_hp` stays false** (✅) until the first in-season week's books-per-rung matches the history (2.14 / 2.10 / 1.97 / 1.97 books; 14.7–16.6% with ≥ 4); then **the same day**: `refresh_final_hp → true`, `live_backtest_suffix.suffix → ''`, `.ud_table → _dlt_orig2`, `ud_edge_monitor → certified`. *"One without the other would score live legs on one currency and calibrate hurdles on another."* Only the certified book set counts (Pinnacle / Novig ladders are outside it).
- **Round 3's closing logic**: a deferred candidate is closed either by doing it (the Underdog twin) or **by measuring its effect on the final output** and showing it below the decision threshold (`_alternate` double count ≈ 0.08 pp median; blended spreads ≈ 0.3 pp max; `whole_number_nb` < 1% of slip legs) — *"nothing is left as a bare caveat."* The two measured items go into **one** post-launch chained recertification.
- 🔑 **Three board moments a day, anchored to the first tip**: **MORNING** (P2B, ≤ 08:05 PT — line-shading research, PrizePicks + Underdog), **WINDOW** (P3, `min(13:15 PT, first tip − 30)` — the decision board, every app, right before the slips) and **CLOSE** (first tip − 25). Everything else (36 routine NBA pulls a day) was removed — *"strategic times that match my slip placing times and our system needs. That will reduce traffic cost."*
- 🔑 **Retry by policy, not by habit**: transient failures are retried with jittered backoff inside a wall-clock budget; permanent ones fail at once; **a load that may still be running is never blindly retried** — it is re-invoked by data (`verify_static_loads.py`).

## 🆕 §T50.7 — **`T50` (`2026-10-17 -> 10-26`): THE STRATEGY, PORTFOLIO AND DECISION STORY OF OPENING WEEK — THE 10-17 FULL PASS, CAPS AT 2, STREAK FLAGS, THE EARNED UNIT, THE 2-SLIP PORTFOLIO, PRIZEPICKS PORTFOLIO B, UNDERDOG PORTFOLIO T, 375 BOARD PROFILES THAT CHANGE NOTHING, AND WHAT WAS REJECTED** *(source: **AS STATED** from the build chat's own files — the certification ledger `NBA_FULL_SYSTEM_CERTIFICATION_2026-10.md` lines `2058`–`3235`, `NBA_COMPASS.md` facts `166`–`185`, `NBA_BOARD_LEARNINGS.md`, `PP_PAYOUT_FINDINGS.md` `§0l`–`§0r`, `BETR_BUILD_STATE.md`, `NBA_SLIP_BUILDING_STRATEGY.md` — for `10-17 13:17 PT -> 10-25 23:37 PT`; the build chat's main conversation for that span is NOT a transcript, only its compaction summary is transcript-grade; **TRANSCRIPT** where the T50 transcripts show it: main `10-25 23:37 PT -> 10-26 00:11 PT` and the subagents of `10-20 15:08 PT`, `10-20 21:48 PT`, `10-21 19:52 PT` (two) and `10-24 19:14 PT`. All times Pacific. Owner words are quoted short from the ledger and COMPASS headings.)*

### 10-17 (Saturday) — the full pass with everything on, and what the owner saw on the screens
- 🔑 **Provenance of this section.** Every figure below is AS STATED from the files named in the heading unless a bullet says TRANSCRIPT. The login machinery for Sleeper and Fliff that the main transcript spends its last 34 minutes on belongs to the architecture and workers documents, not here.
- 🔑 **The 10-16 17:40 PT order that opened the period.** The owner asked the build chat to re-read the documentation chat's open items against the live system (*"Do not fix documentation"*). Outcome: the certifier check L11b (the L11 invariants run on the live engine's own backtest tables) first FAILED two checks with `11,392` and `19,401` payout mismatches; every one was a size-2 Flex slip with alternates, which the engine has paid 0 since `10-10` because PrizePicks has no quote tier for 2 picks, while tables built before `10-10` keep the old Flex value. 2-pick Flex was excluded from the L11b recompute and counted instead; `certify_slip_system` then read `82` checks, `0` FAIL. Cross-reference the workers document for the ParlayAPI zero-item fix.
- 🔑 **The full pass of `10-17 13:37 PT`** (*"another full pass, test, simulation, validation, calibration, certification, deep level of scrutiny"*). Production was green (P2A 14.3 min, P2B 3.7 min, P3 6.4 min on a preseason day); a second P2A dispatch at `09:35 PT` was refused by the run-once guard, which is correct. Live config read back from the DB: `live_backtest_suffix` `_wo`, `market_feed.refresh_final_hp` true, `stake_unit.ud_play` true, `stake_unit.unit_usd` 1, `price_shop_ledger.margin_pp` `0.0748` (moved from `0.0662` so the ledger's model-p gate uses the same break-even distance as the window-only switch).
- 🔑 **Both seasons replayed day by day with the live loop on the `_wo` hurdles and EDGE_DELTA `-0.0748`** (`audit_season_replay`, rolled back, `live_slips` 0 to 0, strategy states unchanged, both RESULT PASS). 2025-26 before (`s2526_final`): `2,373` played slips, net `+2,044.62`, ROI `+86.2%`, max drawdown `72.6`; now (`s2526_wo`): `2,371` slips, net `+2,046.62`, ROI `+86.3%`, drawdown `72.6`. 2024-25 before (`s2425_final`): `2,059` slips, net `+759.53`, ROI `+36.9%`, drawdown `143.4`; now (`s2425_wo`): `2,072` slips, net `+787.40`, ROI `+38.0%`, drawdown `147.4`. 2025-26 differs on ONE day (`2025-12-15`: the recalibrated hurdles held A_core_3power at cap 1 instead of 3, the two slips not played both lost, `+2.00`); 2024-25 differs on `16` A_core_3power days (`24` slips played only now, `+20.68`; `8` only before, `-8.00`) plus A_wsteals_5flex `+2.19`, A_regular_5power `-2.00`, A_wrebounds_4flex `-2.00`, C_wstocks_4flex `+1.00` (net `+27.87`, drawdown `+4.0`). The recalibration helps in both seasons and changes little, as intended (it moves hurdles, not the pick).
- 🔑 **Opening-night rehearsal of `10-17`.** `nba-sim-slate` for `2026-10-20` (1,114 scored PrizePicks legs, 31 players, 3 games, small slate so every strategy at cap 1, 9 slips recorded): PLAY A_core_3power, A_wrebounds_4flex, C_wstocks_4flex (unchanged); A_regular_5power below the minimum entry (skipped); A_wsteals_5flex week-1 skip; four shadows. Production afterwards: `baseline_history`, `final_hp`, `final_hp_derived`, `live_slips` all 0. Integration test ALL PASS, `audit_release_path` PASS, main-UI end to end `95/95` on the replay path `2026-03-10` and on the default path. **Verdict 10-17: nothing to change; all improvements are on; opening night rehearses to the same three PrizePicks slips.** Tests must run ONE AT A TIME after the replays because they share the `live_slips` lock.
- 🔑 **Boards for 10-20 as of 10-17.** PrizePicks `31` players / `9,133` rows; Sleeper `28` / `966`; Underdog `26` / `1,956` (3 the day before; `83` players already for 10-21); DraftKings `24` / `430`; Betr NBA re-proved on a renewed session (`892` legs); Fliff team markets only. Owed for 10-20: Fliff player props, the Underdog displayed-payout check, the Sleeper payout check. Rosters refreshed `08:08 PT`: `752` rostered, week 1 = `52` games. The injury report's newest stored snapshot was `10-07` (preseason gap); the probe read `78` rows from the known-good `2026-04-08` report.
- 🔑 **What the owner saw (`10-17 17:20 PT`: *"The legs look super clumped, is that the proper behavior!? ... Slips failed ... Be sure i am seeing is what I suppose to see"*; `17:44` *"focus on fix your issues, deeper pass"*; `17:47` header "Script error.").** Six UI faults were fixed (UI v1.4.8 to v1.4.10): the Slips screen threw "Can't find variable: multiplierLabel" because the function lived in the builder part while Slips loads only the pricing and slips parts (moved; test D10 opens Slips cold); the player profile showed movers on their old team (LeBron James signed with PHI in the 2026 offseason; `161` active players' last box score is for another team — the profile now uses the current roster team, the opponent-defender list uses the opponent's current roster, and an offseason arrival gets no false absence ramp; test C53); B2B/Rested and Home/Road cards showed season totals as averages (served per game; test C54); Home/Away dashes came from two client parts each defining a global `avgOf` (renamed); two different estimated lines (trend card vs Line Profile) became one estimate; suffixed players on Underdog backtest slips missed their board row until the UI got ONE normaliser (`common.normName` = `nba_ref.norm_name`); a missing probability showed "0%" (now a dash); a pushed leg (Kenrich Williams `9` rebounds on a `9.0` line, `2026-04-12`) now shows PUSH and "3/4 hit (1 push, paid as a 4-pick)". Every lazily loaded client part was scanned with a real parser (acorn plus eslint-scope). "Script error. (line 0)" is a browser-muted error from another origin's script, not ours; the UI test also runs in WebKit and foreign errors are logged, not bannered. UI end to end `98/98`, then `99/99` (Chromium default, Chromium `2026-03-10`, WebKit).
- 🔑 **"Clumped" probabilities are correct behaviour.** With no board yet the screen replays the last scored slate (`2026-06-13`, one Finals game); the number shown is the market-anchored probability whose isotonic second stage tops out at the rate the strongest legs actually hit out of sample (`77.1%` on that fit); in history, legs the raw model put at `85-95%` hit about `70%`. Ties are ordered by Overall score. The MODEL was never affected by the profile bug (the ladder builds each game's roster from the same-morning roster file).
- 🔑 **Slip concentration was measured and NOT changed.** On the 2025-26 live-loop replay the most-used leg sits in `83%` of a day's played slips on average (average `15.6` slips a day; at least `75%` on `106` of `152` days) and hit `67.1%`. This is how the certified engine builds a day (top-ranked legs per cell); the replayed ROI includes it. The owner's follow-up on `10-20 21:48 PT` ran the real test — see the opening-night sub-section below (exposure caps rejected).

### 10-17 18:38 PT — caps, compositions and portfolios at equal budget (UI v1.4.11)
- 🔑 **The owner's order (`10-17 18:38-18:42 PT`).** *"Backtest with the same amount in investment, less units on strategies with lots of slips and more units ... on elite strategies with less slips"*; *"Try different caps with the strategies, and see if different compositions and use caps can give any difference or improvement. Also anything that is test only, do not show on the slip screen, you can record them but as not played."*
- 🔑 **Rules fixed before results.** Chosen on one season and scored on the other (both directions); at least `150` slips; no 2-pick Flex; equal budget = the current six strategies' total stake at USD 1; winners confirmed by the live-loop replay (`audit_season_replay` with the research-only `AR_CAPS` override, rolled back; labels `s2526_cap2`, `s2425_cap2`, both PASS).
- 🔑 **Test 1, open search over every slip kind and cap (`nba/research_cap_composition.py`, window-only backtest) — REJECTED.** Chosen on 2024-25 it scores `+146%` on 2025-26 (two 6-pick weighted-rebounds kinds); chosen on 2025-26 it scores `+3%` to `+80%` on 2024-25 with max drawdowns `1,500-2,200` at equal budget (6-pick demon lottery slips). Not stable.
- 🔑 **Test 2, each current strategy's single best cap (selection season) — REJECTED:** `+75.1%` against `+79.0%` current, and `+31.1%` against `+46.0%`.
- 🔑 **Test 3, ONE stable pattern — ADOPTED later (10-18).** A_core_3power, A_wrebounds_4flex and D_points_3power each beat their then-current cap 3 at cap 2 in BOTH seasons (profit 2025-26 / 2024-25): A_core `+29.5 -> +34.4` / `+76.6 -> +90.9`; A_wrebounds `+40.2 -> +42.6` / `+72.6 -> +81.8`; D_points `+47.1 -> +48.1` / `+33.8 -> +34.4`. D_points rarely reached a third slip in the live loop (`68` / `91` slips), so its cap changes nothing there.
- 🔑 **Equal-budget table, ROI / profit / max drawdown (2025-26 now | 2025-26 caps 2 | 2024-25 now | 2024-25 caps 2).** All six: `+86.4%/2,029/76` | `+86.9%/2,039/75` | `+38.4%/777/151` | `+38.4%/776/154`. Five (no C_wstocks): `+90.7%/2,130/78` | `+91.9%/2,156/76` | `+42.8%/866/147` | `+43.4%/878/143`. Top 3 (A_regular, A_core, A_wrebounds): `+98.3%/2,308/89` | `+103.5%/2,430/119` | `+49.0%/991/173` | `+51.4%/1,039/192`. Top 2 (A_regular, A_core): `+103.9%/2,439/161` | `+110.2%/2,586/220` | `+58.7%/1,187/199` | `+62.3%/1,260/223`. Reading: caps at 2 help every portfolio in both seasons (all six: flat in 2024-25); fewer, stronger strategies raise ROI and equal-budget profit in both seasons at the price of deeper drawdowns. No production change was made at that point; the owner decides the portfolio and caps (decided `10-18 01:30 PT`, below).
- 🔑 **Test-only strategies leave the Slips screen (UI v1.4.11, test C56).** Shadow, paper and not-staked strategies and the Underdog engine while paper are recorded as not played and not shown; the screen says how many were recorded; betting-rule SKIPs stay visible. A DEPLOY GAP was found the same day: the deploy ships `alphadog-v2-nba-main-ui` only when its ENTRY file changes and the browser caches client parts by VERSION, so two `nba/main_ui` changes sat undeployed until VERSION was bumped. Rule: bump VERSION after any `nba/main_ui` change; new test C0b checks deployed VERSION equals the repo, every served client part is byte-equal, and no `nba/main_ui` commit follows the last bump. UI end to end `101/101`.

### 10-17 21:04 PT — losing streaks: can they be identified, prevented, adjusted, rotated?
- 🔑 **The owner's questions (`10-17 21:04 / 21:13 PT`).** *"deeply analyzing the loosing steaks, can it be identified? Preventable? Adjustable?"*; *"find positive strategies to runs instead during these streaks, but it need to be identified, so we now when to do so, instead of guessing."* Data: live-loop replays at caps 2 (`s2526_cap2`, `s2425_cap2`), top three strategies.
- 🔑 **Chance or regime?** Permutation of each strategy's day order (`10,000` times): A_regular_5power (wins `10-12%` of slips; losing runs of `21-27` days) and A_wrebounds_4flex streaks are ordinary luck (max-drawdown p `0.10-0.65` and `0.09-0.32`). A_core_3power clusters beyond chance in BOTH seasons (max-drawdown p `0.02` / `0.04`) — a real regime (its legs are steals / turnovers Unders).
- 🔑 **Twelve signals known before placing were tested on three strategies; only those pointing the same way in both seasons were kept.** A_core_3power: legs hit under `55%` over its last 5 days (`24` / `39` flagged days) gives `+24%` / `+1%` ROI against `+127%` / `+66%` on other days (permutation p `0.03` / `0.08`). A_regular_5power: after 3 straight losing days (`75` / `79` flagged days) gives `+37%` / `+29%` against `+229%` / `+158%` (p `0.02` / `0.06`). A_wrebounds: no signal (it rebounds after bad stretches). Flagged days are still positive, so skipping them gives up profit: the action is a half stake, not a skip.
- 🔑 **Adjust (equal budget, flagged days at half stake, rest scaled up).** A_regular profit `+249 -> +323` / `+172 -> +221`, drawdown `47 -> 38` / `33 -> 29`; A_core `+268 -> +288` / `+123 -> +141`, drawdown `24 -> 19` / `38 -> 34`. Better in both seasons.
- 🔑 **Rotate (`nba/research_streak_rotation.py`).** On A_core's flagged days the existing A_wrebounds_4flex returned `+82%` / `+62%` against A_core `+58%` / `+19%` on the same backtest basis — better in both seasons. R_stocks_4power (the drought rotation strategy) was NEGATIVE on A_core's flagged days in both seasons (`-10%` / `-42%`). An open search over every slip kind for flagged days does NOT survive cross-season scoring (chosen top-1 `+2.8%` / `+39.8%`; lottery 5-picks collapse) — REJECTED. On A_regular's flagged days no strategy beats staying in. Rotation was therefore not implemented as an engine rule (built later only as the OFF research option `shift_to` / `shift_cap`).

### 10-17 21:23 PT — streak flags built in (UI v1.4.12, COMPASS fact 166)
- 🔑 **The owner's rule (`10-17 21:23 PT`).** *"If they survive 2 seasons of they, they are usable, you can build them in. But be sure you have clear the flags when it start and when it stop. Research online deeper ... Once done again heavy simulation and testing."* Online grounding recorded: change-point detection on a running record (Page's CUSUM), fractional Kelly (cut the stake, not the play, when the edge is uncertain), pick'em correlation through game pace and blowout scripts (Stokastic), NBA prop guides on totals and spreads.
- 🔑 **Rejected in the follow-up (`research_streak_signals.py`, `research_streak_followup.py`; keep only if the same way in BOTH seasons).** Leg hit by game total or team spread, per cell and side: no cell keeps its direction. Two or more legs from one game against all different games: signs flip by strategy and season (A_core `-100%` / `+334%`). "An Under leg in a high-total game": same sign for A_regular with the `window` line, but DEBUG showed live NEVER captures a `window` game line, only P2B's `08:00` `morning` line; with the morning line the sign holds but p is `0.03-0.21`, Under legs themselves hit no worse in high totals (`66.4` vs `63.8%` / `57.8` vs `59.7%`) and the sign flips inside equal-Under-count groups — slip-level coincidence, not a mechanism. CUSUM with the other season's hit rate as target: the 2025-26 rate is higher, so the 2024-25 alarm sits on `137` of `143` days — a baseline problem, no information.
- 🔑 **The two simple self-referencing day flags, permutation of flagged days (`2,000` times) on all six strategies.** Only A_core (legs under `55%` over 5 days, p `0.037` / `0.090`) and A_regular (3 losing days, p `0.016` / `0.054`) hold in both seasons; on the other four they flip or are noise.
- 🔑 **Rule A_core_3power.** ON when its legs hit under `55%` over its last 5 PLAYED days this season; OFF the first day it is back to `55%+`.
- 🔑 **Rule A_regular_5power.** ON after it lost on each of its last 3 played days this season; OFF the day after its first winning day.
- 🔑 **How the flags are stored and shown.** Config `classification_config['streak_rules']` (`enabled` true; env `LS_STREAK_RULES` for replays); flags are computed at pick time from slips graded before the day; every pick writes each rule's state to `nba_score.live_streak_flags` (date, on, since, reason, acted, factor) and the strategy's slips carry `live_slips.streak_note`. The Slips screen (UI v1.4.12, test C57 for every recorded flag and note on engine slates, from `10-20`) shows both flags with start, reason and stop rule; the replay prints every ON spell. The engine shipped the rules "disabled by default" at `10-17 21:42` and they were then enabled.
- 🔑 **Action: stake x0.5 while ON — but a half stake below the minimum entry keeps the FULL stake.** At the USD 1 unit the flag is shown and changes no stake; it acts from a USD 2 unit.
- 🔑 **Replay with flags on** (`audit_season_replay`, caps 2, USD 2 unit; labels `s2526_streak`, `s2425_streak`, both PASS; scored by `research_streak_replay_score.py`, one replay holds all variants). Flagged played days: A_core `23` / `43`; A_regular `90` / `96`. Equal-budget ROI / max drawdown, base | half | +shift, 2025-26 then 2024-25: all six `+86.4%/71.7 | +88.5%/67.5 | +88.9%/68.2` then `+37.7%/142.2 | +38.1%/138.2 | +39.1%/136.0`; five (no C_wstocks) `+91.3%/64.7 | +93.9%/60.6 | +94.3%/61.2` then `+42.7%/132.6 | +43.6%/130.8 | +44.5%/124.7`; top 3 `+101.8%/37.0 | +110.5%/29.0 | +110.7%/30.0` then `+51.3%/69.6 | +54.9%/60.4 | +56.3%/64.4`; top 2 `+107.3%/46.0 | +122.8%/35.6` then `+60.2%/52.8 | +68.5%/47.8`. **Half stake on flagged days: ROI up and drawdown down in every portfolio in both seasons — ENABLED.**
- 🔑 **The shift (A_core's flag adds A_wrebounds slips) is built but OFF.** It adds only `+0.0..+1.4` points with mixed drawdown, measured only at A_wrebounds cap 2 (production cap then 3; k4 was the slot that failed in the cap study); env `LS_STREAK_SHIFT=on` for replays. It stays off until the owner's portfolio decision, which then replaced the strategies altogether (`10-22`).
- 🔑 **Debug found while building.** A scorer and the integration check read "x0.5 would be below the minimum: full stake kept" as halved; fixed in `research_streak_replay_score.py` and `integration_test_rollback.py`, and the numbers above are the corrected ones. Post-build: `certify_slip_system` 82 checks 0 FAIL, integration ALL PASS, `audit_release_path` PASS, UI end to end `101/101` Chromium and WebKit, deployed v1.4.12; `sim-slate 2026-10-20` recorded both flags off ("no played days yet this season") and 9 slips.

### 10-18 01:30 PT — the owner's plan: all six strategies at cap 2, the unit EARNED from USD 1 (UI v1.4.13 / v1.4.14, COMPASS fact 167)
- 🔑 **The owner's words (`10-18 01:30 PT`).** *"Let's go all 6 and earn the raise, auto calculated and auto preset on the my unit let's start with 1 dollar and raising by a 1 dollar each time it reaches 25x. Show me the simulation for this strategy only. How long would take to put the slips in?"*
- 🔑 **DECIDED: all six live strategies at caps 2** — A_core_3power, A_wrebounds_4flex and D_points_3power moved `3 -> 2` in `STRATEGIES`, `live_strategy_state.live_cap` and the UI mirror `nba_main_ui.pp_strategies` (the mirror still held 3 and failed test A2 until updated); calibration re-run through P4; streak flags on. A_wsteals_5flex stays at cap 9 (9 in every simulation; about `7.4` slips a day of about `14`). Replays on the new caps, all six: `+86.4% -> +86.9%` (2025-26) and `+38.4% -> +38.4%` (2024-25), max drawdown `76 -> 75` and `151 -> 154`.
- 🔑 **The EARNED UNIT rule.** Start `1`; `+1` when season profit is at least `25 x` the next unit; `-1` when the drop from the season high is at least `15 x` the unit (once a day, only on a day with no raise); maximum `15`; every season restarts at `1`. Config `stake_unit.auto` = {enabled, start 1, step 1, max 15, up_x 25, down_x 15}. Engine: `auto_unit()` after every grade (season profit = `unit_usd` x stake weight x unit profit of the played PrizePicks slips this season) and `refresh_auto_unit()` before every pick; `live_slips.unit_usd` holds the unit in force at pick; `nba_score.live_unit_history` records date, season start, profit, high, unit from/to and reason; the config's `unit_usd` is written by the engine and replays never write it (`LS_UNIT_NO_PERSIST`).
- 🔑 **Simulation before the build (`nba/research_earn_raise.py`).** 2025-26: `+24,854` on `28,023` staked (ROI `+88.7%`); unit 15 reached on slate day `22`; cash needed `20`; worst drop `931`. 2024-25: `+4,850` on `8,990` (ROI `+53.9%`); `92` slate days at unit 1; unit 15 only on slate day `126`; cash needed `223`; worst drop `599`; longest drought `67` days. `10,000` mixed seasons: median `+14,749` (P5 `+3,897`), `0.2%` losing. Every payout cut `20%`: median `+4,144` (P5 `-30`), `6.4%` losing. Cut `35%`: median `-5`, `51%` losing, but the unit stays at 1 (P5 `-388`).
- 🔑 **Live-loop replay with the production configuration (no overrides).** `s2526_plan`: `+25,121.75` on `28,417.25` staked, ROI `+88.4%`, unit path `1 -> 2` on `2025-10-27`, `-> 3` on `11-02`, `-> 4` on `11-04`, as simulated. `s2425_plan`: `+5,819.31` on `11,336.25`, ROI `+51.3%`. Both rollback `live_slips` 0 to 0, states unchanged, PASS. Observation: once season profit is far above `25 x 15`, a `15 x` drop steps the unit to 14 for ONE day and the next grade raises it back (seen in both seasons) — the step-down only protects early in a season; the owner's rule was kept as approved.
- 🔑 **UI and debug.** "My unit" shows the earned unit; the Slips screen states season profit, next raise and step-down point; a hand-set unit turns auto off and the Auto button turns it on (`/api/stake-unit`; PLAY uses each slip's own `unit_usd`); tests C51, C58, C50. Debug 1: the UI re-read the unit with the same SELECT right after saving and Hyperdrive's query cache served the OLD config — fixed with `now()` on reads and `UPDATE ... RETURNING` on writes (reads bypass the cache). Debug 2: the first 2025-26 replay was killed at `02:01 PT` by "terminating connection due to administrator command"; an outside process ended every client connection, which matches the MLB runners' preflight `pg_terminate_backend` on all client backends (MLB code untouched, production unaffected, replay re-run); rule: if a long replay dies that way, suspect that preflight and re-run. Config after tests: `unit_usd` 1, `auto.enabled` true; one production grade (`2026-10-17`, no slips) wrote the first `live_unit_history` row (hold at 1).
- 🔑 **How long it takes to place the slips (measured on replays).** About `14` slips a day (max `19`); about `63` leg entries but only about `14` distinct legs; about `13-15` minutes a day on PrizePicks, about `20` on a heavy day; by close capture `30-35%` of distinct legs had moved or been pulled (placing at posting time avoids most); `1-3` substitutions a day add `5-10` minutes; Underdog adds `5`; each further app `15-25`.
- 🔑 **P3 timing kept; early games first, late legs substituted (`10-18 12:53 PT`, fact 168; owner: *"So we go with 2 and sub late legs"*).** Measured on `nba_daily.injury_report_snapshots` (2024-25 and 2025-26, every team-game tipping `9:00 AM-12:30 PM PT`: `344` team-games, `87` days): between tip minus 75 and tip minus 30 minutes, `260` of about `1,800` listed players changed status (`120` became Out); between tip minus 30 and tip only `43` (`24` Out). An earlier P3 would take staler boards, lines and availability, and on a `7:30 AM` tip P2A could start before the prior night's box scores are final. DECISION: P3 stays at min(13:15, first tip minus 30) plus 1; no pipeline change. `40` of `156` slates have a first tip before `13:45 PT` (slips ready about 20 minutes before tip), so the owner places early-game legs first and substitutes late legs that move; a first tip at `14:30 PT` or later gives `60+` minutes.
- 🔑 **UI v1.4.15 to v1.4.17 (owner `12:55 PT`: *"put in placing order, so the right times ones first"*).** The Slips screen lists by Place by, earliest first (PLAY before skips at the same time; PrizePicks before Underdog; test C59). v1.4.16: the pre-season replay uses the latest slate the plan plays (`2026-04-04`), not `04-12` (the final-7 day; live stakes nothing in the last 7 days of the regular season; test C60). v1.4.17: the pre-season replay shows the LIVE engine's own slips from the production-configuration season replay (`nba_main_ui.replay_live.label`; shadow slips hidden; each shows what was staked, for example USD 15 at the earned unit; Underdog from the certified backtest; test C61). Why: the certified backtest puts every strategy at its cap on every slate, live does not — `2026-04-04` had 3 games, so the slate-size cap was 1 and live built 5 staked slips where the backtest showed 19. Six legs of that slate show no probability because the stored board predates later board fixes (disclosed on screen).
- 🔑 **Grader v3 replays (10-18 evening).** Season replays on grader v3 with the production configuration: `s2526_v3` `+24,059.87` on `28,369.25` staked, ROI `+84.8%` (was `+88.4%` in `s2526_plan`); `s2425_v3` `+3,998.70` on `7,996.75`, ROI `+50.0%` (was `+51.3%`; smaller stake because the earned unit rose later); both rollback `live_slips` 0 to 0, PASS. These replays are IN-SAMPLE (strategies were selected with both seasons visible). The payout proof itself, SLIPQ and the app-price work belong to the multipliers document.
### 10-18 to 10-19 — the board and the apps wired to the decision chain (only the strategy-relevant facts; details in the sibling documents)
- 🔑 **What is NOT built on purpose (owner-confirmed `10-08`, COMPASS 136).** The interface slip BUILDER and the engines still build PrizePicks, Underdog and Sleeper slips only; Fliff and Betr stay paper / price-shop boards; Betr slips are priced on Betr's own server after the pick (`probe_betr_quote_engine.py`, checked `11:56 PT` on 10-20). Sleeper / Fliff / Betr give no slips by design while their boards run under the engine's state machine until certified.
- 🔑 **Fliff and Betr to the final board (owner `10-19 17:30 PT`: *"ready and wired as the other apps ... every single step"*; UI v1.4.22).** `nba_main_ui.apps`, `dfs_books` and the documented line types gained fliff and betr (config, reversible) with filter groups; a Fliff leg shows its own decimal price (from American odds) and breaks even at 1 / decimal (`-120` is `54.5%`, `+105` is `48.8%`); Betr rows list as regular legs. Main-UI test `105/105`. Gap closed in P3: Betr never reached the scorer (its harvest archives `window` minutes after P3 scores and the scorer drops Betr's earlier rows once a window row exists), so a soft step `p3_wait_betr.py` waits (`classification_config['p3_betr_wait']`: `max_wait_s` 360, `poll_s` 15, stop 14 minutes before first tip).
- 🔑 **Betr PARKED (owner `10-19 22:51 PT`: *"Leave betr out for now, having that is bringing issues. And debug, simulate and test it separated and deeply"*).** Park = `p3_betr_wait.enabled` false (P3's Betr dispatch exits 0 with a notice; `score_board_legs.py` drops betr / betr_us_dfs) plus "betr" removed from `nba_main_ui.apps`; restore = set true and add "betr" back, nothing else. The A/B simulation (`sim_betr_ab.py`, rolled back, production verified empty) scored `8,920` legs with Betr on against `7,036` parked (`2,320` Betr legs dropped). Betr moves other apps' legs: `final_hp` changed on 0 legs but confidence and score moved on `2,052` of `7,036` non-Betr legs (`29%`; mean absolute score shift `0.4-0.7`, max `2.9`) because Betr is one of the corroborating books in `f_books = clip(books/4, 0, 1)`; on `1,062` legs both Betr and PrizePicks list the `final_hp` difference is exactly `0.00000`, so Betr adds lines and a corroboration count, not an independent price. Betr tiers and alternate rungs are filed as `<market>_alternate` with a NULL multiplier, so its break-even cannot yet be priced; the next test before un-parking is to capture tier and payout per leg and re-run the A/B. **Betr is parked in production; research-only use stays allowed.**
- 🔑 **Game-day chain run end to end and timed (`10-19 21:00-23:00 PT`; owner: *"run, score a full slate, a real simulation and understand timeline if it fits the deadlines we have. No more guessing"*).** `sim_p3_full.py` with `nba-sim-p3.yml` runs the real P2B model build and the real P3 chain in one shared rolled-back transaction. Measured for `10-20`: P2B `3,029 s` (about 50 minutes, `08:05` to about `08:56`) against P3 at `11:31`; P3 `839 s` of steps including a `365 s` Betr wait at its cap, ending about `11:46` (14 minutes before the 12:00 tip in the worst case; about `11:40` when Betr lands at once). A missing index `nba_market.board_tiers_v2_nm_idx` would have made each per-prop confidence query run 17+ minutes in the first game-day P2B; it was created concurrently. Cross-reference the workers and database documents.

### 10-20 (Tuesday) — opening night: rehearsal, the 11:40 PT slips, the anatomy of the loss, and what the owner asked next
- 🔑 **The plan.** Three games: BOS@DET `12:00 PT`, PHI@NYK `16:00 PT`, OKC@SAS `18:30 PT`. P3 at `11:31 PT` (min(13:15, first tip minus 30) plus 1); the engine refuses any post-tip pick on its own (`live_slip_engine.post_tip`, `§29z-d`). Sandboxed dress rehearsal on the real board: `2,187` scored PrizePicks legs, 0 unresolved, 42 players, 3 games; small slate so every strategy at cap 1; unit 1 (earn the raise); streak flags off (no played days); 9 paper slips across the 12 strategies (shadow strategies recorded as `placed_shadow`); `live_slips` for 10-20 = 0 after rollback. TRANSCRIPT (subagent of `10-20 15:08 PT`): the live set read from `live_slip_engine.py` was A_wsteals_5flex `weighted:steals_R` 5 Flex cap 9 (`+53.3` / `+86.9`), A_regular_5power regular 5 Power cap 2 (`+67.7` / `+153.2`), A_wrebounds_4flex 4 Flex cap 2 (`+41.6` / `+77.5`), A_core_3power core 3 Power cap 2 (`+31.0` / `+90.9`), C_wstocks_4flex 4 Flex cap 2 (`+23.5` / `+40.3`), D_points_3power `single:points_R` 3 Power cap 2 (`+48.1` / `+34.4`); not live: R_stocks_4power `single:stocks_R` 4 Power cap 1 (drought rotation only), W_core_3power and W_coredemon_3power (pre-All-Star week only; `+1.5` / `+23.2` and `-16.8` / `-0.8` on grader v3), B_demon_5flex and B_demon_3flex (cap 0, red shadow), A_core_5flex (retired, `58%` identical to A_wsteals). ROI is 2024-25 / 2025-26 on the window-only twin after grader v3 (source `PP_PAYOUT_FINDINGS` `§0l`, `research_grader_v3_impact.py`). **This six-strategy staking set was SUPERSEDED for PrizePicks on `10-22 14:38 PT` (2-slip portfolio) and `10-25` (Portfolio B), below.**
- 🔑 **Goblin / demon Less and standard Flex go to forward PAPER (owner `10-20 15:06-16:26 PT`: *"exhaustive revision of every leg type and multiplier, huge samples, always 2-6 picks Power and Flex"*; *"if the multipliers sustain to keep it positive ... anything that's proved positive, we will try"*).** Exhaustive composition search with alternate Less (`research_exhaustive_pp.py`, `EX_ALT_LESS=1`): `18,551` patterns x 2 structures, out of sample in both directions: `9,909` of `37,102` pattern-structures are positive both ways; the top Power patterns stack goblin Less (R_REB_O + 5 UG `+582%` / `+336%`; 6 UG Flex `+274%` / `+130%`); selected goblin-Less legs hit `0.45-0.47` against a priced about `0.34`. Nested selection (choose on one season, play the other) STILL FAILS: in-sample `+190%` to `+470%` becomes out-of-sample `-1%` to `-53%` — rejected as a selector, hence FIXED rules (`research_altless_strategies.py`: families A fixed depth, B other-season cell order, C plus standard Unders, D two slips a day; sizes 2-6, Power and Flex; both seasons, none dropped).
- 🔑 **The forward paper tracker (`nba/paper_altless_tracker.py`, modes pick / grade / report; table `nba_score.paper_altless_slips`).** Status `paper`, never placed, never on the Slips screen, one set per slate per family. P3 soft step `soft_paper_al` picks after the Underdog paper pick; P2A grades and prints the running report. Two families: AL_* (goblin / demon Less on points, PRA, rebounds, assists, tiers 1-3, legs ONLY where PrizePicks' window board opened Less, depth rmin up to 2 by reverse rank, price from the Less law, sizes 2-6, at least 2 games, at most 2 legs a game) and SR_* (the `9` standard Flex rules out of `585` whose bootstrap LB5 is above 0 in BOTH seasons; `research_standard_depth.py`, `244,670` graded standard legs; all are 5- or 6-pick Flex: baseline_hp Over top 2/3/5/10 5F; baseline_hp both top 2 5F/6F; baseline_hp Under top 3 6F; final_hp Under top 2 5F; final_score Under top 1 5F). Per-rule ROI list (2024-25 / 2025-26, from the tracker's comments): baseline_hp both 2 6F `+90.8` / `+78.8`; Over 3 5F `+39.0` / `+36.0`; Over 2 5F `+49.4` / `+36.5`; Over 5 5F `+37.4` / `+35.5`; Over 10 5F `+37.1` / `+35.5`; both 2 5F `+32.7` / `+70.1`; Under 3 6F `+69.4` / `+70.2`; final_hp Under 2 5F `+31.9` / `+30.8`; final_score Under 1 5F `+35.0` / `+59.5`. Certified by `audit_paper_altless_tracker.py` (rank parity `100%` inside the tie interval, grade parity `40/40`, standard legs parity `908/908` and `772/772`, stat expressions `4,113/4,113`). The `10-20` archive holds NO alternate Less rows (the filing landed after that run); first real picks are the `10-21` window. Certified pick untouched: `live_slip_engine` BOARD_SQL already excludes alternate Less legs.
- 🔑 **Regular-line 2-pick Flex measured, NOT positive (owner `10-20 17:04 PT`).** 2-pick Flex pays `2x` / `0.5x`, so EV = p squared plus p and the leg rate needed is `0.618` against `0.577` for 2-pick Power. Exact break-even leg rates, sizes 2-6: **2F `0.618`, 2P `0.577`, 3F `0.577`, 3P `0.550`, 4F `0.550`, 4P `0.562`, 5F `0.543`, 5P `0.549`, 6F `0.542`, 6P `0.547`.** No standard cell holds `0.618` in both seasons with n of at least `100`; the best both-season cells are steals both top 1 (`0.605` / `0.594`), pts_ast Over top 1 (`0.593` / `0.615`) and points Under top 2 (`0.593` / `0.606`). EVERY 2F rule lost in both seasons (best final_hp both top 2 x5 a day `-3.9%` / `-3.4%`). Cross-season and trailing selectors (30 / 60-day trailing leg rate at or above break-even) are positive in 2025-26 and negative in 2024-25 at every size — NOT certified. Under beats Over at every depth (top 2: `0.558` / `0.590` against `0.546` / `0.561`). Owner screenshots that evening showed two standard 2-picks at different Power prices (SGA + Wembanyama fantasy Less `2.9x`, Dort + Carter steals Less `3x`, both same-game pairs) — an open quote item that became the same-game Power rule (multipliers document).
- 🔑 **The board after every tip (owner `19:44 PT`, UI v1.4.25).** "Showing 0 of 148 qualified legs": started games were hidden only by the browser, so the server count kept them; the filter-count endpoint never applied the unplaceable-Underdog screen (`569` of `1,307` Underdog legs on 10-20 were counted but never shown). Fix: on a LIVE slate a leg whose game has tipped is left out of the board AND the counts; when every game has started the board says so and names the next slate; new check D00; UI test `105/105`.
- 🔑 **10-20 outcome, graded by hand from live box scores (owner `20:37 PT`: *"grade it manually with live results and understand what went wrong"*).** Finals BOS 113 @ DET 121, PHI 106 @ NYK 100, OKC 116 @ SAS 104. PrizePicks (all paper in opening weeks, nothing staked): `8` slips, one paid `1.5x` (A_wrebounds_4flex 3 of 4), one paid `0.4` (A_core_5flex shadow 3 of 5), the rest lost; distinct legs `9/16` (`56%`): Unders `8/10`, Overs `1/6`. Underdog (paper): `4` slips, all lost; Jaylen Brown rebounds Under 5.5 (actual 8) was in all four. Causes: (1) concentration — Pritchard turnovers Over 1.5 (actual 0) in `5` of `8` PrizePicks slips; (2) Overs `1/6`, including two Daniss Jenkins lines on `15.3` minutes and a pulled VJ Edgecombe threes demon; (3) Wembanyama stocks Under 4.5 (actual 7) in `3` slips, model `0.956` against market-anchored `0.673`. Sixteen legs are one day: `56%` is inside the noise of the certified `61-65%` leg rate; always count DISTINCT legs (`115` replay slip-legs of steals Under were only `11` distinct legs).
- 🔑 **Model against market, two seasons (`research_model_market_gap.py`).** On ALL graded PrizePicks legs the realized rate follows the market-anchored number, not the model: model at least `0.80` and gap at least `0.20` hit `0.545` (2024-25; model `0.844`, anchored `0.606`) and `0.601` (2025-26; `0.838` / `0.592`); gap below 0 hit about `0.70` in both. **But on the legs the certified cells actually pick (replay v3, unique legs) a gap of at least `0.15` hit `0.522` against `0.527` below (2024-25) and `0.554` against `0.577` (2025-26) — the cells' selection already removes most of the problem, so a blanket gap cap is NOT supported.** Consistent in both seasons only for: threes Over big gap `0.319` / `0.412` against `0.450` / `0.521` (worse); stocks Under big gap `0.561` / `0.602` against `0.584` / `0.616` (slightly worse); turnovers Under and points Under big gap BETTER in both. A model-market gap above about 8-10 points as "likely model error" (an agent's self-labelled rule) is contradicted for the picked legs by these figures.
- 🔑 **Same leg in many slips, and the Over minutes floor (owner `10-20 21:48 PT`: *"Research online and ground your proposed fixes, simulate and test them ... they need to prove successful before deploying. We clearly have a correlation issue in many players on many slips"*).** TRANSCRIPT (subagent of `10-20 21:48 PT`, web research): every slip holding a leg is one more bet on it (simultaneous Kelly — MacLean-Thorp-Ziemba; Thorp and DataGolf size correlated bets down); DFS optimizers cap player exposure with no universal number (Stokastic, FanGraphs, Footballguys) and concentration costs little EV only when the next-best legs are close in edge; minutes risk for Overs (RotoGrinders, Action Network); market-versus-model blending (Kaunitz et al.; Hubacek and Sir — a less accurate model can still profit if its errors are decorrelated from the bookmaker's, helps unit-stake and fractional Kelly but not full Kelly). Harness `research_slip_exposure.py` runs the production pick on every slate of both seasons; the rule was written BEFORE the run: in BOTH seasons ROI at least base minus 2 points, max drawdown not above base, net / drawdown not below base, bootstrap LB above 0; sanity 2025-26 base `+84.5%` against the production replay `+84.8%`; the first 2024-25 run treated every day as a small slate (`slate_games` does not cover 2024-25) and was re-run.
- 🔑 **Exposure caps REJECTED.** Leg in at most a half or a third of a strategy's slips, leg in at most `3-6` slips a day, player in at most `4` or `6` slips a day, and combined: ROI `-13` to `-28` points (2025-26) and `-9` points (2024-25, G4). Replacement slips use clearly weaker legs; concentration raises day-to-day swings but is NOT negative EV. Core / regular at cap 5, sizes 2-6, Flex and Power, base against "each leg in at most 2 of 5": lower ROI at most sizes in both seasons. The code stays in `live_slip_engine` (`slip_exposure`; NO DB row means OFF) for research only. Later the portfolio study (`10-25`) confirmed the same lesson for Portfolio B: caps and exposure limits mostly HURT because they cut the strongest slips.
- 🔑 **Threes-Over model-vs-market gap filter REJECTED.** T15 gives `-6.7` points in 2025-26 and `+22.3` in 2024-25 (flips sign); T20 fails both.
- 🔑 **Over minutes floor ADOPTED (deployed `10-21 03:25 PT`).** Sensitivity over `18-28` minutes: M22 is the ONLY threshold passing both seasons (2025-26 ROI `+4.2` points, drawdown `67.5 -> 56.2`; 2024-25 `+2.4` points, drawdown `-8.5`); `20-26` all lift ROI in at least one season with no collapse. Full production replays (`audit_season_replay`, `AR_OVER_MIN=22`, rolled back, PASS): 2025-26 baseline `+1,776.5` on `2,082.0` staked, ROI `+85.3%`, max drawdown `73.0`; floor 22 `+1,831.2` on `2,071.0`, ROI `+88.4%`, drawdown `49.7`. 2024-25 baseline `+536.2` on `1,598.5`, ROI `+33.5%`, drawdown `134.3`; floor 22 `+637.2` on `1,730.0`, ROI `+36.8%`, drawdown `127.0`. Better on net, ROI and drawdown in both seasons. Config `classification_config['over_minutes_floor']` = {enabled true, min_avg 22, games 10}; rule (`live_slip_engine.over_minutes_filter`): an Over leg is left out when the player's last-10-game minutes average is under `22`; no history keeps the leg; OFF = `enabled` false. `audit_over_minutes_floor.py` AUDIT_PASS: on the 10-20 board it removes one Over (Miles McBride PRA-assists Over 7.5); it would NOT have removed Daniss Jenkins (last-10 average `29.3` minutes) — a proven average improvement, not a fix for that one night.
- 🔑 **A simulation artifact worth remembering.** The `10-20 20:56 PT` tomorrow simulation was `23:56` Eastern, still 10-20 there; the archive labels `window` for today's Eastern games only, so every 10-21 row became `routine` and the pick refused (correctly). Rule: start such simulations after midnight Eastern. The re-run at `21:40 PT` passed: P2B certify `7/7` (108 minutes), P3 certify `9/9`, P3 11 minutes (`13:16-13:27`, 152 minutes before the 16:00 tip), `21` PrizePicks and `6` Underdog paper slips.
- 🔑 **Online grounding recorded for the staking story (kept out of the engine).** Kaunitz et al. (consensus implied probability, bet when best odds beat 1/(consensus minus 0.05); real-money return `8.5%` on `265` bets, combined 2016 p `0.089`, not significant; books limited stakes within months); half-Kelly stake weights, re-ordering legs within cells, an open cap / composition search, star-Under exclusion, same-team-first ordering (same-team pairs `+3%` against `-8%` cross-game and `-40%` opposing-team in droughts, rejected by the side-table rebuild) and a generic p x m price gate were all tested and not adopted in the earlier phases; the adopted sizing rules are the half stake on star-line Unders, the streak flags at x0.5 and the earned unit.

### 10-21 (Wednesday) — day two: the Slips screen rules, the missing leg, the goblin substitute, and Underdog's new pricing
- 🔑 **Live 10-21 result.** PrizePicks `16` placed units, `+2.7` total: A_core `+4.0`, A_wsteals `+3.2` (8 slips, all paid), A_wrebounds `-0.5`, A_regular `-2.0`, C_wstocks `-2.0`. Underdog paper: `4` slips, `-3.5` of `3.5` staked; over two days `8` of `8` Underdog slips lost. The paper Less tracker graded `19` slips.
- 🔑 **Slips screen rules changed (COMPASS fact 176).** Re-saving replaces: a same-day re-save overwrites with the newer multipliers and a graded slip is left alone (v1.4.31; owner `15:03 PT`; test C16). Substitutes keep line type: the backup pool is +EV legs ranked by edge over each leg's OWN break-even with every line type kept, so unchecking a leg brings a substitute of the same type, best edge first (v1.4.33; owner `15:22 PT`: *"When I removed the leg ... it put a goblin instead"*; root cause: the pool was ranked by hit probability alone, so the first legal leg was nearly always a goblin, cutting a regular slip's payout); a substitute is never the opposite side of a player already in the day's slips. A PrizePicks slip PrizePicks did not quote is flagged red with the missing leg and leads the day's note (v1.4.34): Keyonte George Turnovers 2.5 was a REGULAR line in the `13:19 PT` window capture but demon-only (More only) at the `13:30` quote, in all `17` slips. Open: re-check every leg against the live board right before slips are published (not built). The Overview is off on the server (`nba_main_ui.overview.enabled` false, v1.4.32) until its query is proven under the time limit; the place-by team lookup compared player ids as text (bigint fix; `HARD_QUERY_TIMEOUT` on the Slips screen). Owner-typed multipliers differ from ours because Al Horford 3-PT Made 1.5 More is a demon (factor `1.373`) in most slips.
- 🔑 **Counterfactual on this season's lines and Underdog's new pricing (scripts `research_line_regime_impact.py`, `research_ud_pricing_regime.py`).** PrizePicks' lower points and combo lines cost D_points_3power the most (`+47.6 -> +33.2` and `+33.8 -> +26.0`, ROI % in two seasons); the rest move `0-7` points. Underdog exchange pricing (m = 0.5 x the exchange decimal; m x books no-vig = `0.465`) cuts the P5 portfolio from `+56.0` / `+74.1` to `+29.5` / `+46.5` and turns mains 6-Flex and 6-Standard NEGATIVE.
- 🔑 **Regrade after the apps' own prices (owner `19:51 PT`).** Underdog 4-pick Flex `7.2` plus floor `2`; PrizePicks same-game 2- and 3-pick Power (`power_same_game_v3`); regraded in place with old values kept. Replays (stake-weighted, rollback verified): 2025-26 `+91.3%` (was `+91.4%`); 2024-25 `+40.2%` (was `+40.3%`).
- 🔑 **P2B refit overran its budget (red to yellow).** The `10-21` refit hung on one query (`11:13` to `13:03 PT`) and was terminated; P3 rebuilt `final_hp` on the previous confidence model (`25,208` legs). The fix (market aggregates as indexed temp tables built once) is in the workers and database documents.
### 10-22 (Thursday) — day three: every strategy re-scrutinised; Underdog under today's pricing; 2-, 3- and 4-pick Flex again; the 2-slip portfolio goes live
- 🔑 **The owner's order (`10-22 09:12 / 09:13 PT`).** *"sharp those logics ... Underdog, see if there is anything that's proven to be positive"*; *"check both P2A and P2B. And make sure that everything's ready for P3 ... deep scrutiny to see if those pipelines are doing everything that they should be doing."* P2A and P2B of 10-22 certified green (operational details in the workers document).
- 🔑 **Underdog under today's pricing (`research_ud_price_aware.py`, `research_ud_price_robust.py`; `387,587` legs of two seasons with the books' no-vig; Underdog re-priced at m = round(0.465 / nv, 2)).** The market-free model carries information the books do not (logistic z `+19..+33` in every season and kind). Today's price-blind ranking (the live engine's) re-priced is NEGATIVE in 2024-25 at every size (2S `-9.9%` ... 6S `-30.9%`) and positive in 2025-26. Ranking by calibrated return p_hat x m is positive in both seasons for many compositions (2S k1 `+15.8` / `+25.2`; 3S k1 `+23.1` / `+46.1`; 4S k1 `+26.4` / `+55.2`; 5S k1 `+76.0` / `+26.9`, 2024-25 / 2025-26) but only `2` of `533` rules have a positive 5th-percentile ROI in both seasons. With Underdog's real price dispersion (sd `0.035` of m x nv, measured on `1,152` sides) and K `0.455-0.475`, `151` of `324` rules stay positive on every draw and walk-forward picks hold out of season `10/10` both ways. CAVEAT: that gain assumes Underdog's deviations from books are noise; on 10-20/21 the `120` "generous" sides hit `0.458`, equal to Underdog's own `0.461` and not the books' `0.502` — the trusted number is the noise-free one. Recommendation (the owner's call; nothing changed live that morning): stop real Underdog entries until a price-aware engine (p_hat x the board's m, model plus books blend, 2-4 picks) is built, run as paper and certified on live prices.
- 🔑 **PrizePicks and the books (`research_pp_market_info.py`, `research_pp_market_filter.py`).** At leg level the books' no-vig still adds information to live `final_hp` (standard z `+6.9` / `+4.7`, goblin `+3.8`, demon `+5.4`), and `final_hp` was over-confident on standard legs (stated `0.71` hit `0.55-0.57`). Inside the slips the strategies actually take, most legs have no book line at that rung and the agree / disagree split flips between seasons: no filter supported, strategies stay as certified. Recommendations: PrizePicks no change; keep D_points_3power under watch (largest line-shift loss).

#### 2-, 3- and 4-pick Flex — everything again (owner `10-22 10:16 PT`)
- 🔑 **The owner's order.** *"aim for 2, 3 and 4 pick flex ... which prop line strategy ... both seasons ... the last 2 days ... all demons, all goblins, regulars, all prop lines ... all goblin and demon tiers ... no exception ... if you are not sure about the multipliers, go to PrizePicks, build slips, get the multipliers."*
- 🔑 **Multipliers proven against PrizePicks' own quotes first** (`research_pp_flex_payout_proof.py`, `research_pp_flex_payout_overpay.py`): all `4,236` NBA lineups of 2-4 picks PrizePicks priced for us were re-priced by our grader. All-standard 2/3/4 Flex and Power (`57/45/28` quotes) never exceed PrizePicks; Flex exact; Power exact except where the conservative same-game rule pays less (median ratio `0.96-1.00`). Flex with goblins / demons (conservative): 2-pick all-hit at or below PrizePicks on `99.1%` (mean ours / PP `0.921`), one-miss `100%`; 3-pick all-hit `88.3-88.7%` (mean `0.96`), one-miss `96.5-98.3%`; 4-pick all-hit `89.8-91.7%` (mean `0.90-0.92`), one-miss `95.3-95.8%`. **Every Flex number is a LOWER bound of what PrizePicks pays.** RED: Power WITH alternates over-pays on big demon stacks (3-pick fp `15-78`: `+5..+130`, for example `380` against `250`; 4-pick fp `27-259`; 2-pick fp above `10`), so any backtest of multi-demon Power is overstated; below fp about `5` Power is at or below PrizePicks. The production grader was NOT changed (capping `power_alt_v3` at the quoted envelope is the owner's call).
- 🔑 **Definitive run (`research_pp_flex234.py`).** One grader for every slip (grader v3 plus 2-pick Flex alternates priced from PrizePicks' 2-pick quotes, conservative envelope); data 2024-25, 2025-26 (final 7 days out) and LIVE `10-20` (`2,193` priced rows, all graded) and `10-21` (`8,505` rows, `8,448` graded; `57` left are players not yet on the 2026-27 rosters). Re-graded history slips (`103,774` `_wo` plus `101,170` `_wo_nosteals`) equal the stored payouts exactly where both exist.
- 🔑 **2-pick Flex: NOTHING works.** Best single `single:steals_R` cap 1 `+0.8` / `+11.2%` (lb `-10.8` / `-0.0`); `0` of `78` bucket patterns positive both directions out of sample; `0` of `737` single cells hold.
- 🔑 **3-pick Flex: NOTHING holds.** Every composition has a negative 5th percentile in 2024-25 (best core / `weighted:steals_R` / `weighted:assists_D1` no-steals cap 2 `+21%` / `+21%`, lb `-0.2` / `+5.7`); `0` of `364` patterns and `0` of `511` cells hold.
- 🔑 **4-pick Flex: `25` compositions hold** (positive in both seasons, lb5 above 0 in both); in the half-season check (H1 = before Jan 15) `15` of them are positive in 4 of 4 halves. Leaders (2024-25 / 2025-26 ROI): `_wo weighted:threes_D1` cap 2 `+41.1` / `+68.8%` (halves `+24.9/+57.9/+71.2/+66.1`; live `4` slips `+262%`); `_wo_nosteals weighted:assists_D1` cap 2 `+48.0` / `+44.1%` (halves `+20.9/+76.2/+21.3/+70.0`); `_wo_nosteals weighted:rebounds_R` cap 2 `+28.9` / `+48.6%`; `_wo_nosteals regular` cap 2 `+22.4` / `+59.6%`; `_wo core` cap 2 `+37.0` / `+76.1%`; `_wo weighted:stocks_R` cap 2 `+34.9` / `+49.4%` (the last four hold 4 of 4 halves). Live A_wrebounds_4flex (`_wo weighted:rebounds_R` cap 2) `+40.3` / `+76.7%`, lb `+9.6` / `+49.2`, holds in 3 of 4 halves (2024-25 H1 `-1.5%`). Live C_wstocks_4flex (`_wo_nosteals weighted:stocks_R` cap 2) `+21.2` / `+37.5%` does NOT hold (2024-25 lb below 0) while the same cell on the steals-included pool holds 4 of 4. Power: 3-pick `single:points_R` (D_points_3power) holds 4 of 4 halves at every cap (`+42.9` / `+39.4%` at cap 1); `11` 4-pick Power compositions hold.
- 🔑 **Honest scope.** The compositions were chosen on these two seasons, so the per-season numbers are not out of sample. Out of sample (bucket patterns and single cells valued on the OTHER season) nothing holds at any size, Flex or Power. The 2026-27 slates are the only true out-of-sample record (two slates, 1-3 slips per strategy: they can contradict, never confirm).
- 🔑 **Alternate Less labelling and price (affects what "Less" means in every table).** PrizePicks names a Less alternate by its RUNG (goblin Less = a line below the standard, quoted `1.45-2.5x`; demon Less = above, about `0.80x`); the archive names it by DIFFICULTY, the opposite word, so research live labels were flipped to the rung convention (history UG = Under on a goblin rung). The archive's model price for a live Less leg sums with its More twin to `1.046-1.050` (`2,399` pairs) while PrizePicks' own quotes sum to `0.980` (demon rungs, `46` pairs) and `0.989` (goblin rungs, `29`): the archive pays Less legs `5-15%` BELOW PrizePicks (ranking and UI value only; PrizePicks pays its own price). Research keeps PrizePicks' law (S `0.99`, x`0.97`); at the archive's `1.049` no Less cell or pattern holds (best `+4..+16%`, lb5 below 0). At PrizePicks' law the assists hard Less (UG1 Under, PrizePicks "goblin Less") is the one leg class above every break-even in both seasons (edge `0.60-0.68`, hit `0.42-0.50` at about `1.35-1.45x`); as slips `+17..+42%` (2024-25) and `+56..+99%` (2025-26) but the 2024-25 lb5 is below 0 (`57-140` slips); live `3` legs, `1` hit; the paper tracker had one slate graded with all 2-4-pick slips lost or partial.
- 🔑 **Recommendation (the owner's call; nothing changed live).** Concentrate PrizePicks on 4-pick Flex; candidates `weighted:threes_D1` 4-Flex cap 2 (steals-included pool) and `weighted:assists_D1` 4-Flex cap 2 (steals-free pool), both 4 of 4 halves; C_wstocks_4flex is the weakest live 4-Flex; no 2- or 3-pick Flex strategy should be staked; any change goes through the usual paper gate before a unit is staked.

#### Portfolio mix (owner `10-22 11:58-11:59 PT`) and the DECISION of `14:38 PT`
- 🔑 **The owner's scope.** 2- and 3-pick POWER, 4-plus-pick FLEX; *"mix them ... more slips, less slips ... cap legs at one / two / three slips."* (`research_pp_portfolio_mix.py`, leg key and player key runs.) Mixed = a round robin over units, N slips a day, a leg in at most L slips.
- 🔑 **Results (2024-25 / 2025-26).** 2-Power: nothing holds (best `weighted:turnovers_R` `+16.5` / `+44.1%`, lb below 0 in 2024-25). 3-Power: `12` hold (`single:points_R` 4 of 4 halves; `weighted:rebounds_R` cap 2 4 of 4). LIVE NOW (A_wrebounds 4F, C_wstocks 4F, A_core 3P, D_points 3P) N8 no cap: `+34.5` / `+59.9%`, max drawdown `92` / `41` units. PROPOSED (threes 4F, assists-no-steals 4F, rebounds 4F, stocks 4F, points 3P, rebounds 3P) N8 no cap: `+39.5` / `+57.0%`, drawdown `74` / `36`. PROPOSED N4 L2: `+42.6` / `+53.1%`, lb `+22.1` / `+37.0`, drawdown `37` / `23`, 4 of 4 halves (best lower bound at useful volume); L1 (no shared leg) leaves about `2.4` slips a day at `+32` / `+47%`. More slips raise drawdown faster than profit; adding 2-Power to the mix improves nothing.
- 🔑 **Today against the seasons (`research_pp_today_profile.py`).** The slip profile (prop mix, tiers, Under share, price, same-game share, overlap, player spread) of 10-20, 10-21, 10-22 sits closer to 2025-26 than to 2024-25 for every portfolio (distance: LIVE NOW `0.56` vs `0.77`; PROPOSED N8 `0.78` vs `0.91`; N4 L2 `0.90` vs `1.01`). Today had 2 games, every slip same-game, defensive legs `68%`. The early-season record of 2025-26 (the season it resembles): first 14 days `-12` / `-13` units (N4 L2, LIVE NOW); first 30 days `+20` / `+51`.
- 🔑 **Back-to-back losing days (`research_pp_losing_streaks.py`).** Each unit alone: `10-13` days (2024-25) and `6-12` (2025-26); PROPOSED N4 L2 `8` / `6` days; LIVE NOW `8` a day `16` / `6`.
- 🔑🔑 **OWNER DECISION `10-22 14:38 PT`: PrizePicks plays 2 slips a day in total (n 2, leg cap 2).** Backtest `+49.0%` / `+56.3%` ROI, max drawdown `21` / `11` units (2024-25 / 2025-26). `live_slip_engine.PORTFOLIO_UNITS` in order: `threes_D1` 4-Flex, `assists_D1` 4-Flex (steals-free pool), `rebounds_R` 4-Flex, `stocks_R` 4-Flex, single `points_R` 3-Power, `rebounds_R` 3-Power; `portfolio_select` (round robin: k1 of every unit, then k2, no repeated slip, a leg in at most 2 slips) is placed AFTER the strategies. The replaced strategies (A_wrebounds_4flex, C_wstocks_4flex, A_core_3power, D_points_3power) now build SHADOW only (`pp_portfolio.replaces`; status `placed_shadow`) and are not shown; the 5-pick strategies are unchanged (owner: no preference, kept as certified); Underdog went back to paper and hidden (`stake_unit.ud_play` false). Tunable `classification_config['pp_portfolio']` (`enabled` true, n 2, `leg_cap` 2; false restores the previous rule). Certified: a dry run on 10-20..22 and the production `pick()` on `2025-11-15` and `2026-01-10` inside a rolled-back transaction (n at most 2, replaced never staked, ledger restored) — ALL PASS. Placed that day without touching any scheduled task (owner: *"put it today"*): the day's `3` placed slips of replaced strategies set to `placed_shadow`; manual P4 pick placed `P_wthrees_4flex` k1 and `P_wassists_4flex` k1; slip quotes dispatched. The research build of that day first omitted the engine's Over-minutes floor (22 minutes); the engine slips are the ones staked. Open at the time: the edge monitor and hurdles do not yet cover the P_ units.
- 🔑🔑 **THE QUOTE GATE (owner `10-22 14:52 PT`: *"whatever shows there, I put ... don't let anything that's not allowed go on that screen"*; `15:22 PT`: *"be sure you are reading and mapping properly the multipliers"*).** Found: that day's two portfolio slips were same-game demon slips PrizePicks CUT (quotes `6x` against the backtest `6.66x`, and `7x` against `9x`) yet the screen showed PLAY. Hidden at `14:52 PT`: every non-portfolio PrizePicks strategy in `pp_portfolio.replaces` (shadow) and Underdog (`ud_play` false). Built: (a) `live_slip_engine.pick()` records `pp_portfolio.backups` (4) extra portfolio slips in round-robin order as `placed_backup` (graded `graded_backup`; staked profit reads status `graded` and `graded_void` only, so backups never count as staked); (b) `nba/apply_quote_gate.py`, the step "Quote gate" of `nba-pp-payout-map.yml` (mode slipq) right after PrizePicks quotes every placed and backup slip: a slip FAILS with no quote, status other than 200, a leg not on PrizePicks' board as built, no all-hit payout, or an all-hit payout below `pp_portfolio.quote_min_ratio` (`0.95`) x our `build_slip_engine.pp_payout`; walking k then unit order, the first n passing stay `placed`, a failed placed slip becomes `placed_quote_skip` (graded `graded_quote_skip`), passing extras stay backups, the step is idempotent and warns when fewer than n pass; (c) Slips screen v1.4.38: a PrizePicks PLAY slip with no quote yet says "SKIP - waiting for PrizePicks' quote" and is hidden (the note counts them), backup and quote-skip statuses are SKIP and hidden; a slip with a pulled leg is never PLAY and is not shown (v1.4.37). Certified: dry run on 10-22 (both slips FAIL on the ratio, nothing written) and `pick()` with backups on the two history dates (2 placed plus 4 backups a day) — ALL PASS. The rule "only slips whose PrizePicks quote passes may be staked" is the owner's slip-screen rule applied to price; 10-22's two rows were left as they were and the gate was live from the next P3 (10-23).

#### 10-22 afternoon — board profiles: three tests FAIL out of sample (owner `15:12`, `16:23`, `16:33 PT`)
- 🔑 **(a) `research_pp_board_profiles.py`** (games x phase x strength / demon cells, preset per cell): in-sample great; out of sample 2025-26 to 2024-25 `+4.5%` / `+16.8%` with `63-66` unit drawdowns and `28`-day losing runs, against the live portfolio `+49.0%` (drawdown `20.5`, run `9`).
- 🔑 **(b) `research_pp_board_profiles_v2.py`:** `2,929` strategies (leg-built over 12 props and groups x line type x side x 2-6 picks x Flex / Power, engine units, the portfolio; KNN and hard-cell selection; staged gate). STAGE 1 (first half to second half of each season) FAILS for every method (selection drifts to 6-pick Power / Flex jackpots); stage 2 (season to season) FAILS for every method. Stage 3 (leave one month out, 13 months): portfolio `+319.6` units / `+52.4%`; KNN K10 `+62.3`, K20 `-44.7`, K40 `+326.6` (beats the portfolio in 6 of 13 months); hard cells `+443.3` / `+107.1%` (7 of 13 months) but with months of `-57%` / `-31%` and 6-pick Power picks (owner rule: 4-plus picks Flex only). By the staged rule it does not advance: board shape alone does not choose strategies.
- 🔑 **(c) Research sources and hypotheses.** Kirch 2013 (NBA week-1 totals unders `58.2%`); Dare, Dennis and Paul 2015 (opening lines err when a player is absent; closing efficient); Wizard of Odds (prop hold `4-6%` stars, `6-10%` secondary, `10-20%` exotic); Unabated / Stokastic (compare pick'em with the de-vigged book probability against the entry break-even; Flex 6 about `54%`, 2-Power about `58%`); a Gemini practitioner summary (news windows, low-count props, role players, alt-line pricing) gave hypotheses H1-H4, probed in `research_board_market_probe.py`. Results: PrizePicks' standard line sits on the market's 50/50 (`98%` of lines with a same-line consensus have fair probability `0.50-0.54`; the market's better side hits `51.0-51.6%`, n about `100k`); leans of at least `0.54` are `1-2%` of lines and hit `54-55%` (2025-26) and about `50%` (2024-25). Opening days 1-3: the market lean hit `54-56%` (24-25 / 25-26), live 10-20 `57%` (n 54), 10-21 `52%` (n 60), modestly better than the rest of the season (`51%`); H1 opening Unders NOT stable on props (SCORE Under `54.5%` / `46.9%` / live `56.5%`); H2 role against star and H3 low-count props: no material difference (`50.5-52%`).
- 🔑 **The live gap behind these tests.** Same-line sportsbook coverage of PrizePicks standard lines is `54-74%` in history against `5.7-15%` live (defensive `0%`); `market_consensus` live holds 4 markets and about 1 book (history 20 markets, `1.4-2.1` books); `board_true_hp` anchors only `8-15%` of live rows on DraftKings, the rest on PrizePicks' own line. The history PrizePicks board (Odds-API capture) carried `8-16` defensive rows per game against about `112` live (PrizePicks' full alternate ladders and 30-plus new stat types), so defensive-heavy units were backtested on a much narrower pool than live. Nothing changed live; widening the live market feed before any market-crossed profile work is the owner's call.
- 🔑 **The board day by day on our own numbers (owner `17:08 PT`: no new feed; *"comparing day by day, grounded by our own numbers, baseline, final hp, final score ... the day by day differences in the board is where the solution resides"*).** Standard legs (R): legs at or above `.58` hit `54.8%` / `55.3%` (`26,838` / `39,004` legs); `final_hp` too high by `+0.086` / `+0.084` every season; the day-to-day hit rate swings with sd `6` points (`35-78%`); opening slates gap `+0.07..+0.19`, live 10-20 `+0.13`, 10-21 `+0.15`. Goblins (G) are calibrated (`70.8%` / `69.4%`, gap `-0.017` / `-0.005`). Demons (D): `final_hp` far too high at the top (`.58` and up hit `39.2%` / `43.4%`, gap `+0.19` / `+0.18`; every probe day `15-42%`) — a demon chosen for high `final_hp` is a trap on our own numbers. Sample (first 30 slates) signals for R — a larger enrichment push and a larger share of legs at or above `.58` / `.62` mean more over-confidence that day (push to hit `-0.28` / `-0.39`, calgap `+0.26` / `+0.45`; share at least `.62` to calgap `+0.24` / `+0.43`), and over-confidence shrinks through the first month (slate number to calgap `-0.28` / `-0.56`). Over FULL seasons those signals fade to absolute rho of at most `0.24`; only goblin `fs90` to calgap holds (`+0.28` / `+0.27`; an effect of 3 points). Conclusion: the board's own-number shape does not tell good from bad days over a season; it does in the season's first month, which is now. Nothing changed live. The calibration fixes this led to (board-centred ladder, `board_hp`, then ONE number in `final_hp`) belong to the baseline-calibration document.

#### 10-22 21:01 PT — one number, and the NEW 2-slip portfolio live from the 10-23 slate
- 🔑 **The owner's order (`10-22 21:01 PT`, `21:07 PT`).** *"the final hit probability and board hit probability should be the same thing ... board scoped, app board scoped"*; *"by tomorrow, for the next slate, we should have the new strategies already."* The chain moved into `final_hp` (switch `classification_config['final_hp_board_centre'].enabled` TRUE since `2026-10-23 00:52 PT`); every app board leg shows `final_hp`'s own number (details: baseline-calibration and architecture documents).
- 🔑 **The new portfolio, researched first (Stokastic / Action Network / OddsShopper break-even practice plus a Gemini consult, recorded in `research_pp_calibrated_slips.py`).** Calibrated-pool strategies are built by ONE shared builder `nba/calib_slips.py` (research and live engine call the same function): the day's PrizePicks board legs of the 12 calibrated props, ranked on `final_hp` (or `final_hp` x factor), a `final_hp` floor, distinct players, at most 1-2 legs of one game, at least 2 teams. Grid `2,160` strategies, every structure 2-6 x Flex / Power, staged sample then season then chosen on one and tested on the other; `45` hold in both seasons.
- 🔑 **Portfolio run (live engine's round robin, n 2, leg cap 2, grader v3, final 7 days out), 2024-25 / 2025-26.** PRODUCTION six-unit order on the new `final_hp` (P_wthrees 4F, P_wassists 4F, P_wrebounds 4F, P_wstocks 4F, P_points 3P, P_wrebounds 3P): `+55.1` / `+65.8%` ROI, lb5 `+22.5` / `+37.5`, net `+170.7` / `+202.7` units, max drawdown `26.5` / `12.5`, halves `+38 +73 +58 +75`. NEW (`P_wrebounds_4flex` plus `P_cal_r70_3power`: standard lines of the 12 calibrated props, `final_hp` at least `0.70`, at most 2 legs a game, 3-pick Power): `+52.5` / `+75.5%` ROI, lb5 `+24.9` / `+47.2`, net `+162.8` / `+232.5` units, max drawdown `20.0` / `12.0`, halves `+44 +62 +84 +66`. Chosen by the weaker season's lb5 (best of every N2 L2 portfolio), lower drawdown and more units over two seasons, inside the owner's scope (2/3-pick Power, 4-pick Flex). Falling back to other production units on days the 3-Power has no slip was WORSE (`+39.8` / `+71.8%`) than taking rebounds 4-Flex's second slip, so the order holds the two units only. In-sample note: the calibrated unit was chosen on both seasons; the live record is the first out-of-sample test.
- 🔑 **Config.** `pp_portfolio.order` = [`P_wrebounds_4flex`, `P_cal_r70_3power`] (`previous_order` kept), n 2, leg cap 2, backups 4; quote gate unchanged; unit names carry the `P_` prefix (`apply_quote_gate.PORTFOLIO_PREFIX`). A live-equals-research parity audit (`audit_calib_live_parity.py`) built the same slips as research on `8` of `8` history slates; its first run found the live board also carries props whose `final_hp` never went through the chain (10-22's top leg was an fgm Under at `0.883`), so `calib_slips` draws from the `12` calibrated props only (rule: any strategy ranking across props stays inside `final_hp_board_cal.PROPS`). **This 2-slip portfolio was itself SUPERSEDED on `10-25` by Portfolio B (below); its two units remain only as `pp_portfolio.fallback`.**
- 🔑 **Board profiles by slate size (owner `10-22 17:49 PT`).** Slate size (S up to 4 games, M 5-8, L 9 or more) x calibrated depth (standard legs at or above `0.65`: thin / deep). A per-profile unit switch chosen on one season LOST on the other (N2: `+46.9%` against `+65.8%` production; `+52.1%` against `+55.1%`): no profile switch goes live. Small slates (S) are where most units lose (the calibrated 3-Power on S: `-100%` on 3-7 days); recorded in `NBA_BOARD_LEARNINGS.md` section 5.
- 🔑 **10-23 P3, two operational gaps.** (a) The market refresh of `final_hp` hit its 8-minute step limit on the big slate after 9 of 12 props (soft step, run green): stocks / threes / turnovers carry no market term, so no slip leg changed, but the whole-number re-pricing after it was skipped; raising the limit to 15 minutes waits for the owner. (b) EARLY TIP: the pick ran `12:47 PT` and the first game (CHI @ MIL) tipped `13:00 PT`; the rebounds 4-Flex (main and backup) held Giddey from that game and was unplaceable by `14:22 PT` when the owner looked (no placeable 4-Flex in the round robin; the 3-Power was placeable). The pick checks only the slate's first tip, not each leg's own tip against when the owner places; fix to be designed. `board_scored` equalled `final_hp` on every 10-23 leg except Zach Edey turnovers 1.5 (2 legs).
### 10-23 (Friday) — board profiles on the one number, board-type factor rounds 1-4 (137 factors), and why nothing was adopted
- 🔑 **The owner's order (`10-23 09:51 PT`).** *"keep digging, researching, learning, identifying, granulating profiles. You cannot be stuck on research by scheduled tasks."* Research now runs beside the pipelines; only heavy DB writes keep out of the P2A / P2B / P3 windows. The learnings log `NBA_BOARD_LEARNINGS.md` (new `10-22 19:46 PT`, owner `10-22 17:49 PT`: *"keep looking at different angles and learning more of it. Keeping track of all learnt"*) records one line per finding with its script.
- 🔑 **Game environment and profile rules on the one number (`research_leg_environment.py`, `research_pp_board_profiles_v3.py`).** DATA FIX first: `nba_market.game_lines_closing.game_date` is the UTC tip date (a 7 PM PT game sits on the next day) and its season column is the calendar year; `game_lines_local()` maps each line to the schedule's local date (`13,348` lines, `57` unmatched), lifting legs with an environment from `31%` to `96%` (`757,723` of `786,447`); the two earlier environment runs are void. Leg level: pooled 2025-26 legs run below `final_hp` on low totals (`-0.011`), team on back-to-back (`-0.013`) and Dec-Jan (`-0.007`); 2024-25 only back-to-back (`-0.012`); `8` of `352` cells (group x side x line type x bucket) are consistent in both seasons, all Overs on goblin / demon lines over-estimated (combos / points Over goblins on b2b `-0.024..-0.040`, threes Over demons in Dec-Jan, assists Over demons on low totals, points Over demons as an 8-plus favourite). A cross-fitted log-odds correction per dimension does NOT generalise (log-loss change `-0.00007..+0.00013`), so `final_hp` already carries the game environment at leg level and no environment layer is worth building.
- 🔑 **Slate level, one-feature rules.** Chosen on one season and tested on the other: none holds in both directions (`1,080` / `1,062` rules each way); board-shape features are not comparable across seasons (the 2024-25 board is an Odds-API capture, the 2025-26 board is live). The pre-registered hierarchy is the stable read: A (up to 4 games), B (5-8), C (9 or more, split by back-to-back share `0.25`). A slates lose for nearly every calibrated unit in both seasons; C1 (9-plus games, few b2b) is where long calibrated slips earn (calibrated R `0.60`: 6P `+92%` / `+317%`, 5P `+105%` / `+204%`, 6F `+69%` / `+242%`); C2 (many b2b) loses for long ones (6F `-57%` / `-60%`, 6P `-100%` / `-100%`).
- 🔑 **Fixed rules written before scoring (net units against the pair, which earned `+162.8` / `+232.5`).** R1 C1 swap 3P for calibrated R `0.60` 6F `+9.3` / `+64.3` (lb5 `+24.7` / `+56.5` against the pair's `+24.9` / `+47.2`); R2 C1 swap 3P for calibrated R `0.60` 5F `+7.3` / `+15.3` (lb5 `+26.9` / `+49.8`); R3 C1 swap 3P for calibrated GR ev 6F `+9.3` / `+60.7`; R4 C1 add a 6F as a third slip `+12.9` / `+18.8` (ROI lower, `+52.5` / `+77.1%`); R5 A skip 3P `-3.0` / `+5.3`; R6 A skip all `-27.9` / `+4.4`; R7 R1 plus R5 `+6.2` / `+69.6`; R8 C2 skip 3P `-12.5` / `+5.0`. R1 gains in both seasons and sits inside the owner's scope (4-plus picks Flex) but is NOT clean out of sample: the 6F was picked after seeing both seasons, the 2024-25 lb5 does not move, and the 2025-26 gain rests on a few 6-of-6 hits. Small-slate skips do not pay. NOTHING WENT LIVE; R1 (C1 slates only) stays the candidate to watch in the 2026-27 record.
- 🔑 **Board types round 1 (owner `10:24 PT`: strong against weak, weekends, days of the week, many injuries, *"the structure of the app board itself ... is there less of our main prop lines ... the players that usually hit, are they there"*; `10:25 PT`: *"I give you 6, you need to come back with 100"*; `10:30 PT`: *"the profiles need to be identified and correlate in different days"*).** Method (`research_board_types.py`, grounded on a Gemini consult): residual hit minus `final_hp` relative to the season's side x line-type baseline; z clustered by slate; a cell needs at least `300` legs and `20` days in both seasons, the same sign, absolute z of at least 2 and Benjamini-Hochberg q below `0.05` in each season; cross-fit = shift per (bin, side, line type) fitted on one season and applied to the other, HOLDS = day-clustered z of at most `-2` both ways. Certified on synthetic data first (a planted `+0.05` effect passes; `13` random leg-level and `6` random slate-level factors all fail; a first draft that passed `4` of `13` random factors was fixed before any real run). **`100` factors, all known before the 13:15 PT pick, on `786,447` legs and `309` slates:** calendar `13` (day of week, weekend, Friday, month, season phase, first 14 / last 21 days, post All-Star, holidays, NBA Cup nights, slate games, tip hour, tip spread); rest / travel `14` (b2b, opponent b2b, rest days and advantage, 3-in-4, 4-in-6, home / away, road-trip / homestand game number, first home game after a trip, time-zone shift, altitude, days since and result of the last meeting); strength `15` (trailing-25 net margin classes and pairing, form against trailing, streak, pace and combined pace, opponent points allowed, OPPONENT ALLOWED IN THE LEG'S STAT, division / conference, late-season bad team, early sample); market `8` (total, spread bucket, favourite, total / spread move morning to window, PrizePicks line against books, multiplier quintile, number of books and DFS apps listing the player market); injuries `15`; form `15` (minutes trend / volatility, starter, last-5 against the line, last-10 over-rate at the line, streak against the line, line against season average, games played, foul rate, usage trend, double-double rate, heavy last game, blowout last game, line change since the previous slate, three-point luck); officials `3`; board `11` (own prop depth against the trailing 20 slates, board size, depth at or above `0.60`, ladder rungs, props of the player, standard line present, game coverage, teammates on board, whole-number line, rung rank); memory `7` (shrunk player alpha per prop group and side, usual hitters on the board, prop x side 7-slate regime, previous-slate residual, `final_hp` decile).
- 🔑 **Round 1 result.** `9` consistent cells of `1,217`; ONE factor holds in cross-fit: `mkt_pp_vs_books` (PrizePicks standard line against the books' median main line). Near misses: opponent allowed in the leg's stat (z `-1.8` / `-2.1`) and last-5 against the line (`-1.6` / `-3.9`). Everything else (calendar, rest / travel, strength pairings, injuries, officials, board depth, usual hitters, player memory) adds nothing over `final_hp` out of season. A consequence recorded: the earlier "back-to-back better both ways (`-0.00003` / `-0.00007`)" is inside the noise band.
- 🔑 **The line gap and a LOOK-AHEAD LEAK (`research_final_hp_linegap.py`).** Round 1 read the books' line from every `board_snapshots` label including `close` (tip time, after the pick): PrizePicks 1-plus below the books gave More `+0.069` / `+0.053` over `final_hp`. On the WINDOW snapshot only (the pick) it is `+0.028` / `+0.023` (z `+2.1` / `+2.1`); 1-plus above gives Less `+0.028` / `+0.023`. About half of round 1's size was post-pick information. As a layer on `final_hp` (slopes per group x line type, cross-fitted): log-loss `-0.000079` (z `-2.2`) in 2025-26 and `-0.000063` (z `-1.4`) in 2024-25 — does not pass both ways; slips: live pair `162.8 -> 162.8` / `232.5 -> 231.0`, calibrated structures mixed (GR ev 6F `+16 -> +31%` / `+97 -> +112%`; R `0.60` 5P lb5 worse in both) — NOT ADOPTED. **Rule recorded: every factor's source is checked for post-pick snapshots (`board_snapshots` `close` and the like) before it is scored.**
- 🔑 **Slate-level board types (`research_board_types_slate.py`).** K-means board types on within-season percentiles, fitted on one season with the other assigned, find the same type from BOTH directions: the DEEP / STRONG board (high top-20 standard `final_hp`, many standard legs at `0.65` / `0.70`, deep prop menus) where rebounds 4-Flex and long calibrated Flex beat their season averages, and the THIN board where they fall below. Two-factor profiles: `422` hits against a random-day null of `359` (p95 `383`) — modestly above chance. With TRAILING percentiles only (Q of top20_hp / std at `0.60` / `0.65` / `0.70` against the previous 30 slates), pre-registered: STRONG swaps the 3-Power for calibrated R `0.60` 6F = `+21.9` / `+72.6` units, lb5 `+24.9 -> +29.6` / `+47.2 -> +61.7`. Robustness (`25` window x threshold settings): 2025-26 holds broadly (the swap helps about `50%` of strong days, hurts `12-20%`, positive without its 3 best days); 2024-25 flips sign across settings and is negative without its 3 best days in every setting. NOT LIVE; THIN means skip the 3-Power and skipping all costs units in 2024-25.
- 🔑 **Board types round 2 (owner `10:25 PT`: *"try another 50, 100"*; `research_board_types_r2.py`, the same certified test; 37 more factors).** Market at the window snapshot (books' de-vigged probability at the PrizePicks line against `final_hp`, market lean, hold, line dispersion, FanDuel / DraftKings / BetMGM / Underdog line against PrizePicks, whole against half line, multiplier against the day's median for the same prop x tier); role / usage (starts, start change, last-game minutes ratio, FGA / points / assist share trends, stat volatility, line percentile in the last 20 games, line against season max / min, venue split, history against this opponent, games in 7 days, minutes load, 3PA-rate trend, FT rate); matchup mapped to the leg's stat (steals from opponent turnovers, blocks from opponent FGA, turnovers from opponent steals, rebounds from opponent misses, threes from 3PA allowed, points and combos from FTA allowed, assists from assists allowed; opponent defence and pace trends, overtime last game); board shape; two pre-registered interactions of round 1's near misses. **HOLD both ways: only the two interactions, both built on the player's LAST-5 AVERAGE against THE LINE** (x line gap z `-2.7` / `-3.3`; x opponent allowance in the stat z `-2.6` / `-3.0`): last-5 above the line means More hits `2-3` points BELOW `final_hp`; below the line it hits about `2.5-3` ABOVE (points, combos; thousands of legs a season). The books' de-vigged probability at the PrizePicks line adds nothing in 2024-25 (z `-0.7`): `final_hp` already carries the market.
- 🔑 **Form as a layer (`research_final_hp_form.py`; cross-fitted slopes per group x line type).** Fitted 2025-26 to 2024-25: log-loss `-0.000543` (z `-5.3`), FORM plus GAP `-0.000617` (z `-5.4`); fitted 2024-25 to 2025-26: `-0.000095` (z `-0.6`) / `-0.000183` (z `-1.1`) — not both ways. Slips rebuilt on the layered number: the LIVE PAIR loses in both seasons (FORM `162.8 -> 157.5` / `232.5 -> 220.1`); long calibrated Flex / Power gain in 2024-25 (6P `+25 -> +63%`, 6F `+26 -> +54%`, GR ev 6F `+16 -> +50%`) while 3- and 4-Powers lose. NOT ADOPTED; the form effect is recorded for the next `final_hp` refit (a model input, not a slip rule).
- 🔑 **Timing gap found while doing this.** The historical `board_snapshots` `window` snapshot — the source of every backtest's PrizePicks lines, books' standard line and tier map — is taken at about `14:40 PT` (median, every month 2024-10 to 2026-06), while the live engine picks at about `13:15 PT` (P3): backtests see about `85` minutes more news (late scratches, line moves) than the live pick. Recorded; the schedule is the owner's and was not touched.
- 🔑 **Board types round 3 (`research_board_types_r3.py`): one model over all about 137 factors (ridge / gradient boosting) plus walk-forward — sharper probabilities, not better live slips.** Cross-season: fitted on 2024-25, ridge (penalty `2e5` chosen on held-out days) and HGB (100 trees) improve 2025-26 log-loss (`-0.000425` z `-3.4` / `-0.000394` z `-1.8`); fitted on 2025-26 both choose NO correction — not both ways. Walk-forward over 2025-26 (each month predicted by models trained on earlier legs, settings fixed in advance): HGB `-0.000752` (z `-4.1`), ridge `-0.000534` (z `-3.3`), so probabilities get sharper. Slips: LIVE PAIR `232.5 -> 226.4` (HGB) / `224.5` (ridge) units — worse; long slips gain (calibrated 5-Power `+82 -> +117%`, 5-Flex `+68 -> +90%`, 6-Flex `+115 -> +125%`) while 2-4-pick lose. NOT ADOPTED; a candidate input for the next `final_hp` refit. Top HGB inputs: the multiplier, books' disagreement, side, `final_hp` itself, pairing of strengths, back-to-back, DraftKings' line gap, key injuries.
- 🔑 **Board types round 4: relating days (`research_board_types_r4.py`, 3 runs; design checked with Gemini).** `45` slate series (residual by side x line type, by prop group, strong legs, every unit's profit): PERSISTENCE `0` of `259` series x lags consistent in both seasons (chance about `1.3`); trailing-mean forecasts and ANALOG DAYS (K nearest past slates on match / board / all features, K picked on 2024-25) hold for no series; PLAY / SKIP gates from trailing profit or analogs never beat random day-skips in both seasons; leg factors from related days: `0` consistent cells. One exploratory lead found after looking — calibrated R `0.60` 2-POWER after a losing trailing 15 slates `+31.2` / `+30.8` units against always `+9.6` / `+19.4` (p-rand `0.00` both seasons) — was CLOSED by a robustness grid (`R4_ONLY=contra`): only the 15-slate trailing window is significant, windows 10, 20, 25 and 30 are not (p `0.06-0.30`), so it is an isolated window, not a rule.
- 🔑 **Why nothing from the 137 factors was adopted.** Calendar, rest / travel, strength pairings, injuries, officials, board depth, usual hitters, player memory and the books' probability add nothing over `final_hp` out of season; the only cross-fit survivors are the line-gap factor (half of it a look-ahead leak, and not both ways as a layer) and the last-5-against-the-line interactions (a real form effect, but it improves only one direction of fit and loses on the live pair). Both are recorded as inputs for the next `final_hp` refit rather than slip rules. The details of the calibration side (board-centred ladder, `board_hp`, day swings) are in the baseline-calibration document.
<!-- T50 END MARKER -->

## 🆕 §T49.7b — **`T49` TRANSCRIPT BATCH (main `2026-10-16 20:39Z → 10-17 20:17Z`; subagents `10-10`, `10-15`): FIGURES, TIMELINE AND EVIDENCE THE REAL TRANSCRIPT ADDS TO `§T49.7`** *(source: the T49 main transcript read from 10-16 15:49 PT to its end, checked against `§T49.7`; the dates between 10-10 02:35Z and 10-16 20:39Z remain AS STATED — the main chat for that span does not exist as a transcript)*

- 🔑 **What the transcript confirms.** Every figure `§T49.7` states for the switch matches: EDGE_DELTA −0.0748, independence break-even −6.84, window-only portfolio +46.0% / +79.0%, `slip_engine_slips_wo` 479,002, the ON verdict, Underdog `ud_play`, UI v1.4.7, rehearsal 1,032 legs with 3 PLAY slips, certify 66/0 then 82/0, the 12,455-credit balance. Nothing there is contradicted except the three corrections below.
- 🔑 **Timeline of 10-16, PT (new).** 15:48 owner "full sweep"; 15:49 certification suites dispatched (none writes production data); 16:04 message to the owner (planning range below); 16:18 owner directive "full force"; 16:24:41 `ud_play` on; 16:48 comparison run; 16:50 ON verdict; 16:51 switches flipped (`refresh_final_hp` true, suffix `'_wo'`) and a P4 recalibrate dispatched; 16:52 morning monitor created; 16:54 independence break-even −6.84 and the thinning solver; 16:55:58 `edge_monitor_ref` built (23:55:58Z, 19 keys), calibration 23:52:37Z (16:52:37 PT), EDGE_DELTA −0.0748 committed and read at 16:57; 17:22 rehearsal finished (about 25 min, sandbox baseline); 17:23 certify 66/0; 17:26 integration test and ledger / COMPASS commits; 17:31 UI 95/95 past-slate path; about 17:33 release-path audit; 17:37 UI 95/95 today path; about 17:48–17:50 first L11b failure (log line 00:48:43Z = 17:48 PT); 17:56 fix; 18:05 certify 82/0. The L11b run recomputes about 955,000 extra slips and takes about 4–5 minutes longer. The first L11b failure had 11,392 and 19,401 mismatches, all size-2 Flex with alternates; in one query 10,023 rows had stored payout 0 against an expected raw such as 0.913.
- 🔑 **Owner planning guidance (the 16:04 PT message).** "A positive season in the +20–45% range is the honest planning number"; most days lose, the wins come in a few big days, the first month can be negative; expect results nearer the no-odds backtest than the replays (+37% and +86%) until the odds switch. (Its "run the audit after 10-26 with 7 slates" is superseded.) Unit schedule (`stake_unit.note`, read 15:50 PT): USD 1 from opening night, raised gradually by the owner (1.50, 2, 2.50, 3, 4, 5 …); at a USD 2 unit the half stake becomes 1 and star-Under slips are playable.
- 🔑 **Cap-raise evidence per slot (engine comment, 10-15, read 15:50 PT).** Rule written before the run: a slot is added while the next slot is at least +15% in BOTH seasons and its pooled day-blocked 95% lower bound is above zero. A_wsteals: k7 +87/+77, k8 +31/+65, k9 +57/+77 (k10 +28/+97 also passes, left out for single-family concentration; 9 was already the validated late-March level). A_regular: k2 +40/+144, k3 −30 stops. A_wrebounds: k2 +37/+77, k3 +29/+59, k4 +11 stops. C_wstocks: k2 +37/+45, k3 +1 stops.
- 🔑 **State going into opening night (read 15:50 PT).** Every staked strategy is `paper` (the screen says PLAY from day one under `play_from_day1`); `A_core_5flex` is `paper` at cap 0 and both demons `red` at cap 0. `live_slips` and `live_pool` hold 0 rows; `live_state_history` holds 104 rows (8 days, 2026-10-08 → 10-15, 13 strategies). Caps updated: A_regular / A_wrebounds / A_wsteals on 10-15 20:57:28Z, A_core on 10-08 17:21:09Z. The daily caps of the six active strategies sum to 22 (the ledger's 23 is not reproduced).
- 🔑 **Hands-off replay detail (22:50–22:59 PT, labels `s2425_final`, `s2526_final`).** 2024-25 by week (slips, net, ROI): wk1 88, +33.9, +38.5%; wk2 10, +9.6, +96.4%; wk3 75, −18.7, −24.9%; wk4 122, −60.0, −49.2%; wk5 98, −29.4, −30.0%; wk6 89, +67.3, +75.7%; wk7 125, +134.4, +107.5% (weeks 3–5 negative, recovery from week 6). Per strategy: A_core_3power 343 slips +140.7 (41.0%, leg hit 61.1%) in 2024-25 and 354 slips +348.1 (98.3%, 67.5%) in 2025-26; A_regular_5power 221 +174.0 (78.7%, 60.5%) and 225 +249.5 (110.9%, 65.4%). Held-back slips: A_core_3power shadow 21 slips −15.0 (−71.4%) in 2024-25, 36 slips +16.8 in 2025-26; below-minimum A_regular_5power 35 slips +18.6 (+53.2%) and 37 slips +16.6 (+44.9%). C_wstocks by month in 2024-25 (slips, net, leg hit): Oct 10, +20.1, 72.5%; Nov 39, −12.2, 49.4%; Dec 41, −16.7, 47.6%; Jan 38, −22.5, 47.4%; Feb 25, +14.0, 59.0%; Mar 26, −12.3, 37.5%; Apr 5, +18.0, 70.0% — so November–January leg hit is 47.4–49.4% (corrects the "46–50%" in `§T49.7`) and March is the lowest month. Drought-rotation test (replay, C_wstocks, rotation vs normal): 2024-25 36 rotation slips −31.1% vs 147 normal −5.7%; 2025-26 8 rotation −6.3% vs 233 normal +51.5%; backtest (market-free twin) 2024-25 84 slips / 42 days +14.3% vs 224 / 112 days +15.1%; 2025-26 28 / 14 days +71.6% vs 278 / 139 days +47.3%.
- 🔑 **`NOT_IN_TOP30` scope (add556d).** In `weekly_requal` on 10-08, 10-10 and 10-14 every live strategy read NOT_IN_TOP30 and only the retired A_core_5flex got PASS (the "10 of 12" figure elsewhere in these docs comes from the build chat's later notes, not from these transcripts).
- 🔑 **Latent defects the ROI / engines full pass recorded (not fixed unless stated).** (a) `reset` and a non-resume `replay` set every strategy to paper at its code cap, and the demons' red existed only as database rows (no sticky flag until the release-record fix); (b) `edge_daily_strategies()` uses the code cap, so the monitored portfolio includes the red demon strategies, and shadow slips skip the small-slate and holiday caps — the 10-20 rehearsal built six B_demon_5flex shadow slips on a 3-game slate; demon legs are 27.7% of the monitor's reference legs (7,171 of 25,907); the recommendation to take red and shadow strategies out of the edge monitor was not taken; (c) `prop_universe` stops at 2026-04-12 like the tier maps and nothing builds it; if the backtest ever grows, the certifier check `L11.slips_exist_all_days` (requires exactly 323 days) would stop P5 at its certify step; P5's release rule needs at least 40 slate days of 2026-27 with a positive lower bound; (d) the 10-20 rehearsal run placed A_core_3power, A_regular_5power, A_wrebounds_4flex and C_wstocks (A_wsteals_5flex held by the week-1 rule), not only C_wstocks as the ledger says; (e) recompute of every live-strategy slip under today's rules: `_mf` 20,855 slips 0 mismatches (245 with voids), `_mf_nosteals` 13,931 0 mismatches (364 with voids), playoff Unders 291 0 mismatches; `live_strategy_calib` reproduces exactly (309 days); `edge_monitor_ref` matches on all 20 keys; the `reset` checklist already ran 10-08 and is not to be run again; (f) the agent's premise that every strategy stays paper on 10-20 is superseded by the 10-15 16:10 PT USD 1 / play-from-day-one decision; (g) `nba_calendar` has no regular-season games 2026-12-04 → 12-11 (resume 12-12); P3 and P4 run only when `slate_games > 0`; (h) the EDGE_DELTA reasoning portfolio in that agent's run was 6,196 slips: +86.8% on the old payouts, +52.3% on today's, +44.5% on the market-free twin (`payout` vs `payout_grader_v1`); `edge_monitor_research.load` read market-inclusive tables while the reference rates come from the market-free twin.
- 🔑 **Underdog backtest slots (16:22 PT, market-free twin, final 7 days out).** 2-Standard "mains" 302 / 310 slips (151 / 155 days), +57.7% / +29.9% as `weighted:points_R_U`; the 2-pick "mains" slot as documented is +31.9% / +36.4%; 4-Standard 140 / 139 slips, +115.7% / +88.7%. Portfolios: P5 = points_R_U 4-Standard cap 1 + points_R_U 6-Flex cap 1 + mains 2-Standard cap 2; P4 uses points_R_U 2-Standard cap 2. One pick per game; the pre-All-Star week and final regular-season week are `stand_down` (stake 0); no post-tip pick; whole-number Underdog lines excluded (2,744 legs, none since 2025-02). The owner-facing message said Underdog builds slips only when its board is big enough, so its first slips may come 10-21.
- 🔑 **Market-audit instrument check (16:00–16:03 PT).** The strict two-season-mean rule failed a real past week; it was patched at 16:00 to the lower season and the same week read READY at 16:02; the live default read NOT READY at 16:03.

## 🆕 §T49.7 — **`T49` (`2026-10-09 20:04 PT → 10-16 13:39 PT`): THE DECISIONS THE BUILD CHAT TOOK AFTER THE LAST TRANSCRIPT — PAYOUTS PROVEN, HONEST PROBABILITY, CAPS, THE WAY OUT OF RED, THE USD 1 UNIT, THE PLACE-BY** *(source `T49` = the build chat's certification ledger, `NBA_COMPASS.md` facts `150`–`163`, strategy `§31ad`–`§31af`, `PP_PAYOUT_FINDINGS.md` `§0j`–`§0k`, `BETR_BUILD_STATE.md` `§8`; **AS STATED, no transcript** — written on the owner's instruction that no gap remains; owner messages quoted from the ledger headings)*
- 🔑 **Owner directives, as the ledger quotes them.** `10-09 20:04 PT` — keep trying on PrizePicks (research online, use Gemini's insight) and *"be sure that [Sleeper is] replicated to NBA"*; `10-09 20:30 PT` — *"prove the other apps as well for the payouts, make sure everything is sharp"*. `10-13` — a weekly sweep a week before opening night. `10-15 13:29 PT` — *"Ground the decisions on data, online research and debug. Do not cancel or cut anything, just adjust for the best possible outcome. Also keeping improving logics, looking at other models to improve ROI."* `10-15 16:10 PT` — the unit is USD 1 at the beginning, he cannot go lower on most apps, ROI is the measure, and the system must auto-adjust so he need not ask again; `16:14 PT` — he starts from the beginning of the season and needs timing: can the slips be placed, are they available, do the legs change. `10-15 18:01 PT` — *"Is there any way to prevent the February dip? … understand it after identification, not just avoid blindly."* `10-16 10:25 PT` — a complete pass on feasibility and repeatability, every board checked. `10-16 13:37 / 13:39 PT` — 20 minutes is tight to place slips; *"The place by is a good idea. I don't like the split in 2 runs."*
- 🔑🔑 **The adoption rule used for every tuning decision (written before each run): a change is adopted only if it is better in BOTH seasons (2024-25 and 2025-26), with a pooled day-blocked 95% lower bound above zero where a slot is added.** Applied to caps (adopted), half-Kelly and inverse-variance stakes (rejected: fit on one season, worse than flat on the other), leg orderings by the honest probability or by a Flex-aware demon value (rejected: each trades one season for the other), the trailing-window red release (rejected: doubles false releases on a zero-edge null, 4.7–6.7% to 10–15%), H7 off (rejected: 2024-25 +569.4 vs +559.4, 2025-26 +2,037.5 vs +2,044.6 — inside noise). The rule is the owner's "no cuts, adjust for the best outcome" made testable.
- 🔑 **Caps on the true payouts (live).** Rule: a cap rises one slot at a time while the next slip is at least +15% in both seasons and its pooled lower bound is above zero (market-free twin, true Flex tiers, final 7 days out). A_wsteals_5flex 6 to 9, A_regular_5power 1 to 2, A_wrebounds_4flex 1 to 3, C_wstocks_4flex 1 to 2; A_core_3power and D_points_3power unchanged. Daily portfolio 2024-25 / 2025-26: net +663 to +1,150 / +1,641 to +2,478 units; ROI +28.5% to +33.8% / +71.0% to +73.1%; net over max drawdown 3.24 to 4.56 / 17.98 to 18.75; max drawdown 205 to 252 units. Total daily caps 23 (ceiling 36) per the ledger; the six daily strategies' caps read in the T49 transcript (10-16 15:50 PT) sum to 22 (A_core_3power 3, A_regular_5power 2, A_wrebounds_4flex 3, A_wsteals_5flex 9, C_wstocks_4flex 2, D_points_3power 3; A_core_5flex and both demons cap 0), so the ledger's 23 is not reproduced from the live rows. The small-slate rule (4 games or fewer gives cap 1), week 1 / week 2, final 7 days off, the All-Star plan and the daily ceiling sit on top unchanged; a late-March raise never lowers a cap. EDGE_DELTA re-solved `-0.0916` to `-0.0649` (full pass, true Flex payouts) and then to `-0.0662` (pooled thinning, 6,789 slips; independence `-6.65`, 2024-25 `-4.55`, 2025-26 `-8.58`; ROI +53.4%); the price-shop margin follows (0.0662); **superseded 10-16 by `-0.0748`, re-solved on the window-only twin (pooled thinning `-7.48` pp, independence `-6.84`, gap 0.64; see below).** Every older "`-9.16` pp" in strategy `§31` is superseded (the ledger's double-check block still quotes it as it then stood).
- 🔑 **C_wstocks_4flex is kept and raised, not cut.** The earlier +31% / +66% was read from the wrong table (C strategies run on the no-steals twin); the true cap-1 record is +1.5% / +52.5% (155 / 154 slips, pooled +26.9%, 95% CI `-0.8` / `+57.1`). It adds profit and lowers risk per unit (daily profit correlation `-0.08` with D_points_3power, 0.09 with A_core_3power; with it +2,304 units pooled vs +2,221 without). Its second slip is better than its first in the weak season (k2 +36.5% / +44.6%), so cap 2: +19.0% / +48.5%, pooled +33.7%, CI +7.7 / +62.2. Weak spot to watch: in the 2024-25 hands-off replay it was -6.3% on 184 slips (k2 -11.9% on 73).
- 🔑🔑 **Red is no longer one-way for a season.** Defect found: P5 released a red strategy only on a validator PASS, whose window is fixed history (verdict NOT_IN_TOP30 for 10 of 12 strategies), and read the live-season record from the backtest table, which holds no in-season days. Built: `live_slip_engine.release_record` reads the strategy's OWN season record (the backtest table when it holds 40 days or more, else the live ledger, where a red strategy keeps building and grading shadow slips). P5 (and the replay's P5 simulation) releases a red strategy to PAPER when that record's day-blocked bootstrap lower bound is above 0 on at least 40 days, whatever the fixed-window verdict. Cap-0 reds (the demon Flex pair) return at `RELEASE_CAP` = 1, never at their old caps (certified on the wrong Flex tiers). A FAIL reds a strategy unless its live record already clears that bar. Paper still needs the ordinary paper gate before a unit is staked. Proof (`audit_release_path`, rolled back, PASS): backtest source A_wsteals (2026-02-15, 40 days or more); live source — the real B_demon_5flex slips of 2025-11 to 2026-02 replayed as graded shadows, 86 days, lower bound `-59%`, stays red; fewer than 40 days holds. Multiple-look cost measured: a zero-edge strategy is released 7–9% of the time at the 2.5% bound (weekly looks, days 40–160); at a 0.5% bound 1.5–4% but a +30%-edge strategy's release drops 65% to 40%; kept at 2.5% because a release only reaches paper and the paper gate is a second bar. An anytime-valid e-process needs on the order of 150 slate days at these variances — the one-way door again — and was not adopted.
- 🔑 **Clean release (adopted `classification_config['red_release']` = mode `clean`, `clean_days` 10).** A red strategy returns to YELLOW (half cap) after 10 consecutive slate evaluations with every hurdle clean on its own record (H1 reads its graded shadow legs while red); a fresh hurdle fire resets the count; the calendar windows never release; P5's weekly PASS releases as before. Guard: never applied to a cap-0 strategy or to a red P5 set on a failed certification (REQUAL 'FAIL ...'); a red set by H2 / H3 cannot clean-release (they read the staked record, frozen while red). Reason: in the 2024-25 replay A_wsteals_5flex (cap 9) went red 2024-12-28 on H1 and stayed red to 2025-03-31 while its shadows earned +197 units. Result: 2024-25 +559.4 to +759.5 units, ROI 34.9% to 36.9%, max drawdown 143.4 unchanged, A_wsteals back 2025-01-22, February 2025 +66.4 to +154.0; 2025-26 identical. Known limit: a really broken released strategy costs half stakes until H1–H3 re-red it.
- 🔑 **H7 (the shared steals-anchor canary) stays red** (`classification_config['anchor_h7']` = red; switch values red / yellow / off). Canary test: on the certified family-A legs the anchor never reaches red (2025-26: 3 yellow days, among the season's best); the replay reds read the live ledger's steals legs (shadows and the rotation observer included).
- 🔑 **The February dip, understood.** (a) 2026-01-30 to 02-05, a steals cold streak: the 0.5-line steals Unders hit 12 of 26 (46% against a calibrated 63%, z about `-1.8`); ruled out: the trade deadline (every picked steals player had played for one team in the prior 30 days but one, who hit; the 2024-25 deadline week was +140 units), the league steals rate (8.4 / 8.7 per team-game, inside the 7.8–9.2 weekly range); no board-side signal (consistent with the drought passes `§29m`–`§29u`); the drought rotation (`§29p`) switched on 02-02 and its steals-free family-A build made +110 on the backtest 01-29 to 02-12 while the steals build lost 88. (b) 02-11 to 02-22 the H7 red (anchor trailing-14 0.340 vs 0.634, z 3.33). (c) **A replay-fidelity defect, fixed**: the replay ran P5 only on Mondays that were slate days, so the All-Star-break Monday (02-16) was skipped and the release waited for 02-23; production runs P5 every Monday. With parity: 2025-26 February +147.7 on 262 slips (+56%), season +2,044.62 on 2,373 slips, ROI +86.2% (was +1,883.76, +80.6%). What remains is Feb 1–5, -28.5 on 64 slips, the cost of a variance streak before the rotation can see it.
- 🔑 **The USD 1 unit and the hands-off loop.** The unit is one setting, `nba_config.classification_config['stake_unit']` = {unit_usd 1.0, min_stake_usd 1.0, below_min 'skip', play_from_day1 true}; the owner changes it on the Slips screen ("My unit (USD)" + Set unit, `POST /api/stake-unit`, bounded min to 1000, UI v1.4.5); nothing the engine builds depends on the unit. Every slip says PLAY (unit times stake weight; "(paper)" while the strategy is in its paper gate — the owner plays from the first night by his decision, the gate stays the system's measure for raising and stopping) or SKIP with the reason (shadow strategy, week-1 rule, week-2 rule, daily ceiling, below the minimum entry, strategy red / off), plus "To play today: N slips, total". Defect fixed on the way: the old label read only 'shadow' from the status, so a slip held back by the week-1 / week-2 rules or the daily ceiling showed "staked" for an active strategy.
- 🔑 **Half stakes at a USD 1 unit are skipped.** The validated star-Under half stake (`§31n`) is 0.50 at a unit of 1 — not placeable. Measured on the live caps (market-free twin, final 7 out): those slips are 4.5% of slips at +8.1% / -1.4% ROI; skipping gives +35.1% / +76.4% against +34.4% / +74.7% at half stake and +33.8% / +73.1% at full stake, net units within 13 — ROI-best, so the engine records them as status `placed_below_min` (built, graded, never staked; postseason: shadow). At a unit of 2 the half stake is 1 and they are played again automatically.
- 🔑 **Timing — when slips appear, and the legs move.** Scheduler (PT): 03:31 P2A grades last night and moves every strategy's state; 08:06 P2B builds the day's model; the PrizePicks payout map twice before the window; **P3 at 13:16, or 29 minutes before the first tip when that is earlier** (opening night 10-20: first tip BOS@DET 12:00, P3 11:31); slips on the screen about 5–8 minutes later (about 11:40 on opening night, measured: board scorer 31 s on the largest 2025-26 board of 87,413 legs, picks and grades about 20 s, captures 5–7 min); close capture at first tip minus 25 min; Mondays P1 + P5. Legs change: on 2025-26 slates 10.1% of picked legs were gone from PrizePicks' board by the close capture and 16.8% more had moved line (27% in all) — place right after the slips appear; a leg that is gone or moved is not the leg the strategy picked, and skipping the slip is the conservative choice.
- 🔑🔑 **Place-by on every slip; the two-run split rejected (owner `10-16 13:39 PT`).** The afternoon run stays ONE run per slate — P3 at min(13:15 PT, first tip minus 30 min) plus 1 — no second run for late games. Instead each slip carries `place_by_utc` / `place_by_pt` / `place_by_game` = the FIRST official tip among its own legs' games (each leg's game: the box score's team on a played date, else today's roster in `nba_ref.players`, refreshed by P2B each morning; a leg without an id resolves through `nba_ref.player_name_map`; joined to `nba_calendar.slate_games`, the official tip, not an app's displayed start — PrizePicks shows +10 minutes). A slip with any leg that cannot be placed falls back to the slate's first tip and says "(first tip)". Card text: "Place by 12:00 PM PT (BOS@DET tips)"; the day's notes add "Place by (each slip closes when the first game among its legs tips): N by 12:00 PM PT, M by 4:00 PM PT". Reason: on 38 of the 39 2026-27 slates with a tip before 1:45 PM PT only about 2.3 of 7.7 games are early, so most slips have hours; opening night (3 games) is the tight case.
- 🔑 **What adjusts itself with no one touching it.** Daily grade to per-strategy hurdles (paper to active after 50 slate days and a positive live lower bound; yellow halves the cap; red stops; critical grace; clean hysteresis); calendar rules; PrizePicks payout tiers rebuilt every payout-map run; Betr session renewal; weekly P5: re-validation, the red release on the live record, and step 6b (live hurdles recalibrated on the regraded backtest). P5 now runs whenever P1's run is claimed (`needs: [claim, weekly]`, `if: always()`); it silently did not run on 10-05 and 10-12 because P1's static-load check failed — the failure is still reported.
- 🔑 **Whole season, hands off (`audit_season_replay.py`, rolled back, PASS; live_slips 0 to 0).** First replay on the adopted caps (2025-26 regular season 2025-10-21 to 2026-04-12): 2,336 PLAY slips at USD 1, 4,219.76 returned, +1,883.76, ROI +80.6%, one losing month; held back by the rules: below minimum 37 (+44.9%), shadow 749 (+56.0%), week-1 skip 10 (-24.1%), week-2 skip 19 (-24.7%) — both calendar skips were right. After the replay fix and clean release: 2025-26 +2,044.62 on 2,373 slips, ROI +86.2%, max drawdown 72.6, no losing month; 2024-25 +759.53 on 2,059 slips, ROI +36.9%, max drawdown 143.4, one losing month (Nov 2024, `-57.2`, the start of the ten-week mega-drought).
- 🔑 **Repeatability (10-16 pass) — what to expect.** 2024-25 / 2025-26: slips per slate day 13.5 / 15.6; losing days 62.5% / 45.4%; worst day `-21.2` / `-19.6`, best +159.6 / +126.3; worst 7 / 14 / 30 slate days `-77.5` / `-119.5` / `-139.9` and `-62.4` / `-32.4` / +103.5; 30-day windows that lose 23.6% / 0%; after the first month `-45.4` / +413.7; days below the starting bankroll 20 (last 2025-01-12) / 1. Every staked strategy is positive in both seasons except C_wstocks_4flex (above), the rotation-only R_stocks (38 slips) and the pre-break W_coredemon (3 slips, `-3`). **Honest expectation:** the replays use strategies selected with both seasons in view, so they are NOT out of sample; the out-of-sample evidence is the walk-forward calibration (configs chosen on 2024-25 alone averaged about +43% on the untouched 2025-26, 18 of 20 positive; an average config about +30%). Plan on a positive season in the +20–45% range with 2025-26 as the upside, most days losing, wins arriving on a few big days, and a first month that can be negative. Bankroll: the hard season's USD 143 drawdown at a unit of 1 is why 0.5% of bankroll per slip or less (about USD 200 and up at a unit of 1) is the guidance. Unit-size information for the owner (nothing in the system sets it): compounding flat stakes as a share of the current bankroll per slip — 0.5% gives log growth 0.024 / 0.065 per day and max drawdown 76% / 51%; 0.75% gives 0.028 / 0.089, 91% / 67%; 1% gives 0.029 / 0.109, 97.5% / 79%; 2% loses money in 2024-25.
- 🔑 **Honest probability — two numbers, each honest for its job** (detail `NBA_BASELINE_CALIBRATION.md` `§T49.5`): the board shows the market-anchored `board_true_hp`; for a certified slip's legs the faithful number is the backtest's own cell rate (`edge_monitor_ref`), shown beside the strategy's certified leg hit and backtest ROI by season. The certified slip engine still ranks `final_hp` inside its certified cells.
- 🔑 **All-Star window on the true payouts (`§31ae`).** The All-Star games (game_id 003) are never a slate (0 in `nba_calendar.slate_games`). Windows: the 7 days before the break (the engine's `in_allstar_week`), days 1–7 and 8–14 after, both seasons (breaks after 2025-02-13 / 2026-02-12, games resume 02-19). Pre-break plan B (default) = W_core_3power x3 + A_wsteals_5flex x6 + W_coredemon_3power x1: 140 slips, net +62.1 (+30.4 / +31.7), worst day `-10.0`; the normal portfolio there is +17.5 (+22.4 / `-5.0`) and the old B +35.5. Plan C (fallback) = W_core_3power x3 alone (+41 / +116 ROI). Plans A / D kept as references (`ALLSTAR_PLANS`). After the break no plan runs: the normal portfolio is +283.3 on days 1–7 and +102.4 on days 8–14. A plan strategy stakes only if its own live state allows. Small-sample caution: 14 slate days, two seasons.
- 🔑 **Process rules learned.** Replays and the season audit hold `live_slips`' table lock for their whole run (the ALTER in `ensure_tables`): never run two together (a deadlock failed one; nothing written) and never near P2A / P3 — the Slips screen waits while one runs; a replay takes 30–45 minutes. The patch tool expands a dollar sign followed by a quote in new text and corrupted the slips client once (repaired with a byte-verified full-file put). Research tools are read-only or rolled back (`research_portfolio_roi.py`, `research_leg_rank_models.py`, `research_h7_canary.py`, `research_release_window.py`, `audit_release_path.py`, `audit_season_replay.py`; runner `nba-research-run.yml` accepts only `research_*` / `audit_*` scripts).
- 🔑 **What the hands-off loop did on its own (first 2025-26 replay, 2025-10-21 to 2026-04-12).** Every strategy paper on opening night; week 2 at cap 1 on 10-28, back to paper 11-04; A_wrebounds active 12-27, A_wsteals active 01-03; D_points yellow (cap 1) from 11-12; on 02-10 / 02-11 the shared steals anchor failed (trailing-14-day leg hit 0.340 vs 0.634, z 3.33) and all four family-A strategies went yellow then red together (H7); the first Monday after the break, 02-23, P5 released them on their own records (lower bounds +40% to +50% on 102 days) and A_core / A_wsteals / A_wrebounds were active the same day (their paper gate already met), A_regular back at paper and active 04-02; C_wstocks active 03-05; drought rotation on and off several times; everything off for the final 7 days (04-05). Monthly PLAY ledger at USD 1 per slip: 2025-10 101 slips +75.45 (+74.7%); 11: 420, +441.11 (+105.0%); 12: 429, +397.86 (+92.7%); 2026-01: 542, +321.88 (+59.4%); 02: 225, `-13.14` (`-5.8%`); 03: 557, +537.97 (+96.6%); 04: 62, +122.62 (+197.8%). The loop cut the family's stakes inside two days of the anchor failure and restored them without anyone touching it.
- 🔑 **Research basis and tests behind the adoption decisions (10-15).** Online research: testing-by-betting / anytime-valid sequential tests (arXiv 2603.19551), Kelly for simultaneous bets (J. Quant. Anal. Sports, doi 10.1515/jqas-2020-0122: fractional Kelly against estimation error), pick'em correlation practice (Stokastic); Gemini used for validation only (it flagged the multiple-look risk of a weekly release check and agreed that flat stakes are right when fitted weights do not transfer across seasons). Cross-season stake-sizing test (log growth, fit season to judge season): fit 2024-25 to 2025-26, half-Kelly 0.0843 and inverse-variance 0.0853 against flat 0.0801; fit 2025-26 to 2024-25, 0.0204 / 0.0206 against flat 0.0226 — the weights do not transfer, flat units stay. A_wsteals k10 (+28 / +97) also passed the cap rule but was left out for concentration (9 was already the validated late-March level).
- 🔑 **The All-Star window by strategy (strategy `§31ae`; ROI 2024-25 / 2025-26, 7 days before the break).** A_wsteals_5flex +49 / +14 (42 slips a season), W_core_3power +41 / +116, W_coredemon_3power +18 / +18 — positive in both; A_regular_5power `-100` / `-100`, both demon strategies negative, and A_core_3power, D_points_3power, C_wstocks_4flex, A_wrebounds_4flex flip sign. The runner-up pre-break plan W_core x3 + A_wsteals x3 gave 84 slips, +57.9 (+42.5 / +15.4); the plan chosen is the only shape positive and even in both seasons.
- 🔑🔑 **Full sweep, four days out (owner `10-16 15:48 PT`: *"do another full sweep, be sure that everything is ready, be sure that everything's behaving properly, be sure of the ROI, these leaps, the strategy, if there's no way for improvement"*; ledger block "FULL SWEEP, FOUR DAYS OUT — READINESS, ROI, AND THE ONE LEVER LEFT", `NBA_COMPASS.md` fact `164`).** **Readiness (read from the database and the runs):** P2A / P2B / P3 green 10-15 and 10-16 (10.7 / 4.2 / 5.3 min on 10-16); scheduler enabled and ticking, dispatch chain P2A to P2B to P3 by completion; P1 last failed / skipped 10-12 (known; the curl repair's first live run is P1 10-19). **The ledger is clean for opening night** (`live_slips` 0, `live_pool` 0; `live_state_history` holds only the preseason daily snapshots). Every staked strategy is 'paper' at its cap, both demons red / cap 0 (P5 FAIL), `_ROTATION` normal; `stake_unit` {unit USD 1, min USD 1, below_min skip, play_from_day1 true} — the screen says PLAY for paper strategies, as decided; `anchor_h7` red, `red_release` clean / 10. Credentials: Betr session and refresh token renewed 10-16 20:21Z; ParlayAPI 12,455 credits. Certification: certify 66 checks 0 FAIL, `audit_release_path` PASS, integration ALL PASS, UI 95 of 95 on both paths. **Opening weeks of the hands-off replays at USD 1 (2024-25 / 2025-26):** week 1 +33.9 (+38.5%) / +59.1 (+61.5%); weeks 1–4 `-35.2` / +418.1 — the hard season's November was its drought and the rules held through it.
- 🔑🔑 **The one lever left: the live market term (open item `T48-2`) — SUPERSEDED the same evening, see the "full force from day one" bullets below.** Live legs are scored market-free (`market_feed.refresh_final_hp` false; hurdles on the `_mf` twins). At today's caps the market-INCLUSIVE backtest is better: portfolio 2024-25 +33.8% to +46.8% (+443 units), 2025-26 +73.1% to +78.3% (+175); A_wsteals_5flex +43.1 to +57.4 / +76.7 to +93.8; D_points_3power +11.3 to +41.9 / +36.4 to +32.5; C_wstocks_4flex +19.0 to +28.7 / +48.5 to +40.8. The hands-off replays already read the history's market-inclusive `final_hp`, so the market-free live season should be expected nearer the `_mf` figures until the switch. The decision to flip is made by the new read-only `nba/audit_market_coverage.py` (`NBA_WORKERS.md` `§T49.4`). **Plan:** run it after 10-26 (7 slate dates); if READY, flip four rows together the same day — `refresh_final_hp` true, `live_backtest_suffix` '' , `ud_table` `_dlt_orig2`, `ud_edge_monitor` certified.
- 🔑 **Tested and rejected (10-16): standing C_wstocks_4flex down in the drought rotation.** Its replay legs hit 46–50% in 2024-25's November–January, but on the larger market-free backtest it is POSITIVE on rotation days in both seasons (+14.3% on 84 slips, +71.6% on 28): the replay dip is leg-selection variance, not a drought signal. **Kept:** the below-minimum skip (the replay's +53% / +45% on those slips is in-sample and market-inclusive; the faithful `_mf` twin measured them at +8.1% / `-1.4%`) and the week-1 / week-2 rules (their skipped slips: small either way, no evidence to change).
- 🔑🔑 **Full force from day one — the market term ON (window-only), Underdog played, monitored daily (owner `10-16 16:18 PT`: *"implement and run all the tools, all the strategies, everything that you have, all the filters, everything that improves … run it since day one. And then you monitor it. And if it's not as useful as you thought it was, then we change it. But don't wait."*; ledger block "FULL FORCE FROM DAY ONE", `NBA_COMPASS.md` fact `165`; source `T49`, AS STATED).** Inventory of what was still off: the live market term (`T48-2`, gated on a first-week coverage reading) and the Underdog P5 portfolio (paper since `§31u`); everything else that tested as an improvement was already on (the 10-15 cap raises, clean release, H7 red, rotation, below-minimum skip). Sleeper / Fliff / Betr have no certified backtest (paper under `§31u`) — nothing to switch on.
- 🔑🔑 **A lookahead found and removed before switching.** The certified market-inclusive scoring counts books per rung over EVERY `rung_market` label of the day: `final_hp.c_market` equals the all-label count on 100% of 93,452 legs (2025-11-10..12) and the window-only count on 97.5%; on 2025-11 PrizePicks window rungs, 7.8% are priced only at the close capture and 7.6% by more books at the close. Live P3 scores at the window, before the close exists, so the +13-point gain of market-inclusive over market-free could not be trusted as is. Built the WINDOW-ONLY twin (`nba_score.build_tier_map_legs_sel_wo()`, `nba/sql/build_tier_map_legs_sel_wo.sql`: the market-free twin's formula with c_market = least(1, window books / 4); table `nba_score.tier_map_legs_sel_wo`; `nba_score.rung_books_window`; `nba/research_window_only_twin.py` identity check — wherever window and all-label counts agree the rescored score equals the certified score within one second-decimal rounding step, the certified market-free twin showing the identical 0.02 gaps, 178 of 18,874 legs; 0 breaks in both seasons; 5.4% / 6.8% of legs' books changed); slip engines `slip_engine_slips_wo` 479,002 and `_wo_nosteals` 475,564 slips, graded on today's Flex tiers (0 of 1,394 alternate Flex slips differ from the database regrade). **Pre-registered rule** (`nba/research_market_term_value.py`, written before the tables existed): ON if the window-only portfolio's net AND ROI beat market-free in BOTH seasons — result: SWITCH ON.
- 🔑 **Result at live caps (market-free to window-only; all-label for comparison).** Portfolio 2024-25 +33.8% (+1,150) to **+46.0% (+1,564)** (all-label +46.8%); 2025-26 +73.1% (+2,478) to **+79.0% (+2,675)** (all-label +78.3%) — the gain is the window's, not the close's. By strategy (2024-25 / 2025-26): A_wsteals +43.1 to +56.2 / +76.7 to +94.5; A_regular +42.7 to +51.7 / +126.3 unchanged; A_wrebounds +34.5 to +40.2 / +74.8 to +72.6; A_core +31.9 to +29.5 / +78.4 to +76.6; C_wstocks +19.0 to +26.1 / +48.5 to +42.7; D_points +11.3 to +47.1 / +36.4 to +33.8.
- 🔑🔑 **Switched `2026-10-16` ~23:5xZ.** `market_feed.refresh_final_hp` = true; `live_backtest_suffix.suffix` = `'_wo'` — NOT `''`, because the certified tables carry the lookahead; the two Underdog keys unchanged (the Underdog engine strips the market term itself, `market_free_score`). Chain: validations `slip_validation_wo` / `_wo_nosteals` (A_wsteals, A_regular, D_points now PASS — on `_mf` they were NOT_IN_TOP30; no staked strategy fails); P4 calibrate on `_wo` (`live_strategy_calib`, `_ANCHOR_steals` 0.630); `edge_monitor_ref` rebuilt (19 keys); break-even re-solved on `_wo`: **EDGE_DELTA `-0.0662` to `-0.0748`** (pooled thinning `-7.48` pp, independence `-6.84`, gap 0.64 below 1.0). P5: new step 3d (window-only twin and engines, delta), 5c validates `_wo`, 5d snapshots them, and the regrade covers the `_wo` tables. P3 hardened: the market refresh moved BELOW the P2B wait (it rewrites today's `final_hp` — never while P2B writes it), is soft (failure leaves P2B's market-free scores; each prop rewritten in its own transaction), timed, and logs the day's window rungs priced. Timing: `build_final_hp` dry run on the largest board (2025-12-05, 41,626 legs) about 2 minutes, so opening-night slips about 11:43 PT. **Revert (one decision, same day):** `refresh_final_hp` false + suffix `_mf` + P4 calibrate + P4 edge rebuild + EDGE_DELTA `-0.0662`. The earlier plan (run `audit_market_coverage.py` after 10-26 and flip four rows together) and the note that the live season would track the market-free figures NO LONGER describe the system; the audit stays as a MONITOR, not a gate. Until the first live P3 the 10-20 window has no sportsbook rows, so the market term's first real reading is opening night.
- 🔑 **Underdog is played from opening night.** The Underdog P5 portfolio on its faithful market-free twin (final week out): 4-Standard +115.7% / +88.7%, 6-Flex +44.6% / +174.6%, mains 2-Standard +31.9% / +36.4%. `stake_unit.ud_play` = true; the Slips screen (UI v1.4.7) says PLAY for Underdog P5 slips and SKIP for P4 (shadow), stand-down weeks, a half stake below the minimum, and EVERY Underdog slip once the Underdog edge monitor records ALARM (sticky per season); the day's note totals both apps; UI test C50 covers Underdog (a local unit test of the advice function passed 10 of 10 cases). Underdog is no longer "paper" anywhere this documentation says so. Sleeper / Fliff / Betr stay paper.
- 🔑 **Monitoring.** A scheduled task, "AlphaDog NBA morning monitor", runs 05:52 PT daily with a push notification: pipelines, yesterday's results per app, state / hurdle changes, both edge monitors, the market term (window rungs priced; the `audit_market_coverage` verdict from the 7th slate), today's boards; GREEN / WATCH / ACTION. Read-only — it names what needs attention; changes are decided in the build chat.
- 🔑 **Verified with everything on.** Opening-night rehearsal (sandboxed; `baseline_history` / `final_hp` / `final_hp_derived` / `live_slips` all 0 afterwards): 1,032 scored legs, small slate cap 1, PLAY A_core_3power, A_wrebounds_4flex, C_wstocks_4flex; certify 66 checks 0 FAIL on the `_wo` references; integration ALL PASS (rolled back). **Open items re-read against the live system (owner `10-16 17:40 PT`; ledger block "THE DOCUMENTATION'S T49 OPEN ITEMS, RE-READ AGAINST THE LIVE SYSTEM")** — see `NBA_OPEN_ITEMS.md` `§T49.9`: certifier L11b added (certify now 82 checks 0 FAIL), ParlayAPI empty capture fixed, three items verified, close capture per tip cluster stays a recorded build item.