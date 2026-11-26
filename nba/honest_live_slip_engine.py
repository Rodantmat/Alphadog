#!/usr/bin/env python3
"""
THE HONEST-REBUILD STRATEGIES, LIVE (owner 2026-11-19 23:11 PT: "Go ahead and disable the current strategies and wire the new ones. We go with all elected.
Stake is the same $10 for all but betr at $5." No caps. NBA_HONEST_REBUILD.md sections 8z / 8aa / 8ab).

WHAT IT BUILDS, every slate, from the SAME legs and in the SAME order as the certified research (research_pass10.py, no cap):
  the pool      regular single-stat UNDERS of the app's fresh window board, one leg a player and a game inside a slip
  the ranking   blend  = logistic on [model chance, sportsbook chance at the exact line, price]  (weights of the month from the walk-forward fit)
                second = the model's baseline chance alone (no sportsbook input)
                The model chance live is production's own baseline_hp for the leg (nba_score.final_hp) - the live twin of the honest history's number.
  Underdog (2-pick Standard)   U1 top 2 by blend | U2 top 2 by second | U3 PrizePicks' order played on Underdog | U4 top 2 rebounds | U5 top 2 home players | U6 3-pick Standard, top 3 rebounds
  PrizePicks (Flex)            P1 5 different props | P2 5, lines under 10 | P3 top 5 | P4 5 home players | P5 top 6 | P6 6 different props | P7 6 bench roles
                               P9 top 4 | P10 3-pick POWER top 3 (half-point lines only on PrizePicks)
  Sleeper / Fliff / Betr       the qualified legs (Underdog top 2 + PrizePicks top 5, best first) as that app's own Under on its own line and price:
                               S1 2-pick Max (Underdog's top 2) | S4 4-pick Flex | S5 4-pick Max | S6 5-pick Flex
                               F1 2-pick (Underdog's top 2) | F4 4-pick | F5 5-pick
                               B1 3-pick Perfect | B5 3-pick Perfect from PrizePicks' top 5
WHAT IT DOES TO THE OLD STRATEGIES: nothing is deleted. On an app this engine serves, every other strategy's slip of the day is set to a not-played status
(PrizePicks 'placed_shadow', Underdog 'shadow', Sleeper / Fliff / Betr 'shadow' with stake 0): recorded and graded as paper, never shown as PLAY.
FALLBACKS (owner 2026-11-20 08:59 PT): on a thin board, when an app's elected strategies build fewer slips than they number, its fallbacks are added in
order until the count is reached (PrizePicks rebounds by the geometric mean of model and sportsbook, and the strategies not elected in the first round).
GATE: nba_config.classification_config['honest_live'] {enabled, apps, weights}. enabled = false -> this engine does nothing and the old strategies play as before.
Env: DATABASE_URL, HL_DATE (default today PT), HL_APPS (comma list; default the gate's apps), HL_DRY = 1 (print, write nothing; works on past dates).
"""
import datetime as dt
import json
import math
import os
import sys
from zoneinfo import ZoneInfo

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
PT = ZoneInfo("America/Los_Angeles")
SINGLE = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers")
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals",
      "player_blocks": "blocks", "player_turnovers": "turnovers"}
# walk-forward blend weights of the month [const, model, model missing, book, book missing, price, under] (research_leg_model_h.py, run lm5, month 2026-11)
WEIGHTS = {"underdog": [-0.174, 0.093, -0.148, 0.298, -0.054, 0.666, 0.085], "prizepicks": [-0.178, 0.105, -0.020, 0.205, -0.026, 0.923, 0.071]}
BREAK_EVEN = {"underdog": 1 / 1.8708, "prizepicks": 0.542}
ALL_APPS = ("prizepicks", "underdog", "sleeper", "fliff", "betr")
HALF_ONLY = True
NAMES = {"U1": "U1 top 2 Unders, main ranking", "U2": "U2 top 2 Unders, model-only ranking", "U3": "U3 PrizePicks' top Unders on Underdog", "U4": "U4 top 2 rebounds Unders",
         "U5": "U5 top 2 Unders, home players", "U6": "U6 top 3 rebounds Unders (3-pick Standard)", "U7": "U7 top 4 rebounds Unders (4-pick Flex)",
         "U8": "U8 top 4 Unders, no assists, up to two a game (4-pick Flex)",
         "U9": "U9 top 3 Unders, no assists, up to two a game (3-pick Standard)", "P1": "H_P1_5flex_under10_noast", "P2": "H_P2_5flex_under10", "P3": "H_P3_5flex_top5", "P4": "H_P4_5flex_avg", "P5": "H_P5_6flex_avg",
         "P6": "H_P6_6flex_props", "P7": "H_P7_6flex_bench", "P9": "H_P9_4flex_top4", "P10": "H_P10_3power_top3", "S1": "H_S1_2max", "S4": "H_S4_4flex", "S5": "H_S5_4max",
         "S6": "H_S6_5flex", "F1": "H_F1_2max", "F4": "H_F4_4max", "F5": "H_F5_5max", "B1": "H_B1_3perfect", "B5": "H_B5_3perfect_pp",
         # FALLBACKS (owner 2026-11-20 08:59 PT): built only on a thin board, when the app's elected strategies give fewer slips than they number
         "U20": "FB0 top 4 Unders by the average ranking, no assists, under this line in 6+ of the last 10 games (4-pick Flex)",
         "U22": "FB2 top 4 Unders, model-only ranking, up to two a game (4-pick Flex)",
         "U21": "FB1 top 3 Unders, model-only ranking (3-pick Flex)",
         "P21": "H_FB1_5flex_reb_geo", "P22": "H_FB2_6flex_reb_geo", "P23": "H_FB3_2power_udtop2", "P24": "H_FB4_5flex_props", "P25": "H_FB5_6flex_top6", "P26": "H_FB6_5flex_home",
         "P27": "H_FB7_6flex_second", "S7": "H_S7_5max_pp", "S8": "H_S8_4max_pp", "F6": "H_F6_4max_pp", "F7": "H_F7_5max_pp", "S9": "H_S9_2max_noast", "S10": "H_S10_3max_pp_props", "S11": "H_S11_2max_pp_reb", "F9": "H_F9_3max_pp_props", "F10": "H_F10_2max_pp_reb", "B6": "H_B6_3perfect_pp_props", "F8": "H_F8_2max_noast", "S21": "H_FB1_S_2max_noast", "S22": "H_FB2_S_3max", "F21": "H_FB1_F_2max_noast", "F22": "H_FB2_F_3max", "B21": "H_FB1_B_3perfect_noast", "B22": "H_FB2_B_2perfect",
         "B23": "H_FB3_B_4perfect",
         # owner 2026-11-23 09:24 / 09:30 PT ("everything over 25% as daily, under as fallback ... deploy them ... make them all live now"): the full-universe
         # winners (NBA_HONEST_REBUILD.md 2026-11-23 00:55 PT, research_candidates.py, one slip a slate, 2024-25 / 2025-26 / 2026-27):
         "U10": "U10 top 3 single-stat Unders, main ranking, up to two a game (3-pick Standard)",      # +30.2% (+23 / +28 / +62), w/o 5 best +20.2%
         "U11": "U11 top 3 Unders by the sportsbook chance, players in form (3-pick Standard)",         # +26.7% (+22 / +33 / +15)
         "U12": "U12 top 3 Unders by the certified hit rate (3-pick Standard)",                         # +34.3% (+29 / +40 / +30) - needs the daily hit rate
         "P11": "H_P11_5flex_b2b_score",
         "S12": "H_S12_5max_pp_props", "S13": "H_S13_6flex_avg", "F11": "H_F11_5max_pp_props", "F12": "H_F12_6max_pp_m18",
         "B7": "H_B7_5perfect_model_props", "B8": "H_B8_3perfect_pp_noast_2g", "B9": "H_B9_3perfect_score_props"}                                                                   # +75.0% (+49 / +59 / +322), back-to-back slates only
# owner 2026-11-23: daily = the codes above 25% ROI, fallback = below (thin board only). PrizePicks daily P1 P3 P4 P10 P11, fallback P9;
# Underdog daily U9 U10 U11 (U12 once the daily certified hit rate exists), fallback U2 U1. P2 P5 P6 P7, U3-U8 and the old fallbacks retired.
TARGET = {"underdog": 2, "prizepicks": 4, "sleeper": 9, "fliff": 8, "betr": 2}      # 2026-11-25: U10, P11, S8, F6 dropped (negative on the real 2026-27 boards)      # the number of elected (daily) strategies an app has


def log(m):
    print(m, flush=True)


def lg(p):
    p = min(max(float(p), 1e-4), 1 - 1e-4); return math.log(p / (1 - p))


def gate(conn):
    r = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = 'honest_live'").fetchone()
    return (r[0] if isinstance(r[0], dict) else json.loads(r[0])) if r else {}


def first(rows, k):
    """up to k rows in order, one a player and a game"""
    out, games, players = [], set(), set()
    for r in rows:
        if r["pid"] in players or r["game"] in games:
            continue
        out.append(r); players.add(r["pid"]); games.add(r["game"])
        if len(out) == k:
            break
    return out


def pick(rows, k, diff_prop=False, skip=(), gcap=1):
    """exactly k rows in order: one a player and `gcap` a game (and a prop if diff_prop), none of `skip`; None if the list runs out"""
    out, games, players, props = [], {}, set(skip), set()
    for r in rows:
        if r["pid"] in players or games.get(r["game"], 0) >= gcap or (diff_prop and r["prop"] in props):
            continue
        out.append(r); players.add(r["pid"]); games[r["game"]] = games.get(r["game"], 0) + 1; props.add(r["prop"])
        if len(out) == k:
            PICKED[id(out)] = (rows, dict(diff_prop=diff_prop, gcap=gcap))     # the slip's own list and rules (the composition step re-picks from them)
            return out
    return None


PICKED = {}
# COMPOSITION (owner 2026-11-23 16:17 PT "Deploy this"; audit_honest_set_compose.py, 33 slates 10-20..11-22, run 45289749699):
#   prizepicks: a player in at most 2 of the app's slips - a later slip with a capped player is re-picked from its own list (ROI +56% vs +51%, drawdown 15 u vs 39)
#   underdog:   a slip sharing 2+ players with an earlier slip of the app is dropped (ROI +54% vs +33%, 1.5 slips a day)
#   sleeper:    a slip sharing 4+ players with an earlier slip is dropped (ROI +62% vs +87% as built but drawdown 30 u vs 56, w/o 5 best days -11% vs -23%)
#   fliff:      a slip sharing 4+ players with an earlier slip is dropped (ROI +87% vs +81%, drawdown 34 u vs 45)
#   betr:       as built (every rule tried lowered it)
COMPOSE = {"prizepicks": ("playercap", 2), "underdog": ("overlap", 1), "sleeper": ("overlap", 3), "fliff": ("overlap", 3)}


# SPREAD RULE (owner 2026-11-23 22:49 PT "Go"; research_spread_check.py / research_spread_refine.py, three seasons, real prices): a PrizePicks slip whose legs'
# games average a point spread above 8 (absolute, the books' latest pre-game spread) is not played - ROI +36 / +50 / +121% vs +26 / +31 / +97% as built in
# 2024-25 / 2025-26 / 2026-27, units about the same (93 / 202 / 108 vs 104 / 195 / 113), ~35% fewer slips; random skips of as many slips do as well
# 13% / 1% / 7% of the time. Underdog did not hold (2024-25 worse).
# Sleeper / Fliff (owner 2026-11-23 22:58 PT "A"; research_spread_sf.py on the live codes): Sleeper +51 / +137% vs +32 / +84% (2025-26 derived / 2026-27 real),
# Fliff +66 / +173% vs +43 / +108%, more units with ~30% fewer slips, luck p .00 / .00; 2024-25 (derived) ROI a few points lower but fewer units lost.
SPREAD_SKIP = {"prizepicks": 8.0, "sleeper": 8.0, "fliff": 8.0}
TEAM_NAME = {"ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets", "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
        "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons", "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
        "LAC": "Los Angeles Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies", "MIA": "Miami Heat", "MIL": "Milwaukee Bucks",
        "MIN": "Minnesota Timberwolves", "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder", "ORL": "Orlando Magic",
        "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns", "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
        "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards"}


def game_spreads(conn, day):
    """{home team id: |spread|} - median over the books of the latest spreads snapshot of the day's games"""
    out = {}
    try:
        tc = dict(conn.execute("SELECT home_team_tricode, home_team_id::text FROM nba_calendar.slate_games WHERE game_date = %s", (day,)).fetchall())
        rows = conn.execute("""WITH l AS (SELECT home_team, max(snapshot_ts) ts FROM nba_market.game_lines_snapshots
                                          WHERE game_date = %s AND market = 'spreads' AND lower(outcome) = lower(home_team) GROUP BY 1)
                               SELECT s.home_team, percentile_cont(0.5) WITHIN GROUP (ORDER BY s.point)::float8 FROM nba_market.game_lines_snapshots s JOIN l
                                 ON s.home_team = l.home_team AND s.snapshot_ts = l.ts
                               WHERE s.game_date = %s AND s.market = 'spreads' AND lower(s.outcome) = lower(s.home_team) GROUP BY 1""", (day, day)).fetchall()
        name_to_id = {TEAM_NAME.get(t): hid for t, hid in tc.items()}
        for name, sp in rows:
            if name in name_to_id and sp is not None:
                out[name_to_id[name]] = abs(float(sp))
    except Exception:  # noqa: BLE001 - no spreads: the rule simply does not act
        conn.rollback()
    return out


# REST RULE (owner 2026-11-24 10:41 PT "A"; research_filter_battery.py -> research_rest_check.py, three seasons, real prices, on top of the spread rule):
# a slip whose legs' players average this many days or more since their last game (capped at 7; 1 = back-to-back) is not played - tired legs hit their Unders more.
#   PrizePicks >= 2.8: +46 / +61 / +129% vs +36 / +52 / +121%, units 98 / 208 / 111 vs 93 / 212 / 108, ~17% fewer slips, luck p .08 / .06 / .06
#   Underdog   >= 3.6: +29 / +40 / +42% vs +25 / +32 / +37%, units 118 / 219 / 46 vs 111 / 192 / 42, ~7% fewer slips, luck p .16 / .01 / .38
#   Sleeper / Fliff: no help - not applied.
REST_SKIP = {"prizepicks": 2.8, "underdog": 3.6}


def rest_days(conn, day, pids):
    """{player: days since his last game-log row this season (capped 7)} - the research's `rest` (research_leg_model_h)"""
    try:
        f = season_form(conn, day, pids)
    except Exception:  # noqa: BLE001 - no rest data: the rule does not act
        conn.rollback(); return {}
    return {p: min((day - v[2]).days, 7) for p, v in f.items() if v[2] is not None}


def compose(plan, notes, spreads=None, rest=None):
    spreads = spreads or {}; rest = rest or {}
    for app, cut in REST_SKIP.items():
        if not rest or not plan.get(app):
            continue
        kept = []
        for code, k, st, s, cand in plan[app]:
            v = [rest[r["pid"]] for r in s if r["pid"] in rest]
            if v and sum(v) / len(v) >= cut:
                notes.append(f"{app}: {code} not played - its players average {sum(v) / len(v):.1f} days of rest (limit {cut:g})"); continue
            kept.append((code, k, st, s, cand))
        plan[app] = kept
    for app, cut in SPREAD_SKIP.items():
        if not spreads or not plan.get(app):
            continue
        kept = []
        for code, k, st, s, cand in plan[app]:
            v = [spreads[r["game"]] for r in s if r.get("game") in spreads]
            if v and sum(v) / len(v) > cut:
                notes.append(f"{app}: {code} not played - its games average a {sum(v) / len(v):.1f}-point spread (limit {cut:g})"); continue
            kept.append((code, k, st, s, cand))
        plan[app] = kept
    for app, (rule, x) in COMPOSE.items():
        slips = plan.get(app) or []
        kept = []; used = {}
        for code, k, st, s, cand in slips:
            if rule == "playercap":
                bad = {p for p, c in used.items() if c >= x}
                s2 = s
                if {r["pid"] for r in s} & bad:
                    rows, kw = PICKED.get(id(s), (cand, dict(diff_prop=False, gcap=1)))
                    s2 = pick(rows, k, skip=bad, **kw)
                    notes.append(f"{app}: {code} re-picked - a player was already in {x} slips" if s2 is not None else f"{app}: {code} dropped - a player was already in {x} slips and its list ran out")
                if s2 is None:
                    continue
                kept.append((code, k, st, s2, cand))
                for r in s2:
                    used[r["pid"]] = used.get(r["pid"], 0) + 1
            else:
                ps = {r["pid"] for r in s}
                worst = max([len(ps & {r["pid"] for r in t[3]}) for t in kept] or [0])
                if worst > x:
                    notes.append(f"{app}: {code} dropped - shares {worst} players with an earlier slip (limit {x})"); continue
                kept.append((code, k, st, s, cand))
        if slips:
            plan[app] = kept
    return plan


def context(conn, day, pids):
    import ud_live_slip_engine as UD
    import live_slip_engine as LSE
    team = {str(k): str(v) for k, v in UD.leg_team(conn, day, list(pids)).items() if v is not None}
    game, home = {}, set()
    for h, a in conn.execute("SELECT home_team_id::text, away_team_id::text FROM nba_calendar.slate_games WHERE game_date = %s", (day,)).fetchall():
        game[h] = h; game[a] = h; home.add(h)
    started = {str(x) for x in LSE.started_team_ids(conn, day)}
    role = dict(conn.execute("SELECT player_id::text, max(role_tier) FROM nba_score.baseline_history WHERE game_date = %s AND period = 'FULL' GROUP BY 1", (day,)).fetchall())
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    book = {}
    for nm, mk, line, po in conn.execute("""SELECT nba_ref.norm_name(player), market_key, line::float8, p_over_mean::float8 FROM nba_market.market_consensus
                                            WHERE snapshot_label = 'window' AND game_date = %s AND p_over_mean IS NOT NULL""", (day,)).fetchall():
        if mk in MK and nm in ids:
            book.setdefault((ids[nm], MK[mk], round(float(line), 2)), 1 - float(po))
    return dict(team=team, game=game, home=home, started=started, role=role, book=book)


GLCOL = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov"}


def season_form(conn, day, pids):
    """{player: (season average, last-5 average by stat, date of his last game)} from every game-log row of this season before `day`
    (DNP rows count, as in research_leg_model_h: hot = (last-5 - season) / max(1, season), last 5 needs 3+ rows)"""
    out = {}
    if not pids:
        return out
    y = day.year if day.month >= 8 else day.year - 1
    rows = conn.execute("""SELECT nba_player_id::text, game_date, pts::float8, reb::float8, ast::float8, fg3m::float8, stl::float8, blk::float8, tov::float8
                           FROM nba_stats.player_game_log WHERE nba_player_id::text = ANY(%s) AND game_date < %s AND game_date >= %s ORDER BY 1, 2""",
                        (list(pids), day, dt.date(y, 8, 1))).fetchall()
    by = {}
    for r in rows:
        by.setdefault(r[0], []).append(r)
    for pid, g in by.items():
        cols = list(zip(*[x[2:] for x in g]))
        avs = {c: float(np.nanmean([v if v is not None else np.nan for v in cols[i]])) for i, c in enumerate(GLCOL.values())}
        last5 = [x[2:] for x in g[-5:]]
        av5 = {c: (float(np.nanmean([x[i] if x[i] is not None else np.nan for x in last5])) if len(last5) >= 3 else None) for i, c in enumerate(GLCOL.values())}
        out[pid] = (avs, av5, g[-1][1])
    return out


def hot(form, r):
    f = form.get(r["pid"])
    if not f or r["prop"] not in GLCOL:
        return None
    c = GLCOL[r["prop"]]; s_, f5 = f[0].get(c), f[1].get(c)
    if s_ is None or f5 is None or s_ != s_ or f5 != f5:
        return None
    return (f5 - s_) / max(1.0, s_)


def board_score(conn, day):
    """the board's score (nba/score_board_legs.py, nba_score.board_scored - built by P3 before this engine) for PrizePicks Unders by (player, prop, line)"""
    return {(str(p), pr, round(float(ln), 2)): float(sc) for p, pr, ln, sc in conn.execute(
        """SELECT player_id, prop, line, score FROM nba_score.board_scored WHERE game_date = %s AND app = 'prizepicks' AND side = 'Under' AND score IS NOT NULL""", (day,)).fetchall()}


def last10(conn, day, pids):
    """{player: his last 10 games played before `day`, newest first, as {prop: value}} - for the trailing layer of fallback U20 (pass 19)"""
    out = {}
    if not pids:
        return out
    for row in conn.execute("""SELECT pid, pts, reb, ast, fg3m, stl, blk, tov FROM (SELECT nba_player_id::text pid, pts::float8, reb::float8, ast::float8, fg3m::float8, stl::float8,
                               blk::float8, tov::float8, row_number() OVER (PARTITION BY nba_player_id ORDER BY game_date DESC) rn FROM nba_stats.player_game_log
                               WHERE nba_player_id::text = ANY(%s) AND game_date < %s AND min > 0) x WHERE rn <= 10""", (list(pids), day)).fetchall():
        out.setdefault(row[0], []).append(dict(zip(("pts", "reb", "ast", "fg3m", "stl", "blk", "tov"), row[1:])))
    return out


def under_share10(l10, r):
    g = l10.get(r["pid"]) or []
    if len(g) < 10:
        return None
    c = GLCOL[r["prop"]]
    return sum(1 for x in g if x[c] is not None and x[c] < r["line"]) / 10.0


def rank_rows(app, native, ctx, w):
    """native Under legs of the app (its engine's own dicts, 'score' = the model's baseline chance of the Under) -> rows with the blend, best first"""
    rows = []
    for l in native:
        pid = str(l["player_id"]); t = ctx["team"].get(pid); g = ctx["game"].get(t)
        if t is None or g is None or t in ctx["started"]:
            continue
        ph = float(l["score"]); pb = ctx["book"].get((pid, l["prop"], round(float(l["line"]), 2)))
        z = w[0] + w[1] * lg(ph) + w[3] * lg(pb if pb is not None else .5) + w[4] * (pb is None) + w[5] * lg(BREAK_EVEN[app]) + w[6]
        rows.append(dict(pid=pid, prop=l["prop"], line=float(l["line"]), ph=ph, pb=pb, blend=1 / (1 + math.exp(-z)), team=t, game=g, home=t in ctx["home"],
                         starter="START" in str(ctx["role"].get(pid) or "").upper(), leg=l))
    rows.sort(key=lambda r: (-r["blend"], r["pid"], r["prop"], r["line"]))
    best = {}
    for r in rows:                                           # one line a player and prop: the best by the blend
        best.setdefault((r["pid"], r["prop"]), r)
    return [r for r in rows if best[(r["pid"], r["prop"])] is r]


def load_sources(conn, day, weights):
    import live_slip_engine as LSE
    import ud_live_slip_engine as UD
    pp_all = [l for l in LSE.load_board_legs_live(conn, day, "window") if l["rank_key"] == "baseline_hp" and l["tier"] == "R" and str(l["side"]).lower().startswith("u")
              and l["score"] is not None]
    pp = [l for l in pp_all if l["prop"] in SINGLE]
    # owner 2026-11-20 00:00 PT ("if brings ROI up, bring it in"): PrizePicks takes half-point lines only - a whole-number line can push and a push drops the
    # slip a size (pass 13: 3-pick Power +17% -> +27%, 4-pick Flex +10% -> +24%, 5-pick Flex +24% -> +39% as placed). Switch: honest_live.pp_half_point_only.
    if HALF_ONLY:
        pp = [l for l in pp if abs(float(l["line"]) % 1) > 1e-9]
    pp_all = [l for l in pp_all if abs(float(l["line"]) % 1) > 1e-9]          # P11 (research: half-point lines, every prop)
    ud_all = UD.load_legs(conn, day)
    # PLACEABILITY (2026-11-20, first live slate): when Underdog's feed carries TWO OR MORE regular (non-alternate) lines for one player and stat
    # (prediction-market players: a balanced -115/-115 line beside a skewed one), the Pick'em screen offers only one of them - on 2026-11-20 Black
    # points 16.5 / 14.5, Mitchell 18.5 / 14.5, Bamba 8.5 / 11.5 and the site showed only the skewed line. The engine picked the balanced line,
    # which could not be placed. Such player-stats (~5% of the board) are left out of the Underdog pool.
    nl = {}
    for l in ud_all:
        if l.get("kind") != "alt":
            nl.setdefault((str(l["player_id"]), l["prop"]), set()).add(float(l["line"]))
    multi = {k for k, v in nl.items() if len(v) > 1}
    ud = [l for l in ud_all if l["rank_key"] == "baseline_hp" and l["tier"] == "R" and str(l["side"]).lower().startswith("u")
          and l["prop"] in SINGLE and l["score"] is not None and (str(l["player_id"]), l["prop"]) not in multi]
    ctx = context(conn, day, {str(l["player_id"]) for l in pp_all + ud})
    ctx["pp_all"] = rank_rows("prizepicks", pp_all, ctx, weights["prizepicks"])
    return rank_rows("underdog", ud, ctx, weights["underdog"]), rank_rows("prizepicks", pp, ctx, weights["prizepicks"]), ctx


def load_target(conn, day, app):
    """the target app's own Under legs by (player, prop): Sleeper / Fliff with their multiplier, Betr table-priced"""
    out = {}
    if app in ("sleeper", "fliff"):
        import roi_app_live_slip_engine as RA
        legs = RA.load_legs(conn, day, app)
    else:
        import betr_live_slip_engine as BE
        legs = BE.board_legs(conn, day)[0]
    for l in legs:
        if str(l["side"]).lower().startswith("u") and l["prop"] in SINGLE and l.get("player_id") is not None:
            out.setdefault((str(l["player_id"]), l["prop"]), []).append(l)
    return out


def onto(target, src, ctx):
    """the source rows (in order) as the target app's own legs: the same player and prop, the line nearest to the source's"""
    out = []
    for r in src:
        g = target.get((r["pid"], r["prop"]))
        if g and r["team"] not in ctx["started"]:
            t = min(g, key=lambda x: (abs(float(x["line"]) - r["line"]), float(x["line"])))
            out.append(dict(pid=r["pid"], prop=r["prop"], line=float(t["line"]), game=r["game"], team=r["team"], blend=r["blend"], ph=r["ph"], leg=t))
    return out


def build(conn, day, apps, weights=None):
    """-> {app: [(code, k, structure, rows of the slip, the strategy's ranked candidates)]}, notes"""
    U, P, ctx = load_sources(conn, day, weights or WEIGHTS)
    notes = [f"{day}: Underdog regular single-stat Unders {len(U)}, PrizePicks {len(P)}; sportsbook number at the exact line on {sum(r['pb'] is not None for r in U)} / {sum(r['pb'] is not None for r in P)}"]
    plan = {}

    same = {}                                                # app -> daily codes whose slip came out identical to one already built (counted, not played twice)

    def add(app, code, k, st, cand, **kw):
        s = pick(cand, k, **kw)
        if s is None:
            notes.append(f"{code}: not enough qualifying legs ({len(cand)} candidates) - no slip"); return
        key = frozenset((r["pid"], r["prop"]) for r in s)
        for c_, k_, st_, s_, _ in plan.get(app, []):
            if k_ == k and st_ == st and frozenset((r["pid"], r["prop"]) for r in s_) == key:
                same.setdefault(app, []).append(code)
                notes.append(f"{code}: the same legs as {c_} today - one slip, not two"); return
        plan.setdefault(app, []).append((code, k, st, s, cand))

    fb = {}                                                  # app -> fallback specs in priority order

    def later(app, code, k, st, cand, **kw):
        fb.setdefault(app, []).append((code, k, st, cand, kw))

    def fill(app):
        """THIN BOARD: while the app has fewer slips than elected strategies, add its fallbacks in order (never the same legs as a slip it already has)"""
        have = plan.get(app, [])
        if not have and app not in plan:
            plan[app] = have
        seen_sets = {frozenset((r["pid"], r["prop"]) for r in x[3]) for x in have}
        for code, k, st, cand, kw in fb.get(app, []):
            if len([x for x in plan[app] if x[0] != "P11"]) + len(same.get(app, [])) >= TARGET[app]:   # P11 is an extra of back-to-back slates, never a slot
                break
            sl = pick(cand, k, **kw)
            if sl is None:
                continue
            key = frozenset((r["pid"], r["prop"]) for r in sl)
            if key in seen_sets:
                continue
            seen_sets.add(key); plan[app].append((code, k, st, sl, cand)); notes.append(f"{app}: thin board - fallback {code} added ({len(plan[app])} of {TARGET[app]} slips)")
        if not plan[app]:
            del plan[app]

    if "underdog" in apps:
        ukey = {}
        for r in U:
            ukey.setdefault((r["pid"], r["prop"]), r)
        # owner 2026-11-23 09:24 / 09:30 PT: daily U9 U10 U11 (+ U12 when the daily certified hit rate exists), fallback U2 U1 (thin board only)
        add("underdog", "U9", 3, "standard", [r for r in U if r["prop"] != "assists"], gcap=2)
        # U10 dropped 2026-11-25 (owner 20:19 PT "remove the negative ones"): standalone on the real 2026-27 boards -28% (9 slips)
        try:
            form = season_form(conn, day, {r["pid"] for r in U})
        except Exception as e:  # noqa: BLE001 - the form layer never costs the slate
            conn.rollback(); form = {}; notes.append(f"U11: game logs not readable ({type(e).__name__}) - skipped")
        add("underdog", "U11", 3, "standard", sorted([r for r in U if r["pb"] is not None and (hot(form, r) or -9) >= 0.10],
                                                     key=lambda r: (-r["pb"], r["pid"], r["prop"], r["line"])))
        later("underdog", "U2", 2, "standard", sorted(U, key=lambda r: (-r["ph"], r["pid"], r["prop"], r["line"])))
        # U1 fallback dropped 2026-11-25: -34% (16 slips) on the real 2026-27 boards
        fill("underdog")
    if "prizepicks" in apps:
        # owner 2026-11-23 09:24 / 09:30 PT: daily P1 P3 P4 P10 P11, fallback P9 (thin board only)
        avg = sorted(P, key=lambda r: (-(r["blend"] + r["ph"]) / 2, r["pid"], r["prop"], r["line"]))
        add("prizepicks", "P1", 5, "flex", [r for r in P if r["line"] < 10 and r["prop"] != "assists"])
        add("prizepicks", "P3", 5, "flex", P)
        add("prizepicks", "P4", 5, "flex", avg)
        add("prizepicks", "P10", 3, "power", P)
        # P11 dropped 2026-11-25 (owner 20:19 PT): standalone on the real 2026-27 boards -56% Flex (9 slips); the old certified-universe study was +70 / +65 / +330%.
        if False:
            # P11: back-to-back players (their last game was yesterday), every prop, half-point lines, by the board score, up to two a game (5-pick Flex).
            # Only on slates with enough such players (research: 66 / 64 / 11 slips a season) - on the others it is simply not built (not a thin board).
            try:
                sc = board_score(conn, day); fm = season_form(conn, day, {r["pid"] for r in ctx["pp_all"]})
                b2b = [dict(r, bscore=sc.get((r["pid"], r["prop"], round(r["line"], 2)))) for r in ctx["pp_all"]
                       if fm.get(r["pid"]) and (day - fm[r["pid"]][2]).days == 1]
                b2b = sorted([r for r in b2b if r["bscore"] is not None], key=lambda r: (-r["bscore"], r["pid"], r["prop"], r["line"]))
                s11 = pick(b2b, 5, gcap=2)
                if s11 is not None:
                    plan.setdefault("prizepicks", []).append(("P11", 5, "flex", s11, b2b))
                else:
                    notes.append(f"P11: {len(b2b)} back-to-back Unders with a board score - no slip today")
            except Exception as e:  # noqa: BLE001
                conn.rollback(); notes.append(f"P11: skipped ({type(e).__name__}: {str(e)[:120]})")
        later("prizepicks", "P9", 4, "flex", P)
        fill("prizepicks")
    tight = sorted(first(U, 2) + first(P, 5), key=lambda r: (-r["blend"], r["pid"]))
    # SLEEPER / FLIFF / BETR (owner 2026-11-23 09:53 PT: "All that goes above 25% go live. All that are over 5% fallbacks. As long as they hold real results").
    # pass 29 (research_pass29.py, nba_score.p29_cells): Sleeper / Fliff judged on their REAL 2026-27 slates (ROI 25%+, still positive without the best slip)
    # with the most recent support season (2025-26, derived prices) positive - that support is what separates real orders from random ones (cells passing:
    # Sleeper 7.3% real vs 0.9% random, Fliff 10.4% vs 2.4%; on 2026-27 alone random orders pass 10%). Betr: real prices in both seasons, pooled.
    # Dropped: S1 (-15 / -5 / -10%), F1 (-10 / +1 / -1%), B6 (2026-27 -4%), B5 (without the best -12%), B21 (without the best -17%).
    avg_p = sorted(P, key=lambda r: (-(r["blend"] + r["ph"]) / 2, r["pid"], r["prop"], r["line"]))
    model_p = sorted(P, key=lambda r: (-r["ph"], r["pid"], r["prop"], r["line"]))
    try:
        sc_p = board_score(conn, day)
    except Exception:  # noqa: BLE001
        conn.rollback(); sc_p = {}
    score_p = sorted([r for r in P if (r["pid"], r["prop"], round(r["line"], 2)) in sc_p], key=lambda r: (-sc_p[(r["pid"], r["prop"], round(r["line"], 2))], r["pid"], r["prop"]))
    for app in ("sleeper", "fliff", "betr"):
        if app not in apps:
            continue
        try:
            tg = load_target(conn, day, app)
        except Exception as e:  # noqa: BLE001 - one app's board never costs the others
            conn.rollback(); notes.append(f"{app}: board not readable ({type(e).__name__}: {str(e)[:120]}) - no slip"); continue
        notes.append(f"{app}: {len(tg)} player-props with an Under on its board")
        tl = onto(tg, tight, ctx); ppo = onto(tg, P, ctx)
        noast = [r for r in tl if r["prop"] != "assists"]
        dp, seen_p = [], set()
        for r in ppo:
            if r["prop"] != "assists" and r["prop"] not in seen_p:
                dp.append(r); seen_p.add(r["prop"])
        rebo = [r for r in ppo if r["prop"] == "rebounds"]
        mx = "perfect" if app == "betr" else "max"
        if app == "sleeper":       # 2026-27 real ROI (2025-26 derived): S4 +61 (+6), S5 +84 (+8), S6 +78 (+31), S7 +200 (+59), S8 +110 (+41), S9 +36 (+9),
            add(app, "S4", 4, "flex", tl); add(app, "S5", 4, "max", tl); add(app, "S6", 5, "flex", tl)          # S10 +42 (+21), S11 +25 (+24)
            add(app, "S7", 5, "max", ppo); add(app, "S9", 2, "max", noast)   # S8 dropped 2026-11-25: -100% (4 slips) on the real 2026-27 boards
            add(app, "S10", 3, "max", dp); add(app, "S11", 2, "max", rebo)
            add(app, "S12", 5, "max", ppo, diff_prop=True)                       # NEW +169% (+70%), w/o best +72%
            add(app, "S13", 6, "flex", onto(tg, avg_p, ctx))                       # NEW +158% (+66%), w/o best +57%
        elif app == "fliff":       # F4 +99 (+17), F5 +122 (+61), F6 +127 (+53), F7 +206 (+63), F8 +44 (+16), F9 +43 (+22), F10 +32 (+31)
            add(app, "F4", 4, "max", tl); add(app, "F5", 5, "max", tl)
            add(app, "F7", 5, "max", ppo); add(app, "F8", 2, "max", noast)   # F6 dropped 2026-11-25: -100% (4 slips) on the real 2026-27 boards
            add(app, "F9", 3, "max", dp); add(app, "F10", 2, "max", rebo)
            add(app, "F11", 5, "max", ppo, diff_prop=True)                       # NEW +175% (+75%), w/o best +75%
            add(app, "F12", 6, "max", [r for r in ppo if float(r["leg"].get("m") or 0) >= 1.8])   # NEW +272% (+72%), w/o best +81%
        else:                      # Betr, real both seasons (2025-26 / 2026-27, pooled)
            add(app, "B7", 5, "perfect", onto(tg, model_p, ctx), diff_prop=True)                          # NEW +62 / +140% (pooled +73%)
            add(app, "B8", 3, "perfect", [r for r in ppo if r["prop"] != "assists"], diff_prop=True, gcap=2)  # NEW +30 / +38% (pooled +31%)
            later(app, "B1", 3, "perfect", tl)                                                              # fallback: +17 / +20%
            later(app, "B9", 3, "perfect", onto(tg, score_p, ctx), diff_prop=True)                          # fallback: +7 / +83% (pooled +20%)
        fill(app)
    # LEG GONE (owner 2026-11-23 09:24 PT "check the best ... leg sub, shrink or slip drop. If leg sub, have clear what is the pool used. We keep the best ROI";
    # research_set_check.py, every leg of every slip removed in turn, profit per affected slip): the next-leg pool each slip carries to the Slips screen -
    #   sub from the app's MAIN list (every regular single-stat Under, main-ranking order): P1 (+0.20 u vs own +0.16), P4 (+0.23 vs +0.22),
    #     U11 (+0.28 vs +0.21), U2 (+0.19 vs -0.11)
    #   sub from the strategy's OWN list: P3 (+0.20; shrink +0.20, the same), P10 (+0.15; shrink +0.02), P11 (+0.49), U9 (+0.04; shrink -0.01),
    #     U10 (+0.06), U1 (+0.14), P9 (-0.01, drop 0 - kept on its own list: the owner's never-skip rule of 2026-11-13; the gap is 0.01 u)
    #   shrinking or dropping never beat the best sub on a daily code.
    rp = {r["pid"] for a in REST_SKIP for x in plan.get(a, []) for r in x[3]}
    plan = compose(plan, notes, game_spreads(conn, day), rest_days(conn, day, rp))
    # 2026-11-24 FIX: every requested app stays in the plan even with no slip left (spread / rest / overlap rules can empty it), so write() still
    # retires that app's old non-honest slips - on 11-24 Fliff and Sleeper had no honest slip and the retired F_UDT1 / S_F slips stayed on the screen.
    plan = {a: plan.get(a) or [] for a in set(apps) | set(plan)}
    MAINPOOL = {"P1": P, "P4": P, "U11": U, "U2": U}
    for app_, slips_ in plan.items():
        plan[app_] = [(c_, k_, st_, s_, MAINPOOL.get(c_, cand_)) for c_, k_, st_, s_, cand_ in slips_]
    return plan, notes


def describe(app, code, k, st, s):
    return f"{code} {k}-pick {st}: " + "; ".join(f"{r['leg'].get('player')} {r['prop']} Under {r['line']:g}" + (f" x{float(r['leg']['m']):.2f}" if r["leg"].get("m") and app in ("sleeper", "fliff") else "")
                                                 + f" ({100 * r['blend']:.1f}%)" for r in s)


def write(conn, day, plan, commit=True):
    import next_legs_store as NL
    n = 0
    for app, slips in plan.items():
        if app == "prizepicks":
            conn.execute("DELETE FROM nba_score.live_slips WHERE game_date = %s AND strategy LIKE 'H\\_%%' AND hits IS NULL", (day,))
            conn.execute("UPDATE nba_score.live_slips SET status = 'placed_shadow' WHERE game_date = %s AND strategy NOT LIKE 'H\\_%%' AND status NOT LIKE '%%shadow%%' AND status <> 'dup' AND hits IS NULL", (day,))
            for code, k, st, s, cand in slips:
                lj = [{"cell": f"{r['prop']}_R", "player": r["leg"]["player"], "player_id": r["pid"], "prop": r["prop"], "tier": "R", "side": "Under", "line": r["line"], "factor": 1.0,
                       "event_id": r["leg"].get("event_id"), "p": round(r["blend"], 4)} for r in s]
                conn.execute("""INSERT INTO nba_score.live_slips (game_date, strategy, k, legs_json, size, structure, status, stake_weight) VALUES (%s,%s,1,%s,%s,%s,'placed',1)
                                ON CONFLICT (game_date, strategy, k) DO NOTHING""", (day, NAMES[code], json.dumps(lj), k, st))
                conn.execute("""INSERT INTO nba_score.live_strategy_state (strategy, state, live_cap, hurdles, updated_at) VALUES (%s, 'active', 1, '{}', now())
                                ON CONFLICT (strategy) DO UPDATE SET state = 'active', updated_at = now()""", (NAMES[code],))
                NL.store(conn, day, NAMES[code], 1, [dict(r["leg"], tier="R", factor=1.0, p=round(r["blend"], 4)) for r in cand], exclude_players={r["leg"]["player"] for r in s})
                n += 1
        elif app == "underdog":
            conn.execute("DELETE FROM nba_score.ud_live_slips WHERE game_date = %s AND portfolio = 'H' AND hits IS NULL", (day,))
            conn.execute("UPDATE nba_score.ud_live_slips SET status = 'shadow' WHERE game_date = %s AND portfolio <> 'H' AND status NOT LIKE 'shadow%%' AND hits IS NULL", (day,))
            for code, k, st, s, cand in slips:
                lj = [{"cell": f"H:{code}", "player": r["leg"]["player"], "player_id": r["pid"], "prop": r["prop"], "tier": "R", "side": "Under", "line": r["line"], "factor": 1.0,
                       "event_id": r["leg"].get("event_id"), "p_hat": round(r["blend"], 4)} for r in s]
                conn.execute("""INSERT INTO nba_score.ud_live_slips (game_date, portfolio, composition, size, structure, k, legs_json, stake, status, absence_flag)
                                VALUES (%s,'H',%s,%s,%s,1,%s,1.0,'live',false)""", (day, NAMES[code], k, st, json.dumps(lj)))
                # 2026-11-20 FIX (first live slate): the Slips screen looks a slip's next ranked legs up under ITS name for an Underdog slip - "UD <portfolio> <composition> <size><S|F>" -
                # not under the composition alone; stored under the composition they were never found and a moved leg got a generic backup-pool leg instead of the strategy's next Under.
                NL.store(conn, day, f"UD H {NAMES[code]} {k}{'F' if st == 'flex' else 'S'}", 1, [dict(r["leg"], tier="R", factor=1.0, p=round(r["blend"], 4)) for r in cand],
                         exclude_players={r["leg"]["player"] for r in s})
                n += 1
        elif app in ("sleeper", "fliff"):
            import roi_app_live_slip_engine as RA
            import sleeper_live_slip_engine as SL
            tbl = RA.TABLE[app]; pr = SL.pricing(conn)
            conn.execute(f"DELETE FROM {tbl} WHERE game_date = %s AND strategy LIKE 'H\\_%%' AND graded_at IS NULL", (day,))
            conn.execute(f"UPDATE {tbl} SET status = 'shadow', stake = 0 WHERE game_date = %s AND strategy NOT LIKE 'H\\_%%' AND status <> 'shadow' AND graded_at IS NULL", (day,))
            tm = SL.teams_of(conn, {r["pid"] for _c, _k, _s, s, _cand in slips for r in s}, day)
            for code, k, st, s, cand in slips:
                legs = [dict(r["leg"], team=tm.get(r["pid"]), roi=0.0, score_roi=0.0) for r in s]
                if app == "fliff":
                    RA.insert(conn, app, day, NAMES[code], (None, None, None, None, None, k, st), 1, legs, pr)
                else:                                        # Sleeper: Max = the product x the size bonus; Flex = Sleeper's own tiers
                    ms = [float(l["m"]) for l in legs]
                    lj = [{"player": l["player"], "player_id": l["player_id"], "prop": l["prop"], "side": l["side"], "line": l["line"], "factor": l["m"], "p": round(float(l["p"]), 4),
                           "team": l.get("team"), "event_id": l["event_id"], "tier": "R", "kind": l.get("kind") or "main"} for l in legs]
                    tiers = SL.flex_tiers(ms, pr[1], pr[2]) if st == "flex" else None
                    model = tiers[k] if tiers else math.prod(ms) * pr[0].get(k, 1.0)
                    conn.execute("""INSERT INTO nba_score.sleeper_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier, flex_tiers)
                                    VALUES (%s,%s,%s,%s,1,%s,1,'live',%s,%s)
                                    ON CONFLICT (game_date, strategy, k) DO UPDATE SET legs_json = EXCLUDED.legs_json, status = EXCLUDED.status,
                                      model_multiplier = EXCLUDED.model_multiplier, flex_tiers = EXCLUDED.flex_tiers, built_at = now()
                                    WHERE nba_score.sleeper_live_slips.graded_at IS NULL""",
                                 (day, NAMES[code], k, st, json.dumps(lj), round(float(model), 4), json.dumps(tiers) if tiers else None))
                NL.store(conn, day, NAMES[code], 1, [dict(r["leg"]) for r in cand], exclude_players={r["leg"]["player"] for r in s})
                n += 1
        elif app == "betr":
            import betr_live_slip_engine as BE
            rj = BE.rules(conn)
            last = conn.execute("SELECT max(snapshot_ts) FROM nba_market.board_snapshots WHERE bookmaker = 'betr' AND game_date = %s", (day,)).fetchone()[0]
            conn.execute("DELETE FROM nba_score.betr_live_slips WHERE game_date = %s AND strategy LIKE 'H\\_%%' AND graded_at IS NULL", (day,))
            conn.execute("UPDATE nba_score.betr_live_slips SET status = 'shadow', stake = 0 WHERE game_date = %s AND strategy NOT LIKE 'H\\_%%' AND status <> 'shadow' AND graded_at IS NULL", (day,))
            for code, k, st, s, cand in slips:
                lj = [{"player": r["leg"]["player"], "player_id": r["pid"], "prop": r["prop"], "side": "Under", "line": r["line"], "factor": 1.0, "p": round(float(r["leg"]["p"]), 4),
                       "pf": round(float(r["leg"].get("pf") or .5), 4), "team": r["leg"].get("team"), "event_id": r["leg"].get("event_id"), "tier": "REGULAR"} for r in s]
                mult = BE.top_multiplier(k, lj, rj, "perfect")
                conn.execute("""INSERT INTO nba_score.betr_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier, board_ts)
                                VALUES (%s,%s,%s,'perfect',1,%s,1,'live',%s,%s) ON CONFLICT (game_date, strategy, k) DO NOTHING""", (day, NAMES[code], k, json.dumps(lj), mult, last))
                NL.store(conn, day, NAMES[code], 1, [dict(r["leg"]) for r in cand], exclude_players={r["leg"]["player"] for r in s})     # 2026-11-20: Betr slips had no next-leg list
                n += 1
    if commit:
        conn.commit()
    return n


def main():
    import psycopg
    ds = (os.environ.get("HL_DATE") or "").strip()
    day = dt.date.fromisoformat(ds) if ds else dt.datetime.now(PT).date()
    dry = os.environ.get("HL_DRY") == "1"
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = '240s'")
        g = gate(conn)
        global HALF_ONLY
        HALF_ONLY = g.get("pp_half_point_only", True) is not False
        if not g.get("enabled") and not dry and os.environ.get("HL_TEST") != "1":
            log(f"HONEST_LIVE|disabled (classification_config honest_live.enabled) - nothing built for {day}; the other engines' slips stand"); return
        want = [a.strip() for a in (os.environ.get("HL_APPS") or ",".join(g.get("apps") or ALL_APPS)).split(",") if a.strip()]
        apps = [a for a in want if a in (g.get("apps") or ALL_APPS) or dry or os.environ.get("HL_TEST") == "1"]
        try:                                                 # the FINAL SET engine (final_live_slip_engine.py) serves the apps of its own gate; this engine leaves them alone
            r_ = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = 'final_live'").fetchone()
            fg = (r_[0] if isinstance(r_[0], dict) else json.loads(r_[0])) if r_ else {}
            if fg.get("enabled") and not dry:
                served = set(fg.get("apps") or ALL_APPS)
                if served & set(apps):
                    log(f"HONEST_LIVE|final_live serves {sorted(served & set(apps))} - this engine skips them")
                apps = [a for a in apps if a not in served]
        except Exception:  # noqa: BLE001
            conn.rollback()
        weights = dict(WEIGHTS)
        try:                                                 # the latest month the nightly walk-forward fit stored (never a later month than the slate's)
            for a_, w_ in conn.execute("""SELECT DISTINCT ON (app) app, weights FROM nba_score.honest_blend_weights WHERE month <= %s ORDER BY app, month DESC""", (day.strftime("%Y-%m"),)).fetchall():
                w_ = w_ if isinstance(w_, list) else json.loads(w_)
                if a_ in weights and len(w_) == 7:
                    weights[a_] = [float(x) for x in w_]
        except Exception:  # noqa: BLE001
            conn.rollback()
        weights.update(g.get("weights") or {})
        log(f"HONEST_LIVE|blend weights: {weights}")
        plan, notes = build(conn, day, apps, weights)
        for x in notes:
            log(f"HONEST_LIVE|{x}")
        for app in apps:
            for code, k, st, s, _cand in plan.get(app, []):
                log(f"HONEST_LIVE|{day} {app}: {describe(app, code, k, st, s)}")
        if dry:
            conn.rollback(); log("HONEST_LIVE|dry run - nothing written"); return
        # an app whose slips cannot be built keeps what the other engines built: old strategies are demoted only where this engine wrote slips
        if os.environ.get("HL_TEST") == "1":                 # every statement of the write path, then rolled back: nothing is kept
            n = write(conn, day, plan, commit=False)
            for t_ in ("live_slips", "ud_live_slips", "sleeper_live_slips", "fliff_live_slips", "betr_live_slips"):
                c_ = "portfolio = 'H'" if t_ == "ud_live_slips" else "strategy LIKE 'H\\_%%'"
                log(f"HONEST_LIVE|test {t_}: " + str(conn.execute(f"SELECT count(*), min(status), max(structure), max(size) FROM nba_score.{t_} WHERE game_date = %s AND {c_}", (day,)).fetchone()))
            conn.rollback(); log(f"HONEST_LIVE|write-path test: {n} slips written and rolled back"); return
        n = write(conn, day, plan)
        log(f"HONEST_LIVE|{day}: {n} slips written on {', '.join(a for a in apps if plan.get(a)) or 'no app'}")


if __name__ == "__main__":
    main()
