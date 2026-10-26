#!/usr/bin/env python3
"""
RESEARCH - SLEEPER PART E: THE OTHER APPS' QUALIFIED LEGS, PLAYED ON SLEEPER (2026-10-25; owner 22:04 PT: "what about qualified
legs in the other apps through deep backtest and just repeat them? If they are strong on the other apps, very likely they will on
the not scoring apps"). READ-ONLY.

SOURCES (the certified, live strategies, built by their own shared builders so the legs are exactly the ones they qualify):
  PrizePicks portfolio B: B3 B4 B5 B6 B7 B9 (portfolio_b.candidates - each unit's qualified legs in its own order + game cap)
  Underdog portfolio T:   T1 (build_ud_slip_engine, the doc rule) T2 T3 (ud_portfolio_t grid rule: floor, skip, p x m order)
THE SAME PICK ON SLEEPER: the same player, stat and side at SLEEPER'S line (Sleeper lists one main line per player and stat):
  history (2024-25, 2025-26): Sleeper's line = the books' consensus main line, multiplier = round(1 / (1.1238 x de-vigged chance), 2)
    (Sleeper = Fliff's feed, flat 12.4% on every main pair - research_sleeper_deep), graded on the box score at that line;
  real (this season, ST_PART=live): Sleeper's own window board, its real line and multiplier, graded on the box score.
SLIPS from each source's qualified list (distinct players, the source's game cap, >= 2 teams), 2..6 picks:
  order "src" = the source's own order (the legs exactly as the other app ranks them);
  order "sl"  = the same qualified legs re-ranked by final_hp x the Sleeper multiplier.
  Max = product x size bonus (verified 2: 1.00, 3: 1.0797, 4: 1.102 on the owner's NBA entry screens; 5 / 6 unverified - shown
  both with the estimate 1.144 / 1.227 and plain); Flex = round robin of the (n-1)-pick sub-products (verified exact at 3 picks; 4+
  modelled the same, no bonus on the sub-slips - conservative). A void (DNP / push at Sleeper's line) drops the pick (2-pick void
  = refund), as Sleeper's rules.
LEGS: every qualified leg alone - hit rate, mean multiplier, return per leg (hit x m - 1).
FLIFF (ST_APP=fliff; owner 22:12 PT "Run the same for fliff and betr in parallel"): a sportsbook - every pick is priced in American
  odds, a single is a bet of its own, a parlay pays the product of the decimal prices (no bonus). Fliff's own window board this season:
  main pairs carry 9.0% (median 1/dO + 1/dU = 1.0904 over 5,971 pairs, 2026-10-20..25), so history prices a side at
  1 / (1.0904 x de-vigged chance); real part = Fliff's own window board. Parlays one pick a game (no same-game parlays assumed).
BETR (ST_APP=betr; PARKED in production - research only): a flat table (nba_config.pp_slip_rules betr_payout_v1, Betr's own pricing
  query): Perfect 2-6 = 3 / 6 / 10 / 20 / 35, Dynamic (flex) by hits, an all-LESS entry pays the discounted table. No Betr board
  history (harvest parked since 10-19): its line = the books' consensus main line (history only).
Env: DATABASE_URL, ST_APP (sleeper | fliff | betr), ST_PART (hist_ud | hist_pp | live), ST_SMOKE (1 = every 8th slate).
"""
import datetime as dt
import itertools
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["APP"] = "UD"
import research_app_final_strategies as AF           # noqa: E402
import research_sleeper_hist as RSH                  # noqa: E402

T0 = time.time()
OVR = 1.1238
BONUS_EST = {2: 1.0, 3: 1.0797, 4: 1.102, 5: 1.144, 6: 1.227}
BONUS_PLAIN = {2: 1.0, 3: 1.0797, 4: 1.102, 5: 1.102, 6: 1.102}
KS = (2, 3, 4, 5, 6)
PART = os.environ.get("ST_PART") or "hist_ud"
APP = os.environ.get("ST_APP") or "sleeper"
OVR_F = 1.0904
BETR_PERFECT = {2: 3, 3: 6, 4: 10, 5: 20, 6: 35}
BETR_PERFECT_LESS = {2: 2.75, 3: 5.5, 4: 9, 5: 18, 6: 31.5}
BETR_DYN = {3: {2: 1, 3: 3}, 4: {3: 1.5, 4: 6}, 5: {3: 0.4, 4: 2, 5: 10}, 6: {4: 1, 5: 1.5, 6: 20}}
BETR_DYN_LESS = {3: {2: 1, 3: 2.75}, 4: {3: 1.25, 4: 5.5}, 5: {3: 0.25, 4: 1.75, 5: 9}, 6: {4: 1, 5: 1.25, 6: 18}}
SMOKE = os.environ.get("ST_SMOKE") == "1"


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def connect():
    c = psycopg.connect(os.environ["DATABASE_URL"])
    c.execute("SET statement_timeout = 0")
    return c


BOX = """SELECT nba_player_id::text, team_id, pts, reb, ast, fg3m, stl, blk, tov, min FROM nba_stats.player_game_log WHERE game_date=%s"""


def box(conn, d):
    out = {}
    for r in conn.execute(BOX, (d,)).fetchall():
        out[r[0]] = {"team": r[1], "min": r[9], "st": dict(pts=r[2] or 0, reb=r[3] or 0, ast=r[4] or 0, fg3m=r[5] or 0, stl=r[6] or 0,
                                                          blk=r[7] or 0, tov=r[8] or 0)}
    return out


def grade(bx, pid, prop, side, line):
    b = bx.get(str(pid))
    if not b or not b["min"]:
        return None
    v = AF.STAT[prop](b["st"])
    if v == line:
        return None
    return int(v > line) if side == "Over" else int(v < line)


def consensus(conn, d):
    """books' window board -> fair chance of Over {(pid, prop, line): p}, main line {(pid, prop): line}"""
    q = defaultdict(lambda: defaultdict(dict))
    for bk, pn, pid, mk, side, line, price, e in conn.execute(RSH.HSQL, (d, RSH.HBOOKS, RSH.MKALL)).fetchall():
        if abs(price) < 100 or mk.endswith("_alternate"):
            continue
        q[(pid, RSH.MK[mk], line)][bk][side] = RSH.american(price)
    fair, nbk = {}, {}
    for k, books in q.items():
        ps = [(1 / s["Over"]) / (1 / s["Over"] + 1 / s["Under"]) for s in books.values() if "Over" in s and "Under" in s]
        if ps:
            fair[k] = float(np.mean(ps)); nbk[k] = len(ps)
    main = {}
    for (pid, prop, line), p in fair.items():
        sc = (nbk[(pid, prop, line)], -abs(p - .5))
        if (pid, prop) not in main or sc > main[(pid, prop)][0]:
            main[(pid, prop)] = (sc, line)
    return fair, {k: v[1] for k, v in main.items()}


class HistPricer:
    def __init__(self, conn, d):
        self.fair, self.main = consensus(conn, d)
        self.bx = box(conn, d)

    def leg(self, src):
        pid = str(src["player_id"]) if src.get("player_id") is not None else None
        if pid is None or (pid, src["prop"]) not in self.main:
            return None
        line = self.main[(pid, src["prop"])]
        po = self.fair[(pid, src["prop"], line)]
        ps = po if src["side"] == "Over" else 1 - po
        if not 0.05 < ps < 0.95:
            return None
        b = self.bx.get(pid)
        m = round(1 / (OVR * ps), 2) if APP == "sleeper" else round(1 / (OVR_F * ps), 3) if APP == "fliff" else 1.0
        return {"pid": pid, "prop": src["prop"], "side": src["side"], "line": line, "m": m, "pf": ps,
                "hit": grade(self.bx, pid, src["prop"], src["side"], line), "team": b["team"] if b else src.get("team_id"),
                "game": src.get("event_id"), "p": float(src["p"]), "same_line": float(src["line"]) == line}


class LivePricer:
    def __init__(self, conn, d):
        import research_sleeper_deep as RSD
        sl, _mk, _ml, _a, _b = RSD.load(conn, d)
        self.by = {}
        for (pid, prop, side, line), l in sl.get("window", {}).items():
            if l["kind"] != "main":
                continue
            k = (str(pid), prop, side)
            cur = self.by.get(k)
            if cur is None or abs(l["m"] - 1.78) < abs(cur["m"] - 1.78):      # the balanced main line when several are listed
                self.by[k] = l
        self.bx = box(conn, d)

    def leg(self, src):
        pid = str(src["player_id"]) if src.get("player_id") is not None else None
        l = self.by.get((pid, src["prop"], src["side"]))
        if l is None:
            return None
        b = self.bx.get(pid)
        return {"pid": pid, "prop": src["prop"], "side": src["side"], "line": float(l["line"]), "m": float(l["m"]), "pf": None,
                "hit": grade(self.bx, pid, src["prop"], src["side"], float(l["line"])), "team": b["team"] if b else src.get("team_id"),
                "game": src.get("event_id") or l.get("event_id"), "p": float(src["p"]), "same_line": float(src["line"]) == float(l["line"])}


class LiveFliffPricer:
    """Fliff's own window board: per (player, stat, side) the main line nearest an even price, its decimal price"""
    def __init__(self, conn, d):
        q = defaultdict(dict)
        for bk, pn, pid, mk, side, line, price, e in conn.execute(RSH.HSQL, (d, ["fliff"], RSH.MKALL)).fetchall():
            if mk.endswith("_alternate") or price is None or abs(price) < 100:
                continue
            q[(str(pid), RSH.MK[mk], float(line))][side] = (RSH.american(price), e)
        self.by = {}
        for (pid, prop, line), s in q.items():
            if "Over" not in s or "Under" not in s:
                continue
            po = (1 / s["Over"][0]) / (1 / s["Over"][0] + 1 / s["Under"][0])
            for side in ("Over", "Under"):
                k = (pid, prop, side)
                if k not in self.by or abs(po - .5) < self.by[k][0]:
                    self.by[k] = (abs(po - .5), line, s[side][0], s[side][1])
        self.bx = box(conn, d)

    def leg(self, src):
        pid = str(src["player_id"]) if src.get("player_id") is not None else None
        x = self.by.get((pid, src["prop"], src["side"]))
        if x is None:
            return None
        _d, line, dec, ev = x
        b = self.bx.get(pid)
        return {"pid": pid, "prop": src["prop"], "side": src["side"], "line": line, "m": round(dec, 3), "pf": None,
                "hit": grade(self.bx, pid, src["prop"], src["side"], line), "team": b["team"] if b else src.get("team_id"),
                "game": src.get("event_id") or ev, "p": float(src["p"]), "same_line": float(src["line"]) == line}


def pay_parlay(sl):
    """Fliff: product of the decimal prices of the live picks; a void pick drops out (sportsbook rule); all void = refund"""
    live = [l for l in sl if l["hit"] is not None]
    if not live:
        return 1.0
    if not all(l["hit"] for l in live):
        return 0.0
    return float(np.prod([l["m"] for l in live]))


def pay_betr(sl, flex):
    live = [l for l in sl if l["hit"] is not None]
    n = len(live)
    if n < 2 or len({l["team"] for l in live}) < 2:
        return 1.0
    less = all(l["side"] == "Under" for l in live)
    h = sum(l["hit"] for l in live)
    if not flex or n == 2:
        return (BETR_PERFECT_LESS if less else BETR_PERFECT)[n] if h == n else 0.0
    return (BETR_DYN_LESS if less else BETR_DYN)[n].get(h, 0.0)


def pick(cands, k, gc):
    out, pl, gm = [], set(), defaultdict(int)
    for l in cands:
        if l["pid"] in pl or gm[l["game"]] >= gc:
            continue
        out.append(l); pl.add(l["pid"]); gm[l["game"]] += 1
        if len(out) == k:
            break
    if len(out) < k or (k >= 2 and APP != "fliff" and len({l["team"] for l in out}) < 2):
        return None
    return out


def pay_max(sl, bonus):
    live = [l for l in sl if l["hit"] is not None]
    if len(live) < 2 or len({l["team"] for l in live}) < 2:
        return 1.0                                       # refunded
    if not all(l["hit"] for l in live):
        return 0.0
    return float(np.prod([l["m"] for l in live])) * bonus[len(live)]


def pay_flex(sl):
    live = [l for l in sl if l["hit"] is not None]
    n = len(live)
    if n < 2 or len({l["team"] for l in live}) < 2:
        return 1.0
    if n == 2:
        return pay_max(live, BONUS_EST)
    subs = list(itertools.combinations(live, n - 1))
    return float(np.mean([np.prod([l["m"] for l in s]) if all(l["hit"] for l in s) else 0.0 for s in subs]))


class Book:
    def __init__(self):
        self.slips = defaultdict(list)                   # (src, order, k, struct) -> [(season, day, payout)]
        self.legs = defaultdict(list)                    # src -> [(season, m, hit, same_line, pf)]
        self.cover = defaultdict(lambda: [0, 0])         # src -> [qualified legs, priced on Sleeper]

    def day(self, season, d, src, qualified, gc, pricer):
        self.cover[src][0] += len(qualified)
        sl = []
        for q in qualified:
            x = pricer.leg(q)
            if x is not None:
                sl.append(x)
        self.cover[src][1] += len(sl)
        seen = set()
        for x in sl:
            key = (x["pid"], x["prop"], x["side"])
            if key in seen or x["hit"] is None:
                continue
            seen.add(key)
            self.legs[src].append((season, x["m"], x["hit"], x["same_line"], x["pf"]))
        for order, c in (("src", sl), ("sl", sorted(sl, key=lambda x: -x["p"] * x["m"]))):
            for k in ((1,) + KS if APP == "fliff" else KS):
                s = pick(c, k, 1 if APP == "fliff" else gc)
                if s is None:
                    continue
                if APP == "fliff":
                    self.slips[(src, order, k, "single" if k == 1 else "parlay")].append((season, d, pay_parlay(s)))
                    continue
                if APP == "betr":
                    self.slips[(src, order, k, "perfect")].append((season, d, pay_betr(s, False)))
                    if k >= 3:
                        self.slips[(src, order, k, "dynamic")].append((season, d, pay_betr(s, True)))
                    continue
                self.slips[(src, order, k, "max")].append((season, d, pay_max(s, BONUS_EST)))
                if k >= 5:
                    self.slips[(src, order, k, "max-plain")].append((season, d, pay_max(s, BONUS_PLAIN)))
                if k >= 3:
                    self.slips[(src, order, k, "flex")].append((season, d, pay_flex(s)))

    def report(self):
        print("=" * 160)
        print(f"APP {APP} | PART {PART}")
        print("LEGS: each qualified leg at the app's line and multiplier (Betr: m = 1, flat table) | hit, mean m, return per leg (hit x m - 1), share at the source's own line")
        for src in sorted(self.legs):
            a = self.legs[src]
            cov = self.cover[src]
            line = f"  {src:<14} qualified {cov[0]:6d}, on Sleeper {cov[1]:6d} ({100 * cov[1] / max(cov[0], 1):.0f}%) | graded {len(a):6d}"
            for sea in sorted({x[0] for x in a}) + ["ALL"]:
                b = [x for x in a if sea == "ALL" or x[0] == sea]
                if b:
                    m = np.array([x[1] for x in b]); h = np.array([x[2] for x in b], float)
                    line += f" | {sea}: hit {h.mean():.3f} m {m.mean():.2f} ret {100 * (h * m - 1).mean():+.1f}%"
            line += f" | same line {100 * np.mean([x[3] for x in a]):.0f}%"
            print(line)
        print("\nSLIPS: ROI = mean payout - 1 (flat 1u), per season; max drawdown (u) and losing days over the slates the slip ran")
        rows = []
        for (src, order, k, st), v in self.slips.items():
            pays = np.array([x[2] for x in v])
            seas = {}
            for sea in sorted({x[0] for x in v}):
                b = np.array([x[2] for x in v if x[0] == sea])
                seas[sea] = (len(b), 100 * (b.mean() - 1))
            pl = pays - 1
            c = np.cumsum(pl)
            dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(c) else 0.0
            rows.append((src, order, k, st, len(v), 100 * (pays.mean() - 1), seas, dd, 100 * float(np.mean(pl < 0)), float(np.mean(pays > 0))))
        for src in sorted({r[0] for r in rows}):
            print(f"\n  == {src}")
            for r in sorted([r for r in rows if r[0] == src], key=lambda r: (r[1], r[3], r[2])):
                print(f"    {r[1]:<3} {r[3]:<9} {r[2]}p: {r[4]:5d} slips | ROI {r[5]:+6.1f}% | " +
                      " | ".join(f"{s} {n} {roi:+.0f}%" for s, (n, roi) in r[6].items()) +
                      f" | cashed {100 * r[9]:.0f}% | max dd {r[7]:.1f}u | losing slips {r[8]:.0f}%")
        good = [r for r in rows if r[5] > 0 and all(x[1] > 0 for x in r[6].values()) and r[4] >= 100]
        print(f"\nPOSITIVE IN EVERY SEASON (>= 100 slips): {len(good)}")
        for r in sorted(good, key=lambda r: -r[5])[:40]:
            print(f"  {r[0]} {r[1]} {r[3]} {r[2]}p: {r[4]} slips ROI {r[5]:+.1f}% | " + " | ".join(f"{s} {roi:+.0f}%" for s, (n, roi) in r[6].items()))


# ------------------------------------------------------------------------------------------------------------- UNDERDOG T
def ud_lists(rows, legs_ud):
    """{unit: (ordered qualified legs, game cap)} on one slate, each unit's own rule (ud_portfolio_t / build_ud_slip_engine)"""
    import ud_portfolio_t as PT
    E = AF.E
    raw = PT.raw_legs(rows)
    out = {}
    for uid, (kind, prm, size, _st) in PT.UNITS.items():
        if kind == "doc":
            pool = E.eligible_legs(rows)
            praw = {(x["player"], x["prop"], x["side"], x["line"]): x["p"] for x in raw}
            c, seen = [], set()
            for l in E.candidates_for(prm, pool):           # the doc rule's qualified legs in its own order
                if l["player"] in seen:
                    continue
                seen.add(l["player"])
                c.append({"player_id": l["player_id"], "prop": l["prop"], "side": l["side"], "line": float(l["line"]), "event_id": l["event_id"],
                          "p": praw.get((l["player"], l["prop"], l["side"], float(l["line"])), 0.5)})
            out[uid] = (c, 1)
            continue
        pool_, side, ps, fl, gc, sk = prm
        pset = PT.PROPSETS[ps]
        base = [l for l in raw if l["tier"] in PT.POOLS[pool_] and l["side"] in PT.SIDES[side] and (pset is None or PT.GRP.get(l["prop"]) in pset)]
        out[uid] = ([l for l in sorted(base, key=lambda l: -l["p"] * l["m"]) if l["p"] >= fl][sk:], gc)
    return out


def run_ud(conn, days, pricer_cls, bk):
    for i, d in enumerate(days):
        st = AF.box(conn, d)
        if not st:
            continue
        legs, rows = AF.load_ud(conn, d, st)
        if not legs:
            continue
        pr = pricer_cls(conn, d)
        s = AF.season_of(d)
        for uid, (c, gc) in ud_lists(rows, legs).items():
            bk.day(s, d, "UD-" + uid, c, gc, pr)
        if i % 40 == 39:
            conn.close(); conn = connect()
        if i % 30 == 0:
            log(f"UD slate {i + 1}/{len(days)} {d}")
    return conn


# ------------------------------------------------------------------------------------------------------------- PRIZEPICKS B
def pp_lists(prep):
    import portfolio_b as PB
    out = {}
    for uid in PB.UNITS:
        c, gc, _pc = PB.candidates(prep, uid)
        out[uid] = (c, gc)
    return out


def run_pp_hist(conn, bk):
    import portfolio_b as PB
    import research_pp_calibrated_slips as RC
    days = RC.load(conn)
    from final_hp_board_cal import PROPS as CAL
    pid = {}
    for name, p in conn.execute("""SELECT DISTINCT l.player, nm.player_id::text FROM nba_score.tier_map_legs l
                                   JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(l.player)
                                   WHERE l.season = ANY(%s)""", (list(RC.SEASONS),)).fetchall():
        pid[name] = p
    order = sorted(days, key=lambda k: k[1])
    if SMOKE:
        order = order[::8]
    tr = PB.Trailing()
    log(f"PP history slates {len(order)}, players mapped {len(pid)}")
    for i, k in enumerate(order):
        legs = [dict(l, player_id=pid.get(l["player"])) for l in days[k] if l["prop"] in CAL and l["p"] is not None and l["team_id"] is not None]
        legs.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], float(l["line"]), l["tier"]))
        prep = PB.prepare(legs, tr.rates())
        pr = HistPricer(conn, k[1])
        for uid, (c, gc) in pp_lists(prep).items():
            bk.day(k[0], k[1], "PP-" + uid, c, gc, pr)
        tr.push(legs)
        if i % 40 == 39:
            conn.close(); conn = connect()
        if i % 30 == 0:
            log(f"PP slate {i + 1}/{len(order)} {k[1]}")
    return conn


def run_pp_live(conn, days, bk, P):
    import live_slip_engine as L
    import portfolio_b as PB
    for d in days:
        live = L.load_board_legs_live(conn, d)
        lpool = [dict(l, p=float(l["score"]), cell=f"{l['prop']}_{l['tier']}") for l in live
                 if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
        if not lpool:
            continue
        prep = PB.prepare(lpool, L.pb_rates(conn, d))
        pr = LivePricer(conn, d)
        for uid, (c, gc) in pp_lists(prep).items():
            bk.day("2026-27", d, "PP-" + uid, c, gc, pr)
        log(f"PP live {d}: {len(prep)} legs")


def main():
    conn = connect()
    bk = Book()
    log(f"part {PART}")
    if PART == "hist_ud":
        days = [d for d in AF.slate_days(conn) if AF.season_of(d) != "2026-27"]
        conn = run_ud(conn, days[::8] if SMOKE else days, HistPricer, bk)
    elif PART == "hist_pp":
        conn = run_pp_hist(conn, bk)
    else:
        today = dt.datetime.now(AF.UDL.PT).date()
        days = [d for d in AF.slate_days(conn) if AF.season_of(d) == "2026-27" and dt.date(2026, 10, 20) <= d < today]
        conn = run_ud(conn, days, LivePricer, bk)
        run_pp_live(conn, days, bk)
    bk.report()
    log("done")


if __name__ == "__main__":
    main()
