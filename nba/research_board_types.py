#!/usr/bin/env python3
"""
RESEARCH - BOARD TYPES, ROUND 1: ~110 PRE-PICK FACTORS OF THE MATCH DAY AND OF THE APP BOARD, TESTED ON EVERY GRADED LEG (2026-10-23;
owner 10:24 PT: "strong teams against weak teams ... weekends, weekdays ... a huge amount of injuries ... the structure of the app
board itself ... is there less of our main prop lines ... the players that usually hit, are they there"; 10:25 PT: "I give you 6, you
need to come back with 100 of them"). READ-ONLY.

WHY LEG LEVEL FIRST: a slate is one draw (~155 a season - one-feature slate rules over-fit, ledger DAY THREE 20 / 24); a factor that
matters shows first as a BIAS of the calibrated final_hp on the ~380k legs a season it touches. Method (Gemini 2.5-pro consult
10:30 PT + research_leg_environment): residual = hit - final_hp; every factor binned on information known BEFORE the 13:15 PT pick
(trailing windows end the day before; cut points fixed or per season); cells = factor bin x side x line type (R / G / D);
  CONSISTENT = same sign in both seasons, |z| >= 2 in both, n >= 300 in both, AND Benjamini-Hochberg q < 0.05 in each season over all
  cells tested (multiple-comparison control);
  CROSS-FIT per factor: a log-odds shift per (bin, side, line type) fitted on one season, shrunk n / (n + 2000), applied to the other
  - HOLDS = log-loss better in BOTH directions.
For factors that hold, the same cells by prop group. Slate-level strategy tests (every structure 2-6 F / P) follow in round 2 for what
survives here.

FACTORS (round 1; 'pt' = known at pick time):
  calendar  dow, weekend, friday, month, phase decile, first 14 days, last 21 days, post All-Star week, holiday, NBA Cup night,
            slate games, tip hour (PT), slate tip spread
  rest      b2b, opp b2b, rest days, rest advantage, 3-in-4, 4-in-6, home / away, road-trip game #, homestand game #, first home game
            after a trip, time-zone shift since last game, visiting altitude, days since last meeting, lost last meeting
  strength  team / opp trailing-25 net margin class, pairing, last-5 form vs trailing-25, opp form, streak, pace, opp pace, combined
            pace, opp points allowed, opp allowed in the leg's stat, division game, conference game, late-season bad team, early
            sample (team games this season)
  market    closing total tercile, spread bucket, favourite / dog, morning -> window total move, spread move, PrizePicks line vs books
            median main line, multiplier quintile, books count, DFS apps count
  injuries  team key out (>= 24 min), rotation out (>= 15), star out (>= 30), absent minutes, opp key out, opp star out, team / opp
            questionable, player himself questionable at pick, games missed before this one, games since return, traded recently,
            slate key injuries, slate questionables
  form      minutes trend, minutes volatility, starter last game, last-5 vs line, last-10 over-rate at the line, streak vs line, line
            vs season average, games played, foul rate, usage trend, double-double rate, last game heavy minutes, last game blowout,
            line change since the player's previous slate, three-point luck
  officials crew trailing fouls / points / free-throw attempts per game
  board     own prop depth vs trailing 20 slates, board size vs trailing, ladder rungs of the player-prop, props of the player, standard
            line present, game coverage, teammates on board, whole-number line, 0.60+ depth vs trailing, rung rank in the ladder
  memory    player alpha (shrunk past residual, per-slate means), player x prop group alpha, player x side alpha, usual hitters on the
            board, prop x side trailing-7-slate residual, previous slate's residual, final_hp decile
Env: DATABASE_URL, BT_SAMPLE (slates per season for a probe; 0 = all), BT_ONLY (comma list of factor prefixes to keep, optional).
"""
import datetime as dt
import math
import os
import sys
import time
from bisect import bisect_left
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pp_flex234 as F              # noqa: E402

SEASONS = ("2024-25", "2025-26")
PROPS = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "stocks", "pra", "pts_reb", "pts_ast", "reb_ast")
GROUP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combos", "pts_reb": "combos",
         "pts_ast": "combos", "reb_ast": "combos", "steals": "lowvol", "blocks": "lowvol", "turnovers": "lowvol", "stocks": "lowvol"}
STAT = {"points": ("pts",), "rebounds": ("reb",), "assists": ("ast",), "threes_made": ("fg3m",), "steals": ("stl",), "blocks": ("blk",),
        "turnovers": ("tov",), "stocks": ("stl", "blk"), "pra": ("pts", "reb", "ast"), "pts_reb": ("pts", "reb"), "pts_ast": ("pts", "ast"),
        "reb_ast": ("reb", "ast")}
MARKET_PROP = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made",
               "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers", "player_blocks_steals": "stocks",
               "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast",
               "player_rebounds_assists": "reb_ast"}
DFS = {"prizepicks", "underdog", "betr_us_dfs", "pick6", "sleeper", "dabble", "fliff"}
TZ = {**{a: 0 for a in ("ATL", "BOS", "BKN", "CHA", "CLE", "DET", "IND", "MIA", "NYK", "ORL", "PHI", "TOR", "WAS")},
      **{a: -1 for a in ("CHI", "MIL", "MEM", "MIN", "NOP", "DAL", "HOU", "OKC", "SAS")},
      **{a: -2 for a in ("DEN", "UTA", "PHX")}, **{a: -3 for a in ("LAL", "LAC", "GSW", "SAC", "POR")}}
ALT = {"DEN", "UTA"}
SAMPLE = int(os.environ.get("BT_SAMPLE") or 0)
ONLY = [x for x in (os.environ.get("BT_ONLY") or "").split(",") if x]
T0 = time.time()


def log(msg):
    print(f"[{time.time() - T0:6.0f}s] {msg}", flush=True)


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sig(z):
    return 1 / (1 + np.exp(-z))


def nm_team(x):
    x = "".join(ch for ch in str(x).lower() if ch.isalpha())
    return "losangelesclippers" if x == "laclippers" else x


def cut(x, edges, labels):
    """x <= edges[0] -> labels[0], ..., else labels[-1]; None stays None"""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    for e, lb in zip(edges, labels):
        if x <= e:
            return lb
    return labels[-1]


def rel(x, base, lo=0.8, hi=1.2):
    if x is None or base is None or base <= 0:
        return None
    r = x / base
    return "low" if r < lo else ("high" if r > hi else "normal")


# ---------------------------------------------------------------------------------------------------------------------------------
def load_legs(conn):
    rows = conn.execute("""
        SELECT l.season, l.game_date, l.player, l.prop, l.tier, l.side, l.line::float8, l.factor::float8, l.hit, l.score::float8,
               pu.team_id, pu.event_id, pu.player_id, pu.home_team, pu.away_team
        FROM nba_score.tier_map_legs l
        JOIN nba_market.prop_universe pu ON pu.game_date = l.game_date AND pu.player = l.player AND pu.prop = l.prop AND pu.side = l.side
                                         AND pu.line = l.line AND pu.line_source = 'real'
        WHERE l.rank_key = 'final_hp' AND l.season = ANY(%s) AND l.factor IS NOT NULL AND l.hit IS NOT NULL AND l.score IS NOT NULL
          AND l.prop = ANY(%s)""", (list(SEASONS), list(PROPS))).fetchall()
    df = pd.DataFrame(rows, columns=["season", "d", "player", "prop", "tier", "side", "line", "factor", "hit", "p", "team_id", "event_id",
                                     "pid", "home", "away"])
    bounds = df.groupby("season")["d"].max().to_dict()
    df = df[[(bounds[s] - d).days > 7 for s, d in zip(df.season, df.d)]].copy()
    if SAMPLE:
        keep = set()
        for s in SEASONS:
            ds = sorted(df.loc[df.season == s, "d"].unique())
            keep |= {(s, d) for d in ds[::max(1, len(ds) // SAMPLE)][:SAMPLE]}
        df = df[[(s, d) in keep for s, d in zip(df.season, df.d)]].copy()
    df["lt"] = df.tier.str[0]
    df["grp"] = df.prop.map(GROUP)
    df["nm"] = df.player.map(F.norm)
    df["pid"] = pd.to_numeric(df.pid, errors="coerce")
    df["hit"] = df.hit.astype(int)
    df = df.reset_index(drop=True)
    log(f"legs {len(df):,} ({', '.join(f'{s} {int((df.season == s).sum()):,}' for s in SEASONS)}); slates "
        f"{df.groupby('season').d.nunique().to_dict()}")
    return df


def team_tables(conn):
    teams = conn.execute("SELECT team_id, abbreviation, full_name, conference, division FROM nba_ref.teams").fetchall()
    name_tid = {nm_team(fn): tid for tid, ab, fn, cf, dv in teams}
    tinfo = {tid: (ab, cf, dv) for tid, ab, fn, cf, dv in teams}
    g = conn.execute("""
        SELECT game_id, team_id, game_date, min(matchup), sum(pts), sum(fga), sum(fta), sum(tov), sum(oreb), sum(reb), sum(ast),
               sum(fg3m), sum(stl), sum(blk), sum(pf), season
        FROM nba_stats.player_game_log WHERE season IN ('2023-24', '2024-25', '2025-26')
        GROUP BY game_id, team_id, game_date, season""").fetchall()
    by_game = defaultdict(list)
    for r in g:
        by_game[r[0]].append(r)
    tg = defaultdict(list)   # team_id -> [dict per game] sorted by date
    for gid, rr in by_game.items():
        if len(rr) != 2:
            continue
        for a, b in ((rr[0], rr[1]), (rr[1], rr[0])):
            poss = lambda r: float(r[5] or 0) + 0.44 * float(r[6] or 0) + float(r[7] or 0) - float(r[8] or 0)   # noqa: E731
            tg[a[1]].append({"gid": gid, "d": a[2], "home": "@" not in (a[3] or ""), "opp": b[1], "pts": float(a[4]), "opp_pts": float(b[4]),
                             "pace": (poss(a) + poss(b)) / 2, "pf": float(a[14] or 0) + float(b[14] or 0),
                             "fta": float(a[6] or 0) + float(b[6] or 0), "season": a[15],
                             "allow": {"pts": float(b[4]), "reb": float(b[9]), "ast": float(b[10]), "fg3m": float(b[11]),
                                       "stl": float(b[12]), "blk": float(b[13]), "tov": float(b[7])}})
    for t in tg:
        tg[t].sort(key=lambda x: x["d"])
    log(f"team games: {sum(len(v) for v in tg.values()):,} team-games, {len(tg)} teams")
    return name_tid, tinfo, tg


def player_logs(conn):
    rows = conn.execute("""
        SELECT nba_player_id, game_id, team_id, game_date, min::float8, pts, reb, ast, fg3m, fg3a, stl, blk, tov, pf, fga, fta, dd2,
               plus_minus, season
        FROM nba_stats.player_game_log WHERE season IN ('2023-24', '2024-25', '2025-26') ORDER BY game_date""").fetchall()
    pl = defaultdict(list)
    for r in rows:
        pl[r[0]].append({"gid": r[1], "tid": r[2], "d": r[3], "min": r[4] or 0.0, "pts": r[5] or 0, "reb": r[6] or 0, "ast": r[7] or 0,
                         "fg3m": r[8] or 0, "fg3a": r[9] or 0, "stl": r[10] or 0, "blk": r[11] or 0, "tov": r[12] or 0, "pf": r[13] or 0,
                         "fga": r[14] or 0, "fta": r[15] or 0, "dd2": r[16] or 0, "season": r[18]})
    st = {(int(str(p).replace("nba_", "")), gid): int(s or 0) for p, gid, s in
          conn.execute("SELECT player_id, game_id, is_starter FROM nba_stats.player_game_starter_status")}
    log(f"player logs: {len(rows):,} rows, {len(pl):,} players; starter rows {len(st):,}")
    return pl, st


# ---------------------------------------------------------------------------------------------------------------------------------
def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    df = load_legs(conn)
    name_tid, tinfo, tg = team_tables(conn)
    pl, starter = player_logs(conn)
    days = sorted(df.d.unique())
    season_of = dict(zip(df.d, df.season))
    feats = {}

    def put(name, values):
        if ONLY and not any(name.startswith(o) for o in ONLY):
            return
        feats[name] = values

    # ---------------- calendar ----------------
    sd = df.groupby("season").d.agg(["min", "max"]).to_dict("index")
    games_day = df.groupby("d").event_id.nunique().to_dict()
    asb = {}
    for s in SEASONS:   # the All-Star break: the longest gap in February between slates
        ds = sorted(df.loc[df.season == s, "d"].unique())
        gaps = [(ds[i + 1] - ds[i]).days for i in range(len(ds) - 1)]
        cand = [(gaps[i], ds[i + 1]) for i in range(len(gaps)) if ds[i].month == 2]
        asb[s] = max(cand)[1] if cand else None

    def holiday(d):
        if (d.month, d.day) in ((12, 25), (1, 1), (12, 31)):
            return True
        if d.month == 1 and d.weekday() == 0 and 15 <= d.day <= 21:          # MLK day
            return True
        if d.month == 11 and d.weekday() == 4 and 23 <= d.day <= 29:         # day after Thanksgiving
            return True
        return False
    cal = {}
    for d in days:
        s = season_of[d]
        span = max((sd[s]["max"] - sd[s]["min"]).days, 1)
        ph = (d - sd[s]["min"]).days / span
        cal[d] = {"cal_dow": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.weekday()],
                  "cal_weekend": "yes" if d.weekday() >= 5 else "no",
                  "cal_friday": "yes" if d.weekday() == 4 else "no",
                  "cal_month": f"{d.month:02d}",
                  "cal_phase": f"q{min(int(ph * 10), 9)}",
                  "cal_first14": "yes" if (d - sd[s]["min"]).days < 14 else "no",
                  "cal_last21": "yes" if (sd[s]["max"] - d).days < 28 else "no",    # the table ends 7 days before the season's last slate
                  "cal_post_asb": "yes" if asb[s] and 0 <= (d - asb[s]).days < 7 else "no",
                  "cal_holiday": "yes" if holiday(d) else "no",
                  "cal_cup_night": "yes" if (d.month == 11 or (d.month == 12 and d.day <= 3)) and d.weekday() in (1, 4) else "no",
                  "cal_slate_games": cut(games_day[d], (3, 6, 9), ("1-3", "4-6", "7-9", "10+"))}
    for k in next(iter(cal.values())):
        put(k, [cal[d][k] for d in df.d])
    log("calendar done")

    # ---------------- tips / line moves (game_lines_snapshots, local PT date from commence_time) ----------------
    tip, mv_tot, mv_sp = {}, {}, {}
    acc = defaultdict(lambda: defaultdict(list))
    for ct, home, away, mk, out, pt, lab in conn.execute("""
            SELECT commence_time, home_team, away_team, market, outcome, point::float8, snapshot_label FROM nba_market.game_lines_snapshots
            WHERE game_date BETWEEN '2024-10-01' AND '2026-06-30' AND market IN ('totals', 'spreads') AND point IS NOT NULL"""):
        loc = ct.astimezone(dt.timezone(dt.timedelta(hours=-8 if ct.month in (11, 12, 1, 2) or (ct.month == 3 and ct.day < 9) else -7)))
        key = (loc.date(), nm_team(home), nm_team(away))
        tip[key] = loc.hour + loc.minute / 60
        if mk == "totals" and out == "Over":
            acc[key][("tot", lab)].append(pt)
        elif mk == "spreads" and nm_team(out) == nm_team(home):
            acc[key][("sp", lab)].append(pt)
    for key, v in acc.items():
        if v.get(("tot", "morning")) and v.get(("tot", "window")):
            mv_tot[key] = float(np.median(v[("tot", "window")]) - np.median(v[("tot", "morning")]))
        if v.get(("sp", "morning")) and v.get(("sp", "window")):
            mv_sp[key] = float(np.median(v[("sp", "window")]) - np.median(v[("sp", "morning")]))
        sm = v.get(("sp", "window")) or v.get(("sp", "morning"))
        tm = v.get(("tot", "window")) or v.get(("tot", "morning"))
        acc[key]["close"] = (float(np.median(tm)) if tm else None, float(np.median(sm)) if sm else None)
    log(f"game lines: {len(tip):,} games with a tip time, total moves {len(mv_tot):,}, spread moves {len(mv_sp):,}")
    slate_tips = defaultdict(list)
    for (d, h, a), hr in tip.items():
        slate_tips[d].append(hr)

    # ---------------- per leg: team context ----------------
    tot_q = {}
    for s in SEASONS:
        vals = [acc[k]["close"][0] for k in acc if isinstance(acc[k].get("close"), tuple) and acc[k]["close"][0] is not None
                and season_of.get(k[0]) == s]
        tot_q[s] = np.percentile(vals, [33.3, 66.7]) if len(vals) > 30 else (220, 230)
    tg_dates = {t: [x["d"] for x in v] for t, v in tg.items()}

    def team_ctx(tid, d):
        v = tg.get(tid)
        if not v:
            return None
        i = bisect_left(tg_dates[tid], d)
        today = v[i] if i < len(v) and v[i]["d"] == d else None
        prev = v[max(0, i - 25):i]
        if today is None or len(prev) < 5:
            return None
        return today, prev, v[:i]

    lab_pace, lab_allow = {}, {}
    # season quantiles for pace / allowed (trailing values at each team-game)
    for s in SEASONS:
        pv, av = [], defaultdict(list)
        for t, v in tg.items():
            for i, x in enumerate(v):
                if x["season"] == s and i >= 10:
                    pr = v[max(0, i - 25):i]
                    pv.append(np.mean([y["pace"] for y in pr]))
                    for k in ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov"):
                        av[k].append(np.mean([y["allow"][k] for y in pr]))
        lab_pace[s] = np.percentile(pv, [33.3, 66.7])
        lab_allow[s] = {k: np.percentile(vv, [33.3, 66.7]) for k, vv in av.items()}

    def cls(m):
        return "strong" if m >= 4 else ("weak" if m <= -4 else "mid")
    cache = {}
    cols = defaultdict(list)
    names_ctx = ["rest_b2b", "rest_opp_b2b", "rest_days", "rest_adv", "rest_3in4", "rest_4in6", "rest_home", "rest_road_game",
                 "rest_home_game", "rest_first_home", "rest_tz_shift", "rest_altitude", "rest_since_meeting", "rest_lost_meeting",
                 "str_team", "str_opp", "str_pair", "str_form", "str_opp_form", "str_streak", "str_pace", "str_opp_pace", "str_comb_pace",
                 "str_opp_def", "str_opp_allow_stat", "str_division", "str_conference", "str_late_bad", "str_early_sample",
                 "mkt_total", "mkt_spread", "mkt_fav", "mkt_total_move", "mkt_spread_move", "cal_tip_hour", "cal_tip_spread"]
    for s, d, tid, prop, home, away in zip(df.season, df.d, df.team_id, df.prop, df.home, df.away):
        key = (tid, d, prop)
        if key not in cache:
            out = dict.fromkeys(names_ctx)
            c = team_ctx(tid, d)
            if c is not None:
                today, prev, allprev = c
                opp = today["opp"]
                oc = team_ctx(opp, d)
                last = allprev[-1] if allprev else None
                rest = (d - last["d"]).days if last else None
                orest = None
                if oc is not None and oc[2]:
                    orest = (d - oc[2][-1]["d"]).days
                out["rest_b2b"] = "yes" if rest == 1 else "no"
                out["rest_opp_b2b"] = None if orest is None else ("yes" if orest == 1 else "no")
                out["rest_days"] = cut(rest, (1, 2, 3), ("1", "2", "3", "4+"))
                out["rest_adv"] = None if orest is None or rest is None else cut(min(rest, 4) - min(orest, 4), (-1, 0), ("less", "even", "more"))
                dts = tg_dates[tid]
                i = bisect_left(dts, d)
                out["rest_3in4"] = "yes" if sum(1 for x in dts[max(0, i - 3):i + 1] if (d - x).days <= 3) >= 3 else "no"
                out["rest_4in6"] = "yes" if sum(1 for x in dts[max(0, i - 4):i + 1] if (d - x).days <= 5) >= 4 else "no"
                out["rest_home"] = "home" if today["home"] else "away"
                k = 0
                for x in reversed(allprev + [today]):
                    if x["home"] == today["home"]:
                        k += 1
                    else:
                        break
                out["rest_road_game"] = None if today["home"] else cut(k, (1, 2, 3), ("1", "2", "3", "4+"))
                out["rest_home_game"] = None if not today["home"] else cut(k, (1, 2, 3), ("1", "2", "3", "4+"))
                out["rest_first_home"] = "yes" if today["home"] and last is not None and not last["home"] else "no"
                ab = tinfo.get(tid, ("", "", ""))[0]
                oab = tinfo.get(opp, ("", "", ""))[0]
                loc_today = ab if today["home"] else oab
                if last is not None:
                    loc_last = ab if last["home"] else tinfo.get(last["opp"], ("", "", ""))[0]
                    if loc_today in TZ and loc_last in TZ:
                        sh = TZ[loc_today] - TZ[loc_last]
                        out["rest_tz_shift"] = "west" if sh < 0 else ("east" if sh > 0 else "none")
                out["rest_altitude"] = "yes" if (not today["home"] and oab in ALT) else "no"
                meet = [x for x in allprev if x["opp"] == opp and (d - x["d"]).days <= 400]
                if meet:
                    out["rest_since_meeting"] = cut((d - meet[-1]["d"]).days, (7, 30, 90), ("<=7", "8-30", "31-90", "91+"))
                    out["rest_lost_meeting"] = "yes" if meet[-1]["pts"] < meet[-1]["opp_pts"] else "no"
                else:
                    out["rest_since_meeting"] = "first"
                m25 = np.mean([x["pts"] - x["opp_pts"] for x in prev])
                m5 = np.mean([x["pts"] - x["opp_pts"] for x in prev[-5:]])
                out["str_team"] = cls(m25)
                out["str_form"] = cut(m5 - m25, (-5, 5), ("cold", "par", "hot"))
                stk = 0
                for x in reversed(prev):
                    w = x["pts"] > x["opp_pts"]
                    if stk == 0:
                        stk = 1 if w else -1
                    elif (stk > 0) == w:
                        stk += 1 if w else -1
                    else:
                        break
                out["str_streak"] = cut(stk, (-3, -1, 2), ("L3+", "L1-2", "W1-2", "W3+"))
                pc = np.mean([x["pace"] for x in prev])
                q = lab_pace[s]
                out["str_pace"] = cut(pc, tuple(q), ("slow", "mid", "fast"))
                if oc is not None:
                    _, oprev, _ = oc
                    om25 = np.mean([x["pts"] - x["opp_pts"] for x in oprev])
                    out["str_opp"] = cls(om25)
                    out["str_pair"] = f"{out['str_team']}_v_{out['str_opp']}"
                    out["str_opp_form"] = cut(np.mean([x["pts"] - x["opp_pts"] for x in oprev[-5:]]) - om25, (-5, 5), ("cold", "par", "hot"))
                    opc = np.mean([x["pace"] for x in oprev])
                    out["str_opp_pace"] = cut(opc, tuple(q), ("slow", "mid", "fast"))
                    out["str_comb_pace"] = cut((pc + opc) / 2, tuple(q), ("slow", "mid", "fast"))
                    out["str_opp_def"] = cut(np.mean([x["allow"]["pts"] for x in oprev]), tuple(lab_allow[s]["pts"]), ("stingy", "mid", "leaky"))
                    stats = STAT[prop]
                    if len(stats) == 1:
                        k0 = stats[0]
                        out["str_opp_allow_stat"] = cut(np.mean([x["allow"][k0] for x in oprev]), tuple(lab_allow[s][k0]),
                                                        ("stingy", "mid", "leaky"))
                    oi = tinfo.get(opp, ("", "", ""))
                    ti = tinfo.get(tid, ("", "", ""))
                    out["str_division"] = "yes" if ti[2] and ti[2] == oi[2] else "no"
                    out["str_conference"] = "yes" if ti[1] and ti[1] == oi[1] else "no"
                wp = np.mean([x["pts"] > x["opp_pts"] for x in prev])
                out["str_late_bad"] = "yes" if d.month in (3, 4) and wp < 0.35 else "no"
                out["str_early_sample"] = cut(sum(1 for x in allprev if x["season"] == s), (9, 29), ("<10", "10-29", "30+"))
            # market (closing from the snapshots' window label; moves morning -> window)
            gk = (d, nm_team(home), nm_team(away))
            is_home = name_tid.get(nm_team(home)) == tid
            cl = acc.get(gk, {}).get("close") if gk in acc else None
            if cl:
                tot, hsp = cl
                q = tot_q[s]
                out["mkt_total"] = cut(tot, tuple(q), ("low", "mid", "high")) if tot is not None else None
                if hsp is not None:
                    tsp = hsp if is_home else -hsp
                    out["mkt_spread"] = cut(tsp, (-10.5, -3.5, 3.5, 10), ("fav10+", "fav4-10", "close", "dog4-10", "dog10+"))
                    out["mkt_fav"] = "fav" if tsp < 0 else "dog"
            if gk in mv_tot:
                out["mkt_total_move"] = cut(mv_tot[gk], (-1, 0.99), ("down", "flat", "up"))
            if gk in mv_sp:
                m = mv_sp[gk] if is_home else -mv_sp[gk]      # negative = the team became a bigger favourite
                out["mkt_spread_move"] = cut(m, (-1, 0.99), ("toward", "flat", "away"))
            if gk in tip:
                out["cal_tip_hour"] = cut(tip[gk], (15.99, 17.49, 18.99), ("before16", "16-17:30", "17:30-19", "19+"))
            if slate_tips.get(d):
                out["cal_tip_spread"] = cut(max(slate_tips[d]) - min(slate_tips[d]), (1, 3), ("<=1h", "1-3h", "3h+"))
            cache[key] = out
        o = cache[key]
        for n in names_ctx:
            cols[n].append(o[n])
    for n in names_ctx:
        put(n, cols[n])
    log(f"team / market context done ({len(cache):,} team-days)")

    # ---------------- injuries ----------------
    mins = {p: ([x["d"] for x in v], [x["min"] for x in v]) for p, v in pl.items()}

    def avg_min(pid, d, k=10):
        if pid not in mins:
            return None
        ds, ms = mins[pid]
        i = bisect_left(ds, d)
        h = ms[max(0, i - k):i]
        return float(np.mean(h)) if h else None
    inj_team = defaultdict(lambda: {"key": 0, "rot": 0, "star": 0, "absmin": 0.0, "q": 0})
    q_players = defaultdict(set)
    slate_inj = defaultdict(lambda: [0, 0])
    inj_days = set()
    for d, team, pidtxt, st in conn.execute("""
            SELECT i.d, i.team, m.player_id, i.status_at_pick FROM nba_score.injury_asof_pick i
            LEFT JOIN nba_ref.player_name_map m
              ON m.norm_name = nba_ref.norm_name(split_part(i.player_name, ', ', 2) || ' ' || split_part(i.player_name, ', ', 1))"""):
        inj_days.add(d)
        tid = name_tid.get(nm_team(team))
        try:
            pid = int(pidtxt) if pidtxt else None
        except ValueError:
            pid = None
        if st == "Questionable":
            inj_team[(d, tid)]["q"] += 1
            slate_inj[d][1] += 1
            if pid:
                q_players[d].add(pid)
        elif st in ("Out", "Doubtful"):
            m = avg_min(pid, d) if pid else None
            if m is not None:
                e = inj_team[(d, tid)]
                e["key"] += m >= 24
                e["rot"] += m >= 15
                e["star"] += m >= 30
                e["absmin"] += m
                slate_inj[d][0] += m >= 24
    sk = {s: np.percentile([slate_inj[d][0] for d in days if season_of[d] == s and d in inj_days] or [0], [33.3, 66.7]) for s in SEASONS}
    sq = {s: np.percentile([slate_inj[d][1] for d in days if season_of[d] == s and d in inj_days] or [0], [33.3, 66.7]) for s in SEASONS}
    cols = defaultdict(list)
    opp_of = {}
    for t, v in tg.items():
        for x in v:
            opp_of[(t, x["d"])] = x["opp"]
    for s, d, tid, pid in zip(df.season, df.d, df.team_id, df.pid):
        if d not in inj_days:
            for n in ("inj_key", "inj_rot", "inj_star", "inj_absmin", "inj_q", "inj_opp_key", "inj_opp_star", "inj_opp_q", "inj_self_q",
                      "inj_slate_key", "inj_slate_q"):
                cols[n].append(None)
            continue
        e = inj_team.get((d, tid), {"key": 0, "rot": 0, "star": 0, "absmin": 0.0, "q": 0})
        oe = inj_team.get((d, opp_of.get((tid, d))), {"key": 0, "rot": 0, "star": 0, "absmin": 0.0, "q": 0})
        cols["inj_key"].append(cut(e["key"], (0, 1), ("0", "1", "2+")))
        cols["inj_rot"].append(cut(e["rot"], (0, 1, 2), ("0", "1", "2", "3+")))
        cols["inj_star"].append("yes" if e["star"] else "no")
        cols["inj_absmin"].append(cut(e["absmin"], (0, 30, 60), ("0", "<=30", "30-60", "60+")))
        cols["inj_q"].append(cut(e["q"], (0, 1, 3), ("0", "1", "2-3", "4+")))
        cols["inj_opp_key"].append(cut(oe["key"], (0, 1), ("0", "1", "2+")))
        cols["inj_opp_star"].append("yes" if oe["star"] else "no")
        cols["inj_opp_q"].append(cut(oe["q"], (0, 1, 3), ("0", "1", "2-3", "4+")))
        cols["inj_self_q"].append("yes" if pid in q_players[d] else "no")
        cols["inj_slate_key"].append(cut(slate_inj[d][0], tuple(sk[s]), ("low", "mid", "high")))
        cols["inj_slate_q"].append(cut(slate_inj[d][1], tuple(sq[s]), ("low", "mid", "high")))
    for n, v in cols.items():
        put(n, v)
    log("injuries done")

    # ---------------- player form ----------------
    switches = defaultdict(list)
    for p, sdate in conn.execute("SELECT pid, switch_date FROM nba_score.player_team_switches"):
        try:
            switches[int(p)].append(sdate)
        except (TypeError, ValueError):
            pass
    pdates = {p: [x["d"] for x in v] for p, v in pl.items()}
    tdset = {t: set(v) for t, v in tg_dates.items()}
    # previous slate's standard line per (player, prop)
    std = df[df.tier == "R"].groupby(["nm", "prop", "d"]).line.first()
    prev_std = {}
    for (nm, prop), ser in std.groupby(level=[0, 1]):
        ds = list(ser.index.get_level_values(2))
        ls = list(ser.values)
        for i in range(1, len(ds)):
            prev_std[(nm, prop, ds[i])] = ls[i] - ls[i - 1]
    cols = defaultdict(list)
    fcache = {}
    fnames = ["frm_min_trend", "frm_min_vol", "frm_starter", "frm_l5_vs_line", "frm_l10_over", "frm_streak", "frm_line_vs_avg",
              "frm_games", "frm_foul", "frm_usage_trend", "frm_dd_rate", "frm_last_heavy", "frm_last_blowout", "frm_line_change",
              "frm_three_luck", "inj_missed_before", "inj_since_return", "inj_traded"]
    for s, d, pid, prop, line, nm, tid in zip(df.season, df.d, df.pid, df.prop, df.line, df.nm, df.team_id):
        key = (pid, d, prop, line)
        if key not in fcache:
            out = dict.fromkeys(fnames)
            if pid == pid and pid in pl:
                v = pl[pid]
                i = bisect_left(pdates[pid], d)
                h = v[max(0, i - 20):i]
                if len(h) >= 5:
                    stats = STAT[prop]
                    val = [sum(x[k] for k in stats) for x in h]
                    m10 = [x["min"] for x in h[-10:]]
                    out["frm_min_trend"] = cut(np.mean([x["min"] for x in h[-3:]]) / max(np.mean(m10), 1), (0.85, 1.15), ("down", "flat", "up"))
                    out["frm_min_vol"] = cut(float(np.std(m10)), (4, 7), ("<4", "4-7", "7+"))
                    lg = h[-1]
                    if (pid, lg["gid"]) in starter:
                        out["frm_starter"] = "starter" if starter[(pid, lg["gid"])] else "bench"
                    lb = max(line, 0.5)
                    out["frm_l5_vs_line"] = cut((np.mean(val[-5:]) - line) / lb, (-0.2, -0.05, 0.05, 0.2), ("<<", "<", "=", ">", ">>"))
                    out["frm_l10_over"] = cut(np.mean([x > line for x in val[-10:]]), (0.3, 0.5, 0.7), ("0-30", "30-50", "50-70", "70+"))
                    stk = 0
                    for x in reversed(val):
                        o = x > line
                        if stk == 0:
                            stk = 1 if o else -1
                        elif (stk > 0) == o:
                            stk += 1 if o else -1
                        else:
                            break
                    out["frm_streak"] = cut(stk, (-3, -1, 2), ("U3+", "U1-2", "O1-2", "O3+"))
                    seas = [sum(x[k] for k in stats) for x in v[max(0, i - 110):i] if x["season"] == s]
                    if len(seas) >= 5:
                        out["frm_line_vs_avg"] = cut((line - np.mean(seas)) / lb, (-0.15, -0.05, 0.05, 0.15), ("<<", "<", "=", ">", ">>"))
                    out["frm_games"] = cut(len(seas), (9, 29, 49), ("<10", "10-29", "30-49", "50+"))
                    tm = sum(x["min"] for x in h)
                    out["frm_foul"] = cut(36 * sum(x["pf"] for x in h) / max(tm, 1), (3, 4.5), ("<3", "3-4.5", "4.5+"))
                    us = lambda xs: sum(x["fga"] + 0.44 * x["fta"] + x["tov"] for x in xs) / max(sum(x["min"] for x in xs), 1)   # noqa: E731
                    out["frm_usage_trend"] = cut(us(h[-3:]) / max(us(h[-10:]), 1e-6), (0.9, 1.1), ("down", "flat", "up"))
                    out["frm_dd_rate"] = cut(np.mean([x["dd2"] for x in h]), (0, 0.3), ("0", "<=30", "30+"))
                    out["frm_last_heavy"] = cut(lg["min"], (34.99, 39.99), ("<35", "35-40", "40+"))
                    tl = tg.get(lg["tid"], [])
                    gm = [x for x in tl if x["gid"] == lg["gid"]]
                    if gm:
                        out["frm_last_blowout"] = "yes" if abs(gm[0]["pts"] - gm[0]["opp_pts"]) >= 20 else "no"
                    if prop in ("threes_made", "points"):
                        a5 = sum(x["fg3a"] for x in h[-5:])
                        aS = sum(x["fg3a"] for x in v[max(0, i - 110):i] if x["season"] == s)
                        if a5 >= 10 and aS >= 40:
                            luck = sum(x["fg3m"] for x in h[-5:]) / a5 - sum(x["fg3m"] for x in v[max(0, i - 110):i] if x["season"] == s) / aS
                            out["frm_three_luck"] = cut(luck, (-0.08, 0.08), ("cold", "normal", "hot"))
                    # games missed right before this one (team games since his last game)
                    td = tg_dates.get(tid, [])

                    def between(a, b):   # team games strictly between two dates (bisect on the sorted team dates)
                        return max(0, bisect_left(td, b) - bisect_left(td, a) - (1 if a in tdset.get(tid, ()) else 0))
                    missed = between(lg["d"], d)
                    out["inj_missed_before"] = cut(missed, (0, 2, 9), ("0", "1-2", "3-9", "10+"))
                    # games since a return from >= 3 missed games
                    since = None
                    for j in range(len(h) - 1, 0, -1):
                        if between(h[j - 1]["d"], h[j]["d"]) >= 3:
                            since = len(h) - j
                            break
                    out["inj_since_return"] = "none" if since is None else cut(since, (1, 3), ("1", "2-3", "4+"))
                    sw = [x for x in switches.get(int(pid), []) if 0 <= (d - x).days <= 30]
                    out["inj_traded"] = "yes" if sw else "no"
            ch = prev_std.get((nm, prop, d))
            out["frm_line_change"] = None if ch is None else cut(ch, (-0.01, 0.01), ("down", "same", "up"))
            fcache[key] = out
        o = fcache[key]
        for n in fnames:
            cols[n].append(o[n])
    for n, v in cols.items():
        put(n, v)
    log("player form done")

    # ---------------- officials ----------------
    offi = defaultdict(list)
    for gid, oid in conn.execute("SELECT game_id, official_id FROM nba_stats.game_officials"):
        offi[gid].append(oid)
    gstat = {}
    for t, v in tg.items():
        for x in v:
            gstat[x["gid"]] = (x["d"], x["pf"], x["pts"] + x["opp_pts"], x["fta"])
    o_hist = defaultdict(list)
    for gid, os_ in offi.items():
        if gid in gstat:
            for o in os_:
                o_hist[o].append(gstat[gid])
    for o in o_hist:
        o_hist[o].sort()
    o_dates = {o: [x[0] for x in v] for o, v in o_hist.items()}
    crew = {}
    for gid, os_ in offi.items():
        if gid not in gstat:
            continue
        d = gstat[gid][0]
        vals = []
        for o in os_:
            i = bisect_left(o_dates[o], d)
            h = o_hist[o][max(0, i - 40):i]
            if len(h) >= 10:
                vals.append((np.mean([x[1] for x in h]), np.mean([x[2] for x in h]), np.mean([x[3] for x in h])))
        if len(vals) >= 2:
            crew[gid] = tuple(np.mean([v[k] for v in vals]) for k in range(3))
    gid_of = {}
    for t, v in tg.items():
        for x in v:
            gid_of[(t, x["d"])] = x["gid"]
    cq = {}
    for s in SEASONS:
        vv = [crew[g] for g in crew if gstat[g][0] in season_of and season_of[gstat[g][0]] == s]
        cq[s] = [np.percentile([x[k] for x in vv], [33.3, 66.7]) if vv else (0, 0) for k in range(3)]
    cols = defaultdict(list)
    for s, d, tid in zip(df.season, df.d, df.team_id):
        c = crew.get(gid_of.get((tid, d)))
        for k, n in enumerate(("off_fouls", "off_points", "off_fta")):
            cols[n].append(None if c is None else cut(c[k], tuple(cq[s][k]), ("low", "mid", "high")))
    for n, v in cols.items():
        put(n, v)
    log(f"officials done ({len(crew):,} games with a crew)")

    # ---------------- board structure (the PrizePicks board in tier_map) ----------------
    dp = df.groupby(["d", "prop"]).size()
    gd = df.groupby("d").event_id.nunique()
    per_game = {(d, p): n / max(gd[d], 1) for (d, p), n in dp.items()}
    size_day = df.groupby("d").size().to_dict()
    r60 = df[(df.tier == "R") & (df.p >= 0.60)].groupby("d").size().to_dict()

    def trailing(series_by_day, d, s, k=20):
        ds = [x for x in days if x < d and season_of[x] == s][-k:]
        vals = [series_by_day(x) for x in ds]
        vals = [v for v in vals if v is not None]
        return float(np.median(vals)) if len(vals) >= 5 else None
    prop_depth, board_size, depth60 = {}, {}, {}
    for d in days:
        s = season_of[d]
        board_size[d] = rel(size_day[d] / max(gd[d], 1), trailing(lambda x: size_day[x] / max(gd[x], 1), d, s))
        depth60[d] = rel(r60.get(d, 0), trailing(lambda x: r60.get(x, 0), d, s), 0.67, 1.5)
        for p in PROPS:
            prop_depth[(d, p)] = rel(per_game.get((d, p), 0), trailing(lambda x, p=p: per_game.get((x, p), 0), d, s))
    put("brd_prop_depth", [prop_depth[(d, p)] for d, p in zip(df.d, df.prop)])
    put("brd_size", [board_size[d] for d in df.d])
    put("brd_depth60", [depth60[d] for d in df.d])
    rungs = df.groupby(["d", "nm", "prop"]).size()
    put("brd_rungs", [cut(rungs[(d, n, p)], (1, 3, 6), ("1", "2-3", "4-6", "7+")) for d, n, p in zip(df.d, df.nm, df.prop)])
    nprops = df.groupby(["d", "nm"]).prop.nunique()
    put("brd_player_props", [cut(nprops[(d, n)], (3, 7), ("1-3", "4-7", "8+")) for d, n in zip(df.d, df.nm)])
    has_std = set(zip(df.loc[df.tier == "R", "d"], df.loc[df.tier == "R", "nm"], df.loc[df.tier == "R", "prop"]))
    put("brd_has_std", ["yes" if (d, n, p) in has_std else "no" for d, n, p in zip(df.d, df.nm, df.prop)])
    ev_s = df.groupby(["d", "event_id"]).size()
    ev_mean = ev_s.groupby(level=0).mean().to_dict()
    ev_legs = ev_s.to_dict()
    put("brd_game_cover", [rel(ev_legs[(d, e)], ev_mean.get(d)) if (d, e) in ev_legs else None for d, e in zip(df.d, df.event_id)])
    mates = df.groupby(["d", "team_id"]).nm.nunique().to_dict()
    put("brd_teammates", [cut(mates[(d, t)] - 1, (3, 6), ("0-3", "4-6", "7+")) if (d, t) in mates else None for d, t in zip(df.d, df.team_id)])
    put("brd_whole_line", ["whole" if float(x).is_integer() else "half" for x in df.line])
    # rung rank in the ladder from the side's easy end (Over: lowest line = 1)
    df["_k"] = df.line * np.where(df.side == "Over", 1, -1)
    rk = df.groupby(["d", "nm", "prop", "side"])._k.rank(method="dense")
    put("brd_rung_rank", [cut(r, (1, 2, 4), ("1", "2", "3-4", "5+")) for r in rk])
    put("mkt_factor", list(pd.qcut(df.factor.rank(method="first"), 5, labels=["f1", "f2", "f3", "f4", "f5"]).astype(str)))
    log("board structure done")

    # ---------------- PrizePicks standard line vs the books' median main line; books / DFS apps per player-market ----------------
    bk = defaultdict(list)
    nbooks = defaultdict(set)
    napps = defaultdict(set)
    for gdte, player, mk, book, nl, line in conn.execute("""
            SELECT game_date, player, market_key, bookmaker, count(DISTINCT line), min(line)::float8
            FROM nba_market.board_snapshots
            WHERE game_date BETWEEN %s AND %s AND market_key = ANY(%s) AND line IS NOT NULL
            GROUP BY 1, 2, 3, 4""", (min(days), max(days), list(MARKET_PROP))):
        key = (gdte, F.norm(player), MARKET_PROP[mk])
        if book in DFS:
            napps[key].add(book)
        else:
            nbooks[key].add(book)
            if nl == 1:
                bk[key].append(line)
    std_line = df[df.tier == "R"].groupby(["d", "nm", "prop"]).line.first().to_dict()
    cols = defaultdict(list)
    for d, n, p in zip(df.d, df.nm, df.prop):
        key = (d, n, p)
        sl = std_line.get(key)
        cols["mkt_pp_vs_books"].append(None if sl is None or not bk.get(key) else
                                       cut(sl - float(np.median(bk[key])), (-0.99, -0.01, 0.01, 0.99), ("<=-1", "-0.5", "same", "+0.5", ">=+1")))
        cols["mkt_books"].append(cut(len(nbooks.get(key, ())), (0, 2, 5), ("0", "1-2", "3-5", "6+")))
        cols["mkt_dfs_apps"].append(cut(len(napps.get(key, ())), (1, 2), ("1", "2", "3+")))
    for n, v in cols.items():
        put(n, v)
    log(f"books vs PrizePicks done ({len(bk):,} player-markets with a books main line)")

    # ---------------- our memory (no look-ahead: only slates before d) ----------------
    df["res"] = df.hit - df.p
    pday = df.groupby(["nm", "d"]).res.mean()
    pday_g = df.groupby(["nm", "grp", "d"]).res.mean()
    pday_s = df.groupby(["nm", "side", "d"]).res.mean()

    def expanding(ser, nkeys, K=10):
        out = {}
        for key, sub in ser.groupby(level=list(range(nkeys))):
            ds = list(sub.index.get_level_values(nkeys))
            vs = list(sub.values)
            cs = 0.0
            for i, dd in enumerate(ds):
                out[key + (dd,) if isinstance(key, tuple) else (key, dd)] = (cs / (i + K), i)
                cs += vs[i]
        return out
    A = expanding(pday, 1)
    AG = expanding(pday_g, 2)
    AS = expanding(pday_s, 2)
    edges, labs = (-0.04, -0.015, 0.015, 0.04), ("--", "-", "0", "+", "++")
    put("mem_alpha", [cut(A[(n, d)][0], edges, labs) if A[(n, d)][1] >= 5 else "new" for n, d in zip(df.nm, df.d)])
    put("mem_alpha_grp", [cut(AG[(n, g, d)][0], edges, labs) if AG[(n, g, d)][1] >= 5 else "new" for n, g, d in zip(df.nm, df.grp, df.d)])
    put("mem_alpha_side", [cut(AS[(n, sd_, d)][0], edges, labs) if AS[(n, sd_, d)][1] >= 5 else "new"
                           for n, sd_, d in zip(df.nm, df.side, df.d)])
    hitters = defaultdict(int)
    for (n, d), (a, k) in A.items():
        if k >= 15 and a >= 0.03:
            hitters[d] += 1
    hq = {s: np.percentile([hitters[d] for d in days if season_of[d] == s], [33.3, 66.7]) for s in SEASONS}
    put("mem_usual_hitters", [cut(hitters[d], tuple(hq[s]), ("few", "some", "many")) for s, d in zip(df.season, df.d)])
    ps = df.groupby(["prop", "side", "d"]).res.mean()
    reg = {}
    for key, sub in ps.groupby(level=[0, 1]):
        ds = list(sub.index.get_level_values(2)); vs = list(sub.values)
        for i, dd in enumerate(ds):
            if i >= 7 and season_of[ds[i - 7]] == season_of[dd]:
                reg[key + (dd,)] = float(np.mean(vs[i - 7:i]))
    put("mem_prop_regime", [cut(reg.get((p, sd_, d)), (-0.02, 0.02), ("cold", "par", "hot")) for p, sd_, d in zip(df.prop, df.side, df.d)])
    dres = df.groupby("d").res.mean()
    prevr = {days[i]: dres[days[i - 1]] for i in range(1, len(days)) if season_of[days[i]] == season_of[days[i - 1]]}
    put("mem_prev_slate", [cut(prevr.get(d), (-0.015, 0.015), ("cold", "par", "hot")) for d in df.d])
    dec = {}
    for s in SEASONS:
        m = df.season == s
        dec.update(dict(zip(df.index[m], pd.qcut(df.p[m].rank(method="first"), 10, labels=[f"d{i}" for i in range(10)]).astype(str))))
    put("mem_hp_decile", [dec[i] for i in df.index])
    log(f"memory done; {len(feats)} factors")

    # ---------------- ANALYSIS ----------------
    y = df.hit.values.astype(float)
    p0 = df.p.values.astype(float)
    res = y - p0
    seas = df.season.values
    side_lt = (df.side.str[0] + df.lt).values
    from scipy.stats import norm as N
    # DAY-CLUSTERED (owner 10:30 PT: "the profiles need to be identified and correlate in different days"): a slate's legs move together,
    # so z is cluster-robust by slate (each day one cluster), and every cell reports the days it appears on and the share of those
    # days whose residual has the cell's sign - a profile that is a handful of big days does not pass.
    dd_ = df.d.values
    cells = []
    for f, vals in feats.items():
        v = np.array([x if x is not None else "~" for x in vals], dtype=object)
        key = pd.Series(v.astype(str)) + "|" + pd.Series(side_lt)
        for s in SEASONS:
            m = (seas == s) & (v != "~")
            t = pd.DataFrame({"k": key[m].values, "d": dd_[m], "r": res[m]})
            per = t.groupby(["k", "d"]).r.agg(["sum", "count"]).reset_index()
            tot = per.groupby("k").agg(S=("sum", "sum"), n=("count", "sum"), D=("d", "size"))
            per = per.join(tot, on="k")
            per["mu"] = per.S / per.n
            per["dev2"] = (per["sum"] - per["count"] * per.mu) ** 2
            per["same"] = np.sign(per["sum"]) == np.sign(per.S)
            agg = per.groupby("k").agg(dev2=("dev2", "sum"), same=("same", "mean"))
            tot = tot.join(agg)
            for k, row in tot.iterrows():
                if row.n >= 300 and row.D >= 20 and row.dev2 > 0:
                    mean = row.S / row.n
                    se = math.sqrt(row.dev2 * row.D / (row.D - 1)) / row.n
                    z = mean / se
                    cells.append((f, k, s, mean, int(row.n), z, 2 * (1 - N.cdf(abs(z))), int(row.D), float(row.same)))
    C = pd.DataFrame(cells, columns=["f", "k", "s", "mean", "n", "z", "pv", "days", "same"])
    for s in SEASONS:     # Benjamini-Hochberg per season over every cell tested
        m = C.s == s
        pv = C.loc[m, "pv"].values
        order = np.argsort(pv)
        q = np.empty_like(pv)
        q[order] = np.minimum.accumulate((pv[order] * len(pv) / (np.arange(len(pv)) + 1))[::-1])[::-1]
        C.loc[m, "q"] = q
    W = C.pivot_table(index=["f", "k"], columns="s", values=["mean", "n", "z", "q", "days", "same"])
    W = W.dropna()
    cons = W[(np.sign(W[("mean", SEASONS[0])]) == np.sign(W[("mean", SEASONS[1])]))
             & (W[("z", SEASONS[0])].abs() >= 2) & (W[("z", SEASONS[1])].abs() >= 2)
             & (W[("q", SEASONS[0])] < 0.05) & (W[("q", SEASONS[1])] < 0.05)]
    cons = cons.assign(minz=np.minimum(cons[("z", SEASONS[0])].abs(), cons[("z", SEASONS[1])].abs())).sort_values("minz", ascending=False)
    print("\n" + "=" * 190)
    print(f"CONSISTENT CELLS (factor bin x side+line type; same sign, day-clustered |z| >= 2, n >= 300, >= 20 days, BH q < 0.05 in BOTH "
          f"seasons): {len(cons)} of {len(W)}")
    print("  side+lt: OR = Over standard, OG = Over goblin, OD = Over demon, UR / UG / UD = Under")
    for (f, k), r in cons.iterrows():
        b, sl = k.split("|")
        print(f"  {f:<20} {b:<12} {sl}  " + " | ".join(
            f"{s}: resid {r[('mean', s)]:+.4f} n {int(r[('n', s)]):>7,} days {int(r[('days', s)]):>3} same-sign {100 * r[('same', s)]:3.0f}% "
            f"z(day) {r[('z', s)]:+5.1f}" for s in SEASONS))
    per_f = cons.reset_index().groupby("f").size().sort_values(ascending=False)
    print("\n  consistent cells per factor: " + ", ".join(f"{f} {n}" for f, n in per_f.items()))

    # cross-fit per factor
    def ll(p, yy):
        p = np.clip(p, 1e-4, 1 - 1e-4)
        return float(-np.mean(yy * np.log(p) + (1 - yy) * np.log(1 - p)))
    z0 = logit(p0)
    print("\n" + "=" * 190 + "\nCROSS-FIT per factor: log-odds shift per (bin, side, line type) fitted on one season, shrunk n / (n + 2000), "
          "applied to the other (negative = better)")
    xf = []
    for f, vals in feats.items():
        v = np.array([x if x is not None else "~" for x in vals], dtype=object).astype(str)
        key = pd.Series(v) + "|" + pd.Series(side_lt)
        codes, uniq = pd.factorize(key)
        out = []
        for fit, app in (SEASONS, SEASONS[::-1]):
            mf = (seas == fit) & (v != "~")
            b = np.zeros(len(uniq))
            cnt = np.bincount(codes[mf], minlength=len(uniq))
            for _ in range(6):
                q_ = sig(z0[mf] + b[codes[mf]])
                gsum = np.bincount(codes[mf], weights=y[mf] - q_, minlength=len(uniq))
                hsum = np.bincount(codes[mf], weights=q_ * (1 - q_), minlength=len(uniq))
                b += gsum / np.maximum(hsum, 1e-9)
            b = b * cnt / (cnt + 2000)
            ma = (seas == app) & (v != "~")
            p1 = sig(z0[ma] + b[codes[ma]])
            out.append(ll(p1, y[ma]) - ll(p0[ma], y[ma]))
        cov = float(np.mean(v != "~"))
        xf.append((f, out[0], out[1], cov))
    xf.sort(key=lambda x: max(x[1], x[2]))
    for f, a, b_, cov in xf:
        tagx = "HOLDS" if a < 0 and b_ < 0 else ""
        print(f"  {f:<20} fit 24-25 -> 25-26 {a:+.6f} | fit 25-26 -> 24-25 {b_:+.6f}  coverage {100 * cov:5.1f}%  {tagx}")
    holds = [f for f, a, b_, c in xf if a < 0 and b_ < 0]
    print(f"\n  factors that HOLD both ways: {len(holds)} of {len(xf)}: {', '.join(holds)}")

    # holding factors by prop group
    print("\n" + "=" * 190 + "\nHOLDING FACTORS BY PROP GROUP (drill-down, leg-level z: same sign, |z| >= 2 both seasons, n >= 200)")
    grp = df.grp.values
    for f in holds:
        v = np.array([x if x is not None else "~" for x in feats[f]], dtype=object).astype(str)
        key = pd.Series(v) + "|" + pd.Series(side_lt) + "|" + pd.Series(grp)
        st = {}
        for s in SEASONS:
            m = (seas == s) & (v != "~")
            st[s] = pd.DataFrame({"k": key[m].values, "r": res[m]}).groupby("k").r.agg(["mean", "count", "std"])
        both = st[SEASONS[0]].join(st[SEASONS[1]], lsuffix="_a", rsuffix="_b", how="inner")
        both = both[(both.count_a >= 200) & (both.count_b >= 200)]
        za = both.mean_a / (both.std_a / np.sqrt(both.count_a))
        zb = both.mean_b / (both.std_b / np.sqrt(both.count_b))
        ok = both[(np.sign(za) == np.sign(zb)) & (za.abs() >= 2) & (zb.abs() >= 2)]
        for k, r in ok.iterrows():
            print(f"  {f:<20} {k:<34} 24-25 {r.mean_a:+.4f} (n {int(r.count_a):,}) | 25-26 {r.mean_b:+.4f} (n {int(r.count_b):,})")
    log("done")


if __name__ == "__main__":
    main()
