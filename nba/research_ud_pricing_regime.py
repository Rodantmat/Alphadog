#!/usr/bin/env python3
"""
RESEARCH - UNDERDOG'S 2026-27 PRICING REGIME ON THE CERTIFIED BACKTEST (2026-10-21 PT; owner 23:07 / 23:20 PT: "compare the first 2 days
to the first 2 days of the past seasons ... how that comparison and learning affects our numbers, strategies, ROI").  READ-ONLY.

MEASURED. History: every Underdog main line paid 1.00x on both sides (nba_score.ud_window_legs, 57,301 / 60,345 sides, 100% at 1.00x).
2026-10-21 board: 14.8% of balanced main sides at 1.00x, mean |m - 1| 0.263 - mains are priced side by side from the exchange
(m = 0.5 x the prediction decimal: Johnson Under 1.65 -> 0.82, Antetokounmpo 2.01 -> 1.00, Sabonis 2.15 -> 1.07). Against DraftKings /
Bovada no-vig on 388 matched sides (10-20 / 10-21): m x 2 x p_nv median 0.928, mean 0.933 -> m_now = round(K / p_nv, 2), K = 0.465.

COUNTERFACTUAL. The same backtest slips and the same real outcomes, three prices per leg:
  hist  - the stored factor (history: mains 1.00 less the 0.5% haircut)
  cur   - nba_score.ud_window_legs_curr.m_cur (the October re-pricing the recert used; 46% of mains at 1.00)
  now   - round(K / nv_side, 2) x the same haircut (today's exchange pricing), nv_side = the books' no-vig for that side at that line
Legs with no no-vig keep their stored factor (reported). Payout = build_ud_slip_engine.grade (floor2, 4-pick Flex 7.2).
Reported: the P5 portfolio and every (size, structure) of the two P5 compositions, both seasons, final 7 days out.
Env: DATABASE_URL, UR_TABLE (default nba_score.ud_slip_engine_slips_dlt_orig2_mf), UR_K (0.465), UR_HC (0.995).
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_ud_slip_engine as E   # noqa: E402

TABLE = os.environ.get("UR_TABLE") or "nba_score.ud_slip_engine_slips_dlt_orig2_mf"
K = float(os.environ.get("UR_K") or "0.465")
HC = float(os.environ.get("UR_HC") or "0.995")
P5 = {("weighted:points_R_U", 4, "standard"): 1, ("weighted:points_R_U", 6, "flex"): 1, ("mains", 2, "standard"): 2}


def main():
    if not TABLE.replace("_", "").replace(".", "").isalnum():
        raise SystemExit("bad UR_TABLE")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    price = {}
    for d, pn, prop, side, line, m_cur, nv in conn.execute(
            "SELECT game_date, pn, prop, side, line::float8, m_cur::float8, nv_side::float8 FROM nba_score.ud_window_legs_curr").fetchall():
        price[(d, pn, prop, side, round(line, 1))] = (m_cur, nv)
    print(f"priced history legs: {len(price):,} | K {K} | haircut {HC} | table {TABLE}", flush=True)
    rows = conn.execute(f"""SELECT season, game_date, composition, size, structure, k, legs_json, stake
                            FROM {TABLE} WHERE coalesce(phase, '') <> 'final7'
                              AND composition IN ('weighted:points_R_U', 'mains') AND k <= 2""").fetchall()
    acc = defaultdict(lambda: defaultdict(float))
    legs_seen = legs_nv = 0
    mstat = defaultdict(list)
    for season, d, comp, size, structure, k, legs, stake in rows:
        stake = float(stake)
        keys = [(season, comp, size, structure, k)]
        if P5.get((comp, size, structure), 0) >= k:
            keys.append((season, "P5", 0, "portfolio", 0))
        for regime in ("hist", "cur", "now"):
            slip = []
            for l in legs:
                f = float(l["factor"])
                pr = price.get((d, l.get("player"), l.get("prop"), l.get("side"), round(float(l["line"]), 1)))
                if regime == "hist":
                    m = f
                elif pr is None or (regime == "now" and not pr[1]) or (regime == "cur" and pr[0] is None):
                    m = f
                elif regime == "cur":
                    m = pr[0] * HC
                else:
                    m = round(K / pr[1], 2) * HC
                if regime == "now":
                    legs_seen += 1
                    legs_nv += int(pr is not None and bool(pr[1]))
                    mstat[(season, str(l.get("side"))[:1])].append(m)
                slip.append({"hit": l["hit"], "factor": m})
            p = E.grade(slip, structure)[1]
            for key in keys:
                acc[key][regime] += p * stake
        for key in keys:
            acc[key]["st"] += stake
            acc[key]["n"] += 1
    print(f"legs re-priced at today's rule: {legs_nv:,} of {legs_seen:,}", flush=True)
    for (season, side), ms in sorted(mstat.items()):
        print(f"  {season} {('Over' if side == 'O' else 'Under')}: mean multiplier today {sum(ms) / len(ms):.3f} over {len(ms):,} leg slots")
    print("\nseason   composition           size structure  k   slips   ROI hist   ROI cur    ROI now")
    for key in sorted(acc, key=lambda x: (x[1] != "P5", x[1], x[2], x[3], x[4], x[0])):
        a = acc[key]
        season, comp, size, structure, k = key
        if comp != "P5" and k != 1:
            continue
        r = {g: 100 * (a[g] / a["st"] - 1) for g in ("hist", "cur", "now")}
        print(f"{season}  {comp:<22} {size:>3} {structure:<10} {k:>2} {int(a['n']):>6}  {r['hist']:>+8.1f}%  {r['cur']:>+8.1f}%  {r['now']:>+8.1f}%")


if __name__ == "__main__":
    main()
