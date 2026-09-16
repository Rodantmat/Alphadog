#!/usr/bin/env python3
"""
REMAINING ENRICHMENT FACTORS — A3 return ramp, A4 rest/B2B, D2 travel, K1 coach change.

WHY NOW. The final engine moves the baseline by only ~0.004 on average, because the three factors that
mattered most (blowout, matchup, the injury report) were absorbed INTO the baseline, which is
architecturally correct. These four are the registry's remaining untested candidates - all with data
already backfilled, none ever gated.

Each is tested as a RESIDUAL on the final HP, at the LEG LEVEL, on real graded board legs - the only
metric that decides anything here (COMPASS fact 90: MAE on the mean is blind to distribution reshaping).

  A3 RETURN RAMP    games since the player's last absence. Measured coefficients exist (0.87/0.97/1.01
                    for a 1-2 game absence, 0.79/0.92/0.96 for 3-9, 0.72/0.84/0.92/1.00 for 10+) but
                    were never wired or gated. A player back from a long layoff is on a minutes leash.
  A4 REST / B2B     days of rest, second night of a back-to-back, and 3-games-in-4. The baseline carries
                    B2B as a P(available) effect; this tests it as a PRODUCTION effect on the legs of
                    players who DO play.
  D2 TRAVEL         time-zone change and road-trip length from the schedule.
  K1 COACH CHANGE   games since an in-season coaching change (8 verified dates, both seasons). A new
                    coach re-draws the rotation, so recent form is a worse guide than usual.

GATE: fit the coefficient on the TRAIN season, apply to TEST, keep only if held-out log-loss improves.
Results -> nba_score.factor_gate_results so the verdict is queryable, not trapped in a CI log.

Env: DATABASE_URL, RF_TRAIN, RF_TEST
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


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -20, 20)))


def build(season, conn, pid_map, coach_dates):
    slug = season.replace("-", "_")
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs["MIN"] = pd.to_numeric(logs["MIN"], errors="coerce").fillna(0.0)
    logs = logs.sort_values("GAME_DATE")

    # A3: games since the player's last missed game, and how long that absence was
    team_dates = defaultdict(list)
    for t, g in logs.groupby("TEAM"):
        team_dates[t] = sorted(set(g["GAME_DATE"]))
    played = defaultdict(set)
    for r in logs.itertuples(index=False):
        if r.MIN > 0:
            played[r.PLAYER_ID].add(r.GAME_DATE)
    ramp, absence_len, rest_days, b2b, three_in_four = {}, {}, {}, {}, {}
    for pid, dates in played.items():
        tm = None
        sub = logs[logs["PLAYER_ID"] == pid]
        if sub.empty:
            continue
        tm = sub["TEAM"].iloc[-1]
        sched = team_dates.get(tm, [])
        seen, since, alen, run_missed = 0, 99, 0, 0
        for d in sched:
            if d in dates:
                ramp[(pid, d)] = min(since, 12)
                absence_len[(pid, d)] = min(alen, 20)
                prev = [x for x in sched if x < d]
                rest_days[(pid, d)] = min((d - prev[-1]).days, 10) if prev else 5
                b2b[(pid, d)] = 1 if prev and (d - prev[-1]).days <= 1 else 0
                last4 = [x for x in sched if 0 <= (d - x).days <= 4]
                three_in_four[(pid, d)] = 1 if len(last4) >= 3 else 0
                since = since + 1 if since < 99 else 99
                if run_missed:
                    since, alen, run_missed = 1, run_missed, 0
            else:
                run_missed += 1
                since = 0
    # K1: games since an in-season coach change for the player's team
    coach_since = {}
    for t, sched in team_dates.items():
        chg = sorted(coach_dates.get(t, []))
        for d in sched:
            prior = [c for c in chg if c <= d]
            coach_since[(t, d)] = min((d - prior[-1]).days, 60) if prior else 999

    f = pd.read_sql("""SELECT game_date, game_id, player_id, prop, line, side, final_hp
                       FROM nba_score.final_hp WHERE season=%s""", conn, params=(season,))
    if f.empty:
        return pd.DataFrame()
    f["game_date"] = pd.to_datetime(f["game_date"]).dt.date
    f["player_id"] = f["player_id"].astype(str)

    o = pd.read_sql("""SELECT game_date, player, line, side, leg_result, market_key
                       FROM nba_market.board_outcomes""", conn)
    o["game_date"] = pd.to_datetime(o["game_date"]).dt.date
    o["player_id"] = o["player"].map(norm_name).map(pid_map)
    o["prop"] = o["market_key"].str.replace("player_", "", regex=False).str.replace("_alternate", "", regex=False)
    o = o[o["player_id"].notna() & o["leg_result"].isin(["over_win", "under_win"])]
    o["line"] = o["line"].astype(float)
    f["line"] = f["line"].astype(float)

    d = f.merge(o[["game_date", "player_id", "prop", "line", "side", "leg_result"]],
                on=["game_date", "player_id", "prop", "line", "side"], how="inner")
    if d.empty:
        return d
    d["won"] = np.where(d["side"] == "Over", d["leg_result"] == "over_win",
                        d["leg_result"] == "under_win").astype(int)
    team_of = {(r.PLAYER_ID, r.GAME_DATE): r.TEAM for r in logs.itertuples(index=False)}
    d["a3_since"] = [ramp.get((p, dt), 12) for p, dt in zip(d["player_id"], d["game_date"])]
    d["a3_len"] = [absence_len.get((p, dt), 0) for p, dt in zip(d["player_id"], d["game_date"])]
    d["a4_rest"] = [rest_days.get((p, dt), 3) for p, dt in zip(d["player_id"], d["game_date"])]
    d["a4_b2b"] = [b2b.get((p, dt), 0) for p, dt in zip(d["player_id"], d["game_date"])]
    d["a4_3in4"] = [three_in_four.get((p, dt), 0) for p, dt in zip(d["player_id"], d["game_date"])]
    d["k1_since"] = [coach_since.get((team_of.get((p, dt)), dt), 999)
                     for p, dt in zip(d["player_id"], d["game_date"])]
    d["k1_new"] = (d["k1_since"] <= 20).astype(int)
    return d


def main():
    tr_s, te_s = os.environ.get("RF_TRAIN", "2024-25"), os.environ.get("RF_TEST", "2025-26")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}
    try:
        cc = fetch("nba_coach_changes_backfill.json")
        coach_dates = defaultdict(list)
        for r in (cc.get("changes") or cc.get("rows") or []):
            t = str(r.get("team_abbr") or r.get("team") or "")[:3].upper()
            dt = r.get("effective_date") or r.get("date")
            if t and dt:
                coach_dates[t].append(pd.to_datetime(dt).date())
        print(f"coach changes loaded: {sum(len(v) for v in coach_dates.values())}", flush=True)
    except Exception as exc:  # noqa: BLE001
        coach_dates = {}
        print(f"coach changes unavailable ({str(exc)[:50]}) - K1 will be inert", flush=True)

    tr, te = build(tr_s, conn, pid_map, coach_dates), build(te_s, conn, pid_map, coach_dates)
    if tr.empty or te.empty:
        print(f"insufficient graded legs (train {len(tr)}, test {len(te)}) - "
              f"run the final engine with FE_WRITE=1 for both seasons first")
        return
    print(f"train {tr_s}: {len(tr):,} graded legs | test {te_s}: {len(te):,}\n", flush=True)

    def score(p, y):
        p = np.clip(p, 1e-4, 1 - 1e-4)
        return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))

    y_te = te["won"].values
    base_ll = score(te["final_hp"].values, y_te)
    print(f"{'factor':<26}{'n_test':>9}{'base LL':>10}{'with factor':>13}{'gain':>9}   verdict")
    out = []
    FACTORS = {
        "A3 return ramp": ["a3_since", "a3_len"],
        "A4 rest / b2b / 3-in-4": ["a4_rest", "a4_b2b", "a4_3in4"],
        "K1 coach change": ["k1_since", "k1_new"],
        "A3 + A4 + K1 combined": ["a3_since", "a3_len", "a4_rest", "a4_b2b", "a4_3in4", "k1_new"],
    }
    for name, cols in FACTORS.items():
        X = np.column_stack([np.ones(len(tr))] + [tr[c].astype(float).values for c in cols])
        yv = logit(np.clip(tr["won"].values * 0.98 + 0.01, 1e-3, 1 - 1e-3)) - logit(tr["final_hp"].values)
        beta, *_ = np.linalg.lstsq(X, yv, rcond=None)
        Xt = np.column_stack([np.ones(len(te))] + [te[c].astype(float).values for c in cols])
        adj = Xt @ beta - beta[0]                      # drop the intercept: a level shift is not a factor
        p_new = sigmoid(logit(te["final_hp"].values) + adj)
        ll = score(p_new, y_te)
        gain = base_ll - ll
        ok = gain > 0.0005
        print(f"{name:<26}{len(te):>9,}{base_ll:>10.4f}{ll:>13.4f}{gain:>+9.4f}   "
              f"{'WIRE IN' if ok else 'reject'}", flush=True)
        out.append((te_s, "remaining_factors", name, len(te), round(ll, 5), 0.0, round(gain, 5), 0.0))
    with conn.cursor() as cur:
        cur.execute("DELETE FROM nba_score.factor_gate_results WHERE slice='remaining_factors'")
        cur.executemany("""INSERT INTO nba_score.factor_gate_results
            (season, slice, model, n, log_loss, brier, gain_vs_anchor, shrink_beta)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            out + [(te_s, "remaining_factors", "final_hp baseline", len(te), round(base_ll, 5), 0.0, 0.0, 0.0)])
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
