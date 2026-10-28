#!/usr/bin/env python3
"""
RESEARCH - TODAY'S FLIFF / SLEEPER CANDIDATES AT THE APP'S OWN LINE (2026-10-28; owner 13:59 PT: a Sleeper leg "super off from what is
available"). READ-ONLY. The live Fliff / Sleeper engines rank Underdog T1's qualified legs by final_hp at UNDERDOG's line and place
them at the app's line (as research_sleeper_transfer measured). Here, per candidate: Underdog line + p, app line + multiplier, our
final_hp AT THE APP'S LINE (final_hp, else final_hp_derived), the leg's break-even 1 / m, and the slip each engine would build if the
ranking used the app-line hit chance (same floor / mcap / skip / one leg a game / two teams). Env: DATABASE_URL, AL_DAY (today PT).
"""
import datetime as dt
import os
import sys
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "fliff")
import research_app_final_strategies as AF          # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402
import sleeper_live_slip_engine as SL                # noqa: E402
import fliff_live_slip_engine as FL                  # noqa: E402


def hp_at(conn, day, pid, prop, side, line):
    for t in ("final_hp", "final_hp_derived"):
        r = conn.execute(f"""SELECT avg(final_hp)::float FROM nba_score.{t} WHERE game_date=%s AND player_id::text=%s AND prop=%s AND side=%s AND line=%s""",
                         (day, pid, prop, side, line)).fetchone()[0]
        if r is not None:
            return r
    return None


def show(conn, day, name, priced, cfg, gc, ks=(2,)):
    print(f"\n==== {name}: {len(priced)} T1 legs on the app ====")
    for l in priced:
        l["app_p"] = hp_at(conn, day, l["pid"], l["prop"], l["side"], l["line"])
    for l in sorted(priced, key=lambda x: -x["p"])[:30]:
        be = 1 / l["m"]
        ap = l["app_p"]
        print(f"  {l['player']:<26} {l['prop']:<9} {l['side']:<5} UD {l['ud_line']:>5g} p {l['p']:.3f} | app {l['line']:>5g} x{l['m']:.2f} "
              f"hp {('%.3f' % ap) if ap is not None else '  -  '} BE {be:.3f} {'OK' if ap is not None and ap >= be else 'below BE' if ap is not None else 'no hp'}"
              f"{'' if l['line'] == l['ud_line'] else '  <- line differs'} | {l.get('match') or l.get('game')}")
    fl_ = float(cfg.get("floor", 0.56)); mc = float(cfg.get("mcap", 1.85)); sk = int(cfg.get("skip", 1))
    for tag, key in (("AS LIVE (UD-line p)", "p"), ("APP-LINE p", "app_p")):
        cand = [dict(l, p=l[key]) for l in priced if l.get(key) is not None]
        cand = [l for l in sorted(cand, key=lambda x: -x["p"]) if l["p"] >= fl_ and l["m"] <= mc]
        for k in ks:
            s = ST.pick(cand[sk:], k, gc)
            print(f"  {tag} {k}-pick: " + (" + ".join(f"{l['player']} {l['prop']} {l['side']} {l['line']:g} x{l['m']:.2f} ({100 * l['p']:.1f}%)" for l in s) if s else "no slip"))


def main():
    day = dt.date.fromisoformat(os.environ.get("AL_DAY") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat())
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    legs, rows = AF.load_ud(conn, day, {})
    c, gc = ST.ud_lists(rows, legs)["T1"]
    tm = SL.teams_of(conn, {str(x["player_id"]) for x in c if x.get("player_id") is not None}, day)
    fl, last, note = FL.board(conn, day)
    print(f"Fliff board {last}: {note}")
    priced = []
    for src in c:
        pid = str(src["player_id"]) if src.get("player_id") is not None else None
        f = (fl or {}).get((pid, src["prop"], src["side"]))
        if f:
            priced.append({"pid": pid, "player": f[0], "prop": src["prop"], "side": src["side"], "line": f[1], "m": f[2], "p": float(src["p"]),
                           "team": tm.get(pid), "game": f[3], "match": f[4], "ud_line": float(src["line"])})
    show(conn, day, "FLIFF", priced, SL.cfg(conn, "fliff_live"), gc)
    board = SL.sleeper_main(conn, day)
    priced, seen = [], set()
    for src in c:
        pid = str(src["player_id"]) if src.get("player_id") is not None else None
        b = board.get((pid, src["prop"], src["side"]))
        if b is None or (pid, src["prop"], src["side"]) in seen:
            continue
        seen.add((pid, src["prop"], src["side"]))
        priced.append({"pid": pid, "player": src.get("player") or b.get("player"), "prop": src["prop"], "side": src["side"],
                       "line": float(b["line"]), "m": float(b["m"]), "p": float(src["p"]), "team": tm.get(pid),
                       "game": src.get("event_id") or b.get("event_id"), "ud_line": float(src["line"])})
    show(conn, day, "SLEEPER", priced, {"floor": 0.0, "mcap": SL.MCAP, "skip": SL.SKIP}, gc, ks=(2, 3))
    print("\ndone", flush=True)


if __name__ == "__main__":
    main()
