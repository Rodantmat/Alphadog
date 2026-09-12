#!/usr/bin/env python3
"""
Fliff board producer (our own scraper, built from the owner's captured web-app calls, 2026-09-10).
Protocol (no login, no location token): POST <host>/fc_mobile_api_public?<header as query> with JSON
  {header, invocation:{request:{__object_class_name:"FCM__Public_Feed_Sync__Request", code, subfeed_meta}}, x_invocations:null, x_sb_meta}
  1) FCM__Ping__Request on m-c2 -> endpoints (proposals_feed_endpoint = herald-2)
  2) code 3054 (initial sync, focused_channel_id -333 = all) on the proposals feed endpoint -> x_slots.active_prematch_conflicts (+ inplay)
  3) code 3062 (select) with focused_conflict_fkey -> x_slots markets/proposals for that event (~150 markets per MLB game)
Env: FLIFF_SPORTS "mlb,nba" ; FLIFF_CHANNELS_MLB (default 441) ; FLIFF_CHANNELS_NBA (optional; else team-name match) ; PROXY_URL fallback ; FLIFF_OUT_DIR
Output per sport: boards/fliff_<sport>_current.json {meta, legs[], events[], raw_markets[]} + _meta.json
Leg = one proposal: event, player, market, line, selection, american coeff, decimal coeff, status, revision - Fliff is odds-based, not flat pick'em.
"""
import json
import os
import random
import string
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

from curl_cffi import requests

OUT = Path(os.environ.get("FLIFF_OUT_DIR", "boards"))
PING_HOST = "https://m-c2.app.getfliff.com/"
APP_VERSION = os.environ.get("FLIFF_APP_VERSION", "5.0.34.285")
NBA_TEAMS = ["Hawks", "Celtics", "Nets", "Hornets", "Bulls", "Cavaliers", "Mavericks", "Nuggets", "Pistons", "Warriors", "Rockets", "Pacers", "Clippers", "Lakers", "Grizzlies", "Heat", "Bucks", "Timberwolves", "Pelicans", "Knicks", "Thunder", "Magic", "76ers", "Suns", "Trail Blazers", "Kings", "Spurs", "Raptors", "Jazz", "Wizards"]
MLB_TEAMS = ["Yankees", "Red Sox", "Blue Jays", "Orioles", "Rays", "Guardians", "Tigers", "Royals", "Twins", "White Sox", "Astros", "Mariners", "Rangers", "Angels", "Athletics", "Braves", "Phillies", "Mets", "Marlins", "Nationals", "Brewers", "Cubs", "Cardinals", "Reds", "Pirates", "Dodgers", "Padres", "Giants", "Diamondbacks", "Rockies"]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"


def header(device_id, install_token):
    return {"product_code": 10, "device_x_id": device_id, "app_x_version": APP_VERSION, "app_install_token": install_token, "auth_token": "", "conn_id": 1, "platform": "prod",
            "usa_state_code": "", "usa_state_code_source": "ipOrigin=2702|regionCode=|meta=|geocodeOrigin=2702|regionCode=|meta=", "xtag": "", "country_code": "", "af_uid": "no_appsflyer_uid_for_web", "location_token": ""}


def call(session, host, hdr, request_obj, proxies):
    url = host.rstrip("/") + "/fc_mobile_api_public?" + urlencode(hdr)
    body = {"header": hdr, "invocation": {"request": request_obj}, "x_invocations": None, "x_sb_meta": {"sb_config_version": -1, "sb_user_profile_version": -1, "sb_user_profile_meta": None, "campaigns_meta": {"all_visible_campaigns_keys": {}}}}
    last = None
    for attempt in range(3):
        for use_proxy in (False, True):
            try:
                r = session.post(url, json=body, headers={"accept": "application/json, text/plain, */*", "content-type": "application/json", "origin": "https://sports.getfliff.com", "referer": "https://sports.getfliff.com/", "user-agent": UA}, timeout=90, impersonate="chrome124", proxies=proxies if use_proxy else None)
                if r.status_code == 200:
                    j = r.json()
                    if isinstance(j, dict) and j.get("result", {}).get("error"):
                        last = str(j["result"]["error"])[:200]
                    else:
                        return j
                else:
                    last = f"http {r.status_code}"
            except Exception as exc:  # noqa: BLE001
                last = str(exc)[:200]
            if not proxies:
                break
        time.sleep(2 + attempt * 3)
    raise RuntimeError(f"fliff call failed: {last}")


def sync(session, host, hdr, code, proxies, channel=-333, conflict=""):
    return call(session, host, hdr, {"__object_class_name": "FCM__Public_Feed_Sync__Request", "code": code, "subfeed_meta": {"packed_subfeed_revisions": [], "focused_channel_id": channel, "focused_conflict_fkey": conflict, "focused_player_fkey": "", "focused_ticket_conflict_fkeys": [], "focused_ticket_proposal_fkeys": [], "focused_ticket_data": []}}, proxies)


def walk_lists(obj, key_name):
    """Yield every list found under any key == key_name, recursively."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key_name and isinstance(v, list):
                yield v
            else:
                yield from walk_lists(v, key_name)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_lists(v, key_name)


def main():
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    proxy = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy, "http": proxy} if proxy else None
    sports = [s.strip().lower() for s in os.environ.get("FLIFF_SPORTS", "mlb,nba").split(",") if s.strip()]
    OUT.mkdir(parents=True, exist_ok=True)
    s = requests.Session()
    device_id = os.environ.get("FLIFF_DEVICE_ID") or "web." + "".join(random.choices("0123456789abcdef", k=32))
    install_token = os.environ.get("FLIFF_INSTALL_TOKEN") or "".join(random.choices(string.ascii_letters + string.digits, k=10))
    hdr = header(device_id, install_token)
    ping = call(s, PING_HOST, hdr, {"__object_class_name": "FCM__Ping__Request", "message": f"ping {int(time.time()*1000)}"}, proxies)
    data = ping.get("result", {}).get("response", {}).get("data", {})
    feed_host = data.get("proposals_feed_endpoint") or "https://herald-2.app.getfliff.com/"
    print("feed host:", feed_host, "| min_app_build:", data.get("min_app_build"), "| server build:", data.get("server_build"))
    root = sync(s, feed_host, hdr, 3054, proxies)
    slots = root.get("x_slots") or {}
    conflicts = list(slots.get("active_prematch_conflicts") or []) + list(slots.get("active_inplay_conflicts") or [])
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    chan_summary = Counter(c.get("channel_id") for c in conflicts)
    print("conflicts:", len(conflicts), "| channels:", chan_summary.most_common(15))
    for sport in sports:
        chans = {int(x) for x in os.environ.get(f"FLIFF_CHANNELS_{sport.upper()}", "441" if sport == "mlb" else "").split(",") if x.strip()}
        names = MLB_TEAMS if sport == "mlb" else NBA_TEAMS if sport == "nba" else []
        def is_sport(c):
            if c.get("channel_id") in chans: return True
            hn, an = str(c.get("home_team_name", "")), str(c.get("away_team_name", ""))
            return any(n in hn for n in names) and any(n in an for n in names)
        evs = [c for c in conflicts if is_sport(c)]
        # channel select: the global sync lists only featured events; selecting each sport channel returns the whole slate
        chan_ids = chans | {c.get("channel_id") for c in evs if c.get("channel_id")}
        seen_fkeys = {c.get("conflict_fkey") for c in evs}
        for ch in sorted(chan_ids):
            try:
                jc = sync(s, feed_host, hdr, 3062, proxies, channel=ch)
            except Exception as exc:  # noqa: BLE001
                print(f"{sport}: channel {ch} select failed: {exc}", file=sys.stderr); continue
            xs = jc.get("x_slots") or {}
            for c in list(xs.get("active_prematch_conflicts") or []) + list(xs.get("active_inplay_conflicts") or []):
                if c.get("conflict_fkey") and c.get("conflict_fkey") not in seen_fkeys and (c.get("channel_id") == ch or is_sport(c)):
                    evs.append(c); seen_fkeys.add(c.get("conflict_fkey"))
            # subfeed updates carry conflict_fkeys lists and market_updates[].conflict_fkey; event names come from the proposals' t_121_event_info
            info_by_fk = {}
            for lst in walk_lists(xs, "market_updates"):
                for m in lst:
                    if not isinstance(m, dict) or not m.get("conflict_fkey"): continue
                    fk = m["conflict_fkey"]
                    for g in m.get("groups") or []:
                        for p in g.get("proposals") or []:
                            if p.get("t_121_event_info"): info_by_fk.setdefault(fk, p["t_121_event_info"]); break
                        if fk in info_by_fk: break
                    info_by_fk.setdefault(fk, "")
            for lst in walk_lists(xs, "conflict_fkeys"):
                for fk in lst:
                    if isinstance(fk, str): info_by_fk.setdefault(fk, "")
            for fk, info in info_by_fk.items():
                if fk not in seen_fkeys:
                    away, _, home = str(info).partition(" vs ")
                    evs.append({"conflict_fkey": fk, "channel_id": ch, "away_team_name": away, "home_team_name": home, "event_start_timestamp_utc": None}); seen_fkeys.add(fk)
            time.sleep(0.5)
        legs, raw_markets, errors = [], [], []
        for c in evs:
            fkey = c.get("conflict_fkey")
            try:
                j = sync(s, feed_host, hdr, 3062, proxies, channel=c.get("channel_id", -333), conflict=fkey)
            except Exception as exc:  # noqa: BLE001
                errors.append({"conflict_fkey": fkey, "error": str(exc)[:120]}); continue
            markets = [m for key in ("market_updates", "markets") for lst in walk_lists(j.get("x_slots") or {}, key) for m in lst if isinstance(m, dict) and m.get("conflict_fkey") == fkey]
            for m in markets:
                raw_markets.append(m)
                for g in m.get("groups") or []:
                    for p in g.get("proposals") or []:
                        # PLAYER: the fkey can sit on the proposal rather than the group, and group_tag
                        # carries the name either way ("1881_Yandy Diaz#1.5"). Gating on g["player_fkey"]
                        # alone blanked EVERY player name (found 2026-09-12: all 4,592 legs had player="").
                        _gt = str(g.get("group_tag") or "")
                        _pf = g.get("player_fkey") or p.get("player_fkey") or ""
                        _player = _gt.split("#")[0].split("_", 1)[-1] if (_pf or "_" in _gt) else ""
                        # LINE: t_142_selection_param_1 is empty on many markets; the number is then the
                        # suffix of group_tag ("...#1.5") or embedded in the selection name.
                        _line = p.get("t_142_selection_param_1")
                        if _line in (None, ""):
                            if "#" in _gt:
                                _line = _gt.rsplit("#", 1)[-1]
                            else:
                                _m = re.search(r"(-?\d+(?:\.\d+)?)", str(p.get("t_141_selection_name") or ""))
                                _line = _m.group(1) if _m else ""
                        legs.append({
                            "sport": sport, "conflict_fkey": fkey, "event": f"{c.get('away_team_name')} @ {c.get('home_team_name')}", "event_start_utc": c.get("event_start_timestamp_utc"), "live": bool(c.get("live_status") not in (None, 733)) if False else (fkey.endswith("inplay") if fkey else False),
                            "market": m.get("visual_name"), "market_fkey": m.get("market_fkey"), "market_type": m.get("type"), "subfeed_code": m.get("subfeed_code"), "sgp_mode": m.get("sgp_mode"),
                            "player": _player, "player_fkey": _pf, "group_tag": g.get("group_tag"),
                            "selection": p.get("t_141_selection_name"), "line": _line, "coeff_american": p.get("coeff"), "coeff_decimal": p.get("eu_coeff"), "prev_coeff_american": p.get("prev_coeff"),
                            "coeff_updated_utc": p.get("coeff_updated_utc"), "status": p.get("status"), "proposal_fkey": p.get("proposal_fkey"), "revision_id": p.get("revision_id"), "boosted": bool(p.get("sk_boosted_offer")),
                        })
            time.sleep(0.5)
        meta = {"ok": True, "source": "fliff fc_mobile_api_public (ping -> sync 3054 -> per-conflict sync 3062)", "sport": sport, "started_at": started, "fetched_at": fetched_at, "feed_host": feed_host, "app_version": APP_VERSION, "server_build": data.get("server_build"), "min_app_build": data.get("min_app_build"),
                "events": len(evs), "markets": len(raw_markets), "legs": len(legs), "errors": errors[:20], "channels_seen": {str(k): v for k, v in chan_summary.most_common(30)}, "by_market": dict(Counter(l["market"] for l in legs).most_common(60)), "players": len({l["player_fkey"] for l in legs if l["player_fkey"]}), "github_run_id": os.environ.get("GITHUB_RUN_ID", "")}
        (OUT / f"fliff_{sport}_current.json").write_text(json.dumps({"meta": meta, "legs": legs, "events": evs, "raw_markets": raw_markets}, separators=(",", ":")))
        (OUT / f"fliff_{sport}_current_meta.json").write_text(json.dumps(meta, indent=2))
        print(f"{sport}: events={len(evs)} markets={len(raw_markets)} legs={len(legs)} players={meta['players']} errors={len(errors)}")


if __name__ == "__main__":
    main()
