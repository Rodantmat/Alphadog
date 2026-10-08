#!/usr/bin/env python3
"""Probe wrapper: the probe image has no `requests`; install it, then run the board gap repair."""
import os
import subprocess
import sys

subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "requests"])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import repair_board_gaps  # noqa: E402

repair_board_gaps.main()
