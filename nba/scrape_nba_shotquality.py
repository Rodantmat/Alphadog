#!/usr/bin/env python3
"""
Shot Quality Delta (per NBA_ENRICHMENT_FACTORS_RESEARCH.md Section 9, fourth research pass
2026-09-02): the free, public proxy for professional "Quantified Shot Quality" - the full
version needs proprietary Second Spectrum XY tracking, not publicly available, but
leaguedashplayerptshot's CloseDefDistRange breakdown gives a real, if coarser, defender-proximity
signal. Gemini's concrete methodology, implemented here:
  1. Fetch each of the 4 real distance buckets (0-2ft/2-4ft/4-6ft/6+ft) - CloseDefDistRange is a
     FILTER param, not an output column, so this genuinely requires 4 separate calls (confirmed
     via nba_api docs - the output schema has no distance-range column at all).
  2. Compute league-wide average eFG% per bucket from the same player-level data (weighted by
     attempts) - no separate league endpoint exists or is needed.
  3. Per player: expected eFG% = their own shot-frequency mix across buckets, weighted by the
     league-average eFG% for each bucket ("what a league-average shooter would hit on this same
     shot diet").
  4. Shot Quality Delta = player's actual eFG% - their expected eFG%.

Also fetches leaguedashplayershotlocations (shot profile by real court zone: restricted area,
paint, mid-range, corner 3s, above-the-break 3) - a real, non-redundant complement per Gemini
("how" vs "where" vs "what"). This endpoint's real response uses an unusual paired-header
structure (a zone-name header row with columnSpan, plus a sub-header row with the actual per-zone
column names) - genuinely different from every other endpoint used so far, so this is written
defensively with a raw dump on any parsing uncertainty.

Writes nba/data/nba_shotquality_current.json, nba/data/nba_shotquality_delta_current.json,
nba/data/nba_shotzones_current.json, plus _meta.json for each.
"""
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote

from curl_cffi import requests

STATS_HEADERS = {
    "Host": "stats.nba.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": "https://stats.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
}

DIST_RANGES = ["0-2 Feet - Very Tight", "2-4 Feet - Tight", "4-6 Feet - Open", "6+ Feet - Wide Open"]


def fetch_json(url, proxies, attempts=3):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            return resp.json(), None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < attempts:
                time.sleep(5)
    return None, last_error


def fetch_shot_quality_bucket(dist_range, proxies):
    url = ("https://stats.nba.com/stats/leaguedashplayerptshot?College=&Conference=&Country="
           f"&CloseDefDistRange={quote(dist_range)}&DateFrom=&DateTo=&Division="
           "&DraftPick=&DraftYear=&DribbleRange=&GameSegment=&GeneralRange=&Height=&LastNGames=0"
           "&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&Period=0"
           "&PlayerExperience=&PlayerPosition=&SeasonSegment=&Season=2025-26"
           "&SeasonType=Regular+Season&ShotClockRange=&ShotDistRange=&StarterBench="
           "&TeamID=0&TouchTimeRange=&VsConference=&VsDivision=&Weight=")
    body, error = fetch_json(url, proxies)
    if error:
        return None, error
    rs = (body.get("resultSets") or [{}])[0]
    headers = rs.get("headers", [])
    idx = {h: i for i, h in enumerate(headers)}
    rows = []
    for row in rs.get("rowSet") or []:
        pid = row[idx["PLAYER_ID"]] if "PLAYER_ID" in idx else None
        if not pid:
            continue

        def col(name):
            i = idx.get(name)
            return row[i] if i is not None and i < len(row) else None

        rows.append({
            "player_id": int(pid),
            "close_def_dist_range": dist_range,
            "fga_frequency": col("FGA_FREQUENCY"),
            "fgm": col("FGM"), "fga": col("FGA"), "fg_pct": col("FG_PCT"), "efg_pct": col("EFG_PCT"),
            "fg3a_frequency": col("FG3A_FREQUENCY"), "fg3_pct": col("FG3_PCT"),
        })
    return rows, None


def compute_deltas(all_bucket_rows):
    # League-wide average eFG% per bucket, weighted by total attempts across all players.
    league_avg = {}
    for dist_range in DIST_RANGES:
        rows = [r for r in all_bucket_rows if r["close_def_dist_range"] == dist_range and r.get("fga")]
        total_fga = sum(r["fga"] for r in rows)
        total_efg_points = sum((r["efg_pct"] or 0) * r["fga"] for r in rows)
        league_avg[dist_range] = (total_efg_points / total_fga) if total_fga else None

    by_player = {}
    for r in all_bucket_rows:
        by_player.setdefault(r["player_id"], []).append(r)

    deltas = []
    for player_id, rows in by_player.items():
        total_fga = sum(r["fga"] or 0 for r in rows)
        if not total_fga:
            continue
        actual_efg_points = sum((r["efg_pct"] or 0) * (r["fga"] or 0) for r in rows)
        actual_efg = actual_efg_points / total_fga
        expected_efg_points = 0
        for r in rows:
            freq = (r["fga"] or 0) / total_fga
            league_bucket_avg = league_avg.get(r["close_def_dist_range"])
            if league_bucket_avg is not None:
                expected_efg_points += freq * league_bucket_avg
        deltas.append({
            "player_id": player_id,
            "actual_efg_pct": round(actual_efg, 4),
            "expected_efg_pct": round(expected_efg_points, 4),
            "shot_quality_delta": round(actual_efg - expected_efg_points, 4),
            "total_fga": total_fga,
        })
    return deltas, league_avg


def fetch_shot_zones(proxies):
    url = ("https://stats.nba.com/stats/leaguedashplayershotlocations?College=&Conference=&Country="
           "&DateFrom=&DateTo=&DistanceRange=By+Zone&Division=&DraftPick=&DraftYear=&GameScope="
           "&GameSegment=&Height=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0"
           "&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals&Period=0"
           "&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=2025-26"
           "&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference="
           "&VsDivision=&Weight=")
    body, error = fetch_json(url, proxies)
    if error:
        return None, error, None
    try:
        raw_result_sets = body.get("resultSets")
        # Real, confirmed quirk (2026-09-03): unlike every other endpoint used this session,
        # this one returns resultSets as a single dict, not a list of dicts - indexing it with
        # [0] raised KeyError(0), which stringifies to the confusing bare "0" seen in the first
        # failed attempt's meta file.
        result_set = raw_result_sets[0] if isinstance(raw_result_sets, list) else (raw_result_sets or {})
        # Real, unusual structure: two header rows - a zone-name row with columnSpan, and a
        # per-zone sub-header row. The sub-header's own "columnNames" is misleadingly the FULL
        # flat 30-column list (6 skip columns + FGM/FGA/FG_PCT repeated per zone), not just the
        # 3 real per-zone sub-column names - confirmed from the actual raw response, not assumed.
        header_groups = result_set.get("headers") or []
        row_set = result_set.get("rowSet") or []
        if len(header_groups) < 2:
            return None, "unexpected_header_structure_less_than_2_groups", body
        zone_group = header_groups[0]
        zone_names = zone_group.get("columnNames") or []
        skip = zone_group.get("columnsToSkip", 0)
        span = zone_group.get("columnSpan", 3)
        per_zone_subcols = ["FGM", "FGA", "FG_PCT"][:span]

        players = []
        for row in row_set:
            pid = row[0] if row else None
            if not pid:
                continue
            zones = {}
            for zi, zone_name in enumerate(zone_names):
                base = skip + zi * span
                zone_data = {}
                for si, sub_name in enumerate(per_zone_subcols):
                    if base + si < len(row):
                        zone_data[sub_name] = row[base + si]
                zones[zone_name] = zone_data
            players.append({"player_id": int(pid), "zones": zones})
        return players, None, None
    except Exception as exc:  # noqa: BLE001
        return None, str(exc), body


def main():
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    Path("nba/data").mkdir(parents=True, exist_ok=True)

    # --- Shot quality by defender distance + delta ---
    all_bucket_rows = []
    bucket_errors = {}
    for dist_range in DIST_RANGES:
        rows, error = fetch_shot_quality_bucket(dist_range, proxies)
        if rows is not None:
            all_bucket_rows.extend(rows)
            bucket_errors[dist_range] = None
        else:
            bucket_errors[dist_range] = error
        time.sleep(0.5)

    Path("nba/data/nba_shotquality_current.json").write_text(json.dumps({"rows": all_bucket_rows}, indent=2), encoding="utf-8")
    sq_error = None
    failed_buckets = [k for k, v in bucket_errors.items() if v]
    if failed_buckets:
        sq_error = f"failed_buckets: {failed_buckets}"
    Path("nba/data/nba_shotquality_current_meta.json").write_text(json.dumps({
        "fetched_at": fetched_at, "per_bucket": bucket_errors, "row_count": len(all_bucket_rows), "error": sq_error,
    }, indent=2), encoding="utf-8")

    deltas, league_avg = ([], {})
    delta_error = None
    if not failed_buckets and all_bucket_rows:
        deltas, league_avg = compute_deltas(all_bucket_rows)
        if len(deltas) < 400:
            delta_error = f"suspiciously_low: only {len(deltas)} player deltas computed"
    else:
        delta_error = "skipped_due_to_bucket_fetch_failures"
    Path("nba/data/nba_shotquality_delta_current.json").write_text(json.dumps({"deltas": deltas, "league_avg_by_bucket": league_avg}, indent=2), encoding="utf-8")
    Path("nba/data/nba_shotquality_delta_current_meta.json").write_text(json.dumps({
        "fetched_at": fetched_at, "player_count": len(deltas), "error": delta_error,
    }, indent=2), encoding="utf-8")

    # --- Shot zone profile ---
    zone_players, zone_error, raw_dump = fetch_shot_zones(proxies)
    zone_records = []
    if zone_players:
        for p in zone_players:
            for zone_name, zone_data in p["zones"].items():
                zone_records.append({"player_id": p["player_id"], "zone": zone_name, **zone_data})
    if len(zone_records) < 1000 and not zone_error:
        zone_error = f"suspiciously_low_zone_records: {len(zone_records)}"
    if raw_dump is not None:
        Path("nba/data/nba_shotzones_debug_raw.json").write_text(json.dumps(raw_dump)[:50000], encoding="utf-8")
    Path("nba/data/nba_shotzones_current.json").write_text(json.dumps({"records": zone_records}, indent=2), encoding="utf-8")
    Path("nba/data/nba_shotzones_current_meta.json").write_text(json.dumps({
        "fetched_at": fetched_at, "record_count": len(zone_records), "error": zone_error,
    }, indent=2), encoding="utf-8")

    any_error = sq_error or delta_error or zone_error
    if any_error:
        print(f"NBA shot quality scrape had issues: sq={sq_error} delta={delta_error} zones={zone_error}", file=sys.stderr)
        sys.exit(1)
    print(f"NBA shot quality scrape OK: {len(all_bucket_rows)} bucket rows, {len(deltas)} deltas, {len(zone_records)} zone records")


if __name__ == "__main__":
    main()
