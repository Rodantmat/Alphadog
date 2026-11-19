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

RNG = np.random.default_rng(7)

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
    ok = np.isfinite(k["dmin"].values) & np.isfinite(k["zfut"].values)
    if ok.sum() > 1500:
        kk = k[ok]; yy = kk["hit"].values.astype(float); o1 = np.ones(len(kk)); lm = lg(kk["p"].values); zp = np.clip(kk["z10"].values, -3, 3)
        dm = np.clip(kk["dmin"].values, -15, 15) / 5.0; zf = np.clip(kk["zfut"].values, -3, 3)
        A = np.column_stack([o1, zp, lg(np.clip(kk["r20"].values, .05, .95))]); beta, *_ = np.linalg.lstsq(A, lm, rcond=None); res = lm - A @ beta
        R_ = np.column_stack([o1, zp, lg(np.clip(kk["r20"].values, .05, .95))] + [kk[f"pc{j}"].values for j in range(7)])
        bm, *_ = np.linalg.lstsq(R_, lm, rcond=None); bf, *_ = np.linalg.lstsq(R_, zf, rcond=None); rm = lm - R_ @ bm; rf = zf - R_ @ bf
        wr, _ = fit(np.column_stack([R_, lm]), yy)
        print(f"L2|   leak check 2 {label:14s} after removing EVERYTHING past (form over 3/5/10/20/40 games, season to date, last season, minutes trend): what is left of the model "
              f"still tracks his NEXT 20 games by {np.corrcoef(rm, rf)[0, 1]:+.3f} (an honest model: about 0); past explains {100 * (1 - rm.var() / lm.var()):.0f}% of the model; "
              f"model weight on top of all past numbers {wr[-1]:+.2f}", flush=True)
        if label.startswith("season"):
            cands = [("OUR MODEL", lm)] + [(nm_, kk[f"ctl{j}"].values) for j, nm_ in enumerate(("control honest (recency-weighted past)", "control honest (other mix + noise)",
                                                                                               "control LEAKY (25% whole-season mean)", "control LEAKY (window includes the game)"))]
            for nm_, x in cands:
                g = np.isfinite(x) & np.all(np.isfinite(kk[[f"lag{j}" for j in range(4)]].values), axis=1)
                if g.sum() < 1500:
                    continue
                Rg = R_[g]; bx, *_ = np.linalg.lstsq(Rg, x[g], rcond=None); rx = x[g] - Rg @ bx; parts = []
                for j, ln_ in enumerate(("the game itself", "next game", "games +2..+5", "games +6..+20")):
                    t = kk[f"lag{j}"].values[g]; bt, *_ = np.linalg.lstsq(Rg, t, rcond=None); parts.append(f"{ln_} {np.corrcoef(rx, t - Rg @ bt)[0, 1]:+.3f}")
                print(f"L2|   lag profile {label:16s} {nm_:42s} leftover after all past numbers vs: " + " | ".join(parts), flush=True)
        w1, _ = fit(np.column_stack([o1, lm]), yy); w2, _ = fit(np.column_stack([o1, lm, dm]), yy); w3, _ = fit(np.column_stack([o1, lm, dm, zf]), yy)
        print(f"L2|   leak check {label:16s} corr(model, minutes played above his usual THAT game) {np.corrcoef(lm, dm)[0, 1]:+.3f}; the part of the model not explained by "
              f"past form: corr with that-game minutes {np.corrcoef(res, dm)[0, 1]:+.3f}, with his NEXT 20 games {np.corrcoef(res, zf)[0, 1]:+.3f}, with past form {np.corrcoef(res, zp)[0, 1]:+.3f} | "
              f"model weight alone {w1[1]:+.2f}, after knowing that-game minutes {w2[1]:+.2f}, and next-20-games form {w3[1]:+.2f}", flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    names = {}
    for pid, nm in conn.execute("SELECT nba_player_id::text, full_name FROM nba_ref.players").fetchall():
        names.setdefault(nk(nm), pid)
    logs = defaultdict(list)
    for pid, d, pts, reb, ast, fg3m, stl, blk, tov, mn in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov, min
            FROM nba_stats.player_game_log WHERE game_date >= '2023-10-01' AND min > 0 ORDER BY game_date""").fetchall():
        logs[pid].append((d, (pts or 0, reb or 0, ast or 0, fg3m or 0, stl or 0, blk or 0, tov or 0, float(mn or 0))))
    a = pd.read_sql("""SELECT season, game_date, player, prop, line::float8 line, hp::float8 p, hit::int hit FROM nba_score._mf_study_fs
                       WHERE hp IS NOT NULL AND hit IS NOT NULL AND kind = 'standard' AND lower(left(side, 1)) IN ('o', 'm', 'h')""", conn)
    a["pid"] = [names.get(nk(x), "") for x in a["player"]]
    b = pd.read_sql("""SELECT season, game_date, player pid, prop, line, p, hit FROM nba_score._lr_app_legs
                       WHERE app = 'pp26' AND lower(left(side, 1)) IN ('o', 'm', 'h')""", conn)
    conn.close()
    df = pd.concat([a[["season", "game_date", "pid", "prop", "line", "p", "hit"]], b], ignore_index=True)
    z10 = np.full(len(df), np.nan); r20 = np.full(len(df), np.nan); gp = np.zeros(len(df)); dmin = np.full(len(df), np.nan); zfut = np.full(len(df), np.nan); PAST = np.full((len(df), 7), np.nan); LAG = np.full((len(df), 4), np.nan); CTL = np.full((len(df), 4), np.nan)
    cache = {}
    for i, (pid, pr, ln, d) in enumerate(zip(df["pid"], df["prop"], df["line"], df["game_date"])):
        f = STAT.get(pr); g = logs.get(pid)
        if not f or not g:
            continue
        key = (pid, pr)
        if key not in cache:
            cache[key] = (np.array([x[0] for x in g]), np.array([f(x[1]) for x in g], float), np.array([x[1][7] for x in g], float))
        ds, vs, ms = cache[key]; n = int(np.searchsorted(ds, d))        # games strictly before the slate
        if n < 5:
            continue
        v20 = vs[max(0, n - 20):n]; v10 = vs[max(0, n - 10):n]
        z10[i] = (v10.mean() - ln) / max(0.75, v20.std()); r20[i] = (v20 > ln).mean(); gp[i] = n
        sd = max(0.75, v20.std()); cut = d.replace(month=8, day=1) if d.month >= 8 else d.replace(year=d.year - 1, month=8, day=1)
        s0 = int(np.searchsorted(ds, cut)); sea = vs[s0:n]; prev = vs[max(0, s0 - 82):s0]
        PAST[i] = [(vs[max(0, n - 3):n].mean() - ln) / sd, (vs[max(0, n - 5):n].mean() - ln) / sd, (v20.mean() - ln) / sd, (vs[max(0, n - 40):n].mean() - ln) / sd,
                   ((sea.mean() if len(sea) else v20.mean()) - ln) / sd, ((prev.mean() if len(prev) >= 10 else v20.mean()) - ln) / sd,
                   (ms[max(0, n - 3):n].mean() - ms[max(0, n - 20):n].mean()) / 5.0]
        ew = 0.5 ** (np.arange(n - 1, -1, -1) / 8.0); ewm = (vs[:n] * ew).sum() / ew.sum()
        e1 = cut.replace(year=cut.year + 1); s1 = int(np.searchsorted(ds, e1)); full = vs[s0:s1]
        CTL[i, 0] = (ewm - ln) / sd                                                    # honest: recency-weighted past only
        CTL[i, 1] = (0.6 * ewm + 0.4 * (prev.mean() if len(prev) >= 10 else ewm) - ln) / sd + RNG.normal(0, .35)   # honest, other mix + noise
        CTL[i, 2] = (0.75 * v20.mean() + 0.25 * (full.mean() if len(full) else v20.mean()) - ln) / sd                # LEAKY: a quarter whole-season mean
        if n < len(ds) and ds[n] == d:                          # the game of the slate itself and the games after it
            CTL[i, 3] = (vs[max(0, n - 9):n + 1].mean() - ln) / sd                    # LEAKY: last 10 INCLUDING the game itself
            LAG[i, 0] = (vs[n] - ln) / sd
            if n + 1 < len(ds):
                LAG[i, 1] = (vs[n + 1] - ln) / sd
            if n + 5 < len(ds):
                LAG[i, 2] = (vs[n + 2:n + 6].mean() - ln) / sd
            if n + 20 < len(ds):
                LAG[i, 3] = (vs[n + 6:n + 21].mean() - ln) / sd
            dmin[i] = ms[n] - ms[max(0, n - 10):n].mean()
            fut = vs[n + 1:n + 21]
            if len(fut) >= 5:
                zfut[i] = (fut.mean() - ln) / max(0.75, v20.std())
    df["z10"] = z10; df["r20"] = r20; df["dmin"] = dmin; df["zfut"] = zfut
    for j in range(7):
        df[f"pc{j}"] = np.clip(PAST[:, j], -4, 4)
    for j in range(4):
        df[f"lag{j}"] = np.clip(LAG[:, j], -4, 4); df[f"ctl{j}"] = np.clip(CTL[:, j], -4, 4)
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
