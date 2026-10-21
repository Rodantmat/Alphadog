#!/usr/bin/env python3
"""
AUDIT - how long the main board's first load takes, Overview vs the whole board (2026-10-21). READ-ONLY (HTTP GETs only).
The browser gives the board load 15 s. Each endpoint is called AT_N times; time, status, row count, and the Overview's settings.
Env: UI_URL (default the deployed NBA main UI), AT_N (default 3).
"""
import json
import os
import subprocess
import time

UI = os.environ.get("UI_URL", "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev").rstrip("/")
N = int(os.environ.get("AT_N", "3"))


def get(path):
    t0 = time.time()
    r = subprocess.run(["curl", "-sS", "-m", "60", "-H", "user-agent: Mozilla/5.0 AlphaDog-NBA-UI-Test", "-w", "\n%{http_code}", UI + path],
                       capture_output=True, text=True)
    txt, _, code = r.stdout.rpartition("\n")
    try:
        d = json.loads(txt)
    except Exception:  # noqa: BLE001
        d = {"raw": txt[:200]}
    return round(time.time() - t0, 2), code, d


def main():
    worst = 0.0
    for label, path in (("overview", "/api/main-board/current?view=overview"), ("whole board", "/api/main-board/current?limit=200&min_score=80"),
                        ("filters", "/api/main-board/filters")):
        for i in range(N):
            t, code, d = get(path + ("&" if "?" in path else "?") + "t=" + str(int(time.time() * 1000)))
            rows = len(d.get("rows") or []) if isinstance(d, dict) else None
            ov = d.get("overview") if isinstance(d, dict) else None
            print(f"{label:<12} #{i + 1}: {t:6.2f}s HTTP {code} rows {rows} ok {d.get('ok') if isinstance(d, dict) else None}"
                  + (f" | candidates {ov.get('candidates')}" if ov else "") + ("" if d.get("ok", True) else f" | error {str(d.get('error'))[:200]}"), flush=True)
            if label == "overview":
                worst = max(worst, t)
                if i == 0 and rows:
                    for r in (d.get("rows") or [])[:8]:
                        print(f"     {r.get('player_name')} {r.get('source_key')} {r.get('canonical_prop_key')} {r.get('selected_side')} {r.get('line_value')} "
                              f"hp {r.get('hit_probability_0_100')} be {r.get('breakeven_0_100')} edge {r.get('edge_0_100')}", flush=True)
    print(f"overview worst {worst:.2f}s (browser budget 15 s)")
    print("AUDIT_PASS" if worst < 12 else "AUDIT_FAIL")


if __name__ == "__main__":
    main()
