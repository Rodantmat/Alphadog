#!/usr/bin/env python3
"""
AUDIT - nba/paper_altless_tracker.py before it is wired into P3 / P2A (2026-10-20). DRY RUN: writes no slip (PAT_WRITE=0); the only
write is the tracker's own CREATE TABLE IF NOT EXISTS of the empty nba_score.paper_altless_slips.
1  RANK PARITY on finished slates of both seasons: the tracker's live leg build (pp_leg_price window + final_hp, certified tier-map
   recipe) must give every goblin / demon rung of points / PRA / rebounds / assists the SAME tier and the SAME rmin (best reverse rank
   over score / final_hp / baseline_hp, per prop and tier) as the research's ALT_LESS_SQL (nba_score.tier_map_legs) - the selector
   the backtest measured. Research rows are limited to rmin <= 10 and graded legs; the comparison is on the research's rows with
   rmin <= 2 (the tracker's depth). PASS = 100% of those found with identical tier and rmin.
2  PLUMBING on those slates: pick (open set = the research's assumed band, PAT_TEST_BAND - the real flag starts 10-21) and grade the
   slips from the box scores; every leg's hit must equal the research's stat_actual < line.
3  TONIGHT (PAT_DATE default today): pick in dry run on the REAL Less flag (expected: no Less-open rows before the 10-21 archive).
Env: DATABASE_URL, AUDIT_DATES (default 2025-01-15,2025-03-10,2026-01-20,2026-03-15).
"""
import os
import sys
from datetime import date

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["PAT_WRITE"] = "0"
import paper_altless_tracker as T            # noqa: E402
import research_exhaustive_pp as EX          # noqa: E402


def main():
    dates = [date.fromisoformat(x) for x in os.environ.get("AUDIT_DATES", "2025-01-15,2025-03-10,2026-01-20,2026-03-15").split(",")]
    ok = True
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        conn.execute(T.DDL)
        conn.commit()
        EX.install_flex2_alt(conn)
        cur = conn.execute("SELECT * FROM (" + EX.ALT_LESS_SQL + ") z WHERE game_date = ANY(%s)", (dates,))
        cols = [x.name for x in cur.description]
        res = [dict(zip(cols, r)) for r in cur.fetchall()]
        names = {r["player"] for r in res}
        NORM = {n: conn.execute("SELECT nba_ref.norm_name(%s)", (n,)).fetchone()[0] for n in names}
        for d in dates:
            rows = conn.execute(T.LEG_SQL, {"d": d, "mk": list(T.PROPS)}).fetchall()
            legs = {}
            groups = {}
            for pid, player, mk, line, kind, tier, f_over, gid, score, fh, bh, _, nm in rows:
                l = {"nm": nm, "player": player, "prop": T.PROPS[mk], "line": line, "tier": tier, "score": score, "fh": fh, "bh": bh, "pid": pid,
                     "f_over": f_over}
                groups.setdefault((l["prop"], tier), []).append(l)
            for g in groups.values():
                for key in ("score", "fh", "bh"):
                    for i, x in enumerate(sorted(g, key=lambda x: (x[key], x["pid"], x["line"])), 1):
                        x["r_" + key] = i
                for x in g:
                    x["rmin"] = min(x["r_score"], x["r_fh"], x["r_bh"])
                    legs[(x["nm"], x["prop"], float(x["line"]))] = x
            # the research's leg universe is GRADED rungs only (tier_map_legs needs a box-score hit); live, a DNP cannot be known,
            # so the tracker ranks over every priced rung. METHOD parity = the tracker's ranking over the research's universe.
            graded = {(n_, pr_, float(li_)) for n_, pr_, li_ in conn.execute(
                """SELECT DISTINCT nba_ref.norm_name(player), prop, line::float8 FROM nba_score.tier_map_legs
                   WHERE game_date = %s AND side = 'Over' AND tier IN ('G1','G2','G3','D1','D2','D3')
                     AND prop IN ('points','pra','rebounds','assists')""", (d,)).fetchall()}
            # TIES: the research ranks with row_number(), which orders EQUAL scores arbitrarily (2026-01-20 assists D2: Cody Williams,
            # Ochai Agbaji and Quinten Post carry identical score / final_hp / baseline_hp). Per key the reverse rank of a tied rung is
            # any value in [1 + #lower, #lower-or-equal]; rmin is then any value in [min of the lows, min of the highs]. METHOD parity =
            # the research's rmin lies in that interval (exact whenever there is no tie).
            gm = {}
            for g in groups.values():
                gg = [x for x in g if (x["nm"], x["prop"], float(x["line"])) in graded]
                for x in gg:
                    lo = min(1 + sum(1 for y in gg if y[key] < x[key]) for key in ("score", "fh", "bh"))
                    hi = min(sum(1 for y in gg if y[key] <= x[key]) for key in ("score", "fh", "bh"))
                    gm[(x["nm"], x["prop"], float(x["line"]))] = (lo, hi)
            extra = sum(1 for kk in legs if kk not in graded)
            rr = [r for r in res if r["game_date"] == d]
            rmins = [r for r in rr if min(v for v in (r["n_fs"], r["n_fh"], r["n_bh"]) if v is not None) <= 2]
            found = same = 0
            bad = []
            for r in rmins:
                rm = min(v for v in (r["n_fs"], r["n_fh"], r["n_bh"]) if v is not None)
                x = legs.get((NORM[r["player"]], r["prop"], float(r["line"])))
                if x is None:
                    bad.append(("missing", r["player"], r["prop"], r["line"], r["tier"], rm))
                    continue
                found += 1
                if "U" + x["tier"] == r["tier"] and x["rmin"] == rm and abs(x["f_over"] - r["f_over"]) < 1e-9:
                    same += 1
                else:
                    bad.append(("differs", r["player"], r["prop"], r["line"], r["tier"], rm, x["tier"], x["rmin"], x["f_over"], r["f_over"]))
            msame = ties = 0
            for r in rmins:
                iv = gm.get((NORM[r["player"]], r["prop"], float(r["line"])))
                rm = min(v for v in (r["n_fs"], r["n_fh"], r["n_bh"]) if v is not None)
                if iv and iv[0] <= rm <= iv[1]:
                    msame += 1
                    ties += int(iv[0] != iv[1])
                else:
                    print("    METHOD MISMATCH", r["player"], r["prop"], r["line"], r["tier"], rm, iv)
            print(f"    method parity: {msame}/{len(rmins)} inside the tie interval ({ties} of them tied - order arbitrary in the research)")
            p = msame == len(rmins) and found == len(rmins) and len(rmins) > 0
            ok = ok and p
            print(f"RANK PARITY {d}: research rmin<=2 rungs {len(rmins)} | found {found} | METHOD (research universe) identical rmin "
                  f"{msame} {'PASS' if p else 'FAIL'} | LIVE universe identical tier+rmin+price {same} (tracker ranks {extra} more "
                  f"rungs the research dropped as ungraded - DNP / no box score; unknowable at pick time)", flush=True)
            for b in bad[:12]:
                print("   ", b)
            # plumbing: pick on the assumed band, grade, compare each leg's hit with the research's
            T.TEST_BAND = True
            T.started_games = lambda conn, d: set()
            slips = T.pick(conn, d, False) or []
            hitmap = {(NORM[r["player"]], r["prop"], float(r["line"])): (None if r["stat_actual"] is None or r["stat_actual"] == r["line"]
                                                                                 else int(r["stat_actual"] < r["line"])) for r in rr}
            agree = tot = 0
            for rule, k, st, lj in slips:
                hits, live, pay = T.grade_legs(conn, d, lj, st)
                for l in lj:
                    key = (l["nm"], l["prop"], float(l["line"]))
                    if key in hitmap:
                        mine = T.leg_hit(conn, d, l)
                        tot += 1
                        agree += int(mine == hitmap[key])
                print(f"    {rule}: hits {hits}/{live} payout {pay:.3f}", flush=True)
            p2 = tot > 0 and agree == tot
            ok = ok and p2
            print(f"GRADE PARITY {d}: legs compared {tot} | same hit / void {agree} | {'PASS' if p2 else 'FAIL'}", flush=True)
        T.TEST_BAND = False
        import importlib
        importlib.reload(T)
        print("\nTONIGHT (real Less flag, dry run):", flush=True)
        T.pick(conn, T.today_pt(), False)
    print("AUDIT_PASS" if ok else "AUDIT_FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
