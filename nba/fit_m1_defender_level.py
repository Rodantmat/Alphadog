#!/usr/bin/env python3
"""
FACTOR M1 — PRIMARY DEFENDER QUALITY as a BASELINE-STAGE factor.

DISTINCT FROM B4, which was rejected. B4 asked: does the same-day CHANGE in expected defender quality
(caused by opponent absences) add anything? Answer: no, betas ~0. M1 asks a different question: does the
LEVEL of the defender a player will actually face add anything beyond the baseline's existing opponent
terms (opponent defensive profile, DvP by position, pace)?

These can have different answers. The baseline carries TEAM-level opponent defence; M1 is PLAYER-level -
a guard who draws the opponent's point-of-attack stopper faces a different night than one who is guarded
by the opponent's weakest perimeter defender, even against the same team. Our own measurement put that
at -5.5% (toughest quintile) to +6.7% (easiest), elasticity 0.39.

FEATURE (as-of, from the per-game matchup shards, exposure-weighted over TONIGHT'S opponent only -
the scoping bug that invalidated B4 v2's first run):
    q_expected = sum over tonight's available opposing defenders of
                 (this player's historical exposure share to that defender) x (that defender's quality)
    quality    = points allowed per partial possession, shrunk k=150
    feature    = log(q_expected / league median) - a defender HARDER than average is negative

GATE: fit on the train season, keep only props whose HELD-OUT MAE improves. Same discipline that
rejected the rate response, B4 and A5. The sanity gate applies: if the feature is degenerate (no
variance, implausible coverage), verdicts are suppressed rather than graded.

Env: DATABASE_URL, M1_TRAIN_SEASON, M1_TEST_SEASON, M1_SAMPLE_DATES
"""
import json
import os
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
PROPS = {"points": "PTS", "fga": "FGA", "fgm": "FGM", "threes_made": "FG3M", "assists": "AST"}
COMBO = {"pra": ("PTS", "REB", "AST"), "pts_ast": ("PTS", "AST")}


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
            frames.append(f[["gameId", "GAME_DATE", "personIdDef", "personIdOff", "partialPossessions", "playerPoints"]])
        except Exception as exc:  # noqa: BLE001
            print(f"  shard {sh}: {exc}", flush=True)
    if not frames:
        return pd.DataFrame()
    m = pd.concat(frames, ignore_index=True)
    m["GAME_DATE"] = pd.to_datetime(m["GAME_DATE"]).dt.date
    m["personIdDef"] = m["personIdDef"].astype(str)
    m["personIdOff"] = m["personIdOff"].astype(str)
    return m.sort_values("GAME_DATE")


def build(season, sample):
    slug = season.replace("-", "_")
    m = load_matchups(slug)
    if m.empty:
        return pd.DataFrame()
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    for name, cols in COMBO.items():
        logs[name.upper()] = sum(logs[c].fillna(0) for c in cols)
    logs = logs.sort_values("GAME_DATE")

    team_of_game = logs.groupby(["GAME_ID", "TEAM"])["PLAYER_ID"].apply(set).to_dict()
    dq = defaultdict(lambda: [0.0, 0.0])
    expo = defaultdict(lambda: defaultdict(float))
    hist = defaultdict(lambda: [0.0, 0])
    mg = {d: g for d, g in m.groupby("GAME_DATE")}
    rows = []
    dates = sorted(logs["GAME_DATE"].unique())
    if sample:
        dates = dates[:sample]
    for gd in dates:
        day = logs[logs["GAME_DATE"] == gd]
        for gid, gdf in day.groupby("GAME_ID"):
            teams = list(gdf["TEAM"].unique())
            if len(teams) != 2:
                continue
            for t in teams:
                opp = [x for x in teams if x != t][0]
                opp_roster = team_of_game.get((gid, opp), set())     # who actually played for the opponent
                for r in gdf[gdf["TEAM"] == t].itertuples(index=False):
                    ex = expo.get(r.PLAYER_ID)
                    h = hist.get(r.PLAYER_ID, [0.0, 0])
                    if not ex or h[1] < 3:
                        continue
                    qs, ws = [], []
                    for d_id, w in ex.items():
                        if d_id not in opp_roster:
                            continue                                 # SCOPE to tonight's opponent
                        a = dq.get(d_id)
                        if not a or a[1] <= 0:
                            continue
                        qs.append(a[0] / a[1]); ws.append(w)
                    if len(qs) < 2 or sum(ws) <= 0:
                        continue
                    rows.append({"GAME_DATE": gd, "GAME_ID": gid, "PLAYER_ID": r.PLAYER_ID,
                                 "q_exp": float(np.average(qs, weights=ws)), "n_def": len(qs),
                                 "base_min": h[0] / h[1],
                                 **{c: float(getattr(r, c)) for c in ("MIN", "PTS", "FGA", "FGM", "FG3M", "AST", "PRA", "PTS_AST")}})
        today = mg.get(gd)
        if today is not None:
            for r in today.itertuples(index=False):
                pp = float(r.partialPossessions or 0)
                if pp <= 0:
                    continue
                a = dq[r.personIdDef]
                a[0] += float(r.playerPoints or 0); a[1] += pp
                expo[r.personIdOff][r.personIdDef] += pp
        for r in day.itertuples(index=False):
            h = hist[r.PLAYER_ID]
            h[0] += float(r.MIN); h[1] += 1
    return pd.DataFrame(rows)


def main():
    tr_s = os.environ.get("M1_TRAIN_SEASON", "2024-25")
    te_s = os.environ.get("M1_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("M1_SAMPLE_DATES", "0"))
    tr, te = build(tr_s, sample), build(te_s, sample)
    if tr.empty or te.empty:
        print("no matchup data - cannot test M1")
        return
    med = float(pd.concat([tr["q_exp"], te["q_exp"]]).median())
    for d in (tr, te):
        d["feat"] = np.log(d["q_exp"].clip(lower=0.01) / med)
    print(f"train {len(tr):,} | test {len(te):,} | q_exp median {med:.4f} | "
          f"feature sd {te['feat'].std():.4f} | defenders per player-game {te['n_def'].mean():.1f}", flush=True)
    if te["feat"].std() < 0.02 or len(te) < 3000:
        print("FEATURE FAILS SANITY GATE - verdicts suppressed", flush=True)
        return

    print(f"\n{'prop':<14}{'n':>8}{'MAE base':>10}{'MAE +M1':>10}{'gain':>9}   verdict")
    kept = []
    for prop, col in {**PROPS, **{k: k.upper() for k in COMBO}}.items():
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
        X = np.column_stack([np.ones(len(a)), a["feat"]])
        y = np.log((a[col].clip(lower=0.5) / a["pred"].clip(lower=0.5)).clip(0.3, 3.0))
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        adj = np.exp(beta[1] * b["feat"])
        m0 = np.abs(b["pred"] - b[col]).mean()
        m1 = np.abs(b["pred"] * adj - b[col]).mean()
        ok = m0 - m1 > 0.002
        if ok:
            kept.append(prop)
        print(f"{prop:<14}{len(b):>8,}{m0:>10.3f}{m1:>10.3f}{m0-m1:>+9.3f}   "
              f"{'WIRE IN' if ok else 'skip'}  (beta {beta[1]:+.3f})")
    print(f"\nM1 helps on {len(kept)} props: {', '.join(sorted(kept)) if kept else '(none)'}", flush=True)


if __name__ == "__main__":
    main()
