#!/usr/bin/env python3
"""
WHOLE-NUMBER LINE PRICING - RESEARCH GATE 1 (strategy doc §31s, G1). Read-only.
For every PrizePicks window leg at a WHOLE-NUMBER line k (both seasons), derive its price from the model's two adjacent
half-point rungs - exact for count stats:
    P(More wins) = Over(k+0.5)      P(Less wins) = Under(k-0.5)      P(tie) = 1 - both
    conditional on no tie: p_more = O / (O + U),  p_less = U / (O + U)   (for final_hp and baseline_hp alike)
and grade it against the box score (More / Less / TIE). Reports:
  coverage   - share of whole-number legs whose two adjacent rungs exist
  tie rate   - predicted vs actual, by prop
  calibration- predicted conditional win probability (bins) vs the actual win rate among non-tied legs, beside the same table
               for HALF-POINT legs (the benchmark the model is certified on)
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import psycopg

STAT = {'points': 'pts', 'rebounds': 'reb', 'assists': 'ast', 'threes_made': 'fg3m', 'steals': 'stl', 'blocks': 'blk', 'turnovers': 'tov',
        'pts_reb': 'pts+reb', 'pts_ast': 'pts+ast', 'reb_ast': 'reb+ast', 'pra': 'pts+reb+ast', 'stocks': 'stl+blk'}
SQL = """
WITH pr AS MATERIALIZED (SELECT p.game_date, nba_ref.norm_name(p.player) cn, p.side, p.line, p.kind,
     CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra'
       WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END prop
   FROM nba_market.pp_leg_price p WHERE p.snapshot_label='window' AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)
     AND p.game_date BETWEEN '2024-10-22' AND '2026-04-12'),
r AS MATERIALIZED (SELECT DISTINCT pr.*, nm.player_id FROM pr JOIN nba_ref.player_name_map nm ON nm.norm_name = pr.cn)
SELECT r.game_date, r.player_id, r.prop, r.side, r.line, (r.line = floor(r.line)) is_int,
  o.final_hp, u.final_hp, o.baseline_hp, u.baseline_hp, h.final_hp,
  g.pts, g.reb, g.ast, g.fg3m, g.stl, g.blk, g.tov, g.min
FROM r
LEFT JOIN nba_score.final_hp o ON o.game_date=r.game_date AND o.player_id=r.player_id AND o.prop=r.prop AND o.side='Over'  AND o.line = r.line + 0.5 AND r.line = floor(r.line)
LEFT JOIN nba_score.final_hp u ON u.game_date=r.game_date AND u.player_id=r.player_id AND u.prop=r.prop AND u.side='Under' AND u.line = r.line - 0.5 AND r.line = floor(r.line)
LEFT JOIN nba_score.final_hp h ON h.game_date=r.game_date AND h.player_id=r.player_id AND h.prop=r.prop AND h.side=r.side AND h.line = r.line AND r.line <> floor(r.line)
LEFT JOIN nba_stats.player_game_log g ON g.game_date=r.game_date AND g.nba_player_id = r.player_id::bigint
WHERE r.prop IN ('points','rebounds','assists','threes_made','steals','blocks','turnovers','pts_reb','pts_ast','reb_ast','pra','stocks')
"""


def val(prop, s):
    pts, reb, ast, fg3m, stl, blk, tov = s
    return {'points': pts, 'rebounds': reb, 'assists': ast, 'threes_made': fg3m, 'steals': stl, 'blocks': blk, 'turnovers': tov,
            'pts_reb': pts + reb, 'pts_ast': pts + ast, 'reb_ast': reb + ast, 'pra': pts + reb + ast, 'stocks': stl + blk}[prop]


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    rows = conn.execute(SQL).fetchall()
    cov = defaultdict(lambda: [0, 0]); tie = defaultdict(lambda: [0.0, 0, 0]); cal_int = defaultdict(lambda: [0, 0, 0.0]); cal_half = defaultdict(lambda: [0, 0, 0.0])
    for (d, pid, prop, side, line, is_int, o_f, u_f, o_b, u_b, h_f, pts, reb, ast, fg3m, stl, blk, tov, mins) in rows:
        if mins is None or float(mins) <= 0:
            continue                                         # DNP -> void, not a pricing question
        v = float(val(prop, tuple(float(x or 0) for x in (pts, reb, ast, fg3m, stl, blk, tov))))
        line = float(line)
        if is_int:
            cov[prop][1] += 1
            if o_f is None or u_f is None:
                continue
            cov[prop][0] += 1
            O, U = float(o_f), float(u_f)
            p_tie = max(0.0, 1.0 - O - U)
            tie[prop][0] += p_tie; tie[prop][1] += 1; tie[prop][2] += int(v == line)
            if v == line:
                continue
            p = O / (O + U) if side == 'Over' else U / (O + U)
            won = (v > line) if side == 'Over' else (v < line)
            b = min(int(p * 10), 9)
            c = cal_int[b]; c[0] += int(won); c[1] += 1; c[2] += p
        elif h_f is not None:
            p = float(h_f)
            won = (v > line) if side == 'Over' else (v < line)
            b = min(int(p * 10), 9)
            c = cal_half[b]; c[0] += int(won); c[1] += 1; c[2] += p
    print("WHOLE-NUMBER LINE PRICING - research gate 1", flush=True)
    # DIAGNOSTICS (gate 1 failed): (a) are the ADJACENT RUNGS themselves calibrated on exactly these player-days?
    marg_o = defaultdict(lambda: [0, 0, 0.0]); marg_u = defaultdict(lambda: [0, 0, 0.0])
    by_kind = defaultdict(lambda: [0, 0, 0.0]); by_prop = defaultdict(lambda: [0, 0, 0.0])
    kinds = {}
    for (d, pid, prop, side, line, is_int, o_f, u_f, o_b, u_b, h_f, pts, reb, ast, fg3m, stl, blk, tov, mins) in rows:
        if not is_int or o_f is None or u_f is None or mins is None or float(mins) <= 0:
            continue
        v = float(val(prop, tuple(float(x or 0) for x in (pts, reb, ast, fg3m, stl, blk, tov)))); line = float(line)
        O, U = float(o_f), float(u_f)
        c = marg_o[min(int(O * 10), 9)]; c[0] += int(v >= line + 1); c[1] += 1; c[2] += O
        c = marg_u[min(int(U * 10), 9)]; c[0] += int(v <= line - 1); c[1] += 1; c[2] += U
        if v != line:
            p = O / (O + U) if side == 'Over' else U / (O + U); won = (v > line) if side == 'Over' else (v < line)
            for key, dd in (((side, 'p>=0.6' if p >= 0.6 else 'p<0.6'), by_kind), ((prop, 'p>=0.6' if p >= 0.6 else 'p<0.6'), by_prop)):
                c = dd[key]; c[0] += int(won); c[1] += 1; c[2] += p
    print("\nDIAG (a) MARGINAL calibration of the adjacent rungs on these player-days (predicted -> actual):", flush=True)
    for b in range(10):
        co, cu = marg_o[b], marg_u[b]
        so = f"Over(k+1/2) n {co[1]:>6} pred {100*co[2]/co[1]:5.1f}% act {100*co[0]/co[1]:5.1f}%" if co[1] else "Over n 0"
        su = f"Under(k-1/2) n {cu[1]:>6} pred {100*cu[2]/cu[1]:5.1f}% act {100*cu[0]/cu[1]:5.1f}%" if cu[1] else "Under n 0"
        print(f"   {10*b:>2}-{10*b+10:<3}%  {so:<46} | {su}", flush=True)
    print("\nDIAG (b) conditional calibration by board side and by prop (p>=0.6 = the legs a strategy would want):", flush=True)
    for dd in (by_kind, by_prop):
        for k_ in sorted(dd):
            c = dd[k_]
            print(f"   {str(k_):<34} n {c[1]:>6} pred {100*c[2]/c[1]:5.1f}% act {100*c[0]/c[1]:5.1f}%", flush=True)
    tot = [sum(v[0] for v in cov.values()), sum(v[1] for v in cov.values())]
    print(f"\nCOVERAGE (played legs at whole-number lines with both adjacent rungs): {tot[0]:,} / {tot[1]:,} ({100*tot[0]/max(tot[1],1):.1f}%)", flush=True)
    for p_ in sorted(cov):
        print(f"   {p_:<12} {cov[p_][0]:>6} / {cov[p_][1]:<6}", flush=True)
    print("\nTIE RATE predicted vs actual (whole-number legs):", flush=True)
    for p_ in sorted(tie):
        s, n, a = tie[p_]
        print(f"   {p_:<12} n {n:>6} | predicted {100*s/max(n,1):5.1f}% | actual {100*a/max(n,1):5.1f}%", flush=True)
    print("\nCALIBRATION (predicted win probability bin -> actual win rate; non-tied whole-number legs vs half-point legs):", flush=True)
    for b in range(10):
        ci, ch = cal_int[b], cal_half[b]
        si = f"n {ci[1]:>6} pred {100*ci[2]/ci[1]:5.1f}% act {100*ci[0]/ci[1]:5.1f}%" if ci[1] else "n      0"
        sh = f"n {ch[1]:>7} pred {100*ch[2]/ch[1]:5.1f}% act {100*ch[0]/ch[1]:5.1f}%" if ch[1] else "n       0"
        print(f"   {10*b:>2}-{10*b+10:<3}%  whole-number: {si:<40} | half-point: {sh}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
