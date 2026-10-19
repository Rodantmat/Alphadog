#!/usr/bin/env python3
"""Betr quote probe, LESS pricing ladder only (k LESS of n, and LESS per stat). Read-only, see probe_betr_quote.py."""
import os
import sys

os.environ["BQ_ONLY_LESS"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_betr_quote  # noqa: E402

probe_betr_quote.main()
