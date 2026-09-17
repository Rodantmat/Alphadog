#!/usr/bin/env python3
"""
AS-OF LADDER CALIBRATION — fixes a parity violation in nba_score.ladder_calibration.

THE DEFECT. The first calibration table was fitted on 2024-25 and applied to 2025-26: a constant carried
across days. NBA_DAILY_PARITY_AND_BACKFILL.md §5 forbids exactly this - "BT_ASOF drives everything; no
constant is carried between days" - and COMPASS fact 6 says every value is "computed in-run from history
as of the day. Nothing pasted." As built it also leaks on a same-season replay (a March 2025 leg would be
corrected by cells fitted on the whole of 2024-25, including April) and would apply two-year-old
constants on opening night.

THE FIX. For every game-day D the correction cell is refit from graded legs STRICTLY BEFORE D:

    shift(prop, phase, band, side | D) = w * [ logit(actual) - logit(predicted) ]  over legs < D
    w = n / (n + K)                                       shrunk by the evidence behind the cell
    prior season carried in as the STARTING PRIOR, decayed as current-season evidence accumulates

That makes one code path valid for three cases that used to need three:
  * a replay of any past day      - uses only what was gradeable before it
  * a live day mid-season         - same
  * opening night of a new season - no current-season legs exist, so every cell inherits the prior
                                    season's SAME-PHASE cell (October inherits October), which is what
                                    makes the phase pattern transfer rather than needing a month to warm

WHY THE PHASE DIMENSION SURVIVES THIS. The gap decays +1.46 -> +1.30 -> +0.88 -> +0.13 pp across
Oct-Nov / Dec-ASB / post-ASB / playoff push. As-of fitting cannot see the current season's later phases,
so each phase's correction comes from the PRIOR season's same phase until the current season provides
its own - the regime is calendar-anchored, so that inheritance is legitimate rather than a fallback.

Output: nba_score.ladder_calibration_asof (prop, as_of_date, phase, band, side, shift, n, source)
Env: DATABASE_URL, AC_SEASONS, AC_K, AC_PROPS, AC_CADENCE_DAYS
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
BANDS = [0, .40, .45, .50, .55, .60, .65, .70, .75, .80, .85, 1.0]


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def phase_of(dt):
    m, day = dt.month, dt.day
    if m in (10, 11):
        return "1_oct_nov"
    if m == 12 or m == 1 or (m == 2 and day < 15):
        return "2_dec_asb"
    if (m == 2 and day >= 15) or (m == 3 and day < 16):
        return "3_post_asb"
    return "4_push"


def graded(season, conn, pid_map, props):
    """Every leg with a final HP and a realised outcome, in date order."""
    f = pd.read_sql("""SELECT game_date, player_id, prop, line, side, baseline_hp
                       FROM nba_score.final_hp WHERE season=%s AND prop = ANY(%s)""",
                    conn, params=(season, props))
    if f.empty:
        return f
    f["game_date"] = pd.to_datetime(f["game_date"]).dt.date
    f["player_id"] = f["player_id"].astype(str)
    f["line"] = f["line"].astype(float)
    o = pd.read_sql("""SELECT game_date, player, line, side, leg_result,
                              replace(replace(market_key,'player_',''),'_alternate','') AS prop
                       FROM nba_market.board_outcomes
                       WHERE leg_result IN ('over_win','under_win')
                         AND replace(replace(market_key,'player_',''),'_alternate','') = ANY(%s)""",
                    conn, params=(props,))
    o["game_date"] = pd.to_datetime(o["game_date"]).dt.date
    o["player_id"] = o["player"].map(norm_name).map(pid_map)
    o = o[o["player_id"].notna()]
    o["line"] = o["line"].astype(float)
    d = f.merge(o[["game_date", "player_id", "prop", "line", "side", "leg_result"]],
                on=["game_date", "player_id", "prop", "line", "side"], how="inner")
    if d.empty:
        return d
    d["won"] = np.where(d["side"] == "Over", d["leg_result"] == "over_win",
                        d["leg_result"] == "under_win").astype(int)
    d["phase"] = d["game_date"].map(phase_of)
    d["band"] = pd.cut(d["baseline_hp"].astype(float), BANDS).astype(str)
    return d.sort_values("game_date")


def main():
    seasons = [s.strip() for s in os.environ.get("AC_SEASONS", "2024-25,2025-26").split(",")]
    K = float(os.environ.get("AC_K", "400"))
    cadence = int(os.environ.get("AC_CADENCE_DAYS", "7"))
    props = [p.strip() for p in os.environ.get(
        "AC_PROPS", "points,rebounds,assists,threes_made,pra,pts_reb,pts_ast,reb_ast").split(",") if p.strip()]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.ladder_calibration_asof (
            season text, as_of_date date, prop text, phase text, band text, side text,
            log_odds_shift numeric, n int, source text, built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ladder_cal_asof_uidx
            ON nba_score.ladder_calibration_asof (as_of_date, prop, phase, band, side)""")
        cur.execute("DELETE FROM nba_score.ladder_calibration_asof")

    prior = {}          # cells carried from the previous season, used until current evidence exists
    for season in seasons:
        d = graded(season, conn, pid_map, props)
        if d.empty:
            print(f"{season}: no graded legs", flush=True)
            continue
        dates = sorted(d["game_date"].unique())
        asofs = [x for i, x in enumerate(dates) if i % cadence == 0]
        print(f"{season}: {len(d):,} graded legs | {len(dates)} dates | {len(asofs)} as-of refits", flush=True)
        rows, used_prior, used_own = [], 0, 0
        for asof in asofs:
            hist = d[d["game_date"] < asof]          # STRICTLY BEFORE - this is the whole point
            cells = {}
            if not hist.empty:
                g = hist.groupby(["prop", "phase", "band", "side"], observed=True)["won"].agg(["size", "mean"])
                gp = hist.groupby(["prop", "phase", "band", "side"], observed=True)["baseline_hp"].mean()
                for k, v in g.iterrows():
                    if v["size"] < 50:
                        continue
                    w = v["size"] / (v["size"] + K)
                    cells[k] = (w * (logit(v["mean"]) - logit(float(gp.loc[k]))), int(v["size"]), "own")
            # anything without current-season evidence inherits the PRIOR season's same-phase cell
            for k, (sh, n, _) in prior.items():
                if k not in cells:
                    cells[k] = (sh, n, "prior_season")
            for (pr, ph, bd, sd), (sh, n, src) in cells.items():
                rows.append((season, asof, pr, ph, bd, sd, round(float(sh), 5), int(n), src))
                if src == "own":
                    used_own += 1
                else:
                    used_prior += 1
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_score.ladder_calibration_asof
                (season, as_of_date, prop, phase, band, side, log_odds_shift, n, source)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (as_of_date, prop, phase, band, side) DO UPDATE
                  SET log_odds_shift=EXCLUDED.log_odds_shift, n=EXCLUDED.n, source=EXCLUDED.source""", rows)
        conn.commit()
        print(f"  wrote {len(rows):,} as-of cells ({used_own:,} from current-season evidence, "
              f"{used_prior:,} inherited from the prior season)", flush=True)
        # carry the season's final cells forward as next season's opening prior
        last = d
        g = last.groupby(["prop", "phase", "band", "side"], observed=True)["won"].agg(["size", "mean"])
        gp = last.groupby(["prop", "phase", "band", "side"], observed=True)["baseline_hp"].mean()
        prior = {}
        for k, v in g.iterrows():
            if v["size"] < 50:
                continue
            w = v["size"] / (v["size"] + K)
            prior[k] = (w * (logit(v["mean"]) - logit(float(gp.loc[k]))), int(v["size"]), "prior_season")
        print(f"  carried {len(prior):,} cells forward as the next season's opening prior", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
