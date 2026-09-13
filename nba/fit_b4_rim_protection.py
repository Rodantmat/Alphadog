#!/usr/bin/env python3
"""
B4 SUB-CASE — BLOCKS-AGAINST VULNERABILITY (rim protection specifically).

WHY THIS ONE IS WORTH TESTING AFTER B4 FAILED TWICE: B4 v1 used opponent vacated MINUTES and v2 used the
average expected defender quality. Both are AGGREGATES, and aggregates wash out the one absence that
plausibly matters most - the rim protector. Research (Rim Deterrence work) is explicit that rim
protection is largely DETERRENCE: shots never attempted, which block counts miss and which no average of
defender quality captures. Losing a 2.5-blocks-per-game center changes the geometry of the paint in a way
that losing a backup wing does not.

FEATURE (as-of, scoped to tonight's opponent):
    rim_out = the opponent's ABSENT players' as-of blocks-per-36 x their as-of minutes, summed
              -> "how much shot-deterrence is missing from the paint tonight"
    normalised by the league median so the feature is comparable across teams.
Tested against the props where paint geometry should matter most: FGA, FGM, points, FTA (drives draw
fouls), and pra. If rim protection is a real same-day factor, it shows up HERE or nowhere.

Gated exactly like every other factor: fit on train, keep only props whose HELD-OUT MAE improves.
Sanity gate: if the feature is degenerate, verdicts are suppressed rather than graded.

Env: DATABASE_URL, RIM_TRAIN_SEASON, RIM_TEST_SEASON, RIM_SAMPLE_DATES
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
TARGETS = {"fga": "FGA", "fgm": "FGM", "points": "PTS", "fta": "FTA", "pra": "PRA"}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def build(season, sample, nm_to_id):
    slug = season.replace("-", "_")
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs["PRA"] = logs["PTS"].fillna(0) + logs["REB"].fillna(0) + logs["AST"].fillna(0)
    logs = logs.sort_values("GAME_DATE")

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
    out_by_day = {d: {nm_to_id.get(r.nm) for r in g.itertuples(index=False)
                      if r.status_u in ("OUT", "DOUBTFUL") and nm_to_id.get(r.nm)}
                  for d, g in inj.groupby("game_date")}

    blk = defaultdict(lambda: [0.0, 0.0, 0])     # pid -> [blocks, minutes, games]
    last_team = {}
    rows = []
    dates = sorted(logs["GAME_DATE"].unique())
    if sample:
        dates = dates[:sample]
    for gd in dates:
        day = logs[logs["GAME_DATE"] == gd]
        played = set(day["PLAYER_ID"])
        ruled = out_by_day.get(gd, set())
        for gid, gdf in day.groupby("GAME_ID"):
            teams = list(gdf["TEAM"].unique())
            if len(teams) != 2:
                continue
            for t in teams:
                opp = [x for x in teams if x != t][0]
                # deterrence missing from the OPPONENT's paint tonight
                rim_out = 0.0
                for pid in ruled:
                    if pid in played or last_team.get(pid) != opp:
                        continue
                    b = blk.get(pid)
                    if not b or b[2] < 5 or b[1] <= 0:
                        continue
                    blk36 = b[0] / b[1] * 36.0
                    mpg = b[1] / b[2]
                    if blk36 < 0.5:                 # not a rim protector - this factor is about the paint
                        continue
                    rim_out += blk36 * (mpg / 36.0)
                for r in gdf[gdf["TEAM"] == t].itertuples(index=False):
                    b = blk.get(r.PLAYER_ID)
                    if not b or b[2] < 3:
                        continue
                    rows.append({"GAME_DATE": gd, "GAME_ID": gid, "PLAYER_ID": r.PLAYER_ID,
                                 "rim_out": rim_out, "base_min": b[1] / b[2], "MIN": float(r.MIN),
                                 **{c: float(getattr(r, c)) for c in ("FGA", "FGM", "PTS", "FTA", "PRA")}})
        for r in day.itertuples(index=False):
            last_team[r.PLAYER_ID] = r.TEAM
            b = blk[r.PLAYER_ID]
            b[0] += float(r.BLK or 0); b[1] += float(r.MIN); b[2] += 1
    return pd.DataFrame(rows)


def main():
    tr_s = os.environ.get("RIM_TRAIN_SEASON", "2024-25")
    te_s = os.environ.get("RIM_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("RIM_SAMPLE_DATES", "0"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    nm_to_id = dict(pd.read_sql("SELECT norm_name, player_id FROM nba_ref.player_name_map", conn).values)
    conn.close()
    tr, te = build(tr_s, sample, nm_to_id), build(te_s, sample, nm_to_id)
    if tr.empty or te.empty:
        print("no data")
        return
    share = float((te["rim_out"] > 0).mean())
    print(f"train {len(tr):,} | test {len(te):,} | games with rim protection missing: {share:.1%} | "
          f"mean rim_out when present {te[te['rim_out']>0]['rim_out'].mean():.3f} | sd {te['rim_out'].std():.3f}", flush=True)
    if share < 0.03 or te["rim_out"].std() < 0.01 or len(te) < 3000:
        print("FEATURE FAILS SANITY GATE - verdicts suppressed", flush=True)
        return

    print(f"\n{'prop':<10}{'n':>8}{'MAE base':>10}{'MAE +rim':>10}{'gain':>9}   verdict")
    kept = []
    for prop, col in TARGETS.items():
        out = {}
        for tag, d in (("tr", tr), ("te", te)):
            x = d.sort_values("GAME_DATE").copy()
            x["per36"] = np.where(x["MIN"] > 0, x[col] / x["MIN"] * 36, np.nan)
            x["rate"] = x.groupby("PLAYER_ID")["per36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
            x = x[x["rate"].notna() & (x["base_min"] >= 8)]
            x["pred"] = x["base_min"] * x["rate"] / 36
            out[tag] = x[x["pred"] > 0]
        a, b = out["tr"], out["te"]
        if len(a) < 1500 or len(b) < 800:
            continue
        X = np.column_stack([np.ones(len(a)), a["rim_out"]])
        y = np.log((a[col].clip(lower=0.5) / a["pred"].clip(lower=0.5)).clip(0.3, 3.0))
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        adj = np.exp(beta[1] * b["rim_out"])
        m0 = np.abs(b["pred"] - b[col]).mean()
        m1 = np.abs(b["pred"] * adj - b[col]).mean()
        ok = m0 - m1 > 0.002
        if ok:
            kept.append(prop)
        print(f"{prop:<10}{len(b):>8,}{m0:>10.3f}{m1:>10.3f}{m0-m1:>+9.3f}   "
              f"{'WIRE IN' if ok else 'skip'}  (beta {beta[1]:+.4f})")
    print(f"\nrim-protection factor helps on {len(kept)} props: {', '.join(sorted(kept)) if kept else '(none)'}", flush=True)


if __name__ == "__main__":
    main()
