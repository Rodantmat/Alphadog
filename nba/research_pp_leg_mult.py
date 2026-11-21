#!/usr/bin/env python3
"""
PP LEG MULTIPLIERS - EVERY GOBLIN / DEMON LEG PRICED LIKE A REGULAR LINE, AT EVERY SLIP SIZE. (owner 2026-11-20 16:58 PT:
"map to a level that every single leg can be mapped as the regular, to have an implied ROI ... each goblin and demon tier need a proper
understanding of the multiplier"). Built on section 8ap: a leg's price does not depend on its partners, one strength per leg sets every
size, lineups with an alternate use adjusted bases.

A regular leg's multiplier in a k-pick Power = base_k^(1/k) (2: 1.732, 3: 1.817, 4: 1.778, 5: 1.821, 6: 1.828); break-even = 1 / that.
A goblin / demon leg's multiplier in a k-pick Power = PrizePicks' payout for (that leg + k-1 regulars) / (the k-1 regulars' share,
base_k^((k-1)/k)). k = 2 comes straight from its real 2-pick quote; k = 3..6 from the per-size curve fitted on real same-minute quotes
(payout_k = exp(c0 + c1 lnF + c2 lnF^2), F = 2-pick payout / 3), checked out-of-day.
Writes nba_market.pp_leg_multiplier (one row per leg quote: last quote of the day per leg), and prints per kind / side / tier the
multipliers and break-evens, coverage of the day's PrizePicks goblin / demon board, and leg ROI where the honest model has a chance.
Env: DATABASE_URL, PPLM_WRITE (1 = write the table), PPLM_DT (300).
"""
import json
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

BASE = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
REG = {k: BASE[k] ** (1 / k) for k in BASE}
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers",
      "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast", "player_rebounds_assists": "reb_ast"}


def step(v):
    return 0.1 if v < 3 else 0.25 if v < 10 else 0.5 if v < 50 else 1.0


def rnd(v):
    st = step(v)
    return round(round(v / st) * st, 4)


def fit_curves(conn, DT):
    rows = conn.execute("SELECT extract(epoch FROM quoted_at::timestamptz)::bigint, left(quoted_at,10), n, power, legs FROM nba_market.pp_quote WHERE status=200 AND n BETWEEN 2 AND 6 ORDER BY 1").fetchall()
    two = defaultdict(list); one = []
    for t, day, n, pw, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}")
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        alts = [l for l in legs if l.get("odds") != "standard"]
        if len(alts) != 1 or len({l.get("game") for l in legs}) != n:
            continue
        try:
            top = float(pw[str(n)][str(n)])
        except Exception:
            continue
        a = alts[0]; key = f"{a.get('id')}|{a.get('side')}|{a.get('line')}"
        if n == 2:
            two[key].append((t, top))
        else:
            one.append((t, day, n, key, top))
    pts = defaultdict(list)
    for t, day, n, key, top in one:
        c = [(abs(t2 - t), p2) for t2, p2 in two.get(key, []) if abs(t2 - t) <= DT]
        if c:
            p2 = min(c)[1]
            if 1.9 < p2 < 18:          # 2-pick ends are clamped
                pts[n].append((day, np.log(p2 / 3), top))
    curves = {}
    for n in (3, 4, 5, 6):
        P = pts[n]
        c = np.polyfit([p[1] for p in P], np.log([p[2] for p in P]), 2)
        days = sorted({p[0] for p in P}); errs = []; ok = 0
        for dd in days:
            tr = [p for p in P if p[0] != dd]; te = [p for p in P if p[0] == dd]
            if len(tr) < 15:
                continue
            cc = np.polyfit([p[1] for p in tr], np.log([p[2] for p in tr]), 2)
            for p in te:
                v = float(np.exp(np.polyval(cc, p[1]))); errs.append(v / p[2] - 1); ok += rnd(v) == p[2]
        e = np.array(errs)
        lo, hi = min(p[1] for p in P), max(p[1] for p in P)
        curves[n] = (c, lo, hi)
        print(f"PPLM|curve {n}-pick: {len(P)} real same-minute pairs on {len(days)} days | out-of-day: exact {100*ok/max(1,len(e)):.0f}%, median error {100*np.median(np.abs(e)):.2f}%, p90 {100*np.percentile(np.abs(e),90):.2f}%, bias {100*e.mean():+.2f}% | factor range {np.exp(lo):.3f}-{np.exp(hi):.3f}", flush=True)
    return curves


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    DT = int(os.environ.get("PPLM_DT", "300"))
    curves = fit_curves(conn, DT)
    print("PPLM|regular leg: " + " | ".join(f"{k}-pick multiplier {REG[k]:.3f} break-even {100/REG[k]:.1f}%" for k in BASE), flush=True)
    q = pd.read_sql("""SELECT (quoted_at AT TIME ZONE 'America/Los_Angeles')::date::text gd, projection_id::text pid, player, nba_ref.norm_name(player) nm, pp_stat, base_market,
                              std_line::float8 std_line, line::float8 line, kind, lower(left(side,1)) sd, two_pick_power::float8 p2, factor_mined::float8 f, quoted_at
                       FROM nba_market.pp_mined_leg WHERE factor_mined IS NOT NULL AND kind IN ('goblin','demon')""", conn)
    q = q.sort_values("quoted_at").drop_duplicates(["gd", "pid", "line", "kind", "sd"], keep="last").copy()
    lf = np.log(q["f"].values)
    q["m2"] = REG[2] * q["f"]
    clamp = np.zeros(len(q), bool)
    for k in (3, 4, 5, 6):
        c, lo, hi = curves[k]
        x = np.clip(lf, lo, hi); clamp |= (lf < lo - 1e-9) | (lf > hi + 1e-9)
        pay = np.exp(np.polyval(c, x))
        q[f"pay{k}"] = pay
        q[f"m{k}"] = pay / BASE[k] ** ((k - 1) / k)
    q["outside_fit"] = clamp
    for k in BASE:
        q[f"be{k}"] = 1 / q[f"m{k}"]
    print(f"PPLM|legs priced: {len(q):,} (last quote of the day per leg) on {q['gd'].nunique()} days; outside the curves' fitted range (priced at the edge): {int(clamp.sum()):,}", flush=True)
    for kind in ("goblin", "demon"):
        for sd, sn in (("o", "More"), ("u", "Less")):
            x = q[(q["kind"] == kind) & (q["sd"] == sd)]
            if not len(x):
                continue
            print(f"PPLM|{kind} {sn}: {len(x):,} legs | " + " | ".join(f"{k}-pick multiplier median {x[f'm{k}'].median():.3f} ({x[f'm{k}'].quantile(.1):.3f}-{x[f'm{k}'].quantile(.9):.3f}), break-even {100*x[f'be{k}'].median():.1f}%" for k in (2, 3, 4, 5, 6)), flush=True)
    # rung tier (distance from the standard line, in rungs)
    q["rung"] = np.nan
    for (gd, nm, bm, sd), g in q.groupby(["gd", "nm", "base_market", "sd"]):
        for kind, sign in (("goblin", -1), ("demon", 1)):
            gg = g[g["kind"] == kind].sort_values("line", ascending=(sign == 1))
            q.loc[gg.index, "rung"] = np.arange(1, len(gg) + 1) * sign
    print("PPLM|by rung (1 = nearest the regular line), 3-pick multiplier median and break-even:", flush=True)
    for kind in ("goblin", "demon"):
        for sd in ("o", "u"):
            x = q[(q["kind"] == kind) & (q["sd"] == sd)]
            line = []
            for r in sorted(x["rung"].dropna().unique(), key=abs)[:6]:
                y = x[x["rung"] == r]
                line.append(f"rung {int(abs(r))}: {len(y):,} legs m3 {y['m3'].median():.3f} be {100*y['be3'].median():.1f}%")
            if line:
                print(f"PPLM|  {kind} {'More' if sd == 'o' else 'Less'}: " + " | ".join(line), flush=True)
    # coverage of the board and leg ROI with the honest model
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    q["player_id"] = q["nm"].map(ids); q["prop"] = q["base_market"].map(MK)
    v = pd.read_sql("""SELECT v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.kind, lower(left(v.side,1)) s1, v.hit::float8 hit, v.p_honest_baseline::float8 ph
                       FROM nba_score.v_legs_honest v WHERE v.app = 'prizepicks' AND v.kind IN ('goblin','demon') AND v.game_date >= '2026-10-20'""", conn)
    v["sd"] = v["s1"].map({"o": "o", "m": "o", "h": "o", "u": "u", "l": "u"})
    cov = v.merge(q[["gd", "player_id", "prop", "line", "sd", "kind", "m2", "m3", "m4", "m5", "m6"]], on=["gd", "player_id", "prop", "line", "sd", "kind"], how="left")
    byd = cov.groupby("gd").apply(lambda g: pd.Series({"board": len(g), "mapped": int(g["m3"].notna().sum())}))
    print(f"PPLM|board coverage (PrizePicks goblin / demon legs in the honest board that have a real quote): {int(byd['mapped'].sum()):,} of {int(byd['board'].sum()):,} ({100*byd['mapped'].sum()/max(1,byd['board'].sum()):.1f}%); last 7 days: " +
          ", ".join(f"{d} {int(r.mapped)}/{int(r.board)}" for d, r in byd.tail(7).iterrows()), flush=True)
    g = cov[cov["m3"].notna() & cov["hit"].notna()]
    for kind in ("goblin", "demon"):
        for sd, sn in (("o", "More"), ("u", "Less")):
            x = g[(g["kind"] == kind) & (g["sd"] == sd)]
            if len(x) < 30:
                continue
            print(f"PPLM|graded {kind} {sn}: {len(x):,} legs, hit {100*x['hit'].mean():.1f}% | real return a leg: " + " | ".join(f"{k}-pick {100*(x['hit']*x[f'm{k}']-1).mean():+.1f}% (needs {100/x[f'm{k}'].mean():.1f}%)" for k in (2, 3, 4, 5, 6)), flush=True)
            y = x[x["ph"].notna()]
            if len(y) >= 30:
                print(f"PPLM|   model chance {100*y['ph'].mean():.1f}% vs hit {100*y['hit'].mean():.1f}%; legs the model rates above break-even at 3-pick: {int((y['ph'] > 1/y['m3']).sum())}, their real return {100*(y.loc[y['ph'] > 1/y['m3'], 'hit']*y.loc[y['ph'] > 1/y['m3'], 'm3']-1).mean():+.1f}%", flush=True)
    if os.environ.get("PPLM_WRITE") == "1":
        conn.execute("""CREATE TABLE IF NOT EXISTS nba_market.pp_leg_multiplier (game_date date, projection_id text, player text, base_market text, pp_stat text, std_line numeric, line numeric,
                        kind text, side text, rung int, quoted_at timestamptz, two_pick numeric, m2 numeric, m3 numeric, m4 numeric, m5 numeric, m6 numeric,
                        be2 numeric, be3 numeric, be4 numeric, be5 numeric, be6 numeric, outside_fit boolean, built_at timestamptz DEFAULT now(),
                        PRIMARY KEY (game_date, projection_id, line, kind, side))""")
        with conn.cursor() as cur:
            cur.execute("DELETE FROM nba_market.pp_leg_multiplier")
            recs = [(r.gd, r.pid, r.player, r.base_market, r.pp_stat, r.std_line, r.line, r.kind, "More" if r.sd == "o" else "Less", None if pd.isna(r.rung) else int(abs(r.rung)), r.quoted_at, r.p2,
                     round(r.m2, 4), round(r.m3, 4), round(r.m4, 4), round(r.m5, 4), round(r.m6, 4), round(r.be2, 4), round(r.be3, 4), round(r.be4, 4), round(r.be5, 4), round(r.be6, 4), bool(r.outside_fit)) for r in q.itertuples()]
            cur.executemany("""INSERT INTO nba_market.pp_leg_multiplier (game_date, projection_id, player, base_market, pp_stat, std_line, line, kind, side, rung, quoted_at, two_pick,
                               m2, m3, m4, m5, m6, be2, be3, be4, be5, be6, outside_fit) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""", recs)
        conn.commit()
        print(f"PPLM|wrote nba_market.pp_leg_multiplier: {len(q):,} rows", flush=True)


if __name__ == "__main__":
    main()
