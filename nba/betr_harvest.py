#!/usr/bin/env python3
"""
Betr harvester (Path C, SeleniumBase UC Mode) — Betr is behind Cloudflare Turnstile (interactive checkbox),
which loops vanilla Playwright. Research (2026): the reliable open-source beaters are SeleniumBase UC Mode
(has uc_gui_click_captcha) and Camoufox. This uses UC Mode: it launches an undetected Chrome, auto-clicks
the Turnstile box, waits for the app to boot, drives to the league board, and reads the board GraphQL
response the page fetched. Runs on a US RESIDENTIAL machine (your PC / the mini-PC).

Setup (one time, PowerShell):
    python -m pip install --upgrade seleniumbase
    # SeleniumBase manages its own driver; no separate download needed
Run (VISIBLE — UC Mode needs a real display to click Turnstile):
    $env:BETR_LEAGUE="WNBA"; python betr5.py
Once reliable, schedule it with Windows Task Scheduler.

Output: boards/betr_<league>_current.json (+ _meta), and betr_nba_current.json for NBA.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

LEAGUE = os.environ.get("BETR_LEAGUE", "NBA").upper()
OUT = Path(os.environ.get("BETR_OUT_DIR", "boards"))
OUT.mkdir(parents=True, exist_ok=True)
URL = "https://picks.betr.app/"

# The board query, self-contained, to run from the page once Cloudflare has cleared (same-origin, so CSP allows it).
QUERY = ("query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) { "
         "...EventInfoData ... on TeamVersusEvent { teams { ...T __typename } __typename } "
         "... on TeamTournamentEvent { teams { ...T __typename } __typename } "
         "... on IndividualTournamentEvent { players { ...P __typename } __typename } "
         "... on IndividualVersusEvent { players { ...P __typename } __typename } __typename } } "
         "fragment EventInfoData on EventV2 { id date status sport league name __typename } "
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


def main():
    from seleniumbase import SB
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    board = None
    with SB(uc=True, headless=False, locale="en-US") as sb:
        print(f"opening {URL} with UC Mode ...", flush=True)
        sb.uc_open_with_reconnect(URL, reconnect_time=6)
        # auto-click the Cloudflare Turnstile checkbox if present
        try:
            sb.uc_gui_click_captcha()
            print("  uc_gui_click_captcha fired", flush=True)
        except Exception as exc:  # noqa: BLE001
            print("  uc_gui_click_captcha:", str(exc)[:80], flush=True)
        time.sleep(6)
        # once cleared, run the board query from the page (same-origin fetch, allowed by CSP)
        for attempt in range(3):
            try:
                res = sb.execute_script(
                    "var cb=arguments[arguments.length-1];"
                    "fetch('https://api.fantasy.betr.app/graphql',{method:'POST',"
                    "headers:{'content-type':'application/json',"
                    "'accept':'application/graphql-response+json, application/graphql+json, application/json'},"
                    "body:JSON.stringify({operationName:'LeagueUpcomingEvents',query:arguments[0],"
                    "variables:{league:arguments[1]}}),credentials:'include'})"
                    ".then(r=>r.text()).then(t=>cb(t)).catch(e=>cb('ERR:'+e));",
                    QUERY, LEAGUE) if False else None
                # execute_script above can't await; use a synchronous fetch via a promise trick instead:
                res = sb.execute_async_script(
                    "var q=arguments[0], lg=arguments[1], cb=arguments[arguments.length-1];"
                    "fetch('https://api.fantasy.betr.app/graphql',{method:'POST',"
                    "headers:{'content-type':'application/json'},"
                    "body:JSON.stringify({operationName:'LeagueUpcomingEvents',query:q,variables:{league:lg}}),"
                    "credentials:'include'}).then(r=>r.text()).then(t=>cb(t)).catch(e=>cb('ERR:'+e));",
                    QUERY, LEAGUE)
                if res and not res.startswith("ERR:"):
                    board = json.loads(res)
                    break
                print(f"  attempt {attempt}: {str(res)[:120]}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"  attempt {attempt} error: {str(exc)[:100]}", flush=True)
            time.sleep(5)

    if not board or board.get("errors") or not (((board.get("data") or {}).get("getUpcomingEventsV2"))):
        print("NO BOARD. If Cloudflare box still showed, tell me; if it cleared, paste any console text.",
              file=sys.stderr)
        if board:
            (OUT / f"betr_{LEAGUE.lower()}_raw.json").write_text(json.dumps(board)[:5000])
        sys.exit(2)

    legs, nevents = flatten(board)
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "seleniumbase-uc picks.betr.app", "league": LEAGUE, "started_at": started,
            "fetched_at": fetched, "legs": len(legs), "alt_legs": sum(1 for l in legs if l.get("alt")),
            "players": len({l["player_id"] for l in legs}), "events": nevents}
    (OUT / f"betr_{LEAGUE.lower()}_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    (OUT / f"betr_{LEAGUE.lower()}_current_meta.json").write_text(json.dumps(meta, indent=2))
    if LEAGUE == "NBA":
        (OUT / "betr_nba_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    print(f"OK {LEAGUE}: {meta['legs']} legs ({meta['alt_legs']} alt), {meta['players']} players, "
          f"{meta['events']} events -> boards/betr_{LEAGUE.lower()}_current.json")


if __name__ == "__main__":
    main()
