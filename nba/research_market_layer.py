#!/usr/bin/env python3
"""
THE MARKET LAYER - DOES THE BOOKS' OWN PRICE OF THE SAME LINE MAKE EACH LEG'S HIT RATE SHARPER? READ-ONLY. (owner 2026-11-21 17:48 / 18:04 PT:
"each one has its own hit rate ... ROI per leg ... calibrated ... adjusting, expanding, improving what we have, aligned with the documentation")
Documented intent it builds on: the board's leg ROI (nba/main_ui/roi.js, 2026-11-11) blends the model with the app's PRICE because the price carries
the market's read the model lacks ("ranking legs by the calibrated model alone still over-stated the top legs"); its weights for the non-PrizePicks
apps were assumptions. Here the market read comes from the sportsbooks' two-sided prices of the SAME player / stat / line in the same decision
window (de-vigged per book, median over books) - measured, not assumed - and the pooling weights are fitted walk-forward (only legs graded before
each month), the same way on every date.
For every graded leg of nba_score.leg_card_v2 (one season per run):
  1. market coverage: share of legs with an exact two-sided book line, books per leg;
  2. accuracy: log-loss / calibration of final_hp, of the market alone (multiplicative and power de-vig), and of the pooled number
     logit(h) = a + b x logit(final_hp) + c x logit(p_market), fitted per kind group on earlier months only;
  3. ROI: predicted (h x m - 1) vs realized, by band, for final_hp alone and for the pooled hit rate.
Env: DATABASE_URL, ML_SEASON.
"""
import os

import numpy as np
import pandas as pd
import psycopg
from scipy.optimize import brentq, minimize

BOOKS = ("fanduel", "draftkings", "betmgm", "williamhill_us", "bovada", "betrivers", "fanatics", "betonlineag", "pinnacle", "novig", "prophetx", "espnbet")
RK = ("CASE {x} WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' "
      "WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' WHEN 'blocks_steals' THEN 'stocks' ELSE {x} END")


def dec(a):
    a = np.asarray(a, float)
    return np.where(a >= 100, 1 + a / 100, np.where(a <= -100, 1 + 100 / np.abs(a), np.nan))


def power_devig(io, iu):
    """power method: find k with io^k + iu^k = 1 (io, iu = implied probabilities incl. vig)"""
    out = np.full(len(io), np.nan)
    for i, (a, b) in enumerate(zip(io, iu)):
        if not (0 < a < 1 and 0 < b < 1) or a + b <= 1:
            out[i] = a / (a + b) if a + b > 0 else np.nan
            continue
        try:
            k = brentq(lambda k: a ** k + b ** k - 1, 1.0, 10.0)
            out[i] = a ** k
        except ValueError:
            out[i] = a / (a + b)
    return out


def ll(p, y):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def lg(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def main():
    season = os.environ.get("ML_SEASON") or "2026-27"
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0"); conn.execute("SET work_mem = '512MB'")
    legs = pd.read_sql("""SELECT game_date, app, nba_ref.norm_name(player) nb, prop, line::float8 line, side, kind, final_hp p, m, result
                          FROM nba_score.leg_card_v2 WHERE season = %s AND result IN ('won','lost')""", conn, params=(season,))
    legs["y"] = (legs["result"] == "won").astype(int)
    a, b = legs["game_date"].min(), legs["game_date"].max()
    bk = pd.read_sql(f"""SELECT s.game_date, s.bookmaker, nba_ref.norm_name(s.player) nb, {RK.format(x="replace(replace(s.market_key,'player_',''),'_alternate','')")} prop,
                               s.line::float8 line, s.side, s.price::float8 price
                        FROM nba_market.board_snapshots s
                        WHERE s.bookmaker = ANY(%s) AND s.snapshot_label = 'window' AND s.game_date BETWEEN %s AND %s AND s.price IS NOT NULL
                          AND s.side IN ('Over','Under')""", conn, params=(list(BOOKS), a, b))
    conn.close()
    bk = bk.drop_duplicates(["game_date", "bookmaker", "nb", "prop", "line", "side"])
    w = bk.pivot_table(index=["game_date", "bookmaker", "nb", "prop", "line"], columns="side", values="price", aggfunc="first").dropna().reset_index()
    io, iu = 1 / dec(w["Over"]), 1 / dec(w["Under"])
    w["mult"] = io / (io + iu); w["pow"] = power_devig(io.values, iu.values)
    mk = w.groupby(["game_date", "nb", "prop", "line"]).agg(p_mult=("mult", "median"), p_pow=("pow", "median"), books=("bookmaker", "nunique")).reset_index()
    d = legs.merge(mk, on=["game_date", "nb", "prop", "line"], how="left")
    over = d["side"] == "Over"
    for c in ("p_mult", "p_pow"):
        d[c] = np.where(over, d[c], 1 - d[c])
    has = d["p_pow"].notna()
    print(f"ML|{season}: graded pick'em legs {len(d):,} | exact two-sided book line {100*has.mean():.1f}% (books per leg median {d.loc[has,'books'].median():.0f}) | "
          + " | ".join(f"{a_} {100*g['p_pow'].notna().mean():.0f}%" for a_, g in d.groupby('app')), flush=True)
    x = d[has].copy()
    x["grp"] = np.where(x["app"] == "prizepicks", "pp_" + x["kind"].fillna("none"), x["app"])
    x["ym"] = pd.to_datetime(x["game_date"]).dt.to_period("M")
    print(f"ML|  on legs with a book line ({len(x):,}): log-loss final_hp {ll(x['p'], x['y']):.4f} | market multiplicative {ll(x['p_mult'], x['y']):.4f} | "
          f"market power {ll(x['p_pow'], x['y']):.4f}", flush=True)
    # walk-forward pooling per group: fit on all earlier months of this season (first month: in-sample excluded -> skipped)
    x["h"] = np.nan
    for g, gg in x.groupby("grp"):
        months = sorted(gg["ym"].unique())
        for m_ in months[1:]:
            tr = gg[gg["ym"] < m_]; te = gg[gg["ym"] == m_]
            if len(tr) < 2000:
                continue
            X = np.c_[np.ones(len(tr)), lg(tr["p"].values), lg(tr["p_pow"].values)]; y = tr["y"].values

            def nll(beta):
                z = X @ beta
                return float(np.sum(np.logaddexp(0, z) - y * z))
            beta = minimize(nll, np.array([0.0, 0.3, 0.7]), method="BFGS").x
            Xt = np.c_[np.ones(len(te)), lg(te["p"].values), lg(te["p_pow"].values)]
            x.loc[te.index, "h"] = 1 / (1 + np.exp(-(Xt @ beta)))
            print(f"ML|    {g:14s} {m_}: train {len(tr):,} -> a {beta[0]:+.3f} b(final_hp) {beta[1]:.3f} c(market) {beta[2]:.3f} | test {len(te):,}", flush=True)
    t = x[x["h"].notna()]
    if len(t):
        print(f"ML|  OUT-OF-SAMPLE months ({len(t):,} legs): log-loss final_hp {ll(t['p'], t['y']):.4f} | market {ll(t['p_pow'], t['y']):.4f} | pooled {ll(t['h'], t['y']):.4f}", flush=True)
        for g, gg in t.groupby("grp"):
            print(f"ML|    {g:14s} {len(gg):8,}: final_hp {ll(gg['p'], gg['y']):.4f} market {ll(gg['p_pow'], gg['y']):.4f} pooled {ll(gg['h'], gg['y']):.4f}", flush=True)
        r = t[t["m"].notna()].copy()
        for col, lab in (("p", "final_hp"), ("p_pow", "market"), ("h", "pooled")):
            r["roi"] = r[col] * r["m"] - 1; r["real"] = np.where(r["y"] == 1, r["m"] - 1, -1.0)
            bb = pd.cut(r["roi"], [-1, -.2, -.1, -.05, 0, .05, .1, .2, 10])
            print(f"ML|  ROI by {lab:8s}: " + " ".join(f"{100*h['roi'].mean():+.0f}->{100*h['real'].mean():+.1f}({len(h)})" for _, h in r.groupby(bb, observed=True) if len(h) >= 50), flush=True)
        for col, lab in (("p", "final_hp"), ("h", "pooled")):
            q = pd.cut(t[col], [0, .3, .4, .45, .5, .55, .6, .65, .7, .8, 1])
            print(f"ML|  calibration {lab:8s}: " + " ".join(f"{100*h[col].mean():.0f}->{100*h['y'].mean():.1f}" for _, h in t.groupby(q, observed=True) if len(h) >= 200), flush=True)
    print("ML|DONE", flush=True)


if __name__ == "__main__":
    main()
