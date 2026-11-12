#!/usr/bin/env python3
"""
THREE-APP STUDY - Sleeper / Fliff / Betr (owner 2026-11-12 00:03 PT: "backtest for these season full spectrum for fliff, betr and sleeper, see if there is any other possible hidden
strategy that is worth it ... strategy per strategy like you presented pp and ud, also adding the new candidates ... strong approach on this season").
READ-ONLY. TS_APP = sleeper | fliff | betr (apps never mixed). Built on research_roi_final_candidates / research_roi_slip_sweep_apps (same boards, same ROI-aware score, same payout laws):
  PART 1  every deployed ROI-rule strategy + the new candidates, strategy by strategy: 2024-25, 2025-26 (modelled boards for Sleeper / Fliff), 2026-27 (REAL boards, graded slates before
          today): slips, /day, win%, ROI, profit, max drawdown, longest underwater, losing streak, worst day, profit days.
  PART 2  HIDDEN-STRATEGY SEARCH over the whole spectrum: rank key x line kind x ROI filter x side x props x pool N (3..30) x structure (Sleeper Max/Flex 2-6, Fliff product 2-6,
          Betr Perfect/Dynamic 2-6), judged with the REAL season first (>= 20 real slips) and both history seasons (>= 100 each); a random-order control; bootstrap CI (2000 resamples
          of the real slates) on the shortlist; full per-strategy tables for the best of each structure.
"""
import itertools
import os
import sys

APP = (os.environ.get("TS_APP") or "sleeper").lower()
os.environ["FC_APP"] = APP
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd, psycopg, collections        # noqa: E402,E401
import research_roi_final_candidates as RF                    # noqa: E402
M, AF, REAL, log = RF.M, RF.AF, RF.REAL, RF.log

# (label, key, kinds, roi_f, side, props, N, k, mode)
EXTRA = {
    "sleeper": [
        ("DEPLOYED S_C_5flex_U20  5-pick Flex, top20, Under, today's score, main", "score_cert", "main", "none", "under", "all", 20, 5, "flex"),
        ("DEPLOYED S_B_5flex_R5   5-pick Flex, top15, new score, all lines, ROI>5%", "score_roi", "all", "5pct", "both", "all", 15, 5, "flex"),
        ("DEPLOYED S_F_3flex_R10  3-pick Flex, top10, new score, main", "score_roi", "main", "none", "both", "all", 10, 3, "flex"),
        ("DEPLOYED S_D_6flex_U30  6-pick Flex, top30, Under, hit prob, main", "hp", "main", "none", "under", "all", 30, 6, "flex"),
        ("NEW 2-pick Max, top5, new score, main", "score_roi", "main", "none", "both", "all", 5, 2, "max"),
        ("NEW 3-pick Flex, top10, hit prob, main", "hp", "main", "none", "both", "all", 10, 3, "flex"),
        ("NEW 4-pick Flex, top15, new score, main, ROI>0", "score_roi", "main", "pos", "both", "all", 15, 4, "flex"),
        ("NEW 4-pick Flex, top10, Under, today's score, main", "score_cert", "main", "none", "under", "all", 10, 4, "flex"),
        ("NEW 5-pick Flex, top15, new score, main, no defensive props", "score_roi", "main", "none", "both", "nodef", 15, 5, "flex"),
        ("NEW 6-pick Flex, top15, new score, all lines", "score_roi", "all", "none", "both", "all", 15, 6, "flex"),
        ("NEW 6-pick Flex, top30, new score, main, ROI>0", "score_roi", "main", "pos", "both", "all", 30, 6, "flex"),
        ("NEW 3-pick Max, top10, hit prob, main", "hp", "main", "none", "both", "all", 10, 3, "max"),
    ],
    "fliff": [
        ("DEPLOYED F_A_5max_R15  5-pick, top15, new score, main", "score_roi", "main", "none", "both", "all", 15, 5, "max"),
        ("DEPLOYED F_C_5max_U20  5-pick, top20, Under, today's score, main", "score_cert", "main", "none", "under", "all", 20, 5, "max"),
        ("DEPLOYED F_E_3max_P10  3-pick, top10, hit prob, main", "hp", "main", "none", "both", "all", 10, 3, "max"),
        ("NEW 2-pick, top5, hit prob, main", "hp", "main", "none", "both", "all", 5, 2, "max"),
        ("NEW 2-pick, top10, Under, today's score, main", "score_cert", "main", "none", "under", "all", 10, 2, "max"),
        ("NEW 3-pick, top10, new score, main", "score_roi", "main", "none", "both", "all", 10, 3, "max"),
        ("NEW 3-pick, top10, Under, hit prob, main", "hp", "main", "none", "under", "all", 10, 3, "max"),
        ("NEW 4-pick, top15, new score, main, ROI>0", "score_roi", "main", "pos", "both", "all", 15, 4, "max"),
        ("NEW 4-pick, top20, Under, today's score, main", "score_cert", "main", "none", "under", "all", 20, 4, "max"),
        ("NEW 6-pick, top20, Under, hit prob, main", "hp", "main", "none", "under", "all", 20, 6, "max"),
    ],
    "betr": [
        ("DEPLOYED B_ROI_4dyn   4-pick Dynamic, top5, new score (any side)", "score_roi", "all", "none", "both", "all", 5, 4, "dynamic"),
        ("NEW 3-pick Dynamic, top5, new score", "score_roi", "all", "none", "both", "all", 5, 3, "dynamic"),
        ("NEW 4-pick Dynamic, top10, today's score", "score_cert", "all", "none", "both", "all", 10, 4, "dynamic"),
        ("NEW 5-pick Dynamic, top10, new score", "score_roi", "all", "none", "both", "all", 10, 5, "dynamic"),
        ("NEW 6-pick Dynamic, top15, hit prob", "hp", "all", "none", "both", "all", 15, 6, "dynamic"),
        ("NEW 2-pick Perfect, top3, new score", "score_roi", "all", "none", "both", "all", 3, 2, "perfect"),
        ("NEW 4-pick Perfect, top10, hit prob", "hp", "all", "none", "both", "all", 10, 4, "perfect"),
    ],
}[APP]


def build_days(conn):
    days = {}
    if APP == "betr":
        import json
        RF.patch_betr()
        M.BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
        M.BR = M.BR if isinstance(M.BR, dict) else json.loads(M.BR)
        raw = M.build_betr(conn)
    else:
        M.PR = M.SL.pricing(conn)
        raw = M.build_sleeper_fliff(conn)
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    T = M.pp_tables(conn)
    for s in [x for x in ("2024-25", "2025-26", REAL) if raw.get(x)]:
        Ts = T[s] if s in T else T["all"]
        M.FIT = M.fit_from(raw, [x for x in raw if x != s and raw[x]]) if APP in ("sleeper", "fliff") else None
        dd = []
        for d, legs in raw[s]:
            df = M.score_day(legs, Ts)
            if len(df):
                df = df.copy(); df["rand"] = np.random.RandomState(d.toordinal()).rand(len(df)); dd.append((d, df))
        days[s] = dd
    conn.close()
    return days


def part1(days):
    hdr = "season  slips  /day  win%   ROI%  profit(u)  maxDD(u)  underwater(slates)  loseStreak(slates)  worstDay(u)  profitDays%"
    log("\n########## PART 1 - STRATEGY BY STRATEGY (deployed + new candidates) ##########")
    for c in EXTRA + [x for x in RF.CANDS if x[0] not in {e[0] for e in EXTRA}]:
        log(f"\n=== {c[0]}")
        log("  " + hdr)
        pooled = collections.OrderedDict()
        for s in days:
            per = RF.one(days[s], c)
            m = RF.metrics(per, len(days[s]))
            if s != REAL:
                for d, v in per.items():
                    pooled[(s, d)] = v
            if not m:
                log(f"  {s}   no slips"); continue
            tag = "REAL board" if s == REAL else "modelled board" if APP != "betr" else "betr history"
            log(f"  {s}  {m['n']:5d}  {m['per_day']:4.2f}  {100*m['win']:4.1f}  {100*m['roi']:+6.1f}  {m['profit']:+9.1f}  {m['dd']:8.1f}  {m['under']:17d}  {m['streak']:17d}  {m['worst']:+10.1f}  {100*m['posdays']:6.1f}   [{tag}, {m['days']} slates]")
        allp = collections.OrderedDict()
        for s in days:
            for d, v in RF.one(days[s], c).items():
                allp[(s, d)] = v
        ma = RF.metrics(allp, sum(len(days[s]) for s in days))
        if ma:
            log(f"  ALL 3 seasons   {ma['n']:5d}  {ma['per_day']:4.2f}  {100*ma['win']:4.1f}  {100*ma['roi']:+6.1f}  {ma['profit']:+9.1f}  {ma['dd']:8.1f}  {ma['under']:17d}  {ma['streak']:17d}  {ma['worst']:+10.1f}  {100*ma['posdays']:6.1f}")


def part2(days):
    log("\n########## PART 2 - HIDDEN-STRATEGY SEARCH (whole spectrum) ##########")
    seasons = list(days)
    modes = ("perfect", "dynamic") if APP == "betr" else (("max", "flex") if APP == "sleeper" else ("max",))
    Ns = [3, 5, 10, 15, 20, 30]
    structs = [(N, k, m) for N in Ns for k in range(2, 7) for m in modes if k <= N and not (m == "flex" and k < 3)]
    combos = list(itertools.product(M.KEYS, M.KINDS, M.ROIMIN, M.SIDES, M.PROPS))
    res = []
    for s in seasons:
        for ci, (key, kinds, roimin, side, nodef) in enumerate(combos):
            dt_ = [(d, M.tops(g, key, kinds, roimin, side, nodef)) for d, g in days[s]]
            for N, k, m in structs:
                st = M.stats(M.run(dt_, N, k, m), len(dt_))
                if st:
                    res.append(dict(season=s, key=key, kinds=kinds, roi_f=roimin, side=side, props=nodef, N=N, k=k, mode=m, **st))
        log(f"  grid {s}: {len(res)} rows")
    R = pd.DataFrame(res)
    idx = ["key", "kinds", "roi_f", "side", "props", "N", "k", "mode"]
    Mx = None
    for s in seasons:
        x = R[R.season == s].drop(columns="season").rename(columns={c: f"{c}_{s[-2:]}" for c in ["n", "per_day", "roi", "win", "dd"]})
        Mx = x if Mx is None else Mx.merge(x, on=idx, how="outer")
    r_ = REAL[-2:]; h_ = [s[-2:] for s in seasons if s != REAL]
    n_all = len(Mx)
    Mx = Mx[Mx[f"n_{r_}"].fillna(0) >= 20].copy()
    for h in h_:
        Mx = Mx[Mx[f"n_{h}"].fillna(0) >= 100]
    Mx["worst"] = Mx[[f"roi_{r_}"] + [f"roi_{h}" for h in h_]].min(axis=1)
    log(f"  configs {n_all}; with >= 20 real slips and >= 100 per history season: {len(Mx)}")
    ctl = Mx[Mx.key == "rand"]; real = Mx[Mx.key != "rand"]
    for nm, g in (("random control", ctl), ("real keys", real)):
        if len(g):
            log(f"  {nm}: configs={len(g)} positive on every season={(g.worst > 0).mean():.3f} mean ROI real {g[f'roi_{r_}'].mean():+.3f} hist " + " ".join(f"{h}={g[f'roi_{h}'].mean():+.3f}" for h in h_))
    pd.set_option("display.width", 300); pd.set_option("display.max_rows", 600); pd.set_option("display.max_columns", 60)
    cols = idx + [f"{a}_{s[-2:]}" for s in seasons[::-1] for a in ("n", "win", "roi")] + [f"dd_{r_}", f"per_day_{r_}"]
    log("\n-- top 40 by the WORST season ROI (real season first)")
    log(real.sort_values("worst", ascending=False).head(40)[cols].round(3).to_string(index=False))
    log("\n-- top 25 by REAL-season ROI among configs positive in both history seasons (>= 30 real slips)")
    g2 = real[(real[f"n_{r_}"] >= 30) & (real[[f"roi_{h}" for h in h_]].min(axis=1) > 0)]
    log(g2.sort_values(f"roi_{r_}", ascending=False).head(25)[cols].round(3).to_string(index=False))
    log("\n-- best 2 per structure (by worst season ROI)")
    for (k, m), g in real.groupby(["k", "mode"]):
        log(f"   {k}-pick {m}:")
        log(g.sort_values("worst", ascending=False).head(2)[cols].round(3).to_string(index=False, header=False))
    short = real.sort_values("worst", ascending=False).head(12)
    log("\n-- bootstrap of the shortlist on the REAL season (resample slates, 2000x)")
    rng = np.random.RandomState(3)
    for _, r in short.iterrows():
        dt_ = [(d, M.tops(g, r.key, r.kinds, r.roi_f, r.side, r.props)) for d, g in days[REAL]]
        rows = M.run(dt_, int(r.N), int(r.k), r["mode"]); ds = sorted({d for d, _ in dt_}); td = collections.defaultdict(float); nd = collections.defaultdict(int)
        for d, rr, w in rows:
            td[d] += rr; nd[d] += 1
        tot = np.array([td.get(d, 0.0) for d in ds]); nn = np.array([nd.get(d, 0) for d in ds]); samp = rng.randint(0, len(ds), (2000, len(ds)))
        roi = tot[samp].sum(1) / np.maximum(nn[samp].sum(1), 1)
        log(f"  {r.key}|{r.kinds}|{r.roi_f}|{r.side}|{r.props}|N{int(r.N)}|{int(r.k)}-{r['mode']}  real ROI {tot.sum()/max(nn.sum(), 1):+.3f} CI90[{np.percentile(roi, 5):+.3f},{np.percentile(roi, 95):+.3f}] P>0={(roi > 0).mean():.2f}")
    hdr = "season  slips  /day  win%   ROI%  profit(u)  maxDD(u)  underwater(slates)  loseStreak(slates)  worstDay(u)  profitDays%"
    log("\n-- full per-strategy tables for the 8 best 'hidden' candidates")
    for _, r in short.head(8).iterrows():
        c = (f"HIDDEN {r.key}|{r.kinds}|{r.roi_f}|{r.side}|{r.props}|top{int(r.N)}|{int(r.k)}-{r['mode']}", r.key, r.kinds, r.roi_f, r.side, r.props, int(r.N), int(r.k), r["mode"])
        log(f"\n=== {c[0]}\n  {hdr}")
        for s in days:
            m = RF.one(days[s], c); mm = RF.metrics(m, len(days[s]))
            if mm:
                log(f"  {s}  {mm['n']:5d}  {mm['per_day']:4.2f}  {100*mm['win']:4.1f}  {100*mm['roi']:+6.1f}  {mm['profit']:+9.1f}  {mm['dd']:8.1f}  {mm['under']:17d}  {mm['streak']:17d}  {mm['worst']:+10.1f}  {100*mm['posdays']:6.1f}")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    days = build_days(conn)
    log(f"{APP}: slates per season " + ", ".join(f"{s} {len(v)}" for s, v in days.items()))
    part1(days)
    part2(days)
    log("done")


if __name__ == "__main__":
    main()
