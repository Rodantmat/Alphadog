#!/usr/bin/env python3
"""
ANYTHING ELSE THAT HOLDS? (owner 2026-11-23 23:19 PT: "NO thing better? Nothing new?"). READ-ONLY battery of every pre-game leg feature the system has,
as a LEG filter (the slip takes the next legs of its own list) and as a SLIP skip, on the live sets as they now run (PrizePicks / Sleeper / Fliff with the
spread-8 skip, Underdog without), three seasons, universe loader (certified grading, real prices; Sleeper / Fliff = their main-ranking Max families).
Ideas from the public work (Cloudbet, Darimarket, PickFinder, Propline, BetBank, Fourth & Value): minutes and role first - a teammate out lifts minutes
(Unders suffer), minute trends, questionable tags / minute limits, line vs the books, the game total / pace, back-to-backs (Fourth & Value: no edge in totals),
plus the system's own: trailing hit rates (player, player-prop, slate), hot / cold form, games played, the books' count, home / away, edge over the books.
Features: min_out opp_out own_status mn_trend proj_min hot avs_z avs_d av5_d bline_d oline_d books gp rest home lean tr_pl10 tr_plall10 tr_slate7
tr_slate21 pb (book chance) edge (main ranking - book) tot (game total) asp (|spread|).
Rules: leg out when f >= its 80th / 90th percentile or <= its 10th / 20th (percentiles of the 2024-25 + 2025-26 regular Unders); slip skipped when its legs'
mean f is in the same tails of the as-built slips' means (2024-25 + 2025-26).
HONEST SELECTION: a rule is a CANDIDATE only if it beats as-built in BOTH 2024-25 and 2025-26 AND beats a RANDOM drop of the same share of legs / slips
(mean of 200 random draws) in both; the CONFIRMATION is 2026-27, never used to choose. Printed: every candidate with its 2026-27 result.
Env: DATABASE_URL, UA_APP.
"""
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_universe as U                                     # noqa: E402
from research_spread_refine import market, SETS, pay              # noqa: E402

APP = U.APP
SKIP8 = APP in ("prizepicks", "sleeper", "fliff")
FEATS = ["min_out", "opp_out", "own_status", "mn_trend", "proj_min", "hot", "avs_z", "avs_d", "av5_d", "bline_d", "oline_d", "books", "gp", "rest", "home",
         "lean", "tr_pl10", "tr_plall10", "tr_slate7", "tr_slate21", "pb", "edge", "tot", "asp"]
TRAIN = ("2024-25", "2025-26"); TEST = "2026-27"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = U.load(conn)
    L = U.layers(d)
    mk = market(conn)
    mm = mk.reindex(pd.MultiIndex.from_arrays([d["gd"].values, d["player_id"].values]))
    d["tot"] = mm["tot"].values; d["asp"] = np.abs(mm["tsp"].values)
    d["edge"] = d["blend"] - d["pb"]
    for c in FEATS:
        d[c] = pd.to_numeric(d[c], errors="coerce")
    reg = d["easy"].values == 0; und = d["under"].values
    tr = np.isin(d["season"].values, TRAIN) & reg & und
    q = {c: np.nanpercentile(d.loc[tr, c].values, [10, 20, 80, 90]) if np.isfinite(d.loc[tr, c].values).sum() > 1000 else None for c in FEATS}
    feats = [c for c in FEATS if q[c] is not None and q[c][0] < q[c][3]]
    print(f"SB|{APP}: legs {len(d):,} | features usable {len(feats)}: {', '.join(feats)} | spread-8 skip in base: {SKIP8}", flush=True)
    masks = {}
    for code, rkr, filt, gcap, st, k, role in SETS:
        m = reg & und & np.isfinite(d[rkr].values.astype(float))
        for f in filt:
            m &= L[f]
        masks[code] = m
    A = {c: d[c].values for c in feats}
    rnd = d["rnd0"].values
    legrules = [("as built", None)]
    for c in feats:
        p10, p20, p80, p90 = q[c]
        legrules += [(f"leg {c} >= p80", (c, ">=", p80)), (f"leg {c} >= p90", (c, ">=", p90)), (f"leg {c} <= p20", (c, "<=", p20)), (f"leg {c} <= p10", (c, "<=", p10))]
    legrules += [(f"leg RANDOM {int(f * 100)}%", ("rnd", f)) for f in (0.1, 0.2)]
    by_gd = d.groupby("gd").indices
    pid = d["player_id"].values; gid = d["gid"].values; w = d["w"].values; lf = d["logf"].values; asp_ = d["asp"].values
    res = defaultdict(lambda: defaultdict(list))
    slipfe = defaultdict(list)     # season -> [(u, {feat: mean})] for the as-built slips (slip-skip rules)
    share = defaultdict(lambda: [0, 0])
    for gd in sorted(by_gd):
        ix = by_gd[gd]; old = gd < "2026-07-01"; season = d["season"].values[ix[0]]
        for name, rule in legrules:
            for code, rkr, filt, gcap, st, k, role in SETS:
                j = ix[masks[code][ix]]
                if rule:
                    if rule[0] == "rnd":
                        keep = ~(rnd[j] < rule[1])
                    else:
                        v = A[rule[0]][j]
                        keep = ~((v >= rule[2]) if rule[1] == ">=" else (v <= rule[2]))
                        keep |= ~np.isfinite(v)
                    if name.startswith("leg") and not name.startswith("leg RANDOM"):
                        share[name][0] += int((~keep).sum()); share[name][1] += len(keep)
                    j = j[keep]
                j = j[np.argsort(-d[rkr].values[j].astype(float), kind="mergesort")]
                sel = []; up = set(); ug = defaultdict(int)
                for i in j:
                    if pid[i] in up or ug[gid[i]] >= gcap:
                        continue
                    sel.append(i); up.add(pid[i]); ug[gid[i]] += 1
                    if len(sel) == k:
                        break
                if len(sel) < k:
                    continue
                s = np.array(sel)
                if SKIP8 and np.isfinite(asp_[s]).any() and np.nanmean(asp_[s]) > 8:
                    continue
                v = pay(st, k, int(w[s].sum()), float(lf[s].sum()), float(lf[s][w[s] == 1].sum()), old)
                if v is None:
                    continue
                res[name][season].append(v - 1)
                if name == "as built":
                    slipfe[season].append((v - 1, {c: (np.nanmean(A[c][s]) if np.isfinite(A[c][s]).any() else np.nan) for c in feats}))
    base = {s: np.array(res["as built"][s]) for s in U.SEAS}
    rmean = {s: np.mean([np.mean(res[f"leg RANDOM {p}%"][s]) for p in (10, 20)]) for s in U.SEAS}
    print("SB|  as built: " + " | ".join(f"{s}: {100 * base[s].mean():+.1f}% ({len(base[s])}, {base[s].sum():+.1f} u)" for s in U.SEAS), flush=True)
    print("SB|  random leg drop 10 / 20%: " + " | ".join(f"{s}: {100 * np.mean(res['leg RANDOM 10%'][s]):+.1f}% / {100 * np.mean(res['leg RANDOM 20%'][s]):+.1f}%" for s in U.SEAS), flush=True)
    rows = []
    for name, rule in legrules[1:]:
        if name.startswith("leg RANDOM"):
            continue
        r = {s: np.array(res[name][s]) for s in U.SEAS}
        if any(not len(r[s]) for s in U.SEAS):
            continue
        cand = all(r[s].mean() > base[s].mean() and r[s].mean() > rmean[s] for s in TRAIN)
        rows.append((name, cand, r, share[name][0] / max(1, share[name][1])))
    # slip-skip rules (on the as-built slips; random-skip yardstick = 200 draws of the same count)
    rng = np.random.default_rng(23)
    trm = {c: np.array([fe[c] for s in TRAIN for u, fe in slipfe[s]]) for c in feats}
    srows = []
    for c in feats:
        qq = np.nanpercentile(trm[c], [10, 20, 80, 90]) if np.isfinite(trm[c]).sum() > 50 else None
        if qq is None:
            continue
        for lab, op, t in ((">= p80", ">=", qq[2]), (">= p90", ">=", qq[3]), ("<= p20", "<=", qq[1]), ("<= p10", "<=", qq[0])):
            r = {}; rr = {}; ok = True
            for s in U.SEAS:
                us = np.array([u for u, fe in slipfe[s]]); fv = np.array([fe[c] for u, fe in slipfe[s]])
                drop = (fv >= t) if op == ">=" else (fv <= t)
                drop &= np.isfinite(fv)
                kept = us[~drop]
                if not len(kept) or not len(us):
                    ok = False; break
                r[s] = kept
                rr[s] = float((np.array([us[rng.choice(len(us), len(kept), replace=False)].mean() for _ in range(200)]) >= kept.mean()).mean())
            if not ok:
                continue
            cand = all(r[s].mean() > base[s].mean() and rr[s] < 0.5 for s in TRAIN)
            srows.append((f"skip slip mean {c} {lab}", cand, r, rr))
    print("SB|  ---- CANDIDATES (better than as-built AND than random in 2024-25 and 2025-26) and their 2026-27 CONFIRMATION ----", flush=True)
    for name, cand, r, sh in rows:
        if cand:
            conf = r[TEST].mean() > base[TEST].mean() and r[TEST].mean() > rmean[TEST]
            print(f"SB|  {name:30s} legs out {100 * sh:4.1f}% | " + " | ".join(f"{s}: {100 * r[s].mean():+.1f}% ({len(r[s])}, {r[s].sum():+.1f} u)" for s in U.SEAS)
                  + f"  -> 2026-27 {'CONFIRMS' if conf else 'fails'}", flush=True)
    for name, cand, r, rr in srows:
        if cand:
            conf = r[TEST].mean() > base[TEST].mean() and rr[TEST] < 0.5
            print(f"SB|  {name:30s} | " + " | ".join(f"{s}: {100 * r[s].mean():+.1f}% ({len(r[s])}, {r[s].sum():+.1f} u, luck {rr[s]:.2f})" for s in U.SEAS)
                  + f"  -> 2026-27 {'CONFIRMS' if conf else 'fails'}", flush=True)
    nc = sum(c for _, c, _, _ in rows) + sum(c for _, c, _, _ in srows)
    print(f"SB|  rules tried: {len(rows)} leg + {len(srows)} slip | candidates {nc}", flush=True)
    print("SB|DONE", flush=True)


if __name__ == "__main__":
    main()
