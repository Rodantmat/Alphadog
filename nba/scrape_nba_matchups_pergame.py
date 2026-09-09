#!/usr/bin/env python3
"""
Per-game matchups (boxscorematchupsv3) - the PARITY object for the matchup factor family.

The season matchup table (leagueseasonmatchups) has no date filter, so a historical simulation built on it would see
end-of-season pairings (future leakage). The per-game box score is the same object live (new games only, after the
daily delta) and historically (every game), and the season-to-date / last-N aggregates are derived in-repo with
nba_asof.aggregate_matchups_asof - identical in training and production.

Modes: MATCHUPS_MODE=backfill (all regular-season games of SEASON, resumable; skip list for source-empty games) or
delta (games in the committed delta team log not yet covered). Output nba/data/nba_matchups_pergame_<slug>.json.
The first raw response is saved to nba/data/nba_matchups_pergame_probe.json so the nested structure is verified
against reality (project discipline: never assume a schema from docs).
"""
import json
import os
import sys
import time
from pathlib import Path

from curl_cffi import requests

sys.path.insert(0, "nba")
from nba_season import active_stats_season

STATS_HEADERS = {
    "Host": "stats.nba.com", "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br", "Connection": "keep-alive", "Referer": "https://stats.nba.com/",
    "x-nba-stats-origin": "stats", "x-nba-stats-token": "true",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
}
DATA = Path("nba/data")
KEEP = ["matchupMinutes", "partialPossessions", "percentageDefenderTotalTime", "percentageOffensiveTotalTime", "percentageTotalTimeBothOn",
        "switchesOn", "playerPoints", "teamPoints", "matchupAssists", "matchupPotentialAssists", "matchupTurnovers", "matchupBlocks",
        "matchupFieldGoalsMade", "matchupFieldGoalsAttempted", "matchupThreePointersMade", "matchupThreePointersAttempted", "helpBlocks",
        "helpFieldGoalsMade", "helpFieldGoalsAttempted", "matchupFreeThrowsMade", "matchupFreeThrowsAttempted", "shootingFouls"]


def _walk(node, game_id, team_id, out):
    """Robust extraction: any dict carrying both an offensive and a defensive person id plus stats becomes a row."""
    if isinstance(node, dict):
        if "personIdOff" in node or ("personId" in node and "matchups" in node):
            pass
        if "matchups" in node and isinstance(node["matchups"], list):
            for m in node["matchups"]:
                row = {"gameId": game_id, "teamId": team_id, "personIdDef": node.get("personId"), "positionDef": node.get("position"), "personIdOff": m.get("personId")}
                st = m.get("statistics") or m
                for k in KEEP:
                    if k in st: row[k] = st[k]
                out.append(row)
        for k, v in node.items():
            if k != "matchups": _walk(v, game_id, node.get("teamId", team_id), out)
    elif isinstance(node, list):
        for v in node: _walk(v, game_id, team_id, out)


def fetch_game(session, game_id):
    url = f"https://stats.nba.com/stats/boxscorematchupsv3?GameID={game_id}&LeagueID=00&endPeriod=0&endRange=28800&rangeType=0&startPeriod=0&startRange=0"
    for attempt in range(3):
        try:
            r = session.get(url, headers=STATS_HEADERS, timeout=60, impersonate="chrome124")
            if r.status_code == 200:
                body = r.json()
                probe = DATA / "nba_matchups_pergame_probe.json"
                if not probe.exists(): probe.write_text(json.dumps({"game_id": game_id, "top_keys": list(body.keys()), "sample": json.dumps(body)[:30000]}))
                out = []; _walk(body, game_id, None, out)
                return out, None
            if r.status_code in (404, 400): return [], f"http_{r.status_code}"
        except Exception:  # noqa: BLE001
            time.sleep(3 * (attempt + 1))
    return None, "fetch_failed"


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    session = requests.Session(proxies={"https": proxy_url, "http": proxy_url} if proxy_url else None)
    season = os.environ.get("SEASON") or active_stats_season(); slug = season.replace("-", "_")
    mode = os.environ.get("MATCHUPS_MODE", "delta")
    src = DATA / (f"nba_team_game_log_{slug}.json" if mode == "backfill" else "nba_delta_team_game_log.json")
    tl = json.loads(src.read_text()).get("records", [])
    games = {}
    for r in tl:
        gid = str(r["GAME_ID"])
        if gid.startswith("002"): games[gid] = str(r["GAME_DATE"])[:10]
    path = DATA / f"nba_matchups_pergame_{slug}_index.json"
    # STORAGE: GitHub rejects files >100 MB (a full season of pairings is ~170 MB as row dicts). Rows are stored as
    # COLUMNAR MONTHLY SHARDS nba_matchups_pergame_<slug>_<YYYY-MM>.json ({"columns":[...],"rows":[[...]]}) and the
    # index file carries covered/empty game ids. nba_asof.load_matchups(slug) reassembles them.
    COLS = ["gameId", "GAME_DATE", "teamId", "personIdDef", "personIdOff", "positionDef"] + KEEP
    existing = json.loads(path.read_text()) if path.exists() else {"meta": {"covered": [], "empty": []}}
    covered = set(existing["meta"].get("covered", [])); empty = set(existing["meta"].get("empty", []))
    shards = {}
    for p in DATA.glob(f"nba_matchups_pergame_{slug}_20*.json"):
        d_ = json.loads(p.read_text()); shards[p.name.rsplit("_", 1)[1][:7]] = d_["rows"]
    todo = sorted(g for g in games if g not in covered and g not in empty)
    limit = int(os.environ.get("MAX_GAMES", "1400")); n_ok = n_empty = n_fail = 0
    def _flush():
        for ym, rows_ in shards.items():
            (DATA / f"nba_matchups_pergame_{slug}_{ym}.json").write_text(json.dumps({"columns": COLS, "rows": rows_}, separators=(",", ":")))
        existing["meta"] = {"season": season, "covered": sorted(covered), "empty": sorted(empty), "rows": sum(len(v) for v in shards.values()), "columns": COLS, "shards": sorted(shards)}
        path.write_text(json.dumps({"meta": existing["meta"]}))
    for i, gid in enumerate(todo[:limit]):
        out, err = fetch_game(session, gid)
        if out is None: n_fail += 1; continue
        if not out: empty.add(gid); n_empty += 1
        else:
            ym = games[gid][:7]
            for row in out:
                row["GAME_DATE"] = games[gid]
                shards.setdefault(ym, []).append([(round(row[c], 3) if isinstance(row.get(c), float) else row.get(c)) for c in COLS])
            covered.add(gid); n_ok += 1
        if (i + 1) % 50 == 0: _flush(); print(f"{i + 1}/{len(todo)} ok={n_ok} empty={n_empty} fail={n_fail}")
        time.sleep(0.6)
    _flush()
    sizes = {p.name: round(p.stat().st_size / 1e6, 1) for p in DATA.glob(f"nba_matchups_pergame_{slug}_20*.json")}
    print(f"done: season={season} mode={mode} games={len(games)} covered={len(covered)} empty={len(empty)} rows={existing['meta']['rows']} fail={n_fail} shards_MB={sizes}")
    if n_fail and n_ok == 0: sys.exit(2)


if __name__ == "__main__":
    main()
