#!/usr/bin/env python3
"""
RESEARCH - THE MARKET TERM AS LIVE CAN HAVE IT: THE WINDOW-ONLY TWIN (2026-10-16; owner: "implement and run all the tools, all
the strategies ... everything that improves ... since day one. And then you monitor it").  Writes RESEARCH tables only
(nba_score.rung_books_window, nba_score.tier_map_legs_sel_wo); production tables untouched.

Why. The market-inclusive backtest beats the market-free twin (portfolio at today's caps +33.8 -> +46.8% / +73.1 -> +78.3%), but
its book count per rung is the max over the window AND the close capture (final_hp.c_market = all-label count on 100% of legs
sampled; 27% of priced legs carried close-time books). Live P3 scores at the window. Before the market term goes live, its value
must be measured on what live can actually see: the window books only.

Steps: (1) install nba_score.build_tier_map_legs_sel_wo() from nba/sql/build_tier_map_legs_sel_wo.sql; (2) run it; (3) checks:
  identity  - on every final_score leg whose window count equals the stored c_market, the rescored score must equal the stored
              certified score (proves the formula is the production one)
  movement  - legs whose c_market changed, and whose n_rank changed
Then the slip engine builds slip_engine_slips_wo / _wo_nosteals from tier_map_legs_sel_wo (nba-slip-engine.yml) and
research_market_term_value.py compares market-free / window-only / all-label by strategy.
Env: DATABASE_URL.
"""
import os
import time

import psycopg

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    if os.environ.get('WO_CHECK_ONLY') != '1':      # WO_CHECK_ONLY=1: re-run the checks on the existing table (no DROP while engines read it)
        conn.execute(open(os.path.join(HERE, 'sql', 'build_tier_map_legs_sel_wo.sql')).read())
        t0 = time.time()
        n = conn.execute("SELECT nba_score.build_tier_map_legs_sel_wo()").fetchone()[0]
        print(f"tier_map_legs_sel_wo: {n:,} legs in {time.time() - t0:.0f}s", flush=True)
    nw = conn.execute("SELECT count(*), sum(books) FROM nba_score.rung_books_window").fetchone()
    print(f"rung_books_window: {nw[0]:,} window rungs keyed to a player id", flush=True)
    chk = conn.execute("""
        WITH j AS (
          SELECT s.season, s.game_date, s.player, s.prop, s.side, s.line, s.tier, s.score AS s_cert, s.n_rank AS r_cert,
                 w.score AS s_wo, w.n_rank AS r_wo, f.c_market AS cm, least(1.0, coalesce(b.books, 0) / 4.0) AS cmw
          FROM nba_score.tier_map_legs_sel s
          JOIN nba_score.tier_map_legs_sel_wo w ON w.rank_key = s.rank_key AND w.game_date = s.game_date AND w.player = s.player
               AND w.prop = s.prop AND w.side = s.side AND w.line = s.line AND w.tier = s.tier
          JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(s.player)
          JOIN nba_score.final_hp f ON f.game_date = s.game_date AND f.player_id = m.player_id::text AND f.prop = s.prop
               AND f.side = s.side AND f.line = s.line
          LEFT JOIN nba_score.rung_books_window b ON b.game_date = s.game_date AND b.pid = f.player_id AND b.prop = s.prop AND b.line = s.line
          WHERE s.rank_key = 'final_score')
        SELECT season, count(*) legs,
               count(*) FILTER (WHERE abs(cm - cmw) < 1e-9) same_books,
               -- tolerance = one rounding step at the 2nd decimal: the SQL formula rounds in numeric, the production scorer in
               -- float; the certified market-free twin shows the identical 0.02 gaps (178 of 18,874 legs 2025-11-01..07,
               -- max 0.020) - so the twins are built alike (verified 2026-10-16)
               count(*) FILTER (WHERE abs(cm - cmw) < 1e-9 AND abs(s_wo - s_cert) > 0.0201) identity_breaks,
               count(*) FILTER (WHERE abs(cm - cmw) >= 1e-9) books_changed,
               count(*) FILTER (WHERE r_wo <> r_cert) rank_changed,
               avg(cm)::float cm_all, avg(cmw)::float cm_window
        FROM j GROUP BY 1 ORDER BY 1""").fetchall()
    ok = True
    for season, legs, same, brk, chg, rch, cma, cmw in chk:
        print(f"{season}: {legs:,} final_score legs | window count = stored count on {same:,} ({same / legs:.1%}) | identity breaks {brk:,} "
              f"| books changed {chg:,} ({chg / legs:.1%}) | rank changed {rch:,} | mean c_market all-label {cma:.4f} -> window {cmw:.4f}", flush=True)
        ok &= brk == 0
    print("RESULT:", "PASS (formula reproduces the certified score wherever the books agree)" if ok else "FAIL (identity breaks)", flush=True)
    if not ok:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
