#!/usr/bin/env python3
"""RESEARCH - WHY PORTFOLIO B BUILT WHAT IT BUILT ON A SLATE (2026-10-27; owner 13:45 PT: "no PrizePicks??? How come that can be
right"). READ-ONLY. Rebuilds portfolio B's prepared board exactly as live_slip_engine.pick() does (load_board_legs -> the calibrated
pool -> portfolio_b.prepare with pb_rates) and, per unit, prints the candidate count after each of the unit's filters, how many games
the candidates span, and the slip it would build (or why none). Also prints, for the slates already played this season, how many
units built a slip, with the slate's game count. Env: DATABASE_URL, PB_DAYS (comma list, default today PT)."""
import datetime as dt
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L   # noqa: E402
import portfolio_b as PB       # noqa: E402


def explain(prepared, uid):
    kind, prm, size, st = PB.UNITS[uid]
    steps = []
    if kind == "f":
        th, sd, _ = prm
        a = [l for l in prepared if l["tier"] == "R"]; steps.append(("standard lines", a))
        b = [l for l in a if l["side"] == sd]; steps.append((f"side {sd}", b))
        c = [l for l in b if float(l["p"]) >= th]; steps.append((f"final_hp >= {th}", c))
        gc = 2
    elif kind == "b1":
        pool, side, ps, rk, mp, gc, tp = prm
        a = [l for l in prepared if l["tier"] in PB.POOLS[pool]]; steps.append((f"lines {pool}", a))
        b = [l for l in a if l["side"] in PB.SIDES[side]]; steps.append((f"side {side}", b))
        c = [l for l in b if ps == "all" or l["_grp"] == ps]; steps.append((f"props {ps}", c))
        d = [l for l in c if l["p"] >= mp]; steps.append((f"final_hp >= {mp}", d))
        steps.append((f"skip top {tp}", PB.candidates(prepared, uid)[0]))
    else:
        lv, side, ps, rk, lp, pc, gc = prm
        a = [l for l in prepared if l["tier"] == lv]; steps.append((f"lines {lv}", a))
        b = [l for l in a if l["side"] in PB.SIDES[side]]; steps.append((f"side {side}", b))
        c = [l for l in b if ps == "all" or l["_grp"] == ps]; steps.append((f"props {ps}", c))
        steps.append((f"line {lp} vs slate median", PB.candidates(prepared, uid)[0]))
    cand, gcap, pcap = PB.candidates(prepared, uid)
    games = {l["event_id"] for l in cand}
    players = {l["player"] for l in cand}
    slip = PB.unit_slip(prepared, uid)
    print(f"  {uid} ({size}-pick {st}, <= {gcap} a game{', prop-group cap ' + str(pcap) if pcap else ''}):")
    for name, xs in steps:
        print(f"      {name:<28} {len(xs):4d} legs, {len({l['player'] for l in xs}):3d} players, {len({l['event_id'] for l in xs})} games")
    if slip:
        print("      -> SLIP: " + "; ".join(f"{l['player']} {l['prop']} {l['side']} {float(l['line']):g} ({100 * float(l['p']):.0f}%)" for l in slip))
    else:
        need_games = -(-size // gcap)
        why = (f"only {len(games)} game(s) with candidates, {size} picks at <= {gcap} a game need >= {need_games}" if len(games) < need_games
               else f"only {len(players)} distinct players" if len(players) < size else "game / team rules left fewer than the size")
        print(f"      -> NO SLIP: {why}")


def main():
    days = [dt.date.fromisoformat(x) for x in (os.environ.get("PB_DAYS") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()).split(",") if x]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    for day in days:
        legs = L.load_board_legs(conn, day)
        if not legs:
            print(f"{day}: no scored window board"); continue
        calib = [dict(l, p=float(l["score"]), cell=f"{l['prop']}_{l['tier']}") for l in legs
                 if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
        prepared = PB.prepare(calib, L.pb_rates(conn, day))
        ng = conn.execute("SELECT count(*) FROM nba_calendar.slate_games WHERE game_date=%s", (day,)).fetchone()[0]
        print(f"{day}: {ng} games on the slate; {len(legs)} scored board legs, {len(calib)} calibrated, {len(prepared)} eligible for B")
        for uid in PB.UNITS:
            explain(prepared, uid)
    print("\nPORTFOLIO B THIS SEASON - units that built a slip vs slate size")
    rows = conn.execute("""SELECT s.game_date, (SELECT count(*) FROM nba_calendar.slate_games g WHERE g.game_date = s.game_date) games,
                                  count(DISTINCT s.strategy) units
                           FROM nba_score.live_slips s WHERE s.strategy LIKE 'P_B%%' AND s.k = 1 GROUP BY 1 ORDER BY 1""").fetchall()
    for d, g, u in rows:
        print(f"  {d}: {g} games -> {u} of 6 units built a slip")


if __name__ == "__main__":
    main()
