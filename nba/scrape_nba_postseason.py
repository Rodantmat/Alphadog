#!/usr/bin/env python3
"""
POSTSEASON MINING (strategy §31w P-1, 2026-10-08). Play-in (game ids 005*) and playoffs (004*) for the given seasons, written
to their OWN files so every certified regular-season file stays byte-identical:

  nba/data/nba_player_game_log_postseason_<slug>.json            (+ _meta)  - same fields as the regular-season file
  nba/data/nba_team_game_log_postseason_<slug>.json               (+ _meta)
  nba/data/nba_player_game_log_advanced_postseason_<slug>.json    (+ _meta)
  nba/data/nba_team_game_log_advanced_postseason_<slug>.json      (+ _meta)
  nba/data/nba_backfill_<measure>_postseason_<slug>.json          usage / scoring / team scoring / four factors
  nba/data/nba_player_game_log_q{1..4}_postseason_<slug>.json     quarter logs
  nba/data/nba_starter_status_postseason_<slug>.json   (+ _meta)  per game (boxscoretraditionalv3)
  nba/data/nba_game_officials_postseason_<slug>.json   (+ _meta)  per game (boxscoresummaryv3)

Every request is the regular-season one with SeasonType=PlayIn and SeasonType=Playoffs (the two concatenated) - the same
proven endpoints, fields and file formats, imported from the regular-season scrapers rather than re-implemented.
Env: PROXY_URL, POST_SEASONS (default 2023-24,2024-25,2025-26), POST_PARTS (default logs,measures,periods,pergame).
"""
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scrape_nba_backfill_historical_seasons as H  # noqa: E402
import scrape_nba_backfill_measure_types as M  # noqa: E402
import scrape_nba_per_game_delta as G  # noqa: E402
import scrape_nba_periods as Q  # noqa: E402

OUT = Path("nba/data")
TYPES = ("PlayIn", "Playoffs")
REG = "SeasonType=Regular+Season"


def fetch_records(url, fields, proxies):
    recs, hdrs, errs = [], [], []
    for st in TYPES:
        body, err = H.fetch_json(url.replace(REG, f"SeasonType={st}"), proxies)
        if body is None:
            errs.append(f"{st}: {err}")
            continue
        r, hdrs = H.rows_to_records(body, fields)
        recs += r
        time.sleep(1.5)
    return recs, hdrs, errs


def write(name, slug, season, recs, extra=None):
    path = OUT / f"{name}_postseason_{slug}.json"
    path.write_text(json.dumps({"records": recs}, separators=(",", ":")), encoding="utf-8")
    meta = {"fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "season": season, "season_types": list(TYPES),
            "record_count": len(recs), "games": len({r.get("GAME_ID") for r in recs if r.get("GAME_ID")})}
    meta.update(extra or {})
    (OUT / f"{name}_postseason_{slug}_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"{path.name}: {len(recs)} rows, {meta['games']} games", flush=True)


def main():
    proxy = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy, "http": proxy} if proxy else None
    H.PROXIES = proxies
    seasons = [s.strip() for s in os.environ.get("POST_SEASONS", "2023-24,2024-25,2025-26").split(",") if s.strip()]
    parts = {p.strip() for p in os.environ.get("POST_PARTS", "logs,measures,periods,pergame").split(",")}
    OUT.mkdir(parents=True, exist_ok=True)
    errors = []
    for season in seasons:
        slug = season.replace("-", "_")
        if "logs" in parts:
            urls = H.build_urls(season)
            for name, key, fields in (("nba_player_game_log", "player", H.PLAYER_FIELDS), ("nba_team_game_log", "team", H.TEAM_FIELDS),
                                      ("nba_player_game_log_advanced", "player_advanced", H.PLAYER_ADVANCED_FIELDS),
                                      ("nba_team_game_log_advanced", "team_advanced", H.TEAM_ADVANCED_FIELDS)):
                recs, hdrs, errs = fetch_records(urls[key], fields, proxies)
                errors += [f"{season} {name}: {e}" for e in errs]
                write(name, slug, season, recs, {"real_headers_seen": hdrs, "errors": errs})
        if "measures" in parts:
            for key, endpoint, mtype, rs_name in M.SPECS:
                rows = []
                for st in TYPES:
                    got, err = M.fetch(M.build_url(endpoint, mtype, season).replace(REG, f"SeasonType={st}"), rs_name, proxies)
                    if got is None:
                        errors.append(f"{season} {key} {st}: {err}")
                        continue
                    rows += [M.slim(r) for r in got]
                    time.sleep(1.5)
                (OUT / f"nba_backfill_{key}_postseason_{slug}.json").write_text(json.dumps({"season": season, "season_types": list(TYPES), "records": rows},
                                                                                         separators=(",", ":")), encoding="utf-8")
                print(f"nba_backfill_{key}_postseason_{slug}.json: {len(rows)} rows", flush=True)
        if "periods" in parts:
            orig = Q.fetch_period
            for period in (1, 2, 3, 4):
                recs = []
                for st in TYPES:
                    # the periods scraper builds its URL inline; patch the season type through a thin wrapper of its requests call
                    real_get = Q.requests.get
                    Q.requests.get = (lambda u, *a, _st=st, _g=real_get, **k: _g(u.replace(REG, f"SeasonType={_st}"), *a, **k))
                    try:
                        r, hdr = orig(season, period, proxies)
                        recs += r
                    except Exception as exc:  # noqa: BLE001
                        errors.append(f"{season} Q{period} {st}: {str(exc)[:120]}")
                    finally:
                        Q.requests.get = real_get
                    time.sleep(1.5)
                path = OUT / f"nba_player_game_log_q{period}_postseason_{slug}.json"
                path.write_text(json.dumps({"meta": {"season": season, "period": period, "season_types": list(TYPES), "row_count": len(recs)},
                                            "records": recs}), encoding="utf-8")
                print(f"{path.name}: {len(recs)} rows", flush=True)
        if "pergame" in parts:
            logp = OUT / f"nba_player_game_log_postseason_{slug}.json"
            games = {r["GAME_ID"] for r in json.loads(logp.read_text())["records"] if r.get("GAME_ID")} if logp.exists() else set()
            fa = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            e1 = G.run_delta("starter_status", OUT / f"nba_starter_status_postseason_{slug}.json", OUT / f"nba_starter_status_postseason_{slug}_meta.json",
                             games, G.fetch_starter_status, proxies, fa, season)
            e2 = G.run_delta("game_officials", OUT / f"nba_game_officials_postseason_{slug}.json", OUT / f"nba_game_officials_postseason_{slug}_meta.json",
                             games, G.fetch_officials, proxies, fa, season)
            errors += [f"{season} pergame: {e}" for e in (e1 + e2)]
    print(f"postseason mining done: {len(errors)} errors", flush=True)
    for e in errors[:30]:
        print("  ", e, flush=True)
    if len(errors) > 5:
        sys.exit(1)


if __name__ == "__main__":
    main()
