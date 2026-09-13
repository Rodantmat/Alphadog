#!/usr/bin/env python3
"""
FACTOR A5 — PROJECTED LINEUPS, as-of the 2:30 PM PT window.

WHY IT MUST BE DERIVED: the NBA does not require starting lineups to be submitted before tip; they are
announced ~30 minutes out, AFTER our window. Commercial "projected lineups" are human-curated
subscription products. So the engine has to predict the starting five itself, and box-score
`starter_status` is post-tip TRUTH - the evaluation target, never an input (parity doc, leak risk #1).

THE PROXY (as-of, no future information):
    projected starters = the most recent game's starters for that team, MINUS anyone ruled out at the
    window, PLUS the highest-as-of-minutes available replacement at that slot.

TWO TESTS, both needed:
  1. ACCURACY  - how often does the proxy match the actual starting five? (per player, and all-5)
  2. INCREMENTAL VALUE - and this is the one that decides whether A5 ships. The allocator already uses
     recent-5 minutes, which largely ENCODES who starts. If adding an explicit starter flag does not
     improve held-out prop prediction beyond the allocator, A5 is redundant and must not ship, however
     accurate the proxy is. Same discipline that rejected the rate response and B4.

Env: DATABASE_URL, A5_SEASONS, A5_SAMPLE_DATES
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
PROPS = {"points": "PTS", "rebounds": "REB", "assists": "AST", "pra": ("PTS", "REB", "AST")}


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
    season = os.environ.get("A5_SEASONS", "2025-26").split(",")[0].strip()
    sample = int(os.environ.get("A5_SAMPLE_DATES", "0"))
    slug = season.replace("-", "_")
    conn = psycopg.connect(os.environ["DATABASE_URL"])

    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs["PRA"] = logs["PTS"].fillna(0) + logs["REB"].fillna(0) + logs["AST"].fillna(0)
    logs = logs.sort_values("GAME_DATE")

    # actual starters - the TARGET, from the starters archive (post-tip truth)
    try:
        st = pd.DataFrame(fetch(f"nba_starters_{slug}.json")["records"])
        st["GAME_ID"] = st["GAME_ID"].astype(str)
        st["PLAYER_ID"] = st["PLAYER_ID"].astype(str)
        actual = {(r.GAME_ID, r.PLAYER_ID) for r in st.itertuples(index=False)}
        print(f"starters archive: {len(st):,} rows", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"starters archive unavailable ({str(exc)[:60]}) - cannot grade A5 accuracy", flush=True)
        actual = None

    idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
    irows = []
    for shard in idx.get("shards", []):
        try:
            irows.extend(fetch(f"nba_injury_report_{slug}_{shard}.json").get("rows") or [])
        except Exception:  # noqa: BLE001
            pass
    inj = pd.DataFrame(irows)
    inj["game_date"] = pd.to_datetime(inj["game_date"], errors="coerce").dt.date
    inj["nm"] = inj["player_name"].map(flip_last_first)
    inj["status_u"] = inj["status"].astype(str).str.upper().str.strip()
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}
    out_by_day = {d: {pid_map.get(r.nm) for r in g.itertuples(index=False)
                      if r.status_u in ("OUT", "DOUBTFUL") and pid_map.get(r.nm)}
                  for d, g in inj.groupby("game_date")}

    last_starters = {}           # team -> list of player_ids from their most recent game
    hist = defaultdict(lambda: [0.0, 0])
    rows = []
    dates = sorted(logs["GAME_DATE"].unique())
    if sample:
        dates = dates[:sample]
    for gd in dates:
        day = logs[logs["GAME_DATE"] == gd]
        ruled = out_by_day.get(gd, set())
        for gid, gdf in day.groupby("GAME_ID"):
            for t, tdf in gdf.groupby("TEAM"):
                prev = last_starters.get(t)
                if not prev:
                    continue
                avail = {r.PLAYER_ID for r in tdf.itertuples(index=False)}
                proj = [p for p in prev if p not in ruled and p in avail]
                # fill the vacated slots with the highest as-of minutes available non-starter
                pool = sorted((p for p in avail if p not in proj),
                              key=lambda p: (hist[p][0] / hist[p][1]) if hist[p][1] else 0, reverse=True)
                proj = proj + pool[: max(0, 5 - len(proj))]
                projected = set(proj[:5])
                for r in tdf.itertuples(index=False):
                    h = hist.get(r.PLAYER_ID, [0.0, 0])
                    rows.append({"GAME_DATE": gd, "GAME_ID": gid, "TEAM": t, "PLAYER_ID": r.PLAYER_ID,
                                 "proj_start": int(r.PLAYER_ID in projected),
                                 "act_start": int((gid, r.PLAYER_ID) in actual) if actual else np.nan,
                                 "MIN": float(r.MIN), "base_min": (h[0] / h[1]) if h[1] else np.nan,
                                 "PTS": float(r.PTS), "REB": float(r.REB), "AST": float(r.AST), "PRA": float(r.PRA)})
        for gid, gdf in day.groupby("GAME_ID"):
            for t, tdf in gdf.groupby("TEAM"):
                if actual:
                    s = [r.PLAYER_ID for r in tdf.itertuples(index=False) if (gid, r.PLAYER_ID) in actual]
                    if len(s) == 5:
                        last_starters[t] = s
                else:
                    last_starters[t] = list(tdf.nlargest(5, "MIN")["PLAYER_ID"])
        for r in day.itertuples(index=False):
            h = hist[r.PLAYER_ID]
            h[0] += float(r.MIN); h[1] += 1

    d = pd.DataFrame(rows)
    d = d[d["base_min"].notna()]
    print(f"\n{season}: {len(d):,} player-games scored", flush=True)

    if actual and d["act_start"].notna().any():
        tp = int(((d["proj_start"] == 1) & (d["act_start"] == 1)).sum())
        fp = int(((d["proj_start"] == 1) & (d["act_start"] == 0)).sum())
        fn = int(((d["proj_start"] == 0) & (d["act_start"] == 1)).sum())
        print(f"  A5 accuracy: precision {tp/(tp+fp):.3f} | recall {tp/(tp+fn):.3f} | "
              f"correct starter picks {tp:,} of {tp+fn:,}", flush=True)
        allfive = d.groupby(["GAME_ID", "TEAM"]).apply(
            lambda g: int((g["proj_start"] == g["act_start"]).all()), include_groups=False)
        print(f"  all-5 exactly right: {allfive.mean():.1%} of team-games", flush=True)

    # INCREMENTAL VALUE over the allocator's minutes basis
    print("\n  incremental value over a minutes-only projection (the gate that decides A5):")
    for prop, col in (("points", "PTS"), ("rebounds", "REB"), ("assists", "AST"), ("pra", "PRA")):
        x = d.sort_values("GAME_DATE").copy()
        x["per36"] = np.where(x["MIN"] > 0, x[col] / x["MIN"] * 36, np.nan)
        x["rate"] = x.groupby("PLAYER_ID")["per36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
        x = x[x["rate"].notna() & (x["base_min"] >= 6)]
        if len(x) < 2000:
            continue
        base = x["base_min"] * x["rate"] / 36
        # starter flag as a minutes multiplier fitted on the first half, applied to the second
        half = len(x) // 2
        tr, te = x.iloc[:half], x.iloc[half:]
        lift = (tr[tr["proj_start"] == 1]["MIN"].mean() / tr[tr["proj_start"] == 1]["base_min"].mean(),
                tr[tr["proj_start"] == 0]["MIN"].mean() / tr[tr["proj_start"] == 0]["base_min"].mean())
        adj = np.where(te["proj_start"] == 1, lift[0], lift[1])
        m0 = np.abs(te["base_min"] * te["rate"] / 36 - te[col]).mean()
        m1 = np.abs(te["base_min"] * adj * te["rate"] / 36 - te[col]).mean()
        print(f"    {prop:<10} n={len(te):>6,}  minutes-only {m0:.3f} | +A5 {m1:.3f} | "
              f"gain {m0-m1:+.3f}   {'WIRE IN' if m0-m1 > 0.002 else 'REDUNDANT'}")
    conn.close()


if __name__ == "__main__":
    main()
