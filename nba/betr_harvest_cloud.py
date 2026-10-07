#!/usr/bin/env python3
"""
Betr FULLY-CLOUD harvester (2026-09-28) — runs entirely on a GitHub Actions runner, no owner machine.
Proven chain: local proxy.py (unauth) -> ProxyScrape US-sticky residential; SeleniumBase UC+Xvfb clears
Cloudflare; seeded BETR_SESSION_STATE clears /auth; select US state clears geo; intercept the app's own
getUpcomingEventsV2. Parses projections (main + alt ladder + tier) identically to nba/betr_harvest.py and
writes boards/betr_<league>_current.json (+ _meta) and betr_nba_current.json for NBA. The workflow commits it.

Env: PROXY_URL, BETR_SESSION_STATE (from betr_export_session.py), BETR_LEAGUE (WNBA|NBA),
     BETR_STATE (default California), BETR_LOCAL_PROXY_PORT (8899).
Exit 0 only if a board was written.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from seleniumbase import SB

URL = "https://picks.betr.app/"
LEAGUE = os.environ.get("BETR_LEAGUE", "NBA").upper()
STATE = os.environ.get("BETR_STATE", "California")
PROXY = os.environ.get("PROXY_URL", "").strip()
LOCAL_PORT = int(os.environ.get("BETR_LOCAL_PROXY_PORT", "8899"))
OUT = Path(os.environ.get("BETR_OUT_DIR", "boards"))
OUT.mkdir(parents=True, exist_ok=True)


# ---- parsing (mirrors nba/betr_harvest.py, verified field mapping) --------------------------------
def parse_leg(ev, team, player, proj):
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
    legs.append({**base, "line": line, "alt": False, "over": "MORE" in opts, "under": "LESS" in opts})
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


# ---- local forward-proxy (unauth to Chrome, upstream to ProxyScrape US-sticky) --------------------
def start_local_proxy():
    if not PROXY:
        return None, None
    raw = PROXY.split("://", 1)[-1].rstrip("/").split("/", 1)[0]
    if "@" not in raw:
        return None, raw
    creds, host = raw.rsplit("@", 1)
    user, _, pw = creds.partition(":")
    if "-session-" not in user:
        sid = os.environ.get("BETR_SESSION_ID", "betrcloud1")
        user = f"{user}-country-us-session-{sid}-lifetime-10"
    cmd = [sys.executable, "-m", "proxy", "--hostname", "127.0.0.1", "--port", str(LOCAL_PORT),
           "--plugins", "proxy.plugin.ProxyPoolPlugin", "--proxy-pool", f"{user}:{pw}@{host}"]
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(4)
    return p, f"127.0.0.1:{LOCAL_PORT}"


def main():
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    board = None
    lp, proxy_arg = start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    try:
        with SB(**kw) as sb:
            sb.uc_open_with_reconnect(URL, reconnect_time=10)
            try:
                sb.driver.execute_cdp_cmd("Network.enable", {})
            except Exception:  # noqa: BLE001
                pass
            for _ in range(3):
                try:
                    sb.uc_gui_click_captcha()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(4)
            # seed session
            st = os.environ.get("BETR_SESSION_STATE", "").strip()
            if st:
                try:
                    s = json.loads(st)
                    for k, v in (s.get("localStorage") or {}).items():
                        try:
                            sb.execute_script("localStorage.setItem(arguments[0], arguments[1]);", k, v)
                        except Exception:  # noqa: BLE001
                            pass
                    for c in s.get("cookies") or []:
                        ck = {kk: c[kk] for kk in ("name", "value", "domain", "path", "secure", "expiry")
                              if kk in c and c[kk] is not None}
                        try:
                            sb.driver.add_cookie(ck)
                        except Exception:  # noqa: BLE001
                            pass
                    sb.uc_open_with_reconnect(URL, reconnect_time=6)
                    time.sleep(6)
                except Exception as exc:  # noqa: BLE001
                    print("seed failed:", str(exc)[:100], flush=True)
            # clear geo + reach a booted page
            for i in range(40):
                url = sb.get_current_url(); src = sb.get_page_source() or ""
                if "AllowLocation" in url:
                    for xp in (f'//*[normalize-space(text())="{STATE}"]', f'//li[contains(.,"{STATE}")]',
                               f'//option[normalize-space(text())="{STATE}"]', '//select'):
                        try:
                            if xp == '//select' and sb.is_element_visible(xp):
                                sb.select_option_by_text(xp, STATE); break
                            if sb.is_element_visible(xp):
                                sb.click(xp, timeout=3); break
                        except Exception:  # noqa: BLE001
                            continue
                    time.sleep(4); continue
                if len(src) > 5000:
                    break
                time.sleep(3)
            # navigate to league so the app fetches the board
            for target in (f"{URL}lobby/{LEAGUE.lower()}", URL):
                try:
                    sb.uc_open_with_reconnect(target, reconnect_time=4); time.sleep(4)
                except Exception:  # noqa: BLE001
                    pass
                for xp in (f'//*[normalize-space(text())="{LEAGUE}"]', f'//a[contains(.,"{LEAGUE}")]',
                           f'//button[contains(.,"{LEAGUE}")]'):
                    try:
                        if sb.is_element_visible(xp):
                            sb.click(xp, timeout=4); break
                    except Exception:  # noqa: BLE001
                        continue
                time.sleep(3)
            # capture. DIAGNOSED 2026-10-07 (full-system certification pass G): the app answers getUpcomingEventsV2 more than
            # once - the LOBBY response lists every upcoming event of every sport (163 "events" on 10-07, 117 on 10-06) with
            # NO players/projections, and the league board response carries the projections. The old loop took the first
            # response with the key, so the lobby answer won and the file said ok:true, 163 events, 0 legs. Now a response
            # only counts as the board when it flattens to legs; a projection-less answer is kept as `lobby_only` evidence
            # and the loop keeps watching (and re-clicks the league tab) until the deadline.
            lobby_only = None
            deadline = time.time() + 120
            while time.time() < deadline and not board:
                try:
                    logs = sb.driver.get_log("performance")
                except Exception:  # noqa: BLE001
                    logs = []
                ids = []
                for e in logs:
                    try:
                        m = json.loads(e["message"])["message"]
                    except Exception:  # noqa: BLE001
                        continue
                    if m.get("method") == "Network.responseReceived" and \
                       "fantasy.betr.app/graphql" in m["params"]["response"].get("url", ""):
                        ids.append(m["params"]["requestId"])
                for rid in reversed(ids):
                    try:
                        b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid})
                        j = json.loads(b.get("body", ""))
                        if (j.get("data") or {}).get("getUpcomingEventsV2"):
                            if flatten(j)[0]:
                                board = j; break
                            lobby_only = j   # events without projections - not the board
                    except Exception:  # noqa: BLE001
                        continue
                if not board and lobby_only is not None:
                    # the lobby answered but the league board did not: nudge the league tab again
                    for xp in (f'//*[normalize-space(text())="{LEAGUE}"]', f'//a[contains(.,"{LEAGUE}")]',
                               f'//button[contains(.,"{LEAGUE}")]'):
                        try:
                            if sb.is_element_visible(xp):
                                sb.click(xp, timeout=4); break
                        except Exception:  # noqa: BLE001
                            continue
                time.sleep(3)
    finally:
        if lp:
            lp.terminate()

    if not board or ((board.get("data") or {}).get("getUpcomingEventsV2") is None):
        print("NO BOARD (session may have expired — re-run betr_export_session.py and update BETR_SESSION_STATE)",
              file=sys.stderr)
        sys.exit(2)

    legs, nevents = flatten(board)
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "github-runner uc+proxy picks.betr.app", "league": LEAGUE,
            "started_at": started, "fetched_at": fetched, "legs": len(legs),
            "alt_legs": sum(1 for l in legs if l.get("alt")),
            "players": len({l["player_id"] for l in legs}), "events": nevents}
    (OUT / f"betr_{LEAGUE.lower()}_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    (OUT / f"betr_{LEAGUE.lower()}_current_meta.json").write_text(json.dumps(meta, indent=2))
    if LEAGUE == "NBA":
        (OUT / "betr_nba_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    print(f"OK {LEAGUE}: {meta['legs']} legs ({meta['alt_legs']} alt), {meta['players']} players, "
          f"{meta['events']} events", flush=True)


if __name__ == "__main__":
    main()
