#!/usr/bin/env python3
"""
FINAL SET, LIVE (owner 2026-11-26 10:41 PT: "build it as I told you ... no compromises, no cuts ... make them all work, certified and validated").
The live twin of the research that chose the final set (research_final.py / research_final2.py), built from the research's OWN code so the legs, the
numbers and the slips are the same:
  LEGS      today's board legs of an app, from the same loaders the research tables were built with (PrizePicks: nba_market.pp_leg_price window; Underdog:
            ud_live_slip_engine.load_legs; Sleeper / Fliff: research_roi_slip_sweep_apps.load_day2), no result.
  NUMBERS   research_leg_model_h.load with LIVE set: the same features (form, minutes, rest, injury report, sportsbook chance, trailing hit rates ...), the month's
            walk-forward models (blend, gbm, gbm_s) fitted on everything before the month, predicting today's legs. Model chance `ph` = production's baseline
            ladder for the day (the live twin of baseline_history_h); fhp / score / confidence = nba_score.board_scored (P3).
  SLIPS     every strategy of nba/final_set.json built exactly as research_universe2.stage_b does (sort, one leg a player, games cap, props, start rank, slips a
            slate, alternates cap), merged per app in the research's order with the app's player cap and slot count (research_best.merge).
Modes (FL_MODE): replay (past dates, hides their results, grades them) | live | dry | legs-check.   Env: DATABASE_URL, FL_APP, FL_DATES, FL_PH (h | prod).
"""
import datetime as dt
import json
import math
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
T0 = time.time()
APP = (os.environ.get("FL_APP") or "underdog").lower()
os.environ["LM_APP"] = APP; os.environ["LM_TRAIL"] = "1"; os.environ["UA_APP"] = APP
os.environ["APP"] = "UD"; os.environ["SW_APP"] = APP if APP in ("sleeper", "fliff") else "sleeper"

FINAL = json.loads((HERE / "final_set.json").read_text())
SLOTS = FINAL["slots"]; CAPS = FINAL["caps"]
SET = [s for s in FINAL["set"] if s["app"] == APP]
SINGLE_PROPS = {"points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers"}


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def season_of(d):
    y = d.year if d.month >= 8 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


# ---------------------------------------------------------------------------------------------------------------- baseline ladders (model chance)
def ladders_day(conn, gd, mode):
    """{(gd, player, prop): (lines, p_more)} for ONE slate. h = the honest history table the research used; prod = production's own baseline for the day (live)."""
    H = {}
    if mode == "h":
        for g, pid, prop, lines, pm in conn.execute("SELECT game_date::text, player_id, prop, lines, p_more FROM nba_score.baseline_history_h WHERE game_date = %s", (gd,)).fetchall():
            H[(g, pid, prop)] = (np.asarray(lines, float), np.asarray(pm, float))
        return H
    tmp = defaultdict(dict)
    for g, pid, prop, line, pm in conn.execute("""SELECT game_date::text, player_id, prop, line::float8, p_more::float8 FROM nba_score.baseline_history
                                                  WHERE game_date = %s AND period = 'FULL' AND p_more IS NOT NULL""", (gd,)).fetchall():
        tmp[(g, pid, prop)][line] = pm
    for k, d in tmp.items():
        ls = sorted(d); H[k] = (np.asarray(ls, float), np.asarray([d[x] for x in ls], float))
    return H


def hb_day(conn, gd, mode):
    t = "baseline_history_h" if mode == "h" else "baseline_history"
    extra = "" if mode == "h" else " AND period = 'FULL'"
    q = f"""SELECT DISTINCT ON (player_id, prop) game_date::text gd, player_id, prop, anchor::float8 anchor, role_tier, var_band, proj_min::float8 proj_min
            FROM nba_score.{t} WHERE game_date = %s{extra} ORDER BY player_id, prop"""
    return pd.read_sql(q, conn, params=(gd,))


# ---------------------------------------------------------------------------------------------------------------- legs
def legs_pp(conn, gd, H):
    import research_legs_h_build as LH
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    df = pd.read_sql("""SELECT game_date::text gd, nm, base_market, side, line::float8 line, kind, tier, anchor_line::float8 anchor_line, factor::float8 f_model
                        FROM nba_market.pp_leg_price WHERE snapshot_label = 'window' AND game_date = %s
                          AND kind IN ('standard', 'goblin', 'demon') AND NOT coalesce(kind_position_mismatch, false) AND base_market = ANY(%s)""",
                     conn, params=(gd, list(LH.MK)))
    if not len(df):
        return df
    df = df.drop_duplicates(["gd", "nm", "base_market", "side", "line"])
    df = df[(df["kind"] == "standard") | df["f_model"].notna()].copy()
    df["prop"] = df["base_market"].map(LH.MK); df["player_id"] = df["nm"].map(ids)
    std = df[df["kind"] == "standard"].groupby(["gd", "nm", "base_market"])["line"].first().rename("std_line")
    df = df.join(std, on=["gd", "nm", "base_market"]); df["std_line"] = df["std_line"].fillna(df["anchor_line"])
    df["has_std"] = df.groupby(["gd", "nm", "base_market"])["kind"].transform(lambda x: (x == "standard").any())
    df = df[df["player_id"].notna()].copy()
    m = np.ones(len(df)); lfm = np.log(np.clip(df["f_model"].fillna(1.0).values, .05, 50)); sl = np.maximum(1.0, df["std_line"].fillna(df["line"]).values)
    rel = (df["line"].values - df["std_line"].fillna(df["line"]).values) / sl; lvl = np.log(sl); tr = df["tier"].fillna(0).astype(float).values
    for kd, b in LH.COEF.items():
        k = (df["kind"] == kd).values
        x = b[0] + b[1] * lfm[k] + b[2] * lfm[k] ** 2 + b[3] * rel[k] + b[4] * lvl[k] + b[5] * tr[k]
        pr = df["prop"].values[k]
        for p_, c in LH.GRPC.items():
            x = x + b[c] * (pr == p_)
        x = x + b[9] * np.isin(pr, list(LH.COMBO))
        m[k] = np.clip(np.exp(x), 0.535, 0.967) if kd == "goblin" else np.clip(np.exp(x), 1.097, 7.51)
    ua = (df["kind"].isin(["goblin", "demon"]) & ~df["side"].str.lower().str.startswith("o")).values
    m[ua] = (np.exp(lfm[ua]) / 0.95 * 3.0 / 2.99) ** (1 / 0.904)
    df["m"] = m
    over = df["side"].str.lower().str.startswith("o").values
    df["ph"] = LH.attach(df["gd"].values, df["player_id"].values, df["prop"].values, df["line"].values, over, H)
    df["app"] = "prizepicks"; df["src"] = "real"; df["season"] = season_of(dt.date.fromisoformat(gd)); df["game_date"] = df["gd"]; df["p_stored"] = np.nan
    df["tier"] = df["tier"].fillna(0).astype(int).astype(str) + np.where(df["has_std"], "", "-ns") + np.where(ua, "-u", "")
    return df[["app", "src", "season", "game_date", "player_id", "prop", "side", "line", "kind", "tier", "m", "ph", "p_stored"]].copy()


def legs_ud(conn, gd, H):
    import research_app_final_strategies as AF
    import research_legs_h_build as LH
    legs = [b for b in AF.load_ud(conn, gd, {})[0]]
    rows = [(str(l.get("player_id") or l.get("player") or ""), l["prop"], str(l["side"]), float(l.get("line") or 0), str(l.get("tier") or ""), float(l["m"]),
             float(l["p"]), l.get("event_id")) for l in legs if l.get("m")]
    df = pd.DataFrame(rows, columns=["player_id", "prop", "side", "line", "tier", "m0", "p_stored", "event_id"])
    if not len(df):
        return df
    df["kind"] = df["tier"].str[:1]; df["m"] = df["m0"] * 1.8708
    df["kind"] = df["kind"].replace("", "main")
    over = df["side"].str.lower().str[0].isin(["o", "m", "h"]).values
    df["ph"] = LH.attach(np.full(len(df), gd), df["player_id"].values, df["prop"].values, df["line"].values, over, H)
    df["app"] = "underdog"; df["src"] = "real"; df["season"] = season_of(dt.date.fromisoformat(gd)); df["game_date"] = gd
    return df[["app", "src", "season", "game_date", "player_id", "prop", "side", "line", "kind", "tier", "m", "ph", "p_stored", "event_id"]].copy()


def legs_sf(conn, gd, H):
    import research_roi_slip_sweep_apps as M
    import research_legs_h_build as LH
    b = M.load_day2(conn, gd, [APP, "draftkings", "bovada"])
    rows = [(str(l["player_id"]), l["prop"], str(l["side"]), float(l["line"]), "", str(l["kind"]), float(l["m"]), float(l["p"]), l.get("event_id")) for l in b.get(APP, {}).values() if l["p"] is not None]
    df = pd.DataFrame(rows, columns=["player_id", "prop", "side", "line", "tier", "kind", "m", "p_stored", "event_id"])
    if not len(df):
        return df
    over = df["side"].str.lower().str[0].isin(["o", "m", "h"]).values
    df["ph"] = LH.attach(np.full(len(df), gd), df["player_id"].values, df["prop"].values, df["line"].values, over, H)
    df["app"] = APP; df["src"] = "real"; df["season"] = season_of(dt.date.fromisoformat(gd)); df["game_date"] = gd
    return df[["app", "src", "season", "game_date", "player_id", "prop", "side", "line", "kind", "tier", "m", "ph", "p_stored", "event_id"]].copy()


def day_legs(conn, gd, mode):
    H = ladders_day(conn, gd, mode)
    f = {"prizepicks": legs_pp, "underdog": legs_ud}.get(APP, legs_sf)
    df = f(conn, gd, H)
    if len(df):
        df = df.copy(); df["hit"] = np.nan; df["gd"] = gd
        df["m"] = df["m"].astype(float); df["line"] = df["line"].astype(float)
    return df


# ---------------------------------------------------------------------------------------------------------------- game-log placeholders for the slate
def placeholders(conn, gd, pids):
    """one game-log row a player of the slate (no stats): team, game, home - the pre-game features read only EARLIER rows, so the placeholder gives today's legs the
    same features the played game's row gave them in the research; plus one row a team of the slate so the opponent / injury lookups resolve"""
    import ud_live_slip_engine as UD
    games = conn.execute("SELECT game_id::text, home_team_id::text, away_team_id::text FROM nba_calendar.slate_games WHERE game_date = %s", (gd,)).fetchall()
    team = {str(k): str(v) for k, v in UD.leg_team(conn, dt.date.fromisoformat(gd), list(pids)).items() if v is not None}
    gof = {}; home = {}
    for g, h, a in games:
        gof[h] = g; gof[a] = g; home[h] = 1; home[a] = 0
    season = season_of(dt.date.fromisoformat(gd))
    nan = float("nan"); rows = []
    for t, g in gof.items():
        rows.append(dict(player_id="slate_" + t, gd=gd, season=season, matchup="X vs. Y" if home[t] else "X @ Y", team_id=t, game_id=g, mn=nan, pts=nan, reb=nan, ast=nan, fg3m=nan, stl=nan, blk=nan, tov=nan))
    for p in pids:
        t = team.get(str(p))
        if t in gof:
            rows.append(dict(player_id=str(p), gd=gd, season=season, matchup="X vs. Y" if home[t] else "X @ Y", team_id=t, game_id=gof[t], mn=nan, pts=nan, reb=nan, ast=nan, fg3m=nan, stl=nan, blk=nan, tov=nan))
    return pd.DataFrame(rows)


def set_live(conn, gd, mode):
    import research_leg_model_h as LM
    legs = day_legs(conn, gd, mode)
    if not len(legs):
        return None
    cols = ["season", "gd", "player_id", "prop", "side", "line", "kind", "tier", "src", "m", "hit", "ph"]
    LM.LIVE = dict(gd=gd, legs=legs[cols].copy(), hb=hb_day(conn, gd, mode), gl=placeholders(conn, gd, set(legs["player_id"].astype(str))))
    return legs


def legs_check(conn, dates, mode):
    """C1: the live loaders' legs of a past date against the research table: every graded research leg is there with the same price and model chance"""
    tot = defaultdict(int)
    for gd in dates:
        live = day_legs(conn, gd, mode)
        ref = pd.read_sql("SELECT player_id, prop, side, line::float8 line, kind, tier, m::float8 m_r, ph::float8 ph_r, hit FROM nba_score._lr_legs_h WHERE app = %s AND game_date = %s", conn, params=(APP, gd))
        if not len(live) or not len(ref):
            log(f"C1|{APP} {gd}: live {len(live)} legs, research {len(ref)} legs - nothing to compare"); continue
        live = live.copy(); live["side"] = live["side"].str.lower(); ref["side"] = ref["side"].str.lower()
        key = ["player_id", "prop", "side", "line", "kind"]
        live["line"] = live["line"].round(3); ref["line"] = ref["line"].round(3)
        j = ref.merge(live[key + ["m", "ph", "tier"]].drop_duplicates(key), on=key, how="left", suffixes=("", "_l"))
        have = j["m"].notna()
        dm = (j.loc[have, "m"] - j.loc[have, "m_r"]).abs(); both = have & j["ph"].notna() & j["ph_r"].notna()
        dph = (j.loc[both, "ph"] - j.loc[both, "ph_r"]).abs()
        ph_missing = int((j["ph_r"].notna() & j["ph"].isna()).sum())
        log(f"C1|{APP} {gd}: research legs {len(ref)}, found live {int(have.sum())} ({100 * have.mean():.1f}%), price equal {100 * (dm < 1e-6).mean():.1f}%, model chance equal (<1e-6) "
            f"{100 * (dph < 1e-6).mean() if len(dph) else float('nan'):.1f}% / within .005 {100 * (dph < .005).mean() if len(dph) else float('nan'):.1f}% (max {dph.max() if len(dph) else float('nan'):.4f}), "
            f"research ph present but live missing {ph_missing}; live legs not in research {len(live) - int(have.sum())} of {len(live)} (void / pushed / not graded)")
        tot["ref"] += len(ref); tot["found"] += int(have.sum())
    log(f"C1|{APP}: total {tot['found']}/{tot['ref']} research legs reproduced")


if __name__ == "__main__":
    mode = os.environ.get("FL_MODE") or "legs-check"
    dates = [d for d in (os.environ.get("FL_DATES") or "").split(",") if d]
    ph_mode = os.environ.get("FL_PH") or "h"
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        if mode == "legs-check":
            legs_check(conn, dates, ph_mode)
