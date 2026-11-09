#!/usr/bin/env python3
"""Friend (Jonathan) + Jessi pages: is the GRADED slip the slip the page FIRST showed (nba_*.seen)?  Read-only.
FJ|<who> <date> <app> <slip>: seen/graded legs differ | no seen row (never opened -> graded as generated) | skipped (a leg was off/started at first view) | seen leg without _g."""
import json, os, re
import psycopg

LABEL = {"prizepicks": "PrizePicks", "underdog": "Underdog", "sleeper": "Sleeper", "betr": "Betr", "fliff": "Fliff"}


def jl(x):
    for _ in range(3):
        if isinstance(x, str):
            x = json.loads(x)
    return x


def key(l):
    pid = l.get("player_id")
    if pid is None:
        pid = re.sub(r"[^a-z0-9]", "", str(l.get("player") or l.get("player_name") or "").lower())
    ln = l.get("line") if l.get("line") is not None else l.get("line_value")
    return (str(pid), str(l.get("prop") or l.get("canonical_prop_key")), str(l.get("side") or l.get("selected_side")), round(float(ln), 2))


c = psycopg.connect(os.environ["DATABASE_URL"])
for who, sch in (("friend", "nba_friend"), ("jessi", "nba_jessi")):
    seen = {}
    for d, app, nm, lg, sk in c.execute(f"SELECT game_date, app, slip_name, legs, skipped FROM {sch}.seen").fetchall():
        seen[(str(d), nm)] = (jl(lg), sk)
    tot = dict(n=0, same=0, diff=0, noseen=0, skipped=0, nog=0)
    for d, app, code, no, size, legs, st in c.execute(f"SELECT game_date, app, strategy, slip_no, size, legs, status FROM {sch}.slips WHERE game_date >= '2026-11-01' AND status='graded' ORDER BY 1,2,3,4").fetchall():
        d = str(d); legs = jl(legs); tot["n"] += 1
        nm = f"{LABEL.get(app, app)} {size}-pick {no}"
        sv = seen.get((d, nm))
        if not sv:
            tot["noseen"] += 1; print(f"FJ|{who} {d} {app} {nm}: NO SEEN ROW - graded as generated"); continue
        lg, sk = sv
        if sk:
            tot["skipped"] += 1; print(f"FJ|{who} {d} {app} {nm}: skipped at first view (a leg was off/started) - graded as generated"); continue
        if not all(isinstance(x, dict) and x.get("_g") for x in lg):
            tot["nog"] += 1; print(f"FJ|{who} {d} {app} {nm}: seen legs without _g - graded as generated"); continue
        a, b = {key(x["_g"]) for x in lg}, {key(x) for x in legs}
        if a == b:
            tot["same"] += 1
        else:
            tot["diff"] += 1; print(f"FJ|{who} {d} {app} {nm}: DIFF seen-only {sorted(a - b)} graded-only {sorted(b - a)}")
    print(f"FJ|{who} summary: {tot}")
    # slips placed today and the rest of the pipeline: every 'placed' slip needs a seen row once the page was opened
