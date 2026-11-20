#!/usr/bin/env python3
"""
PASS 13 - RAISING THE RETURN OF THE LIVE STRATEGIES, AND FOUR NEW ANGLES. READ-ONLY. (NBA_HONEST_REBUILD.md 8ad; owner 2026-11-19 23:44 PT: "Run those ... no stop
on it until there is nothing else to look at")
  A. DID THE SPORTSBOOKS FOLLOW OUR PICKS?   the sportsbook chance of our Under at the SAME line at slip time vs at the close: if the close moves our way more
                                              often than not, the picks carry information the market did not have yet (the standard test of a real edge).
  B. WHOLE-NUMBER LINES ON PRIZEPICKS         the slips as placed (a push drops the slip one size) with and without whole-number lines in the pool.
  C. PRICE-SHOPPING ON SLEEPER / FLIFF        the qualified legs (Underdog top 2 + PrizePicks top 5, or the wider top 5 + top 8) taken by rank, by the app's multiplier,
                                              or by chance x multiplier.
  D. THE EASIEST LINE ACROSS THE TWO APPS     Unders whose line on this app is higher / equal / lower than the other app's line for the same player and prop.
  E. THE APPS' OWN MORNING -> SLIP-TIME MOVES (this season only: both boards stored): Unders whose regular line went up / stayed / went down since the morning.
  F. CALENDAR                                 the base slips without the last two weeks of the regular season; by day of week of the slate size is in pass 7.
Env: DATABASE_URL.
"""
import math
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SINGLE = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers")
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers"}
SEAS = ["2024-25", "2025-26", "2026-27"]
PP = {2: {2: 3.0}, 3: {3: 6.0}, 4: {4: 6.0, 3: 1.5}, 5: {5: 10.0, 4: 2.0, 3: 0.4}, 6: {6: 25.0, 5: 2.0, 4: 0.4}}       # 3 = Power, 4-6 = Flex, 2 = Power
PPF3 = {3: 3.0, 2: 1.0}


def per(t):
    """t: frame s, u -> text by season + total"""
    if not len(t):
        return "no slips"
    return " / ".join(f"{100 * x['u'].mean():+.0f}% ({x['u'].sum():+.1f} u, {len(x)})" if len(x) else "-" for x in (t[t["s"] == s] for s in SEAS)) + f" | total {t['u'].sum():+.1f} u, {100 * t['u'].mean():+.1f}%"


def take(g, k, extra=None):
    out = []; games = set(); players = set()
    for i, (pl, game) in enumerate(zip(g["player_id"].values, g["game_id"].values)):
        if game in games or pl in players:
            continue
        out.append(i); games.add(game); players.add(pl)
        if len(out) == k:
            return g.iloc[out]
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    q = """SELECT l.app, l.season, l.game_date::text gd, l.player_id, l.prop, l.line::float8 line, {res} res, p.p_blend::float8 blend, l.m::float8 m
           FROM nba_score.{tab} l JOIN nba_score._lr_legs_hp p ON p.app = l.app AND p.game_date = l.game_date AND p.player_id = l.player_id AND p.prop = l.prop AND p.side = l.side
                AND p.line = l.line AND p.kind = l.kind AND p.tier IS NOT DISTINCT FROM l.tier
           WHERE l.kind IN ('standard', 'R', 'main', 'alt') AND lower(left(l.side, 1)) = 'u' AND l.prop = ANY(%s) AND p.p_blend IS NOT NULL {extra}"""
    g1 = pd.read_sql(q.format(res="l.hit::int", tab="_lr_legs_h", extra="AND l.hit IS NOT NULL AND (l.app <> 'underdog' OR l.m BETWEEN 1.86 AND 1.88) AND (l.app NOT IN ('underdog','prizepicks') OR l.kind IN ('standard','R'))"),
                     conn, params=(list(SINGLE),))
    g2 = pd.read_sql(q.format(res="2", tab="_lr_legs_push", extra=""), conn, params=(list(SINGLE),))
    gl = pd.read_sql("SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'", conn).drop_duplicates(["player_id", "gd"])
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mc = pd.read_sql("""SELECT game_date::text gd, snapshot_label lab, nba_ref.norm_name(player) nm, market_key, line::float8 line, p_over_mean::float8 po
                        FROM nba_market.market_consensus WHERE snapshot_label IN ('window', 'close') AND market_key = ANY(%s) AND p_over_mean IS NOT NULL""", conn, params=(list(MK),))
    mv = pd.read_sql("""SELECT bookmaker app, game_date::text gd, snapshot_label lab, nba_ref.norm_name(player) nm, market_key, max(line)::float8 line
                        FROM nba_market.board_snapshots WHERE bookmaker IN ('underdog', 'prizepicks') AND game_date >= '2026-10-20' AND game_date < current_date
                          AND snapshot_label IN ('morning', 'window') AND market_key = ANY(%s) AND lower(left(side, 1)) = 'u'
                          AND (bookmaker <> 'underdog' OR coalesce(multiplier, 1) = 1) AND (bookmaker <> 'prizepicks' OR coalesce(odds_type, 'standard') = 'standard')
                        GROUP BY 1, 2, 3, 4, 5""", conn, params=(list(MK),)) if True else None
    import sleeper_live_slip_engine as SL
    pr = SL.pricing(conn); conn.close()
    d = pd.concat([g1, g2], ignore_index=True).merge(gl, on=["player_id", "gd"], how="left"); d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    d = d.sort_values("blend", ascending=False)
    reg = d[d["app"].isin(["underdog", "prizepicks"])]
    L = {(a, gd): g for (a, gd), g in reg.groupby(["app", "gd"], sort=False)}
    slates = sorted({gd for _a, gd in L})

    # ---------------------------------------------------------------- A
    print("P13|================ A. DID THE SPORTSBOOKS FOLLOW OUR PICKS? (sportsbook chance of our Under, same line, slip time -> close) ================", flush=True)
    mc["player_id"] = mc["nm"].map(ids); mc["prop"] = mc["market_key"].map(MK); mc = mc[mc["player_id"].notna()]
    w = mc[mc["lab"] == "window"].drop_duplicates(["gd", "player_id", "prop", "line"]).set_index(["gd", "player_id", "prop", "line"])["po"]
    c = mc[mc["lab"] == "close"].drop_duplicates(["gd", "player_id", "prop", "line"]).set_index(["gd", "player_id", "prop", "line"])["po"]
    for app, k in (("underdog", 2), ("prizepicks", 5)):
        for label, sel in (("our top legs", lambda g: take(g, k)), ("ranks 11-20 of the same list", lambda g: (lambda t: None if t is None else t.iloc[10:])(take(g, 20))),
                           ("the whole pool", lambda g: g)):
            rows = []
            for (a, gd), g in L.items():
                if a != app:
                    continue
                t = sel(g)
                if t is None:
                    continue
                for pl, prp, ln, s in zip(t["player_id"], t["prop"], t["line"], t["season"]):
                    key = (gd, pl, prp, ln)
                    if key in w.index and key in c.index:
                        rows.append((s, (1 - c[key]) - (1 - w[key])))
            t = pd.DataFrame(rows, columns=["s", "dv"])
            if len(t):
                se = t["dv"].std() / len(t) ** .5
                print(f"P13|  {app:10s} {label:28s}: legs with both numbers {len(t):,}; the close moved toward our Under by {100 * t['dv'].mean():+.2f} pts (+/- {100 * 1.96 * se:.2f}); "
                      f"moved our way {100 * (t['dv'] > .002).mean():.0f}%, against {100 * (t['dv'] < -.002).mean():.0f}%; by season "
                      + " / ".join(f"{100 * x['dv'].mean():+.2f}" if len(x) else "-" for x in (t[t["s"] == s] for s in SEAS)), flush=True)

    # ---------------------------------------------------------------- B
    print("\nP13|================ B. PRIZEPICKS AS PLACED (a push drops the slip one size): every line vs half-point lines only ================", flush=True)
    for nm, k in (("3-pick Power", 3), ("4-pick Flex", 4), ("5-pick Flex", 5), ("6-pick Flex", 6)):
        for pool in ("every line", "half-point lines only", "half-point lines first, whole numbers only to fill"):
            rows = []; npush = 0
            for (a, gd), g in L.items():
                if a != "prizepicks":
                    continue
                whole = (g["line"] % 1 == 0)
                gg = g if pool == "every line" else g[~whole] if pool.startswith("half-point lines only") else pd.concat([g[~whole], g[whole]])
                t = take(gg, k)
                if t is None:
                    continue
                live = t[t["res"] != 2]; n = len(live); h = int(live["res"].sum()); npush += int(n < k)
                pay = 1.0 if n < 2 else PP[n].get(h, 0.0) if not (n == 3 and k > 3) else PPF3.get(h, 0.0)
                rows.append((g["season"].iloc[0], pay - 1))
            t = pd.DataFrame(rows, columns=["s", "u"])
            print(f"P13|  {nm:13s} {pool:50s}: {per(t)}; slips with a push {100 * npush / max(1, len(t)):.1f}%", flush=True)

    # ---------------------------------------------------------------- C
    print("\nP13|================ C. SLEEPER / FLIFF: which of the qualified legs to take (this season, real multipliers) ================", flush=True)
    for app in ("sleeper", "fliff"):
        T = {key: g for key, g in d[(d["app"] == app) & (d["season"] == "2026-27") & (d["res"] != 2)].groupby(["gd", "player_id", "prop"], sort=False)}
        for qn, (nu, npp) in (("tight (Underdog top 2 + PrizePicks top 5)", (2, 5)), ("wide (top 5 + top 8)", (5, 8)), ("wider (top 8 + top 12)", (8, 12))):
            per_slate = {}
            for gd in slates:
                if gd < "2026-10-01":
                    continue
                src = [t for t in ((take(L[(a, gd)], n) if (a, gd) in L else None) for a, n in (("underdog", nu), ("prizepicks", npp))) if t is not None]
                if not src:
                    continue
                s = pd.concat(src).sort_values("blend", ascending=False).drop_duplicates("player_id")
                out = []; games = set()
                for pl, prp, ln, game, bl in zip(s["player_id"], s["prop"], s["line"], s["game_id"], s["blend"]):
                    g = T.get((gd, pl, prp))
                    if g is None or game in games:
                        continue
                    r = g.iloc[(g["line"] - ln).abs().values.argmin()]; out.append((int(r["res"]), float(r["m"]), bl)); games.add(game)
                per_slate[gd] = out
            allm = [o for v in per_slate.values() for o in v]
            if not allm:
                continue
            lr = np.array([h * m - 1 for h, m, _ in allm])
            print(f"P13|  {app} <- {qn}: {len(allm)} legs, hit {np.mean([h for h, _, _ in allm]):.3f}, multiplier {np.mean([m for _, m, _ in allm]):.3f}, return a leg {100 * lr.mean():+.1f}%", flush=True)
            for order, key in (("by rank (as live)", None), ("highest multiplier first", lambda o: -o[1]), ("chance x multiplier first", lambda o: -o[1] * o[2])):
                cells = []
                for k, st in ((2, "max"), (3, "max"), (4, "max"), (4, "flex"), (5, "flex"), (5, "max")):
                    if app == "fliff" and st == "flex":
                        continue
                    us = []
                    for gd, out in per_slate.items():
                        o = out if key is None else sorted(out, key=key)
                        if len(o) < k:
                            continue
                        o = o[:k]; h = sum(x[0] for x in o); ms = [x[1] for x in o]
                        pay = (math.prod(ms) * (pr[0].get(k, 1.0) if app == "sleeper" else 1.0) if h == k else 0.0) if st == "max" else float(SL.flex_tiers(ms, pr[1], pr[2]).get(h, 0.0))
                        us.append(pay - 1)
                    cells.append(f"{k}{'M' if st == 'max' else 'F'} {100 * np.mean(us):+.0f}% ({np.sum(us):+.1f} u, {len(us)})" if us else f"{k} -")
                print(f"P13|     {order:26s}: " + " | ".join(cells), flush=True)

    # ---------------------------------------------------------------- D
    print("\nP13|================ D. THE EASIEST LINE ACROSS UNDERDOG AND PRIZEPICKS (decided legs) ================", flush=True)
    dec = reg[reg["res"] != 2]
    oth = {a: dec[dec["app"] == a].drop_duplicates(["gd", "player_id", "prop"]).set_index(["gd", "player_id", "prop"])["line"] for a in ("underdog", "prizepicks")}
    for app, other, k, table in (("underdog", "prizepicks", 2, {2: 3.5}), ("prizepicks", "underdog", 5, PP[5])):
        x = dec[dec["app"] == app].copy(); ol = oth[other].reindex(pd.MultiIndex.from_frame(x[["gd", "player_id", "prop"]])).values
        x["cls"] = np.where(np.isnan(ol), "not on the other app", np.where(x["line"].values > ol + 1e-9, "this app's line HIGHER (easier Under)", np.where(x["line"].values < ol - 1e-9, "this app's line lower", "same line")))
        be = 1 / 1.8708 if app == "underdog" else 0.542
        for cls, g in x.groupby("cls"):
            print(f"P13|  {app:10s} {cls:38s}: legs {len(g):,}, hit " + " / ".join(f"{y['res'].mean():.3f}" if len(y) else "-" for y in (g[g["season"] == s] for s in SEAS))
                  + f" | all {g['res'].mean():.3f} (break-even {be:.3f}), return a leg {100 * (g['res'].mean() / be - 1):+.1f}%", flush=True)
        for nm, sel in (("top of the blend among the HIGHER-line legs", x[x["cls"].str.contains("HIGHER")]), ("top of the blend, never a lower line than the other app", x[~x["cls"].str.contains("lower")]),
                        ("base (every leg)", x)):
            rows = []
            for gd, g in sel.sort_values("blend", ascending=False).groupby("gd", sort=False):
                t = take(g, k)
                if t is not None:
                    rows.append((g["season"].iloc[0], table.get(int(t["res"].sum()), 0.0) - 1))
            print(f"P13|     {k}-pick, {nm}: {per(pd.DataFrame(rows, columns=['s', 'u']))}", flush=True)

    # ---------------------------------------------------------------- E
    print("\nP13|================ E. THE APP'S OWN LINE, MORNING -> SLIP TIME (this season) ================", flush=True)
    mv["player_id"] = mv["nm"].map(ids); mv["prop"] = mv["market_key"].map(MK); mv = mv[mv["player_id"].notna()]
    am = mv[mv["lab"] == "morning"].drop_duplicates(["app", "gd", "player_id", "prop"]).set_index(["app", "gd", "player_id", "prop"])["line"]
    x = dec[dec["season"] == "2026-27"].copy(); ml = am.reindex(pd.MultiIndex.from_frame(x[["app", "gd", "player_id", "prop"]])).values
    x["mv"] = np.where(np.isnan(ml), "not on the morning board", np.where(x["line"].values > ml + 1e-9, "line went UP since the morning", np.where(x["line"].values < ml - 1e-9, "line went DOWN", "unchanged")))
    for (app, cls), g in x.groupby(["app", "mv"]):
        be = 1 / 1.8708 if app == "underdog" else 0.542
        se = (g["res"].mean() * (1 - g["res"].mean()) / len(g)) ** .5
        print(f"P13|  {app:10s} {cls:30s}: Under legs {len(g):,}, hit {g['res'].mean():.3f} (+/- {1.96 * se:.3f}; break-even {be:.3f}), return a leg {100 * (g['res'].mean() / be - 1):+.1f}%", flush=True)

    # ---------------------------------------------------------------- F
    print("\nP13|================ F. WITHOUT THE LAST TWO WEEKS OF THE REGULAR SEASON (after March 31) ================", flush=True)
    for app, k, table in (("underdog", 2, {2: 3.5}), ("prizepicks", 5, PP[5])):
        rows = []
        for (a, gd), g in L.items():
            if a != app:
                continue
            t = take(g[g["res"] != 2], k)
            if t is not None:
                rows.append((g["season"].iloc[0], table.get(int(t["res"].sum()), 0.0) - 1, gd[5:7] == "04"))
        t = pd.DataFrame(rows, columns=["s", "u", "apr"])
        print(f"P13|  {app} top {k}: all slates {per(t)}  ||  April only {per(t[t['apr']])}  ||  without April {per(t[~t['apr']])}", flush=True)
    print("P13|DONE", flush=True)


if __name__ == "__main__":
    main()
