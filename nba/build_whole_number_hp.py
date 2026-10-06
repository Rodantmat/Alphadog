#!/usr/bin/env python3
"""
WHOLE-NUMBER FINAL HP (strategy doc §31s G1; COMPASS fact 134). Owner directive (NBA_GOBLIN_DEMON.md §0e-T16): every leg, every
variation, every direction gets a final HP. The ladder prices half-point rungs only; a whole-number board line k is priced here
from the model's two adjacent rungs (exact for count stats) and the validated recalibration:
    p_derived(More) = Over(k+1/2) / (Over(k+1/2) + Under(k-1/2))      p_derived(Less) = Under(k-1/2) / (same)
    p = sigmoid(a + b * logit(p_derived))                               (final_hp AND baseline_hp, each from its own rungs)
    P(tie) = tie_scale[prop] * max(0, 1 - Over(k+1/2) - Under(k-1/2))  (informational; ties void the leg)
Parameters from nba_config.classification_config['whole_number_recalibration'] (never hardcoded). HISTORICAL dates are CROSS-FIT
(each season priced with the slope fitted on the OTHER season, so historical rows stay out-of-sample); live dates use the pooled fit.
Score / edge from build_final_hp.score_and_edge (the identical production formula). Confidence and its components from the LOWER-
confidence adjacent rung (conservative).
Writes nba_score.final_hp_derived (derivation 'whole_number') - NEVER nba_score.final_hp: 20 Python consumers and 4 DB functions
read final_hp, several refit on it, and gate 2 did not adopt these legs for selection (fact 134). One set per date: transactional
delete-then-insert. View nba_score.final_hp_all = model rows + derived rows (the every-leg picture).
Env: DATABASE_URL, WN_DATE (YYYY-MM-DD) or WN_FROM + WN_TO (range), WN_WRITE=1 to write (otherwise dry run).
"""
import datetime as dt
import json
import math
import os
import sys

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_final_hp import score_and_edge  # noqa: E402  (the production formula, refactored out verbatim)

DDL = [
    "CREATE TABLE IF NOT EXISTS nba_score.final_hp_derived (LIKE nba_score.final_hp INCLUDING DEFAULTS)",
    "ALTER TABLE nba_score.final_hp_derived ADD COLUMN IF NOT EXISTS derivation text",
    "ALTER TABLE nba_score.final_hp_derived ADD COLUMN IF NOT EXISTS p_tie numeric",
    "CREATE UNIQUE INDEX IF NOT EXISTS final_hp_derived_key ON nba_score.final_hp_derived (game_date, player_id, prop, side, line, derivation)",
]
VIEW = """CREATE OR REPLACE VIEW nba_score.final_hp_all AS
SELECT f.*, NULL::text AS derivation, NULL::numeric AS p_tie FROM nba_score.final_hp f
UNION ALL SELECT d.* FROM nba_score.final_hp_derived d"""
SQL = """
SELECT k.player_id, k.prop, k.line::float, o.season, o.game_id, o.anchor::float,
       o.final_hp::float, u.final_hp::float, o.baseline_hp::float, u.baseline_hp::float, o.confidence::float, u.confidence::float,
       o.conf_tier, u.conf_tier, o.c_exist::float, u.c_exist::float, o.c_quality::float, u.c_quality::float, o.c_market::float, u.c_market::float,
       o.band, u.band, o.n_uncertain, u.n_uncertain, o.prop_tier, o.phase
FROM (SELECT DISTINCT player_id, prop, line FROM nba_market.board_rung_keys WHERE game_date = %(d)s AND period = 'FULL' AND line = floor(line) AND line >= 0) k
JOIN nba_score.final_hp o ON o.game_date = %(d)s AND o.player_id = k.player_id AND o.prop = k.prop AND o.side = 'Over'  AND o.line = k.line + 0.5
JOIN nba_score.final_hp u ON u.game_date = %(d)s AND u.player_id = k.player_id AND u.prop = k.prop AND u.side = 'Under' AND u.line = k.line - 0.5
WHERE o.final_hp IS NOT NULL AND u.final_hp IS NOT NULL"""
COLS = ("season, game_date, game_id, player_id, prop, line, side, ladder_offset, anchor, baseline_hp, final_hp, cal_shift, score, "
        "confidence, conf_tier, c_exist, c_quality, c_market, prop_tier, band, phase, n_uncertain, built_at, edge, derivation, p_tie")


def sig(z):
    return 1.0 / (1.0 + math.exp(-z))


def lg(p):
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def season_of(d):
    return f"{d.year}-{str(d.year + 1)[2:]}" if d.month >= 7 else f"{d.year - 1}-{str(d.year)[2:]}"


def params_for(cfg, d):
    """Historical seasons: CROSS-FIT (the other season's fit). Any other season (live): the pooled fit."""
    s = season_of(d); per = cfg.get("per_season_fit", {})
    other = {"2024-25": "2025-26", "2025-26": "2024-25"}.get(s)
    if other and other in per:
        return per[other]["a"], per[other]["b"], f"cross-fit ({other})"
    return cfg["a"], cfg["b"], "pooled"


def build_day(conn, cfg, d, write):
    a, b, mode = params_for(cfg, d)
    keys = conn.execute("""SELECT count(*) FROM (SELECT DISTINCT player_id, prop, line FROM nba_market.board_rung_keys
                           WHERE game_date = %s AND period = 'FULL' AND line = floor(line) AND line >= 0) x""", (d,)).fetchone()[0]
    rows = conn.execute(SQL, {"d": d}).fetchall()
    out = []
    now = dt.datetime.now(dt.timezone.utc)
    for (pid, prop, line, season, gid, anchor, of, uf, ob, ub, oc, uc, octr, uctr, oex, uex, oq, uq, om, um, oband, uband, onu, unu, ptier, phase) in rows:
        if of + uf <= 0:
            continue
        low = 0 if (oc if oc is not None else 1.0) <= (uc if uc is not None else 1.0) else 1      # lower-confidence rung
        conf = (oc, uc)[low]; ctier = (octr, uctr)[low]; cex = (oex, uex)[low]; cq = (oq, uq)[low]; cm = (om, um)[low]
        band = (oband, uband)[low]; nunc = (onu, unu)[low]
        tie = cfg["tie_scale"].get(prop, cfg.get("tie_scale_method", {}).get("pooled_ratio", 1.0)) * max(0.0, 1.0 - of - uf)
        for side, pf_, pb_ in (("Over", of / (of + uf), (ob / (ob + ub)) if (ob is not None and ub is not None and ob + ub > 0) else None),
                               ("Under", uf / (of + uf), (ub / (ob + ub)) if (ob is not None and ub is not None and ob + ub > 0) else None)):
            fh = sig(a + b * lg(pf_)); bh = sig(a + b * lg(pb_)) if pb_ is not None else None
            out.append([season, d, gid, pid, prop, line, side, None, anchor, bh, fh, None, None, conf, ctier, cex, cq, cm, ptier, band, phase,
                        nunc, now, None, "whole_number", round(tie, 5)])
    if out:
        fh_arr = np.array([r[10] for r in out], dtype=float); cf_arr = np.array([r[13] if r[13] is not None else np.nan for r in out], dtype=float)
        sc, ed = score_and_edge(fh_arr, cf_arr)
        for r, s_, e_ in zip(out, sc, ed):
            r[12] = None if np.isnan(s_) else float(s_); r[23] = None if np.isnan(e_) else float(e_)
            r[10] = round(r[10], 6); r[9] = None if r[9] is None else round(r[9], 6)
    print(f"  {d} ({mode}: a {a:+.5f}, b {b:.5f}): whole-number board keys {keys:,} | priced {len(out) // 2:,} "
          f"({100 * (len(out) // 2) / keys:.1f}%) -> {len(out):,} rows (both sides)" if keys else f"  {d}: no whole-number board keys", flush=True)
    if write and keys:
        with conn.transaction():
            conn.execute("DELETE FROM nba_score.final_hp_derived WHERE game_date = %s AND derivation = 'whole_number'", (d,))
            if out:
                with conn.cursor() as cur:
                    cur.executemany(f"INSERT INTO nba_score.final_hp_derived ({COLS}) VALUES ({', '.join(['%s'] * 26)})", out)
    return keys, len(out) // 2


def main():
    write = os.environ.get("WN_WRITE") == "1"
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = 'whole_number_recalibration'").fetchone()
    if not row:
        sys.exit("REFUSED: nba_config.classification_config['whole_number_recalibration'] missing - run fit_whole_number_recal.py with WN_WRITE=1")
    cfg = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    if write:
        for q in DDL:
            conn.execute(q)
        conn.execute(VIEW)
    if os.environ.get("WN_DATE"):
        days = [dt.date.fromisoformat(os.environ["WN_DATE"])]
    else:
        d0, d1 = dt.date.fromisoformat(os.environ["WN_FROM"]), dt.date.fromisoformat(os.environ["WN_TO"])
        days = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_market.board_rung_keys WHERE game_date BETWEEN %s AND %s
                                               AND period = 'FULL' AND line = floor(line) AND line >= 0 ORDER BY 1""", (d0, d1)).fetchall()]
    tk = tp = 0
    for d in days:
        k, p = build_day(conn, cfg, d, write)
        tk += k; tp += p
    print(f"WHOLE-NUMBER FINAL HP {'WRITTEN' if write else 'DRY RUN'}: {len(days)} date(s), keys {tk:,}, priced {tp:,} "
          f"({100 * tp / tk:.1f}%)" if tk else "WHOLE-NUMBER FINAL HP: no keys", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
