#!/usr/bin/env python3
"""
Underdog Pick'em board producer (our own scraper).
Source: https://api.underdogfantasy.com/v2/pickem_search/search_results?sport_id=<SPORT>&page=<n>  (the web app's own endpoint;
requires the app client headers - verified 2026-09-10: 200 direct and via proxy; the older beta/v6 over_under_lines is bot-blocked).
Env: UNDERDOG_SPORTS (default "MLB,NBA"), PROXY_URL (optional fallback), UNDERDOG_OUT_DIR.
Output per sport: boards/underdog_<sport>_current.json {meta, legs[], raw_lines[]} + _meta.json.
Leg = one over_under_line: player, team, stat, line, higher/lower multipliers (+ decimal/american prices), line_type (balanced/boosted...),
live flag, game id/start, appearance id. raw_lines keeps the untouched objects so nothing is lost while the schema settles.
"""
import json
import os
import sys
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from curl_cffi import requests

BASE = "https://api.underdogfantasy.com/v2/pickem_search/search_results"
OUT = Path(os.environ.get("UNDERDOG_OUT_DIR", "boards"))
H = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9", "Origin": "https://underdogfantasy.com", "Referer": "https://underdogfantasy.com/",
    "client-type": "web", "client-version": os.environ.get("UNDERDOG_CLIENT_VERSION", "20260901"), "client-device-id": os.environ.get("UNDERDOG_DEVICE_ID", str(uuid.uuid4())),
    "referring-device": "web", "user-latitude": "32.7157", "user-longitude": "-117.1611",
}


def get(session, url, proxies):
    last = None
    for attempt in range(3):
        for use_proxy in (False, True):
            try:
                r = session.get(url, headers=H, timeout=60, impersonate="chrome124", proxies=proxies if use_proxy else None)
                if r.status_code == 200:
                    return r.json()
                last = f"http {r.status_code}"
            except Exception as exc:  # noqa: BLE001
                last = str(exc)
            if not proxies:
                break
        time.sleep(2 + attempt * 3)
    raise RuntimeError(f"underdog fetch failed {url}: {last}")


def index(lst, key="id"):
    return {str(x.get(key)): x for x in (lst or []) if isinstance(x, dict)}


def main():
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    proxy = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy, "http": proxy} if proxy else None
    sports = [s.strip().upper() for s in os.environ.get("UNDERDOG_SPORTS", "MLB,NBA").split(",") if s.strip()]
    OUT.mkdir(parents=True, exist_ok=True)
    s = requests.Session()
    for sport in sports:
        lines, players, appearances, games, solo_games, teams = [], {}, {}, {}, {}, {}
        seen, page, opened = set(), 1, None
        while page <= 60:
            j = get(s, f"{BASE}?sport_id={sport}&page={page}", proxies)
            oul = j.get("over_under_lines") or []
            opened = j.get("opened_lines_count", opened)
            players.update(index(j.get("players"))); appearances.update(index(j.get("appearances"))); games.update(index(j.get("games"))); solo_games.update(index(j.get("solo_games"))); teams.update(index(j.get("teams")))
            new = [x for x in oul if x.get("id") not in seen]
            for x in new:
                seen.add(x.get("id")); lines.append(x)
            print(f"{sport} page {page}: {len(oul)} lines ({len(new)} new); opened_lines_count={opened}")
            if not oul or not new or (opened and len(lines) >= int(opened)):
                break
            page += 1
            time.sleep(0.6)
        fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        legs = []
        for ln in lines:
            ou = ln.get("over_under") or {}
            ast = ou.get("appearance_stat") or {}
            app = appearances.get(str(ast.get("appearance_id") or ln.get("appearance_id") or ""), {})
            pl = players.get(str(app.get("player_id") or ""), {})
            game = games.get(str(app.get("match_id") or app.get("game_id") or ""), {}) or solo_games.get(str(app.get("match_id") or ""), {})
            team = teams.get(str(app.get("team_id") or pl.get("team_id") or ""), {})
            opts = {str(o.get("choice")): o for o in ln.get("options") or []}
            hi, lo = opts.get("higher", {}), opts.get("lower", {})
            legs.append({
                "line_id": ln.get("id"), "sport": sport, "player": " ".join(x for x in (pl.get("first_name"), pl.get("last_name")) if x) or ou.get("title") or "",
                "player_id": app.get("player_id"), "team": team.get("abbr") or pl.get("team_abbr") or "", "position": pl.get("position") or app.get("position_id"),
                "stat": ast.get("display_stat") or ast.get("stat") or ou.get("title"), "stat_key": ast.get("stat"), "line": ln.get("stat_value"),
                "higher_multiplier": hi.get("payout_multiplier"), "lower_multiplier": lo.get("payout_multiplier"), "higher_decimal": hi.get("decimal_price"), "lower_decimal": lo.get("decimal_price"),
                "higher_american": hi.get("american_price"), "lower_american": lo.get("american_price"), "higher_label": hi.get("choice_display_name_shorter"), "lower_label": lo.get("choice_display_name_shorter"),
                "line_type": ln.get("line_type"), "live": ln.get("live_event"), "status": ln.get("status"), "expires_at": ln.get("expires_at"),
                "game_id": app.get("match_id"), "game_start": game.get("scheduled_at") or game.get("start_time"), "game_title": game.get("title") or "", "appearance_id": ast.get("appearance_id"),
            })
        meta = {"ok": True, "source": BASE, "sport": sport, "started_at": started, "fetched_at": fetched_at, "pages": page, "opened_lines_count": opened, "lines": len(lines), "legs": len(legs),
                "players": len({l["player_id"] for l in legs if l["player_id"]}), "by_stat": dict(Counter(l["stat"] for l in legs).most_common(40)), "by_line_type": dict(Counter(l["line_type"] for l in legs)),
                "live_lines": sum(1 for l in legs if l["live"]), "unresolved_player_names": sum(1 for l in legs if not l["player"]), "multiplier_values": dict(Counter(str(l["higher_multiplier"]) for l in legs).most_common(15)),
                "github_run_id": os.environ.get("GITHUB_RUN_ID", "")}
        (OUT / f"underdog_{sport.lower()}_current.json").write_text(json.dumps({"meta": meta, "legs": legs, "raw_lines": lines, "players": players, "appearances": appearances, "games": games, "teams": teams}, separators=(",", ":")))
        (OUT / f"underdog_{sport.lower()}_current_meta.json").write_text(json.dumps(meta, indent=2))
        print(f"{sport}: {len(legs)} legs, players={meta['players']}, unresolved names={meta['unresolved_player_names']}, line_types={meta['by_line_type']}, live={meta['live_lines']}")


if __name__ == "__main__":
    main()
