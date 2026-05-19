#!/usr/bin/env python3
"""
AlphaDog v2 PrizePicks GitHub JSON Producer
Version: alphadog-v2-prizepicks-producer-v0.1.0-github-json-dump

Purpose:
- Fetch the raw PrizePicks MLB projections payload.
- Save it at repo root as prizepicks_mlb_current.json.
- Save a small metadata file as prizepicks_mlb_current_meta.json.
- Do not write D1.
- Do not score, rank, normalize, or produce final board rows.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from curl_cffi import requests

SCRIPT_VERSION = "alphadog-v2-prizepicks-producer-v0.1.0-github-json-dump"
PRIZEPICKS_MLB_PROJECTIONS_URL = "https://partner-api.prizepicks.com/projections?league_id=2&per_page=5000"
OUTPUT_JSON = Path("prizepicks_mlb_current.json")
OUTPUT_META = Path("prizepicks_mlb_current_meta.json")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def atomic_write_text(path: Path, text: str) -> None:
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(text, encoding="utf-8")
    temp_path.replace(path)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def detect_collection(payload: Any) -> Tuple[str, int]:
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return "data", len(data)
        projections = payload.get("projections")
        if isinstance(projections, list):
            return "projections", len(projections)
        results = payload.get("results")
        if isinstance(results, list):
            return "results", len(results)
        return "object", len(payload)
    if isinstance(payload, list):
        return "root_array", len(payload)
    return type(payload).__name__, 0


def count_included(payload: Any) -> int:
    if isinstance(payload, dict) and isinstance(payload.get("included"), list):
        return len(payload["included"])
    return 0


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


def likely_mlb_count(payload: Any) -> Optional[int]:
    """
    The endpoint itself is MLB-only through league_id=2, so every projection in data is expected MLB.
    This returns a conservative count from the primary collection when available.
    """
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return len(payload["data"])
    if isinstance(payload, list):
        return len(payload)
    return None


def fetch_prizepicks_json() -> Tuple[Any, Dict[str, Any]]:
    proxy_url = os.getenv("PROXY_URL", "").strip()
    timeout_seconds = int(os.getenv("PRIZEPICKS_FETCH_TIMEOUT_SECONDS", "45"))
    attempts = int(os.getenv("PRIZEPICKS_FETCH_ATTEMPTS", "3"))
    sleep_seconds = float(os.getenv("PRIZEPICKS_FETCH_RETRY_SLEEP_SECONDS", "2"))

    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "referer": "https://app.prizepicks.com/",
        "origin": "https://app.prizepicks.com",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    }

    proxies = None
    if proxy_url:
        proxies = {"http": proxy_url, "https": proxy_url}

    last_error = None
    for attempt in range(1, attempts + 1):
        started = utc_now()
        try:
            response = requests.get(
                PRIZEPICKS_MLB_PROJECTIONS_URL,
                headers=headers,
                proxies=proxies,
                timeout=timeout_seconds,
                impersonate="chrome124",
            )
            content_type = response.headers.get("content-type", "")
            fetch_info = {
                "attempt": attempt,
                "url": PRIZEPICKS_MLB_PROJECTIONS_URL,
                "started_at": started,
                "finished_at": utc_now(),
                "http_status": response.status_code,
                "content_type": content_type,
                "response_size_bytes": len(response.content or b""),
                "proxy_configured": bool(proxy_url),
            }
            if response.status_code != 200:
                last_error = f"HTTP {response.status_code}: {response.text[:300]}"
                if attempt < attempts:
                    time.sleep(sleep_seconds)
                    continue
                raise RuntimeError(last_error)
            try:
                payload = response.json()
            except Exception as exc:
                raise RuntimeError(f"PrizePicks response was not valid JSON: {exc}; preview={response.text[:300]}") from exc
            return payload, fetch_info
        except Exception as exc:
            last_error = str(exc)
            if attempt < attempts:
                time.sleep(sleep_seconds)
                continue
            raise RuntimeError(last_error) from exc

    raise RuntimeError(last_error or "Unknown PrizePicks fetch failure")


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
        "source": "prizepicks_partner_api_mlb_projections",
        "source_url": PRIZEPICKS_MLB_PROJECTIONS_URL,
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
        "fetch": fetch_info,
        "shape": sample_shape(payload),
        "primary_collection": collection_name,
        "row_count": row_count,
        "included_count": included_count,
        "likely_mlb_rows": mlb_rows,
        "sha256": sha256_text(raw_text + "\n"),
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
        "http_status": fetch_info.get("http_status"),
        "content_type": fetch_info.get("content_type"),
        "response_size_bytes": fetch_info.get("response_size_bytes"),
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
            "no_d1_write": True,
            "no_scoring": True,
            "no_market_current_lines_write": True,
        }, indent=2), file=sys.stderr)
        raise SystemExit(1)
