#!/usr/bin/env python3
"""AUDIT (2026-11-02, units per app): rebuilds the Slips screen snapshot (POST /api/slips/high-hit?refresh=1) and prints the unit
table and every shown slip's PLAY label. READ-ONLY apart from the screen's own snapshot cache."""
import json
import urllib.request

URL = "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev/api/slips/high-hit?refresh=1"
req = urllib.request.Request(URL, data=b"{}", headers={"content-type": "application/json"}, method="POST")
j = json.loads(urllib.request.urlopen(req, timeout=180).read())
print("version", j.get("version"), "ok", j.get("ok"), j.get("error"))
print("unit_table", json.dumps(j.get("unit_table"), indent=1))
print("notes shown", j.get("notes"))
for s in j.get("generated_slips", []):
    print(f"  {s.get('source_key'):10s} {str(s.get('track_label') or s.get('strategy')):55s} {s.get('stake_label')}")
