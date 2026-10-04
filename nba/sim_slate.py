#!/usr/bin/env python3
"""
SLATE SIMULATION - READ-ONLY on production (strategy doc §31h). "Would any leg pass the strategies?" for a slate whose game day
has not come. The model was built for the slate in a SANDBOX (scratch tables nba_score._sim_baseline_history /
nba_score._sim_final_hp, written by sandboxed copies of the P2B scripts - see nba-sim-slate.yml); this script reads those,
builds the slate's PrizePicks legs exactly as load_board_legs_live does (canonical resolver, board event, team = whichever of
the event's two teams matches the player, three rank keys, n_rank per (rank_key, prop, tier)), EXCEPT: (1) the board is the
latest 'routine' capture (no 'window' capture exists before game day); (2) the tier is derived from the leg's position on the
PrizePicks ladder (alternate above the standard line = demon step n, below = goblin step n) because the tier build runs only
on window captures. Then the live engine's own pool code (attach_pf20 -> ENG.eligible_legs -> trailing10 + leg_allowed ->
family exclusions -> side filters -> ENG.build_day_slips with the correlation map) for every live strategy.
CAVEATS printed with the result: as-of today, not game-day inputs (no injury report, no crews, no morning line); the board is
the early partial board; ranks are relative to THIS board, not the full slate that will post.
Env: DATABASE_URL, SIM_DATE.
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L  # noqa: E402
ENG = L.ENG
PROP = {'points': 'points', 'rebounds': 'rebounds', 'assists': 'assists', 'threes': 'threes_made', 'steals': 'steals',
        'blocks': 'blocks', 'turnovers': 'turnovers', 'blocks_steals': 'stocks', 'points_rebounds': 'pts_reb',
        'points_assists': 'pts_ast', 'rebounds_assists': 'reb_ast', 'points_rebounds_assists': 'pra'}


def main():
    day = os.environ['SIM_DATE']
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    rows = conn.execute("""
      WITH b AS (
        SELECT DISTINCT ON (nba_ref.norm_name(player), market_key, side, line)
               player, nba_ref.norm_name(player) cn, market_key, side, line, event_id, home_team, away_team
        FROM nba_market.board_snapshots
        WHERE bookmaker='prizepicks' AND game_date=%s AND snapshot_label='routine'
        ORDER BY nba_ref.norm_name(player), market_key, side, line, fetched_at DESC),
      p AS (SELECT DISTINCT cn, nm.player_id, nm.player_id::bigint pid_n FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = b.cn),
      gl AS (SELECT DISTINCT ON (g.nba_player_id) g.nba_player_id, g.team_id FROM nba_stats.player_game_log g
             WHERE g.nba_player_id IN (SELECT pid_n FROM p) AND g.game_date < %s ORDER BY g.nba_player_id, g.game_date DESC),
      t AS (SELECT b.*, h.team_id home_id, a.team_id away_id FROM b
            LEFT JOIN nba_ref.teams h ON h.full_name = replace(b.home_team, 'Los Angeles Clippers', 'LA Clippers')
            LEFT JOIN nba_ref.teams a ON a.full_name = replace(b.away_team, 'Los Angeles Clippers', 'LA Clippers'))
      SELECT t.player, p.player_id, t.market_key, t.side, t.line, t.event_id,
             CASE WHEN gl.team_id IN (t.home_id, t.away_id) THEN gl.team_id WHEN pl.team_id IN (t.home_id, t.away_id) THEN pl.team_id END team
      FROM t JOIN p USING (cn) LEFT JOIN gl ON gl.nba_player_id = p.pid_n
      LEFT JOIN nba_ref.players pl ON pl.nba_player_id::bigint = p.pid_n""", (day, day)).fetchall()
    # ladder position -> tier, per (player, prop)
    by = defaultdict(list)
    for player, pid, mk, side, line, ev, team in rows:
        base = mk.replace('player_', '').replace('_alternate', '')
        if base not in PROP:
            continue
        by[(player, PROP[base])].append((mk.endswith('_alternate'), side, float(line), pid, ev, team))
    scores = {(r[0], r[1], r[2], float(r[3])): (r[4], r[5], r[6]) for r in conn.execute(
        """SELECT player_id, prop, side, line, final_hp::float, baseline_hp::float, score::float FROM nba_score._sim_final_hp
           WHERE game_date=%s AND final_hp IS NOT NULL AND score IS NOT NULL""", (day,)).fetchall()}
    legs = []; unscored = dropped = 0
    for (player, prop), lst in by.items():
        std = [x for x in lst if not x[0]]
        std_line = max((x[2] for x in std), default=None)
        above = sorted({x[2] for x in lst if x[0] and std_line is not None and x[2] > std_line})
        below = sorted({x[2] for x in lst if x[0] and std_line is not None and x[2] < std_line}, reverse=True)
        for alt, side, line, pid, ev, team in lst:
            if team is None or ev is None:
                dropped += 1; continue
            if not alt:
                tier = 'R'
            elif std_line is None:
                continue                                   # alternate with no standard line: tier undefined
            elif line > std_line:
                tier = 'D' + str(min(above.index(line) + 1, 3))
            else:
                tier = 'G' + str(min(below.index(line) + 1, 3))
            sc = scores.get((str(pid), prop, side, line))
            if sc is None:
                unscored += 1; continue
            for rk, s in (('final_hp', sc[0]), ('baseline_hp', sc[1]), ('final_score', sc[2])):
                legs.append({'rank_key': rk, 'season': None, 'game_date': day, 'player': player, 'player_id': pid, 'prop': prop,
                             'tier': tier, 'side': side, 'line': line, 'factor': 1.0, 'hit': None, 'n_rank': None, 'score': s,
                             'team_id': team, 'event_id': ev})
    g = defaultdict(list)
    for l in legs:
        g[(l['rank_key'], l['prop'], l['tier'])].append(l)
    for grp in g.values():
        grp.sort(key=lambda l: (-l['score'], l['player']))
        for i, l in enumerate(grp, start=1):
            l['n_rank'] = i
    print(f"SIMULATION {day}: {len(legs)//3} scored PrizePicks legs ({unscored} unscored, {dropped} team/event unresolved) "
          f"| {len({l['player'] for l in legs})} players | {len({l['event_id'] for l in legs})} games", flush=True)
    cmap = ENG.load_corr(conn)
    L.attach_pf20(conn, day, legs)
    pool = ENG.eligible_legs(legs)
    t10 = L.trailing10(conn, day, {l['player_id'] for v in pool.values() for l in v if l['prop'] == 'steals' and l.get('player_id')})
    pool = {c: [l for l in v if L.leg_allowed(l, t10)] for c, v in pool.items()}
    print("\n== LEGS THAT PASS A CERTIFIED CELL (cell: player prop side line | tier | rank) ==", flush=True)
    for cell in sorted(pool):
        for l in pool[cell]:
            print(f"  {cell:<12} {l['player']:<24} {l['prop']:<8} {l['side']:<5} {l['line']:<5} | {l['tier']} | rank {l['n_rank']} by {l['rank_key']} "
                  f"(score {l['score']:.3f})", flush=True)
    empty = [c for c in ENG.CELLS if not pool.get(c)]
    print(f"  cells with NO passing leg: {', '.join(empty)}", flush=True)
    # THE REAL pick(): every live rule (opening week, small slate, drought rotation, stand-downs, caps, state) runs as written.
    # Two substitutions only - the leg loader returns the sandbox legs, and commit() is a no-op; everything is rolled back.
    class NoCommit:
        def __init__(self, c): self._c = c
        def commit(self): pass
        def __getattr__(self, n): return getattr(self._c, n)
    sim_legs = [dict(l) for l in legs]
    L.load_board_legs = lambda _conn, _day: [dict(l) for l in sim_legs]
    print("\n== THE LIVE pick() ON THIS BOARD (rolled back afterwards) ==", flush=True)
    import datetime as _dt
    try:
        L.pick(NoCommit(conn), _dt.date.fromisoformat(day), require_fresh=False)
        placed = conn.execute("""SELECT strategy, k, status, legs_json FROM nba_score.live_slips WHERE game_date=%s
                                 ORDER BY strategy, k""", (day,)).fetchall()
        print(f"\n  {len(placed)} slip(s) the live engine would record:", flush=True)
        for strat, k, status, lj in placed:
            print(f"    {strat:<20} k{k} {status:<14} " + " + ".join(
                f"{j['player']} {j['prop']} {j['side']} {j['line']} [{j['tier']}]" for j in lj), flush=True)
    finally:
        conn.rollback()
        left = conn.execute("SELECT count(*) FROM nba_score.live_slips WHERE game_date=%s", (day,)).fetchone()[0]
        print(f"  rolled back - live_slips rows for {day} now: {left} (must be 0)", flush=True)
    print("\nCAVEATS: as-of today, not game-day inputs (no day-before injury report, no referee crews, no morning line); "
          "the early PARTIAL board (spotlight players only); ranks relative to this board, not the full slate.", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
