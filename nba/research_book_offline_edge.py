#!/usr/bin/env python3
"""
S5d - OFF-MARKET LINES: the sportsbook chance at the app's line when the books post a DIFFERENT line. READ-ONLY. (NBA_HONEST_REBUILD.md, D7 next step d)
research_book_edge.py joined the sportsbook only where a book posts the app's exact line. That is where the app agrees with the market, so it throws away
the textbook pick'em edge: the app posts 22.5 while the market sits at 23.5. Here the book's chance is carried to the app's line:
  exact    a book rung at the same line
  interp   the line sits between two book rungs of the same player / prop / day -> straight line in log-odds
  extrap   only rungs on one side -> the nearest rung moved along the prop's own slope (log-odds per unit of line, learned from neighbouring book rungs
           of the SAME season's earlier days is not needed: slope is a property of the stat, fitted on all book rung pairs by prop and line-level band),
           at most OE_MAXSTEP of line distance relative to max(1, 10% of the line)
Apps: PrizePicks REGULAR lines only (their price is known exactly; goblin / demon history prices are modelled, rule C9) and Underdog all tiers (real multipliers).
Reports per app / season: coverage by method; calibration by band and method; legs with book chance >= x (legs a slate, hit, return, by side, by method,
90% range re-drawing slates); the same for book-implied return > x on Underdog.
Env: DATABASE_URL, OE_MAXSTEP (2.0), OE_MINBOOKS (1).
"""
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

import research_legs_h_build as LH

MAXSTEP = float(os.environ.get("OE_MAXSTEP") or 2.0); MINB = int(os.environ.get("OE_MINBOOKS") or 1)
BASE = 0.542
rng = np.random.default_rng(5)


def lg(p):
    p = np.clip(p, 1e-4, 1 - 1e-4); return np.log(p / (1 - p))


def boot(r, days):
    u = np.unique(days)
    if len(u) < 3:
        return (np.nan, np.nan)
    by = {d: r[days == d] for d in u}
    bs = [np.concatenate([by[d] for d in rng.choice(u, len(u))]).mean() for _ in range(300)]
    return np.quantile(bs, .05), np.quantile(bs, .95)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, books, p_over_mean::float8 po
                        FROM nba_market.market_consensus WHERE snapshot_label = 'window' AND market_key = ANY(%s) AND books >= %s
                          AND p_over_mean > 0.02 AND p_over_mean < 0.98""", conn, params=(list(LH.MK), MINB))
    mc["player_id"] = mc["nm"].map(ids); mc["prop"] = mc["market_key"].map(LH.MK); mc = mc[mc["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop", "line"])
    mc["lo"] = lg(mc["po"].values)
    ladders = defaultdict(list)
    for gd, pid, pr, ln, lo, bk in zip(mc["gd"], mc["player_id"], mc["prop"], mc["line"], mc["lo"], mc["books"]):
        ladders[(gd, pid, pr)].append((ln, lo, bk))
    # slope of log-odds per unit of line, by prop and line-level band, from neighbouring rungs (gap <= 3)
    sl = defaultdict(list)
    for (gd, pid, pr), rs in ladders.items():
        rs.sort()
        for (l1, o1, _), (l2, o2, _) in zip(rs[:-1], rs[1:]):
            if 0 < l2 - l1 <= 3 and o2 < o1:
                sl[(pr, int(np.log2(max(1.0, (l1 + l2) / 2))))].append((o2 - o1) / (l2 - l1))
    SL = {k: float(np.median(v)) for k, v in sl.items() if len(v) >= 50}
    PSL = {}
    for (pr, b), v in SL.items():
        PSL.setdefault(pr, []).append(v)
    print("OE|book rungs " + f"{len(mc):,}; player-prop-days {len(ladders):,}; slope cells {len(SL)} | " +
          "; ".join(f"{pr} " + "/".join(f"{2 ** b}+:{SL[(pr, b)]:.2f}" for (p2, b) in sorted(SL) if p2 == pr) for pr in sorted(PSL)), flush=True)

    def book_at(gd, pid, pr, ln):
        rs = ladders.get((gd, pid, pr))
        if not rs:
            return np.nan, "none", np.nan, 0
        below = [r for r in rs if r[0] < ln - 1e-6]; above = [r for r in rs if r[0] > ln + 1e-6]; same = [r for r in rs if abs(r[0] - ln) < 1e-6]
        if same:
            return same[0][1], "exact", 0.0, same[0][2]
        if below and above:
            a, b = below[-1], above[0]; w = (ln - a[0]) / (b[0] - a[0])
            return a[1] + w * (b[1] - a[1]), "interp", min(ln - a[0], b[0] - ln), min(a[2], b[2])
        near = below[-1] if below else above[0]; dist = ln - near[0]
        if abs(dist) / max(1.0, 0.1 * ln) > MAXSTEP:
            return np.nan, "far", abs(dist), near[2]
        s = SL.get((pr, int(np.log2(max(1.0, (ln + near[0]) / 2)))))
        if s is None:
            s = float(np.median(PSL[pr])) if pr in PSL else None
        if s is None:
            return np.nan, "none", abs(dist), near[2]
        return near[1] + s * dist, "extrap", abs(dist), near[2]

    for app in ("prizepicks", "underdog"):
        df = pd.read_sql("""SELECT season, game_date::text gd, player_id, prop, side, line::float8 line, kind, tier, m::float8 m, hit::int hit, ph::float8 ph
                            FROM nba_score._lr_legs_h WHERE app = %s AND hit IS NOT NULL AND m > 0""" + (" AND kind = 'standard'" if app == "prizepicks" else ""), conn, params=(app,))
        df["over"] = df["side"].str.lower().str[0].isin(["o", "m", "h"])
        res = [book_at(g, p, pr, ln) for g, p, pr, ln in zip(df["gd"], df["player_id"], df["prop"], df["line"])]
        df["lo"] = [r[0] for r in res]; df["how"] = [r[1] for r in res]; df["dist"] = [r[2] for r in res]; df["bk"] = [r[3] for r in res]
        po = 1 / (1 + np.exp(-df["lo"])); df["pb"] = np.where(df["over"], po, 1 - po)
        df["mm"] = df["m"] / BASE if app == "prizepicks" else df["m"]; df["r"] = df["hit"] * df["mm"] - 1; df["br"] = df["pb"] * df["mm"] - 1
        print(f"\nOE|================ {app.upper()} : {len(df):,} graded legs ================", flush=True)
        for s, g in df.groupby("season"):
            print(f"OE|  coverage {s}: " + ", ".join(f"{k} {100 * v:.1f}%" for k, v in g["how"].value_counts(normalize=True).items()) + f" | all-leg return {100 * g['r'].mean():+.1f}%", flush=True)
        d = df[df["pb"].notna()].copy(); nsl = d.groupby("season")["gd"].nunique().to_dict()
        print("OE|=== calibration by method: book chance band -> real hit rate ===")
        bands = [0, .30, .40, .45, .48, .52, .55, .58, .62, .70, 1.01]
        for how in ("exact", "interp", "extrap"):
            for s, g in d[d["how"] == how].groupby("season"):
                cells = []
                for lo_, hi_ in zip(bands[:-1], bands[1:]):
                    x = g[(g["pb"] >= lo_) & (g["pb"] < hi_)]
                    if len(x) >= 60:
                        cells.append(f"{lo_:.2f}-{hi_:.2f}: book {x['pb'].mean():.3f} real {x['hit'].mean():.3f} (n {len(x):,})")
                print(f"OE|  {how:7s} {s} " + " | ".join(cells), flush=True)
        if app == "prizepicks":
            print("OE|=== PrizePicks regular lines: legs with book chance >= x (break-even 0.542 Flex 5/6, 0.550 3-pick Power, 0.577 2-pick Power) ===")
            for th in (.54, .56, .58, .60, .63):
                for s in sorted(d["season"].unique()):
                    for lab, x in (("all methods", d[(d["season"] == s) & (d["pb"] >= th)]), ("off-market only (interp + extrap)", d[(d["season"] == s) & (d["pb"] >= th) & (d["how"] != "exact")]),
                                   (">= 2 books", d[(d["season"] == s) & (d["pb"] >= th) & (d["bk"] >= 2)])):
                        if len(x) >= 20:
                            lo_, hi_ = boot(x["r"].values, x["gd"].values)
                            sd = x.groupby("side")["hit"].agg(["mean", "size"]).round(3).to_dict("index")
                            print(f"OE|  book >= {th:.2f} {s} {lab:34s} legs {len(x):6,} ({len(x) / nsl[s]:5.1f} a slate) book {x['pb'].mean():.3f} hit {x['hit'].mean():.3f} (+- {x['hit'].std() / np.sqrt(len(x)):.3f}) "
                                  f"return at 0.542 {100 * x['r'].mean():+.1f}% [{100 * lo_:+.1f}% .. {100 * hi_:+.1f}%] | {sd}", flush=True)
            print("OE|=== the same by prop (book >= 0.56, all seasons together and this season) ===")
            x = d[d["pb"] >= .56]
            for pr, g in x.groupby("prop"):
                t = g[g["season"] == "2026-27"]
                print(f"OE|  {pr:12s} legs {len(g):6,} book {g['pb'].mean():.3f} hit {g['hit'].mean():.3f} | this season legs {len(t):5,} hit {t['hit'].mean() if len(t) else float('nan'):.3f}", flush=True)
            print("OE|=== does the honest model add anything on these legs? (book >= 0.56: hit by model agreement) ===")
            x = d[(d["pb"] >= .56) & d["ph"].notna()]
            for lab, g in (("model also >= 0.56", x[x["ph"] >= .56]), ("model 0.50-0.56", x[(x["ph"] >= .5) & (x["ph"] < .56)]), ("model < 0.50", x[x["ph"] < .5])):
                if len(g):
                    print(f"OE|  {lab:20s} legs {len(g):6,} book {g['pb'].mean():.3f} hit {g['hit'].mean():.3f} (+- {g['hit'].std() / np.sqrt(len(g)):.3f})", flush=True)
        else:
            print("OE|=== Underdog: legs with book-implied return (book chance x real multiplier - 1) > x ===")
            for th in (0.0, .03, .06, .10):
                for s in sorted(d["season"].unique()):
                    for lab, x in (("all", d[(d["season"] == s) & (d["br"] > th)]), ("off-market only", d[(d["season"] == s) & (d["br"] > th) & (d["how"] != "exact")]),
                                   (">= 2 books", d[(d["season"] == s) & (d["br"] > th) & (d["bk"] >= 2)]), ("tier R", d[(d["season"] == s) & (d["br"] > th) & (d["kind"] == "R")])):
                        if len(x) >= 20:
                            lo_, hi_ = boot(x["r"].values, x["gd"].values)
                            print(f"OE|  > {100 * th:+3.0f}% {s} {lab:16s} legs {len(x):6,} ({len(x) / nsl[s]:5.1f} a slate) book {x['pb'].mean():.3f} hit {x['hit'].mean():.3f} predicted {100 * x['br'].mean():+.1f}% "
                                  f"real {100 * x['r'].mean():+.1f}% [{100 * lo_:+.1f}% .. {100 * hi_:+.1f}%] | kinds {x['kind'].value_counts().to_dict()}", flush=True)
    conn.close()
    print("OE|DONE", flush=True)


if __name__ == "__main__":
    main()
