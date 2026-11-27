"""Betr's final set on the numbers the live pipeline really produces: the PrizePicks / Underdog lists stored by the production-number replays (fl_ranked), the Betr board of the day,
the strategies built exactly as the live engine builds them, graded on the box scores with Betr's payout rules. Printed as BP| lines."""
import os, sys, json
from collections import defaultdict
import psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["FL_APP"] = "betr"; os.environ["FL_NOSTART"] = "1"
import final_betr as FB
import final_live as FL
import research_fl_picture as PIC

COLS = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov"}


def log(s):
    print("BP|" + s, flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key = 'betr_payout_v1'").fetchone()[0]
    BR = BR if isinstance(BR, dict) else json.loads(BR)
    dates = sorted(r[0] for r in conn.execute("SELECT DISTINCT game_date::text FROM nba_score.fl_ranked WHERE app = 'underdog'").fetchall())
    dates = [d for d in dates if d < "2026-11-26" and conn.execute("SELECT 1 FROM nba_score.fl_ranked WHERE app = 'prizepicks' AND game_date = %s LIMIT 1", (d,)).fetchone()]
    log(f"slates with both lists stored: {len(dates)}: {','.join(dates)}")
    by = defaultdict(list); void = push = tot = 0; ref = defaultdict(list)
    sgs = [s for s in FL.FINAL["set"] if s["app"] == "betr"]
    rdays = {sg["code"]: PIC.ref(conn, sg) for sg in sgs}
    for gd in dates:
        stt = {r[0]: dict(zip(COLS.values(), r[1:])) for r in conn.execute("SELECT nba_player_id::text, pts::float8, reb::float8, ast::float8, fg3m::float8, stl::float8, blk::float8, tov::float8 FROM nba_stats.player_game_log WHERE game_date = %s AND min > 0", (gd,)).fetchall()}
        plan, notes = FB.build(conn, gd)
        for n in notes:
            log("   " + n)
        for name, k, st, rows, bank, sg in plan:
            hits = []; ok = True
            for r in rows:
                s = (stt.get(str(r["pid"])) or {}).get(COLS[r["prop"]])
                if s is None:
                    ok = False; break
                if s == r["line"]:
                    push += 1
                hits.append(1 if s < r["line"] else 0)
            tot += 1
            if not ok:
                void += 1; continue
            h = sum(hits)
            pay = float(BR["perfect_all_less"].get(str(k), 0.0)) if (st == "power" and h == k) else (float((BR["dynamic_all_less"].get(str(k)) or {}).get(str(h), 0.0)) if st != "power" else 0.0)
            by[gd].append(pay - 1)
    log(f"slips built {tot}, with a player who did not play (left out) {void}, pushes counted as misses {push}")
    PIC.table("betr prod", by)
    ds = set(by)
    rb = PIC.merge_set([{g: v for g, v in rdays[sg['code']].items() if g in ds} for sg in sgs if rdays[sg['code']]], FL.SLOTS["betr"], FL.CAPS["betr"])
    PIC.table("betr res", rb)
    log("done")


if __name__ == "__main__":
    main()
