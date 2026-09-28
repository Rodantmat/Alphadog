#!/usr/bin/env python3
"""
Betr DISCOVERY harvester (Path C, visible browser + full logging). The headless run captured nothing, so
this version:
  - runs Chromium VISIBLE (headless=False) so you can watch what Betr shows,
  - logs EVERY graphql request/response (operationName + which data fields came back + byte size),
  - saves each fantasy graphql response body to boards/betr_debug_<n>.json so we see the real shape,
  - waits longer and scrolls, in case the board lazy-loads.
Run (PowerShell), pick a league that HAS games tonight (WNBA):
    $env:BETR_LEAGUE="WNBA"; python betr_harvest.py
Watch the console, and tell me the lines it prints. Nothing is written to the pipeline in this mode.
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
HEADLESS = os.environ.get("BETR_HEADLESS", "0") == "1"   # default VISIBLE for discovery


async def run():
    from playwright.async_api import async_playwright
    seen = []
    n = {"i": 0}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=HEADLESS)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            locale="en-US")
        page = await ctx.new_page()

        async def on_request(req):
            if "graphql" in req.url:
                op = ""
                try:
                    pd = req.post_data
                    if pd:
                        op = (json.loads(pd) or {}).get("operationName", "")
                except Exception:  # noqa: BLE001
                    pass
                print(f"  -> REQUEST graphql op={op or '?'} host={req.url.split('/')[2]}", flush=True)

        async def on_response(resp):
            if "graphql" not in resp.url:
                return
            status = resp.status
            try:
                body = await resp.json()
            except Exception:  # noqa: BLE001
                txt = ""
                try:
                    txt = (await resp.text())[:120]
                except Exception:  # noqa: BLE001
                    pass
                print(f"  <- RESPONSE graphql status={status} host={resp.url.split('/')[2]} (non-json) {txt}", flush=True)
                return
            d = (body or {}).get("data") or {}
            keys = list(d.keys()) if isinstance(d, dict) else []
            errs = body.get("errors")
            n["i"] += 1
            fn = OUT / f"betr_debug_{n['i']}.json"
            fn.write_text(json.dumps(body)[:200000])
            print(f"  <- RESPONSE graphql status={status} host={resp.url.split('/')[2]} "
                  f"dataKeys={keys} errors={'yes' if errs else 'no'} saved={fn.name}", flush=True)
            seen.append(keys)

        page.on("request", on_request)
        page.on("response", on_response)

        print(f"opening {URL} (league {LEAGUE}) ...", flush=True)
        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_timeout(4000)
        # try to click the league in the nav if present
        for label in (LEAGUE, LEAGUE.title(), "WNBA", "NBA"):
            try:
                el = page.get_by_text(label, exact=True)
                if await el.count() > 0:
                    await el.first.click(timeout=3000)
                    print(f"clicked nav '{label}'", flush=True)
                    await page.wait_for_timeout(4000)
                    break
            except Exception:  # noqa: BLE001
                pass
        # scroll to trigger lazy loads
        for _ in range(3):
            await page.mouse.wheel(0, 4000)
            await page.wait_for_timeout(2000)
        await page.wait_for_timeout(4000)
        print("done watching. graphql responses seen:", len(seen), flush=True)
        if not HEADLESS:
            print("Browser stays open 20s so you can look — note what the page shows.", flush=True)
            await page.wait_for_timeout(20000)
        await browser.close()

    print("\nSUMMARY: saved", n["i"], "graphql bodies to", str(OUT))
    print("If any dataKeys include getUpcomingEventsV2 or players/projections, upload that betr_debug_*.json.")


if __name__ == "__main__":
    asyncio.run(run())
