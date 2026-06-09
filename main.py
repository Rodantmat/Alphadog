#!/usr/bin/env python3
"""
AlphaDog v2 PrizePicks GitHub JSON Producer
Version: alphadog-v2-prizepicks-producer-v0.1.3-proxyscrape-residential-preflight

Purpose:
- Fetch the raw PrizePicks MLB projections payload from multiple known PrizePicks JSON surfaces.
- Select the freshest candidate by future pickable MLB rows.
- Save it at repo root as prizepicks_mlb_current.json only when at least one future row exists.
- Save a metadata file as prizepicks_mlb_current_meta.json.
- Never overwrite the last JSON with a stale/no-future candidate.
- Do not write D1.
- Do not score, rank, normalize, or produce final board rows.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from curl_cffi import requests

SCRIPT_VERSION = "alphadog-v2-prizepicks-producer-v0.1.3-proxyscrape-residential-preflight"
PRIZEPICKS_MLB_PROJECTIONS_URLS = [
    "https://api.prizepicks.com/projections?league_id=2&per_page=1000&single_stat=true",
    "https://api.prizepicks.com/projections?league_id=2&per_page=5000",
    "https://partner-api.prizepicks.com/projections?league_id=2&per_page=1000&single_stat=true",
    "https://partner-api.prizepicks.com/projections?league_id=2&per_page=5000",
]
OUTPUT_JSON = Path("prizepicks_mlb_current.json")
OUTPUT_META = Path("prizepicks_mlb_current_meta.json")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_text(path: Path, text: str) -> None:
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(text, encoding="utf-8")
    temp_path.replace(path)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def mask_proxy_url(proxy_url: str) -> str:
    text = (proxy_url or "").strip()
    if not text:
        return ""
    try:
        from urllib.parse import urlsplit, urlunsplit
        parts = urlsplit(text if "://" in text else "http://" + text)
        host = parts.hostname or ""
        port = f":{parts.port}" if parts.port else ""
        user = parts.username or ""
        masked_user = (user[:4] + "..." + user[-4:]) if len(user) > 10 else (user[:2] + "..." if user else "")
        netloc = f"{masked_user}:***@{host}{port}" if user else f"{host}{port}"
        return urlunsplit((parts.scheme or "http", netloc, "", "", ""))
    except Exception:
        return "***masked_proxy_url***"


def normalize_proxy_url(raw: str) -> str:
    text = (raw or "").strip().strip('"').strip("'")
    if not text:
        return ""
    if "://" in text:
        return text
    # Supports ProxyScrape formats: username:password@hostname:port and hostname:port:username:password.
    if "@" in text:
        return "http://" + text
    parts = text.split(":")
    if len(parts) == 4:
        host, port, username, password = parts
        return f"http://{username}:{password}@{host}:{port}"
    return "http://" + text


def proxy_url_from_env() -> str:
    direct = normalize_proxy_url(os.getenv("PROXY_URL", ""))
    if direct:
        return direct
    host = os.getenv("PROXYSCRAPE_HOSTNAME", "").strip()
    port = os.getenv("PROXYSCRAPE_PORT", "").strip()
    username = os.getenv("PROXYSCRAPE_USERNAME", "").strip()
    password = os.getenv("PROXYSCRAPE_PASSWORD", "").strip()
    if host and port and username and password:
        return f"http://{username}:{password}@{host}:{port}"
    return ""


def build_proxies(proxy_url: str) -> Optional[Dict[str, str]]:
    if not proxy_url:
        return None
    return {"http": proxy_url, "https": proxy_url}


def proxy_preflight(proxies: Optional[Dict[str, str]], timeout_seconds: int = 20) -> Dict[str, Any]:
    if not proxies:
        return {"attempted": False, "ok": False, "reason": "PROXY_URL_not_configured"}
    url = os.getenv("PRIZEPICKS_PROXY_PREFLIGHT_URL", "https://ipinfo.io/json").strip() or "https://ipinfo.io/json"
    started = utc_now()
    out: Dict[str, Any] = {
        "attempted": True,
        "ok": False,
        "url": url,
        "started_at": started,
        "proxy_configured": True,
        "proxy_masked": mask_proxy_url(proxies.get("https") or proxies.get("http") or ""),
    }
    try:
        response = requests.get(url, proxies=proxies, timeout=timeout_seconds, impersonate="chrome124")
        out.update({
            "finished_at": utc_now(),
            "http_status": response.status_code,
            "response_size_bytes": len(response.content or b""),
        })
        if response.status_code == 200:
            try:
                body = response.json()
            except Exception:
                body = {}
            out.update({
                "ok": True,
                "ip": body.get("ip"),
                "country": body.get("country"),
                "region": body.get("region"),
                "city": body.get("city"),
                "org": body.get("org"),
            })
        else:
            out["error"] = f"HTTP {response.status_code}: {response.text[:180]}"
    except Exception as exc:
        out.update({"finished_at": utc_now(), "error": str(exc)[:500]})
    return out


def detect_collection(payload: Any) -> Tuple[str, int]:
    if isinstance(payload, dict):
        for key in ("data", "projections", "results"):
            value = payload.get(key)
            if isinstance(value, list):
                return key, len(value)
        return "object", len(payload)
    if isinstance(payload, list):
        return "root_array", len(payload)
    return type(payload).__name__, 0


def primary_rows(payload: Any) -> List[Any]:
    if isinstance(payload, dict):
        for key in ("data", "projections", "results"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    if isinstance(payload, list):
        return payload
    return []


def count_included(payload: Any) -> int:
    if isinstance(payload, dict) and isinstance(payload.get("included"), list):
        return len(payload["included"])
    return 0


def likely_mlb_count(payload: Any) -> Optional[int]:
    rows = primary_rows(payload)
    return len(rows) if rows else None


def sample_shape(payload: Any) -> Dict[str, Any]:
    shape: Dict[str, Any] = {"top_level_type": type(payload).__name__}
    if isinstance(payload, dict):
        shape["top_level_keys"] = sorted([str(k) for k in payload.keys()])[:50]
        data = payload.get("data")
        if isinstance(data, list) and data:
            first = data[0]
            shape["first_data_type"] = type(first).__name__
            if isinstance(first, dict):
                shape["first_data_keys"] = sorted([str(k) for k in first.keys()])[:50]
                attrs = first.get("attributes")
                if isinstance(attrs, dict):
                    shape["first_data_attribute_keys"] = sorted([str(k) for k in attrs.keys()])[:80]
                rels = first.get("relationships")
                if isinstance(rels, dict):
                    shape["first_data_relationship_keys"] = sorted([str(k) for k in rels.keys()])[:80]
        included = payload.get("included")
        if isinstance(included, list) and included:
            first_inc = included[0]
            shape["first_included_type"] = type(first_inc).__name__
            if isinstance(first_inc, dict):
                shape["first_included_keys"] = sorted([str(k) for k in first_inc.keys()])[:50]
                inc_attrs = first_inc.get("attributes")
                if isinstance(inc_attrs, dict):
                    shape["first_included_attribute_keys"] = sorted([str(k) for k in inc_attrs.keys()])[:80]
    elif isinstance(payload, list) and payload:
        first = payload[0]
        shape["first_item_type"] = type(first).__name__
        if isinstance(first, dict):
            shape["first_item_keys"] = sorted([str(k) for k in first.keys()])[:80]
    return shape


def summarize_projection_freshness(payload: Any, now_epoch: Optional[float] = None) -> Dict[str, Any]:
    rows = primary_rows(payload)
    now_epoch = time.time() if now_epoch is None else now_epoch
    future_pickable = 0
    started_or_expired = 0
    missing_or_invalid_start = 0
    status_blocked = 0
    min_start_utc = None
    max_start_utc = None
    min_board_time = None
    max_board_time = None
    status_counts: Dict[str, int] = {}
    for row in rows:
        attrs = row.get("attributes", {}) if isinstance(row, dict) else {}
        attrs = attrs if isinstance(attrs, dict) else {}
        status = str(attrs.get("status") or "unknown").strip().lower()
        status_counts[status] = status_counts.get(status, 0) + 1
        board_time = attrs.get("board_time")
        if board_time:
            bt = str(board_time)
            min_board_time = bt if min_board_time is None or bt < min_board_time else min_board_time
            max_board_time = bt if max_board_time is None or bt > max_board_time else max_board_time
        start_text = attrs.get("start_time") or attrs.get("startTime") or attrs.get("start")
        if not start_text:
            missing_or_invalid_start += 1
            continue
        try:
            dt = datetime.fromisoformat(str(start_text).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            start_epoch = dt.timestamp()
            start_utc = dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except Exception:
            missing_or_invalid_start += 1
            continue
        min_start_utc = start_utc if min_start_utc is None or start_utc < min_start_utc else min_start_utc
        max_start_utc = start_utc if max_start_utc is None or start_utc > max_start_utc else max_start_utc
        if status in {"removed", "suspended", "closed", "settled", "final", "complete", "completed", "canceled", "cancelled", "postponed"}:
            status_blocked += 1
            continue
        if start_epoch > now_epoch:
            future_pickable += 1
        else:
            started_or_expired += 1
    return {
        "row_count": len(rows),
        "future_pickable_rows": future_pickable,
        "started_or_expired_rows": started_or_expired,
        "missing_or_invalid_start_rows": missing_or_invalid_start,
        "status_blocked_rows": status_blocked,
        "min_start_time_utc": min_start_utc,
        "max_start_time_utc": max_start_utc,
        "min_board_time": min_board_time,
        "max_board_time": max_board_time,
        "status_distribution": sorted(({"value": k, "count": v} for k, v in status_counts.items()), key=lambda x: x["count"], reverse=True)[:20],
    }


def fetch_one_prizepicks_candidate(url: str, headers: Dict[str, str], proxies: Optional[Dict[str, str]], timeout_seconds: int, attempt: int) -> Dict[str, Any]:
    started = utc_now()
    response = requests.get(url, headers=headers, proxies=proxies, timeout=timeout_seconds, impersonate="chrome124")
    fetch_info = {
        "attempt": attempt,
        "url": url,
        "started_at": started,
        "finished_at": utc_now(),
        "http_status": response.status_code,
        "content_type": response.headers.get("content-type", ""),
        "response_size_bytes": len(response.content or b""),
        "proxy_configured": bool(proxies),
        "proxy_masked": mask_proxy_url((proxies or {}).get("https") or (proxies or {}).get("http") or ""),
    }
    if response.status_code != 200:
        return {"ok": False, "url": url, "fetch": fetch_info, "error": f"HTTP {response.status_code}: {response.text[:300]}", "row_count": 0, "freshness": {"future_pickable_rows": 0}}
    try:
        payload = response.json()
    except Exception as exc:
        return {"ok": False, "url": url, "fetch": fetch_info, "error": f"PrizePicks response was not valid JSON: {exc}; preview={response.text[:300]}", "row_count": 0, "freshness": {"future_pickable_rows": 0}}
    collection_name, row_count = detect_collection(payload)
    freshness = summarize_projection_freshness(payload)
    return {
        "ok": row_count > 0,
        "url": url,
        "payload": payload,
        "fetch": fetch_info,
        "collection_name": collection_name,
        "row_count": row_count,
        "freshness": freshness,
        "error": None if row_count > 0 else "No projection rows returned",
    }


def select_best_candidate(candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    usable = [c for c in candidates if c.get("ok") and c.get("row_count", 0) > 0]
    if not usable:
        return None
    usable.sort(key=lambda c: (int(c.get("freshness", {}).get("future_pickable_rows") or 0), int(c.get("row_count") or 0), int(c.get("fetch", {}).get("response_size_bytes") or 0)), reverse=True)
    return usable[0]



def candidate_has_prizepicks_block(candidate: Dict[str, Any]) -> bool:
    fetch = candidate.get("fetch", {}) if isinstance(candidate, dict) else {}
    status = int(fetch.get("http_status") or 0) if isinstance(fetch, dict) else 0
    err = str(candidate.get("error") or "").lower() if isinstance(candidate, dict) else ""
    return status in {403, 429} or "captcha" in err or "pxzneitfzp" in err or "perimeterx" in err or "blockscript" in err


def attempt_has_prizepicks_block(candidates: List[Dict[str, Any]]) -> bool:
    return any(candidate_has_prizepicks_block(c) for c in candidates)

def fetch_prizepicks_json() -> Tuple[Any, Dict[str, Any]]:
    proxy_url = proxy_url_from_env()
    timeout_seconds = int(os.getenv("PRIZEPICKS_FETCH_TIMEOUT_SECONDS", "35" if proxy_url else "45"))
    attempts = int(os.getenv("PRIZEPICKS_FETCH_ATTEMPTS", "4" if proxy_url else "3"))
    sleep_seconds = float(os.getenv("PRIZEPICKS_FETCH_RETRY_SLEEP_SECONDS", "8" if proxy_url else "60"))
    captcha_cooldown_seconds = float(os.getenv("PRIZEPICKS_CAPTCHA_COOLDOWN_SECONDS", str(sleep_seconds)))
    min_future_rows = int(os.getenv("PRIZEPICKS_MIN_FUTURE_ROWS", "1"))
    override_urls = [u.strip() for u in os.getenv("PRIZEPICKS_PROJECTIONS_URLS", "").split(",") if u.strip()]
    urls = override_urls or PRIZEPICKS_MLB_PROJECTIONS_URLS
    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "referer": "https://app.prizepicks.com/",
        "origin": "https://app.prizepicks.com",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    }
    proxies = build_proxies(proxy_url)
    preflight = proxy_preflight(proxies, int(os.getenv("PRIZEPICKS_PROXY_PREFLIGHT_TIMEOUT_SECONDS", "20")))
    print(json.dumps({
        "ok": bool(preflight.get("ok")),
        "version": SCRIPT_VERSION,
        "status": "proxy_preflight_completed",
        "proxy_configured": bool(proxies),
        "proxy_preflight": preflight,
        "timestamp_utc": utc_now(),
    }, indent=2))
    all_candidates: List[Dict[str, Any]] = []
    last_error = None
    for attempt in range(1, attempts + 1):
        attempt_candidates: List[Dict[str, Any]] = []
        for url in urls:
            try:
                candidate = fetch_one_prizepicks_candidate(url, headers, proxies, timeout_seconds, attempt)
            except Exception as exc:
                candidate = {"ok": False, "url": url, "fetch": {"attempt": attempt, "url": url, "started_at": utc_now(), "finished_at": utc_now(), "proxy_configured": bool(proxies), "proxy_masked": mask_proxy_url(proxy_url)}, "error": str(exc), "row_count": 0, "freshness": {"future_pickable_rows": 0}}
            attempt_candidates.append(candidate)
            all_candidates.append(candidate)
        selected = select_best_candidate(attempt_candidates)
        if selected and int(selected.get("freshness", {}).get("future_pickable_rows") or 0) >= min_future_rows:
            selected["all_candidates"] = all_candidates
            selected["selected_reason"] = "highest_future_pickable_rows_from_multi_endpoint_probe"
            return selected["payload"], selected
        selected_any = select_best_candidate(all_candidates)
        future_rows = int(selected_any.get("freshness", {}).get("future_pickable_rows") or 0) if selected_any else 0
        blocked_by_prizepicks = attempt_has_prizepicks_block(attempt_candidates)
        last_error = f"No PrizePicks candidate had future pickable MLB rows; best_future_pickable_rows={future_rows}; min_required={min_future_rows}"
        if blocked_by_prizepicks:
            last_error += "; prizepicks_api_block_or_captcha_detected=true"
        if attempt < attempts:
            cooldown = captcha_cooldown_seconds if blocked_by_prizepicks else sleep_seconds
            print(json.dumps({
                "ok": False,
                "version": SCRIPT_VERSION,
                "status": "retrying_after_prizepicks_block_or_no_future_rows",
                "attempt": attempt,
                "max_attempts": attempts,
                "cooldown_seconds": cooldown,
                "prizepicks_api_block_or_captcha_detected": blocked_by_prizepicks,
                "best_future_pickable_rows": future_rows,
                "min_required": min_future_rows,
                "timestamp_utc": utc_now(),
            }, indent=2))
            time.sleep(cooldown)
    best = select_best_candidate(all_candidates)
    diagnostic = {
        "ok": False,
        "data_ok": False,
        "version": SCRIPT_VERSION,
        "status": "source_stale_no_future_pickable_rows",
        "error": last_error or "No usable PrizePicks candidate returned rows",
        "candidate_count": len(all_candidates),
        "attempts_configured": attempts,
        "proxy_configured": bool(proxies),
        "proxy_masked": mask_proxy_url(proxy_url),
        "proxy_preflight": preflight,
        "retry_cooldown_seconds": sleep_seconds,
        "captcha_cooldown_seconds": captcha_cooldown_seconds,
        "prizepicks_api_block_or_captcha_detected": attempt_has_prizepicks_block(all_candidates),
        "best_candidate": {k: v for k, v in (best or {}).items() if k != "payload"},
        "candidates": [{k: v for k, v in c.items() if k != "payload"} for c in all_candidates],
        "stale_overwrite_guard": "did_not_overwrite_prizepicks_mlb_current_json_when_all_candidates_were_stale",
        "no_d1_write": True,
        "no_scoring": True,
        "no_market_current_lines_write": True,
    }
    atomic_write_text(OUTPUT_META, json.dumps(diagnostic, ensure_ascii=False, indent=2, sort_keys=False) + "\n")
    raise RuntimeError(json.dumps(diagnostic, ensure_ascii=False)[:1800])


def public_candidate(candidate: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in candidate.items() if k not in {"payload", "all_candidates"}}


def main() -> int:
    started_at = utc_now()
    print(f"AlphaDog PrizePicks producer started: {SCRIPT_VERSION}")
    print(f"Output JSON: {OUTPUT_JSON}")
    print(f"Output meta: {OUTPUT_META}")
    payload, fetch_info = fetch_prizepicks_json()
    collection_name, row_count = detect_collection(payload)
    included_count = count_included(payload)
    mlb_rows = likely_mlb_count(payload)
    raw_text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False)
    atomic_write_text(OUTPUT_JSON, raw_text + "\n")
    meta = {
        "ok": True,
        "data_ok": True,
        "version": SCRIPT_VERSION,
        "source": "prizepicks_mlb_projections_multi_endpoint",
        "source_url": fetch_info.get("url"),
        "source_urls_probed": PRIZEPICKS_MLB_PROJECTIONS_URLS,
        "output_json": str(OUTPUT_JSON),
        "output_meta": str(OUTPUT_META),
        "started_at": started_at,
        "finished_at": utc_now(),
        "github_run_id": os.getenv("GITHUB_RUN_ID") or "",
        "github_run_attempt": os.getenv("GITHUB_RUN_ATTEMPT") or "",
        "github_event_name": os.getenv("GITHUB_EVENT_NAME") or "",
        "alphadog_request_id": os.getenv("ALPHADOG_REQUEST_ID") or os.getenv("DISPATCH_ID") or "",
        "alphadog_chain_id": os.getenv("ALPHADOG_CHAIN_ID") or "",
        "alphadog_slate_date": os.getenv("ALPHADOG_SLATE_DATE") or "",
        "fetch": fetch_info.get("fetch", {}),
        "proxy_configured": bool(proxy_url_from_env()),
        "proxy_masked": mask_proxy_url(proxy_url_from_env()),
        "selected_candidate": public_candidate(fetch_info),
        "source_candidates": [public_candidate(c) for c in fetch_info.get("all_candidates", [])],
        "shape": sample_shape(payload),
        "primary_collection": collection_name,
        "row_count": row_count,
        "included_count": included_count,
        "likely_mlb_rows": mlb_rows,
        "freshness": fetch_info.get("freshness", {}),
        "sha256": sha256_text(raw_text + "\n"),
        "stale_overwrite_guard": "passed_future_pickable_gate_before_overwrite",
        "no_d1_write": True,
        "no_scoring": True,
        "no_ranking": True,
        "no_normalization": True,
        "no_market_current_lines_write": True,
        "raw_payload_preserved": True,
    }
    atomic_write_text(OUTPUT_META, json.dumps(meta, ensure_ascii=False, indent=2, sort_keys=False) + "\n")
    print(json.dumps({
        "ok": True,
        "data_ok": True,
        "version": SCRIPT_VERSION,
        "output_json": str(OUTPUT_JSON),
        "output_meta": str(OUTPUT_META),
        "row_count": row_count,
        "included_count": included_count,
        "likely_mlb_rows": mlb_rows,
        "selected_url": fetch_info.get("url"),
        "http_status": fetch_info.get("fetch", {}).get("http_status"),
        "content_type": fetch_info.get("fetch", {}).get("content_type"),
        "response_size_bytes": fetch_info.get("fetch", {}).get("response_size_bytes"),
        "future_pickable_rows": fetch_info.get("freshness", {}).get("future_pickable_rows"),
        "stale_overwrite_guard": "passed_future_pickable_gate_before_overwrite",
        "no_d1_write": True,
        "no_scoring": True,
        "no_market_current_lines_write": True,
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({
            "ok": False,
            "data_ok": False,
            "version": SCRIPT_VERSION,
            "status": "failed",
            "error": str(exc),
            "stale_overwrite_guard": "json_not_overwritten_after_failure",
            "no_d1_write": True,
            "no_scoring": True,
            "no_market_current_lines_write": True,
        }, indent=2), file=os.sys.stderr)
        raise SystemExit(1)
