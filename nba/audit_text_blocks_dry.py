#!/usr/bin/env python3
"""DRY: print the results block each person's text would carry today (owner, Jessi, Jon) - nothing is sent (p3_text is import-safe since b8fbb698)."""
import os
import sys
import psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import p3_text as PT   # noqa: E402
c = psycopg.connect(os.environ["DATABASE_URL"])
t = os.environ.get("RES_TODAY") or "2026-11-24"
for who in ("rodo", "jessi", "friend"):
    print(f"TB|{who} ({t}): {PT._rb(c, who, t)!r}", flush=True)
c.rollback()
