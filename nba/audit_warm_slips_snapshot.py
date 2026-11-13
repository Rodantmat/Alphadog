#!/usr/bin/env python3
"""Rebuild the precomputed Slips screen (POST /api/slips/high-hit?refresh=1) and report each Fliff / Underdog slip's legs' live status. READ-ONLY on slips data."""
import json
import urllib.request

URL = "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev/api/slips/high-hit?refresh=1"
req = urllib.request.Request(URL, data=b"{}", method="POST", headers={"content-type": "application/json", "user-agent": "curl/8.5.0", "accept": "*/*"})
j = json.load(urllib.request.urlopen(req, timeout=150))
print("snapshot", j.get("snapshot"), "slips", len(j.get("generated_slips") or []), "slate", (j.get("slate") or {}).get("date"))
pl = j.get("pp_live") or {}
print("apps:", json.dumps(pl.get("apps"))[:1500])
for s in j.get("generated_slips") or []:
    legs = s.get("legs") or []
    app = (legs[0].get("source_key") if legs else None)
    if app not in ("fliff", "underdog"):
        continue
    st = {}
    for l in legs:
        st[l.get("live_now")] = st.get(l.get("live_now"), 0) + 1
    print(app, s.get("structure_label") or s.get("slip_type"), s.get("strategy"), "| play:", s.get("play_note") or s.get("play"), "| live:", st)
