#!/usr/bin/env python3
"""
GOBLIN / DEMON LEG RETURNS ON THE WHOLE BACKTEST AT THE v2 PRICE (nba_score.pp_alt_price_v2). READ-ONLY. (owner 2026-11-20 20:03 PT)
The old backtest price of goblins / demons ran +37% too high against real quotes (demons +47%, goblins +20%; research_pp_price_v2.py) - every goblin / demon
backtest number built on it was inflated by ~20-45 points of leg return. Here every leg of 2024-25, 2025-26, 2026-27 is re-priced with the v2 price (real quote
where one exists, else the model tested at -0.6% bias out of time) and graded on its real result.
Leg return at k picks = hit x (leg multiplier at k picks) - 1 (a k-pick Power of such legs returns about (1 + leg return)^k - 1).
Cells: season x kind x side x tier (rung 1 = nearest the regular line / switch point), and the model's top legs (p_blend above the leg's break-even).
Env: DATABASE_URL.
"""
import os

import numpy as np
import pandas as pd
import psycopg


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT p.season, p.kind, p.side, p.prop, p.f2, p.source, p.m2, p.m3, p.m4, p.m5, p.m6, v.hit::float8 hit, v.p_blend::float8 pb, v.p_honest_baseline::float8 ph,
                              v.multiplier::float8 m_old, p.game_date, p.player_id, p.line
                       FROM nba_score.pp_alt_price_v2 p JOIN nba_score.v_legs_honest v ON v.app='prizepicks' AND v.game_date=p.game_date AND v.player_id::text=p.player_id
                            AND v.prop=p.prop AND lower(left(v.side,1))=lower(left(p.side,1)) AND v.line=p.line AND v.kind=p.kind
                       WHERE v.hit IS NOT NULL""", conn)
    d["rung"] = d.groupby(["game_date", "player_id", "prop", "kind", "side"])["line"].rank(method="first", ascending=True)
    d.loc[d["kind"] == "goblin", "rung"] = d[d["kind"] == "goblin"].groupby(["game_date", "player_id", "prop", "side"])["line"].rank(method="first", ascending=False)
    print(f"ALT|graded goblin / demon legs re-priced: {len(d):,} (real quote {int((d['source'] == 'quote').sum()):,})", flush=True)

    def rep(x, lab):
        if len(x) < 200:
            return None
        r = {k: (x["hit"] * x[f"m{k}"] - 1).mean() for k in (2, 3, 4, 5, 6)}
        ro = (x["hit"] * 1.732 * x["m_old"] - 1).mean()
        se = (x["hit"] * x["m2"] - 1).std() / np.sqrt(len(x))
        return (f"ALT|  {lab:38s}: {len(x):7,} legs | hit {100*x['hit'].mean():5.1f}% | needs {100/x['m2'].mean():5.1f}% (2-pick) | leg return 2-pick {100*r[2]:+6.1f}% (+/-{100*1.64*se:.1f}) "
                f"3 {100*r[3]:+6.1f}% 4 {100*r[4]:+6.1f}% 5 {100*r[5]:+6.1f}% 6 {100*r[6]:+6.1f}% | OLD price said {100*ro:+6.1f}%")
    for season in sorted(d["season"].unique()):
        print(f"ALT|==== {season} ====", flush=True)
        s = d[d["season"] == season]
        for (kind, side), x in s.groupby(["kind", "side"]):
            line = rep(x, f"{kind} {side} all")
            if line:
                print(line, flush=True)
            for rg in (1, 2, 3, 4):
                line = rep(x[x["rung"] == rg], f"{kind} {side} tier {rg}")
                if line:
                    print(line, flush=True)
            sel = x[x["pb"].notna() & (x["pb"] > 1 / x["m2"])]
            line = rep(sel, f"{kind} {side} model says > break-even")
            if line:
                print(line, flush=True)
            sel = x[x["pb"].notna() & (x["pb"] > 1.05 / x["m2"])]
            line = rep(sel, f"{kind} {side} model says > +5%")
            if line:
                print(line, flush=True)
    print("ALT|DONE", flush=True)


if __name__ == "__main__":
    main()
