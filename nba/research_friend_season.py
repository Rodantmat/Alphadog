#!/usr/bin/env python3
"""
RESEARCH - FRIEND PAGE, PrizePicks THIS SEASON on the real board snapshots (2026-11-05). READ-ONLY.
Elected friend rules: 4-pick Flex ('R','U','all','trail',.62,gc1,skip0,'all') and 3-pick Power ('R','B','all','blend',.62,gc1,skip0,'low').
Per 2026-27 slate: the live board path (live_slip_engine.load_board_legs_live + pb_rates, exactly what the owner's P3 uses), the owner's
portfolio-B units replayed for the leg-difference cap, the friend slips built, graded on the box score with the PrizePicks Flex/Power payouts.
Flat 1u a slip.
"""
import os, sys, datetime as dt
from collections import defaultdict
import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                      # noqa: E402
import research_portfolio_caps as PC          # noqa: E402
import live_slip_engine as L                  # noqa: E402
import ud_live_slip_engine as UDL             # noqa: E402

HIS = ["B3", "B4", "B5", "B6", "B7", "B9", "B3x4", "B5x4", "B7x4"]
RULES = [("4F", 4, "flex", ("R", "U", "all", "trail", 0.62, 1, 0, "all")),
         ("3P", 3, "power", ("R", "B", "all", "blend", 0.62, 1, 0, "low"))]


def lk(l):
    return (str(l["player"]), l["prop"], l["side"])


def need(k):
    return max(1, int(0.4 * k))


def sel(cand, gc, size, H):
    maxh = size - need(size)
    pick, players, games, h = [], set(), defaultdict(int), 0
    for l in cand:
        if l["player"] in players or games[l["event_id"]] >= gc:
            continue
        inh = lk(l) in H
        if inh and h >= maxh:
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1; h += inh
        if len(pick) == size:
            break
    if len(pick) == size and len({l.get("team_id") for l in pick}) >= 2:
        return pick
    return None


def box(conn, day):
    st = {}
    for pid, pts, reb, ast, fg3m, stl, blk, tov, mins in conn.execute(
            "SELECT nba_player_id::text, pts, reb, ast, fg3m, stl, blk, tov, min FROM nba_stats.player_game_log WHERE game_date=%s", (day,)).fetchall():
        st[pid] = dict(pts=pts or 0, reb=reb or 0, ast=ast or 0, fg3m=fg3m or 0, stl=stl or 0, blk=blk or 0, tov=tov or 0, min=mins)
    return st


def hit_of(st, l):
    s = st.get(str(l.get("player_id")))
    if not s or not s["min"]:
        return None
    v = UDL.STAT[l["prop"]](s)
    if v == float(l["line"]):
        return None
    return int((v > float(l["line"])) if l["side"] == "Over" else (v < float(l["line"])))


def max_dd(x):
    c = np.cumsum(x)
    return float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(x) else 0.0


def dry(x):
    b = c = 0
    for v in x:
        c = c + 1 if v <= 0 else 0
        b = max(b, c)
    return b


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    today = dt.datetime.now(UDL.PT).date()
    days = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_score.final_hp WHERE game_date >= %s AND game_date < %s ORDER BY 1",
                                       (dt.date(2026, 10, 20), today)).fetchall()]
    print("slates", len(days), days[:1], days[-1:], flush=True)
    res = defaultdict(list)
    for d in days:
        st = box(conn, d)
        if not st:
            print(d, "no box score"); continue
        live = L.load_board_legs_live(conn, d)
        lpool = [dict(l, p=float(l["score"]), cell=f"{l['prop']}_{l['tier']}") for l in live
                 if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
        if not lpool:
            print(d, "no board"); continue
        prep = PB.prepare(lpool, L.pb_rates(conn, d))
        for l in prep:
            l["hit"] = hit_of(st, l)
        H = set()
        for uid in HIS:
            s = PB.unit_slip(prep, uid)
            if s:
                H |= {lk(l) for l in s}
        for (nm, size, structure, (pool, side, ps, rk, fl, gc, tp, lp)) in RULES:
            b = [l for l in prep if l["tier"] in PB.POOLS[pool] and l["side"] in PB.SIDES[side] and (ps == "all" or l["_grp"] == ps)]
            if lp == "low":
                b = [l for l in b if l["_lp"] == "low"]
            if rk == "blend":
                b = sorted(b, key=lambda l: -l["_blend"])
            elif rk == "p":
                b = sorted(b, key=lambda l: -l["p"])
            elif rk == "ev":
                b = sorted(b, key=lambda l: -l["p"] * float(l["factor"]))
            else:
                b = sorted(b, key=lambda l: (-l["_trail"], -l["p"]))
            cand = [l for l in b if l["p"] >= fl][tp:]
            s = sel(cand, gc, size, H)
            if s:
                pr = PC.grade(s, structure) - 1
                res[nm].append((d, pr))
                print(d, nm, f"{pr:+.2f}", "; ".join(f"{l['player']} {l['prop']} {l['side'][0]}{l['line']} h{l['hit']}" for l in s), flush=True)
            else:
                print(d, nm, "no slip", flush=True)
    print("\n=== PRIZEPICKS FRIEND, THIS SEASON (real board snapshots, flat 1u) ===")
    tot = []
    for nm, size, structure, _ in RULES:
        x = np.array([v for _, v in res[nm]])
        tot += list(x)
        if len(x):
            print(f"{nm}: {len(x)} slips, ROI {100*x.mean():+.0f}%, haircut 15% {100*x.mean()*0.85:+.0f}% / 20% {100*x.mean()*0.80:+.0f}%, "
                  f"profit {x.sum():+.1f}u, max dd {max_dd(x):.1f}u, dry {dry(x)}, won {100*np.mean(x>0):.0f}%")
    x = np.array(tot)
    if len(x):
        print(f"TOTAL: {len(x)} slips, ROI {100*x.mean():+.0f}% (haircut 15% {100*x.mean()*0.85:+.0f}% / 20% {100*x.mean()*0.80:+.0f}%)")
    print("done")


if __name__ == "__main__":
    main()
