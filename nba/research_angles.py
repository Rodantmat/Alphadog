#!/usr/bin/env python3
"""
NEW RESEARCH ANGLES, BOTH APPS (strategy doc §30y; owner: "another research pass with angles never tried; Gemini as well").
Angles from the research pass + Gemini (2.5 Pro) critique, each with the control Gemini asked for:
 T1 TRAVEL / CIRCADIAN - per team-game: time-zone shift since the team's previous game (east +), days since that game,
    altitude venue (DEN / UTA), road-trip game index. Hit rate by band, SPLIT BY |morning spread| (< 6 vs >= 6) so a travel
    effect must survive the game line that already prices team fatigue. Venue = home team's arena (fixed map; neutral-site
    games ignored); offsets: ET -5, CT -6, MT -7 (PHX -7), PT -8.
 T2 PUBLIC OVER BIAS - board-wide balanced (R) legs, one row per leg (final-HP rows): Over vs Under hit by prop, line band and
    a popularity proxy (player's points line >= 22.5 that day = star), so line height and stardom are separated.
 T3 COUNT SKEW - candidate legs: trailing-10 MEDIAN and dispersion (variance / mean) of the stat; hit by (line - median)
    oriented for the side, and by dispersion x side (Gemini: test line vs median, magnified for high-dispersion players).
 T5 CORRELATED-PARLAY LIABILITY - stars (points line >= 22.5) on teams favoured by >= 7.5 (morning spread): points-family
    Under hit vs stars on other teams.
(T4 operator line shading needs a DFS snapshot BEFORE the window - only window / close exist; noted as a capture gap.)
Env: DATABASE_URL.
"""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import drought_regime_analysis as D   # PP_LEGS / UD_LEGS candidate-leg definitions and show()

TZ = {'ATL': -5, 'BOS': -5, 'BKN': -5, 'CHA': -5, 'CLE': -5, 'DET': -5, 'IND': -5, 'MIA': -5, 'NYK': -5, 'ORL': -5, 'PHI': -5,
      'TOR': -5, 'WAS': -5, 'CHI': -6, 'DAL': -6, 'HOU': -6, 'MEM': -6, 'MIL': -6, 'MIN': -6, 'NOP': -6, 'OKC': -6, 'SAS': -6,
      'DEN': -7, 'UTA': -7, 'PHX': -7, 'GSW': -8, 'LAC': -8, 'LAL': -8, 'POR': -8, 'SAC': -8}
TZ_VALUES = ",".join(f"('{k}',{v})" for k, v in TZ.items())

TEAM_TRAVEL = f"""
CREATE TEMP TABLE team_travel AS
WITH tz(tri, off) AS (VALUES {TZ_VALUES}),
g AS (SELECT DISTINCT gl.game_date, h.team_id home_team_id, a.team_id away_team_id, h.abbreviation home_team_tricode
      FROM nba_market.game_lines_snapshots gl
      JOIN nba_ref.teams h ON h.full_name = replace(gl.home_team, 'Los Angeles Clippers', 'LA Clippers')
      JOIN nba_ref.teams a ON a.full_name = replace(gl.away_team, 'Los Angeles Clippers', 'LA Clippers')
      WHERE gl.game_date >= '2024-10-01'),   -- game lines cover both seasons (nba_calendar.games starts 2025-26)
tg AS (SELECT home_team_id team_id, game_date, home_team_tricode venue, true is_home FROM g
       UNION ALL SELECT away_team_id, game_date, home_team_tricode, false FROM g),
s AS (SELECT tg.*, tz.off, lag(tz.off) OVER w prev_off, lag(game_date) OVER w prev_date, lag(is_home) OVER w prev_home,
             sum(CASE WHEN is_home THEN 1 ELSE 0 END) OVER (PARTITION BY team_id ORDER BY game_date) home_grp
      FROM tg JOIN tz ON tz.tri = tg.venue WINDOW w AS (PARTITION BY team_id ORDER BY game_date))
SELECT team_id, game_date, venue, is_home, off - prev_off tz_shift, game_date - prev_date days_since,
       venue IN ('DEN','UTA') altitude,
       CASE WHEN is_home THEN 0 ELSE row_number() OVER (PARTITION BY team_id, home_grp ORDER BY game_date) - 1 END road_idx
FROM s
"""

TEAM_SPREAD = """
CREATE TEMP TABLE team_spread AS
SELECT gl.game_date, t.team_id, avg(gl.point) spread
FROM nba_market.game_lines_snapshots gl JOIN nba_ref.teams t ON t.full_name = replace(gl.outcome, 'Los Angeles Clippers', 'LA Clippers')
WHERE gl.snapshot_label='morning' AND gl.market='spreads' GROUP BY 1,2
"""

STAT = """CASE {p} WHEN 'points' THEN g.pts WHEN 'rebounds' THEN g.reb WHEN 'assists' THEN g.ast WHEN 'threes_made' THEN g.fg3m
  WHEN 'steals' THEN g.stl WHEN 'blocks' THEN g.blk WHEN 'turnovers' THEN g.tov WHEN 'stocks' THEN g.stl+g.blk
  WHEN 'pts_reb' THEN g.pts+g.reb WHEN 'pts_ast' THEN g.pts+g.ast WHEN 'reb_ast' THEN g.reb+g.ast WHEN 'pra' THEN g.pts+g.reb+g.ast END"""


def legs_with_team(app):
    legs = D.PP_LEGS if app == 'PRIZEPICKS' else D.UD_LEGS
    idjoin = ("JOIN nba_ref.players pr ON lower(regexp_replace(unaccent(pr.full_name), '[^A-Za-z]', '', 'g')) = legs.pn"
              if app == 'PRIZEPICKS' else "JOIN nba_ref.players pr ON pr.nba_player_id::text = legs.player_id::text")
    return f"""WITH legs AS ({legs}),
      lt AS (SELECT legs.*, pr.nba_player_id npid, g.team_id FROM legs {idjoin}
             JOIN nba_stats.player_game_log g ON g.nba_player_id = pr.nba_player_id AND g.game_date = legs.game_date)"""


def t1(conn, app):
    base = legs_with_team(app) + """,
      j AS (SELECT lt.*, tt.tz_shift, tt.days_since, tt.altitude, tt.road_idx, abs(ts.spread) aspread
            FROM lt JOIN team_travel tt ON tt.team_id = lt.team_id AND tt.game_date = lt.game_date
            LEFT JOIN team_spread ts ON ts.team_id = lt.team_id AND ts.game_date = lt.game_date)"""
    hdr = "band | n 24-25 | hit 24-25 | n 25-26 | hit 25-26"
    for title, band in (
        ("time-zone shift since last game (east +) x |spread|", "CASE WHEN tz_shift IS NULL THEN 'z first' WHEN tz_shift <= -2 THEN 'a west 2+' WHEN tz_shift < 0 THEN 'b west 1' WHEN tz_shift = 0 THEN 'c none' WHEN tz_shift < 2 THEN 'd east 1' ELSE 'e east 2+' END || CASE WHEN aspread >= 6 THEN ' / spread 6+' ELSE ' / spread <6' END"),
        ("east 2+ zones within 2 days (circadian window) x side", "CASE WHEN tz_shift >= 2 AND days_since <= 2 THEN 'east2+ <=2d' WHEN tz_shift <= -2 AND days_since <= 2 THEN 'west2+ <=2d' ELSE 'other' END || ' / ' || side"),
        ("altitude venue x side", "CASE WHEN altitude THEN 'DEN/UTA' ELSE 'sea level' END || ' / ' || side"),
        ("road-trip game index", "CASE WHEN road_idx = 0 THEN 'a home' WHEN road_idx = 1 THEN 'b road 1' WHEN road_idx <= 3 THEN 'c road 2-3' ELSE 'd road 4+' END")):
        rows = conn.execute(base + f"""SELECT {band} b, count(*) FILTER (WHERE season='2024-25'), avg(hit) FILTER (WHERE season='2024-25'),
              count(*) FILTER (WHERE season='2025-26'), avg(hit) FILTER (WHERE season='2025-26') FROM j GROUP BY 1 ORDER BY 1""").fetchall()
        D.show(f"T1. {app}: {title}", rows, hdr)


def t2(conn):
    for app, tbl in (('UNDERDOG', 'nba_score.ud_tier_map_legs_curr'), ('PRIZEPICKS', 'nba_score.tier_map_legs')):
        rows = conn.execute(f"""
          WITH b AS (SELECT DISTINCT season, game_date, player, prop, side, line, hit FROM {tbl} WHERE tier='R' AND rank_key='final_hp'),
          star AS (SELECT DISTINCT game_date, player FROM b WHERE prop='points' AND line >= 22.5)
          SELECT b.prop || CASE WHEN s.player IS NOT NULL THEN ' / star' ELSE ' / non-star' END grp,
            count(*) FILTER (WHERE side='Over'), avg(hit) FILTER (WHERE side='Over'),
            count(*) FILTER (WHERE side='Under'), avg(hit) FILTER (WHERE side='Under')
          FROM b LEFT JOIN star s ON s.game_date=b.game_date AND s.player=b.player
          WHERE b.prop IN ('points','rebounds','assists','threes_made','pts_reb','pra','steals','turnovers')
          GROUP BY 1 ORDER BY 1""").fetchall()
        D.show(f"T2. {app}: board-wide balanced legs, Over vs Under hit by prop x popularity (both seasons)", rows,
               "prop / popularity | n Over | Over hit | n Under | Under hit")


def t3(conn, app):
    base = legs_with_team(app) + f""",
      tr AS (SELECT lt.*, x.med, x.mu, x.var
             FROM lt CROSS JOIN LATERAL (
               SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) med, avg(v) mu, var_samp(v) var
               FROM (SELECT {STAT.format(p='lt.prop')} v FROM nba_stats.player_game_log g
                     WHERE g.nba_player_id = lt.npid AND g.game_date < lt.game_date AND g.min > 0
                     ORDER BY g.game_date DESC LIMIT 10) q) x),
      j AS (SELECT tr.*, (CASE WHEN side='Over' THEN 1 ELSE -1 END) * (med - line) med_gap,
                   var / nullif(mu, 0) disp FROM tr WHERE mu IS NOT NULL)"""
    hdr = "band | n 24-25 | hit 24-25 | n 25-26 | hit 25-26"
    for title, band in (
        ("line vs trailing-10 MEDIAN (+ = median on our side of the line)", "CASE WHEN med_gap <= -1.5 THEN 'a median against by 1.5+' WHEN med_gap < 0 THEN 'b against <1.5' WHEN med_gap < 1.5 THEN 'c with <1.5' ELSE 'd with 1.5+' END"),
        ("dispersion (var/mean, prior 10) x side", "CASE WHEN disp IS NULL THEN 'z' WHEN disp < 1 THEN 'a under-dispersed <1' WHEN disp < 2 THEN 'b 1-2' ELSE 'c over-dispersed 2+' END || ' / ' || side"),
        ("median below mean (skew) x side", "CASE WHEN mu - med >= 1 THEN 'a right-skewed (mean > median by 1+)' WHEN mu - med <= -1 THEN 'c left-skewed' ELSE 'b symmetric' END || ' / ' || side")):
        rows = conn.execute(base + f"""SELECT {band} b, count(*) FILTER (WHERE season='2024-25'), avg(hit) FILTER (WHERE season='2024-25'),
              count(*) FILTER (WHERE season='2025-26'), avg(hit) FILTER (WHERE season='2025-26') FROM j GROUP BY 1 ORDER BY 1""").fetchall()
        D.show(f"T3. {app}: {title}", rows, hdr)


def t5(conn, app):
    tbl = 'nba_score.ud_tier_map_legs_curr' if app == 'UNDERDOG' else 'nba_score.tier_map_legs'
    base = legs_with_team(app) + f""",
      star AS (SELECT DISTINCT game_date, player FROM {tbl} WHERE prop='points' AND tier='R' AND line >= 22.5),
      j AS (SELECT lt.*, ts.spread, s.player IS NOT NULL is_star FROM lt
            LEFT JOIN team_spread ts ON ts.team_id = lt.team_id AND ts.game_date = lt.game_date
            LEFT JOIN star s ON s.game_date = lt.game_date AND s.player = {'lt.pn' if app == 'UNDERDOG' else 'lt.player'})"""
    rows = conn.execute(base + """SELECT (CASE WHEN is_star THEN 'star' ELSE 'non-star' END) || ' / ' ||
          (CASE WHEN spread IS NULL THEN 'no line' WHEN spread <= -7.5 THEN 'team fav 7.5+' WHEN spread >= 7.5 THEN 'team dog 7.5+' ELSE 'close' END) || ' / ' || side b,
          count(*) FILTER (WHERE season='2024-25'), avg(hit) FILTER (WHERE season='2024-25'),
          count(*) FILTER (WHERE season='2025-26'), avg(hit) FILTER (WHERE season='2025-26')
        FROM j WHERE prop IN ('points','pts_reb','pts_ast','pra') GROUP BY 1 ORDER BY 1""").fetchall()
    D.show(f"T5. {app}: points-family legs - star x team spread x side", rows, "group | n 24-25 | hit 24-25 | n 25-26 | hit 25-26")


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute(TEAM_TRAVEL); conn.execute("CREATE INDEX ON team_travel (team_id, game_date)")
    conn.execute(TEAM_SPREAD); conn.execute("CREATE INDEX ON team_spread (team_id, game_date)")
    conn.commit()   # temp tables persist for the session once committed - a later test's rollback cannot drop them
    print(f"team_travel rows {conn.execute('SELECT count(*) FROM team_travel').fetchone()[0]}, team_spread rows {conn.execute('SELECT count(*) FROM team_spread').fetchone()[0]}", flush=True)
    steps = [('T2', lambda: t2(conn))]
    for app in ('UNDERDOG', 'PRIZEPICKS'):
        steps += [(f'T1 {app}', lambda a=app: t1(conn, a)), (f'T5 {app}', lambda a=app: t5(conn, a)), (f'T3 {app}', lambda a=app: t3(conn, a))]
    for name, fn in steps:
        try:
            fn(); conn.commit()
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            print(f"\n!! {name} failed: {exc}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
