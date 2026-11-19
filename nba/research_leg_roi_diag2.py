#!/usr/bin/env python3
"""
IS IT THE MODEL OR THE MARKET? (owner 2026-11-19 09:04 PT). READ-ONLY. PrizePicks REGULAR lines, three seasons (history: nba_score._mf_study_fs; this season:
nba_score._lr_app_legs app pp26). For every leg, two NAIVE numbers built only from the player's games BEFORE the slate (nba_stats.player_game_log):
  z10   = (average of the last 10 games - line) / spread of the last 20 games        (form against the line)
  r20   = share of the last 20 games over the line
If the naive numbers predict as well this season as before while our model does not, the market did not get sharper - our model lost something (or its history
was flattered). If the naive numbers also stopped predicting, the lines got sharper. Per season and per month: the weight and log-loss gain (x10,000) of each
predictor alone on OVER legs (the under is the mirror), and of the model on top of the naive pair.
Env: DATABASE_URL.
"""
import os
import unicodedata
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

STAT = {"points": lambda s: s[0], "rebounds": lambda s: s[1], "assists": lambda s: s[2], "threes_made": lambda s: s[3], "steals": lambda s: s[4],
        "blocks": lambda s: s[5], "turnovers": lambda s: s[6], "pra": lambda s: s[0] + s[1] + s[2], "pts_reb": lambda s: s[0] + s[1],
        "pts_ast": lambda s: s[0] + s[2], "reb_ast": lambda s: s[1] + s[2], "stocks": lambda s: s[4] + s[5]}


def nk(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return "".join(c for c in s if c.isalnum())


def lg(x):
    x = np.clip(np.asarray(x, float), 1e-4, 1 - 1e-4)
    return np.log(x / (1 - x))


def fit(X, y):
    w = np.zeros(X.shape[1])
    for _ in range(40):
        p = 1 / (1 + np.exp(-X @ w)); W = p * (1 - p) + 1e-9
        st = np.linalg.solve((X * W[:, None]).T @ X + 1e-3 * np.eye(X.shape[1]), X.T @ (y - p) - 1e-3 * w); w += st
        if np.abs(st).max() < 1e-7:
            break
    p = np.clip(1 / (1 + np.exp(-X @ w)), 1e-6, 1 - 1e-6)
    return w, -(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()


def block(k, label):
    y = k["hit"].values.astype(float); one = np.ones(len(k)); ll0 = -(y * np.log(y.mean()) + (1 - y) * np.log(1 - y.mean())).mean()
    out = [f"{label:24s} over legs {len(k):7,} hit {y.mean():.3f}"]
    for nm, x in (("model", lg(k["p"].values)), ("z10", np.clip(k["z10"].values, -3, 3)), ("r20", lg(np.clip(k["r20"].values, .05, .95)))):
        w, ll = fit(np.column_stack([one, x]), y)
        q = np.quantile(x, [.2, .8]); gap = y[x >= q[1]].mean() - y[x <= q[0]].mean()
        out.append(f"{nm}: weight {w[1]:+.2f} gain {1e4 * (ll0 - ll):5.1f} top-bottom fifth {100 * gap:+5.1f} pts")
    Xn = np.column_stack([one, np.clip(k["z10"].values, -3, 3), lg(np.clip(k["r20"].values, .05, .95))])
    _, lln = fit(Xn, y); w, llb = fit(np.column_stack([Xn, lg(k["p"].values)]), y)
    out.append(f"model on top of naive: weight {w[3]:+.2f} extra gain {1e4 * (lln - llb):5.1f}")
    out.append(f"model spread {lg(k['p'].values).std():.2f}, corr(model, z10) {np.corrcoef(lg(k['p'].values), np.clip(k['z10'].values, -3, 3))[0, 1]:+.2f}")
    print("L2|" + " | ".join(out), flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    names = {}
    for pid, nm in conn.execute("SELECT nba_player_id::text, full_name FROM nba_ref.players").fetchall():
        names.setdefault(nk(nm), pid)
    logs = defaultdict(list)
    for pid, d, pts, reb, ast, fg3m, stl, blk, tov in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov
            FROM nba_stats.player_game_log WHERE game_date >= '2023-10-01' AND min > 0 ORDER BY game_date""").fetchall():
        logs[pid].append((d, (pts or 0, reb or 0, ast or 0, fg3m or 0, stl or 0, blk or 0, tov or 0)))
    a = pd.read_sql("""SELECT season, game_date, player, prop, line::float8 line, hp::float8 p, hit::int hit FROM nba_score._mf_study_fs
                       WHERE hp IS NOT NULL AND hit IS NOT NULL AND kind = 'standard' AND lower(left(side, 1)) IN ('o', 'm', 'h')""", conn)
    a["pid"] = [names.get(nk(x), "") for x in a["player"]]
    b = pd.read_sql("""SELECT season, game_date, player pid, prop, line, p, hit FROM nba_score._lr_app_legs
                       WHERE app = 'pp26' AND lower(left(side, 1)) IN ('o', 'm', 'h')""", conn)
    conn.close()
    df = pd.concat([a[["season", "game_date", "pid", "prop", "line", "p", "hit"]], b], ignore_index=True)
    z10 = np.full(len(df), np.nan); r20 = np.full(len(df), np.nan); gp = np.zeros(len(df))
    cache = {}
    for i, (pid, pr, ln, d) in enumerate(zip(df["pid"], df["prop"], df["line"], df["game_date"])):
        f = STAT.get(pr); g = logs.get(pid)
        if not f or not g:
            continue
        key = (pid, pr)
        if key not in cache:
            cache[key] = (np.array([x[0] for x in g]), np.array([f(x[1]) for x in g], float))
        ds, vs = cache[key]; n = int(np.searchsorted(ds, d))        # games strictly before the slate
        if n < 5:
            continue
        v20 = vs[max(0, n - 20):n]; v10 = vs[max(0, n - 10):n]
        z10[i] = (v10.mean() - ln) / max(0.75, v20.std()); r20[i] = (v20 > ln).mean(); gp[i] = n
    df["z10"] = z10; df["r20"] = r20
    ok = np.isfinite(z10)
    print(f"L2|legs {len(df):,}; with at least 5 earlier games {int(ok.sum()):,}", flush=True)
    df = df[ok].copy(); df["month"] = df["game_date"].astype(str).str[:7]
    print("L2|=== by season ===")
    for s in sorted(df["season"].unique()):
        block(df[df["season"] == s], f"season {s}")
    print("L2|=== first 28 slates of each season ===")
    for s in sorted(df["season"].unique()):
        k = df[df["season"] == s]; days = sorted(k["game_date"].unique())[:28]
        block(k[k["game_date"].isin(days)], f"{s} first 28")
    print("L2|=== by month ===")
    for mo in sorted(df["month"].unique()):
        k = df[df["month"] == mo]
        if len(k) >= 2000:
            block(k, f"month {mo}")
    print("L2|DONE", flush=True)


if __name__ == "__main__":
    main()
