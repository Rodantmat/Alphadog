#!/usr/bin/env python3
"""RESEARCH - PHASE 2 FACTOR SCAN (2026-11-10). READ-ONLY. Does any factor rank/shift hit chance BEYOND final_hp on the live engine's standard-line board?
Legs/grader: research_calib_audit.load (same loader, same box-score grader), standard lines (k == 'R'), 12 calibrated props, seasons 24-25 / 25-26 / 26-27.
Factors (all from nba_stats.player_game_log strictly BEFORE the game date - no leakage): rest days, back-to-back, home/away (matchup 'vs.'/'@'),
 minutes trend (L5 / L20), minutes level (L10), season game number, weekday, line gap (line - L10 mean of the prop's stat, relative), L10 hit rate at the line,
 L10 volatility (sd/mean).
Metric 1: residual (hit - final_hp) by factor bucket, per season and side - only effects with the SAME sign in 24-25 and 25-26 (and visible in 26-27) count.
Metric 2: out-of-sample incremental log-loss: logistic hit ~ logit(fh) [+ Under] vs the same + factor terms (train on the other history season; 26-27 trained on both).
Env: DATABASE_URL.
"""
import datetime as dt
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_calib_audit as CA  # noqa: E402

T0 = time.time()
STAT = {"points": ("pts",), "rebounds": ("reb",), "assists": ("ast",), "threes_made": ("fg3m",), "steals": ("stl",), "blocks": ("blk",),
        "turnovers": ("tov",), "stocks": ("stl", "blk"), "pra": ("pts", "reb", "ast"), "pts_reb": ("pts", "reb"), "pts_ast": ("pts", "ast"),
        "reb_ast": ("reb", "ast")}


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def load_logs(conn):
    g = defaultdict(list)
    for pid, d, mp, home, pts, reb, ast, fg3m, stl, blk, tov, mn in conn.execute(
            """SELECT player_id::text, game_date, matchup, (matchup LIKE '%%vs.%%'), pts::float8, reb::float8, ast::float8, fg3m::float8,
                      stl::float8, blk::float8, tov::float8, "min"::text FROM nba_stats.player_game_log
               WHERE game_date >= DATE '2024-08-01' ORDER BY player_id, game_date"""):
        try:
            m = float(mn) if mn is not None and ":" not in str(mn) else (int(str(mn).split(":")[0]) + int(str(mn).split(":")[1]) / 60 if mn else None)
        except Exception:
            m = None
        g[pid].append((d, bool(home), {"pts": pts, "reb": reb, "ast": ast, "fg3m": fg3m, "stl": stl, "blk": blk, "tov": tov}, m))
    return g


def pid_key(p):
    return p[4:] if p.startswith("nba_") else p


def factors(glog, leg, d):
    rows = glog.get(leg["pid"]) or glog.get("nba_" + leg["pid"]) or glog.get(pid_key(leg["pid"]))
    if not rows:
        return None
    prev = [r for r in rows if r[0] < d]
    if len(prev) < 10:
        return None
    sts = STAT[leg["prop"]]
    val = np.array([sum((r[2][s] or 0.0) for s in sts) for r in prev[-10:]])
    mins = [r[3] for r in prev if r[3] is not None]
    if len(mins) < 10:
        return None
    last = prev[-1][0]
    rest = (d - last).days
    m5, m20, m10 = np.mean(mins[-5:]), np.mean(mins[-20:]), np.mean(mins[-10:])
    sd = float(np.std(val))
    mean = float(np.mean(val))
    return {"rest": min(rest, 5), "b2b": int(rest <= 1), "min_trend": (m5 / m20 - 1) if m20 > 0 else 0.0, "min10": m10,
            "gapnum": len(prev), "dow": d.weekday(), "linegap": (leg["line"] - mean) / max(mean, 1.0),
            "l10hit": float(np.mean(val > leg["line"])) if leg["side"] == "Over" else float(np.mean(val < leg["line"])),
            "vol": sd / max(mean, 1.0)}


def home_of(glog, leg, d):
    return None


def bucketize(name, x):
    cuts = {"rest": [0, 1, 2, 3, 4, 5], "b2b": [0, 1], "min_trend": [-0.5, -0.15, -0.05, 0.05, 0.15, 0.5], "min10": [0, 20, 26, 30, 34, 60],
            "gapnum": [0, 15, 30, 50, 70, 200], "dow": [0, 1, 2, 3, 4, 5, 6], "linegap": [-9, -0.15, -0.05, 0.05, 0.15, 9],
            "l10hit": [-0.01, 0.2, 0.4, 0.6, 0.8, 1.01], "vol": [-1, 0.3, 0.5, 0.7, 1.0, 9]}[name]
    if name in ("rest", "b2b", "dow"):
        return str(int(x))
    for i in range(len(cuts) - 1):
        if cuts[i] <= x < cuts[i + 1]:
            return f"[{cuts[i]},{cuts[i + 1]})"
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    glog = load_logs(conn)
    log(f"game logs: {sum(len(v) for v in glog.values()):,} rows, {len(glog)} players")
    slates = CA.load(conn)
    conn.close()
    recs = []
    for s, d, ls in slates:
        dd = d if isinstance(d, dt.date) else dt.date.fromisoformat(str(d)[:10])
        for l in ls:
            if l["k"] != "R" or l["hit"] is None:
                continue
            f = factors(glog, l, dd)
            if f:
                recs.append((s, l, f))
    log(f"standard legs with factors: {len(recs):,}; " + ", ".join(f"{s} {sum(1 for r in recs if r[0] == s):,}" for s in CA.PERIODS))
    names = ["rest", "b2b", "min_trend", "min10", "gapnum", "dow", "linegap", "l10hit", "vol"]
    print("\n" + "=" * 150 + "\nMETRIC 1 - residual (hit - final_hp, in points) by factor bucket, standard lines; n in brackets. Consistent sign across seasons = candidate")
    for nm in names:
        for sd in ("Over", "Under"):
            print(f"  {nm} / {sd}")
            bks = sorted({bucketize(nm, f[nm]) for _s, l, f in recs if l["side"] == sd} - {None})
            for b in bks:
                parts = []
                for s in CA.PERIODS:
                    m = [l for ss, l, f in recs if ss == s and l["side"] == sd and bucketize(nm, f[nm]) == b]
                    if len(m) >= 150:
                        parts.append(f"{s} {100 * (np.mean([l['hit'] for l in m]) - np.mean([l['fh'] for l in m])):+5.1f} [{len(m)}]")
                    else:
                        parts.append(f"{s}   n/a")
                print(f"    {b:<14} " + " | ".join(parts))
    print("\n" + "=" * 150 + "\nMETRIC 2 - out-of-sample incremental log-loss (base = logit fh + Under; + factor linear term), lower is better; delta x1e4")
    X = lambda rs, ex: np.array([[CA.lg(l["fh"]), 1.0 if l["side"] == "Under" else 0.0] + [f[e] for e in ex] for _s, l, f in rs])   # noqa: E731
    Y = lambda rs: np.array([l["hit"] for _s, l, f in rs], float)   # noqa: E731
    for test in CA.PERIODS:
        tr = [r for r in recs if r[0] != test] if test == "2026-27" else [r for r in recs if r[0] not in (test, "2026-27")]
        te = [r for r in recs if r[0] == test]
        if len(tr) < 1000 or len(te) < 500:
            continue
        base_b = CA.fit(X(tr, []), Y(tr))
        base = CA.ll(1 / (1 + np.exp(-(np.column_stack([np.ones(len(te)), X(te, [])]) @ base_b))), Y(te))
        out = []
        for nm in names:
            mu, sdv = np.mean([f[nm] for _s, _l, f in tr]), np.std([f[nm] for _s, _l, f in tr]) or 1.0
            Z = lambda rs: (X(rs, [nm]) - np.array([0, 0, mu])) / np.array([1, 1, sdv])   # noqa: E731
            Ztr, Zte = Z(tr), Z(te)
            Ztr[:, :2], Zte[:, :2] = X(tr, [])[:, :2], X(te, [])[:, :2]
            b = CA.fit(Ztr, Y(tr))
            p = 1 / (1 + np.exp(-(np.column_stack([np.ones(len(te)), Zte]) @ b)))
            out.append(f"{nm} {1e4 * (CA.ll(p, Y(te)) - base):+.1f}")
        print(f"  test {test} (train n {len(tr):,}, test n {len(te):,}; base {base:.4f}): " + " | ".join(out))
    log("DONE")


if __name__ == "__main__":
    main()
