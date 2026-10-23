#!/usr/bin/env python3
"""
RESEARCH - WHAT MAKES A 35% DAY AND A 78% DAY? (2026-10-22 PT; owner 17:49 PT: "On these swings understand what differ a 35% to a 78%,
it is highly unlikely that a 100% of these swings are just out of luck"). READ-ONLY.

Legs: every graded leg of both seasons with our numbers (nba_score.tier_map_legs_sel_wo, pivoted), its game and the player's minutes
(nba_stats.player_game_log through nba_ref.player_name_map), and the game's context from nba_team.team_game_log.
Per leg, the residual r = hit - p, where p = our final_hp recalibrated in-sample per line type x side (logistic on logit final_hp - only
to take the known overconfidence out of the residual; this is an explanation, not a forecast).
Drivers measured per leg (all known only AFTER the game - they explain, they do not predict; part B asks which ones are predictable):
  side s (+1 More / -1 Less); SCORING ENVIRONMENT env = game total - expected total (each team's trailing-10 points for and
  allowed), in units of 10 points; MINUTES SHOCK = minutes - the player's trailing-10 minutes, in units of 5; BLOWOUT = final margin
  >= 20; the player's own role (trailing-10 minutes tier).
A  LUCK SHARE per line type: variance of the day's hit rate of the legs we rate >= .58 vs the variance pure binomial luck would give
   (sum p(1-p) / n^2 per day, legs independent; and with a player's legs that day fully tied - the upper bound, since one player's
   points / PRA / pts_reb rise and fall together). Observed / luck > 1 = real day-level forces exist.
B  WHAT EXPLAINS THE RESIDUAL: OLS of r on s*env, s*minshock, blowout, s*blowout, minshock (per line type); then per day the mean
   predicted residual of the >= .58 legs vs the actual one - the share of the day-to-day swing those forces explain.
C  THE EXTREME DAYS: the 10% best and 10% worst days (>= .58 standard legs, n >= 20) side by side - side mix, s*env, minutes shock,
   blowout share, prop mix, games, legs - per season.
D  STREAKS: lag-1 / lag-2 autocorrelation of the day's residual (is a good day followed by a good day?), per line type and season.
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import numpy as np
import psycopg

SEASONS = ("2024-25", "2025-26")
FAM = {"steals": "DEF", "blocks": "DEF", "stocks": "DEF", "turnovers": "DEF", "points": "SCORE", "pra": "SCORE", "pts_reb": "SCORE",
       "pts_ast": "SCORE", "rebounds": "BOARDS", "reb_ast": "BOARDS", "assists": "AST", "threes_made": "3PM"}
EPS = 1e-4


def logit(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sig(z):
    return 1.0 / (1.0 + np.exp(-z))


def fit_logistic(X, y, iters=40):
    beta = np.zeros(X.shape[1])
    for _ in range(iters):
        p = sig(X @ beta)
        g = X.T @ (y - p) - 1e-3 * beta
        H = -(X.T * (p * (1 - p))) @ X - 1e-3 * np.eye(X.shape[1])
        step = np.linalg.solve(H, g)
        beta -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    return beta


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    # ---- player games: minutes, trailing-10 minutes; team games: points for / against, trailing-10
    name_pid = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    pg = defaultdict(list)
    for pid, d, gid, mn in conn.execute("""SELECT nba_player_id::text, game_date, game_id, min FROM nba_stats.player_game_log
                                           WHERE game_date >= '2024-09-01' ORDER BY nba_player_id, game_date""").fetchall():
        try:
            m = float(mn) if mn is not None else None
        except ValueError:
            m = None
        pg[pid].append((d, gid, m))
    pinfo = {}
    for pid, games in pg.items():
        hist = []
        for d, gid, m in games:
            trail = np.mean(hist[-10:]) if len(hist) >= 3 else None
            pinfo[(pid, d)] = (gid, m, trail)
            if m is not None:
                hist.append(m)
    tg = defaultdict(dict)
    for gid, tid, d, pts in conn.execute("SELECT game_id, team_id, game_date, pts FROM nba_team.team_game_log WHERE game_date >= '2024-09-01'").fetchall():
        tg[gid][tid] = (d, float(pts))
    team_hist = defaultdict(list)          # tid -> [(date, for, against)]
    for gid, t in tg.items():
        if len(t) != 2:
            continue
        (a, (d, pa)), (b, (_, pb)) = list(t.items())
        team_hist[a].append((d, pa, pb)); team_hist[b].append((d, pb, pa))
    for v in team_hist.values():
        v.sort()
    trail_team = {}
    for tid, v in team_hist.items():
        for i, (d, f, ag) in enumerate(v):
            prev = v[max(0, i - 10):i]
            trail_team[(tid, d)] = (np.mean([x[1] for x in prev]), np.mean([x[2] for x in prev])) if len(prev) >= 3 else None
    game_ctx = {}
    for gid, t in tg.items():
        if len(t) != 2:
            continue
        (a, (d, pa)), (b, (_, pb)) = list(t.items())
        ta, tb = trail_team.get((a, d)), trail_team.get((b, d))
        exp_total = (ta[0] + tb[1] + tb[0] + ta[1]) / 2 if ta and tb else None
        game_ctx[gid] = (pa + pb, exp_total, abs(pa - pb))
    print(f"player-games {len(pinfo):,}, games {len(game_ctx):,}", flush=True)

    legs = {}
    for season, d, rk, pl, nn, pr, sd, ln, t, sc, h in conn.execute(
            """SELECT season, game_date, rank_key, player, nba_ref.norm_name(player), prop, side, line::float8, tier, score, hit
               FROM nba_score.tier_map_legs_sel_wo WHERE season = ANY(%s) AND hit IS NOT NULL AND rank_key = 'final_hp'""", (list(SEASONS),)):
        if pr not in FAM:
            continue
        legs[(season, d, pl, pr, sd, round(ln, 1), t)] = (float(sc), int(h), name_pid.get(nn))
    print(f"legs {len(legs):,}", flush=True)
    R = []
    for (season, d, pl, pr, sd, ln, t), (fh, h, pid) in legs.items():
        info = pinfo.get((pid, d)) if pid else None
        if not info:
            continue
        gid, m, trail = info
        ctx = game_ctx.get(gid)
        if not ctx or ctx[1] is None or m is None or trail is None:
            continue
        lt = "R" if t == "R" else t[0]
        R.append((season, d, lt, pr, 1.0 if sd == "Over" else -1.0, fh, h, (ctx[0] - ctx[1]) / 10.0, (m - trail) / 5.0,
                  1.0 if ctx[2] >= 20 else 0.0, trail, pl))
    print(f"legs with game context: {len(R):,}", flush=True)
    season = np.array([r[0] for r in R]); day = np.array([r[1] for r in R]); lt = np.array([r[2] for r in R]); prop = np.array([r[3] for r in R])
    s = np.array([r[4] for r in R]); fh = np.array([r[5] for r in R]); y = np.array([r[6] for r in R], float)
    env = np.array([r[7] for r in R]); msh = np.array([r[8] for r in R]); blow = np.array([r[9] for r in R]); plyr = np.array([r[11] for r in R])
    p = np.empty(len(R))
    for t in set(lt):
        for sv in (1.0, -1.0):
            m = (lt == t) & (s == sv)
            X = np.column_stack([np.ones(m.sum()), logit(fh[m])])
            p[m] = sig(X @ fit_logistic(X, y[m]))
    r = y - p
    for t in ("R", "G", "D"):
        print(f"\n{'=' * 130}\nLINE TYPE {t}")
        for se in SEASONS:
            m = (lt == t) & (season == se)
            # B regression
            X = np.column_stack([np.ones(m.sum()), s[m] * env[m], s[m] * msh[m], msh[m], blow[m], s[m] * blow[m]])
            beta, *_ = np.linalg.lstsq(X, r[m], rcond=None)
            pred = X @ beta
            r2 = 1 - np.var(r[m] - pred) / np.var(r[m])
            print(f"  {se}: legs {int(m.sum()):,}; residual on drivers (per 10 pts of scoring surprise / 5 min of minutes shock):"
                  f" side x env {beta[1]:+.4f}, side x min-shock {beta[2]:+.4f}, min-shock {beta[3]:+.4f}, blowout {beta[4]:+.4f},"
                  f" side x blowout {beta[5]:+.4f}; leg-level R2 {r2:.3f}")
            # A luck share and day-level explained share (>= .58 legs)
            top = m & (fh >= 0.58)
            days = sorted(set(day[top]))
            obs, luck, luck_hi, act, prd, rows = [], [], [], [], [], []
            for d in days:
                mm = top & (day == d)
                n = int(mm.sum())
                if n < 20:
                    continue
                obs.append(y[mm].mean())
                luck.append(np.sum(p[mm] * (1 - p[mm])) / n ** 2)
                cl = defaultdict(list)
                for pl_, pv in zip(plyr[mm], p[mm]):
                    cl[pl_].append(pv)
                luck_hi.append(sum(len(v) ** 2 * np.mean(v) * (1 - np.mean(v)) for v in cl.values()) / n ** 2)
                act.append(r[mm].mean())
                Xd = np.column_stack([np.ones(n), s[mm] * env[mm], s[mm] * msh[mm], msh[mm], blow[mm], s[mm] * blow[mm]])
                prd.append(float((Xd @ beta).mean()))
                rows.append({"d": d, "hit": y[mm].mean(), "n": n, "under": float((s[mm] < 0).mean()), "senv": float((s[mm] * env[mm]).mean()),
                             "msh": float(msh[mm].mean()), "blow": float(blow[mm].mean()),
                             "def": float(np.mean([FAM[x] == "DEF" for x in prop[mm]])), "score": float(np.mean([FAM[x] == "SCORE" for x in prop[mm]]))})
            if len(obs) < 10:
                continue
            ov, lv, lh = float(np.var(obs)), float(np.mean(luck)), float(np.mean(luck_hi))
            act, prd = np.array(act), np.array(prd)
            expl = 1 - np.var(act - prd) / np.var(act) if np.var(act) > 0 else float("nan")
            print(f"    A  days (>= .58 legs, n >= 20): {len(obs)}; day hit sd {np.sqrt(ov):.3f} vs pure-luck sd {np.sqrt(lv):.3f} -> luck explains "
                  f"{100 * min(1, lv / ov):.0f}% of the day-to-day variance (legs independent) / {100 * min(1, lh / ov):.0f}% (a player's legs fully tied)")
            print(f"    B  share of the day-to-day residual explained by scoring environment / minutes / blowouts: {100 * expl:.0f}%"
                  f" (corr {np.corrcoef(act, prd)[0, 1]:+.2f})")
            rows.sort(key=lambda x: x["hit"])
            k = max(3, len(rows) // 10)
            for lab, g in (("WORST 10%", rows[:k]), ("BEST 10%", rows[-k:]), ("ALL", rows)):
                print(f"    C  {lab:<9} days {len(g):>3}  hit {np.mean([x['hit'] for x in g]):.3f}  legs {np.mean([x['n'] for x in g]):6.1f}  "
                      f"Under share {np.mean([x['under'] for x in g]):.2f}  side x scoring surprise {np.mean([x['senv'] for x in g]):+.2f}  "
                      f"minutes shock {np.mean([x['msh'] for x in g]):+.2f}  blowout share {np.mean([x['blow'] for x in g]):.2f}  "
                      f"DEF share {np.mean([x['def'] for x in g]):.2f}  SCORE share {np.mean([x['score'] for x in g]):.2f}")
            # D streaks
            seq = np.array([x["hit"] for x in sorted(rows, key=lambda x: x["d"])])
            seqr = seq - seq.mean()
            ac1 = float(np.sum(seqr[1:] * seqr[:-1]) / np.sum(seqr ** 2))
            ac2 = float(np.sum(seqr[2:] * seqr[:-2]) / np.sum(seqr ** 2))
            print(f"    D  day-to-day autocorrelation of the hit rate: lag 1 {ac1:+.3f}, lag 2 {ac2:+.3f} (|x| > {2 / np.sqrt(len(seq)):.3f} = beyond chance)")


if __name__ == "__main__":
    main()
