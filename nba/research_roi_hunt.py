#!/usr/bin/env python3
"""
POSITIVE-ROI HUNT - SMALL GROUPS, EVERY LEG (owner 2026-11-22 09:30 PT: "find the small groups that do provide ROI positive ... you are grouping
too much"). READ-ONLY.

Every graded leg with a price (real m, or the mechanism's m_mech for PrizePicks goblin / demon legs) is cut into small groups by up to 4
features beyond app x side: prop, kind, line band, multiplier band, hit-rate band, edge band (hit rate - break-even), model-vs-books band,
market read yes/no, score band, confidence band, part of the season, weekday. A group FOUND on the discovery dates is then checked on dates
it never saw:
  split A: within each season, first 60% of dates -> last 40%;
  split B: 2024-25 + 2025-26 -> 2026-27 (apps present in both).
ROI per leg is shown two ways: as a 2-pick leg (m = sqrt(3) x factor, what the leg card stores) and at the best PrizePicks / Underdog structure
(6-pick Power 37.5x = 1.830 per leg instead of 1.732; Sleeper / Fliff are priced per leg already).
Env: DATABASE_URL, RH_MIN (minimum legs in a discovery group, 60).
"""
import itertools
import os

import numpy as np
import pandas as pd
import psycopg

BEST = 37.5 ** (1 / 6) / 3 ** 0.5     # 6-pick Power per-leg value over the 2-pick one (1.0565)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = pd.read_sql("""SELECT season, game_date, app, prop, line::float8 line, side, coalesce(kind,'none') kind, hit_rate::float8 h, p_market::float8 pm,
                              score::float8 sc, confidence::float8 cf, result, v2::float8 v2, v_best::float8 vb,
                              coalesce(m, m_mech)::float8 m, (m IS NULL) mech
                       FROM nba_score.leg_card_v2 WHERE result IN ('won','lost') AND v_best IS NOT NULL""", conn)
    d["won"] = (d.result == "won").astype(float)
    d["best"] = d.vb / d.v2      # the leg's best Power size over its 2-pick value (leg_values: v2..v6, Underdog 3.5x base)
    d["r2"] = np.where(d.won == 1, d.v2 - 1, -1.0)
    d["r6"] = np.where(d.won == 1, d.vb - 1, -1.0)
    lg = lambda p: np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))  # noqa: E731
    d["mb"] = pd.qcut(d.m.rank(method="first"), 8, labels=False)
    d["mband"] = pd.cut(d.vb, [0, 1.3, 1.6, 1.75, 1.9, 2.2, 3, 5, 100]).astype(str)
    d["hband"] = pd.cut(d.h, [0, .15, .3, .4, .45, .5, .55, .6, .7, .8, 1]).astype(str)
    d["edge"] = pd.cut(d.h * d.vb - 1, [-1, -.3, -.15, -.08, -.04, 0, .04, .1, .25, 100]).astype(str)
    d["dz"] = pd.cut(np.where(d.pm.notna(), lg(d.h) - lg(d.pm.fillna(.5)), np.nan), [-9, -.3, -.1, -.03, .03, .1, .3, 9]).astype(str)
    d["mkt"] = d.pm.notna().map({True: "mkt", False: "nomkt"})
    d["sband"] = pd.qcut(d.sc.rank(method="first"), 5, labels=False).astype(str)
    d["cband"] = pd.qcut(d.cf.rank(method="first"), 5, labels=False).astype(str)
    d["lband"] = d.groupby("prop").line.transform(lambda s: pd.qcut(s.rank(method="first"), 4, labels=False)).astype(str)
    gd = pd.to_datetime(d.game_date)
    d["wd"] = gd.dt.dayofweek.astype(str)
    d["phase"] = d.groupby("season").game_date.transform(lambda s: pd.qcut(pd.to_datetime(s).rank(method="first"), 3, labels=["early", "mid", "late"])).astype(str)
    d["pos"] = d.groupby("season").game_date.transform(lambda s: pd.to_datetime(s).rank(pct=True))
    print(f"RH|graded priced legs {len(d):,} (real price {(~d.mech).sum():,}, mechanism price {d.mech.sum():,})", flush=True)
    F = ["prop", "kind", "lband", "mband", "hband", "edge", "dz", "mkt", "sband", "cband", "phase", "wd"]
    mn = int(os.environ.get("RH_MIN") or 60)
    for split in ("A", "B"):
        if split == "A":
            D = d[d.pos <= .6]; T = d[d.pos > .6]
            lab = "within each season: first 60% of dates -> last 40%"
        else:
            D = d[d.season.isin(["2024-25", "2025-26"])]; T = d[d.season == "2026-27"]
            lab = "2024-25 + 2025-26 -> 2026-27"
        rows = []
        for k in range(0, 4):
            for ex in itertools.combinations(F, k):
                keys = ["app", "side"] + list(ex)
                gD = D.groupby(keys, observed=True).agg(n=("r6", "size"), r6=("r6", "mean"), s6=("r6", "std"), r2=("r2", "mean"), hit=("won", "mean"), h=("h", "mean"))
                gD = gD[(gD.n >= mn) & (gD.r6 > 0)]
                if not len(gD):
                    continue
                gT = T.groupby(keys, observed=True).agg(nT=("r6", "size"), r6T=("r6", "mean"), r2T=("r2", "mean"), hitT=("won", "mean"), hT=("h", "mean"))
                j = gD.join(gT, how="left")
                j["t"] = j.r6 / (j.s6 / np.sqrt(j.n))
                j["key"] = [" | ".join(f"{a}={b}" for a, b in zip(keys, (i if isinstance(i, tuple) else (i,)))) for i in j.index]
                j["depth"] = len(keys)
                rows.append(j.reset_index(drop=True))
        R = pd.concat(rows, ignore_index=True)
        R = R.drop_duplicates("key")
        tested = R[R.nT.fillna(0) >= 30]
        print(f"RH|==== split {split} ({lab}) ====", flush=True)
        print(f"RH|  groups positive on discovery (>= {mn} legs): {len(R):,} | with >= 30 later legs: {len(tested):,} | positive later: "
              f"{(tested.r6T > 0).mean()*100:.1f}% | mean later ROI {100*tested.r6T.mean():+.1f}% (2-pick {100*tested.r2T.mean():+.1f}%)", flush=True)
        for lo in (2, 3, 4):
            s = tested[tested.t >= lo]
            if len(s):
                print(f"RH|  discovery t >= {lo}: {len(s):,} groups | positive later {100*(s.r6T > 0).mean():.1f}% | mean later ROI {100*s.r6T.mean():+.1f}% "
                      f"| legs later {int(s.nT.sum()):,}", flush=True)
        top = tested.sort_values("t", ascending=False).head(60)
        for r in top.itertuples():
            print(f"RH|  {r.key} | found {int(r.n)} legs ROI {100*r.r6:+.1f}% (2-pick {100*r.r2:+.1f}%) hit {100*r.hit:.0f} vs pred {100*r.h:.0f} t {r.t:.1f} "
                  f"|| later {int(r.nT)} legs ROI {100*r.r6T:+.1f}% (2-pick {100*r.r2T:+.1f}%) hit {100*r.hitT:.0f} vs pred {100*r.hT:.0f}", flush=True)
        both = tested[(tested.r6T > 0)].sort_values("nT", ascending=False).head(40)
        print(f"RH|  -- positive on discovery AND later, largest later samples --", flush=True)
        for r in both.itertuples():
            print(f"RH|  {r.key} | found {int(r.n)} ROI {100*r.r6:+.1f}% || later {int(r.nT)} ROI {100*r.r6T:+.1f}% hit {100*r.hitT:.0f} vs pred {100*r.hT:.0f}", flush=True)
    print("RH|DONE", flush=True)


if __name__ == "__main__":
    main()
