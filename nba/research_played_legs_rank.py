#!/usr/bin/env python3
"""
S6g - WHERE IN THE SYSTEM'S LIST DO THE PLAYED LEGS SIT? READ-ONLY. (NBA_HONEST_REBUILD.md section 8m)
8l: this season the first ~6 regular Unders of the system's list beat break-even on every app and the value fades fast with list length.
This looks at the legs that were actually on graded live / shadow slips this season (unique legs) and splits them by their rank in the slate's list of
regular legs of the same side (production final_hp, one leg per player): rank 1-6, 7-20, 21-50, 51+, and alternates / not on the regular list.
Per app and status: legs, hit rate (+- standard error), the app's own all-board hit rate of the same side for reference.
Env: DATABASE_URL, PR_SINCE (2026-10-20).
"""
import os

import numpy as np
import pandas as pd
import psycopg

SINCE = os.environ.get("PR_SINCE") or "2026-10-20"
TABLES = (("prizepicks", "pp26", "live_slips"), ("underdog", "underdog", "ud_live_slips"), ("sleeper", "sleeper", "sleeper_live_slips"), ("fliff", "fliff", "fliff_live_slips"))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    sysl = pd.read_sql("""SELECT app, game_date::text gd, player player_id, prop, side, line::float8 line, tier, kind, p::float8 p, hit::int bhit FROM nba_score._lr_app_legs
                          WHERE game_date >= %s AND src = 'real' AND p IS NOT NULL""", conn, params=(SINCE,))
    sysl["under"] = ~sysl["side"].str.lower().str[0].isin(["o", "m", "h"])
    sysl["reg"] = sysl["tier"].astype(str).str[:1].isin(["R", ""]) | sysl["kind"].astype(str).isin(["standard", "main"])
    for app, key, tbl in TABLES:
        s = sysl[(sysl["app"] == key) & sysl["reg"]].copy()
        best = s.sort_values("p", ascending=False).drop_duplicates(["gd", "player_id", "under"])
        best["rk"] = best.groupby(["gd", "under"]).cumcount() + 1
        s = s.merge(best[["gd", "player_id", "under", "rk", "p"]].rename(columns={"p": "pbest"}), on=["gd", "player_id", "under"], how="left")
        try:
            lg = pd.read_sql(f"""SELECT DISTINCT s.game_date::text gd, s.status, e->>'player_id' player_id, e->>'prop' prop, e->>'side' side, (e->>'line')::float8 line,
                                        (CASE WHEN e->>'hit' IN ('true', '1', '1.0') THEN 1 ELSE 0 END) hit
                                 FROM nba_score.{tbl} s, jsonb_array_elements(s.legs_json::jsonb) e
                                 WHERE s.game_date >= %s AND s.hits IS NOT NULL AND s.profit IS NOT NULL AND e->>'hit' IN ('true', 'false', '0', '1', '0.0', '1.0')
                                   AND coalesce(e->>'void', 'false') NOT IN ('true', 'dnp', '1')""", conn, params=(SINCE,))
        except Exception as ex:
            conn.rollback(); print(f"PR|{app}: not readable ({str(ex)[:100]})", flush=True); continue
        lg["under"] = ~lg["side"].str.lower().str[0].isin(["o", "m", "h"])
        j = lg.merge(s[["gd", "player_id", "prop", "line", "under", "rk", "p"]].drop_duplicates(["gd", "player_id", "prop", "line", "under"]), on=["gd", "player_id", "prop", "line", "under"], how="left")
        j["bucket"] = np.where(j["rk"].isna(), "alternate / not on the regular list", np.where(j["rk"] <= 6, "rank 1-6", np.where(j["rk"] <= 20, "rank 7-20", np.where(j["rk"] <= 50, "rank 21-50", "rank 51+"))))
        ref = {u: s[s["under"] == u]["bhit"].mean() for u in (True, False)}
        print(f"\nPR|=== {app}: unique played legs {len(j):,}; board regular legs hit Under {ref[True]:.3f} Over {ref[False]:.3f} ===", flush=True)
        for st, g in j.groupby("status"):
            for (un, b), x in g.groupby(["under", "bucket"]):
                if len(x) >= 8:
                    h = x["hit"].mean(); se = np.sqrt(h * (1 - h) / len(x))
                    print(f"PR|  {st:16s} {'Under' if un else 'Over ':5s} {b:36s} legs {len(x):4d} hit {h:.3f} (+- {se:.3f})", flush=True)
        for (un, b), x in j.groupby(["under", "bucket"]):
            h = x["hit"].mean(); se = np.sqrt(h * (1 - h) / max(1, len(x)))
            print(f"PR|  ALL STATUSES     {'Under' if un else 'Over ':5s} {b:36s} legs {len(x):4d} hit {h:.3f} (+- {se:.3f})", flush=True)
    conn.close(); print("PR|DONE", flush=True)


if __name__ == "__main__":
    main()
