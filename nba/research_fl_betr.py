#!/usr/bin/env python3
"""Runner: final_betr.py check mode (FL_DATES) inside the read-only research workflow."""
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("FL_APP", "prizepicks")
runpy.run_path(os.path.join(HERE, "final_betr.py"), run_name="__main__")
