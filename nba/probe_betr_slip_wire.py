#!/usr/bin/env python3
"""PROBE stage 2 wrapper: probe_betr_slip.py with BETR_PROBE_STAGE=wire (the browser-probe workflow takes only a script name)."""
import os
import sys

os.environ["BETR_PROBE_STAGE"] = "wire"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_betr_slip  # noqa: E402

probe_betr_slip.main()
