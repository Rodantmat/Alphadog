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
Env: DATABASE_URL, PPMF_SINCE (2026-10-20), PPMB_WIN (75).
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
        if exact:
            lo = ys[np.isclose(xs, r.line)][0]
        elif len(xs) >= 2 and xs.min() < r.line < xs.max():
            lo = np.interp(r.line, xs, ys)
        else:
            continue          # no extrapolation
        po = 1 / (1 + np.exp(-lo))
        q = po if r.sd == "o" else 1 - po
        rows.append((r.gd, r.kind, r.sd, r.f, q, exact, gap, len(xs)))
    d = pd.DataFrame(rows, columns=["gd", "kind", "sd", "f", "q", "exact", "gap", "nlines"])
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
    # the curve itself (implied chance PrizePicks charges vs market chance)
    for (kind, sd), x in d.groupby(["kind", "sd"]):
        t = x.groupby(pd.cut(x["q"], [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1]))["f"].agg(["count", "median"])
        print(f"PMB|curve {kind} {'More' if sd == 'o' else 'Less'}: " + " | ".join(f"q {k}: n {int(v['count'])} f {v['median']:.3f}" for k, v in t.iterrows() if v["count"] >= 10), flush=True)


if __name__ == "__main__":
    main()
