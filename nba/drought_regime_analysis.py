#!/usr/bin/env python3
"""
DROUGHT / REGIME / LINE-MOVEMENT ANALYSIS, BOTH APPS (strategy doc §30x; owner: "go deeper, more alternatives, anything new,
also test for PrizePicks").
 A. BLOCK-BOOTSTRAP RECALIBRATION - every live PrizePicks strategy (as live_slip_engine.calibrate loads it) and Underdog P5:
    real max drawdown and longest losing streak vs 10,000 resampled seasons with iid days, 7-day and 14-day blocks.
    PrizePicks' live thresholds (live_strategy_calib) are iid; week-scale clustering (§30w) makes them too tight.
 B. LINE MOVEMENT ON PRIZEPICKS LEGS - books' no-vig for our side, window -> close (nba_score.ud_leg_clv), vs hit rate.
 C. WINDOW-TIME PREDICTORS OF FAVOURABLE MOVEMENT (both apps) - (i) book agreement at the window (no-vig for our side),
    (ii) DFS line staleness: our line vs the books' median MAIN line at the window, signed for our side (a higher line on an
    Under = favourable), (iii) book count; each vs P(books move toward us) and vs hit rate.
 D. TEAM MICRO-REGIMES (both apps) - per team-game, rotation = >= 3 of the previous 5 team games at >= 20 min avg;
    fresh_out = rotation players who played the team's previous game but not this one (new news, on the injury report
    pre-tip, not yet in trailing features); inst3 = rotation absences over the team's previous 3 games (~ a week);
    hit rate by band, both seasons.
 E. POST-ALL-STAR, NARROWED - first 14 days after the break vs the rest, per app and season, leg hit.
Env: DATABASE_URL, AN_N (10000).
"""
import os
import random
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
N = int(os.environ.get('AN_N') or '10000')
MK = {'points': 'player_points', 'rebounds': 'player_rebounds', 'assists': 'player_assists', 'threes_made': 'player_threes',
      'steals': 'player_steals', 'blocks': 'player_blocks', 'turnovers': 'player_turnovers', 'stocks': 'player_blocks_steals',
      'pts_reb': 'player_points_rebounds', 'pts_ast': 'player_points_assists', 'reb_ast': 'player_rebounds_assists',
      'pra': 'player_points_rebounds_assists'}
MK_SQL = "CASE " + " ".join(f"WHEN {{c}}='{k}' THEN '{v}'" for k, v in MK.items()) + " END"


def maxdd(seq):
    cum = peak = dd = 0.0
    for x in seq:
        cum += x; peak = max(peak, cum); dd = max(dd, peak - cum)
    return dd


def longest(seq):
    s = m = 0
    for x in seq:
        s = s + 1 if x < 0 else 0; m = max(m, s)
    return m


def envelope(nets, rng, block):
    out_dd, out_st = [], []
    n = len(nets)
    for _ in range(N):
        seq = []
        while len(seq) < n:
            i = rng.randrange(n)
            seq.extend(nets[i:i + block] if block > 1 else [nets[i]])
        seq = seq[:n]
        out_dd.append(maxdd(seq)); out_st.append(longest(seq))
    out_dd.sort(); out_st.sort()
    q = lambda v, p: v[int(p * len(v))]
    return q(out_dd, .95), q(out_dd, .99), q(out_st, .95), q(out_st, .99), out_dd


def part_a(conn, rng):
    import live_slip_engine as L
    print("\n== A. BLOCK-BOOTSTRAP RECALIBRATION (max drawdown in units; real vs 95th / 99th of iid | 7-day | 14-day blocks) ==", flush=True)
    rows = []
    for name, (comp, size, structure, cap, *_r) in L.STRATEGIES.items():
        cap = max(cap, 1)
        tbl = 'nba_score.slip_engine_slips_nosteals' if name.startswith(('C_', 'D_', 'R_', 'W_')) else 'nba_score.slip_engine_slips'
        nets = [float(r[1]) for r in conn.execute(f"""SELECT game_date, sum(profit) FROM {tbl} WHERE composition=%s AND size=%s
                  AND structure=%s AND k<=%s AND phase<>'final7' GROUP BY game_date ORDER BY game_date""", (comp, size, structure, cap)).fetchall()]
        if len(nets) < 60:
            continue
        rows.append(('PP ' + name, nets))
    for b, t in (('orig', 'nba_score.ud_slip_engine_slips_dlt_orig2'), ('recert', 'nba_score.ud_slip_engine_slips_dlt_recert2')):
        nets = [float(r[1]) for r in conn.execute(f"""
            WITH dates AS (SELECT DISTINCT season, game_date FROM {t}),
            gaps AS (SELECT season, game_date d, lead(game_date) OVER (PARTITION BY season ORDER BY game_date) nxt FROM dates),
            asb AS (SELECT DISTINCT ON (season) season, d lb FROM gaps WHERE extract(month FROM d)=2 ORDER BY season, (nxt-d) DESC),
            p AS (SELECT s.game_date, s.size, s.structure, s.profit,
                    (SELECT string_agg((j->>'player')||(j->>'prop')||(j->>'side')||(j->>'line'), ',' ORDER BY j->>'player', j->>'prop') FROM jsonb_array_elements(s.legs_json) j) lk
                  FROM {t} s JOIN asb USING (season) WHERE s.phase<>'final7' AND NOT (s.game_date BETWEEN asb.lb-6 AND asb.lb)
                    AND ((s.k<=1 AND s.composition='weighted:points_R_U' AND ((s.size=4 AND s.structure='standard') OR (s.size=6 AND s.structure='flex')))
                         OR (s.k<=2 AND s.composition='mains' AND s.size=2 AND s.structure='standard'))),
            u AS (SELECT DISTINCT ON (game_date, size, structure, lk) game_date, profit FROM p)
            SELECT game_date, sum(profit) FROM u GROUP BY 1 ORDER BY 1""").fetchall()]
        rows.append((f'UD P5 {b}', nets))
    for name, nets in rows:
        real_dd, real_st = maxdd(nets), longest(nets)
        res = {blk: envelope(nets, rng, blk) for blk in (1, 7, 14)}
        pct = lambda dd_sorted, v: 100.0 * sum(1 for x in dd_sorted if x < v) / len(dd_sorted)
        print(f"  {name:<26} days {len(nets):>3} | real DD {real_dd:6.1f} (pct iid {pct(res[1][4], real_dd):3.0f} / 7d {pct(res[7][4], real_dd):3.0f} / 14d {pct(res[14][4], real_dd):3.0f}) | "
              f"DD95/99 iid {res[1][0]:6.1f}/{res[1][1]:6.1f}  7d {res[7][0]:6.1f}/{res[7][1]:6.1f}  14d {res[14][0]:6.1f}/{res[14][1]:6.1f} | "
              f"streak real {real_st} vs 99th iid {res[1][3]} / 7d {res[7][3]} / 14d {res[14][3]}", flush=True)


def show(title, rows, header):
    print(f"\n== {title} ==\n  {header}", flush=True)
    for r in rows:
        print("  " + " | ".join("-" if x is None else (f"{x:.3f}" if isinstance(x, float) else str(x)) for x in r), flush=True)


PP_LEGS = f"""
SELECT DISTINCT l.game_date, CASE WHEN l.game_date < '2025-07-01' THEN '2024-25' ELSE '2025-26' END season,
  lower(regexp_replace(unaccent(l.player), '[^A-Za-z]', '', 'g')) pn, l.player, l.prop, l.tier, l.side, l.line, l.hit,
  {MK_SQL.format(c='l.prop')} mk
FROM nba_score.slip_engine_legs l WHERE l.k <= 3 AND l.composition IN ('core','regular','weighted:steals_R','weighted:rebounds_R','weighted:stocks_R','demon','single:points_R','single:stocks_R')
"""
UD_LEGS = f"""
WITH cells(prop, tier, side, rk, n) AS (VALUES ('points','R','Under','final_score',2),('turnovers','R','both','baseline_hp',1),('rebounds','R','both','final_score',1),
   ('assists','R','Under','baseline_hp',1),('reb_ast','B1','Under','baseline_hp',2),('threes_made','R','both','baseline_hp',1),('pts_reb','R','Under','final_score',3),
   ('pts_ast','R','Over','baseline_hp',2),('reb_ast','R','Over','final_hp',1),('rebounds','F2','Under','final_score',1),('rebounds','B1','Under','baseline_hp',3),
   ('blocks','R','both','final_score',1),('stocks','R','Under','final_hp',2),('pra','R','Under','final_score',2)),
l AS (SELECT t.*, c.n, row_number() OVER (PARTITION BY t.rank_key, t.game_date, t.prop, t.tier, CASE WHEN c.side='both' THEN 'x' ELSE t.side END ORDER BY t.score DESC) rn
      FROM nba_score.ud_tier_map_legs_curr t JOIN cells c ON c.prop=t.prop AND c.tier=t.tier AND c.rk=t.rank_key AND (c.side='both' OR c.side=t.side))
SELECT DISTINCT game_date, season, player pn, player_id, prop, tier, side, line, hit, {MK_SQL.format(c='prop')} mk FROM l WHERE rn <= n + 2
"""


def part_bc(conn):
    for app, legs in (('PRIZEPICKS', PP_LEGS), ('UNDERDOG', UD_LEGS)):
        base = f"""
        WITH legs AS ({legs}),
        j AS (SELECT legs.*, (CASE WHEN legs.side='Over' THEN 1 ELSE -1 END) * (c.nv_over_close - c.nv_over_window) dnv,
                     CASE WHEN legs.side='Over' THEN c.nv_over_window ELSE 1 - c.nv_over_window END nvw,
                     (CASE WHEN legs.side='Over' THEN -1 ELSE 1 END) * (legs.line - bm.main_line) stale, bm.nbooks
              FROM legs LEFT JOIN nba_score.ud_leg_clv c ON c.game_date=legs.game_date AND c.pn=legs.pn AND c.mk=legs.mk AND c.line=legs.line
              LEFT JOIN bm ON bm.game_date=legs.game_date AND bm.pn=legs.pn AND bm.mk=legs.mk)"""
        q = lambda band_sql, extra='': conn.execute(base + f"""
            SELECT {band_sql} band,
              count(*) FILTER (WHERE season='2024-25'), avg(hit) FILTER (WHERE season='2024-25'),
              count(*) FILTER (WHERE season='2025-26'), avg(hit) FILTER (WHERE season='2025-26'),
              avg(CASE WHEN dnv >= 0.01 THEN 1.0 WHEN dnv IS NOT NULL THEN 0.0 END) p_toward
            FROM j {extra} GROUP BY 1 ORDER BY 1""").fetchall()
        hdr = "band | n 24-25 | hit 24-25 | n 25-26 | hit 25-26 | P(books move toward us)"
        show(f"B. {app}: books' move for our side, window -> close",
             q("CASE WHEN dnv IS NULL THEN 'z unknown' WHEN dnv <= -0.01 THEN 'a against >= 1pt' WHEN dnv < 0.01 THEN 'b flat' ELSE 'c toward >= 1pt' END"), hdr)
        show(f"C1. {app}: book agreement at the WINDOW (no-vig for our side)",
             q("CASE WHEN nvw IS NULL THEN 'z unknown' WHEN nvw < 0.47 THEN 'a books against (<0.47)' WHEN nvw < 0.53 THEN 'b neutral' WHEN nvw < 0.58 THEN 'c books agree 0.53-0.58' ELSE 'd books agree >= 0.58' END"), hdr)
        show(f"C2. {app}: line staleness at the WINDOW (our line vs books' median main line, + = favourable for our side)",
             q("CASE WHEN stale IS NULL THEN 'z unknown' WHEN stale <= -1 THEN 'a <= -1 (worse than books)' WHEN stale < 0 THEN 'b -1..0' WHEN stale = 0 THEN 'c equal' WHEN stale < 1 THEN 'd 0..+1' ELSE 'e >= +1 (better than books)' END"), hdr)
        show(f"C3. {app}: number of books posting the main line at the WINDOW",
             q("CASE WHEN nbooks IS NULL THEN 'z none' WHEN nbooks <= 2 THEN 'a 1-2' WHEN nbooks <= 4 THEN 'b 3-4' ELSE 'c 5+' END"), hdr)


TEAM_SQL = """
CREATE TEMP TABLE team_day AS
WITH pgl AS (SELECT nba_player_id pid, team_id, game_date, min FROM nba_stats.player_game_log WHERE min > 0),
g AS (SELECT DISTINCT team_id, game_date FROM pgl),
gs AS (SELECT team_id, game_date, row_number() OVER (PARTITION BY team_id ORDER BY game_date) gn FROM g),
pl AS (SELECT p.pid, p.team_id, p.game_date, p.min, gs.gn FROM pgl p JOIN gs USING (team_id, game_date)),
rot AS (SELECT a.team_id, a.gn, b.pid FROM gs a JOIN pl b ON b.team_id=a.team_id AND b.gn BETWEEN a.gn-5 AND a.gn-1
        GROUP BY a.team_id, a.gn, b.pid HAVING count(*) >= 3 AND avg(b.min) >= 20),
st AS (SELECT r.team_id, r.gn, count(*) FILTER (WHERE t.pid IS NULL AND p.pid IS NOT NULL) fresh_out, count(*) FILTER (WHERE t.pid IS NULL) out_now
       FROM rot r LEFT JOIN pl t ON t.team_id=r.team_id AND t.gn=r.gn AND t.pid=r.pid
                  LEFT JOIN pl p ON p.team_id=r.team_id AND p.gn=r.gn-1 AND p.pid=r.pid GROUP BY 1,2)
SELECT gs.team_id, gs.game_date, coalesce(st.fresh_out,0) fresh_out, coalesce(st.out_now,0) out_now,
       coalesce(sum(st.out_now) OVER (PARTITION BY gs.team_id ORDER BY gs.gn ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING), 0) inst3
FROM gs LEFT JOIN st ON st.team_id=gs.team_id AND st.gn=gs.gn
"""


def part_d(conn):
    conn.execute(TEAM_SQL)
    conn.execute("CREATE INDEX ON team_day (team_id, game_date)")
    for app, legs, idsql in (
        ('PRIZEPICKS', PP_LEGS, "JOIN nba_ref.players pr ON lower(regexp_replace(unaccent(pr.full_name), '[^A-Za-z]', '', 'g')) = legs.pn"),
        ('UNDERDOG', UD_LEGS, "JOIN nba_ref.players pr ON pr.nba_player_id::text = legs.player_id::text")):
        base = f"""WITH legs AS ({legs}),
          j AS (SELECT legs.*, td.fresh_out, td.out_now, td.inst3
                FROM legs {idsql}
                JOIN nba_stats.player_game_log g ON g.nba_player_id = pr.nba_player_id AND g.game_date = legs.game_date
                JOIN team_day td ON td.team_id = g.team_id AND td.game_date = legs.game_date)"""
        q = lambda band: conn.execute(base + f"""SELECT {band} b, count(*) FILTER (WHERE season='2024-25'), avg(hit) FILTER (WHERE season='2024-25'),
                count(*) FILTER (WHERE season='2025-26'), avg(hit) FILTER (WHERE season='2025-26') FROM j GROUP BY 1 ORDER BY 1""").fetchall()
        hdr = "band | n 24-25 | hit 24-25 | n 25-26 | hit 25-26"
        show(f"D1. {app}: FRESH rotation absences on the leg's team today (played last game, out today)",
             q("CASE WHEN fresh_out=0 THEN 'a 0' WHEN fresh_out=1 THEN 'b 1' ELSE 'c 2+' END"), hdr)
        show(f"D2. {app}: rotation absences on the leg's team over its previous 3 games (week-scale instability)",
             q("CASE WHEN inst3=0 THEN 'a 0' WHEN inst3<=2 THEN 'b 1-2' WHEN inst3<=5 THEN 'c 3-5' ELSE 'd 6+' END"), hdr)
        show(f"D3. {app}: fresh absences x side",
             q("(CASE WHEN fresh_out=0 THEN '0 fresh' ELSE '1+ fresh' END) || ' / ' || side"), hdr)


def part_e(conn):
    for app, legs in (('PRIZEPICKS', PP_LEGS), ('UNDERDOG', UD_LEGS)):
        rows = conn.execute(f"""
          WITH legs AS ({legs}),
          dates AS (SELECT DISTINCT season, game_date FROM legs),
          gaps AS (SELECT season, game_date d, lead(game_date) OVER (PARTITION BY season ORDER BY game_date) nxt FROM dates),
          asb AS (SELECT DISTINCT ON (season) season, d lb, nxt resume FROM gaps WHERE extract(month FROM d)=2 ORDER BY season, (nxt-d) DESC)
          SELECT CASE WHEN legs.game_date - asb.resume BETWEEN 0 AND 13 THEN 'a post-ASB 14d' WHEN legs.game_date BETWEEN asb.lb-6 AND asb.lb THEN 'b pre-ASB week' ELSE 'c rest' END,
            count(*) FILTER (WHERE legs.season='2024-25'), avg(hit) FILTER (WHERE legs.season='2024-25'),
            count(*) FILTER (WHERE legs.season='2025-26'), avg(hit) FILTER (WHERE legs.season='2025-26')
          FROM legs JOIN asb USING (season) GROUP BY 1 ORDER BY 1""").fetchall()
        show(f"E. {app}: post-All-Star 14 days, leg hit", rows, "period | n 24-25 | hit 24-25 | n 25-26 | hit 25-26")


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    rng = random.Random(23)
    for part, fn in (('B/C', lambda: part_bc(conn)), ('D', lambda: part_d(conn)), ('E', lambda: part_e(conn)), ('A', lambda: part_a(conn, rng))):
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 - report and continue with the other parts
            conn.rollback()
            print(f"\n!! part {part} failed: {exc}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
