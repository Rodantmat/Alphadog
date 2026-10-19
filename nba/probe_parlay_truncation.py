#!/usr/bin/env python3
"""PROBE (2026-10-19, opening-day readiness): the P3 ParlayAPI read of 10-19 was truncated on ParlayAPI's side (10,001 items,
x-result-truncated). Runs the production capture in PROBE mode for the 2026-10-20 slate (raw capture stored under the label
'probe_window', NOTHING written to board_snapshots) so the log shows whether the sportsbook-narrowed pass now recovers rows the
full read cut, and how many sportsbook rows the 10-20 slate would get. ~3 credits per page."""
import os
import runpy
import sys

os.environ["CP_MODE"] = "probe"
os.environ.setdefault("CP_DATE", "2026-10-20")
os.environ.setdefault("CP_LABEL", "window")
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
runpy.run_path(os.path.join(here, "capture_parlay_props.py"), run_name="__main__")
