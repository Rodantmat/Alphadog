#!/usr/bin/env python3
"""Runner wrapper (research workflow accepts only research_*/audit_* names): final_live.py checks (FL_MODE legs-check | c2 | c4, FL_PH h | prod, FL_APP, FL_DATES, FL_DIAG)."""
import os, runpy, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
runpy.run_path(os.path.join(HERE, "final_live.py"), run_name="__main__")
