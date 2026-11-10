"""SUBSTITUTE BANK (owner 2026-11-10 "the subs don't follow the logic. The bank must follow the same legs of the strategy"): per app, the ranked candidate legs of the
strategy's OWN rule, so a substitute is a leg the rule itself would play (same floor / gate / ranking / constraints) - never a generic board leg.
Table nba_score.slip_leg_bank (game_date, app, strategy, rank, leg jsonb). Writes ONLY the bank; never touches slips.
Sleeper: sleeper_live_slip_engine.all_candidates (S_ALL_5flex). PrizePicks: written by live_slip_engine.pick (write_pp_bank) from the prepared board.
Env: DATABASE_URL, SB_DAY (default today PT)."""
import datetime as dt
import json
import os
import sys
import zoneinfo

import sleeper_live_slip_engine as SLE
import research_app_final_strategies as AF
import research_sleeper_transfer as ST

DDL = """CREATE TABLE IF NOT EXISTS nba_score.slip_leg_bank (game_date date, app text, strategy text, rank int, leg jsonb, built_at timestamptz DEFAULT now(),
         PRIMARY KEY (game_date, app, strategy, rank))"""


def write_bank(conn, day, app, strategy, legs):
    conn.execute(DDL)
    conn.execute("DELETE FROM nba_score.slip_leg_bank WHERE game_date=%s AND app=%s AND strategy=%s", (day, app, strategy))
    for i, l in enumerate(legs, start=1):
        conn.execute("INSERT INTO nba_score.slip_leg_bank (game_date, app, strategy, rank, leg) VALUES (%s,%s,%s,%s,%s::jsonb)", (day, app, strategy, i, json.dumps(l)))
    conn.commit()


def sleeper(conn, day):
    cand, n = SLE.all_candidates(conn, day, SLE.ALL_RULE)
    best, seen = [], set()
    for l in cand:                                   # one leg per player, best rank first (a slip never holds a player twice)
        if l["pid"] in seen:
            continue
        seen.add(l["pid"])
        best.append({k: l.get(k) for k in ("pid", "player", "prop", "side", "line", "m", "p", "pf", "game", "team")})
    # ROI by rank band (research_bank_roi, single-leg, 2025-26 / 2026-27): 1-5 +10 / +4, 6-10 +13 / -2, 11-15 +9 / +5, 16-25 +1 / -21, 26+ +3 / -12 -> the bank stops at rank 15
    best = best[:15]
    write_bank(conn, day, "sleeper", SLE.ALL_RULE["name"], best)
    print(f"BANK|{day} sleeper {SLE.ALL_RULE['name']}: {len(best)} legs (of {n} with final_hp)")
    for i, l in enumerate(best[:15], 1):
        print(f"  {i:2d} {l['player']} {l['prop']} {l['side']} {l['line']:g} x{l['m']:.2f} p={l['p']:.2f}")


def underdog(conn, day):
    """Underdog T1 candidate list (the list the T slips, Fliff and Betr are built from: research_sleeper_transfer.ud_lists), ranked best first, one leg a player"""
    legs, rows = AF.load_ud(conn, day, {})
    if not legs:
        print(f"BANK|{day} underdog: no board")
        return
    lists = ST.ud_lists(rows, legs)
    # the Underdog portfolio's own candidate lists: T2 (RB both sides, p >= 0.60) and T3 (More combos, p >= 0.55) - the units that carry the +68% - then T1; best hit chance first
    c = []
    for unit in ("T2", "T3", "T1"):
        if unit in lists:
            c += [dict(l, _u=unit) for l in lists[unit][0]]
    c.sort(key=lambda l: -float(l["p"]))
    best, seen = [], set()
    for l in c:
        k = str(l.get("player_id"))
        if k in seen or float(l["p"]) < 0.55:
            continue
        seen.add(k)
        best.append({"pid": k, "player": l.get("player"), "prop": l.get("prop"), "side": l.get("side"), "line": float(l["line"]), "p": float(l["p"]), "game": l.get("event_id"), "unit": l["_u"]})
    write_bank(conn, day, "underdog", "T123", best)
    conn.execute("DELETE FROM nba_score.slip_leg_bank WHERE game_date=%s AND app='underdog' AND strategy='T1'", (day,))
    conn.commit()
    print(f"BANK|{day} underdog T2/T3/T1: {len(best)} legs")
    for i, l in enumerate(best[:12], 1):
        print(f"  {i:2d} {l['player']} {l['prop']} {l['side']} {l['line']:g} p={l['p']:.2f}")


if __name__ == "__main__":
    day = dt.date.fromisoformat(os.environ.get("SB_DAY") or dt.datetime.now(zoneinfo.ZoneInfo("America/Los_Angeles")).date().isoformat())
    c = SLE.connect()
    sleeper(c, day)
    try:
        underdog(c, day)
    except Exception as e:
        print(f"BANK|underdog failed (sleeper bank is written): {e}")
