#!/usr/bin/env python3
"""
PHASE D3 - THE TOP OF THE LIST, TAKEN APART (NBA_HONEST_REBUILD.md 8s). READ-ONLY. One app a run (TL_APP = underdog | prizepicks).
The battery's one consistent family is "the top regular single-stat Unders of the slate by the blended number" (8r). Before it is called an edge:
  1. hit rate by RANK POSITION (1, 2, 3, 4, 5-6, 7-10, 11-20, 21-40) per season, 90% range re-drawing slates - is it a smooth decline from the top
     (a real ranking) or one lucky position?
  2. the same for every ranking number (blend, small gbm, gbm, honest baseline, sportsbook, placebo, random) and for Unders / Overs / both, single stats /
     combos / all - so the choice of "blend, Under, single" is seen against its neighbours
  3. what the top legs ARE: share with a sportsbook number, the sportsbook chance, the honest chance, the app line against the sportsbooks' main line,
     prop mix, role - is it line shopping, the model, or the Under bias?
  4. by month (is it one hot month?) and by weekday
  5. top-4 pooled over the three seasons with a slate-level test against the break-even
Env: DATABASE_URL, TL_APP.
"""
import os

import numpy as np
import pandas as pd
import psycopg

APP = (os.environ.get("TL_APP") or "underdog").lower()
os.environ["BT_APP"] = APP
import research_battery_h as B                              # noqa: E402

BE = 0.5345 if APP == "underdog" else 0.542
rng = np.random.default_rng(83)
BUCK = [(1, 1), (2, 2), (3, 3), (4, 4), (5, 6), (7, 10), (11, 20), (21, 40)]


def boot(h, gd, n=400):
    u, inv = np.unique(gd, return_inverse=True)
    if len(u) < 5:
        return np.nan, np.nan
    s = np.bincount(inv, weights=h, minlength=len(u)); c = np.bincount(inv, minlength=len(u)); ix = rng.integers(len(u), size=(n, len(u)))
    b = s[ix].sum(1) / np.maximum(1, c[ix].sum(1)); return float(np.quantile(b, .05)), float(np.quantile(b, .95))


def ranked(d, key):
    x = d[d[key].notna()].sort_values(key, ascending=False).drop_duplicates(["gd", "player_id"]).copy()
    x["rk"] = x.groupby("gd").cumcount() + 1
    return x


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = B.load(conn)
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mk = {"points": "player_points", "rebounds": "player_rebounds", "assists": "player_assists", "threes_made": "player_threes", "steals": "player_steals", "blocks": "player_blocks",
          "turnovers": "player_turnovers"}
    inv = {v: k for k, v in mk.items()}
    mc = pd.read_sql("SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 bline, books, p_over_mean::float8 bpo FROM nba_market.market_consensus WHERE snapshot_label = 'window' AND market_key = ANY(%s)",
                     conn, params=(list(mk.values()),))
    hb = pd.read_sql("SELECT game_date::text gd, player_id, prop, role_tier FROM nba_score.baseline_history_h", conn)
    conn.close()
    mc["prop"] = mc["market_key"].map(inv); mc["player_id"] = mc["nm"].map(ids); mc = mc[mc["player_id"].notna()]
    mc = mc.assign(d5=(mc["bpo"] - .5).abs()).sort_values(["books", "d5"], ascending=[False, True]).drop_duplicates(["gd", "player_id", "prop"])[["gd", "player_id", "prop", "bline", "books"]]
    d = d[d["kindc"] == 0].copy()
    d = d.merge(mc, on=["gd", "player_id", "prop"], how="left").merge(hb.drop_duplicates(["gd", "player_id", "prop"]), on=["gd", "player_id", "prop"], how="left")
    d["single"] = ~d["prop"].isin(B.COMBO); d["rand"] = rng.random(len(d)); d["mix"] = (d["blend"] + d["gbm_s"]) / 2
    print(f"TL|{APP}: regular out-of-sample legs {len(d):,} on {d['gd'].nunique()} slates; break-even {BE}; single-stat {100 * d['single'].mean():.0f}%, Under {100 * d['under'].mean():.0f}%, with a sportsbook number {100 * d['pb'].notna().mean():.0f}%", flush=True)
    seas = B.SEAS
    # 1 + 2: hit by rank position
    for label, sub in (("Under, single stats", d[(d["under"] == 1) & d["single"]]), ("Under, all props", d[d["under"] == 1]), ("both sides, single stats", d[d["single"]]),
                       ("Over, single stats", d[(d["under"] == 0) & d["single"]]), ("Under, combos", d[(d["under"] == 1) & ~d["single"]])):
        print(f"\nTL|=== hit rate by rank position - {label} (cells: 2024-25 / 2025-26 / 2026-27; [range] on the pooled three seasons) ===", flush=True)
        for key, nm in (("blend", "blend"), ("gbm_s", "small gbm"), ("mix", "blend + small gbm"), ("gbm", "gbm"), ("ph", "honest baseline"), ("pb", "sportsbook"), ("placebo", "PLACEBO"), ("rand", "RANDOM")):
            x = ranked(sub, key); cells = []
            for lo, hi in BUCK:
                y = x[(x["rk"] >= lo) & (x["rk"] <= hi)]
                if len(y) < 30:
                    continue
                per = "/".join(f"{y[y['season'] == s]['hit'].mean():.3f}" if (y["season"] == s).sum() >= 15 else "-" for s in seas)
                l, h = boot(y["hit"].values.astype(float), y["gd"].values)
                cells.append(f"#{lo}{'' if lo == hi else '-' + str(hi)} {per} [{l:.3f}..{h:.3f}] n{len(y)}")
            print(f"TL|  {nm:18s} " + " | ".join(cells), flush=True)
    # 3: what the top legs are
    f = ranked(d[(d["under"] == 1) & d["single"]], "blend")
    print("\nTL|=== what the top Under single-stat legs by blend ARE (top 4 vs ranks 5-20 vs all) ===", flush=True)
    for nm, y in (("top 4", f[f["rk"] <= 4]), ("ranks 5-20", f[(f["rk"] >= 5) & (f["rk"] <= 20)]), ("all ranked", f)):
        gap = (y["line"] - y["bline"]); props = (y["prop"].value_counts(normalize=True).head(5) * 100).round(0).to_dict(); roles = (y["role_tier"].value_counts(normalize=True).head(4) * 100).round(0).to_dict()
        print(f"TL|  {nm:11s} n {len(y):6,} | hit {y['hit'].mean():.3f} | with a sportsbook number at the line {100 * y['pb'].notna().mean():.0f}%, its chance {y['pb'].mean():.3f} | honest chance {y['ph'].mean():.3f} | blend {y['blend'].mean():.3f} | "
              f"app line minus sportsbooks' main line: mean {gap.mean():+.2f}, above by 0.5+ {100 * (gap >= .5).mean():.0f}%, above by 1+ {100 * (gap >= 1).mean():.0f}%, equal {100 * (gap.abs() < .01).mean():.0f}%, no main line {100 * gap.isna().mean():.0f}% | "
              f"hot {100 * (y['form'] == 1).mean():.0f}%, cold {100 * (y['form'] == 2).mean():.0f}%, minutes up {100 * y['roleup'].mean():.0f}% | props {props} | roles {roles}", flush=True)
    t4 = f[f["rk"] <= 4]
    print("TL|  top 4 split by the line gap: " + " | ".join(f"{nm}: hit {y['hit'].mean():.3f} (n {len(y)})" for nm, y in (("line above the sportsbooks' main by 0.5+", t4[(t4['line'] - t4['bline']) >= .5]),
          ("line equal", t4[(t4['line'] - t4['bline']).abs() < .01]), ("line below", t4[(t4['line'] - t4['bline']) <= -.5]), ("no main line", t4[t4['bline'].isna()])) if len(y) >= 20), flush=True)
    print("TL|  top 4 split by sportsbook number at the exact line: " + " | ".join(f"{nm}: hit {y['hit'].mean():.3f} (n {len(y)})" for nm, y in (("has one", t4[t4["pb"].notna()]), ("none", t4[t4["pb"].isna()])) if len(y) >= 20), flush=True)
    # 4: by month, weekday
    t4 = t4.assign(ym=t4["gd"].str[:7], dow=pd.to_datetime(t4["gd"]).dt.day_name().str[:3])
    print("TL|  top 4 by month: " + " | ".join(f"{m} {g['hit'].mean():.3f} (n{len(g)})" for m, g in t4.groupby("ym")), flush=True)
    print("TL|  top 4 by weekday: " + " | ".join(f"{m} {g['hit'].mean():.3f} (n{len(g)})" for m, g in t4.groupby("dow")), flush=True)
    print("TL|  top 4 by prop: " + " | ".join(f"{m} {g['hit'].mean():.3f} (n{len(g)})" for m, g in t4.groupby("prop")), flush=True)
    # 5: pooled test
    for K in (2, 3, 4, 6):
        y = f[f["rk"] <= K]; day = y.groupby("gd")["hit"].agg(["sum", "size"]); ex = day["sum"] - BE * day["size"]
        z = ex.sum() / (ex.std(ddof=1) * np.sqrt(len(ex))); l, h = boot(y["hit"].values.astype(float), y["gd"].values)
        print(f"TL|  pooled top {K}: {len(y):,} legs on {len(day)} slates, hit {y['hit'].mean():.3f} [{l:.3f}..{h:.3f}] against {BE}: {z:+.2f} standard errors (slate level); "
              f"by season " + ", ".join(f"{s} {y[y['season'] == s]['hit'].mean():.3f} (n{(y['season'] == s).sum()})" for s in seas), flush=True)
    print("TL|DONE", flush=True)


if __name__ == "__main__":
    main()
