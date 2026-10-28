#!/usr/bin/env python3
"""
RESEARCH - BETR: THE OTHER APPS' CERTIFIED LEGS PLAYED ON BETR, EVERY STRUCTURE (2026-10-28; owner 16:44 PT "double check with the same
level of scrutiny for betr"; standing: "definitely no skipping, unless absolutely nothing holds positive ROI"). READ-ONLY.

SOURCES (the certified live strategies' qualified legs, their own builders - research_sleeper_transfer): Underdog portfolio T units
T1 / T2 / T3 and the unions T12 / T23 / T123 (each unit's own order, then the next unit's legs not yet listed - research_betr_4dyn);
PrizePicks portfolio B units B3 B4 B5 B6 B7 B9 (BT_PART=pp).
BETR PRICE: Betr's flat table (pp_slip_rules betr_payout_v1 = research_sleeper_transfer.BETR_*): Perfect 2-6 = 3 / 6 / 10 / 20 / 35,
Dynamic 3-6 by hits; every pick Less = the discounted tables; a void drops the pick, < 2 live picks or one team = refund.
LINE: history = the books' consensus main line (Betr = the books' / Underdog's main line); this season = BETR'S OWN ARCHIVED BOARD
(board_snapshots 'betr', newest capture of the slate, main markets) - as the live engine: the leg's own line must be open on Betr and the
books must price that line (final_hp is that line's chance).
GRID: source x order (src / p / pf = the books' chance / blend) x floor (0 / .54 / .56 / .58 / .60 / .62) x side (any / Over / Under /
mix = an all-Under slip swaps its last leg for the best Over) x skip (0 / 1 / 2 top legs) x game cap (the source's own / 1 / 2) x slips
a slate (1 / 2 / 3, different players) x 2-6 picks, Perfect and Dynamic.
REPORT per structure: rules positive in BOTH history seasons (>= 75 slips each) ranked by BALANCE (2-season P/L / worst drawdown),
skip 0 first (owner), each with this season's real Betr-board result; then the ones also positive this season. The live rule
B_T23_4dyn (UD-T23, order pf, floor .58, mix, skip 2, games <= 2, 2 slips, 4-pick Dynamic) is shown as the reference.
Env: DATABASE_URL, BT_PART (ud | pp), BT_TOP (15), BT_SMOKE (1 = every 8th history slate).
"""
import datetime as dt
import itertools
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["ST_APP"] = "betr"
import research_sleeper_transfer as ST              # noqa: E402
import research_betr_4dyn as B4                     # noqa: E402  (installs the T12 / T23 / T123 unions into ST.ud_lists)
import research_sleeper_deep as RSD                 # noqa: E402

PART = os.environ.get("BT_PART") or "ud"
ORDERS = ("src", "p", "pf", "blend")
FLOORS = (0.0, 0.54, 0.56, 0.58, 0.60, 0.62)
SIDES = ("any", "Over", "Under", "mix")
SKIPS = (0, 1, 2)
GCS = ("own", 1, 2)
NSL = (1, 2, 3)
KS = (2, 3, 4, 5, 6)
SEASONS = ("2024-25", "2025-26", "2026-27")
LIVE_RULE = ("UD-T23", "pf", 0.58, "mix", 2, "2", 2, 4, "dynamic")


class BetrPricer:
    """Betr's own archived board of the slate: the source leg at ITS line, open on Betr, the books pricing that line"""
    def __init__(self, conn, d):
        last = conn.execute("SELECT max(snapshot_ts) FROM nba_market.board_snapshots WHERE bookmaker='betr' AND game_date=%s", (d,)).fetchone()[0]
        self.lines = defaultdict(set)
        if last is not None:
            for pid, mk, side, line in conn.execute(
                    """SELECT nm.player_id::text, b.market_key, b.side, b.line::float FROM nba_market.board_snapshots b
                       JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)
                       WHERE b.bookmaker='betr' AND b.game_date=%s AND b.snapshot_ts=%s AND b.market_key = ANY(%s)""",
                    (d, last, list(RSD.MK))).fetchall():
                self.lines[(pid, RSD.MK[mk], side)].add(line)
        _sl, self.mk, *_ = RSD.load(conn, d)
        self.bx = ST.box(conn, d)

    def leg(self, src):
        pid = str(src["player_id"]) if src.get("player_id") is not None else None
        line = float(src["line"])
        if line not in self.lines.get((pid, src["prop"], src["side"]), ()):
            return None
        pm = self.mk.get((pid, src["prop"], src["side"], line))
        if not pm:
            return None
        b = self.bx.get(pid)
        return {"pid": pid, "prop": src["prop"], "side": src["side"], "line": line, "m": 1.0, "pf": float(np.mean(pm)),
                "hit": ST.grade(self.bx, pid, src["prop"], src["side"], line), "team": b["team"] if b else src.get("team_id"),
                "game": src.get("event_id"), "p": float(src["p"]), "same_line": True}


class Acc:
    def __init__(self):
        self.d = defaultdict(lambda: np.zeros((3, 7)))     # season -> n, sum pay-1, sumsq, cashed, P/L, peak, max dd

    def add(self, key, si, pls):
        a = self.d[key][si]
        for x in pls:
            a[0] += 1; a[1] += x; a[2] += x * x; a[3] += x > 0
        a[4] += sum(pls)
        a[5] = max(a[5], a[4]); a[6] = max(a[6], a[5] - a[4])


class Book:
    def __init__(self):
        self.acc = Acc()

    def day(self, season, d, src, qualified, gc_own, pricer):
        si = SEASONS.index(season)
        sl, seen = [], set()
        for q in qualified:
            x = pricer.leg(q)
            if x is None:
                continue
            key = (x["pid"], x["prop"], x["side"])
            if key in seen:
                continue
            seen.add(key)
            sl.append(x)
        if len(sl) < 2:
            return
        orders = {h: B4.ordered(sl, h) for h in ORDERS}
        for how, fl, side, sk, g in itertools.product(ORDERS, FLOORS, SIDES, SKIPS, GCS):
            gc = gc_own if g == "own" else g
            c = [l for l in orders[how] if l["p"] >= fl and (side in ("any", "mix") or l["side"] == side)][sk:]
            if len(c) < 2:
                continue
            for k in KS:
                if len(c) < k:
                    break
                used, slips = set(), []
                for _ in range(max(NSL)):
                    pool = [l for l in c if l["pid"] not in used]
                    s = ST.pick(pool, k, gc)
                    if side == "mix":
                        s = B4.mix_fix(s, pool, gc)
                    if s is None:
                        break
                    slips.append(s)
                    used |= {l["pid"] for l in s}
                for ns in NSL:
                    if len(slips) < ns:
                        break
                    comp = (src, how, fl, side, sk, str(g), ns, k)
                    self.acc.add(comp + ("perfect",), si, [ST.pay_betr(s, False) - 1 for s in slips[:ns]])
                    if k >= 3:
                        self.acc.add(comp + ("dynamic",), si, [ST.pay_betr(s, True) - 1 for s in slips[:ns]])

    def report(self):
        top = int(os.environ.get("BT_TOP") or 15)
        A = self.acc.d

        def st(key, si):
            a = A[key][si]
            n = a[0]
            return (int(n), 100 * a[1] / n if n else 0.0, a[4], a[6], 100 * a[3] / n if n else 0.0)

        def bal(key):
            return (A[key][0][4] + A[key][1][4]) / max(A[key][0][6], A[key][1][6], 1.0)

        def fmt(key):
            src, how, fl, side, sk, g, ns, k, stc = key
            pl = A[key][0][4] + A[key][1][4]; dd = max(A[key][0][6], A[key][1][6])
            return (f"{src:<7} {k}p {stc:<7} order={how:<5} p>={fl:.2f} side={side:<5} skip={sk} games<={g:<3} slips/slate={ns} | " +
                    " | ".join(f"{s} {n} {r:+.1f}% (P/L {p:+.1f}u, dd {d:.1f}u, cashed {c:.0f}%)" for s, (n, r, p, d, c) in
                               ((s, st(key, i)) for i, s in enumerate(SEASONS))) +
                    f" | 2 seasons P/L {pl:+.1f}u, worst dd {dd:.1f}u, balance {pl / dd if dd else 0:.1f}")

        print("=" * 170 + f"\nBETR TRANSFER | part {PART} | rules {len(A)}")
        if LIVE_RULE in A:
            print("  LIVE RULE B_T23_4dyn: " + fmt(LIVE_RULE))
        for k in KS:
            for stc in ("perfect", "dynamic"):
                if stc == "dynamic" and k < 3:
                    continue
                pool = [q for q in A if q[7] == k and q[8] == stc and all(A[q][i][0] >= 75 and A[q][i][1] > 0 for i in (0, 1))]
                print(f"\n== {k}-pick {stc.upper()}: {len(pool)} rules positive in both history seasons (>= 75 slips each)")
                for sk in SKIPS:
                    ps = sorted([q for q in pool if q[4] == sk], key=lambda q: -bal(q))
                    print(f"  skip={sk}: top {top} by balance ({len(ps)} rules)")
                    seen, n = set(), 0
                    for q in ps:
                        sig = (round(A[q][0][1], 2), round(A[q][1][1], 2), int(A[q][0][0]))
                        if sig in seen:
                            continue
                        seen.add(sig); n += 1
                        print("    " + fmt(q))
                        if n >= top:
                            break
                live = [q for q in pool if A[q][2][0] >= 3 and A[q][2][1] > 0]
                print(f"  ALSO POSITIVE THIS SEASON (>= 3 real Betr-board slips): {len(live)} rules; top {top} (skip 0 first, by balance)")
                for q in sorted(live, key=lambda q: (q[4], -bal(q)))[:top]:
                    print("    " + fmt(q))


def main():
    conn = ST.connect()
    bk = Book()
    ST.log(f"betr transfer part {PART}")
    today = dt.datetime.now(ST.AF.UDL.PT).date()
    cur = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) == "2026-27" and d < today and
           conn.execute("SELECT 1 FROM nba_market.board_snapshots WHERE bookmaker='betr' AND game_date=%s LIMIT 1", (d,)).fetchone()]
    ST.log(f"this season's slates with a Betr board: {[str(d) for d in cur]}")
    if PART == "ud":
        days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) != "2026-27"]
        if os.environ.get("BT_SMOKE") == "1":
            days = days[::8]
        conn = ST.run_ud(conn, days, ST.HistPricer, bk)
        conn = ST.run_ud(conn, cur, BetrPricer, bk)
    else:
        conn = ST.run_pp_hist(conn, bk)
        ST.run_pp_live(conn, cur, bk, BetrPricer)
    bk.report()
    ST.log("done")


if __name__ == "__main__":
    main()
