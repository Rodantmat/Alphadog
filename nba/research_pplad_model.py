#!/usr/bin/env python3
"""
LADDER-ALL MODEL - PREDICT EVERY GOBLIN / DEMON LEG'S PAYOUT AT 2..6 PICKS FROM ITS FACTORS. READ-ONLY. (owner 2026-11-20 18:20 PT)
Data: section LAD (each rung alone beside the same regulars, sizes 2-6, same minutes). Factors per rung: kind, side, stat, tier, distance from
the anchor (points, relative, per sqrt(anchor)), anchor level, regular line vs switch point, ladder density (goblin / demon rungs on the
ladder), player form (season / last-10 / last-5 average and spread of that stat, share of games over this exact line, minutes).
Honest test: grouped by PLAYER (5 folds) - a player's ladders are never in training when they are predicted. Prediction snapped to the size's
payout grid (0.1 < 3x, 0.25 < 10x, 0.5 < 50x, 1 above). Reports exact / within one step / median error per size, kind and side, and the
importance of each factor. Then writes the fitted per-leg multipliers for every LAD rung (nba_market.pp_lad_leg) for the ROI work.
Env: DATABASE_URL, PPLAD_SINCE (2026-11-20T00:00), PPLAD_WRITE (1).
"""
import json
import os
import subprocess
import sys

import numpy as np
import pandas as pd
import psycopg

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn"], check=False)
from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402

TABLE = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
COLS = {"Points": ["pts"], "Rebounds": ["reb"], "Assists": ["ast"], "3-PT Made": ["fg3m"], "Pts+Rebs+Asts": ["pts", "reb", "ast"], "Pts+Rebs": ["pts", "reb"],
        "Pts+Asts": ["pts", "ast"], "Rebs+Asts": ["reb", "ast"], "Blocked Shots": ["blk"], "Steals": ["stl"], "Blks+Stls": ["blk", "stl"], "Turnovers": ["tov"],
        "Offensive Rebounds": ["oreb"], "Defensive Rebounds": ["dreb"], "FG Made": ["fgm"], "FG Attempted": ["fga"], "Free Throws Made": ["ftm"],
        "3-PT Attempted": ["fg3a"], "Free Throws Attempted": ["fta"], "Two Pointers Made": ["fgm", "-fg3m"], "Two Pointers Attempted": ["fga", "-fg3a"]}


def step(v):
    return 0.1 if v < 3 else 0.25 if v < 10 else 0.5 if v < 50 else 1.0


def snap(v):
    st = step(v)
    return round(round(v / st) * st, 4)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPLAD_SINCE", "2026-11-20T00:00")
    rows = conn.execute("SELECT quoted_at, n, power, note, legs FROM nba_market.pp_quote WHERE section='LAD' AND status=200 AND quoted_at >= %s", (since,)).fetchall()
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    nm_of = dict(conn.execute("SELECT DISTINCT player, nba_ref.norm_name(player) FROM nba_market.pp_board_row WHERE run_file > 'pp_payout_map_20261120'").fetchall())
    gl = pd.read_sql("SELECT nba_player_id::text player_id, game_date, min::float8 mn, pts, reb, ast, fg3m, stl, blk, tov, oreb, dreb, fgm, fga, ftm, fg3a, fta FROM nba_stats.player_game_log WHERE game_date >= '2025-10-01' ORDER BY game_date", conn)
    recs = []
    for qa, n, pw, note, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}")
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        try:
            top = float(pw[str(n)][str(n)])
        except Exception:
            continue
        parts = (note or "").split("|")
        if len(parts) < 5 or parts[3] not in ("R", "S") or parts[0].startswith("S0"):
            continue
        player, stat = [x.strip() for x in "|".join(parts[4:]).split(" | ")]
        a = legs[0]
        recs.append(dict(qa=str(qa)[:10], n=n, top=top, tier=parts[0], dist=float(parts[1]), anchor=float(parts[2]), rs=parts[3], player=player, stat=stat,
                         line=float(a.get("line")), side=a.get("side"), kind=a.get("odds"), rid=f"{a.get('id')}|{a.get('side')}"))
    d = pd.DataFrame(recs)
    pl = sorted(d["player"].unique())
    nm_of = dict(conn.execute("SELECT DISTINCT ON (player_id::text) player_id::text, nba_ref.norm_name(player) FROM nba_market.pp_board_row WHERE player_id::text = ANY(%s) AND player NOT LIKE '%%+%%' ORDER BY player_id::text, run_file DESC", (pl,)).fetchall())
    print(f"LM|rung quotes {len(d):,} | rungs {d['rid'].nunique():,} | players {d['player'].nunique()}", flush=True)
    # ladder density
    lad = d.drop_duplicates("rid").groupby(["player", "stat"]).agg(n_gob=("kind", lambda s: (s == "goblin").sum()), n_dem=("kind", lambda s: (s == "demon").sum())).reset_index()
    d = d.merge(lad, on=["player", "stat"], how="left")
    d["tier_i"] = d["tier"].str[1:].str.rstrip("u").astype(int)
    d["adist"] = d["dist"].abs(); d["rel"] = d["adist"] / d["anchor"].clip(lower=0.5); d["dsq"] = d["adist"] / np.sqrt(d["anchor"].clip(lower=0.5))
    d["is_dem"] = (d["kind"] == "demon").astype(int); d["is_less"] = (d["side"] == "under").astype(int); d["is_sw"] = (d["rs"] == "S").astype(int)
    d["stat_c"] = d["stat"].astype("category").cat.codes
    # form
    d["player_id"] = d["player"].map(lambda p: ids.get(nm_of.get(p, p)))
    gl["game_date"] = pd.to_datetime(gl["game_date"])
    F = {}
    for (pid, stat), g in d.groupby(["player_id", "stat"]):
        cols = COLS.get(stat)
        if pid is None or cols is None:
            continue
        h = gl[gl["player_id"] == pid]
        if h.empty:
            continue
        v = sum((-h[c[1:]] if c.startswith("-") else h[c]) for c in cols).values.astype(float)
        cur = v[h["game_date"].values >= np.datetime64("2026-10-01")]
        base = cur if len(cur) >= 3 else v[-20:]
        F[(pid, stat)] = (base.mean(), base.std() + 0.3, v[-10:].mean(), v[-5:].mean(), v[-10:].std(), len(cur), h["mn"].values[-10:].mean(), base)
    print(f"LM|debug2: players {pl[:3]} | nm_of {list(nm_of.items())[:3]} | ids {list(ids.items())[:3]} | ids size {len(ids)}", flush=True)
    print(f"LM|debug: rows with player_id {d['player_id'].notna().mean()*100:.0f}% | form keys {len(F)} | gl players {gl['player_id'].nunique()} | sample ids {list(d['player_id'].dropna().unique()[:3])} | sample gl {list(gl['player_id'].unique()[:3])}", flush=True)
    for c in ("avg_s", "sd_s", "avg10", "avg5", "sd10", "gp", "min10"):
        d[c] = np.nan
    d["over_s"] = np.nan
    for i, r in d.iterrows():
        f = F.get((r["player_id"], r["stat"]))
        if f:
            d.loc[i, ["avg_s", "sd_s", "avg10", "avg5", "sd10", "gp", "min10"]] = f[:7]
            d.loc[i, "over_s"] = (f[7] > r["line"]).mean()
    d["z_form"] = (d["line"] - d["avg_s"]) / d["sd_s"]; d["anc_form"] = (d["anchor"] - d["avg_s"]) / d["sd_s"]
    print(f"LM|rungs with player form: {d.drop_duplicates('rid')['avg_s'].notna().mean()*100:.0f}%", flush=True)
    # LADDER SIBLINGS (owner's method: once one rung of a ladder is read, how well are the others known?): for each rung, the 2-pick
    # reading and distance of the nearest OTHER goblin and nearest OTHER demon of the same ladder, same side (never the rung itself)
    two = d[d["n"] == 2][["rid", "player", "stat", "kind", "side", "dsq", "top"]].drop_duplicates("rid")
    sib = {}
    for (pl_, st_, sd_), g in two.groupby(["player", "stat", "side"]):
        recs2 = g.to_dict("records")
        for r in recs2:
            out = {}
            for kd in ("goblin", "demon"):
                o = [x for x in recs2 if x["rid"] != r["rid"] and x["kind"] == kd]
                if o:
                    o.sort(key=lambda x: abs(x["dsq"] - r["dsq"]))
                    out[f"sib_{kd[0]}_p"] = np.log(o[0]["top"] / 3); out[f"sib_{kd[0]}_dsq"] = o[0]["dsq"]
            sib[r["rid"]] = out
    for c in ("sib_g_p", "sib_g_dsq", "sib_d_p", "sib_d_dsq"):
        d[c] = d["rid"].map(lambda k: sib.get(k, {}).get(c, np.nan))
    base_f = ["is_dem", "is_less", "stat_c", "tier_i", "adist", "rel", "dsq", "anchor", "is_sw", "n_gob", "n_dem"]
    form_f = ["avg_s", "sd_s", "avg10", "avg5", "sd10", "gp", "min10", "over_s", "z_form", "anc_form"]
    players = np.array(sorted(d["player"].unique())); rng = np.random.default_rng(3); rng.shuffle(players)
    folds = np.array_split(players, 5)
    for lab, cols in (("ladder factors", base_f), ("ladder factors + player form", base_f + form_f), ("+ one sibling rung of the same ladder already read", base_f + form_f + ["sib_g_p", "sib_g_dsq", "sib_d_p", "sib_d_dsq"])):
        print(f"LM|=== {lab}", flush=True)
        tot = []
        for n in (2, 3, 4, 5, 6):
            x = d[d["n"] == n]
            res = []
            for fp in folds:
                tr = x[~x["player"].isin(fp)]; te = x[x["player"].isin(fp)]
                mdl = HistGradientBoostingRegressor(max_iter=600, learning_rate=0.04, max_leaf_nodes=31, min_samples_leaf=8).fit(tr[cols], np.log(tr["top"]))
                p = np.exp(mdl.predict(te[cols]))
                for pv, (_, r) in zip(p, te.iterrows()):
                    sv = snap(pv)
                    res.append((r["kind"], r["side"], sv == r["top"], abs(sv - r["top"]) <= step(r["top"]) + 1e-9, abs(pv / r["top"] - 1)))
            rr = pd.DataFrame(res, columns=["kind", "side", "ex", "w1", "err"])
            tot.append(rr.assign(n=n))
            print(f"LM|  {n}-pick: exact {100*rr['ex'].mean():.1f}% | within one step {100*rr['w1'].mean():.1f}% | median error {100*rr['err'].median():.2f}% | p90 {100*rr['err'].quantile(.9):.2f}% | " +
                  " | ".join(f"{k}-{'Less' if s == 'under' else 'More'} exact {100*g['ex'].mean():.0f}% w1 {100*g['w1'].mean():.0f}%" for (k, s), g in rr.groupby(["kind", "side"])), flush=True)
        if lab.startswith("+ one"):
            x = d[d["n"] == 2]
            mdl = HistGradientBoostingRegressor(max_iter=600, learning_rate=0.04, max_leaf_nodes=31, min_samples_leaf=8).fit(x[cols], np.log(x["top"]))
            b0 = np.median(np.abs(mdl.predict(x[cols]) - np.log(x["top"])))
            imps = []
            for c in cols:
                xx = x[cols].copy(); xx[c] = rng.permutation(xx[c].values)
                imps.append((np.median(np.abs(mdl.predict(xx) - np.log(x["top"]))) - b0, c))
            print("LM|  importance at 2 picks (error added when scrambled): " + " | ".join(f"{c} +{100*v:.2f}%" for v, c in sorted(imps, reverse=True)), flush=True)
    if os.environ.get("PPLAD_WRITE") == "1":
        w = d.pivot_table(index=["rid", "qa", "player", "stat", "kind", "side", "tier", "line", "anchor", "rs"], columns="n", values="top", aggfunc="first").reset_index()
        w.columns = [str(c) for c in w.columns]
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS nba_market.pp_lad_leg (rid text, quoted_day text, player text, stat text, kind text, side text, tier text, line float8,
                           anchor float8, anchor_type text, p2 float8, p3 float8, p4 float8, p5 float8, p6 float8, m2 float8, m3 float8, m4 float8, m5 float8, m6 float8,
                           be2 float8, be3 float8, be4 float8, be5 float8, be6 float8, built_at timestamptz DEFAULT now(), PRIMARY KEY (rid, quoted_day))""")
            recs = []
            for r in w.itertuples():
                ps = [getattr(r, f"_{k}", None) for k in range(2, 7)]
                ps = [r._asdict().get(str(k)) for k in range(2, 7)]
                ms = [(p / TABLE[k] ** ((k - 1) / k)) if p == p and p is not None else None for p, k in zip(ps, range(2, 7))]
                recs.append((r.rid, r.qa, r.player, r.stat, r.kind, r.side, r.tier, r.line, r.anchor, "regular" if r.rs == "R" else "switch", *ps, *ms,
                             *[(1 / m) if m else None for m in ms]))
            cur.executemany("""INSERT INTO nba_market.pp_lad_leg (rid, quoted_day, player, stat, kind, side, tier, line, anchor, anchor_type, p2, p3, p4, p5, p6, m2, m3, m4, m5, m6, be2, be3, be4, be5, be6)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (rid, quoted_day) DO UPDATE SET p2=EXCLUDED.p2, p3=EXCLUDED.p3,
                               p4=EXCLUDED.p4, p5=EXCLUDED.p5, p6=EXCLUDED.p6, m2=EXCLUDED.m2, m3=EXCLUDED.m3, m4=EXCLUDED.m4, m5=EXCLUDED.m5, m6=EXCLUDED.m6,
                               be2=EXCLUDED.be2, be3=EXCLUDED.be3, be4=EXCLUDED.be4, be5=EXCLUDED.be5, be6=EXCLUDED.be6, built_at=now()""", recs)
        conn.commit()
        print(f"LM|wrote nba_market.pp_lad_leg: {len(recs):,} real-quoted legs with their payout at 2-6 picks, leg multiplier and break-even", flush=True)


if __name__ == "__main__":
    main()
