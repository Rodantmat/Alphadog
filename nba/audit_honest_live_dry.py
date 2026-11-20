#!/usr/bin/env python3
"""Runs honest_live_slip_engine.py through the research workflow WITHOUT keeping anything: HL_TEST=1 (default here) executes the whole write path and rolls it
back; HL_DRY=1 only prints the slips. Env: DATABASE_URL, HL_DATE, HL_APPS, HL_DRY."""
import os

if os.environ.get("HL_DRY") != "1":
    os.environ["HL_TEST"] = "1"
import honest_live_slip_engine

if __name__ == "__main__":
    honest_live_slip_engine.main()
