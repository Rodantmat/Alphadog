#!/usr/bin/env python3
"""
S6f - WHO ARE THE TOP-OF-LIST UNDERS? READ-ONLY. (NBA_HONEST_REBUILD.md section 8m)
The one pattern that survives (8g, 8l): the first few regular Unders of the honest model's list beat break-even in the last two seasons on both apps.
This profiles them so the pattern can be trusted or dismissed: for the top TP_K Unders of each slate (one per player, honest model), against all regular
Unders - share of each feature bucket (what kind of legs these are) and the hit rate by bucket and season (where inside the top list the value sits).
Features = the 26 pre-game features of research_cell_scan_honest.py (model, market, form, injury report at pick time).
Env: DATABASE_URL, CS_APP (underdog | prizepicks), TP_K (6).
"""
import os

import numpy as np
import pandas as pd
import psycopg

os.environ.setdefault("CS_APP", "underdog"); os.environ["CS_KIND"] = "regular"
import research_cell_scan_honest as CS                      # noqa: E402

K = int(os.environ.get("TP_K") or 6)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    df, F = CS.load(conn); conn.close()
    df = df.reset_index(drop=True); F = F.reset_index(drop=True)
    u = df[df["under"] & df["ph"].notna()].sort_values("ph", ascending=False).drop_duplicates(["gd", "player_id"])
    top = u.groupby("gd").head(K); ti = top.index; ui = u.index
    print(f"TP|{CS.APP}: regular Unders (one per player) {len(u):,}; top {K} a slate {len(top):,}; hit all {u['hit'].mean():.3f}, top {top['hit'].mean():.3f}; "
          f"model chance top {top['ph'].mean():.3f} vs all {u['ph'].mean():.3f}; line / anchor top {np.nanmedian(top['line'] / top['anchor'].clip(lower=.5)):.2f} vs all {np.nanmedian(u['line'] / u['anchor'].clip(lower=.5)):.2f}", flush=True)
    for s in CS.SEAS:
        t = top[top["season"] == s]
        print(f"TP|  {s}: top {K} hit {t['hit'].mean():.3f} (n {len(t):,}) | by rank: " + " ".join(f"#{r + 1} {g['hit'].mean():.3f}" for r, g in t.assign(rk=t.groupby('gd').cumcount()).groupby('rk')), flush=True)
    print("TP|feature bucket: share among the top list vs among all Unders | hit of the top list by season (n)", flush=True)
    for c in F.columns:
        ft = F.loc[ti, c]; fa = F.loc[ui, c]
        for v in sorted(pd.unique(fa.dropna()), key=str):
            st = (ft == v).mean(); sa = (fa == v).mean()
            if st < .04 and sa < .04:
                continue
            cells = []
            for s in CS.SEAS:
                g = top[(ft == v).values & (top["season"] == s).values]
                cells.append(f"{g['hit'].mean():.3f} n{len(g)}" if len(g) >= 25 else "-")
            flag = "  <<" if st > 1.6 * sa and st > .08 else ""
            print(f"TP|  {c:26s} {str(v):16s} top {100 * st:5.1f}% vs all {100 * sa:5.1f}% | " + " / ".join(cells) + flag, flush=True)
    print("TP|DONE", flush=True)


if __name__ == "__main__":
    main()
