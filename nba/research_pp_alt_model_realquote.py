#!/usr/bin/env python3
"""
PHASE B2 - PRIZEPICKS GOBLINS / DEMONS PICKED BY THE PER-LEG MODEL, VALUED AT REAL QUOTES. READ-ONLY. (NBA_HONEST_REBUILD.md 8p; rule C9)
research_leg_model_h.py shows goblins picked by the sportsbook number or the gbm returning +7..+13% a leg in all three seasons - but the history price of a
PrizePicks alternate is MODELLED (rule C7). This script re-values the same out-of-sample picks at the REAL quoted price (nba_market.pp_mined_leg,
two-pick Power quote -> leg factor (quote / 2.99) ^ (1 / 0.904)), this season, where a quote exists.
Per kind: every quoted leg; legs the model calls profitable at the REAL price (p x real factor / 0.542 > 1, > 1.05, > 1.10) for book / blend / gbm / placebo;
the top 6 / 10 / 20 a slate by predicted return at the real price; and how far the modelled price sits from the real one on the picked legs.
Env: DATABASE_URL.
"""
import os

import numpy as np
import pandas as pd
import psycopg

import research_legs_h_build as LH

rng = np.random.default_rng(61)


def boot(r, gd, n=400):
    u, inv = np.unique(gd, return_inverse=True)
    if len(u) < 5:
        return np.nan, np.nan
    s = np.bincount(inv, weights=r, minlength=len(u)); c = np.bincount(inv, minlength=len(u)); ix = rng.integers(len(u), size=(n, len(u)))
    b = s[ix].sum(1) / np.maximum(1, c[ix].sum(1)); return float(np.quantile(b, .05)), float(np.quantile(b, .95))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    d = pd.read_sql("""SELECT l.game_date::text gd, l.player_id, l.prop, l.side, l.line::float8 line, l.kind, l.m::float8 m, l.hit::int hit, l.ph::float8 ph,
                              p.p_blend::float8 blend, p.p_gbm::float8 gbm, p.p_placebo::float8 placebo
                       FROM nba_score._lr_legs_h l LEFT JOIN nba_score._lr_legs_hp p ON p.app = l.app AND p.game_date = l.game_date AND p.player_id = l.player_id AND p.prop = l.prop
                            AND p.side = l.side AND p.line = l.line AND p.kind = l.kind
                       WHERE l.app = 'prizepicks' AND l.kind IN ('goblin', 'demon') AND l.game_date >= '2026-10-01' AND l.hit IS NOT NULL AND l.tier NOT LIKE '%%-u'""", conn)
    q = pd.read_sql("""SELECT left(b.start_time, 10) gd, nba_ref.norm_name(m.player) nm, m.base_market, m.line::float8 line, m.side, m.two_pick_power::float8 p2, m.quoted_at
                       FROM nba_market.pp_mined_leg m JOIN nba_market.pp_board_row b ON b.run_file = m.run_file AND b.projection_id = m.projection_id
                       WHERE m.two_pick_power > 0 AND m.base_market = ANY(%s)""", conn, params=(list(LH.MK),))
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, books, p_over_mean::float8 po
                        FROM nba_market.market_consensus WHERE snapshot_label = 'window' AND game_date >= '2026-10-01'""", conn)
    conn.close()
    q = q.sort_values("quoted_at").drop_duplicates(["gd", "nm", "base_market", "line", "side"], keep="last")
    q["player_id"] = q["nm"].map(ids); q["prop"] = q["base_market"].map(LH.MK); q["real_m"] = (q["p2"] / 2.99) ** (1 / 0.904)
    mc["player_id"] = mc["nm"].map(ids); mc["prop"] = mc["market_key"].map(LH.MK)
    mc = mc[mc["player_id"].notna() & mc["prop"].notna()].drop_duplicates(["gd", "player_id", "prop", "line"])[["gd", "player_id", "prop", "line", "books", "po"]]
    n0 = len(d); d = d.drop_duplicates(["gd", "player_id", "prop", "side", "line", "kind"])
    d = d.merge(q[["gd", "player_id", "prop", "line", "side", "real_m"]], on=["gd", "player_id", "prop", "line", "side"], how="left").merge(mc, on=["gd", "player_id", "prop", "line"], how="left")
    over = d["side"].str.lower().str[0].isin(["o", "m", "h"]); d["book"] = np.where(over, d["po"], 1 - d["po"]); d["book2"] = np.where(d["books"] >= 2, d["book"], np.nan)
    print(f"PQ|PrizePicks goblin / demon legs this season {len(d):,} (rows before de-dup {n0:,}) on {d['gd'].nunique()} slates; with a REAL quote {int(d['real_m'].notna().sum()):,} "
          f"({100 * d['real_m'].notna().mean():.0f}%) on {d[d['real_m'].notna()]['gd'].nunique()} slates; with a model number {100 * d['gbm'].notna().mean():.0f}%", flush=True)
    d = d[d["real_m"].notna()].copy(); d["mm"] = d["real_m"] / 0.542; d["r"] = d["hit"] * d["mm"] - 1; d["r_mod"] = d["hit"] * d["m"] / 0.542 - 1
    for kn in ("goblin", "demon"):
        g = d[d["kind"] == kn]
        if len(g) < 200:
            continue
        lo, hi = boot(g["r"].values, g["gd"].values)
        print(f"\nPQ|=== {kn}: quoted legs {len(g):,} on {g['gd'].nunique()} slates; hit {g['hit'].mean():.3f}; return at the REAL price {100 * g['r'].mean():+.1f}% [{100 * lo:+.1f} .. {100 * hi:+.1f}]; "
              f"at the MODELLED price {100 * g['r_mod'].mean():+.1f}%; modelled / real price median {np.median(g['m'] / g['real_m']):.3f} ===", flush=True)
        for nm in ("book", "book2", "ph", "blend", "gbm", "placebo"):
            p = g[nm].values; v = ~np.isnan(p); out = [f"PQ|  {nm:8s} cover {100 * v.mean():3.0f}%"]
            for thr in (0.0, 0.05, 0.10):
                s = g[v & (np.nan_to_num(p) * g["mm"].values - 1 > thr)]
                if len(s) >= 40:
                    lo, hi = boot(s["r"].values, s["gd"].values)
                    out.append(f"says > {int(100 * thr):+d}% at the real price: n {len(s):,} / {s['gd'].nunique()} slates, hit {s['hit'].mean():.3f}, REAL {100 * s['r'].mean():+.1f}% [{100 * lo:+.1f} .. {100 * hi:+.1f}] "
                               f"(same legs at the modelled price {100 * s['r_mod'].mean():+.1f}%; modelled / real {np.median(s['m'] / s['real_m']):.2f})")
            print(" | ".join(out), flush=True)
            t = g[v].assign(ev=p[v] * g["mm"].values[v] - 1).sort_values("ev", ascending=False).drop_duplicates(["gd", "player_id"]); out = []
            for K in (6, 10, 20):
                tt = t.groupby("gd").head(K); lo, hi = boot(tt["r"].values, tt["gd"].values)
                out.append(f"top {K}: hit {tt['hit'].mean():.3f} REAL {100 * tt['r'].mean():+.1f}% [{100 * lo:+.1f} .. {100 * hi:+.1f}] n{len(tt):,}")
            print(f"PQ|  {nm:8s} best a slate at the real price, one per player: " + " | ".join(out), flush=True)
    print("PQ|DONE", flush=True)


if __name__ == "__main__":
    main()
