#!/usr/bin/env python3
"""
GRADING AUDIT, whole 2026-27 season (owner 2026-11-09: "revise all the grading ... legs, DNP, slips, everything").
Re-derives every graded slip's payout from its own stored leg outcomes with the engines' pure payout functions and compares with what
the grader stored (payout / multiplier / profit); lists slips left ungraded; cross-checks the Sleeper payout between the live engine and
the research function the friend / Jessi sets use.  Read-only.  Parts run as sub-processes because the research modules read APP at import.
"""
import json, math, os, subprocess, sys, datetime as dt
import psycopg

PART = os.environ.get("AUD_PART")
FROM = os.environ.get("AUD_FROM", "2026-10-20")
TOL = 0.011


def jl(x):
    return x if isinstance(x, list) else json.loads(x)


def hit_of(v):
    if v is None:
        return None
    if isinstance(v, str):
        return v.lower() in ("true", "1")
    return bool(v)


def report(tag, n, bad, extra=""):
    print(f"AUDIT|{tag}: {n} slips checked, {len(bad)} MISMATCH {extra}", flush=True)
    for b in bad[:40]:
        print("   ", b, flush=True)


def owner():
    sys.path.insert(0, os.path.dirname(__file__))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    today = dt.datetime.now(dt.timezone.utc).date()
    import build_slip_engine as SE
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    # --- PrizePicks
    n, bad = 0, []
    for d, strat, k, st, status, legs, pay, prof, w in conn.execute(
            """SELECT game_date, strategy, k, structure, status, legs_json, payout, profit, coalesce(stake_weight,1) FROM nba_score.live_slips
               WHERE game_date >= %s AND status LIKE 'graded%%' AND payout IS NOT NULL""", (FROM,)).fetchall():
        legs = jl(legs)
        sl = [{"hit": hit_of(l.get("hit")), "factor": float(l.get("factor") or 1.0), "event_id": l.get("event_id")} for l in legs]
        try:
            _h, m = SE.grade(sl, st)
        except Exception as e:  # noqa: BLE001
            bad.append((d, strat, k, "ERR", str(e)[:80])); continue
        n += 1
        if abs(float(m) - float(pay)) > TOL or abs(float(prof) - (float(pay) - 1)) > TOL:
            bad.append((str(d), strat, k, st, status, "stored", float(pay), "recomputed", round(float(m), 3), "profit", float(prof)))
    report("PP owner", n, bad)
    # --- Underdog
    import ud_live_slip_engine as UDL
    n, bad = 0, []
    for d, pf, comp, size, st, k, legs, stake, pay, prof in conn.execute(
            """SELECT game_date, portfolio, composition, size, structure, k, legs_json, stake, payout, profit FROM nba_score.ud_live_slips
               WHERE game_date >= %s AND graded_at IS NOT NULL""", (FROM,)).fetchall():
        rem = [{"hit": hit_of(l.get("hit")), "factor": l["factor"]} for l in jl(legs) if hit_of(l.get("hit")) is not None]
        p = UDL.payout(st, rem)
        n += 1
        exp_prof = 0.0 if p is None else float(stake) * (p - 1)
        stored_pay = None if pay is None else float(pay)
        if (p is None) != (stored_pay is None) or (p is not None and abs(p - stored_pay) > TOL) or abs(exp_prof - float(prof)) > TOL:
            bad.append((str(d), pf, comp, size, st, k, "stored", stored_pay, "recomputed", p, "profit", float(prof)))
    report("UD owner", n, bad)
    # --- Sleeper
    import sleeper_live_slip_engine as SL
    pr = SL.pricing(conn)
    n, bad = 0, []
    for d, name, k, st, legs, stake, pay, prof in conn.execute(
            """SELECT game_date, strategy, k, structure, legs_json, stake, payout, profit FROM nba_score.sleeper_live_slips
               WHERE game_date >= %s AND graded_at IS NOT NULL""", (FROM,)).fetchall():
        lg = jl(legs)
        for l in lg:
            l["hit"] = hit_of(l.get("hit"))
        p = SL.payout(lg, st, pr)
        n += 1
        if abs(p - float(pay)) > TOL or abs(float(stake) * (p - 1) - float(prof)) > TOL:
            bad.append((str(d), name, k, st, "stored", float(pay), "recomputed", round(p, 3), "profit", float(prof)))
    report("Sleeper owner", n, bad)
    # --- Betr
    import betr_live_slip_engine as BL
    rj = BL.rules(conn)
    n, bad = 0, []
    for d, name, k, st, legs, stake, pay, prof in conn.execute(
            """SELECT game_date, strategy, k, structure, legs_json, stake, payout, profit FROM nba_score.betr_live_slips
               WHERE game_date >= %s AND graded_at IS NOT NULL""", (FROM,)).fetchall():
        lg = jl(legs)
        for l in lg:
            l["hit"] = hit_of(l.get("hit"))
        p = BL.payout(lg, rj, st if st == "perfect" else "dynamic")
        n += 1
        if abs(p - float(pay)) > TOL or abs(float(stake) * (p - 1) - float(prof)) > TOL:
            bad.append((str(d), name, k, st, "stored", float(pay), "recomputed", round(p, 3), "profit", float(prof)))
    report("Betr owner", n, bad)
    # --- Fliff
    n, bad = 0, []
    for d, name, legs, stake, pay, prof in conn.execute(
            """SELECT game_date, strategy, legs_json, stake, payout, profit FROM nba_score.fliff_live_slips
               WHERE game_date >= %s AND graded_at IS NOT NULL""", (FROM,)).fetchall():
        live = [l for l in jl(legs) if hit_of(l.get("hit")) is not None]
        if len(live) < 2:
            p = 1.0
        elif all(hit_of(l["hit"]) for l in live):
            p = math.floor(math.prod(float(l["factor"]) for l in live) * 100 + 1e-6) / 100
        else:
            p = 0.0
        n += 1
        if abs(p - float(pay)) > TOL or abs(float(stake) * (p - 1) - float(prof)) > TOL:
            bad.append((str(d), name, "stored", float(pay), "recomputed", p, "profit", float(prof)))
    report("Fliff owner", n, bad)
    # --- ungraded leftovers
    for tbl, col in (("live_slips", "status LIKE 'graded%%'"), ("ud_live_slips", "graded_at IS NOT NULL"), ("sleeper_live_slips", "graded_at IS NOT NULL"),
                     ("betr_live_slips", "graded_at IS NOT NULL"), ("fliff_live_slips", "graded_at IS NOT NULL")):
        r = conn.execute(f"SELECT game_date, count(*) FROM nba_score.{tbl} WHERE game_date >= %s AND game_date < %s AND NOT ({col}) GROUP BY 1 ORDER BY 1", (FROM, today)).fetchall()
        print(f"AUDIT|ungraded {tbl}: {[(str(a), b) for a, b in r]}", flush=True)
    for sch in ("nba_friend", "nba_jessi"):
        r = conn.execute(f"SELECT game_date, status, count(*) FROM {sch}.slips WHERE game_date >= %s AND status NOT IN ('graded') GROUP BY 1,2 ORDER BY 1", (FROM,)).fetchall()
        print(f"AUDIT|{sch} not graded: {[(str(a), b, c) for a, b, c in r]}", flush=True)
    # --- Sleeper payout: live engine vs the research function the friend / Jessi sets use
    try:
        os.environ["AA_APP"] = "sleeper"
        import research_app_allegs as AA
        diff, tot = [], 0
        for d, name, k, st, legs in conn.execute("SELECT game_date, strategy, k, structure, legs_json FROM nba_score.sleeper_live_slips WHERE game_date >= %s AND graded_at IS NOT NULL", (FROM,)).fetchall():
            lg = jl(legs)
            for l in lg:
                l["hit"] = hit_of(l.get("hit"))
            a = SL.payout(lg, st, pr)
            lg2 = [dict(l, m=float(l["factor"]), hit=(None if l["hit"] is None else int(l["hit"]))) for l in lg]
            b = AA.pay(lg2, st)
            tot += 1
            if abs(a - b) > 0.02:
                diff.append((str(d), name, k, st, "live engine", round(a, 3), "friend/jessi function", round(b, 3)))
        print(f"AUDIT|Sleeper payout live-engine vs friend-function on {tot} owner slips: {len(diff)} differ", flush=True)
        for x in diff[:15]:
            print("   ", x, flush=True)
    except Exception as e:  # noqa: BLE001
        print("AUDIT|sleeper cross-check failed", repr(e)[:200], flush=True)


def friend_set():
    app = PART  # pp | ud | sleeper | fliff | betr
    os.environ["FR_APP"] = app.upper()
    import friend_engine as F
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    for sch in ("nba_friend", "nba_jessi"):
        n, bad = 0, []
        key = {"pp": "prizepicks", "ud": "underdog", "sleeper": "sleeper", "fliff": "fliff", "betr": "betr"}[app]
        if F.FAPP == "PP":
            F.PC.SE.flex_alt_tiers(); F.PC.SE.payout_v3_rules()
        for d, no, st, size, legs, mult, prof, status in conn.execute(
                f"SELECT game_date, slip_no, structure, size, legs, multiplier, profit, status FROM {sch}.slips WHERE app=%s AND game_date >= %s AND status='graded'", (key, FROM)).fetchall():
            lg = jl(legs)
            for l in lg:
                h = l.get("hit")
                l["hit"] = None if h is None else int(h)
            try:
                m = float(F.pay_of(lg, st))
            except Exception as e:  # noqa: BLE001
                bad.append((str(d), no, "ERR", str(e)[:80])); continue
            n += 1
            if mult is None or abs(m - float(mult)) > TOL or abs(float(prof) - (float(mult) - 1)) > TOL:
                bad.append((str(d), no, st, size, "stored", None if mult is None else float(mult), "recomputed", round(m, 3), "profit", None if prof is None else float(prof)))
        report(f"{sch} {key}", n, bad)


if PART == "owner":
    owner()
elif PART in ("pp", "ud", "sleeper", "fliff", "betr"):
    friend_set()
else:
    here = os.path.abspath(__file__)
    for p in ("owner", "pp", "ud", "sleeper", "fliff", "betr"):
        env = dict(os.environ, AUD_PART=p)
        r = subprocess.run([sys.executable, here], env=env, capture_output=True, text=True)
        print(r.stdout, flush=True)
        if r.returncode:
            print(f"AUDIT|part {p} failed:", (r.stderr or "")[-600:], flush=True)
