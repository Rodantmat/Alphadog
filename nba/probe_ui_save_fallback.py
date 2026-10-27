#!/usr/bin/env python3
"""PROBE - REFRESH THE SLIPS SCREEN, CHECK THE THIN-NIGHT FALLBACK SLIPS SHOW, AND SAVE THE OWNER'S PLACED ENTRIES (2026-10-27; owner
15:47 PT with the two PrizePicks entries: "Both in, save it"). Calls the UI worker exactly as the browser does: POST
/api/slips/high-hit?refresh=1 (rebuild + store the screen), lists every slip of strategy UI_STRATEGY (default P_FB_U3power) with its
label / multiplier / legs, then POST /api/slips/save with those slips as the screen's "Save Selected" sends them, real multiplier =
UI_REAL (the app's 6x). Prints no secret. Env: UI_URL, UI_STRATEGY, UI_REAL (default 6), UI_SAVE (1 = save, default 1)."""
import json
import os
import urllib.request

URL = os.environ.get("UI_URL", "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev").rstrip("/")
STRAT = os.environ.get("UI_STRATEGY", "P_FB_U3power")


def post(path, body):
    req = urllib.request.Request(f"{URL}{path}", data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", "user-agent": "alphadog-save-probe"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def main():
    hh = post("/api/slips/high-hit?refresh=1", {})
    sl = [s for s in (hh.get("generated_slips") or []) if s.get("strategy") == STRAT or STRAT in str(s.get("track_label") or "")]
    print(f"screen: {len(hh.get('generated_slips') or [])} slips, {len(sl)} of strategy {STRAT}; snapshot {hh.get('snapshot')}")
    for n in hh.get("notes") or []:
        print("  note:", n[:220])
    for s in sl:
        print(f"  {s.get('track_label')} | {s.get('stake_label')} | x{s.get('estimated_multiplier')} | " +
              "; ".join(f"{l.get('player_name')} {l.get('prop_label')} {l.get('selected_side')} {l.get('line_value')} ({l.get('hit_probability_0_100')}%)"
                        for l in s.get("legs") or []))
    if os.environ.get("UI_SAVE", "1") != "1" or not sl:
        return
    real = float(os.environ.get("UI_REAL", "6"))
    body = {"slips": [{"source_key": "prizepicks", "entry_mode": s.get("entry_mode") or "power", "structure_label": s.get("structure_label"),
                       "track_label": s.get("track_label"), "strategy": STRAT, "estimated_multiplier": s.get("estimated_multiplier"),
                       "real_multiplier": real, "estimated_hit_probability_0_100": s.get("estimated_hit_probability_0_100"),
                       "legs": s.get("legs")} for s in sl], "saved_by": "nba_main_ui"}
    r = post("/api/slips/save", body)
    print(f"SAVE: saved {r.get('saved_count')} - {r.get('saved_slips')} skipped {r.get('skipped')}")


if __name__ == "__main__":
    main()
