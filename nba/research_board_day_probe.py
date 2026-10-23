#!/usr/bin/env python3
"""
RESEARCH PROBE - THE BOARD DAY BY DAY, GROUNDED ON OUR OWN NUMBERS (2026-10-22 PT; owner 17:08 PT: "comparing day by day, grounded by
our own numbers, baseline, final hp, final score, then compared boards over it and if any gain, put the market data on top of it.
I really believe the day by day differences in the board is where the solution resides"). READ-ONLY, small: the days of BD_DAYS
(default: the first 3 slates of 2024-25 and 2025-26 and the 3 live slates 2026-10-20..22).

Each leg carries our three numbers - baseline_hp, final_hp (the probability of ITS side) and final_score - history from
nba_score.tier_map_legs_sel_wo (one row per rank key, pivoted), live from live_slip_engine's board (research_pp_flex234.live_legs,
same pivot; alternate Less rungs left out, as the engine never sees them). Per day, per line type (standard R / goblin G / demon D):
  BOARD   legs, players, final_hp distribution (mean, share >= 0.55 / 0.58 / 0.62), the enrichment push (final - baseline: mean,
          share moved > 5 points up / down), final_score p50 / p90, Under share of the >= 0.58 legs, prop-family mix of the >= 0.58 legs
  RESULT  (graded days) hit rate overall, of the >= 0.55 / >= 0.58 / >= 0.62 legs, of the day's top 20 by final_score, and the
          day's calibration gap (mean final_hp - hit rate of the >= 0.55 legs: + = our numbers too high that day)
The point: does the board's own-number shape differ day to day, and does that shape tell in advance how well our top legs hit?
Env: DATABASE_URL, BD_DAYS (comma dates), BD_TIERS (R,G,D).
"""
import datetime as dt
import os
import sys

DEFAULT_DAYS = "2024-10-22,2024-10-23,2024-10-24,2025-10-21,2025-10-22,2025-10-23,2026-10-20,2026-10-21,2026-10-22"
os.environ.setdefault("PF_LIVE_DAYS", "2026-10-20")
os.environ.setdefault("PF_BOOT", "50")
import numpy as np   # noqa: E402
import psycopg       # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pp_flex234 as F   # noqa: E402

FAM = {"steals": "DEF", "blocks": "DEF", "stocks": "DEF", "turnovers": "DEF", "points": "SCORE", "pra": "SCORE", "pts_reb": "SCORE",
       "pts_ast": "SCORE", "rebounds": "BOARDS", "reb_ast": "BOARDS", "assists": "AST", "threes_made": "3PM"}
KEYS = {"final_score": "fs", "final_hp": "fh", "baseline_hp": "bh"}


def pivot(rows):
    """rows: dicts with rank_key, player, prop, side, line, tier, score, hit -> one leg per (player, prop, side, line, tier)"""
    legs = {}
    for r in rows:
        k = (r["player"], r["prop"], r["side"], round(float(r["line"]), 1), r["tier"])
        l = legs.setdefault(k, {"player": r["player"], "prop": r["prop"], "side": r["side"], "line": float(r["line"]),
                                "tier": r["tier"], "hit": r["hit"]})
        if r.get("score") is not None:
            l[KEYS[r["rank_key"]]] = float(r["score"])
    return [l for l in legs.values() if all(x in l for x in ("fs", "fh", "bh"))]


def line_type(t):
    return "R" if t == "R" else ("G" if str(t).startswith("G") else ("D" if str(t).startswith("D") else "U"))


def main():
    days = [dt.date.fromisoformat(x) for x in (os.environ.get("BD_DAYS") or DEFAULT_DAYS).split(",") if x]
    tiers = [x for x in (os.environ.get("BD_TIERS") or "R,G,D").split(",") if x]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    live_days = [d for d in days if d >= dt.date(2026, 7, 1)]
    outcomes = {}
    if live_days:
        for d, pl, mk, line, res in conn.execute("""SELECT game_date, player, regexp_replace(market_key, '_alternate$', ''), line::float8, leg_result
                                                    FROM nba_market.board_outcomes WHERE game_date = ANY(%s::date[])""", (live_days,)).fetchall():
            outcomes[(d, F.norm(pl), mk, round(line, 1))] = res
    out = []
    for d in days:
        if d in live_days:
            rk_rows, _ = F.live_legs(conn, d, outcomes)
            rows = [r for r in rk_rows if not str(r["tier"]).startswith("U")]
        else:
            rows = [{"rank_key": rk, "player": pl, "prop": pr, "side": sd, "line": ln, "tier": t, "score": sc, "hit": h}
                    for rk, pl, pr, sd, ln, t, sc, h in conn.execute(
                        """SELECT rank_key, player, prop, side, line, tier, score, hit FROM nba_score.tier_map_legs_sel_wo
                           WHERE game_date = %s""", (d,)).fetchall()]
        legs = pivot(rows)
        for lt in tiers:
            L = [l for l in legs if line_type(l["tier"]) == lt and l["prop"] in FAM]
            if not L:
                continue
            fh = np.array([l["fh"] for l in L]); bh = np.array([l["bh"] for l in L]); fs = np.array([l["fs"] for l in L])
            push = fh - bh
            hi = [l for l in L if l["fh"] >= 0.58]
            g = [l for l in L if l["hit"] is not None]
            rec = {"day": d, "lt": lt, "legs": len(L), "players": len({l["player"] for l in L}), "fh_mean": fh.mean(),
                   "ge55": (fh >= 0.55).mean(), "ge58": (fh >= 0.58).mean(), "ge62": (fh >= 0.62).mean(), "push": push.mean(),
                   "up5": (push > 0.05).mean(), "dn5": (push < -0.05).mean(), "fs50": np.median(fs), "fs90": np.percentile(fs, 90),
                   "hi_under": (sum(1 for l in hi if l["side"] == "Under") / len(hi)) if hi else float("nan"),
                   "hi_mix": {f: sum(1 for l in hi if FAM[l["prop"]] == f) for f in ("SCORE", "BOARDS", "AST", "3PM", "DEF")},
                   "graded": len(g)}
            if g:
                def hr(sel):
                    s = [l["hit"] for l in sel if l["hit"] is not None]
                    return (sum(s) / len(s), len(s)) if s else (float("nan"), 0)
                rec["hit_all"] = hr(g)
                rec["hit55"] = hr([l for l in g if l["fh"] >= 0.55])
                rec["hit58"] = hr([l for l in g if l["fh"] >= 0.58])
                rec["hit62"] = hr([l for l in g if l["fh"] >= 0.62])
                rec["top20"] = hr(sorted(g, key=lambda l: -l["fs"])[:20])
                s55 = [l for l in g if l["fh"] >= 0.55]
                rec["calgap"] = (np.mean([l["fh"] for l in s55]) - np.mean([l["hit"] for l in s55])) if s55 else float("nan")
                rec["hit58_U"] = hr([l for l in g if l["fh"] >= 0.58 and l["side"] == "Under"])
                rec["hit58_O"] = hr([l for l in g if l["fh"] >= 0.58 and l["side"] == "Over"])
            out.append(rec)
        print(f"{d}: {len(legs):,} legs with all three numbers", flush=True)

    for lt in tiers:
        R = [r for r in out if r["lt"] == lt]
        if not R:
            continue
        print(f"\n{'=' * 150}\nLINE TYPE {lt} - BOARD (our numbers)")
        print(f"{'day':<11} {'legs':>5} {'plyrs':>5} {'fh mean':>7} {'>=.55':>6} {'>=.58':>6} {'>=.62':>6} {'push':>6} {'up5':>5} {'dn5':>5} "
              f"{'fs p50':>6} {'fs p90':>6} {'U of>=.58':>9}  mix of >=.58 (SCORE/BOARDS/AST/3PM/DEF)")
        for r in R:
            mix = "/".join(str(r["hi_mix"][f]) for f in ("SCORE", "BOARDS", "AST", "3PM", "DEF"))
            print(f"{r['day']!s:<11} {r['legs']:>5} {r['players']:>5} {r['fh_mean']:>7.3f} {r['ge55']:>6.1%} {r['ge58']:>6.1%} {r['ge62']:>6.1%} "
                  f"{r['push']:>+6.3f} {r['up5']:>5.1%} {r['dn5']:>5.1%} {r['fs50']:>6.1f} {r['fs90']:>6.1f} {r['hi_under']:>9.1%}  {mix}")
        print(f"LINE TYPE {lt} - RESULT (graded days)")
        print(f"{'day':<11} {'graded':>6} {'all':>12} {'fh>=.55':>13} {'fh>=.58':>13} {'fh>=.62':>13} {'top20 fs':>12} {'cal gap':>8} "
              f"{'>=.58 Under':>13} {'>=.58 Over':>13}")
        for r in R:
            if not r.get("graded"):
                print(f"{r['day']!s:<11} {0:>6}  (not graded yet)")
                continue
            f = lambda t: f"{t[0]:.3f} n{t[1]:<5}" if t[1] else "      -     "   # noqa: E731
            print(f"{r['day']!s:<11} {r['graded']:>6} {f(r['hit_all']):>12} {f(r['hit55']):>13} {f(r['hit58']):>13} {f(r['hit62']):>13} "
                  f"{f(r['top20']):>12} {r['calgap']:>+8.3f} {f(r['hit58_U']):>13} {f(r['hit58_O']):>13}")


if __name__ == "__main__":
    main()
