#!/usr/bin/env python3
"""
RESEARCH - TODAY'S FLIFF PICK'EM 2-PICK MAX, OPTION 2 (owner 2026-10-26 14:22 PT: "the number 2 is a pretty decent one. You can deploy
that ... give me the slip for today"). READ-ONLY. Fliff's Pick'Em board from nba_market.fliff_pickem_board (fliff_pickem_board.py,
public feed). Rule (research_sleeper_small ST_APP=fliff, runs 40397712309 / 40397717134: +44.0% / +34.9% at the measured margin, cashed
43-46%, max drawdown 7-10u): Underdog portfolio T unit T1's qualified legs at FLIFF's main line and multiplier, final_hp >= 0.56,
multiplier <= 1.85, ordered by final_hp, the top leg skipped, one leg per game -> one 2-pick Max (product of the two multipliers).
Side check every run: option_type 0 = Over iff the sportsbooks' more likely side carries the lower Fliff multiplier on most cards.
Env: DATABASE_URL, FT_DATE (default today PT).
"""
import datetime as dt
import os
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "fliff")
import research_app_final_strategies as AF          # noqa: E402
import research_sleeper_deep as RSD                  # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402
import sleeper_live_slip_engine as SL                # noqa: E402

PT = ZoneInfo("America/Los_Angeles")
FLOOR, MCAP, SKIP = 0.56, 1.85, 1


def main():
    day = dt.date.fromisoformat(os.environ["FT_DATE"]) if os.environ.get("FT_DATE") else dt.datetime.now(PT).date()
    with SL.connect() as conn:
        last = conn.execute("SELECT max(snapshot_ts) FROM nba_market.fliff_pickem_board WHERE game_date = %s", (day,)).fetchone()[0]
        fb = conn.execute("""SELECT b.player, nm.player_id::text, b.prop, b.line::float, b.option_type, b.multiplier::float, b.fliff_game, b.matchup, b.tip_utc
                             FROM nba_market.fliff_pickem_board b LEFT JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)
                             WHERE b.game_date = %s AND b.snapshot_ts = %s""", (day, last)).fetchall()
        print(f"FLIFF PICK'EM {day} (captured {last}): {len(fb)} main-line sides, {sum(1 for r in fb if r[1])} on mapped players", flush=True)
        _sl, mk, _ml, _a, _b = RSD.load(conn, day)
        by = {}
        for nm, pid, prop, line, ot, m, g, match, tip in fb:
            by.setdefault((pid, prop, line), {})[ot] = m
        agree = n = 0
        for (pid, prop, line), s in by.items():
            po = mk.get((pid, prop, "Over", line))
            if pid and po and 0 in s and 1 in s and s[0] != s[1]:
                pov = sum(po) / len(po)
                if abs(pov - 0.5) > 0.03:
                    n += 1
                    agree += int((pov > 0.5) == (s[0] < s[1]))
        over0 = agree >= n - agree
        print(f"SIDE CHECK: option_type 0 = Over on {agree}/{n} cards where the books lean -> using 0 = {'Over' if over0 else 'Under'}", flush=True)
        fl = {}
        for nm, pid, prop, line, ot, m, g, match, tip in fb:
            if pid:
                side = ("Over" if ot == 0 else "Under") if over0 else ("Under" if ot == 0 else "Over")
                fl[(pid, prop, side)] = (nm, line, m, g, match, tip)
        legs, rows = AF.load_ud(conn, day, {})
        c, gc = ST.ud_lists(rows, legs)["T1"]
        tm = SL.teams_of(conn, {str(x["player_id"]) for x in c if x.get("player_id") is not None}, day)
        priced = []
        for src in c:
            pid = str(src["player_id"]) if src.get("player_id") is not None else None
            f = fl.get((pid, src["prop"], src["side"]))
            if f:
                priced.append({"pid": pid, "name": f[0], "prop": src["prop"], "side": src["side"], "line": f[1], "m": f[2], "p": float(src["p"]),
                               "team": tm.get(pid), "game": f[3], "match": f[4], "tip": f[5], "ud_line": float(src["line"])})
        print(f"T1 qualified {len(c)}, on Fliff Pick'Em {len(priced)}", flush=True)
        cand = [l for l in sorted(priced, key=lambda x: -x["p"]) if l["p"] >= FLOOR and l["m"] <= MCAP]
        print("\nCANDIDATES (final_hp order; the first is skipped by the rule):")
        for l in cand[:10]:
            print(f"   {l['name']:<24} {l['prop']:<11} {l['side']:<5} {l['line']:>5} @{l['m']:.2f}  hp {100 * l['p']:.1f}%  {l['match']}  (Underdog line {l['ud_line']})")
        s = ST.pick(cand[SKIP:], 2, gc)
        if s is None or len({l["team"] for l in s}) < 2:
            print("\nNO FLIFF SLIP TODAY - fewer than 2 qualifying legs in different games")
            return
        tip = min(l["tip"] for l in s)
        print(f"\nTODAY'S FLIFF 2-PICK MAX: x{s[0]['m'] * s[1]['m']:.3f} | place by {tip.astimezone(PT):%I:%M %p} PT")
        for l in s:
            print(f"   {l['name']} - {l['prop']} {l['side']} {l['line']} @{l['m']:.2f} (hp {100 * l['p']:.1f}%, {l['match']})")


if __name__ == "__main__":
    main()
