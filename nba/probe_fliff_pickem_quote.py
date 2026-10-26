#!/usr/bin/env python3
"""
PROBE - FLIFF PICK'EM ENTRY PRICE FROM FLIFF ITSELF (2026-10-25; owner 22:24 PT: "get in the app/web, build slips and get the
multipliers ... for all remaining apps"; the owner plays Fliff Pick'Em - fliff_probe/pairings.py). READ-ONLY: only the app's own
QUOTE request is sent; Place_Entry / Place_Pick / any placing class is never sent. No login.
  1 Fliff's web bundle (sports.getfliff.com and every chunk it loads): the code around the Pick'Em quote classes
    (FCM__Skipper_Get_Parlay_Plus_Quote__Request, FCM__Get_Parlay_Plus_Quote_V2__Request) - the request shape and the answer fields
    (Max / Flex / SuperFlex multipliers).
  2 the public Pick'Em (skipper) feed: NBA games -> Points cards -> selections; then the quote request for 2- and 3-pick entries in
    the candidate shapes the bundle shows, printing Fliff's raw answer (or its error - the error names the missing field).
Uses fliff_probe/fliff_client.py (read-only import; nothing in fliff_probe/ is edited). Env: PROXY_URL.
"""
import json
import os
import re
import sys
import time
from urllib.parse import urlencode, urljoin

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fliff_probe"))
from fliff_client import UA, FliffClient  # noqa: E402

PROXY = os.environ.get("PROXY_URL", "").strip() or None
QUOTE = re.compile(r"(SuperFlex|super_flex|superFlex|flex_multiplier|flexMultiplier|max_multiplier|maxMultiplier|payout_type|payoutType|"
                   r"losing_selections|losingSelections|max_losses|maxLosses|contest_multiplier|contestMultiplier|entry_type|entryType|"
                   r"SkipperGetContestResponseSchema=|GetContest__Request|pick_type|pickType|selection_multiplier|selectionMultiplier)")
NEVER = ("Place_", "Cashout", "Withdraw", "Deposit", "CopyActivity")


def bundle(fc):
    s = fc.s
    def get(u):
        for px in (None, PROXY):
            try:
                r = s.get(u, timeout=60, impersonate="chrome124", proxies={"https": px, "http": px} if px else None)
                if r.status_code == 200:
                    return r.text
            except Exception:  # noqa: BLE001
                pass
        return None
    q, seen, out = [], set(), []
    for root in ("https://sports.getfliff.com/",):
        h = get(root) or ""
        q += [urljoin(root, x) for x in re.findall(r"""<script[^>]+src=["']([^"']+)["']""", h)]
        q += [urljoin(root, x) for x in re.findall(r"""["']([^"']*static/js/[^"']+\.js)["']""", h)]
    while q and len(seen) < 150:
        u = q.pop(0)
        if u in seen or not u.endswith(".js"):
            continue
        seen.add(u)
        js = get(u)
        if not js:
            continue
        base = u.split("/static/")[0] + "/"
        for m in re.findall(r"""["']((?:static/js/)?[0-9a-zA-Z_.\-]+\.chunk\.js)["']""", js):
            q.append(urljoin(base, m if m.startswith("static/") else "static/js/" + m))
        n = 0
        for m in QUOTE.finditer(js):
            if n >= 25:
                break
            out.append((u.rsplit("/", 1)[-1], m.group(0), js[max(0, m.start() - 500):m.start() + 900].replace("\n", " ")))
            n += 1
        time.sleep(0.15)
    print(f"bundle: {len(seen)} chunks, {len(out)} quote mentions", flush=True)
    done = set()
    for name, kw, ctx in out:
        k = ctx[450:600]
        if k in done:
            continue
        done.add(k)
        print(f"\n[{name}] {kw}\n  {ctx}", flush=True)


def raw(fc, host, obj):
    assert not any(x in obj["__object_class_name"] for x in NEVER)
    url = host.rstrip("/") + "/fc_mobile_api_public?" + urlencode(fc.hdr)
    body = {"header": fc.hdr, "invocation": {"request": obj}, "x_invocations": None,
            "x_sb_meta": {"sb_config_version": -1, "sb_user_profile_version": -1, "sb_user_profile_meta": None,
                          "campaigns_meta": {"all_visible_campaigns_keys": {}}}}
    hdrs = {"accept": "application/json, text/plain, */*", "content-type": "application/json",
            "origin": "https://sports.getfliff.com", "referer": "https://sports.getfliff.com/", "user-agent": UA}
    for px in (None, PROXY):
        try:
            r = fc.s.post(url, json=body, headers=hdrs, timeout=60, impersonate="chrome124", proxies={"https": px, "http": px} if px else None)
            return r.status_code, r.text
        except Exception as exc:  # noqa: BLE001
            last = f"{type(exc).__name__}"
    return None, last


def main():
    fc = FliffClient(proxy=PROXY)
    bundle(fc)
    fc.ping()
    host = fc.ping_data.get("skipper_public_feed_endpoint")
    print("\nskipper host:", host, "| ping keys:", sorted(k for k in fc.ping_data if "endpoint" in k), flush=True)
    for lab, obj in (("GetContest bare", {"__object_class_name": "FCM__Skipper_GetContest__Request"}),
                     ("GetContest v{}", {"__object_class_name": "FCM__Skipper_GetContest__Request", "variables": {}})):
        st, t = raw(fc, host, obj)
        print(f"\nCONTEST {lab}: HTTP {st} {len(t)} chars\n  {t[:6000]}", flush=True)
    st, t = raw(fc, host, {"__object_class_name": "FCM__Skipper_GetLeagues__Request"})
    j = json.loads(t) if st == 200 else {}
    nba = None
    for lg in json.dumps(j) and re.findall(r'\{[^{}]*"NBA"[^{}]*\}', t):
        m = re.search(r'"id":\s*(\d+)', lg)
        if m and "WNBA" not in lg:
            nba = int(m.group(1)); break
    print("NBA league:", nba, flush=True)
    st, t = raw(fc, host, {"__object_class_name": "FCM__Skipper_GetGames__Request", "variables": {"filter": {"league": nba}}})
    games = [int(x) for x in re.findall(r'"id":\s*(\d+)', t)][:6]
    print("games:", games, flush=True)
    sels = []
    for g in games[:4]:
        st, t = raw(fc, host, {"__object_class_name": "FCM__Skipper_GetCards__Request",
                               "variables": {"filter": {"league": nba, "games": [g], "prop_categories": []}}})
        try:
            resp = json.loads(t)["result"]["response"]
        except Exception:  # noqa: BLE001
            print("cards", g, st, t[:300]); continue
        for pk in resp.get("cards_packs") or []:
            for cd in pk.get("cards") or []:
                bo = cd.get("betting_options") or {}
                for o in bo.get("options") or []:
                    if o.get("option_type") in (0, 1) and o.get("is_main_line"):
                        sels.append({"game": g, "card": cd.get("card_name"), "o": o})
                if len([s for s in sels if s["game"] == g]) >= 4:
                    break
    print(f"selections {len(sels)}; sample option keys: {sorted(sels[0]['o'].keys()) if sels else None}", flush=True)
    for s in sels[:6]:
        print("  ", s["game"], s["card"], json.dumps(s["o"], default=str)[:600], flush=True)
    picks = []
    used = set()
    for s in sels:
        if s["game"] not in used:
            picks.append(s); used.add(s["game"])
        if len(picks) == 3:
            break
    if len(picks) < 2:
        print("not enough games for a quote"); return
    def sel(o):
        return {k: o.get(k) for k in ("proposal_fkey", "option_type", "eu_odds", "line", "skipper_area_key", "selection_name") if k in o}
    shapes = []
    for n in (2, 3):
        p = [sel(x["o"]) for x in picks[:n]]
        fk = [x["o"].get("proposal_fkey") for x in picks[:n]]
        shapes += [
            ("Skipper v selections", {"__object_class_name": "FCM__Skipper_Get_Parlay_Plus_Quote__Request", "variables": {"selections": p}}),
            ("Skipper picks", {"__object_class_name": "FCM__Skipper_Get_Parlay_Plus_Quote__Request", "picks": p}),
            ("Skipper v proposal_fkeys", {"__object_class_name": "FCM__Skipper_Get_Parlay_Plus_Quote__Request", "variables": {"proposal_fkeys": fk}}),
            ("Skipper bare", {"__object_class_name": "FCM__Skipper_Get_Parlay_Plus_Quote__Request"}),
            ("V2 picks", {"__object_class_name": "FCM__Get_Parlay_Plus_Quote_V2__Request", "picks": p}),
            ("V1 picks", {"__object_class_name": "FCM__Get_Parlay_Plus_Quote__Request", "picks": p}),
        ]
    for host_lab, h in (("skipper", host), ("ping", "https://m-c2.app.getfliff.com/")):
        for lab, obj in shapes:
            st, t = raw(fc, h, obj)
            print(f"\nQUOTE [{host_lab}] {lab} ({len(obj.get('picks') or (obj.get('variables') or {}).get('selections') or [])} picks): HTTP {st}\n  {t[:1500]}", flush=True)
            time.sleep(0.4)


if __name__ == "__main__":
    main()
