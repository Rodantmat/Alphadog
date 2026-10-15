#!/usr/bin/env python3
"""
AUDIT: DOES THE HONEST HIT PROBABILITY AGREE WITH THE CERTIFIED SLIP BACKTEST? (2026-10-15; owner: "double check and be sure,
be sure it also reflects the backtest and the slip strategy is sound")

Read-only. For every certified strategy (live_slip_engine.STRATEGIES, its own composition / size / structure / cap) it takes
the backtest slips the live engine calibrates against (slip_engine_slips{suffix}[_nosteals], default suffix '_mf' = the
market-free twin of what live does) and their legs, attaches each leg's probabilities from nba_score.board_true_hp
(model_hp = the board's old number, true_hp = the market-anchored number the UI now shows; history rows are scored with the
OTHER season's fit = out of sample), and reports per strategy and season:
  legs     matched share; mean model_hp / mean true_hp / realized leg hit rate
  slips    realized ROI (the certified grader's own payouts) vs the ROI EXPECTED from each probability, computed with the
           certified grader (build_slip_engine.grade: Power / Flex tables, PrizePicks' quote-derived alternate tiers) over
           every hit/miss combination, legs independent; all-hit rate expected vs realized.
If the honest probability reflects the backtest, its expected ROI should sit near the realized ROI (independence ignores the
measured same-slate thinning, so a few points either way is expected) while the model's expected ROI overshoots.
Env: DATABASE_URL, AU_SUFFIX (default _mf).
"""
import itertools
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as ENG                      # noqa: E402  the certified grader
from live_slip_engine import STRATEGIES              # noqa: E402  the certified strategy definitions

SUFFIX = os.environ.get("AU_SUFFIX", "_mf")


def season_of(d):
    return f"{d.year}-{str(d.year + 1)[2:]}" if d.month >= 7 else f"{d.year - 1}-{str(d.year)[2:]}"


def expected_payout(legs, structure, key):
    """E[payout] per unit stake from per-leg probabilities (independent legs), with the certified grader."""
    ev = 0.0
    for combo in itertools.product((1, 0), repeat=len(legs)):
        pr = 1.0
        slip = []
        for leg, h in zip(legs, combo):
            pr *= leg[key] if h else (1.0 - leg[key])
            slip.append({"hit": h, "factor": leg["factor"]})
        if pr > 0:
            ev += pr * ENG.grade(slip, structure)[1]
    return ev


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    print("loading the player name map and board_true_hp ...", flush=True)
    names = {}
    for d, player, pid in conn.execute("""SELECT DISTINCT game_date, player, player_id FROM nba_score.board_scored
                                          WHERE app = ANY('{prizepicks,underdog,sleeper}'::text[])"""):
        names[(d, player)] = pid
    thp = {}
    for d, pid, prop, line, side, m, t, anc in conn.execute(
            "SELECT game_date, player_id, prop, line::float8, side, model_hp, true_hp, anchor FROM nba_score.board_true_hp"):
        thp[(d, pid, prop, float(line), side)] = (float(m), float(t), anc)
    print(f"  {len(names):,} (date, player) names, {len(thp):,} legs with an honest probability", flush=True)
    cellp = {(c, t, sd): float(p) for c, t, sd, p in conn.execute("SELECT cell, tier, side, p FROM nba_score.edge_monitor_ref")}
    print(f"  {len(cellp)} certified cell rates (nba_score.edge_monitor_ref)", flush=True)

    out = []
    for name, spec in STRATEGIES.items():
        comp, size, structure, cap = spec[0], spec[1], spec[2], spec[3]
        cap = cap or 1                                   # a cap-0 (retired / red) strategy is audited at k = 1
        nosteals = name.startswith(("C_", "D_", "R_", "W_"))
        ts = f"nba_score.slip_engine_slips{SUFFIX}{'_nosteals' if nosteals else ''}"
        tl = f"nba_score.slip_engine_legs{SUFFIX}{'_nosteals' if nosteals else ''}"
        slips = {(r[0], r[1]): {"stake": float(r[2]), "payout": float(r[3]), "hits": r[4], "legs": []}
                 for r in conn.execute(f"""SELECT game_date, k, stake, payout, hits FROM {ts}
                                           WHERE composition = %s AND size = %s AND structure = %s AND k <= %s""",
                                       (comp, size, structure, cap))}
        for d, k, player, prop, side, line, factor, hit, cell, tier in conn.execute(
                f"""SELECT game_date, k, player, prop, side, line::float8, factor, hit, cell, tier FROM {tl}
                    WHERE composition = %s AND size = %s AND structure = %s AND k <= %s""", (comp, size, structure, cap)):
            s = slips.get((d, k))
            if s is None:
                continue
            pid = names.get((d, player))
            pr = thp.get((d, pid, prop, float(line), side)) if pid else None
            s["legs"].append({"hit": hit, "factor": float(factor), "model": pr[0] if pr else None,
                              "honest": pr[1] if pr else None, "anchor": pr[2] if pr else None,
                              "cellp": cellp.get((cell, tier, side))})
        agg = defaultdict(lambda: defaultdict(float))
        for (d, k), s in slips.items():
            a = agg[season_of(d)]
            a["slips"] += 1
            a["stake"] += s["stake"]
            a["payout"] += s["payout"]
            a["allhit"] += 1 if s["hits"] == size else 0
            for leg in s["legs"]:
                a["legs"] += 1
                if leg["honest"] is not None:
                    a["legs_m"] += 1
                    a["model_sum"] += leg["model"]
                    a["honest_sum"] += leg["honest"]
                    if leg["hit"] is not None:
                        a["graded_m"] += 1
                        a["hit_m"] += leg["hit"]
                        a["model_g"] += leg["model"]
                        a["honest_g"] += leg["honest"]
                    if leg["anchor"] == "none":
                        a["no_anchor"] += 1
                if leg["cellp"] is not None and leg["hit"] is not None:
                    a["graded_c"] += 1
                    a["cell_g"] += leg["cellp"]
                    a["hit_c"] += leg["hit"]
            full = len(s["legs"]) == size and all(leg["honest"] is not None for leg in s["legs"])
            if full:
                a["slips_full"] += 1
                a["stake_full"] += s["stake"]
                a["payout_full"] += s["payout"]
                a["ev_model"] += s["stake"] * expected_payout(s["legs"], structure, "model")
                a["ev_honest"] += s["stake"] * expected_payout(s["legs"], structure, "honest")
                if all(leg["cellp"] is not None for leg in s["legs"]):
                    a["stake_cell"] += s["stake"]
                    a["payout_cell"] += s["payout"]
                    a["ev_cell"] += s["stake"] * expected_payout(s["legs"], structure, "cellp")
                pm = ph = 1.0
                for leg in s["legs"]:
                    pm *= leg["model"]; ph *= leg["honest"]
                a["allhit_full"] += 1 if s["hits"] == size else 0
                a["allhit_model"] += pm
                a["allhit_honest"] += ph
        for season in sorted(agg):
            a = agg[season]
            row = {
                "strategy": name, "season": season, "slips": int(a["slips"]),
                "realized_roi": a["payout"] / a["stake"] - 1 if a["stake"] else None,
                "legs_matched": a["legs_m"] / a["legs"] if a["legs"] else None,
                "leg_model": a["model_g"] / a["graded_m"] if a["graded_m"] else None,
                "leg_honest": a["honest_g"] / a["graded_m"] if a["graded_m"] else None,
                "leg_hit": a["hit_m"] / a["graded_m"] if a["graded_m"] else None,
                "no_anchor": a["no_anchor"] / a["legs_m"] if a["legs_m"] else None,
                "slips_full": int(a["slips_full"]),
                "roi_full_realized": a["payout_full"] / a["stake_full"] - 1 if a["stake_full"] else None,
                "roi_exp_model": a["ev_model"] / a["stake_full"] - 1 if a["stake_full"] else None,
                "roi_exp_honest": a["ev_honest"] / a["stake_full"] - 1 if a["stake_full"] else None,
                "allhit_realized": a["allhit_full"] / a["slips_full"] if a["slips_full"] else None,
                "allhit_model": a["allhit_model"] / a["slips_full"] if a["slips_full"] else None,
                "allhit_honest": a["allhit_honest"] / a["slips_full"] if a["slips_full"] else None,
            }
            out.append(row)

    def f(x, pct=True):
        return "   -  " if x is None else (f"{x * 100:+6.1f}%" if pct else f"{x:6.3f}")
    print(f"\nbacktest tables: slip_engine_slips{SUFFIX}[_nosteals]; probabilities: board_true_hp (history = other season's fit)\n", flush=True)
    print(f"{'strategy':<20} {'season':<8} {'slips':>5} {'matched':>8} | {'leg model':>9} {'honest':>7} {'hit':>7} | "
          f"{'ROI real':>8} {'E[model]':>8} {'E[honest]':>9} | {'all-hit real':>12} {'model':>7} {'honest':>7}", flush=True)
    for r in out:
        print(f"{r['strategy']:<20} {r['season']:<8} {r['slips']:>5} {f(r['legs_matched'], False):>8} | "
              f"{f(r['leg_model'], False):>9} {f(r['leg_honest'], False):>7} {f(r['leg_hit'], False):>7} | "
              f"{f(r['roi_full_realized']):>8} {f(r['roi_exp_model']):>8} {f(r['roi_exp_honest']):>9} | "
              f"{f(r['allhit_realized'], False):>12} {f(r['allhit_model'], False):>7} {f(r['allhit_honest'], False):>7}", flush=True)
    print("\nREAD: 'honest' near 'hit' and E[honest] near the realized ROI = the shown probability reflects the backtest;"
          " E[model] far above = the old board number overstated the slips.", flush=True)


if __name__ == "__main__":
    main()
