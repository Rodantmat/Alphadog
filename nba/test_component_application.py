#!/usr/bin/env python3
"""
COMPONENT-LEVEL FACTOR APPLICATION — re-derive the mean, do not re-scale it.

THE ERROR THIS FIXES. A2 was applied as `anchor x min_mult` and the leg-level score collapsed from
0.7299 to 1.0123 log-loss. My first diagnosis (the baseline already applied the injury report) was WRONG
for this table: the injury layer lives in the production wrapper build_baseline_ladder.py at a 09:00 ET
cutoff, NOT in the certified recipe, so nba_score.baseline_history carries no injury handling at all.

The real cause is simpler and worse: `anchor` is minutes x rate. Multiplying that PRODUCT by a MINUTES
multiplier assumes production scales one-for-one with minutes, which it does not - and the ladder's
Platt calibration was fitted on unadjusted anchors, so every probability is shifted far too far.

The correct operation, now that the recipe emits its components:

        mean' = proj_min x min_mult x rate36 / 36          <- adjust the LINK, re-derive the mean
        p'    = P(stat > line | mean', dispersion)          <- re-derive the probability

ARMS (leg-level on real PrizePicks lines, log-loss / Brier):
  A  anchor                                    the certified baseline, untouched
  R  re-derived from components, NO factor     sanity check: must reproduce A closely
  M  re-derived with A2 on MINUTES             the correct application
  MD re-derived with A2 on minutes + defender on RATE
If R does not reproduce A, the component path is broken and the other arms mean nothing - so that check
is printed first and gates the rest.

Env: DATABASE_URL, CL_SEASON, CL_SAMPLE_DATES
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg
from scipy import stats as sps

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    season = os.environ.get("CL_SEASON", "2025-26")
    sample = int(os.environ.get("CL_SAMPLE_DATES", "0"))
    slug = season.replace("-", "_")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    b = pd.read_sql("""SELECT game_date, game_id, player_id, anchor, proj_min, rate36
                       FROM nba_score.baseline_history
                       WHERE season=%s AND prop='points' AND ladder_offset=0
                         AND proj_min IS NOT NULL AND rate36 IS NOT NULL""", conn, params=(season,))
    if b.empty:
        print("no component rows yet - rebuild baseline_history with proj_min/rate36 first")
        return
    b["game_date"] = pd.to_datetime(b["game_date"]).dt.date
    b["player_id"] = b["player_id"].astype(str)
    b = b.drop_duplicates(subset=["game_date", "player_id"])
    print(f"component rows: {len(b):,}", flush=True)

    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    d = logs.merge(b, left_on=["GAME_DATE", "PLAYER_ID"], right_on=["game_date", "player_id"], how="inner")

    fac = pd.read_sql("""SELECT game_id, player_id, min_mult FROM nba_score.redistribution_factors
                         WHERE season=%s""", conn, params=(season,))
    fac["player_id"] = fac["player_id"].astype(str)
    d = d.merge(fac, left_on=["GAME_ID", "PLAYER_ID"], right_on=["game_id", "player_id"],
                how="left", suffixes=("", "_f"))
    d["min_mult"] = d["min_mult"].fillna(1.0)
    d = d[(d["proj_min"] > 0) & (d["rate36"] > 0) & d["anchor"].notna()].sort_values("GAME_DATE")
    if sample:
        keep = sorted(d["GAME_DATE"].unique())[:sample]
        d = d[d["GAME_DATE"].isin(keep)]

    # ARM R: re-derive with no factor. Must reproduce the anchor.
    d["R"] = d["proj_min"] * d["rate36"] / 36.0
    corr = float(np.corrcoef(d["R"], d["anchor"])[0, 1])
    ratio = float((d["R"] / d["anchor"].clip(lower=0.1)).median())
    print(f"COMPONENT SANITY: corr(re-derived, anchor) {corr:.4f} | median ratio {ratio:.4f} "
          f"| {'PASS' if corr > 0.97 and 0.93 < ratio < 1.07 else 'FAIL - component path is wrong'}", flush=True)
    if not (corr > 0.97 and 0.93 < ratio < 1.07):
        print("  arms suppressed: if the no-factor re-derivation does not reproduce the anchor, "
              "nothing built on it can be trusted", flush=True)
        conn.close()
        return

    d["A"] = d["anchor"]
    d["M"] = d["proj_min"] * d["min_mult"] * d["rate36"] / 36.0

    board = pd.read_sql("""SELECT game_date, player, line FROM nba_market.board_snapshots
                           WHERE bookmaker='prizepicks' AND snapshot_label='window'
                             AND market_key='player_points' AND side='Over'""", conn)
    conn.close()
    board["game_date"] = pd.to_datetime(board["game_date"]).dt.date
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}
    board["player_id"] = board["player"].map(norm_name).map(pid_map)
    m = board[board["player_id"].notna()].merge(
        d[["GAME_DATE", "PLAYER_ID", "PTS", "A", "R", "M", "min_mult"]],
        left_on=["game_date", "player_id"], right_on=["GAME_DATE", "PLAYER_ID"], how="inner")
    if len(m) < 500:
        print(f"only {len(m)} legs matched", flush=True)
        return

    sd = float(np.std(d["PTS"] - d["A"]))
    hit = (m["PTS"] > m["line"].astype(float)).astype(int)
    print(f"\nLEG-LEVEL on {len(m):,} real legs (residual sd {sd:.2f})")
    for tag, name in (("A", "anchor (certified baseline)"),
                      ("R", "re-derived, no factor"),
                      ("M", "re-derived with A2 on MINUTES")):
        p = np.clip(1 - sps.norm.cdf((m["line"].astype(float) - m[tag]) / max(sd, 1e-6)), 1e-4, 1 - 1e-4)
        ll = float(-np.mean(hit * np.log(p) + (1 - hit) * np.log(1 - p)))
        br = float(np.mean((p - hit) ** 2))
        print(f"  {name:<34} log-loss {ll:.4f}  Brier {br:.4f}", flush=True)

    # where the factor actually fires
    fired = m[m["min_mult"] != 1.0]
    if len(fired) > 300:
        print(f"\n  on the {len(fired):,} legs where A2 actually fires:")
        for tag, name in (("A", "anchor"), ("M", "A2 on minutes")):
            p = np.clip(1 - sps.norm.cdf((fired["line"].astype(float) - fired[tag]) / max(sd, 1e-6)), 1e-4, 1 - 1e-4)
            h = (fired["PTS"] > fired["line"].astype(float)).astype(int)
            ll = float(-np.mean(h * np.log(p) + (1 - h) * np.log(1 - p)))
            print(f"    {name:<20} log-loss {ll:.4f}", flush=True)


if __name__ == "__main__":
    main()
