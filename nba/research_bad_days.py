#!/usr/bin/env python3
"""
WHAT CHANGES ON THE BAD DAYS (owner 2026-11-23 21:58 PT: "What changes on the bad days? Any specific characteristics and aspects that change on droughts
and bad days?"). READ-ONLY. Replays honest_live_slip_engine.build() on every slate, takes every leg the day's slips used (and the top 30 of every ranked
list the slips drew from), grades it on the box score and prints one line per leg with what was known BEFORE the game (line, prop, rankers, home, starter,
the game's spread and total, rest days, slate size) and what happened (minutes vs the player's last-10 average, game margin, game total vs the market total,
overtime). Analysis is done offline on these lines (BD|leg ...), joined with the day P&L of the live-set replay.
Env: DATABASE_URL, HR_FROM, HR_TO.
"""
import datetime as dt
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_live_slip_engine as HL                                  # noqa: E402
import audit_honest_live_replay as RP                                 # noqa: E402

FULL = {"ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets", "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
        "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons", "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
        "LAC": "Los Angeles Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies", "MIA": "Miami Heat", "MIL": "Milwaukee Bucks",
        "MIN": "Minnesota Timberwolves", "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder", "ORL": "Orlando Magic",
        "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns", "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
        "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards"}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d0 = dt.date.fromisoformat(os.environ.get("HR_FROM") or "2026-10-20"); d1 = dt.date.fromisoformat(os.environ.get("HR_TO") or str(dt.date.today() - dt.timedelta(days=1)))
    days = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_calendar.slate_games WHERE game_date BETWEEN %s AND %s ORDER BY 1", (d0, d1)).fetchall()]
    log = defaultdict(list)                      # pid -> [(date, min, team_id, game_id)] (season, for last-10 minutes and rest)
    box = defaultdict(dict)
    for row in conn.execute("SELECT nba_player_id::text, game_date, min, team_id::text, game_id::text, " + ", ".join(RP.COLS) +
                            " FROM nba_stats.player_game_log WHERE game_date BETWEEN %s AND %s ORDER BY game_date", (d0 - dt.timedelta(days=40), d1)).fetchall():
        log[row[0]].append((row[1], float(row[2] or 0), row[3], row[4]))
        if row[1] >= d0 and float(row[2] or 0) > 0:
            box[row[1]][row[0]] = (float(row[2] or 0), row[3], row[4], [float(x or 0) for x in row[5:]])
    # game results (team points, minutes) and the market spread / total per game
    gres = {}
    for gid, tid, pts, mins in conn.execute("SELECT game_id::text, team_id::text, sum(pts), sum(min) FROM nba_stats.player_game_log WHERE game_date BETWEEN %s AND %s GROUP BY 1,2", (d0, d1)).fetchall():
        gres.setdefault(gid, {})[tid] = (float(pts or 0), float(mins or 0))
    sg = {}
    for gid, gd, h, a, htc, atc in conn.execute("SELECT game_id::text, game_date, home_team_id::text, away_team_id::text, home_team_tricode, away_team_tricode FROM nba_calendar.slate_games WHERE game_date BETWEEN %s AND %s", (d0, d1)).fetchall():
        sg[gid] = (gd, h, a, htc, atc)
    mk = {}
    for gd, home, market, outcome, point in conn.execute("""SELECT game_date, home_team, market, lower(outcome), percentile_cont(0.5) WITHIN GROUP (ORDER BY point)
            FROM nba_market.game_lines_snapshots WHERE market IN ('totals','spreads') AND game_date BETWEEN %s AND %s GROUP BY 1,2,3,4""", (d0, d1)).fetchall():
        mk[(gd, home, market, outcome)] = float(point) if point is not None else None
    print(f"BD|slates {len(days)}", flush=True)
    for day in days:
        HL.PICKED.clear() if hasattr(HL, "PICKED") else None
        try:
            plan, notes = HL.build(conn, day, HL.ALL_APPS)
        except Exception as e:  # noqa: BLE001
            conn.rollback(); print(f"BD|{day}: build failed {type(e).__name__}: {str(e)[:150]}", flush=True); continue
        used = defaultdict(lambda: [0, set(), set()])     # (pid, prop, line) -> slips, apps, codes
        rowsof = {}
        for app, slips in plan.items():
            for code, k, st, s, cand in slips:
                for r in s:
                    u = used[(r["pid"], r["prop"], r["line"])]; u[0] += 1; u[1].add(app); u[2].add(code); rowsof[(r["pid"], r["prop"], r["line"])] = r
        pool = {}
        for lst, _kw in getattr(HL, "PICKED", {}).values():
            for i, r in enumerate(lst[:30]):
                key = (r["pid"], r["prop"], r["line"])
                pool[key] = min(pool.get(key, 99), i + 1); rowsof.setdefault(key, r)
        ngames = len({g for g, v in sg.items() if v[0] == day})
        for key, r in rowsof.items():
            pid, prop, line = key
            b = box[day].get(pid)
            if b is None:
                continue
            mins, tid, gid, v = b
            x = RP.stat(v, prop)
            if x is None or x == line:
                continue
            hit = int(x < line)
            prev = [m for (d, m, _t, _g) in log[pid] if d < day and m > 0][-10:]
            avgm = sum(prev) / len(prev) if prev else None
            last = [d for (d, m, _t, _g) in log[pid] if d < day]
            rest = (day - last[-1]).days if last else None
            gr = gres.get(gid, {}); my = gr.get(tid, (None, None)); opp = [vv for t2, vv in gr.items() if t2 != tid]
            margin = (my[0] - opp[0][0]) if (my[0] is not None and opp) else None
            tot = (my[0] + opp[0][0]) if (my[0] is not None and opp) else None
            ot = int((my[1] or 0) >= 262)
            g = sg.get(gid)
            spread = total = None
            if g:
                hname = FULL.get(g[3])
                total = mk.get((day, hname, "totals", "over"))
                hs = mk.get((day, hname, "spreads", (FULL.get(g[3]) or "").lower()))
                spread = (hs if tid == g[1] else (-hs if hs is not None else None)) if hs is not None else None
            u = used.get(key)
            print("BD|leg " + "|".join(str(z) for z in (
                day, pid, prop, line, hit, round(x - line, 1), u[0] if u else 0, ",".join(sorted(u[1])) if u else "", ",".join(sorted(u[2])) if u else "",
                pool.get(key, ""), round(r.get("blend") or 0, 4), round(r.get("ph") or 0, 4), round(r.get("pb") or 0, 4) if r.get("pb") else "",
                int(bool(r.get("home"))), int(bool(r.get("starter"))), round(mins, 1), round(avgm, 1) if avgm else "", rest if rest is not None else "",
                margin if margin is not None else "", tot if tot is not None else "", total if total is not None else "", spread if spread is not None else "", ot, ngames)), flush=True)
    print("BD|DONE", flush=True)


if __name__ == "__main__":
    main()
