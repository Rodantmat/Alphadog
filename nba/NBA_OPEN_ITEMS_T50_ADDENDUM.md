# NBA_OPEN_ITEMS - COMPANION FILE: T50 ADDENDUM (2026-10-26)

> The 4.9 MB `NBA_OPEN_ITEMS.md` could not be patched by the bridge on 2026-10-26 (upstream closed the stream on every try after the first T50 deep-pass patches). The edits below are stored here and must be moved into that file by the next session that can patch it. Until then this file is part of the open-items record. Also pending there: the census stamp reads `1,493` while the file has `1,495` headings (the deep pass added `T50.11-Z1` and `T50.11-Z2`), and the marker comment `T50 Z END MARKER` sits just above the `§T49.10` heading and is to be replaced by the bullets of section A.

## A. Contradictions found by the deep pass (to go into `§T50.11-Z2`, replacing the marker)

- 🔑 **Demon ceiling and goblin cut.** The older statements "demon ceiling about 1.75 to 1.9x" and "goblin payout factors take 40 to 53 percent" contradict the system tier map (demon prices D1 1.44x, D2 1.71x, D3 2.43x, maximum 5.76x, cap 18.5x; goblin factors G1 0.756, G2 0.698, G3 0.661). Marked superseded in place in `NBA_GOBLIN_DEMON.md` (5.1, 5.2 and the 7f bullets), `NBA_MULTIPLIERS.md` and the `NBA_GLOSSARY.md` demon entry on 10-26; `NBA_COMPASS.md` fact 61 is not editable here and still carries them; `NBA_PROJECT_LOG.md` lines 594-595 carry them too (superseded notice added at the top of that file).
- 🔑 **Goblin floor and the 6.17 figure.** 0.6333 and 0.614 are one floor (0.6333 x 0.97 = 0.6143, which is 1.843x); 6.17 is 18.5 divided by 3, a payout per three, not a leg factor (the leg factor is 6.94 at cap 0.072).
- 🔑 **Slips-screen note "adjusted by PrizePicks (same game)".** It shows only when the quote's own-structure adjusted flag is set and every leg is a regular line.
- 🔑 **Compression rule check.** The older description "L11 recompute of the compression rule, 66 of 66" is outdated: since grader v3 the check compares every stored payout with the grader-v3 slip payout (83 checks, 0 FAIL). The glossary scope of the compression rule is a 2-pick Power with an alternate, and a single surviving leg after voids.
- 🔑 **Three descriptions of the PrizePicks Flex table** (the 31k, 31aa and 24b records) are not reconciled with each other; the 10-18 proof run (64 of 64 exact) is the resolution the engine uses.
- 🔑 **Pointer.** Related open items from this deep pass: `T50-39` (rule for a lineup left with fewer legs), `T50-46` (strategy-ledger ROI tables priced with the compression rule) and `T50-47` (Playoff Unders deployed rule versus the research recommendation).

## B. Status updates for items written at 10-26 00:11 PT (events later on 10-26, from the file-coverage audit of 13:16 PT)

- ✅ `T50-12` (Sleeper size bonuses at 5 and 6 picks): resolved in substance by the 454-entry payout fit (max bonuses 2: 1.000, 3: 1.0797, 4: 1.1011, 5: 1.1742, 6: 1.2755); the 5- and 6-pick Flex targets remain estimates (few entries). Detail: `NBA_MULTIPLIERS.md` `§T50.3-Z7`, `NBA_DATABASE.md` `§T50.6-Z4`.
- 🔄 `T50-13` (Sleeper and Fliff quote probes): the Sleeper probe is done (probe scripts listed in `NBA_WORKERS.md` `§T50.4-Z8`); the Fliff quote probe is not.
- ✅ `T50-14` / `T50-42` (Sleeper sign-in): bypassed, not solved. The owner's token hand-over on 10-26 (09:54-10:06 PT) gave the system Sleeper read access; the code-only sign-in root cause (a 4-digit code, an hCaptcha challenge that appears as a visible 520x570 frame, the Fliff verify-location gate) is still not fixed. Detail: `NBA_WORKERS.md` `§T50.4-H`, `§T50.4-Z8`.
- 🔄 `T50-44` (upper bound and cross-app transfer): now has Part E and the true-price transfer-study results (`NBA_MULTIPLIERS.md` `§T50.3-Z7`); Sleeper live slips `S_T1_2max` (2-pick Max, +33.0% over 306 replay slips) and `S_T1_3flex` (3-pick Flex, +24.1% over 294 replay slips) were deployed 10-26 12:17-12:28 PT (`NBA_SYSTEM_DESIGN.md` `§T50.7-Z12`, `NBA_SYSTEM_ARCHITECTURE.md` `§T50.8-Z2`). The ROIs are replays at the fitted Sleeper prices, not live results.

## C. Notice that belongs at the top of `NBA_SWEEP_RUN_LOG.md` (5 MB, also not patchable)

Superseded notice (2026-10-26): lines 9-33 (RUN 240 to RUN 245-T) are stale. They give 12 referee rows, no referee log and a board-snapshot anchor flat at 10-06; the referee table now has 21 rows and the referee log 9 rows. The correct facts are in `NBA_DATABASE.md` `§T50.6` and `NBA_SYSTEM_ARCHITECTURE.md` `§T50.8-Z2`. The log's last run is RUN 245 (10-09) and its highest transcript is T31; nothing after that is recorded there by design (the twelve documents carry the record).
