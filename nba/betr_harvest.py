#!/usr/bin/env python3
"""
Betr harvester (Path C) — runs a REAL Chromium via Playwright, loads picks.betr.app, lets the site's own JS
fetch its board (so Betr's anti-bot headers are computed by the browser, not us), and INTERCEPTS the
LeagueUpcomingEvents GraphQL response as it arrives. Writes boards/betr_nba_current.json in the shape
archive_live_boards.py expects.

Why this works where raw HTTP failed: 17 HTTP probes proved api.fantasy.betr.app rejects any request that
is not a genuine browser (it needs the JS-computed anti-bot header). A real browser page sidesteps that
entirely — we read the response the page itself received.

RUN ON A US RESIDENTIAL CONNECTION (your Windows PC qualifies). No login needed (board is anonymous).

One-time setup (Windows PowerShell):
    python -m pip install --upgrade playwright
    python -m playwright install chromium
Run:
    python nba/betr_harvest.py            # NBA (default)
    set BETR_LEAGUE=WNBA && python nba/betr_harvest.py   # WNBA (for testing before NBA opens)

Output: boards/betr_<league>_current.json  and  boards/betr_<league>_current_meta.json
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

LEAGUE = os.environ.get("BETR_LEAGUE", "NBA").upper()
OUT = Path(os.environ.get("BETR_OUT_DIR", "boards"))
OUT.mkdir(parents=True, exist_ok=True)
URL = "https://picks.betr.app/"
# the operation whose response carries the players+projections board
BOARD_OPS = ("LeagueUpcomingEvents", "GetLobbyContent")


def parse_projection_leg(ev, team, player, proj):
    """One Betr projection -> a flat leg (main line + the alternate line, both sides)."""
    legs = []
    line = proj.get("value")
    if line is None:
        return legs
    name = f"{player.get('firstName','')} {player.get('lastName','')}".strip()
    stat = proj.get("type") or proj.get("name") or proj.get("label")
    opts = [o.get("outcome") for o in (proj.get("allowedOptions") or [])]
    base = {"event_id": str(ev.get("id")), "player": name, "player_id": str(player.get("id")),
            "team": (team or {}).get("name"), "stat": stat, "market_id": proj.get("marketId"),
            "status": proj.get("marketStatus"), "start_time": ev.get("date")}
    # main line
    legs.append({**base, "line": line, "alt": False,
                 "over": "OVER" in [str(o).upper() for o in opts],
                 "under": "UNDER" in [str(o).upper() for o in opts]})
    # alternate line (Betr's nonRegularValue = the ladder rung)
    alt = proj.get("nonRegularValue")
    if alt is not None and alt != line:
        legs.append({**base, "line": alt, "alt": True,
                     "alt_percentage": proj.get("nonRegularPercentage")})
    return legs


def flatten(board_json):
    """Walk getUpcomingEventsV2 -> events -> teams/players -> projections into flat legs."""
    data = board_json.get("data") or {}
    events = data.get("getUpcomingEventsV2") or data.get("getTopTrendingPlayersData") or []
    legs = []
    for ev in events:
        # players live either directly on the event or under teams
        buckets = []
        for t in ev.get("teams", []) or []:
            buckets.append((t, t.get("players", []) or []))
        if ev.get("players"):
            buckets.append((None, ev.get("players")))
        for team, players in buckets:
            for p in players:
                for proj in p.get("projections", []) or []:
                    legs.extend(parse_projection_leg(ev, team, p, proj))
    return legs


async def run():
    from playwright.async_api import async_playwright
    captured = {}
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            locale="en-US")
        page = await ctx.new_page()

        async def on_response(resp):
            try:
                if "fantasy.betr.app/graphql" not in resp.url:
                    return
                body = await resp.json()
            except Exception:  # noqa: BLE001
                return
            # identify by the field present, not the op name (op name is in the request)
            d = (body or {}).get("data") or {}
            if "getUpcomingEventsV2" in d or "getTopTrendingPlayersData" in d:
                captured["board"] = body

        page.on("response", on_response)

        await page.goto(URL, wait_until="networkidle", timeout=60000)
        # the lobby loads the default league; navigate to the target league to force its board fetch
        try:
            await page.goto(f"{URL}?league={LEAGUE.lower()}", wait_until="networkidle", timeout=60000)
        except Exception:  # noqa: BLE001
            pass
        # give late XHRs a moment
        await page.wait_for_timeout(6000)
        await browser.close()

    if "board" not in captured:
        print("NO BOARD CAPTURED — the page did not fetch getUpcomingEventsV2. "
              "If NBA has no games yet, try BETR_LEAGUE=WNBA. If it still fails, the site structure changed.",
              file=sys.stderr)
        sys.exit(2)

    legs = flatten(captured["board"])
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "playwright picks.betr.app", "league": LEAGUE, "started_at": started,
            "fetched_at": fetched, "legs": len(legs), "alt_legs": sum(1 for l in legs if l.get("alt")),
            "players": len({l["player_id"] for l in legs}), "events": len({l["event_id"] for l in legs})}
    (OUT / f"betr_{LEAGUE.lower()}_current.json").write_text(
        json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    (OUT / f"betr_{LEAGUE.lower()}_current_meta.json").write_text(json.dumps(meta, indent=2))
    # also write the nba-named file the pipeline reads
    if LEAGUE == "NBA":
        (OUT / "betr_nba_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    print(f"OK {LEAGUE}: {meta['legs']} legs ({meta['alt_legs']} alt), {meta['players']} players, "
          f"{meta['events']} events -> {OUT}/betr_{LEAGUE.lower()}_current.json")


if __name__ == "__main__":
    asyncio.run(run())
