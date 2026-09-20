#!/usr/bin/env python3
"""
PRIZEPICKS NBA BOARD SCRAPER — a SEPARATE producer. Nothing shared with MLB.

WHY A NEW FILE AND NOT A FLAG ON main.py. The root producer is MLB's: league_id=2 is a literal in all
four candidate URLs and OUTPUT_JSON is fixed to prizepicks_mlb_current.json. It does honour a
PRIZEPICKS_PROJECTIONS_URLS override, so it CAN be pointed at NBA - but it would then write the NBA
board into the MLB file and the next MLB run would overwrite it. Two sports sharing one output path is
a race with no winner, and MLB is live right now.
So: same proven structure, own URLs, own output, own env namespace. The two never touch.

WHAT IS COPIED FROM THE PROVEN PRODUCER (it survives DataDome daily, so the shape is not negotiable):
  * MULTIPLE CANDIDATE URLS, tried in order - api and partner-api, single_stat and full - because any
    one of them can 403 while another answers
  * PROXY WITH PREFLIGHT - the egress IP is checked before the run so a dead proxy is a clear message
    rather than a confusing block
  * curl_cffi chrome124 IMPERSONATION - plain urllib gets a DataDome captcha from a GitHub runner
  * RETRY WITH A CAPTCHA COOLDOWN that is longer than the ordinary retry sleep
  * CANDIDATE SELECTION BY FUTURE-PICKABLE ROWS, not by row count - a stale payload full of finished
    games scores high on size and is worthless. This is the check that matters.
  * ATOMIC WRITE - never leave a half-written board for the archiver to read

Output: boards/prizepicks_nba_current.json + _meta.json, the shape archive_live_boards.py expects.
Env: PROXY_URL, PP_NBA_* (all NBA-specific; nothing named PRIZEPICKS_* so MLB's settings cannot leak in)
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_VERSION = "alphadog-prizepicks-nba-producer-v1.0.0"
NBA_LEAGUE_ID = 7          # verified: COMPASS fact 176, "league_id=7 for NBA"
URLS = [
    f"https://api.prizepicks.com/projections?league_id={NBA_LEAGUE_ID}&per_page=1000&single_stat=true",
    f"https://api.prizepicks.com/projections?league_id={NBA_LEAGUE_ID}&per_page=5000",
    f"https://partner-api.prizepicks.com/projections?league_id={NBA_LEAGUE_ID}&per_page=1000&single_stat=true",
    f"https://partner-api.prizepicks.com/projections?league_id={NBA_LEAGUE_ID}&per_page=5000",
]
OUT_DIR = Path(os.getenv("PP_NBA_OUT_DIR", "boards"))
OUTPUT_JSON = OUT_DIR / "prizepicks_nba_current.json"
OUTPUT_META = OUT_DIR / "prizepicks_nba_current_meta.json"
HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "referer": "https://app.prizepicks.com/",
    "origin": "https://app.prizepicks.com",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def atomic_write(path: Path, text: str):
    """never leave a half-written board for the archiver to read"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def build_proxies():
    u = (os.getenv("PROXY_URL") or "").strip()
    return ({"http": u, "https": u} if u else None), u


def future_pickable(payload) -> int:
    """rows whose game has NOT started. THE metric for a usable board: a stale payload full of
    finished games has a big row_count and is worthless."""
    if not isinstance(payload, dict):
        return 0
    now = datetime.now(timezone.utc)
    n = 0
    for row in payload.get("data") or []:
        a = row.get("attributes") or {}
        st = str(a.get("status") or "").lower()
        if st not in ("pre_game", "", "pregame"):
            continue
        t = a.get("start_time") or a.get("board_time")
        try:
            if t and datetime.fromisoformat(str(t).replace("Z", "+00:00")) > now:
                n += 1
        except Exception:  # noqa: BLE001
            n += 1        # unparseable time: count it rather than silently discard the board
    return n


def main() -> int:
    from curl_cffi import requests

    print(f"{SCRIPT_VERSION}  ->  {OUTPUT_JSON}", flush=True)
    proxies, proxy_url = build_proxies()
    timeout = int(os.getenv("PP_NBA_TIMEOUT_SECONDS", "35" if proxy_url else "45"))
    attempts = int(os.getenv("PP_NBA_ATTEMPTS", "4" if proxy_url else "3"))
    sleep_s = float(os.getenv("PP_NBA_RETRY_SLEEP_SECONDS", "8" if proxy_url else "60"))
    captcha_cooldown = float(os.getenv("PP_NBA_CAPTCHA_COOLDOWN_SECONDS", str(sleep_s * 2)))
    min_future = int(os.getenv("PP_NBA_MIN_FUTURE_ROWS", "20"))

    # PREFLIGHT: know the egress before blaming the target
    egress = None
    if proxies:
        try:
            r = requests.get("https://ipinfo.io/json", proxies=proxies, timeout=20,
                             impersonate="chrome124")
            egress = r.json()
            print(f"  egress {egress.get('ip')} {egress.get('country')}/{egress.get('region')}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  proxy preflight FAILED: {str(exc)[:90]}", flush=True)
    else:
        print("  no PROXY_URL set - going direct (expect DataDome from a CI runner)", flush=True)

    candidates, payload, chosen = [], None, None
    for attempt in range(1, attempts + 1):
        blocked = False
        for url in URLS:
            rec = {"url": url, "attempt": attempt}
            try:
                r = requests.get(url, headers=HEADERS, proxies=proxies, timeout=timeout,
                                 impersonate="chrome124")
                rec["http_status"] = r.status_code
                rec["bytes"] = len(r.content or b"")
                if r.status_code in (403, 429):
                    blocked = True
                    rec["error"] = "blocked"
                    candidates.append(rec)
                    print(f"  [{attempt}] {r.status_code} {url.split('?')[0]}", flush=True)
                    continue
                doc = r.json()
                rows = len(doc.get("data") or []) if isinstance(doc, dict) else 0
                fut = future_pickable(doc)
                rec.update({"ok": True, "rows": rows, "future_pickable": fut})
                candidates.append(rec)
                print(f"  [{attempt}] 200 rows={rows:,} future_pickable={fut:,} "
                      f"{url.split('?')[0]}", flush=True)
                # SELECT ON FUTURE-PICKABLE, not on size
                if fut >= min_future and (chosen is None or fut > chosen.get("future_pickable", 0)):
                    payload, chosen = doc, rec
            except Exception as exc:  # noqa: BLE001
                rec["error"] = str(exc)[:160]
                candidates.append(rec)
                low = rec["error"].lower()
                if "captcha" in low or "perimeterx" in low or "datadome" in low:
                    blocked = True
                print(f"  [{attempt}] ERR {str(exc)[:70]}", flush=True)
        if chosen:
            break
        wait = captcha_cooldown if blocked else sleep_s
        if attempt < attempts:
            print(f"  no usable payload; {'BLOCKED - ' if blocked else ''}waiting {wait:.0f}s", flush=True)
            time.sleep(wait)

    meta = {
        "ok": bool(chosen), "script_version": SCRIPT_VERSION, "sport": "nba",
        "league_id": NBA_LEAGUE_ID, "fetched_at": utc_now(),
        "egress": egress, "proxy_used": bool(proxies),
        "rows": chosen.get("rows") if chosen else 0,
        "future_pickable": chosen.get("future_pickable") if chosen else 0,
        "chosen_url": chosen.get("url") if chosen else None,
        "candidates": candidates,
        "github_run_id": os.getenv("GITHUB_RUN_ID", ""),
    }
    if not chosen:
        # FAIL LOUDLY. A silently-empty board is how a pipeline scores an empty slate and reports green.
        atomic_write(OUTPUT_META, json.dumps(meta, indent=2) + "\n")
        print("\nNO USABLE NBA BOARD. Every candidate URL failed or returned a stale payload.", flush=True)
        print("  The existing prizepicks_nba_current.json is left UNTOUCHED rather than overwritten "
              "with an empty board.", flush=True)
        return 1

    atomic_write(OUTPUT_JSON, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    atomic_write(OUTPUT_META, json.dumps(meta, indent=2) + "\n")
    odds = {}
    for row in payload.get("data") or []:
        a = row.get("attributes") or {}
        odds[str(a.get("odds_type"))] = odds.get(str(a.get("odds_type")), 0) + 1
    print(f"\nwrote {meta['rows']:,} NBA projections ({meta['future_pickable']:,} future-pickable)")
    print(f"  odds types: {odds}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
