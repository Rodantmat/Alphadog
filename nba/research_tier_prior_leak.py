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
TRAIN = os.environ.get("BT_TRAIN") or {"2024-25": "2023-24", "2025-26": "2023-24,2024-25"}.get(TEST, "2023-24,2024-25,2025-26")
PROPS = os.environ.get("TL_PROPS") or "points,rebounds"

# RESIDUAL LOOK-AHEAD found by the truncation-invariance test (2026-11-19): two league constants were taken over ALL rows, the test season's future included.
LG_OLD = 'LG = {c_: float(tf[c_].mean()) for c_ in FCOLS}'
LG_NEW = 'LG = {c_: float(tf[tf["season"].isin(TRAIN)][c_].mean()) for c_ in FCOLS}'
IMPL_OLD = '_LG_IMPL = float(np.nanmedian(pg["implied_own"])) if pg["implied_own"].notna().any() else 114.0'
IMPL_NEW = '_LG_IMPL = float(np.nanmedian(pg[pg["season"].isin(TRAIN)]["implied_own"])) if pg[pg["season"].isin(TRAIN)]["implied_own"].notna().any() else 114.0'


def honest(src):
    """The full honest recipe: as-of tier + TRAIN-only league constants. Asserts every anchor."""
    for a, b in ((OLD, NEW), (LG_OLD, LG_NEW), (IMPL_OLD, IMPL_NEW)):
        assert src.count(a) == 1, "harness anchor changed: " + a[:60]
        src = src.replace(a, b)
    return src


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
d[["PLAYER_ID", "GAME_ID", "GAME_DATE", "season", "rate36", "shrunk36", "tier_prior", "n_rate", "proj_min", "proj_mean", "anchor", "role_tier"]].to_pickle(os.environ["TL_OUT"] + ".d")
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
    if TEST == "2026-27":                                   # this season: the live board legs with the LIVE final_hp and LIVE baseline_hp
        pp = pd.read_sql("""SELECT game_date, player, prop, line, p hp, base live_base, hit FROM nba_score._lr_app_legs
                            WHERE app = 'pp26' AND lower(left(side, 1)) IN ('o', 'm', 'h') AND prop = ANY(%s)""", conn, params=(PROPS.split(","),))
    else:
        pp = pd.read_sql("""SELECT game_date, player, prop, line::float8 line, hp::float8 hp, NULL::float8 live_base, hit::int hit FROM nba_score._mf_study_fs
                            WHERE season = %s AND hp IS NOT NULL AND hit IS NOT NULL AND kind = 'standard' AND lower(left(side, 1)) IN ('o', 'm', 'h')
                              AND prop = ANY(%s)""", conn, params=(TEST, PROPS.split(",")))
    logs = defaultdict(list)
    for pid, d, pts, reb, ast, fg3m, stl, blk, tov, mn in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov, min
            FROM nba_stats.player_game_log WHERE game_date >= '2023-10-01' AND min > 0 ORDER BY game_date""").fetchall():
        logs[pid].append((d, (pts or 0, reb or 0, ast or 0, fg3m or 0, stl or 0, blk or 0, tov or 0, float(mn or 0))))
    prod = pd.read_sql("""SELECT DISTINCT ON (game_date, player_id, prop) game_date, player_id::text pid, prop, anchor::float8 anchor, proj_min::float8 proj_min,
                                 rate36::float8 rate36, role_tier, recipe FROM nba_score.baseline_history
                          WHERE season = %s AND prop = ANY(%s) AND coalesce(period, 'FULL') = 'FULL' ORDER BY game_date, player_id, prop, loaded_at DESC""",
                       conn, params=(TEST, PROPS.split(",")))
    conn.close()
    pp["PLAYER_ID"] = pp["player"].astype(str) if TEST == "2026-27" else [names.get(nk(x), "") for x in pp["player"]]; pp["GAME_DATE"] = pd.to_datetime(pp["game_date"]).dt.date
    M["PLAYER_ID"] = M["PLAYER_ID"].astype(str); M["GAME_DATE"] = pd.to_datetime(M["GAME_DATE"]).dt.date
    # each run is matched to the real line through ITS OWN rungs (the two runs have different anchors, so the same offset is a different line)
    for _F in (A, B):
        _F["PLAYER_ID"] = _F["PLAYER_ID"].astype(str); _F["GAME_DATE"] = pd.to_datetime(_F["GAME_DATE"]).dt.date
    _k = ["prop", "PLAYER_ID", "GAME_DATE", "line"]
    J = pp.merge(A[_k + ["p_over"]].rename(columns={"p_over": "p_over_s"}), on=_k, how="inner").merge(B[_k + ["p_over"]].rename(columns={"p_over": "p_over_h"}), on=_k, how="inner")
    print(f"TL|=== real PrizePicks REGULAR lines {TEST} matched to a harness rung: {len(J):,} of {len(pp):,} over legs ===")
    if len(J) > 1500:
        y = J["hit"].values
        print("TL|" + skill("stored final_hp (what the backtests used)", J["hp"].values, y), flush=True)
        if J["live_base"].notna().any():
            print("TL|" + skill("LIVE baseline_hp stored by production    ", J["live_base"].values, y), flush=True)
            print(f"TL|correlation (log-odds) on these legs: live baseline vs harness honest {np.corrcoef(lg(J['live_base']), lg(J['p_over_h']))[0, 1]:.3f}; "
                  f"live baseline vs harness stored-style {np.corrcoef(lg(J['live_base']), lg(J['p_over_s']))[0, 1]:.3f}; live final_hp vs harness honest {np.corrcoef(lg(J['hp']), lg(J['p_over_h']))[0, 1]:.3f}", flush=True)
            _d = lg(J["live_base"]) - lg(J["p_over_h"])
            print(f"TL|live baseline minus harness honest (log-odds): mean {_d.mean():+.3f}, spread {_d.std():.3f}; share of legs within 0.10: {100 * (np.abs(_d) < .10).mean():.0f}%", flush=True)
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
    # PARITY: production's stored per-game anchor / projected minutes against the harness (honest tier) for the same player-game
    H0 = M[M["offset"] == 0][["prop", "PLAYER_ID", "GAME_DATE", "anchor"]].rename(columns={"anchor": "anchor_h"})
    prod["GAME_DATE"] = pd.to_datetime(prod["game_date"]).dt.date
    Q = prod.merge(H0, left_on=["prop", "pid", "GAME_DATE"], right_on=["prop", "PLAYER_ID", "GAME_DATE"], how="outer", indicator=True)
    print(f"TL|=== PARITY {TEST}: production baseline_history vs harness (honest tier), per player-game: both {int((Q['_merge'] == 'both').sum()):,}, "
          f"production only {int((Q['_merge'] == 'left_only').sum()):,}, harness only {int((Q['_merge'] == 'right_only').sum()):,} ===")
    B_ = Q[Q["_merge"] == "both"].copy(); act = []; mins = []; m10 = []
    idx = {}
    for pid, pr, d in zip(B_["pid"], B_["prop"], B_["GAME_DATE"]):
        g = logs.get(pid); a = np.nan; mn_ = np.nan; l10 = np.nan
        if g:
            if pid not in idx:
                idx[pid] = np.array([x[0] for x in g])
            n = int(np.searchsorted(idx[pid], d))
            if n < len(g) and g[n][0] == d:
                a = float(g[n][1][STAT[pr]]); mn_ = float(g[n][1][7])
                if n >= 3:
                    l10 = float(np.mean([float(x[1][7]) for x in g[max(0, n - 10):n]]))
        act.append(a); mins.append(mn_); m10.append(l10)
    B_["actual"] = act; B_["min_act"] = mins; B_["min_l10"] = m10; B_ = B_[B_["actual"].notna()]
    B_["month"] = B_["GAME_DATE"].astype(str).str[:7]
    for pr in sorted(B_["prop"].unique()):
        for mo in ["all"] + sorted(B_["month"].unique()):
            k = B_[(B_["prop"] == pr) & ((B_["month"] == mo) | (mo == "all"))]
            if len(k) < 200:
                continue
            dd_ = k["anchor"] - k["anchor_h"]
            print(f"TL|parity {pr:9s} {mo:7s} n {len(k):6,} | anchors equal {100 * (dd_.abs() < 0.01).mean():3.0f}%, within 1.0 {100 * (dd_.abs() <= 1.0).mean():3.0f}%, mean diff (production - harness) {dd_.mean():+.2f}, "
                  f"spread {dd_.std():.2f} | error vs the real result: production anchor {np.abs(k['anchor'] - k['actual']).mean():.2f}, harness anchor {np.abs(k['anchor_h'] - k['actual']).mean():.2f} | "
                  f"minutes: production projected vs played {np.abs(k['proj_min'] - k['min_act']).mean():.2f}, plain last-10 average vs played {np.abs(k['min_l10'] - k['min_act']).mean():.2f}, "
                  f"production projected minus last-10 {(k['proj_min'] - k['min_l10']).mean():+.2f} | recipe {k['recipe'].mode().iat[0] if k['recipe'].notna().any() else None}", flush=True)
    # PARITY 2 (one prop): production's projected minutes and rate against the harness for the same game AND for the player's previous game (stale-data test)
    try:
        D_ = pd.read_pickle(str(ROOT / "_tl_honest.pkl") + ".d"); D_ = D_[D_["season"] == TEST].copy()
        D_["PLAYER_ID"] = D_["PLAYER_ID"].astype(str); D_["GAME_DATE"] = pd.to_datetime(D_["GAME_DATE"]).dt.date
        D_ = D_.sort_values(["PLAYER_ID", "GAME_DATE"]); gD = D_.groupby("PLAYER_ID")
        for c in ("rate36", "proj_min", "anchor"):
            D_[c + "_prev"] = gD[c].shift(1); D_[c + "_prev2"] = gD[c].shift(2)
        lastp = PROPS.split(",")[-1]
        P2 = prod[prod["prop"] == lastp].merge(D_, left_on=["pid", "GAME_DATE"], right_on=["PLAYER_ID", "GAME_DATE"], suffixes=("", "_h"))
        print(f"TL|=== PARITY 2 {TEST} {lastp}: production vs harness components, {len(P2):,} player-games ===")
        for c, tol in (("rate36", 0.05), ("proj_min", 0.15), ("anchor", 0.01)):
            a = P2[c].astype(float); parts = []
            for suf, nm_ in (("_h", "same game"), ("_prev", "his previous game"), ("_prev2", "two games back")):
                b = P2[c + suf].astype(float); ok = a.notna() & b.notna()
                parts.append(f"{nm_}: equal {100 * ((a - b).abs()[ok] < tol).mean():3.0f}%, mean abs diff {(a - b).abs()[ok].mean():.3f}")
            print(f"TL|parity2 {c:9s} production against the harness value for " + " | ".join(parts), flush=True)
        # where do the two differ, and who is right there?
        P2["adiff"] = P2["anchor"].astype(float) - P2["anchor_h"]; P2["dom"] = [d.day for d in P2["GAME_DATE"]]
        for lab, msk in (("day 1-5 of the month", P2["dom"] <= 5), ("day 6-15", (P2["dom"] > 5) & (P2["dom"] <= 15)), ("day 16+", P2["dom"] > 15),
                         ("fewer than 8 games this season", P2["n_rate"] < 8), ("8-15 games", (P2["n_rate"] >= 8) & (P2["n_rate"] < 16)), ("16+ games", P2["n_rate"] >= 16)):
            k = P2[msk]
            if len(k) > 100:
                print(f"TL|parity2 {lab:32s} n {len(k):5,} | anchors equal {100 * (k['adiff'].abs() < .01).mean():3.0f}% | production minus harness {k['adiff'].mean():+.2f} (spread {k['adiff'].std():.2f}) | "
                      f"tier prior (harness) {k['tier_prior'].mean():.2f} | production rate {k['rate36'].astype(float).mean():.2f}", flush=True)
        JJ = J[J["prop"] == lastp].merge(P2[["pid", "GAME_DATE", "adiff"]], left_on=["PLAYER_ID", "GAME_DATE"], right_on=["pid", "GAME_DATE"])
        for lab, msk in (("anchors EQUAL", JJ["adiff"].abs() < .01), ("anchors DIFFER", JJ["adiff"].abs() >= .01), ("production anchor HIGHER", JJ["adiff"] >= .01), ("production anchor LOWER", JJ["adiff"] <= -.01)):
            k = JJ[msk]
            if len(k) > 150 and k["live_base"].notna().any():
                print(f"TL|parity2 real lines, {lab}: " + skill("LIVE baseline", k["live_base"].values, k["hit"].values), flush=True)
                print(f"TL|parity2 real lines, {lab}: " + skill("harness honest", k["p_over_h"].values, k["hit"].values), flush=True)
                print(f"TL|parity2 real lines, {lab}: over hit {k['hit'].mean():.3f}; live baseline says {k['live_base'].mean():.3f}, harness honest says {k['p_over_h'].mean():.3f}, live final_hp says {k['hp'].mean():.3f}", flush=True)
        JE = J[J["prop"] == lastp].merge(P2[["pid", "GAME_DATE", "adiff", "anchor_h", "tier_prior", "rate36_h", "n_rate", "proj_mean"]], left_on=["PLAYER_ID", "GAME_DATE"], right_on=["pid", "GAME_DATE"])
        JE = JE[JE["adiff"].abs() < .01].copy(); JE["off"] = (JE["line"] - JE["anchor_h"]).round().astype(int)
        print(f"TL|=== same anchor, same line ({len(JE):,} legs): the two probabilities by rung ===")
        for off, k in JE.groupby("off"):
            if len(k) < 120:
                continue
            xl = lg(k["live_base"]); xh = lg(k["p_over_h"]); y_ = k["hit"].values.astype(float)
            def tb(x):
                q = np.quantile(x, [.2, .8]); return 100 * (y_[x >= q[1]].mean() - y_[x <= q[0]].mean())
            fr = (k["proj_mean"] - (k["anchor_h"] + 0.5)).values
            print(f"TL|rung {off:+d}: n {len(k):4d} hit {y_.mean():.3f} | live baseline mean {k['live_base'].mean():.3f} spread {xl.std():.3f} top-bottom {tb(np.asarray(xl)):+5.1f} | "
                  f"harness honest mean {k['p_over_h'].mean():.3f} spread {xh.std():.3f} top-bottom {tb(np.asarray(xh)):+5.1f} | corr of the two {np.corrcoef(xl, xh)[0, 1]:+.2f} | "
                  f"harness p vs: projected mean inside the rung {np.corrcoef(xh, fr)[0, 1]:+.2f}, tier prior {np.corrcoef(xh, k['tier_prior'])[0, 1]:+.2f}, games played {np.corrcoef(xh, k['n_rate'])[0, 1]:+.2f}", flush=True)
        _s = JE.sort_values("p_over_h"); _c = ["GAME_DATE", "PLAYER_ID", "line", "anchor_h", "off", "live_base", "p_over_h", "p_over_s", "hp", "hit", "proj_mean", "tier_prior", "n_rate"]
        print("TL|sample rows (lowest / highest harness p at rung 0):"); print(_s[_s["off"] == 0][_c].head(6).to_string()); print(_s[_s["off"] == 0][_c].tail(6).to_string(), flush=True)
        P2["month"] = P2["GAME_DATE"].astype(str).str[:7]
        for mo in sorted(P2["month"].unique()):
            k = P2[P2["month"] == mo]
            print(f"TL|parity2 {mo}: n {len(k):5,} | production minus harness: projected minutes {(k['proj_min'].astype(float) - k['proj_min_h']).mean():+.2f} (spread {(k['proj_min'].astype(float) - k['proj_min_h']).std():.2f}), "
                  f"rate per 36 {(k['rate36'].astype(float) - k['rate36_h']).mean():+.3f} (spread {(k['rate36'].astype(float) - k['rate36_h']).std():.3f}) | role tier equal {100 * (k['role_tier'] == k['role_tier_h']).mean():.0f}%", flush=True)
    except Exception as exc:
        print("TL|parity 2 skipped:", repr(exc)[:300], flush=True)
    for tag in ("stored", "honest"):
        for ext in ("py", "pkl", "pkl.d"):
            try:
                (ROOT / f"_tl_{tag}.{ext}").unlink()
            except OSError:
                pass
    print("TL|DONE", flush=True)


if __name__ == "__main__":
    main()
