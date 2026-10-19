#!/usr/bin/env python3
"""Betr quotes for the engine's placed slips of today's slate (Pacific date), read-only - probe_betr_quote.py with
BQ_ENGINE_DATE. Dispatch after P3's pick (nba-browser-probe.yml, script probe_betr_quote_engine.py). BQ_ENGINE_DATE overrides."""
import os
import runpy
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

os.environ.setdefault("BQ_ENGINE_DATE", datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat())
os.environ.setdefault("BETR_LEAGUE", "NBA")
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
runpy.run_path(os.path.join(here, "probe_betr_quote.py"), run_name="__main__")
