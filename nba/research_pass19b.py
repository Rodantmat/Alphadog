#!/usr/bin/env python3
"""
PASS 19b - THE ONE PASS-19 LEAD ON UNDERDOG, PRESSED HARDER. READ-ONLY. (NBA_HONEST_REBUILD.md 8ai)
Lead: rank by the model (or the average), keep only legs whose player finished under this line in 60%+ of his last 8-10 games; 3-/4-pick slips.
Checks: hit rate of the legs actually used vs the same slip without the layer; odd days / even days; each season cut in two halves (6 blocks);
share of slips that pay; how much of the profit the 5 best slips carry.
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass16 as R
import research_pass18 as P18


def main():
    d = P18.load(); d = d[d["app"] == "underdog"].copy(); d["avg"] = (d["blend"] + d["ph"]) / 2
    L = {"no layer": None, "last-8 60%+": ("w8", .6), "last-10 60%+": ("w10", .6), "last-10 50%+": ("w10", .5), "last-10 70%+": ("w10", .7), "last-12ish (8 and 10 both 60%+)": "both"}
    for rn, col in (("model", "ph"), ("average", "avg"), ("blend", "blend")):
        for pn, pm in (("every single stat", np.ones(len(d), bool)), ("no assists", (d["prop"] != "assists").values)):
            x = d[pm]
            for ln, spec in L.items():
                xx = x if spec is None else (x[(x["w8"] >= .6) & (x["w10"] >= .6)] if spec == "both" else x[x[spec[0]] >= spec[1]])
                for (st, k) in (("P", 3), ("F", 3), ("P", 4), ("F", 4), ("F", 5)):
                    rows = []; legs = []
                    for gd, g in xx.groupby("gd", sort=True):
                        g = g.sort_values(col, ascending=False); ix = R.take_idx(g["player_id"].values, g["game_id"].values, g["prop"].values, k)
                        if ix is None:
                            continue
                        h = g["hit"].values[ix]; legs.extend(h); rows.append((gd, g["season"].iloc[0], R.UD[(st, k)].get(int(h.sum()), 0.0) - 1))
                    t = pd.DataFrame(rows, columns=["gd", "s", "u"]).reset_index(drop=True)
                    if not len(t):
                        continue
                    odd = t[t.index % 2 == 1]["u"]; even = t[t.index % 2 == 0]["u"]; blocks = []
                    for s in R.SEAS:
                        ts = t[t["s"] == s]; h = len(ts) // 2
                        blocks += [ts["u"].iloc[:h].sum(), ts["u"].iloc[h:].sum()]
                    top5 = t["u"].nlargest(5).sum()
                    print(f"P19b|{rn:7s} | {pn:17s} | {ln:32s} | {k}{'F' if st == 'F' else 'S'}: {100 * t['u'].mean():+4.0f}% ({t['u'].sum():+6.1f} u, {len(t)}) | legs hit {100 * np.mean(legs):.1f}% | odd {100 * odd.mean():+.0f}% even {100 * even.mean():+.0f}% | "
                          f"half-seasons up {sum(b > 0 for b in blocks)} of 6 [{' '.join(f'{b:+.0f}' for b in blocks)}] | slips paid {100 * (t['u'] > -1).mean():.0f}% | without the 5 best {t['u'].sum() - top5:+.1f} u", flush=True)
    print("P19b|DONE", flush=True)


if __name__ == "__main__":
    main()
