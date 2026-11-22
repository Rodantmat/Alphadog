#!/usr/bin/env python3
"""
EVERY LEG'S OWN HIT RATE AND ROI - THE MODEL POOLED WITH THE BOOKS' PRICE OF THE SAME LINE, ONE RULE ON EVERY DATE.
(owner 2026-11-21 17:48 / 18:04 PT: "each one has its own hit rate ... ROI per leg ... very well calibrated ... improving what we have, aligned with
the documentation")
Builds on the board's documented leg ROI (nba/main_ui/roi.js: the real hit rate = the model corrected by the market's price, because "ranking legs
by the calibrated model alone still over-stated the top legs"); its blend weights for most apps were assumptions - here every weight is FITTED on
legs graded BEFORE the date it is used on (research_market_layer.py measured the gain: out-of-sample log-loss pooled < market < final_hp in 2024-25
and 2025-26; ROI predicted = realized by band).
Per leg of nba_score.leg_card_v2:
  p_market   the sportsbooks' read of the SAME player / stat / line in the decision window ('window' snapshot): each book's fair P(over) at each
             of its lines (two-sided price -> power de-vig; one-sided alternate -> implied / that book's median overround of the season; a book with no two-sided line that season gives no one-sided reads), read at
             the leg's line inside the book's own ladder (exact, or straight in log-odds between its two neighbouring lines - never beyond its
             outermost line), median over books. market_src = exact (a book prices this exact line two-sided) | ladder | none.
  hit_rate   logit h = a + b x logit(final_hp) [+ c x logit(p_market) when the books read the line] [+ d x ln(price) when the leg has a real,
             varying price - the app's own price carries its read of the leg; roi.js used it with assumed weights], fitted per app x kind x cell
             (market / no market, priced / unpriced) on every leg graded BEFORE the week of the date (earlier seasons included); a cell with
             < 5,000 such legs takes the app's cell, else hit rate = final_hp. No market read and no varying price -> hit rate = final_hp.
  roi        hit_rate x m - 1 (m = the leg's real price per leg, research_leg_card.py); roi_model keeps final_hp x m - 1.
LH_WRITE=1 writes p_market, market_src, hit_rate, roi, roi_model and the weight set used (nba_score.leg_hitrate_weights_v2). Then prints the check:
log-loss, calibration and ROI predicted vs realized per season x app on the out-of-sample legs.
Env: DATABASE_URL, LH_WRITE.
"""
import datetime as dt
import io
import os

import numpy as np
import pandas as pd
import psycopg
from scipy.optimize import brentq

BOOKS = ("fanduel", "draftkings", "betmgm", "williamhill_us", "bovada", "betrivers", "fanatics", "betonlineag", "pinnacle", "novig", "prophetx", "espnbet")
RK = ("CASE {x} WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' "
      "WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' WHEN 'blocks_steals' THEN 'stocks' ELSE {x} END")
MIN_N = 5000
KEY = ["game_date", "nb", "prop"]


def lg(p):
    p = np.clip(np.asarray(p, float), 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sg(z):
    return 1 / (1 + np.exp(-z))


def dec(a):
    a = np.asarray(a, float)
    return np.where(a >= 100, 1 + a / 100, np.where(a <= -100, 1 + 100 / np.abs(a), np.nan))


def power_devig(io_, iu):
    out = np.empty(len(io_))
    for i, (a, b) in enumerate(zip(io_, iu)):
        if not (0 < a < 1 and 0 < b < 1) or a + b <= 1:
            out[i] = a / (a + b) if a + b > 0 else np.nan
            continue
        try:
            k = brentq(lambda k: a ** k + b ** k - 1, 1.0, 10.0)
            out[i] = a ** k
        except ValueError:
            out[i] = a / (a + b)
    return out


def market(conn, a, b):
    """fair P(over) per (date, player, prop, line) from the books' window ladders; returns (frame of book points, exact keys)"""
    bk = pd.read_sql(f"""SELECT s.game_date, s.bookmaker, nba_ref.norm_name(s.player) nb,
                               {RK.format(x="replace(replace(s.market_key,'player_',''),'_alternate','')")} prop, s.line::float8 line, s.side, s.price::float8 price
                        FROM nba_market.board_snapshots s
                        WHERE s.bookmaker = ANY(%s) AND s.snapshot_label = 'window' AND s.game_date BETWEEN %s AND %s AND s.price IS NOT NULL
                          AND s.side IN ('Over','Under')""", conn, params=(list(BOOKS), a, b))
    bk = bk.drop_duplicates(["game_date", "bookmaker", "nb", "prop", "line", "side"])
    w = bk.pivot_table(index=["game_date", "bookmaker", "nb", "prop", "line"], columns="side", values="price", aggfunc="first").reset_index()
    for c in ("Over", "Under"):
        if c not in w:
            w[c] = np.nan
    io_, iu = 1 / dec(w["Over"]), 1 / dec(w["Under"])
    two = ~np.isnan(io_) & ~np.isnan(iu)
    ovr = pd.Series(io_[two] + iu[two]).groupby(w.loc[two, "bookmaker"].values).median()     # each book's overround on its two-sided lines
    w["two"] = two
    w["po"] = np.nan
    w.loc[two, "po"] = power_devig(io_[two], iu[two])
    one = ~two & ~np.isnan(io_)
    w.loc[one, "po"] = io_[one] / w.loc[one, "bookmaker"].map(ovr).values
    onu = ~two & np.isnan(io_) & ~np.isnan(iu)
    w.loc[onu, "po"] = 1 - iu[onu] / w.loc[onu, "bookmaker"].map(ovr).values
    w = w[w["po"].between(0.005, 0.995)]
    return w[["game_date", "bookmaker", "nb", "prop", "line", "po", "two"]]


def read_at(legs, w):
    """each book's fair P(over) at each leg's line: exact line, or log-odds interpolation between its two neighbours; median over books"""
    keys = legs[KEY + ["line"]].drop_duplicates().reset_index(drop=True)
    keys["kid"] = np.arange(len(keys))
    out = []
    for bkname, g in w.groupby("bookmaker"):
        g = g.sort_values("line")
        k = keys.merge(g[KEY].drop_duplicates(), on=KEY)       # only keys this book prices at all
        if k.empty:
            continue
        k = k.sort_values("line")
        lo = pd.merge_asof(k, g.rename(columns={"line": "l0", "po": "p0", "two": "t0"})[KEY + ["l0", "p0", "t0"]].sort_values("l0"),
                           left_on="line", right_on="l0", by=KEY, direction="backward")
        hi = pd.merge_asof(k, g.rename(columns={"line": "l1", "po": "p1"})[KEY + ["l1", "p1"]].sort_values("l1"),
                           left_on="line", right_on="l1", by=KEY, direction="forward")
        m = lo.merge(hi[["kid", "l1", "p1"]], on="kid")
        ex = np.isclose(m["l0"], m["line"])
        inside = m["l0"].notna() & m["l1"].notna()
        t = np.where(ex, 0.0, (m["line"] - m["l0"]) / (m["l1"] - m["l0"]).where(m["l1"] > m["l0"]))
        z = np.where(ex, lg(m["p0"]), lg(m["p0"]) + t * (lg(m["p1"]) - lg(m["p0"])))
        ok = ex | (inside & ~np.isnan(z))
        out.append(pd.DataFrame({"kid": m.loc[ok, "kid"].values, "z": z[ok], "exact2": (ex & m["t0"].fillna(False).astype(bool)).values[ok]}))
    if not out:
        return keys.assign(p_mkt=np.nan, src="none")
    r = pd.concat(out).groupby("kid").agg(z=("z", "median"), exact2=("exact2", "max"), books=("z", "size")).reset_index()
    keys = keys.merge(r, on="kid", how="left")
    keys["p_mkt"] = sg(keys["z"])
    keys["src"] = np.where(keys["z"].isna(), "none", np.where(keys["exact2"].fillna(False).astype(bool), "exact", "ladder"))
    return keys[KEY + ["line", "p_mkt", "src", "books"]]


def fit(X, y):
    """logistic regression by Newton steps (IRLS) - exact maximum likelihood, fast on millions of legs"""
    b = np.zeros(X.shape[1]); b[1] = 1.0
    for _ in range(25):
        p = sg(X @ b); W = p * (1 - p)
        H = X.T @ (X * W[:, None]) + 1e-9 * np.eye(X.shape[1])
        step = np.linalg.solve(H, X.T @ (y - p))
        b = b + step
        if np.max(np.abs(step)) < 1e-7:
            break
    return b


def ll(p, y):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def main():
    url = os.environ["DATABASE_URL"]
    conn = psycopg.connect(url); conn.execute("SET statement_timeout = 0"); conn.execute("SET work_mem = '512MB'")
    legs = pd.read_sql("""SELECT ctid::text rid, season, game_date, app, nba_ref.norm_name(player) nb, prop, line::float8 line, side, kind,
                                 final_hp p, m, result FROM nba_score.leg_card_v2""", conn)
    print(f"LH|legs {len(legs):,}", flush=True)
    mk = []
    for s, g in legs.groupby("season"):
        w = market(conn, g["game_date"].min(), g["game_date"].max())
        r = read_at(g, w)
        mk.append(r)
        print(f"LH|  {s}: book points {len(w):,} | leg lines with a market read {100*(r['src'] != 'none').mean():.1f}% "
              f"(exact {100*(r['src'] == 'exact').mean():.1f}%, ladder {100*(r['src'] == 'ladder').mean():.1f}%)", flush=True)
    mk = pd.concat(mk)
    d = legs.merge(mk, on=KEY + ["line"], how="left")
    d["src"] = d["src"].fillna("none")
    over = d["side"] == "Over"
    d["p_mkt"] = np.where(over, d["p_mkt"], 1 - d["p_mkt"])
    d["grp"] = d["app"] + "_" + d["kind"].fillna("none")
    d["y"] = np.where(d["result"] == "won", 1, np.where(d["result"] == "lost", 0, -1))
    d["lm"] = np.log(d["m"])                     # the app's own price of this leg (real prices only; NaN = none)
    d["cell"] = d["src"].where(d["src"] == "none", "mkt") + np.where(d["lm"].notna(), "|priced", "|unpriced")
    d["gd"] = pd.to_datetime(d["game_date"])
    d["wk"] = d["gd"] - pd.to_timedelta(d["gd"].dt.weekday, unit="D")     # week starting Monday
    d["hit_rate"] = np.nan; d["wset"] = pd.NaT; d["wlevel"] = None
    weeks = sorted(d["wk"].unique())
    graded = d[d["y"] >= 0]
    wrows = []

    def design(f, cell, use_price):
        c = [np.ones(len(f)), lg(f["p"])]
        if cell.startswith("mkt"):
            c.append(lg(f["p_mkt"]))
        if use_price:
            c.append(f["lm"].values)
        return np.column_stack(c)

    for wk in weeks:
        tr = graded[graded["wk"] < wk]
        te_idx = d.index[d["wk"] == wk]
        te = d.loc[te_idx]
        for (g, cell), gg in te.groupby(["grp", "cell"]):
            if cell == "none|unpriced":
                continue                                   # nothing beyond the model to pool with: hit rate = final_hp
            app = g.split("_")[0]
            for level, trg in ((g, tr[(tr["grp"] == g) & (tr["cell"] == cell)]), (app, tr[(tr["app"] == app) & (tr["cell"] == cell)])):
                if len(trg) >= MIN_N:
                    break
            else:
                continue                                   # not enough graded history yet: hit rate = final_hp
            use_price = cell.endswith("|priced") and float(trg["lm"].std()) > 0.01
            if cell == "none|priced" and not use_price:
                continue                                   # a flat price adds nothing: hit rate = final_hp
            beta = fit(design(trg, cell, use_price), trg["y"].values.astype(float))
            wrows.append((wk, level, cell, len(trg), *beta[:4], *([np.nan] * (4 - len(beta)))))
            d.loc[gg.index, "hit_rate"] = sg(design(gg, cell, use_price) @ beta)
            d.loc[gg.index, "wlevel"] = level
        d.loc[te_idx, "wset"] = wk
    ok = d["hit_rate"].notna()
    print(f"LH|legs whose hit rate pools final_hp with a market read or the app own price: {100*ok.mean():.1f}% (the rest: hit rate = final_hp)", flush=True)
    d["hit_rate"] = d["hit_rate"].fillna(d["p"])
    d["roi"] = d["hit_rate"] * d["m"] - 1
    d["roi_model"] = d["p"] * d["m"] - 1
    # ---- check (out-of-sample by construction: every weight set predates its week)
    g = d[d["y"] >= 0]
    print("LH|================ CHECK: log-loss final_hp -> hit_rate, calibration and ROI predicted vs realized ================", flush=True)
    for (s, a), x in g.groupby(["season", "app"]):
        q = pd.cut(x["hit_rate"], [0, .3, .4, .45, .5, .55, .6, .65, .7, .8, 1])
        cal = " ".join(f"{100*h['hit_rate'].mean():.0f}->{100*h['y'].mean():.1f}" for _, h in x.groupby(q, observed=True) if len(h) >= 200)
        r = x[x["m"].notna()]
        real = np.where(r["y"] == 1, r["m"] - 1, -1.0)
        bb = pd.cut(r["roi"], [-1, -.2, -.1, -.05, 0, .05, .1, 10])
        rr = " ".join(f"{100*h['roi'].mean():+.0f}->{100*real[r.index.get_indexer(h.index)].mean():+.1f}({len(h)})"
                      for _, h in r.groupby(bb, observed=True) if len(h) >= 50)
        print(f"LH|  {s} {a:10s} {len(x):8,} | log-loss {ll(x['p'], x['y']):.4f} -> {ll(x['hit_rate'], x['y']):.4f} | market read {100*(x['src'] != 'none').mean():.0f}% | "
              f"calibration {cal}", flush=True)
        if len(r):
            print(f"LH|      ROI ({len(r):,} priced): mean predicted {100*r['roi'].mean():+.1f}% realized {100*real.mean():+.1f}% | {rr}", flush=True)
    if os.environ.get("LH_WRITE") == "1":
        conn.execute("ALTER TABLE nba_score.leg_card_v2 ADD COLUMN IF NOT EXISTS p_market float8, ADD COLUMN IF NOT EXISTS market_src text, "
                     "ADD COLUMN IF NOT EXISTS hit_rate float8, ADD COLUMN IF NOT EXISTS roi_model float8, ADD COLUMN IF NOT EXISTS weight_week date")
        conn.execute("CREATE TEMP TABLE _lh (rid tid, p_market float8, market_src text, hit_rate float8, roi float8, roi_model float8, weight_week date)")
        buf = io.StringIO()
        out = d[["rid", "p_mkt", "src", "hit_rate", "roi", "roi_model", "wset"]].copy()
        out["wset"] = pd.to_datetime(out["wset"]).dt.date
        out.to_csv(buf, index=False, header=False, na_rep="")
        buf.seek(0)
        with conn.cursor().copy("COPY _lh FROM STDIN WITH (FORMAT csv, NULL '')") as cp:
            cp.write(buf.read())
        n = conn.execute("""UPDATE nba_score.leg_card_v2 l SET p_market = t.p_market, market_src = t.market_src, hit_rate = t.hit_rate, roi = t.roi,
                                   roi_model = t.roi_model, weight_week = t.weight_week FROM _lh t WHERE l.ctid = t.rid""").rowcount
        conn.execute("DROP TABLE IF EXISTS nba_score.leg_hitrate_weights_v2")
        conn.execute("CREATE TABLE nba_score.leg_hitrate_weights_v2 (week date, grp text, cell text, n_train int, a float8, b_final_hp float8, c2 float8, c3 float8)")
        with conn.cursor().copy("COPY nba_score.leg_hitrate_weights_v2 FROM STDIN") as cp:
            for r in wrows:
                cp.write_row([pd.Timestamp(r[0]).date(), r[1], r[2], int(r[3])] + [None if x != x else float(x) for x in r[4:8]])
        conn.commit()
        print(f"LH|written: {n:,} legs updated; {len(wrows):,} weight rows", flush=True)
    print("LH|DONE", flush=True)


if __name__ == "__main__":
    main()
