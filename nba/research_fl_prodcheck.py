"""Production-number replay of a candidate set (FL_SET_PATH) for ONE app (FL_APP), dates FL_DATES, FL_PH=prod: rebuild every strategy from the live pipeline's legs and models, merge the app's
day with the set's player cap / game cap / slots, grade on the box scores, and compare with the research's own day for the same strategies. Prefix PC|."""
import os, sys, json
from collections import defaultdict
import numpy as np, psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import final_live as FL
APP = FL.APP
def log(s): print("PC|" + s, flush=True)
def merge(per_codes, codes_order, pcap, gcap, slots, gid_of):
    cnt = defaultdict(int); gc = defaultdict(int); out = []
    for c in codes_order:
        for j, sl in enumerate(per_codes.get(c, [])):
            if len(out) >= slots: return out
            pl = [x["p"] for x in sl["legs"]]
            if any(cnt[p] >= pcap for p in pl): continue
            gs = [x["g"] for x in sl["legs"]]
            if gcap < 99 and any(gc[z] + gs.count(z) > gcap for z in set(gs)): continue
            for p in pl: cnt[p] += 1
            for z in gs: gc[z] += 1
            out.append(sl)
    return out
def main():
    dates = [d for d in (os.environ.get("FL_DATES") or "").split(",") if d]; mode = os.environ.get("FL_PH") or "prod"
    pcap = FL.CAPS[APP]; gcap = FL.FINAL.get("gcaps", {}).get(APP, 99); slots = FL.SLOTS[APP]; order = [s["code"] for s in FL.SET]
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        conn.execute("SET statement_timeout = 0")
        GM = {}
        for g, p, q, gid in conn.execute("SELECT game_date::text, player_id, nba_player_id::text, game_id FROM nba_stats.player_game_log WHERE game_id IS NOT NULL AND game_date >= '2026-10-01'").fetchall():
            GM[(g, p)] = gid; GM[(g, q)] = gid
        ref = {sg["code"]: FL.ref_days(conn, sg) for sg in FL.SET}
        slp = None
        if APP == "sleeper":
            import sleeper_live_slip_engine as SL
            slp = SL.pricing(conn)
        T = defaultdict(float)
        for gd in dates:
            try: d = FL.frame_for(conn, gd, mode)
            except Exception as e: log(f"{APP} {gd}: frame error {e}"); continue
            if d is None or not len(d): log(f"{APP} {gd}: no live legs"); continue
            per = {}
            for sg in FL.SET:
                sl = FL.materialize(d, sg); out = []
                for s in sl:
                    rows = [d.loc[i].to_dict() for i in s]
                    out.append(dict(rows=rows, st=sg["st"], k=sg["k"], legs=[dict(p=str(r["player_id"]), g=str(r.get("gid"))) for r in rows]))
                per[sg["code"]] = out
            mine = merge(per, order, pcap, gcap, slots, None)
            gu = []; ng = 0
            for sl in mine:
                v = FL.grade(sl["rows"], sl["st"], sl["k"], slp)
                if v is None: ng += 1
                else: gu.append(v)
            rper = {}
            for sg in FL.SET:
                rd = ref.get(sg["code"]) or {}
                rper[sg["code"]] = [dict(p=p, legs=[dict(p=str(x), g=str(GM.get((gd, str(x)), ("u", x)))) for x in legs]) for p, legs in rd.get(gd, [])]
            rm = merge(rper, order, pcap, gcap, slots, None)
            ru = sum(x["p"] for x in rm)
            log(f"{APP} {gd}: prod slips {len(mine)} graded {len(gu)} units {sum(gu):+.2f} | research slips {len(rm)} units {ru:+.2f}")
            T["pn"] += len(gu); T["pu"] += sum(gu); T["rn"] += len(rm); T["ru"] += ru; T["ng"] += ng; T["days"] += 1
            if sum(gu) < 0: T["plose"] += 1
            if ru < 0: T["rlose"] += 1
        log(f"{APP} TOTAL days {int(T['days'])}: prod slips {int(T['pn'])} units {T['pu']:+.1f} roi {100*T['pu']/max(1,T['pn']):+.0f}% losing days {int(T['plose'])} (ungraded {int(T['ng'])}) | research slips {int(T['rn'])} units {T['ru']:+.1f} roi {100*T['ru']/max(1,T['rn']):+.0f}% losing days {int(T['rlose'])}")
main()
