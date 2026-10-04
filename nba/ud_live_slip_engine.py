#!/usr/bin/env python3
"""
UNDERDOG LIVE SLIP ENGINE - PAPER (strategy doc §30z). The daily Underdog leg of the pipeline: P5 (primary) and P4 (shadow)
built from the live window board, recorded as paper slips, graded overnight. Nothing is staked.

PARITY WITH THE BACKTEST (every choice mirrors the certified build):
  legs      Underdog window board (nba_market.board_snapshots, bookmaker='underdog', label 'window'); modifier m = the archived
            payout modifier (§30h), fallback round(decimal / sqrt(3), 2) (§30i)
  resolver  nba_ref.norm_name(player) -> nba_ref.player_name_map -> nba_score.final_hp (date, player_id, prop, side, line) -
            the certifier's own join (§30k); ranks final_hp / baseline_hp / score exactly as the tier map
  tiers     R = 1.00, F1 0.90-0.99, F2 0.80-0.89, F3 < 0.80, B1 1.01-1.14, B2 1.15-1.39, B3 >= 1.40; duplicates keep the LOWEST m
  engine    build_ud_slip_engine is IMPORTED (eligible_legs, candidates, build_day_slips, valid) with centers excluded (§30p),
            the original 14 certified cells (§30k) - live cannot drift from what was validated
  rules     one pick per game; pre-All-Star week and final regular-season week recorded as 'stand_down' (stake 0, §30p)
  P5        weighted:points_R_U 4-Standard cap 1 + 6-Flex cap 1 + mains 2-Standard cap 2 (§30v); P4 shadow: the 2-pick from
            weighted:points_R_U; identical slips counted once within a portfolio
  sizing    HALF STAKE CANDIDATE (§30x): a slip with an Under leg on a team with 2+ FRESH rotation absences - rotation = >= 3
            of the team's previous 5 games at >= 20 min; fresh = played the team's previous game, listed OUT on the latest
            injury-report snapshot at or before the pick (names 'Last, First' -> 'First Last' -> the same resolver)
GRADING (Underdog's rules): a DNP or a push VOIDS the pick and the entry shrinks to the remaining picks (< 2 = refund);
  Standard pays base(n') x prod(m) if all remaining hit; Flex pays F_j(n') x prod(m over hits); a Flex left with 2 picks pays
  as a 2-pick Standard.
Modes: UDL_MODE=pick (P3, after the PrizePicks pick) | grade (P2A). Env: DATABASE_URL, UDL_MODE, UDL_DATE (YYYY-MM-DD), UDL_FORCE.
"""
import datetime as dt
import json
import math
import os
import sys
from collections import defaultdict

os.environ.setdefault('UD_EXCL_CENTER', '1')   # certified rule set (§30p) - set BEFORE importing the engine
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_ud_slip_engine as E   # noqa: E402 - the certified engine (original 14 cells, centers out)

MKT = {'points': 'points', 'rebounds': 'rebounds', 'assists': 'assists', 'threes': 'threes_made', 'steals': 'steals',
       'blocks': 'blocks', 'turnovers': 'turnovers', 'blocks_steals': 'stocks', 'points_rebounds': 'pts_reb',
       'points_assists': 'pts_ast', 'rebounds_assists': 'reb_ast', 'points_rebounds_assists': 'pra'}
PORTFOLIOS = {
    'P5': [('weighted:points_R_U', 4, 'standard', 1), ('weighted:points_R_U', 6, 'flex', 1), ('mains', 2, 'standard', 2)],
    'P4': [('weighted:points_R_U', 4, 'standard', 1), ('weighted:points_R_U', 6, 'flex', 1), ('weighted:points_R_U', 2, 'standard', 2)],
}
STAT = {'points': lambda s: s['pts'], 'rebounds': lambda s: s['reb'], 'assists': lambda s: s['ast'], 'threes_made': lambda s: s['fg3m'],
        'steals': lambda s: s['stl'], 'blocks': lambda s: s['blk'], 'turnovers': lambda s: s['tov'], 'stocks': lambda s: s['stl'] + s['blk'],
        'pts_reb': lambda s: s['pts'] + s['reb'], 'pts_ast': lambda s: s['pts'] + s['ast'], 'reb_ast': lambda s: s['reb'] + s['ast'],
        'pra': lambda s: s['pts'] + s['reb'] + s['ast']}

DDL = """CREATE TABLE IF NOT EXISTS nba_score.ud_live_slips (
  game_date date, portfolio text, composition text, size int, structure text, k int, legs_json jsonb,
  stake numeric, status text, absence_flag boolean, built_at timestamptz DEFAULT now(),
  graded_at timestamptz, remaining int, hits int, payout numeric, profit numeric,
  PRIMARY KEY (game_date, portfolio, composition, size, structure, k))"""


def tier_of(m):
    if m == 1.0:
        return 'R'
    if 1.0 < m < 1.15:
        return 'B1'
    if 1.15 <= m < 1.40:
        return 'B2'
    if m >= 1.40:
        return 'B3'
    return 'F1' if m >= 0.90 else ('F2' if m >= 0.80 else 'F3')


def load_legs(conn, day):
    rows = conn.execute("""
      WITH b AS (
        SELECT b.event_id, nba_ref.norm_name(b.player) pn, b.player, b.market_key, b.side, b.line,
               coalesce(b.multiplier, round(((CASE WHEN b.price < 0 THEN 1 + 100.0/(-b.price) ELSE 1 + b.price/100.0 END)/sqrt(3))::numeric, 2))::float m,
               replace(replace(b.market_key,'_alternate',''),'player_','') mk
        FROM nba_market.board_snapshots b
        WHERE b.bookmaker='underdog' AND b.snapshot_label='window' AND b.game_date=%s)
      SELECT b.event_id, b.pn, nm.player_id, b.mk, b.market_key, b.side, b.line, b.m,
             f.final_hp::float, f.baseline_hp::float, f.score::float, left(pl.position,1)
      FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = b.pn
      JOIN nba_score.final_hp f ON f.game_date=%s AND f.player_id=nm.player_id AND f.side=b.side AND f.line=b.line
       AND f.prop = (CASE b.mk """ + " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in MKT.items()) + """ END)
      LEFT JOIN nba_ref.players pl ON pl.nba_player_id::text = nm.player_id::text
      WHERE f.final_hp IS NOT NULL AND f.baseline_hp IS NOT NULL AND f.score IS NOT NULL AND b.m > 0""", (day, day)).fetchall()
    best = {}
    for ev, pn, pid, mk, mkey, side, line, m, s_f, s_b, s_s, pos in rows:
        prop = MKT.get(mk)
        if not prop:
            continue
        key = (pn, prop, side, float(line))
        if key not in best or m < best[key]['m']:      # duplicates keep the LOWEST modifier, as certified
            best[key] = dict(event_id=ev, player=pn, player_id=str(pid), prop=prop, side=side, line=float(line), m=m,
                             kind='alt' if mkey.endswith('_alternate') else 'main', s_f=s_f, s_b=s_b, s_s=s_s, position=pos)
    legs = []
    for b in best.values():
        for rk, s in (('final_hp', b['s_f']), ('baseline_hp', b['s_b']), ('final_score', b['s_s'])):
            legs.append({'rank_key': rk, 'game_date': None, 'player': b['player'], 'player_id': b['player_id'], 'prop': b['prop'],
                         'tier': tier_of(b['m']), 'side': b['side'], 'line': b['line'], 'factor': b['m'], 'kind': b['kind'],
                         'hit': None, 'score': s, 'event_id': b['event_id'], 'position': b['position'],
                         'min_trend': None, 'form_gap': None, 'nv_window': None, 'fresh_out': None, 'n_rank': None})
    groups = defaultdict(list)
    for l in legs:
        groups[(l['rank_key'], l['prop'], l['tier'])].append(l)
    for g in groups.values():
        g.sort(key=lambda l: (-l['score'], l['player']))
        for i, l in enumerate(g, start=1):
            l['n_rank'] = i
    return legs


def stand_down(conn, day):
    """Pre-All-Star week (7 days ending at the last game before the February break) and the final regular-season week."""
    dates = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_calendar.games
        WHERE game_id LIKE '002%%' AND game_date BETWEEN %s - 200 AND %s + 200 ORDER BY 1""", (day, day)).fetchall()]
    if not dates:
        return None
    feb = [(d, n) for d, n in zip(dates, dates[1:]) if d.month == 2]
    if feb:
        lb = max(feb, key=lambda x: (x[1] - x[0]).days)[0]
        if lb - dt.timedelta(days=6) <= day <= lb:
            return 'pre_all_star_week'
    season_end = max(d for d in dates if d >= day) if any(d >= day for d in dates) else None
    # == the backtest's phase_of(): 'final7' when (s1 - d).days <= 7 (build_ud_slip_engine.py) - 8 calendar days, not 7
    if season_end and (season_end - day).days <= 7 and day.month in (3, 4):
        return 'final_week'
    return None


def fresh_absences(conn, day):
    """team_id -> count of fresh rotation absences from the latest injury report at or before now."""
    rows = conn.execute("""
      WITH rep AS (
        SELECT DISTINCT ON (player_name) player_name, team, status FROM nba_daily.injury_report_snapshots
        WHERE game_date=%s AND snapshot_ts <= now() AND player_name IS NOT NULL ORDER BY player_name, snapshot_ts DESC),
      outp AS (
        SELECT nm.player_id, t.team_id FROM rep
        JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(split_part(rep.player_name, ', ', 2) || ' ' || split_part(rep.player_name, ', ', 1))
        JOIN nba_ref.teams t ON t.full_name = replace(rep.team, 'Los Angeles Clippers', 'LA Clippers')
        WHERE rep.status = 'Out'),
      tg AS (SELECT team_id, game_date, row_number() OVER (PARTITION BY team_id ORDER BY game_date DESC) rn
             FROM (SELECT DISTINCT team_id, game_date FROM nba_stats.player_game_log WHERE game_date < %s AND min > 0) x),
      last5 AS (SELECT g.team_id, g.nba_player_id::text pid, count(*) n, avg(g.min) mins
                FROM nba_stats.player_game_log g JOIN tg ON tg.team_id=g.team_id AND tg.game_date=g.game_date AND tg.rn <= 5
                WHERE g.min > 0 GROUP BY 1,2),
      prev AS (SELECT g.team_id, g.nba_player_id::text pid FROM nba_stats.player_game_log g
               JOIN tg ON tg.team_id=g.team_id AND tg.game_date=g.game_date AND tg.rn = 1 WHERE g.min > 0)
      SELECT o.team_id, count(*) FROM outp o
      JOIN last5 l ON l.team_id=o.team_id AND l.pid=o.player_id::text AND l.n >= 3 AND l.mins >= 20
      JOIN prev p ON p.team_id=o.team_id AND p.pid=o.player_id::text
      GROUP BY 1""", (day, day)).fetchall()
    return {r[0]: int(r[1]) for r in rows}


def leg_team(conn, day, pids):
    """player_id -> current team_id (latest game-log row before today)."""
    if not pids:
        return {}
    rows = conn.execute("""SELECT DISTINCT ON (nba_player_id) nba_player_id::text, team_id FROM nba_stats.player_game_log
                           WHERE nba_player_id::text = ANY(%s) AND game_date < %s ORDER BY nba_player_id, game_date DESC""", (list(pids), day)).fetchall()
    return {r[0]: r[1] for r in rows}


def pick(conn, day):
    conn.execute(DDL)
    if conn.execute("SELECT count(*) FROM nba_score.ud_live_slips WHERE game_date=%s", (day,)).fetchone()[0] and os.environ.get('UDL_FORCE') != '1':
        print(f"  {day}: Underdog paper slips already logged - first log wins (UDL_FORCE=1 to rebuild)", flush=True)
        return
    legs = load_legs(conn, day)
    if not legs:
        print(f"  {day}: no Underdog window legs joined to final_hp - nothing to build", flush=True)
        return
    # OUT-OF-RANGE BOARD GUARD (§31j): cells rank relative to the day's board, with no absolute floor. Below the smallest
    # validated Underdog board (178 unique scored legs, 2024-11-14; p01 234, median 1,284) nothing is built.
    n_board = len({(l['player_id'], l['prop'], l['side'], l['line']) for l in legs})
    if n_board < int(os.environ.get('UDL_MIN_BOARD', '178')):
        print(f"  {day}: board of {n_board} scored legs is below the smallest validated Underdog board "
              f"({os.environ.get('UDL_MIN_BOARD', '178')}) - out of domain, NOTHING BUILT (§31j)", flush=True)
        return
    sd = stand_down(conn, day)
    fresh = fresh_absences(conn, day)
    teams = leg_team(conn, day, {l['player_id'] for l in legs})
    pool = E.eligible_legs(legs)
    conn.execute("DELETE FROM nba_score.ud_live_slips WHERE game_date=%s", (day,))
    n_rows = 0
    for pf, spec in PORTFOLIOS.items():
        seen = set()
        for comp, size, structure, cap in spec:
            for k, slip in enumerate(E.build_day_slips(pool, comp, size, cap), start=1):
                key = (size, structure, tuple(sorted((l['player'], l['prop'], l['side'], l['line']) for l in slip)))
                if key in seen:
                    continue
                seen.add(key)
                flag = any(l['side'] == 'Under' and fresh.get(teams.get(l['player_id']), 0) >= 2 for l in slip)
                stake = 0.0 if sd else (0.5 if flag else 1.0)
                status = f"stand_down:{sd}" if sd else 'paper'
                legs_json = [{'cell': l['cell'], 'player': l['player'], 'player_id': l['player_id'], 'prop': l['prop'], 'tier': l['tier'],
                              'side': l['side'], 'line': l['line'], 'factor': l['factor'], 'event_id': l['event_id']} for l in slip]
                conn.execute("""INSERT INTO nba_score.ud_live_slips (game_date, portfolio, composition, size, structure, k, legs_json, stake, status, absence_flag)
                                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", (day, pf, comp, size, structure, k, json.dumps(legs_json), stake, status, flag))
                n_rows += 1
    conn.commit()
    print(f"  {day}: {len(legs)//3} Underdog legs scored | stand-down: {sd or 'no'} | teams with 2+ fresh absences: "
          f"{sum(1 for v in fresh.values() if v >= 2)} | {n_rows} paper slips logged (P5 + P4 shadow)", flush=True)


def payout(structure, legs_after_void):
    n = len(legs_after_void)
    if n < 2:
        return None                                   # refund
    hits = [l for l in legs_after_void if l['hit']]
    if structure == 'standard' or n == 2:             # a Flex left with 2 picks pays as a 2-pick Standard
        if len(hits) < n:
            return 0.0
        return E.STD[n] * math.prod(l['factor'] for l in legs_after_void)
    base = E.FLEX.get((n, n - len(hits)), 0.0)
    return base * math.prod(l['factor'] for l in hits) if base else 0.0


def grade(conn, day):
    conn.execute(DDL)
    slips = conn.execute("""SELECT portfolio, composition, size, structure, k, legs_json, stake FROM nba_score.ud_live_slips
                            WHERE game_date=%s AND graded_at IS NULL""", (day,)).fetchall()
    if not slips:
        print(f"  {day}: no ungraded Underdog paper slips", flush=True)
        return
    stats = {}
    for pid, pts, reb, ast, fg3m, stl, blk, tov, mins in conn.execute("""SELECT nba_player_id::text, pts, reb, ast, fg3m, stl, blk, tov, min
            FROM nba_stats.player_game_log WHERE game_date=%s""", (day,)).fetchall():
        stats[pid] = dict(pts=pts, reb=reb, ast=ast, fg3m=fg3m, stl=stl, blk=blk, tov=tov, min=mins)
    graded = 0
    for pf, comp, size, structure, k, legs, stake in slips:
        legs = legs if isinstance(legs, list) else json.loads(legs)
        remaining = []
        legs_out = []                                  # §31o: per-leg outcome kept for the edge monitor (payout unaffected)
        for l in legs:
            s = stats.get(str(l['player_id']))
            if not s or not s['min']:
                legs_out.append({**l, 'hit': None, 'void': 'dnp'})
                continue                               # DNP -> void
            v = STAT[l['prop']]({kk: (vv or 0) for kk, vv in s.items()})
            if v == l['line']:
                legs_out.append({**l, 'hit': None, 'void': 'push'})
                continue                               # push -> void
            hit = (v > l['line']) if l['side'] == 'Over' else (v < l['line'])
            remaining.append({**l, 'hit': hit})
            legs_out.append({**l, 'hit': bool(hit)})
        p = payout(structure, remaining)
        profit = 0.0 if p is None else float(stake) * (p - 1.0)
        conn.execute("""UPDATE nba_score.ud_live_slips SET graded_at=now(), remaining=%s, hits=%s, payout=%s, profit=%s, legs_json=%s
                        WHERE game_date=%s AND portfolio=%s AND composition=%s AND size=%s AND structure=%s AND k=%s""",
                     (len(remaining), sum(1 for l in remaining if l['hit']), p, profit, json.dumps(legs_out), day, pf, comp, size, structure, k))
        graded += 1
    conn.commit()
    tot = conn.execute("""SELECT portfolio, count(*), sum(stake), sum(profit) FROM nba_score.ud_live_slips WHERE game_date=%s GROUP BY 1""", (day,)).fetchall()
    print(f"  {day}: graded {graded} Underdog paper slips | " + " | ".join(f"{r[0]}: {r[1]} slips, staked {float(r[2] or 0):.1f}, net {float(r[3] or 0):+.2f}" for r in tot), flush=True)


def main():
    mode = (os.environ.get('UDL_MODE') or 'pick').lower()
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    if mode == 'grade' and not os.environ.get('UDL_DATE'):
        conn.execute(DDL); conn.commit()
        today_pt = dt.datetime.now(dt.timezone(dt.timedelta(hours=-8))).date()
        days = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_score.ud_live_slips
                                              WHERE graded_at IS NULL AND game_date < %s ORDER BY 1""", (today_pt,)).fetchall()]
        if not days:
            print("  no Underdog slates awaiting grading", flush=True)
        for d in days:
            grade(conn, d)
        conn.close()
        return
    day = dt.date.fromisoformat(os.environ['UDL_DATE'])
    (pick if mode == 'pick' else grade)(conn, day)
    conn.close()


if __name__ == "__main__":
    main()
