#!/usr/bin/env python3
"""
RESEARCH - DOES THE BOARD'S OWN-NUMBER SHAPE TELL IN ADVANCE HOW OUR TOP LEGS WILL HIT THAT DAY? (2026-10-22 PT; owner 17:08 PT: "comparing
day by day, grounded by our own numbers, baseline, final hp, final score ... the day by day differences in the board is where the
solution resides"). Staged as the owner set it: BD_STAGE=sample (the first 30 slates of each season), season (one season), both.
READ-ONLY. Builds on research_board_day_probe.py (the 9-day probe, run 39876488648).

Per slate and line type (R / G / D), from nba_score.tier_map_legs_sel_wo (our three numbers per leg, pivoted):
  shape (known before tip): legs, players, share final_hp >= .55 / .58 / .62, mean push (final - baseline), share pushed up / down
    > 5 points, final_score p50 / p90, Under share of the >= .58 legs, DEF share of the >= .58 legs, slate number in the season
  outcome: hit rate of the >= .58 legs, calibration gap (mean final_hp - hit of the >= .55 legs), hit of the top 20 by final_score
Printed: per line type the Spearman correlation of every shape feature with every outcome, per season (a signal must have the same
sign in both seasons to count), and outcome by tercile of the strongest features (low / mid / high days).
Env: DATABASE_URL, BD_STAGE (sample | season | both; default sample), BD_SEASON (for season: 2024-25 / 2025-26).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from research_board_day_probe import FAM, line_type, pivot   # noqa: E402

SEASONS = ("2024-25", "2025-26")
SHAPE = ["legs", "players", "ge55", "ge58", "ge62", "push", "up5", "dn5", "fs50", "fs90", "hi_under", "hi_def", "slate_no"]
OUTCOME = ["hit58", "calgap", "top20"]


def rank(x):
    x = np.asarray(x, float)
    o = np.argsort(x, kind="mergesort")
    r = np.empty(len(x)); r[o] = np.arange(len(x))
    return r


def spearman(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    m = ~(np.isnan(a) | np.isnan(b))
    if m.sum() < 8 or np.std(a[m]) == 0 or np.std(b[m]) == 0:
        return float("nan"), int(m.sum())
    return float(np.corrcoef(rank(a[m]), rank(b[m]))[0, 1]), int(m.sum())


def main():
    stage = os.environ.get("BD_STAGE") or "sample"
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = {}
    for s in SEASONS:
        ds = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_score.slip_engine_slips_wo WHERE season = %s
                                            AND phase <> 'final7' ORDER BY 1""", (s,)).fetchall()]
        if stage == "sample":
            ds = ds[:30]
        elif stage == "season" and s != (os.environ.get("BD_SEASON") or "2025-26"):
            ds = []
        days[s] = ds
    print(f"STAGE {stage}: " + ", ".join(f"{s} {len(v)} slates" for s, v in days.items()), flush=True)
    recs = defaultdict(list)          # (season, lt) -> list of per-day dicts
    for s, ds in days.items():
        for i, d in enumerate(ds, 1):
            rows = [{"rank_key": rk, "player": pl, "prop": pr, "side": sd, "line": ln, "tier": t, "score": sc, "hit": h}
                    for rk, pl, pr, sd, ln, t, sc, h in conn.execute(
                        """SELECT rank_key, player, prop, side, line, tier, score, hit FROM nba_score.tier_map_legs_sel_wo
                           WHERE game_date = %s""", (d,)).fetchall()]
            legs = pivot(rows)
            for lt in ("R", "G", "D"):
                L = [l for l in legs if line_type(l["tier"]) == lt and l["prop"] in FAM and l["hit"] is not None]
                if len(L) < 20:
                    continue
                fh = np.array([l["fh"] for l in L]); push = fh - np.array([l["bh"] for l in L]); fs = np.array([l["fs"] for l in L])
                hi = [l for l in L if l["fh"] >= 0.58]
                s55 = [l for l in L if l["fh"] >= 0.55]
                top = sorted(L, key=lambda l: -l["fs"])[:20]
                recs[(s, lt)].append({
                    "day": d, "legs": len(L), "players": len({l["player"] for l in L}), "ge55": (fh >= .55).mean(),
                    "ge58": (fh >= .58).mean(), "ge62": (fh >= .62).mean(), "push": push.mean(), "up5": (push > .05).mean(),
                    "dn5": (push < -.05).mean(), "fs50": float(np.median(fs)), "fs90": float(np.percentile(fs, 90)),
                    "hi_under": (sum(l["side"] == "Under" for l in hi) / len(hi)) if hi else np.nan,
                    "hi_def": (sum(FAM[l["prop"]] == "DEF" for l in hi) / len(hi)) if hi else np.nan, "slate_no": i,
                    "hit58": (np.mean([l["hit"] for l in hi]) if len(hi) >= 5 else np.nan), "n58": len(hi),
                    "calgap": (np.mean([l["fh"] for l in s55]) - np.mean([l["hit"] for l in s55])) if len(s55) >= 5 else np.nan,
                    "top20": float(np.mean([l["hit"] for l in top]))})
        print(f"  {s}: done", flush=True)
    for lt in ("R", "G", "D"):
        print(f"\n{'=' * 140}\nLINE TYPE {lt}")
        for s in SEASONS:
            R = recs.get((s, lt), [])
            if R:
                h = [r["hit58"] for r in R if not np.isnan(r["hit58"])]
                n = sum(r["n58"] for r in R)
                w = sum(r["hit58"] * r["n58"] for r in R if not np.isnan(r["hit58"])) / max(1, sum(r["n58"] for r in R if not np.isnan(r["hit58"])))
                print(f"  {s}: {len(R)} slates, >=.58 legs {n:,}, pooled hit {w:.3f}, day-to-day hit sd {np.std(h):.3f} "
                      f"(range {min(h):.3f}-{max(h):.3f}), mean calibration gap {np.nanmean([r['calgap'] for r in R]):+.3f}")
        print(f"  Spearman (shape -> outcome), {SEASONS[0]} | {SEASONS[1]}; * = same sign both seasons and |rho| >= 0.2 in both")
        print(f"  {'feature':<10} " + " ".join(f"{o:>22}" for o in OUTCOME))
        best = []
        for f in SHAPE:
            cells = []
            for o in OUTCOME:
                vals = [spearman([r[f] for r in recs.get((s, lt), [])], [r[o] for r in recs.get((s, lt), [])]) for s in SEASONS]
                a, b = vals[0][0], vals[1][0]
                star = "*" if not (np.isnan(a) or np.isnan(b)) and a * b > 0 and min(abs(a), abs(b)) >= 0.2 else " "
                cells.append(f"{a:+.2f} | {b:+.2f}{star}")
                if star == "*":
                    best.append((min(abs(a), abs(b)), f, o))
            print(f"  {f:<10} " + " ".join(f"{c:>22}" for c in cells))
        for _, f, o in sorted(best, reverse=True)[:4]:
            print(f"  terciles of {f} -> {o}:")
            for s in SEASONS:
                R = [r for r in recs.get((s, lt), []) if not np.isnan(r[f]) and not np.isnan(r[o])]
                if len(R) < 9:
                    continue
                q = np.quantile([r[f] for r in R], [1 / 3, 2 / 3])
                parts = []
                for lab, sel in (("low", lambda v: v <= q[0]), ("mid", lambda v: q[0] < v <= q[1]), ("high", lambda v: v > q[1])):
                    g = [r for r in R if sel(r[f])]
                    parts.append(f"{lab} ({len(g)} days) {np.mean([r[o] for r in g]):.3f}")
                print(f"    {s}: " + " | ".join(parts))


if __name__ == "__main__":
    main()
