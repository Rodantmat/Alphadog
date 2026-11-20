#!/usr/bin/env python3
"""
PASS 9 - MORE STRATEGIES, MORE SLIPS: what can run BESIDE the candidate without being the same bet twice. READ-ONLY. (NBA_HONEST_REBUILD.md 8z)
Owner 2026-11-19 22:30 PT: "I want more strategies and more slips to do not depend on a single startegy".
Every strategy below builds its slips from regular single-stat legs (unless said), one leg a player and a game inside a slip, ranked by the walk-forward blend
unless said. For each: ROI by season, units, drawdown, drought, chance above zero (10,000 resamples of the slates), the share of its legs that are ALSO in
the base slip of the app, and the correlation of its daily result with the base slip's.
  base        top k Unders by the blend
  baseline    top k Unders by the honest baseline (no sportsbook input)
  other-app   the OTHER app's top Unders, played here on this app's line
  one-a-prop  the best Under of each prop (points / rebounds / assists / threes / ...), then the top k of those - every leg a different prop
  prop X      top k Unders of ONE prop (points, rebounds, assists, threes_made)
  no-base     top k Unders after removing the base slip's players (the "second team")
  second-team-prop  the second team, every leg a different prop
  home / away / starters / bench / big lines / small lines   top k Unders inside that slice of the board
  overs       top k Overs
  round robin every 2-pick of the top 3 / top 4
Then PORTFOLIOS: the base plus every strategy that is positive in every season it has slips (PrizePicks: in the last two seasons) - run together.
Env: DATABASE_URL.
"""
import os
from itertools import combinations

import numpy as np
import pandas as pd
import psycopg

COMBO = ("pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double")
SEAS = ["2024-25", "2025-26", "2026-27"]
PP_PWR = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
PP_FLEX = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
UD_STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_FLEX = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
STRUCT = {"underdog": [(2, "P"), (3, "F")], "prizepicks": [(5, "F"), (6, "F"), (4, "F"), (3, "P")]}
NAME = {"underdog": {"P": "Standard", "F": "Flex"}, "prizepicks": {"P": "Power", "F": "Flex"}}
rng = np.random.default_rng(5)


def pay(app, k, st, h):
    if app == "prizepicks":
        return (PP_PWR[k] if h == k else 0.0) if st == "P" else PP_FLEX.get((k, k - h), 0.0)
    return (UD_STD[k] if h == k else 0.0) if st == "P" else UD_FLEX.get((k, k - h), 0.0)


def take(g, k, skip_players=(), diff_prop=False):
    """first k rows of the sorted frame g: one a player and a game (and a prop if diff_prop)"""
    out = []; games = set(); players = set(skip_players); props = set()
    for i, (pl, game, pr) in enumerate(zip(g["player_id"].values, g["game_id"].values, g["prop"].values)):
        if game in games or pl in players or (diff_prop and pr in props):
            continue
        out.append(i); games.add(game); players.add(pl); props.add(pr)
        if len(out) == k:
            return g.iloc[out]
    return None


def stats(rows):
    """rows: (gd, season, units of the slate, slips, any paying)"""
    t = pd.DataFrame(rows, columns=["gd", "s", "u", "n", "w"]).sort_values("gd")
    per = " / ".join(f"{100 * x['u'].sum() / x['n'].sum():+.0f}% ({x['u'].sum():+.1f} u, {int(x['n'].sum())})" if len(x) else "-" for x in (t[t["s"] == s] for s in SEAS))
    cum = np.concatenate([[0], np.cumsum(t["u"].values)]); dd = float((np.maximum.accumulate(cum) - cum).max()); dr = c = 0
    for w in t["w"].values:
        c = 0 if w else c + 1; dr = max(dr, c)
    uu = t["u"].values; nn = t["n"].values; idx = rng.integers(0, len(t), (10000, len(t))); pz = float((uu[idx].sum(1) > 0).mean())
    allpos = all(x["u"].sum() > 0 for x in (t[t["s"] == s] for s in SEAS) if len(x)); last2 = all(t[t["s"] == s]["u"].sum() > 0 for s in SEAS[1:] if (t["s"] == s).any())
    return dict(txt=f"{per} | pooled {100 * uu.sum() / nn.sum():+.1f}%, {uu.sum():+.1f} u on {int(nn.sum())} slips ({nn.mean():.1f} a slate), drawdown {dd:.1f}, drought {dr}, above zero {100 * pz:.0f}%",
                allpos=allpos, last2=last2, u=uu.sum(), t=t)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.is_under, v.line::float8 line, v.hit::int hit, v.p_blend::float8 blend,
                              v.p_honest_baseline::float8 ph, g.game_id::text game_id, (g.matchup LIKE '%%vs.%%') home, g.min::float8 mn
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.p_blend IS NOT NULL AND v.prop <> ALL(%s)""", conn, params=(list(COMBO),))
    rt = pd.read_sql("SELECT game_date::text gd, player_id::text player_id, max(role_tier) role FROM nba_score.baseline_history_h GROUP BY 1, 2", conn)
    conn.close()
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"]); d = d.merge(rt, on=["gd", "player_id"], how="left")
    print("P9|role tiers on the board: " + str(d["role"].value_counts(dropna=False).head(8).to_dict()), flush=True)
    starter = d["role"].astype(str).str.lower().str.contains("star|start|core|primary")
    for app in ("underdog", "prizepicks"):
        a = d[d["app"] == app]; o = d[d["app"] != app]
        un = a[a["is_under"]].sort_values("blend", ascending=False); ov = a[~a["is_under"]].sort_values("blend", ascending=False)
        U = {gd: g for gd, g in un.groupby("gd", sort=True)}; O = {gd: g for gd, g in ov.groupby("gd", sort=True)}
        UP = {gd: g for gd, g in un[un["ph"].notna()].sort_values("ph", ascending=False).groupby("gd", sort=True)}
        OT = {gd: g for gd, g in o[o["is_under"]].sort_values("blend", ascending=False).groupby("gd", sort=True)}
        key = {gd: {(pl, pr): i for i, (pl, pr) in enumerate(zip(g["player_id"].values, g["prop"].values))} for gd, g in U.items()}
        slices = {"home": un[un["home"] == True], "away": un[un["home"] == False], "starters": un[starter.reindex(un.index).fillna(False)],  # noqa: E712
                  "bench": un[~starter.reindex(un.index).fillna(False)], "lines 10+": un[un["line"] >= 10], "lines under 10": un[un["line"] < 10]}
        SL = {nm: {gd: g for gd, g in x.groupby("gd", sort=True)} for nm, x in slices.items()}
        for k, st in STRUCT[app]:
            print(f"\nP9|================ {app.upper()} {k}-pick {NAME[app][st]} ================ ROI 2024-25 / 2025-26 / 2026-27 (units, slips)", flush=True)
            base = {gd: take(g, k) for gd, g in U.items()}; base = {gd: c for gd, c in base.items() if c is not None}
            bleg = {gd: set(zip(c["player_id"], c["prop"])) for gd, c in base.items()}; bpl = {gd: set(c["player_id"]) for gd, c in base.items()}

            def build(nm):
                """-> {gd: [slips]} ; a slip is a frame of k legs"""
                out = {}
                for gd, g in U.items():
                    sl = []
                    if nm == "base":
                        c = base.get(gd); sl = [c] if c is not None else []
                    elif nm == "baseline":
                        c = take(UP[gd], k) if gd in UP else None; sl = [c] if c is not None else []
                    elif nm == "other-app":
                        if gd in OT:
                            t = take(OT[gd], 12); kk = key[gd]
                            if t is not None or True:
                                t = OT[gd] if t is None else t
                                ix = [kk[x] for x in zip(t["player_id"].values, t["prop"].values) if x in kk]
                                c = take(g.iloc[ix], k) if len(ix) >= k else None; sl = [c] if c is not None else []
                    elif nm == "one-a-prop":
                        c = take(g, k, diff_prop=True); sl = [c] if c is not None else []
                    elif nm.startswith("prop "):
                        c = take(g[g["prop"] == nm[5:]], k); sl = [c] if c is not None else []
                    elif nm == "no-base":
                        c = take(g, k, skip_players=bpl.get(gd, ())); sl = [c] if c is not None else []
                    elif nm == "second-team-prop":
                        c = take(g, k, skip_players=bpl.get(gd, ()), diff_prop=True); sl = [c] if c is not None else []
                    elif nm in SL:
                        c = take(SL[nm][gd], k) if gd in SL[nm] else None; sl = [c] if c is not None else []
                    elif nm == "overs":
                        c = take(O[gd], k) if gd in O else None; sl = [c] if c is not None else []
                    elif nm.startswith("round robin"):
                        N = int(nm.split()[-1]); t = take(g, N)
                        sl = [t.iloc[list(cb)] for cb in combinations(range(N), k)] if t is not None and N > k else []
                    if sl:
                        out[gd] = sl
                return out

            names = ["base", "baseline", "other-app", "one-a-prop", "prop points", "prop rebounds", "prop assists", "prop threes_made", "no-base", "second-team-prop", "home", "away",
                     "starters", "bench", "lines 10+", "lines under 10", "overs"] + ([f"round robin of the top {N}" for N in (k + 1, k + 2)] if k <= 3 else [])
            res = {}
            for nm in names:
                S = build(nm)
                rows = []; shared = tot = 0
                for gd, sl in S.items():
                    us = [pay(app, k, st, int(c["hit"].sum())) - 1 for c in sl]
                    rows.append((gd, sl[0]["season"].iloc[0], sum(us), len(us), max(us) > 0))
                    for c in sl:
                        legs = set(zip(c["player_id"], c["prop"])); tot += len(legs); shared += len(legs & bleg.get(gd, set()))
                if len(rows) < 40:
                    print(f"P9|  {nm:26s}: too few slates ({len(rows)})", flush=True); continue
                r = stats(rows); r["shared"] = shared / max(1, tot); res[nm] = r
                b = res["base"]["t"].set_index("gd")["u"]; x = r["t"].set_index("gd")["u"]; com = b.index.intersection(x.index)
                r["corr"] = float(np.corrcoef(b.loc[com], x.loc[com])[0, 1]) if nm != "base" and len(com) > 20 else 1.0
                tag = "ALL SEASONS +" if r["allpos"] else ("last two +" if r["last2"] else "")
                print(f"P9|  {nm:26s}: {r['txt']} | legs shared with base {100 * r['shared']:.0f}%, correlation {r['corr']:+.2f} {tag}", flush=True)
            crit = "allpos" if app == "underdog" else "last2"
            ok = [nm for nm in res if nm != "base" and res[nm][crit] and res[nm]["u"] > 0 and not nm.startswith("round robin")]
            print(f"P9|  PORTFOLIOS ({'positive in every season' if crit == 'allpos' else 'positive in the last two seasons'}): base + each, and base + all with under 50% shared legs", flush=True)
            sets = [(f"base + {nm}", ["base", nm]) for nm in ok] + [("base + all with < 50% shared legs", ["base"] + [nm for nm in ok if res[nm]["shared"] < 0.5])]
            for label, ms in sets:
                if len(ms) < 2:
                    continue
                t = pd.concat([res[m]["t"] for m in ms]).groupby(["gd", "s"], as_index=False).agg(u=("u", "sum"), n=("n", "sum"), w=("w", "max"))
                r = stats(list(t.itertuples(index=False, name=None))); mo = t.assign(ym=t["gd"].str[:7]).groupby("ym")["u"].sum()
                print(f"P9|    {label} [{len(ms)} slips]: {r['txt']}; losing months {(mo < 0).sum()} of {len(mo)}, worst month {mo.min():+.1f} u", flush=True)
    print("P9|DONE", flush=True)


if __name__ == "__main__":
    main()
