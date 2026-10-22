#!/usr/bin/env python3
"""RESEARCH - the quote gate (apply_quote_gate.py) in DRY RUN on a slate: prints every verdict, writes nothing. Env: DATABASE_URL, QG_DATE."""
import os
import sys

os.environ["QG_DRY"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import apply_quote_gate as G   # noqa: E402

if __name__ == "__main__":
    G.main()
