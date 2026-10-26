#!/usr/bin/env python3
"""
PROBE - TODAY'S FLIFF PICK'EM 2-PICK MAX (owner 2026-10-26 14:22 PT: Fliff option 2 "deploy that ... give me the slip for today").
Rule (research_sleeper_small, ST_APP=fliff runs 40397712309 / 40397717134): Underdog portfolio T unit T1's qualified legs, priced at
FLIFF PICK'EM's own main line and multiplier (public Pick'Em feed, no login), our final_hp >= 0.56, Fliff multiplier <= 1.85, ordered by
final_hp, the top leg skipped, one leg per game -> one 2-pick Max (pays the product of the two multipliers - Fliff's official rules).
Also checks which option_type is Over: on every card with both sides, the side the sportsbooks make more likely must carry the lower
multiplier. Read-only (no account, nothing placed). Env: DATABASE_URL, PROXY_URL.
"""
import datetime as dt
import json
import os
import sys
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["ST_APP"] = "fliff"
import probe_fliff_pickem_quote as Q                 # noqa: E402
import research_app_final_strategies as AF          # noqa: E402
import research_sleeper_deep as RSD                  # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402
import sleeper_live_slip_engine as SL                # noqa: E402

CAT = {"1060": "points", "1031": "rebounds", "1058": "assists", "1032": "threes_made", "1033": "pra", "1034": "reb_ast",
       "1035": "pts_reb", "1036": "pts_ast", "1037": "steals", "1059": "blocks", "1038": "stocks"}
FLOOR, MCAP, SKIP = 0.56, 1.85, 1


def board(fc, host):
    st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetLeagues__Request"})
    nba = [lg["id"] for lg in json.loads(t)["result"]["response"]["collections"]["page"] if str(lg.get("abbreviation")).upper() == "NBA"][0]
    st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetGames__Request", "variables": {"filter": {"league": nba}}})
    games = {}
    for g in json.loads(t)["result"]["response"]["games"]["page"]:
        r = g["game_render_data"]
        games[r["id"]] = (r["away_team"]["abbreviation"], r["home_team"]["abbreviation"], r["start_time_stamp_utc_millis"])
    out = []
    for gid in games:
        for cid, prop in CAT.items():
            st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetCards__Request",
                                     "variables": {"filter": {"league": nba, "games": [gid], "prop_categories": [f"fkey__sk_prop_category__{cid}"]}}})
            try:
                packs = json.loads(t)["result"]["response"].get("cards_packs") or []
            except Exception:  # noqa: BLE001
                continue
            for pk in packs:
                for cd in pk.get("cards") or []:
                    pr = cd.get("player_prop_render_data") or {}
                    if not pr.get("name"):
                        continue
                    for o in (cd.get("betting_options") or {}).get("options") or []:
                        if o.get("is_main_line") and o.get("option_type") in (0, 1) and o.get("status") == 0:
                            out.append({"name": pr["name"], "prop": prop, "line": float(o["line"]), "ot": o["option_type"],
                                        "m": float(o["eu_odds"]), "game": gid, "match": f"{games[gid][0]}@{games[gid][1]}", "tip": games[gid][2]})
    return games, out


def main():
    day = dt.datetime.now(ZoneInfo("America/Los_Angeles")).date()
    fc = Q.FliffClient(proxy=Q.PROXY)
    fc.ping()
    games, fb = board(fc, fc.ping_data.get("skipper_public_feed_endpoint"))
    print(f"FLIFF PICK'EM {day}: {len(games)} games, {len(fb)} main-line options", flush=True)
    with SL.connect() as conn:
        names = sorted({x["name"] for x in fb})
        pid = dict(conn.execute("""SELECT n, nm.player_id::text FROM unnest(%s::text[]) n
                                   JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(n)""", (names,)).fetchall())
        print(f"players named {len(names)}, mapped {len(pid)}", flush=True)
        # side check: option_type 0 = Over?  the sportsbooks' more likely side must carry the lower multiplier
        _sl, mk, _ml, _a, _b = RSD.load(conn, day)
        agree = n = 0
        by = {}
        for x in fb:
            by.setdefault((x["name"], x["prop"], x["line"]), {})[x["ot"]] = x["m"]
        for (nm, prop, line), s in by.items():
            p = pid.get(nm)
            po = mk.get((p, prop, "Over", line))
            if p and po and 0 in s and 1 in s and s[0] != s[1]:
                pov = sum(po) / len(po)
                if abs(pov - 0.5) > 0.03:
                    n += 1
                    agree += int((pov > 0.5) == (s[0] < s[1]))
        print(f"SIDE CHECK: option_type 0 = Over on {agree}/{n} cards where the books lean (0 = Under would be {n - agree}/{n})", flush=True)
        over0 = agree >= n - agree
        legs, rows = AF.load_ud(conn, day, {})
        c, gc = ST.ud_lists(rows, legs)["T1"]
        fl = {}
        for x in fb:
            side = ("Over" if x["ot"] == 0 else "Under") if over0 else ("Under" if x["ot"] == 0 else "Over")
            p = pid.get(x["name"])
            if p:
                fl[(p, x["prop"], side)] = x
        tm = SL.teams_of(conn, {str(x["player_id"]) for x in c if x.get("player_id") is not None}, day)
        priced = []
        for src in c:
            p = str(src["player_id"]) if src.get("player_id") is not None else None
            f = fl.get((p, src["prop"], src["side"]))
            if f is None:
                continue
            priced.append({"pid": p, "name": f["name"], "prop": src["prop"], "side": src["side"], "line": f["line"], "m": f["m"],
                           "p": float(src["p"]), "team": tm.get(p), "game": f["game"], "match": f["match"], "ud_line": float(src["line"])})
        print(f"T1 qualified {len(c)}, on Fliff Pick'Em {len(priced)}", flush=True)
        cand = [l for l in sorted(priced, key=lambda x: -x["p"]) if l["p"] >= FLOOR and l["m"] <= MCAP]
        print("\nCANDIDATES (final_hp order; the first is skipped by the rule):")
        for l in cand[:10]:
            print(f"   {l['name']:<24} {l['prop']:<11} {l['side']:<5} {l['line']:>5} @{l['m']:.2f}  hp {100 * l['p']:.1f}%  {l['match']}"
                  f"  (Underdog line {l['ud_line']})")
        s = ST.pick(cand[SKIP:], 2, gc)
        if s is None:
            print("\nNO FLIFF SLIP TODAY - fewer than 2 qualifying legs in different games")
            return
        mult = s[0]["m"] * s[1]["m"]
        tip = min(games[l["game"]][2] for l in s)
        print(f"\nTODAY'S FLIFF 2-PICK MAX: x{mult:.3f} | place by {dt.datetime.fromtimestamp(tip / 1000, ZoneInfo('America/Los_Angeles')):%I:%M %p} PT")
        for l in s:
            print(f"   {l['name']} - {l['prop']} {l['side']} {l['line']} @{l['m']:.2f} (hp {100 * l['p']:.1f}%, {l['match']})")


if __name__ == "__main__":
    main()
