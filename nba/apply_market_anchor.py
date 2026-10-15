#!/usr/bin/env python3
"""
APPLY THE MARKET-ANCHORED HIT PROBABILITY (2026-10-14) - writes nba_score.board_true_hp, one row per board leg (player, prop, line,
side) of the DFS apps, beside the model's own number (nba_score.board_scored.final_hp, untouched):
  model_hp    the model's final_hp (what the board showed before this fix)
  true_hp     the market-anchored probability (nba/build_market_anchor.py, params in classification_config['hp_market_anchor'])
  market_hp   the model's distribution moved onto the sportsbook (DraftKings no-vig) at this line, when DraftKings priced the prop
  true_score / true_edge   score and edge recomputed from true_hp with the certified formula (build_final_hp.score_and_edge)
  anchor      dk+pp | dk | pp | none - which market anchors the leg had
  fit_set     the parameters used: a past season uses the OTHER season's fit (out-of-sample); the live season uses POOLED

The certified slip engine does not read this table (it ranks nba_score.final_hp inside its certified cells); the UI and the
slip builder's EV read it, so the probability a bettor sees is the honest one.
Live: P3 runs it after the pick for the slate (DraftKings rows come from the ParlayAPI window capture, label 'window', the
history's exact shape). History: MA_D0..MA_D1. One set per day: a date is deleted and rewritten in one transaction.
Env: DATABASE_URL, MA_DATE or MA_D0 / MA_D1, MA_LABEL (default window).
"""
import json
import math
import os
import sys
from datetime import date, timedelta

import numpy as np
import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_market_anchor as MA                       # noqa: E402  the fit's own features, so live == history
from build_final_hp import score_and_edge              # noqa: E402  the certified score / edge arithmetic

# every board prop gets a true_hp: props without a sportsbook market key keep their anchors empty (model-only shrink of its side)
SQL = MA.FEATURE_SQL.replace("FROM nba_score.board_scored b JOIN mk ON mk.prop = b.prop",
                             "FROM nba_score.board_scored b LEFT JOIN mk ON mk.prop = b.prop")
assert SQL != MA.FEATURE_SQL, "feature SQL changed - the apply step must mirror the fit's legs"
# The ladder lookups (q_dk / q_pp) are done in Python from one read of the slate's FULL ladder: the SQL form's correlated
# per-player-prop lookups ran 3-4 minutes a slate under load. Same arithmetic: the rung at or below the anchor line and the rung
# at or above it, interpolated in log-odds (p clipped to [1e-4, 1-1e-4]); no rung on either side -> NULL (no anchor).
# MA_PARITY=<date> checks this against the SQL form for one slate (max abs difference must be < 1e-9).
_qi, _qj = SQL.index("q AS MATERIALIZED ("), SQL.index("\nst AS")
FAST_SQL = SQL[:_qi] + "q AS MATERIALIZED (SELECT anc.*, NULL::float8 q_dk, NULL::float8 q_pp FROM anc)," + SQL[_qj:]
LADDER_SQL = """SELECT DISTINCT ON (player_id, prop, line) player_id, prop, line::float8 line, least(greatest(p_more::float8,1e-4),1-1e-4) p
                FROM nba_score.baseline_history WHERE game_date = %s AND period = 'FULL' AND p_more IS NOT NULL
                ORDER BY player_id, prop, line, game_id"""


def load_ladder(conn, d):
    lad = {}
    for pid, prop, line, p in conn.execute(LADDER_SQL, (d,)).fetchall():
        lad.setdefault((pid, prop), []).append((float(line), float(p)))
    for v in lad.values():
        v.sort()
    return lad


def q_at(rungs, x):
    """the model's P(over) at line x from the ladder: exact rung, else log-odds interpolation between the neighbours."""
    if rungs is None or x is None:
        return None
    x = float(x)
    lo = next((r for r in reversed(rungs) if r[0] <= x), None)
    hi = next((r for r in rungs if r[0] >= x), None)
    if lo is None or hi is None:
        return None
    if lo[0] == hi[0]:
        return lo[1]
    w = (x - lo[0]) / (hi[0] - lo[0])
    z = (1 - w) * math.log(lo[1] / (1 - lo[1])) + w * math.log(hi[1] / (1 - hi[1]))
    return 1 / (1 + math.exp(-z))


def fetch_rows(conn, d, label):
    cur = conn.cursor(row_factory=dict_row)
    cur.execute(FAST_SQL, {"d0": d, "d1": d, "lab": label})
    rows = cur.fetchall()
    lad = load_ladder(conn, d)
    for r in rows:
        rungs = lad.get((r["player_id"], r["prop"]))
        r["q_dk"] = q_at(rungs, r["dk_line"])
        r["q_pp"] = q_at(rungs, r["pp_line"])
    return rows

DDL = """CREATE TABLE IF NOT EXISTS nba_score.board_true_hp (
  game_date date NOT NULL, player_id text NOT NULL, prop text NOT NULL, line numeric NOT NULL, side text NOT NULL,
  model_hp real, true_hp real, market_hp real, true_score real, true_edge real, anchor text,
  dk_line real, dk_p real, pp_line real, fit_set text, built_at timestamptz DEFAULT now(),
  PRIMARY KEY (game_date, player_id, prop, line, side))"""


def fit_set_for(d, fits):
    s = MA.season_of(d)
    other = {"2024-25": "2025-26", "2025-26": "2024-25"}.get(s)
    return other if other in fits else "POOLED"


def apply_date(conn, d, cfg, label="window"):
    fits = cfg["fit_sets"]
    fs = fit_set_for(d, fits)
    params = fits[fs]
    cur = conn.cursor(row_factory=dict_row)
    cur.execute(SQL, {"d0": d, "d1": d, "lab": label})
    rows = cur.fetchall()
    conf = {(r[0], r[1], float(r[2]), r[3]): float(r[4]) for r in conn.execute(
        """SELECT player_id, prop, line, side, max(confidence) FROM nba_score.board_scored
           WHERE game_date = %s AND app = ANY('{prizepicks,underdog,sleeper}'::text[]) GROUP BY 1, 2, 3, 4""", (d,)).fetchall()}
    out = []
    for r in rows:
        if r["fin"] is None:
            continue
        over = str(r["side"]).lower().startswith("o")
        s = 1.0 if over else -1.0
        t = MA.score_leg(params, r)
        if t is None:
            continue
        fr = MA.feature_row(r, s)
        has_dk, has_pp = fr[4] > 0, fr[5] > 0
        mkt = float(MA.sigmoid(fr[1] + fr[2])) if has_dk else None     # the model's curve moved onto DraftKings at this line
        c = conf.get((r["player_id"], r["prop"], float(r["line"]), "Over" if over else "Under"), 0.85)
        sc, ed = score_and_edge(np.array([t]), np.array([c]))
        out.append((d, r["player_id"], r["prop"], float(r["line"]), "Over" if over else "Under", float(r["fin"]), round(t, 5),
                    None if mkt is None else round(mkt, 5), float(sc[0]), float(ed[0]),
                    ("dk+pp" if has_dk and has_pp else "dk" if has_dk else "pp" if has_pp else "none"),
                    r["dk_line"], None if r["dk_p"] is None else round(float(r["dk_p"]), 5), r["pp_line"], fs))
    with conn.cursor() as c2:
        c2.execute("DELETE FROM nba_score.board_true_hp WHERE game_date = %s", (d,))
        c2.executemany("""INSERT INTO nba_score.board_true_hp (game_date, player_id, prop, line, side, model_hp, true_hp, market_hp,
                          true_score, true_edge, anchor, dk_line, dk_p, pp_line, fit_set) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", out)
    conn.commit()
    return len(out), fs


def main():
    url = os.environ["DATABASE_URL"]
    label = os.environ.get("MA_LABEL", "window")
    with psycopg.connect(url) as conn:
        conn.execute("SET statement_timeout = 0")
        row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = 'hp_market_anchor'").fetchone()
        if not row:
            raise SystemExit("REFUSED: nba_config.classification_config['hp_market_anchor'] missing - run nba/build_market_anchor.py (gate) first")
        cfg = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        conn.execute(DDL)
        conn.commit()
        if os.environ.get("MA_DATE"):
            days = [os.environ["MA_DATE"]]
        else:
            d0, d1 = date.fromisoformat(os.environ["MA_D0"]), date.fromisoformat(os.environ["MA_D1"])
            have = {r[0] for r in conn.execute("""SELECT DISTINCT game_date::text FROM nba_score.board_scored WHERE game_date BETWEEN %s AND %s
                                                  AND app = ANY('{prizepicks,underdog,sleeper}'::text[])""", (d0, d1)).fetchall()}
            days = sorted(have)
    # each date is its own transaction on its own connection; six at a time for a history range
    def one(d):
        with psycopg.connect(url) as c:
            c.execute("SET statement_timeout = 0")
            return d, *apply_date(c, d, cfg, label)
    tot = 0
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=int(os.environ.get("MA_WORKERS", "6"))) as ex:
        for d, n, fs in ex.map(one, days):
            tot += n
            print(f"  {d}: {n:,} legs (fit {fs})", flush=True)
    print(f"board_true_hp written: {tot:,} legs over {len(days)} slate(s)", flush=True)


if __name__ == "__main__":
    main()
