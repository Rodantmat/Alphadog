#!/usr/bin/env python3
"""Runner wrapper (the research workflow accepts only research_*/audit_* names): final_live_slip_engine.py with the env given (FL_APP, FL_DATE, FL_DRY=1 or FL_TEST=1 = write path then rollback)."""
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
runpy.run_path(os.path.join(HERE, "final_live_slip_engine.py"), run_name="__main__")
