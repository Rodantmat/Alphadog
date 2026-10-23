#!/usr/bin/env python3
"""
RESEARCH - WHERE THE CALIBRATED final_hp IS STILL WRONG, BY GAME ENVIRONMENT (2026-10-23; owner 09:51 PT: "keep digging, researching,
learning, identifying, granulating profiles"). READ-ONLY.

Why leg level: board-profile rules on ~155 slates a season over-fit (research_pp_board_profiles_v3 run 39991477715 - no rule held both
ways); one slate is one draw, but one slate holds hundreds of graded legs. If the slate's environment matters, it shows first as a
BIAS of the calibrated probability on the legs it touches - and a bias can be corrected for every strategy at once (an L3 environment
layer of final_hp_board_cal), instead of choosing strategies per slate.

LEGS: every PrizePicks window leg of the tier map (rank 'final_hp' = the board-centred final_hp, walk-forward), both seasons, final 7
days out, graded (hit 0 / 1). ENVIRONMENT of the leg's game (known before tip): closing game total (median across books, on the LOCAL
game date - the table's date is the UTC tip date; tercile of the season), the player's team spread (favourite by 8+ / close +-7.5 / underdog by 8+), the team on the 2nd night of a back-to-back, the
opponent on a back-to-back, slate size (<= 4 / 5-8 / 9+ games), month block (Oct-Nov / Dec-Jan / Feb-Apr).
RESIDUAL = hit - final_hp, per cell (prop group x side x line type x environment bucket): mean residual, n, z = mean / se; per season.
CONSISTENT = same sign in both seasons, |z| >= 2.5 in both, n >= 300 in both. Also the pooled log-loss gain if each consistent cell's
residual (fitted on one season) is added in log-odds to the other season's legs (cross-fitted, both directions).
PROP GROUPS: points, rebounds, assists, threes (threes_made), combos (pra / pts_reb / pts_ast / reb_ast), lowvol (steals / blocks /
turnovers / stocks). LINE TYPES: R, G (G1-3), D (D1-3).
Env: DATABASE_URL.
"""
import datetime as dt
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pp_calibrated_slips as RC   # noqa: E402

SEASONS = ("2024-25", "2025-26")
GROUP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combos", "pts_reb": "combos",
         "pts_ast": "combos", "reb_ast": "combos", "steals": "lowvol", "blocks": "lowvol", "turnovers": "lowvol", "stocks": "lowvol"}


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sig(z):
    return 1 / (1 + np.exp(-z))


def _nm(x):
    x = "".join(ch for ch in str(x).lower() if ch.isalpha())
    return "losangelesclippers" if x == "laclippers" else x


def game_lines_local(conn):
    """closing game lines keyed by the LOCAL (US) game date: game_lines_closing.game_date is the UTC date of tip, so a 7 PM PT game
    sits on the next day (2025-12-10 OKC - PHX is dated 12-11). The local date is the schedule's (nba_market.schedule_norm) date of the
    same home / away pairing on the line's date or the day before. -> [(local_date, home_full_name, away_full_name, total, home_spread)]"""
    sched = {(d, h, a) for d, h, a in conn.execute("SELECT game_date, home, away FROM nba_market.schedule_norm")}
    out, unmatched = [], 0
    for d, h, a, tot, hs in conn.execute("""SELECT game_date, home_team, away_team, total_line::float8, home_spread::float8
                                            FROM nba_market.game_lines_closing WHERE game_date BETWEEN '2024-10-01' AND '2026-06-30'"""):
        hn, an = _nm(h), _nm(a)
        if (d, hn, an) in sched:
            out.append((d, h, a, tot, hs))
        elif (d - dt.timedelta(days=1), hn, an) in sched:
            out.append((d - dt.timedelta(days=1), h, a, tot, hs))
        else:
            unmatched += 1
    print(f"game lines on the local date: {len(out):,} rows (unmatched to the schedule {unmatched:,})", flush=True)
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = RC.load(conn)
    name_tid = {n: t for n, t in conn.execute("SELECT full_name, team_id FROM nba_ref.teams")}
    name_tid["Los Angeles Clippers"] = name_tid.get("LA Clippers", name_tid.get("Los Angeles Clippers"))
    gl = defaultdict(list)   # (local game date, team_id) -> [(total, team_spread, opp_tid)]
    for d, h, a, tot, hs in game_lines_local(conn):
        th, ta = name_tid.get(h), name_tid.get(a)
        if th is None or ta is None:
            continue
        gl[(d, th)].append((tot, hs, ta))
        gl[(d, ta)].append((tot, -hs if hs is not None else None, th))
    env_game = {}
    for k, v in gl.items():
        t = [x[0] for x in v if x[0] is not None]
        s = [x[1] for x in v if x[1] is not None]
        env_game[k] = (float(np.median(t)) if t else None, float(np.median(s)) if s else None, v[0][2])
    team_dates = defaultdict(set)
    for tid, d in conn.execute("SELECT DISTINCT team_id, game_date FROM nba_stats.player_game_log WHERE season = ANY(%s)", (list(SEASONS),)):
        team_dates[str(tid)].add(d)
    tot_cut = {}
    for s in SEASONS:
        ds = {d for (ss, d) in days if ss == s}
        tots = [v[0] for (d, t), v in env_game.items() if d in ds and v[0] is not None]
        tot_cut[s] = np.percentile(tots, [33.3, 66.7]) if tots else (0, 0)
    print("total terciles: " + ", ".join(f"{s} {c[0]:.1f} / {c[1]:.1f}" for s, c in tot_cut.items()), flush=True)

    rows = []   # (season, group, side, lt, env dict, p, hit)
    miss = 0
    for (s, d), legs in days.items():
        games = len({l["event_id"] for l in legs if l["event_id"] is not None})
        size = "S<=4" if games <= 4 else ("M5-8" if games <= 8 else "L9+")
        mb = "Oct-Nov" if d.month in (10, 11) else ("Dec-Jan" if d.month in (12, 1) else "Feb-Apr")
        for l in legs:
            if l["hit"] is None or l["p"] is None or l["prop"] not in GROUP:
                continue
            e = env_game.get((d, l["team_id"]))
            if e is None or e[0] is None or e[1] is None:
                miss += 1
                continue
            tot, sp, opp = e
            c = tot_cut[s]
            env = {
                "total": "low" if tot <= c[0] else ("mid" if tot <= c[1] else "high"),
                "spread": "fav8+" if sp <= -8 else ("dog8+" if sp >= 8 else "close"),
                "b2b": "yes" if (d - dt.timedelta(days=1)) in team_dates.get(str(l["team_id"]), ()) else "no",
                "opp_b2b": "yes" if (d - dt.timedelta(days=1)) in team_dates.get(str(opp), ()) else "no",
                "slate": size,
                "month": mb,
            }
            lt = l["tier"][0]
            rows.append((s, GROUP[l["prop"]], l["side"], lt, env, float(l["p"]), int(l["hit"])))
    print(f"graded legs with a game environment: {len(rows):,} (no environment {miss:,})", flush=True)

    dims = ["total", "spread", "b2b", "opp_b2b", "slate", "month"]
    print("\nPOOLED (all props / sides / line types) - mean residual hit - final_hp by environment bucket, per season (n, z)")
    for dm in dims:
        for s in SEASONS:
            acc = defaultdict(list)
            for r in rows:
                if r[0] == s:
                    acc[r[4][dm]].append(r[6] - r[5])
            print(f"  {dm:<8} {s}: " + "  ".join(f"{b} {np.mean(v):+.4f} (n {len(v):,}, z {np.mean(v) / (np.std(v) / np.sqrt(len(v))):+.1f})"
                                               for b, v in sorted(acc.items())))
    # cells
    cell = defaultdict(lambda: defaultdict(list))
    for s, g, sd, lt, env, p, h in rows:
        for dm in dims:
            cell[(g, sd, lt, dm, env[dm])][s].append(h - p)
    print("\nCONSISTENT CELLS (prop group x side x line type x environment bucket; same sign, |z| >= 2.5 and n >= 300 in BOTH seasons)")
    cons = []
    for k, v in cell.items():
        st = {}
        for s in SEASONS:
            a = np.array(v.get(s, []))
            if len(a) < 300:
                break
            se = a.std() / np.sqrt(len(a))
            st[s] = (a.mean(), len(a), a.mean() / se if se > 0 else 0)
        if len(st) < 2:
            continue
        if all(abs(st[s][2]) >= 2.5 for s in SEASONS) and np.sign(st[SEASONS[0]][0]) == np.sign(st[SEASONS[1]][0]):
            cons.append((k, st))
    cons.sort(key=lambda x: -min(abs(x[1][s][2]) for s in SEASONS))
    for k, st in cons[:80]:
        print(f"  {k[0]:<8} {k[1]:<5} {k[2]} {k[3]:<8}={k[4]:<8} " + " | ".join(
            f"{s}: resid {st[s][0]:+.4f} n {st[s][1]:>7,} z {st[s][2]:+5.1f}" for s in SEASONS))
    print(f"  {len(cons)} consistent cells of {len(cell)}")

    # cross-fitted log-loss with an additive log-odds correction per (group, side, lt, dim=bucket) for each single dimension
    def ll(p, y):
        p = np.clip(p, 1e-4, 1 - 1e-4)
        return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
    print("\nCROSS-FITTED CORRECTION per single dimension (fit a log-odds shift per group x side x line type x bucket on one season, shrunk "
          "n / (n + 2000); apply to the other)")
    for dm in dims + ["ALL"]:
        out = []
        for fit, app in (SEASONS, SEASONS[::-1]):
            sh = {}
            fr = [r for r in rows if r[0] == fit]
            keys = defaultdict(list)
            for r in fr:
                bk = tuple(r[4][x] for x in dims) if dm == "ALL" else r[4][dm]
                keys[(r[1], r[2], r[3], bk)].append(r)
            for k, v in keys.items():
                p = np.array([x[5] for x in v]); y = np.array([x[6] for x in v])
                # one Newton step for an additive log-odds shift from z = logit(p)
                z = logit(p)
                b = 0.0
                for _ in range(6):
                    q = sig(z + b)
                    g = np.sum(y - q); hss = np.sum(q * (1 - q))
                    b += g / max(hss, 1e-9)
                n = len(v)
                sh[k] = b * n / (n + 2000)
            ar = [r for r in rows if r[0] == app]
            p0 = np.array([r[5] for r in ar]); y = np.array([r[6] for r in ar])
            adj = np.array([sh.get((r[1], r[2], r[3], tuple(r[4][x] for x in dims) if dm == "ALL" else r[4][dm]), 0.0) for r in ar])
            p1 = sig(logit(p0) + adj)
            out.append(f"fit {fit} -> {app}: log-loss {ll(p0, y):.5f} -> {ll(p1, y):.5f} ({ll(p1, y) - ll(p0, y):+.5f})")
        print(f"  {dm:<8} " + " | ".join(out))


if __name__ == "__main__":
    main()
