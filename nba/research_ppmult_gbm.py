#!/usr/bin/env python3
"""
PP GOBLIN / DEMON PRICE FROM THE SPORTSBOOKS - THE MECHANISM, MEASURED AND LEARNED. READ-ONLY. (owner 2026-11-22 01:03 PT: "do many more sweeps, use
all legs ... finally figure out the mechanics of it")

FOUND (2026-11-22, 15k exact rung readings, 03:00-04:00 PT):
 1. SIZE LAW. A slip with one goblin / demon pays, at k picks, snap(g_k(y)) where y is its continuous 6-pick value and g_k is a fixed
    log-quadratic per k (two branches: y >= 37.5 / below). It reproduces every size of 99.1% (high side) / 99.6% (low side) of rungs.
    Grid: 0.1 < 3, 0.25 < 10, 0.5 < 50, 1 < 200, 5 above.
 2. ONE PROBABILITY PER LINE. y = (37.5 / K) / q, K = 2.0728 (a 3.6% margin), q = PrizePicks' own chance of that side; More and Less of the
    same line give q_more + q_less = 1 on 99.4% of 4,705 lines (K sd 0.006 - measurement noise), for every stat, tier, kind and side.
 3. q IS THE SPORTSBOOKS' PRICE OF THAT LINE (correlation with the books' consensus 0.9992). Learned from every book's price of the line at
    the same minutes (gradient boosting, tested on players never seen): this script measures it on everything collected.
Env: DATABASE_URL, PPG_SINCE (2026-11-21), PPG_MAXGAP (minutes between the quote and the books' read, 30).
"""
import json
import os
import re
import subprocess
import sys
import unicodedata

import numpy as np
import pandas as pd
import psycopg

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn"], check=False)
from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402
from sklearn.model_selection import GroupKFold  # noqa: E402

LAW = {"hi": {2: [-2.9367, 1.281669, -0.043245], 3: [-2.064888, 1.118527, -0.020444], 4: [-1.266466, 1.022979, -0.006269], 5: [-0.678407, 1.025417, -0.004404]},
       "lo": {2: [-2.732025, 1.176992, -0.029711], 3: [0.434015, -0.34985, 0.195287], 4: [-0.631412, 0.631904, 0.05341], 5: [0.305111, 0.441502, 0.082239]}}
K_MARGIN = 2.0728
C = 37.5 / K_MARGIN
MK = {"Points": "points", "Rebounds": "rebounds", "Assists": "assists", "3-PT Made": "threes", "Pts+Rebs+Asts": "points_rebounds_assists",
      "Pts+Rebs": "points_rebounds", "Pts+Asts": "points_assists", "Rebs+Asts": "rebounds_assists", "Blocked Shots": "blocks", "Steals": "steals",
      "Turnovers": "turnovers", "Blks+Stls": "blocks_steals"}


def stp(v):
    return np.where(v < 3, 0.1, np.where(v < 10, 0.25, np.where(v < 50, 0.5, np.where(v < 200, 1.0, 5.0))))


def snap(v):
    s = stp(v)
    return np.round(np.round(v / s) * s, 4)


def size_value(cls, k, y):
    if k == 6:
        return y
    a, b, c = LAW[cls][k]
    ly = np.log(y)
    return np.exp(a + b * ly + c * ly * ly)


Y = np.exp(np.linspace(np.log(5), np.log(900), 400000))
GEN = {c: {k: snap(size_value(c, k, Y)) for k in (2, 3, 4, 5, 6)} for c in LAW}


def y_interval(P):
    cls = "hi" if P.get(2, P.get(3, 9) * 0.5) >= 3 else "lo"
    m = np.ones(len(Y), bool)
    for k, v in P.items():
        m &= GEN[cls][k] == round(v, 4)
    if not m.any():
        return None
    i = np.where(m)[0]
    return Y[i[0]], Y[i[-1]]


def nm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    for x in (" jr", " iii", " ii", " sr"):
        s = s.replace(x, "")
    return re.sub(r"[^a-z]", "", s)


def lg(p):
    p = np.clip(p, 1e-5, 1 - 1e-5)
    return np.log(p / (1 - p))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    since = os.environ.get("PPG_SINCE", "2026-11-21")
    maxgap = float(os.environ.get("PPG_MAXGAP") or 30)
    rows = conn.execute("""SELECT run_file, quoted_at, section, n, power, legs FROM nba_market.pp_quote
                           WHERE status = 200 AND section IN ('LAD', 'S6') AND quoted_at >= %s""", (since,)).fetchall()
    rung = {}
    for rf, qa, sec, n, pw, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}"); legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        try:
            P = float(pw[str(n)][str(n)])
        except Exception:
            continue
        a = legs[0]
        if a.get("odds") == "standard":
            continue
        r = rung.setdefault((rf, a["id"], a["side"]), dict(name=a["name"], stat=a["stat"], line=float(a["line"]), side=a["side"], odds=a["odds"], t=qa, P={}))
        r["P"][n] = P; r["t"] = min(r["t"], qa)
    out = []
    bad = 0
    for r in rung.values():
        iv = y_interval(r["P"])
        if not iv or (6 not in r["P"] and len(r["P"]) < 4):
            bad += iv is None
            continue
        y = (iv[0] * iv[1]) ** 0.5
        out.append(dict(name=r["name"], stat=r["stat"], line=r["line"], side=r["side"], t=pd.Timestamp(r["t"]), qo=C / y if r["side"] == "over" else 1 - C / y))
    R = pd.DataFrame(out)
    print(f"PPG|exact rung readings {len(R):,} (size law inconsistent: {bad})", flush=True)
    R["nk"] = R["name"].map(nm); R["base"] = R["stat"].map(MK)
    R = R[R["base"].notna()]
    dates = sorted({(t.tz_convert("America/Los_Angeles")).date() for t in R["t"]})
    k = pd.read_sql("""SELECT snapshot_label lab, snapshot_ts ts, bookmaker book, market_key mk, player, side, line::float8 line, price::float8 price
                       FROM nba_market.board_snapshots WHERE game_date = ANY(%s) AND (snapshot_label LIKE 'align%%' OR snapshot_label = 'window')""",
                    conn, params=(dates,))
    k["ts"] = pd.to_datetime(k["ts"], utc=True)
    k["ip"] = np.where(k["price"] > 0, 100 / (k["price"] + 100), -k["price"] / (-k["price"] + 100))
    k["base"] = k["mk"].str.replace("player_", "").str.replace("_alternate", ""); k["nk"] = k["player"].map(nm)
    k["cap"] = k["lab"] + "|" + k["ts"].dt.floor("min").astype(str)
    caps = k.groupby("cap")["ts"].median().sort_values()
    print(f"PPG|book rows {len(k):,} | captures {len(caps)}", flush=True)
    piv = k.pivot_table(index=["cap", "book", "base", "nk", "line"], columns="side", values="ip", aggfunc="first").reset_index()
    piv["two"] = piv.get("Over").notna() & piv.get("Under").notna()
    cv = caps.values
    idx = np.abs(cv[None, :] - R["t"].values.astype("datetime64[ns]")[:, None]).argmin(axis=1)
    R["cap"] = caps.index[idx]; R["gap"] = np.abs((caps.values[idx] - R["t"].values.astype("datetime64[ns]")) / np.timedelta64(1, "m"))
    R = R[R["gap"] <= maxgap]
    m = R.merge(piv, on=["cap", "nk", "base", "line"])
    m = m[m["Over"].notna()]
    m["zi"] = np.where(m["two"], lg(m["Over"] / (m["Over"] + m["Under"])), lg(m["Over"]))
    m["zq"] = lg(m["qo"])
    m["key"] = m["name"] + "|" + m["stat"] + "|" + m["line"].astype(str) + "|" + m["t"].astype(str) + "|" + m["side"]
    w = m.pivot_table(index="key", columns=["book", "two"], values="zi", aggfunc="first")
    w.columns = [f"{b}_{'2' if t else '1'}" for b, t in w.columns]
    base = m.groupby("key").agg(zq=("zq", "first"), zim=("zi", "median"), zis=("zi", "std"), nb=("book", "size"), line=("line", "first"),
                                stat=("stat", "first"), name=("name", "first"), side=("side", "first"), gap=("gap", "first"))
    X = base.join(w)
    X["stat_c"] = X["stat"].astype("category").cat.codes
    feats = [c for c in X.columns if c not in ("zq", "stat", "name", "side")]
    yv = X["zq"].values
    pred = np.zeros(len(X))
    for tr, te in GroupKFold(5).split(X, yv, X["name"].values):
        g = HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, max_leaf_nodes=31, l2_regularization=1.0).fit(X.iloc[tr][feats], yv[tr])
        pred[te] = g.predict(X.iloc[te][feats])
    sg = lambda z: 1 / (1 + np.exp(-z))  # noqa: E731
    dq = np.abs(sg(pred) - sg(yv))
    print(f"PPG|rungs matched to a books read within {maxgap:g} min: {len(X):,} | PrizePicks' chance from the books (unseen players): "
          f"median |error| {100*np.median(dq):.2f} pts (p90 {100*np.quantile(dq, .9):.2f}) | books' median alone {100*np.median(np.abs(sg(X['zim']) - sg(yv))):.2f}", flush=True)
    for side in ("over", "under"):
        s = (X["side"] == side).values
        qt, qp = sg(yv[s]), sg(pred[s])
        if side == "under":
            qt, qp = 1 - qt, 1 - qp
        yt, yp = C / qt, C / qp
        cls = np.where(yt >= 37.5, "hi", "lo")
        line = []
        for kk in (2, 3, 4, 5, 6):
            Pt = np.array([float(snap(size_value(c, kk, v))) for c, v in zip(cls, yt)]); Pp = np.array([float(snap(size_value(c, kk, v))) for c, v in zip(cls, yp)])
            line.append(f"{kk}-pick exact {100*np.mean(Pt == Pp):.0f}% (1 step {100*np.mean(np.abs(Pt - Pp) <= stp(Pt) + 1e-9):.0f}%)")
        print(f"PPG|  {'More' if side == 'over' else 'Less'} {s.sum():,} rungs: " + " | ".join(line), flush=True)
    print("PPG|DONE", flush=True)


if __name__ == "__main__":
    main()
