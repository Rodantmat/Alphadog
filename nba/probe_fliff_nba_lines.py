#!/usr/bin/env python3
"""FLIFF NBA LINE CHECK (2026-10-19, owner 16:48 PT: "Fliff already have the legs"; screenshot shows BOS@DET Points: Tatum 26.5 1.80x/1.80x,
Cunningham 24.5 1.90x/1.80x, Duren 17.5 1.90x/1.75x, each with a line-picker arrow). Runs the production Fliff scraper for NBA into a scratch dir
and prints (a) those players' Points legs as scraped, (b) lines-per-player-market (does the picker expose more than one line?).
Read-only: nothing written to the DB, nothing committed."""
import json
import os
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
TMP = Path(tempfile.mkdtemp(prefix="fliffchk_"))
env = dict(os.environ, FLIFF_SPORTS="nba", FLIFF_OUT_DIR=str(TMP))
r = subprocess.run([sys.executable, str(HERE / "scrape_fliff_board.py")], env=env, cwd=str(HERE.parent), capture_output=True, text=True, timeout=300)
print("scraper exit", r.returncode, "|", (r.stdout.strip().splitlines() or [""])[-1][:200])
doc = json.loads((TMP / "fliff_nba_current.json").read_text())
legs = doc["legs"]
want = ("Tatum", "Cunningham", "Duren", "Derrick White")
print("\n== Points legs for the screenshot players (as scraped)")
for l in legs:
    if str(l.get("market", "")).lower().startswith("points") and any(w in str(l.get("player", "")) for w in want):
        print(f"  {l['player']:<20} {l['market']:<10} sel={l['selection']!s:<28} line={l['line']!s:<6} american={l['coeff_american']!s:<6} decimal={l['coeff_decimal']!s:<6} status={l['status']}")
by = defaultdict(set)
for l in legs:
    if l.get("player") and l.get("line") not in (None, ""):
        by[(l["player"], l["market"])].add(str(l["line"]))
dist = defaultdict(int)
for v in by.values():
    dist[len(v)] += 1
print("\n== lines per player-market (count of player-markets having N distinct lines):", dict(sorted(dist.items())))
multi = [(k, sorted(v)) for k, v in by.items() if len(v) > 1][:10]
print("multi-line examples:", multi)
n = 0
for m in doc.get("raw_markets", []):
    if str(m.get("visual_name", "")).lower().startswith("points") and n < 1:
        gs = m.get("groups") or []
        print(f"\n== raw 'Points' market: {len(gs)} groups; first 4 group_tags:", [str(g.get('group_tag'))[:40] for g in gs[:4]],
              "| proposals per group:", [len(g.get('proposals') or []) for g in gs[:4]])
        n += 1
