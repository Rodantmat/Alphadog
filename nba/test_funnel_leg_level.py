#!/usr/bin/env python3
"""
FACTOR TESTING, DONE PROPERLY — the funnel, and LEG-LEVEL scoring instead of MAE.

TWO ERRORS IN EVERY FACTOR TEST SO FAR
  1. THE APPLICATION. Each factor was applied as one scalar on the final mean:
         pred = proj_min x rate36 x exp(beta x feature) / 36
     Research (RotoGrinders: "it's not some kind of simple multiplication problem... opportunity funnels
     down through median projected minutes and adjusted baseline stats") and Gemini both say factors act
     at DIFFERENT LINKS of a production chain. Lumping them into one multiplier assumes they are
     interchangeable forces on the output, which is mechanistically false. Worse, opposing-sign effects
     CANCEL: a teammate out pushes usage up while a tough defender pushes efficiency down, and the
     scalar sees ~1.03 and calls it nothing - when in reality the distribution has changed shape.
     Also: rate36 ALREADY averages over all defenders faced, so a defender multiplier double-counts.

  2. THE METRIC - and this one is worse. Every test graded MAE ON THE MEAN. The product is
     P(stat > line). A factor that cuts the right tail without moving the mean much changes the leg
     probability at a high line materially and shows up as ZERO in MAE. We were grading factors with a
     metric blind to the effect they are most likely to have.

WHAT THIS DOES
  FUNNEL: minutes -> team possessions (pace from the market total) -> usage share -> FGA
          -> shot mix (3PA rate) -> efficiency per attempt (defender-adjusted) -> points
  Each factor enters at its own link:
      teammate absence  -> minutes AND usage share      (volume)
      market total      -> team possessions             (volume, everyone)
      defender def_fg   -> 2P% efficiency
      defender def_3p   -> 3P% efficiency
      defender def_foul -> FT rate
  LEG-LEVEL GATE: score P(points > line) at the REAL PrizePicks lines from board_snapshots, on
  log-loss and Brier, against the baseline. A factor ships only if it improves the LEG probability.

Env: DATABASE_URL, FN_TRAIN_SEASON, FN_TEST_SEASON, FN_SAMPLE_DATES
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


def build(season, conn, sample):
    slug = season.replace("-", "_")
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs["POSS"] = logs["FGA"].fillna(0) + 0.44 * logs["FTA"].fillna(0) + logs["TOV"].fillna(0)
    logs["FG2A"] = logs["FGA"].fillna(0) - logs["FG3A"].fillna(0)
    logs["FG2M"] = logs["FGM"].fillna(0) - logs["FG3M"].fillna(0)
    logs = logs.sort_values("GAME_DATE")

    # team possessions per game (the pace link)
    tp = logs.groupby(["GAME_ID", "TEAM"])["POSS"].sum().rename("team_poss").reset_index()
    logs = logs.merge(tp, on=["GAME_ID", "TEAM"], how="left")

    # as-of player base rates - the funnel's context-neutral starting point
    g = logs.groupby("PLAYER_ID")
    for src, dst in (("MIN", "b_min"), ("POSS", "b_poss"), ("FGA", "b_fga"), ("FG3A", "b_3pa"),
                     ("FTA", "b_fta"), ("FG2A", "b_2pa")):
        logs[dst] = g[src].transform(lambda s: s.shift(1).rolling(15, min_periods=5).mean())
    for num, den, dst in (("FG3M", "FG3A", "b_3pct"), ("FG2M", "FG2A", "b_2pct"), ("FTM", "FTA", "b_ftpct")):
        made = g[num].transform(lambda s: s.shift(1).rolling(15, min_periods=5).sum())
        att = g[den].transform(lambda s: s.shift(1).rolling(15, min_periods=5).sum())
        logs[dst] = np.where(att > 0, made / att, np.nan)
    logs["b_team_poss"] = logs.groupby("TEAM")["team_poss"].transform(
        lambda s: s.shift(1).rolling(10, min_periods=3).mean())

    # OPPONENT RIM DETERRENCE (level, not absence-driven). B4 v3 tested the ABSENCE of a rim protector
    # against the final mean and failed. The mechanism per the deterrence literature is that a rim
    # protector REALLOCATES shots - fewer at the rim, more from midrange/three - rather than reducing
    # attempts. So it belongs at the SHOT-MIX link, and the feature is the opponent's rim protection
    # PRESENT tonight, not what is missing.
    blk = logs.groupby("PLAYER_ID").apply(
        lambda x: pd.Series(
            (x["BLK"].shift(1).rolling(15, min_periods=5).sum() /
             x["MIN"].shift(1).rolling(15, min_periods=5).sum() * 36).values, index=x.index),
        include_groups=False).reset_index(level=0, drop=True)
    logs["b_blk36"] = blk
    team_rim = (logs.assign(w=logs["b_blk36"].fillna(0) * logs["b_min"].fillna(0) / 36.0)
                    .groupby(["GAME_ID", "TEAM"])["w"].sum().rename("rim_level").reset_index())
    pair = logs[["GAME_ID", "TEAM"]].drop_duplicates().merge(team_rim, on=["GAME_ID", "TEAM"], how="left")
    opp_rim = pair.merge(pair, on="GAME_ID")
    opp_rim = opp_rim[opp_rim["TEAM_x"] != opp_rim["TEAM_y"]][["GAME_ID", "TEAM_x", "rim_level_y"]]
    opp_rim.columns = ["GAME_ID", "TEAM", "opp_rim"]
    logs = logs.merge(opp_rim, on=["GAME_ID", "TEAM"], how="left")

    # factors
    fac = pd.read_sql("""SELECT game_id, player_id, min_mult, usage_mult, alloc_actual, n_out
                         FROM nba_score.redistribution_factors WHERE season=%s""", conn, params=(season,))
    fac["player_id"] = fac["player_id"].astype(str)
    logs = logs.merge(fac, left_on=["GAME_ID", "PLAYER_ID"], right_on=["game_id", "player_id"], how="left")

    dr = pd.read_sql("""SELECT as_of_date, player_id, channel, shrunk_rating
                        FROM nba_ref.defender_ratings WHERE season=%s""", conn, params=(season,))
    dr["as_of_date"] = pd.to_datetime(dr["as_of_date"]).dt.date
    dr["player_id"] = dr["player_id"].astype(str)

    # market total -> expected pace
    sp = pd.read_sql("""SELECT m.game_id,
                               avg(CASE WHEN s.market='totals' AND s.outcome='Over' THEN s.point END) AS total,
                               max(CASE WHEN s.market='spreads' AND s.outcome=s.home_team THEN s.point END) AS home_spread
                        FROM nba_market.game_lines_snapshots s
                        JOIN nba_market.event_game_map m ON m.event_id=s.event_id
                        WHERE s.snapshot_label='morning' GROUP BY 1""", conn)
    logs = logs.merge(sp, left_on="GAME_ID", right_on="game_id", how="left", suffixes=("", "_sp"))

    if sample:
        keep = sorted(logs["GAME_DATE"].unique())[:sample]
        logs = logs[logs["GAME_DATE"].isin(keep)]
    return logs, dr


def expected_defender(logs, dr, season, slug):
    """Exposure-weighted defender rating per player-game, scoped to tonight's opponent."""
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
        return {}
    m = pd.concat(frames, ignore_index=True)
    m["GAME_DATE"] = pd.to_datetime(m["GAME_DATE"]).dt.date
    m["personIdDef"] = m["personIdDef"].astype(str)
    m["personIdOff"] = m["personIdOff"].astype(str)
    m["partialPossessions"] = pd.to_numeric(m["partialPossessions"], errors="coerce").fillna(0.0)
    m = m.sort_values("GAME_DATE")

    asofs = sorted(dr["as_of_date"].unique())
    by_asof = {a: {c: dict(zip(gg["player_id"], gg["shrunk_rating"]))
                   for c, gg in g.groupby("channel")} for a, g in dr.groupby("as_of_date")}
    roster = logs.groupby(["GAME_ID", "TEAM"])["PLAYER_ID"].apply(set).to_dict()
    team_by_game = defaultdict(list)
    for (gid, t) in roster:
        team_by_game[gid].append(t)

    expo = defaultdict(lambda: defaultdict(float))
    out = {}
    mg = {d: g for d, g in m.groupby("GAME_DATE")}
    for gd in sorted(logs["GAME_DATE"].unique()):
        prior = [a for a in asofs if a < gd]
        ratings = by_asof.get(prior[-1], {}) if prior else {}
        day = logs[logs["GAME_DATE"] == gd]
        if ratings:
            for gid, gdf in day.groupby("GAME_ID"):
                ts = team_by_game.get(gid, [])
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
                            out[(gid, r.PLAYER_ID)] = vals
        today = mg.get(gd)
        if today is not None:
            for r in today.itertuples(index=False):
                if r.partialPossessions > 0:
                    expo[r.personIdOff][r.personIdDef] += float(r.partialPossessions)
    return out


def main():
    tr_s = os.environ.get("FN_TRAIN_SEASON", "2024-25")
    te_s = os.environ.get("FN_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("FN_SAMPLE_DATES", "0"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])

    frames = {}
    for s in (tr_s, te_s):
        logs, dr = build(s, conn, sample)
        ed = expected_defender(logs, dr, s, s.replace("-", "_"))
        logs["def_fg"] = [ed.get((g, p), {}).get("def_fg", np.nan) for g, p in zip(logs["GAME_ID"], logs["PLAYER_ID"])]
        logs["def_3p"] = [ed.get((g, p), {}).get("def_3p", np.nan) for g, p in zip(logs["GAME_ID"], logs["PLAYER_ID"])]
        logs["def_foul"] = [ed.get((g, p), {}).get("def_foul", np.nan) for g, p in zip(logs["GAME_ID"], logs["PLAYER_ID"])]
        frames[s] = logs
        print(f"{s}: {len(logs):,} rows, defender feature on {logs['def_fg'].notna().mean():.1%}", flush=True)

    # real board lines for the leg-level gate
    board = pd.read_sql("""SELECT b.game_date, b.player, b.line
                           FROM nba_market.board_snapshots b
                           WHERE b.bookmaker='prizepicks' AND b.snapshot_label='window'
                             AND b.market_key='player_points' AND b.side='Over'""", conn)
    conn.close()
    board["game_date"] = pd.to_datetime(board["game_date"]).dt.date
    board["nm"] = board["player"].map(norm_name)

    def funnel(d, use_factors):
        """minutes -> team poss -> usage -> FGA -> mix -> efficiency -> points"""
        m = d["b_min"] * (d["min_mult"].fillna(1.0) if use_factors else 1.0)
        if use_factors:
            # BLOWOUT RISK on the MINUTES link (Stokastic: "a double-digit spread is the silent killer
            # of a projection - if a game projects to be a blowout, the starters may sit the entire
            # fourth quarter and their minutes evaporate"). Applied to minutes, NOT to the final mean,
            # and scaled by baseline minutes because it is starters who lose the fourth quarter -
            # a bench player's minutes can RISE in the same game.
            sp = d["home_spread"].abs()
            blow = np.where(sp.notna(), 1.0 - BLOWOUT_K * np.clip(sp - 8.0, 0, 14) / 14.0, 1.0)
            starter_w = np.clip((d["b_min"] - 18.0) / 14.0, 0.0, 1.0)     # 0 for bench, 1 for 32+ min
            m = m * (1.0 - starter_w * (1.0 - blow))
        pace = d["b_team_poss"]
        if use_factors:
            tot = d["total"]
            pace = np.where(tot.notna(), pace * (tot / tot.median()).clip(0.92, 1.08), pace)
        on_court_poss = pace * (m / 48.0)
        usage_share = (d["b_poss"] / d["b_team_poss"].clip(lower=50)) * (d["usage_mult"].fillna(1.0) if use_factors else 1.0)
        poss_used = on_court_poss * usage_share.clip(0.02, 0.60)
        fga = poss_used * (d["b_fga"] / d["b_poss"].clip(lower=1)).clip(0.4, 1.2)
        share3 = (d["b_3pa"] / d["b_fga"].clip(lower=1)).clip(0, 0.95)
        if use_factors:
            # rim deterrence acts on the SHOT MIX: a strong rim-protecting opponent pushes attempts
            # away from the rim and out to the perimeter, and lowers 2P% on what still goes inside.
            rim_z = ((d["opp_rim"] - d["opp_rim"].median()) / max(d["opp_rim"].std(), 1e-6)).fillna(0.0)
            share3 = (share3 * np.exp(RIM_MIX * rim_z)).clip(0, 0.95)
        a3, a2 = fga * share3, fga * (1 - share3)
        fta = fga * (d["b_fta"] / d["b_fga"].clip(lower=1)).clip(0, 1.2)
        p3, p2, pft = d["b_3pct"], d["b_2pct"], d["b_ftpct"]
        if use_factors:
            p2 = p2 * np.exp(d["def_fg"].fillna(0.0) * B2 + RIM_EFF * ((d["opp_rim"] - d["opp_rim"].median()) / max(d["opp_rim"].std(), 1e-6)).fillna(0.0))
            p3 = p3 * np.exp(d["def_3p"].fillna(0.0) * B3)
            fta = fta * np.exp(d["def_foul"].fillna(0.0) * BF)
        return a3 * p3.clip(0.1, 0.6) * 3 + a2 * p2.clip(0.2, 0.8) * 2 + fta * pft.clip(0.4, 1.0)

    # fit the three efficiency betas on TRAIN by simple search
    tr = frames[tr_s]
    tr = tr[tr["b_min"].notna() & tr["b_3pct"].notna() & tr["b_2pct"].notna() & tr["b_ftpct"].notna() & (tr["b_min"] >= 10)]
    global B2, B3, BF, BLOWOUT_K, RIM_MIX, RIM_EFF
    B2 = B3 = BF = 0.0
    BLOWOUT_K = 0.0
    RIM_MIX = RIM_EFF = 0.0
    base_mae = np.abs(funnel(tr, True) - tr["PTS"]).mean()
    for name, lo, hi in (("RIM_MIX", -0.12, 0.12), ("RIM_EFF", -0.08, 0.08),
                         ("BLOWOUT_K", 0.0, 0.25), ("B2", -0.05, 0.05),
                         ("B3", -0.10, 0.10), ("BF", -0.10, 0.10)):
        best, bv = base_mae, 0.0
        for v in np.linspace(lo, hi, 21):
            globals()[name] = v
            e = np.abs(funnel(tr, True) - tr["PTS"]).mean()
            if e < best:
                best, bv = e, v
        globals()[name] = bv
        base_mae = best
    print(f"fitted: BLOWOUT_K(spread on starter minutes) {BLOWOUT_K:+.4f}  B2(def_fg on 2P%) {B2:+.4f}  "
          f"B3(def_3p on 3P%) {B3:+.4f}  BF(def_foul on FTA) {BF:+.4f}", flush=True)

    te = frames[te_s]
    te = te[te["b_min"].notna() & te["b_3pct"].notna() & te["b_2pct"].notna() & te["b_ftpct"].notna() & (te["b_min"] >= 10)].copy()
    te["simple"] = te["b_min"] * (te["PTS"].groupby(te["PLAYER_ID"]).transform(
        lambda s: s.shift(1).expanding(min_periods=5).mean()) / te["b_min"]).fillna(0)
    te["f_base"] = funnel(te, False)
    te["f_adj"] = funnel(te, True)
    te = te[te["f_base"].notna() & te["f_adj"].notna() & (te["f_base"] > 0)]
    print(f"\ntest rows {len(te):,}")
    print(f"  MEAN MAE   funnel base {np.abs(te['f_base']-te['PTS']).mean():.3f} | "
          f"funnel + factors {np.abs(te['f_adj']-te['PTS']).mean():.3f}", flush=True)

    # LEG-LEVEL GATE at real board lines
    te["nm"] = te["PLAYER_ID"]
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}
    board["player_id"] = board["nm"].map(pid_map)
    b = board[board["player_id"].notna()].merge(
        te[["GAME_DATE", "PLAYER_ID", "PTS", "f_base", "f_adj"]],
        left_on=["game_date", "player_id"], right_on=["GAME_DATE", "PLAYER_ID"], how="inner")
    if len(b) < 500:
        print(f"only {len(b)} legs matched - leg-level gate skipped", flush=True)
        return
    sd = float(np.std(te["PTS"] - te["f_base"]))
    for tag in ("f_base", "f_adj"):
        p = 1 - sps.norm.cdf((b["line"].astype(float) - b[tag]) / max(sd, 1e-6))
        p = np.clip(p, 1e-4, 1 - 1e-4)
        hit = (b["PTS"] > b["line"].astype(float)).astype(int)
        ll = float(-np.mean(hit * np.log(p) + (1 - hit) * np.log(1 - p)))
        br = float(np.mean((p - hit) ** 2))
        print(f"  LEG-LEVEL  {tag:<8} n={len(b):,}  log-loss {ll:.4f}  Brier {br:.4f}", flush=True)


if __name__ == "__main__":
    main()
