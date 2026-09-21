#!/usr/bin/env python3
"""
PROBE 3 - PrizePicks /game_types (the ENTRY QUOTE), ANONYMOUS.

DISCOVERED 2026-09-20 from the owner's live browser capture. Adding the SECOND leg makes the app
    POST https://api.prizepicks.com/game_types
    {"new_wager":{"amount_bet_cents":N,
                  "picks":[{"wager_type":"over","projection_id":"..."}, ...],
                  "pick_protection":false},
     "lat":..., "lng":..., "game_mode":"prizepools"}
and the response is a quote for THAT EXACT COMBINATION:
    data[].attributes.name     "Power Play" | "Flex Play"
    data[].attributes.payouts  {"<n_picks>": {"<n_correct>": multiplier}, "is_adjusted": bool}
Validated on screen: Tatum 1.5 3PTM GOBLIN + Wembanyama 11.5 Reb DEMON, $20 -> "To Win $44" = 2.2x,
identical to the response. Probes 1 and 2 never found this: they guessed GET endpoints; this is a POST
carrying the legs.

WHAT THIS PROBE ANSWERS
  A. Does /game_types answer WITHOUT a login?  Sends NO cookies, NO owner location, a FRESH device id.
     Validates by reproducing the known goblin+demon pair (expect 2.2).
  B. If yes: the BASE (standard + standard), then goblin and demon factors in isolation against a
     fixed standard partner from a DIFFERENT game (the same-game discount would contaminate it),
     then every rung of several ladders.
  C. Multiplicativity check: does base x f(goblin) x f(demon) reproduce the measured pair?

SAFETY: /game_types is a price preview. It never places an entry. No entry/wager endpoint is called.
Writes nothing, commits nothing. Output is the workflow log only.
"""
import json
import os
import random
import time
import uuid

BASE = "https://api.prizepicks.com"
LEAGUE = 7                       # NBA - verified: COMPASS fact 176
KNOWN_GOBLIN = "13975905"        # Tatum 1.5 3PTM goblin   (owner capture 2026-09-20)
KNOWN_DEMON = "13976089"         # Wembanyama 11.5 Reb demon
KNOWN_PAIR_EXPECT = 2.2          # $20 -> To Win $44 on screen
STAKE = 2000
MAX_POSTS = int(os.getenv("PP_MAX_POSTS", "60"))
MAX_LADDERS = int(os.getenv("PP_MAX_LADDERS", "10"))
PAUSE = 1.1
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36")
DEVICE_ID = str(uuid.uuid4())    # fresh - never the owner's

POSTS = 0


def build_proxies():
    u = (os.getenv("PROXY_URL") or "").strip()
    return ({"http": u, "https": u} if u else None), u


def hdr(mode):
    h = {"accept": "application/json", "content-type": "application/json",
         "origin": "https://app.prizepicks.com", "referer": "https://app.prizepicks.com/",
         "user-agent": UA, "x-device-id": DEVICE_ID}
    if mode is not None:
        h["x-device-info"] = ("anonymousId=,name=,os=windows,osVersion=Windows NT 10.0; Win64; x64,"
                              f"platform=web,appVersion=,gameMode={mode},stateCode=")
    return h


def quote(req, proxies, picks, mode):
    global POSTS
    if POSTS >= MAX_POSTS:
        return None, "POST cap reached"
    body = {"new_wager": {"amount_bet_cents": STAKE,
                          "picks": [{"wager_type": "over", "projection_id": str(p)} for p in picks],
                          "pick_protection": False}}
    if mode is not None:
        body["game_mode"] = mode
    POSTS += 1
    try:
        r = req.post(BASE + "/game_types", headers=hdr(mode), data=json.dumps(body),
                     proxies=proxies, timeout=30, impersonate="chrome124")
        try:
            j = r.json()
        except Exception:  # noqa: BLE001
            j = (r.text or "")[:500]
        return r.status_code, j
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)[:200]
    finally:
        time.sleep(PAUSE + random.random() * 0.4)


def parse(j):
    out = {}
    if not isinstance(j, dict):
        return out
    for gt in j.get("data") or []:
        a = gt.get("attributes") or {}
        p = a.get("payouts") or {}
        out[a.get("name")] = {"payouts": {k: v for k, v in p.items() if k != "is_adjusted"},
                              "adj": p.get("is_adjusted"), "srp": a.get("payouts_srp"),
                              "maxalert": a.get("is_max_payout_alert")}
    return out


def pay(parsed, game, n_correct, n_picks="2"):
    try:
        return float(parsed[game]["payouts"][n_picks][n_correct])
    except Exception:  # noqa: BLE001
        return None


def fetch_board(req, proxies):
    rows, names = {}, {}
    for url in (f"{BASE}/projections?league_id={LEAGUE}&per_page=1000&single_stat=true",
                f"{BASE}/projections?league_id={LEAGUE}&per_page=1000&single_stat=true"
                f"&game_mode=prizepools"):
        try:
            r = req.get(url, headers=hdr(None), proxies=proxies, timeout=40, impersonate="chrome124")
            print(f"BOARD|{r.status_code}|{url.split('?')[1][:70]}", flush=True)
            if r.status_code != 200:
                continue
            doc = r.json()
        except Exception as exc:  # noqa: BLE001
            print(f"BOARD|ERR|{str(exc)[:120]}", flush=True)
            continue
        for i in doc.get("included") or []:
            if i.get("type") == "new_player":
                names[i["id"]] = (i.get("attributes") or {}).get("display_name")
        for p in doc.get("data") or []:
            a = p.get("attributes") or {}
            rel = ((p.get("relationships") or {}).get("new_player") or {}).get("data") or {}
            if a.get("line_score") is None or not rel.get("id"):
                continue
            rows[p["id"]] = {"id": p["id"], "player": rel["id"], "stat": a.get("stat_type"),
                             "line": float(a["line_score"]),
                             "odds": (a.get("odds_type") or "standard").lower(),
                             "game": str(a.get("game_id") or a.get("start_time")),
                             "start": a.get("start_time")}
    for r in rows.values():
        r["name"] = names.get(r["player"]) or r["player"]
    return rows


def ladders(rows):
    g = {}
    for r in rows.values():
        g.setdefault((r["player"], r["stat"]), []).append(r)
    out = []
    for key, rs in g.items():
        std = [r for r in rs if r["odds"] == "standard"]
        alt = [r for r in rs if r["odds"] in ("goblin", "demon")]
        if len(std) != 1 or not alt:
            continue
        rs = sorted(rs, key=lambda r: r["line"])
        s = rs.index(std[0])
        for i, r in enumerate(rs):
            r["rung"] = i - s
        out.append(rs)
    out.sort(key=lambda rs: -len(rs))
    return out


def main():
    from curl_cffi import requests as req

    print("=" * 78)
    print("PROBE 3 - /game_types ANONYMOUS (no cookies, no owner location, fresh device id)")
    print("=" * 78, flush=True)
    proxies, proxy_url = build_proxies()
    if proxies:
        try:
            e = req.get("https://ipinfo.io/json", proxies=proxies, timeout=20,
                        impersonate="chrome124").json()
            print(f"EGRESS|{e.get('ip')}|{e.get('country')}/{e.get('region')}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"EGRESS|FAIL|{str(exc)[:90]}", flush=True)
    else:
        print("EGRESS|NO PROXY_URL - expect DataDome", flush=True)

    # ---------- A. reachability, validated on the known pair ----------
    print("\n--- A. REACHABILITY (known Tatum goblin + Wemby demon, expect 2.2) ---", flush=True)
    working = None
    for mode in ("prizepools", "pickem", None):
        st, j = quote(req, proxies, [KNOWN_GOBLIN, KNOWN_DEMON], mode)
        pr = parse(j)
        p2 = pay(pr, "Power Play", "2")
        snip = json.dumps(j)[:300] if isinstance(j, (dict, list)) else str(j)[:300]
        print(f"REACH|mode={mode}|status={st}|power2={p2}|body={snip}", flush=True)
        if st == 200 and p2 is not None and working is None:
            working = mode
    if working is None:
        print("\nRESULT|UNREACHABLE ANONYMOUSLY - needs the owner's browser session.", flush=True)
        print(f"POSTS_USED|{POSTS}", flush=True)
        return
    print(f"\nRESULT|REACHABLE with mode={working}", flush=True)

    rows = fetch_board(req, proxies)
    print(f"BOARD_ROWS|{len(rows)}", flush=True)
    kg, kd = rows.get(KNOWN_GOBLIN), rows.get(KNOWN_DEMON)
    bad_games = {r["game"] for r in (kg, kd) if r}
    stds = [r for r in rows.values() if r["odds"] == "standard" and r["game"] not in bad_games]
    if len(stds) < 2:
        print("RESULT|not enough standard legs outside the known games", flush=True)
        return
    partner = stds[0]
    second = next((r for r in stds if r["game"] != partner["game"]), None)
    print(f"PARTNER|{partner['name']}|{partner['stat']}|{partner['line']}|game={partner['game']}", flush=True)

    # ---------- B. base, then each known leg in isolation ----------
    print("\n--- B. BASE AND ISOLATED FACTORS ---", flush=True)
    base = None
    if second:
        st, j = quote(req, proxies, [partner["id"], second["id"]], working)
        pr = parse(j)
        base = pay(pr, "Power Play", "2")
        print(f"QUOTE|BASE std+std|{partner['name']}+{second['name']}|power2={base}"
              f"|flex2={pay(pr, 'Flex Play', '2')}|flex1={pay(pr, 'Flex Play', '1')}"
              f"|adj={pr.get('Power Play', {}).get('adj')}|srp={pr.get('Power Play', {}).get('srp')}", flush=True)
    iso = {}
    for label, pid in (("GOBLIN tatum", KNOWN_GOBLIN), ("DEMON wemby", KNOWN_DEMON)):
        st, j = quote(req, proxies, [partner["id"], pid], working)
        pr = parse(j)
        p2 = pay(pr, "Power Play", "2")
        iso[label] = p2
        print(f"QUOTE|{label}|status={st}|power2={p2}|flex2={pay(pr, 'Flex Play', '2')}"
              f"|flex1={pay(pr, 'Flex Play', '1')}|adj={pr.get('Power Play', {}).get('adj')}"
              f"|srp={pr.get('Power Play', {}).get('srp')}", flush=True)

    # ---------- C. multiplicativity ----------
    g, d = iso.get("GOBLIN tatum"), iso.get("DEMON wemby")
    if base and g and d:
        fg, fd = g / base, d / base
        pred = base * fg * fd
        print(f"\nFACTOR|goblin tatum={fg:.4f}|demon wemby={fd:.4f}|base={base}", flush=True)
        print(f"MULTIPLICATIVE|predicted pair={pred:.4f}|measured={KNOWN_PAIR_EXPECT}"
              f"|{'HOLDS' if abs(pred - KNOWN_PAIR_EXPECT) < 0.02 else 'DOES NOT HOLD'}", flush=True)

    # ---------- D. ladder map ----------
    print("\n--- D. LADDER MAP (partner + each rung, all More) ---", flush=True)
    for rs in ladders(rows)[:MAX_LADDERS]:
        if POSTS >= MAX_POSTS:
            break
        if any(r["game"] == partner["game"] for r in rs):
            continue
        std_line = next(r["line"] for r in rs if r["rung"] == 0)
        for r in rs:
            if r["rung"] == 0 or POSTS >= MAX_POSTS:
                continue
            st, j = quote(req, proxies, [partner["id"], r["id"]], working)
            pr = parse(j)
            p2 = pay(pr, "Power Play", "2")
            f = (p2 / base) if (base and p2) else None
            print(f"LADDER|{r['name']}|{r['stat']}|{r['odds']}|rung={r['rung']:+d}|line={r['line']}"
                  f"|std={std_line}|power2={p2}|factor={f if f is None else round(f, 4)}"
                  f"|flex2={pay(pr, 'Flex Play', '2')}|flex1={pay(pr, 'Flex Play', '1')}"
                  f"|adj={pr.get('Power Play', {}).get('adj')}", flush=True)

    print(f"\nPOSTS_USED|{POSTS}", flush=True)


if __name__ == "__main__":
    main()
