#!/usr/bin/env python3
"""
S7a - DRY-RUN OF THE ONE-BLOCK TIER FIX IN PRODUCTION (NBA_HONEST_REBUILD.md, D7 next step a). Writes nothing to Postgres and nothing to the repo.
Runs the PRODUCTION day builder (nba/baseline/build_baseline_ladder.py, BT_REPLAY=1) for one past slate twice per prop pair:
  A  the harness as it is today (month-end tier in the training rows = the leak; today's rows already use the latest game)
  B  the harness with the tier taken day by day (research_tier_prior_leak.NEW)
and compares the two ladders rung by rung: rows, players, how far the probability moves (median / 90% / 99% / max), share of rungs moving more than
1 / 2 / 5 points, the same per prop, and the run time of each (the fix loops day by day: it must not slow the daily pipeline).
Then the combos builder (build_combos_ladder.py over combos_ladder_v1.py) the same way when TD_COMBOS=1.
Env: TD_ASOF (default yesterday), TD_PAIRS (':' between pairs; default points,rebounds:assists,steals), TD_COMBOS (0).
"""
import json
import os
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import research_tier_prior_leak as TL                       # noqa: E402
import research_honest_history_build as HB                  # noqa: E402  (COMBO_OLD / COMBO_NEW)

ASOF = os.environ.get("TD_ASOF") or str(date.today() - timedelta(days=1))
PAIRS = (os.environ.get("TD_PAIRS") or "points,rebounds:assists,steals").split(":")
ANCH = 'SRC = Path("nba/backtest/classification_ladder_v12.py").read_text()'


def run(script, pair, extra=None):
    env = dict(os.environ, BT_ASOF=ASOF, BT_REPLAY="1", BT_PROPS=pair); env.update(extra or {})
    t = time.time(); r = subprocess.run([sys.executable, str(script)], cwd=str(ROOT), env=env, capture_output=True, text=True); dt = time.time() - t
    if r.returncode != 0:
        print(r.stdout[-1500:], r.stderr[-3000:], flush=True); raise SystemExit(f"builder failed: {script.name} {pair}")
    f = ROOT / "nba" / "data" / f"nba_baseline_ladder_{ASOF}_{pair.replace(',', '-')}.json"
    doc = json.load(open(f)); f.unlink()
    return pd.DataFrame(doc["ladder"]), dt, doc["meta"]


def compare(a, b, label):
    pc = next(c for c in ("p_more", "p", "prob", "p_over") if c in a.columns)
    key = [c for c in ("player_id", "game_id", "prop", "line", "side", "offset") if c in a.columns]
    j = a.merge(b, on=key, how="outer", suffixes=("_a", "_b"), indicator=True)
    both = j[j["_merge"] == "both"]; dlt = (both[pc + "_b"] - both[pc + "_a"]).abs().values * 100
    print(f"TD|{label}: rungs A {len(a):,} / B {len(b):,} / in both {len(both):,} (only A {int((j['_merge'] == 'left_only').sum())}, only B {int((j['_merge'] == 'right_only').sum())}); "
          f"players {a['player_id'].nunique()} / {b['player_id'].nunique()}", flush=True)
    if len(dlt):
        print(f"TD|{label}: probability moves (points) median {np.median(dlt):.2f}, 90% {np.quantile(dlt, .9):.2f}, 99% {np.quantile(dlt, .99):.2f}, max {dlt.max():.2f} | "
              f"moving > 1 pt {100 * (dlt > 1).mean():.1f}%, > 2 pts {100 * (dlt > 2).mean():.1f}%, > 5 pts {100 * (dlt > 5).mean():.1f}% | "
              f"mean signed move {100 * (both[pc + '_b'] - both[pc + '_a']).mean():+.2f}", flush=True)
        for pr, g in both.groupby("prop"):
            d_ = (g[pc + "_b"] - g[pc + "_a"]).abs() * 100
            print(f"TD|   {pr:12s} rungs {len(g):6,} median {d_.median():.2f} 99% {d_.quantile(.99):.2f} max {d_.max():.2f}", flush=True)
        for c in ("anchor", "role_tier", "var_band"):
            if c + "_a" in both.columns:
                print(f"TD|   {c} identical on {100 * (both[c + '_a'].astype(str) == both[c + '_b'].astype(str)).mean():.1f}% of rungs", flush=True)


def main():
    src = (HERE / "backtest" / "classification_ladder_v12.py").read_text()
    assert TL.OLD in src, "tier block not found - the harness changed"
    hfile = HERE / "backtest" / "_cl_fixed.py"; hfile.write_text(src.replace(TL.OLD, TL.NEW))
    bsrc = (HERE / "baseline" / "build_baseline_ladder.py").read_text(); assert ANCH in bsrc
    bfile = HERE / "baseline" / "_bl_fixed.py"; bfile.write_text(bsrc.replace(ANCH, 'SRC = Path("nba/backtest/_cl_fixed.py").read_text()'))
    print(f"TD|slate {ASOF}; pairs {PAIRS}", flush=True)
    for pair in PAIRS:
        a, ta, meta = run(HERE / "baseline" / "build_baseline_ladder.py", pair)
        b, tb, _ = run(bfile, pair)
        print(f"TD|{pair}: run time A {ta:.0f}s, B {tb:.0f}s ({tb - ta:+.0f}s); slate games {meta.get('slate_games')}, players {meta.get('players')}", flush=True)
        compare(a, b, pair)
    for p in (hfile, bfile):
        p.unlink()
    print("TD|DONE", flush=True)


if __name__ == "__main__":
    main()
