#!/usr/bin/env python3
"""
THE PROOF (owner: "once qualified we cannot have different numbers"). For each date given, builds the slate THE LIVE WAY (final_live.set_live + LM.load with the legs of
the day injected and the models FITTED on the months before, no stored prediction) from the shared frame, runs the live strategies and compares every slip, player by
player, with what the replay stored in nba_score.frame_slips (research_frame_replay.py: stored predictions). Identical slips / total = the parity.
Env: DATABASE_URL, FL_APP, FL_DATES (comma list), FR_TAG (default final). FL_BS=v2 is set here (the honest day scores). Read-only.
"""
import os

os.environ["LM_SRC"] = "frame"; os.environ["FL_BS"] = "v2"
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import final_live as FL                                         # noqa: E402

TAG = os.environ.get("FR_TAG") or "final"


def main():
    import research_leg_model_h as LM
    dates = [d for d in (os.environ.get("FL_DATES") or "").split(",") if d]
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    ref = defaultdict(list)
    for g, code, j, pl in conn.execute("SELECT game_date::text, code, j, players FROM nba_score.frame_slips WHERE app = %s AND tag = %s AND game_date = ANY(%s::date[]) ORDER BY game_date, code, j",
                                      (FL.APP, TAG, dates)).fetchall():
        ref[(g, code)].append(frozenset(pl.split(".")))
    tot = defaultdict(int)
    for gd in dates:
        legs = FL.set_live(conn, gd, "v2")
        if legs is None:
            FL.log(f"PAR|{FL.APP} {gd}: no live legs"); continue
        df, X = LM.load(conn)
        P = FL.predict(df, X, {"prizepicks": {"gbm"}, "underdog": {"gbm"}, "sleeper": {"gbm_s"}, "fliff": {"gbm_s"}}.get(FL.APP, set()))
        P.pop("weights", None)
        d = FL.build_frame(conn, df, X, P)
        per, merged = FL.day_slips(d)
        for sg in FL.SET:
            mine = [frozenset(r["player_id"] for r in s) for s in per.get(sg["code"], [])]
            theirs = ref.get((gd, sg["code"]), [])
            eq = sum(1 for a, b in zip(mine, theirs) if a == b)
            tot["research"] += len(theirs); tot["live"] += len(mine); tot["equal"] += eq
            if mine != theirs:
                FL.log(f"PAR|{FL.APP} {gd} {sg['code']}: live {len(mine)} slips, stored {len(theirs)}, identical {eq}")
        FL.log(f"PAR|{FL.APP} {gd}: legs {len(d)}; running identical {tot['equal']} of {tot['research']}")
    FL.log(f"PAR|{FL.APP}: stored slips {tot['research']}, live-built {tot['live']}, identical {tot['equal']} = {100 * tot['equal'] / max(1, tot['research']):.1f}%")


if __name__ == "__main__":
    main()
