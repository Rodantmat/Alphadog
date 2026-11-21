#!/usr/bin/env python3
"""Dry run of switch_formula_v2.py (read-only): preflight counts and the index plan. Env: DATABASE_URL."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.pop("SW_APPLY", None)
import switch_formula_v2  # noqa: E402

switch_formula_v2.main()
