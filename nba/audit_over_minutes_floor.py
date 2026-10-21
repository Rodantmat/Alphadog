#!/usr/bin/env python3
"""
AUDIT - the Over minutes floor reads its DB row and acts on a real board (2026-10-21). READ-ONLY.
Loads a slate's board exactly as pick() does (live loader, certified pool, pass-45 filter), applies
live_slip_engine.over_minutes_filter with the PRODUCTION config row (no env override), and reports what it removed.
Expect on 10-20: Daniss Jenkins' Overs out (15.3 min on the night; last-10 average below the floor).
Env: DATABASE_URL, OM_DATE (default 2026-10-20).
"""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.pop("LS_OVER_MIN", None)
import live_slip_engine as L  # noqa: E402

D = os.environ.get("OM_DATE", "2026-10-20")


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        cfg = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='over_minutes_floor'").fetchone()
        print(f"config row: {cfg[0] if cfg else None}", flush=True)
        legs = L.load_board_legs(conn, D)
        L.attach_pf20(conn, D, legs)
        pool = L.ENG.eligible_legs(legs)
        t10 = L.trailing10(conn, D, {l["player_id"] for v in pool.values() for l in v if l["prop"] == "steals" and l.get("player_id")})
        pool = {c: [l for l in v if L.leg_allowed(l, t10)] for c, v in pool.items()}
        before = {(l["player"], l["prop"], l["side"], float(l["line"])) for v in pool.values() for l in v}
        after_pool = L.over_minutes_filter(conn, D, pool)
        after = {(l["player"], l["prop"], l["side"], float(l["line"])) for v in after_pool.values() for l in v}
        gone = sorted(before - after)
        print(f"{D}: pool legs {len(before)} -> {len(after)}; removed {len(gone)}", flush=True)
        for g in gone:
            print("   removed:", g, flush=True)
        bad = [g for g in gone if g[2] != "Over"]
        ok = bool(cfg) and not bad and len(after) < len(before)
        print("AUDIT_PASS" if ok else "AUDIT_FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
