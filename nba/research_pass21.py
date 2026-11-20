#!/usr/bin/env python3
"""
PASS 21 - THE OTHER APP'S LINE AS A SIGNAL, IN SLIPS. READ-ONLY. (NBA_HONEST_REBUILD.md 8ai)
The honest cell scan (section 8f) kept one leg-level cell that no live strategy uses: an Underdog Under whose line sits ABOVE PrizePicks' line for the same player and stat.
Here it becomes slips: the gap (own line - the other app's regular line) as a LAYER on the live rankers and as a RANKER, on both apps, every structure, against no layer.
Layers: gap +0.5 or more | +1 or more | +1.5 or more | same line | own line lower | the other app does not list him.  Rankers: blend, average, gap then blend, gap share of the line.
Judged the pass-19 way (hit rate of the legs used; every structure; seasons positive).  Line format: structure pooled-return%(seasons positive of 3).
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass16 as R
import research_pass18 as P18
import research_pass19 as P19


def main():
    d = P18.load(); d["avg"] = (d["blend"] + d["ph"]) / 2
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    o = pd.read_sql("""SELECT app, game_date::text gd, player_id, prop, line::float8 line FROM nba_score.v_legs_honest
                       WHERE app IN ('underdog', 'prizepicks') AND kind = 'regular' AND is_under AND prop = ANY(%s)""", conn, params=(list(R.SINGLE),))
    conn.close()
    o = o.groupby(["app", "gd", "player_id", "prop"])["line"].median().reset_index()      # the app's regular line (one per player-prop; median if it lists several)
    o["app"] = o["app"].map({"underdog": "prizepicks", "prizepicks": "underdog"}); o = o.rename(columns={"line": "oline"})
    d = d.merge(o, on=["app", "gd", "player_id", "prop"], how="left"); d["gap"] = d["line"] - d["oline"]; d["gshare"] = d["gap"] / d["line"].clip(lower=1)
    L = {"none": None}
    for lab, m in (("own line +0.5 or more above", d["gap"] >= .5), ("own line +1 or more above", d["gap"] >= 1), ("own line +1.5 or more above", d["gap"] >= 1.5), ("same line", d["gap"] == 0),
                   ("own line lower", d["gap"] <= -.5), ("other app lists him (any gap)", d["gap"].notna()), ("other app does not list him", d["gap"].isna())):
        d[f"G_{lab}"] = m.fillna(False).values; L[lab] = f"G_{lab}"
    d["gap_blend"] = d["gap"].fillna(-9) * 10 + d["blend"]
    for app in ("underdog", "prizepicks"):
        a = d[d["app"] == app]
        print(f"P21|{app}: legs {len(a):,}; other app lists the player-prop on {100 * a['gap'].notna().mean():.0f}%; leg hit rate by gap: " + " | ".join(
            f"{lab}: {100 * a[m]['hit'].mean():.1f}% ({int(m.sum()):,})" for lab, m in (("-1 or lower", a["gap"] <= -1), ("-0.5", a["gap"] == -.5), ("0", a["gap"] == 0), ("+0.5", a["gap"] == .5), ("+1", a["gap"] == 1),
                                                                                 ("+1.5 or more", a["gap"] >= 1.5), ("not listed", a["gap"].isna()))), flush=True)
    pools = {"every single stat": lambda g: np.ones(len(g), bool), "no assists": lambda g: (g["prop"] != "assists").values, "rebounds": lambda g: (g["prop"] == "rebounds").values,
             "points": lambda g: (g["prop"] == "points").values, "lines under 10": lambda g: (g["line"] < 10).values}
    for app, TAB in (("underdog", R.UD), ("prizepicks", R.PP)):
        a = d[d["app"] == app]
        print(f"\nP21|================ {app.upper()} ================", flush=True)
        for rn, col in (("blend", "blend"), ("average", "avg"), ("model", "ph"), ("gap first, then blend", "gap_blend"), ("gap as a share of the line", "gshare")):
            for pn, pf in pools.items():
                x = a[pf(a) & a[col].notna().values]
                days = [(gd, g.sort_values(col, ascending=False)) for gd, g in x.groupby("gd", sort=True)]
                print(f"P21|-- {rn} | {pn}", flush=True)
                for ln, mc in (L.items() if col in ("blend", "avg", "ph") else [("none", None)]):
                    res, hr = P19.run(days, mc, TAB)
                    n2 = len(res[("P", 2)])
                    print(f"P21|   {ln:32s}: {P19.line(res, app)} | legs of the 6-pick hit {100 * hr:.1f}% | 2-pick slips {n2}", flush=True)
    print("P21|DONE", flush=True)


if __name__ == "__main__":
    main()
