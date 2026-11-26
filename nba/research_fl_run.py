#!/usr/bin/env python3
"""Runner for final_live.py inside the read-only research workflow (the workflow only accepts research_* / audit_* names). Env: FL_MODE, FL_APP, FL_DATES, FL_PH."""
import os
import runpy
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
runpy.run_path(os.path.join(here, "final_live.py"), run_name="__main__")
