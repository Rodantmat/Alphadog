#!/usr/bin/env python3
"""PROBE (2026-10-19, opening-day readiness): rehearse tomorrow's P2B morning game-line capture for 2026-10-20 without writing
anything (GL_DRY_RUN=1): the paid key's historical call (expected 401 DEACTIVATED_KEY), then the live-endpoint fallback with
odds_api_key (3 credits). Prints rows / games / books / markets and each game's home spread and total."""
import os
import runpy
import sys

os.environ.setdefault("GL_DATE", "2026-10-20")
os.environ["GL_DRY_RUN"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "capture_game_lines_morning.py"), run_name="__main__")
