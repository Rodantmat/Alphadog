#!/usr/bin/env python3
"""Probe (no commit): capture the PrizePicks NBA board with BOTH producers into scratch dirs and compare the payloads -
projection ids, (player, stat, line, odds_type) keys, included entities - so the NBA-owned producer can replace the MLB
file on P3's critical path only if it is byte-for-byte equivalent in what the archiver reads. Round-2 P3#10 (2026-10-08)."""
import json
import os
import subprocess
import sys
from pathlib import Path

env = dict(os.environ)
a = Path("/tmp/pp_main"); b = Path("/tmp/pp_nba")
a.mkdir(parents=True, exist_ok=True); b.mkdir(parents=True, exist_ok=True)
r1 = subprocess.run([sys.executable, "main.py"], env={**env, "PRIZEPICKS_LEAGUE_ID": "7", "PRIZEPICKS_SPORT": "nba", "PRIZEPICKS_OUT_DIR": str(a)},
                    capture_output=True, text=True, timeout=420)
print("main.py exit", r1.returncode, (r1.stdout or "")[-600:], (r1.stderr or "")[-300:])
r2 = subprocess.run([sys.executable, "nba/scrape_prizepicks_nba_board.py"], env={**env, "PP_NBA_OUT_DIR": str(b)},
                    capture_output=True, text=True, timeout=420)
print("nba producer exit", r2.returncode, (r2.stdout or "")[-900:], (r2.stderr or "")[-300:])


def load(p):
    try:
        return json.loads((p / "prizepicks_nba_current.json").read_text())
    except Exception as exc:  # noqa: BLE001
        print("cannot read", p, exc); return {}


def keys(doc):
    inc = {(x.get("type"), x.get("id")): x for x in doc.get("included") or []}
    out = set()
    for row in doc.get("data") or []:
        at = row.get("attributes") or {}
        rel = row.get("relationships") or {}
        pid = ((rel.get("new_player") or {}).get("data") or {}).get("id")
        nm = (inc.get(("new_player", pid), {}).get("attributes") or {}).get("name")
        out.add((nm, at.get("stat_type"), str(at.get("line_score")), at.get("odds_type"), row.get("id")))
    return out


da, db = load(a), load(b)
ka, kb = keys(da), keys(db)
print(f"\nmain.py: data={len(da.get('data') or [])} included={len(da.get('included') or [])} meta={da.get('meta')}")
print(f"nba   : data={len(db.get('data') or [])} included={len(db.get('included') or [])} meta={db.get('meta')}")
print(f"keys main={len(ka)} nba={len(kb)} only_main={len(ka - kb)} only_nba={len(kb - ka)}")
for k in list(ka - kb)[:5]: print("  only main:", k)
for k in list(kb - ka)[:5]: print("  only nba :", k)
ma = json.loads((a / "prizepicks_nba_current_meta.json").read_text()) if (a / "prizepicks_nba_current_meta.json").exists() else {}
mb = json.loads((b / "prizepicks_nba_current_meta.json").read_text()) if (b / "prizepicks_nba_current_meta.json").exists() else {}
print("meta main:", {k: ma.get(k) for k in ("ok", "finished_at", "row_count", "source_url")})
print("meta nba :", {k: mb.get(k) for k in ("ok", "fetched_at", "row_count", "rows", "total_pages", "chosen_url")})
