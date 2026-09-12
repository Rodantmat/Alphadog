#!/usr/bin/env python3
"""
FACTOR B4 v2 — OPPONENT AVAILABILITY VIA EXPECTED DEFENDER QUALITY.

B4 v1 (opponent vacated minutes + count out) FAILED the held-out gate on all 19 props. Research says
why: minutes and blocks do not measure defensive impact. Rim protection is largely DETERRENCE - shots
never attempted - which block counts miss; and the effect is POSITION-SPECIFIC (a guard facing a team
missing its point-of-attack defender is in a different game than one facing a team missing a backup big).
84% of games have SOME opponent absence, so a raw count carries almost no information.

THE RIGHT FEATURE — the change in the defender this player will actually face:
  1. From our per-game matchup shards (personIdDef x personIdOff, partialPossessions, playerPoints)
     build, as-of, each offensive player's EXPOSURE SHARE to each opposing defender, and each
     defender's QUALITY (points allowed per partial possession, shrunk k=150) - the same construction
     that produced the M1 measurement (-5.5% toughest quintile to +6.7% easiest, elasticity 0.39).
  2. For a game, expected defender quality = exposure-weighted mean over the opponent's AVAILABLE
     defenders, with the shares of absent defenders redistributed to the rest (same conserving
     counterfactual as A2: allocate over {available} vs over {available + absent}).
  3. The feature is the RATIO expected_quality_actual / expected_quality_full - i.e. how much easier or
     harder this specific player's night got - not how many minutes the opponent lost.

Gated exactly like A2: fit on the train season, keep only props whose held-out MAE improves.

Env: DATABASE_URL, B4_TRAIN_SEASON, B4_TEST_SEASON, B4_SAMPLE_DATES
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
COMBOS = {"pra": ("PTS", "REB", "AST"), "pts_reb": ("PTS", "REB"), "pts_ast": ("PTS", "AST")}
PROPS = {"points": "PTS", "rebounds": "REB", "assists": "AST", "threes_made": "FG3M",
         "fga": "FGA", "fgm": "FGM", "ftm": "FTM", "fta": "FTA"}
SHRINK = 150.0


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


def main():
    tr_s = os.environ.get("B4_TRAIN_SEASON", "2024-25")
    te_s = os.environ.get("B4_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("B4_SAMPLE_DATES", "0"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])

    frames = {}
    for season in (tr_s, te_s):
        slug = season.replace("-", "_")
        m = load_matchups(slug)
        if m.empty:
            print(f"{season}: no matchup shards - cannot build B4 v2", flush=True)
            return
        print(f"{season}: {len(m):,} matchup pairings", flush=True)

        logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
        logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
        logs["GAME_ID"] = logs["GAME_ID"].astype(str)
        logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
        for name, cols in COMBOS.items():
            logs[name.upper()] = sum(logs[c].fillna(0) for c in cols)

        fac = pd.read_sql("""SELECT game_id, team, player_id, base_min, alloc_actual
                             FROM nba_score.redistribution_factors WHERE season=%s""", conn, params=(season,))
        fac["player_id"] = fac["player_id"].astype(str)
        # who was absent per (game, team) = players with a factor row on the OTHER team are available;
        # absent defenders are those with as-of matchup exposure who have no log row in this game
        played = logs.groupby("GAME_ID")["PLAYER_ID"].apply(set).to_dict()
        team_of_game = logs.groupby(["GAME_ID", "TEAM"])["PLAYER_ID"].apply(set).to_dict()

        # as-of defender quality and exposure, accumulated forward
        dq = defaultdict(lambda: [0.0, 0.0])          # defender -> [points allowed, partial poss]
        expo = defaultdict(lambda: defaultdict(float))  # offensive player -> defender -> partial poss
        rows = []
        dates = sorted(logs["GAME_DATE"].unique())
        if sample:
            dates = dates[:sample]
        mg = {d: g for d, g in m.groupby("GAME_DATE")}
        # rolling record of who has played for each team recently, so "absent" means a rotation player
        # who did not suit up tonight - not simply anyone who has ever faced this offensive player
        opp_prior_roster = defaultdict(set)
        for gd in dates:
            day = logs[logs["GAME_DATE"] == gd]
            for gid, gdf in day.groupby("GAME_ID"):
                teams = list(gdf["TEAM"].unique())
                if len(teams) != 2:
                    continue
                for t in teams:
                    opp = [x for x in teams if x != t][0]
                    opp_roster = team_of_game.get((gid, opp), set())          # played tonight
                    opp_absent = opp_prior_roster.get(opp, set()) - opp_roster  # on the team recently, not tonight
                    for r in gdf[gdf["TEAM"] == t].itertuples(index=False):
                        ex = expo.get(r.PLAYER_ID)
                        if not ex:
                            continue
                        # SCOPE THE EXPOSURE TO TONIGHT'S OPPONENT. v2's bug: a player's historical
                        # defenders span the whole league, so 93% of them were "missing" simply because
                        # they play for other teams - q_ratio then compared a league average against
                        # tonight's opponent, which is a different quantity entirely.
                        ex_opp = {d: w for d, w in ex.items() if d in opp_roster or d in opp_absent}
                        tot_all = sum(ex_opp.values())
                        if tot_all <= 0:
                            continue

                        def q(pid):
                            a = dq.get(pid)
                            if not a or a[1] <= 0:
                                return None
                            return a[0] / a[1]
                        qs_all, ws_all, qs_av, ws_av = [], [], [], []
                        for d_id, w in ex_opp.items():
                            qq = q(d_id)
                            if qq is None:
                                continue
                            qs_all.append(qq); ws_all.append(w)
                            if d_id in opp_roster:
                                qs_av.append(qq); ws_av.append(w)
                        if len(qs_all) < 2 or not ws_av or sum(ws_av) <= 0:
                            continue
                        q_full = float(np.average(qs_all, weights=ws_all))
                        q_act = float(np.average(qs_av, weights=ws_av))
                        if q_full <= 0:
                            continue
                        rows.append({"GAME_DATE": gd, "GAME_ID": gid, "PLAYER_ID": r.PLAYER_ID,
                                     "q_full": q_full, "q_act": q_act, "q_ratio": q_act / q_full,
                                     "share_missing": 1 - sum(ws_av) / tot_all})
            # fold today's matchups into the as-of accumulators AFTER measuring
            for t, tdf in day.groupby("TEAM"):
                opp_prior_roster[t].update(tdf["PLAYER_ID"])
            today = mg.get(gd)
            if today is not None:
                for r in today.itertuples(index=False):
                    pp = float(r.partialPossessions or 0)
                    if pp <= 0:
                        continue
                    a = dq[r.personIdDef]
                    a[0] += float(r.playerPoints or 0); a[1] += pp
                    expo[r.personIdOff][r.personIdDef] += pp
        b4 = pd.DataFrame(rows)
        print(f"  {season}: {len(b4):,} rows with an expected-defender feature", flush=True)
        frames[season] = logs.merge(b4, on=["GAME_DATE", "GAME_ID", "PLAYER_ID"], how="inner") \
                             .merge(fac, left_on=["GAME_ID", "PLAYER_ID"], right_on=["game_id", "player_id"], how="inner")

    tr, te = frames[tr_s], frames[te_s]
    tr = tr[(tr["MIN"] >= 6) & (tr["base_min"] >= 6)]
    te = te[(te["MIN"] >= 6) & (te["base_min"] >= 6)]
    print(f"\ntrain {len(tr):,} | test {len(te):,} | mean q_ratio {te['q_ratio'].mean():.4f} "
          f"| share of exposure missing {te['share_missing'].mean():.3f}\n", flush=True)

    print(f"{'prop':<14}{'n':>8}{'MAE A2':>10}{'MAE +B4v2':>11}{'gain':>9}   verdict")
    kept = []
    targets = {**PROPS, **{k: k.upper() for k in COMBOS}}
    for prop, col in targets.items():
        out = {}
        for tag, d in (("tr", tr), ("te", te)):
            x = d.sort_values("GAME_DATE").copy()
            x["per36"] = np.where(x["MIN"] > 0, x[col] / x["MIN"] * 36, np.nan)
            x["base_rate36"] = x.groupby("PLAYER_ID")["per36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
            x = x[x["base_rate36"].notna() & (x["base_rate36"] > 0)]
            x["pred_a2"] = x["alloc_actual"] * x["base_rate36"] / 36
            out[tag] = x[x["pred_a2"] > 0]
        a, b = out["tr"], out["te"]
        if len(a) < 800 or len(b) < 400:
            continue
        X = np.column_stack([np.ones(len(a)), np.log(a["q_ratio"].clip(0.7, 1.4))])
        y = np.log((a[col].clip(lower=0.5) / a["pred_a2"].clip(lower=0.5)).clip(0.3, 3.0))
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        adj = np.exp(beta[1] * np.log(b["q_ratio"].clip(0.7, 1.4)))
        m0 = np.abs(b["pred_a2"] - b[col]).mean()
        m1 = np.abs(b["pred_a2"] * adj - b[col]).mean()
        gain = m0 - m1
        ok = gain > 0.002
        if ok:
            kept.append(prop)
        print(f"{prop:<14}{len(b):>8,}{m0:>10.3f}{m1:>11.3f}{gain:>+9.3f}   {'WIRE IN' if ok else 'skip'}  (beta {beta[1]:+.3f})")
    print(f"\nB4 v2 helps on {len(kept)} props: {', '.join(sorted(kept)) if kept else '(none)'}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
