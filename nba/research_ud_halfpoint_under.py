#!/usr/bin/env python3
"""
S6d - UNDERDOG "HALF POINT BELOW THE MARKET" UNDERS (alternates at real multipliers). READ-ONLY. (NBA_HONEST_REBUILD.md section 8j)
The honest cell scan on Underdog alternates (run cs3_alt) kept one family in all three seasons: an Under on an Underdog ALTERNATE line that sits half a
point BELOW PrizePicks' regular line for the same player / prop / day, paid above 1.0x (tier B1). 10,170 legs, +3.3% / +2.4% / +2.2% a leg; with the
multiplier 1.08-1.3x: +10.9% / +8.3% / +6.1% (2,347 legs). Nothing here uses the model; the "market" is the other app's regular line.
This script (1) maps the family: return by (line against PrizePicks' regular line) x (multiplier band) x season, both sides, with a 90% range re-drawing
slates and a PROPER yardstick (results shuffled inside slate x side x multiplier band, so the price-to-hit link survives the shuffle);
(2) splits the core cell by prop, line size, month phase, tier; (3) plays it as slips with Underdog's real tables and leg factors (floored to 2 decimals):
pool = the cell's legs of the slate, one per player, at most 2 of a game in a slip, ordered by multiplier (highest first) or at random; every structure
2..6 picks Power ("standard") and 3..6 Flex; HU_SLIPS a slate (1, 2, 3, 5); ROI with range, units, max drawdown, longest run of slates without a winner.
(Owner rule: Underdog Power above 2 picks is not played and prediction-market legs cannot go in Flex - the other rows are for completeness.)
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
FLEX = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
SEAS = ["2024-25", "2025-26", "2026-27"]
rng = np.random.default_rng(31)


def floor2(x):
    return int(x * 100 + 1e-6) / 100.0


def boot(v, gd, n=300):
    u, inv = np.unique(gd, return_inverse=True)
    if len(u) < 3:
        return np.nan, np.nan
    s = np.bincount(inv, weights=v, minlength=len(u)); c = np.bincount(inv, minlength=len(u)); ix = rng.integers(len(u), size=(n, len(u)))
    b = s[ix].sum(1) / c[ix].sum(1); return np.quantile(b, .05), np.quantile(b, .95)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    df = pd.read_sql("""SELECT season, game_date::text gd, player_id, prop, side, line::float8 line, kind, tier, m::float8 m, hit::int hit FROM nba_score._lr_legs_h
                        WHERE app = 'underdog' AND hit IS NOT NULL AND m > 0""", conn)
    pp = pd.read_sql("SELECT DISTINCT game_date::text gd, player_id, prop, line::float8 ppl FROM nba_score._lr_legs_h WHERE app = 'prizepicks' AND kind = 'standard'", conn)
    ur = df[df["kind"] == "R"][["gd", "player_id", "prop", "line"]].drop_duplicates(["gd", "player_id", "prop"]).rename(columns={"line": "url"})
    gl = pd.read_sql("SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'", conn)
    conn.close()
    df = df.merge(pp.drop_duplicates(["gd", "player_id", "prop"]), on=["gd", "player_id", "prop"], how="left").merge(ur, on=["gd", "player_id", "prop"], how="left")
    df = df.merge(gl.drop_duplicates(["player_id", "gd"]), on=["player_id", "gd"], how="left"); df["game_id"] = df["game_id"].fillna("g" + df["player_id"])
    df["under"] = ~df["side"].str.lower().str[0].isin(["o", "m", "h"]); df["sd"] = np.where(df["under"], "Under", "Over")
    df["f"] = df["m"] / 1.8708; df["val"] = df["hit"] * df["m"]
    df["mb"] = pd.cut(df["f"], [0, .8, .92, .995, 1.005, 1.08, 1.3, 1.7, 99], labels=["<.8x", ".8-.92x", ".92-1x", "1.0x", "1.0-1.08x", "1.08-1.3x", "1.3-1.7x", "1.7x+"]).astype(str)
    for ref, nm in (("ppl", "PrizePicks regular line"), ("url", "Underdog's own regular line")):
        d = df[df[ref].notna()].copy(); d["dl"] = d["line"] - d[ref]
        d["db"] = pd.cut(d["dl"], [-99, -1.49, -.99, -.49, -.01, .01, .49, .99, 1.49, 99], labels=["-1.5 or more", "-1", "-0.5", "-0.x", "same", "+0.x", "+0.5", "+1", "+1.5 or more"]).astype(str)
        print(f"\nHU|=== 1 MAP against {nm}: Underdog legs with that reference {len(d):,} (all tiers); return a leg by line difference x multiplier band x season ===", flush=True)
        # proper yardstick: shuffle hits inside slate x side x multiplier band
        d["hs"] = d.groupby(["gd", "sd", "mb"])["hit"].transform(lambda x: rng.permutation(x.values)); d["vs"] = d["hs"] * d["m"]
        for side in ("Under", "Over"):
            for db in ["-1.5 or more", "-1", "-0.5", "same", "+0.5", "+1", "+1.5 or more"]:
                for mb in ["<.8x", ".8-.92x", ".92-1x", "1.0x", "1.0-1.08x", "1.08-1.3x", "1.3-1.7x", "1.7x+"]:
                    x = d[(d["sd"] == side) & (d["db"] == db) & (d["mb"] == mb)]
                    if len(x) < 400:
                        continue
                    lo, hi = boot(x["val"].values, x["gd"].values); ls, hs_ = boot(x["vs"].values, x["gd"].values)
                    per = " / ".join((f"{100 * (g['val'].mean() - 1):+.1f}% n{len(g):,}" if len(g) >= 40 else "-") for g in (x[x["season"] == s] for s in SEAS))
                    flag = "  <== above zero" if lo > 1 else ""
                    print(f"HU|  {side:5s} line {db:13s} pays {mb:10s} legs {len(x):6,} hit {x['hit'].mean():.3f} return {100 * (x['val'].mean() - 1):+5.1f}% [{100 * (lo - 1):+.1f} .. {100 * (hi - 1):+.1f}] | "
                          f"{per} | shuffled {100 * (x['vs'].mean() - 1):+.1f}%{flag}", flush=True)
    d = df[df["ppl"].notna()].copy(); d["dl"] = d["line"] - d["ppl"]
    core = d[d["under"] & (d["dl"] > -.51) & (d["dl"] < -.49) & (d["f"] > 1.005)].copy()
    print(f"\nHU|=== 2 CORE CELL: Under, half a point below PrizePicks' regular line, paid above 1.0x: {len(core):,} legs on {core['gd'].nunique()} slates ===", flush=True)
    core["phase"] = core["gd"].str[5:7].map(lambda m: "Oct-Nov" if m in ("10", "11") else "Dec-Jan" if m in ("12", "01") else "Feb+")
    core["ls"] = pd.cut(core["line"], [0, 2.6, 5.6, 9.6, 14.6, 99], labels=["<=2.5", "3-5.5", "6-9.5", "10-14.5", "15+"]).astype(str)
    core["fb"] = pd.cut(core["f"], [1, 1.04, 1.08, 1.12, 1.2, 1.3, 9], labels=["1.01-1.04", "1.05-1.08", "1.09-1.12", "1.13-1.20", "1.21-1.30", "1.31+"]).astype(str)
    for c in ("prop", "ls", "phase", "tier", "fb", "season"):
        for v, x in core.groupby(c):
            if len(x) < 150:
                continue
            lo, hi = boot(x["val"].values, x["gd"].values)
            per = " / ".join((f"{100 * (g['val'].mean() - 1):+.1f}% n{len(g):,}" if len(g) >= 30 else "-") for g in (x[x["season"] == s] for s in SEAS))
            print(f"HU|  {c:6s} {str(v):12s} legs {len(x):6,} ({len(x) / x['gd'].nunique():4.1f} a slate on {x['gd'].nunique()} slates) hit {x['hit'].mean():.3f} pays {x['f'].mean():.2f}x return {100 * (x['val'].mean() - 1):+5.1f}% "
                  f"[{100 * (lo - 1):+.1f} .. {100 * (hi - 1):+.1f}] | {per}", flush=True)
    print("\nHU|=== 3 SLIPS from the core cell (real tables, leg factors, floored) ===", flush=True)
    print("HU|pool | order | slips a slate | structure | season: slips, ROI [90% range], units, max drawdown, longest slates without a winner", flush=True)
    pools = {"all above 1.0x": core, "paid 1.08x and more": core[core["f"] >= 1.08]}
    for pname, pool in pools.items():
        for order in ("highest multiplier first", "random"):
            days = {}
            for gd, g in pool.groupby("gd"):
                g = g.sort_values("f", ascending=False) if order.startswith("high") else g.sample(frac=1.0, random_state=7)
                g = g.drop_duplicates("player_id"); days[gd] = (g["hit"].values, g["f"].values, g["game_id"].values, g["season"].iloc[0])
            for ns in (1, 2, 3, 5):
                for st, k in [("power", k) for k in range(2, 7)] + [("flex", k) for k in range(3, 7)]:
                    res = defaultdict(list)
                    for gd in sorted(days):
                        hit, f, game, s = days[gd]
                        if len(hit) < k:
                            continue
                        slips = [[] for _ in range(ns)]
                        for i in range(len(hit)):
                            for j in sorted(range(ns), key=lambda j_: (len(slips[j_]), (j_ - i) % ns)):
                                if len(slips[j]) < k and sum(1 for q in slips[j] if game[q] == game[i]) < 2:
                                    slips[j].append(i); break
                        prof = []; won = False
                        for sl in slips:
                            if len(sl) < k:
                                continue
                            h = int(hit[sl].sum())
                            if st == "power":
                                p = floor2(STD[k] * float(np.prod(f[sl]))) if h == k else 0.0
                            else:
                                base = FLEX.get((k, k - h), 0.0); p = floor2(base * float(np.prod(f[sl][hit[sl] == 1]))) if base else 0.0
                            prof.append(p - 1); won = won or p > 1
                        if prof:
                            res[s].append((sum(prof), len(prof), won))
                    cells = []
                    for s in SEAS + ["ALL"]:
                        rows = res[s] if s != "ALL" else [r for q in SEAS for r in res[q]]
                        if len(rows) < 8:
                            cells.append(f"{s[2:]}: -"); continue
                        pr = np.array([r[0] for r in rows]); n = np.array([r[1] for r in rows]); ix = rng.integers(len(rows), size=(300, len(rows)))
                        b = pr[ix].sum(1) / n[ix].sum(1); cum = np.concatenate([[0], np.cumsum(pr)]); dd = float((np.maximum.accumulate(cum) - cum).max()); dr = cur = 0
                        for r in rows:
                            cur = 0 if r[2] else cur + 1; dr = max(dr, cur)
                        cells.append(f"{s[2:]}: {int(n.sum())} slips {100 * pr.sum() / n.sum():+.1f}% [{100 * np.quantile(b, .05):+.0f} .. {100 * np.quantile(b, .95):+.0f}] {pr.sum():+.1f}u dd {dd:.1f} dr {dr}")
                    print(f"HU|  {pname:20s} | {order:24s} | {ns} | {k}-pick {st:5s} | " + " | ".join(cells), flush=True)
    print("HU|DONE", flush=True)


if __name__ == "__main__":
    main()
