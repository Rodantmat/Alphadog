
import json
import os
import sys
import time
from pathlib import Path

from curl_cffi import requests

sys.path.insert(0, "nba")
from nba_season import active_stats_season

DATA = Path("nba/data")
KEEP = ["matchupMinutes", "playerPoints"]


def _walk(node, game_id, team_id, out):
    if isinstance(node, dict):
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
    from net_retry import RetryError, request
    try:
        r = request("GET", url, session=session, tries=3, base=3, cap=20, timeout=60, label="stats matchups",
                    headers={}, impersonate="chrome124")
    except RetryError:
        return None, "fetch_failed"
    if r.status_code == 200:
        try:
            body = r.json()
        except Exception:  # noqa: BLE001
            return None, "fetch_failed"
        probe = DATA / "nba_matchups_pergame_probe.json"
        if not probe.exists(): probe.write_text(json.dumps({"game_id": game_id, "top_keys": list(body.keys()), "sample": json.dumps(body)[:30000]}))
        out = []; _walk(body, game_id, None, out)
        if not out:
            ep = DATA / "nba_matchups_pergame_empty_probe.json"
            if not ep.exists(): ep.write_text(json.dumps({"game_id": game_id, "http": 200, "top_keys": list(body.keys()), "sample": json.dumps(body)[:3000]}))
        return out, None
    if r.status_code in (404, 400):
        ep = DATA / "nba_matchups_pergame_empty_probe.json"
        if not ep.exists(): ep.write_text(json.dumps({"game_id": game_id, "http": r.status_code, "sample": (r.text or "")[:3000]}))
        return [], f"http_{r.status_code}"
    return None, "fetch_failed"


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    session = requests.Session(proxies={"https": proxy_url, "http": proxy_url} if proxy_url else None)
    season = os.environ.get("SEASON") or active_stats_season(); slug = season.replace("-", "_")
    mode = os.environ.get("MATCHUPS_MODE", "delta")
    post = os.environ.get("MATCHUPS_POSTSEASON", "0") == "1"
    tag = f"postseason_{slug}" if post else slug
    if post:
        src = DATA / f"nba_team_game_log_postseason_{slug}.json"
    else:
        src = DATA / (f"nba_team_game_log_{slug}.json" if mode == "backfill" else "nba_delta_team_game_log.json")
    tl = json.loads(src.read_text()).get("records", []) if (src.exists() or not post) else []
    games = {}
    for r in tl:
        gid = str(r["GAME_ID"])
        if gid.startswith(("004", "005") if post else ("002",)): games[gid] = str(r["GAME_DATE"])[:10]
    path = DATA / f"nba_matchups_pergame_{tag}_index.json"
    COLS = ["gameId", "GAME_DATE", "teamId", "personIdDef", "personIdOff", "positionDef"] + KEEP
    existing = json.loads(path.read_text()) if path.exists() else {"meta": {"covered": [], "empty": []}}
    covered = set(existing["meta"].get("covered", [])); empty = set(existing["meta"].get("empty", []))
    # EMPTY IS NOT FINAL (2026-10-30). An id used to enter `empty` on its FIRST empty answer and was never asked again:
    # on 2026-10-29 all 67 played games of 2026-27 sat there with 0 rows, while 2025-26 (backfilled long after the games)
    # has 0 empties in 1,230. A game is now retried once per day until MAX_EMPTY_TRIES distinct days have answered empty;
    # only then is it treated as source-empty. Ids in the legacy list (no log) are re-opened for retry.
    today = os.environ.get("MATCHUPS_TODAY") or time.strftime("%Y-%m-%d", time.gmtime())
    max_tries = int(os.environ.get("MATCHUPS_MAX_EMPTY_TRIES", "5"))
    empty_log = dict(existing["meta"].get("empty_log") or {})
    for g_ in sorted(empty - set(empty_log)):
        empty_log[g_] = {"first": games.get(g_, today), "last": None, "tries": 1}
    empty = {g_ for g_, e_ in empty_log.items() if e_["tries"] >= max_tries}
    shards = {}
    for p in DATA.glob(f"nba_matchups_pergame_{tag}_20*.json"):
        d_ = json.loads(p.read_text()); shards[p.name.rsplit("_", 1)[1][:7]] = d_["rows"]
    def _due(g_):
        e_ = empty_log.get(g_)
        return e_ is None or (e_["tries"] < max_tries and e_.get("last") != today and games[g_] < today)
    todo = sorted(g for g in games if g not in covered and g not in empty and _due(g))
    limit = int(os.environ.get("MAX_GAMES", "1400")); n_ok = n_empty = n_fail = 0
    def _flush():
        for ym, rows_ in shards.items():
            (DATA / f"nba_matchups_pergame_{tag}_{ym}.json").write_text(json.dumps({"columns": COLS, "rows": rows_}, separators=(",", ":")))
        existing["meta"] = {"season": season, "covered": sorted(covered), "empty": sorted(empty), "empty_log": empty_log, "rows": sum(len(v) for v in shards.values()), "columns": COLS, "shards": sorted(shards)}
        path.write_text(json.dumps({"meta": existing["meta"]}))
    for i, gid in enumerate(todo[:limit]):
        out, err = fetch_game(session, gid)
        if out is None: n_fail += 1; continue
        if not out:
            e_ = empty_log.setdefault(gid, {"first": today, "last": None, "tries": 0})
            e_["tries"] += 1; e_["last"] = today
            if e_["tries"] >= max_tries: empty.add(gid)
            n_empty += 1
        else:
            empty_log.pop(gid, None)
            ym = games[gid][:7]
            for row in out:
                row["GAME_DATE"] = games[gid]
                shards.setdefault(ym, []).append([(round(row[c], 3) if isinstance(row.get(c), float) else row.get(c)) for c in COLS])
            covered.add(gid); n_ok += 1
        if (i + 1) % 50 == 0: _flush(); print(f"{i + 1}/{len(todo)} ok={n_ok} empty={n_empty} fail={n_fail}")
        time.sleep(0.6)
    _flush()
    print(f"done: season={season} mode={mode} games={len(games)} covered={len(covered)} empty={len(empty)} rows={existing['meta']['rows']} fail={n_fail}")
    print(f"retry state: {len(empty_log)} game(s) awaiting data, {len(empty)} given up after {max_tries} days")
    if (n_fail or n_empty) and n_ok == 0: sys.exit(2)


if __name__ == "__main__":
    main()
