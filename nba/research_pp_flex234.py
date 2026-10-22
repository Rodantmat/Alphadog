#!/usr/bin/env python3
"""
RESEARCH - EVERYTHING AGAIN FOR PRIZEPICKS 2-, 3- AND 4-PICK FLEX (Power alongside), BOTH CERTIFIED SEASONS + THE 2026-27 OPENING
DAYS (2026-10-22 PT; owner 10:16 PT: "aim for 2, 3, and 4 pick flex ... which prop line strategy ... run everything again on both
seasons ... including the last 2 days ... see what holds ... and see if it holds back to the other 2 seasons ... All demons, all
goblins, regulars, all prop lines, all variations, all goblin and demon tiers ... all strategies ... No exception").  READ-ONLY.

ONE GRADER for every slip: build_slip_engine.grade (grader v3: all-standard Power / Flex tables, Power with alternates
power_alt_v3, 3-6-pick Flex with alternates = PrizePicks' quote tiers flex_alt_tiers, same-game Flex / Power rules, voids revert).
2-PICK FLEX WITH A GOBLIN / DEMON has no production tier (the certified tables graded it as a certain loss): here it is priced
from PrizePicks' own 2-pick Flex quotes (research_exhaustive_pp.install_flex2_alt, nba_market.pp_mined_leg, conservative
envelope) - printed below so the multipliers are visible.

PERIODS: 2024-25 and 2025-26 (regular season, final 7 days out - never staked) and LIVE = the 2026-27 days in PF_LIVE_DAYS
(default 2026-10-20, 2026-10-21): the real PrizePicks window board, the live final_hp, PrizePicks' leg prices (pp_leg_price),
graded on the real box scores (nba_market.board_outcomes). Live alternate LESS legs are PrizePicks' real Less rungs.

PART 1  EVERY CERTIFIED COMPOSITION (build_slip_engine: core, regular, best, demon, mixed_tier, core+goblin, core+demon, every
        single cell, every weighted cell) x 2 / 3 / 4 picks x Flex / Power x cap 1 / 2 / 3: history = the live engine's twin
        (slip_engine_slips_wo and _wo_nosteals) RE-GRADED here (2-pick Flex alternates now priced); live = the same engine
        functions run on the live boards.
PART 2  EVERY BUCKET PATTERN of 2 / 3 / 4 legs (research_exhaustive_pp: regular DEF / PTS / REB / OTH x More / Less, goblins,
        demons, goblin Less, demon Less), out of sample both directions (cell values learned on the other season), and live
        (cell values learned on both seasons).
PART 3  EVERY SINGLE CELL = one prop line strategy: prop x tier (R, G1-G3, D1-D3, goblin / demon Less) x side x rank key x
        top-n, its own best legs, 2 / 3 / 4 picks, Flex / Power, one slip a day - per season and live.
PART 4  LEGS: per cell the leg hit rate and value e = mean(hit x factor) per season and live - does the leg-level edge hold.
Verdict columns: ROI and 5th-percentile ROI (day bootstrap) per season; "HOLDS" = positive in both seasons with LB5 > 0 in both.
The live days are 2 slates: they can contradict, never confirm (1-3 slips per strategy).
Env: DATABASE_URL, PF_LIVE_DAYS, PF_BOOT (1000), PF_TOP (40).
"""
import datetime as dt
import json
import os
import re
import sys
import time
import unicodedata
from collections import defaultdict

os.environ.setdefault("EX_SIZES", "2,3,4")
import numpy as np   # noqa: E402
import psycopg       # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE          # noqa: E402
import research_exhaustive_pp as EX     # noqa: E402
import live_slip_engine as L            # noqa: E402

LIVE_DAYS = [dt.date.fromisoformat(x) for x in (os.environ.get("PF_LIVE_DAYS") or "2026-10-20,2026-10-21").split(",") if x]
BOOT = int(os.environ.get("PF_BOOT") or "1000")
TOP = int(os.environ.get("PF_TOP") or "40")
SEASONS = ("2024-25", "2025-26")
SIZES = (2, 3, 4)
STRUCTS = ("flex", "power")
MK = {"points": "player_points", "rebounds": "player_rebounds", "assists": "player_assists", "threes_made": "player_threes",
      "steals": "player_steals", "blocks": "player_blocks", "turnovers": "player_turnovers", "stocks": "player_blocks_steals",
      "pts_reb": "player_points_rebounds", "pts_ast": "player_points_assists", "reb_ast": "player_rebounds_assists",
      "pra": "player_points_rebounds_assists", "fantasy_score": "player_fantasy_points"}


def norm(x):
    x = unicodedata.normalize("NFKD", str(x or "")).encode("ascii", "ignore").decode().lower()
    x = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", x)
    return re.sub(r"[^a-z]", "", x)


def lb5(daily_profit, daily_stake, seed=7):
    p, s = np.asarray(daily_profit, float), np.asarray(daily_stake, float)
    if len(p) < 5 or s.sum() <= 0:
        return None
    idx = np.random.default_rng(seed).integers(0, len(p), size=(BOOT, len(p)))
    den = s[idx].sum(1)
    return float(np.percentile(np.where(den > 0, p[idx].sum(1) / np.maximum(den, 1e-9), 0), 5))


class Acc:
    """per (key, period): daily stake / profit, slips, full hits"""
    def __init__(self):
        self.d = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0, 0]))

    def add(self, key, period, day, pay, full):
        a = self.d[(key, period)][day]
        a[0] += 1.0
        a[1] += pay - 1.0
        a[2] += 1
        a[3] += int(full)

    def stats(self, key, period, with_lb=True):
        days = self.d.get((key, period))
        if not days:
            return None
        st = sum(v[0] for v in days.values())
        pr = sum(v[1] for v in days.values())
        out = {"slips": int(st), "days": len(days), "roi": pr / st, "full": sum(v[3] for v in days.values()) / st}
        if with_lb:
            out["lb5"] = lb5([v[1] for v in days.values()], [v[0] for v in days.values()])
        return out


# ------------------------------------------------------------------------------------------------------------------ LIVE LEGS
def live_legs(conn, day, outcomes):
    """the live board of `day` exactly as the live engine reads it (live_slip_engine.BOARD_SQL), but WITH PrizePicks' alternate Less
    rungs; one row per rank key (engine shape) + one aggregated leg per rung (pattern / cell shape); hit from board_outcomes"""
    sql = L.BOARD_SQL.replace("AND NOT (p.kind <> 'standard' AND lower(p.side) LIKE 'u%%')", "AND true")
    if sql == L.BOARD_SQL:
        raise SystemExit("live board SQL changed - the alternate-Less filter was not found (refusing to guess)")
    rows = conn.execute(sql.format(price_cols="f.final_hp::float, f.baseline_hp::float, f.score::float", price_src="nba_score.final_hp f",
                                   price_where="f.final_hp IS NOT NULL AND f.score IS NOT NULL"),
                        ("window", day, day, day, "window", day, day)).fetchall()
    rk_rows, miss_team, nohit = [], 0, defaultdict(int)
    for pid, player, prop, side, line, price, kind, t3, s_final, s_base, s_score, team, event in rows:
        if team is None or event is None:
            miss_team += 1
            continue
        less_alt = kind != "standard" and str(side).lower().startswith("u")
        if less_alt:
            # PrizePicks names a Less alternate from the PICKER's side (2026-10-20..22 board: 'goblin' Less sits ABOVE the standard
            # line at ~0.83x = the easy Under on a demon rung; 'demon' Less sits BELOW it at ~1.19x = the hard Under on a goblin
            # rung). The history buckets are named by the RUNG (UG = Under on a goblin rung, UD = Under on a demon rung), so the
            # live label is flipped here to compare like with like.
            base = ("D" if kind == "goblin" else "G") + str(t3)
        else:
            base = "R" if kind == "standard" else ("G" if kind == "goblin" else "D") + str(t3)
        tier = ("U" + base) if less_alt else base
        res = outcomes.get((day, norm(player), MK.get(prop, "player_" + prop), round(float(line), 1)))
        if res in ("over_win", "under_win"):
            hit = int((res == "over_win") == str(side).lower().startswith("o"))
        else:
            hit = None
            nohit[(prop, res or "no outcome")] += 1
        if less_alt and not os.environ.get("PF_LIVE_LESS_ARCHIVE"):
            # the archive's Less price sums to ~1.049 with its More twin, PrizePicks' quotes to ~0.99: shift the implied probability
            # by the difference and apply the history rule's x0.97, so live and history Less legs are priced the same way
            price = 0.97 * 0.5 / max(0.03, 0.5 / float(price) - (1.049 - 0.99))
        for rk, s in (("final_hp", s_final), ("baseline_hp", s_base), ("final_score", s_score)):
            rk_rows.append({"rank_key": rk, "season": "2026-27", "game_date": day, "player": player, "player_id": pid, "prop": prop,
                            "tier": tier, "side": side, "line": float(line), "factor": float(price), "hit": hit, "n_rank": None,
                            "score": float(s), "team_id": team, "event_id": event, "pf20": None})
    groups = defaultdict(list)
    for r in rk_rows:
        groups[(r["rank_key"], r["prop"], r["tier"])].append(r)
    for g in groups.values():
        g.sort(key=lambda r: (-r["score"], r["player"], r["side"], r["line"]))
        for i, r in enumerate(g, 1):
            r["n_rank"] = i
    agg = {}
    for r in rk_rows:
        k = (r["player"], r["prop"], r["tier"], r["side"], r["line"])
        a = agg.setdefault(k, {"season": "2026-27", "game_date": day, "player": r["player"], "prop": r["prop"], "tier": r["tier"],
                               "side": r["side"], "line": r["line"], "factor": r["factor"], "hit": r["hit"], "score": None,
                               "n_fs": None, "n_fh": None, "n_bh": None, "team_id": r["team_id"], "event_id": r["event_id"]})
        a[EX.RK[r["rank_key"]]] = r["n_rank"]
        if r["rank_key"] == "final_score":
            a["score"] = r["score"]
    legs = [a for a in agg.values() if min(x for x in (a["n_fs"], a["n_fh"], a["n_bh"]) if x is not None) <= 10]
    print(f"  live {day}: {len(rows):,} priced board rows -> {len(agg):,} rungs ({len(legs):,} top-10 under some rank key); "
          f"team/event unresolved {miss_team}; graded {sum(1 for a in agg.values() if a['hit'] is not None):,}; "
          f"ungraded by (prop, reason): {dict(sorted(nohit.items(), key=lambda kv: -kv[1])[:12])}", flush=True)
    return rk_rows, legs


def build_cell(day_cell_legs, size):
    """one slip from a cell's best legs (already sorted): one leg per player, >= 2 teams, <= 2 legs from one game"""
    used, games, slip = set(), defaultdict(int), []
    for l in day_cell_legs:
        if l["player"] in used or games[l["event_id"]] >= EX.MAX_SG:
            continue
        slip.append(l)
        used.add(l["player"])
        games[l["event_id"]] += 1
        if len(slip) == size:
            break
    if len(slip) < size or len({l["team_id"] for l in slip}) < 2:
        return None
    return slip


def fmt(s):
    if not s:
        return "            -            "
    lb = "   n/a" if s.get("lb5") is None else f"{100 * s['lb5']:+6.1f}"
    return f"n{s['slips']:>4} {100 * s['roi']:+7.1f}% lb{lb}%"


def main():
    t0 = time.time()
    url = os.environ["DATABASE_URL"]
    conn = psycopg.connect(url)
    conn.execute("SET statement_timeout = 0")
    EX.install_flex2_alt(conn)
    print("MULTIPLIERS IN USE (grader v3 + 2-pick Flex quotes), all-hit / one miss:")
    for fp, lab in ((1.0, "all standard"), (0.73, "goblin-ish fp 0.73"), (0.55, "two goblins fp 0.55"), (1.37, "demon-ish fp 1.37"), (1.9, "demon fp 1.9")):
        for k in SIZES:
            alt = abs(fp - 1.0) > 1e-9
            print(f"  {k}-Flex {lab:<20} -> {SE.pp_payout(k, k, 'flex', fp, alt):.2f} / {SE.pp_payout(k, k - 1, 'flex', fp, alt):.2f}"
                  f"   | {k}-Power -> {SE.pp_payout(k, k, 'power', fp, alt):.2f}")

    # ---------------------------------------------------------------- data
    outcomes = {}
    for d, pl, mk, line, res in conn.execute("""SELECT game_date, player, regexp_replace(market_key, '_alternate$', ''), line::float8, leg_result
                                                FROM nba_market.board_outcomes WHERE game_date = ANY(%s::date[])""", (LIVE_DAYS,)).fetchall():
        outcomes[(d, norm(pl), mk, round(line, 1))] = res
    live_rk, live = {}, []
    for d in LIVE_DAYS:
        rk_rows, legs = live_legs(conn, d, outcomes)
        live_rk[d] = rk_rows
        live += legs
    cur = conn.execute(EX.LEG_SQL)
    cols = [c.name for c in cur.description]
    hist = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur = conn.execute(EX.ALT_LESS_SQL)
    cols = [c.name for c in cur.description]
    alt = [dict(zip(cols, r)) for r in cur.fetchall()]
    alt = [r for r in alt if EX.less_open(r["f_over"], r["tier"])]
    # SIMULATED LESS PRICE. PrizePicks' OWN quotes (pp_mined_leg, More and Less of the same projection in the same run, 75 pairs):
    # 0.5 / f_more + 0.5 / f_less = 0.980 (demon rungs) / 0.989 (goblin rungs), range 0.942-1.005 - the research_exhaustive_pp rule
    # (sum 0.99, then x0.97) stands. The ARCHIVE's model price for a live Less leg (pp_leg_price) sums to 1.046-1.050 - it pays a
    # Less leg ~5-15% BELOW PrizePicks. PF_LESS_PSUM set = price with that sum instead (sensitivity: 1.049 = the archive's model).
    psum_env = os.environ.get("PF_LESS_PSUM")
    for r in alt:
        if psum_env:
            fq = r.pop("f_over") * EX.QUOTE_LIFT[r["tier"][1]]      # tier 'UG1' / 'UD2' -> the rung kind G / D
            r["factor"] = 0.5 / max(0.03, float(psum_env) - min(0.97, 0.5 / fq))
        else:
            r["factor"] = EX.less_price(r.pop("f_over"), r["tier"])
        st_ = r.pop("stat_actual")
        r["hit"] = None if st_ is None or st_ == r["line"] else int(st_ < r["line"])
    hist += alt
    last = {s: max(r["game_date"] for r in hist if r["season"] == s) for s in SEASONS}
    hist = [r for r in hist if (last[r["season"]] - r["game_date"]).days > 7]
    by = {s: [r for r in hist if r["season"] == s] for s in SEASONS}
    print(f"history legs: {', '.join(f'{s} {len(by[s]):,}' for s in SEASONS)} (goblin / demon Less SIMULATED in history: {len(alt):,}) | "
          f"live legs {len(live):,} | {time.time() - t0:.0f}s", flush=True)
    PER = SEASONS + ("LIVE",)

    # ---------------------------------------------------------------- PART 4 legs (cells)
    def cells_of(l):
        for rk, col in EX.RK.items():
            n_r = l[col]
            if n_r is None:
                continue
            for n in EX.NS:
                if n_r <= n:
                    yield (l["prop"], l["tier"], l["side"], rk, n)
    leg = defaultdict(lambda: [0, 0, 0.0])
    for per, legs in (("2024-25", by["2024-25"]), ("2025-26", by["2025-26"]), ("LIVE", live)):
        for l in legs:
            if l["hit"] is None:
                continue
            for c in cells_of(l):
                a = leg[(c, per)]
                a[0] += 1
                a[1] += l["hit"]
                a[2] += l["hit"] * l["factor"]

    # ---------------------------------------------------------------- PART 3 single cells
    cells = sorted({c for (c, per) in leg if per in SEASONS})
    cellacc = Acc()
    per_day = defaultdict(list)
    for l in by["2024-25"] + by["2025-26"] + live:
        per_day[(l["season"] if l["season"] in SEASONS else "LIVE", l["game_date"])].append(l)
    for (per, d), dlegs in per_day.items():          # one day at a time (memory)
        cm = defaultdict(list)
        for l in dlegs:
            for c in cells_of(l):
                cm[c].append(l)
        for c, lst in cm.items():
            col = EX.RK[c[3]]
            lst.sort(key=lambda r: (r[col], r["player"]))
            for size in SIZES:
                if c[4] < size:
                    continue
                slip = build_cell(lst, size)
                if slip is None:
                    continue
                has_alt = any(abs(x["factor"] - 1.0) > 1e-9 for x in slip)
                for st in STRUCTS:
                    if st == "flex" and size == 2 and has_alt and not EX.FLEX2_ON:
                        continue
                    hits, pay = SE.grade(slip, st)
                    cellacc.add((c, size, st), per, d, pay, hits == size)
    print(f"PART 3 cells built | {time.time() - t0:.0f}s", flush=True)

    # ---------------------------------------------------------------- PART 2 bucket patterns
    A = EX.run_direction([dict(r) for r in by["2024-25"]], [dict(r) for r in by["2025-26"]], "train 24-25 -> test 25-26")
    B = EX.run_direction([dict(r) for r in by["2025-26"]], [dict(r) for r in by["2024-25"]], "train 25-26 -> test 24-25")
    LV = EX.run_direction([dict(r) for r in hist], [dict(r) for r in live], "train both seasons -> LIVE")

    # ---------------------------------------------------------------- PART 1 certified compositions
    compacc = Acc()
    for table in ("nba_score.slip_engine_slips_wo", "nba_score.slip_engine_slips_wo_nosteals"):
        q = conn.execute(f"""SELECT season, game_date, composition, size, structure, k, legs_json, same_game FROM {table}
                             WHERE size IN (2, 3, 4) AND k <= 3 AND phase <> 'final7'""")
        n = 0
        for season, d, comp, size, st, k, legs, sg in q:
            sl = [{"hit": x.get("hit"), "factor": float(x.get("factor") or 1.0)} for x in legs]
            hits, pay = SE.grade(sl, st, same_game=bool(sg and sg > 0))
            half = f"{season} {'H1' if d < dt.date(int(season[:4]) + 1, 1, 15) else 'H2'}"     # half-season stability (PART 1b)
            for cap in (1, 2, 3):
                if k <= cap:
                    compacc.add((table.split("slips")[1] or "_wo", comp, size, st, cap), season, d, pay, hits == size)
                    compacc.add((table.split("slips")[1] or "_wo", comp, size, st, cap), half, d, pay, hits == size)
            n += 1
        print(f"PART 1 history {table}: {n:,} slips re-graded | {time.time() - t0:.0f}s", flush=True)
    cmap = SE.load_corr(conn)
    comps = (["core", "regular", "best", "demon", "mixed_tier", "core+goblin", "core+demon"]
             + [f"single:{c}" for c in SE.CELLS if c != "goblin"] + [f"weighted:{c}" for c in SE.CORE])
    for d in LIVE_DAYS:
        rows = [r for r in live_rk[d] if not r["tier"].startswith("U")]       # the certified engine never sees alternate Less
        pool = SE.eligible_legs(rows)
        fam = defaultdict(set)
        for c, lst in pool.items():
            for l in lst:
                fam[c.replace("_U", "")].add(l["player"])
        broad = sum(1 for v in fam.values() if len(v) >= 2) >= 5
        for comp in comps:
            for size in SIZES:
                for st in STRUCTS:
                    for k, slip in enumerate(SE.build_day_slips(pool, comp, size, st, 3, cmap, broad), 1):
                        games = [l["event_id"] for l in slip]
                        hits, pay = SE.grade(slip, st, same_game=len(games) > len(set(games)))
                        for tab in ("_wo", "_wo_nosteals"):
                            for cap in (1, 2, 3):
                                if k <= cap:
                                    compacc.add((tab, comp, size, st, cap), "LIVE", d, pay, hits == size)

    # ================================================================= REPORT
    def holds(sA, sB):
        return sA and sB and sA["roi"] > 0 and sB["roi"] > 0 and (sA.get("lb5") or -1) > 0 and (sB.get("lb5") or -1) > 0

    print("\n" + "=" * 150 + "\nPART 1 - EVERY CERTIFIED COMPOSITION, 2 / 3 / 4 picks (history re-graded; LIVE = the same engine on 2026-10-20 / 21)")
    for st in STRUCTS:
        for size in SIZES:
            print(f"\n  {size}-pick {st.upper()}            {'2024-25':^28} {'2025-26':^28} {'LIVE (2 slates)':^20}  verdict")
            keys = sorted({k for (k, p) in compacc.d if k[2] == size and k[3] == st})
            rows = []
            for key in keys:
                a, b = compacc.stats(key, "2024-25"), compacc.stats(key, "2025-26")
                lv = compacc.stats(key, "LIVE", with_lb=False)
                if not a or not b or a["slips"] < 30 or b["slips"] < 30:
                    continue
                rows.append((min(a["roi"], b["roi"]), key, a, b, lv))
            rows.sort(key=lambda x: -x[0])
            for _, key, a, b, lv in rows[:TOP]:
                live_txt = f"n{lv['slips']:>2} {100 * lv['roi']:+7.1f}%" if lv else "   no slip   "
                print(f"  {key[0]:<13} {key[1]:<24} cap{key[4]} | {fmt(a)} | {fmt(b)} | {live_txt:<16} | {'HOLDS' if holds(a, b) else ''}")

    print("\n" + "=" * 150 + "\nPART 1b - HALF-SEASON STABILITY of every composition that HOLDS (H1 = before Jan 15, H2 = from Jan 15): "
          "ROI per half, full-hit rate, halves positive of 4")
    halves = [f"{s} {h}" for s in SEASONS for h in ("H1", "H2")]
    for st in STRUCTS:
        for size in SIZES:
            keys = sorted({k for (k, p) in compacc.d if k[2] == size and k[3] == st})
            rows = []
            for key in keys:
                a, b = compacc.stats(key, "2024-25"), compacc.stats(key, "2025-26")
                if not a or not b or a["slips"] < 30 or b["slips"] < 30 or not holds(a, b):
                    continue
                hs = [compacc.stats(key, h, with_lb=False) for h in halves]
                npos = sum(1 for h in hs if h and h["roi"] > 0)
                rows.append((npos, min(h["roi"] if h else -1 for h in hs), key, hs))
            if not rows:
                continue
            rows.sort(key=lambda x: (-x[0], -x[1]))
            print(f"\n  {size}-pick {st.upper()}: {len(rows)} compositions hold | " + " | ".join(f"{h:^22}" for h in halves))
            for npos, _, key, hs in rows:
                htxt = " | ".join(f"n{h['slips']:>4} {100 * h['roi']:+7.1f}% f{h['full']:.2f}" if h else f"{'-':^22}" for h in hs)
                print(f"  {key[0]:<13} {key[1]:<24} cap{key[4]} | {htxt} | {npos}/4")      # never reuse 'cells' (PART 3's list)

    print("\n" + "=" * 150 + "\nPART 2 - EVERY BUCKET PATTERN (out of sample both directions; LIVE learned on both seasons)")
    for st in STRUCTS:
        for size in SIZES:
            rows = []
            for key, a in A.items():
                if key[1] != st or len(key[0]) != size:
                    continue
                b = B.get(key)
                if not b or a["days"] < EX.MIN_DAYS or b["days"] < EX.MIN_DAYS:
                    continue
                ra, rb = a["ret"] / a["stake"] - 1, b["ret"] / b["stake"] - 1
                la, lbb = EX.boot_lb(a["daily"], [1] * len(a["daily"])), EX.boot_lb(b["daily"], [1] * len(b["daily"]))
                lv = LV.get(key)
                rows.append((min(ra, rb), key, a, b, ra, rb, la, lbb, lv))
            rows.sort(key=lambda x: -x[0])
            npos = sum(1 for r in rows if r[4] > 0 and r[5] > 0)
            nhold = sum(1 for r in rows if r[4] > 0 and r[5] > 0 and (r[6] or -1) > 0 and (r[7] or -1) > 0)
            print(f"\n  {size}-pick {st.upper()}: {len(rows)} patterns | positive both directions {npos} | HOLDS (LB5 > 0 both) {nhold}")
            for _, key, a, b, ra, rb, la, lbb, lv in rows[:TOP]:
                lvt = f"n{lv['days']:>2} {100 * (lv['ret'] / lv['stake'] - 1):+7.1f}%" if lv and lv["stake"] else "   no slip   "
                ok = "HOLDS" if ra > 0 and rb > 0 and (la or -1) > 0 and (lbb or -1) > 0 else ""
                print(f"  {'+'.join(key[0]):<28} | test 25-26 n{a['days']:>4} {100 * ra:+7.1f}% lb{100 * (la or 0):+6.1f}% | test 24-25 n{b['days']:>4} "
                      f"{100 * rb:+7.1f}% lb{100 * (lbb or 0):+6.1f}% | LIVE {lvt:<16} | {ok}")

    print("\n" + "=" * 150 + "\nPART 3 - EVERY SINGLE CELL (one prop line strategy: prop / tier / side / rank / top-n), one slip a day")
    for st in STRUCTS:
        for size in SIZES:
            rows = []
            for c in cells:
                key = (c, size, st)
                a, b = cellacc.stats(key, "2024-25"), cellacc.stats(key, "2025-26")
                if not a or not b or a["slips"] < 30 or b["slips"] < 30:
                    continue
                rows.append((min(a["roi"], b["roi"]), c, a, b, cellacc.stats(key, "LIVE", with_lb=False)))
            rows.sort(key=lambda x: -x[0])
            print(f"\n  {size}-pick {st.upper()}: {len(rows)} cells with >= 30 slips in both seasons | positive both "
                  f"{sum(1 for r in rows if r[2]['roi'] > 0 and r[3]['roi'] > 0)} | HOLDS {sum(1 for r in rows if holds(r[2], r[3]))}")
            for _, c, a, b, lv in rows[:TOP]:
                lvt = f"n{lv['slips']:>2} {100 * lv['roi']:+7.1f}%" if lv else "   no slip   "
                print(f"  {c[0]:<12} {c[1]:<4} {c[2]:<5} {c[3]:<11} top{c[4]:<2} | {fmt(a)} | {fmt(b)} | LIVE {lvt:<16} | {'HOLDS' if holds(a, b) else ''}")

    print("\n" + "=" * 150 + "\nPART 4 - LEGS: hit rate and value e = mean(hit x factor) per cell (top-n by its rank key)")
    print("  break-even e (all-standard): 2-Flex 0.598 | 3-Flex 0.578 | 4-Flex 0.559 | 2-Power 0.577 | 3-Power 0.550 | 4-Power 0.562")
    rows = []
    for c in cells:
        a, b, lv = leg.get((c, "2024-25")), leg.get((c, "2025-26")), leg.get((c, "LIVE"))
        if not a or not b or a[0] < 200 or b[0] < 200:
            continue
        rows.append((min(a[2] / a[0], b[2] / b[0]), c, a, b, lv))
    rows.sort(key=lambda x: -x[0])
    for _, c, a, b, lv in rows[:80]:
        lvt = f"n{lv[0]:>4} hit {lv[1] / lv[0]:.3f} e {lv[2] / lv[0]:.3f}" if lv else "   no live legs   "
        print(f"  {c[0]:<12} {c[1]:<4} {c[2]:<5} {c[3]:<11} top{c[4]:<2} | 24-25 n{a[0]:>6} hit {a[1] / a[0]:.3f} e {a[2] / a[0]:.3f} | "
              f"25-26 n{b[0]:>6} hit {b[1] / b[0]:.3f} e {b[2] / b[0]:.3f} | LIVE {lvt}")
    print(f"\ndone in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
