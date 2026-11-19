#!/usr/bin/env python3
"""
PROOF RUN: DOES THE MONTH-END PLAYER TIER PUT THE FUTURE INTO THE HISTORICAL BASELINE? (owner 2026-11-19 09:55 PT: be sure before expanding; test, debug,
simulate). READ-ONLY on the database; writes only scratch files on the runner.
The certified harness (nba/backtest/classification_ladder_v12.py), which built nba_score.baseline_history for both past seasons, ranks every player into a rate
tier per calendar month with  pop = grp.groupby("PLAYER_ID")["rate36"].last()  - the player's rate at his LAST game of that month - and gives that tier (and the
tier's mean, weight k / (n + k), k 20-50) to EVERY game of the month, including the games before it. Production (one day at a time) can only see up to today.
This script runs the harness twice on the same season and props:
  STORED   the harness untouched
  HONEST   the tier taken day by day: on date D the population is every player's latest rate up to and including D inside the month (what production sees)
and compares, on the harness's own ladder legs and on the real PrizePicks REGULAR lines of that season (nba_score._mf_study_fs):
  log-loss gain, hit of the top fifth minus bottom fifth, spread, and the leak test (what is left of the number after all past form vs the player's next games).
Env: DATABASE_URL, BT_TEST (2025-26), BT_TRAIN, TL_PROPS (points,rebounds).
"""
import os
import pickle
import subprocess
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TEST = os.environ.get("BT_TEST") or "2025-26"
TRAIN = os.environ.get("BT_TRAIN") or ("2023-24" if TEST == "2024-25" else "2023-24,2024-25")
PROPS = os.environ.get("TL_PROPS") or "points,rebounds"

OLD = '''    for (s, ym, role), grp in d.groupby(["season", "ym", "role_tier"]):
        pop = grp.groupby("PLAYER_ID")["rate36"].last()
        n = len(pop); total_tiers = max(1, min(MAX_TIERS, n // MIN_PER_TIER))
        ranks = pop.rank(pct=True, method="first")
        tier_of = np.minimum(total_tiers, np.floor(ranks * total_tiers) + 1).astype(int)
        tier_mean = pop.groupby(tier_of).mean(); tier_n = pop.groupby(tier_of).size(); pop_mean = pop.mean()
        for pid, tnum in tier_of.items():
            tm, tn = tier_mean[tnum], tier_n[tnum]
            blended = (tn * tm + TIER_BLEND_K * pop_mean) / (tn + TIER_BLEND_K)
            tier_prior[(s, ym, role, pid)] = (int(tnum), int(total_tiers), float(blended))
    d["tier"] = [tier_prior.get((s, y, r, p), (None, None, np.nan))[0] for s, y, r, p in zip(d["season"], d["ym"], d["role_tier"], d["PLAYER_ID"])]
    d["tier_prior"] = [tier_prior.get((s, y, r, p), (None, None, np.nan))[2] for s, y, r, p in zip(d["season"], d["ym"], d["role_tier"], d["PLAYER_ID"])]
'''
NEW = '''    _trow = {}; _prow = {}
    for (s, ym, role), grp in d.groupby(["season", "ym", "role_tier"]):
        _latest = {}
        for _dte, _day in grp.sort_values("GAME_DATE").groupby("GAME_DATE", sort=True):
            for _pid, _r in zip(_day["PLAYER_ID"], _day["rate36"]): _latest[_pid] = _r
            pop = pd.Series(_latest)
            n = len(pop); total_tiers = max(1, min(MAX_TIERS, n // MIN_PER_TIER))
            ranks = pop.rank(pct=True, method="first")
            tier_of = np.minimum(total_tiers, np.floor(ranks * total_tiers) + 1).astype(int)
            tier_mean = pop.groupby(tier_of).mean(); tier_n = pop.groupby(tier_of).size(); pop_mean = pop.mean()
            for _ix, _pid in zip(_day.index, _day["PLAYER_ID"]):
                tnum = tier_of[_pid]; tm, tn = tier_mean[tnum], tier_n[tnum]
                _trow[_ix] = int(tnum); _prow[_ix] = float((tn * tm + TIER_BLEND_K * pop_mean) / (tn + TIER_BLEND_K))
    d["tier"] = [_trow.get(i) for i in d.index]
    d["tier_prior"] = [_prow.get(i, np.nan) for i in d.index]
'''
TAIL = '''
import pickle as _pk
_gd = pg[["GAME_ID", "PLAYER_ID", "GAME_DATE"]].drop_duplicates(["GAME_ID", "PLAYER_ID"])
_out = rel[["prop", "offset", "p_over", "p_raw", "actual", "anchor", "line", "PLAYER_ID", "GAME_ID"]].merge(_gd, on=["GAME_ID", "PLAYER_ID"], how="left")
_out.to_pickle(os.environ["TL_OUT"])
print("TL saved", len(_out), flush=True)
'''
STAT = {"points": 0, "rebounds": 1, "assists": 2, "threes_made": 3, "steals": 4, "blocks": 5, "turnovers": 6}


def lg(x):
    x = np.clip(np.asarray(x, float), 1e-4, 1 - 1e-4)
    return np.log(x / (1 - x))


def nk(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return "".join(c for c in s if c.isalnum())


def fit(X, y):
    w = np.zeros(X.shape[1])
    for _ in range(40):
        p = 1 / (1 + np.exp(-X @ w)); W = p * (1 - p) + 1e-9
        st = np.linalg.solve((X * W[:, None]).T @ X + 1e-3 * np.eye(X.shape[1]), X.T @ (y - p) - 1e-3 * w); w += st
        if np.abs(st).max() < 1e-7:
            break
    p = np.clip(1 / (1 + np.exp(-X @ w)), 1e-6, 1 - 1e-6)
    return w, -(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()


def run(tag, patched):
    src = (HERE / "backtest" / "classification_ladder_v12.py").read_text()
    if patched:
        assert OLD in src, "tier-prior block not found - the harness changed"
        src = src.replace(OLD, NEW)
    src += TAIL
    f = ROOT / f"_tl_{tag}.py"; f.write_text(src); out = ROOT / f"_tl_{tag}.pkl"
    env = dict(os.environ, BT_TEST=TEST, BT_TRAIN=TRAIN, BT_PROPS=PROPS, BT_TAG=f"tl_{tag}", TL_OUT=str(out), BT_INJURY="1")
    r = subprocess.run([sys.executable, str(f)], cwd=str(ROOT), env=env, capture_output=True, text=True)
    print(f"TL|harness {tag}: exit {r.returncode}; last lines: {' / '.join(r.stdout.strip().splitlines()[-2:])[:300]}", flush=True)
    if r.returncode != 0:
        print(r.stderr[-3000:], flush=True); raise SystemExit(1)
    return pd.read_pickle(out)


def skill(label, p, y):
    y = y.astype(float); x = lg(p); one = np.ones(len(y))
    ll0 = -(y * np.log(y.mean()) + (1 - y) * np.log(1 - y.mean())).mean(); w, ll = fit(np.column_stack([one, x]), y)
    q = np.quantile(x, [.2, .8])
    return f"{label}: n {len(y):,} | weight {w[1]:+.2f} | log-loss gain {1e4 * (ll0 - ll):6.1f} | top fifth minus bottom fifth hit {100 * (y[x >= q[1]].mean() - y[x <= q[0]].mean()):+5.1f} pts | spread {x.std():.2f}"


def main():
    A = run("stored", False); B = run("honest", True)
    key = ["prop", "offset", "PLAYER_ID", "GAME_ID"]
    M = A.merge(B[key + ["p_over", "p_raw"]], on=key, suffixes=("_s", "_h"))
    print(f"TL|=== {TEST} {PROPS}: harness ladder legs, stored vs honest tier ({len(M):,} legs; correlation of the two numbers {np.corrcoef(lg(M['p_over_s']), lg(M['p_over_h']))[0, 1]:.3f}) ===")
    for prop in sorted(M["prop"].unique()):
        for offs, lab in (((0,), "at the anchor"), ((-2, -1, 1, 2), "1-2 rungs off"), (tuple(range(-10, -2)) + tuple(range(3, 11)), "3+ rungs off")):
            k = M[(M["prop"] == prop) & M["offset"].isin(offs)]
            if len(k) < 2000:
                continue
            print("TL|" + skill(f"{prop:11s} {lab:14s} STORED", k["p_over_s"].values, k["actual"].values), flush=True)
            print("TL|" + skill(f"{prop:11s} {lab:14s} HONEST", k["p_over_h"].values, k["actual"].values), flush=True)
    # real PrizePicks regular lines of the season
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    names = {}
    for pid, nm in conn.execute("SELECT nba_player_id::text, full_name FROM nba_ref.players").fetchall():
        names.setdefault(nk(nm), pid)
    pp = pd.read_sql("""SELECT game_date, player, prop, line::float8 line, hp::float8 hp, hit::int hit FROM nba_score._mf_study_fs
                        WHERE season = %s AND hp IS NOT NULL AND hit IS NOT NULL AND kind = 'standard' AND lower(left(side, 1)) IN ('o', 'm', 'h')
                          AND prop = ANY(%s)""", conn, params=(TEST, PROPS.split(",")))
    logs = defaultdict(list)
    for pid, d, pts, reb, ast, fg3m, stl, blk, tov in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov
            FROM nba_stats.player_game_log WHERE game_date >= '2023-10-01' AND min > 0 ORDER BY game_date""").fetchall():
        logs[pid].append((d, (pts or 0, reb or 0, ast or 0, fg3m or 0, stl or 0, blk or 0, tov or 0)))
    conn.close()
    pp["PLAYER_ID"] = [names.get(nk(x), "") for x in pp["player"]]; pp["GAME_DATE"] = pd.to_datetime(pp["game_date"]).dt.date
    M["PLAYER_ID"] = M["PLAYER_ID"].astype(str); M["GAME_DATE"] = pd.to_datetime(M["GAME_DATE"]).dt.date
    J = pp.merge(M[["prop", "PLAYER_ID", "GAME_DATE", "line", "p_over_s", "p_over_h"]], on=["prop", "PLAYER_ID", "GAME_DATE", "line"], how="inner")
    print(f"TL|=== real PrizePicks REGULAR lines {TEST} matched to a harness rung: {len(J):,} of {len(pp):,} over legs ===")
    if len(J) > 1500:
        y = J["hit"].values
        print("TL|" + skill("stored final_hp (what the backtests used)", J["hp"].values, y), flush=True)
        print("TL|" + skill("harness baseline, STORED tier            ", J["p_over_s"].values, y), flush=True)
        print("TL|" + skill("harness baseline, HONEST tier            ", J["p_over_h"].values, y), flush=True)
        # leak test on the matched legs
        cache = {}; rows = []
        for pid, pr, ln, d in zip(J["PLAYER_ID"], J["prop"], J["line"], J["GAME_DATE"]):
            g = logs.get(pid); out = [np.nan] * 9
            if g:
                if (pid, pr) not in cache:
                    cache[(pid, pr)] = (np.array([x[0] for x in g]), np.array([x[1][STAT[pr]] for x in g], float))
                ds, vs = cache[(pid, pr)]; n = int(np.searchsorted(ds, d))
                if n >= 5 and n + 6 <= len(ds) and ds[n] == d:
                    sd = max(0.75, vs[max(0, n - 20):n].std())
                    out = [(vs[max(0, n - w):n].mean() - ln) / sd for w in (3, 5, 10, 20, 40)] + [(vs[max(0, n - 20):n] > ln).mean(),
                           (vs[n] - ln) / sd, (vs[n + 1:n + 6].mean() - ln) / sd, (vs[n + 6:n + 21].mean() - ln) / sd if n + 21 <= len(ds) else np.nan]
            rows.append(out)
        Z = np.clip(np.array(rows, float), -4, 4); ok = np.all(np.isfinite(Z), axis=1)
        R_ = np.column_stack([np.ones(ok.sum()), Z[ok, :6]])
        for lab, col in (("stored final_hp", "hp"), ("harness STORED tier", "p_over_s"), ("harness HONEST tier", "p_over_h")):
            x = lg(J[col].values[ok]); bx, *_ = np.linalg.lstsq(R_, x, rcond=None); rx = x - R_ @ bx; parts = []
            for j, nm_ in ((6, "the game itself"), (7, "next 5 games"), (8, "games +6..+20")):
                t = Z[ok, j]; bt, *_ = np.linalg.lstsq(R_, t, rcond=None); parts.append(f"{nm_} {np.corrcoef(rx, t - R_ @ bt)[0, 1]:+.3f}")
            print(f"TL|leak test {lab:20s} ({int(ok.sum()):,} legs) leftover after all past form vs: " + " | ".join(parts), flush=True)
    for tag in ("stored", "honest"):
        for ext in ("py", "pkl"):
            try:
                (ROOT / f"_tl_{tag}.{ext}").unlink()
            except OSError:
                pass
    print("TL|DONE", flush=True)


if __name__ == "__main__":
    main()
