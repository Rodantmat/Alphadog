#!/usr/bin/env python3
"""
PASS 28 - GOBLINS AND DEMONS AT REAL QUOTES: IS ANY TIER WORTH A DAILY SLIP? READ-ONLY. (NBA_HONEST_REBUILD.md 8ao; owner 2026-11-20 13:09 PT:
"understand goblins and demons, if they are worth it. Maybe the best tier ... the easiest demons, we can make a 2-pick or a 3-pick flex")
ONLY legs with a REAL PrizePicks quote (nba_market.pp_mined_leg: the 2-pick factor read off the app), graded on the real result. No modelled price anywhere.
A leg's real factor f: a 2-pick Power pays 3 x f1 x f2, a 3-pick Power 6 x f1 x f2 x f3. Leg return on the 2-pick basis = hit x 1.732 x f - 1.
  1. LEG LEVEL by kind, by rung distance from the standard line (tier), by factor size ("easiest demons" = factor closest to 1), by the model's chance and predicted return.
  2. ONE SLIP A DAY: the top 2 / top 3 quoted legs of a pool by the model's predicted return (and by the model's chance), one a player and a game:
     2-pick Power, 3-pick Power (exact from the factors); 3-pick Flex is an ESTIMATE (3 x product if all hit, 1 x product of the two hitting factors if two hit).
SMALL SAMPLE: real quotes exist for this season's slates only (about 300 legs a day, in board order). Everything here is a lead, not a strategy.
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers",
      "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast", "player_rebounds_assists": "reb_ast"}


def rep(lab, x):
    if len(x) < 25:
        return f"P28|   {lab:44s}: {len(x)} legs - too few"
    r2 = x["hit"] * 1.732 * x["f"] - 1; se = r2.std() / np.sqrt(len(x))
    return (f"P28|   {lab:44s}: {len(x):5d} legs on {x['gd'].nunique()} days | hit {100 * x['hit'].mean():.1f}% | needs {100 / (1.732 * x['f'].mean()):.1f}% | mean factor {x['f'].mean():.2f} | "
            f"model said {100 * x['ph'].mean():.1f}% | return a leg {100 * r2.mean():+.1f}% (+/- {100 * 1.64 * se:.0f})")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    q = pd.read_sql("""SELECT (quoted_at AT TIME ZONE 'America/New_York')::date::text gd, nba_ref.norm_name(player) nm, base_market, line::float8 line, std_line::float8 std_line, kind, lower(left(side, 1)) sd,
                              factor_mined::float8 f, quoted_at FROM nba_market.pp_mined_leg WHERE factor_mined IS NOT NULL AND kind IN ('goblin', 'demon', 'standard')""", conn)
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    v = pd.read_sql("""SELECT v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.kind vkind, v.side, v.tier, v.hit::int hit, v.p_honest_baseline::float8 ph, v.p_blend::float8 blend, g.game_id::text game_id
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       WHERE v.app = 'prizepicks' AND v.kind IN ('goblin', 'demon') AND v.game_date >= '2026-10-01'""", conn)
    conn.close()
    q = q.sort_values("quoted_at").drop_duplicates(["gd", "nm", "base_market", "line", "kind", "sd"], keep="last")
    q["player_id"] = q["nm"].map(ids); q["prop"] = q["base_market"].map(MK); q = q[q["player_id"].notna() & q["prop"].notna()]
    print(f"P28|real quotes: {len(q):,} legs on {q['gd'].nunique()} days ({q['gd'].min()} .. {q['gd'].max()}); by kind / side: " + ", ".join(f"{k} {s}: {n:,}" for (k, s), n in q.groupby(["kind", "sd"]).size().items()), flush=True)
    v["sd"] = v["side"].str.lower().str[0].map({"o": "o", "m": "o", "h": "o", "u": "u", "l": "u"})
    d = q[q["kind"] != "standard"].merge(v, on=["gd", "player_id", "prop", "line", "sd"], how="inner"); d = d[d["ph"].notna()].copy()
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"]); d["tier"] = pd.to_numeric(d["tier"], errors="coerce"); d["pred"] = d["ph"] * 1.732 * d["f"] - 1
    d["rel"] = (d["line"] - d["std_line"]).abs() / d["std_line"].clip(lower=1)
    print(f"P28|graded with a model chance: {len(d):,} legs on {d['gd'].nunique()} days", flush=True)
    for kind in ("demon", "goblin"):
        for sd, sn in (("o", "More"), ("u", "Less")):
            x = d[(d["kind"] == kind) & (d["sd"] == sd)]
            if len(x) < 25:
                continue
            print(f"\nP28|================ {kind.upper()} {sn}: {len(x):,} real-quoted legs ================", flush=True)
            print(rep("all", x), flush=True)
            print("P28| by rung (tier 1 = next to the standard line):", flush=True)
            for t in sorted(x["tier"].dropna().unique())[:6]:
                print(rep(f"tier {int(t)}", x[x["tier"] == t]), flush=True)
            print("P28| by real factor:", flush=True)
            qs = x["f"].quantile([0, .2, .4, .6, .8, 1]).values
            for a, b in zip(qs[:-1], qs[1:]):
                print(rep(f"factor {a:.2f} - {b:.2f}", x[(x["f"] >= a) & (x["f"] <= b)]), flush=True)
            print("P28| by prop:", flush=True)
            for p_, g in x.groupby("prop"):
                print(rep(p_, g), flush=True)
            print("P28| by the model's chance:", flush=True)
            qs = x["ph"].quantile([0, .2, .4, .6, .8, 1]).values
            for a, b in zip(qs[:-1], qs[1:]):
                print(rep(f"model chance {100 * a:.0f} - {100 * b:.0f}%", x[(x["ph"] >= a) & (x["ph"] <= b)]), flush=True)
            print("P28| by the model's predicted return (chance x real price):", flush=True)
            qs = x["pred"].quantile([0, .2, .4, .6, .8, .9, 1]).values
            for a, b in zip(qs[:-1], qs[1:]):
                print(rep(f"predicted {100 * a:+.0f} .. {100 * b:+.0f}%", x[(x["pred"] >= a) & (x["pred"] <= b)]), flush=True)
            # one slip a day
            print("P28| one slip a day (top legs of the pool, one a player and a game):", flush=True)
            pools = {"all": x, "easiest fifth (factor closest to 1)": x[x["f"] <= x["f"].quantile(.2 if kind == "demon" else 1)], "easiest two fifths": x[x["f"] <= x["f"].quantile(.4)],
                     "tier 1": x[x["tier"] == 1], "tier 1-2": x[x["tier"] <= 2], "model chance 45%+": x[x["ph"] >= .45], "model predicts a profit": x[x["pred"] > 0],
                     "single stats": x[~x["prop"].isin(["pra", "pts_reb", "pts_ast", "reb_ast"])], "points": x[x["prop"] == "points"], "rebounds": x[x["prop"] == "rebounds"], "threes": x[x["prop"] == "threes_made"]}
            for pn, pool in pools.items():
                for rk, rn in (("pred", "predicted return"), ("ph", "model chance")):
                    out = {"2P": [], "3P": [], "3F": []}
                    for gd, g in pool.sort_values(rk, ascending=False).groupby("gd", sort=True):
                        pick = []; pl = set(); gm = set()
                        for r in g.itertuples():
                            if r.player_id in pl or r.game_id in gm:
                                continue
                            pick.append(r); pl.add(r.player_id); gm.add(r.game_id)
                            if len(pick) == 3:
                                break
                        if len(pick) >= 2:
                            a, b = pick[0], pick[1]; out["2P"].append(3 * a.f * b.f * (a.hit and b.hit) - 1)
                        if len(pick) == 3:
                            fs = [r.f for r in pick]; hs = [r.hit for r in pick]; h = sum(hs)
                            out["3P"].append(6 * np.prod(fs) * (h == 3) - 1)
                            out["3F"].append((3 * np.prod(fs) if h == 3 else (1 * np.prod([f_ for f_, h_ in zip(fs, hs) if h_]) if h == 2 else 0)) - 1)
                    s = " | ".join(f"{k} {100 * np.mean(u):+.0f}% ({np.sum(u):+.1f} u, {len(u)} slips, paid {100 * np.mean(np.array(u) > -1):.0f}%, without the best {np.sum(u) - np.max(u):+.1f})" if len(u) >= 8 else f"{k} -" for k, u in out.items())
                    print(f"P28|   {pn:36s} by {rn:16s}: {s}", flush=True)
    print("P28|DONE", flush=True)


if __name__ == "__main__":
    main()
