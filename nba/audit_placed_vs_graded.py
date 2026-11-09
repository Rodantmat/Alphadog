#!/usr/bin/env python3
"""
PLACED vs GRADED audit (owner 2026-11-09: a Fliff slip he placed with Bam Adebayo was graded with Derrick White - the Slips screen swaps a leg, the
Save button stores the slip AS SHOWN in nba_score.ui_saved_slips, but the grader reads the originally generated live_* slip).
For every owner slip graded since AUD_FROM: find the saved slip (same date, same app) with the most legs in common and report every difference.
Read-only.
"""
import json, os, re, sys, datetime as dt
import psycopg

FROM = os.environ.get("AUD_FROM", "2026-10-20")
APPKEY = {"pp": "prizepicks", "ud": "underdog", "sleeper": "sleeper", "betr": "betr", "fliff": "fliff"}


def jl(x):
    return x if isinstance(x, list) else json.loads(x)


def norm_name(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower().replace("ć", "c").replace("č", "c").replace("ü", "u").replace("é", "e").replace("ñ", "n"))


def side(s):
    s = (s or "").lower()
    return "O" if s in ("more", "over", "o", "higher") else "U" if s in ("less", "under", "u", "lower") else s


def key(l):
    nm = l.get("player") or l.get("player_name") or ""
    prop = l.get("prop") or l.get("canonical_prop_key") or ""
    sd = l.get("side") or l.get("selected_side")
    ln = l.get("line") if l.get("line") is not None else l.get("line_value")
    try:
        ln = round(float(ln), 2)
    except Exception:  # noqa: BLE001
        ln = None
    return (norm_name(nm), str(prop), side(sd), ln)


def show(k):
    return f"{k[0]} {k[1]} {k[2]}{k[3]}"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    saved = {}
    for d, sk, strat, legs, at in conn.execute("SELECT slate_date, source_key, strategy, legs_json, saved_at FROM nba_score.ui_saved_slips WHERE slate_date >= %s", (FROM,)).fetchall():
        saved.setdefault((str(d), sk), []).append((strat, [key(l) for l in jl(legs)], at))
    live = []
    for d, strat, k, legs in conn.execute("""SELECT game_date, strategy, k, legs_json FROM nba_score.live_slips WHERE game_date >= %s
            AND status IN ('graded','graded_void','graded_week2','graded_post') AND k < 100""", (FROM,)).fetchall():
        live.append(("prizepicks", str(d), strat, k, [key(l) for l in jl(legs)]))
    for tbl, app, stratcol in (("ud_live_slips", "underdog", "composition"), ("sleeper_live_slips", "sleeper", "strategy"), ("betr_live_slips", "betr", "strategy"), ("fliff_live_slips", "fliff", "strategy")):
        for d, strat, k, legs in conn.execute(f"SELECT game_date, {stratcol}, coalesce(k,0), legs_json FROM nba_score.{tbl} WHERE game_date >= %s AND status='live' AND graded_at IS NOT NULL", (FROM,)).fetchall():
            live.append((app, str(d), strat, k, [key(l) for l in jl(legs)]))
    tot = {}; bad = []; nosave = {}
    used = set()
    for app, d, strat, k, lk in sorted(live):
        pool = saved.get((d, app), [])
        t = tot.setdefault(app, [0, 0, 0, 0]);  t[0] += 1
        if not pool:
            t[3] += 1; nosave.setdefault(app, []).append(d); continue
        best = None
        for i, (sstrat, sk, at) in enumerate(pool):
            ov = len(set(lk) & set(sk))
            sc = (ov, -abs(len(sk) - len(lk)), 1 if (sstrat or "").startswith(str(strat or "~~")[:6]) else 0)
            if best is None or sc > best[0]:
                best = (sc, i, sstrat, sk)
        (ov, _a, _b), i, sstrat, sk = best
        if ov == 0:
            t[3] += 1; nosave.setdefault(app, []).append(d + "?"); continue   # no saved slip resembles it: not saved / not placed
        if set(lk) == set(sk):
            t[1] += 1
        else:
            t[2] += 1
            bad.append((d, app, strat, k, "graded-only: " + ", ".join(show(x) for x in lk if x not in sk), "saved-only: " + ", ".join(show(x) for x in sk if x not in lk)))
    for app, (n, ok, diff, ns) in tot.items():
        print(f"PLACED|{app}: {n} graded slips, {ok} identical to the saved slip, {diff} DIFFER, {ns} with no saved slip", flush=True)
    for b in bad:
        print("PLACED|DIFF", *b, flush=True)
    for app, ds in nosave.items():
        print(f"PLACED|no-save {app}: {sorted(set(ds))}", flush=True)


main()
