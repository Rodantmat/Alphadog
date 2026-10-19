#!/usr/bin/env python3
"""PROBE - Sleeper NBA alt ladder endpoint variants (2026-10-18; the public lines/available_alt carries every sport but NBA while
the app shows NBA "ALT STAT" rungs). Read-only GETs through the residential proxy; prints, per variant, sports present and NBA
counts. Env: PROXY_URL."""
import json
import os

from curl_cffi import requests

P = os.environ.get("PROXY_URL", "").strip()
PX = {"https": P, "http": P} if P else None
H = {"User-Agent": "Sleeper/5.0 (iPhone; iOS 18.0)", "Accept": "application/json", "Referer": "https://sleeper.com/"}
BASE = "https://api.sleeper.app"
V = ["/lines/available_alt?include_preseason=true&sports%5B%5D=nba",
     "/lines/available_alt?dynamic=true&include_preseason=true&enable_one_sided_lines=true&sports%5B%5D=nba",
     "/lines/available_alt?dynamic=true&sports%5B%5D=nba",
     "/lines/available_alt?include_preseason=true&include_regular_season=true&sports%5B%5D=nba",
     "/lines/available_alt?sport=nba", "/lines/available_alt/nba", "/lines/alt/available?sports%5B%5D=nba",
     "/lines/available_alt?season_type=regular&sports%5B%5D=nba", "/lines/available_alt?game_status=pre_game&sports%5B%5D=nba",
     "/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true&include_alt=true&sports%5B%5D=nba",
     "/lines/available?dynamic=true&enable_one_sided_lines=true&line_types%5B%5D=alt&sports%5B%5D=nba",
     "/lines/available_milestones?sports%5B%5D=nba", "/lines/milestones?sports%5B%5D=nba", "/lines/available_ladders?sports%5B%5D=nba",
     "/lines/alt_stats?sports%5B%5D=nba", "/lines/available_alt_stats?sports%5B%5D=nba"]


def summary(j):
    if not isinstance(j, list):
        return f"type {type(j).__name__} keys {list(j)[:8] if isinstance(j, dict) else ''}"
    sports, lt, sample = {}, {}, None
    for ln in j:
        for o in (ln.get("options") or [])[:1]:
            sports[o.get("sport")] = sports.get(o.get("sport"), 0) + 1
            if o.get("sport") == "nba":
                lt[str(o.get("line_type"))[:10]] = lt.get(str(o.get("line_type"))[:10], 0) + 1
                sample = sample or {k: o.get(k) for k in ("subject_id", "wager_type", "outcome", "outcome_value", "payout_multiplier", "line_type")}
    return f"{len(j)} markets; sports {sports}; nba line_types {lt}; sample {sample}"


s = requests.Session(impersonate="chrome")
# 2nd pass (2026-10-18): is the NBA alt feed state-gated? The same calls through a California exit (DataImpulse state targeting,
# billed double - 3 small GETs). Only the username's country tag is extended; nothing is printed of the proxy URL.
if P and "__cr.us" in P and ";state." not in P:
    PCA = P.replace("__cr.us", "__cr.us;state.california", 1)
    for v in ["/lines/available_alt?include_preseason=true&sports%5B%5D=nba", "/lines/available_alt"]:
        try:
            r = s.get(BASE + v, headers=H, proxies={"https": PCA, "http": PCA}, timeout=40)
            try:
                body = summary(r.json())
            except Exception:  # noqa: BLE001
                body = r.text[:160]
            print(f"CA {r.status_code} {v} -> {body}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"CA ERR {v} -> {type(exc).__name__}: {str(exc)[:120]}", flush=True)
else:
    print("CA pass skipped: proxy URL has no __cr.us tag", flush=True)
for v in V[:1]:
    try:
        r = s.get(BASE + v, headers=H, proxies=PX, timeout=40)
        try:
            body = summary(r.json())
        except Exception:  # noqa: BLE001
            body = r.text[:160]
        print(f"{r.status_code} {v} -> {body}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"ERR {v} -> {type(exc).__name__}: {str(exc)[:120]}", flush=True)
