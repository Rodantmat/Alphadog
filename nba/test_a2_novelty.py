#!/usr/bin/env python3
"""
A2 SHARPENED — NOVELTY-WEIGHTED absence redistribution.

WHY THE FLAT FACTOR FAILED. Applied to every absence game, A2 made the certified baseline WORSE
(0.7206 -> 0.9231 log-loss on the 13,319 legs where it fires), even when applied correctly at the
minutes component rather than scaled onto the mean. The reason is not the operation - it is DOUBLE
COUNTING THROUGH RECENT FORM:

    the baseline's proj_min is built from the as-of roster state and recent minutes. If a star has
    been out for the last five games, his teammates' recent minutes are ALREADY elevated, so the
    baseline has priced the absence. A2 then adds another ~30% on top.

    But if the star PLAYED all five recent games and is out tonight, nothing is priced in, and the
    full redistribution is genuinely new information.

THE SHARPENING. Weight the factor by how NEW the absence is:

    novelty(player, absent X) = share of the player's last N games in which X PLAYED
        X played all N   -> novelty 1.0 -> apply A2 in full (nothing priced in)
        X missed all N   -> novelty 0.0 -> apply nothing    (fully priced in)
        mixed            -> partial

    min_mult_eff = 1 + novelty x (min_mult - 1)

This is the same principle that governs the whole enrichment layer: carry only what the baseline could
not already know. A long-running absence is knowable from recent form; tonight's new scratch is not.

ARMS (leg-level, real PrizePicks lines):
    A   anchor alone
    F   flat A2 on minutes            (what failed)
    N   NOVELTY-WEIGHTED A2 on minutes
and the same three restricted to HIGH-NOVELTY legs (novelty >= 0.8), where the factor should do its work.

Env: DATABASE_URL, NV_SEASON, NV_LOOKBACK (default 10), NV_SAMPLE_DATES
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict, deque

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


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def main():
    season = os.environ.get("NV_SEASON", "2025-26")
    look = int(os.environ.get("NV_LOOKBACK", "10"))
    sample = int(os.environ.get("NV_SAMPLE_DATES", "0"))
    slug = season.replace("-", "_")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    b = pd.read_sql("""SELECT game_date, player_id, anchor, proj_min, rate36
                       FROM nba_score.baseline_history
                       WHERE season=%s AND prop='points' AND ladder_offset=0
                         AND proj_min IS NOT NULL""", conn, params=(season,))
    b["game_date"] = pd.to_datetime(b["game_date"]).dt.date
    b["player_id"] = b["player_id"].astype(str)
    b = b.drop_duplicates(subset=["game_date", "player_id"])

    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs = logs.sort_values("GAME_DATE")

    idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
    irows = []
    for sh in idx.get("shards", []):
        try:
            irows.extend(fetch(f"nba_injury_report_{slug}_{sh}.json").get("rows") or [])
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

    # walk forward keeping each team's recent participation, to measure novelty as-of
    recent = defaultdict(lambda: deque(maxlen=look))      # player -> deque of 1/0 (played)
    last_team = {}
    rows = []
    for gd in sorted(logs["GAME_DATE"].unique()):
        day = logs[logs["GAME_DATE"] == gd]
        played = set(day["PLAYER_ID"])
        ruled = out_by_day.get(gd, set())
        for gid, gdf in day.groupby("GAME_ID"):
            for t, tdf in gdf.groupby("TEAM"):
                outs = [p for p in ruled if p not in played and last_team.get(p) == t and recent.get(p)]
                if not outs:
                    continue
                # novelty: share of the lookback in which the absent set PLAYED
                nov = []
                for p in outs:
                    r = recent.get(p)
                    nov.append(sum(r) / len(r) if r else 1.0)
                novelty = float(np.mean(nov)) if nov else 0.0
                for r in tdf.itertuples(index=False):
                    rows.append({"GAME_DATE": gd, "GAME_ID": gid, "PLAYER_ID": r.PLAYER_ID,
                                 "novelty": novelty, "n_out": len(outs)})
        for r in day.itertuples(index=False):
            last_team[r.PLAYER_ID] = r.TEAM
        # mark participation for everyone on a team that played today
        teams_today = set(day["TEAM"])
        for p, t in last_team.items():
            if t in teams_today:
                recent[p].append(1 if p in played else 0)

    nv = pd.DataFrame(rows)
    print(f"novelty rows: {len(nv):,} | mean novelty {nv['novelty'].mean():.3f} | "
          f"share fully new (>=0.8) {(nv['novelty']>=0.8).mean():.1%}", flush=True)

    fac = pd.read_sql("""SELECT game_id, player_id, min_mult FROM nba_score.redistribution_factors
                         WHERE season=%s""", conn, params=(season,))
    fac["player_id"] = fac["player_id"].astype(str)

    d = logs.merge(b, left_on=["GAME_DATE", "PLAYER_ID"], right_on=["game_date", "player_id"], how="inner") \
            .merge(fac, left_on=["GAME_ID", "PLAYER_ID"], right_on=["game_id", "player_id"], how="left") \
            .merge(nv, on=["GAME_DATE", "GAME_ID", "PLAYER_ID"], how="left")
    d["min_mult"] = d["min_mult"].fillna(1.0)
    d["novelty"] = d["novelty"].fillna(0.0)
    d = d[(d["proj_min"] > 0) & d["anchor"].notna()].sort_values("GAME_DATE")
    if sample:
        keep = sorted(d["GAME_DATE"].unique())[:sample]
        d = d[d["GAME_DATE"].isin(keep)]

    d["A"] = d["anchor"]
    d["F"] = d["proj_min"] * d["min_mult"] * d["rate36"] / 36.0
    eff = 1.0 + d["novelty"] * (d["min_mult"] - 1.0)
    d["N"] = d["proj_min"] * eff * d["rate36"] / 36.0

    # ARM S - SHRUNK: refit the magnitude against the BASELINE'S OWN RESIDUAL.
    # A2's multiplier was fitted to explain minutes against a rolling mean. The baseline's proj_min is
    # far better than a rolling mean and already anticipates rotation, so the residual A2 should correct
    # is much smaller than the multiplier it fitted. The enrichment question is not "how do 240 minutes
    # divide" (the baseline's job) but "given the baseline already projects N minutes tonight, how much
    # does a NEW absence add on top of that?". Fit on the first half, apply to the second.
    fit = d[(d["proj_min"] > 8) & (d["MIN"] > 0) & (eff != 1.0)].copy()
    fit["x"] = np.log(np.clip(1.0 + fit["novelty"] * (fit["min_mult"] - 1.0), 0.5, 2.5))
    fit["y"] = np.log(np.clip(fit["MIN"] / fit["proj_min"], 0.3, 3.0))
    h = len(fit) // 2
    if h > 500:
        a = fit.iloc[:h]
        beta_s = float(np.linalg.lstsq(np.column_stack([np.ones(len(a)), a["x"]]), a["y"], rcond=None)[0][1])
    else:
        beta_s = 1.0
    print(f"\nSHRINK FIT: the baseline's minutes residual moves {beta_s:.3f} for every 1.0 of A2's "
          f"claimed log-lift (1.0 would mean A2 is exactly right; <1 means it overstates)", flush=True)
    d["S"] = d["proj_min"] * np.power(np.clip(eff, 0.5, 2.5), beta_s) * d["rate36"] / 36.0

    board = pd.read_sql("""SELECT game_date, player, line FROM nba_market.board_snapshots
                           WHERE bookmaker='prizepicks' AND snapshot_label='window'
                             AND market_key='player_points' AND side='Over'""", conn)
    conn.close()
    board["game_date"] = pd.to_datetime(board["game_date"]).dt.date
    board["player_id"] = board["player"].map(norm_name).map(pid_map)
    m = board[board["player_id"].notna()].merge(
        d[["GAME_DATE", "PLAYER_ID", "PTS", "A", "F", "N", "min_mult", "novelty"]],
        left_on=["game_date", "player_id"], right_on=["GAME_DATE", "PLAYER_ID"], how="inner")
    if len(m) < 500:
        print(f"only {len(m)} legs matched", flush=True)
        return
    sd = float(np.std(d["PTS"] - d["A"]))

    def score(frame, tag):
        p = np.clip(1 - sps.norm.cdf((frame["line"].astype(float) - frame[tag]) / max(sd, 1e-6)), 1e-4, 1 - 1e-4)
        h = (frame["PTS"] > frame["line"].astype(float)).astype(int)
        return float(-np.mean(h * np.log(p) + (1 - h) * np.log(1 - p))), float(np.mean((p - h) ** 2))

    print(f"\nALL {len(m):,} legs")
    for tag, name in (("A", "anchor"), ("F", "flat A2"), ("N", "NOVELTY-WEIGHTED A2")):
        ll, br = score(m, tag)
        print(f"  {name:<24} log-loss {ll:.4f}  Brier {br:.4f}", flush=True)

    hi = m[(m["min_mult"] != 1.0) & (m["novelty"] >= 0.8)]
    if len(hi) > 300:
        print(f"\nHIGH-NOVELTY legs ({len(hi):,}) - the absence is genuinely new information:")
        for tag, name in (("A", "anchor"), ("F", "flat A2"), ("N", "NOVELTY-WEIGHTED A2")):
            ll, br = score(hi, tag)
            print(f"  {name:<24} log-loss {ll:.4f}  Brier {br:.4f}", flush=True)
    lo = m[(m["min_mult"] != 1.0) & (m["novelty"] < 0.3)]
    if len(lo) > 300:
        print(f"\nLOW-NOVELTY legs ({len(lo):,}) - already priced into recent form:")
        for tag, name in (("A", "anchor"), ("F", "flat A2")):
            ll, br = score(lo, tag)
            print(f"  {name:<24} log-loss {ll:.4f}  Brier {br:.4f}", flush=True)


if __name__ == "__main__":
    main()
