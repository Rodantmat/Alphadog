#!/usr/bin/env python3
"""
HONEST REFEREE - the daily out-of-sample scoreboard of the NBA system at REAL prices (NBA_HONEST_REBUILD.md section 8f; owner D6 / D7).
Why: every strategy was certified on a history with a look-ahead (proven 2026-11-19). The live season is honest by construction, so the only trustworthy
proof of an edge is what accumulates day by day on real boards at real prices. This script measures it and writes the scoreboard; it changes nothing live.
Inputs (all already graded): nba_score._lr_legs_h (board legs with real / app prices; refreshed by research_leg_roi_cache.py + research_legs_h_build.py),
nba_score._lr_app_legs (the production probability shown on the board, final_hp), nba_market.pp_mined_leg (REAL PrizePicks quotes for goblins / demons),
nba_market.market_consensus (sportsbook chance, window), and the live slip tables.
For this season to date and the last 7 slates, per app:
  board      every board leg by kind: legs, hit rate, return at the app's price     (PrizePicks goblin / demon: real-quoted rungs only, rule C9)
  system     legs the PRODUCTION number rates positive (final_hp x price - 1 > 0): legs a slate, predicted, real  -> is the board's leg ROI honest?
  top-tenth  the production number's top tenth of regular / standard legs: hit rate against all legs  -> does the model rank at all?
  book       legs the sportsbook rates positive at the app's price (exact line; all and >= 2 books): predicted, real  -> the only signal found so far
  played     UNIQUE legs on graded live slips: legs, hit rate (+- se), and the slips' units  -> what is actually being played
An EDGE counts only when the 90% range (re-drawing slates) is above zero on the season window with at least 300 legs. The script prints a verdict line per
app and writes all rows to nba_score.honest_referee (run_date, app, win, metric, legs, slates, predicted, real, lo, hi).
Env: DATABASE_URL, HR_SINCE (2026-10-20), HR_WRITE (1).
"""
import os

import numpy as np
import pandas as pd
import psycopg

import research_legs_h_build as LH

SINCE = os.environ.get("HR_SINCE") or "2026-10-20"
WRITE = (os.environ.get("HR_WRITE") or "1") == "1"
BASE = 0.542
rng = np.random.default_rng(19)
ROWS = []


def boot(r, days):
    u = np.unique(days)
    if len(u) < 3 or len(r) < 5:
        return (None, None)
    by = {d: r[days == d] for d in u}
    bs = [np.concatenate([by[d] for d in rng.choice(u, len(u))]).mean() for _ in range(400)]
    return float(np.quantile(bs, .05)), float(np.quantile(bs, .95))


def put(app, win, metric, x, rcol="r", pcol=None):
    if not len(x):
        ROWS.append((app, win, metric, 0, 0, None, None, None, None)); print(f"HR|{app:10s} {win:6s} {metric:34s} none", flush=True); return None
    lo, hi = boot(x[rcol].values.astype(float), x["gd"].values); real = float(x[rcol].mean()); pred = None if pcol is None else float(x[pcol].mean()); ns = x["gd"].nunique()
    ROWS.append((app, win, metric, len(x), ns, pred, real, lo, hi))
    hit = f" hit {x['hit'].mean():.3f}" if "hit" in x.columns else ""
    print(f"HR|{app:10s} {win:6s} {metric:34s} legs {len(x):7,} ({len(x) / ns:6.1f} a slate, {ns} slates){hit}" + ("" if pred is None else f" predicted {100 * pred:+6.1f}%") +
          f" real {100 * real:+6.1f}%" + ("" if lo is None else f" [{100 * lo:+.1f}% .. {100 * hi:+.1f}%]"), flush=True)
    return (len(x), real, lo, hi)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, books, p_over_mean::float8 po
                        FROM nba_market.market_consensus WHERE snapshot_label = 'window' AND game_date >= %s AND market_key = ANY(%s)""", conn, params=(SINCE, list(LH.MK)))
    mc["player_id"] = mc["nm"].map(ids); mc["prop"] = mc["market_key"].map(LH.MK)
    mc = mc[mc["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop", "line"])[["gd", "player_id", "prop", "line", "books", "po"]]
    legs = pd.read_sql("""SELECT app, src, game_date::text gd, player_id, prop, side, line::float8 line, kind, tier, m::float8 m, hit::int hit
                          FROM nba_score._lr_legs_h WHERE game_date >= %s AND hit IS NOT NULL AND m > 0 AND src = 'real'""", conn, params=(SINCE,))
    sysl = pd.read_sql("""SELECT app, game_date::text gd, player player_id, prop, side, line::float8 line, tier, kind, m::float8 m, p::float8 p, hit::int hit
                          FROM nba_score._lr_app_legs WHERE game_date >= %s AND src = 'real' AND hit IS NOT NULL AND p IS NOT NULL""", conn, params=(SINCE,))
    # PrizePicks goblins / demons at REAL quotes
    q = pd.read_sql("""SELECT left(b.start_time, 10) gd, nba_ref.norm_name(m.player) nm, m.base_market, m.line::float8 line, m.side, m.two_pick_power::float8 p2, m.quoted_at
                       FROM nba_market.pp_mined_leg m JOIN nba_market.pp_board_row b ON b.run_file = m.run_file AND b.projection_id = m.projection_id
                       WHERE m.two_pick_power > 0 AND m.base_market = ANY(%s)""", conn, params=(list(LH.MK),))
    q = q.sort_values("quoted_at").drop_duplicates(["gd", "nm", "base_market", "line", "side"], keep="last")
    q["player_id"] = q["nm"].map(ids); q["prop"] = q["base_market"].map(LH.MK); q["real_m"] = (q["p2"] / 2.99) ** (1 / 0.904)
    verdict = {}
    for app in ("prizepicks", "underdog", "sleeper", "fliff"):
        d = legs[legs["app"] == app].copy()
        if not len(d):
            print(f"HR|{app}: no graded legs since {SINCE}", flush=True); continue
        d["over"] = d["side"].str.lower().str[0].isin(["o", "m", "h"])
        if app == "prizepicks":
            std = d[d["kind"] == "standard"].copy(); std["mm"] = 1 / BASE
            alt = d[d["kind"] != "standard"].merge(q[["gd", "player_id", "prop", "line", "side", "real_m"]], on=["gd", "player_id", "prop", "line", "side"], how="inner")
            alt["mm"] = alt["real_m"] / BASE; d = pd.concat([std, alt], ignore_index=True)
        else:
            d["mm"] = d["m"]; d["kind"] = d["kind"].map({"R": "standard", "F": "goblin", "B": "demon", "main": "standard", "alt": "alt"}).fillna("standard")
        d["r"] = d["hit"] * d["mm"] - 1
        d = d.merge(mc, on=["gd", "player_id", "prop", "line"], how="left"); d["pb"] = np.where(d["over"], d["po"], 1 - d["po"]); d["br"] = d["pb"] * d["mm"] - 1
        days = np.array(sorted(d["gd"].unique())); last7 = set(days[-7:])
        s = sysl[sysl["app"] == ("pp26" if app == "prizepicks" else app)].copy()
        if len(s):
            s["mm"] = (1 / BASE) if app == "prizepicks" else s["m"] * (1.8708 if app == "underdog" else 1.0)
            s["r"] = s["hit"] * s["mm"] - 1; s["pred"] = s["p"] * s["mm"] - 1
        print(f"\nHR|================ {app.upper()} since {SINCE}: {len(days)} slates ({days[0]} .. {days[-1]}) ================", flush=True)
        for win, f in (("season", lambda x: x), ("last7", lambda x: x[x["gd"].isin(last7)])):
            for k in sorted(d["kind"].unique()):
                put(app, win, f"board {k}", f(d[d["kind"] == k]))
            if len(s):
                v = put(app, win, "system rates positive", f(s[s["pred"] > 0]), pcol="pred")
                if win == "season":
                    verdict[(app, "system")] = v
                st = f(s[s["tier"].astype(str).str[:1].isin(["R", ""]) | (s["kind"].astype(str).isin(["standard", "main"]))]) if app != "prizepicks" else f(s)
                if len(st) >= 200:
                    cut = st["p"].quantile(.9); top = st[st["p"] >= cut]
                    print(f"HR|{app:10s} {win:6s} top-tenth of regular legs by the system: says {top['p'].mean():.3f} hits {top['hit'].mean():.3f} (n {len(top):,}), return at its price {100 * top['r'].mean():+.1f}%; all regular legs hit {st['hit'].mean():.3f}, return {100 * st['r'].mean():+.1f}%", flush=True)
                    ROWS.append((app, win, "system top tenth hit (pred = says)", len(top), top["gd"].nunique(), float(top["p"].mean()), float(top["hit"].mean()), float(st["hit"].mean()), None))
            if len(s):                                       # the one lead (section 8f): regular Unders the system likes most
                un = f(s[(~s["side"].str.lower().str[0].isin(["o", "m", "h"])) & (s["tier"].astype(str).str[:1].isin(["R", ""]) | s["kind"].astype(str).isin(["standard", "main"]))])
                if len(un) >= 100:
                    put(app, win, "regular Unders, system top fifth", un[un["p"] >= un["p"].quantile(.8)], pcol="pred")
                    put(app, win, "regular Unders, all", un)
            v = put(app, win, "book rates positive (exact line)", f(d[d["br"] > 0]), pcol="br")
            v2 = put(app, win, "book rates positive, >= 2 books", f(d[(d["br"] > 0) & (d["books"] >= 2)]), pcol="br")
            if win == "season":
                verdict[(app, "book")] = v2
    # what is actually played: unique legs on graded live slips + slip units
    print("\nHR|================ PLAYED (graded live slips) ================", flush=True)
    for app, tbl in (("prizepicks", "live_slips"), ("underdog", "ud_live_slips"), ("sleeper", "sleeper_live_slips"), ("fliff", "fliff_live_slips"), ("betr", "betr_live_slips")):
        try:
            sl = pd.read_sql(f"SELECT status, count(*) slips, sum(profit)::float8 units FROM nba_score.{tbl} WHERE game_date >= %s AND hits IS NOT NULL AND profit IS NOT NULL GROUP BY 1", conn, params=(SINCE,))
            lg_ = pd.read_sql(f"""SELECT DISTINCT s.game_date::text gd, s.status, coalesce(e->>'player_id', e->>'player') pl, e->>'prop' prop, e->>'side' side, e->>'line' ln, (CASE WHEN e->>'hit' IN ('true', '1', '1.0') THEN 1 ELSE 0 END)::float8 hit
                                  FROM nba_score.{tbl} s, jsonb_array_elements(s.legs_json::jsonb) e
                                  WHERE s.game_date >= %s AND s.hits IS NOT NULL AND s.profit IS NOT NULL AND e->>'hit' IN ('true', 'false', '0', '1', '0.0', '1.0')
                                    AND coalesce(e->>'void', 'false') NOT IN ('true', 'dnp', '1')""", conn, params=(SINCE,))
        except Exception as ex:
            conn.rollback(); print(f"HR|{app}: live table not readable ({str(ex)[:120]})", flush=True); continue
        for st_, g in lg_.groupby("status"):
            row = sl[sl["status"] == st_]; n = len(g); h = g["hit"].mean(); se = np.sqrt(h * (1 - h) / max(1, n))
            u = float(row["units"].iloc[0]) if len(row) else float("nan"); ns = int(row["slips"].iloc[0]) if len(row) else 0
            print(f"HR|{app:10s} {st_:22s} slips {ns:5,} units {u:+8.1f} | unique legs {n:5,} hit {h:.3f} (+- {se:.3f})", flush=True)
            ROWS.append((app, "season", f"played {st_} unique-leg hit (pred = slips, lo = units)", n, g["gd"].nunique(), float(ns), float(h), u, float(se)))
    print("\nHR|================ VERDICT (edge = 90% range above zero on the season window with >= 300 legs) ================", flush=True)
    for (app, what), v in sorted(verdict.items()):
        if v is None or v[2] is None:
            txt = "not enough legs"
        else:
            txt = ("EDGE" if (v[2] > 0 and v[0] >= 300) else "no proven edge") + f": {v[0]:,} legs, real {100 * v[1]:+.1f}% [{100 * v[2]:+.1f}% .. {100 * v[3]:+.1f}%]"
        print(f"HR|{app:10s} {what:7s} {txt}", flush=True)
    if WRITE:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.honest_referee (run_date date DEFAULT current_date, app text, win text, metric text, legs int, slates int,
                           predicted float8, real float8, lo float8, hi float8, built_at timestamptz DEFAULT now())""")
            cur.execute("DELETE FROM nba_score.honest_referee WHERE run_date = current_date")
            cur.executemany("INSERT INTO nba_score.honest_referee (app, win, metric, legs, slates, predicted, real, lo, hi) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)", ROWS)
        conn.commit(); print(f"HR|wrote {len(ROWS)} rows to nba_score.honest_referee", flush=True)
    conn.close()
    print("HR|DONE", flush=True)


if __name__ == "__main__":
    main()
