#!/usr/bin/env python3
"""AUDIT (2026-11-01): DRY RUN of the live Betr engine's pick path in the new 'board' mode (B_BRD_4dyn, else B_BRD_3dyn_fb) on real
slates' Betr boards - the classification_config betr_live it would run with is the live one plus the rules below (in memory only), the
stale-board limit lifted so a past board can be read. BT_DRY=1: slips printed, nothing written (the transaction is rolled back).
Env: DATABASE_URL, AD_DATES (comma list, default the last 3 slates with a Betr board)."""
import datetime as dt
import os
import sys

os.environ["BT_DRY"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_live_slip_engine as E  # noqa: E402

RULES = [{"name": "B_BRD_4dyn", "k": 4, "order": "bl", "side": "mix", "game_cap": 1, "floor": 0.60, "slips": 2},
         {"name": "B_BRD_3dyn_fb", "k": 3, "order": "bl", "side": "mix", "game_cap": 2, "floor": 0.60, "slips": 2}]


def main():
    with E.SL.connect() as conn:
        real_cfg = E.SL.cfg
        E.SL.cfg = lambda c, key: {**real_cfg(c, key), "mode": "board", "rules": RULES, "max_board_age_h": 1e6} if key == "betr_live" else real_cfg(c, key)
        ds = [dt.date.fromisoformat(x) for x in (os.environ.get("AD_DATES") or "").split(",") if x]
        if not ds:
            ds = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_market.board_snapshots WHERE bookmaker='betr'
                                                ORDER BY 1 DESC LIMIT 3""").fetchall()]
        before = conn.execute("SELECT count(*), coalesce(max(built_at)::text, '') FROM nba_score.betr_live_slips").fetchone()
        for d in ds:
            E.pick(conn, d)
        after = conn.execute("SELECT count(*), coalesce(max(built_at)::text, '') FROM nba_score.betr_live_slips").fetchone()
        print(f"betr_live_slips unchanged by the dry run: {tuple(before) == tuple(after)} {tuple(after)}", flush=True)
        if tuple(before) != tuple(after):
            raise SystemExit(1)


if __name__ == "__main__":
    main()
