#!/usr/bin/env python3
"""
RESEARCH PROBE - HOW THE PRIZEPICKS BOARD DIFFERS, GROUNDED ON THE SPORTSBOOK MARKET (2026-10-22 PT; owner 16:33 PT: "research
online instead of guessing ... probe it, test it a few days manually ... get the board from today, yesterday, and before yesterday
... the same first, second, and third day for the past two seasons ... compare to market ... which edge it holds for different prop
lines, different player profiles"). READ-ONLY, small: one pass over the standard PrizePicks lines.

The published ideas it tests (sources in the ledger entry):
  H1 opening-week Unders (Kirch 2013, NBA game totals: Week 1 unders 58.2%) - does it show on player props, days 1-3 / first 30?
  H2 role players are softer than stars (secondary props carry 6-10% hold vs 4-6% for stars - Wizard of Odds)
  H3 low-count props (steals / blocks / turnovers / threes) are the most mispriced
  H4 the pick'em-vs-market method: the de-vigged sportsbook probability of the better side, against the payout's break-even
Per period (2024-25 / 2025-26: days 1-3, days 4-30, the rest; 2026-27: each live day) x prop family x player role (points line
<12 role / 12-20 / 20+ star / no points line):
  A  coverage: standard PrizePicks lines, players, share with a same-line sportsbook consensus (nba_market.market_consensus,
     window snapshot, books >= 1 and >= 2)
  B  the Under rate of the standard lines (board_outcomes)
  C  market grounding: of lines with a consensus, the realized hit rate of the market's better side, by its fair probability
     bucket (0.50-0.54 / 0.54-0.58 / 0.58+) - is the sportsbook's lean worth anything on PrizePicks' line, and where
Env: DATABASE_URL.
"""
import datetime as dt
import os
from collections import defaultdict

import psycopg

LIVE = [dt.date(2026, 10, 20), dt.date(2026, 10, 21), dt.date(2026, 10, 22)]
OPEN = {"2024-25": dt.date(2024, 10, 22), "2025-26": dt.date(2025, 10, 21)}
END = {"2024-25": dt.date(2025, 4, 13), "2025-26": dt.date(2026, 4, 12)}
FAM = {"player_steals": "DEF", "player_blocks": "DEF", "player_turnovers": "DEF", "player_blocks_steals": "DEF",
       "player_points": "SCORE", "player_points_rebounds_assists": "SCORE", "player_points_rebounds": "SCORE",
       "player_points_assists": "SCORE", "player_rebounds": "BOARDS", "player_rebounds_assists": "BOARDS",
       "player_assists": "AST", "player_threes": "3PM"}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    slate_days = {}
    for s, d0 in OPEN.items():
        ds = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_market.board_snapshots WHERE bookmaker = 'prizepicks'
                                            AND snapshot_label = 'window' AND game_date BETWEEN %s AND %s ORDER BY 1""", (d0, END[s])).fetchall()]
        for i, d in enumerate(ds, 1):
            slate_days[d] = (s, i)
    for i, d in enumerate(LIVE, 1):
        slate_days[d] = ("2026-27", i)

    def period(d):
        s, i = slate_days[d]
        if s == "2026-27":
            return f"2026-27 day {i}"
        return f"{s} {'d1-3' if i <= 3 else ('d4-30' if i <= 30 else 'rest')}"

    days = sorted(slate_days)
    rows = conn.execute("""SELECT DISTINCT game_date, player, market_key, line::float8 FROM nba_market.board_snapshots
                           WHERE bookmaker = 'prizepicks' AND snapshot_label = 'window' AND market_key = ANY(%s)
                             AND game_date = ANY(%s::date[])""", (list(FAM), days)).fetchall()
    print(f"standard PrizePicks lines: {len(rows):,} on {len(days)} slates", flush=True)
    res = {}
    for d, pl, mk, line, r in conn.execute("""SELECT game_date, player, regexp_replace(market_key, '_alternate$', ''), line::float8, leg_result
                                              FROM nba_market.board_outcomes WHERE game_date = ANY(%s::date[])
                                                AND leg_result IN ('over_win', 'under_win')""", (days,)):
        res[(d, pl, mk, line)] = r
    mkt = {}
    for d, pl, mk, line, books, p in conn.execute("""SELECT game_date, player, market_key, line::float8, books, p_over_median
                                                     FROM nba_market.market_consensus WHERE snapshot_label = 'window'
                                                       AND game_date = ANY(%s::date[]) AND p_over_median IS NOT NULL""", (days,)):
        mkt[(d, pl, mk, line)] = (int(books or 0), float(p))
    print(f"outcomes {len(res):,}; market consensus rows {len(mkt):,}", flush=True)
    ptsline = {}
    for d, pl, mk, line in rows:
        if mk == "player_points":
            ptsline[(d, pl)] = max(line, ptsline.get((d, pl), 0))

    def role(d, pl):
        x = ptsline.get((d, pl))
        return "no pts line" if x is None else ("role <12" if x < 12 else ("mid 12-20" if x < 20 else "star 20+"))

    A = defaultdict(lambda: [0, set(), 0, 0])
    B = defaultdict(lambda: [0, 0])
    C = defaultdict(lambda: [0, 0])
    for d, pl, mk, line in rows:
        per, fam, rl = period(d), FAM[mk], role(d, pl)
        m = mkt.get((d, pl, mk, line))
        r = res.get((d, pl, mk, line))
        for key in ((per, fam, "ALL"), (per, "ALL", rl), (per, fam, rl), (per, "ALL", "ALL")):
            a = A[key]
            a[0] += 1
            a[1].add((d, pl))
            a[2] += 1 if m and m[0] >= 1 else 0
            a[3] += 1 if m and m[0] >= 2 else 0
            if r:
                B[key][0] += 1
                B[key][1] += r == "under_win"
            if r and m:
                p = m[1]
                fair = max(p, 1 - p)
                bucket = "0.50-0.54" if fair < 0.54 else ("0.54-0.58" if fair < 0.58 else "0.58+")
                hit = (r == "over_win") == (p >= 0.5)
                for bk in (bucket, "ALL"):
                    C[key + (bk,)][0] += 1
                    C[key + (bk,)][1] += hit
    pers = sorted({k[0] for k in A})
    print("\nA+B  COVERAGE AND UNDER RATE - period x family (ALL roles), then period x role (ALL families)")
    print(f"{'period':<20} {'group':<14} {'lines':>7} {'players':>7} {'mkt>=1':>7} {'mkt>=2':>7} {'graded':>7} {'Under %':>8}")
    for per in pers:
        for g in ["ALL", "SCORE", "BOARDS", "AST", "3PM", "DEF"]:
            a, b = A.get((per, g, "ALL")), B.get((per, g, "ALL"))
            if a:
                print(f"{per:<20} {g:<14} {a[0]:>7} {len(a[1]):>7} {a[2] / a[0]:>7.1%} {a[3] / a[0]:>7.1%} {b[0] if b else 0:>7} "
                      f"{(b[1] / b[0]) if b and b[0] else float('nan'):>8.1%}")
        for g in ["star 20+", "mid 12-20", "role <12", "no pts line"]:
            a, b = A.get((per, "ALL", g)), B.get((per, "ALL", g))
            if a:
                print(f"{per:<20} {g:<14} {a[0]:>7} {len(a[1]):>7} {a[2] / a[0]:>7.1%} {a[3] / a[0]:>7.1%} {b[0] if b else 0:>7} "
                      f"{(b[1] / b[0]) if b and b[0] else float('nan'):>8.1%}")
    print("\nC  MARKET GROUNDING - realized hit rate of the sportsbook's better side on PrizePicks' own line, by its fair probability")
    print("   (break-evens per leg: 6-pick Flex ~0.54, 2-pick Power ~0.577)")
    for per in pers:
        for key in [(per, g, "ALL") for g in ["ALL", "SCORE", "BOARDS", "AST", "3PM", "DEF"]] + \
                   [(per, "ALL", g) for g in ["star 20+", "mid 12-20", "role <12", "no pts line"]]:
            cells = [(bk, C.get(key + (bk,))) for bk in ("0.50-0.54", "0.54-0.58", "0.58+", "ALL")]
            if not any(c for _, c in cells):
                continue
            print(f"  {per:<20} {key[1] if key[1] != 'ALL' else key[2]:<12} " + " | ".join(
                f"{bk} n{c[0]:>5} hit {c[1] / c[0]:.3f}" if c else f"{bk} n    0" for bk, c in cells))
    # live board depth vs history (who is on the board)
    print("\nD  WHO IS ON THE BOARD - standard lines per game and players per game, history d1-3 vs live")
    for per in pers:
        a = A.get((per, "ALL", "ALL"))
        if a:
            ds = [d for d in days if period(d) == per]
            games = conn.execute("""SELECT count(DISTINCT event_id) FROM nba_market.board_snapshots WHERE bookmaker = 'prizepicks'
                                    AND snapshot_label = 'window' AND game_date = ANY(%s::date[])""", (ds,)).fetchone()[0]
            print(f"  {per:<20} slates {len(ds):>3} games {games:>4} lines/game {a[0] / max(1, games):6.1f} "
                  f"players/game {len(a[1]) / max(1, games):5.1f}")


if __name__ == "__main__":
    main()
