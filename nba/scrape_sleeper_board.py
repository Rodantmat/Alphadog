#!/usr/bin/env python3
"""
Sleeper Picks board producer (our own scraper; same role as the PrizePicks producer).
Source: https://api.sleeper.app/lines/available?dynamic=true (public, no auth) + /v1/players/<sport> for names.
Env: SLEEPER_SPORTS (comma list of Sleeper sport tags, default "mlb,nba"), PROXY_URL (optional).
Output per sport: sleeper_<sport>_current.json {meta, legs[], raw_count} and sleeper_players_<sport>.json (slim id map, cached).
Leg = one (player, stat, line) with both sides' multipliers - the object the grader and slip engine consume.
"""
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from curl_cffi import requests

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json", "Referer": "https://sleeper.com/"}
# CAPTURED FROM THE APP 2026-09-27 (owner, mitmproxy, WNBA board): the app calls TWO line endpoints.
#   lines/available      - one line per player+stat, BOTH sides, each side its own multiplier (what we had)
#                          + enable_one_sided_lines=true, which the app sends (some markets are over- or under-only)
#   lines/available_alt  - THE LADDER: over-only rungs at spaced lines, each with its own payout, e.g. points
#                          9.5 x1.03 / 14.5 x1.31 / 19.5 x2.00 / 24.5 x3.36 / 29.5 x6.94 - PrizePicks' goblin-to-demon
#                          axis as explicit lines. line_type = "alt_<line>". Public, Cloudflare-cached, no auth.
# Both bodies also carry pick_stats (public over/under pick counts + popularity per market) - kept on every leg.
LINES_URL = "https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true"
ALT_URL = "https://api.sleeper.app/lines/available_alt?include_preseason=true"
# PROMOS (captured 2026-09-27): boosted payouts on an existing line - the same player/stat/line appears in
# the main board at x1.82 and here at x2.02 with line_type "line_promotion", metadata.promotion_type
# "over_boost". Emitted as their own legs (promo=True) and archived under <market>_promo so the boosted
# multiplier never overwrites the normal row. The body also repeats the normal line; deduped by line_id.
PROMOS_URL = "https://api.sleeper.app/lines/promos?enable_one_sided_lines=true"
PLAYERS_URL = "https://api.sleeper.app/v1/players/{sport}"
OUT = Path(os.environ.get("SLEEPER_OUT_DIR", "."))


def fetch(session, url, proxies, tries=3):
    last = None
    for i in range(tries):
        for use_proxy in (False, True):
            try:
                r = session.get(url, headers=UA, timeout=60, impersonate="chrome124", proxies=proxies if use_proxy else None)
                if r.status_code == 200:
                    return r
                last = f"http {r.status_code}"
            except Exception as exc:  # noqa: BLE001
                last = str(exc)
            if not proxies:
                break
        time.sleep(2 + i * 3)
    raise RuntimeError(f"fetch failed {url}: {last}")


def slim_players(raw):
    out = {}
    for pid, p in (raw or {}).items():
        if not isinstance(p, dict):
            continue
        name = p.get("full_name") or " ".join(x for x in (p.get("first_name"), p.get("last_name")) if x)
        out[str(pid)] = {"name": name, "team": p.get("team"), "position": p.get("position"), "status": p.get("status")}
    return out


def main():
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    proxy = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy, "http": proxy} if proxy else None
    sports = [s.strip() for s in os.environ.get("SLEEPER_SPORTS", "mlb,nba").split(",") if s.strip()]
    s = requests.Session()
    lines = fetch(s, LINES_URL, proxies).json()
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not isinstance(lines, list):
        print("unexpected lines payload", file=sys.stderr); sys.exit(1)
    # THE LADDER. Fetched per sport (the app passes sports[]); a failure here is loud but does not cost the
    # main board - the alt rungs are additional legs, never a substitute.
    alt_by_sport = {}
    for sport in sports:
        try:
            alt = fetch(s, f"{ALT_URL}&sports%5B%5D={sport}", proxies).json()
            alt_by_sport[sport] = alt if isinstance(alt, list) else []
        except Exception as exc:  # noqa: BLE001
            print(f"{sport}: ALT LADDER FETCH FAILED ({exc}) - main board only this run", file=sys.stderr)
            alt_by_sport[sport] = None
    by_sport = Counter(o.get("sport") for ln in lines for o in ln.get("options", [])[:1])
    print("lines:", len(lines), "by sport:", by_sport.most_common(10),
          "| alt markets:", {k: (len(v) if v is not None else "FAILED") for k, v in alt_by_sport.items()})
    for sport in sports:
        pfile = OUT / f"sleeper_players_{sport}.json"
        players = {}
        stale = True
        if pfile.exists():
            try:
                cached = json.loads(pfile.read_text())
                players = cached.get("players", {})
                age_h = (time.time() - cached.get("fetched_epoch", 0)) / 3600
                stale = age_h > 24
            except Exception:  # noqa: BLE001
                players, stale = {}, True
        # refresh the id map daily or when a leg references an unknown id
        needed = {o.get("subject_id") for ln in lines for o in ln.get("options", []) if o.get("sport") == sport and o.get("subject_type") == "player"}
        if stale or any(pid not in players for pid in needed):
            try:
                raw = fetch(s, PLAYERS_URL.format(sport=sport), proxies).json()
                players = slim_players(raw)
                pfile.write_text(json.dumps({"fetched_epoch": time.time(), "sport": sport, "count": len(players), "players": players}, separators=(",", ":")))
                print(f"{sport}: players map refreshed ({len(players)})")
            except Exception as exc:  # noqa: BLE001
                print(f"{sport}: players map refresh failed: {exc}", file=sys.stderr)
        legs, unknown = [], 0
        for ln in lines:
            opts = ln.get("options", [])
            if not opts or opts[0].get("sport") != sport:
                continue
            o0 = opts[0]
            pid = str(o0.get("subject_id"))
            pinfo = players.get(pid, {})
            if o0.get("subject_type") == "player" and not pinfo:
                unknown += 1
            sides = {o.get("outcome"): o for o in opts}
            over, under = sides.get("over", {}), sides.get("under", {})
            legs.append({
                "line_id": o0.get("line_id"), "sport": sport, "game_id": o0.get("game_id"), "game_status": o0.get("game_status"),
                "subject_id": pid, "subject_type": o0.get("subject_type"), "player": pinfo.get("name") or o0.get("subject_name") or "",
                "team": o0.get("subject_team") or pinfo.get("team"), "position": o0.get("subject_position") or pinfo.get("position"),
                "wager_type": o0.get("wager_type"), "market_type": o0.get("market_type"), "line_type": o0.get("line_type"),
                "line": o0.get("outcome_value"), "over_multiplier": over.get("payout_multiplier"), "under_multiplier": under.get("payout_multiplier"),
                "over_status": over.get("status"), "under_status": under.get("status"), "line_status": ln.get("status"), "season": o0.get("season"), "season_type": o0.get("season_type"),
                "metadata": o0.get("metadata") or {}, "alt": False, "pick_stats": ln.get("pick_stats"),
            })
        # ALT LADDER LEGS: one leg per rung. Every option is an OVER at its own line with its own payout; the
        # under side does not exist on the ladder (Sleeper prices the low rungs near 1.0x, the high ones
        # up to ~7x). The archiver files these as `<market>_alternate`, exactly like PrizePicks goblins/demons.
        alt_n = 0
        for ln in (alt_by_sport.get(sport) or []):
            opts = ln.get("options", [])
            if not opts or opts[0].get("sport") != sport:
                continue
            pid = str(opts[0].get("subject_id"))
            pinfo = players.get(pid, {})
            if opts[0].get("subject_type") == "player" and not pinfo:
                unknown += 1
            for o in opts:
                legs.append({
                    "line_id": o.get("line_id"), "sport": sport, "game_id": o.get("game_id"), "game_status": o.get("game_status"),
                    "subject_id": pid, "subject_type": o.get("subject_type"), "player": pinfo.get("name") or o.get("subject_name") or "",
                    "team": o.get("subject_team") or pinfo.get("team"), "position": o.get("subject_position") or pinfo.get("position"),
                    "wager_type": o.get("wager_type"), "market_type": o.get("market_type"), "line_type": o.get("line_type"),
                    "line": o.get("outcome_value"),
                    "over_multiplier": o.get("payout_multiplier") if o.get("outcome") == "over" else None,
                    "under_multiplier": o.get("payout_multiplier") if o.get("outcome") == "under" else None,
                    "over_status": o.get("status") if o.get("outcome") == "over" else None,
                    "under_status": o.get("status") if o.get("outcome") == "under" else None,
                    "line_status": ln.get("status"), "season": o.get("season"), "season_type": o.get("season_type"),
                    "metadata": o.get("metadata") or {}, "alt": True, "pick_stats": ln.get("pick_stats"),
                })
                alt_n += 1
        meta = {"ok": True, "source": LINES_URL, "alt_source": ALT_URL, "started_at": started, "fetched_at": fetched_at, "sport": sport,
                "legs": len(legs), "alt_legs": alt_n, "alt_fetch_ok": alt_by_sport.get(sport) is not None, "unknown_players": unknown,
                "by_wager_type": dict(Counter(l["wager_type"] for l in legs).most_common(40)), "by_line_type": dict(Counter(l["line_type"] for l in legs)),
                "by_game_status": dict(Counter(l["game_status"] for l in legs)), "players": len({l["subject_id"] for l in legs}),
                "multiplier_values": dict(Counter(str(l["over_multiplier"]) for l in legs).most_common(15)), "github_run_id": os.environ.get("GITHUB_RUN_ID", "")}
        (OUT / f"sleeper_{sport}_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
        (OUT / f"sleeper_{sport}_current_meta.json").write_text(json.dumps(meta, indent=2))
        print(f"{sport}: {len(legs)} legs, {meta['players']} players, unknown={unknown}, line_types={meta['by_line_type']}")


if __name__ == "__main__":
    main()
