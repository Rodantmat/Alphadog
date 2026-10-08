#!/usr/bin/env python3
"""Probe: run the price-shopping ledger (§31v) in its replay mode on a certified past slate, through the NBA probe
workflow. Installs the scorer's deps (the probe image has no pandas), then runs the ledger with PSL_SOURCE=backtest on
PSL_DATE (default 2026-04-10, a full late-season slate with PrizePicks, Underdog and Betr window archives)."""
import os
import subprocess
import sys

subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "pandas", "numpy"])
os.environ.setdefault("PSL_SOURCE", "backtest")
os.environ.setdefault("PSL_DATE", "2026-04-10")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_price_shop_ledger  # noqa: E402

build_price_shop_ledger.main()
