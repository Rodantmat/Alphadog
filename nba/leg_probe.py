#!/usr/bin/env python3
"""
SCOPED LEG-DRIFT PROBE (owner 2026-11-04: "do not use the same function that mines the whole board ... a scoped function that runs
all the boards at the same time ... only the legs on the slips and the backup pool, just a differential").

Reads the legs of the newest slips snapshot (generated slips + backup pool), fetches ONLY the boards those legs live on
(PrizePicks: one GET, Betr: one GraphQL query; run in parallel threads), compares leg by leg and writes the verdict to
nba_market.leg_probe (one row per distinct leg, replaced each cycle). No quotes, no Chrome, no board archive, no payout map.
status: standard | goblin | demon | moved | missing   (PrizePicks)      present | moved | missing   (Betr)
Env: DATABASE_URL, PROXY_URL, BETR_SESSION_STATE, BETR_CLIENT_ID, PROBE_CYCLES (1), PROBE_INTERVAL (seconds between cycle starts, 60)
"""
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import psycopg
from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_board_direct as B  # noqa: E402
import betr_harvest_cloud as H  # noqa: E402
import pp_payout_map as PP  # noqa: E402

DB = os.environ["DATABASE_URL"]
CYCLES = int(os.getenv("PROBE_CYCLES", "1"))
INTERVAL = int(os.getenv("PROBE_INTERVAL", "60"))
PPURL = PP.BOARD_URLS[0]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def targets(con):
    row = con.execute("SELECT (payload#>>'{}')::jsonb, slate_date FROM nba_score.ui_slips_snapshot ORDER BY built_at DESC LIMIT 1").fetchone()
    if not row:
        return [], None
    j, sd = row
    legs, seen = [], set()
    for s in j.get("generated_slips") or []:
        for l in s.get("legs") or []:
            legs.append(l)
    legs += j.get("backup_pool") or []
    out = []
    for l in legs:
        sk = l.get("source_key")
        if sk not in ("prizepicks", "betr"):
            continue
        k = (sk, l.get("player_name"), l.get("canonical_prop_key"), float(l.get("line_value")), l.get("selected_side"))
        if k in seen:
            continue
        seen.add(k)
        pid = ((l.get("link") or {}).get("ids") or {}).get("projection_id")
        out.append({"src": sk, "player": l.get("player_name"), "prop": l.get("canonical_prop_key"), "line": float(l.get("line_value")),
                    "side": str(l.get("selected_side") or "").lower(), "pid": str(pid) if pid else None})
    return out, sd


def pp_fetch():
    t = time.time()
    px = PP.proxies()
    for route, p in (("proxy", px), ("direct", None)):
        if route == "proxy" and not p:
            continue
        try:
            r = requests.get(PPURL, headers=PP.BOARD_HEADERS, impersonate="chrome124", proxies=p, timeout=25)
            if r.status_code == 200 and (r.json() or {}).get("data"):
                return PP.parse_board(r.json()), time.time() - t, route
        except Exception as e:  # noqa: BLE001
            print(f"  pp {route}: {type(e).__name__}", flush=True)
    return None, time.time() - t, "none"


def betr_fetch(tok):
    t = time.time()
    code, body, route = B.query(tok)
    if body is None:
        return None, time.time() - t, route
    legs, _n = H.flatten(body)
    return legs, time.time() - t, route


def pp_check(tg, rows):
    by_id = {r["id"]: r for r in rows}
    by_pl = {}
    for r in rows:
        by_pl.setdefault((norm(r["name"]), PPMAP.get(r["stat"])), []).append(r)
    for t in tg:
        r = by_id.get(t["pid"]) if t["pid"] else None
        if r is None:
            cand = by_pl.get((norm(t["player"]), t["prop"]), [])
            hit = [c for c in cand if abs(c["line"] - t["line"]) < 1e-9]
            r = next((c for c in hit if c["odds"] == "standard"), hit[0] if hit else None)
            if r is None:
                t["status"], t["detail"] = ("moved", "now " + "/".join(f"{c['line']:g}{'' if c['odds']=='standard' else ' '+c['odds']}" for c in cand)) if cand else ("missing", "")
                continue
        if abs(r["line"] - t["line"]) > 1e-9:
            t["status"], t["detail"] = "moved", f"now {r['line']:g} {r['odds']}"
        else:
            t["status"], t["detail"] = (r["odds"] if r["odds"] in ("goblin", "demon") else "standard"), ""


def betr_check(tg, legs, con):
    ids = con.execute("SELECT pn, market_key, side, line::float, ids FROM nba_market.app_link_ids WHERE bookmaker ILIKE 'betr%%'").fetchall()
    idx = {}
    for pn, mk, side, line, i in ids:
        idx.setdefault((pn, str(side).lower()), []).append((mk, line, i))
    board = {}
    for l in legs:
        board.setdefault((str(l["player_id"]), str(l["stat"])), []).append(l)
    for t in tg:
        side = "over" if t["side"] in ("more", "over", "o") else "under"
        cands = [c for c in idx.get((norm(t["player"]), side), []) if abs(c[1] - t["line"]) < 1e-9 and (t["prop"] or "") in c[0]]
        if not cands:
            cands = [c for c in idx.get((norm(t["player"]), side), []) if abs(c[1] - t["line"]) < 1e-9]
        st, det = "missing", "no link row"
        for mk, line, i in cands:
            bl = board.get((str(i.get("player_id")), str(i.get("stat"))), [])
            if not bl:
                continue
            ok = [b for b in bl if abs(float(b["line"]) - t["line"]) < 1e-9]
            if ok:
                has = any((b.get("over") if side == "over" else b.get("under")) or b.get("alt") and side == "over" for b in ok)
                st, det = ("present", "") if has else ("missing", "side not offered (more only)" if side == "under" else "side not offered")
                break
            st, det = "moved", "now " + "/".join(f"{float(b['line']):g}" for b in bl)
        t["status"], t["detail"] = st, det


PPMAP = {}
PP_STAT_PROP = {"Points": "points", "Rebounds": "rebounds", "Assists": "assists", "3-PT Made": "threes_made", "Blocked Shots": "blocks", "Steals": "steals",
                "Turnovers": "turnovers", "Blks+Stls": "stocks", "Pts+Rebs+Asts": "pra", "Pts+Rebs": "pts_reb", "Pts+Asts": "pts_ast", "Rebs+Asts": "reb_ast",
                "Personal Fouls": "personal_fouls", "Fantasy Score": "fantasy_score", "Double-Double": "double_double", "FG Made": "fgm", "FG Attempted": "fga",
                "Free Throws Made": "ftm", "Free Throws Attempted": "fta", "3-PT Attempted": "fg3a", "Offensive Rebounds": "oreb", "Defensive Rebounds": "dreb"}


def main():
    global PPMAP
    con = psycopg.connect(DB, autocommit=True)
    PPMAP = dict(PP_STAT_PROP)
    con.execute("""CREATE TABLE IF NOT EXISTS nba_market.leg_probe (src text, player text, prop text, line numeric, side text, status text, detail text,
                   probed_at timestamptz, cycle_ms int, fetch_ms jsonb, PRIMARY KEY (src, player, prop, line, side))""")
    st, _ = H.load_session_state()
    st, note = H.renew_session_state(st)
    tok = B.access_token(st)
    for c in range(CYCLES):
        t0 = time.time()
        tg, sd = targets(con)
        t1 = time.time()
        with ThreadPoolExecutor(2) as ex:
            fp = ex.submit(pp_fetch)
            fb = ex.submit(betr_fetch, tok) if tok else None
            ppr, ppt, pproute = fp.result()
            btr, btt, btroute = fb.result() if fb else (None, 0, "no token")
        pt = [t for t in tg if t["src"] == "prizepicks"]
        bt = [t for t in tg if t["src"] == "betr"]
        if ppr is not None:
            pp_check(pt, ppr)
        if btr is not None:
            betr_check(bt, btr, con)
        done = [t for t in pt + bt if t.get("status")]
        ms = int((time.time() - t0) * 1000)
        fm = json.dumps({"targets_ms": int((t1 - t0) * 1000), "pp_ms": int(ppt * 1000), "pp_route": pproute, "betr_ms": int(btt * 1000), "betr_route": btroute})
        with con.transaction():
            for t in done:
                con.execute("""INSERT INTO nba_market.leg_probe VALUES (%s,%s,%s,%s,%s,%s,%s,now(),%s,%s::jsonb)
                               ON CONFLICT (src,player,prop,line,side) DO UPDATE SET status=EXCLUDED.status, detail=EXCLUDED.detail,
                               probed_at=now(), cycle_ms=EXCLUDED.cycle_ms, fetch_ms=EXCLUDED.fetch_ms""",
                            (t["src"], t["player"], t["prop"], t["line"], t["side"], t["status"], t["detail"], ms, fm))
        bad = [t for t in done if t["status"] not in ("standard", "present")]
        print(f"CYCLE {c + 1}: {ms} ms total | legs {len(tg)} (pp {len(pt)}, betr {len(bt)}) | {fm} | drifted {len(bad)}", flush=True)
        for t in bad:
            print(f"  DRIFT {t['src']} {t['player']} {t['prop']} {t['line']:g} {t['side']}: {t['status']} {t['detail']}", flush=True)
        if c + 1 < CYCLES:
            time.sleep(max(0, INTERVAL - (time.time() - t0)))


def _has_col(con):
    try:
        con.execute("SELECT canonical_prop_key FROM nba_market.pp_mined_leg LIMIT 0")
        return True
    except Exception:  # noqa: BLE001
        return False


if __name__ == "__main__":
    main()
