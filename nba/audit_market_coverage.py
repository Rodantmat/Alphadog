#!/usr/bin/env python3
"""
AUDIT - IS THE LIVE MARKET TERM READY TO SWITCH ON? (2026-10-16; open item T48-2, delegated by the owner: "does not depend on
me"; certification ledger "THE MARKET TERM GOES LIVE THROUGH PARLAYAPI" switch rule).  READ-ONLY.

The live engine scores legs market-free (classification_config['market_feed'].refresh_final_hp = false; hurdles calibrated on the
_mf twins). The market-inclusive build is better on the backtest (A_wsteals_5flex at cap 9: 2024-25 +43.1% -> +57.4%, 2025-26
+76.7% -> +93.8%), but only if the live market term is the SAME currency as the history's: the same books, the same share of
PrizePicks rungs priced, the same depth. This audit compares, per live slate date, the PrizePicks WINDOW rungs priced by the
certified book set (nba_market.rung_market, built by P3's build_rung_market from the ParlayAPI capture) with the history's
reference over the same weeks of the season (2024-25 and 2025-26, first N days from opening night).

Reported per live date and pooled:
  coverage   share of PrizePicks window rungs with >= 1 certified book at that exact line
  players    share of PrizePicks players with >= 1 priced rung (a low value with high coverage elsewhere = a NAME mismatch)
  depth      mean books per priced rung; share with >= 4 books
  books      which certified books appear (ParlayAPI vs the Odds API backfill)
  names      PrizePicks players with no book row that day under their own name but one under nba_ref.norm_name (fixable)
Verdict (rule fixed before any live reading): READY when, pooled over >= 5 live slate dates, coverage >= 0.85 x the reference,
mean depth >= 0.85 x the reference and the player match >= 0.95; otherwise NOT READY with the reason.
Env: DATABASE_URL, MC_FROM (first live date, default 2026-10-20), MC_TO (default today), MC_REF_DAYS (default 28).
"""
import datetime as dt
import os

import psycopg

BOOKS = ('draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'betrivers', 'bovada', 'betonlineag', 'fanatics')

COV_SQL = """
WITH r AS (SELECT DISTINCT game_date, player, base_market AS market, line FROM nba_market.board_tiers_v2
           WHERE bookmaker = 'prizepicks' AND snapshot_label = 'window' AND game_date BETWEEN %(d0)s AND %(d1)s)
SELECT r.game_date, count(*) rungs, count(m.books) priced, avg(m.books)::float depth, avg((m.books >= 4)::int)::float deep4,
       count(DISTINCT r.player) players, count(DISTINCT r.player) FILTER (WHERE m.books IS NOT NULL) players_priced
FROM r LEFT JOIN nba_market.rung_market m ON m.game_date = r.game_date AND m.snapshot_label = 'window' AND m.player = r.player
     AND m.market = r.market AND m.line = r.line
GROUP BY ROLLUP (r.game_date) ORDER BY r.game_date NULLS LAST"""


def pooled(rows):
    tot = [x for x in rows if x[0] is None]
    if not tot:
        return None
    _, rungs, priced, depth, deep4, players, ppriced = tot[0]
    return dict(rungs=rungs, cov=priced / rungs if rungs else 0.0, depth=depth or 0.0, deep4=deep4 or 0.0,
                pmatch=ppriced / players if players else 0.0, days=len(rows) - 1)


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    d0 = dt.date.fromisoformat(os.environ.get('MC_FROM', '2026-10-20'))
    d1 = dt.date.fromisoformat(os.environ['MC_TO']) if os.environ.get('MC_TO') else dt.date.today()
    ref_days = int(os.environ.get('MC_REF_DAYS', '28'))
    refs = []
    for s0 in (dt.date(2024, 10, 22), dt.date(2025, 10, 21)):
        rows = conn.execute(COV_SQL, dict(d0=s0, d1=s0 + dt.timedelta(days=ref_days))).fetchall()
        p = pooled(rows)
        refs.append(p)
        print(f"REFERENCE {s0} + {ref_days} days: {p['days']} dates, {p['rungs']:,} PP window rungs | coverage {p['cov']:.1%} | players "
              f"matched {p['pmatch']:.1%} | depth {p['depth']:.2f} books | >=4 books {p['deep4']:.1%}", flush=True)
    ref = dict(cov=sum(r['cov'] for r in refs) / 2, depth=sum(r['depth'] for r in refs) / 2)
    print(f"reference (mean of both seasons): coverage {ref['cov']:.1%}, depth {ref['depth']:.2f}\n", flush=True)

    rows = conn.execute(COV_SQL, dict(d0=d0, d1=d1)).fetchall()
    print(f"LIVE {d0} .. {d1}:", flush=True)
    for gd, rungs, priced, depth, deep4, players, ppriced in rows:
        if gd is None:
            continue
        print(f"  {gd}: {rungs:>6,} rungs | coverage {priced / rungs:.1%} | players {ppriced}/{players} | depth {(depth or 0):.2f} "
              f"| >=4 {(deep4 or 0):.1%}", flush=True)
    live = pooled(rows)
    bk = conn.execute("""SELECT bookmaker, count(*), count(DISTINCT player) FROM nba_market.board_snapshots
                         WHERE game_date BETWEEN %s AND %s AND snapshot_label = 'window' AND bookmaker = ANY(%s)
                         GROUP BY 1 ORDER BY 2 DESC""", (d0, d1, list(BOOKS))).fetchall()
    print("  certified books in the live window rows: " + (", ".join(f"{b} {n:,} rows / {p} players" for b, n, p in bk) or "none yet"), flush=True)
    nm = conn.execute("""WITH pp AS (SELECT DISTINCT game_date, player FROM nba_market.board_tiers_v2 WHERE bookmaker = 'prizepicks'
                                     AND snapshot_label = 'window' AND game_date BETWEEN %(d0)s AND %(d1)s),
                              sb AS (SELECT DISTINCT game_date, player FROM nba_market.board_snapshots WHERE snapshot_label = 'window'
                                     AND bookmaker = ANY(%(b)s) AND game_date BETWEEN %(d0)s AND %(d1)s)
                         SELECT pp.game_date, pp.player, min(sb.player) FROM pp
                         JOIN sb ON sb.game_date = pp.game_date AND nba_ref.norm_name(sb.player) = nba_ref.norm_name(pp.player)
                         WHERE NOT EXISTS (SELECT 1 FROM sb s2 WHERE s2.game_date = pp.game_date AND s2.player = pp.player)
                         GROUP BY 1, 2 ORDER BY 1, 2""", dict(d0=d0, d1=d1, b=list(BOOKS))).fetchall()
    print(f"  name mismatches (book row only under the normalized name): {len(nm)}"
          + ("".join(f"\n    {d} PP '{a}' vs book '{b}'" for d, a, b in nm[:40])), flush=True)

    if not live or live['days'] == 0:
        print("\nVERDICT: NOT READY - no live slate date priced yet (the first reading is opening night)", flush=True)
        return
    reasons = []
    if live['days'] < 5:
        reasons.append(f"only {live['days']} live dates (rule: >= 5)")
    if live['cov'] < 0.85 * ref['cov']:
        reasons.append(f"coverage {live['cov']:.1%} < 85% of the reference {ref['cov']:.1%}")
    if live['depth'] < 0.85 * ref['depth']:
        reasons.append(f"depth {live['depth']:.2f} < 85% of the reference {ref['depth']:.2f}")
    if live['pmatch'] < 0.95:
        reasons.append(f"player match {live['pmatch']:.1%} < 95%")
    print(f"\nLIVE pooled: {live['days']} dates, coverage {live['cov']:.1%}, depth {live['depth']:.2f}, >=4 {live['deep4']:.1%}, "
          f"players matched {live['pmatch']:.1%}", flush=True)
    print("VERDICT: " + ("READY - flip the four rows together (ledger switch rule)" if not reasons else "NOT READY - " + "; ".join(reasons)), flush=True)
    conn.close()


if __name__ == '__main__':
    main()
