#!/usr/bin/env python3
"""
AUDIT - grade TODAY's slips from the LIVE box scores, with the production graders, then ROLL BACK (2026-10-20, owner 20:37 PT: "analyze
the outcomes from today, it will only be graded tomorrow, but was a losing day, you need to grade it manually with live results and
understand what went wrong and what needs to be improved").

HOW. NBA's own live box scores (cdn.nba.com liveData, the same numbers stats.nba.com publishes) for every game of the slate are put
into nba_stats.player_game_log INSIDE ONE TRANSACTION; the production graders then run on that transaction exactly as P2A runs them
(live_slip_engine.grade - PrizePicks, ud_live_slip_engine.grade - Underdog, paper_altless_tracker.grade_legs for the paper rules);
their commits are swallowed, statements that would lock a production table (ALTER TABLE / CREATE INDEX) are not sent, and the whole
transaction is ROLLED BACK at the end - tomorrow's P2A grades the slate from the official logs as always. A fresh connection then
proves production holds no box score and no graded slip for the slate.

ANALYSIS per leg: the stat vs the line and the margin, minutes, the model's number (final_hp) and the board's honest number
(board_true_hp), the leg's cell, the line's window -> close move, the game's final margin (blowout?), and per cell / per side / per
prop the hit rate against the cell's certified rate. Env: DATABASE_URL, LG_DATE (default today PT), LG_REQUIRE_FINAL (1 default).
"""
import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

D = os.environ.get("LG_DATE") or datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()


def _need(mod, pkg):
    try:
        __import__(mod)
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])


_need("requests", "requests")
import requests  # noqa: E402


def fetch_box(gid, proxy):
    url = f"https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gid}.json"
    hdr = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
           "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com"}
    last = None
    for px in ([None, proxy] if proxy else [None]):
        for _ in range(3):
            try:
                r = requests.get(url, headers=hdr, timeout=30, proxies={"https": px, "http": px} if px else None)
                if r.status_code == 200:
                    return r.json()["game"]
                last = f"HTTP {r.status_code}"
            except Exception as e:  # noqa: BLE001
                last = type(e).__name__          # never the exception text (a proxy URL could be in it)
            time.sleep(2)
    raise SystemExit(f"box score {gid} unreachable ({last})")


def minutes(s):
    m = re.match(r"PT(\d+)M([\d.]+)S", s or "")
    return round(int(m.group(1)) + float(m.group(2)) / 60, 2) if m else 0.0


class Tx:
    """the transaction every grader runs on: commits swallowed, table-locking DDL not sent"""
    def __init__(self, real):
        self.real = real

    def execute(self, q, *a, **k):
        if isinstance(q, str) and re.match(r"\s*(ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX)", q, re.I):
            return self.real.execute("SELECT 1")
        return self.real.execute(q, *a, **k)

    def commit(self):
        pass

    def rollback(self):
        pass

    def __getattr__(self, n):
        return getattr(self.real, n)


def main():
    url = os.environ["DATABASE_URL"]
    real = psycopg.connect(url, autocommit=False)
    tx = Tx(real)
    proxy = (real.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='proxy_url'").fetchone() or [""])[0]
    games = real.execute("""SELECT game_id, home_team_id, away_team_id, home_team_tricode, away_team_tricode, season FROM nba_calendar.slate_games
                            WHERE game_date = %s ORDER BY game_datetime_utc""", (D,)).fetchall()
    print(f"slate {D}: {len(games)} games", flush=True)
    rows, margins, finals = [], {}, 0
    for gid, hid, aid, htc, atc, season in games:
        g = fetch_box(gid, proxy)
        st = int(g.get("gameStatus") or 0)
        finals += int(st == 3)
        hs, as_ = g["homeTeam"]["score"], g["awayTeam"]["score"]
        margins[gid] = (f"{atc} {as_} @ {htc} {hs}", abs(hs - as_), st, g.get("gameStatusText"))
        print(f"  {gid} {atc} {as_} @ {htc} {hs} | status {st} {g.get('gameStatusText')}", flush=True)
        for side in ("homeTeam", "awayTeam"):
            t = g[side]
            for p in t.get("players", []):
                s = p.get("statistics") or {}
                mins = minutes(s.get("minutesCalculated") or s.get("minutes"))
                rows.append(dict(pid=int(p["personId"]), name=p.get("name"), team=f"nba_{t['teamId']}", gid=gid, season=season, min=mins,
                                 pts=s.get("points", 0), reb=s.get("reboundsTotal", 0), ast=s.get("assists", 0), fg3m=s.get("threePointersMade", 0),
                                 fg3a=s.get("threePointersAttempted", 0), stl=s.get("steals", 0), blk=s.get("blocks", 0), tov=s.get("turnovers", 0),
                                 fgm=s.get("fieldGoalsMade", 0), fga=s.get("fieldGoalsAttempted", 0), ftm=s.get("freeThrowsMade", 0),
                                 fta=s.get("freeThrowsAttempted", 0), oreb=s.get("reboundsOffensive", 0), dreb=s.get("reboundsDefensive", 0),
                                 pf=s.get("foulsPersonal", 0)))
    if os.environ.get("LG_REQUIRE_FINAL", "1") == "1" and finals < len(games):
        raise SystemExit(f"only {finals} of {len(games)} games are final - run again when all are")
    have = real.execute("SELECT count(*) FROM nba_stats.player_game_log WHERE game_date = %s", (D,)).fetchone()[0]
    print(f"box-score rows: {len(rows)} (played {sum(1 for r in rows if r['min'] > 0)}) | already in production for {D}: {have}", flush=True)
    if have:
        print("production already holds this slate's box scores - grading on them, nothing inserted", flush=True)
    else:
        with real.cursor() as cur:
            cur.executemany("""INSERT INTO nba_stats.player_game_log (player_id, nba_player_id, game_id, season, team_id, game_date, min, pts, reb, ast,
                               fg3m, fg3a, stl, blk, tov, fgm, fga, ftm, fta, oreb, dreb, pf, source_key, data_quality, updated_at)
                               VALUES (%(p)s, %(pid)s, %(gid)s, %(season)s, %(team)s, %(d)s, %(min)s, %(pts)s, %(reb)s, %(ast)s, %(fg3m)s, %(fg3a)s,
                                       %(stl)s, %(blk)s, %(tov)s, %(fgm)s, %(fga)s, %(ftm)s, %(fta)s, %(oreb)s, %(dreb)s, %(pf)s,
                                       'AUDIT_LIVE_BOXSCORE_ROLLED_BACK', 'live', now())""",
                            [dict(r, p=f"nba_{r['pid']}", d=D) for r in rows if r["min"] > 0])
    import live_slip_engine as LS          # noqa: E402
    import ud_live_slip_engine as UD       # noqa: E402
    print("\n=== PRIZEPICKS (live_slip_engine.grade, the P2A grader)", flush=True)
    LS.grade(tx, datetime.fromisoformat(D).date())
    print("\n=== UNDERDOG (ud_live_slip_engine.grade, the P2A grader)", flush=True)
    UD.grade(tx, datetime.fromisoformat(D).date())

    box = {r["pid"]: r for r in rows}
    honest = {}
    for pid, prop, line, side, th, fh in real.execute("""SELECT b.player_id, b.prop, b.line::float8, b.side, th.true_hp::float8, b.final_hp::float8
                                                         FROM nba_score.board_scored b LEFT JOIN nba_score.board_true_hp th USING (game_date, player_id, prop, line, side)
                                                         WHERE b.game_date = %s AND b.app = 'prizepicks'""", (D,)).fetchall():
        honest[(str(pid), prop, float(line), side)] = (th, fh)
    pgame = {str(pid): gid for pid, gid in real.execute("SELECT DISTINCT player_id, game_id FROM nba_score.final_hp WHERE game_date = %s", (D,)).fetchall()}
    STAT = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov",
            "stocks": ("stl", "blk"), "pra": ("pts", "reb", "ast"), "pts_reb": ("pts", "reb"), "pts_ast": ("pts", "ast"), "reb_ast": ("reb", "ast")}

    def stat(r, prop):
        k = STAT.get(prop)
        if k is None or r is None:
            return None
        return sum(r[x] for x in k) if isinstance(k, tuple) else r[k]

    print("\n=== PRIZEPICKS SLIPS, GRADED (rolled back)", flush=True)
    by_cell, by_side, by_prop, leg_seen = defaultdict(list), defaultdict(list), defaultdict(list), {}
    tot_stake = tot_ret = 0.0
    for strat, k, size, st, status, legs, hits, payout, profit, sw, unit in real.execute(
            """SELECT strategy, k, size, structure, status, legs_json, hits, payout, profit, stake_weight, unit_usd FROM nba_score.live_slips
               WHERE game_date = %s ORDER BY strategy, k""", (D,)).fetchall():
        staked = status in ("placed", "placed_week1_skip", "placed_week2", "placed_capped", "placed_below_min")
        print(f"\n  {strat} #{k} {size}-{st} [{status}] -> hits {hits}/{size} payout {payout} profit {profit}" + ("" if staked else "  (not staked)"), flush=True)
        if staked and status == "placed":
            tot_stake += float(sw or 1)
            tot_ret += float(sw or 1) * float(payout or 0)
        for l in legs:
            pid = str(l.get("player_id") or "")
            r = box.get(int(pid)) if pid.isdigit() else None
            v = stat(r, l["prop"])
            th, fh = honest.get((pid, l["prop"], float(l["line"]), l["side"]), (None, None))
            gid = pgame.get(pid)
            mg = margins.get(gid, ("?", None, None, None))
            res = "VOID" if l.get("hit") is None else ("HIT " if l["hit"] else "MISS")
            print(f"    {res} {l['player']:<26} {l['prop']:<11} {l['side']:<5} {l['line']:>5} -> {v} ({'min %.1f' % r['min'] if r else 'no box'}) "
                  f"| cell {l.get('cell')} | model {fh and round(fh, 3)} honest {th and round(th, 3)} | move {l.get('line_move')} | {mg[0]} (margin {mg[1]})", flush=True)
            key = (l["player"], l["prop"], l["side"], float(l["line"]))
            if key not in leg_seen and l.get("hit") is not None:
                leg_seen[key] = l["hit"]
                by_cell[l.get("cell")].append(l["hit"])
                by_side[l["side"]].append(l["hit"])
                by_prop[l["prop"]].append(l["hit"])
    print(f"\n  STAKED 'placed' slips: stake units {tot_stake:.1f} returned {tot_ret:.2f} net {tot_ret - tot_stake:+.2f}", flush=True)
    print(f"\n  DISTINCT LEGS: {len(leg_seen)} | hit {sum(leg_seen.values())} ({sum(leg_seen.values()) / max(1, len(leg_seen)):.0%})", flush=True)
    for name, grp in (("cell", by_cell), ("side", by_side), ("prop", by_prop)):
        print(f"  by {name}: " + " | ".join(f"{k_} {sum(v)}/{len(v)}" for k_, v in sorted(grp.items(), key=lambda x: str(x[0]))), flush=True)
    try:
        import build_slip_engine as SE  # noqa: E402
        certified = {c: v[5] for c, v in SE.CELLS.items()}
        print("  certified leg rate of those cells: " + " | ".join(f"{c} {certified.get(c)}" for c in sorted(by_cell, key=str)), flush=True)
    except Exception:  # noqa: BLE001
        pass

    print("\n=== UNDERDOG PAPER SLIPS, GRADED (rolled back)", flush=True)
    for pf, comp, size, st, k, legs, stake, status, remaining, hits, payout, profit in real.execute(
            """SELECT portfolio, composition, size, structure, k, legs_json, stake, status, remaining, hits, payout, profit FROM nba_score.ud_live_slips
               WHERE game_date = %s ORDER BY portfolio, composition, k""", (D,)).fetchall():
        print(f"  {pf} {comp} #{k} {size}-{st} [{status}] -> hits {hits}/{remaining} payout {payout} profit {profit}", flush=True)
        for l in legs:
            pid = str(l.get("player_id") or "")
            r = box.get(int(pid)) if pid.isdigit() else None
            res = "VOID" if l.get("hit") is None else ("HIT " if l["hit"] else "MISS")
            print(f"    {res} {l['player']:<20} {l['prop']:<10} {l['side']:<5} {l['line']:>5} -> {stat(r, l['prop'])} | cell {l.get('cell')} | factor {l.get('factor')}", flush=True)

    real.rollback()
    real.close()
    with psycopg.connect(url, autocommit=True) as v:
        after = {"player_game_log": v.execute("SELECT count(*) FROM nba_stats.player_game_log WHERE game_date = %s", (D,)).fetchone()[0],
                 "live_slips_graded": v.execute("SELECT count(*) FROM nba_score.live_slips WHERE game_date = %s AND graded_at IS NOT NULL", (D,)).fetchone()[0],
                 "ud_slips_graded": v.execute("SELECT count(*) FROM nba_score.ud_live_slips WHERE game_date = %s AND graded_at IS NOT NULL", (D,)).fetchone()[0]}
    print(f"\nPRODUCTION AFTER ROLLBACK ({D}): {after} (all must equal what was there before: box scores {have}, graded 0)", flush=True)
    ok = after["player_game_log"] == have and after["live_slips_graded"] == 0 and after["ud_slips_graded"] == 0
    print("ROLLBACK_VERIFIED" if ok else "ROLLBACK_FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
