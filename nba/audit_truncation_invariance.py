#!/usr/bin/env python3
"""
CERTIFICATION TEST 1 - TRUNCATION INVARIANCE (NBA_HONEST_REBUILD.md section 9A; owner 2026-11-19 14:51 PT: "be sure that those numbers are now right.
No doubt, no question"). Writes nothing to Postgres or the repo.
An honest history number for a game on day D may only use what existed before D. So: delete EVERYTHING after a cut date from every input the recipe
reads (player logs, team logs, advanced team logs, four factors, scoring), rebuild, and compare with the full-season build for every game on or before the
cut. An honest recipe gives the SAME probability on every rung. Any look-ahead - the proven month-end tier, or one nobody has found yet - shows up as
rows that move. This does not depend on knowing where a leak is.
Per prop pair and season:
  FULL   the day-by-day history builder over the fixed recipe, whole season                                   (what nba_score.baseline_history_h holds)
  CUT    the same with all inputs cut at TV_CUT (several dates, ';' separated)
  -> rungs on or before the cut: share identical (|dp| < 1e-4), share moving > 0.1 / 1 / 5 points, the largest move, by prop and by days before the cut.
POSITIVE CONTROL (TV_CONTROL=1): the same comparison on the UNFIXED recipe (month-end tier) - it MUST show moved rows in the cut month, otherwise the
test itself would be blind.
PASS = fixed recipe 100.00% identical on every cut; control shows movement.
Env: DATABASE_URL (unused), BT_TEST, TV_PAIR (one prop pair), TV_CUT (dates), TV_CONTROL (0 | 1).
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import research_tier_prior_leak as TL                       # noqa: E402

TEST = os.environ.get("BT_TEST") or "2025-26"
TRAIN = os.environ.get("BT_TRAIN") or {"2024-25": "2023-24", "2025-26": "2023-24,2024-25"}.get(TEST, "2023-24,2024-25,2025-26")
PAIR = os.environ.get("TV_PAIR") or "points,rebounds"
CUTS = [c for c in (os.environ.get("TV_CUT") or {"2024-25": "2024-11-12;2025-01-14;2025-03-20", "2025-26": "2025-11-12;2026-01-14;2026-03-20"}.get(TEST, "2026-10-31;2026-11-10")).split(";") if c]
CONTROL = (os.environ.get("TV_CONTROL") or "0") == "1"
T0 = time.time()
A1 = '''players = pd.concat(P, ignore_index=True); teams = pd.concat(T, ignore_index=True); teams_adv = pd.concat(TA, ignore_index=True)
for df in (players, teams): df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
'''
B1 = A1 + '''_TV_CUT = os.environ.get("BT_TRUNC")
if _TV_CUT:
    import datetime as _tvd
    _tvc = _tvd.date.fromisoformat(_TV_CUT)
    players = players[players["GAME_DATE"] <= _tvc].copy(); teams = teams[teams["GAME_DATE"] <= _tvc].copy()
    _TV_GID = set(teams["GAME_ID"].astype(str)); teams_adv = teams_adv[teams_adv["GAME_ID"].astype(str).isin(_TV_GID)].copy()
    print("TRUNCATED at", _TV_CUT, "player rows", len(players), "team rows", len(teams), "adv rows", len(teams_adv))
'''
A2 = '''ff = pd.concat(FF, ignore_index=True); sc = pd.concat(SC, ignore_index=True)
'''
B2 = A2 + '''if os.environ.get("BT_TRUNC"):
    ff = ff[ff["GAME_ID"].astype(str).isin(_TV_GID)].copy(); sc = sc[sc["GAME_ID"].astype(str).isin(_TV_GID)].copy()
'''
ANCH = 'SRC = Path("nba/backtest/classification_ladder_v12.py").read_text()'


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def build(tag, fixed, cut):
    src = (HERE / "backtest" / "classification_ladder_v12.py").read_text()
    assert TL.OLD in src and A1 in src and A2 in src, "harness anchors changed"
    if fixed:
        src = src.replace(TL.OLD, TL.NEW)
    src = src.replace(A1, B1).replace(A2, B2)
    hf = HERE / "backtest" / f"_cl_tv_{tag}.py"; hf.write_text(src)
    bsrc = (HERE / "baseline" / "build_baseline_history.py").read_text(); assert ANCH in bsrc
    bf = HERE / "baseline" / f"_bh_tv_{tag}.py"; bf.write_text(bsrc.replace(ANCH, f'SRC = Path("nba/backtest/_cl_tv_{tag}.py").read_text()'))
    env = dict(os.environ, BT_TEST=TEST, BT_TRAIN=TRAIN, BT_PROPS=PAIR, BT_LADDER_STEPS="10", BT_INJURY="1", BT_TAG="tv" + tag)
    env.pop("BT_TRUNC", None)
    if cut:
        env["BT_TRUNC"] = cut
    r = subprocess.run([sys.executable, str(bf)], cwd=str(ROOT), env=env, capture_output=True, text=True)
    for p in (hf, bf):
        p.unlink()
    if r.returncode != 0:
        print(r.stdout[-1500:], r.stderr[-3000:], flush=True); raise SystemExit(f"builder failed ({tag}, cut {cut})")
    f = ROOT / "nba" / "data" / f"nba_baseline_history_{TEST.replace('-', '_')}_{PAIR.replace(',', '-')}.json"
    rows = json.load(open(f))["rows"]; f.unlink()
    tr = [ln for ln in r.stdout.splitlines() if ln.startswith("TRUNCATED")]
    df = pd.DataFrame(rows)[["game_date", "player_id", "game_id", "prop", "line", "offset", "p_more", "anchor", "role_tier", "var_band"]]
    log(f"{tag} cut {cut or 'none'}: {len(df):,} rungs, {df['game_date'].nunique()} dates, last {df['game_date'].max()} {('| ' + tr[0]) if tr else ''}")
    return df


def compare(label, full, cutdf, cut):
    a = full[full["game_date"] <= cut]; key = ["game_date", "player_id", "game_id", "prop", "offset"]
    j = a.merge(cutdf, on=key, how="outer", suffixes=("_f", "_c"), indicator=True)
    both = j[j["_merge"] == "both"]; d = (both["p_more_c"] - both["p_more_f"]).abs().values * 100
    la = (both["line_f"] - both["line_c"]).abs().values
    ident = float((d < 0.01).mean()) if len(d) else float("nan")
    print(f"TV|{label} cut {cut}: rungs on or before the cut - full {len(a):,}, cut build {len(cutdf):,}, in both {len(both):,} (only full {int((j['_merge'] == 'left_only').sum()):,}, only cut {int((j['_merge'] == 'right_only').sum()):,}) | "
          f"IDENTICAL {100 * ident:.2f}% | moving > 0.1 pt {100 * (d > .1).mean():.2f}%, > 1 pt {100 * (d > 1).mean():.2f}%, > 5 pts {100 * (d > 5).mean():.2f}% | largest move {d.max() if len(d) else 0:.2f} pts | "
          f"lines differing {100 * (la > 1e-6).mean():.2f}% | anchors differing {100 * ((both['anchor_f'] - both['anchor_c']).abs() > 1e-6).mean():.2f}%", flush=True)
    if len(d) and (d > .01).any():
        both = both.assign(d=d, dbc=(pd.to_datetime(cut) - pd.to_datetime(both["game_date"])).dt.days)
        both["when"] = pd.cut(both["dbc"], [-1, 3, 10, 20, 31, 62, 400], labels=["0-3 days before cut", "4-10", "11-20", "21-31", "32-62", "63+"])
        for w, g in both.groupby("when", observed=True):
            print(f"TV|    {str(w):22s} rungs {len(g):8,} moved > 0.1 pt {100 * (g['d'] > .1).mean():6.2f}% mean move {g['d'].mean():.3f} max {g['d'].max():.2f}", flush=True)
        for p_, g in both.groupby("prop"):
            print(f"TV|    {p_:12s} moved > 0.1 pt {100 * (g['d'] > .1).mean():6.2f}% max {g['d'].max():.2f}", flush=True)
    return ident, int((j["_merge"] != "both").sum())


def main():
    print(f"TV|season {TEST}, pair {PAIR}, cuts {CUTS}, control {CONTROL}", flush=True)
    ok = True
    full = build("fixfull", True, None)
    for c in CUTS:
        ident, miss = compare("FIXED recipe  ", full, build("fixcut", True, c), c)
        ok = ok and ident > 0.99995 and miss == 0
    print(f"TV|RESULT fixed recipe {TEST} {PAIR}: {'PASS - every rung identical on every cut' if ok else 'FAIL - rows moved or went missing'}", flush=True)
    if CONTROL:
        lf = build("leakfull", False, None); seen = False
        for c in CUTS:
            ident, _ = compare("UNFIXED recipe", lf, build("leakcut", False, c), c); seen = seen or ident < 0.999
        print(f"TV|CONTROL unfixed recipe {TEST} {PAIR}: {'movement seen - the test can see a leak' if seen else 'NO movement - the test is blind, do not trust a pass'}", flush=True)
    print("TV|DONE", flush=True)


if __name__ == "__main__":
    main()
