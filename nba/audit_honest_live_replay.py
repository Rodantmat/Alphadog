#!/usr/bin/env python3
"""
PARITY OF THE LIVE ENGINE WITH THE RESEARCH (NBA_HONEST_REBUILD.md 8ab). READ-ONLY.
Replays honest_live_slip_engine.build() on every past slate of the season from what was stored that day (window boards, production's baseline_hp, the
sportsbook consensus), grades the slips on the box scores and compares with the research: per strategy slips / units / ROI, and how many of the live U1 /
P3 legs are the research's own (nba_score.honest_top_list). A push or a player who did not play voids the leg (the slip pays one size down; a 2-pick refunds).
Env: DATABASE_URL, HR_FROM (2026-10-20), HR_TO (yesterday).
"""
import datetime as dt
import json
import math
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_live_slip_engine as HL

STAT = {"points": 0, "rebounds": 1, "assists": 2, "threes_made": 3, "steals": 4, "blocks": 5, "turnovers": 6}
COLS = ["pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "fta", "ftm", "fga", "fgm", "fg3a", "oreb", "dreb", "pf"]
ALIAS = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "threes": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov",
         "free_throws_attempted": "fta", "free_throws_made": "ftm", "field_goals_attempted": "fga", "field_goals_made": "fgm", "threes_attempted": "fg3a",
         "three_pointers_attempted": "fg3a", "offensive_rebounds": "oreb", "defensive_rebounds": "dreb", "personal_fouls": "pf", "fouls": "pf",
         "pts": "pts", "reb": "reb", "ast": "ast", "stl": "stl", "blk": "blk", "tov": "tov", "fta": "fta", "ftm": "ftm", "fga": "fga", "fgm": "fgm", "fg3a": "fg3a",
         "fg3m": "fg3m", "oreb": "oreb", "dreb": "dreb", "pf": "pf", "rebs": "reb", "asts": "ast", "blks": "blk", "stls": "stl"}
UNKNOWN = set()


def stat(v, prop):
    """the box-score value of a prop (single or a sum like points_rebounds_assists / pra / blocks_steals); None = not gradable here (leg void)"""
    ix = {c: i for i, c in enumerate(COLS)}
    p = str(prop).lower()
    if p in ALIAS:
        return v[ix[ALIAS[p]]]
    combo = {"pra": "pts+reb+ast", "pr": "pts+reb", "pa": "pts+ast", "ra": "reb+ast", "stocks": "blk+stl", "two_pointers_made": None}
    if p in combo:
        if combo[p] is None:
            return v[ix["fgm"]] - v[ix["fg3m"]]
        return sum(v[ix[c]] for c in combo[p].split("+"))
    parts = [x for x in p.replace("+", "_").split("_") if x]
    names = []
    i = 0
    while i < len(parts):
        for j in range(len(parts), i, -1):
            key = "_".join(parts[i:j])
            if key in ALIAS:
                names.append(ALIAS[key]); i = j; break
        else:
            UNKNOWN.add(prop); return None
    return sum(v[ix[c]] for c in names) if names else None
PP_FLEX = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
PP_PWR = {2: 3.0}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    import sleeper_live_slip_engine as SL
    import betr_live_slip_engine as BE
    pr = SL.pricing(conn); rj = BE.rules(conn)
    d0 = dt.date.fromisoformat(os.environ.get("HR_FROM") or "2026-10-20"); d1 = dt.date.fromisoformat(os.environ.get("HR_TO") or str(dt.date.today() - dt.timedelta(days=1)))
    days = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_calendar.slate_games WHERE game_date BETWEEN %s AND %s ORDER BY 1", (d0, d1)).fetchall()]
    box = defaultdict(dict)
    for pid, gd, *st in conn.execute("SELECT nba_player_id::text, game_date, " + ", ".join(COLS) + " FROM nba_stats.player_game_log WHERE game_date BETWEEN %s AND %s AND min > 0", (d0, d1)).fetchall():
        box[gd][pid] = [float(x or 0) for x in st]
    ref = defaultdict(set)
    for app, gd, structure, legs in conn.execute("SELECT app, game_date, structure, legs FROM nba_score.honest_top_list WHERE game_date BETWEEN %s AND %s", (d0, d1)).fetchall():
        for l in (legs if isinstance(legs, list) else json.loads(legs)):
            ref[(app, gd)].add((str(l.get("player_id") or l.get("player")), l.get("prop")))
    tot = defaultdict(lambda: [0, 0.0, 0, 0]); same = defaultdict(lambda: [0, 0]); sample = True
    for day in days:
        try:
            plan, notes = HL.build(conn, day, HL.ALL_APPS)
        except Exception as e:  # noqa: BLE001
            conn.rollback(); print(f"HR|{day}: build failed ({type(e).__name__}: {str(e)[:200]})", flush=True); continue
        if sample:
            for x in notes:
                print(f"HR|sample notes {x}", flush=True)
            sample = False
        line = []
        for app, slips in plan.items():
            for code, k, st, s, _c in slips:
                res = []
                for r in s:
                    v = box[day].get(r["pid"])
                    x = None if v is None else stat(v, r["prop"])
                    res.append(None if x is None or x == r["line"] else int(x < r["line"]))
                live = [(h, r) for h, r in zip(res, s) if h is not None]; n = len(live); h = sum(x for x, _ in live); ms = [float(r["leg"].get("m") or 1.0) for _, r in live]
                if n < 2:
                    pay = 1.0
                elif app == "underdog":
                    pay = 1.0 if n < k else ({(4, 4): 7.2, (4, 3): 1.4, (3, 3): 3.25, (3, 2): 1.09}.get((n, h), 0.0) if st == "flex" else ((3.5 if k == 2 else 6.5) if h == n else 0.0))
                elif app == "prizepicks":
                    pay = (PP_PWR[2] if h == 2 else 0.0) if n == 2 else (6.0 if h == 3 else 0.0) if (st == "power" and n == 3) else PP_FLEX.get((n, n - h), 0.0)
                elif app == "fliff":
                    pay = math.prod(ms) if h == n else 0.0
                elif app == "sleeper":
                    pay = (math.prod(ms) * pr[0].get(n, 1.0) if h == n else 0.0) if st == "max" or n < 3 else float(SL.flex_tiers(ms, pr[1], pr[2]).get(h, 0.0))
                else:
                    pay = float(rj["perfect_all_less"].get(str(n), 0.0)) if h == n else 0.0
                t = tot[code]; t[0] += 1; t[1] += pay - 1; t[2] += h; t[3] += n; line.append(f"{code} {pay - 1:+.1f}")
                if code in ("U1", "P3", "P9"):
                    rf = ref.get((app, day))
                    if rf:
                        same[code][0] += sum((r["pid"], r["prop"]) in rf for r in s); same[code][1] += len(s)
        print(f"HR|{day}: " + " | ".join(line), flush=True)
    print("HR|================ season replay of the live engine ================", flush=True)
    for code in sorted(tot, key=lambda c: (c[0], int(c[1:]))):
        n, u, h, m = tot[code]
        print(f"HR|  {code}: slips {n}, units {u:+.1f}, ROI {100 * u / max(1, n):+.1f}%, legs hit {h}/{m} ({100 * h / max(1, m):.1f}%)"
              + (f" | legs that are the research's own: {same[code][0]}/{same[code][1]} ({100 * same[code][0] / max(1, same[code][1]):.0f}%)" if code in same else ""), flush=True)
    for pre, nm in (("U", "Underdog"), ("P", "PrizePicks"), ("S", "Sleeper"), ("F", "Fliff"), ("B", "Betr")):
        n = sum(v[0] for c, v in tot.items() if c[0] == pre); u = sum(v[1] for c, v in tot.items() if c[0] == pre)
        print(f"HR|  {nm}: slips {n}, units {u:+.1f}, ROI {100 * u / max(1, n):+.1f}%", flush=True)
    if UNKNOWN:
        print(f"HR|props not gradable from the box score (legs voided): {sorted(UNKNOWN)}", flush=True)
    print("HR|DONE", flush=True)


if __name__ == "__main__":
    main()
