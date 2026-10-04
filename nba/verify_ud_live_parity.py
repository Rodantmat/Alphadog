#!/usr/bin/env python3
"""
UNDERDOG LIVE ENGINE - MULTI-SLATE PARITY (strategy doc §31f). READ-ONLY: nothing is written.
For every 2025-26 slate (the season whose backtest modifiers are the board's own - the 2024-25 backtest used delta-repriced
modifiers, §30s, so it is not directly comparable), the live engine's OWN code (ud_live_slip_engine.load_legs ->
build_ud_slip_engine.eligible_legs -> build_day_slips, the same calls pick() makes, minus the insert) is compared with the
backtest build nba_score.ud_slip_engine_slips_dlt_orig2 (original cells, centers out) for P5's and P4's slots:
  SELECTION  slip leg sets identical per (composition, size, structure, k)
  SETTLEMENT live payout (ud_live_slip_engine.payout on box-score outcomes, Underdog's void rule) vs the backtest payout
             divided by the backtest's per-leg confidence discount (0.5% mains / 1% priced) - must agree to 1e-6;
             hits identical
Env: DATABASE_URL.
"""
import math
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('UD_EXCL_CENTER', '1')
import psycopg  # noqa: E402

import ud_live_slip_engine as U  # noqa: E402
E = U.E
SLOTS = [('weighted:points_R_U', 4, 'standard', 1), ('weighted:points_R_U', 6, 'flex', 1),
         ('mains', 2, 'standard', 2), ('weighted:points_R_U', 2, 'standard', 2)]


def key(slip):
    return tuple(sorted((l['player'], l['prop'], l['side'], float(l['line'])) for l in slip))


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    days = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_score.ud_slip_engine_slips_dlt_orig2
                                          WHERE season='2025-26' ORDER BY 1""").fetchall()]
    print(f"Underdog multi-slate parity over {len(days)} slates of 2025-26", flush=True)
    tot = Counter(); ex = []
    for i, day in enumerate(days, 1):
        legs = U.load_legs(conn, day)
        # box score first: the backtest's tier map kept only legs whose player PLAYED and whose stat != line (a hindsight
        # filter live cannot apply). Apples-to-apples applies that same filter to the live legs BEFORE ranking.
        box = {}
        for pid, pts, reb, ast, fg3m, stl, blk, tov, mins in conn.execute("""SELECT nba_player_id::text, pts, reb, ast, fg3m, stl, blk, tov, min
                FROM nba_stats.player_game_log WHERE game_date=%s""", (day,)).fetchall():
            box[pid] = dict(pts=pts or 0, reb=reb or 0, ast=ast or 0, fg3m=fg3m or 0, stl=stl or 0, blk=blk or 0, tov=tov or 0, min=mins)
        def is_void(l):
            s = box.get(str(l['player_id']))
            return (not s) or (not s['min']) or U.STAT[l['prop']](s) == l['line']
        kept = [dict(l) for l in legs if not is_void(l)]
        groups = {}
        for l in kept:
            groups.setdefault((l['rank_key'], l['prop'], l['tier']), []).append(l)
        for g in groups.values():
            g.sort(key=lambda l: (-l['score'], l['player']))
            for r, l in enumerate(g, start=1):
                l['n_rank'] = r
        raw_pool = E.eligible_legs(legs)
        pool = E.eligible_legs(kept)
        bt = {}
        for comp, size, structure, k, legs_json, hits, payout in conn.execute("""
                SELECT composition, size, structure, k, legs_json, hits, payout FROM nba_score.ud_slip_engine_slips_dlt_orig2
                WHERE game_date=%s""", (day,)).fetchall():
            bt[(comp, size, structure, k)] = (legs_json, hits, payout)
        for comp, size, structure, cap in SLOTS:
            raw = E.build_day_slips(raw_pool, comp, size, cap)
            for k in range(1, cap + 1):
                b = bt.get((comp, size, structure, k)); r_ = raw[k - 1] if len(raw) >= k else None
                if b is not None and r_ is not None:
                    bk = tuple(sorted((j['player'], j['prop'], j['side'], float(j['line'])) for j in b[0]))
                    if key(r_) == bk:
                        tot['raw_identical'] += 1
                    else:
                        tot['raw_differ_void_in_slip' if any(is_void(x) for x in r_) else 'raw_differ_rank_shift'] += 1
            live = E.build_day_slips(pool, comp, size, cap)
            for k in range(1, cap + 1):
                b = bt.get((comp, size, structure, k))
                l = live[k - 1] if len(live) >= k else None
                if b is None and l is None:
                    tot['both_none'] += 1; continue
                if b is None or l is None:
                    tot['SEL_one_side_only'] += 1
                    if len(ex) < 12: ex.append((str(day), comp, size, structure, k, 'live' if l else 'backtest', 'only'))
                    continue
                bk = tuple(sorted((j['player'], j['prop'], j['side'], float(j['line'])) for j in b[0]))
                if key(l) != bk:
                    tot['SEL_DIFFER'] += 1
                    if len(ex) < 12: ex.append((str(day), comp, size, structure, k, 'live', key(l), 'bt', bk))
                    continue
                tot['sel_identical'] += 1
                # settlement
                rem = []
                for leg in l:
                    s = box.get(str(leg['player_id']))
                    if not s or not s['min']:
                        continue
                    v = U.STAT[leg['prop']](s)
                    if v == leg['line']:
                        continue
                    rem.append({**leg, 'hit': (v > leg['line']) if leg['side'] == 'Over' else (v < leg['line'])})
                p_live = U.payout(structure, rem)
                in_product = rem if (structure == 'standard' or len(rem) == 2) else [r for r in rem if r['hit']]
                disc = math.prod((1 - 0.005) if j.get('kind', 'main') == 'main' else (1 - 0.01) for j in in_product)
                p_bt = float(b[2]) / disc if b[2] is not None else None
                hits_live = sum(1 for r in rem if r['hit'])
                if p_live is None or len(rem) < len(l):
                    tot['settle_void_case'] += 1     # the backtest excluded void legs at selection; compared on hits only
                    if b[1] is not None and hits_live != int(b[1]) and len(rem) == len(l):
                        tot['SETTLE_HITS_DIFFER'] += 1
                    continue
                if hits_live != int(b[1]):
                    tot['SETTLE_HITS_DIFFER'] += 1
                    if len(ex) < 12: ex.append((str(day), comp, size, structure, k, 'hits live', hits_live, 'bt', b[1]))
                elif abs(p_live - p_bt) > 1e-6:
                    tot['SETTLE_PAYOUT_DIFFER'] += 1
                    if len(ex) < 12: ex.append((str(day), comp, size, structure, k, 'payout live', p_live, 'bt/disc', p_bt))
                else:
                    tot['settle_identical'] += 1
        if i % 25 == 0:
            print(f"  {i}/{len(days)} {dict(tot)}", flush=True)
    print("\n== RESULT ==", flush=True)
    for k_, v in sorted(tot.items()):
        print(f"  {k_:<22} {v:,}", flush=True)
    print("  examples:", flush=True)
    for e in ex:
        print(f"    {e}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
