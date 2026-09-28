#!/usr/bin/env python3
"""
Betr harvester (Path C, UC Mode + PERSISTENT PROFILE + passive CDP capture).
The logged-in lobby keeps reloading, which kills injected fetches (script timeout). So we do NOT fetch —
we passively watch the network via Chrome DevTools Protocol and grab the app's OWN getUpcomingEventsV2
response whenever it loads it (that call returns 200 for the logged-in page). We keep the browser open,
poll the CDP performance log, and pull the board body the moment it appears.

Runs:
  First time (log in by hand):  $env:BETR_LEAGUE="WNBA"; $env:BETR_LOGIN="1"; python betrB.py
  After that (no login):        $env:BETR_LEAGUE="WNBA"; python betrB.py
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
WATCH_SECONDS = int(os.environ.get("BETR_WATCH", "90"))
OUT = Path(os.environ.get("BETR_OUT_DIR", "boards"))
OUT.mkdir(parents=True, exist_ok=True)
URL = "https://picks.betr.app/"


def parse_leg(ev, team, player, proj):
    """Betr projection -> legs. CORRECTED 2026-09-28 from the raw shape:
      - stat is proj['key'] (e.g. POINTS, THREE_POINTERS_MADE, 1ST_QUARTER_POINTS) - NOT 'type'.
      - 'type' is the payout TIER (REGULAR/BOOSTED/SUPER_BOOSTED/EDGE_* /MINI_BOOSTED) - Betr's
        goblin/demon axis; kept as 'tier'.
      - sides are MORE/LESS (not OVER/UNDER).
      - nonRegularValue is 0.0 when there is NO alternate; emit an alt leg only when it's > 0.
    """
    legs = []
    line = proj.get("value")
    if line is None:
        return legs
    name = f"{player.get('firstName','')} {player.get('lastName','')}".strip()
    stat = proj.get("key") or proj.get("name") or proj.get("label")
    tier = proj.get("type")
    opts = [str(o.get("outcome")).upper() for o in (proj.get("allowedOptions") or [])]
    base = {"event_id": str(ev.get("id")), "player": name, "player_id": str(player.get("id")),
            "team": (team or {}).get("name"), "stat": stat, "tier": tier, "market_id": proj.get("marketId"),
            "status": proj.get("marketStatus"), "start_time": ev.get("date")}
    legs.append({**base, "line": line, "alt": False,
                 "over": "MORE" in opts, "under": "LESS" in opts})
    alt = proj.get("nonRegularValue")
    if alt is not None and alt > 0 and alt != line:
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


def pull_board(sb):
    """Scan the CDP performance log for a fantasy graphql response and pull its body."""
    try:
        logs = sb.driver.get_log("performance")
    except Exception:  # noqa: BLE001
        return None
    ids = []
    for e in logs:
        try:
            m = json.loads(e["message"])["message"]
        except Exception:  # noqa: BLE001
            continue
        if m.get("method") == "Network.responseReceived":
            url = m["params"]["response"].get("url", "")
            if "fantasy.betr.app/graphql" in url:
                ids.append(m["params"]["requestId"])
    for rid in reversed(ids):
        try:
            b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid})
            j = json.loads(b.get("body", ""))
            if (j.get("data") or {}).get("getUpcomingEventsV2"):
                return j
        except Exception:  # noqa: BLE001
            continue
    return None


def main():
    from seleniumbase import SB
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    board = None
    with SB(uc=True, headless=False, locale="en-US", log_cdp_events=True, user_data_dir=PROFILE) as sb:
        print(f"opening {URL} (profile: {PROFILE}) ...", flush=True)
        sb.uc_open_with_reconnect(URL, reconnect_time=6)
        try:
            sb.uc_gui_click_captcha()
        except Exception:  # noqa: BLE001
            pass
        try:
            sb.driver.execute_cdp_cmd("Network.enable", {})
        except Exception:  # noqa: BLE001
            pass

        if LOGIN:
            print("\n*** LOG IN NOW (phone, password, SMS). 3 minutes. Then navigate to the WNBA board. ***\n", flush=True)
            time.sleep(180)

        print(f"watching the network for the board for up to {WATCH_SECONDS}s ...", flush=True)
        # nudge to the league, then try to CLICK the sport tab automatically (so no human tap is needed)
        try:
            sb.uc_open_with_reconnect(f"{URL}lobby/{LEAGUE.lower()}", reconnect_time=4)
        except Exception:  # noqa: BLE001
            pass
        time.sleep(4)

        def try_click():
            # Betr's sport nav labels the tab by league name; try text, aria-label, and common patterns
            cands = [f'//*[normalize-space(text())="{LEAGUE}"]',
                     f'//*[@aria-label="{LEAGUE}"]',
                     f'//button[contains(., "{LEAGUE}")]',
                     f'//a[contains(., "{LEAGUE}")]',
                     f'//*[contains(@class,"league") and contains(., "{LEAGUE}")]',
                     '//*[normalize-space(text())="Basketball"]']
            for xp in cands:
                try:
                    if sb.is_element_visible(xp):
                        sb.click(xp, timeout=4)
                        print(f"  auto-clicked {xp}", flush=True)
                        return True
                except Exception:  # noqa: BLE001
                    continue
            return False

        clicked = False
        deadline = time.time() + WATCH_SECONDS
        while time.time() < deadline and not board:
            if not clicked:
                clicked = try_click()
            board = pull_board(sb)
            if board:
                print("  BOARD CAPTURED", flush=True)
                break
            time.sleep(3)
        if not board:
            print("  (auto-click may have missed the tab — if the window is open, CLICK the league yourself now)", flush=True)
            deadline2 = time.time() + 30
            while time.time() < deadline2 and not board:
                board = pull_board(sb)
                if board:
                    print("  BOARD CAPTURED", flush=True)
                    break
                time.sleep(3)

    if not board or ((board.get("data") or {}).get("getUpcomingEventsV2") is None):
        print("NO BOARD. Tell me: did the WNBA board (players + lines) actually show on screen?", file=sys.stderr)
        sys.exit(2)

    legs, nevents = flatten(board)
    # DEBUG (2026-09-28): 'type' turned out to be the tier (REGULAR/BOOSTED/EDGE_*), not the stat, and the
    # side flags were empty. Dump one raw player+projection so we can map the true stat + sides.
    try:
        evs = ((board.get("data") or {}).get("getUpcomingEventsV2") or [])
        rp = None
        for _ev in evs:
            _bk = [(t, t.get("players", []) or []) for t in (_ev.get("teams") or [])]
            if _ev.get("players"):
                _bk.append((None, _ev.get("players")))
            for _t, _ps in _bk:
                for _p in _ps:
                    if _p.get("projections"):
                        rp = {"player_keys": list(_p.keys()),
                              "player_sample": {k: _p.get(k) for k in _p if k != "projections"},
                              "projection_count": len(_p["projections"]),
                              "projection_0": _p["projections"][0],
                              "projection_1": _p["projections"][1] if len(_p["projections"]) > 1 else None}
                        break
                if rp:
                    break
            if rp:
                break
        if rp:
            (OUT / "betr_debug_shape.json").write_text(json.dumps(rp, indent=1))
            print("  wrote betr_debug_shape.json (raw projection shape) — upload it", flush=True)
    except Exception as exc:  # noqa: BLE001
        print("  debug dump failed:", str(exc)[:80], flush=True)
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "seleniumbase-uc cdp picks.betr.app", "league": LEAGUE,
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
