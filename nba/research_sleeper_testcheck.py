#!/usr/bin/env python3
"""
SLEEPER TEST SLIPS - RE-PRICE (2026-11-18): for the test slips of research_sleeper_testlinks.py (sleeper_testlinks_1118.json: legs + the line ids at build time) reads
Sleeper's public board again and says, per leg, whether its line id is still on the board (Sleeper re-issues the id whenever the multiplier moves, so the same id = the same
multiplier) or what the same player / stat / side shows now; then prints the share model's tiers and the plain product at the multipliers now. No login, read-only.
"""
import itertools
import json
import math
import os
import urllib.request

UA = {"user-agent": "Mozilla/5.0", "accept": "application/json", "referer": "https://sleeper.com/"}
SH = {3: (1.0011, 0.3341, 0.0), 4: (1.0801, 0.2698, 0.0), 5: (1.1461, 0.3266, 0.0723), 6: (1.1969, 0.1995, 0.0402)}


def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read())


def es(u, k):
    return sum(math.prod(c) for c in itertools.combinations(u, k))


def tiers(m):
    n = len(m)
    E, a, b = SH[n]
    pall = 1 / math.prod(m)
    u = [1 - 1 / x for x in m]
    d = [x - 1 for x in m]
    e1, e2 = sum(u), es(u, 2)
    s2 = b * e2
    s1 = a * e1 - 2 * b * e2
    s0 = E - s1 - s2
    return s0 / pall, s1 / (pall * sum(d)), (s2 / (pall * es(d, 2)) if b else None)


def main():
    slips = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.getenv("TC_FILE") or "sleeper_testlinks_1118.json")))
    doc = get("https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true")
    pl = get("https://api.sleeper.app/v1/players/nba")
    byid, bykey = {}, {}
    for ln in doc:
        if ln.get("sport") != "nba":
            continue
        p = pl.get(str(ln.get("subject_id"))) or {}
        name = p.get("full_name") or (str(p.get("first_name") or "") + " " + str(p.get("last_name") or "")).strip()
        for o in ln.get("options") or []:
            try:
                m = float(o.get("payout_multiplier"))
            except (TypeError, ValueError):
                continue
            rec = (m, o.get("outcome_value"), ln.get("game_id"))
            byid[str(o.get("line_id"))] = rec
            bykey.setdefault((name, ln.get("wager_type"), o.get("outcome")), []).append(rec)
    for tag in sorted(slips):
        s = slips[tag]
        now, notes, ok = [], [], True
        for (name, prop, side, line, m0), lid in zip(s["legs"], s["ids"]):
            if lid in byid:
                now.append(byid[lid][0]); notes.append(f"{name} {prop} {side} {line}: same id, x{m0}")
            else:
                c = bykey.get((name, prop, side)) or []
                same = [r for r in c if str(r[1]) == str(line)]
                r = (same or c or [None])[0]
                if r is None:
                    ok = False; notes.append(f"{name} {prop} {side} {line}: OFF THE BOARD (was x{m0})"); now.append(None)
                else:
                    now.append(r[0]); notes.append(f"{name} {prop} {side}: was {line} x{m0} -> NOW {r[1]} x{r[0]}" + (f" (other lines now: {[(x[1], x[0]) for x in c if x is not r][:3]})" if len(c) > 1 else ""))
        for nt in notes:
            print(f"TC|{tag}   {nt}")
        live = [x for x in now if x]
        if len(live) >= 3:
            t0, t1, t2 = tiers(live)
            print(f"TC|{tag}   {'ALL LEGS LIVE' if ok else 'WITHOUT THE PULLED LEG(S)'} -> {len(live)}-pick at the multipliers now: Flex {t0:.2f} / {t1:.2f}" + (f" / {t2:.2f}" if t2 else "") + f" | plain product {math.prod(live):.3f}")


if __name__ == "__main__":
    main()
