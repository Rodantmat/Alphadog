#!/usr/bin/env python3
"""FLIFF PROBE - PICK'EM PRICING-RULES SCAN (read-only; 2026-10-28).

Goal: learn how Fliff prices a whole entry (same-game adjustment, Parlay Plus quote, flex play, boosts, prize-pool share)
from Fliff's own web bundle. Downloads sports.getfliff.com + chunks, and for each target class / keyword writes wide
code context windows to fliff_probe/out/discovery_quote.json. No account, no entries placed.
"""
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urljoin

from curl_cffi import requests

OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
PROXY = os.environ.get("PROXY_URL", "").strip() or None
TARGETS = [
    "FCM__Skipper_Get_Parlay_Plus_Quote__Request", "FCM__Skipper_Get_Parlay_Plus_Quote__Response",
    "FCM__Skipper_Get_Parlay_Plus_Quote_V2__Request", "FCM__Skipper_Get_Parlay_Plus_Quote_V2__Response",
    "FCM__Skipper_GetContest__Request", "FCM__Skipper_GetContest__Response",
    "FCM__Skipper_GetContestWinners__Request", "FCM__Skipper_GetContestWinners__Response",
    "FCM__Skipper_Get_Pod_For_Entry__Request", "FCM__Skipper__Get_Pods_Report__Request",
    "FCM__Skipper_Place_Entry__Request", "FCM__Skipper_GetGameStarPacks__Request",
    "SkipperGetParlayPlusQuoteResponseSchema", "SkipperGetParlayPlusQuoteV2ResponseSchema", "SkipperGetContestResponseSchema",
    "SkipperGetContestWinnersResponseSchema", "SkipperPlacePickResponseSchema",
]
WORDS = re.compile(os.environ.get("QUOTE_WORDS") or
                   r"(flex_play|flex_mode|FlexPlay|parlay_plus|ParlayPlus|prize_pool|leftover|guaranteed_multiplier|min_multiplier|"
                   r"boosted|boost_|sgp_mode|same_game|correlat|multiplier_adjust|payout_multiplier|max_payout|pod_|contest_)")
PER_WORD = int(os.environ.get("QUOTE_PER_WORD", "12"))
CTX_AFTER = int(os.environ.get("QUOTE_CTX", "500"))


def get(url):
    for route in ("direct", "proxy"):
        if route == "proxy" and not PROXY:
            continue
        try:
            r = S.get(url, timeout=60, impersonate="chrome124", proxies={"https": PROXY, "http": PROXY} if route == "proxy" else None)
            if r.status_code == 200:
                return r.text
        except Exception:  # noqa: BLE001
            pass
    return None


def main():
    rep = {"targets": {}, "words": {}, "chunks": []}
    seen, queue = set(), []
    for root in ("https://sports.getfliff.com/",):
        html = get(root) or ""
        for src in re.findall(r"""<script[^>]+src=["']([^"']+)["']""", html):
            queue.append(urljoin(root, src))
        for src in re.findall(r"""["']([^"']*static/js/[^"']+\.js)["']""", html):
            queue.append(urljoin(root, src))
    while queue and len(seen) < 150:
        u = queue.pop(0)
        if u in seen or not u.endswith(".js"):
            continue
        seen.add(u)
        js = get(u)
        if not js:
            continue
        rep["chunks"].append({"url": u, "bytes": len(js)})
        base = u.rsplit("/", 1)[0] + "/"
        for m in re.findall(r"""["']((?:static/js/)?[0-9a-zA-Z_.\-]+\.chunk\.js)["']""", js):
            queue.append(urljoin(base, m) if "/" not in m else urljoin(u.split("/static/")[0] + "/", m))
        name = u.rsplit("/", 1)[-1]
        for t in TARGETS:
            for mm in re.finditer(re.escape(t), js):
                s = max(0, mm.start() - 700)
                rep["targets"].setdefault(t, []).append({"chunk": name, "ctx": js[s: mm.end() + 2200]})
        for mm in WORDS.finditer(js):
            w = mm.group(0).lower()
            lst = rep["words"].setdefault(w, [])
            if len(lst) < PER_WORD:
                s = max(0, mm.start() - CTX_AFTER)
                lst.append({"chunk": name, "ctx": js[s: mm.end() + CTX_AFTER]})
        time.sleep(0.2)
    for t in rep["targets"]:
        rep["targets"][t] = rep["targets"][t][:6]
    print("chunks:", len(rep["chunks"]), "| targets found:", {k: len(v) for k, v in rep["targets"].items()},
          "| words:", {k: len(v) for k, v in rep["words"].items()}, flush=True)
    (OUT / "discovery_quote.json").write_text(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
