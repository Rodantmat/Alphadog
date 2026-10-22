#!/usr/bin/env python3
"""
RESEARCH - BOARD PROFILES: A PRESET SLIP STRATEGY PER KIND OF SLATE (2026-10-22 PT; owner 15:09-15:12 PT: "board profiles per app,
very granulated ... a preset slip strategy per profile ... test all strategies on the past season, the one before and the live
days ... simulate to avoid droughts and losing streaks"). PrizePicks first. READ-ONLY.

THE SLATE PROFILE - only what is known at pick time, computed the same way for history and live:
  games     number of games on the slate (history nba_team.team_game_log, live nba_calendar.slate_games): <=4 / 5-8 / 9+
  phase     the season's first 30 slate days vs the rest (every live day so far is 'first 30')
  strength  mean final score of the slate's 20 best standard legs (rank key final_score, top 10 per prop) - tercile of training
  demon     share of demon rows among those top-10 rows - tercile of training
BP_DIMS picks the profile dimensions (default games,phase,strength). A profile with too few training days backs off to a coarser
one (drop the last dimension, then the next; minimum BP_MIN_DAYS days, default 12).

THE STRATEGIES (configs): every unit of the live engine's twin backtest (slip_engine_slips_wo = all cells, _wo_nosteals = steals-free)
under the owner's rule (2 / 3 picks Flex or Power, 4+ picks Flex only) - one slip (k1), two slips (k1 + k2), or a PAIR of units
(k1 of each; the BP_TOP best units of the training season) - plus SKIP (no slip). History re-graded with grader v3 (build_slip_engine
grade + 2-pick Flex alternate prices, research_exhaustive_pp.install_flex2_alt), stake 1 unit per slip.

SELECTION in a profile (training season only): shrunk ROI per slip (toward the config's whole-season ROI, BP_SHRINK slips) minus
BP_Z x its standard error; 'safe' also subtracts BP_LOSS x the share of losing days. The best score wins; SKIP scores 0.

OUT OF SAMPLE both directions (train 2024-25 -> test 2025-26 and back). Compared on the SAME test days with: the LIVE 2-slip portfolio
(live_slip_engine.PORTFOLIO_UNITS order, round robin, leg cap 2, n 2 - exact) and the STATIC best config (one config for every day,
same selection rule). Per system: days played, slips, ROI, units won, max drawdown, longest run of losing days, worst 7 days, share
of losing days. Selected configs are re-played exactly (round robin, no repeated slip, leg cap 2).
LIVE: trained on both seasons, applied to BP_LIVE_DAYS (default 2026-10-20,2026-10-21,2026-10-22) - the profile, the config, the
slips and (when graded) the result, beside the live portfolio's.
Env: DATABASE_URL, BP_DIMS, BP_MIN_DAYS (12), BP_TOP (50), BP_SHRINK (60), BP_Z (1.0), BP_LOSS (0.3), BP_LIVE_DAYS.
"""
import os
import sys
import time
from collections import defaultdict

os.environ.setdefault("PF_LIVE_DAYS", os.environ.get("BP_LIVE_DAYS") or "2026-10-20,2026-10-21,2026-10-22")
os.environ.setdefault("PF_BOOT", "50")
import numpy as np   # noqa: E402
import psycopg       # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE          # noqa: E402
import live_slip_engine as L            # noqa: E402
import research_exhaustive_pp as EX     # noqa: E402
import research_pp_flex234 as F         # noqa: E402
import research_pp_portfolio_mix as M   # noqa: E402

SEASONS = ("2024-25", "2025-26")
DIMS = [x for x in (os.environ.get("BP_DIMS") or "games,phase,strength").split(",") if x]
MIN_DAYS = int(os.environ.get("BP_MIN_DAYS") or 12)
TOP = int(os.environ.get("BP_TOP") or 50)
SHRINK = float(os.environ.get("BP_SHRINK") or 60)
Z = float(os.environ.get("BP_Z") or 1.0)
LOSS = float(os.environ.get("BP_LOSS") or 0.3)
KMAX_P = 10   # the live portfolio's candidates per unit
TABLES = ("_wo", "_wo_nosteals")
# the live portfolio, in its order (live_slip_engine.PORTFOLIO_UNITS: steals-free pool for the 'C' family)
LIVE_PORT = [("_wo_nosteals" if fam == "C" else "_wo", comp, size, st) for comp, size, st, fam in L.PORTFOLIO_UNITS.values()]


def allowed(size, st):
    return size <= 3 or st == "flex"


def legkey(l):
    return (F.norm(l["player"]), l["prop"], l["side"], round(float(l["line"]), 1))


def grade(legs, st, sg):
    if all(l.get("hit") is None for l in legs):
        return None
    return SE.grade([{"hit": l.get("hit"), "factor": float(l.get("factor") or 1.0)} for l in legs], st, same_game=sg)[1] - 1.0


def bucket_games(g):
    return "g<=4" if g <= 4 else ("g5-8" if g <= 8 else "g9+")


def tercile(v, cuts, lab):
    return f"{lab}-lo" if v <= cuts[0] else (f"{lab}-mid" if v <= cuts[1] else f"{lab}-hi")


def stats(daily):
    """daily: list of (date, slips, profit) in date order (days with 0 slips count as a flat day)"""
    played = [(d, s, p) for d, s, p in daily if s > 0]
    slips = sum(s for _, s, _ in played)
    prof = sum(p for _, _, p in played)
    eq = peak = dd = 0.0
    run = best = 0
    for _, s, p in daily:
        eq += p
        peak = max(peak, eq)
        dd = max(dd, peak - eq)
        if s > 0:
            run = run + 1 if p < -1e-9 else 0
            best = max(best, run)
    seq = [p for _, _, p in daily]
    w7 = min((sum(seq[i:i + 7]) for i in range(max(1, len(seq) - 6))), default=0.0)
    lose = sum(1 for _, s, p in played if p < -1e-9) / len(played) if played else 0.0
    return {"days": len(played), "slips": slips, "roi": prof / slips if slips else 0.0, "units": prof, "dd": dd, "run": best,
            "w7": w7, "lose": lose}


def fmt(s):
    return (f"days {s['days']:>3} slips {s['slips']:>4} ROI {100 * s['roi']:+6.1f}% units {s['units']:+7.1f} maxDD {s['dd']:5.1f} "
            f"losing run {s['run']:>2} worst7 {s['w7']:+6.1f} losing days {100 * s['lose']:4.1f}%")


def main():
    t0 = time.time()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    EX.install_flex2_alt(conn)

    # ------------------------------------------------------------------ slate features (history)
    games = {d: int(n) for d, n in conn.execute(
        "SELECT game_date, count(DISTINCT game_id) FROM nba_team.team_game_log GROUP BY 1").fetchall()}
    for d, n in conn.execute("SELECT game_date, count(*) FROM nba_calendar.slate_games WHERE game_date >= '2026-10-01' GROUP BY 1").fetchall():
        games.setdefault(d, int(n))
    feat = {}
    rows = defaultdict(list)
    for season, d, tier, side, score in conn.execute(
            """SELECT season, game_date, tier, side, score FROM nba_score.tier_map_legs_sel_wo
               WHERE rank_key = 'final_score' AND n_rank <= 10 AND tier NOT LIKE 'U%%'"""):
        if season in SEASONS:
            rows[(season, d)].append((tier, side, float(score) if score is not None else None))

    def slate_feat(rws, g):
        std = sorted((s for t, _, s in rws if t == "R" and s is not None), reverse=True)[:20]
        return {"games": g, "strength": float(np.mean(std)) if std else 0.0,
                "demon": sum(1 for t, _, _ in rws if str(t).startswith("D")) / max(1, len(rws))}

    # ------------------------------------------------------------------ units (history, k <= 2) and the live portfolio (k <= 10)
    units = []
    for tab in TABLES:
        for comp, size, st in conn.execute(f"SELECT DISTINCT composition, size, structure FROM nba_score.slip_engine_slips{tab}").fetchall():
            if allowed(size, st):
                units.append((tab, comp, size, st))
    units.sort()
    uidx = {u: i for i, u in enumerate(units)}
    cand = defaultdict(list)          # (unit, season, date) -> [(k, profit, sig, keys)]
    days = {s: set() for s in SEASONS}
    for tab in TABLES:
        for season, d, comp, size, st, k, legs, sg in conn.execute(
                f"""SELECT season, game_date, composition, size, structure, k, legs_json, same_game FROM nba_score.slip_engine_slips{tab}
                    WHERE phase <> 'final7' AND (k <= 2 OR (k <= {KMAX_P} AND composition = ANY(%s)))""",
                (sorted({u[1] for u in LIVE_PORT}),)):
            if season not in SEASONS or not allowed(size, st):
                continue
            u = (tab, comp, size, st)
            if k > 2 and u not in LIVE_PORT:
                continue
            pr = grade(legs, st, bool(sg and sg > 0))
            if pr is None:
                continue
            keys = list(dict.fromkeys(legkey(l) for l in legs))
            cand[(u, season, d)].append((k, pr, (size, st, tuple(sorted(map(str, keys)))), keys))
            days[season].add(d)
        print(f"loaded {tab}: {len(cand):,} unit-days | {time.time() - t0:.0f}s", flush=True)
    for v in cand.values():
        v.sort(key=lambda x: x[0])
    order = {s: sorted(days[s]) for s in SEASONS}
    for s in SEASONS:
        for i, d in enumerate(order[s]):
            f = slate_feat(rows.get((s, d), []), games.get(d, 0))
            f["phase"] = "first30" if i < 30 else "rest"
            feat[(s, d)] = f
    print(f"units {len(units)} (owner rule: 2-3 picks Flex / Power, 4+ Flex); days {', '.join(f'{s} {len(order[s])}' for s in SEASONS)}; "
          f"days without a game count: {sum(1 for k, f in feat.items() if not f['games'])}", flush=True)

    # ------------------------------------------------------------------ exact replay of a config on one day
    def play(cfg, lists, n=None):
        """cfg = ('skip',) | ('one', u) | ('two', u) | ('pair', u, v) | ('port', units, n); lists(u) -> candidate list"""
        if cfg[0] == "skip":
            return 0, 0.0, []
        if cfg[0] == "one":
            port, n = [cfg[1]], 1
        elif cfg[0] == "two":
            port, n = [cfg[1]], 2
        elif cfg[0] == "pair":
            port, n = [cfg[1], cfg[2]], 2
        else:
            port, n = cfg[1], cfg[2]
        taken, use, seen = [], defaultdict(int), set()
        for k in range(KMAX_P):
            for u in port:
                lst = lists(u)
                if len(taken) >= n or k >= len(lst):
                    continue
                _, pr, sig, keys = lst[k][:4]
                if sig in seen or any(use[x] >= 2 for x in keys):
                    continue
                seen.add(sig)
                for x in keys:
                    use[x] += 1
                taken.append((u, pr, lst[k]))
            if len(taken) >= n:
                break
        prs = [t[1] for t in taken if t[1] is not None]
        return len(prs), float(sum(prs)), taken

    def label(cfg):
        if cfg[0] == "skip":
            return "SKIP"
        if cfg[0] == "port":
            return "LIVE 2-slip portfolio"
        us = [cfg[1]] + ([cfg[2]] if cfg[0] == "pair" else [])
        t = " + ".join(f"{u[1]} {u[2]}{'F' if u[3] == 'flex' else 'P'}{'' if u[0] == '_wo' else ' (no steals)'}" for u in us)
        return {"one": "1x ", "two": "2x ", "pair": "pair "}[cfg[0]] + t

    # ------------------------------------------------------------------ train / select / test
    def profile_keys(f, cuts):
        full = []
        for dname in DIMS:
            if dname == "games":
                full.append(bucket_games(f["games"]))
            elif dname == "phase":
                full.append(f["phase"])
            else:
                full.append(tercile(f[dname], cuts[dname], dname))
        return [tuple(full[:i]) for i in range(len(full), -1, -1)]     # deepest first, () = everything

    def train(train_seasons):
        tdays = [(s, d) for s in train_seasons for d in order[s]]
        cuts = {x: tuple(np.quantile([feat[k][x] for k in tdays], [1 / 3, 2 / 3])) for x in ("strength", "demon")}
        D = len(tdays)
        # per unit: k1 profit (one slip), k1 + k2 (two slips); 0 slips when the unit has none that day
        P1 = np.zeros((len(units), D)); S1 = np.zeros((len(units), D))
        P2 = np.zeros((len(units), D)); S2 = np.zeros((len(units), D))
        SIG1 = {}
        for j, (s, d) in enumerate(tdays):
            for u in units:
                lst = cand.get((u, s, d))
                if not lst:
                    continue
                i = uidx[u]
                P1[i, j], S1[i, j] = lst[0][1], 1
                SIG1[(i, j)] = lst[0][2]
                P2[i, j], S2[i, j] = sum(x[1] for x in lst[:2]), min(2, len(lst))
        roi_g = P1.sum(1) / np.maximum(1, S1.sum(1))
        good = [i for i in np.argsort(-roi_g) if S1[i].sum() >= 100][:TOP]
        cfgs, XP, XS = [("skip",)], [np.zeros(D)], [np.zeros(D)]
        for i in range(len(units)):
            if S1[i].sum() < 60:
                continue
            cfgs.append(("one", units[i])); XP.append(P1[i]); XS.append(S1[i])
            cfgs.append(("two", units[i])); XP.append(P2[i]); XS.append(S2[i])
        for a in range(len(good)):
            for b in range(a + 1, len(good)):
                i, k = good[a], good[b]
                cfgs.append(("pair", units[i], units[k])); XP.append(P1[i] + P1[k]); XS.append(S1[i] + S1[k])
        XP, XS = np.array(XP), np.array(XS)
        cell_of = [profile_keys(feat[k], cuts) for k in tdays]
        tot_p, tot_s = XP.sum(1), XS.sum(1)
        r_glob = tot_p / np.maximum(1, tot_s)
        choice = {}
        for mode in ("lb", "safe"):
            cells = defaultdict(list)
            for j, keys in enumerate(cell_of):
                for key in keys:
                    cells[key].append(j)
            for key, js in cells.items():
                if len(js) < MIN_DAYS and key != ():
                    continue
                js = np.array(js)
                p, s = XP[:, js], XS[:, js]
                sp, ss = p.sum(1), s.sum(1)
                shr = (sp + SHRINK * r_glob) / (ss + SHRINK)
                with np.errstate(invalid="ignore", divide="ignore"):
                    daily_roi = np.where(s > 0, p / np.maximum(s, 1), np.nan)
                    nd = np.sum(s > 0, 1)
                    se = np.nanstd(daily_roi, 1) / np.sqrt(np.maximum(nd, 1))
                se = np.nan_to_num(se, nan=9.9)
                score = shr - Z * se
                if mode == "safe":
                    score = score - LOSS * np.sum((p < -1e-9) & (s > 0), 1) / np.maximum(nd, 1)
                score[0] = 0.0                                         # SKIP
                score[(nd < max(4, len(js) // 3))] = -9.9             # a config must actually play in the profile
                score[0] = 0.0
                b = int(np.argmax(score))
                choice[(mode, key)] = (cfgs[b], float(score[b]), int(len(js)), float(sp[b] / max(1, ss[b])), int(ss[b]))
        return cuts, choice, cfgs, XP, XS, tdays

    def pick_cfg(choice, mode, f, cuts):
        for key in profile_keys(f, cuts):
            if (mode, key) in choice:
                return key, choice[(mode, key)]
        return (), choice[(mode, ())]

    def lists_hist(s, d):
        return lambda u: cand.get((u, s, d), [])

    print("\n" + "=" * 160 + f"\nPROFILE DIMENSIONS {DIMS}; min {MIN_DAYS} training days per profile (else coarser); shrink {SHRINK:g} slips, z {Z:g}, "
          f"safe loss weight {LOSS:g}; pairs among the {TOP} best units of the training season")
    summary = {}
    for tr, te in ((("2024-25",), "2025-26"), (("2025-26",), "2024-25")):
        cuts, choice, cfgs, XP, XS, tdays = train(tr)
        print(f"\n{'-' * 160}\nTRAIN {tr[0]} -> TEST {te}   (cuts strength {cuts['strength'][0]:.3f} / {cuts['strength'][1]:.3f}, "
              f"demon {cuts['demon'][0]:.3f} / {cuts['demon'][1]:.3f})")
        static = {m: choice[(m, ())][0] for m in ("lb", "safe")}
        systems = {"LIVE 2-slip portfolio": [], "STATIC lb": [], "STATIC safe": [], "PROFILES lb": [], "PROFILES safe": []}
        per_cell = defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0]))
        for d in order[te]:
            f = feat[(te, d)]
            lst = lists_hist(te, d)
            for name, cfg in (("LIVE 2-slip portfolio", ("port", LIVE_PORT, 2)), ("STATIC lb", static["lb"]), ("STATIC safe", static["safe"])):
                n, p, _ = play(cfg, lst)
                systems[name].append((d, n, p))
            for m in ("lb", "safe"):
                key, ch = pick_cfg(choice, m, f, cuts)
                n, p, _ = play(ch[0], lst)
                systems[f"PROFILES {m}"].append((d, n, p))
                c = per_cell[m][(key, label(ch[0]))]
                c[0] += 1; c[1] += p; c[2] += n
        for name, daily in systems.items():
            st_ = stats(daily)
            summary[(tr[0], te, name)] = st_
            print(f"  {name:<24} {fmt(st_)}")
        print(f"  STATIC lb config: {label(static['lb'])} | STATIC safe config: {label(static['safe'])}")
        for m in ("lb", "safe"):
            print(f"  profile choices ({m}) - profile | config | train days, train ROI, train slips | TEST days, TEST units, TEST ROI")
            for (key, lab), (nd, p, n) in sorted(per_cell[m].items(), key=lambda kv: (len(kv[0][0]), kv[0][0])):
                tc = choice.get((m, key))
                tt = f"{tc[2]:>3}d {100 * tc[3]:+6.1f}% {tc[4]:>4}s" if tc else "-"
                print(f"    {'/'.join(key) or 'ALL':<28} {lab:<60} {tt} | {nd:>3}d {p:+7.1f}u {100 * p / n if n else 0:+6.1f}%")

    # ------------------------------------------------------------------ LIVE days: train on both seasons
    print("\n" + "=" * 160 + "\nLIVE DAYS - trained on both seasons")
    cuts, choice, cfgs, XP, XS, tdays = train(SEASONS)
    for m in ("lb", "safe"):
        print(f"  ({m}) every profile's preset: " + "; ".join(f"{'/'.join(k[1]) or 'ALL'} -> {label(v[0])}"
                                                           for k, v in sorted(choice.items()) if k[0] == m and len(k[1]) == len(DIMS)))
    outcomes = {}
    for d, pl, mk, line, res in conn.execute("""SELECT game_date, player, regexp_replace(market_key, '_alternate$', ''), line::float8, leg_result
                                                FROM nba_market.board_outcomes WHERE game_date = ANY(%s::date[])""", (F.LIVE_DAYS,)).fetchall():
        outcomes[(d, F.norm(pl), mk, round(line, 1))] = res
    cmap = SE.load_corr(conn)
    live_tot = defaultdict(list)
    for d in F.LIVE_DAYS:
        rk_rows, _ = F.live_legs(conn, d, outcomes)
        rws = [r for r in rk_rows if not r["tier"].startswith("U")]
        if not rws:
            print(f"  {d}: no priced window board - skipped")
            continue
        top = [r for r in rws if r["rank_key"] == "final_score" and r["n_rank"] <= 10]
        f = slate_feat([(r["tier"], r["side"], r["score"]) for r in top], games.get(d, 0))
        f["phase"] = "first30"
        pool_all = SE.eligible_legs(rws)
        fam = defaultdict(set)
        for c, lst in pool_all.items():
            for l in lst:
                fam[c.replace("_U", "")].add(l["player"])
        broad = sum(1 for v in fam.values() if len(v) >= 2) >= 5
        pools = {"_wo": pool_all, "_wo_nosteals": {c: v for c, v in pool_all.items() if c not in M.STEALS_CELLS}}
        built = {}

        def lst_live(u):
            if u not in built:
                out = []
                for k, slip in enumerate(SE.build_day_slips(pools[u[0]], u[1], u[2], u[3], KMAX_P if u in LIVE_PORT else 2, cmap, broad), 1):
                    ev = [l["event_id"] for l in slip]
                    keys = list(dict.fromkeys(legkey(l) for l in slip))
                    out.append((k, grade(slip, u[3], len(ev) > len(set(ev))), (u[2], u[3], tuple(sorted(map(str, keys)))), keys, slip))
                built[u] = out
            return built[u]
        print(f"\n  {d}: games {f['games']}, strength {f['strength']:.3f}, demon share {f['demon']:.3f} -> profile "
              f"{'/'.join(profile_keys(f, cuts)[0])}")
        for name, getcfg in (("LIVE 2-slip portfolio", lambda m: ((), (("port", LIVE_PORT, 2),))),
                             ("PROFILES lb", lambda m: pick_cfg(choice, "lb", f, cuts)), ("PROFILES safe", lambda m: pick_cfg(choice, "safe", f, cuts))):
            key, ch = getcfg(None)
            n, p, taken = play(ch[0], lst_live)
            graded = all(t[1] is not None for t in taken)
            live_tot[name].append((d, n if graded else 0, p if graded else 0.0))
            res = (f"{n} slips {p:+.2f}u" if graded else "ungraded (games not final)") if taken else "no slip"
            print(f"    {name:<22} [{'/'.join(key) or 'ALL'}] {label(ch[0])}: {res}")
            for u, pr, row in taken:
                legs = row[4]
                print(f"       {u[1]} {u[2]}-{u[3]}: " + "; ".join(f"{l['player']} {l['prop']} {'MORE' if l['side'] == 'Over' else 'LESS'} "
                                                           f"{float(l['line']):g} {l['tier']} x{float(l['factor']):.2f} "
                                                           f"{'hit' if l.get('hit') == 1 else ('miss' if l.get('hit') == 0 else '?')}" for l in legs)
                      + (f"  -> {pr:+.2f}u" if pr is not None else ""))
    print("\n  live totals (graded days only):")
    for name, daily in live_tot.items():
        print(f"    {name:<22} {fmt(stats(daily))}")
    print(f"\ndone in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
