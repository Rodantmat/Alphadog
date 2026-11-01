#!/usr/bin/env python3
"""RESEARCH (2026-11-01): starter status for game 0022600153 failed in P2A with stats.nba.com HTTP 403 (boxscoretraditionalv3),
while officials for the same game loaded. Read-only: (1) retry v3 for 0022600153 now (transient or persistent?); (2) fetch NBA's CDN
live box score (cdn.nba.com liveData, already the primary box source in audit_live_grade_today.py) for 0022600153 and for control
games already covered by v3; (3) compare the CDN starter flag / position / not-playing comment against the committed v3 rows for the
control games, player by player, to prove a fallback produces the SAME rows. Writes nothing."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

try:
    from curl_cffi import requests
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "curl_cffi"])
    from curl_cffi import requests
import psycopg

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
STATS = {"Host": "stats.nba.com", "Accept": "application/json, text/plain, */*", "Referer": "https://stats.nba.com/",
         "x-nba-stats-origin": "stats", "x-nba-stats-token": "true", "User-Agent": UA}
CDN = {"User-Agent": UA, "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com"}
with psycopg.connect(os.environ["DATABASE_URL"]) as c:
    PROXY = (c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='proxy_url'").fetchone() or [""])[0].strip()


def get(url, headers):
    out = []
    for name, px in (("proxy", PROXY), ("direct", None)):
        if name == "proxy" and not px:
            continue
        try:
            r = requests.get(url, headers=headers, timeout=45, impersonate="chrome124", proxies={"https": px, "http": px} if px else None)
            out.append(f"{name}:{r.status_code}")
            if r.status_code == 200:
                return r.json(), out
        except Exception as e:  # noqa: BLE001
            out.append(f"{name}:{type(e).__name__}")
        time.sleep(1)
    return None, out


POS = {"PG": "G", "SG": "G", "G": "G", "SF": "F", "PF": "F", "F": "F", "C": "C"}


def cdn_rows(gid):
    j, how = get(f"https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gid}.json", CDN)
    print(f"  cdn {gid}: {how}", flush=True)
    if not j:
        return None
    g = j["game"]
    print(f"  cdn {gid}: gameStatus {g.get('gameStatus')} {g.get('gameStatusText')}", flush=True)
    rows = []
    for side in ("homeTeam", "awayTeam"):
        for p in g[side].get("players") or []:
            rows.append({"player_id": int(p["personId"]), "starter": p.get("starter"), "position": p.get("position"), "status": p.get("status"),
                         "npr": p.get("notPlayingReason"), "npd": p.get("notPlayingDescription"), "played": p.get("played")})
    return rows


v3file = json.loads(Path("nba/data/nba_starter_status_2026_27.json").read_text())["rows"]
print("== 1) v3 retry for 0022600153 ==", flush=True)
j, how = get("https://stats.nba.com/stats/boxscoretraditionalv3?GameID=0022600153&LeagueID=00&endPeriod=10&endRange=28800&rangeType=0&startPeriod=1&startRange=0", STATS)
print(f"  v3 0022600153: {how} players={sum(len((j or {}).get('boxScoreTraditional', {}).get(s, {}).get('players') or []) for s in ('homeTeam', 'awayTeam')) if j else 0}", flush=True)
if j:
    for s in ("homeTeam", "awayTeam"):
        for p in j["boxScoreTraditional"][s]["players"][:3]:
            print(f"    v3 sample {p.get('personId')} position={p.get('position')!r} comment={p.get('comment')!r}", flush=True)

print("== 2) CDN for the missing game ==", flush=True)
r153 = cdn_rows("0022600153")
if r153:
    for r in r153:
        print("    " + json.dumps(r), flush=True)

print("== 3) CDN vs committed v3 rows on control games ==", flush=True)
for gid in ("0022600152", "0022600150", "0022600140", "0022600120"):
    cr = cdn_rows(gid)
    v3 = {r["player_id"]: r for r in v3file if r["game_id"] == gid}
    if not cr:
        continue
    n = agree_st = agree_pos = 0
    comments = []
    for r in cr:
        v = v3.get(r["player_id"])
        if not v:
            print(f"    {gid}: player {r['player_id']} in CDN, not in v3", flush=True)
            continue
        n += 1
        st = 1 if str(r["starter"]) == "1" else 0
        agree_st += st == v["is_starter"]
        pos = POS.get(str(r["position"] or "").upper()) if st else None
        agree_pos += pos == v["start_position"]
        if st != v["is_starter"] or pos != v["start_position"]:
            print(f"    {gid}: MISMATCH {r} vs v3 {v}", flush=True)
        if v.get("comment") or r["npr"]:
            comments.append((v.get("comment"), r["npr"], r["npd"], r["status"]))
    missing = set(v3) - {r["player_id"] for r in cr}
    print(f"  {gid}: players {n} (v3 {len(v3)}, v3-only {len(missing)}), starter agree {agree_st}/{n}, position agree {agree_pos}/{n}", flush=True)
    for cm in comments[:12]:
        print(f"    comment v3={cm[0]!r} | cdn reason={cm[1]!r} desc={cm[2]!r} status={cm[3]!r}", flush=True)
print("DONE", flush=True)
