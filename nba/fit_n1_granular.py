#!/usr/bin/env python3
"""
N1 v2 — GRANULAR P(plays | Questionable). The target is per-player assertiveness, not a flat 55%.

WHY THIS MATTERS AND WHAT IT CANNOT DO. Joint-branch prediction over k uncertain players is p^k: with
three Questionables, 90% joint needs 96.5% PER PLAYER. That is the wrong thing to chase - the scenario
architecture exists so the engine never has to guess the joint state: it enumerates every branch and
SELECTS when the 2:30 report resolves them. Coverage is 100% by construction.

What DOES need to be sharp is the per-player probability, because it (a) weights the branches for the
pre-2:30 view, (b) prices the residual uncertainty for players still unresolved at tip, and (c) decides
whether a leg is playable at all. A flat 0.552 is a coin flip; the resolution is NOT a coin flip once
you condition on what the report actually says.

FEATURES, all as-of and all from data we already hold:
  reason_class      injury / rest / personal / G-League two-way / illness (measured: two-way 0.271,
                    back 0.488, soft tissue 0.539 - a 27-point spread already)
  team              ATL 0.326 ... GSW 0.676 - teams differ in how they use the designation
  role             rotation (>=15 mpg) 0.552 vs fringe 0.312
  days_since_listed how long the player has been carrying this status
  games_missed      consecutive absences immediately before this game
  b2b               second night of a back-to-back
  phase             season regime
  status_churn      did the status IMPROVE (Out -> Doubtful -> Questionable) or DEGRADE across the day's
                    snapshots - a player upgraded toward availability is far likelier to play
  snapshot_count    how many times the report was amended for him today

Fitted on TRAIN season, graded on TEST. Reported: accuracy at a 0.5 cut, AUC, and - the number that
matters for the owner's demand - what share of Questionables land in a CONFIDENT band (p<=0.15 or
p>=0.85) and how accurate the call is inside that band.

Env: DATABASE_URL, N1_TRAIN, N1_TEST
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
    slug = season.replace("-", "_")
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs = logs.sort_values("GAME_DATE")

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

    # per (game_date, player): the LAST status, how many amendments, and whether it improved
    order = {"OUT": 0, "DOUBTFUL": 1, "QUESTIONABLE": 2, "PROBABLE": 3, "AVAILABLE": 4}
    inj["rank"] = inj["status_u"].map(order)
    g = inj.sort_values("snapshot_ts").groupby(["game_date", "pid"])
    agg = g.agg(last_status=("status_u", "last"), first_rank=("rank", "first"),
                last_rank=("rank", "last"), n_snaps=("status_u", "size"),
                team=("team", "last"), reason_class=("reason_class", "last")).reset_index()
    q = agg[agg["last_status"] == "QUESTIONABLE"].copy()
    q["improved"] = (q["last_rank"] > q["first_rank"]).astype(int)
    q["degraded"] = (q["last_rank"] < q["first_rank"]).astype(int)

    played = {(r.GAME_DATE, r.PLAYER_ID): float(r.MIN) for r in logs.itertuples(index=False)}
    q["played"] = [1 if played.get((d, p), 0) > 0 else 0 for d, p in zip(q["game_date"], q["pid"])]

    # as-of role, consecutive games missed, and rest
    hist = defaultdict(lambda: [0.0, 0])
    missed = defaultdict(int)
    lastdate = {}
    dates = sorted(set(logs["GAME_DATE"]) | set(q["game_date"]))
    role, cons, rest = {}, {}, {}
    played_by_date = logs.groupby("GAME_DATE")["PLAYER_ID"].apply(set).to_dict()
    team_dates = defaultdict(set)
    for r in logs.itertuples(index=False):
        team_dates[r.TEAM].add(r.GAME_DATE)
    for d in dates:
        pl = played_by_date.get(d, set())
        for (gd, pid) in list(zip(q["game_date"], q["pid"])):
            pass
        for pid in set(q[q["game_date"] == d]["pid"]):
            h = hist.get(pid)
            role[(d, pid)] = (h[0] / h[1]) if h and h[1] else np.nan
            cons[(d, pid)] = missed.get(pid, 0)
            rest[(d, pid)] = (d - lastdate[pid]).days if pid in lastdate else 99
        for pid in pl:
            h = hist[pid]
            h[0] += 0; h[1] += 0
        for r in logs[logs["GAME_DATE"] == d].itertuples(index=False):
            h = hist[r.PLAYER_ID]
            h[0] += float(r.MIN); h[1] += 1
            missed[r.PLAYER_ID] = 0
            lastdate[r.PLAYER_ID] = d
        for pid in set(q[q["game_date"] == d]["pid"]) - pl:
            missed[pid] = missed.get(pid, 0) + 1

    q["mpg"] = [role.get((d, p), np.nan) for d, p in zip(q["game_date"], q["pid"])]
    q["games_missed"] = [cons.get((d, p), 0) for d, p in zip(q["game_date"], q["pid"])]
    q["days_rest"] = [min(rest.get((d, p), 99), 30) for d, p in zip(q["game_date"], q["pid"])]
    q["phase"] = q["game_date"].map(phase_of)
    q["is_b2b"] = (q["days_rest"] <= 1).astype(int)
    return q[q["mpg"].notna()].copy()


def main():
    tr_s, te_s = os.environ.get("N1_TRAIN", "2024-25"), os.environ.get("N1_TEST", "2025-26")
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}
    tr, te = build(tr_s, pid_map), build(te_s, pid_map)
    print(f"train {tr_s}: {len(tr):,} Questionable rows | test {te_s}: {len(te):,}", flush=True)
    print(f"base rate: train {tr['played'].mean():.4f} | test {te['played'].mean():.4f}\n", flush=True)

    # hierarchical shrunk cells, coarse -> fine, each fitted on TRAIN only
    def cell(keys, K=25.0):
        g = tr.groupby(keys, observed=True)["played"].agg(["size", "mean"])
        base = float(tr["played"].mean())
        return {k: (v["size"] * v["mean"] + K * base) / (v["size"] + K) for k, v in g.iterrows()}, base

    c_rc, base = cell(["reason_class"])
    c_rc_role, _ = cell(["reason_class", pd.cut(tr["mpg"], [0, 15, 25, 60], labels=["fringe", "rot", "starter"])])
    c_team, _ = cell(["team"])
    c_miss, _ = cell([pd.cut(tr["games_missed"], [-1, 0, 1, 3, 99], labels=["0", "1", "2-3", "4+"])])
    c_improved, _ = cell(["improved"])

    def predict(d):
        rolec = pd.cut(d["mpg"], [0, 15, 25, 60], labels=["fringe", "rot", "starter"])
        missc = pd.cut(d["games_missed"], [-1, 0, 1, 3, 99], labels=["0", "1", "2-3", "4+"])
        out = []
        for i, r in enumerate(d.itertuples(index=False)):
            p = c_rc_role.get((r.reason_class, rolec.iloc[i]))
            if p is None:
                p = c_rc.get(r.reason_class, base)
            # multiplicative nudges in log-odds from the independent signals
            lo = np.log(np.clip(p, .02, .98) / (1 - np.clip(p, .02, .98)))
            for tbl, key in ((c_team, r.team), (c_miss, missc.iloc[i]), (c_improved, r.improved)):
                v = tbl.get(key)
                if v is not None:
                    lo += 0.5 * (np.log(np.clip(v, .02, .98) / (1 - np.clip(v, .02, .98)))
                                 - np.log(base / (1 - base)))
            out.append(1 / (1 + np.exp(-lo)))
        return np.array(out)

    p = predict(te)
    y = te["played"].values
    acc_flat = float(((np.full(len(y), 0.552) >= 0.5) == y).mean())
    acc = float(((p >= 0.5) == y).mean())
    order = np.argsort(p)
    auc = float((np.sum(np.where(y[order] == 1, np.arange(len(y)), 0)) - (y.sum() * (y.sum() - 1) / 2))
                / max(y.sum() * (len(y) - y.sum()), 1))
    print(f"ACCURACY at a 0.5 cut   flat 0.552 model {acc_flat:.4f}   ->   GRANULAR {acc:.4f}")
    print(f"AUC {auc:.4f}\n", flush=True)

    print("THE NUMBER THAT MATTERS - confident calls and how right they are:")
    for lo, hi, lab in ((0.0, 0.15, "confident OUT  (p<=0.15)"), (0.85, 1.01, "confident PLAY (p>=0.85)"),
                        (0.15, 0.30, "leaning out"), (0.70, 0.85, "leaning play"), (0.30, 0.70, "genuinely uncertain")):
        m = (p >= lo) & (p < hi)
        if m.sum() < 20:
            continue
        actual = float(y[m].mean())
        right = actual if lo >= 0.5 else 1 - actual
        print(f"  {lab:<26}{int(m.sum()):>6,} legs ({m.mean():>5.1%})   actual play rate {actual:.4f}   "
              f"call correct {right:.4f}", flush=True)
    conf = ((p <= 0.15) | (p >= 0.85))
    if conf.sum() > 0:
        cr = float(np.mean(np.where(p[conf] >= 0.5, y[conf], 1 - y[conf])))
        print(f"\n  CONFIDENT BAND OVERALL: {conf.mean():.1%} of Questionables, {cr:.1%} correct", flush=True)


if __name__ == "__main__":
    main()
