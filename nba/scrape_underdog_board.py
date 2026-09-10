#!/usr/bin/env python3
"""
Underdog Pick'em board producer v2 (our own scraper, built from the real app calls captured 2026-09-10).
Flow (no auth needed): scaffold -> market_filters (categories) -> match_grouped_lines per category (pregame + live)
                       + lines?show_mass_option_markets=true (ladders) -> merge over_under_lines by id.
Required query params on every call: product=fantasy, product_experience_id, state_config_id (state rule set; CA captured).
Env: UNDERDOG_SPORTS (default "MLB,NBA"), UNDERDOG_PXID, UNDERDOG_STATE_CONFIG, UNDERDOG_CLIENT_VERSION, PROXY_URL (fallback), UNDERDOG_OUT_DIR.
Output per sport: boards/underdog_<sport>_current.json {meta, legs[], raw_lines[], players, appearances, games, teams} + _meta.json.
"""
import json
import os
import sys
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from curl_cffi import requests

API = "https://api.underdogfantasy.com"
PXID = os.environ.get("UNDERDOG_PXID", "b34dfd93-d0e8-4da3-8bf4-45c15c548dec")
STATE = os.environ.get("UNDERDOG_STATE_CONFIG", "725014ef-3570-4e93-871d-d69674ab3521")
OUT = Path(os.environ.get("UNDERDOG_OUT_DIR", "boards"))
DEVICE = os.environ.get("UNDERDOG_DEVICE_ID") or str(uuid.uuid4())
H = {
    "accept": "application/json", "accept-language": "en-US,en;q=0.9", "origin": "https://app.underdogsports.com", "referer": "https://app.underdogsports.com/",
    "client-type": "web", "client-version": os.environ.get("UNDERDOG_CLIENT_VERSION", "20260907143253"), "client-device-id": DEVICE,
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    "user-latitude": os.environ.get("UNDERDOG_LAT", "32.65148161377867"), "user-longitude": os.environ.get("UNDERDOG_LON", "-116.8550890281236"),
}
COMMON = f"product=fantasy&product_experience_id={PXID}&state_config_id={STATE}"


def get(session, url, proxies):
    last = None
    for attempt in range(3):
        for use_proxy in (False, True):
            try:
                r = session.get(url, headers={**H, "client-request-id": str(uuid.uuid4())}, timeout=60, impersonate="safari_ios", proxies=proxies if use_proxy else None)
                if r.status_code == 200:
                    return r.json()
                last = f"http {r.status_code}"
            except Exception as exc:  # noqa: BLE001
                last = str(exc)
            if not proxies:
                break
        time.sleep(2 + attempt * 3)
    raise RuntimeError(f"underdog fetch failed {url[:120]}: {last}")


def as_dict(x, key="id"):
    if isinstance(x, dict):
        return {str(k): v for k, v in x.items()}
    return {str(i.get(key)): i for i in (x or []) if isinstance(i, dict)}


def merge(store, j):
    for k in ("over_under_lines", "appearances", "players", "games", "solo_games", "teams"):
        store[k].update(as_dict(j.get(k)))


def main():
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    proxy = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy, "http": proxy} if proxy else None
    sports = [s.strip().upper() for s in os.environ.get("UNDERDOG_SPORTS", "MLB,NBA").split(",") if s.strip()]
    OUT.mkdir(parents=True, exist_ok=True)
    s = requests.Session()
    for sport in sports:
        store = {k: {} for k in ("over_under_lines", "appearances", "players", "games", "solo_games", "teams")}
        calls = []
        # 1) match list (pregame + live) from the sport grid; this also yields the featured/core lines
        matches = []
        try:
            j = get(s, f"{API}/v1/lobbies/content/match_grouped_lines?include_live=true&market_categories%5B%5D=core&match_limit=200&{COMMON}&show_more_picks_cta=true&sport_id={sport}&two_box_enabled_surface=true", proxies)
            merge(store, j)
            matches = [(mg.get("id"), mg.get("type") or "Game") for mg in (j.get("match_groups") or []) if isinstance(mg, dict) and mg.get("id")]
            calls.append(("match_grouped_lines[core]", len(store["over_under_lines"])))
        except Exception as exc:  # noqa: BLE001
            calls.append(("match_grouped_lines_error", str(exc)[:80]))
        # 2) per-match lines: Popular first, then every filter pill (PickemStat = stat ids discovered from the lines'
        #    over_under.appearance_stat.pickem_stat_id, MarketGroup = seeded ids) -> union = the full board
        SEED_STATS = {"MLB": ["311b6775-4d03-4466-8ab9-776442468b27", "4969134d-144f-4b30-b0bc-3e1932c84385", "53a72b17-e0a3-4d28-b98a-3ce5f7d58d92", "1f670d50-4b2e-4fde-b9c7-598418a986a1", "5efeda12-bacd-48b5-9d52-f64e00f7c9fd", "a74cd651-437c-4e6c-b011-c58789b09db7", "4dc8687c-fb40-486a-8be4-31c5a05dd3f1", "18993dd5-3442-44fd-8b09-a7d66bdf6723", "0e012ab0-1f09-40cf-8d63-85386f172dd2"]}
        SEED_GROUPS = {"MLB": ["6bd05401-eb13-4dc9-952e-03b5442b8ad0", "1e9af10c-4192-40db-bb6f-14bece463f60"]}
        reg_path = OUT / f"underdog_filters_{sport.lower()}.json"
        registry = {"pickem_stats": {}, "market_groups": {}}
        if reg_path.exists():
            try: registry = json.loads(reg_path.read_text())
            except Exception: pass  # noqa: BLE001
        for sid in SEED_STATS.get(sport, []): registry["pickem_stats"].setdefault(sid, "")
        for gid in SEED_GROUPS.get(sport, []): registry["market_groups"].setdefault(gid, "")
        def harvest(j):
            for ln in (j.get("over_under_lines") or {}).values() if isinstance(j.get("over_under_lines"), dict) else (j.get("over_under_lines") or []):
                ast = ((ln.get("over_under") or {}).get("appearance_stat") or {})
                if ast.get("pickem_stat_id"): registry["pickem_stats"][ast["pickem_stat_id"]] = ast.get("display_stat") or registry["pickem_stats"].get(ast["pickem_stat_id"], "")
        for mid, mtype in matches[:120]:
            base = f"{API}/v1/lobbies/content/lines?include_live=true&match_id={mid}&match_type={quote(str(mtype))}&{COMMON}&show_mass_option_markets=true"
            try:
                j = get(s, base, proxies); harvest(j)
                before = len(store["over_under_lines"]); merge(store, j); calls.append((f"lines[match={mid}]", len(store["over_under_lines"]) - before))
            except Exception as exc:  # noqa: BLE001
                calls.append((f"lines[match={mid}]_error", str(exc)[:60]))
            filters = [(sid, "PickemStat") for sid in list(registry["pickem_stats"])] + [(gid, "MarketGroup") for gid in list(registry["market_groups"])]
            added = 0
            for fid, ftype in filters:
                try:
                    j = get(s, f"{base}&filter_id={fid}&filter_type={ftype}", proxies); harvest(j)
                    before = len(store["over_under_lines"]); merge(store, j); added += len(store["over_under_lines"]) - before
                except Exception as exc:  # noqa: BLE001
                    calls.append((f"lines[match={mid},{ftype}]_error", str(exc)[:40]))
                time.sleep(0.25)
            calls.append((f"pills[match={mid}]", added))
            time.sleep(0.3)
        reg_path.write_text(json.dumps(registry, indent=1))
        # 3b) per-player completeness pass: lines_with_stats returns EVERY market for the player (learns unseen stat ids too)
        seen_apps = {str(a.get("id")) for a in store["appearances"].values() if isinstance(a, dict) and a.get("type") == "Player" and a.get("player_id")}
        added = 0
        for aid in sorted(seen_apps)[:250]:
            try:
                j = get(s, f"{API}/v1/lobbies/content/lines_with_stats?appearance_id={aid}&{COMMON}", proxies); harvest(j)
                before = len(store["over_under_lines"]); merge(store, j); added += len(store["over_under_lines"]) - before
            except Exception as exc:  # noqa: BLE001
                calls.append((f"lines_with_stats[{aid[:8]}]_error", str(exc)[:40]))
            time.sleep(0.25)
        calls.append(("lines_with_stats[players]", added, len(seen_apps)))
        reg_path.write_text(json.dumps(registry, indent=1))
        # 3c) ALTERNATE LADDERS: for every over_under with has_alternates, /v3/over_unders/<id>/alternate_projections returns every rung
        #     (is_main flag, higher/lower payout multipliers, prices, and Underdog's fantasy + sportsbook implied probabilities per side)
        alt_legs, alt_calls, alt_errors = [], 0, 0
        for lid, ln in list(store["over_under_lines"].items()):
            ou = ln.get("over_under") or {}
            if not ou.get("has_alternates") or not ou.get("id"):
                continue
            try:
                j = get(s, f"{API}/v3/over_unders/{ou['id']}/alternate_projections?{COMMON}", proxies); alt_calls += 1
            except Exception as exc:  # noqa: BLE001
                alt_errors += 1; continue
            ast = ou.get("appearance_stat") or {}
            app = store["appearances"].get(str(ast.get("appearance_id") or ""), {})
            pl = store["players"].get(str(app.get("player_id") or ""), {})
            for pr in j.get("projections") or []:
                opts = {str(o.get("choice")): o for o in pr.get("options") or []}
                hi, lo = opts.get("higher", {}), opts.get("lower", {})
                prob = lambda o, k: ((o.get("odds") or {}).get(k) or {}).get("probability")
                alt_legs.append({
                    "line_id": pr.get("id"), "over_under_id": ou.get("id"), "sport": sport, "is_main": bool(pr.get("is_main")), "stable_id": pr.get("stable_id"),
                    "player": " ".join(x for x in (pl.get("first_name"), pl.get("last_name")) if x) or ou.get("title") or "", "player_id": app.get("player_id"),
                    "stat": ast.get("display_stat") or ou.get("title"), "stat_key": ast.get("stat"), "line": pr.get("stat_value"),
                    "higher_multiplier": hi.get("payout_multiplier"), "lower_multiplier": lo.get("payout_multiplier"), "higher_american": hi.get("american_price"), "lower_american": lo.get("american_price"),
                    "higher_prob_fantasy": prob(hi, "fantasy"), "lower_prob_fantasy": prob(lo, "fantasy"), "higher_prob_sportsbook": prob(hi, "sportsbook"), "lower_prob_sportsbook": prob(lo, "sportsbook"),
                    "higher_status": hi.get("status"), "lower_status": lo.get("status"), "game_id": app.get("match_id"), "updated_at": hi.get("updated_at") or lo.get("updated_at"),
                })
            time.sleep(0.25)
        # De-dupe ladder rungs: the same economic rung can be harvested twice (via a pill and via lines_with_stats)
        # and the board may have moved between calls. Key on (player_id or player, stat, line, is_main) and keep the
        # freshest row by updated_at - a selector must never see the same leg twice at two different prices.
        def _rungkey(l):
            return (l.get("player_id") or l.get("player"), l.get("stat"), l.get("line"), bool(l.get("is_main")))
        _best = {}
        for l in alt_legs:
            k = _rungkey(l)
            cur = _best.get(k)
            if cur is None or str(l.get("updated_at") or "") > str(cur.get("updated_at") or ""):
                _best[k] = l
        dupes_dropped = len(alt_legs) - len(_best)
        alt_legs = list(_best.values())
        calls.append(("alternate_projections", alt_calls, len(alt_legs), alt_errors, f"deduped {dupes_dropped}"))
        cats = sorted(registry["pickem_stats"].values())
        # 3) popular picks incl. mass-option (ladder) markets
        for mass in ("true", "false"):
            try:
                j = get(s, f"{API}/v1/lobbies/content/lines?include_live=true&{COMMON}&show_mass_option_markets={mass}&sport_id={sport}", proxies)
                before = len(store["over_under_lines"]); merge(store, j); calls.append((f"lines[mass={mass}]", len(store["over_under_lines"]) - before))
            except Exception as exc:  # noqa: BLE001
                calls.append((f"lines[mass={mass}]_error", str(exc)[:80]))
            time.sleep(0.5)
        fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        # 4) flatten
        legs = []
        for lid, ln in store["over_under_lines"].items():
            ou = ln.get("over_under") or {}
            ast = ou.get("appearance_stat") or {}
            app = store["appearances"].get(str(ast.get("appearance_id") or ""), {})
            pl = store["players"].get(str(app.get("player_id") or ""), {})
            game = store["games"].get(str(app.get("match_id") or ""), {}) or store["solo_games"].get(str(app.get("match_id") or ""), {})
            team = store["teams"].get(str(app.get("team_id") or pl.get("team_id") or ""), {})
            opts = {str(o.get("choice")): o for o in ln.get("options") or []}
            hi, lo = opts.get("higher", {}), opts.get("lower", {})
            legs.append({
                "line_id": lid, "sport": sport, "player": " ".join(x for x in (pl.get("first_name"), pl.get("last_name")) if x) or ou.get("title") or "",
                "player_id": app.get("player_id"), "appearance_type": app.get("type"), "team": team.get("abbr") or "", "position": pl.get("position") or app.get("position_id"),
                "stat": ast.get("display_stat") or ast.get("stat") or ou.get("title"), "stat_key": ast.get("stat"), "line": ln.get("stat_value"),
                "higher_multiplier": hi.get("payout_multiplier"), "lower_multiplier": lo.get("payout_multiplier"), "higher_decimal": hi.get("decimal_price"), "lower_decimal": lo.get("decimal_price"),
                "higher_american": hi.get("american_price"), "lower_american": lo.get("american_price"), "higher_label": hi.get("choice_display_name_shorter"), "lower_label": lo.get("choice_display_name_shorter"),
                "line_type": ln.get("line_type"), "live": ln.get("live_event"), "status": ln.get("status"), "expires_at": ln.get("expires_at"), "rank": ln.get("rank"),
                "game_id": app.get("match_id"), "game_start": game.get("scheduled_at") or game.get("start_time"), "game_title": game.get("title") or "", "appearance_id": ast.get("appearance_id"),
            })
        meta = {"ok": True, "source": "underdog lobby content (match_grouped_lines -> per-match lines + pills -> lines_with_stats) + v3 alternate_projections ladders", "sport": sport, "started_at": started, "fetched_at": fetched_at,
                "categories": cats, "calls": calls, "lines": len(store["over_under_lines"]), "legs": len(legs), "ladder_legs": len(alt_legs), "ladder_lines_with_alternates": alt_calls, "players": len({l["player_id"] for l in legs if l["player_id"]}),
                "pregame_legs": sum(1 for l in legs if not l["live"]), "live_legs": sum(1 for l in legs if l["live"]), "by_stat": dict(Counter(l["stat"] for l in legs).most_common(50)),
                "by_line_type": dict(Counter(l["line_type"] for l in legs)), "unresolved_player_names": sum(1 for l in legs if l["appearance_type"] == "Player" and not l["player"]),
                "multiplier_values": dict(Counter(str(l["higher_multiplier"]) for l in legs).most_common(15)), "github_run_id": os.environ.get("GITHUB_RUN_ID", "")}
        (OUT / f"underdog_{sport.lower()}_current.json").write_text(json.dumps({"meta": meta, "legs": legs, "ladder": alt_legs, "raw_lines": list(store["over_under_lines"].values()), "players": store["players"], "appearances": store["appearances"], "games": store["games"], "teams": store["teams"]}, separators=(",", ":")))
        (OUT / f"underdog_{sport.lower()}_current_meta.json").write_text(json.dumps(meta, indent=2))
        print(f"{sport}: {len(legs)} legs (pregame {meta['pregame_legs']}, live {meta['live_legs']}), players={meta['players']}, categories={cats}, calls={calls}")


if __name__ == "__main__":
    main()
