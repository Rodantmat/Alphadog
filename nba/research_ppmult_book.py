#!/usr/bin/env python3
"""
PP MULTIPLIER vs THE SPORTSBOOKS' FULL LADDER, SAME HOUR. READ-ONLY. (owner 2026-11-20 17:08 PT)
Hypothesis: PrizePicks sets each goblin / demon rung from the chance the market gives that exact line - which is why the tier, where the
regular line sits, a missing regular line, the player's form and the ladder density all move the multiplier (they all move that chance) -
and the drift through the day is the market moving.
Market chance per player-stat: every book's main and alternate lines in nba_market.board_snapshots (FanDuel, Bovada, DraftKings, BetMGM,
Caesars, Fanatics, BetRivers, Novig, ProphetX, Underdog's own prices), de-vigged (two-sided pairs) or vig-adjusted (one-sided alternates),
combined per line (median), and interpolated across lines in logit space -> P(stat > x) for any x. Only PrizePicks quotes taken within
PPMB_WIN minutes of the book snapshot are used.
Test: ln f = poly(logit q) per kind / side, q = the market chance of that exact leg; out-of-day; EXACT after snapping to PrizePicks' values.
Env: DATABASE_URL, PPMF_SINCE (2026-10-20), PPMB_WIN (75), PPMB_FIT (linear | nb: 2026-11-21 - instead of straight lines between book
lines, fit a negative-binomial count distribution (mean, dispersion) to each player's whole book ladder and read P(stat > x) from it; this
also reaches rungs beyond the book's last line), PPMB_EXTRAP (with nb: how many points past the book's outermost line a rung may sit, 6).
"""
import os
import subprocess
import sys

import numpy as np
import pandas as pd
import psycopg

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn"], check=False)
from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402

BOOKS = ("fanduel", "bovada", "draftkings", "betmgm", "williamhill_us", "fanatics", "betrivers", "novig", "prophetx", "underdog")


def am2p(a):
    a = np.asarray(a, float)
    return np.where(a < 0, -a / (-a + 100), 100 / (a + 100))


FIT = os.environ.get("PPMB_FIT", "linear"); EXTRAP = float(os.environ.get("PPMB_EXTRAP", "6"))
_FITC = {}


def nb_fit(key, xs, po):
    """negative binomial (mean mu, size r) fitted to the book ladder: P(X > x) = sf(floor(x)) for half-point lines; least squares in logit."""
    if key in _FITC:
        return _FITC[key]
    from scipy.optimize import minimize
    from scipy.stats import nbinom
    xs = np.asarray(xs, float); lo_t = np.log(po / (1 - po)); k = np.floor(xs)

    def sf(mu, r):
        pp = r / (r + mu)
        return np.clip(nbinom.sf(k, r, pp), 1e-4, 1 - 1e-4)

    def loss(v):
        mu, r = np.exp(v)
        s_ = sf(mu, r)
        return float(np.sum((np.log(s_ / (1 - s_)) - lo_t) ** 2))
    mu0 = max(float(np.interp(0.5, po[::-1], xs[::-1])) if len(xs) > 1 else float(xs[0]), 0.3)
    best = None
    for r0 in (2.0, 8.0, 40.0):
        res = minimize(loss, np.log([mu0, r0]), method="Nelder-Mead", options={"xatol": 1e-4, "fatol": 1e-6, "maxiter": 400})
        if best is None or res.fun < best.fun:
            best = res
    mu, r = np.exp(best.x)
    _FITC[key] = (mu, r, best.fun / max(len(xs), 1))
    return _FITC[key]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    since = os.environ.get("PPMF_SINCE", "2026-10-20"); WIN = float(os.environ.get("PPMB_WIN", "75"))
    m = pd.read_sql("""SELECT (quoted_at AT TIME ZONE 'America/Los_Angeles')::date gd, quoted_at, nba_ref.norm_name(player) nm, base_market, line::float8 line, kind,
                              lower(left(side,1)) sd, factor_mined::float8 f FROM nba_market.pp_mined_leg
                       WHERE factor_mined IS NOT NULL AND kind IN ('goblin','demon') AND quoted_at >= %s""", conn, params=(since,))
    bk = pd.read_sql("""SELECT game_date gd, snapshot_ts, bookmaker, regexp_replace(market_key, '_alternate$', '') base_market, nba_ref.norm_name(player) nm, lower(left(side,1)) sd,
                               line::float8 line, price::float8 price FROM nba_market.board_snapshots
                        WHERE game_date >= %s AND bookmaker = ANY(%s) AND price IS NOT NULL AND side IN ('Over','Under')""", conn, params=(since, list(BOOKS)))
    conn.close()
    print(f"PMB|quotes {len(m):,} | book rows {len(bk):,}", flush=True)
    m["gd"] = pd.to_datetime(m["gd"]); bk["gd"] = pd.to_datetime(bk["gd"])
    bk["p"] = am2p(bk["price"])
    # de-vig: two-sided pairs per book / snapshot / player / market / line
    key = ["gd", "snapshot_ts", "bookmaker", "base_market", "nm", "line"]
    piv = bk.pivot_table(index=key, columns="sd", values="p", aggfunc="mean").reset_index()
    two = piv.dropna(subset=["o", "u"]).copy()
    two["over"] = two["o"] / (two["o"] + two["u"])
    vig = (two["o"] + two["u"]).groupby(two["bookmaker"]).median()
    one = piv[piv["o"].notna() & piv["u"].isna()].copy()
    one["over"] = one["o"] / one["bookmaker"].map(vig).fillna(1.05)
    oneu = piv[piv["u"].notna() & piv["o"].isna()].copy()
    oneu["over"] = 1 - oneu["u"] / oneu["bookmaker"].map(vig).fillna(1.05)
    allp = pd.concat([two[key + ["over"]], one[key + ["over"]], oneu[key + ["over"]]])
    allp["over"] = allp["over"].clip(0.005, 0.995)
    allp["snapk"] = pd.to_datetime(allp["snapshot_ts"], utc=True).dt.tz_convert(None).dt.floor("30min")
    perbook = allp.groupby(["gd", "snapk", "base_market", "nm", "line", "bookmaker"])["over"].median().unstack("bookmaker")
    print("PMB|book overround (median of two-sided pairs): " + ", ".join(f"{b} {v:.3f}" for b, v in vig.items()), flush=True)
    # per snapshot time + player-market: median across books per line
    allp["snap"] = pd.to_datetime(allp["snapshot_ts"], utc=True).dt.tz_convert(None).dt.floor("30min").astype("datetime64[ns]")
    cur = allp.groupby(["gd", "snap", "base_market", "nm", "line"])["over"].median().reset_index()
    curves = {k: g.sort_values("line") for k, g in cur.groupby(["gd", "snap", "base_market", "nm"])}
    snaps = cur.groupby("gd")["snap"].apply(lambda s: np.array(sorted(s.unique()), dtype="datetime64[ns]")).to_dict()
    rows = []
    m["qt"] = pd.to_datetime(m["quoted_at"], utc=True).dt.tz_convert(None).astype("datetime64[ns]")
    for r in m.itertuples():
        ss = snaps.get(r.gd)
        if ss is None:
            continue
        dt = np.abs((ss - np.datetime64(r.qt, "ns")).astype("timedelta64[m]").astype(float))
        best = None
        for j in np.argsort(dt):
            if dt[j] > WIN:
                break
            c = curves.get((r.gd, pd.Timestamp(ss[j]), r.base_market, r.nm))
            if c is not None and len(c) >= 1:
                best = (c, dt[j]); break
        if best is None:
            continue
        c, gap = best
        xs = c["line"].values; ys = np.log(c["over"].values / (1 - c["over"].values))
        exact = np.any(np.isclose(xs, r.line))
        if FIT == "nb" and len(xs) >= 2:
            from scipy.stats import nbinom
            if not (xs.min() - EXTRAP <= r.line <= xs.max() + EXTRAP):
                continue
            mu, rr, _ = nb_fit((r.gd, ss[j], r.base_market, r.nm), xs, c["over"].values)
            pv = float(np.clip(nbinom.sf(np.floor(r.line), rr, rr / (rr + mu)), 1e-4, 1 - 1e-4))
            lo = np.log(pv / (1 - pv))
        elif exact:
            lo = ys[np.isclose(xs, r.line)][0]
        elif len(xs) >= 2 and xs.min() < r.line < xs.max():
            lo = np.interp(r.line, xs, ys)
        else:
            continue          # no extrapolation
        po = 1 / (1 + np.exp(-lo))
        q = po if r.sd == "o" else 1 - po
        pb = {}
        try:
            row = perbook.loc[(r.gd, pd.Timestamp(ss[j]), r.base_market, r.nm, r.line)]
            for bkn, v in row.items():
                if pd.notna(v):
                    pb[bkn] = v if r.sd == "o" else 1 - v
        except KeyError:
            pass
        rows.append((r.gd, r.kind, r.sd, r.f, q, exact, gap, len(xs), pb, r.quoted_at, r.nm, r.base_market, r.line))
    d = pd.DataFrame(rows, columns=["gd", "kind", "sd", "f", "q", "exact", "gap", "nlines", "pb", "quoted_at", "nm", "base_market", "line"])
    print(f"PMB|market curve: {FIT}" + (f" (negative binomial per ladder, up to {EXTRAP:g} pts past the book's lines; {len(_FITC):,} ladders fitted)" if FIT == "nb" else " (straight lines in logit between book lines)"), flush=True)
    if os.environ.get("PPMB_SAVE") == "1" and FIT == "linear":
        c2 = psycopg.connect(os.environ["DATABASE_URL"])
        c2.execute("DROP TABLE IF EXISTS nba_market.rs_pp_mktq")
        c2.execute("CREATE TABLE nba_market.rs_pp_mktq (quoted_at text, nm text, base_market text, line float8, kind text, sd text, q float8, q_bovada float8, q_underdog float8, q_novig float8, q_fanduel float8, gap float8, exact boolean)")
        with c2.cursor() as cur:
            cur.executemany("INSERT INTO nba_market.rs_pp_mktq VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                            [(str(int(pd.Timestamp(r.quoted_at).timestamp())), r.nm, r.base_market, float(r.line), r.kind, r.sd, float(r.q), r.pb.get("bovada"), r.pb.get("underdog"), r.pb.get("novig"), r.pb.get("fanduel"), float(r.gap), bool(r.exact)) for r in d.itertuples()])
        c2.commit(); c2.close()
        print(f"PMB|saved {len(d):,} market chances to nba_market.rs_pp_mktq", flush=True)
    d["lq"] = np.log(d["q"] / (1 - d["q"])); d["lnf"] = np.log(d["f"])
    print(f"PMB|quotes with a same-hour market chance: {len(d):,} ({100*d['exact'].mean():.0f}% at an exact book line, rest interpolated) | days {d['gd'].nunique()}", flush=True)
    grid = {k: np.array(sorted(v.round(4).unique())) for k, v in d.groupby(["kind", "sd"])["f"]}
    days = sorted(d["gd"].unique()); folds = np.array_split(np.array(days), min(5, len(days)))
    for sub, lab in ((d, "all"), (d[d["exact"]], "exact book line only"), (d[d["gap"] <= 30], "book snapshot within 30 min")):
        for (kind, sd), x in sub.groupby(["kind", "sd"]):
            if len(x) < 40:
                continue
            ex = []; er = []
            for fd in folds:
                tr = x[~x["gd"].isin(fd)]; te = x[x["gd"].isin(fd)]
                if len(tr) < 30 or te.empty:
                    continue
                c = np.polyfit(tr["lq"], tr["lnf"], 3)
                p = np.exp(np.polyval(c, te["lq"]))
                gr = grid[(kind, sd)]
                sn = np.array([gr[np.argmin(np.abs(gr - v))] for v in p])
                ex.append(np.isclose(sn, te["f"].round(4), atol=1e-3)); er.append(np.abs(sn / te["f"] - 1))
            if not ex:
                continue
            ex = np.concatenate(ex); er = np.concatenate(er)
            print(f"PMB|[{lab}] {kind} {'More' if sd == 'o' else 'Less'}: {len(ex):,} out-of-day | EXACT {100*ex.mean():.1f}% | median error {100*np.median(er):.2f}% | p90 {100*np.percentile(er,90):.2f}% | corr(lnf, logit q) {np.corrcoef(x['lnf'], x['lq'])[0,1]:+.3f}", flush=True)
    # per book: which single book's chance predicts PrizePicks best (same legs, exact line at that book)
    for bkn in BOOKS:
        x = d[d["pb"].apply(lambda z: bkn in z)].copy()
        if len(x) < 200:
            continue
        x["lqb"] = x["pb"].apply(lambda z: np.log(z[bkn] / (1 - z[bkn])))
        out = []
        for (kind, sd), y in x.groupby(["kind", "sd"]):
            if len(y) < 100:
                continue
            ex = []
            for fd in folds:
                tr = y[~y["gd"].isin(fd)]; te = y[y["gd"].isin(fd)]
                if len(tr) < 50 or te.empty:
                    continue
                c = np.polyfit(tr["lqb"], tr["lnf"], 3); p = np.exp(np.polyval(c, te["lqb"])); gr = grid[(kind, sd)]
                ex.append(np.isclose(np.array([gr[np.argmin(np.abs(gr - v))] for v in p]), te["f"].round(4), atol=1e-3))
            if ex:
                ex = np.concatenate(ex)
                out.append(f"{kind[0]}{sd} exact {100*ex.mean():.0f}% (n {len(ex)}, corr {np.corrcoef(y['lnf'], y['lqb'])[0,1]:+.3f})")
        print(f"PMB|book {bkn}: " + " | ".join(out), flush=True)
    # the curve itself (implied chance PrizePicks charges vs market chance)
    for (kind, sd), x in d.groupby(["kind", "sd"]):
        t = x.groupby(pd.cut(x["q"], [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1]))["f"].agg(["count", "median"])
        print(f"PMB|curve {kind} {'More' if sd == 'o' else 'Less'}: " + " | ".join(f"q {k}: n {int(v['count'])} f {v['median']:.3f}" for k, v in t.iterrows() if v["count"] >= 10), flush=True)


if __name__ == "__main__":
    main()
