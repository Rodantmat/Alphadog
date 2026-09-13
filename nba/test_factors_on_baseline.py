#!/usr/bin/env python3
"""
INTEGRATION TEST — factors on top of the CERTIFIED BASELINE, not beside it.

THE MISTAKE THIS FIXES: the funnel test rebuilt a projection from rolling means (b_min, b_fga, b_3pct...)
and then added factors. That beat a naive baseline, but it BYPASSED the certified recipe - which already
carries, derived in-run from TRAIN with no pasted constants:
    * role tiers and the coach rotation gate
    * a P(blowout | spread) MIXTURE with role-specific blowout minutes ratios
    * pace, opponent profile, DvP
    * hierarchical rate cells, dispersion, and per-rung Platt calibration
Adding a crude deterministic blowout shrink on top of a rolling mean made things WORSE precisely because
it double-counted a cruder duplicate of a component the baseline models properly.

`nba_score.baseline_history.anchor` IS the recipe's projected mean for that player-prop-day. So the
correct integration is:

    projection = anchor  x  A2 minutes multiplier  x  exp(defender efficiency terms)

where ONLY factors the baseline structurally cannot see are applied on top:
    A2  - same-day absence reallocation of a fixed 240 minutes  (baseline cannot know today's report)
    def - the specific defender this player will face           (baseline carries TEAM-level defence)
and blowout/pace/role are NOT re-applied, because they are already inside the anchor.

FOUR ARMS, graded at the LEG LEVEL on real PrizePicks lines (log-loss / Brier), plus mean MAE:
    A  anchor alone                          (the certified baseline)
    B  anchor x A2
    C  anchor x defender
    D  anchor x A2 x defender
Whichever wins is what the engine ships.

Env: DATABASE_URL, IT_SEASON, IT_SAMPLE_DATES
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
    season = os.environ.get("IT_SEASON", "2025-26")
    sample = int(os.environ.get("IT_SAMPLE_DATES", "0"))
    slug = season.replace("-", "_")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    # the certified baseline's projected mean per player-game (anchor at offset 0)
    anc = pd.read_sql("""SELECT game_date, game_id, player_id, anchor
                         FROM nba_score.baseline_history
                         WHERE season=%s AND prop='points' AND ladder_offset=0""", conn, params=(season,))
    anc["game_date"] = pd.to_datetime(anc["game_date"]).dt.date
    anc["player_id"] = anc["player_id"].astype(str)
    anc = anc.drop_duplicates(subset=["game_date", "player_id"])
    print(f"baseline anchors: {len(anc):,}", flush=True)

    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    d = logs.merge(anc, left_on=["GAME_DATE", "PLAYER_ID"], right_on=["game_date", "player_id"], how="inner")

    fac = pd.read_sql("""SELECT game_id, player_id, min_mult, n_out
                         FROM nba_score.redistribution_factors WHERE season=%s""", conn, params=(season,))
    fac["player_id"] = fac["player_id"].astype(str)
    d = d.merge(fac, left_on=["GAME_ID", "PLAYER_ID"], right_on=["game_id", "player_id"], how="left", suffixes=("", "_f"))

    # expected defender, scoped to tonight's opponent, as-of
    dr = pd.read_sql("""SELECT as_of_date, player_id, channel, shrunk_rating
                        FROM nba_ref.defender_ratings WHERE season=%s AND channel IN ('def_pts','def_fg')""",
                     conn, params=(season,))
    dr["as_of_date"] = pd.to_datetime(dr["as_of_date"]).dt.date
    dr["player_id"] = dr["player_id"].astype(str)
    asofs = sorted(dr["as_of_date"].unique())
    by_asof = {a: {c: dict(zip(gg["player_id"], gg["shrunk_rating"])) for c, gg in g.groupby("channel")}
               for a, g in dr.groupby("as_of_date")}

    idx = fetch(f"nba_matchups_pergame_{slug}_index.json", timeout=120)
    frames = []
    for sh in (idx.get("meta") or idx).get("shards") or []:
        try:
            m0 = fetch(f"nba_matchups_pergame_{slug}_{sh}.json")
            f = pd.DataFrame(m0["rows"], columns=m0["columns"])
            frames.append(f[["GAME_DATE", "personIdDef", "personIdOff", "partialPossessions"]])
        except Exception:  # noqa: BLE001
            pass
    m = pd.concat(frames, ignore_index=True)
    m["GAME_DATE"] = pd.to_datetime(m["GAME_DATE"]).dt.date
    m["personIdDef"] = m["personIdDef"].astype(str)
    m["personIdOff"] = m["personIdOff"].astype(str)
    m["partialPossessions"] = pd.to_numeric(m["partialPossessions"], errors="coerce").fillna(0.0)
    mg = {dd: g for dd, g in m.groupby("GAME_DATE")}

    roster = logs.groupby(["GAME_ID", "TEAM"])["PLAYER_ID"].apply(set).to_dict()
    teams_of = defaultdict(list)
    for (gid, t) in roster:
        teams_of[gid].append(t)

    expo = defaultdict(lambda: defaultdict(float))
    feat = {}
    for gd in sorted(logs["GAME_DATE"].unique()):
        prior = [a for a in asofs if a < gd]
        ratings = by_asof.get(prior[-1], {}) if prior else {}
        if ratings:
            day = logs[logs["GAME_DATE"] == gd]
            for gid, gdf in day.groupby("GAME_ID"):
                ts = teams_of.get(gid, [])
                if len(ts) != 2:
                    continue
                for t in ts:
                    opp = [x for x in ts if x != t][0]
                    opp_players = roster.get((gid, opp), set())
                    for r in gdf[gdf["TEAM"] == t].itertuples(index=False):
                        ex = expo.get(r.PLAYER_ID)
                        if not ex:
                            continue
                        vals = {}
                        for ch, tbl in ratings.items():
                            qs, ws = [], []
                            for d_id, w in ex.items():
                                if d_id in opp_players and d_id in tbl:
                                    qs.append(float(tbl[d_id])); ws.append(w)
                            if len(qs) >= 2 and sum(ws) > 0:
                                vals[ch] = float(np.average(qs, weights=ws))
                        if vals:
                            feat[(gid, r.PLAYER_ID)] = vals
        today = mg.get(gd)
        if today is not None:
            for r in today.itertuples(index=False):
                if r.partialPossessions > 0:
                    expo[r.personIdOff][r.personIdDef] += float(r.partialPossessions)

    d["def_pts"] = [feat.get((g, p), {}).get("def_pts", np.nan) for g, p in zip(d["GAME_ID"], d["PLAYER_ID"])]
    d["min_mult"] = d["min_mult"].fillna(1.0)
    d = d[d["anchor"].notna() & (d["anchor"] > 0)].sort_values("GAME_DATE")
    if sample:
        keep = sorted(d["GAME_DATE"].unique())[:sample]
        d = d[d["GAME_DATE"].isin(keep)]
    print(f"rows {len(d):,} | defender feature on {d['def_pts'].notna().mean():.1%} | "
          f"absence factor on {(d['min_mult']!=1.0).mean():.1%}", flush=True)

    # fit the defender coefficient on the FIRST HALF, apply to the second (held out in time)
    half = len(d) // 2
    tr, te = d.iloc[:half].copy(), d.iloc[half:].copy()
    x = tr[tr["def_pts"].notna()]
    if len(x) > 1000:
        y = np.log((x["PTS"].clip(lower=0.5) / x["anchor"].clip(lower=0.5)).clip(0.3, 3.0))
        X = np.column_stack([np.ones(len(x)), x["def_pts"]])
        bd = np.linalg.lstsq(X, y, rcond=None)[0][1]
    else:
        bd = 0.0
    print(f"defender coefficient on the anchor: {bd:+.4f}", flush=True)

    te["A"] = te["anchor"]
    te["B"] = te["anchor"] * te["min_mult"]
    te["C"] = te["anchor"] * np.exp(bd * te["def_pts"].fillna(0.0))
    te["D"] = te["B"] * np.exp(bd * te["def_pts"].fillna(0.0))

    print(f"\ntest rows {len(te):,}")
    for tag, name in (("A", "anchor alone (certified baseline)"), ("B", "anchor x A2"),
                      ("C", "anchor x defender"), ("D", "anchor x A2 x defender")):
        print(f"  MEAN MAE  {name:<36} {np.abs(te[tag]-te['PTS']).mean():.3f}", flush=True)

    board = pd.read_sql("""SELECT game_date, player, line FROM nba_market.board_snapshots
                           WHERE bookmaker='prizepicks' AND snapshot_label='window'
                             AND market_key='player_points' AND side='Over'""", conn)
    conn.close()
    board["game_date"] = pd.to_datetime(board["game_date"]).dt.date
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}
    board["player_id"] = board["player"].map(norm_name).map(pid_map)
    b = board[board["player_id"].notna()].merge(
        te[["GAME_DATE", "PLAYER_ID", "PTS", "A", "B", "C", "D"]],
        left_on=["game_date", "player_id"], right_on=["GAME_DATE", "PLAYER_ID"], how="inner")
    if len(b) < 500:
        print(f"only {len(b)} legs matched - leg gate skipped", flush=True)
        return
    print(f"\nLEG-LEVEL on {len(b):,} real PrizePicks legs")
    sd = float(np.std(te["PTS"] - te["A"]))
    hit = (b["PTS"] > b["line"].astype(float)).astype(int)
    for tag, name in (("A", "anchor alone (certified baseline)"), ("B", "anchor x A2"),
                      ("C", "anchor x defender"), ("D", "anchor x A2 x defender")):
        p = np.clip(1 - sps.norm.cdf((b["line"].astype(float) - b[tag]) / max(sd, 1e-6)), 1e-4, 1 - 1e-4)
        ll = float(-np.mean(hit * np.log(p) + (1 - hit) * np.log(1 - p)))
        br = float(np.mean((p - hit) ** 2))
        print(f"  {name:<36} log-loss {ll:.4f}  Brier {br:.4f}", flush=True)


if __name__ == "__main__":
    main()
