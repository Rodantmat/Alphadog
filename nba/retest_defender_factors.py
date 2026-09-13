#!/usr/bin/env python3
"""
M1 / B4 RE-TEST with PROPER defender ratings, and WITH INTERACTIONS.

WHY A RE-TEST: the first M1 and B4 v2/v3 tests used features now known to be inadequate -
"points allowed per possession" (confounds the defender with who he guarded; the Sloan work shows such
metrics have almost no year-to-year correlation) and "blocks per 36" (rim protection is largely
DETERRENCE, shots never attempted, which block counts specifically miss). Those rejections told us the
CRUDE versions add nothing; they did not establish that the signal is absent.

WHAT IS DIFFERENT HERE
  1. FEATURE: nba_ref.defender_ratings - a two-way ridge fit separating offence and defence effects,
     five channels (pts / fg / 3p / tov / foul), reliability-shrunk, refit weekly as-of.
  2. EXPECTED DEFENDER: exposure-weighted over TONIGHT'S available opposing defenders only, using the
     as-of rating that predates the game.
  3. CHANNEL MATCHING: each prop is tested against the channel that should drive it -
     points/fga/fgm -> def_pts and def_fg ; threes -> def_3p ; turnovers -> def_tov ; fta -> def_foul.
     The crude test threw one number at every prop.
  4. INTERACTIONS - the gap in EVERY factor test so far. Practitioner sources are explicit that books
     misprice when factors move TOGETHER ("a key teammate injury in a fast-paced matchup"), yet every
     test to date fitted main effects only. Tested here:
         defender x usage   (a high-usage player is exposed to his defender far more)
         defender x A2      (absence redistribution AND a soft matchup together)

Gate unchanged: fit on the train season, keep only props whose HELD-OUT MAE improves.

Env: DATABASE_URL, RT_TRAIN_SEASON, RT_TEST_SEASON, RT_SAMPLE_DATES
"""
import json
import os
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
# prop -> the defensive channel that should drive it
PROP_CHANNEL = {"points": "def_pts", "fga": "def_pts", "fgm": "def_fg", "threes_made": "def_3p",
                "turnovers": "def_tov", "fta": "def_foul", "pra": "def_pts", "assists": "def_tov"}
COL = {"points": "PTS", "fga": "FGA", "fgm": "FGM", "threes_made": "FG3M", "turnovers": "TOV",
       "fta": "FTA", "assists": "AST", "pra": "PRA"}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def load_matchups(slug):
    idx = fetch(f"nba_matchups_pergame_{slug}_index.json", timeout=120)
    shards = (idx.get("meta") or idx).get("shards") or []
    frames = []
    for sh in shards:
        try:
            d = fetch(f"nba_matchups_pergame_{slug}_{sh}.json")
            f = pd.DataFrame(d["rows"], columns=d["columns"])
            frames.append(f[["GAME_DATE", "personIdDef", "personIdOff", "partialPossessions"]])
        except Exception:  # noqa: BLE001
            pass
    if not frames:
        return pd.DataFrame()
    m = pd.concat(frames, ignore_index=True)
    m["GAME_DATE"] = pd.to_datetime(m["GAME_DATE"]).dt.date
    m["personIdDef"] = m["personIdDef"].astype(str)
    m["personIdOff"] = m["personIdOff"].astype(str)
    m["partialPossessions"] = pd.to_numeric(m["partialPossessions"], errors="coerce").fillna(0.0)
    return m.sort_values("GAME_DATE")


def build(season, conn, sample):
    slug = season.replace("-", "_")
    m = load_matchups(slug)
    if m.empty:
        return pd.DataFrame()
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs["PRA"] = logs["PTS"].fillna(0) + logs["REB"].fillna(0) + logs["AST"].fillna(0)
    logs["POSS"] = logs["FGA"].fillna(0) + 0.44 * logs["FTA"].fillna(0) + logs["TOV"].fillna(0)
    logs = logs.sort_values("GAME_DATE")

    dr = pd.read_sql("""SELECT as_of_date, player_id, channel, shrunk_rating
                        FROM nba_ref.defender_ratings WHERE season=%s""", conn, params=(season,))
    if dr.empty:
        return pd.DataFrame()
    dr["as_of_date"] = pd.to_datetime(dr["as_of_date"]).dt.date
    dr["player_id"] = dr["player_id"].astype(str)
    asofs = sorted(dr["as_of_date"].unique())
    by_asof = {a: {c: dict(zip(g[g["channel"] == c]["player_id"], g[g["channel"] == c]["shrunk_rating"]))
                   for c in g["channel"].unique()} for a, g in dr.groupby("as_of_date")}

    def latest_asof(d):
        prior = [a for a in asofs if a < d]
        return prior[-1] if prior else None

    fac = pd.read_sql("""SELECT game_id, player_id, min_mult FROM nba_score.redistribution_factors
                         WHERE season=%s""", conn, params=(season,))
    fac["player_id"] = fac["player_id"].astype(str)
    mm = dict(zip(zip(fac["game_id"], fac["player_id"]), fac["min_mult"]))

    team_of_game = logs.groupby(["GAME_ID", "TEAM"])["PLAYER_ID"].apply(set).to_dict()
    expo = defaultdict(lambda: defaultdict(float))
    hist = defaultdict(lambda: [0.0, 0.0, 0])            # pid -> [min, poss, games]
    mg = {d: g for d, g in m.groupby("GAME_DATE")}
    rows = []
    dates = sorted(logs["GAME_DATE"].unique())
    if sample:
        dates = dates[:sample]
    for gd in dates:
        a = latest_asof(gd)
        day = logs[logs["GAME_DATE"] == gd]
        if a is not None:
            ratings = by_asof.get(a, {})
            for gid, gdf in day.groupby("GAME_ID"):
                teams = list(gdf["TEAM"].unique())
                if len(teams) != 2:
                    continue
                for t in teams:
                    opp = [x for x in teams if x != t][0]
                    opp_roster = team_of_game.get((gid, opp), set())
                    for r in gdf[gdf["TEAM"] == t].itertuples(index=False):
                        ex = expo.get(r.PLAYER_ID)
                        h = hist.get(r.PLAYER_ID, [0.0, 0.0, 0])
                        if not ex or h[2] < 3:
                            continue
                        feats = {}
                        for ch, table in ratings.items():
                            qs, ws = [], []
                            for d_id, w in ex.items():
                                if d_id in opp_roster and d_id in table:
                                    qs.append(float(table[d_id])); ws.append(w)
                            if len(qs) >= 2 and sum(ws) > 0:
                                feats[ch] = float(np.average(qs, weights=ws))
                        if not feats:
                            continue
                        rows.append({"GAME_DATE": gd, "GAME_ID": gid, "PLAYER_ID": r.PLAYER_ID,
                                     "base_min": h[0] / h[2], "base_poss": h[1] / h[2], "MIN": float(r.MIN),
                                     "min_mult": float(mm.get((gid, r.PLAYER_ID), 1.0)),
                                     **feats,
                                     **{c: float(getattr(r, c)) for c in ("PTS", "FGA", "FGM", "FG3M", "TOV", "FTA", "AST", "PRA")}})
        today = mg.get(gd)
        if today is not None:
            for r in today.itertuples(index=False):
                if r.partialPossessions > 0:
                    expo[r.personIdOff][r.personIdDef] += float(r.partialPossessions)
        for r in day.itertuples(index=False):
            h = hist[r.PLAYER_ID]
            h[0] += float(r.MIN); h[1] += float(r.POSS); h[2] += 1
    return pd.DataFrame(rows)


def main():
    tr_s = os.environ.get("RT_TRAIN_SEASON", "2024-25")
    te_s = os.environ.get("RT_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("RT_SAMPLE_DATES", "0"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    tr, te = build(tr_s, conn, sample), build(te_s, conn, sample)
    conn.close()
    if tr.empty or te.empty:
        print(f"insufficient data (train {len(tr)}, test {len(te)}) - both seasons of defender_ratings needed")
        return
    print(f"train {len(tr):,} | test {len(te):,}", flush=True)

    print(f"\n{'prop':<13}{'channel':<10}{'n':>8}{'base':>9}{'+M1':>9}{'+inter':>9}   verdict")
    kept = []
    for prop, ch in PROP_CHANNEL.items():
        col = COL[prop]
        if ch not in tr.columns or ch not in te.columns:
            continue
        out = {}
        for tag, d in (("tr", tr), ("te", te)):
            x = d[d[ch].notna()].sort_values("GAME_DATE").copy()
            x["per36"] = np.where(x["MIN"] > 0, x[col] / x["MIN"] * 36, np.nan)
            x["rate"] = x.groupby("PLAYER_ID")["per36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
            x = x[x["rate"].notna() & (x["base_min"] >= 8)]
            x["pred"] = x["base_min"] * x["rate"] / 36
            x["usage_z"] = (x["base_poss"] - x["base_poss"].mean()) / max(x["base_poss"].std(), 1e-6)
            out[tag] = x[x["pred"] > 0]
        a, b = out["tr"], out["te"]
        if len(a) < 1500 or len(b) < 800:
            continue
        ya = np.log((a[col].clip(lower=0.5) / a["pred"].clip(lower=0.5)).clip(0.3, 3.0))
        # main effect only
        X1 = np.column_stack([np.ones(len(a)), a[ch]])
        b1, *_ = np.linalg.lstsq(X1, ya, rcond=None)
        adj1 = np.exp(b1[1] * b[ch])
        # with interactions: defender x usage, defender x absence redistribution
        X2 = np.column_stack([np.ones(len(a)), a[ch], a[ch] * a["usage_z"], a[ch] * (a["min_mult"] - 1.0)])
        b2, *_ = np.linalg.lstsq(X2, ya, rcond=None)
        adj2 = np.exp(b2[1] * b[ch] + b2[2] * b[ch] * b["usage_z"] + b2[3] * b[ch] * (b["min_mult"] - 1.0))
        m0 = np.abs(b["pred"] - b[col]).mean()
        m1 = np.abs(b["pred"] * adj1 - b[col]).mean()
        m2 = np.abs(b["pred"] * adj2 - b[col]).mean()
        best = min(m1, m2)
        ok = m0 - best > 0.002
        if ok:
            kept.append(f"{prop}({'inter' if m2 < m1 else 'main'})")
        print(f"{prop:<13}{ch:<10}{len(b):>8,}{m0:>9.3f}{m1:>9.3f}{m2:>9.3f}   "
              f"{'WIRE IN' if ok else 'skip'}  (b {b1[1]:+.3f}, usage {b2[2]:+.3f}, A2 {b2[3]:+.3f})")
    print(f"\nwith proper ratings + interactions, helps on {len(kept)}: {', '.join(kept) if kept else '(none)'}", flush=True)


if __name__ == "__main__":
    main()
