#!/usr/bin/env python3
"""PROBE (2026-10-19): which sportsbooks ParlayAPI carries PLAYER PROPS for on a live GAME DAY - measured on today's MLB postseason
board (NBA's first game day is tomorrow). Runs probe_parlay_perbook.py with CP_SPORT=baseball_mlb (read-only, ~3 credits per call)."""
import os
import runpy
import sys

os.environ["CP_SPORT"] = "baseball_mlb"
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
runpy.run_path(os.path.join(here, "probe_parlay_perbook.py"), run_name="__main__")
