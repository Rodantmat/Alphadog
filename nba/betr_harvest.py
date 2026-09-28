#!/usr/bin/env python3
"""
Betr harvester (Path C, UC Mode + PERSISTENT PROFILE + logged-in in-page fetch).
Session is saved in ./betr_profile (you logged in once). Now, WHILE LOGGED IN, the page's own credentials
are present, so an in-page fetch to the board should return 200 (it 401'd earlier only because there was no
session). We run the board query from the page (same-origin, cookies included) AND fall back to intercepting
the app's own board response.

Runs:
  First time (log in by hand):  $env:BETR_LEAGUE="WNBA"; $env:BETR_LOGIN="1"; python betrA.py
  After that (no login):        $env:BETR_LEAGUE="WNBA"; python betrA.py
Output: boards/betr_<league>_current.json (+ _meta), and betr_nba_current.json for NBA.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

LEAGUE = os.environ.get("BETR_LEAGUE", "NBA").upper()
LOGIN = os.environ.get("BETR_LOGIN", "0") == "1"
PROFILE = os.path.abspath(os.environ.get("BETR_PROFILE_DIR", "betr_profile"))
OUT = Path(os.environ.get("BETR_OUT_DIR", "boards"))
OUT.mkdir(parents=True, exist_ok=True)
URL = "https://picks.betr.app/"

QUERY = ("query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) { "
         "...E ... on TeamVersusEvent { teams { ...T __typename } __typename } "
         "... on TeamTournamentEvent { teams { ...T __typename } __typename } "
         "... on IndividualTournamentEvent { players { ...P __typename } __typename } "
         "... on IndividualVersusEvent { players { ...P __typename } __typename } __typename } } "
         "fragment E on EventV2 { id date status sport league name __typename } "
         "fragment T on Team { id name league sport fullName players { ...P __typename } __typename } "
         "fragment P on Player { id firstName lastName position jerseyNumber "
         "projections { marketId marketStatus type label name value nonRegularValue nonRegularPercentage "
         "allowedOptions { outcome __typename } currentValue __typename } __typename }")


def parse_leg(ev, team, player, proj):
    legs = []
    line = proj.get("value")
    if line is None:
        return legs
    name = f"{player.get('firstName','')} {player.get('lastName','')}".strip()
    stat = proj.get("type") or proj.get("name") or proj.get("label")
    opts = [str(o.get("outcome")).upper() for o in (proj.get("allowedOptions") or [])]
    base = {"event_id": str(ev.get("id")), "player": name, "player_id": str(player.get("id")),
            "team": (team or {}).get("name"), "stat": stat, "market_id": proj.get("marketId"),
            "status": proj.get("marketStatus"), "start_time": ev.get("date")}
    legs.append({**base, "line": line, "alt": False, "over": "OVER" in opts, "under": "UNDER" in opts})
    alt = proj.get("nonRegularValue")
    if alt is not None and alt != line:
        legs.append({**base, "line": alt, "alt": True, "alt_percentage": proj.get("nonRegularPercentage")})
    return legs


def flatten(body):
    events = ((body or {}).get("data") or {}).get("getUpcomingEventsV2") or []
    legs = []
    for ev in events:
        buckets = [(t, t.get("players", []) or []) for t in (ev.get("teams") or [])]
        if ev.get("players"):
            buckets.append((None, ev.get("players")))
        for team, players in buckets:
            for p in players:
                for proj in (p.get("projections") or []):
                    legs.extend(parse_leg(ev, team, p, proj))
    return legs, len(events)


def try_inpage_fetch(sb):
    payload = json.dumps({"operationName": "LeagueUpcomingEvents", "query": QUERY, "variables": {"league": LEAGUE}})
    js = ("var cb=arguments[arguments.length-1];"
          "fetch('https://api.fantasy.betr.app/graphql',{method:'POST',"
          "headers:{'content-type':'application/json'},body:" + json.dumps(payload) + ","
          "credentials:'include'}).then(r=>r.text()).then(t=>cb(t)).catch(e=>cb('ERR:'+e));")
    try:
        sb.driver.set_script_timeout(30)
    except Exception:  # noqa: BLE001
        pass
    try:
        res = sb.execute_async_script(js)
        if res and not str(res).startswith("ERR:"):
            j = json.loads(res)
            if (j.get("data") or {}).get("getUpcomingEventsV2") is not None:
                return j, None
            return None, str(res)[:160]
        return None, str(res)[:160]
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)[:160]


def main():
    from seleniumbase import SB
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    board = None
    with SB(uc=True, headless=False, locale="en-US", user_data_dir=PROFILE) as sb:
        print(f"opening {URL} (profile: {PROFILE}) ...", flush=True)
        sb.uc_open_with_reconnect(URL, reconnect_time=6)
        try:
            sb.uc_gui_click_captcha()
        except Exception:  # noqa: BLE001
            pass

        if LOGIN:
            print("\n*** LOG IN NOW (phone, password, SMS). 3 minutes. Then leave the board on screen. ***\n", flush=True)
            time.sleep(180)
        else:
            time.sleep(8)  # let the logged-in app boot

        # try the in-page fetch a few times (session cookies now present)
        for attempt in range(5):
            board, note = try_inpage_fetch(sb)
            if board:
                print(f"  in-page fetch OK on attempt {attempt}", flush=True)
                break
            print(f"  attempt {attempt}: {note}", flush=True)
            time.sleep(6)

    if not board or ((board.get("data") or {}).get("getUpcomingEventsV2") is None):
        print("NO BOARD. If you were NOT logged in, run once with BETR_LOGIN=1 and complete login.", file=sys.stderr)
        sys.exit(2)

    legs, nevents = flatten(board)
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "seleniumbase-uc profile in-page picks.betr.app", "league": LEAGUE,
            "started_at": started, "fetched_at": fetched, "legs": len(legs),
            "alt_legs": sum(1 for l in legs if l.get("alt")),
            "players": len({l["player_id"] for l in legs}), "events": nevents}
    (OUT / f"betr_{LEAGUE.lower()}_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    (OUT / f"betr_{LEAGUE.lower()}_current_meta.json").write_text(json.dumps(meta, indent=2))
    if LEAGUE == "NBA":
        (OUT / "betr_nba_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    print(f"OK {LEAGUE}: {meta['legs']} legs ({meta['alt_legs']} alt), {meta['players']} players, "
          f"{meta['events']} events -> boards/betr_{LEAGUE.lower()}_current.json")


if __name__ == "__main__":
    main()
