#!/usr/bin/env python3
"""
PROBE - RE-CERTIFY BETR'S SLIP PRICES TODAY FROM BETR ITSELF, WITHOUT A BROWSER (2026-10-26; owner 17:09 PT: "you have the proper
multipliers and slip structures and final slip multipliers figured out?"). READ-ONLY: only Betr's own pricing QUERY
ValidateEntryWithRules is sent (no CreateEntry / mutation, nothing placed), with the owner's own session token sent raw, exactly as the
board capture does (betr_board_direct.py). Re-checks the 2026-10-18/19 tables stored in pp_slip_rules['betr_payout_v1'] on today's
board: REGULAR picks only, one pick per game, different teams -
  all-MORE 2..6, all-LESS 2..6, one MORE + the rest LESS 2..6 (should restore the full table), a same-game pair (2 picks) -
and prints Betr's Perfect and Dynamic multipliers next to the stored table, MATCH or DIFF per structure. Answers are also kept in
nba_market.betr_quote (run_file 'probe_betr_quote_direct <run id>'). Env: DATABASE_URL, PROXY_URL.
"""
import json
import os
import sys
import time

os.environ.setdefault("BETR_LEAGUE", "NBA")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_board_direct as D  # noqa: E402
import betr_harvest_cloud as H  # noqa: E402
import probe_betr_quote as Q  # noqa: E402  (picks_from_board / QUERY / store / DEFAULT_RULES; its browser code is not used)
import psycopg  # noqa: E402
from curl_cffi import requests  # noqa: E402

os.environ["BQ_RUN"] = f"probe_betr_quote_direct {os.environ.get('GITHUB_RUN_ID', 'local')}"


def table():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        return c.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]


def ask(tok, picks):
    entry = {"amount": Q.AMOUNT, "appliedPromotionIds": [], "currency": "USD", "picks": [p["pick"] for p in picks]}
    body = json.dumps({"operationName": "ValidateEntryWithRules", "query": Q.QUERY,
                       "variables": {"rulesIds": Q.DEFAULT_RULES, "entry": entry}})
    r = requests.post(D.GQL, headers=dict(D.HDR, authorization=tok), data=body, timeout=45, impersonate="chrome124")
    try:
        return r.status_code, r.json()
    except Exception:  # noqa: BLE001
        return r.status_code, None


def main():
    st, _src = H.load_session_state()
    st, note = H.renew_session_state(st)
    print(note, flush=True)
    tok = D.access_token(st)
    code, body, route = D.query(tok)
    if code != 200 or not body:
        print(f"NO BOARD: HTTP {code}"); sys.exit(1)
    # only games that have NOT started (picks on a live game come back INVALID_PROJECTION - run 40424706918)
    from datetime import datetime, timedelta, timezone
    soon = datetime.now(timezone.utc) + timedelta(minutes=8)
    evs = [e for e in H.board_events(body)[0] if e.get("date") and datetime.fromisoformat(str(e["date"]).replace("Z", "+00:00")) > soon]
    allp = [p for p in Q.picks_from_board(evs) if p["tier"] == "REGULAR"]
    # one MORE and one LESS candidate per (event, team, player) on the main stats, earliest events first
    by_event = {}
    for p in allp:
        if str(p["key"]).upper() in ("POINTS", "REBOUNDS", "ASSISTS"):
            by_event.setdefault(p["event"], []).append(p)
    events = list(by_event)
    print(f"board: {len(allp)} REGULAR pick options on {len(events)} events", flush=True)
    t = table()
    PR, PL, DR, DL = t["perfect_regular"], t["perfect_all_less"], t["dynamic_regular"], t["dynamic_all_less"]

    def first(ev, outcome, used_players, used_teams=None):
        for p in by_event[ev]:
            if p["outcome"] == outcome and p["player"] not in used_players and (used_teams is None or p["team"] not in used_teams):
                return p
        return None

    def build(n, outcomes):
        picks, players = [], set()
        for ev, oc in zip(events, outcomes):
            p = first(ev, oc, players)
            if p is None:
                return None
            picks.append(p); players.add(p["player"])
        return picks if len(picks) == n else None

    def run(tag, picks, exp_perfect, exp_dyn):
        if not picks:
            print(f"{tag}: not enough picks on the board"); return
        code, j = ask(tok, picks)
        res = ((j or {}).get("data") or {}).get("validateEntryOnEntryRules") or []
        perf = next((x.get("perfectRegularMultiplier") for x in res if x.get("perfectRegularMultiplier")), None)
        dyn = next((x.get("dynamicMultipliers") for x in res if x.get("dynamicMultipliers")), None) or []
        dyn_map = {str(d["winningPicks"]): d["multiplier"] for d in dyn if int(d.get("numberOfPicks") or 0) == len(picks)}
        status = sorted({str(x.get("gameMode")) + ":" + str(x.get("status")) for x in res})
        errs = [e.get("message") for x in res for e in (x.get("errors") or [])][:2]
        for x in res:
            Q.store(tag, picks, x)
        ok_p = perf is not None and abs(float(perf) - float(exp_perfect)) < 1e-6
        ok_d = (not exp_dyn) or all(abs(float(dyn_map.get(k, -1)) - float(v)) < 1e-6 for k, v in exp_dyn.items())
        print(f"{tag:<26} HTTP {code}  Perfect {perf} (table {exp_perfect}) {'MATCH' if ok_p else 'DIFF'} | Dynamic {dyn_map} "
              f"(table {exp_dyn}) {'MATCH' if ok_d else 'DIFF'} | {status}{'  errors: ' + str(errs) if errs else ''}", flush=True)
        time.sleep(0.6)

    for n in range(2, 7):
        run(f"{n} picks all MORE", build(n, ["MORE"] * n), PR[str(n)], DR.get(str(n)) if n >= 2 else None)
        run(f"{n} picks all LESS", build(n, ["LESS"] * n), PL[str(n)], DL.get(str(n)))
        run(f"{n} picks 1 MORE + LESS", build(n, ["MORE"] + ["LESS"] * (n - 1)), PR[str(n)], DR.get(str(n)))
    # SAME-GAME pairs (first run showed 2.8x on a same-game pair - re-checked here on games not yet started)
    for ev in events[:3]:
        a = first(ev, "MORE", set())
        if not a:
            continue
        opp_m = first(ev, "MORE", {a["player"]}, {a["team"]})
        opp_l = first(ev, "LESS", {a["player"]}, {a["team"]})
        mate = next((p for p in by_event[ev] if p["team"] == a["team"] and p["player"] != a["player"] and p["outcome"] == "MORE"), None)
        run(f"SG opp teams MORE+MORE", [a, opp_m] if opp_m else None, PR["2"], DR.get("2"))
        run(f"SG opp teams MORE+LESS", [a, opp_l] if opp_l else None, PR["2"], DR.get("2"))
        run(f"SG same team MORE+MORE", [a, mate] if mate else None, PR["2"], DR.get("2"))
        other = first(events[-1], "MORE", {a["player"]}) if events[-1] != ev else None
        run(f"SG pair + 1 other game (3)", [a, opp_m, other] if opp_m and other else None, PR["3"], DR.get("3"))


if __name__ == "__main__":
    main()
