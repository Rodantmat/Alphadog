#!/usr/bin/env python3
"""
AUDIT - THE TWO RULES DEPLOYED 2026-10-28 (owner 16:44 PT "Deploy the best balance strategies"): does the LIVE ENGINE build exactly the
slips the research measured? READ-ONLY (every engine call runs inside a transaction that is rolled back; nothing is written).
SLEEPER S_ALL_5flex: sleeper_live_slip_engine.build_all vs research_app_allegs (live_legs + day(), rule evbl / any / all / all / p>=.50 /
  pxm>=1.12 / m<=99 / 5-pick / 2 slips) on every past slate this season. Team: the engine knows only the last game-log team before the
  slate (the research reads the box score afterwards) - a team difference is reported, not hidden.
FLIFF F_UDT1_2max_U: fliff_live_slip_engine.build(cfg order src, side Under, floor .56, mcap 1.85, skip 0) vs research_fliff_transfer's
  PickemPricer + research_sleeper_small (UD-T1, src, .56, Under, 1.85, skip 0, 1 slip, 2-pick) on the Pick'Em board days (10-26 on).
Also prints the slips each engine would build TODAY (no write). Env: DATABASE_URL.
"""
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["ST_APP"] = "sleeper"
os.environ["AA_APP"] = "sleeper"
import research_app_allegs as RA                    # noqa: E402
import research_app_final_strategies as AF          # noqa: E402
import sleeper_live_slip_engine as SL               # noqa: E402
import research_sleeper_transfer as ST              # noqa: E402


def research_sleeper(conn, d):
    st = AF.box(conn, d)
    legs = RA.live_legs(conn, d, st)
    base = sorted([l for l in legs], key=RA.key_of("evbl"))
    idx = [i for i, l in enumerate(base) if l["p"] >= 0.50 and l["p"] * l["m"] >= 1.12 and l["m"] <= 99.0]
    s1 = RA.greedy(base, idx, 5, set())
    if len(s1) < 5 or len({l["team"] for l in s1}) < 2:
        return []
    s2 = RA.greedy(base, idx, 5, {l["player_id"] for l in s1})
    out = [s1]
    if len(s2) == 5 and len({l["team"] for l in s2}) >= 2:
        out.append(s2)
    return out


def key(l):
    return (str(l.get("player_id") or l.get("pid")), l["prop"], l["side"], float(l["line"]))


def main():
    conn = ST.connect()
    today = dt.datetime.now(AF.UDL.PT).date()
    days = [d for d in AF.slate_days(conn) if AF.season_of(d) == "2026-27" and dt.date(2026, 10, 20) <= d < today]
    ok = bad = 0
    print("=" * 120 + "\nSLEEPER S_ALL_5flex - engine vs research")
    for d in days:
        r = research_sleeper(conn, d)
        e, note = SL.build_all(conn, d, SL.ALL_RULE)
        conn.rollback()
        rk = [[key(l) for l in s] for s in r]
        ek = [[key(l) for l in s] for s in e]
        same = rk == ek
        ok += same; bad += not same
        print(f"  {d}: research {len(r)} slip(s), engine {len(e)} - {'SAME LEGS' if same else 'DIFFERENT'} ({note})")
        if not same:
            for i in range(max(len(rk), len(ek))):
                print(f"     research k{i + 1}: {rk[i] if i < len(rk) else '-'}")
                print(f"     engine   k{i + 1}: {ek[i] if i < len(ek) else '-'}")
            tr = {str(l["player_id"]): l["team"] for s in r for l in s}
            te = {l["pid"]: l["team"] for s in e for l in s}
            diff = {p: (tr.get(p), te.get(p)) for p in set(tr) & set(te) if tr[p] != te[p]}
            if diff:
                print(f"     team differences (research box, engine game log): {diff}")
    print(f"SLEEPER parity: {ok} slates same, {bad} different")

    os.environ["ST_APP"] = "fliff"
    ST.APP = "fliff"
    import fliff_live_slip_engine as FL
    import research_fliff_transfer as FT
    cfg = {"floor": 0.56, "mcap": 1.85, "skip": 0, "order": "src", "side": "Under"}
    ok = bad = 0
    print("=" * 120 + "\nFLIFF F_UDT1_2max_U - engine vs research")
    for d in [x for x in days if x >= dt.date(2026, 10, 26)]:
        st = AF.box(conn, d)
        legs, rows = AF.load_ud(conn, d, st)
        c, gc = ST.ud_lists(rows, legs)["T1"]
        pr = FT.PickemPricer(conn, d)
        sl, seen = [], set()
        for q in c:
            x = pr.leg(q)
            if x is None or (x["pid"], x["prop"], x["side"]) in seen:
                continue
            seen.add((x["pid"], x["prop"], x["side"]))
            sl.append(x)
        cand = [l for l in sl if l["p"] >= 0.56 and l["m"] <= 1.85 and l["side"] == "Under"]
        rs = ST.pick(cand, 2, gc) if len(cand) >= 2 else None
        es, _last, note = FL.build(conn, d, cfg)
        conn.rollback()
        rk = [key(l) for l in rs] if rs else None
        ek = [key(l) for l in es] if es else None
        same = rk == ek
        ok += same; bad += not same
        print(f"  {d}: research {rk} | engine {ek} - {'SAME' if same else 'DIFFERENT'} ({note})")
    print(f"FLIFF parity: {ok} slates same, {bad} different")

    print("=" * 120 + f"\nTODAY {today} (nothing written)")
    e, note = SL.build_all(conn, today, SL.ALL_RULE)
    conn.rollback()
    print(f"  Sleeper S_ALL_5flex: {note}")
    for i, s in enumerate(e, 1):
        print(f"   k{i}: " + "; ".join(f"{l['prop']} {l['side']} {l['line']:g} x{l['m']:.2f} p {l['p']:.2f} [{l['kind']}]" for l in s))
    es, _last, note = FL.build(conn, today, cfg)
    conn.rollback()
    print(f"  Fliff F_UDT1_2max_U: {note}: " + (" + ".join(f"{l['prop']} {l['side']} {l['line']} @{l['m']} p {l['p']:.2f}" for l in es) if es else "no slip"))
    print("done", flush=True)


if __name__ == "__main__":
    main()
