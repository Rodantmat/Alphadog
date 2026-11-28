"""Dump the research's own slips (ua3 days) of the deployed set for 2026-11-01..11-25: RS|[app,date,code,profit,[players]]. Read-only."""
import os, sys, json
import psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_best as RB
HERE = os.path.dirname(os.path.abspath(__file__))
SET = json.load(open(os.path.join(HERE, "final_set.json")))["set"]
with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
    conn.execute("SET statement_timeout = 0")
    for sg in SET:
        r = conn.execute("""SELECT days FROM nba_score.ua3 WHERE tag LIKE '%%-n' AND app=%s AND tier=%s AND side=%s AND rk=%s AND layer=%s AND st=%s AND k=%s AND start=%s AND nsl=%s
           AND (gcap=%s OR %s<0) AND (pdif=%s OR %s<0) AND (altcap=%s OR %s<0) LIMIT 1""",
           (sg["app"], sg["tier"], sg["side"], sg["rk"], sg["layer"], sg["st"], sg["k"], sg["start"], sg["nsl"], sg["gcap"], sg["gcap"], sg["pdif"], sg["pdif"], sg["altcap"], sg["altcap"])).fetchone()
        if not r: continue
        for g, v in RB.parse(r[0]).items():
            if "2026-11-01" <= g <= "2026-11-25":
                for p, legs in v: print("RS|" + json.dumps([sg["app"], g, sg["code"], p, sorted(str(x) for x in legs)]), flush=True)
