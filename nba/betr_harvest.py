#!/usr/bin/env python3
"""
Betr harvester (Path C) — loads picks.betr.app in a REAL Chromium so Betr's JS/anti-bot is satisfied, then
runs the board query FROM INSIDE THE PAGE via the site's own fetch(). Because the call originates in the
page, every header the edge demands (JS-computed) is attached automatically — which is why the raw-HTTP
probes 401'd but this 200s (discovery run proved api.fantasy.betr.app returns 200 to the real browser).

Setup (one time, PowerShell):
    python -m pip install --upgrade playwright
    python -m playwright install chromium
Run:
    $env:BETR_LEAGUE="WNBA"; python betr_harvest.py     # test now
    $env:BETR_LEAGUE="NBA";  python betr_harvest.py     # once NBA posts
Set $env:BETR_HEADLESS="1" to run invisibly once it works.

Output: boards/betr_<league>_current.json (+ _meta.json), and betr_nba_current.json for NBA.
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

QUERY = """query LeagueUpcomingEvents($league: League!) {
  getUpcomingEventsV2(league: $league) {
    ...EventInfoData
    ... on TeamVersusEvent { teams { ...TeamInfoWithPlayers __typename } __typename }
    ... on TeamTournamentEvent { teams { ...TeamInfoWithPlayers __typename } __typename }
    ... on IndividualTournamentEvent { players { ...PlayerInfoWithProjections __typename } __typename }
    ... on IndividualVersusEvent { players { ...PlayerInfoWithProjections __typename } __typename }
    __typename
  }
}
fragment EventInfoData on EventV2 { id date status sport league competitionType playerStructure name __typename }
fragment TeamInfoWithPlayers on Team { ...TeamInfo players { ...PlayerInfoWithProjections __typename } __typename }
fragment TeamInfo on Team { id name league sport fullName __typename }
fragment PlayerInfoWithProjections on Player { ...PlayerInfo projections { ...PlayerProjection __typename } __typename }
fragment PlayerInfo on Player { id firstName lastName position jerseyNumber record rank __typename }
fragment PlayerProjection on Projection { marketId marketStatus isLive type label name key order value nonRegularPercentage nonRegularValue allowedOptions { marketOptionId outcome __typename } currentValue liveScoringDisabled __typename }
"""


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
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=HEADLESS)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            locale="en-US")
        page = await ctx.new_page()
        print(f"opening {URL} to warm up the session ...", flush=True)
        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_timeout(5000)  # let the app boot and set up its fetch/auth

        # Run the board query FROM the page context — the site's own fetch adds the required headers.
        print(f"querying board for {LEAGUE} from inside the page ...", flush=True)
        body = await page.evaluate(
            """async ({query, league}) => {
                const r = await fetch("https://api.fantasy.betr.app/graphql", {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "accept": "application/graphql-response+json, application/graphql+json, application/json"
                    },
                    body: JSON.stringify({operationName: "LeagueUpcomingEvents", query, variables: {league}}),
                    credentials: "include"
                });
                return { status: r.status, text: await r.text() };
            }""",
            {"query": QUERY, "league": LEAGUE})
        await browser.close()

    print("board fetch status:", body.get("status"), flush=True)
    if body.get("status") != 200:
        print("NON-200 from in-page fetch:", (body.get("text") or "")[:200], file=sys.stderr)
        # save raw for inspection
        (OUT / f"betr_{LEAGUE.lower()}_raw.txt").write_text(body.get("text") or "")
        sys.exit(2)
    try:
        parsed = json.loads(body["text"])
    except Exception as e:  # noqa: BLE001
        print("could not parse JSON:", e, file=sys.stderr); sys.exit(2)
    if parsed.get("errors"):
        print("GraphQL errors:", json.dumps(parsed["errors"])[:300], file=sys.stderr)

    legs, nevents = flatten(parsed)
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "playwright in-page fetch picks.betr.app", "league": LEAGUE,
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
