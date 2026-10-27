#!/usr/bin/env python3
"""
RESEARCH - PRIZEPICKS 2-PICK POWER RULES: HISTORY + THIS SEASON + TODAY (2026-10-27; owner 14:37 PT "Do one last try. Smaller leaps,
just two picks. Different prop lines, different variations, different combinations ... Especially things that have held in the
previous few days for this season, but also positive in the previous seasons overall"). READ-ONLY.

LEGS: history = the certified research legs (research_portfolio_caps / portfolio_b.prepare, 309 slates 2024-25 + 2025-26); this
season = every graded 2026-27 slate's live window board as the engine reads it (live_slip_engine.load_board_legs_live -> calibrated
legs, final_hp as p), graded here on the box score (DNP / push = void, the slip pays the smaller structure per PrizePicks); today =
today's board. PAY: PrizePicks payout v3 (goblin / demon factors) via research_portfolio_caps.grade.
RULES (2-pick Power, n slips a slate from distinct players):
  lines   R | G (goblin) | D (demon) | R+G | R+D | ALL
  props   all | each of the 12 props | combos | low-volume | no-low-volume | points+rebounds+assists (singles) 
  side    both | Over | Under
  rank    final_hp | final_hp x factor | trailing cell hit | blend (half final_hp, half trailing)
  floor   final_hp >= .50 .. .80 (step .03)
  skip    top 0 / 1 / 2
  game    the 2 legs from different games | same game allowed (2 teams still required)
  slips   1 / 2 / 3 a slate
REPORT: rules with >= 60 history slips, positive in BOTH history seasons and positive this season (>= 6 slips), ranked by the worst of
(2024-25, 2025-26, 2026-27) ROI lower bound; the OUT-OF-SAMPLE check (top rules by 2024-25 -> their 2025-26 and 2026-27 ROI);
for each shown rule the slip it builds on today's board. Env: DATABASE_URL, TP_DAY (today PT).
"""
import datetime as dt
import itertools
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                             # noqa: E402
import research_portfolio_caps as PC                 # noqa: E402
import live_slip_engine as L                         # noqa: E402

HIST = PC.HIST
CUR = "2026-27"
TIERS = {"R": lambda t: t == "R", "G": lambda t: t.startswith("G"), "D": lambda t: t.startswith("D"),
         "RG": lambda t: t == "R" or t.startswith("G"), "RD": lambda t: t == "R" or t.startswith("D"), "ALL": lambda t: True}
ALLP = ["points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "stocks", "pra", "pts_reb", "pts_ast", "reb_ast"]
PROPS = {"all": None, "combos": {"pra", "pts_reb", "pts_ast", "reb_ast"}, "lowvol": {"steals", "blocks", "turnovers", "stocks"},
         "nolowvol": {"points", "rebounds", "assists", "threes_made", "pra", "pts_reb", "pts_ast", "reb_ast"},
         "singles": {"points", "rebounds", "assists"}}
PROPS.update({p: {p} for p in ALLP})
SIDES = {"B": ("Over", "Under"), "O": ("Over",), "U": ("Under",)}
RANKS = ("p", "ev", "trail", "blend")
FLOORS = tuple(round(x, 2) for x in np.arange(0.50, 0.81, 0.03))
SKIPS = (0, 1, 2)
GCS = (1, 2)
NSL = (1, 2, 3)


def key(l):
    return (str(l["player"]), l["prop"], l["side"], float(l["line"]), l["tier"])


def lb(x):
    x = np.asarray(x, float)
    if not len(x):
        return -9.0
    return x.mean() - (x.std(ddof=1) / np.sqrt(len(x)) if len(x) > 1 else 1.0)


def pick2(c, gc, banned):
    a = None
    for l in c:
        if l["player"] in banned:
            continue
        if a is None:
            a = l
            continue
        if l["player"] == a["player"] or (gc == 1 and l["event_id"] == a["event_id"]) or l["team_id"] == a["team_id"]:
            continue
        return [a, l]
    return None


def live_slates(conn, today):
    """this season's graded slates: [(date, prepared legs with hit)]"""
    s0, _ = L.regular_season_window(conn, today)
    days = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_score.final_hp WHERE game_date >= %s AND game_date < %s ORDER BY 1",
                                       (s0, today)).fetchall()]
    out = []
    for d in days:
        legs = [dict(l, p=float(l["score"])) for l in L.load_board_legs_live(conn, d)
                if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
        if not legs:
            continue
        box = {}
        for pid, pts, reb, ast, fg3m, stl, blk, tov, mins in conn.execute(
                "SELECT nba_player_id::text, pts, reb, ast, fg3m, stl, blk, tov, min FROM nba_stats.player_game_log WHERE game_date=%s", (d,)).fetchall():
            if mins and float(mins) > 0:
                box[pid] = tuple(float(x or 0) for x in (pts, reb, ast, fg3m, stl, blk, tov))
        if not box:
            continue
        for l in legs:
            s = box.get(str(l.get("player_id")))
            v = L._STAT[l["prop"]](s) if (s is not None and l["prop"] in L._STAT) else None
            l["hit"] = None if (v is None or v == float(l["line"])) else int((v > float(l["line"])) if l["side"] == "Over" else (v < float(l["line"])))
        prep = PB.prepare(legs, L.pb_rates(conn, d))
        out.append((d, prep))
    return out


def main():
    today = dt.date.fromisoformat(os.environ.get("TP_DAY") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat())
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    for k in horder:
        days[k].sort(key=key)
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    tr = PB.Trailing()
    slates = []                                   # (season, date, prepared legs, games)
    for k in horder:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        slates.append((k[0], k[1], PB.prepare(legs, tr.rates()), len({l["event_id"] for l in legs})))
        tr.push(legs)
    for d, prep in live_slates(conn, today):
        slates.append((CUR, d, prep, len({l["event_id"] for l in prep})))
    tlegs = [dict(l, p=float(l["score"])) for l in L.load_board_legs(conn, today)
             if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
    tprep = PB.prepare(tlegs, L.pb_rates(conn, today))
    cnt = defaultdict(int)
    for s, *_ in slates:
        cnt[s] += 1
    print(f"slates: {dict(cnt)}; today {today}: {len(tprep)} eligible legs, {len({l['event_id'] for l in tprep})} games", flush=True)

    res = defaultdict(lambda: defaultdict(list))   # rule -> season -> [(slate index, multiplier)]
    todays = {}
    allsl = list(enumerate(slates)) + [(-1, ("TODAY", today, tprep, 0))]
    for si, (season, d, prep, ng) in allsl:
        memo = {}
        for tk, pk, sk_, rk in itertools.product(TIERS, PROPS, SIDES, RANKS):
            tf, pset, sides = TIERS[tk], PROPS[pk], SIDES[sk_]
            base = [l for l in prep if tf(l["tier"]) and l["side"] in sides and (pset is None or l["prop"] in pset)]
            if len(base) < 2:
                continue
            if rk == "p":
                base.sort(key=lambda l: -l["p"])
            elif rk == "ev":
                base.sort(key=lambda l: -l["p"] * float(l["factor"] or 1))
            elif rk == "trail":
                base.sort(key=lambda l: (-l["_trail"], -l["p"]))
            else:
                base.sort(key=lambda l: -l["_blend"])
            for fl in FLOORS:
                c0 = [l for l in base if l["p"] >= fl]
                if len(c0) < 2:
                    break
                for skp, gc in itertools.product(SKIPS, GCS):
                    c = c0[skp:]
                    banned, slips = set(), []
                    for _ in range(max(NSL)):
                        s = pick2(c, gc, banned)
                        if s is None:
                            break
                        slips.append(s); banned |= {s[0]["player"], s[1]["player"]}
                    if not slips:
                        continue
                    for ns in NSL:
                        rule = (tk, pk, sk_, rk, fl, skp, gc, ns)
                        if si == -1:
                            todays[rule] = slips[:ns]
                            continue
                        for s in slips[:ns]:
                            mk = (id(s[0]), id(s[1]))
                            if mk not in memo:
                                memo[mk] = PC.grade(s, "power")
                            res[rule][season].append((si, memo[mk]))
        if si % 50 == 0:
            print(f"  slate {si} {season} {d}: {len(res)} rules so far", flush=True)

    def st(rule, season):
        x = [m - 1 for _, m in res[rule].get(season, [])]
        return len(x), (float(np.mean(x)) if x else 0.0), lb(x)

    def small(rule):
        x = [m - 1 for s in HIST for si, m in res[rule].get(s, []) if slates[si][3] <= 5]
        return len(x), (float(np.mean(x)) if x else 0.0)

    def lab(r):
        tk, pk, sk_, rk, fl, skp, gc, ns = r
        return f"lines {tk:<3} props {pk:<11} side {sk_} rank {rk:<5} p>={fl:.2f} skip {skp} {'diff games' if gc == 1 else 'same game ok'} {ns} slip(s)"

    def row(r):
        h0, h1, c = st(r, HIST[0]), st(r, HIST[1]), st(r, CUR)
        sm = small(r)
        tdy = todays.get(r)
        t = (" | TODAY: " + " || ".join(" + ".join(f"{l['player']} {l['prop']} {l['side']} {float(l['line']):g} [{l['tier']}] {100 * l['p']:.0f}%"
                                                  for l in s) for s in tdy)) if tdy else " | TODAY: no slip"
        return (f"{lab(r)} | {HIST[0]} {100 * h0[1]:+5.0f}% ({h0[0]}) {HIST[1]} {100 * h1[1]:+5.0f}% ({h1[0]}) | THIS SEASON {100 * c[1]:+5.0f}% "
                f"({c[0]}) | <=5-game slates {100 * sm[1]:+4.0f}% ({sm[0]})" + t)

    print(f"\n{len(res)} rules")
    print("\n== OUT OF SAMPLE: top 300 rules by 2024-25 lower bound (>= 40 slips) -> 2025-26 and this season")
    top = sorted([r for r in res if st(r, HIST[0])[0] >= 40], key=lambda r: -st(r, HIST[0])[2])[:300]
    for s in (HIST[1], CUR):
        v = [st(r, s) for r in top if st(r, s)[0] >= 5]
        print(f"   {s}: {sum(1 for x in v if x[1] > 0)} of {len(v)} positive, mean ROI {100 * np.mean([x[1] for x in v]) if v else 0:+.1f}% "
              f"(2024-25 mean {100 * np.mean([st(r, HIST[0])[1] for r in top]):+.1f}%)")
    top2 = sorted([r for r in res if st(r, HIST[1])[0] >= 40], key=lambda r: -st(r, HIST[1])[2])[:300]
    for s in (HIST[0], CUR):
        v = [st(r, s) for r in top2 if st(r, s)[0] >= 5]
        print(f"   (picked on 2025-26) {s}: {sum(1 for x in v if x[1] > 0)} of {len(v)} positive, mean ROI {100 * np.mean([x[1] for x in v]) if v else 0:+.1f}%")

    print("\n== HELD EVERYWHERE: >= 30 slips each history season, positive in 2024-25, 2025-26 AND this season (>= 6 slips) - by the worst"
          " season's lower bound (top 40)")
    ok = [r for r in res if st(r, HIST[0])[0] >= 30 and st(r, HIST[1])[0] >= 30 and st(r, CUR)[0] >= 6
          and all(st(r, s)[1] > 0 for s in (HIST[0], HIST[1], CUR))]
    ok.sort(key=lambda r: -min(st(r, s)[2] for s in (HIST[0], HIST[1], CUR)))
    seen, shown = set(), 0
    for r in ok:
        sig = tuple(round(st(r, s)[1], 3) for s in (HIST[0], HIST[1], CUR))
        if sig in seen:
            continue
        seen.add(sig); shown += 1
        print("   " + row(r))
        if shown >= 40:
            break
    print(f"   ({len(ok)} rules qualify)")
    print("\n== SAME, BUT ALSO POSITIVE ON <= 5-GAME HISTORY SLATES (>= 20 slips) - top 20")
    ok2 = [r for r in ok if small(r)[0] >= 20 and small(r)[1] > 0]
    seen, shown = set(), 0
    for r in ok2:
        sig = tuple(round(st(r, s)[1], 3) for s in (HIST[0], HIST[1], CUR))
        if sig in seen:
            continue
        seen.add(sig); shown += 1
        print("   " + row(r))
        if shown >= 20:
            break
    print(f"   ({len(ok2)} rules qualify)")
    print("\ndone", flush=True)


if __name__ == "__main__":
    main()
