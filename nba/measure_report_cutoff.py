#!/usr/bin/env python3
"""
EMPIRICAL TEST — is the 1 PM PT cutoff enough, or is 2:30 PM PT actually needed?

WHY THIS EXISTS. COMPASS fact 41 says the pick window sits "after the 2:30 PM PT day-of injury report".
Tracing the transcripts, **2:30 was never a rule**: the 2026-09-09 session recorded it as one entry in a
list of OBSERVED PDF snapshot timestamps (12:30 / 1:00 / 2:30 / 3:30 / 4:00 / 6:45 / 7:45 PM) - and those
filenames are EASTERN. The same line recorded the real policy correctly: "game-day 11am-1pm local".
2:30 PM ET is 11:30 AM PT. It then drifted into "the 2:30 PM PT day-of report" and was repeated as
established in facts 68, 73, 74 and 96.

Policy says the last market to file is Pacific, at 1 PM PT. But policy is not evidence - MEASURE IT.

WHAT THIS MEASURES, per game-day, from our own two seasons of archived snapshots:
  1. for every GAME, the earliest snapshot in which that game's teams appear with a real status
  2. what share of games are fully covered by 10:00, 11:00, 12:00, 13:00, 13:15, 14:00, 14:30 PT
  3. how much STATUS CHURN happens between 13:15 PT and 14:30 PT - i.e. what an earlier cutoff gives up
  4. the same split by tip time, since early tips file 8-10am local and late games may lag
If 1 PM PT covers ~100% of games and the 13:15->14:30 churn is negligible, the earlier cutoff is safe and
phase 2 can run 75 minutes sooner. If not, 2:30 stays - for a REASON this time, not by inheritance.

Env: IRT_SEASONS
"""
import json
import os
import urllib.request
from collections import defaultdict
from datetime import timezone, timedelta

import pandas as pd

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
PT = timezone(timedelta(hours=-8))          # PST; the season runs Oct-Apr, mostly PST
REAL = {"OUT", "DOUBTFUL", "QUESTIONABLE", "PROBABLE", "AVAILABLE"}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    seasons = [s.strip() for s in os.environ.get("IRT_SEASONS", "2024-25,2025-26").split(",")]
    for season in seasons:
        slug = season.replace("-", "_")
        idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
        rows = []
        for sh in idx.get("shards", []):
            try:
                rows.extend(fetch(f"nba_injury_report_{slug}_{sh}.json").get("rows") or [])
            except Exception:  # noqa: BLE001
                pass
        d = pd.DataFrame(rows)
        if d.empty:
            print(f"{season}: no rows"); continue
        d["snapshot_ts"] = pd.to_datetime(d["snapshot_ts"], errors="coerce", utc=True)
        d["game_date"] = pd.to_datetime(d["game_date"], errors="coerce").dt.date
        d["status_u"] = d["status"].astype(str).str.upper().str.strip()
        d = d[d["snapshot_ts"].notna() & d["game_date"].notna() & d["matchup"].notna()]
        # snapshot time expressed as HOURS PT on the game date
        local = d["snapshot_ts"].dt.tz_convert(PT)
        d["snap_h"] = local.dt.hour + local.dt.minute / 60.0
        d["snap_date"] = local.dt.date
        d = d[d["snap_date"] == d["game_date"]]          # game-day snapshots only
        d["real"] = d["status_u"].isin(REAL)
        print(f"\n=== {season}: {len(d):,} game-day snapshot rows, "
              f"{d['game_date'].nunique()} dates, {d['matchup'].nunique()} matchups", flush=True)

        # 1) first snapshot hour at which each GAME has a real filed status
        filed = d[d["real"]].groupby(["game_date", "matchup"])["snap_h"].min()
        print(f"\n  EARLIEST REAL FILING per game (hours PT):")
        for q in (0.50, 0.75, 0.90, 0.95, 0.99, 1.00):
            print(f"    p{int(q*100):<3} {filed.quantile(q):>6.2f}  ({int(filed.quantile(q))}:"
                  f"{int((filed.quantile(q)%1)*60):02d} PT)", flush=True)

        # 2) coverage at candidate cutoffs
        total = len(filed)
        print(f"\n  GAME COVERAGE BY CUTOFF (of {total:,} game-days):")
        for cut in (10.0, 11.0, 12.0, 13.0, 13.25, 14.0, 14.5, 15.0):
            n = int((filed <= cut).sum())
            print(f"    {int(cut)}:{int((cut%1)*60):02d} PT   {n:>6,} / {total:,}   {n/total:>6.2%}", flush=True)

        # 3) churn between 13:15 and 14:30 - what an earlier cutoff gives up
        last_by = {}
        for cut in (13.25, 14.5):
            sub = d[d["snap_h"] <= cut].sort_values("snapshot_ts")
            last_by[cut] = sub.groupby(["game_date", "player_name"])["status_u"].last()
        a, b = last_by[13.25], last_by[14.5]
        common = a.index.intersection(b.index)
        changed = int((a.loc[common] != b.loc[common]).sum())
        only_late = len(b.index.difference(a.index))
        print(f"\n  CHURN 13:15 PT -> 14:30 PT:")
        print(f"    players present at both cutoffs: {len(common):,}")
        print(f"    STATUS CHANGED in that window:   {changed:,}  ({changed/max(len(common),1):.3%})")
        print(f"    players appearing ONLY after 13:15: {only_late:,}", flush=True)


if __name__ == "__main__":
    main()
