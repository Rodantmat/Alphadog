#!/usr/bin/env python3
"""
NBA LIVE SLIP ENGINE — P4. Daily pick + daily grade + hurdle evaluation, on the certified rules.

PICK  (after P3, same day): today's window board legs scored by the live final_hp → certified cells → the
      standing engine rules → slips for every ACTIVE strategy at its live cap → nba_score.live_slips (status
      'placed'). Walk-forward by construction: only today's board and only strategies qualified on prior data.
GRADE (after P2, next morning): yesterday's placed slips graded against the real outcomes with the compression
      rule → nba_score.live_slips updated (hits, payout, profit) → per-strategy live metrics → hurdles H1-H6 →
      strategy state in nba_score.live_strategy_state (active / yellow / red / off) with the cap it implies.

THE RULES ARE THE CERTIFIED ONES (strategy doc 25-28), imported from build_slip_engine where they live; nothing
is re-derived here. What this file adds is the daily loop, the ledger, and the hurdle machine.

Hurdles (27d, 28g), per strategy, evaluated on the live ledger only:
  H0  slippage: window price vs the price at lock when a close snapshot exists (recorded, not gating yet)
  H1  per-leg hit: rolling over the last 100 legs vs the strategy's certified level; yellow > 0.04 below, red > 0.07 below (>=150 legs)
  H2  drawdown: live drawdown vs the strategy's worst-season backtest max dd; yellow at 1.0x, red at 1.5x
  H3  streak: live losing-day streak vs the backtest longest; yellow at 1.25x, red at 1.5x
  H4  pool: qualifying legs/day for the strategy's cells below the floor (10) for 14+ days -> yellow
  H5  opening weeks: no red in the first 21 days of a season (yellow caps only)
  H6  final week: all strategies off for the last 7 days of the regular season
  CI  paper gate: a strategy is 'paper' (never staked) until >= 50 slate days AND >= 1,000 slips; then 'active' only if
      the 10k day-blocked bootstrap lower bound on live ROI > 0
State machine: paper -> active (CI gate) ; active -> yellow (any one hurdle: cap halves) ; yellow -> red (two hurdles, or any red: cap 0,
  strategy off until re-qualified by the weekly run) ; yellow -> active when all hurdles clear for 7 days.

Env: DATABASE_URL, LS_MODE (pick|grade), LS_DATE (default: today PT for pick, yesterday PT for grade).
"""
import os
import sys
import json
import random
import datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as ENG   # certified rules: CELLS, eligible_legs, build_day_slips, grade, compress, load_corr

PT = ZoneInfo('America/Los_Angeles')
MODE = os.environ.get('LS_MODE', 'pick')
PAPER_DAYS, PAPER_SLIPS = 50, 1000
BOOT_DRAWS = int(os.environ.get('LS_BOOT', '10000'))

# the validated families (28j), with the backtest stress numbers each hurdle compares against
STRATEGIES = {
    #  name                         composition           size structure cap  cert_leg_hit  worst_dd  longest_streak  pool_floor
    'A_wsteals_5flex':   ('weighted:steals_R',    5, 'flex',  6, 0.61, 59.5, 15, 8),   # cap 3->6 (29k pass 17): k4-6 +67%, 'wsteals 6 + core 0' beat every allocation
    'A_core_5flex':      ('core',                 5, 'flex',  0, 0.61, 61.4, 15, 8),   # RETIRED (29k pass 14/17): 58% identical to wsteals; kept for its shadow record
    'A_regular_5power':  ('regular',              5, 'power', 1, 0.61, 36.3, 13, 8),
    'A_wrebounds_4flex': ('weighted:rebounds_R',  4, 'flex',  1, 0.62, 21.6, 11, 8),
    'A_core_3power':     ('core',                 3, 'power', 3, 0.62, 74.6, 15, 8),
    'B_demon_5flex':     ('demon',                5, 'flex',  6, 0.38, 40.0, 15, 4),   # cap 3->6 (29k pass 12): OOS +144% on 675 slips, best net/dd of any cap
    'B_demon_3flex':     ('demon',                3, 'flex',  1, 0.38, 14.6, 12, 4),
    'C_wstocks_4flex':   ('weighted:stocks_R',    4, 'flex',  1, 0.60, 22.1, 11, 8),
    # 29p the drought menu (validated inside the five long droughts, positive both seasons):
    'D_points_3power':   ('single:points_R',      3, 'power', 3, 0.62, 30.0, 14, 5),   # +34% in long droughts / +33% normal / +60% on SINGLE bad days (uncorrelated with the defensive collapse) - all-weather, cap 3
    'R_stocks_4power':   ('single:stocks_R',      4, 'power', 1, 0.60, 30.0, 14, 4),   # re-measured (pass 79): +27% in long droughts (34/16) / -6% normal - ROTATION-ONLY (staked only in the drought state)
}
ROTATION_ONLY = {'R_stocks_4power'}
# pass 85: the pre-break week (7 days before the All-Star break) is a fixed calendar drought. Week-only strategies (W_ family,
# steals-excluded pool) stake only in that week under plan B; they are skipped every other day.
STRATEGIES['W_core_3power'] = ('core', 3, 'power', 3, 0.62, 30.0, 14, 5)          # steals-free core 3-Power: +41/+116% in the week
STRATEGIES['W_coredemon_3power'] = ('core+demon', 3, 'power', 1, 0.55, 30.0, 14, 5)  # core+demon 3-Power: +73/+53% in the week
ALLSTAR_ONLY = {'W_core_3power', 'W_coredemon_3power'}
ALLSTAR_PLAN = os.environ.get('LS_ALLSTAR_PLAN', 'B').upper()
ALLSTAR_PLANS = {
    # stake only these strategies at these caps in the pre-break week; every other strategy shadows (observed, never staked)
    'B': {'W_core_3power': 3, 'B_demon_3flex': 3, 'W_coredemon_3power': 1},   # +80, 72% ROI, +29 / +52 (default)
    'C': {'B_demon_3flex': 3},                                                 # +32, 75% ROI, +15 / +17 (minimal)
    # 'A' = the previous rule (family A cap 1, points Power sits, demons stake): +24, 17%, -24 / +48
    # 'D' = no special handling: +71, 30%, +21 / +51
}
# family C is the Regular-without-steals family (28f) and must be BUILT without the steals cells to be what it was validated as.
# D and R build from the steals-excluded pool too (their compositions are single-cell; the exclusion is a no-op for them).
EXCLUDE_BY_FAMILY = {'C': {'steals_R', 'steals_R_U'}, 'D': {'steals_R', 'steals_R_U'}, 'R': {'steals_R', 'steals_R_U'}, 'W': {'steals_R', 'steals_R_U'}}
# pass 34: per-strategy SIDE filter on the pool - the points-family edge is the Under side (all-Under points Powers +41/+73% vs
# +23/+35% with an Over leg, both seasons; the published early-season Under bias). Live-only refinement of a certified both-sides cell.
SIDE_FILTER_BY_STRATEGY = {'D_points_3power': 'Under'}
# pass 43: a hard aggregate daily stake cap across all strategies. With n=2 seasons any state raise is an estimate; the guard
# that stops a wrong one from blowing up a season is a ceiling on total daily exposure, scaled down proportionally if hit.
MAX_DAILY_STAKE = int(os.environ.get('LIVE_MAX_DAILY_STAKE', '36'))
# pass 45: leg filter - steals Unders only at the 0.5 line (65% vs 51% at 1.5, both seasons; the 1.5 line is a coin flip on a
# ~1.5-steal player, the 0.5 Under is where the model's skill applies). The cushion finding (§29n) from the other side.
def leg_allowed(l, trail10=None):
    if l['prop'] == 'steals' and l['side'] == 'Under' and float(l['line']) > 0.5:
        # a 1.5 steals Under is 48-49% unless the line is >= 0.25 above the player's trailing-10 (then 67%); unknown trail -> drop
        t = (trail10 or {}).get((l.get('player_id'), 'steals'))
        return t is not None and float(l['line']) - t >= 0.25
    if l['prop'] == 'points' and l['side'] == 'Under' and float(l['line']) >= 23.5:
        return False   # pass 70: star-level points Unders hit 50% (46/57) vs 59% at mid lines - stars play through everything
    return True


def trailing10(conn, day, player_ids):
    """Trailing-10-game steals average per player_id, as of the day (pass 45; the cushion of §29n at pick time)."""
    rows = conn.execute("""SELECT x.pid, avg(x.stl) FROM (
                             SELECT g.nba_player_id::text pid, g.stl, row_number() OVER (PARTITION BY g.nba_player_id ORDER BY g.game_date DESC) rn
                             FROM nba_stats.player_game_log g WHERE g.game_date < %s AND g.nba_player_id::text = ANY(%s)) x
                           WHERE x.rn <= 10 GROUP BY x.pid""", (day, list(player_ids))).fetchall()
    return {(r[0], 'steals'): float(r[1]) for r in rows}


def trailing_pf20(conn, day, player_ids):
    """Trailing-20-game personal fouls per player_id, as of the day (§29r: the low-foul key needs it at pick time; the
    backtest's nba_score.player_pf20 sits on played-game rows and cannot supply a game that has not happened)."""
    rows = conn.execute("""SELECT x.pid, avg(x.pf) FROM (
                             SELECT g.nba_player_id::text pid, g.pf, row_number() OVER (PARTITION BY g.nba_player_id ORDER BY g.game_date DESC) rn
                             FROM nba_stats.player_game_log g WHERE g.game_date < %s AND g.nba_player_id::text = ANY(%s)) x
                           WHERE x.rn <= 20 GROUP BY x.pid""", (day, list(player_ids))).fetchall()
    return {r[0]: float(r[1]) for r in rows}


def attach_pf20(conn, day, legs):
    pf = trailing_pf20(conn, day, {l['player_id'] for l in legs if l.get('player_id')})
    for l in legs:
        l['pf20'] = pf.get(l.get('player_id'))
    return legs


def pt_today():
    return dt.datetime.now(PT).date()


def ensure_tables(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.live_slips (
        game_date date, strategy text, k int, legs_json jsonb, size int, structure text, status text,
        hits int, payout double precision, profit double precision, placed_at timestamptz DEFAULT now(), graded_at timestamptz,
        PRIMARY KEY (game_date, strategy, k))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.live_strategy_state (
        strategy text PRIMARY KEY, state text, live_cap int, days int, slips int, net double precision, roi double precision,
        ci_lo double precision, leg_hit double precision, drawdown double precision, streak int, pool_avg double precision,
        hurdles jsonb, updated_at timestamptz DEFAULT now())""")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.live_pool (game_date date, strategy text, legs int, PRIMARY KEY (game_date, strategy))""")
    for name, (comp, size, structure, cap, *_rest) in STRATEGIES.items():
        conn.execute("""INSERT INTO nba_score.live_strategy_state (strategy, state, live_cap, days, slips, net, roi, hurdles)
                        VALUES (%s,'paper',%s,0,0,0,0,'{}') ON CONFLICT (strategy) DO NOTHING""", (name, cap))
    conn.commit()


# ------------------------------------------------------------------ PICK
LEG_SOURCE = os.environ.get('LS_LEG_SOURCE', 'live').lower()   # live (default) | universe (the backtest-only path, parity tests)


def load_board_legs_live(conn, day, label='window'):
    """Today's PP board WITHOUT nba_market.prop_universe (a backtest table built only by manual SQL functions, and only after
    the box score exists - it cannot carry today's slate). Same priced legs (pp_leg_price, a live view), same final_hp scores.
    Player: nba_ref.norm_name(raw player) -> player_name_map, the ONE canonical resolver (score_board_legs 2026-09-25); NOT the
    tiers table's nm, which keeps suffixes ('craigporterjr' vs canonical 'craigporter') and silently dropped every Jr/Sr/II/III
    player in the universe path. Event: the PrizePicks window board's own event id. Team: whichever of the event's two teams
    matches the player - his latest game-log team before today, else his current roster team (correct on a trade day)."""
    rows = conn.execute("""
        WITH pr AS (
          SELECT p.game_date, p.player, nba_ref.norm_name(p.player) cn, p.side, p.line, p.kind, p.factor::float price,
            least(abs(COALESCE(NULLIF(p.tier,0), round(p.line-p.anchor_line)::int)),3) tier3,
            CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made'
              WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast'
              WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END prop
          FROM nba_market.pp_leg_price p
          WHERE p.snapshot_label=%s AND p.game_date=%s AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)),
        ev AS (
          SELECT DISTINCT ON (nba_ref.norm_name(player)) nba_ref.norm_name(player) cn, event_id, home_team, away_team
          FROM nba_market.board_snapshots
          WHERE bookmaker='prizepicks' AND game_date=%s AND snapshot_label=%s AND event_id IS NOT NULL
          ORDER BY nba_ref.norm_name(player), snapshot_ts DESC),
        evt AS (
          SELECT ev.cn, ev.event_id, h.team_id home_id, a.team_id away_id FROM ev
          LEFT JOIN nba_ref.teams h ON h.full_name = replace(ev.home_team, 'Los Angeles Clippers', 'LA Clippers')
          LEFT JOIN nba_ref.teams a ON a.full_name = replace(ev.away_team, 'Los Angeles Clippers', 'LA Clippers'))
        SELECT f.player_id, pr.player, pr.prop, pr.side, pr.line, pr.price, pr.kind, pr.tier3,
               f.final_hp::float, f.baseline_hp::float, f.score::float,
               CASE WHEN gl.team_id IN (evt.home_id, evt.away_id) THEN gl.team_id
                    WHEN pl.team_id IN (evt.home_id, evt.away_id) THEN pl.team_id END team_id,
               evt.event_id
        FROM pr
        JOIN nba_ref.player_name_map nm ON nm.norm_name = pr.cn
        JOIN nba_score.final_hp f ON f.game_date=pr.game_date AND f.player_id=nm.player_id AND f.prop=pr.prop AND f.side=pr.side AND f.line=pr.line
        LEFT JOIN evt ON evt.cn = pr.cn
        LEFT JOIN LATERAL (SELECT g.team_id FROM nba_stats.player_game_log g
                           WHERE g.nba_player_id::text = nm.player_id::text AND g.game_date < pr.game_date
                           ORDER BY g.game_date DESC LIMIT 1) gl ON true
        LEFT JOIN nba_ref.players pl ON pl.nba_player_id::text = nm.player_id::text
        WHERE f.final_hp IS NOT NULL AND f.score IS NOT NULL""", (label, day, day, label)).fetchall()
    legs = []
    for pid, player, prop, side, line, price, kind, t3, s_final, s_base, s_score, team, event in rows:
        tier = 'R' if kind == 'standard' else ('G' if kind == 'goblin' else 'D') + str(t3)
        for rk, s in (('final_hp', s_final), ('baseline_hp', s_base), ('final_score', s_score)):
            legs.append({'rank_key': rk, 'season': None, 'game_date': day, 'player': player, 'player_id': pid, 'prop': prop, 'tier': tier, 'side': side,
                         'line': line, 'factor': price, 'hit': None, 'n_rank': None, 'score': s, 'team_id': team, 'event_id': event})
    groups = defaultdict(list)
    for l in legs:
        groups[(l['rank_key'], l['prop'], l['tier'])].append(l)
    for g in groups.values():
        g.sort(key=lambda l: (-l['score'], l['player']))
        for i, l in enumerate(g, start=1):
            l['n_rank'] = i
    return legs


def load_board_legs(conn, day, label='window'):
    if LEG_SOURCE == 'live':
        return load_board_legs_live(conn, day, label)
    return load_board_legs_universe(conn, day, label)


def load_board_legs_universe(conn, day, label='window'):
    """Today's PP window board, scored by the LIVE final_hp, priced by pp_leg_price - the same join the certified map uses.
    label='close' (pass 53): the close-priced board, for the late pick."""
    rows = conn.execute("""
        WITH pr AS (
          SELECT p.game_date, p.nm, p.side, p.line, p.kind, p.factor::float price,
            least(abs(COALESCE(NULLIF(p.tier,0), round(p.line-p.anchor_line)::int)),3) tier3,
            CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made'
              WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast'
              WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END prop
          FROM nba_market.pp_leg_price p
          WHERE p.snapshot_label=%s AND p.game_date=%s AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)
        )
        SELECT f.player_id, pu.player, pr.prop, pr.side, pr.line, pr.price, pr.kind, pr.tier3,
               f.final_hp::float, f.baseline_hp::float, f.score::float, pu.team_id, pu.event_id
        FROM pr
        JOIN nba_market.prop_universe pu ON pu.game_date=pr.game_date AND nba_ref.norm_name(pu.player)=pr.nm AND pu.prop=pr.prop
          AND pu.side=pr.side AND pu.line=pr.line AND pu.line_source='real' AND pu.kind=pr.kind
        JOIN nba_score.final_hp f ON f.game_date=pu.game_date AND f.player_id=pu.player_id AND f.prop=pu.prop AND f.side=pu.side AND f.line=pu.line
        WHERE f.final_hp IS NOT NULL AND f.score IS NOT NULL""", (label, day)).fetchall()
    # shape into the engine's leg rows: one row per (rank_key) like tier_map_legs, with n_rank computed per (prop,tier,rank)
    legs = []
    for pid, player, prop, side, line, price, kind, t3, s_final, s_base, s_score, team, event in rows:
        tier = 'R' if kind == 'standard' else ('G' if kind == 'goblin' else 'D') + str(t3)
        for rk, s in (('final_hp', s_final), ('baseline_hp', s_base), ('final_score', s_score)):
            legs.append({'rank_key': rk, 'season': None, 'game_date': day, 'player': player, 'player_id': pid, 'prop': prop, 'tier': tier, 'side': side,
                         'line': line, 'factor': price, 'hit': None, 'n_rank': None, 'score': s, 'team_id': team, 'event_id': event})
    # n_rank within (rank_key, prop, tier) by score desc, as the certified map does
    groups = defaultdict(list)
    for l in legs:
        groups[(l['rank_key'], l['prop'], l['tier'])].append(l)
    for g in groups.values():
        g.sort(key=lambda l: (-l['score'], l['player']))
        for i, l in enumerate(g, start=1):
            l['n_rank'] = i
    return legs


def late_pick(conn, day):
    """Pass 53 (record-only): a second pick from the close-priced board. PrizePicks adds ~23% of its defensive props after the
    window; under the model those legs are as good as the window's. Builds every strategy at cap 1 from the legs the window
    pick could not see, for games that have not tipped, and records them as placed_late (never staked) - the third season's
    measurement of what the unseen quarter of the board is worth."""
    ensure_tables(conn)
    legs = load_board_legs(conn, day, label='close')
    if not legs:
        print(f"  {day}: no close-priced board legs - no late pick", flush=True)
        return
    seen = {(l['player'], l['prop'], l['side'], float(l['line'])) for l in load_board_legs(conn, day, label='window')}
    now = dt.datetime.now(dt.timezone.utc)
    started = {r[0] for r in conn.execute("SELECT event_id FROM nba_market.board_snapshots WHERE game_date=%s AND bookmaker='prizepicks' AND snapshot_label='close' AND commence_time <= %s", (day, now + dt.timedelta(minutes=10))).fetchall()}
    fresh = [l for l in legs if (l['player'], l['prop'], l['side'], float(l['line'])) not in seen and l['event_id'] not in started]
    if not fresh:
        print(f"  {day}: nothing new on the close board - no late pick", flush=True)
        return
    cmap = ENG.load_corr(conn)
    live_legs = attach_pf20(conn, day, fresh + [l for l in legs if l['event_id'] not in started])
    pool = ENG.eligible_legs(live_legs)   # rank within the live board, build from it
    t10 = trailing10(conn, day, {l['player_id'] for v in pool.values() for l in v if l['prop'] == 'steals' and l.get('player_id')})
    pool = {c: [l for l in v if leg_allowed(l, t10)] for c, v in pool.items()}
    pools = {'': pool}
    for fam, excl in EXCLUDE_BY_FAMILY.items():
        pools[fam] = {c: v for c, v in pool.items() if c not in excl}
    n = 0
    for name, (comp, size, structure, cap, *_rest) in STRATEGIES.items():
        fam_pool = pools.get(name[0], pool)
        side_only = SIDE_FILTER_BY_STRATEGY.get(name)
        if side_only:
            fam_pool = {c: [l for l in v if l['side'] == side_only] for c, v in fam_pool.items()}
        for k, slip in enumerate(ENG.build_day_slips(fam_pool, comp, size, structure, 1, cmap), start=1):
            if not any((l['player'], l['prop'], l['side'], float(l['line'])) not in seen for l in slip):
                continue   # a late slip must carry at least one leg the window pick could not see
            conn.execute("""INSERT INTO nba_score.live_slips (game_date, strategy, k, legs_json, size, structure, status)
                            VALUES (%s,%s,%s,%s,%s,%s,'placed_late') ON CONFLICT (game_date, strategy, k) DO NOTHING""",
                         (day, name, 100 + k, json.dumps([{'cell': l['cell'], 'player': l['player'], 'prop': l['prop'], 'tier': l['tier'],
                                                           'side': l['side'], 'line': float(l['line']), 'factor': l['factor']} for l in slip]), size, structure))
            n += 1
    conn.commit()
    print(f"  {day}: LATE PICK (record-only) - {n} slips from {len(fresh)} legs the window never saw", flush=True)


def week1_event_spike(conn, day, s0):
    """29l: the week-2 trough was preceded in both seasons by a week-1 event spike. Signal = league steals+turnovers per team-game
    over season days 0-6 vs the prior season's full-season rate. Fires at >= +3% (observed +6.1% / +8.5%). None if not computable."""
    if s0 is None:
        return None
    cur = conn.execute("""SELECT avg(stl+tov), count(*) FROM nba_team.team_game_log WHERE game_date BETWEEN %s AND %s""", (s0, s0 + dt.timedelta(days=6))).fetchone()
    prior = conn.execute("""SELECT avg(stl+tov) FROM nba_team.team_game_log WHERE game_date < %s AND game_date >= %s""", (s0, s0 - dt.timedelta(days=365))).fetchone()
    if not cur or cur[1] is None or cur[1] < 60 or not prior or prior[0] is None:
        return None
    spike = float(cur[0]) / float(prior[0]) - 1.0
    return spike


def schedule_dates(conn, lo, hi):
    """Regular-season game dates in [lo, hi]: the schedule (nba_calendar.games, future and current) merged with the games
    actually played (nba_team.team_game_log, history). The calendar holds no 2024-25 games; the log holds no future ones."""
    rows = conn.execute("""SELECT game_date::date FROM nba_calendar.games
                           WHERE coalesce(game_label,'') !~* '(preseason|play-in|round|semifinal|final|all-star|rising stars)'
                             AND game_date BETWEEN %s AND %s
                           UNION SELECT game_date::date FROM nba_team.team_game_log WHERE game_date BETWEEN %s AND %s""", (lo, hi, lo, hi)).fetchall()
    return sorted({r[0] for r in rows})


def season_block(conn, day):
    """The season's game dates containing `day` (or the next season, if `day` falls before it): contiguous blocks of game
    dates split at gaps of more than 60 days (the summer)."""
    dates = schedule_dates(conn, day - dt.timedelta(days=300), day + dt.timedelta(days=300))
    blocks, cur = [], []
    for d in dates:
        if cur and (d - cur[-1]).days > 60:
            blocks.append(cur); cur = []
        cur.append(d)
    if cur:
        blocks.append(cur)
    for b in blocks:
        if b[0] <= day <= b[-1]:
            return b
    for b in blocks:
        if b[0] > day:
            return b
    return blocks[-1] if blocks else []


def allstar_break(conn, day):
    """Pass 36: the season's one mid-season gap of 4-10 days (Feb 13-19 2025, Feb 12-19 2026). Returns the last game
    date before the break, or None. Searched inside the day's own season block."""
    b = season_block(conn, day)
    for a, c in zip(b, b[1:]):
        if 4 <= (c - a).days <= 10 and a.month == 2:   # the break is always mid-February; Cup-knockout schedule holes are not it
            return a
    return None


def pick(conn, day, require_fresh=True):
    ensure_tables(conn)
    if require_fresh:
        scored = conn.execute("SELECT count(*) FROM nba_score.board_scored WHERE game_date=%s", (day,)).fetchone()[0]
        fhp = conn.execute("SELECT count(*) FROM nba_score.final_hp WHERE game_date=%s AND final_hp IS NOT NULL", (day,)).fetchone()[0]
        priced = conn.execute("SELECT count(*) FROM nba_market.pp_leg_price WHERE snapshot_label='window' AND game_date=%s AND factor IS NOT NULL", (day,)).fetchone()[0]
        if scored == 0 or fhp == 0 or priced == 0:
            print(f"  {day}: P3 has not finished this slate (board_scored {scored}, final_hp {fhp}, priced window legs {priced}) - REFUSING to pick from a stale/empty board", flush=True)
            sys.exit(2)
    legs = load_board_legs(conn, day)
    if not legs:
        print(f"  {day}: no scored window board legs - nothing to pick", flush=True)
        return
    cmap = ENG.load_corr(conn)
    attach_pf20(conn, day, legs)   # §29r: the low-foul key reads l['pf20']
    pool = ENG.eligible_legs(legs)
    t10 = trailing10(conn, day, {l['player_id'] for v in pool.values() for l in v if l['prop'] == 'steals' and l.get('player_id')})
    pool = {c: [l for l in v if leg_allowed(l, t10)] for c, v in pool.items()}   # pass 45 leg filter
    pools = {'': pool}
    for fam, excl in EXCLUDE_BY_FAMILY.items():
        pools[fam] = {c: v for c, v in pool.items() if c not in excl}
    # 29p: the drought rotation state, set by the last grade from the per-cell trailing-10 hit (steals / turnovers cool < 50%)
    rot_row = conn.execute("SELECT state FROM nba_score.live_strategy_state WHERE strategy='_ROTATION'").fetchone()
    rotation = bool(rot_row and rot_row[0] == 'rotation')
    if rotation:
        print(f"  {day}: DROUGHT ROTATION - family A builds steals-excluded; rotation-only strategies stake", flush=True)
    states = {r[0]: (r[1], r[2]) for r in conn.execute("SELECT strategy, state, live_cap FROM nba_score.live_strategy_state").fetchall()}
    s0, s1 = regular_season_window(conn, day)
    if s0 is not None and s1 is not None and not (s0 <= day <= s1):
        print(f"  {day}: outside the regular season ({s0} .. {s1}) - Play-In, playoffs or off-season: nothing placed", flush=True)
        return
    in_week2 = s0 is not None and 7 <= (day - s0).days <= 13
    in_week1 = s0 is not None and 0 <= (day - s0).days <= 6   # 29l pass 20: the high-event week; Regular 5-Flex slips need a defensive Over leg
    # 29l: week 2 is a signal-gated PLAY, not a skip. The week-1 event spike preceded the trough in both seasons; if it fired this
    # season, week 2 is played with the low-event structure (steals-excluded pool, 2+ low-event Unders, cap 1); if not, a normal week.
    week2_trough = False
    if in_week2:
        spike = week1_event_spike(conn, day, s0)
        week2_trough = spike is not None and spike >= 0.03
        if week2_trough:
            # guard: after 3 graded week-2 slate days, if the play's own staked legs hit < 50%, stop for the rest of the week
            g2 = conn.execute("""SELECT count(DISTINCT s.game_date), avg((j->>'hit')::int) FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
                                 WHERE s.status IN ('graded','graded_void') AND s.game_date BETWEEN %s AND %s AND (j->>'hit') IS NOT NULL""",
                              (s0 + dt.timedelta(days=7), day - dt.timedelta(days=1))).fetchone()
            if g2 and g2[0] is not None and g2[0] >= 3 and g2[1] is not None and float(g2[1]) < 0.50:
                print(f"  {day}: week-2 play STOPPED by its guard - {g2[0]} graded days at leg hit {100*float(g2[1]):.0f}%", flush=True)
                week2_trough = False
        print(f"  {day}: week 2 - week-1 event spike {('%+.1f%%' % (100*spike)) if spike is not None else 'n/a'} -> {'LOW-EVENT PLAY at cap 1' if week2_trough else 'normal week'}", flush=True)
    in_final7 = s1 is not None and (s1 - day).days <= 7
    # pass 36: All-Star week = the 7 days before the mid-season break; a defensive-Under trough in both seasons (45/48%) where
    # family A loses -35% and the points Power -67% while the demons make +58%: family A and the points Power sit, demons stake
    asb = allstar_break(conn, day)
    in_allstar_week = asb is not None and 0 <= (asb - day).days <= 6
    if in_allstar_week:
        print(f"  {day}: PRE-BREAK WEEK (break after {asb}) - plan {ALLSTAR_PLAN}: {ALLSTAR_PLANS.get(ALLSTAR_PLAN, 'previous rule' if ALLSTAR_PLAN == 'A' else 'no special handling')}", flush=True)
    # pass 42: late March (season days 147-167, weeks 22-24) is the strongest stretch in both seasons and the deep slips earn to
    # the bottom of the pool (demon k7-10 +439%, wsteals k7-10 +144%, both seasons): the two cap-6 strategies go to cap 9
    late_march = s0 is not None and 147 <= (day - s0).days <= 167
    LATE_MARCH_RAISE = {'B_demon_5flex': 9, 'A_wsteals_5flex': 9}
    if late_march:
        print(f"  {day}: LATE-MARCH RAISE - {LATE_MARCH_RAISE}", flush=True)
    if in_final7:
        print(f"  {day}: final 7 days of the regular season - nothing staked (29d/25e)", flush=True)
        return
    # 29n slate-size cap: on a slate of <= 4 games the engine's ~9 players come from two or three games and the within-day
    # correlation is maximal - the weakest slate size in both seasons (35-36% bad days) - so every strategy builds at cap 1
    n_games = conn.execute("""SELECT greatest(
                                (SELECT count(*) FROM nba_calendar.games WHERE game_date=%s AND coalesce(game_label,'')<>'Preseason'),
                                (SELECT count(*) / 2 FROM nba_team.team_game_log WHERE game_date=%s))""", (day, day)).fetchone()[0]
    small_slate = n_games <= 4
    # pass 59: holiday caution (n = 2 seasons each) - New Year's Eve and MLK Day (3rd Monday of January) lost in both seasons;
    # odd tip times on showcase slates. Treated like a small slate: cap 1 everywhere. Cheap if noise, right if not.
    mlk = dt.date(day.year, 1, 1) + dt.timedelta(days=(0 - dt.date(day.year, 1, 1).weekday()) % 7 + 14)   # third Monday of January
    holiday_caution = (day.month == 12 and day.day == 31) or day == mlk
    if holiday_caution and not small_slate:
        print(f"  {day}: holiday caution slate (NYE / MLK Day) - every strategy at cap 1 (pass 59)", flush=True)
        small_slate = True
    if small_slate:
        print(f"  {day}: small slate ({n_games} games) - every strategy at cap 1 (29n)", flush=True)
    n = 0
    placed_sigs = set()   # (structure, sorted legs) already placed today by an earlier strategy - a duplicate is staked once
    for name, (comp, size, structure, cap, *_rest) in STRATEGIES.items():
        state, live_cap = states.get(name, ('paper', cap))
        if state == 'off':
            continue
        if late_march and state == 'active' and live_cap >= cap and name in LATE_MARCH_RAISE:
            live_cap = LATE_MARCH_RAISE[name]
        week2 = week2_trough   # the SIGNAL decides the structure (29o); the grade's 'week2' state is only a cap-1 caution for a normal build
        if state == 'week2' and not week2_trough:
            live_cap = min(live_cap, 1) if live_cap else 1
        rotation_only_idle = (name in ROTATION_ONLY) and not rotation
        # pass 85: the pre-break week plan. B/C: only the plan's strategies stake (at the plan's caps), the rest shadow.
        # A: the previous rule (points Power sits, family A cap 1). D: no special handling. W_ strategies exist only for B.
        plan = ALLSTAR_PLANS.get(ALLSTAR_PLAN) if in_allstar_week else None
        if name in ALLSTAR_ONLY and not (in_allstar_week and plan and name in plan):
            continue
        if plan is not None:
            if name in plan:
                live_cap = plan[name]
                if state in ('red', 'paper') and name in ALLSTAR_ONLY:
                    state = 'active'   # week-only strategies have no season record of their own; the plan is their gate
            allstar_sit = name not in plan
        else:
            allstar_sit = in_allstar_week and ALLSTAR_PLAN == 'A' and name.startswith('D_')
        shadow = (not week2) and (state == 'red' or live_cap == 0 or rotation_only_idle or allstar_sit)
        cap1_today = small_slate or (in_allstar_week and ALLSTAR_PLAN == 'A' and name.startswith('A_'))   # plan A: family A at cap 1
        # week-2 trough play is staked at cap 1 (29l): real stakes on the low-event structure, recorded like any placed slip
        use_cap = (1 if week2 else (max(cap, 1) if shadow else (min(live_cap, 1) if cap1_today else live_cap)))
        if use_cap == 0:
            continue
        status = 'placed_shadow' if shadow else 'placed'
        # pool: week 2 and the drought rotation build family A from the steals-excluded pool (29l / 29p)
        fam_pool = pools.get('C', pool) if (week2 or (rotation and name.startswith('A_'))) else pools.get(name[0], pool)
        side_only = SIDE_FILTER_BY_STRATEGY.get(name)
        if side_only:
            fam_pool = {c: [l for l in v if l['side'] == side_only] for c, v in fam_pool.items()}
        slips = ENG.build_day_slips(fam_pool, comp, size, structure, use_cap, cmap)
        # rotation deadlock fix (acceptance replay, pass 83): in rotation family A builds steals-excluded, so the steals cell
        # would go unobserved and its EWMA could never recover. One shadow slip from the FULL pool keeps it observed.
        if rotation and name.startswith('A_') and not week2:
            for obs in ENG.build_day_slips(pools.get(name[0], pool), comp, size, structure, 1, cmap):
                conn.execute("""INSERT INTO nba_score.live_slips (game_date, strategy, k, legs_json, size, structure, status)
                                VALUES (%s,%s,900,%s,%s,%s,'placed_shadow') ON CONFLICT (game_date, strategy, k) DO NOTHING""",
                             (day, name, json.dumps([{'cell': l['cell'], 'player': l['player'], 'prop': l['prop'], 'tier': l['tier'],
                                                      'side': l['side'], 'line': float(l['line']), 'factor': l['factor'], 'pf20': l.get('pf20')} for l in obs]), size, structure))
        pool_n = len({l['player'] for l in ENG.candidates_for(comp, fam_pool)})
        conn.execute("INSERT INTO nba_score.live_pool (game_date, strategy, legs) VALUES (%s,%s,%s) ON CONFLICT (game_date, strategy) DO UPDATE SET legs=EXCLUDED.legs",
                     (day, name, pool_n))
        for k, slip in enumerate(slips, start=1):
            sig = (structure, tuple(sorted((l['player'], l['prop'], l['side'], float(l['line'])) for l in slip)))
            st = status
            if sig in placed_sigs and status == 'placed':
                st = 'dup'   # identical slip already placed today by an earlier strategy: recorded, never staked or counted
            elif status == 'placed':
                placed_sigs.add(sig)
            # 29l pass 20: in week 1 a Regular 5-Flex slip with no defensive Over leg is recorded, not staked (-59% in both seasons)
            if st == 'placed' and in_week1 and size == 5 and structure == 'flex' and name.startswith(('A_', 'C_')):
                if not any(l['side'] == 'Over' and l['tier'] == 'R' and l['prop'] in ('steals', 'turnovers', 'stocks', 'blocks') for l in slip):
                    st = 'placed_week1_skip'
            # 29l pass 22: in the week-2 trough play only slips with 2+ low-event Unders (points-family or turnovers) are staked;
            # the others are recorded as week2_skip so the record shows what the structure excluded
            if st == 'placed' and week2:
                low_ev = sum(1 for l in slip if l['side'] == 'Under' and l['tier'] == 'R' and l['prop'] in ('points', 'pts_ast', 'pra', 'pts_reb', 'rebounds', 'turnovers'))
                if low_ev < 2:
                    st = 'placed_week2_skip'
            if st == 'placed':
                staked_today = conn.execute("SELECT count(*) FROM nba_score.live_slips WHERE game_date=%s AND status='placed'", (day,)).fetchone()[0]
                if staked_today >= MAX_DAILY_STAKE:
                    st = 'placed_capped'   # pass 43: the aggregate daily ceiling; recorded, never staked
            conn.execute("""INSERT INTO nba_score.live_slips (game_date, strategy, k, legs_json, size, structure, status)
                            VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (game_date, strategy, k) DO NOTHING""",
                         (day, name, k, json.dumps([{'cell': l['cell'], 'player': l['player'], 'prop': l['prop'], 'tier': l['tier'],
                                                     'side': l['side'], 'line': float(l['line']), 'factor': l['factor'], 'pf20': l.get('pf20')} for l in slip]), size, structure, st))
            n += 1
    conn.commit()
    print(f"  {day}: {n} paper slips placed across {len(STRATEGIES)} strategies ({len(legs)//3} board legs)", flush=True)


# ------------------------------------------------------------------ GRADE
def grade(conn, day):
    ensure_tables(conn)
    rows = conn.execute("SELECT strategy, k, legs_json, size, structure, status FROM nba_score.live_slips WHERE game_date=%s AND status IN ('placed','placed_week2','placed_week2_skip','placed_shadow','placed_week1_skip','placed_capped','placed_late')", (day,)).fetchall()
    if not rows:
        print(f"  {day}: nothing placed to grade", flush=True)
    outcomes = {}
    for player, prop, side, line, hit in conn.execute("""SELECT player, prop, side, line, hit::int FROM nba_market.prop_universe
                                                          WHERE game_date=%s AND line_source='real' AND hit IS NOT NULL""", (day,)).fetchall():
        outcomes[(player, prop, side, float(line))] = hit
    # window->close line movement per (player, market), from the close snapshot (29m): a leg PP moved against the pick hits ~51% vs 61%
    MK = {'steals': 'player_steals', 'turnovers': 'player_turnovers', 'blocks': 'player_blocks', 'stocks': 'player_blocks_steals', 'rebounds': 'player_rebounds',
          'points': 'player_points', 'pts_ast': 'player_points_assists', 'pra': 'player_points_rebounds_assists', 'pts_reb': 'player_points_rebounds',
          'assists': 'player_assists', 'threes_made': 'player_threes', 'reb_ast': 'player_rebounds_assists'}
    close = {}
    for pn, mkey, cline in conn.execute("""SELECT nba_ref.norm_name(player), market_key, line FROM nba_market.board_snapshots
                                           WHERE bookmaker='prizepicks' AND snapshot_label='close' AND game_date=%s""", (day,)).fetchall():
        close[(pn, mkey)] = float(cline)
    norm_cache = {}
    def norm(p):
        if p not in norm_cache:
            norm_cache[p] = conn.execute("SELECT nba_ref.norm_name(%s)", (p,)).fetchone()[0]
        return norm_cache[p]
    def movement(l):
        if not close:
            return None   # no close snapshot for the slate (yet): leave unannotated
        c = close.get((norm(l['player']), MK.get(l['prop'], '')))
        if c is None:
            return 'pulled'
        if c == float(l['line']):
            return 'same'
        return 'against' if ((l['side'] == 'Under' and c > float(l['line'])) or (l['side'] == 'Over' and c < float(l['line']))) else 'for'
    # has P2 finished grading this slate? if the slate has graded legs at all, an outcome that is still missing is a VOID
    # (player did not play / line pulled), not a delay. PP's reversion rule (payouts_srp): the slip pays as the smaller
    # slip of its non-void legs; a slip left with < 2 legs is refunded (profit 0).
    slate_graded = len(outcomes) > 0
    graded = voided = 0
    for strategy, k, legs, size, structure, status0 in rows:
        legs_l = legs if isinstance(legs, list) else json.loads(legs)
        hs = [outcomes.get((l['player'], l['prop'], l['side'], float(l['line']))) for l in legs_l]
        if any(h is None for h in hs) and not slate_graded:
            continue   # P2 has not graded this slate yet; try again next run
        live = [(l, h) for l, h in zip(legs_l, hs) if h is not None]
        n_void = len(legs_l) - len(live)
        for l, h in zip(legs_l, hs):
            l['hit'] = h; l['void'] = h is None
            mv = movement(l)
            if mv is not None:
                l['line_move'] = mv
        if len(live) < 2:
            hits, payout = sum(h for _, h in live), 1.0   # refund
        else:
            graded_legs = [dict(l, hit=h) for l, h in live]
            hits, payout = ENG.grade(graded_legs, structure)
        new_status = ('graded_week2' if status0 == 'placed_week2' else 'graded_week2_skip' if status0 == 'placed_week2_skip'
                      else 'graded_shadow' if status0 == 'placed_shadow'
                      else 'graded_week1_skip' if status0 == 'placed_week1_skip'
                      else 'graded_capped' if status0 == 'placed_capped'
                      else 'graded_late' if status0 == 'placed_late'
                      else ('graded' if n_void == 0 else 'graded_void'))
        conn.execute("""UPDATE nba_score.live_slips SET status=%s, hits=%s, payout=%s, profit=%s, legs_json=%s, graded_at=now()
                        WHERE game_date=%s AND strategy=%s AND k=%s""",
                     (new_status, hits, payout, payout - 1.0, json.dumps(legs_l), day, strategy, k))
        graded += 1; voided += (1 if n_void else 0)
    conn.commit()
    print(f"  {day}: {graded} slips graded ({voided} with voided legs, reverted per PP's rule)", flush=True)
    evaluate_hurdles(conn, day)


def boot_lo(day_items, draws=10000, seed=7):
    n = len(day_items)
    if n < 8:
        return None
    rng = random.Random(seed); out = []
    for _ in range(draws):
        s = r = 0.0
        for _ in range(n):
            a, b = day_items[rng.randrange(n)]
            s += a; r += b
        out.append(r / s - 1)
    out.sort()
    return out[int(0.025 * draws)]


def regular_season_window(conn, today):
    """(first, last) regular-season game dates of the season containing today - the schedule merged with the played-games
    log (season_block), so a historical season the calendar does not hold (2024-25) resolves correctly."""
    try:
        b = season_block(conn, today)
        return (b[0], b[-1]) if b else (None, None)
    except Exception:  # noqa: BLE001
        return None, None


def evaluate_hurdles(conn, day, pool_sizes=None):
    s0, s1 = regular_season_window(conn, day)
    season_start = s0 or (conn.execute("SELECT min(game_date) FROM nba_score.live_slips").fetchone()[0] or day)
    days_into_season = (day - season_start).days
    season_end = s1
    # season rollover: an 'off' (final-week) state from a previous season must not survive into the new one
    if s0 is not None and day >= s0:
        conn.execute("""UPDATE nba_score.live_strategy_state st SET state='paper', live_cap=v.cap, hurdles='{}', updated_at=now()
                        FROM (VALUES %s) v(strategy, cap) WHERE st.strategy=v.strategy AND st.state='off' AND st.updated_at < %s"""
                     % (",".join("('%s',%d)" % (n, c[3]) for n, c in STRATEGIES.items()), "%s"), (dt.datetime.combine(s0, dt.time.min, tzinfo=dt.timezone.utc),))
    # H7 anchor (portfolio): the steals cells are shared by every family-A composition. Day-blocked (29f): a day's steals
    # legs are the same 2-3 players across every slip, so the DAY is the independent unit, not the leg.
    # 29p: per-cell drought STATES beside H7 - trailing-10 daily hit of the steals cell and of the turnovers cell, 'cool' < 50%.
    # Either cell cool identified all three 2025-26 long droughts (days 6, 6, 8) with 20 false days on 154; the response is a
    # ROTATION (family A rebuilt steals-excluded, stocks-only Power added), not a stop, so a false day costs ~nothing.
    cell_state = {}
    for cell_name, cells in (('steals', ['steals_R', 'steals_R_U']), ('turnovers', ['turnovers_R'])):
        rows_c = conn.execute("""SELECT s.game_date, avg((j->>'hit')::int) FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
                                 WHERE s.status IN ('graded','graded_void','graded_shadow') AND s.game_date>=%s AND (j->>'hit') IS NOT NULL AND j->>'cell' = ANY(%s)
                                 GROUP BY s.game_date ORDER BY s.game_date ASC""", (season_start, cells)).fetchall()
        if len(rows_c) >= 7:
            # EWMA (pass 33): lambda 0.15 from the calibrated cell mean; cool below 0.50. Earlier than the trailing means on the
            # real series (days 6/4/5 vs 6/6/8) at a false-day cost the rotation absorbs.
            z = 0.63
            for r in rows_c:
                z = 0.15 * float(r[1]) + 0.85 * z
            m10 = sum(float(r[1]) for r in rows_c[-10:]) / min(10, len(rows_c))
            cell_state[cell_name] = {'state': 'cool' if z < 0.50 else 'ok', 'ewma': round(z, 3), 'trail10': round(m10, 3), 'days': len(rows_c)}
    rotation = any(v['state'] == 'cool' for v in cell_state.values())
    conn.execute("""INSERT INTO nba_score.live_strategy_state (strategy, state, live_cap, hurdles, updated_at) VALUES ('_ROTATION', %s, %s, %s, now())
                    ON CONFLICT (strategy) DO UPDATE SET state=EXCLUDED.state, live_cap=EXCLUDED.live_cap, hurdles=EXCLUDED.hurdles, updated_at=now()""",
                 ('rotation' if rotation else 'normal', 1 if rotation else 0, json.dumps(cell_state)))
    print(f"  cell states {cell_state} -> {'DROUGHT ROTATION' if rotation else 'normal'}", flush=True)
    anchor_days = conn.execute("""SELECT s.game_date, avg((j->>'hit')::int) FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
                                  WHERE s.status IN ('graded','graded_void','graded_shadow') AND s.game_date>=%s AND (j->>'hit') IS NOT NULL AND j->>'cell' IN ('steals_R','steals_R_U')
                                  GROUP BY s.game_date ORDER BY s.game_date DESC LIMIT 14""", (season_start,)).fetchall()
    anchor_state = 'ok'
    acal = conn.execute("SELECT cert_leg_hit, sd_daily_hit FROM nba_score.live_strategy_calib WHERE strategy='_ANCHOR_steals'").fetchone()
    if acal and acal[1] and len(anchor_days) >= 7:
        p0, sd_day = float(acal[0]), float(acal[1])
        nd = len(anchor_days); mean14 = sum(float(r[1]) for r in anchor_days) / nd
        z = (p0 - mean14) / (sd_day / nd ** 0.5)
        anchor_state = 'red' if z > 3.0 else ('yellow' if z > 2.0 else 'ok')
        print(f"  ANCHOR steals: trailing-{nd}-day hit {mean14:.3f} vs {p0:.3f} (sd_day {sd_day:.3f}) z={z:.2f} -> {anchor_state}", flush=True)
    # H8 (concept-drift detector on the pooled daily miss rate) was built and REMOVED (29f): simulated on both seasons'
    # real daily leg stream, plain DDM sat in 'drift' 146-157 of 161 days (p_min anchored on the anomalously good
    # opening week) and the two-window ADWIN-style variant flagged 7-10 HEALTHY weeks per season at every setting
    # while missing week 2 outright. Daily leg hit spans 10-95%; no threshold separates a Kind-A week from noise.
    ddm_state = 'ok'
    for name, (comp, size, structure, cap, cert_hit, worst_dd, longest, pool_floor) in STRATEGIES.items():
        g = conn.execute("""SELECT game_date, sum(profit), count(*), sum(hits), sum(size) FROM nba_score.live_slips
                            WHERE strategy=%s AND status IN ('graded','graded_void') AND game_date>=%s GROUP BY game_date ORDER BY game_date""",
                         (name, season_start)).fetchall()
        if not g:
            continue
        days = len(g); slips = sum(r[2] for r in g); net = sum(r[1] for r in g); roi = net / slips
        built = slips + conn.execute("SELECT count(*) FROM nba_score.live_slips WHERE strategy=%s AND status='dup' AND game_date>=%s", (name, season_start)).fetchone()[0]
        # H1 rolling leg hit over last 100 legs (voided legs excluded)
        legs = conn.execute("""SELECT j->>'hit' FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
                               WHERE s.strategy=%s AND s.status IN ('graded','graded_void') AND s.game_date>=%s AND (j->>'hit') IS NOT NULL
                               ORDER BY s.game_date DESC, s.k LIMIT 150""", (name, season_start)).fetchall()
        leg_hits = [int(x[0]) for x in legs if x[0] is not None]
        leg_hit = sum(leg_hits[:100]) / len(leg_hits[:100]) if len(leg_hits) >= 30 else None
        # H2 drawdown, H3 streak - and the date of the running peak (the drawdown episode's start, for the grace clock)
        cum = peak = dd = 0.0; streak = longest_live = 0; peak_day = g[0][0]
        for gd, dnet, _, _, _ in g:
            cum += dnet
            if cum >= peak:
                peak, peak_day = cum, gd
            dd = max(dd, peak - cum)
            streak = streak + 1 if dnet < 0 else 0; longest_live = max(longest_live, streak)
        # H4 pool: qualifying legs/day for this strategy's cells over the last 14 days (recorded by pick into live_pool)
        pool_avg = conn.execute("""SELECT avg(legs) FROM nba_score.live_pool WHERE strategy=%s AND game_date > %s""",
                                (name, day - dt.timedelta(days=14))).fetchone()[0]
        calib = conn.execute("SELECT mc95_dd, cusum_h_long, cusum_h_short, cusum_k, streak95, streak99, cert_leg_hit, sd_daily_hit FROM nba_score.live_strategy_calib WHERE strategy=%s", (name,)).fetchone()
        ci_lo = boot_lo([(r[2], r[2] + r[1]) for r in g], BOOT_DRAWS) if days >= 8 else None
        h = {}
        # H1: day-blocked test (below). The CUSUM it replaced is documented in 29f.
        chron_days = conn.execute("""SELECT s.game_date, avg((j->>'hit')::int) FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
                                     WHERE s.strategy=%s AND s.status IN ('graded','graded_void','graded_shadow') AND s.game_date>=%s AND (j->>'hit') IS NOT NULL
                                     GROUP BY s.game_date ORDER BY s.game_date DESC LIMIT 14""", (name, season_start)).fetchall()
        if calib and calib[7] and len(chron_days) >= 7:
            # H1 as a DAY-BLOCKED test: trailing-14-day mean of the daily leg hit vs the certified level, in units of the
            # day-level standard error measured from the backtest's own day-to-day variance (calib[7] = sd of daily hit).
            # A cumulative detector (CUSUM/DDM) cannot work on a stream whose daily hit spans 10-95%; this can.
            p0 = float(calib[6]) if calib[6] else cert_hit
            sd_day = float(calib[7])
            nd = len(chron_days); mean14 = sum(float(r[1]) for r in chron_days) / nd
            se = sd_day / (nd ** 0.5)
            z = (p0 - mean14) / se if se > 0 else 0.0
            h['H1'] = 'red' if z > 3.0 else ('yellow' if z > 2.0 else 'ok')
            h['H1_z'] = round(z, 2)
        cur_dd = peak - cum   # the drawdown NOW; a fully recovered strategy is not flagged for a past dip
        if calib and calib[0]:
            mc95 = float(calib[0])   # 95th-pct Monte Carlo drawdown of the backtest day sequence; the historical max is one ordering
            h['H2'] = 'red' if cur_dd >= 1.0 * mc95 else ('yellow' if cur_dd >= 0.8 * mc95 else 'ok')
        else:
            h['H2'] = 'red' if cur_dd >= 1.5 * worst_dd else ('yellow' if cur_dd >= 1.0 * worst_dd else 'ok')
        if calib and calib[4]:
            h['H3'] = 'red' if streak >= int(calib[5]) else ('yellow' if streak >= int(calib[4]) else 'ok')   # MC95 / MC99 of the longest streak
        else:
            h['H3'] = 'red' if streak >= 1.5 * longest else ('yellow' if streak >= 1.25 * longest else 'ok')
        h['H4'] = 'yellow' if (pool_avg is not None and pool_avg < pool_floor and days_into_season > 21) else 'ok'
        if name.startswith('A_') and anchor_state != 'ok':
            h['H7'] = anchor_state   # the shared steals anchor is failing: the whole family moves together
        if ddm_state != 'ok':
            h['H8'] = 'red' if ddm_state == 'drift' else 'yellow'   # concept drift in the shared ordering (29f)
        if days_into_season <= 21:
            h = {k: ('yellow' if v == 'red' else v) for k, v in h.items()}; h['H5'] = 'opening-weeks'
        if 7 <= days_into_season <= 13:
            h['W2'] = 'week2'   # 29d: skip week 2 by calendar - both seasons, every strategy, every sub-population negative
        if season_end is not None and (season_end - day).days <= 7:
            h['H6'] = 'final7'
        flags = {k: v for k, v in h.items() if k in ('H1', 'H2', 'H3', 'H4', 'H7', 'H8')}
        # H1 and H7 are ONE measurement on family A (the strategy's daily hit is dominated by the shared anchor):
        # a soft anchor week must not read as two independent yellows. H7 red (a real anchor failure) still stops the family.
        if flags.get('H7') == 'yellow' and flags.get('H1') in ('yellow', 'red'):
            flags.pop('H7')
        reds = sum(1 for v in flags.values() if v == 'red'); yellows = sum(1 for v in flags.values() if v == 'yellow')
        red_only_variance = reds >= 1 and all(flags.get(x) != 'red' for x in ('H1', 'H7', 'H8')) and yellows < 2
        prev = conn.execute("SELECT state, updated_at, hurdles FROM nba_score.live_strategy_state WHERE strategy=%s", (name,)).fetchone()
        prev_state = prev[0] if prev else 'paper'
        ph = prev[2] if (prev and prev[2] and isinstance(prev[2], dict)) else {}
        crit_since = ph.get('CRIT_SINCE'); clean_days = int(ph.get('CLEAN', 0))
        # paper gate: 50 slate days AND cap x 50 slips (a cap-1 strategy cannot be asked for 1,000 slips) AND bootstrap lower bound > 0
        paper_ok = days >= PAPER_DAYS and built >= cap * PAPER_DAYS and ci_lo is not None and ci_lo > 0
        # the drawdown episode start: the day of the running peak (one-shot grace clock, never reset by a brief recovery)
        if 'H6' in h:
            state, live_cap = 'off', 0
        elif 'W2' in h:
            state, live_cap = 'week2', 1   # 29l: week 2 is a signal-gated play at cap 1, resolved in pick (trough -> low-event structure; else normal)
        elif prev_state == 'red' and 'REQUAL' not in ph:
            state, live_cap = 'red', 0   # a red is sticky in EVERY branch until P5's weekly PASS clears it
        elif (reds >= 1 and not red_only_variance) or yellows >= 2:
            state, live_cap = 'red', 0
        elif red_only_variance:
            # one-shot grace per drawdown episode: the clock starts at the first red-line crossing and is cleared only by a new peak
            if crit_since and ph.get('CRIT_PEAK') == peak_day.isoformat():
                since = dt.date.fromisoformat(crit_since)
            else:
                since = day
            if (day - since).days >= 7:
                state, live_cap = 'red', 0; h['GRACE'] = 'expired'
            else:
                state, live_cap = 'critical', 1; h['CRIT_SINCE'] = since.isoformat(); h['CRIT_PEAK'] = peak_day.isoformat()
        elif yellows == 1:
            state, live_cap = 'yellow', max(1, cap // 2)
        else:
            # clean: step DOWN only after 3 consecutive clean evaluations (hysteresis); a prior red never self-clears
            clean_days += 1
            if prev_state == 'red':
                state, live_cap = 'red', 0
            elif prev_state in ('yellow', 'critical') and clean_days < 3:
                state, live_cap = prev_state, (max(1, cap // 2) if prev_state == 'yellow' else 1)   # holding: CLEAN keeps counting
            elif paper_ok:
                state, live_cap = 'active', cap
            else:
                state, live_cap = 'paper', cap
            h['CLEAN'] = clean_days
        if any(v in ('yellow', 'red') for k, v in flags.items()):
            h['CLEAN'] = 0   # only a FRESH hurdle fire resets the counter; a hold does not
        if state != 'critical':
            h.pop('CRIT_SINCE', None)
        conn.execute("""UPDATE nba_score.live_strategy_state SET state=%s, live_cap=%s, days=%s, slips=%s, net=%s, roi=%s, ci_lo=%s, leg_hit=%s,
                        drawdown=%s, streak=%s, pool_avg=%s, hurdles=%s, updated_at=now() WHERE strategy=%s""",
                     (state, live_cap, days, slips, net, roi, ci_lo, leg_hit, dd, streak, pool_avg, json.dumps(h), name))
        print(f"  {name:<20} {state:<7} cap {live_cap} | days {days} slips {slips} net {net:+.1f} ROI {roi:+.0%} CI_lo {(ci_lo if ci_lo is not None else float('nan')):+.0%} "
              f"| leg {(leg_hit if leg_hit else 0):.3f}/{cert_hit} dd {dd:.1f}/{worst_dd} streak {streak}/{longest} | {h}", flush=True)
    conn.commit()


def simulate_p5(conn, day):
    """Replay-only stand-in for P5's Monday verdict: a red strategy is cleared to paper if its day-blocked bootstrap
    lower bound on the certified OOS slips to date (V2, the statistic P5 applies) is > 0. Same window P5 uses:
    the current season from Nov 1 (the ranker-warmup rule) to the day before."""
    for name, (comp, size, structure, cap, *_r) in STRATEGIES.items():
        st = conn.execute("SELECT state FROM nba_score.live_strategy_state WHERE strategy=%s", (name,)).fetchone()
        if not st or st[0] != 'red':
            continue
        tbl = 'nba_score.slip_engine_slips_nosteals' if name.startswith(('C_', 'D_', 'R_', 'W_')) else 'nba_score.slip_engine_slips'
        y0 = day.year if day.month >= 7 else day.year - 1
        season = f"{y0}-{(y0 + 1) % 100:02d}"
        g = conn.execute(f"""SELECT count(*), sum(profit) FROM {tbl} WHERE composition=%s AND size=%s AND structure=%s AND k<=%s
                             AND season=%s AND phase<>'final7' AND game_date >= %s AND game_date < %s GROUP BY game_date""",
                         (comp, size, structure, cap, season, dt.date(y0, 11, 1), day)).fetchall()
        if len(g) < 40:
            continue
        lo = boot_lo([(float(r[0]), float(r[0]) + float(r[1])) for r in g], 2000)
        if lo is not None and lo > 0:
            conn.execute("""UPDATE nba_score.live_strategy_state SET state='paper', live_cap=%s, hurdles=jsonb_build_object('REQUAL', 'PASS(sim) '||%s::text),
                            updated_at=now() WHERE strategy=%s""", (cap, day.isoformat(), name))
            print(f"  P5(sim) {day}: {name} red -> paper (walk-forward lower bound {lo:+.0%} on {len(g)} days)", flush=True)
    conn.commit()


def replay(conn, d0, d1):
    """Simulate the daily loop over a past range: pick each day on that day's board, grade it, snapshot states.
    Starts from a CLEAN ledger unless LS_RESUME=1, in which case it continues from the day after the last graded day."""
    ensure_tables(conn)
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.live_state_history (game_date date, strategy text, state text, live_cap int, days int,
                    slips int, net double precision, roi double precision, ci_lo double precision, leg_hit double precision, drawdown double precision,
                    streak int, hurdles jsonb, PRIMARY KEY (game_date, strategy))""")
    if os.environ.get('LS_RESUME') == '1':
        last = conn.execute("SELECT max(game_date) FROM nba_score.live_slips WHERE status LIKE 'graded%'").fetchone()[0]
        if last is not None:
            d0 = max(d0, last + dt.timedelta(days=1))
            print(f"  RESUME from {d0} (last graded day {last})", flush=True)
    else:
        conn.execute("DELETE FROM nba_score.live_slips"); conn.execute("DELETE FROM nba_score.live_pool"); conn.execute("DELETE FROM nba_score.live_state_history")
        for name, (comp, size, structure, cap, *_r) in STRATEGIES.items():
            conn.execute("""UPDATE nba_score.live_strategy_state SET state='paper', live_cap=%s, days=0, slips=0, net=0, roi=0, ci_lo=NULL, leg_hit=NULL,
                            drawdown=NULL, streak=NULL, pool_avg=NULL, hurdles='{}', updated_at=now() WHERE strategy=%s""", (cap, name))
    conn.commit()
    days = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_market.pp_leg_price WHERE snapshot_label='window' AND game_date BETWEEN %s AND %s ORDER BY 1""", (d0, d1)).fetchall()]
    print(f"  REPLAY {d0} .. {d1}: {len(days)} slate days", flush=True)
    for day in days:
        if day.weekday() == 0:
            simulate_p5(conn, day)   # Monday: P5's weekly verdict, the only path out of red
        pick(conn, day, require_fresh=False)
        grade(conn, day)
        conn.execute("""INSERT INTO nba_score.live_state_history (game_date, strategy, state, live_cap, days, slips, net, roi, ci_lo, leg_hit, drawdown, streak, hurdles)
                        SELECT %s, strategy, state, live_cap, days, slips, net, roi, ci_lo, leg_hit, drawdown, streak, hurdles FROM nba_score.live_strategy_state
                        ON CONFLICT (game_date, strategy) DO UPDATE SET state=EXCLUDED.state, live_cap=EXCLUDED.live_cap, days=EXCLUDED.days, slips=EXCLUDED.slips,
                        net=EXCLUDED.net, roi=EXCLUDED.roi, ci_lo=EXCLUDED.ci_lo, leg_hit=EXCLUDED.leg_hit, drawdown=EXCLUDED.drawdown, streak=EXCLUDED.streak, hurdles=EXCLUDED.hurdles""", (day,))
        conn.commit()


def calibrate(conn):
    """Per strategy, from the certified backtest slips (both seasons, cap applied, final7 excluded):
       mc95_dd  - 95th percentile of max drawdown over 10k bootstrap resamples of the DAY sequence (historical max is one ordering)
       cusum_h  - decision interval for the leg-hit CUSUM (k = 0.015) chosen so the backtest's own leg stream alarms at most
                  once per season on the long horizon; short horizon = 0.6 * long."""
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.live_strategy_calib (strategy text PRIMARY KEY, hist_max_dd double precision,
                    mc95_dd double precision, mc99_dd double precision, cusum_k double precision, cusum_h_long double precision, cusum_h_short double precision,
                    cert_leg_hit double precision, backtest_days int, backtest_legs int, calibrated_at timestamptz DEFAULT now())""")
    conn.execute("ALTER TABLE nba_score.live_strategy_calib ADD COLUMN IF NOT EXISTS streak95 int")
    conn.execute("ALTER TABLE nba_score.live_strategy_calib ADD COLUMN IF NOT EXISTS streak99 int")
    conn.execute("ALTER TABLE nba_score.live_strategy_calib ADD COLUMN IF NOT EXISTS hist_streak int")
    conn.execute("ALTER TABLE nba_score.live_strategy_calib ADD COLUMN IF NOT EXISTS sd_daily_hit double precision")
    rng = random.Random(11)
    for name, (comp, size, structure, cap, cert_hit, worst_dd, longest, pool_floor) in STRATEGIES.items():
        cap = max(cap, 1)   # a retired (cap 0) strategy still runs shadow detectors; calibrate it at cap 1
        tbl = 'nba_score.slip_engine_slips_nosteals' if name.startswith(('C_', 'D_', 'R_', 'W_')) else 'nba_score.slip_engine_slips'
        days = conn.execute(f"""SELECT game_date, sum(profit) FROM {tbl} WHERE composition=%s AND size=%s AND structure=%s AND k<=%s
                               AND phase<>'final7' GROUP BY game_date ORDER BY game_date""", (comp, size, structure, cap)).fetchall()
        nets = [float(r[1]) for r in days]
        # daily leg hit rate per backtest day -> its sd is the day-level noise H1 measures against (29f: leg-level tests
        # treat 22 copies of the same 2-3 players as 22 trials; the day is the independent unit)
        dh = conn.execute(f"""SELECT s.game_date, avg((j->>'hit')::int) FROM {tbl} s, jsonb_array_elements(s.legs_json) j
                             WHERE s.composition=%s AND s.size=%s AND s.structure=%s AND s.k<=%s AND s.phase<>'final7' GROUP BY s.game_date""",
                          (comp, size, structure, cap)).fetchall()
        daily_hits = [float(r[1]) for r in dh]
        mean_h = sum(daily_hits) / len(daily_hits)
        sd_daily = (sum((x - mean_h) ** 2 for x in daily_hits) / len(daily_hits)) ** 0.5
        def maxdd(seq):
            cum = peak = dd = 0.0
            for x in seq:
                cum += x; peak = max(peak, cum); dd = max(dd, peak - cum)
            return dd
        hist = maxdd(nets)
        def longest_streak(seq):
            s = m = 0
            for x in seq:
                s = s + 1 if x < 0 else 0; m = max(m, s)
            return m
        res = [[nets[rng.randrange(len(nets))] for _ in range(len(nets))] for _ in range(10000)]
        dds = sorted(maxdd(r) for r in res)
        sts = sorted(longest_streak(r) for r in res)
        mc95, mc99 = dds[int(0.95 * len(dds))], dds[int(0.99 * len(dds))]
        st95, st99 = sts[int(0.95 * len(sts))], sts[int(0.99 * len(sts))]
        # §30x: outcomes cluster at week scale (block bootstrap tails wider than iid; A_core_3power's real backtest drawdown sat
        # at the iid 99th percentile). Thresholds = the WIDER of the iid and the 7- and 14-day block-bootstrap envelopes.
        for blk in (7, 14):
            bres = []
            for _ in range(10000):
                seq = []
                while len(seq) < len(nets):
                    i = rng.randrange(len(nets)); seq.extend(nets[i:i + blk])
                bres.append(seq[:len(nets)])
            bd = sorted(maxdd(r) for r in bres); bs = sorted(longest_streak(r) for r in bres)
            mc95 = max(mc95, bd[int(0.95 * len(bd))]); mc99 = max(mc99, bd[int(0.99 * len(bd))])
            st95 = max(st95, bs[int(0.95 * len(bs))]); st99 = max(st99, bs[int(0.99 * len(bs))])
        # CUSUM calibration on the backtest's own leg stream (chronological), per season
        legs = conn.execute(f"""SELECT s.season, s.game_date, (j->>'hit')::int FROM {tbl} s, jsonb_array_elements(s.legs_json) j
                               WHERE s.composition=%s AND s.size=%s AND s.structure=%s AND s.k<=%s AND s.phase<>'final7' ORDER BY s.game_date, s.k""",
                            (comp, size, structure, cap)).fetchall()
        if not legs or not days:
            print(f"  {name:<20} NO BACKTEST SLIPS in {tbl} for {comp} {size}-{structure} k<={cap} - not calibrated", flush=True)
            continue
        p0 = sum(h for _, _, h in legs) / len(legs)
        k = 0.015
        def alarms(h):
            n = 0; c = 0.0; season = None
            per = defaultdict(int)
            for s, d, x in legs:
                if s != season:
                    season = s; c = 0.0
                c = max(0.0, c + (p0 - x) - k)
                if c > h:
                    per[s] += 1; c = 0.0
            return max(per.values()) if per else 0
        h_long = 1.0
        while alarms(h_long) > 1 and h_long < 40:
            h_long += 0.25
        conn.execute("""INSERT INTO nba_score.live_strategy_calib (strategy, hist_max_dd, mc95_dd, mc99_dd, cusum_k, cusum_h_long, cusum_h_short, cert_leg_hit, backtest_days, backtest_legs, streak95, streak99, hist_streak, sd_daily_hit)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (strategy) DO UPDATE SET hist_max_dd=EXCLUDED.hist_max_dd, mc95_dd=EXCLUDED.mc95_dd, mc99_dd=EXCLUDED.mc99_dd,
                        cusum_k=EXCLUDED.cusum_k, cusum_h_long=EXCLUDED.cusum_h_long, cusum_h_short=EXCLUDED.cusum_h_short, cert_leg_hit=EXCLUDED.cert_leg_hit,
                        backtest_days=EXCLUDED.backtest_days, backtest_legs=EXCLUDED.backtest_legs, streak95=EXCLUDED.streak95, streak99=EXCLUDED.streak99, hist_streak=EXCLUDED.hist_streak,
                        sd_daily_hit=EXCLUDED.sd_daily_hit, calibrated_at=now()""",
                     (name, hist, mc95, mc99, k, h_long, 0.75 * h_long, mean_h, len(days), len(legs), st95, st99, longest_streak(nets), sd_daily))
        print(f"  {name:<20} days {len(days):>3} legs {len(legs):>5} daily-hit mean {mean_h:.3f} sd {sd_daily:.3f} | dd hist {hist:5.1f} MC95 {mc95:5.1f} MC99 {mc99:5.1f} | streak hist {longest_streak(nets)} MC95 {st95} MC99 {st99}", flush=True)
    # the steals ANCHOR's daily hit across the backtest (family A slips), for H7's day-blocked test
    ah = conn.execute("""SELECT s.game_date, avg((j->>'hit')::int) FROM nba_score.slip_engine_slips s, jsonb_array_elements(s.legs_json) j
                         WHERE s.k <= CASE WHEN (s.structure='power' AND s.size=3) OR (s.structure='flex' AND s.size=5) THEN 3 ELSE 1 END
                           AND (s.composition,s.size,s.structure) IN (('weighted:steals_R',5,'flex'),('core',5,'flex'),('regular',5,'power'),('weighted:rebounds_R',4,'flex'),('core',3,'power'))
                           AND s.phase<>'final7' AND j->>'cell' IN ('steals_R','steals_R_U') GROUP BY s.game_date""").fetchall()
    av = [float(r[1]) for r in ah]
    a_mean = sum(av) / len(av); a_sd = (sum((x - a_mean) ** 2 for x in av) / len(av)) ** 0.5
    conn.execute("""INSERT INTO nba_score.live_strategy_calib (strategy, cert_leg_hit, sd_daily_hit, backtest_days)
                    VALUES ('_ANCHOR_steals', %s, %s, %s) ON CONFLICT (strategy) DO UPDATE SET cert_leg_hit=EXCLUDED.cert_leg_hit, sd_daily_hit=EXCLUDED.sd_daily_hit,
                    backtest_days=EXCLUDED.backtest_days, calibrated_at=now()""", (a_mean, a_sd, len(av)))
    print(f"  _ANCHOR_steals        days {len(av):>3} daily-hit mean {a_mean:.3f} sd {a_sd:.3f}", flush=True)
    conn.commit()


def reset(conn):
    """Opening-day reset (run once before the season's first pick): a clean ledger, every strategy 'paper' at its cap, and the
    stored drought-rotation state set to 'normal'. The first live pick runs BEFORE the first grade, so without this it would
    inherit whatever rotation state the last replay left behind."""
    ensure_tables(conn)
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.live_state_history (game_date date, strategy text, state text, live_cap int, days int,
                    slips int, net double precision, roi double precision, ci_lo double precision, leg_hit double precision, drawdown double precision,
                    streak int, hurdles jsonb, PRIMARY KEY (game_date, strategy))""")
    n_slips = conn.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0]
    conn.execute("DELETE FROM nba_score.live_slips"); conn.execute("DELETE FROM nba_score.live_pool"); conn.execute("DELETE FROM nba_score.live_state_history")
    for name, (comp, size, structure, cap, *_r) in STRATEGIES.items():
        conn.execute("""UPDATE nba_score.live_strategy_state SET state='paper', live_cap=%s, days=0, slips=0, net=0, roi=0, ci_lo=NULL, leg_hit=NULL,
                        drawdown=NULL, streak=NULL, pool_avg=NULL, hurdles='{}', updated_at=now() WHERE strategy=%s""", (cap, name))
    conn.execute("""INSERT INTO nba_score.live_strategy_state (strategy, state, live_cap, hurdles, updated_at) VALUES ('_ROTATION', 'normal', 0, '{}', now())
                    ON CONFLICT (strategy) DO UPDATE SET state='normal', live_cap=0, hurdles='{}', updated_at=now()""")
    conn.commit()
    states = conn.execute("SELECT strategy, state, live_cap FROM nba_score.live_strategy_state ORDER BY strategy").fetchall()
    print(f"  RESET: {n_slips} ledger slips removed; states: " + ", ".join(f"{s}={st}/{c}" for s, st, c in states), flush=True)


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    d = os.environ.get('LS_DATE')
    if MODE == 'reset':
        reset(conn)
        conn.close()
        return
    if MODE == 'pick':
        day = dt.date.fromisoformat(d) if d else pt_today()
        pick(conn, day)
    elif MODE == 'late_pick':
        day = dt.date.fromisoformat(d) if d else pt_today()
        late_pick(conn, day)
    elif MODE == 'replay':
        replay(conn, dt.date.fromisoformat(os.environ['LS_FROM']), dt.date.fromisoformat(os.environ['LS_TO']))
    elif MODE == 'calibrate':
        calibrate(conn)
    else:
        day = dt.date.fromisoformat(d) if d else pt_today() - dt.timedelta(days=1)
        grade(conn, day)
    conn.close()


if __name__ == "__main__":
    main()
