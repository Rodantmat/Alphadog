#!/usr/bin/env python3
"""
NBA SLIP RANK FOUNDATION — the as-of, recalibrated per-leg substrate every rank sorts/filters over.
Phase 1 of slip building. Built on the validated findings in NBA_SLIP_BUILDING_STRATEGY.md §7:
  - §7g/7j: p must be the AS-OF recalibrated hit rate (raw model_p overstates by up to 0.18; the
    recalibration is season-over-season stable so an as-of map is safe, NO leakage).
  - §6a: p·m is the deciding quantity; compute it per leg with the REAL multiplier (prop_universe.factor).
  - §7l: join box scores via player_game_log.nba_player_id::text = prop_universe.player_id.
  - §7k: pool across all props (single prop too thin); the 50-leg cap binds → this is a selection substrate.
  - season_phase carried (early/mid/late) — late-season (<21d to end) realized ~2pp worse, unpriced (§ this run).

WHAT IT BUILDS: nba_score.rank_foundation — one row per graded standard leg with, computed AS-OF
(recalibration fit ONLY on strictly-earlier data, walk-forward by (season, day)):
  game_date, season, season_phase, player_id, prop, side, line, factor (=m),
  model_p (raw), cal_p (as-of recalibrated hit prob), pm (= cal_p * factor), hit,
  role_tier, and the raw ranking inputs (baseline_hp, final_hp, score) pulled from final_hp.
Ranks (Phase 1b) are then VIEWS/queries over this table: prop-line hit, baseline-HP, final-HP,
final-score, player-hit, plain-prop-line — each a different sort, all sharing the one honest cal_p/pm.

AS-OF METHOD (parity rule, fact 100): for each (season, game_date) D, the recalibration map = realized
hit rate by (prop, side, role_tier, model_p decile) computed over ALL graded legs STRICTLY BEFORE D
(prior season entirely + this season up to D-1), shrunk n/(n+K=200) up the parent chain
(prop×side×role → prop×side → prop → global), monotone in model_p decile. A leg on D gets cal_p from
that map. First ~20 days of season 1 have thin priors → cal_p falls back to the parent levels (flagged).

Env: DATABASE_URL, RF_WRITE (1=write else report), RF_K (default 200), RF_MIN_PRIOR (default 50).
This is REPORT MODE by default and does NOT write until RF_WRITE=1 (owner reviews first, §Phase 4.5).
"""
import os
import sys
from datetime import date

import psycopg


def main():
    write = os.environ.get("RF_WRITE", "0") == "1"
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    print(f"rank_foundation builder — write={write}", flush=True)

    # 1) sanity: the id bridge and the join to final_hp both resolve (fail loud if not — §7l scar)
    bridge = conn.execute("""
        SELECT count(*) FROM nba_market.prop_universe pu
        JOIN nba_stats.player_game_log g
          ON g.nba_player_id::text = pu.player_id AND g.game_date = pu.game_date
        WHERE pu.prop='points' AND pu.hit IS NOT NULL LIMIT 1000000
    """).fetchone()[0]
    print(f"  id-bridge join check (points): {bridge} rows — {'OK' if bridge>0 else 'BROKEN, abort'}", flush=True)
    if not bridge:
        print("  ABORT: player_id bridge broken", file=sys.stderr); sys.exit(2)

    fhp = conn.execute("""
        SELECT count(*) FROM nba_market.prop_universe pu
        JOIN nba_score.final_hp f
          ON f.game_date=pu.game_date AND f.player_id=pu.player_id AND f.prop=pu.prop
         AND f.line=pu.line AND f.side=pu.side
        WHERE pu.hit IS NOT NULL LIMIT 1000000
    """).fetchone()[0]
    print(f"  final_hp join check: {fhp} rows — {'OK' if fhp>0 else 'WARN (final_hp keys differ; ranks 2-4 need this)'}", flush=True)

    # 2) report the substrate the ranks will draw on, per season-phase and p·m viability
    rows = conn.execute("""
        WITH bounds AS (
          SELECT season, min(game_date) s0, max(game_date) s1
          FROM nba_market.prop_universe WHERE hit IS NOT NULL GROUP BY season
        ),
        legs AS (
          SELECT pu.season, pu.prop, pu.side, pu.kind, pu.factor, pu.model_p, pu.hit::int h,
            CASE WHEN pu.game_date <= b.s0 + 30 THEN 'early'
                 WHEN pu.game_date >= b.s1 - 21 THEN 'late' ELSE 'mid' END AS phase
          FROM nba_market.prop_universe pu JOIN bounds b ON b.season=pu.season
          WHERE pu.hit IS NOT NULL AND pu.kind='standard' AND pu.model_p IS NOT NULL
        )
        SELECT phase, count(*) n,
               round(avg(h)::numeric,4) realized,
               round(avg(model_p)::numeric,4) claimed,
               round(avg(h*factor)::numeric,4) realized_pm
        FROM legs GROUP BY phase ORDER BY phase
    """).fetchall()
    print("  season-phase substrate (standard legs):", flush=True)
    for r in rows:
        print(f"    {r[0]:<6} n={r[1]:>8}  realized={r[2]}  claimed={r[3]}  realized_p·m={r[4]}", flush=True)

    if not write:
        print("  REPORT MODE — no table written. Set RF_WRITE=1 to build nba_score.rank_foundation.", flush=True)
        conn.close(); return

    # 3) BUILD (walk-forward as-of). Implemented as a single set-based pass using a self-join to
    #    prior-only aggregates at the (prop,side,role_tier,decile) grain with shrinkage — see doc.
    #    (Full implementation added in the next step once report-mode numbers are reviewed.)
    print("  RF_WRITE=1 path is staged; build body added after report-mode review (owner gate).", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
