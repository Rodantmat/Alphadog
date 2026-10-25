#!/usr/bin/env python3
"""
RESEARCH - THE FINAL STRATEGY REVIEW FOR THE OTHER APPS (2026-10-25; owner 15:34 PT: "do the same testing and simulation for all apps
and see what we get and get out of paper and move to reality ... with even this current season"). READ-ONLY.

The same method as research_final_strategies (PrizePicks -> portfolio B), per app, on the app's OWN board and OWN payout:
  APP=UD    Underdog window board (nba_market.board_snapshots) -> ud_live_slip_engine.load_legs (the live resolver: final_hp per
            (date, player, prop, side, line), the modifier m, tiers R / F1-F3 / B1-B3, market-free score) for every history slate
            2024-25 + 2025-26 and this season's graded slates; graded on the box score (DNP / push void, the entry shrinks);
            paid by Underdog's proven formula (ud_live_slip_engine.payout: Standard base(n) x prod m, Flex F_j(n) x prod m of hits,
            floored to 2 decimals). One pick per game (Underdog's correlation factor 1, as certified).
            Benchmark: the live paper portfolio P5, built by the live engine's own functions on the same legs.
  APP=BETR  Betr window board (bookmaker betr_us_dfs, standard lines, 2025-26 from 2025-11-23) joined to final_hp the same way;
            paid by Betr's measured tables (nba_config.pp_slip_rules 'betr_payout_v1': Perfect / Dynamic, all-LESS discounted);
            <= 2 legs a game, >= 2 teams. (Betr stays PARKED in production - research only.)
GRID (one slip a strategy a slate, greedy best-ranked legs, distinct players, the game cap):
  line types (UD: R / F / B / RF / RB / ALL; Betr: R) x side (More / Less / both) x prop set (all, points, rebounds, assists,
  threes, combos, low-volume, core) x rank (final_hp, final_hp x m, baseline_hp, final score) x final_hp floor (0 .. 0.70) x
  skip the top leg x structure (UD Standard 2-8 + Flex 3-8; Betr Perfect 2-6 + Dynamic 2-6).
READS per structure: A cross-period holdout both ways; B walk-forward (best lower bound on all earlier slates, played next);
  C robust (lower bound > 0 in both periods); D benchmark; E THIS SEASON (2026-27 graded slates) for the robust leaders.
Env: DATABASE_URL, APP (UD | BETR), AF_MINN (default 40), AF_TOP (10).
"""
import datetime as dt
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ud_live_slip_engine as UDL                    # noqa: E402
import build_ud_slip_engine as E                     # noqa: E402

T0 = time.time()
APP = (os.environ.get("APP") or "UD").upper()
MINN = int(os.environ.get("AF_MINN") or 40)
TOPN = int(os.environ.get("AF_TOP") or 10)
GRP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combos", "pts_reb": "combos",
       "pts_ast": "combos", "reb_ast": "combos", "steals": "lowvol", "blocks": "lowvol", "turnovers": "lowvol", "stocks": "lowvol"}
PROPSETS = {"all": None, "points": {"points"}, "rebounds": {"rebounds"}, "assists": {"assists"}, "threes": {"threes"},
            "combos": {"combos"}, "lowvol": {"lowvol"}, "core": {"points", "rebounds", "assists", "threes", "combos"}}
SIDES = {"O": ("Over",), "U": ("Under",), "B": ("Over", "Under")}
RANKS = ("p", "ev", "base", "score")
FLOORS = (0.0, 0.55, 0.60, 0.65, 0.70)
if APP == "UD":
    POOLS = {"R": ("R",), "F": ("F1", "F2", "F3"), "B": ("B1", "B2", "B3"), "RF": ("R", "F1", "F2", "F3"), "RB": ("R", "B1", "B2", "B3"),
             "ALL": ("R", "F1", "F2", "F3", "B1", "B2", "B3")}
    STRUCTS = [(n, "standard") for n in range(2, 9)] + [(n, "flex") for n in range(3, 9)]
    GCAPS = (1,)
else:
    POOLS = {"R": ("R",)}
    STRUCTS = [(n, "perfect") for n in range(2, 7)] + [(n, "dynamic") for n in range(2, 7)]
    GCAPS = (1, 2)
MAXSZ = max(n for n, _ in STRUCTS)
STAT = UDL.STAT


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def tag(n, st):
    return f"{n}{dict(standard='S', flex='F', perfect='P', dynamic='D')[st]}"


def season_of(d):
    y = d.year if d.month >= 8 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


def slate_days(conn):
    """regular-season slates with a board for the app, the final 7 days of each season out; this season's slates before today"""
    import live_slip_engine as LSE
    keep = []
    today = dt.datetime.now(UDL.PT).date()
    for probe in (dt.date(2025, 1, 15), dt.date(2026, 1, 15), dt.date(2026, 10, 25)):
        s0, s1 = LSE.regular_season_window(conn, probe)
        if s0 is None:
            continue
        d = s0
        while d <= s1:
            if season_of(d) == "2026-27":
                if d < today:
                    keep.append(d)
            elif (s1 - d).days > 7:
                keep.append(d)
            d += dt.timedelta(days=1)
    bk = "underdog" if APP == "UD" else "betr_us_dfs"
    have = {r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_market.board_snapshots WHERE bookmaker=%s AND snapshot_label='window'",
                                       (bk,)).fetchall()}
    return [d for d in sorted(keep) if d in have and season_of(d) in ("2024-25", "2025-26", "2026-27")]


def box(conn, day):
    st = {}
    for pid, pts, reb, ast, fg3m, stl, blk, tov, mins in conn.execute("""SELECT nba_player_id::text, pts, reb, ast, fg3m, stl, blk, tov, min
            FROM nba_stats.player_game_log WHERE game_date=%s""", (day,)).fetchall():
        st[pid] = dict(pts=pts or 0, reb=reb or 0, ast=ast or 0, fg3m=fg3m or 0, stl=stl or 0, blk=blk or 0, tov=tov or 0, min=mins)
    return st


def outcome(st, l):
    s = st.get(str(l["player_id"]))
    if not s or not s["min"]:
        return None
    v = STAT[l["prop"]](s)
    if v == float(l["line"]):
        return None
    return int((v > float(l["line"])) if l["side"] == "Over" else (v < float(l["line"])))


def load_ud(conn, day, st):
    rows = UDL.load_legs(conn, day)
    by = {}
    for r in rows:
        k = (r["player"], r["prop"], r["side"], float(r["line"]))
        b = by.setdefault(k, {"player": r["player"], "player_id": r["player_id"], "prop": r["prop"], "side": r["side"], "line": float(r["line"]),
                              "tier": r["tier"], "m": float(r["factor"]), "event_id": r["event_id"]})
        b[{"final_hp": "p", "baseline_hp": "base", "final_score": "score"}[r["rank_key"]]] = r["score"]
    legs = []
    for b in by.values():
        if b.get("p") is None:
            continue
        b["hit"] = outcome(st, b)
        legs.append(b)
    for r in rows:
        r["hit"] = outcome(st, r)
    return legs, rows


MK = {'player_points': 'points', 'player_rebounds': 'rebounds', 'player_assists': 'assists', 'player_threes': 'threes_made',
      'player_steals': 'steals', 'player_blocks': 'blocks', 'player_turnovers': 'turnovers', 'player_blocks_steals': 'stocks',
      'player_points_rebounds': 'pts_reb', 'player_points_assists': 'pts_ast', 'player_rebounds_assists': 'reb_ast',
      'player_points_rebounds_assists': 'pra'}


def load_betr(conn, day, st):
    rows = conn.execute("""
      WITH b AS (SELECT DISTINCT ON (nba_ref.norm_name(player), market_key, side, line) nba_ref.norm_name(player) pn, player, market_key, side, line, event_id
                 FROM nba_market.board_snapshots WHERE bookmaker='betr_us_dfs' AND snapshot_label='window' AND game_date=%s
                   AND market_key = ANY(%s) ORDER BY nba_ref.norm_name(player), market_key, side, line, snapshot_ts DESC)
      SELECT b.pn, nm.player_id, b.market_key, b.side, b.line::float, b.event_id, f.final_hp::float, f.baseline_hp::float, f.score::float
      FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = b.pn
      JOIN nba_score.final_hp f ON f.game_date=%s AND f.player_id=nm.player_id AND f.side=b.side AND f.line=b.line
        AND f.prop = (CASE b.market_key """ + " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in MK.items()) + """ END)
      WHERE f.final_hp IS NOT NULL""", (day, list(MK), day)).fetchall()
    teams = {}
    pids = list({str(r[1]) for r in rows})
    if pids:
        for pid, tm in conn.execute("""SELECT DISTINCT ON (nba_player_id) nba_player_id::text, team_id FROM nba_stats.player_game_log
                                       WHERE nba_player_id::text = ANY(%s) AND game_date <= %s ORDER BY nba_player_id, game_date DESC""",
                                    (pids, day)).fetchall():
            teams[pid] = tm
    legs = []
    for pn, pid, mk, side, line, ev, fh, bh, sc in rows:
        l = {"player": pn, "player_id": str(pid), "prop": MK[mk], "side": side, "line": line, "tier": "R", "m": 1.0, "event_id": ev,
             "team_id": teams.get(str(pid)), "p": fh, "base": bh, "score": sc}
        if l["team_id"] is None:
            continue
        l["hit"] = outcome(st, l)
        legs.append(l)
    return legs, None


def ud_pay(slip, st_):
    live = [l for l in slip if l["hit"] is not None]
    p = UDL.payout(st_, [{"hit": l["hit"], "factor": l["m"]} for l in live])
    return 1.0 if p is None else p


BR = None


def betr_pay(slip, st_):
    live = [l for l in slip if l["hit"] is not None]
    n = len(live)
    if n < 2:
        return 1.0
    allless = all(l["side"] == "Under" for l in live)
    h = sum(l["hit"] for l in live)
    if st_ == "perfect":
        tb = BR["perfect_all_less" if allless else "perfect_regular"]
        return float(tb[str(n)]) if h == n else 0.0
    tb = BR["dynamic_all_less" if allless else "dynamic_regular"][str(n)]
    return float(tb.get(str(h), 0.0))


def strategy_list():
    combos = [(pool, side, ps, rk, fl, gc, sk) for pool in POOLS for side in SIDES for ps in PROPSETS for rk in RANKS
              for fl in FLOORS for gc in GCAPS for sk in (0, 1) if not (APP != "UD" and rk == "ev")]
    return combos


def name(c, n, st_):
    pool, side, ps, rk, fl, gc, sk = c
    return (f"{APP} {pool}-{dict(O='More', U='Less', B='both')[side]}-{ps}-{rk}-p{fl:.2f}-gc{gc}{'-skip1' if sk else ''} {tag(n, st_)}")


def day_matrix(legs, combos, pay):
    """one slate -> returns array (len(combos) * len(STRUCTS)) of ROI (payout - 1), nan where no slip"""
    out = np.full(len(combos) * len(STRUCTS), np.nan, np.float32)
    for l in legs:
        l["_grp"] = GRP.get(l["prop"])
    base_cache = {}
    for ci, c in enumerate(combos):
        pool, side, ps, rk, fl, gc, sk = c
        key = (pool, side, ps)
        if key not in base_cache:
            pset = PROPSETS[ps]
            base_cache[key] = [l for l in legs if l["tier"] in POOLS[pool] and l["side"] in SIDES[side] and (pset is None or l["_grp"] in pset)]
        base = base_cache[key]
        if (key, rk) in base_cache:
            r = base_cache[(key, rk)]
        elif rk == "p":
            r = sorted(base, key=lambda l: -l["p"])
        elif rk == "ev":
            r = sorted(base, key=lambda l: -l["p"] * l["m"])
        elif rk == "base":
            r = sorted(base, key=lambda l: -(l["base"] if l.get("base") is not None else -1))
        else:
            r = sorted(base, key=lambda l: -(l["score"] if l.get("score") is not None else -1))
        base_cache[(key, rk)] = r
        cand = [l for l in r if l["p"] >= fl][sk:]
        pick, players, games = [], set(), defaultdict(int)
        for l in cand:
            if l["player"] in players or games[l["event_id"]] >= gc:
                continue
            pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
            if len(pick) == MAXSZ:
                break
        for j, (n, st_) in enumerate(STRUCTS):
            if len(pick) >= n:
                s = pick[:n]
                if APP != "UD" and len({l.get("team_id") for l in s}) < 2:
                    continue
                out[ci * len(STRUCTS) + j] = pay(s, st_) - 1.0
    return out


def lb_stats(X):
    V = ~np.isnan(X)
    n = V.sum(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        mu = np.nansum(X, axis=1) / n
        sd = np.sqrt(np.maximum(np.nansum(X ** 2, axis=1) / n - mu ** 2, 0))
        lb = mu - sd / np.sqrt(np.maximum(n, 1))
    return n, mu, sd, lb


def max_dd(x):
    x = x[~np.isnan(x)]
    if not len(x):
        return 0.0
    c = np.cumsum(x)
    return float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c))


def walk_forward(X, k):
    S, D = X.shape
    V = (~np.isnan(X)).astype(np.float64); Z = np.nan_to_num(X).astype(np.float64)
    n = np.zeros(S); s = np.zeros(S); s2 = np.zeros(S)
    out = []
    for t in range(D):
        if t >= 30:
            with np.errstate(invalid="ignore", divide="ignore"):
                mu = s / n
                lb = np.where(n >= 20, mu - np.sqrt(np.maximum(s2 / n - mu ** 2, 0)) / np.sqrt(np.maximum(n, 1)), -np.inf)
            top = np.argpartition(-lb, k)[:k]
            v = V[top, t]
            if v.sum():
                out.append(float((Z[top, t] * v).sum() / v.sum()))
        n += V[:, t]; s += Z[:, t]; s2 += Z[:, t] ** 2
    return np.array(out)


def main():
    global BR
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    if APP == "BETR":
        BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
    days = slate_days(conn)
    log(f"{APP}: {len(days)} slates (" + ", ".join(f"{s} {sum(1 for d in days if season_of(d) == s)}" for s in ("2024-25", "2025-26", "2026-27")) + ")")
    combos = strategy_list()
    log(f"{len(combos):,} combos x {len(STRUCTS)} structures = {len(combos) * len(STRUCTS):,} strategies")
    cols, seas, p5 = [], [], []
    pay = ud_pay if APP == "UD" else betr_pay
    n_legs = 0
    for i, d in enumerate(days):
        st = box(conn, d)
        if not st:
            continue
        legs, rows = (load_ud if APP == "UD" else load_betr)(conn, d, st)
        if not legs:
            continue
        n_legs += len(legs)
        cols.append(day_matrix(legs, combos, pay)); seas.append(season_of(d))
        if APP == "UD":
            # the live paper portfolio P5 on the same legs, by the live engine's own functions (one slip list per spec, deduped)
            pool = E.eligible_legs(rows)
            r = []
            seen = set()
            for comp, size, structure, cap in UDL.PORTFOLIOS["P5"]:
                for slip in E.build_day_slips(pool, comp, size, cap):
                    key = (size, structure, tuple(sorted((l["player"], l["prop"], l["side"], l["line"]) for l in slip)))
                    if key in seen:
                        continue
                    seen.add(key)
                    live = [l for l in slip if l["hit"] is not None]
                    pp = UDL.payout(structure, [{"hit": l["hit"], "factor": float(l["factor"])} for l in live])
                    r.append(1.0 if pp is None else pp)
            p5.append(r)
        if i % 25 == 0:
            log(f"slate {i + 1}/{len(days)} {d}: {len(legs)} legs")
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    P = np.stack(cols, axis=1)
    seas = np.array(seas)
    log(f"matrix {P.shape}, {n_legs:,} legs")
    hist = [s for s in ("2024-25", "2025-26") if (seas == s).sum() >= 20]
    if len(hist) == 2:
        A, Bm = seas == hist[0], seas == hist[1]
        la, lb_ = hist[0], hist[1]
    else:
        idx = np.where(seas == hist[0])[0]
        A = np.zeros(len(seas), bool); Bm = np.zeros(len(seas), bool)
        A[idx[: len(idx) // 2]] = True; Bm[idx[len(idx) // 2:]] = True
        la, lb_ = hist[0] + " 1st half", hist[0] + " 2nd half"
    C = seas == "2026-27"
    H = A | Bm
    print(f"\nperiods: {la} {int(A.sum())} slates | {lb_} {int(Bm.sum())} | this season {int(C.sum())}")
    if APP == "UD" and p5:
        for lab, m in ((la, A), (lb_, Bm), ("2026-27", C)):
            x = [v - 1 for j, r in enumerate(p5) if m[j] for v in r]
            print(f"  BENCHMARK live P5 (paper): {lab} {len(x)} slips ROI {100 * np.mean(x):+.1f}%" if x else f"  P5 {lab}: none")
    summary = []
    for j, (n, st_) in enumerate(STRUCTS):
        rows_ = np.arange(j, P.shape[0], len(STRUCTS))
        X = P[rows_][:, H]
        XA, XB, XC = P[rows_][:, A], P[rows_][:, Bm], P[rows_][:, C]
        na, mua, _, lba = lb_stats(XA); nb, mub, _, lbb = lb_stats(XB); nc, muc, _, _ = lb_stats(XC); nt, mut, _, lbt = lb_stats(X)
        lab = tag(n, st_)
        print("\n" + "=" * 170 + f"\n{lab} - {len(rows_):,} strategies")
        for (ntr, lbtr, mutr, nte, mute, a, b) in ((na, lba, mua, nb, mub, la, lb_), (nb, lbb, mub, na, mua, lb_, la)):
            ok = (ntr >= MINN) & (nte >= 10)
            top = [i for i in np.argsort(-np.where(ok, lbtr, -np.inf))[:TOPN] if ok[i]]
            if top:
                print(f"  A  top {len(top)} chosen on {a} -> {b}: {100 * np.mean(mutr[top]):+.0f}% -> {100 * np.nanmean(mute[top]):+.0f}% "
                      f"({sum(mute[top] > 0)} of {len(top)} positive)")
        w1 = walk_forward(X, 1); w5 = walk_forward(X, 5)
        print(f"  B  WALK-FORWARD top-1 {100 * w1.mean():+.0f}% on {len(w1)} slates | top-5 {100 * w5.mean():+.0f}%" if len(w1) else "  B  n/a")
        ok = (na >= MINN) & (nb >= MINN) & (lba > 0) & (lbb > 0)
        idx = np.where(ok)[0]
        weak = np.minimum(mua, mub)
        idx = idx[np.argsort(-weak[idx])][:TOPN]
        print(f"  C  ROBUST: {int(ok.sum())} with a positive lower bound in both periods; best {len(idx)} by the weaker period (+ THIS SEASON):")
        for i in idx:
            c = combos[i]
            x = X[i]
            won = np.mean(x[~np.isnan(x)] > 0)
            print(f"       {name(c, n, st_):<62} {la} {100 * mua[i]:+.0f}% ({int(na[i])}d) | {lb_} {100 * mub[i]:+.0f}% ({int(nb[i])}d) | "
                  f"won {100 * won:.0f}% | dd {max_dd(x):.1f}u | 2026-27 {('%+.0f%% (%dd)' % (100 * muc[i], nc[i])) if nc[i] else 'none'}")
        summary.append((lab, int(ok.sum()), (name(combos[idx[0]], n, st_), mua[idx[0]], mub[idx[0]], muc[idx[0]], nc[idx[0]]) if len(idx) else None,
                        w1.mean() if len(w1) else np.nan, w5.mean() if len(w5) else np.nan))
    print("\n" + "=" * 170 + f"\nSUMMARY {APP}: robust | best robust ({la} / {lb_} / 2026-27) | walk-forward top-1 / top-5")
    for lab, nrob, best, a1, a5 in summary:
        b = f"{best[0]} {100 * best[1]:+.0f}% / {100 * best[2]:+.0f}% / {('%+.0f%% (%dd)' % (100 * best[3], best[4])) if best[4] else 'n/a'}" if best else "none"
        print(f"  {lab}: {nrob} robust | {b} | WF {100 * a1:+.0f}% / {100 * a5:+.0f}%")
    np.savez_compressed(f"/tmp/af_{APP}.npz", P=P, seas=seas)
    log("done")


if __name__ == "__main__":
    main()
