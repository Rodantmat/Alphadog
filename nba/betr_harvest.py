#!/usr/bin/env python3
"""
Betr harvester (Path C, STEALTH) — Betr sits behind Cloudflare Turnstile ("Verify you are human"), which
detects vanilla Playwright and loops the challenge, so the app never boots to the board. Fix: launch a
patched/stealth Chromium that Cloudflare does not flag, let the human-verification pass (usually auto for a
real residential IP once the fingerprint is clean), then intercept the page's own getUpcomingEventsV2.

Setup (one time, PowerShell):
    python -m pip install --upgrade playwright playwright-stealth
    python -m playwright install chromium
Run (VISIBLE so you can click the Turnstile box if it shows):
    $env:BETR_LEAGUE="WNBA"; python betr4.py
If the checkbox appears, CLICK IT ONCE; the script waits for the board.

Notes: keep headless OFF for Cloudflare (headless is far more detectable). Once it works reliably we can
try headful-in-a-virtual-display on the mini-PC.
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


async def apply_stealth(page):
    """Best-effort: use playwright-stealth if installed; always add the manual patches Cloudflare checks."""
    try:
        from playwright_stealth import stealth_async
        await stealth_async(page)
        print("  playwright-stealth applied", flush=True)
    except Exception:  # noqa: BLE001
        print("  playwright-stealth not available; using manual patches only "
              "(pip install playwright-stealth for best results)", flush=True)
    await page.add_init_script(
        "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
        "window.chrome={runtime:{}};"
        "Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});"
        "Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});"
    )


async def run():
    from playwright.async_api import async_playwright
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    captured = {}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-features=IsolateOrigins,site-per-process"])
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            locale="en-US", viewport={"width": 1366, "height": 900})
        page = await ctx.new_page()
        await apply_stealth(page)

        async def on_response(resp):
            if "fantasy.betr.app/graphql" not in resp.url:
                return
            try:
                body = await resp.json()
            except Exception:  # noqa: BLE001
                return
            d = (body or {}).get("data") or {}
            if isinstance(d, dict) and d.get("getUpcomingEventsV2"):
                captured["board"] = body
                print(f"  captured getUpcomingEventsV2: {len(d['getUpcomingEventsV2'])} events", flush=True)

        page.on("response", on_response)

        print(f"opening {URL} — if a Cloudflare 'Verify you are human' box appears, CLICK IT.", flush=True)
        await page.goto(URL, wait_until="load", timeout=60000)

        # up to 90s: wait for Cloudflare to clear + board to load; nudge toward the league
        for step in range(45):
            if "board" in captured:
                break
            await page.wait_for_timeout(2000)
            if step in (5, 15, 25):
                for sel in (LEAGUE, LEAGUE.title(), "Basketball"):
                    try:
                        el = page.get_by_text(sel, exact=True)
                        if await el.count() > 0:
                            await el.first.click(timeout=3000)
                            print(f"  clicked '{sel}'", flush=True)
                            break
                    except Exception:  # noqa: BLE001
                        pass
        await browser.close()

    if "board" not in captured:
        print("NO BOARD CAPTURED. If the Cloudflare box kept looping, stealth needs strengthening "
              "(tell me); if it cleared but no board, tell me what the page showed.", file=sys.stderr)
        sys.exit(2)

    legs, nevents = flatten(captured["board"])
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "playwright-stealth picks.betr.app", "league": LEAGUE,
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
