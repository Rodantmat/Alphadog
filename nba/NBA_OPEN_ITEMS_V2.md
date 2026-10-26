# NBA OPEN ITEMS — V2 (CONTINUATION) — everything unresolved, and everything only the owner can decide, from `2026-10-26` on

> 🔗 **THIS FILE AND `NBA_OPEN_ITEMS.md` ARE ONE DOCUMENT. ALWAYS READ AND TREAT BOTH AS A WHOLE.** `NBA_OPEN_ITEMS.md` ("V1", about 4.9 MB) holds every open item up to and including `§T50.11` (`T50-1` … `T50-48`, `§T50.11-Z1`, `§T50.11-Z2`). **This file ("V2") continues it.** V1 can no longer be patched by the bridge that writes to the repository (every write fails with "upstream closed the stream"), so V2 exists to keep each file small on disk. Numbering is unbroken: the next new open item is `T51-1` (or the next `T50-n` if it belongs to the T50 batch), and **every new open item, status change or closure is written in V2, never in V1.** When V2 nears about 1.5 MB, open `NBA_OPEN_ITEMS_V3.md` the same way and add a pointer here. A status given in V2 about an item numbered in V1 SUPERSEDES the V1 text (the old text is not edited; read V2 last).
>
> 📏 **`5` sections · re-derived `2026-10-26`**: `` grep -cE '^(> *)*#{1,6} ' nba/NBA_OPEN_ITEMS_V2.md ``. V1's own stamp reads `1,493` while V1 holds `1,495` headings (the deep pass added `§T50.11-Z1` and `§T50.11-Z2` without a stamp change): the V1 figure is stale by `2` and could not be corrected; the true V1 count is `1,495`. The whole document is V1 plus V2.

> 🧭 **The one pending edit inside V1.** The comment line `T50 Z END MARKER` sits just above the `§T49.10` heading in V1; it marks where the six remaining contradiction bullets of section A below belong. The bullets are stored here instead. Companion chapters for the master summary: `NBA_MASTER_SUMMARY_V2.md`.

## A. Contradictions found by the T50 deep pass (they belong in `§T50.11-Z2`, which holds the first four of ten)

- 🔑 **Demon ceiling and goblin cut.** The older statements "demon ceiling about 1.75 to 1.9x" and "goblin payout factors take 40 to 53 percent" contradict the system tier map (demon prices D1 1.44x, D2 1.71x, D3 2.43x, maximum 5.76x, cap 18.5x; goblin factors G1 0.756, G2 0.698, G3 0.661). Marked superseded in place in `NBA_GOBLIN_DEMON.md` (5.1, 5.2 and the 7f bullets), `NBA_MULTIPLIERS.md` and the `NBA_GLOSSARY.md` demon entry on 10-26; `NBA_COMPASS.md` fact 61 is not editable here and still carries them; `NBA_PROJECT_LOG.md` lines 594-595 carry them too (superseded notice added at the top of that file).
- 🔑 **Goblin floor and the 6.17 figure.** 0.6333 and 0.614 are one floor (0.6333 x 0.97 = 0.6143, which is 1.843x); 6.17 is 18.5 divided by 3, a payout per three, not a leg factor (the leg factor is 6.94 at cap 0.072).
- 🔑 **Underdog 4-pick Flex.** Every older statement of 6x (or 6.0) for the 4-pick Flex all-hit is superseded by 7.2 (`47/47` Standard and `36/36` Flex exact on the app's own estimate endpoint); the engine paths were unified on 10-21. COMPASS and the strategy file carry the old figure and are not editable here.
- 🔑 **Betr is parked.** Statements that treat Betr as a live scored board (before 10-19 22:51 PT) are superseded; Betr's payout rule is the priced-by-server rule (`betr_payout_v1`), verified `230/230` Perfect and `586/586` Dynamic.
- 🔑 **Fliff has a pick'em table.** The older "no pick'em table" statement is wrong: public per-selection multipliers exist (contest multiplier = product; Flex allows 1 loss, SuperFlex 2); only the quote and contest calls are private.
- 🔑 **Three descriptions of the PrizePicks Flex table** (the 31k, 31aa and 24b records) are not reconciled with each other; the 10-18 proof run (64 of 64 exact) is the resolution the engine uses.
- 🔑 **Pointer.** Related open items from this deep pass: `T50-39` (rule for a lineup left with fewer legs), `T50-46` (strategy-ledger ROI tables priced with the compression rule) and `T50-47` (Playoff Unders deployed rule versus the research recommendation).

## B. Status updates for items written at 10-26 00:11 PT (events later on 10-26, from the file-coverage audit of 13:16 PT)

- ✅ `T50-12` (Sleeper size bonuses at 5 and 6 picks): resolved in substance by the 454-entry payout fit (max bonuses 2: 1.000, 3: 1.0797, 4: 1.1011, 5: 1.1742, 6: 1.2755); the 5- and 6-pick Flex targets remain estimates (few entries). Detail: `NBA_MULTIPLIERS.md` `§T50.3-Z7`, `NBA_DATABASE.md` `§T50.6-Z4`.
- 🔄 `T50-13` (Sleeper and Fliff quote probes): the Sleeper probe is done (probe scripts listed in `NBA_WORKERS.md` `§T50.4-Z8`); the Fliff quote probe is not.
- ✅ `T50-14` / `T50-42` (Sleeper sign-in): bypassed, not solved. The owner's token hand-over on 10-26 (09:54-10:06 PT) gave the system Sleeper read access; the code-only sign-in root cause (a 4-digit code, an hCaptcha challenge that appears as a visible 520x570 frame, the Fliff verify-location gate) is still not fixed. Detail: `NBA_WORKERS.md` `§T50.4-H`, `§T50.4-Z8`.
- 🔄 `T50-44` (upper bound and cross-app transfer): now has Part E and the true-price transfer-study results (`NBA_MULTIPLIERS.md` `§T50.3-Z7`); Sleeper live slips `S_T1_2max` (2-pick Max, +33.0% over 306 replay slips) and `S_T1_3flex` (3-pick Flex, +24.1% over 294 replay slips) were deployed 10-26 12:17-12:28 PT (`NBA_SYSTEM_DESIGN.md` `§T50.7-Z12`, `NBA_SYSTEM_ARCHITECTURE.md` `§T50.8-Z2`). The ROIs are replays at the fitted Sleeper prices, not live results.

## C. Superseded notice for `NBA_SWEEP_RUN_LOG.md` (5 MB, also not patchable; not one of the twelve documents)

Lines 9-33 (RUN 240 to RUN 245-T) are stale. They give 12 referee rows, no referee log and a board-snapshot anchor flat at 10-06; the referee table now has 21 rows and the referee log 9 rows. The correct facts are in `NBA_DATABASE.md` `§T50.6` and `NBA_SYSTEM_ARCHITECTURE.md` `§T50.8-Z2`. The log's last run is RUN 245 (10-09) and its highest transcript is T31; nothing after that is recorded there by design (the twelve documents carry the record).

## D. Items still unverified at the end of the T50 batch (nothing here is a claim of fact)

- `build_confidence_v3` parity (the speed fix's audit, `T50-19`); the Sleeper login root cause; the Fliff login and quote probe; the results of the seven Sleeper transfer runs; the new-file count (162 in the documents against 164-181 in working lists).
- `NBA_COMPASS.md` facts 61 and 91 still carry the old wrong claims (a read-only file of the build chat).
- Some Z-section figures rest on the reviewers' gap files rather than a re-read of the transcripts.
- Anything the build chat pushed after `10-26 13:16 PT` is not covered; sweep count `0` (every write resets it; three clean verification sweeps are owed).

---
> 📍 **APPEND NEW OPEN ITEMS AND STATUS CHANGES BELOW THIS LINE, IN THIS FILE.**
