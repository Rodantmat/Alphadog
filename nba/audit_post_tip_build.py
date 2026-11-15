#!/usr/bin/env python3
"""
READ-ONLY AUDIT of the owner rule of 2026-11-15 ("they must build slips anyway, just remove the started legs"):
  1. PrizePicks engine: post_tip() no longer stops pick(); started_team_ids() names the teams whose game has tipped; the board legs
     minus those teams still hold legs, and none of a started game.
  2. Underdog engine: drop_started() removes every leg of a started game and keeps the rest.
  3. Exposure coordinator: a Fliff substitute never shares a game with a kept leg (synthetic case = the 2026-11-15 Tatum / Flagg slip).
Writes nothing (the connection is rolled back). Env: DATABASE_URL, AUD_DATE (default today PT).
"""
import datetime as dt
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L          # noqa: E402
import ud_live_slip_engine as U       # noqa: E402
import slip_exposure_coordinator as X  # noqa: E402

fails = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'} {name} {detail}", flush=True)
    if not ok:
        fails.append(name)


def main():
    ds = (os.environ.get("AUD_DATE") or "").strip()
    day = dt.date.fromisoformat(ds) if ds else L.pt_today()
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        st = L.started_team_ids(conn, day)
        print(f"AUDIT|{day} post_tip={L.post_tip(conn, day)} started teams={sorted(st)}", flush=True)
        legs = L.load_board_legs(conn, day)
        kept = [l for l in legs if str(l.get("team_id")) not in st]
        check("PrizePicks board legs loaded", len(legs) > 0, f"({len(legs)} rows)")
        check("PrizePicks legs remain after dropping started games", len(kept) > 0, f"({len(legs) - len(kept)} dropped, {len(kept)} kept)")
        check("PrizePicks: no kept leg belongs to a started game", all(str(l.get("team_id")) not in st for l in kept))
        if st:
            check("PrizePicks: started games did carry legs (the filter does something)", len(legs) > len(kept))
        ul = U.load_legs(conn, day)
        uk = U.drop_started(conn, day, ul)
        teams = U.leg_team(conn, day, {l["player_id"] for l in uk}) if uk else {}
        check("Underdog legs loaded", len(ul) > 0, f"({len(ul)} rows)")
        check("Underdog legs remain after dropping started games", len(uk) > 0, f"({len(ul) - len(uk)} dropped, {len(uk)} kept)")
        check("Underdog: no kept leg belongs to a started game", all(str(teams.get(str(l["player_id"]))) not in st for l in uk))
        conn.rollback()
    # 3. synthetic Fliff case
    cfg = {"max_slips_per_leg": 2, "max_reuse_per_slip": 2}
    def lg(n, mu, ev):
        return {"player": "P" + str(n), "player_id": str(n), "side": "Under", "matchup": mu, "event_id": ev}
    s1 = {"id": ("A", 1), "legs": [lg(1, "OKC@SAC", "e1"), lg(2, "ATL@MIL", "e2"), lg(3, "CHA@LAC", "e3")]}
    s2 = {"id": ("A", 2), "legs": [lg(1, "OKC@SAC", "e1"), lg(8, "SAS@UTA", "e8"), lg(9, "LAL@PHX", "e9")]}
    # slip 3: P1 is at the cap (2 slips) and must be replaced; P6 (DAL@BOS) and P7 stay
    s3 = {"id": ("A", 3), "legs": [lg(1, "OKC@SAC", "e1"), lg(6, "DAL@BOS", "e6"), lg(7, "NYK@TOR", "e7")]}
    cands = {("A", 3): [{"player": "P4", "player_id": "4", "side": "Under", "matchup": "DAL @ BOS", "event_id": "zzz"},
                        {"player": "P5", "player_id": "5", "side": "Under", "matchup": "HOU@WAS", "event_id": "e5"}]}
    res = X.enforce([s1, s2, s3], cands, cfg, one_per_game=True)
    new3 = res[2][1]
    games = [X.game_key(l) for l in (new3 or [])]
    check("Fliff substitute skips a game the slip already holds", new3 is not None and len(set(games)) == len(games) and any(l["player"] == "P5" for l in new3),
          f"({[l['player'] for l in (new3 or [])]})")
    # 4. the quote gate runs clean in dry mode (2026-11-15 quoter-outage rule: a batch with no usable answer makes it stand down)
    import subprocess
    env = dict(os.environ, QG_DRY="1", QG_DATE=day.isoformat())
    r = subprocess.run([sys.executable, "-u", os.path.join(os.path.dirname(os.path.abspath(__file__)), "apply_quote_gate.py")], env=env, capture_output=True, text=True)
    print(r.stdout[-1500:], flush=True)
    check("quote gate dry run exits clean", r.returncode == 0, r.stderr[-400:])
    if fails:
        print(f"AUDIT FAILED: {fails}", flush=True)
        sys.exit(1)
    print("AUDIT PASSED", flush=True)


if __name__ == "__main__":
    main()
