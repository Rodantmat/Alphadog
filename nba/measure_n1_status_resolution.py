#!/usr/bin/env python3
"""
FACTOR N1 — P(plays | status) MEASURED FROM OUR OWN ARCHIVE, at the 2:30 PM PT decision cutoff.

WHY THIS IS LOAD-BEARING (not optional):
  A2 was fitted and validated using WHO ACTUALLY PLAYED - post-game truth. At the 2:30 PM window the
  engine will not have that; it will have the day-of report, where Questionable is a coin flip. So A2's
  measured value (+0.347 MAE on PRA) is an upper bound on its live value. To close that gap the
  allocator's absence input must be an EXPECTED absence weight, not a binary, and that weight is
  P(plays | status, reason, team) measured as-of.

LEAGUE-DEFINED vs MEASURED:
  The NBA's Dec-2025 reporting overhaul fixes nominal probabilities - Available 100%, Probable 75%,
  Questionable 50%, Doubtful 25%, Out 0% - and warns teams that persistently mislabelling will be
  reviewed. Those are the values teams are INSTRUCTED to convey; the realized rates differ by team,
  reason class and time of day, which is exactly what we measure here. The overhaul also introduced the
  explicit "AVAILABLE" status mid-season, so the parser and this measurement must handle it.

METHOD
  status_asof = the latest report published at or before 2:30 PM PT on the game date (nba_asof rules),
  joined to the box score for that game: played = the player has a log row with MIN > 0.
  Reported by status, by reason class, and by team, with sample sizes, for both seasons separately so
  the two-season sign rule can be applied.

Env: N1_SEASONS
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
CUTOFF_HOUR_PT = 14
CUTOFF_MIN_PT = 30


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def main():
    for season in [s.strip() for s in os.environ.get("N1_SEASONS", "2024-25,2025-26").split(",")]:
        slug = season.replace("-", "_")
        logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
        logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
        played = {(r.GAME_DATE, r.PLAYER_ID): float(r.MIN) for r in logs.itertuples(index=False)}

        idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
        rows = []
        for shard in idx.get("shards", []):
            try:
                rows.extend(fetch(f"nba_injury_report_{slug}_{shard}.json").get("rows") or [])
            except Exception as exc:  # noqa: BLE001
                print(f"  shard {shard}: {exc}", flush=True)
        inj = pd.DataFrame(rows)
        inj["game_date"] = pd.to_datetime(inj["game_date"], errors="coerce").dt.date
        inj["snapshot_ts"] = pd.to_datetime(inj["snapshot_ts"], errors="coerce", utc=True)
        inj["nm"] = inj["player_name"].map(flip_last_first)
        inj["status_u"] = inj["status"].astype(str).str.upper().str.strip()

        # the report AS OF 2:30 PM PT on the game date (21:30 UTC in PST, 22:30 in PDT - use 21:30 as the
        # conservative cutoff so we never read a report published after the decision moment)
        inj["cutoff"] = pd.to_datetime(inj["game_date"].astype(str)) .dt.tz_localize("UTC") + pd.Timedelta(hours=22, minutes=30)
        asof = inj[inj["snapshot_ts"] <= inj["cutoff"]].sort_values("snapshot_ts")
        latest = asof.groupby(["game_date", "nm"]).tail(1)
        print(f"\n=== {season}: {len(inj):,} report rows -> {len(latest):,} as-of 2:30 PM PT decisions", flush=True)

        pid_map = {}
        allp = fetch("nba_all_players.json")
        for x in allp.get("records") or []:
            pid_map[norm_name(x.get("DISPLAY_FIRST_LAST"))] = str(x.get("PERSON_ID"))
        latest = latest.copy()
        latest["pid"] = latest["nm"].map(pid_map)
        latest = latest[latest["pid"].notna()]
        latest["played"] = [1 if played.get((d, p), 0) > 0 else 0
                            for d, p in zip(latest["game_date"], latest["pid"])]

        by_status = latest.groupby("status_u")["played"].agg(["count", "mean"]).sort_values("count", ascending=False)
        by_status = by_status[by_status["count"] >= 50]
        print(f"{'status':<22}{'n':>8}{'P(plays)':>11}   league-defined")
        league = {"AVAILABLE": 1.00, "PROBABLE": 0.75, "QUESTIONABLE": 0.50, "DOUBTFUL": 0.25, "OUT": 0.00}
        for st, r in by_status.iterrows():
            ld = league.get(st)
            print(f"{st[:22]:<22}{int(r['count']):>8,}{r['mean']:>11.3f}   {ld if ld is not None else '-'}")

        q = latest[latest["status_u"] == "QUESTIONABLE"]
        # GROUNDING CHECK: P(plays) here is P(MIN > 0), which for fringe players conflates "was
        # available" with "was used". A rotation player listed AVAILABLE should be ~1.0; a deep-bench
        # or two-way player can be available and still DNP-CD. Split by the player's own as-of minutes
        # so the status probabilities are not distorted by roster role.
        base_min = logs.sort_values("GAME_DATE").groupby("PLAYER_ID")["MIN"].apply(
            lambda s: s.shift(1).rolling(10, min_periods=3).mean())
        logs2 = logs.assign(base_min=base_min.values)
        bm = {(r.GAME_DATE, r.PLAYER_ID): r.base_min for r in logs2.itertuples(index=False)}
        latest["base_min"] = [bm.get((d, p), np.nan) for d, p in zip(latest["game_date"], latest["pid"])]
        rot = latest[latest["base_min"] >= 15]
        print(f"\n  ROTATION PLAYERS ONLY (as-of baseline >= 15 min) - the population the allocator cares about:")
        rs = rot.groupby("status_u")["played"].agg(["count", "mean"])
        for st, r in rs[rs["count"] >= 30].sort_values("count", ascending=False).iterrows():
            print(f"    {st[:22]:<22}{int(r['count']):>7,}{r['mean']:>9.3f}")
        fringe = latest[latest["base_min"] < 15]
        fs = fringe.groupby("status_u")["played"].agg(["count", "mean"])
        print(f"  FRINGE / DEEP BENCH (< 15 min):")
        for st, r in fs[fs["count"] >= 30].sort_values("count", ascending=False).iterrows():
            print(f"    {st[:22]:<22}{int(r['count']):>7,}{r['mean']:>9.3f}")

        if len(q) > 200:
            rc = q.groupby("reason_class")["played"].agg(["count", "mean"])
            rc = rc[rc["count"] >= 40].sort_values("mean")
            print(f"\n  QUESTIONABLE by reason class (n>=40):")
            for k, r in rc.iterrows():
                print(f"    {str(k)[:34]:<34}{int(r['count']):>7,}{r['mean']:>9.3f}")
            tm = q.groupby("team")["played"].agg(["count", "mean"])
            tm = tm[tm["count"] >= 30].sort_values("mean")
            print(f"\n  QUESTIONABLE by team - most pessimistic and most optimistic (n>=30):")
            for k, r in pd.concat([tm.head(4), tm.tail(4)]).iterrows():
                print(f"    {str(k)[:30]:<30}{int(r['count']):>7,}{r['mean']:>9.3f}")


if __name__ == "__main__":
    main()
