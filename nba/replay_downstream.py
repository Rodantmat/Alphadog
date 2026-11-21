#!/usr/bin/env python3
"""
REPLAY THE DOWNSTREAM LAYERS ON THE PARALLEL STORE (owner 2026-11-20 20:58 PT: the same pipeline for every date). Runs the PRODUCTION builders,
unedited, through store_redirect (every scoring table read / written is its _v2 twin):
  RD_STEP=final_hp     nba/build_final_hp.py for each date of RD_DATES (FE_DATE = the date, FE_WRITE = 1)
  RD_STEP=delta        nba/build_availability_delta.py for each date (availability_delta_v2)
  RD_STEP=board        nba/score_board_legs.py for each date (BS_ASOF; board_scored_v2)
  RD_STEP=board_cal    nba/final_hp_board_cal.py for RD_DATES (BC_DATES, BC_WRITE = 1)
  RD_STEP=asof_cal     nba/build_asof_calibration.py (AC_SEASONS = RD_SEASONS)
  RD_STEP=confidence   nba/build_confidence_v3.py (C3_SEASONS = RD_SEASONS)
Env: DATABASE_URL, RD_STEP, RD_DATES (comma list or FROM:TO), RD_SEASONS.
"""
import datetime as dt
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import store_redirect  # noqa: E402


def dates():
    s = os.environ.get("RD_DATES") or ""
    if ":" in s:
        a, b = (dt.date.fromisoformat(x) for x in s.split(":"))
        return [str(a + dt.timedelta(days=i)) for i in range((b - a).days + 1)]
    return [x for x in s.split(",") if x]


def main():
    store_redirect.activate()
    step = os.environ["RD_STEP"]
    if step == "final_hp":
        import psycopg
        conn = psycopg.connect(os.environ["DATABASE_URL"])
        have = {str(r[0]) for r in conn.execute("SELECT DISTINCT game_date FROM nba_score.baseline_history")}   # redirected to _v2
        conn.close()
        for d in dates():
            if d not in have:
                continue
            os.environ.update({"FE_DATE": d, "FE_WRITE": "1"}); os.environ.pop("FE_SEASONS", None)
            print(f"RD|final_hp {d}", flush=True)
            try:
                runpy.run_path(os.path.join(HERE, "build_final_hp.py"), run_name="__main__")
            except SystemExit as e:
                if e.code not in (0, None):
                    print(f"RD|final_hp {d} stopped: {e}", flush=True)
    elif step == "delta":
        for d in dates():
            yy = int(d[:4]) if int(d[5:7]) >= 10 else int(d[:4]) - 1
            os.environ.update({"DELTA_ASOF": d, "DELTA_SEASON": f"{yy}-{str(yy + 1)[-2:]}"})
            print(f"RD|delta {d}", flush=True)
            try:
                runpy.run_path(os.path.join(HERE, "build_availability_delta.py"), run_name="__main__")
            except SystemExit as e:
                if e.code not in (0, None):
                    print(f"RD|delta {d} stopped: {e}", flush=True)
    elif step == "board":
        for d in dates():
            os.environ.update({"BS_ASOF": d, "BS_FORCE_RESCORE": "1"})
            print(f"RD|board {d}", flush=True)
            try:
                runpy.run_path(os.path.join(HERE, "score_board_legs.py"), run_name="__main__")
            except SystemExit as e:
                if e.code not in (0, None):
                    print(f"RD|board {d} stopped: {e}", flush=True)
    elif step == "board_cal":
        ds = dates()
        os.environ.update({"BC_DATES": f"{ds[0]}:{ds[-1]}", "BC_WRITE": "1"})
        runpy.run_path(os.path.join(HERE, "final_hp_board_cal.py"), run_name="__main__")
    elif step == "asof_cal":
        os.environ["AC_SEASONS"] = os.environ.get("RD_SEASONS", "")
        runpy.run_path(os.path.join(HERE, "build_asof_calibration.py"), run_name="__main__")
    elif step == "confidence":
        os.environ["C3_SEASONS"] = os.environ.get("RD_SEASONS", "")
        runpy.run_path(os.path.join(HERE, "build_confidence_v3.py"), run_name="__main__")
    print("RD|DONE", flush=True)


if __name__ == "__main__":
    main()
