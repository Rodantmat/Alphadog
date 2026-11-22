#!/usr/bin/env python3
"""
INDEPENDENT READ-ONLY AUDIT of nba_score.leg_card_v2 (2026-11-22). Reads only; writes nothing.
Sections (AU| lines): calibration (hit_rate and final_hp) by season x app x kind x side with ECE; by hit-rate band; ROI predicted vs
realized by band and the +ROI groups; per-date consistency (ranges, NaN, constants); duplicates; clip pinning; p_market sanity
(Over/Under complement, monotonic in line, distance from app price); independent re-derivation of exact two-sided p_market on sampled dates.
Env: DATABASE_URL, AU_SAMPLE_DATES (per season, default 25)
"""
import os

import numpy as np
import pandas as pd
import psycopg
from scipy.optimize import brentq

BOOKS = ("fanduel", "draftkings", "betmgm", "williamhill_us", "bovada", "betrivers", "fanatics", "betonlineag", "pinnacle", "novig", "prophetx", "espnbet")
RK = ("CASE {x} WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' "
      "WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' WHEN 'blocks_steals' THEN 'stocks' ELSE {x} END")


def P(*a):
    print("AU|" + " ".join(str(x) for x in a), flush=True)


def lg(p):
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def ece(p, y, bins=(0, .1, .2, .3, .4, .45, .5, .55, .6, .65, .7, .8, .9, 1.0)):
    b = pd.cut(p, bins, include_lowest=True)
    t = pd.DataFrame({"p": p, "y": y, "b": b}).groupby("b", observed=True).agg(n=("y", "size"), p=("p", "mean"), y=("y", "mean"))
    return float((t["n"] * (t["p"] - t["y"]).abs()).sum() / t["n"].sum()), t


def dec(a):
    a = np.asarray(a, float)
    return np.where(a >= 100, 1 + a / 100, np.where(a <= -100, 1 + 100 / np.abs(a), np.nan))


def pdv(a, b):
    if not (0 < a < 1 and 0 < b < 1):
        return np.nan
    if a + b <= 1:
        return a / (a + b)
    try:
        k = brentq(lambda k: a ** k + b ** k - 1, 1.0, 10.0)
        return a ** k
    except ValueError:
        return a / (a + b)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT season, game_date, app, player_id, nba_ref.norm_name(player) nb, player, prop, line::float8 line, side, kind,
                              final_hp, confidence, score, price_source, leg_mult, m, breakeven, roi, stat_actual, result, realized, app_px,
                              p_market, market_src, hit_rate, roi_model, weight_week FROM nba_score.leg_card_v2""", conn)
    P(f"legs {len(d):,}")
    d["kind"] = d["kind"].fillna("none")
    d["y"] = np.where(d["result"] == "won", 1, np.where(d["result"] == "lost", 0, -1))
    g = d[d["y"] >= 0].copy()

    # ---------- 1 consistency per date
    P("==== CONSISTENCY")
    for c, lo, hi in (("final_hp", 0, 1), ("hit_rate", 0, 1), ("confidence", 0, 1), ("score", 0, 100), ("p_market", 0, 1)):
        x = d[c]
        P(f"{c}: null {int(x.isna().sum()):,} | min {x.min():.5f} max {x.max():.5f} | outside [{lo},{hi}] {int(((x < lo) | (x > hi)).sum()):,} | "
          f"exactly 0/1 {int(((x == 0) | (x == 1)).sum()):,}")
    pd_ = d.groupby(["season", "game_date"]).agg(n=("final_hp", "size"), conf_min=("confidence", "min"), conf_max=("confidence", "max"),
                                                  conf_sd=("confidence", "std"), conf_nuniq=("confidence", "nunique"), score_min=("score", "min"),
                                                  score_max=("score", "max"), score_sd=("score", "std"), hp_sd=("final_hp", "std"),
                                                  mk=("p_market", lambda s: s.notna().mean()))
    for s, x in pd_.groupby(level=0):
        P(f"{s}: per-date conf sd {x['conf_sd'].min():.4f}..{x['conf_sd'].max():.4f} (median {x['conf_sd'].median():.4f}); conf range {x['conf_min'].min():.3f}..{x['conf_max'].max():.3f}; "
          f"score sd {x['score_sd'].min():.2f}..{x['score_sd'].max():.2f}; score range {x['score_min'].min():.1f}..{x['score_max'].max():.1f}; "
          f"market share/date {x['mk'].min():.2f}..{x['mk'].max():.2f}; dates conf_nuniq<=5: {int((x['conf_nuniq'] <= 5).sum())}")
        odd = x[(x["conf_sd"] < 0.25 * x["conf_sd"].median()) | (x["conf_sd"] > 3 * x["conf_sd"].median()) | (x["score_sd"] < 0.25 * x["score_sd"].median())]
        for (ss, dd), r in odd.head(10).iterrows():
            P(f"   odd date {dd}: n {r.n} conf sd {r.conf_sd:.4f} nuniq {r.conf_nuniq} score sd {r.score_sd:.2f} market {r.mk:.2f}")
    dup = d.groupby(["app", "game_date", "player_id", "prop", "line", "side"]).size()
    P(f"duplicates app/date/player/prop/line/side: groups {int((dup > 1).sum()):,} extra rows {int((dup[dup > 1] - 1).sum()):,}")
    both = d.groupby(["app", "game_date", "player_id", "prop", "line"])["side"].nunique()
    P(f"leg lines with both sides on the card: {int((both == 2).sum()):,} of {len(both):,}")
    # same leg, different apps: p_market should be identical (same books), hit_rate may differ
    k = d[d["p_market"].notna()].groupby(["game_date", "player_id", "prop", "line", "side"]).agg(napp=("app", "nunique"), pm_sd=("p_market", "std"),
                                                                                                 hr_min=("hit_rate", "min"), hr_max=("hit_rate", "max"))
    k = k[k["napp"] > 1]
    P(f"same leg on >1 app: {len(k):,} | p_market differs across apps (sd>1e-9) {int((k['pm_sd'] > 1e-9).sum()):,} | hit_rate spread median "
      f"{(k['hr_max'] - k['hr_min']).median():.4f} p95 {(k['hr_max'] - k['hr_min']).quantile(.95):.4f} max {(k['hr_max'] - k['hr_min']).max():.4f}")

    # ---------- 2 p_market sanity
    P("==== P_MARKET SANITY")
    pm = d[d["p_market"].notna()]
    P("market_src share by season x app: " + " | ".join(f"{s} {a} " + ",".join(f"{k_}:{v:.2f}" for k_, v in x["market_src"].value_counts(normalize=True).items())
                                                       for (s, a), x in d.groupby(["season", "app"])))
    ou = pm.pivot_table(index=["app", "game_date", "player_id", "prop", "line"], columns="side", values="p_market", aggfunc="first").dropna()
    P(f"Over+Under p_market on the same line: {len(ou):,} pairs | |sum-1|>1e-6: {int(((ou['Over'] + ou['Under'] - 1).abs() > 1e-6).sum()):,}")
    ov = pm[pm["side"] == "Over"].drop_duplicates(["game_date", "player_id", "prop", "line"]).sort_values(["game_date", "player_id", "prop", "line"])
    ov["dp"] = ov.groupby(["game_date", "player_id", "prop"])["p_market"].diff()
    viol = ov[ov["dp"] > 0.02]
    P(f"monotonicity: P(over) should fall as the line rises - {len(ov):,} over-lines, rises > 2 pts: {len(viol):,} ({100*len(viol)/max(len(ov),1):.2f}%), > 10 pts: {int((ov['dp'] > 0.10).sum()):,}")
    for r in viol.sort_values("dp", ascending=False).head(12).itertuples():
        P(f"   rise {r.dp:+.3f}: {r.game_date} {r.player} {r.prop} {r.line} p_over {r.p_market:.3f} ({r.market_src})")
    # distance between the books and the app's own quote
    ap = pm[pm["app_px"].notna() & pm["app"].isin(["underdog", "sleeper", "fliff"])].copy()
    ap["gap"] = lg(ap["p_market"]) - lg(ap["app_px"])
    for (s, a), x in ap.groupby(["season", "app"]):
        P(f"   {s} {a}: logit(p_market) - logit(app implied) median {x['gap'].median():+.3f} | |gap|>1.0: {int((x['gap'].abs() > 1).sum()):,} of {len(x):,} "
          f"| those legs: p_market {x.loc[x['gap'].abs() > 1, 'p_market'].mean():.3f} win {x.loc[(x['gap'].abs() > 1) & (x['y'] >= 0), 'y'].mean():.3f} app {x.loc[x['gap'].abs() > 1, 'app_px'].mean():.3f}")
    # how much of the hit rate is the market: pinned at the clip
    z = (lg(pm["hit_rate"]) - lg(pm["p_market"]))
    P(f"hit_rate vs p_market logit gap: |gap|>=0.2999 (pinned at LH_DZCLIP 0.3): {int((z.abs() >= 0.2999).sum()):,} of {len(pm):,} ({100*(z.abs() >= 0.2999).mean():.1f}%) | "
      f"corr(hit_rate,p_market) {np.corrcoef(pm['hit_rate'], pm['p_market'])[0,1]:.4f} corr(hit_rate,final_hp) {np.corrcoef(pm['hit_rate'], pm['final_hp'])[0,1]:.4f}")
    nm = d[d["p_market"].isna()]
    P(f"legs without market: {len(nm):,}; hit_rate == final_hp exactly: {int((np.abs(nm['hit_rate'] - nm['final_hp']) < 1e-12).sum()):,}")

    # ---------- 3 calibration
    P("==== CALIBRATION out of sample (won/lost only)")
    for col in ("hit_rate", "final_hp", "p_market"):
        tot = []
        for (s, a, kd, sd), x in g.groupby(["season", "app", "kind", "side"]):
            x = x[x[col].notna()]
            if len(x) < 300:
                continue
            e, t = ece(x[col].values, x["y"].values)
            tot.append((s, a, kd, sd, len(x), x[col].mean(), x["y"].mean(), e))
            if col == "hit_rate":
                P(f"  {col} {s} {a:10s} {kd:9s} {sd:5s} n {len(x):8,} mean {100*x[col].mean():5.1f} -> {100*x['y'].mean():5.1f} ECE {100*e:.2f} | "
                  + " ".join(f"{100*r.p:.0f}->{100*r.y:.1f}({r.n})" for _, r in t.iterrows() if r.n >= 200))
        tt = pd.DataFrame(tot, columns=["s", "a", "k", "sd", "n", "p", "y", "e"])
        if len(tt):
            P(f"  {col} SUMMARY weighted ECE {100*np.average(tt['e'], weights=tt['n']):.2f} pts; worst groups: " +
              "; ".join(f"{r.s} {r.a} {r.k} {r.sd} n{r.n} {100*r.p:.1f}->{100*r.y:.1f} ECE{100*r.e:.1f}" for r in tt.sort_values("e", ascending=False).head(6).itertuples()))
    for (s, a), x in g.groupby(["season", "app"]):
        e, t = ece(x["hit_rate"].values, x["y"].values)
        P(f"  hit_rate band {s} {a:10s} ECE {100*e:.2f} | " + " ".join(f"{100*r.p:.1f}->{100*r.y:.1f}({r.n})" for _, r in t.iterrows() if r.n >= 100))
    # by market source
    for (s, ms), x in g.groupby(["season", g["market_src"].fillna("none")]):
        e, _ = ece(x["hit_rate"].values, x["y"].values)
        P(f"  by market_src {s} {ms}: n {len(x):,} mean {100*x['hit_rate'].mean():.1f} -> {100*x['y'].mean():.1f} ECE {100*e:.2f}")
    # by prop (largest gaps)
    pp = g.groupby(["season", "app", "prop", "side"]).agg(n=("y", "size"), p=("hit_rate", "mean"), y=("y", "mean"))
    pp = pp[pp["n"] >= 300]
    pp["gap"] = pp["p"] - pp["y"]
    P("  prop x side worst mean gaps (n>=300): " + "; ".join(f"{i[0]} {i[1]} {i[2]} {i[3]} n{r.n} {100*r.p:.1f}->{100*r.y:.1f}" for i, r in
                                                           pp.reindex(pp["gap"].abs().sort_values(ascending=False).index).head(15).iterrows()))
    # by week (drift)
    g["wk"] = pd.to_datetime(g["game_date"]).dt.to_period("W")
    wkt = g.groupby(["season", "wk"]).agg(n=("y", "size"), p=("hit_rate", "mean"), y=("y", "mean"))
    wkt["gap"] = wkt["p"] - wkt["y"]
    P("  weekly mean gap hit_rate - win: max |gap| per season: " + "; ".join(f"{s} {x['gap'].abs().max()*100:.2f} pts (week {x['gap'].abs().idxmax()[1]})" for s, x in wkt.groupby(level=0)))

    # ---------- 4 ROI
    P("==== ROI predicted vs realized (won/lost, priced)")
    r = g[g["m"].notna()].copy()
    r["real"] = np.where(r["y"] == 1, r["m"] - 1, -1.0)
    P(f"  realized column check: |realized - recomputed| > 1e-9: {int((np.abs(r['realized'] - r['real']) > 1e-9).sum()):,}; realized null: {int(r['realized'].isna().sum()):,}")
    for (s, a), x in r.groupby(["season", "app"]):
        b = pd.cut(x["roi"], [-1.01, -.3, -.2, -.1, -.05, 0, .05, .1, .2, .5, 100])
        P(f"  {s} {a:10s} n {len(x):8,} pred {100*x['roi'].mean():+.2f}% real {100*x['real'].mean():+.2f}% | " +
          " ".join(f"{100*h['roi'].mean():+.0f}->{100*h['real'].mean():+.1f}({len(h)})" for _, h in x.groupby(b, observed=True) if len(h) >= 30))
    pos = r[r["roi"] > 0]
    P(f"  +ROI legs: {len(pos):,} | predicted {100*pos['roi'].mean():+.2f}% realized {100*pos['real'].mean():+.2f}% | hit {100*pos['y'].mean():.2f} vs pred {100*pos['hit_rate'].mean():.2f}")
    for keys in (["season", "app"], ["season", "app", "kind"], ["season", "app", "market_src"], ["season", "app", "side"]):
        t = pos.groupby([pos[k_].fillna("none") for k_ in keys]).agg(n=("y", "size"), pred=("roi", "mean"), real=("real", "mean"), ph=("hit_rate", "mean"), hit=("y", "mean"),
                                                                       be=("breakeven", "mean"))
        for i, q in t[t["n"] >= 30].iterrows():
            se = pos.set_index(keys).loc[i, "real"].std() / np.sqrt(q.n) if q.n > 1 else np.nan
            P(f"    +ROI {'/'.join(map(str, i))}: n {q.n:,} pred {100*q.pred:+.1f}% real {100*q.real:+.1f}% (se {100*se:.1f}) hit {100*q.hit:.1f} vs pred {100*q.ph:.1f} be {100*q.be:.1f}")
    for th in (0.05, 0.10, 0.20, 0.50):
        x = r[r["roi"] > th]
        P(f"  roi > {th:.2f}: n {len(x):,} pred {100*x['roi'].mean():+.1f}% real {100*x['real'].mean():+.1f}% by season: " +
          " ".join(f"{s}:{len(h)}:{100*h['real'].mean():+.1f}" for s, h in x.groupby("season")))
    top = r.sort_values("roi", ascending=False).head(25)
    for q in top.itertuples():
        P(f"   top roi {q.roi:+.2f}: {q.game_date} {q.app} {q.player} {q.prop} {q.line} {q.side} kind {q.kind} m {q.m:.3f} final_hp {q.final_hp:.3f} "
          f"p_mkt {q.p_market if q.p_market == q.p_market else float('nan'):.3f} ({q.market_src}) hit_rate {q.hit_rate:.3f} -> {q.result}")
    # unpriced share
    P("  priced share (m not null) by season x app x kind: " + " | ".join(f"{s} {a} {kd} {100*x['m'].notna().mean():.0f}% of {len(x):,}"
                                                                     for (s, a, kd), x in d.groupby(["season", "app", "kind"])))

    # ---------- 5 independent p_market re-derivation (exact two-sided lines) on sampled dates
    P("==== P_MARKET RE-DERIVATION (exact two-sided, latest pre-tip snapshot per book/market/line)")
    nsd = int(os.environ.get("AU_SAMPLE_DATES") or 25)
    rng = np.random.default_rng(7)
    for s, x in d[d["market_src"] == "exact"].groupby("season"):
        dates = sorted(rng.choice(x["game_date"].unique(), size=min(nsd, x["game_date"].nunique()), replace=False))
        bk = pd.read_sql(f"""SELECT DISTINCT ON (game_date, bookmaker, market_key, nba_ref.norm_name(player), line, side)
                                    game_date, bookmaker, market_key mkey, nba_ref.norm_name(player) nb,
                                    {RK.format(x="replace(replace(market_key,'player_',''),'_alternate','')")} prop, line::float8 line, side, price::float8 price,
                                    snapshot_ts, commence_time
                             FROM nba_market.board_snapshots
                             WHERE bookmaker = ANY(%s) AND snapshot_label = 'window' AND game_date = ANY(%s) AND price IS NOT NULL AND side IN ('Over','Under')
                             ORDER BY game_date, bookmaker, market_key, nba_ref.norm_name(player), line, side,
                                      (snapshot_ts < commence_time) DESC, snapshot_ts DESC""", conn, params=(list(BOOKS), [str(q) for q in dates]))
        late = int((bk["snapshot_ts"] >= bk["commence_time"]).sum())
        w = bk.pivot_table(index=["game_date", "bookmaker", "mkey", "nb", "prop", "line"], columns="side", values="price", aggfunc="first").reset_index().dropna(subset=["Over", "Under"])
        w["po"] = [pdv(1 / dec(a), 1 / dec(b)) for a, b in zip(w["Over"], w["Under"])]
        w = w.sort_values("mkey").drop_duplicates(["game_date", "bookmaker", "nb", "prop", "line"])     # main market first
        w["z"] = lg(w["po"])
        med = w.groupby(["game_date", "nb", "prop", "line"])["z"].transform("median"); nb_ = w.groupby(["game_date", "nb", "prop", "line"])["z"].transform("size")
        w = w[(nb_ < 3) | ((w["z"] - med).abs() <= 0.6)]
        m_ = w.groupby(["game_date", "nb", "prop", "line"]).agg(z=("z", "median"), books=("z", "size")).reset_index()
        m_["p_mine"] = 1 / (1 + np.exp(-m_["z"]))
        xs = x[x["game_date"].isin(dates)].drop_duplicates(["game_date", "nb", "prop", "line", "side"]).copy()
        xs["po_card"] = np.where(xs["side"] == "Over", xs["p_market"], 1 - xs["p_market"])
        j = xs.merge(m_, on=["game_date", "nb", "prop", "line"], how="left")
        diff = (j["po_card"] - j["p_mine"]).abs()
        P(f"  {s}: {len(dates)} dates, {len(j):,} exact legs | no two-sided pair found by me: {int(j['p_mine'].isna().sum()):,} | |diff| median {diff.median():.4f} "
          f"p95 {diff.quantile(.95):.4f} >0.02: {int((diff > 0.02).sum()):,} >0.05: {int((diff > 0.05).sum()):,} | book rows at/after tip on these dates: {late:,}")
        for q in j[diff > 0.05].sort_values("game_date").head(8).itertuples():
            P(f"     diff {q.game_date} {q.player} {q.prop} {q.line} {q.side}: card P(over) {q.po_card:.3f} mine {q.p_mine:.3f} ({q.books} books)")
        nf = j[j["p_mine"].isna()].head(5)
        for q in nf.itertuples():
            P(f"     no pair {q.game_date} {q.player} {q.prop} {q.line} card P(over) {q.po_card:.3f}")
        # outlier books: a book's main line far from the other books' main lines
        mains = bk[~bk["mkey"].str.endswith("_alternate")].drop_duplicates(["game_date", "bookmaker", "nb", "prop", "line"])
        two = mains.groupby(["game_date", "bookmaker", "nb", "prop", "line"])["side"].nunique().reset_index()
        two = two[two["side"] == 2]
        cons = two.groupby(["game_date", "nb", "prop"])["line"].transform("median")
        far = two[(two["line"] - cons).abs() > np.maximum(3, 0.35 * cons)]
        P(f"     two-sided MAIN lines far from the books' consensus (>max(3, 35%)): {len(far):,} of {len(two):,}; by book {far['bookmaker'].value_counts().to_dict()}")
        for q in far.head(6).itertuples():
            P(f"       far {q.game_date} {q.bookmaker} {q.nb} {q.prop} line {q.line}")
    P("DONE")


if __name__ == "__main__":
    main()
