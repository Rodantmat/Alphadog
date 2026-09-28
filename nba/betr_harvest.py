#!/usr/bin/env python3
"""
Betr harvester (Path C, SeleniumBase UC Mode + INTERCEPT). UC Mode clears Cloudflare Turnstile. Our own
injected fetch 401s (the app attaches auth/session we don't replicate), but the PAGE'S OWN board call
returns 200. So: clear Cloudflare, drive the UI to the league board, and intercept the page's
getUpcomingEventsV2 response via Chrome DevTools Protocol (performance/network logs).

Setup (one time, PowerShell):
    python -m pip install --upgrade seleniumbase
Run (VISIBLE):
    $env:BETR_LEAGUE="WNBA"; python betr8.py
    # if the Cloudflare box shows, click it once.

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

    with SB(uc=True, headless=False, locale="en-US", log_cdp_events=True) as sb:
        print(f"opening {URL} with UC Mode ...", flush=True)
        sb.uc_open_with_reconnect(URL, reconnect_time=6)
        try:
            sb.uc_gui_click_captcha()
            print("  uc_gui_click_captcha fired", flush=True)
        except Exception as exc:  # noqa: BLE001
            print("  uc_gui_click_captcha:", str(exc)[:80], flush=True)
        time.sleep(5)

        # enable Network domain so response bodies are retrievable via CDP
        try:
            sb.driver.execute_cdp_cmd("Network.enable", {})
        except Exception:  # noqa: BLE001
            pass

        # drive the UI to the league so the app fetches getUpcomingEventsV2 itself
        for target in (f"{URL}lobby/{LEAGUE.lower()}", f"{URL}{LEAGUE.lower()}", URL):
            try:
                sb.uc_open_with_reconnect(target, reconnect_time=4)
                time.sleep(3)
            except Exception:  # noqa: BLE001
                pass
            # click the sport tab if visible
            for sel in (LEAGUE, LEAGUE.title(), "Basketball"):
                try:
                    if sb.is_text_visible(sel):
                        sb.click(f'//*[text()="{sel}"]', timeout=4)
                        time.sleep(3)
                        break
                except Exception:  # noqa: BLE001
                    pass
            # scroll to load
            for _ in range(3):
                try:
                    sb.execute_script("window.scrollBy(0,3000);")
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(2)
            # scan CDP performance log for the board response, then fetch its body via CDP
            try:
                logs = sb.driver.get_log("performance")
            except Exception:  # noqa: BLE001
                logs = []
            req_ids = []
            for entry in logs:
                try:
                    msg = json.loads(entry["message"])["message"]
                except Exception:  # noqa: BLE001
                    continue
                if msg.get("method") == "Network.responseReceived":
                    r = msg["params"]["response"]
                    if "fantasy.betr.app/graphql" in r.get("url", ""):
                        req_ids.append(msg["params"]["requestId"])
            for rid in reversed(req_ids):
                try:
                    body_obj = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid})
                    txt = body_obj.get("body", "")
                    j = json.loads(txt)
                    if (j.get("data") or {}).get("getUpcomingEventsV2"):
                        board = j
                        print(f"  intercepted board: {len(j['data']['getUpcomingEventsV2'])} events", flush=True)
                        break
                except Exception:  # noqa: BLE001
                    continue
            if board:
                break

    if not board or ((board.get("data") or {}).get("getUpcomingEventsV2") is None):
        print("NO BOARD intercepted. Tell me what the browser showed on the WNBA screen.", file=sys.stderr)
        sys.exit(2)

    legs, nevents = flatten(board)
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "seleniumbase-uc intercept picks.betr.app", "league": LEAGUE,
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
