#!/usr/bin/env python3
"""
PROBE (2026-10-09): PrizePicks' payout QUOTE endpoint (/game_types) has answered DataDome's captcha interstitial to every
curl_cffi fingerprint since 2026-09-30 (nba/data/pp_payouts*/: 403 on every run; last 200s 09-29) - the payout map
(pp_payout_map.py, price-drift monitor, the §31aa multiplier work) has been blind for ten days. The board GET still works.
Hypothesis: a real Chrome that passed DataDome's device check (SeleniumBase UC + Xvfb through the residential proxy - the
Betr chain) can quote from the page's own context: fetch() from https://app.prizepicks.com carries the datadome cookie and
Chrome's TLS/HTTP2 fingerprint. If it answers 200, the mapper gets a browser mode.
What it prints: cookies present after the app loads (names only), the board size, and the Power / Flex tables for
all-standard 2..6-pick slips from today's NBA board (the app's own quote = the in-app 3-/4-Flex table check owed for 10-20),
plus one goblin+demon pair when the board has them. Quotes only - nothing is placed; no owner account.
Env: PROXY_URL (credential store), PP_LEAGUE (7 NBA default, 3 WNBA), PP_MAX_QUOTES (default 8).
"""
import json
import os
import sys
import time
import uuid
from collections import defaultdict

from seleniumbase import SB

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from betr_harvest_cloud import open_alive, start_local_proxy, where  # noqa: E402  (the proven proxy chain)

API = "https://api.prizepicks.com"
APP = "https://app.prizepicks.com/"
LEAGUE = int(os.environ.get("PP_LEAGUE", "7"))
MAX_Q = int(os.environ.get("PP_MAX_QUOTES", "8"))
DEV = str(uuid.uuid4())

FETCH_JS = """
var url = arguments[0], opts = arguments[1], done = arguments[arguments.length - 1];
fetch(url, opts).then(function(r){ return r.text().then(function(t){ done({status: r.status, text: t.slice(0, 200000)}); }); })
  .catch(function(e){ done({status: -1, text: String(e)}); });
"""


def page_fetch(sb, url, method="GET", body=None):
    headers = {"accept": "application/json", "x-device-id": DEV,
               "x-device-info": "anonymousId=,name=,os=web,osVersion=,platform=web,appVersion=,gameMode=prizepools,stateCode="}
    opts = {"method": method, "headers": headers, "credentials": "include"}
    if body is not None:
        headers["content-type"] = "application/json"
        opts["body"] = json.dumps(body)
    sb.driver.set_script_timeout(60)
    return sb.driver.execute_async_script(FETCH_JS, url, opts)


def parse_board(doc):
    names = {i["id"]: (i.get("attributes") or {}).get("display_name") for i in doc.get("included") or [] if i.get("type") == "new_player"}
    rows = []
    for p in doc.get("data") or []:
        a = p.get("attributes") or {}
        rel = ((p.get("relationships") or {}).get("new_player") or {}).get("data") or {}
        if a.get("line_score") is None or not rel.get("id"):
            continue
        rows.append({"id": str(p["id"]), "player": rel["id"], "name": names.get(rel["id"]) or rel["id"], "stat": a.get("stat_type"),
                     "line": float(a["line_score"]), "odds": (a.get("odds_type") or "standard").lower(),
                     "game": str(a.get("game_id") or a.get("start_time"))})
    return rows


def tables(txt):
    try:
        j = json.loads(txt)
    except Exception:  # noqa: BLE001
        return None
    out = {}
    for gt in (j.get("data") or []):
        a = gt.get("attributes") or {}
        key = "power" if a.get("name") == "Power Play" else "flex" if a.get("name") == "Flex Play" else None
        if key:
            pay = dict(a.get("payouts") or {})
            out[key + "_adj"] = pay.pop("is_adjusted", None)
            out[key] = pay
    return out or None


def main():
    lp, proxy_arg = start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    n_q = 0
    try:
        with SB(**kw) as sb:
            if not open_alive(sb, APP, "first load", tries=6):
                print("the proxy never carried app.prizepicks.com (Chrome net-error page on every try)", flush=True)
            where(sb, "first load")
            for _ in range(3):
                try:
                    sb.uc_gui_click_captcha()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(4)
            where(sb, "after captcha pass")
            time.sleep(8)
            try:
                names = sorted(c["name"] for c in sb.driver.get_cookies())
            except Exception:  # noqa: BLE001
                names = []
            print(f"cookies after app load: {names}", flush=True)
            try:
                body_text = sb.execute_script("return (document.body.innerText||'').split('\\n').map(s=>s.trim()).filter(s=>s).slice(0,40).join(' | ');")
                print(f"visible text: {body_text[:600]}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"visible text failed: {str(exc)[:80]}", flush=True)
            wire = {}
            try:
                for e in sb.driver.get_log("performance"):
                    try:
                        m = json.loads(e["message"])["message"]
                    except Exception:  # noqa: BLE001
                        continue
                    if m.get("method") == "Network.responseReceived":
                        u = m["params"]["response"].get("url", "")
                        if "prizepicks" in u and not u.endswith((".js", ".css", ".png", ".svg", ".woff2", ".woff", ".jpg", ".ico")):
                            k = f"{m['params']['response'].get('status')} {u.split('?')[0][:70]}"
                            wire[k] = wire.get(k, 0) + 1
                    elif m.get("method") == "Network.loadingFailed":
                        k = f"FAILED {m['params'].get('errorText', '?')[:40]} {m['params'].get('type', '')}"
                        wire[k] = wire.get(k, 0) + 1
            except Exception as exc:  # noqa: BLE001
                wire = {"performance log unavailable": str(exc)[:60]}
            print(f"wire after app load: {wire}", flush=True)
            # 1. board through the page
            r = page_fetch(sb, f"{API}/projections?league_id={LEAGUE}&per_page=1000&single_stat=true")
            print(f"board via page fetch: status {r['status']}, {len(r['text'])} bytes", flush=True)
            if r["status"] != 200:
                print(f"  body: {r['text'][:300]!r}", flush=True)
                # plain GET, no custom headers (no CORS preflight) - separates a network/proxy failure from a CORS one
                sb.driver.set_script_timeout(60)
                r2 = sb.driver.execute_async_script(FETCH_JS, f"{API}/projections?league_id={LEAGUE}&per_page=5&single_stat=true",
                                                    {"method": "GET", "credentials": "include"})
                print(f"  plain GET: status {r2['status']}, {r2['text'][:200]!r}", flush=True)
                r3 = sb.driver.execute_async_script(FETCH_JS, "https://api.prizepicks.com/leagues", {"method": "GET"})
                print(f"  /leagues: status {r3['status']}, {r3['text'][:120]!r}", flush=True)
                sys.exit(2)
            board = parse_board(json.loads(r["text"]))
            by_game = defaultdict(list)
            for b in board:
                by_game[b["game"]].append(b)
            std = [b for b in board if b["odds"] == "standard"]
            print(f"board: {len(board)} legs ({len(std)} standard, {sum(1 for b in board if b['odds']=='goblin')} goblin, "
                  f"{sum(1 for b in board if b['odds']=='demon')} demon) across {len(by_game)} games", flush=True)
            # 2. all-standard slips, one leg per player, spread over games
            picks = []
            seen_players = set()
            for g in sorted(by_game, key=lambda k: -len(by_game[k])):
                for b in by_game[g]:
                    if b["odds"] == "standard" and b["player"] not in seen_players:
                        picks.append(b); seen_players.add(b["player"]); break
                if len(picks) >= 6:
                    break
            if len(picks) < 2:
                # fall back to any standard legs of distinct players
                for b in std:
                    if b["player"] not in seen_players:
                        picks.append(b); seen_players.add(b["player"])
                    if len(picks) >= 6:
                        break
            print(f"picks: {[(p['name'], p['stat'], p['line']) for p in picks]}", flush=True)
            for n in range(2, min(6, len(picks)) + 1):
                if n_q >= MAX_Q:
                    break
                body = {"new_wager": {"amount_bet_cents": 2000,
                                      "picks": [{"wager_type": "over", "projection_id": p["id"]} for p in picks[:n]],
                                      "pick_protection": False}, "game_mode": "prizepools"}
                r = page_fetch(sb, API + "/game_types", "POST", body); n_q += 1
                t = tables(r["text"])
                blocked = "captcha-delivery" in r["text"]
                print(f"QUOTE {n}-pick all-standard: status {r['status']} {'DATADOME' if blocked else ''} -> {t if t else r['text'][:160]!r}", flush=True)
                time.sleep(2)
            # 3. one goblin + demon pair (the 2.2 validation shape)
            gob = next((b for b in board if b["odds"] == "goblin"), None)
            dem = next((b for b in board if b["odds"] == "demon" and gob and b["player"] != gob["player"]), None)
            if gob and dem and n_q < MAX_Q:
                body = {"new_wager": {"amount_bet_cents": 2000,
                                      "picks": [{"wager_type": "over", "projection_id": gob["id"]}, {"wager_type": "over", "projection_id": dem["id"]}],
                                      "pick_protection": False}, "game_mode": "prizepools"}
                r = page_fetch(sb, API + "/game_types", "POST", body); n_q += 1
                print(f"QUOTE goblin+demon ({gob['name']} {gob['stat']} {gob['line']} + {dem['name']} {dem['stat']} {dem['line']}): "
                      f"status {r['status']} -> {tables(r['text']) or r['text'][:160]!r}", flush=True)
            try:
                names = sorted(c["name"] for c in sb.driver.get_cookies())
            except Exception:  # noqa: BLE001
                names = []
            print(f"cookies at the end: {names}", flush=True)
    finally:
        if lp:
            lp.terminate()
    print(f"done: {n_q} quotes")


if __name__ == "__main__":
    main()
