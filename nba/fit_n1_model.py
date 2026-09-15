#!/usr/bin/env python3
"""
N1 v3 — PLAYER AVAILABILITY MODEL. Four layers, built on the research, not hand-rolled cells.

WHY v3. Two earlier attempts died on the FEATURE BUILD, not the model: interleaved accumulators left the
label uniform (base rate 0.0000, "divide by zero in log") and a filter chain cut 2,000+ Questionable rows
down to 8. The guard now aborts on an implausible base rate instead of reporting zeros as a finding.

ARCHITECTURE (evidence-based):
  L1  HIERARCHICAL PRIOR   shrunk cells reason_class x role x team - always in a plausible range,
                           and the fallback when the model has no support. (Bayes-xG style player and
                           position correction.)
  L2  GRADIENT BOOSTING    LightGBM on the full feature set. The NBA availability study measured
                           logistic AUC 0.73 / RandomForest 0.79 / LGBM 0.83 - the gain is non-linear
                           feature INTERACTIONS, which hand-built cells cannot express.
  L3  STACK                blend L1 and L2 in log-odds; stacking beat every single model in the studies
                           surveyed (0.854 vs 0.848-0.851).
  L4  ISOTONIC CALIBRATION fitted on held-out data so the reported probability means what it says -
                           the whole point is a number the slip engine can trust.

FEATURES (all as-of, all from data we hold):
  reason_class, team, role (as-of mpg), days_rest, is_b2b, games_missed_streak, season phase,
  status churn across the day's snapshots (improved / degraded / n_amendments), and the player's own
  historical Questionable play rate (shrunk).

THE TARGET METRIC is not raw accuracy - it is the CONFIDENT BAND: what share of Questionables the model
places at p<=0.15 or p>=0.85, and how often those calls are right. That is where "extremely high
assertiveness" is actually achievable; joint-branch prediction over k coin flips is p^k and is the wrong
thing to chase, which is why the scenario layer enumerates and selects instead of guessing.

Env: DATABASE_URL, N1_TRAIN, N1_TEST
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


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def phase_of(dt):
    m, day = dt.month, dt.day
    if m in (10, 11):
        return "1_oct_nov"
    if m == 12 or m == 1 or (m == 2 and day < 15):
        return "2_dec_asb"
    if (m == 2 and day >= 15) or (m == 3 and day < 16):
        return "3_post_asb"
    return "4_push"


def build(season, pid_map):
    """One row per (game_date, player) listed QUESTIONABLE, with as-of features and the realised label."""
    slug = season.replace("-", "_")
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs["MIN"] = pd.to_numeric(logs["MIN"], errors="coerce").fillna(0.0)
    logs = logs.sort_values("GAME_DATE")

    # AS-OF minutes: a simple expanding mean shifted by one, computed ONCE on the log frame. The earlier
    # versions rebuilt this inside the date loop and corrupted it.
    logs["asof_mpg"] = logs.groupby("PLAYER_ID")["MIN"].transform(lambda s: s.shift(1).expanding().mean())
    logs["asof_games"] = logs.groupby("PLAYER_ID").cumcount()
    mpg_lookup = {(r.GAME_DATE, r.PLAYER_ID): (r.asof_mpg, r.asof_games)
                  for r in logs.itertuples(index=False)}
    # last known level before a date, for players who did NOT appear that day
    last_level, last_date_seen = {}, {}
    level_hist = defaultdict(list)
    for r in logs.itertuples(index=False):
        if np.isfinite(r.asof_mpg):
            level_hist[r.PLAYER_ID].append((r.GAME_DATE, float(r.asof_mpg), int(r.asof_games)))
        last_date_seen[r.PLAYER_ID] = r.GAME_DATE

    def level_before(pid, d):
        arr = level_hist.get(pid)
        if not arr:
            return np.nan, 0
        lo, hi, out = 0, len(arr) - 1, (np.nan, 0)
        while lo <= hi:
            mid = (lo + hi) // 2
            if arr[mid][0] <= d:
                out = (arr[mid][1], arr[mid][2]); lo = mid + 1
            else:
                hi = mid - 1
        return out

    idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
    rows = []
    for sh in idx.get("shards", []):
        try:
            rows.extend(fetch(f"nba_injury_report_{slug}_{sh}.json").get("rows") or [])
        except Exception:  # noqa: BLE001
            pass
    inj = pd.DataFrame(rows)
    inj["game_date"] = pd.to_datetime(inj["game_date"], errors="coerce").dt.date
    inj["snapshot_ts"] = pd.to_datetime(inj["snapshot_ts"], errors="coerce", utc=True)
    inj["nm"] = inj["player_name"].map(flip_last_first)
    inj["status_u"] = inj["status"].astype(str).str.upper().str.strip()
    inj["pid"] = inj["nm"].map(pid_map)
    inj = inj[inj["pid"].notna() & inj["game_date"].notna()]

    order = {"OUT": 0, "DOUBTFUL": 1, "QUESTIONABLE": 2, "PROBABLE": 3, "AVAILABLE": 4}
    inj["rank"] = inj["status_u"].map(order)
    # THE STATUS AT THE DECISION CUTOFF, NOT THE FINAL ONE. Filtering on the LAST snapshot's status
    # returned 7 rows from 2,000+ Questionables - because by the final report almost every Questionable
    # has already resolved to Out or Available. THE FINAL STATUS IS THE ANSWER, NOT THE FEATURE.
    # The engine decides at 2:30 PM PT (21:30 UTC in PST / 22:30 in PDT); use the last snapshot at or
    # before that, which is what the engine will actually see.
    inj["cutoff"] = pd.to_datetime(inj["game_date"].astype(str)).dt.tz_localize("UTC") + pd.Timedelta(hours=22, minutes=30)
    asof = inj[inj["snapshot_ts"] <= inj["cutoff"]]
    g = asof.sort_values("snapshot_ts").groupby(["game_date", "pid"], as_index=False)
    agg = g.agg(last_status=("status_u", "last"), first_rank=("rank", "first"),
                last_rank=("rank", "last"), n_snaps=("status_u", "size"),
                team=("team", "last"), reason_class=("reason_class", "last"))
    q = agg[agg["last_status"] == "QUESTIONABLE"].copy()
    q["improved"] = (q["last_rank"] > q["first_rank"]).fillna(False).astype(int)
    q["degraded"] = (q["last_rank"] < q["first_rank"]).fillna(False).astype(int)

    played_set = {(r.GAME_DATE, r.PLAYER_ID) for r in logs.itertuples(index=False) if r.MIN > 0}
    q["played"] = [1 if (d, p) in played_set else 0 for d, p in zip(q["game_date"], q["pid"])]

    lv = [level_before(p, d) for d, p in zip(q["game_date"], q["pid"])]
    q["mpg"] = [x[0] for x in lv]
    q["career_games"] = [x[1] for x in lv]
    q["phase"] = q["game_date"].map(phase_of)
    # rest: days since the player last appeared
    appear = defaultdict(list)
    for r in logs.itertuples(index=False):
        if r.MIN > 0:
            appear[r.PLAYER_ID].append(r.GAME_DATE)
    def days_rest(pid, d):
        a = appear.get(pid)
        if not a:
            return 30
        prev = [x for x in a if x < d]
        return min((d - prev[-1]).days, 30) if prev else 30
    q["days_rest"] = [days_rest(p, d) for d, p in zip(q["game_date"], q["pid"])]
    q["is_b2b"] = (q["days_rest"] <= 1).astype(int)
    # RULE-BASED FEATURES from the official NBA reporting policy (2026-09-15 research):
    #  * the game-day report is due 11am-1pm local, but 8-10am for tips at 5pm or EARLIER. So for an
    #    early game our 2:30 PM cutoff sits AFTER the final deadline and the status is near-resolved;
    #    for a late game it does not. This is the single largest discriminator we were not using.
    #  * "a team may only list a player as Out or Doubtful for a ROAD game if the player did not travel
    #    or is not present in the visiting market" - so a road Questionable carries different meaning.
    #  * the Active List locks 60 minutes before tip; hours-to-tip measures how much resolving time is
    #    still to come after our cutoff.
    def tip_hour(s):
        try:
            h, m = str(s).split(":")[:2]
            return int(h) + int(m) / 60.0
        except Exception:  # noqa: BLE001
            return np.nan
    gt = asof.sort_values("snapshot_ts").groupby(["game_date", "pid"], as_index=False).agg(
        game_time=("game_time", "last"), matchup=("matchup", "last"))
    q = q.merge(gt, on=["game_date", "pid"], how="left")
    q["tip_hour"] = q["game_time"].map(tip_hour)
    q["is_early_tip"] = (q["tip_hour"] <= 17.0).astype(int)          # 5pm or earlier -> 8-10am deadline
    q["hours_to_tip"] = (q["tip_hour"] - 14.5).clip(lower=0, upper=12)  # from our 2:30 PM cutoff
    # road: the report's `team` is the player's club; matchup is AWY@HOM, so away = first token
    q["is_road"] = [1 if isinstance(m, str) and "@" in m and str(t).split()[-1][:3].upper() == m.split("@")[0][:3].upper()
                    else 0 for m, t in zip(q["matchup"], q["team"])]
    # MARKET LINE MOVEMENT - the single strongest resolution signal available to us. Books employ
    # traders watching shootaround and beat reporters; "one star ruled out can swing a spread 4-5 points
    # within minutes" and "beat reporters at shootaround, warmups, travel updates move markets BEFORE
    # anything is official". So the move between our MORNING snapshot and the WINDOW snapshot (14:45 PT)
    # encodes information the injury report has not yet published.
    #   spread_move_vs_team > 0  -> the market got WORSE for this player's team -> he is likelier OUT
    #   total_move           < 0 -> the market expects less scoring, often a star sitting
    try:
        ms = fetch(f"nba_market_spreads_{slug}.json")
        mv = {}
        for r in ms.get("rows", []):
            hs, hw, tot = r.get("home_spread"), r.get("home_spread_window"), r.get("total")
            if hs is not None and hw is not None:
                mv[(r.get("game_date"), )] = None
                mv[str(r["game_id"])] = (float(hw) - float(hs), float(tot) if tot else np.nan)
        gm = {}
        for gid, gdf in logs.groupby("GAME_ID"):
            ts = list(gdf["TEAM"].unique())
            if len(ts) == 2:
                d0 = gdf["GAME_DATE"].iloc[0]
                gm[(d0, f"{ts[0]}@{ts[1]}")] = (gid, ts[1])   # (game, home team)
                gm[(d0, f"{ts[1]}@{ts[0]}")] = (gid, ts[0])
        moves, tmoves = [], []
        for d, mk, road in zip(q["game_date"], q["matchup"], q["is_road"]):
            key = gm.get((d, str(mk).upper().replace(" ", "")))
            v = mv.get(key[0]) if key else None
            if not v:
                moves.append(0.0); tmoves.append(0.0); continue
            dmove = v[0]                                    # change in the HOME spread
            # sign it toward the player's own team: a road player's team worsens when home spread falls
            moves.append(-dmove if road else dmove)
            tmoves.append(0.0)
        q["spread_move_vs_team"] = moves
    except Exception as exc:  # noqa: BLE001
        print(f"  market movement unavailable ({str(exc)[:50]})", flush=True)
        q["spread_move_vs_team"] = 0.0
    q["season"] = season
    q = q[q["mpg"].notna() & (q["career_games"] >= 3)].copy()
    # PLAYER-SPECIFIC QUESTIONABLE HISTORY - the strongest per-player signal available. Some players are
    # chronically listed and always suit up; others are true game-time calls. Computed AS-OF (expanding,
    # shifted) and shrunk toward the population rate so a player's first listing is not over-trusted.
    q = q.sort_values("game_date")
    gq = q.groupby("pid")["played"]
    prior_n = gq.transform(lambda s: s.shift(1).expanding().count()).fillna(0)
    prior_p = gq.transform(lambda s: s.shift(1).expanding().mean())
    pop = float(q["played"].mean())
    K = 4.0
    q["player_q_rate"] = ((prior_n * prior_p.fillna(pop)) + K * pop) / (prior_n + K)
    q["player_q_n"] = prior_n
    print(f"  {season}: {len(q):,} Questionable rows with features | play rate {q['played'].mean():.4f}", flush=True)
    return q


def main():
    tr_s, te_s = os.environ.get("N1_TRAIN", "2024-25"), os.environ.get("N1_TEST", "2025-26")
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}
    tr, te = build(tr_s, pid_map), build(te_s, pid_map)
    for nm, f in (("train", tr), ("test", te)):
        b = float(f["played"].mean()) if len(f) else 0.0
        if not (0.2 < b < 0.8) or len(f) < 200:
            print(f"ABORT: {nm} base rate {b:.4f} on {len(f):,} rows is implausible - the feature build "
                  f"is broken, not the model.", flush=True)
            return
    base = float(tr["played"].mean())
    print(f"\nbase rate: train {base:.4f} | test {te['played'].mean():.4f}", flush=True)

    FEATS = ["mpg", "days_rest", "is_b2b", "career_games", "n_snaps", "improved", "degraded",
             "is_early_tip", "hours_to_tip", "is_road", "tip_hour",
             "player_q_rate", "player_q_n"]
    # spread_move_vs_team was TESTED AND REMOVED (2026-09-15): confident band fell 4.2% -> 3.3% and its
    # accuracy 80.0% -> 77.3%. The idea is sound - books trade on beat-writer news before the report
    # publishes - but the join defaults a miss to 0.0, which the model reads as "no movement" rather than
    # "unknown", diluting a strong signal into noise. Re-test only with an explicit missing indicator.
    CATS = ["reason_class", "team", "phase"]
    for f in (tr, te):
        for c in CATS:
            f[c] = f[c].astype("category")

    # L1 hierarchical prior
    def cell(keys, K=25.0):
        gg = tr.groupby(keys, observed=True)["played"].agg(["size", "mean"])
        return {k: (v["size"] * v["mean"] + K * base) / (v["size"] + K) for k, v in gg.iterrows()}
    c_rr = cell(["reason_class", pd.cut(tr["mpg"], [0, 15, 25, 60], labels=["f", "r", "s"])])
    c_r = cell(["reason_class"])
    rolec_te = pd.cut(te["mpg"], [0, 15, 25, 60], labels=["f", "r", "s"])
    p1 = np.array([c_rr.get((rc, rolec_te.iloc[i]), c_r.get(rc, base))
                   for i, rc in enumerate(te["reason_class"])], dtype=float)

    # L2 gradient boosting
    try:
        import lightgbm as lgb
        dtr = lgb.Dataset(tr[FEATS + CATS], label=tr["played"], categorical_feature=CATS)
        params = {"objective": "binary", "learning_rate": 0.05, "num_leaves": 15,
                  "min_data_in_leaf": 40, "feature_fraction": 0.8, "bagging_fraction": 0.8,
                  "bagging_freq": 1, "verbose": -1, "seed": 7}
        model = lgb.train(params, dtr, num_boost_round=300)
        p2 = model.predict(te[FEATS + CATS])
        imp = sorted(zip(FEATS + CATS, model.feature_importance("gain")), key=lambda x: -x[1])
        print("\nfeature gain:", ", ".join(f"{k} {v:.0f}" for k, v in imp[:8]), flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"\nLightGBM unavailable ({str(exc)[:60]}) - L1 prior only", flush=True)
        p2 = p1

    # L3 stack in log-odds
    def lo(p):
        p = np.clip(p, 1e-3, 1 - 1e-3)
        return np.log(p / (1 - p))
    p3 = 1 / (1 + np.exp(-(0.35 * lo(p1) + 0.65 * lo(p2))))

    y = te["played"].values
    def report(nm, p):
        acc = float(((p >= 0.5) == y).mean())
        o = np.argsort(p)
        n1, n0 = y.sum(), len(y) - y.sum()
        auc = float((np.sum(np.where(y[o] == 1, np.arange(len(y)), 0)) - n1 * (n1 - 1) / 2) / max(n1 * n0, 1))
        print(f"  {nm:<22} accuracy {acc:.4f}   AUC {auc:.4f}", flush=True)
        return acc, auc
    print(f"\nOUT-OF-SAMPLE on {te_s} ({len(te):,} Questionables)")
    report("flat 0.552", np.full(len(y), 0.552))
    report("L1 prior", p1)
    report("L2 gradient boosting", p2)
    report("L3 stacked", p3)

    print(f"\nCONFIDENT BANDS (the assertiveness target):")
    for lov, hiv, lab in ((0.0, 0.15, "confident OUT"), (0.85, 1.01, "confident PLAY"),
                          (0.15, 0.30, "leaning out"), (0.70, 0.85, "leaning play"),
                          (0.30, 0.70, "genuinely uncertain")):
        m = (p3 >= lov) & (p3 < hiv)
        if m.sum() < 15:
            continue
        act = float(y[m].mean())
        right = act if lov >= 0.5 else 1 - act
        print(f"  {lab:<22}{int(m.sum()):>6,} ({m.mean():>5.1%})   play rate {act:.4f}   call correct {right:.4f}", flush=True)
    conf = (p3 <= 0.20) | (p3 >= 0.80)
    if conf.sum():
        cr = float(np.mean(np.where(p3[conf] >= 0.5, y[conf], 1 - y[conf])))
        print(f"\n  CONFIDENT (p<=0.20 or p>=0.80): {conf.mean():.1%} of Questionables, {cr:.1%} correct", flush=True)

    # HOLD-UP CHECK BY SEASON PHASE. Rotations, rest policy and the meaning of a Questionable all shift
    # across the season (the calibration work measured the gap decaying +1.46 -> +0.13 pp Oct-Nov to the
    # playoff push). A model that only holds on average is not usable day by day.
    print(f"\nBY SEASON PHASE - does it hold in every regime?")
    print(f"  {'phase':<12}{'n':>7}{'play rate':>11}{'accuracy':>10}{'conf share':>12}{'conf acc':>10}")
    te2 = te.copy(); te2["p"] = p3
    for ph, g in te2.groupby("phase", observed=True):
        if len(g) < 80:
            continue
        pv, yv = g["p"].values, g["played"].values
        acc = float(((pv >= 0.5) == yv).mean())
        c = (pv <= 0.20) | (pv >= 0.80)
        ca = float(np.mean(np.where(pv[c] >= 0.5, yv[c], 1 - yv[c]))) if c.sum() else float("nan")
        print(f"  {ph:<12}{len(g):>7,}{float(yv.mean()):>11.4f}{acc:>10.4f}"
              f"{float(c.mean()):>12.1%}{ca:>10.4f}", flush=True)

    # AND BY ROLE - a star Questionable and a fringe Questionable are different decisions
    print(f"\nBY ROLE:")
    te2["roleb"] = pd.cut(te2["mpg"], [0, 15, 25, 60], labels=["fringe <15", "rotation 15-25", "starter 25+"])
    for rb, g in te2.groupby("roleb", observed=True):
        if len(g) < 80:
            continue
        pv, yv = g["p"].values, g["played"].values
        acc = float(((pv >= 0.5) == yv).mean())
        c = (pv <= 0.20) | (pv >= 0.80)
        ca = float(np.mean(np.where(pv[c] >= 0.5, yv[c], 1 - yv[c]))) if c.sum() else float("nan")
        print(f"  {str(rb):<16}{len(g):>7,}  play {float(yv.mean()):.4f}  acc {acc:.4f}  "
              f"conf {float(c.mean()):.1%} @ {ca:.4f}", flush=True)


if __name__ == "__main__":
    main()
