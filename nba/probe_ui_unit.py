#!/usr/bin/env python3
"""PROBE - THE UNIT ON THE SLIPS SCREEN (2026-10-28; owner 13:00 PT: "show itself on the slip screen and give an alert message of
unit amount change"). GET /api/stake-unit (the unit + earn-the-raise status) and the Slips screen's notes (POST
/api/slips/high-hit, refresh only with UI_REFRESH=1). Prints no secret. Env: UI_URL, UI_REFRESH."""
import json
import os
import urllib.request

URL = os.environ.get("UI_URL", "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev").rstrip("/")


def call(path, body=None):
    req = urllib.request.Request(f"{URL}{path}", data=None if body is None else json.dumps(body).encode(),
                                 method="GET" if body is None else "POST",
                                 headers={"content-type": "application/json", "user-agent": "alphadog-unit-probe"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def main():
    su = call("/api/stake-unit")
    print("version:", su.get("version"))
    s = su.get("stake_unit") or {}
    print("unit_usd:", s.get("unit_usd"), "| auto:", json.dumps({k: v for k, v in (s.get("auto") or {}).items() if not k.startswith("note")}))
    print("auto_status:", json.dumps(s.get("auto_status")))
    hh = call("/api/slips/high-hit" + ("?refresh=1" if os.environ.get("UI_REFRESH") == "1" else ""), {})
    print(f"screen: slate {(hh.get('slate') or {}).get('date')}, {len(hh.get('generated_slips') or [])} slips, stake_unit usd {(hh.get('stake_unit') or {}).get('usd')}")
    for n in hh.get("notes") or []:
        if "nit" in n:
            print("  note:", n[:300])
    for g in hh.get("generated_slips") or []:
        print(f"  {g.get('source_key')} {g.get('track_label')} | {g.get('stake_label')}")


if __name__ == "__main__":
    main()
