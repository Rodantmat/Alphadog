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


# ROUND-2 P3#2 (2026-10-08): the scraper was fully serial with sleeps (per match 1 + #pills calls, up to 250 players, one call per
# ladder) and wrote its file only at the very end - an in-season slate (10-12 games, ~14 stat pills, Underdog's multi-day match
# list) needed ~1,000+ calls = 8-10 min against P3's 300 s cap, so the TERM would have killed it before a single byte was
# written. Now: (1) matches are split into TODAY's (Eastern date of scheduled_at = UNDERDOG_DATE, default today ET) which get
# the full pill sweep, and OTHER days which get the base lines call only (their legs archive as 'routine' anyway);
# (2) the pill, per-player and ladder calls run on a small thread pool (UNDERDOG_WORKERS, default 4; one session per thread);
# (3) a wall-clock budget (UNDERDOG_BUDGET_S, default 240) and a SIGTERM handler stop the sweeps early and the file is
# written with whatever was gathered (meta.partial = the stage that was cut), so a slow day yields a smaller board, never none.
import signal
import threading
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
_STOP = {"flag": False, "why": None}
_TLS = threading.local()


def _on_term(signum, frame):   # noqa: ARG001
    _STOP["flag"] = True; _STOP["why"] = "SIGTERM"


signal.signal(signal.SIGTERM, _on_term)


def _sess():
    s = getattr(_TLS, "s", None)
    if s is None:
        s = _TLS.s = requests.Session()
    return s


def _et_date(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(ET).date().isoformat()
    except Exception:  # noqa: BLE001
        return None


def _pmap(fn, items, workers, stop=None):
    """Bounded parallel map in chunks of 2 x workers; stops scheduling once `stop()` (budget) or the TERM flag is set.
    Returns [(item, result|None, error|None)] for the items that ran."""
    out = []
    items = list(items)
    n = max(1, workers)
    with ThreadPoolExecutor(max_workers=n) as ex:
        for i in range(0, len(items), 2 * n):
            if _STOP["flag"] or (stop is not None and stop()):
                break
            chunk = items[i:i + 2 * n]
            for it, f in [(it, ex.submit(fn, it)) for it in chunk]:
                try:
                    out.append((it, f.result(), None))
                except Exception as exc:  # noqa: BLE001
                    out.append((it, None, str(exc)))
    return out


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
        # budget + target date (round-2 P3#2): today's matches (Eastern date of the tip) get the full pill sweep, the rest only
        # the base lines call; every sweep stops at the budget or on TERM and the file is still written below
        budget_s = float(os.environ.get("UNDERDOG_BUDGET_S", "240"))
        deadline = time.monotonic() + budget_s
        workers = int(os.environ.get("UNDERDOG_WORKERS", "4"))
        target = os.environ.get("UNDERDOG_DATE") or datetime.now(ET).date().isoformat()
        all_matches = os.environ.get("UNDERDOG_ALL_MATCHES") == "1"
        partial = None
        def over(stage):
            nonlocal partial
            if _STOP["flag"] or time.monotonic() > deadline:
                if partial is None:
                    partial = f"{stage}: {_STOP['why'] or 'budget exhausted'}"
                    calls.append(("partial", partial))
                return True
            return False
        def mdate(mid):
            g = store["games"].get(str(mid)) or store["solo_games"].get(str(mid)) or {}
            return _et_date(g.get("scheduled_at") or g.get("start_time"))
        today_m = [(m, t) for m, t in matches if all_matches or mdate(m) == target]
        other_m = [(m, t) for m, t in matches if (m, t) not in today_m]
        calls.append(("matches", len(matches), "today", len(today_m), "other", len(other_m), "target", target))
        lock = threading.Lock()
        def _merge(j):
            with lock:
                harvest(j); before = len(store["over_under_lines"]); merge(store, j)
                return len(store["over_under_lines"]) - before
        for mid, mtype in today_m[:120]:
            if over("per-match pills"):
                break
            base = f"{API}/v1/lobbies/content/lines?include_live=true&match_id={mid}&match_type={quote(str(mtype))}&{COMMON}&show_mass_option_markets=true"
            try:
                calls.append((f"lines[match={mid}]", _merge(get(s, base, proxies))))
            except Exception as exc:  # noqa: BLE001
                calls.append((f"lines[match={mid}]_error", str(exc)[:60]))
            filters = [(sid, "PickemStat") for sid in list(registry["pickem_stats"])] + [(gid, "MarketGroup") for gid in list(registry["market_groups"])]
            res = _pmap(lambda f: _merge(get(_sess(), f"{base}&filter_id={f[0]}&filter_type={f[1]}", proxies)), filters, workers,
                        stop=lambda: over("per-match pills"))
            added = sum(r for _, r, e in res if e is None)
            for (fid, ftype), _, e in res:
                if e:
                    calls.append((f"lines[match={mid},{ftype}]_error", e[:40]))
            calls.append((f"pills[match={mid}]", added))
        for mid, mtype in other_m[:120]:   # other days: base lines only (featured + ladders), no pill sweep
            if over("other-day matches"):
                break
            base = f"{API}/v1/lobbies/content/lines?include_live=true&match_id={mid}&match_type={quote(str(mtype))}&{COMMON}&show_mass_option_markets=true"
            try:
                calls.append((f"lines[match={mid},other-day]", _merge(get(s, base, proxies))))
            except Exception as exc:  # noqa: BLE001
                calls.append((f"lines[match={mid}]_error", str(exc)[:60]))
        reg_path.write_text(json.dumps(registry, indent=1))
        # 3b) per-player completeness pass: lines_with_stats returns EVERY market for the player (learns unseen stat ids too)
        # today's players first (their appearance's match is on the target date), the rest after, all budget-bounded
        def _app_today(a):
            return all_matches or mdate(a.get("match_id")) == target
        seen_apps = {str(a.get("id")) for a in store["appearances"].values() if isinstance(a, dict) and a.get("type") == "Player" and a.get("player_id")}
        app_order = sorted(seen_apps, key=lambda aid: (0 if _app_today(store["appearances"].get(aid, {})) else 1, aid))
        added = 0
        if not over("per-player lines_with_stats"):
            res = _pmap(lambda aid: _merge(get(_sess(), f"{API}/v1/lobbies/content/lines_with_stats?appearance_id={aid}&{COMMON}", proxies)),
                        app_order[:250], workers, stop=lambda: over("per-player lines_with_stats"))
            for aid, r, e in res:
                if e:
                    calls.append((f"lines_with_stats[{aid[:8]}]_error", e[:40]))
                else:
                    added += r
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
                def _dec(am):
                    try: am = float(am)
                    except (TypeError, ValueError): return None
                    return round(1 + am / 100.0, 4) if am > 0 else round(1 + 100.0 / (-am), 4)
                def _payout(am):
                    # LEGACY (2026-09-10 'decimal(American) x 0.963'): SUPERSEDED 2026-10-03 by strategy doc §30f/§30g - the slip pays
                    # base(n) x prod(payout modifier), modifier = 0.5 / Underdog's probability (see higher_/lower_payout_modifier).
                    # american_price/decimal_price belong to a different product for fantasy-priced options. Kept for field compatibility only.
                    d = _dec(am)
                    return round(d * 0.963, 4) if d is not None else None
                alt_legs.append({
                    "line_id": pr.get("id"), "over_under_id": ou.get("id"), "sport": sport, "is_main": bool(pr.get("is_main")), "stable_id": pr.get("stable_id"),
                    "player": " ".join(x for x in (pl.get("first_name"), pl.get("last_name")) if x) or ou.get("title") or "", "player_id": app.get("player_id"),
                    "stat": ast.get("display_stat") or ou.get("title"), "stat_key": ast.get("stat"), "line": pr.get("stat_value"),
                    "higher_multiplier_modifier_only": hi.get("payout_multiplier"), "lower_multiplier_modifier_only": lo.get("payout_multiplier"),
                    "higher_payout": _payout(hi.get("american_price")), "lower_payout": _payout(lo.get("american_price")),
                    "higher_payout_modifier": (float(hi["payout_multiplier"]) if hi.get("payout_multiplier") not in (None, "") and abs(float(hi["payout_multiplier"]) - 1.0) > 1e-9
                                               else (round(min(1.0, 0.5 / (float(prob(hi, "fantasy")) / 100.0)), 4) if prob(hi, "fantasy") not in (None, "")
                                                     else (round(min(1.0, 0.5 * float(hi["decimal_price"])), 4) if hi.get("decimal_price") not in (None, "") else None))),
                    "lower_payout_modifier": (float(lo["payout_multiplier"]) if lo.get("payout_multiplier") not in (None, "") and abs(float(lo["payout_multiplier"]) - 1.0) > 1e-9
                                              else (round(min(1.0, 0.5 / (float(prob(lo, "fantasy")) / 100.0)), 4) if prob(lo, "fantasy") not in (None, "")
                                                    else (round(min(1.0, 0.5 * float(lo["decimal_price"])), 4) if lo.get("decimal_price") not in (None, "") else None))),
                    "higher_display_decimal": (((hi.get("odds") or {}).get("fantasy") or {}).get("decimal")) or hi.get("decimal_price"),
                    "lower_display_decimal": (((lo.get("odds") or {}).get("fantasy") or {}).get("decimal")) or lo.get("decimal_price"),
                    "higher_american": hi.get("american_price"), "lower_american": lo.get("american_price"),
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
            def _fant(o, k):
                return (((o.get("odds") or {}).get("fantasy") or {}).get(k))
            def _pay_mod(o):
                # §30f/§30g: the slip is priced on the modifier = 0.5 / Underdog's probability. Underdog's own payout_multiplier IS that
                # value (2 dp) except where it is snapped to exactly 1.00 on balanced lines; only then is it recomputed - from the
                # fantasy probability (whole percent) where present, else 0.5 x decimal_price (decimal-priced picks).
                try:
                    pm = o.get("payout_multiplier")
                    if pm not in (None, "") and abs(float(pm) - 1.0) > 1e-9:
                        return float(pm)
                    fp = _fant(o, "probability")
                    if fp not in (None, ""):
                        return round(min(1.0, 0.5 / (float(fp) / 100.0)), 4)
                    dp = o.get("decimal_price")
                    if dp not in (None, ""):
                        return round(min(1.0, 0.5 * float(dp)), 4)
                    return float(pm) if pm not in (None, "") else None
                except (TypeError, ValueError, ZeroDivisionError):
                    return None
            legs.append({
                "line_id": lid, "sport": sport, "player": " ".join(x for x in (pl.get("first_name"), pl.get("last_name")) if x) or ou.get("title") or "",
                "player_id": app.get("player_id"), "appearance_type": app.get("type"), "team": team.get("abbr") or "", "position": pl.get("position") or app.get("position_id"),
                "stat": ast.get("display_stat") or ast.get("stat") or ou.get("title"), "stat_key": ast.get("stat"), "line": ln.get("stat_value"),
                "higher_multiplier": hi.get("payout_multiplier"), "lower_multiplier": lo.get("payout_multiplier"), "higher_decimal": hi.get("decimal_price"), "lower_decimal": lo.get("decimal_price"),
                "higher_american": hi.get("american_price"), "lower_american": lo.get("american_price"), "higher_label": hi.get("choice_display_name_shorter"), "lower_label": lo.get("choice_display_name_shorter"),
                "higher_fantasy_decimal": _fant(hi, "decimal"), "lower_fantasy_decimal": _fant(lo, "decimal"),
                "higher_fantasy_american": _fant(hi, "american"), "lower_fantasy_american": _fant(lo, "american"),
                "higher_fantasy_prob": _fant(hi, "probability"), "lower_fantasy_prob": _fant(lo, "probability"),
                "higher_display_decimal": _fant(hi, "decimal") or hi.get("decimal_price"), "lower_display_decimal": _fant(lo, "decimal") or lo.get("decimal_price"),
                "higher_payout_modifier": _pay_mod(hi), "lower_payout_modifier": _pay_mod(lo),
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
