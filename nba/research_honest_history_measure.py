#!/usr/bin/env python3
"""
WHAT IS LEFT OF THE MODEL ON HONEST HISTORY? (owner 2026-11-19 11:05 PT, option 1). READ-ONLY.
Every graded board leg is given the HONEST baseline probability at its own line (nba_score.baseline_history_h, built by research_honest_history_build.py) and
compared with the numbers stored today:
  PrizePicks  nba_score._mf_study_fs (2024-25, 2025-26: regular, goblin, demon) + nba_score._lr_app_legs app pp26 (this season, regular)
  Underdog    nba_score._lr_app_legs app underdog (three seasons, tier R / F / B)
For each group (season x leg kind x prop x side): legs, hit, and for STORED final_hp, STORED baseline (where kept) and HONEST baseline:
  weight in a logistic fit, log-loss gain x10,000 over the base rate, hit of the top fifth minus bottom fifth.
On legs whose price varies (goblin / demon, Underdog) the same numbers are also given ON TOP OF THE PRICE (does the model add anything the price does not say).
Then a first honest leg-ROI check per kind: legs ranked by honest p x multiplier, real return of the top 5%.
Env: DATABASE_URL, HM_BASE (0.542).
"""
import os
import unicodedata

import numpy as np
import pandas as pd
import psycopg

BASE = float(os.environ.get("HM_BASE") or 0.542)
GRP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "steals": "low-count", "blocks": "low-count", "turnovers": "low-count"}


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


def one(p, y, be=None):
    ok = np.isfinite(p)
    if ok.sum() < 400:
        return "      (not kept)      "
    p = p[ok]; y = y[ok].astype(float); x = lg(p); o = np.ones(len(y))
    if be is None:
        ll0 = -(y * np.log(y.mean()) + (1 - y) * np.log(1 - y.mean())).mean(); w, ll = fit(np.column_stack([o, x]), y); q = np.quantile(x, [.2, .8])
        gap = y[x >= q[1]].mean() - y[x <= q[0]].mean()
    else:
        b = lg(be[ok]); _, ll0 = fit(np.column_stack([o, b]), y); w, ll = fit(np.column_stack([o, x, b]), y)
        r = x - np.polyval(np.polyfit(b, x, 1), b); q = np.quantile(r, [.2, .8]); gap = y[r >= q[1]].mean() - y[r <= q[0]].mean()
    return f"w {w[1]:+.2f} gain {1e4 * (ll0 - ll):6.1f} gap {100 * gap:+5.1f}"


def attach(df, H):
    """honest probability of the leg's side at its own line"""
    key = list(zip(df["gd"].astype(str), df["pid"].astype(str), df["prop"]))
    out = np.full(len(df), np.nan)
    for i, (k, ln, ov) in enumerate(zip(key, df["line"].values, df["over"].values)):
        h = H.get(k)
        if h is None:
            continue
        j = np.searchsorted(h[0], ln - 1e-6)
        if j < len(h[0]) and abs(h[0][j] - ln) < 1e-3:
            out[i] = h[1][j] if ov else 1 - h[1][j]
    return out


def report(title, df, price):
    print(f"\nHM|=== {title} ===", flush=True)
    print("HM|group                                   legs    matched  hit   | STORED final_hp               | STORED baseline               | HONEST baseline" +
          ("               | on top of the PRICE: stored final | honest baseline" if price else ""))
    groups = [("all", np.ones(len(df), bool))]
    for kd in sorted(df["kind"].unique()):
        groups.append((f"kind {kd}", (df["kind"] == kd).values))
        for sd, nm in ((1.0, "over"), (0.0, "under")):
            m_ = ((df["kind"] == kd) & (df["over"] == sd)).values
            if m_.sum() > 800:
                groups.append((f"kind {kd} {nm}", m_))
        for g_ in sorted(df["grp"].unique()):
            m_ = ((df["kind"] == kd) & (df["grp"] == g_)).values
            if m_.sum() > 800:
                groups.append((f"kind {kd} {g_}", m_))
    for s in sorted(df["season"].unique()):
        ms = (df["season"] == s).values
        for nm, m0 in groups:
            m_ = ms & m0; mk = m_ & np.isfinite(df["ph"].values)
            if mk.sum() < 800:
                continue
            k = df[mk]; y = k["hit"].values
            line = f"HM|{s} {nm:30s} {int(m_.sum()):8,} {int(mk.sum()):8,} {y.mean():.3f} | {one(k['p'].values, y)} | {one(k['pb'].values, y)} | {one(k['ph'].values, y)}"
            if price and k["m"].std() > 0.02:
                line += f" | {one(k['p'].values, y, 1 / k['m'].values)} | {one(k['ph'].values, y, 1 / k['m'].values)}"
            print(line, flush=True)
    # first honest leg-ROI look: top 5% of legs by p x m, real return, per season and kind
    print(f"HM|--- {title}: legs ranked by probability x multiplier, real return of the top 5% (all legs' return in brackets) ---")
    for s in sorted(df["season"].unique()):
        for kd in ["all"] + sorted(df["kind"].unique()):
            m_ = ((df["season"] == s) & ((df["kind"] == kd) | (kd == "all")) & np.isfinite(df["ph"])).values
            if m_.sum() < 3000:
                continue
            k = df[m_]; ret = k["hit"].values * k["m"].values - 1; parts = []
            for nm, col in (("stored final_hp", "p"), ("honest baseline", "ph")):
                ev = k[col].values * k["m"].values; t = ev >= np.quantile(ev, .95)
                parts.append(f"{nm}: predicted {100 * (ev[t].mean() - 1):+6.1f}% real {100 * ret[t].mean():+6.1f}%")
            print(f"HM|{s} {kd:10s} n {len(k):8,} [{100 * ret.mean():+5.1f}%] " + " | ".join(parts), flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    H = {}
    for gd, pid, prop, lines, pm in conn.execute("SELECT game_date::text, player_id, prop, lines, p_more FROM nba_score.baseline_history_h").fetchall():
        H[(gd, pid, prop)] = (np.asarray(lines, float), np.asarray(pm, float))
    print(f"HM|honest ladders loaded: {len(H):,} player-game-props", flush=True)
    names = {}
    for pid, nm in conn.execute("SELECT nba_player_id::text, full_name FROM nba_ref.players").fetchall():
        names.setdefault(nk(nm), pid)
    a = pd.read_sql("""SELECT f.season, f.game_date gd, f.player, f.prop, f.side, f.line::float8 line, f.kind, f.factor::float8 factor, f.hit::int hit, f.hp::float8 p,
                              b.score::float8 pb
                       FROM nba_score._mf_study_fs f LEFT JOIN nba_score.tier_map_legs_sel b ON b.rank_key = 'baseline_hp' AND b.season = f.season
                            AND b.game_date = f.game_date AND b.player = f.player AND b.prop = f.prop AND b.side = f.side AND b.line = f.line
                       WHERE f.hp IS NOT NULL AND f.hit IS NOT NULL AND f.factor > 0 AND f.kind IN ('standard', 'goblin', 'demon') AND f.prop = ANY(%s)""",
                    conn, params=(list(GRP),))
    a["pid"] = [names.get(nk(x), "") for x in a["player"]]; a["m"] = a["factor"] / BASE
    b = pd.read_sql("""SELECT season, game_date gd, player pid, prop, side, line, 'standard' kind, hit, p, base pb FROM nba_score._lr_app_legs
                       WHERE app = 'pp26' AND prop = ANY(%s)""", conn, params=(list(GRP),))
    b["m"] = 1.0 / BASE
    pp = pd.concat([a[["season", "gd", "pid", "prop", "side", "line", "kind", "hit", "p", "pb", "m"]], b[["season", "gd", "pid", "prop", "side", "line", "kind", "hit", "p", "pb", "m"]]], ignore_index=True)
    ud = pd.read_sql("""SELECT season, game_date gd, player pid, prop, side, line, left(tier, 1) kind, hit, p, base pb, m * 1.8708 m FROM nba_score._lr_app_legs
                        WHERE app = 'underdog' AND prop = ANY(%s)""", conn, params=(list(GRP),))
    conn.close()
    for df in (pp, ud):
        df["line"] = pd.to_numeric(df["line"], errors="coerce").astype(float)
        df["over"] = df["side"].str.lower().str[0].isin(["o", "m", "h"]).astype(float); df["grp"] = df["prop"].map(GRP)
        df["ph"] = attach(df, H)
        for c in ("p", "pb", "m", "line"):
            df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    pp = pp[pp["m"] < 8.3]; ud = ud[(ud["m"] > 1.0) & (ud["m"] < 8.3)]
    report("PRIZEPICKS (single-stat props)", pp, True)
    report("UNDERDOG (single-stat props)", ud, True)
    print("HM|DONE", flush=True)


if __name__ == "__main__":
    main()
