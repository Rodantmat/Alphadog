#!/usr/bin/env python3
"""
BOARD HP - OUR PROBABILITY RE-CENTRED ON PRIZEPICKS' OWN LINE, CALIBRATED BY LINE TYPE (2026-10-22 PT; owner 17:49 PT: "proper
calibrate our demons, understand why they are so off and fix it, same for all other prop lines ... Once understood and fixed,
replicated to full back history and the live pipeline"; 18:02 PT: "the fix can be granulated and spread in different layers").

WHY. research_calibration_layers.py (run 39882518299): our projected mean barely adds to PrizePicks' standard line (least-squares
weight of our disagreement w = +0.03..+0.12 for points / rebounds / assists / turnovers); on the standard line baseline_hp hardly
separates winners from losers; on alternates our disagreement with the board counts AGAINST the leg. final_hp is therefore far too
spread on every line type (fh 0.80 standard -> hit 0.576; demons fh >= .58 hit 0.39-0.43). The error is made where the ladder is
centred (layer 1) and left in place by the as-of calibration, which is fitted on graded ladder rungs, not on the board, and is
blind to line type.

THE LAYERS (each certified in research_calibration_layers_v2.py run 39883191272 - every stage; walk-forward
research_board_centring_asof.py run 39884286185 - 12/12 months, pooled log-loss 0.6443 -> 0.6262):
  L1  BOARD-CENTRED LADDER. The player-prop ladder (nba_score.baseline_history, rungs around our anchor) is moved so its centre c
      (the line where p_more = 0.5, interpolated in log-odds) becomes c + (1 - w_prop) x (L0 - c), L0 = PrizePicks' standard line
      (pp_leg_price.anchor_line); p_more'(line) = p_more(line - shift). w_prop = the weight our own mean has earned, fitted on
      graded board legs before the day over the grid WGRID (walk-forward: points / rebounds / assists / threes / combos 0.1-0.3,
      steals / blocks / turnovers 1.0 = our own ladder kept).
  L2  SPREAD per line type (R, G1-G3, D1-D3) x side: logit p2 = a + s x logit p1.
  L3  RESIDUAL per prop x line type x side, anchored on PrizePicks' own price q (0.5 standard, 1 / (2 x factor) alternates):
      logit p3 = a + b logit p2 + c logit q; cell shrunk to its (line type x side) parent by n / (n + K).
board_hp = p3, the probability of the leg's own side. final_hp is NOT touched: every current consumer (slip engine, UI, grader)
keeps reading final_hp. board_hp sits beside it until the owner decides how selection uses it ("leave the slips as is for now").

TWO MODES (env BH_MODE):
  fit    for every date in BH_DATES: refit the three layers on graded board legs with game_date < that date and store them in
         nba_score.board_hp_tunables (one set per as-of date; nothing is overwritten except the same date's own set).
         Training = nba_score.tier_map_legs_sel_wo (the certified grading of the PrizePicks board, both seasons) + the ladder.
         Dates with fewer than MIN_TRAIN graded legs before them get no set (the 2024-25 opening weeks).
  score  for every date in BH_DATES: the PrizePicks window board (nba_market.pp_leg_price, label 'window') x the day's ladder,
         with the latest tunables whose as_of_date <= that date -> nba_score.board_hp (one row per board leg; the date's rows are
         replaced as one set). Fast - meant for P3 right after final_hp.
  both   fit then score (backfill).
Env: DATABASE_URL, BH_MODE (score), BH_DATES (comma list or FROM:TO; default = today Pacific), BH_WRITE (1 writes; 0 dry run),
     BH_K (400), BH_MIN_TRAIN (20000).
"""
import datetime as dt
import json
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

import numpy as np
import psycopg

PROPS = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "stocks", "pra", "pts_reb", "pts_ast",
         "reb_ast")
TRAIN_SEASONS = ("2024-25", "2025-26")
WGRID = (0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0)
LTS = ("R", "G1", "G2", "G3", "D1", "D2", "D3")
K = float(os.environ.get("BH_K") or 400)
MIN_TRAIN = int(os.environ.get("BH_MIN_TRAIN") or 20000)
EPS = 1e-4
VERSION = "board_hp v1 2026-10-22"
MARKET_TO_PROP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes": "threes_made", "steals": "steals",
                  "blocks": "blocks", "turnovers": "turnovers", "blocks_steals": "stocks", "points_rebounds_assists": "pra",
                  "points_rebounds": "pts_reb", "points_assists": "pts_ast", "rebounds_assists": "reb_ast"}


def logit(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sig(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def fit_logistic(X, y, l2=1e-3, iters=60):
    beta = np.zeros(X.shape[1])
    for _ in range(iters):
        p = sig(X @ beta)
        g = X.T @ (y - p) - l2 * beta
        H = -(X.T * (p * (1 - p))) @ X - l2 * np.eye(X.shape[1])
        step = np.linalg.solve(H, g)
        beta -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    return beta


def ll(p, y):
    p = np.clip(p, EPS, 1 - EPS)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def lt_of(kind_or_tier, rung=None):
    """'R' / 'G1'..'G3' / 'D1'..'D3' from a tier_map tier ('R', 'G2', ...) or from a pp_leg_price kind + rung"""
    if rung is None:
        t = str(kind_or_tier)
        return "R" if t == "R" else t[:2]
    k = str(kind_or_tier)
    if k == "standard":
        return "R"
    r = min(max(abs(int(rung)), 1), 3)
    return ("G" if k == "goblin" else "D") + str(r)


def ladder_p(lines, z, x):
    """p_more at line x (z = log-odds of p_more per rung), interpolated in log-odds, extended on the end slope"""
    if x <= lines[0]:
        s = (z[1] - z[0]) / (lines[1] - lines[0])
        return float(sig(z[0] + s * (x - lines[0])))
    if x >= lines[-1]:
        s = (z[-1] - z[-2]) / (lines[-1] - lines[-2])
        return float(sig(z[-1] + s * (x - lines[-1])))
    return float(sig(np.interp(x, lines, z)))


def centre(lines, z):
    """the line where p_more crosses 0.5 (p_more non-increasing in the line)"""
    if z[0] <= 0:
        return float(lines[0])
    if z[-1] >= 0:
        return float(lines[-1])
    i = int(np.argmax(z < 0))
    return float(lines[i - 1] + (lines[i] - lines[i - 1]) * z[i - 1] / (z[i - 1] - z[i]))


def build_ladder(v):
    """v: [(line, p_more)] -> (lines, z, centre) or None"""
    v = sorted(v)
    lines = np.array([a for a, _ in v], float)
    if len(lines) < 3 or len(set(lines)) != len(lines):
        return None
    pm = np.minimum.accumulate(np.array([b for _, b in v], float))
    z = logit(pm)
    return lines, z, centre(lines, z)


def side_p(lad, line, L0, w, side):
    lines, z, c = lad
    pmo = ladder_p(lines, z, line - (1 - w) * (L0 - c))
    return pmo if side == "Over" else 1 - pmo


def anchor_q(lt, factor):
    return float(np.clip(0.5 if lt == "R" else 1.0 / (2.0 * max(factor or 1.0, 0.3)), 0.05, 0.95))


def parse_dates(s):
    if not s:
        return [dt.datetime.now(ZoneInfo("America/Los_Angeles")).date()]
    if ":" in s:
        a, b = (dt.date.fromisoformat(x) for x in s.split(":"))
        return [a + dt.timedelta(days=i) for i in range((b - a).days + 1)]
    return [dt.date.fromisoformat(x) for x in s.split(",") if x]


# ---------------------------------------------------------------- fit
def load_training(conn):
    name_pid = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    legs = {}
    for d, rk, nn, pr, sd, ln, t, sc, h, fac in conn.execute(
            """SELECT game_date, rank_key, nba_ref.norm_name(player), prop, side, line::float8, tier, score, hit, factor
               FROM nba_score.tier_map_legs_sel_wo WHERE season = ANY(%s) AND hit IS NOT NULL AND prop = ANY(%s)
               AND rank_key = 'final_hp'""", (list(TRAIN_SEASONS), list(PROPS))):
        legs[(d, nn, pr, sd, round(ln, 1), t)] = (int(h), float(fac or 1.0))
    std_line = {(d, nn, pr): ln for (d, nn, pr, sd, ln, t) in legs if t == "R"}
    need = {(name_pid.get(nn), d, pr) for (d, nn, pr, sd, ln, t) in legs if name_pid.get(nn)}
    lad = defaultdict(list)
    cur = conn.cursor(name="bh_train_ladders")
    cur.itersize = 200000
    cur.execute("""SELECT player_id, game_date, prop, line::float8, p_more::float8 FROM nba_score.baseline_history
                   WHERE season = ANY(%s) AND prop = ANY(%s) AND upper(coalesce(period, 'FULL')) = 'FULL'""", (list(TRAIN_SEASONS), list(PROPS)))
    for pid, d, pr, ln, pm in cur:
        if (pid, d, pr) in need and pm is not None:
            lad[(pid, d, pr)].append((ln, pm))
    cur.close()
    ladders = {k: build_ladder(v) for k, v in lad.items()}
    del lad
    rows = []
    for (d, nn, pr, sd, ln, t), (h, fac) in legs.items():
        L0 = std_line.get((d, nn, pr))
        lk = ladders.get((name_pid.get(nn), d, pr))
        if L0 is None or lk is None:
            continue
        rows.append((d, pr, sd, lt_of(t), ln, L0, lk, h, fac))
    rows.sort(key=lambda r: r[0])
    T = {"day": np.array([r[0] for r in rows]), "prop": np.array([r[1] for r in rows]), "side": np.array([r[2] for r in rows]),
         "lt": np.array([r[3] for r in rows]), "y": np.array([r[7] for r in rows], float)}
    T["q"] = np.array([anchor_q(r[3], r[8]) for r in rows])
    T["pw"] = {w: np.array([side_p(r[6], r[4], r[5], w, r[2]) for r in rows]) for w in WGRID}
    print(f"training legs (graded, with a ladder and a standard line): {len(rows):,}; days {T['day'].min()} .. {T['day'].max()}", flush=True)
    return T


def fit_asof(T, day):
    """the three layers fitted on training legs strictly before `day`; None when too few"""
    tr = T["day"] < day
    n = int(tr.sum())
    if n < MIN_TRAIN:
        return None
    P, S, LT, Y, Q = T["prop"], T["side"], T["lt"], T["y"], T["q"]
    w = {}
    for pr in PROPS:
        m = tr & (P == pr)
        w[pr] = 1.0 if m.sum() < 300 else float(min(WGRID, key=lambda x: ll(T["pw"][x][m], Y[m])))
    p1 = np.choose(np.array([WGRID.index(w[pr]) for pr in P]), [T["pw"][x] for x in WGRID])
    l2 = {}
    p2 = p1.copy()
    for lt in LTS:
        for sd in ("Over", "Under"):
            m = tr & (LT == lt) & (S == sd)
            if m.sum() < 200:
                continue
            b = fit_logistic(np.column_stack([np.ones(m.sum()), logit(p1[m])]), Y[m])
            l2[f"{lt}|{sd}"] = [float(b[0]), float(b[1]), int(m.sum())]
            p2[m] = sig(b[0] + b[1] * logit(p1[m]))
    X = lambda m: np.column_stack([np.ones(m.sum()), logit(p2[m]), logit(Q[m])])   # noqa: E731
    l3p, l3 = {}, {}
    for lt in LTS:
        for sd in ("Over", "Under"):
            m = tr & (LT == lt) & (S == sd)
            if m.sum() < 200:
                continue
            bp = fit_logistic(X(m), Y[m])
            l3p[f"{lt}|{sd}"] = [float(x) for x in bp] + [int(m.sum())]
            for pr in PROPS:
                mc = m & (P == pr)
                nc = int(mc.sum())
                if nc < 30:
                    continue
                wgt = nc / (nc + K)
                bc = wgt * fit_logistic(X(mc), Y[mc]) + (1 - wgt) * bp
                l3[f"{pr}|{lt}|{sd}"] = [float(x) for x in bc] + [nc]
    return {"version": VERSION, "n_train": n, "train_through": str(T["day"][tr].max()), "w": w, "l2": l2, "l3_parent": l3p, "l3": l3}


def run_fit(conn, days, write):
    T = load_training(conn)
    if write:
        conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.board_hp_tunables (
                          as_of_date date PRIMARY KEY, params jsonb NOT NULL, n_train int, version text,
                          built_at timestamptz DEFAULT now())""")
        conn.commit()
    done = 0
    for d in days:
        prm = fit_asof(T, d)
        if prm is None:
            continue
        if write:
            conn.execute("""INSERT INTO nba_score.board_hp_tunables (as_of_date, params, n_train, version) VALUES (%s, %s, %s, %s)
                            ON CONFLICT (as_of_date) DO UPDATE SET params = EXCLUDED.params, n_train = EXCLUDED.n_train,
                            version = EXCLUDED.version, built_at = now()""", (d, json.dumps(prm), prm["n_train"], VERSION))
            conn.commit()
        done += 1
        if done == 1 or d.day == 1 or d == days[-1]:
            print(f"  fit {d}: train {prm['n_train']:,} (through {prm['train_through']}); w " +
                  ", ".join(f"{k} {v}" for k, v in prm["w"].items()), flush=True)
    print(f"tunable sets {'written' if write else 'computed (dry run)'}: {done} of {len(days)} dates", flush=True)


# ---------------------------------------------------------------- score
def apply_layers(prm, prop, lt, side, lad, line, L0, factor):
    w = prm["w"].get(prop, 1.0)
    p1 = side_p(lad, line, L0, w, side)
    a = prm["l2"].get(f"{lt}|{side}")
    p2 = float(sig(a[0] + a[1] * logit(p1))) if a else p1
    b = prm["l3"].get(f"{prop}|{lt}|{side}") or prm["l3_parent"].get(f"{lt}|{side}")
    p3 = float(sig(b[0] + b[1] * logit(p2) + b[2] * logit(anchor_q(lt, factor)))) if b else p2
    return w, p1, p2, p3


def run_score(conn, days, write):
    if write:
        conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.board_hp (
                          game_date date NOT NULL, player_id text NOT NULL, player text, prop text NOT NULL, line numeric NOT NULL,
                          side text NOT NULL, kind text, line_type text, std_line numeric, factor numeric, ladder_centre numeric,
                          w numeric, p_l1 numeric, p_l2 numeric, board_hp numeric, final_hp numeric, tunables_as_of date,
                          version text, built_at timestamptz DEFAULT now(),
                          PRIMARY KEY (game_date, player_id, prop, line, side))""")
        conn.commit()
    for d in days:
        t = conn.execute("""SELECT as_of_date, params FROM nba_score.board_hp_tunables WHERE as_of_date <= %s
                            ORDER BY as_of_date DESC LIMIT 1""", (d,)).fetchone()
        if not t:
            print(f"  {d}: no tunable set on or before this date - nothing scored", flush=True)
            continue
        asof, prm = t[0], (t[1] if isinstance(t[1], dict) else json.loads(t[1]))
        legs = conn.execute(
            """SELECT nm.player_id::text, p.player, replace(p.base_market, 'player_', ''), p.side, p.line::float8, p.kind,
                      coalesce(NULLIF(p.tier, 0), round(p.line - p.anchor_line)::int), p.anchor_line::float8, p.factor::float8
               FROM nba_market.pp_leg_price p JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(p.player)
               WHERE p.snapshot_label = 'window' AND p.game_date = %s AND p.kind IN ('standard', 'goblin', 'demon')
                 AND p.anchor_line IS NOT NULL""", (d,)).fetchall()
        legs = [(pid, pl, MARKET_TO_PROP.get(mk), sd, ln, kd, rg, L0, fac) for pid, pl, mk, sd, ln, kd, rg, L0, fac in legs
                if MARKET_TO_PROP.get(mk)]
        keys = list({(pid, pr) for pid, _, pr, *_ in legs})
        lad = defaultdict(list)
        for pid, pr, ln, pm in conn.execute(
                """SELECT player_id, prop, line::float8, p_more::float8 FROM nba_score.baseline_history
                   WHERE game_date = %s AND prop = ANY(%s) AND upper(coalesce(period, 'FULL')) = 'FULL' AND p_more IS NOT NULL""",
                (d, list(PROPS))):
            lad[(pid, pr)].append((ln, pm))
        ladders = {k: build_ladder(v) for k, v in lad.items()}
        fh = {(pid, pr, round(ln, 1), sd): v for pid, pr, ln, sd, v in conn.execute(
            """SELECT player_id::text, prop, line::float8, side, final_hp::float8 FROM nba_score.final_hp WHERE game_date = %s""", (d,))}
        out, miss = {}, defaultdict(int)
        for pid, pl, pr, sd, ln, kd, rg, L0, fac in legs:
            lk = ladders.get((pid, pr))
            if lk is None:
                miss["no ladder"] += 1
                continue
            lt = lt_of(kd, rg if kd != "standard" else 0)
            w, p1, p2, p3 = apply_layers(prm, pr, lt, sd, lk, ln, L0, fac)
            out[(pid, pr, round(ln, 1), sd)] = (d, pid, pl, pr, ln, sd, kd, lt, L0, fac, round(lk[2], 3), w, round(p1, 5), round(p2, 5),
                                                round(p3, 5), fh.get((pid, pr, round(ln, 1), sd)), asof, VERSION)
        rows = list(out.values())
        by = defaultdict(list)
        for r in rows:
            by[(r[7], r[5])].append(r)
        print(f"  {d}: board legs {len(legs):,} (of {len(keys):,} player-props), scored {len(rows):,}, skipped "
              + (", ".join(f"{k} {v:,}" for k, v in miss.items()) or "0") + f"; tunables as of {asof}", flush=True)
        for (lt, sd), rr in sorted(by.items()):
            fhv = [r[15] for r in rr if r[15] is not None]
            print(f"      {lt:<3} {sd:<5} n {len(rr):>5}  board_hp mean {np.mean([r[14] for r in rr]):.3f} >=.58 {sum(r[14] >= .58 for r in rr):>4}"
                  + (f" | final_hp mean {np.mean(fhv):.3f} >=.58 {sum(v >= .58 for v in fhv):>4}" if fhv else ""), flush=True)
        if write and rows:
            with conn.transaction():
                conn.execute("DELETE FROM nba_score.board_hp WHERE game_date = %s", (d,))
                with conn.cursor() as cur:
                    cur.executemany("""INSERT INTO nba_score.board_hp (game_date, player_id, player, prop, line, side, kind, line_type,
                                       std_line, factor, ladder_centre, w, p_l1, p_l2, board_hp, final_hp, tunables_as_of, version)
                                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", rows)
            conn.commit()
        else:
            conn.rollback()


def main():
    mode = os.environ.get("BH_MODE") or "score"
    days = parse_dates(os.environ.get("BH_DATES") or "")
    write = (os.environ.get("BH_WRITE") or "0") == "1"
    if mode not in ("fit", "score", "both"):
        sys.exit(f"BH_MODE must be fit / score / both, got {mode}")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    print(f"{VERSION}: mode {mode}, {len(days)} dates {days[0]} .. {days[-1]}, write {write}", flush=True)
    slate = {r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_market.pp_leg_price WHERE snapshot_label = 'window'
                                              AND game_date BETWEEN %s AND %s""", (min(days), max(days))).fetchall()}
    days = [d for d in days if d in slate]
    print(f"dates with a PrizePicks window board: {len(days)}", flush=True)
    if not days:
        return
    if mode in ("fit", "both"):
        run_fit(conn, days, write)
    if mode in ("score", "both"):
        if not write and mode == "both":
            print("dry run: scoring needs stored tunables - scoring reads whatever sets already exist", flush=True)
        run_score(conn, days, write)


if __name__ == "__main__":
    main()
