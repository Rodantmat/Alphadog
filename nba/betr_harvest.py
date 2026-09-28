#!/usr/bin/env python3
"""
Betr harvester (Path C) — real Chromium, drive the actual UI to the league board, and INTERCEPT the
getUpcomingEventsV2 GraphQL response the page fetches itself. (In-page injected fetch is blocked by CSP;
the page's own fetch is not. Discovery proved api.fantasy.betr.app returns 200 to the real browser.)

Setup (one time, PowerShell):
    python -m pip install --upgrade playwright
    python -m playwright install chromium
Run:
    $env:BETR_LEAGUE="WNBA"; python betr2.py     # test now (games tonight)
    $env:BETR_LEAGUE="NBA";  python betr2.py     # once NBA posts
Set $env:BETR_HEADLESS="1" once it works to run invisibly.
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
HEADLESS = os.environ.get("BETR_HEADLESS", "0") == "1"


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


async def run():
    from playwright.async_api import async_playwright
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    captured = {}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=HEADLESS)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            locale="en-US")
        page = await ctx.new_page()

        async def on_response(resp):
            if "fantasy.betr.app/graphql" not in resp.url:
                return
            try:
                body = await resp.json()
            except Exception:  # noqa: BLE001
                return
            d = (body or {}).get("data") or {}
            if isinstance(d, dict) and "getUpcomingEventsV2" in d and d.get("getUpcomingEventsV2"):
                captured["board"] = body
                print(f"  captured getUpcomingEventsV2: {len(d['getUpcomingEventsV2'])} events", flush=True)

        page.on("response", on_response)

        print(f"opening {URL} ...", flush=True)
        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_timeout(5000)

        # Drive the UI to the league board. Try direct deep-links first, then nav clicks.
        deep_links = [f"{URL}lobby/{LEAGUE.lower()}", f"{URL}{LEAGUE.lower()}", f"{URL}sports/{LEAGUE.lower()}",
                      f"{URL}lobby?league={LEAGUE}"]
        for link in deep_links:
            if "board" in captured:
                break
            try:
                print(f"  trying {link}", flush=True)
                await page.goto(link, wait_until="networkidle", timeout=45000)
                await page.wait_for_timeout(4000)
            except Exception:  # noqa: BLE001
                pass

        # If still nothing, click the league tab/name in the UI
        if "board" not in captured:
            for sel in (LEAGUE, LEAGUE.title(), "Basketball", "WNBA", "NBA"):
                try:
                    el = page.get_by_text(sel, exact=True)
                    if await el.count() > 0:
                        await el.first.click(timeout=4000)
                        print(f"  clicked '{sel}'", flush=True)
                        await page.wait_for_timeout(5000)
                        if "board" in captured:
                            break
                except Exception:  # noqa: BLE001
                    pass

        # let any late board fetch land
        for _ in range(4):
            if "board" in captured:
                break
            await page.mouse.wheel(0, 3000)
            await page.wait_for_timeout(2500)

        if "board" not in captured and not HEADLESS:
            print("  no board yet — browser stays open 40s; CLICK into the WNBA board yourself so it loads.", flush=True)
            for _ in range(20):
                if "board" in captured:
                    break
                await page.wait_for_timeout(2000)
        await browser.close()

    if "board" not in captured:
        print("NO BOARD CAPTURED. The page never fetched getUpcomingEventsV2. Tell me what the browser showed.",
              file=sys.stderr)
        sys.exit(2)

    legs, nevents = flatten(captured["board"])
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "playwright intercept picks.betr.app", "league": LEAGUE,
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
    asyncio.run(run())
