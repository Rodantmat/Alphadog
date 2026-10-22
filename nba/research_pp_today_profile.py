#!/usr/bin/env python3
"""
RESEARCH - DOES TODAY'S BOARD LOOK LIKE 2025-26 OR LIKE 2024-25? (2026-10-22 PT; owner 12:17 PT: "simulate on the board of today
and see if they look like this season or more like the previous season and see which hints and directions it gives us").
READ-ONLY.

The portfolios of research_pp_portfolio_mix.py (PROPOSED at 4 slips / leg cap 2 and at 8 / no cap, LIVE NOW at 8 / no cap) are built
the same way on every history day (the live engine's twin backtest, k = 1..10 per unit) and on the 2026-27 boards of PT_DAYS
(default 2026-10-20, 2026-10-21 and today - today ungraded until its games finish). Per day the slips' PROFILE: legs by prop family,
tier (standard / goblin / demon), side (Under share), mean leg factor, same-game share, overlap (share of slips sharing a leg),
distinct players per leg, slips available; plus the POOL DEPTH (candidate slips per unit, distinct legs among them).
Reference periods: each season's FIRST 30 slate days (the October-November start, the like-for-like comparison for today), the
rest of each season, and every live day. Printed: the mean profile per period, today's distance to each period (each feature
scaled by the pooled day-to-day sd), and the ROI of each portfolio in each season's first 14 / 30 days.
Env: DATABASE_URL, PT_DAYS (2026-10-20,2026-10-21,<today PT>).
"""
import datetime as dt
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

TODAY = dt.datetime.now(ZoneInfo("America/Los_Angeles")).date()
os.environ["PF_LIVE_DAYS"] = os.environ.get("PT_DAYS") or f"2026-10-20,2026-10-21,{TODAY.isoformat()}"
os.environ.setdefault("PF_BOOT", "200")
import numpy as np   # noqa: E402
import psycopg       # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE          # noqa: E402
import research_exhaustive_pp as EX     # noqa: E402
import research_pp_flex234 as F         # noqa: E402
import research_pp_portfolio_mix as M   # noqa: E402

SEASONS = ("2024-25", "2025-26")
KMAX = 10
SETTINGS = [("PROPOSED", M.PROPOSED, 4, 2), ("PROPOSED", M.PROPOSED, 8, 99), ("LIVE NOW", M.LIVE_NOW, 8, 99)]
FAM = {"steals": "DEF", "blocks": "DEF", "stocks": "DEF", "turnovers": "DEF", "points": "PTS", "pra": "PTS", "pts_reb": "PTS",
       "pts_ast": "PTS", "rebounds": "REB", "reb_ast": "REB", "assists": "AST", "threes_made": "3PM"}
FEATS = ["slips", "DEF", "PTS", "REB", "AST", "3PM", "tier_G", "tier_D", "under", "factor", "same_game", "overlap", "players_per_leg",
         "depth_slips", "depth_legs"]


def legkey(l):
    return (F.norm(l["player"]), l["prop"], l["side"], round(float(l["line"]), 1))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    EX.install_flex2_alt(conn)
    units = sorted({u for _, p, _, _ in SETTINGS for u in p})
    cand = defaultdict(list)
    for pool in ("_wo", "_wo_nosteals"):
        for comp, size, st in {(u[1], u[2], u[3]) for u in units if u[0] == pool}:
            for season, d, k, legs, sg in conn.execute(
                    f"""SELECT season, game_date, k, legs_json, same_game FROM nba_score.slip_engine_slips{pool}
                        WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'""",
                    (comp, size, st, KMAX)):
                if season in SEASONS:
                    cand[((pool, comp, size, st), season, d)].append((k, legs, bool(sg and sg > 0)))
    outcomes = {}
    for d, pl, mk, line, res in conn.execute("""SELECT game_date, player, regexp_replace(market_key, '_alternate$', ''), line::float8, leg_result
                                                FROM nba_market.board_outcomes WHERE game_date = ANY(%s::date[])""", (F.LIVE_DAYS,)).fetchall():
        outcomes[(d, F.norm(pl), mk, round(line, 1))] = res
    cmap = SE.load_corr(conn)
    live_days = []
    for d in F.LIVE_DAYS:
        rk_rows, _ = F.live_legs(conn, d, outcomes)
        rows = [r for r in rk_rows if not r["tier"].startswith("U")]
        if not rows:
            print(f"  {d}: no priced window board yet - skipped", flush=True)
            continue
        live_days.append(d)
        pool_all = SE.eligible_legs(rows)
        fam = defaultdict(set)
        for c, lst in pool_all.items():
            for l in lst:
                fam[c.replace("_U", "")].add(l["player"])
        broad = sum(1 for v in fam.values() if len(v) >= 2) >= 5
        pools = {"_wo": pool_all, "_wo_nosteals": {c: v for c, v in pool_all.items() if c not in M.STEALS_CELLS}}
        for u in units:
            for k, slip in enumerate(SE.build_day_slips(pools[u[0]], u[1], u[2], u[3], KMAX, cmap, broad), 1):
                games = [l["event_id"] for l in slip]
                cand[(u, f"LIVE {d}", d)].append((k, slip, len(games) > len(set(games))))
    for v in cand.values():
        v.sort(key=lambda x: x[0])
    days = defaultdict(set)
    for (u, per, d) in cand:
        days[per].add(d)
    # slate-day index inside each season (for the first-30-days reference)
    first = {s: sorted(days[s]) for s in SEASONS}

    def period_of(per, d):
        if per in SEASONS:
            i = first[per].index(d)
            return f"{per} first 30" if i < 30 else f"{per} rest"
        return per

    def build(port, n, lcap, per, d):
        taken, use, seen = [], defaultdict(int), set()
        for k in range(KMAX):
            for u in port:
                lst = cand.get((u, per, d))
                if not lst or k >= len(lst) or len(taken) >= n:
                    continue
                _, legs, sg = lst[k]
                keys = list(dict.fromkeys(legkey(l) for l in legs))
                sig = (u[2], u[3], tuple(sorted(map(str, keys))))
                if sig in seen or any(use[x] >= lcap for x in keys):
                    continue
                seen.add(sig)
                for x in keys:
                    use[x] += 1
                taken.append((u, legs, sg, keys))
            if len(taken) >= n:
                break
        return taken, use

    for name, port, n, lcap in SETTINGS:
        print("\n" + "=" * 160 + f"\n{name}  N{n} L{'∞' if lcap == 99 else lcap}")
        prof = defaultdict(list)          # period -> list of per-day feature dicts
        roi = defaultdict(lambda: [0.0, 0.0])
        early = defaultdict(lambda: [0.0, 0.0])
        for per in list(SEASONS) + [f"LIVE {d}" for d in live_days]:
            for d in sorted(days[per]):
                taken, use = build(port, n, lcap, per, d)
                if not taken:
                    continue
                legs = [l for _, ls, _, _ in taken for l in ls]
                fams = [FAM.get(l["prop"], "OTH") for l in legs]
                f = {"slips": len(taken)}
                for fm in ("DEF", "PTS", "REB", "AST", "3PM"):
                    f[fm] = fams.count(fm) / len(legs)
                f["tier_G"] = sum(1 for l in legs if str(l.get("tier", "R")).startswith("G")) / len(legs)
                f["tier_D"] = sum(1 for l in legs if str(l.get("tier", "R")).startswith("D")) / len(legs)
                f["under"] = sum(1 for l in legs if l["side"] == "Under") / len(legs)
                f["factor"] = float(np.mean([float(l.get("factor") or 1.0) for l in legs]))
                f["same_game"] = sum(1 for t in taken if t[2]) / len(taken)
                f["overlap"] = sum(1 for t in taken if any(use[x] > 1 for x in t[3])) / len(taken)
                f["players_per_leg"] = len({F.norm(l["player"]) for l in legs}) / len(legs)
                f["depth_slips"] = float(np.mean([len(cand.get((u, per, d), [])) for u in port]))
                f["depth_legs"] = float(np.mean([len({legkey(l) for _, ls, _ in cand.get((u, per, d), []) for l in ls}) for u in port]))
                p = period_of(per, d)
                prof[p].append(f)
                pays = []
                for u, ls, sg, _ in taken:
                    if all(l.get("hit") is None for l in ls):
                        pays = None
                        break
                    pays.append(SE.grade([{"hit": l.get("hit"), "factor": float(l.get("factor") or 1.0)} for l in ls], u[3], same_game=sg)[1])
                if pays is not None:
                    roi[p][0] += len(pays)
                    roi[p][1] += sum(pays)
                    if per in SEASONS:
                        i = first[per].index(d)
                        for w in (14, 30):
                            if i < w:
                                early[(per, w)][0] += len(pays)
                                early[(per, w)][1] += sum(pays)
        periods = [p for p in (f"{s} {h}" for s in SEASONS for h in ("first 30", "rest"))] + [f"LIVE {d}" for d in live_days]
        print("period              days  " + " ".join(f"{x:>8}" for x in FEATS) + "      ROI")
        for p in periods:
            if not prof[p]:
                continue
            m = {x: np.mean([f[x] for f in prof[p]]) for x in FEATS}
            r = roi[p]
            rt = f"{100 * (r[1] / r[0] - 1):+7.1f}% ({int(r[0])})" if r[0] else "ungraded"
            print(f"{p:<18} {len(prof[p]):>5}  " + " ".join(f"{m[x]:>8.3f}" for x in FEATS) + f"  {rt}")
        # the distance uses the PROFILE features only (slip / pool counts follow the number of games on the slate, not the season)
        DF = [x for x in FEATS if x not in ("slips", "depth_slips", "depth_legs")]
        sd = {x: max(0.01, float(np.std([f[x] for p in periods if p.startswith(SEASONS) for f in prof[p]]))) for x in DF}
        print("distance of each live day to each history period (mean |z| over the profile features; smaller = more alike):")
        for d in live_days:
            lp = f"LIVE {d}"
            if not prof[lp]:
                continue
            today = prof[lp][0]
            dist = {}
            for p in periods:
                if p.startswith("LIVE") or not prof[p]:
                    continue
                m = {x: np.mean([f[x] for f in prof[p]]) for x in FEATS}
                dist[p] = float(np.mean([abs(today[x] - m[x]) / sd[x] for x in DF]))
            print(f"  {d}: " + " | ".join(f"{p} {v:.2f}" for p, v in sorted(dist.items(), key=lambda kv: kv[1])))
        print("early-season ROI (the start of each season, like-for-like with today):")
        for s in SEASONS:
            print("  " + s + ": " + " | ".join(f"first {w} days {100 * (early[(s, w)][1] / early[(s, w)][0] - 1):+6.1f}% ({int(early[(s, w)][0])} slips)"
                                               for w in (14, 30) if early[(s, w)][0]))


if __name__ == "__main__":
    main()
