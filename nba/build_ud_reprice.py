#!/usr/bin/env python3
"""
UNDERDOG REPRICING TO THE CURRENT PAYOUT LOGIC (strategy doc §30r; owner 2026-10-03: "for PrizePicks we use the current
multipliers; for Underdog we used the real day-by-day ones, which may not reflect the current logic - find the current
logic, compare to the old seasons, and re-map with a more current payout; give a confidence discount where unsure").

CURRENT LOGIC (measured on Underdog's own fields, MLB board 2026-09-10..27, 40,400 lines, archive.underdog_ladder_history):
  modifier m = 0.5 / fantasy_prob ; fantasy_prob = books' no-vig prob + margin, whole percents.
  mains: |no-vig - 0.5| < 0.02 -> snapped 50/50 (m = 1.00, 100%); 0.020-0.025 -> 66% snapped; >= 0.025 -> priced at
         no-vig + ~1.3 pts on both sides.
  alternates: never snapped; margin by no-vig band (MLB fit, sd ~0.005): MARGIN_CURVE below; 0.41-0.59 (no MLB
         alternates there) set to 0.025, the alternate level on both sides of the gap.
HISTORY (measured vs 7 books' no-vig, same 'window' snapshot as the Underdog price - no closing-line leakage):
  2024-25 alternates no-vig + 0.4..2.4 pts (far more generous than now); 2025-26 alternates + 2.4..7.2 (as harsh or harsher);
  mains always 1.00 in both seasons; 80-87% of NBA mains fall inside today's snap zone.

Per leg (every row of nba_score.ud_window_legs), columns written to nba_score.ud_window_legs_curr:
  nv_side      books' no-vig for the leg's side at the same player / base market / line (avg over books posting both sides)
  m_hist       the certified historical modifier
  m_cur        today's rule applied to nv_side (mains: snap < 0.02, edge zone 0.020-0.025 -> the LESS favourable of snapped and
               priced, >= 0.025 priced at nv + 0.013; alternates nv + margin(nv)); f rounded to whole percent; m = round(0.5/f, 2)
  m_cur_narrow the same with a narrower snap zone (0.01) - sensitivity (Gemini: scenario range, not one number)
  m            = the scenario chosen by RP_SCENARIO: 'min' (default, conservative) = min(m_hist, m_cur) - never more generous
               than what was actually offered then, nor than today's rule; 'cur' = m_cur; 'narrow' = min(m_hist, m_cur_narrow)
  No two-sided book no-vig: alternates back nv out of the historical modifier with that era's SMALLEST measured margin
  (the conservative direction: a higher implied no-vig -> a lower repriced modifier); mains keep 1.00 (80-87% are in the
  snap zone) and are covered by the confidence haircut, which is applied at grading time (engine UD_HC_MAIN / UD_HC_ALT).
Env: DATABASE_URL, RP_SCENARIO (min | cur | narrow).
"""
import os
from bisect import bisect_left

import psycopg

SCENARIO = (os.environ.get('RP_SCENARIO') or 'min').strip()
MARGIN_CURVE = [(0.10, 0.017), (0.19, 0.017), (0.224, 0.017), (0.274, 0.022), (0.325, 0.021), (0.371, 0.025), (0.41, 0.025),
                (0.59, 0.025), (0.629, 0.029), (0.674, 0.026), (0.724, 0.032), (0.774, 0.033), (0.81, 0.033), (0.95, 0.033)]
# extremes floored at 0.017 / 0.033 (the measured 0.004 at 0.19 and 0.017 at 0.81 sit on thin, noisy bands - never let a
# thin band make a leg MORE generous than its neighbours)
MAIN_MARGIN = 0.013
ERA_MIN_ALT_MARGIN = {'2024-25': 0.004, '2025-26': 0.024}

SQL = """
WITH b AS (
  SELECT game_date, event_id, lower(regexp_replace(unaccent(player), '[^A-Za-z]', '', 'g')) pn,
         regexp_replace(market_key, '_alternate$', '') mk, line, bookmaker,
    max(CASE WHEN side='Over'  THEN CASE WHEN price<0 THEN -price/(-price+100.0) ELSE 100.0/(price+100) END END) io,
    max(CASE WHEN side='Under' THEN CASE WHEN price<0 THEN -price/(-price+100.0) ELSE 100.0/(price+100) END END) iu
  FROM nba_market.board_snapshots
  WHERE snapshot_label='window' AND bookmaker NOT IN ('underdog','prizepicks') AND game_date >= '2024-10-01'
  GROUP BY 1,2,3,4,5,6),
nv AS (SELECT game_date, event_id, pn, mk, line, avg(io/(io+iu)) nv_over, count(*) nb FROM b WHERE io IS NOT NULL AND iu IS NOT NULL GROUP BY 1,2,3,4,5)
SELECT w.season, w.game_date, w.event_id, w.pn, w.player_id, w.market_key, w.prop, w.kind, w.side, w.line, w.price, w.m::float m_hist,
       n.nv_over, n.nb
FROM nba_score.ud_window_legs w
LEFT JOIN nv n ON n.game_date=w.game_date AND n.event_id=w.event_id AND n.pn=w.pn
              AND n.mk=regexp_replace(w.market_key, '_alternate$', '') AND n.line=w.line
"""


def margin(nv):
    xs = [x for x, _ in MARGIN_CURVE]
    if nv <= xs[0]:
        return MARGIN_CURVE[0][1]
    if nv >= xs[-1]:
        return MARGIN_CURVE[-1][1]
    i = bisect_left(xs, nv)
    (x0, y0), (x1, y1) = MARGIN_CURVE[i - 1], MARGIN_CURVE[i]
    return y0 + (y1 - y0) * (nv - x0) / (x1 - x0)


def m_from_f(f):
    f = min(max(round(f * 100) / 100.0, 0.01), 0.99)   # Underdog's fantasy probabilities are whole percents
    return round(0.5 / f, 2)


def price_main(nv_side, snap):
    gap = abs(nv_side - 0.5)
    priced = m_from_f(nv_side + MAIN_MARGIN)
    if gap < snap:
        return 1.0
    if gap < snap + 0.005:
        return min(1.0, priced)          # edge zone: two thirds snapped - take the less favourable
    return priced


def price_alt(nv_side):
    return m_from_f(nv_side + margin(nv_side))


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    rows = conn.execute(SQL).fetchall()
    print(f"  {len(rows):,} Underdog window legs loaded; scenario = {SCENARIO}", flush=True)
    out = []
    stats = {'nv_book': 0, 'nv_backed': 0, 'main_no_nv': 0}
    for (season, gd, ev, pn, pid, mk, prop, kind, side, line, price, m_hist, nv_over, nb) in rows:
        if nv_over is not None:
            nv_side = float(nv_over) if side == 'Over' else 1.0 - float(nv_over)
            src = 'book'; stats['nv_book'] += 1
        elif kind != 'main' and m_hist and m_hist > 0:
            nv_side = 0.5 / m_hist - ERA_MIN_ALT_MARGIN.get(season, 0.024)
            src = 'backed'; stats['nv_backed'] += 1
        else:
            nv_side = None; src = 'none'; stats['main_no_nv'] += 1
        if nv_side is None:
            m_cur = m_cur_narrow = 1.0 if kind == 'main' else m_hist
        elif kind == 'main':
            m_cur = price_main(nv_side, 0.02)
            m_cur_narrow = price_main(nv_side, 0.01)
        else:
            m_cur = m_cur_narrow = price_alt(nv_side)
        if SCENARIO == 'cur':
            m = m_cur
        elif SCENARIO == 'narrow':
            m = min(m_hist, m_cur_narrow)
        else:
            m = min(m_hist, m_cur)
        out.append((season, gd, ev, pn, pid, mk, prop, kind, side, line, price, m, m_hist, m_cur, m_cur_narrow,
                    nv_side, int(nb) if nb is not None else None, src))
    conn.execute("DROP TABLE IF EXISTS nba_score.ud_window_legs_curr")
    conn.execute("""CREATE TABLE nba_score.ud_window_legs_curr (
        season text, game_date date, event_id text, pn text, player_id text, market_key text, prop text, kind text, side text,
        line numeric, price numeric, m numeric, m_hist numeric, m_cur numeric, m_cur_narrow numeric, nv_side double precision,
        books int, nv_source text, scenario text DEFAULT %s, built_at timestamptz DEFAULT now())""".replace('%s', f"'{SCENARIO}'"))
    with conn.cursor() as c:
        with c.copy("""COPY nba_score.ud_window_legs_curr (season, game_date, event_id, pn, player_id, market_key, prop, kind, side, line,
                       price, m, m_hist, m_cur, m_cur_narrow, nv_side, books, nv_source) FROM STDIN""") as cp:
            for r in out:
                cp.write_row(r)
    conn.execute("CREATE INDEX ON nba_score.ud_window_legs_curr (game_date, pn, market_key, side)")
    conn.commit()
    print(f"  no-vig source: books {stats['nv_book']:,} | backed out (alternates) {stats['nv_backed']:,} | mains without books {stats['main_no_nv']:,}", flush=True)
    for r in conn.execute("""SELECT season, kind, count(*), round(avg(m_hist),3), round(avg(m_cur),3), round(avg(m),3),
                               round(100.0*avg(CASE WHEN m < m_hist THEN 1 ELSE 0 END),1), round(100.0*avg(CASE WHEN m_cur > m_hist THEN 1 ELSE 0 END),1),
                               round(100.0*avg(CASE WHEN m_hist=1 AND m<>1 THEN 1 ELSE 0 END),1)
                             FROM nba_score.ud_window_legs_curr GROUP BY 1,2 ORDER BY 1,2""").fetchall():
        print(f"  {r[0]} {r[1]:<4} legs {r[2]:,} | avg m hist {r[3]} cur {r[4]} used {r[5]} | lowered {r[6]}% | current more generous than history {r[7]}% | 1.00 -> priced {r[8]}%", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
