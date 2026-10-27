#!/usr/bin/env python3
"""AUDIT - the quote gate as a DRY RUN (QG_DRY=1: prints every verdict, writes nothing). Env: DATABASE_URL, QG_DATE."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["QG_DRY"] = "1"
import apply_quote_gate as G  # noqa: E402

if __name__ == "__main__":
    G.main()
