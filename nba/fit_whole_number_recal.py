#!/usr/bin/env python3
"""
WHOLE-NUMBER RECALIBRATION FIT (strategy doc §31s G1; COMPASS fact 134). Fits, on BOTH seasons pooled (production), and per
season (evidence), the recalibration validated out-of-sample in integer_line_research.py gate 1b:
  logit(p_cal) = a + b * logit(p_derived),  p_derived = Over(k+1/2) / (Over(k+1/2) + Under(k-1/2))  (mirror for Under)
on played, non-tied PrizePicks window legs at whole-number lines, plus a per-prop TIE scale (actual / predicted tie rate).
Writes them to nba_config.classification_config key 'whole_number_recalibration' WITH the evidence (owner rule: tunables live
in the database, never hardcoded). Dry run unless WN_WRITE=1. Env: DATABASE_URL, WN_WRITE.
"""
import json
import math
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import integer_line_research as R  # noqa: E402  (the same SQL and stat mapping the gate used)


def fit(xy):
    a, b = 0.0, 1.0
    for _ in range(60):
        ga = gb = haa = hab = hbb = 0.0
        for x, y in xy:
            q = 1 / (1 + math.exp(-(a + b * x))); w = q * (1 - q)
            ga += y - q; gb += (y - q) * x; haa += w; hab += w * x; hbb += w * x * x
        det = haa * hbb - hab * hab
        a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det
    return a, b


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    rows = conn.execute(R.SQL).fetchall()
    data = defaultdict(list); ties = defaultdict(lambda: [0.0, 0])
    for (d, pid, prop, side, line, is_int, o_f, u_f, o_b, u_b, h_f, pts, reb, ast, fg3m, stl, blk, tov, mins) in rows:
        if not is_int or o_f is None or u_f is None or mins is None or float(mins) <= 0:
            continue
        sea = '2024-25' if d.year == 2024 or (d.year == 2025 and d.month < 7) else '2025-26'
        v = float(R.val(prop, tuple(float(x or 0) for x in (pts, reb, ast, fg3m, stl, blk, tov)))); line = float(line)
        O = min(max(float(o_f), 1e-4), 1 - 1e-4); U = min(max(float(u_f), 1e-4), 1 - 1e-4)
        t = ties_s[sea][prop]; t[0] += max(0.0, 1 - O - U); t[1] += int(v == line); ties_n[prop] += 1
        if v == line:
            continue
        p = min(max(O / (O + U) if side == 'Over' else U / (O + U), 1e-4), 1 - 1e-4)
        data[sea].append((math.log(p / (1 - p)), int((v > line) if side == 'Over' else (v < line))))
    per = {s: fit(xy) for s, xy in data.items()}
    a, b = fit(data['2024-25'] + data['2025-26'])
    # TIE SCALE - empirical-Bayes shrinkage of each prop's actual/expected tie ratio toward the pooled ratio, prior strength M
    # (in expected ties). M chosen OUT OF SAMPLE: fit on one season, predict the other's per-prop tie counts, both directions.
    def scales(src, M):
        S = sum(v[1] for v in src.values()) / max(sum(v[0] for v in src.values()), 1e-9)
        return {p: (v[1] + M * S) / (v[0] + M) for p, v in src.items()}, S
    cv = {}
    for M in (0, 5, 10, 20, 50, 100, 200):
        err = 0.0
        for tr, te in (('2024-25', '2025-26'), ('2025-26', '2024-25')):
            sc, S = scales(ties_s[tr], M)
            for p, v in ties_s[te].items():
                err += abs(sc.get(p, S) * v[0] - v[1])
        cv[M] = round(err, 2)
    best_M = min(cv, key=cv.get)
    pooled_src = {p: [ties_s['2024-25'].get(p, [0, 0])[0] + ties_s['2025-26'].get(p, [0, 0])[0],
                      ties_s['2024-25'].get(p, [0, 0])[1] + ties_s['2025-26'].get(p, [0, 0])[1]] for p in set(ties_s['2024-25']) | set(ties_s['2025-26'])}
    sc, S_pooled = scales(pooled_src, best_M)
    tie_scale = {p: round(v, 4) for p, v in sc.items()}
    tie_evidence = {p: {"legs": ties_n[p], "expected_ties_raw": round(v[0], 1), "actual_ties": int(v[1])} for p, v in pooled_src.items()}
    print(f"tie-scale prior strength M by cross-season error: {cv} -> M = {best_M}; pooled ratio {S_pooled:.4f}", flush=True)
    cfg = {"formula": "logit(p_cal) = a + b*logit(p_derived); p_derived = Over(k+1/2)/(Over(k+1/2)+Under(k-1/2)), mirror for Under; "
                      "P(tie) = tie_scale[prop] * max(0, 1 - Over(k+1/2) - Under(k-1/2))",
           "a": round(a, 5), "b": round(b, 5), "tie_scale": tie_scale,
           "per_season_fit": {s: {"a": round(x[0], 5), "b": round(x[1], 5), "n": len(data[s])} for s, x in per.items()},
           "n_pooled": len(data['2024-25']) + len(data['2025-26']),
           "evidence": "gate 1 (naive) FAILED: log-loss 0.705 > coin flip 0.693; gate 1b cross-season PASSED: fit 2024-25 -> 2025-26 "
                       "0.7048 -> 0.6890, fit 2025-26 -> 2024-25 0.7058 -> 0.6900; gate 2 slip backtest NOT adopted for selection "
                       "(-0.6 / +1.7 pts) -> priced in nba_score.final_hp_derived, never selected (strategy §31s G1, COMPASS 134)",
           "fitted_at": __import__('datetime').date.today().isoformat()}
    print(json.dumps(cfg, indent=1), flush=True)
    if os.environ.get('WN_WRITE') == '1':
        conn.execute("""INSERT INTO nba_config.classification_config (config_key, config_json, notes, updated_at)
                        VALUES ('whole_number_recalibration', %s::jsonb, %s, now())
                        ON CONFLICT (config_key) DO UPDATE SET config_json = EXCLUDED.config_json, notes = EXCLUDED.notes, updated_at = now()""",
                     (json.dumps(cfg), "§31s G1 / COMPASS 134: whole-number line recalibration (pooled both seasons) + per-prop tie scale"))
        conn.commit(); print("WRITTEN: nba_config.classification_config['whole_number_recalibration']", flush=True)
    else:
        print("DRY RUN (WN_WRITE=1 to store)", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
