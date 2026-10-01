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
    'A_wsteals_5flex':   ('weighted:steals_R',    5, 'flex',  3, 0.61, 59.5, 15, 8),
    'A_core_5flex':      ('core',                 5, 'flex',  3, 0.61, 61.4, 15, 8),
    'A_regular_5power':  ('regular',              5, 'power', 1, 0.61, 36.3, 13, 8),
    'A_wrebounds_4flex': ('weighted:rebounds_R',  4, 'flex',  1, 0.62, 21.6, 11, 8),
    'A_core_3power':     ('core',                 3, 'power', 3, 0.62, 74.6, 15, 8),
    'B_demon_5flex':     ('demon',                5, 'flex',  3, 0.38, 40.0, 15, 4),
    'B_demon_3flex':     ('demon',                3, 'flex',  1, 0.38, 14.6, 12, 4),
    'C_wstocks_4flex':   ('weighted:stocks_R',    4, 'flex',  1, 0.60, 22.1, 11, 8),
}


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
def load_board_legs(conn, day):
    """Today's PP window board, scored by the LIVE final_hp, priced by pp_leg_price - the same join the certified map uses."""
    rows = conn.execute("""
        WITH pr AS (
          SELECT p.game_date, p.nm, p.side, p.line, p.kind, p.factor::float price,
            least(abs(COALESCE(NULLIF(p.tier,0), round(p.line-p.anchor_line)::int)),3) tier3,
            CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made'
              WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast'
              WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END prop
          FROM nba_market.pp_leg_price p
          WHERE p.snapshot_label='window' AND p.game_date=%s AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)
        )
        SELECT f.player_id, pu.player, pr.prop, pr.side, pr.line, pr.price, pr.kind, pr.tier3,
               f.final_hp::float, f.baseline_hp::float, f.score::float, pu.team_id, pu.event_id
        FROM pr
        JOIN nba_market.prop_universe pu ON pu.game_date=pr.game_date AND nba_ref.norm_name(pu.player)=pr.nm AND pu.prop=pr.prop
          AND pu.side=pr.side AND pu.line=pr.line AND pu.line_source='real' AND pu.kind=pr.kind
        JOIN nba_score.final_hp f ON f.game_date=pu.game_date AND f.player_id=pu.player_id AND f.prop=pu.prop AND f.side=pu.side AND f.line=pu.line
        WHERE f.final_hp IS NOT NULL AND f.score IS NOT NULL""", (day,)).fetchall()
    # shape into the engine's leg rows: one row per (rank_key) like tier_map_legs, with n_rank computed per (prop,tier,rank)
    legs = []
    for pid, player, prop, side, line, price, kind, t3, s_final, s_base, s_score, team, event in rows:
        tier = 'R' if kind == 'standard' else ('G' if kind == 'goblin' else 'D') + str(t3)
        for rk, s in (('final_hp', s_final), ('baseline_hp', s_base), ('final_score', s_score)):
            legs.append({'rank_key': rk, 'season': None, 'game_date': day, 'player': player, 'prop': prop, 'tier': tier, 'side': side,
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


def pick(conn, day, require_fresh=True):
    ensure_tables(conn)
    if require_fresh:
        scored = conn.execute("SELECT count(*) FROM nba_score.board_scored WHERE game_date=%s", (day,)).fetchone()[0]
        priced = conn.execute("SELECT count(*) FROM nba_market.pp_leg_price WHERE snapshot_label='window' AND game_date=%s AND factor IS NOT NULL", (day,)).fetchone()[0]
        if scored == 0 or priced == 0:
            print(f"  {day}: P3 has not finished this slate (board_scored {scored}, priced window legs {priced}) - REFUSING to pick from a stale/empty board", flush=True)
            sys.exit(2)
    legs = load_board_legs(conn, day)
    if not legs:
        print(f"  {day}: no scored window board legs - nothing to pick", flush=True)
        return
    cmap = ENG.load_corr(conn)
    pool = ENG.eligible_legs(legs)
    states = {r[0]: (r[1], r[2]) for r in conn.execute("SELECT strategy, state, live_cap FROM nba_score.live_strategy_state").fetchall()}
    s0, s1 = regular_season_window(conn, day)
    in_week2 = s0 is not None and 7 <= (day - s0).days <= 13
    in_final7 = s1 is not None and (s1 - day).days <= 7
    if in_final7:
        print(f"  {day}: final 7 days of the regular season - nothing staked (29d/25e)", flush=True)
        return
    n = 0
    for name, (comp, size, structure, cap, *_rest) in STRATEGIES.items():
        state, live_cap = states.get(name, ('paper', cap))
        if state == 'off':
            continue
        week2 = in_week2 or state == 'week2'
        use_cap = cap if week2 else live_cap
        if use_cap == 0:
            continue
        status = 'placed_week2' if week2 else 'placed'
        slips = ENG.build_day_slips(pool, comp, size, structure, use_cap, cmap)
        pool_n = len({l['player'] for l in ENG.candidates_for(comp, pool)})
        conn.execute("INSERT INTO nba_score.live_pool (game_date, strategy, legs) VALUES (%s,%s,%s) ON CONFLICT (game_date, strategy) DO UPDATE SET legs=EXCLUDED.legs",
                     (day, name, pool_n))
        for k, slip in enumerate(slips, start=1):
            conn.execute("""INSERT INTO nba_score.live_slips (game_date, strategy, k, legs_json, size, structure, status)
                            VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (game_date, strategy, k) DO NOTHING""",
                         (day, name, k, json.dumps([{'cell': l['cell'], 'player': l['player'], 'prop': l['prop'], 'tier': l['tier'],
                                                     'side': l['side'], 'line': float(l['line']), 'factor': l['factor']} for l in slip]), size, structure, status))
            n += 1
    conn.commit()
    print(f"  {day}: {n} paper slips placed across {len(STRATEGIES)} strategies ({len(legs)//3} board legs)", flush=True)


# ------------------------------------------------------------------ GRADE
def grade(conn, day):
    ensure_tables(conn)
    rows = conn.execute("SELECT strategy, k, legs_json, size, structure, status FROM nba_score.live_slips WHERE game_date=%s AND status IN ('placed','placed_week2')", (day,)).fetchall()
    if not rows:
        print(f"  {day}: nothing placed to grade", flush=True)
    outcomes = {}
    for player, prop, side, line, hit in conn.execute("""SELECT player, prop, side, line, hit::int FROM nba_market.prop_universe
                                                          WHERE game_date=%s AND line_source='real' AND hit IS NOT NULL""", (day,)).fetchall():
        outcomes[(player, prop, side, float(line))] = hit
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
        if len(live) < 2:
            hits, payout = sum(h for _, h in live), 1.0   # refund
        else:
            graded_legs = [dict(l, hit=h) for l, h in live]
            hits, payout = ENG.grade(graded_legs, structure)
        new_status = 'graded_week2' if status0 == 'placed_week2' else ('graded' if n_void == 0 else 'graded_void')
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
    """(first, last) regular-season game dates around today, from nba_calendar.games - the same table and
    game_label rule P3's slate gate uses (preseason is not a slate)."""
    try:
        r = conn.execute("""SELECT min(game_date), max(game_date) FROM nba_calendar.games
                            WHERE coalesce(game_label,'') NOT IN ('Preseason','Playoffs','Play-In','All-Star')
                              AND game_date BETWEEN %s AND %s""", (today - dt.timedelta(days=300), today + dt.timedelta(days=300))).fetchone()
        return (r[0], r[1]) if r and r[0] else (None, None)
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
    # H7 anchor (portfolio): the steals cells are shared by every family-A composition - one CUSUM on their pooled live legs
    anchor_rows = conn.execute("""SELECT (j->>'hit')::int FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
                                  WHERE s.status IN ('graded','graded_void') AND s.game_date>=%s AND (j->>'hit') IS NOT NULL AND j->>'cell' IN ('steals_R','steals_R_U')
                                  ORDER BY s.game_date, s.strategy, s.k""", (season_start,)).fetchall()
    anchor_state = 'ok'
    if len(anchor_rows) >= 50:
        p0, k = 0.654, 0.015   # certified steals R top-2/3 hit (24a); slack
        cal = conn.execute("SELECT cusum_h_long FROM nba_score.live_strategy_calib WHERE strategy='A_wsteals_5flex'").fetchone()
        h_long = float(cal[0]) if cal and cal[0] else 4.0
        c = 0.0
        for (x,) in anchor_rows:
            c = max(0.0, c + (p0 - x) - k)
        anchor_state = 'red' if c > h_long else ('yellow' if c > 0.75 * h_long else 'ok')
        print(f"  ANCHOR steals: {len(anchor_rows)} live legs, hit {sum(x for (x,) in anchor_rows)/len(anchor_rows):.3f} vs {p0}, CUSUM {c:.2f} (h_long {h_long:.2f}) -> {anchor_state}", flush=True)
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
        calib = conn.execute("SELECT mc95_dd, cusum_h_long, cusum_h_short, cusum_k, streak95, streak99, cert_leg_hit FROM nba_score.live_strategy_calib WHERE strategy=%s", (name,)).fetchone()
        ci_lo = boot_lo([(r[2], r[2] + r[1]) for r in g], BOOT_DRAWS) if days >= 8 else None
        h = {}
        # H1 as a CUSUM on the chronological leg stream (calibrated h: the backtest's own stream alarms <= once/season).
        # A plain +-0.04 window on 100 legs fires ~20% of the time by chance (SE 0.049) - it is kept only as a reported metric.
        chron = conn.execute("""SELECT (j->>'hit')::int FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
                                WHERE s.strategy=%s AND s.status IN ('graded','graded_void') AND s.game_date>=%s AND (j->>'hit') IS NOT NULL
                                ORDER BY s.game_date, s.k""", (name, season_start)).fetchall()
        chron_days = conn.execute("""SELECT s.game_date, avg((j->>'hit')::int) FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
                                     WHERE s.strategy=%s AND s.status IN ('graded','graded_void') AND s.game_date>=%s AND (j->>'hit') IS NOT NULL
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
        reds = sum(1 for v in flags.values() if v == 'red'); yellows = sum(1 for v in flags.values() if v == 'yellow')
        red_only_variance = reds >= 1 and all(flags.get(x) != 'red' for x in ('H1', 'H7', 'H8')) and yellows < 2
        prev = conn.execute("SELECT state, updated_at, hurdles FROM nba_score.live_strategy_state WHERE strategy=%s", (name,)).fetchone()
        prev_state = prev[0] if prev else 'paper'
        ph = prev[2] if (prev and prev[2] and isinstance(prev[2], dict)) else {}
        crit_since = ph.get('CRIT_SINCE'); clean_days = int(ph.get('CLEAN', 0))
        # paper gate: 50 slate days AND cap x 50 slips (a cap-1 strategy cannot be asked for 1,000 slips) AND bootstrap lower bound > 0
        paper_ok = days >= PAPER_DAYS and slips >= cap * PAPER_DAYS and ci_lo is not None and ci_lo > 0
        # the drawdown episode start: the day of the running peak (one-shot grace clock, never reset by a brief recovery)
        if 'H6' in h:
            state, live_cap = 'off', 0
        elif 'W2' in h:
            state, live_cap = 'week2', 0   # staking cap 0; pick still builds the week-2 paper record at base cap (tagged, excluded from hurdles)
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


def replay(conn, d0, d1):
    """Simulate the daily loop over a past range: pick each day on that day's board, grade it, snapshot states.
    Starts from a CLEAN ledger: a replay is a fresh simulation and must never inherit rows from an earlier run."""
    ensure_tables(conn)
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.live_state_history (game_date date, strategy text, state text, live_cap int, days int,
                    slips int, net double precision, roi double precision, ci_lo double precision, leg_hit double precision, drawdown double precision,
                    streak int, hurdles jsonb, PRIMARY KEY (game_date, strategy))""")
    conn.execute("DELETE FROM nba_score.live_slips"); conn.execute("DELETE FROM nba_score.live_pool"); conn.execute("DELETE FROM nba_score.live_state_history")
    for name, (comp, size, structure, cap, *_r) in STRATEGIES.items():
        conn.execute("""UPDATE nba_score.live_strategy_state SET state='paper', live_cap=%s, days=0, slips=0, net=0, roi=0, ci_lo=NULL, leg_hit=NULL,
                        drawdown=NULL, streak=NULL, pool_avg=NULL, hurdles='{}', updated_at=now() WHERE strategy=%s""", (cap, name))
    conn.commit()
    days = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_market.pp_leg_price WHERE snapshot_label='window' AND game_date BETWEEN %s AND %s ORDER BY 1""", (d0, d1)).fetchall()]
    print(f"  REPLAY {d0} .. {d1}: {len(days)} slate days", flush=True)
    for day in days:
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
    rng = random.Random(11)
    for name, (comp, size, structure, cap, cert_hit, worst_dd, longest, pool_floor) in STRATEGIES.items():
        days = conn.execute("""SELECT game_date, sum(profit) FROM nba_score.slip_engine_slips WHERE composition=%s AND size=%s AND structure=%s AND k<=%s
                               AND phase<>'final7' GROUP BY game_date ORDER BY game_date""", (comp, size, structure, cap)).fetchall()
        nets = [float(r[1]) for r in days]
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
        # CUSUM calibration on the backtest's own leg stream (chronological), per season
        legs = conn.execute("""SELECT s.season, s.game_date, (j->>'hit')::int FROM nba_score.slip_engine_slips s, jsonb_array_elements(s.legs_json) j
                               WHERE s.composition=%s AND s.size=%s AND s.structure=%s AND s.k<=%s AND s.phase<>'final7' ORDER BY s.game_date, s.k""",
                            (comp, size, structure, cap)).fetchall()
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
        conn.execute("""INSERT INTO nba_score.live_strategy_calib (strategy, hist_max_dd, mc95_dd, mc99_dd, cusum_k, cusum_h_long, cusum_h_short, cert_leg_hit, backtest_days, backtest_legs, streak95, streak99, hist_streak)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (strategy) DO UPDATE SET hist_max_dd=EXCLUDED.hist_max_dd, mc95_dd=EXCLUDED.mc95_dd, mc99_dd=EXCLUDED.mc99_dd,
                        cusum_k=EXCLUDED.cusum_k, cusum_h_long=EXCLUDED.cusum_h_long, cusum_h_short=EXCLUDED.cusum_h_short, cert_leg_hit=EXCLUDED.cert_leg_hit,
                        backtest_days=EXCLUDED.backtest_days, backtest_legs=EXCLUDED.backtest_legs, streak95=EXCLUDED.streak95, streak99=EXCLUDED.streak99, hist_streak=EXCLUDED.hist_streak, calibrated_at=now()""",
                     (name, hist, mc95, mc99, k, h_long, 0.75 * h_long, p0, len(days), len(legs), st95, st99, longest_streak(nets)))
        print(f"  {name:<20} days {len(days):>3} legs {len(legs):>5} leg-hit {p0:.3f} | dd hist {hist:5.1f} MC95 {mc95:5.1f} MC99 {mc99:5.1f} | streak hist {longest_streak(nets)} MC95 {st95} MC99 {st99} | CUSUM h_long {h_long:.2f} h_short {0.75*h_long:.2f}", flush=True)
    conn.commit()


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    d = os.environ.get('LS_DATE')
    if MODE == 'pick':
        day = dt.date.fromisoformat(d) if d else pt_today()
        pick(conn, day)
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
