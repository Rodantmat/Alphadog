#!/usr/bin/env python3
"""AUDIT (2026-11-02, owner 10:39 PT - Underdog portfolio C). READ-ONLY.
PART 1 PARITY: on every slate of this season, the live engine's legs (ud_live_slip_engine.load_legs -> ud_portfolio_t.raw_legs ->
ud_portfolio_c.calibrate) and the research's legs (research_app_final_strategies.load_ud, the research_ud_switch path) must give the
SAME portfolio C slips. The research drops legs whose player did not play (it needs a result); a slip that differs only because of such
a leg is set aside and shown (look-ahead the live engine cannot have).
PART 2 DRY RUN: today's live pick with portfolio C forced (UDL_PORTFOLIO=C, UDL_FORCE=1, UDL_DRY=1) - built, printed, ROLLED BACK;
nba_score.ud_live_slips row count must be unchanged. Env: DATABASE_URL, AU_DAY (default today PT)."""
import datetime as dt
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
import research_app_final_strategies as AF           # noqa: E402
import ud_live_slip_engine as UDL                    # noqa: E402
import ud_portfolio_c as C                           # noqa: E402
import ud_portfolio_t as UPT                         # noqa: E402


def key(s):
    return tuple((l["player"], l["prop"], l["side"], float(l["line"])) for l in s)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    days = [d for d in AF.slate_days(conn) if AF.season_of(d) == "2026-27"]
    today = dt.datetime.now(UDL.PT).date()
    days = [d for d in days if d < today]
    ok = aside = bad = 0
    for d in days:
        fair = C.consensus(conn, d)
        eng = C.portfolio(C.calibrate([dict(l) for l in UPT.raw_legs(UDL.load_legs(conn, d))], fair))
        st = AF.box(conn, d)
        rl, _ = AF.load_ud(conn, d, st)
        rl.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"]))
        res_all = C.portfolio(C.calibrate([dict(l) for l in rl], fair))
        res_hit = C.portfolio(C.calibrate([dict(l) for l in rl if l.get("hit") is not None], fair))
        e = [(u, k, key(s)) for u, k, s in eng]
        if e == [(u, k, key(s)) for u, k, s in res_all]:
            tag = "PASS" if e == [(u, k, key(s)) for u, k, s in res_hit] else "PASS (research-with-results differs: a DNP leg - set aside)"
            ok += 1
            if tag != "PASS":
                aside += 1
        else:
            tag = "FAIL"; bad += 1
        print(f"{d}: {tag} | engine {len(e)} slips: " + " || ".join(f"{u}.{k} " + " + ".join(f"{p} {pr} {sd} {ln}" for p, pr, sd, ln in s) for u, k, s in e), flush=True)
        if tag == "FAIL":
            print("    research: " + " || ".join(f"{u}.{k} " + " + ".join(f"{l['player']} {l['prop']} {l['side']} {l['line']}" for l in s) for u, k, s in res_all))
    print(f"\nPARITY: {ok} of {len(days)} slates identical ({aside} with a DNP leg set aside), {bad} FAIL -> {'ALL PASS' if not bad else 'FAIL'}")
    day = dt.date.fromisoformat(os.environ["AU_DAY"]) if os.environ.get("AU_DAY") else today
    before = conn.execute("SELECT count(*), coalesce(sum(stake),0) FROM nba_score.ud_live_slips").fetchone()
    os.environ.update(UDL_PORTFOLIO="C", UDL_FORCE="1", UDL_DRY="1")
    print(f"\nDRY RUN {day} (portfolio C forced, rolled back):", flush=True)
    UDL.pick(conn, day)
    after = conn.execute("SELECT count(*), coalesce(sum(stake),0) FROM nba_score.ud_live_slips").fetchone()
    print(f"ud_live_slips before {before} after {after} -> {'UNCHANGED' if before == after else 'CHANGED (!)'}")


if __name__ == "__main__":
    main()
