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

FINAL = json.loads((HERE / "final_candidates" / (os.environ["FL_SET_NAME"] + ".json") if os.environ.get("FL_SET_NAME") else HERE / "final_set.json").read_text())   # FL_SET_PATH: replay a candidate set without touching the live one
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
    tb = "baseline_history_v2" if mode == "v2" else "baseline_history"     # v2 = the production day builder replayed with the honest recipe (parallel store)
    for g, pid, prop, line, pm in conn.execute(f"""SELECT game_date::text, player_id, prop, line::float8, p_more::float8 FROM nba_score.{tb}
                                                  WHERE game_date = %s AND period = 'FULL' AND p_more IS NOT NULL""", (gd,)).fetchall():
        tmp[(g, pid, prop)][line] = pm
    for k, d in tmp.items():
        ls = sorted(d); H[k] = (np.asarray(ls, float), np.asarray([d[x] for x in ls], float))
    return H


def hb_day(conn, gd, mode):
    t = "baseline_history_h" if mode == "h" else "baseline_history_v2" if mode == "v2" else "baseline_history"
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
    # PREDICTION LEGS (owner 2026-11-14, deployed 2026-11-27 after the Copy screen showed 38 of 243 legs scratched): Underdog refuses a Flex with a Prediction pick (udx / prediction_market)
    # and every deployed Underdog strategy is a Flex -> a Prediction leg never enters the live frame (history has no flags, so replays are unchanged)
    if os.environ.get("FL_KEEP_PRED") != "1":
        legs = [b for b in legs if not b.get("pred")]
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


# ---------------------------------------------------------------------------------------------------------------- the month's models
_MODELS = {}


def predict(df, X, need):
    """blend / gbm / gbm_s of the legs of the slate being built: fitted exactly as research_leg_model_h.main fits the slate's month (everything strictly before the month,
    season weights 1.0 / 0.6 / 0.35, the app's price as the starting point), predicting only the slate's rows"""
    import lightgbm as lgb
    import research_leg_model_h as LM
    y = df["hit"].values.astype(float); ym = df["gd"].str[:7].values; gd = LM.LIVE["gd"]; mth = gd[:7]
    sidx = df["season"].map({s: i for i, s in enumerate(LM.SEAS)}).values
    te = (df["gd"].values == gd); tr = (ym < mth) & ~np.isnan(y)
    out = {k: np.full(len(df), np.nan) for k in ("blend", "gbm", "gbm_s")}
    if tr.sum() < 60000 or len(set(df["gd"].values[tr])) < 20:
        log(f"FL|not enough history to fit {mth}: {int(tr.sum())} legs"); return out
    cur = sidx[te][0]; w = np.array([LM.SW.get(int(cur - s), 0.35) for s in sidx[tr]])
    Zall = np.c_[LM.lg(np.nan_to_num(X["ph"].values, nan=.5)), np.isnan(X["ph"].values), LM.lg(np.nan_to_num(X["pb"].values, nan=.5)), np.isnan(X["pb"].values), LM.lg(X["be"].values), X["under"].values]
    b = LM.fit_blend(Zall[tr], y[tr], w); out["blend"][te] = 1 / (1 + np.exp(-(np.c_[np.ones(te.sum()), Zall[te]] @ b)))
    out["weights"] = [float(v) for v in np.round(b, 4)]
    if os.environ.get("FL_DROPNPL") == "1":                       # the research counts only the day's graded legs per player; live cannot know that -> leave the feature out of fit and prediction
        X = X.drop(columns=["n_player_legs"])
    cat = ["prop", "kind"]; off = LM.lg(X["be"].values.astype(float))
    par = dict(objective="binary", learning_rate=0.05, num_leaves=31, min_data_in_leaf=400, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=5.0, verbose=-1, num_threads=4, seed=7)
    if "gbm" in need:
        m_ = lgb.train(par, lgb.Dataset(X[tr], label=y[tr], weight=w, categorical_feature=cat, free_raw_data=False, init_score=off[tr]), num_boost_round=LM.ROUNDS)
        out["gbm"][te] = 1 / (1 + np.exp(-(m_.predict(X[te], raw_score=True) + off[te])))
    if "gbm_s" in need:
        par_s = dict(par, num_leaves=7, min_data_in_leaf=2000, lambda_l2=20.0)
        ms_ = lgb.train(par_s, lgb.Dataset(X[tr], label=y[tr], weight=w, categorical_feature=cat, init_score=off[tr]), num_boost_round=max(100, LM.ROUNDS // 2))
        out["gbm_s"][te] = 1 / (1 + np.exp(-(ms_.predict(X[te], raw_score=True) + off[te])))
    log(f"FL|{APP} {gd}: models fitted on {int(tr.sum()):,} legs before {mth} (blend weights {out['weights']}; gbm {'gbm' in need}, gbm_s {'gbm_s' in need})")
    return out


NEED = {"prizepicks": {"gbm"}, "sleeper": {"gbm_s"}}


# ---------------------------------------------------------------------------------------------------------------- the day's frame
XCOLS = ("ph", "pb", "books", "bline_d", "oline_d", "avs_d", "av5_d", "hot", "avs_z", "gp", "mn_trend", "rest", "home", "lean", "min_out", "opp_out", "own_status",
         "tr_pl10", "tr_plall10", "tr_slate7", "tr_slate21", "ph_ret", "pb_ret", "proj_min")


def build_frame(conn, df, X, P):
    import research_leg_model_h as LM
    gd = LM.LIVE["gd"]; k = (df["gd"].values == gd)
    d = pd.DataFrame({"season": df["season"].values[k], "gd": df["gd"].values[k], "player_id": df["player_id"].astype(str).values[k], "prop": df["prop"].values[k],
                      "under": df["under"].values[k].astype(bool), "line": df["line"].values[k], "kind": df["kind"].astype(str).values[k], "src": df["src"].astype(str).values[k],
                      "m_lr": df["m"].values[k], "w": 0, "gid": df["game_id"].astype(str).fillna("g").values[k], "role": df["role_tier"].astype(str).values[k],
                      "tier_raw": df["tier"].astype(str).values[k]})
    for c in XCOLS:
        d[c] = X[c].values[k] if c in X.columns else np.nan
    d["blend"] = P["blend"][k]; d["gbm"] = P["gbm"][k]; d["gbm_s"] = P["gbm_s"][k]
    bs = pd.read_sql("""SELECT player_id, player, prop, line::float8 line, lower(side) side, final_hp::float8 fhp, score::float8 score, confidence::float8 conf
                        FROM nba_score.""" + ("board_scored_v2" if os.environ.get("FL_BS") == "v2" else "board_scored") + """ WHERE game_date = %s AND app = %s""", conn, params=(gd, APP))
    bs["under"] = ~bs["side"].str[0].isin(["o", "m", "h"])
    d = d.merge(bs.drop_duplicates(["player_id", "prop", "under", "line"]).drop(columns=["side"]), on=["player_id", "prop", "under", "line"], how="left")
    for c in ("hr", "hcal", "roi", "roi_cal", "roi_best"):
        d[c] = np.nan
    if APP == "prizepicks":
        reg = (d["kind"] == "standard").values
        d["val"] = np.where(reg, math.sqrt(3), d["m_lr"] / 0.542); d["alt"] = ~reg; d["est"] = False; d["logy"] = 0.0; d["logf"] = 0.0
        d["easy"] = np.where(reg, 0, np.where(d["val"] < math.sqrt(3), 1, 2))   # the final set plays regular lines only (tier mask); the others stay in the frame so the day's composite ranks cover the same rows as the research
    elif APP == "underdog":
        lm = d["m_lr"].values / 1.8708
        d["logf"] = np.log(lm); d["val"] = np.where(d["gd"] >= "2026-07-01", math.sqrt(3.5), math.sqrt(3.0)) * lm
        d["alt"] = np.abs(lm - 1) > 1e-6; d["est"] = False; d["easy"] = np.where(~d["alt"], 0, np.where(lm < 1, 1, 2)); d["logy"] = 0.0
    else:
        d["logf"] = np.log(d["m_lr"].values); d["val"] = d["m_lr"].values
        d["alt"] = d["kind"].str.lower().isin(["alt", "f", "b"]).values; d["est"] = d["src"] != "real"
        d["easy"] = np.where(~d["alt"], 0, 1); d["logy"] = 0.0
    d["ret_hr"] = d["hr"] * d["val"] - 1; d["ret_blend"] = d["blend"] * d["val"] - 1; d["ret_gbms"] = d["gbm_s"] * d["val"] - 1
    d["avg"] = (d["blend"] + d["ph"]) / 2; d["geo"] = np.sqrt(d["ph"] * d["pb"])
    return d.reset_index(drop=True)


# ---------------------------------------------------------------------------------------------------------------- strategies
def tier_mask(d, tier):
    e = d["easy"].values
    if APP in ("sleeper", "fliff"):
        return {"regular": e == 0, "all": np.ones(len(d), bool), "alt": e > 0}[tier]
    return {"regular": e == 0, "all": np.ones(len(d), bool)}[tier]


def ranker(d, rk):
    """a single column, or the research's composites: `a+b` = mean of the day's percentile ranks, `bal3:a+b+c` the mean of three (computed over the app's whole day, as
    research_universe2.combos does)"""
    name = rk.split(":")[-1]
    cols = name.split("+")
    if len(cols) == 1:
        return d[cols[0]].values.astype(float)
    pr = [d[c].rank(pct=True).values for c in cols]
    return np.mean(pr, axis=0)


def build_slips(lst, alt, k, nsl, start, altcap):
    """research_universe2.build: consecutive slips from the list, the first `start - 1` legs skipped, at most `altcap` alternates a slip"""
    rem = list(lst[start - 1:]); out = []
    for _ in range(nsl):
        s = []; na = 0; left = []
        for i in rem:
            if len(s) < k and (altcap is None or not alt[i] or na < altcap):
                s.append(i); na += int(alt[i])
            else:
                left.append(i)
        if len(s) < k:
            break
        out.append(s); rem = left
    return out


HALF_ONLY = False
LAST = {}                                                  # code -> the strategy's ranked candidate rows of the day (the bank for sub / shrink)


def materialize(d, sg):
    """one strategy of final_set.json on the day's frame -> list of slips (lists of frame row numbers), exactly research_universe2.stage_b"""
    v = ranker(d, sg["rk"])
    m = tier_mask(d, sg["tier"]) & np.isfinite(v)
    if HALF_ONLY and APP == "prizepicks":                    # standing rule: PrizePicks half-point lines only (live; the research replay leaves it off)
        m &= (d["line"].values % 1 != 0)
    if sg["side"] == "Under":
        m &= d["under"].values
    elif sg["side"] == "Over":
        m &= ~d["under"].values
    if not m.any():
        LAST[sg["code"]] = []
        return []
    x = d[m].copy(); x["_v"] = v[m]
    x = x.sort_values(["_v", "player_id", "prop", "line"], ascending=[False, True, True, True], kind="mergesort").drop_duplicates("player_id")
    gid = x["gid"].values; prp = x["prop"].values; av = x["alt"].values.astype(bool); idx = x.index.values
    ngames = len(set(gid)); nlab = str(sg["nsl"]); nsl = int(nlab) if nlab.isdigit() else max(1, round(ngames * int(nlab[1:]) / 100))
    lst = []; ug = defaultdict(int); upr = set()
    for i in range(len(x)):
        if ug[gid[i]] >= sg["gcap"] or (sg["pdif"] and prp[i] in upr):
            continue
        lst.append(i); ug[gid[i]] += 1; upr.add(prp[i])
        if len(lst) >= 40:
            break
    altcap = None if sg["altcap"] == -1 else sg["altcap"]
    LAST[sg["code"]] = [int(idx[j]) for j in lst]
    return [[int(idx[j]) for j in s] for s in build_slips(lst, av, sg["k"], nsl, sg["start"], altcap)]


def merge_set(app, per, skip=None, notes=None):
    """the app's day: strategies in the final set's order (main, then fallback), each one's slips in turn, a slip kept while the app is under its slot count and none of its
    players is already in `cap` kept slips (research_best.merge)"""
    cap = CAPS[app]; N = SLOTS[app]; cnt = defaultdict(int); out = []
    gcap = (FINAL.get("gcaps") or {}).get(app, 99); gcnt = defaultdict(int)       # app-level game cap: at most gcap legs of the app's day from one game
    for sg in [s for s in FINAL["set"] if s["app"] == app]:
        for j, rows in enumerate(per.get(sg["code"], [])):
            if len(out) >= N:
                return out
            pl = [r["player_id"] for r in rows]
            why = skip(rows) if skip else None
            if why:
                if notes is not None:
                    notes.append(f"{app}: {sg['code']} not played - {why}")
                continue
            if cap < 99 and any(cnt[p] >= cap for p in pl):
                continue
            gs = [str(r.get("gid")) for r in rows]
            if gcap < 99 and any(gcnt[z] + gs.count(z) > gcap for z in set(gs)):
                continue
            for p in pl:
                cnt[p] += 1
            for z in gs:
                gcnt[z] += 1
            out.append(dict(code=sg["code"], j=j, role=sg["role"], k=sg["k"], st=sg["st"], rows=rows))
    return out


def day_slips(d, skip=None, notes=None):
    per = {}
    for sg in SET:
        sl = materialize(d, sg)
        per[sg["code"]] = [[d.loc[i].to_dict() | {"_i": i} for i in s] for s in sl]
    return per, merge_set(APP, per, skip, notes)


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


def model_check(conn, dates, mode):
    """C2: the month models refitted for a slate against the research's stored predictions (_lr_legs_hp), leg by leg"""
    import research_leg_model_h as LM
    for gd in dates:
        legs = set_live(conn, gd, mode)
        if legs is None:
            continue
        df, X = LM.load(conn); P = predict(df, X, NEED.get(APP, set())); P.pop("weights", None)
        k = (df["gd"].values == gd)
        d = pd.DataFrame({"player_id": df["player_id"].astype(str).values[k], "prop": df["prop"].values[k], "side": df["side"].str.lower().values[k], "line": df["line"].values[k],
                          "kind": df["kind"].astype(str).values[k], "n_blend": P["blend"][k], "n_gbm": P["gbm"][k], "n_gbm_s": P["gbm_s"][k]})
        st = pd.read_sql("SELECT player_id::text player_id, prop, lower(side) side, line::float8 line, kind, p_blend::float8 s_blend, p_gbm::float8 s_gbm, p_gbm_s::float8 s_gbm_s FROM nba_score._lr_legs_hp WHERE app = %s AND game_date = %s", conn, params=(APP, gd))
        j = d.merge(st.drop_duplicates(["player_id", "prop", "side", "line", "kind"]), on=["player_id", "prop", "side", "line", "kind"], how="inner")
        for c in ("blend", "gbm", "gbm_s"):
            a = j["n_" + c]; b = j["s_" + c]; v = a.notna() & b.notna()
            if v.any():
                rk = a[v].rank().corr(b[v].rank())
                log(f"C2|{APP} {gd} {c}: {int(v.sum())} legs, mean abs diff {float((a[v] - b[v]).abs().mean()):.5f}, max {float((a[v] - b[v]).abs().max()):.4f}, rank corr {rk:.4f}, bias {float((a[v] - b[v]).mean()):+.5f}")


def attach_hits(conn, d, gd):
    """replay only: the result of each leg of the day (the research's certified grading: leg card result, else the graded table)"""
    h = pd.read_sql("""SELECT player_id::text player_id, prop, lower(side) side, line::float8 line, hit::int hit FROM nba_score._lr_legs_h WHERE app = %s AND game_date = %s AND hit IS NOT NULL""",
                    conn, params=(APP, gd))
    h["under"] = ~h["side"].str[0].isin(["o", "m", "h"])
    lc = pd.read_sql("""SELECT player_id::text player_id, prop, lower(side) side, line::float8 line, result FROM nba_score.leg_card_v2 WHERE app = %s AND game_date = %s""", conn, params=(APP, gd))
    lc["under"] = ~lc["side"].str[0].isin(["o", "m", "h"]); lc["cw"] = lc["result"].map({"won": 1, "lost": 0})
    k = ["player_id", "prop", "under", "line"]
    d = d.merge(h.drop_duplicates(k)[k + ["hit"]], on=k, how="left").merge(lc.drop_duplicates(k)[k + ["cw"]], on=k, how="left")
    d["w"] = np.where(d["cw"].notna(), d["cw"], d["hit"]); return d


def grade(rows, st, k, slp):
    """profit (payout - 1) of one slip the way the research prices it (research_universe2.stage_b); None when a leg has no result"""
    import research_universe2 as RU2
    if any(r.get("w") is None or r["w"] != r["w"] for r in rows):
        return None
    w = int(sum(r["w"] for r in rows)); av = np.array([bool(r["alt"]) for r in rows]); a = int(av.sum())
    ly = np.array([r["logy"] for r in rows]); lf = np.array([r["logf"] for r in rows]); wv = np.array([r["w"] for r in rows]); old = rows[0]["gd"] < "2026-07-01"
    pw, fx = RU2.payouts(k, np.array([w]), np.array([a]), np.array([ly[av].sum()]), np.array([lf.sum()]), np.array([lf[wv == 1].sum()]), np.array([(np.exp(lf) - 1).sum()]),
                         np.array([old]), slp[0] if slp else {})
    if APP == "sleeper" and k >= 3:
        import sleeper_live_slip_engine as SL
        tiers = SL.flex_tiers(list(np.exp(lf)), slp[1], slp[2]); fx = np.array([float(tiers.get(w, 0.0))])
    if st == "flex" and APP == "prizepicks" and a > 0:
        return None
    pv = (pw if st == "power" else fx)[0]
    return float(pv - 1) if np.isfinite(pv) else None


def frame_for(conn, gd, mode):
    """the slate's frame exactly as the research builds it (models fitted on the months before), legs without a result"""
    import research_leg_model_h as LM
    legs = set_live(conn, gd, mode)
    if legs is None:
        return None
    df, X = LM.load(conn)
    P = predict(df, X, NEED.get(APP, set()))
    if "weights" in P:
        P.pop("weights")
    d = build_frame(conn, df, X, P)
    return attach_hits(conn, d, gd)


def ref_days(conn, sg):
    """the research's own day results of one strategy: {date: [(profit, {players})]} from ua3 (rows '-n'), matched on every signature field"""
    q = """SELECT days FROM nba_score.ua3 WHERE tag LIKE '%%-n' AND app = %s AND tier = %s AND side = %s AND rk = %s AND layer = %s AND st = %s AND k = %s AND start = %s AND nsl = %s
           AND (gcap = %s OR %s < 0) AND (pdif = %s OR %s < 0) AND (altcap = %s OR %s < 0) LIMIT 1"""
    r = conn.execute(q, (sg["app"], sg["tier"], sg["side"], sg["rk"], sg["layer"], sg["st"], sg["k"], sg["start"], sg["nsl"], sg["gcap"], sg["gcap"], sg["pdif"], sg["pdif"],
                         sg["altcap"], sg["altcap"])).fetchone()
    if not r:
        return None
    import research_best as RB
    return RB.parse(r[0])


def replay_check(conn, dates, mode):
    """C4: the strategies rebuilt from the live pipeline on past slates against the research's slips (the same players in the same slips)"""
    ref = {sg["code"]: ref_days(conn, sg) for sg in SET}
    log("C4|reference rows: " + ", ".join(f"{c} {'yes' if v is not None else 'NO'}" for c, v in ref.items()))
    tot = defaultdict(float); slp = None
    if APP == "sleeper":
        import sleeper_live_slip_engine as SL
        slp = SL.pricing(conn)
    for gd in dates:
        d = frame_for(conn, gd, mode)
        if d is None or not len(d):
            log(f"C4|{APP} {gd}: no live legs"); continue
        per, merged = day_slips(d)
        for sg in SET:
            mine = [frozenset(r["player_id"] for r in s) for s in per.get(sg["code"], [])]
            rd = ref.get(sg["code"])
            if rd is None:
                continue
            theirs = [frozenset(str(x) for x in legs) for _, legs in rd.get(gd, [])]
            gm = [grade(r, sg["st"], sg["k"], slp) for r in per.get(sg["code"], [])]
            tot["u_mine"] += sum(x for x in gm if x is not None); tot["u_res"] += sum(p for p, _ in rd.get(gd, [])); tot["n_ungraded"] += sum(1 for x in gm if x is None)
            eq = sum(1 for a, b in zip(mine, theirs) if a == b); tot["slips"] += len(theirs); tot["equal"] += eq; tot["mine"] += len(mine)
            if mine != theirs and os.environ.get("FL_DIAG"):
                v = pd.Series(ranker(d, sg["rk"]), index=d["player_id"].values); v = v.groupby(level=0).max()
                f = lambda S: " | ".join("[" + ",".join(f"{p}:{v.get(p, float('nan')):.3f}" for p in sorted(x)) + "]" for x in S)
                log(f"C4D|{APP} {gd} {sg['code']} ranker {sg['rk']} nsl {sg['nsl']} gcap {sg['gcap']} pdif {sg['pdif']} start {sg['start']}: mine {f(mine)} || research {f(theirs)}")
            if mine != theirs:
                log(f"C4|{APP} {gd} {sg['code']}: mine {len(mine)} slips, research {len(theirs)}, identical in order {eq}; same sets any order {len(set(mine) & set(theirs))}")
        log(f"C4|{APP} {gd}: legs {len(d)}, set slips {len(merged)}: " + " ".join(f"{m['code']}" for m in merged))
    log(f"C4|{APP}: units on these slates, strategy by strategy: rebuilt {tot['u_mine']:+.2f} vs research {tot['u_res']:+.2f} (ungraded rebuilt slips {int(tot['n_ungraded'])})")
    log(f"C4|{APP}: research slips {tot['slips']}, rebuilt {tot['mine']}, identical (same players, same slip) {tot['equal']} = {100 * tot['equal'] / max(1, tot['slips']):.1f}%")


if __name__ == "__main__":
    mode = os.environ.get("FL_MODE") or "legs-check"
    dates = [d for d in (os.environ.get("FL_DATES") or "").split(",") if d]
    ph_mode = os.environ.get("FL_PH") or "h"
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        if mode == "legs-check":
            legs_check(conn, dates, ph_mode)
        elif mode == "c2":
            model_check(conn, dates, ph_mode)
        elif mode == "c4":
            replay_check(conn, dates, ph_mode)
