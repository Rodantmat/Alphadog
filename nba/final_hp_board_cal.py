#!/usr/bin/env python3
"""
final_hp's BOARD-CENTRED CALIBRATION - the fitter and the per-leg arithmetic build_final_hp.py applies (2026-10-22 night; owner
21:01 PT: "the final hit probability and board hit probability should be the same thing ... board scoped, app board scoped";
21:07 PT: new strategies on it by the next slate). ONE number: final_hp itself; nba_score.board_hp (the parallel table of the
evening) is retired.

WHY (ledger DAY THREE 22; COMPASS facts 156 / 179): the ladder is centred on our own projected mean, which barely adds to the
board's line (earned weight 0.03-0.12 for points / rebounds / assists), so final_hp was far too spread on every line type
(standard 0.80 -> hit 0.58; demons >= .58 hit 0.39-0.43). The as-of calibration (prop, phase, band, side) could not fix it: blind
to line type, fitted on ladder rungs instead of the board.

THE CHAIN for the 12 calibrated props (points, rebounds, assists, threes_made, steals, blocks, turnovers, stocks, pra, pts_reb,
pts_ast, reb_ast); every other prop keeps the as-of calibration:
  L1  BOARD-CENTRED LADDER: the player-prop ladder's centre c (p_more = 0.5, log-odds interpolation over the day's rungs) moves to
      c + (1 - w_prop) (L0 - c); p_side'(line) = p_side(line - shift). L0 = the board's standard line (std_lines(): PrizePicks'
      main line, else the median main line of the books / other apps). A ladder of ONE rung is extended with the prop's typical
      log-odds slope (slope_c[prop] / sqrt(max(c, 1)), the median measured on the training ladders) - so every board leg is priced.
  L2  per prop x line type x side (R, G1-3, D1-3 by the line's distance from L0), logistic on logit(p1), shrunk to the line type x
      side parent by n / (n + K) (research_final_chain_asof.py: chain B; no app price enters - final_hp is app-agnostic).
Tunables: nba_score.final_hp_board_cal (one set per as-of date; fitted only on graded board legs strictly before that date).
Fit:  BC_DATES=FROM:TO BC_WRITE=1 python nba/final_hp_board_cal.py     (default: today Pacific)
"""
import datetime as dt
import json
import os
from collections import defaultdict
from zoneinfo import ZoneInfo

import numpy as np

PROPS = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "stocks", "pra", "pts_reb", "pts_ast",
         "reb_ast")
TRAIN_SEASONS = ("2024-25", "2025-26")
WGRID = (0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0)
LTS = ("R", "G1", "G2", "G3", "D1", "D2", "D3")
K = 400.0
MIN_TRAIN = 20000
EPS = 1e-4
VERSION = "final_hp board-centred v1 2026-10-22"
CHAIN = "B"


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


def line_type(line, L0):
    """R on the standard line; else G (below) / D (above) with rung min(max(|round(line - L0)|, 1), 3)"""
    if L0 is None:
        return None
    if abs(line - L0) < 1e-9:
        return "R"
    r = min(max(int(abs(round(line - L0))), 1), 3)
    return ("G" if line < L0 else "D") + str(r)


class Ladder:
    """one player-prop-day ladder from (line, p_more) rungs; p_more forced non-increasing"""
    __slots__ = ("lines", "z", "c")

    def __init__(self, rungs, slope_c=None):
        v = sorted({float(a): float(b) for a, b in rungs}.items())
        self.lines = np.array([a for a, _ in v])
        self.z = logit(np.minimum.accumulate(np.array([b for _, b in v])))
        if len(self.lines) >= 2:
            z, ln = self.z, self.lines
            if z[0] <= 0:
                s = (z[1] - z[0]) / (ln[1] - ln[0])
                self.c = float(ln[0] - z[0] / s) if s < 0 else float(ln[0])
            elif z[-1] >= 0:
                s = (z[-1] - z[-2]) / (ln[-1] - ln[-2])
                self.c = float(ln[-1] - z[-1] / s) if s < 0 else float(ln[-1])
            else:
                i = int(np.argmax(z < 0))
                self.c = float(ln[i - 1] + (ln[i] - ln[i - 1]) * z[i - 1] / (z[i - 1] - z[i]))
        else:
            s = -abs(slope_c or 1.0) / np.sqrt(max(self.lines[0], 1.0))
            self.c = float(self.lines[0] - self.z[0] / s)

    def p_more(self, x, slope_c=None):
        ln, z = self.lines, self.z
        if len(ln) == 1:
            s = -abs(slope_c or 1.0) / np.sqrt(max(self.c, 1.0))
            return float(sig(z[0] + s * (x - ln[0])))
        if x <= ln[0]:
            return float(sig(z[0] + (z[1] - z[0]) / (ln[1] - ln[0]) * (x - ln[0])))
        if x >= ln[-1]:
            return float(sig(z[-1] + (z[-1] - z[-2]) / (ln[-1] - ln[-2]) * (x - ln[-1])))
        return float(sig(np.interp(x, ln, z)))


def l1_p(lad, line, L0, w, side, slope_c=None):
    """the leg's side probability on the board-centred ladder (Under = 1 - More: board lines are half-points)"""
    pm = lad.p_more(line - (1 - w) * (L0 - lad.c), slope_c)
    return pm if side == "Over" else 1.0 - pm


def apply(prm, prop, side, lad, line, L0):
    """final probability of one leg under a tunable set: (p, line_type, w) - p None when the leg is not covered"""
    if prop not in prm["w"] or L0 is None or lad is None:
        return None, None, None
    w = prm["w"][prop]
    p1 = l1_p(lad, line, L0, w, side, prm["slope_c"].get(prop))
    lt = line_type(line, L0)
    b = prm["l2"].get(f"{prop}|{lt}|{side}") or prm["l2_parent"].get(f"{lt}|{side}")
    p = float(sig(b[0] + b[1] * logit(p1))) if b else p1
    return p, lt, w


class TunableSets:
    """every stored set; .at(d) = the latest set published on or before d (never a future one)"""

    def __init__(self, conn, table="nba_score.final_hp_board_cal"):
        if table not in ("nba_score.final_hp_board_cal", "nba_score.final_hp_board_cal_hold"):
            raise ValueError(f"unknown tunable table {table!r}")
        rows = conn.execute(f"SELECT as_of_date, params FROM {table} ORDER BY as_of_date").fetchall() \
            if conn.execute("SELECT to_regclass(%s)", (table,)).fetchone()[0] else []
        self.dates = [r[0] for r in rows]
        self.sets = [r[1] if isinstance(r[1], dict) else json.loads(r[1]) for r in rows]

    def at(self, d):
        lo, hi, out = 0, len(self.dates) - 1, None
        while lo <= hi:
            mid = (lo + hi) // 2
            if self.dates[mid] <= d:
                out = mid; lo = mid + 1
            else:
                hi = mid - 1
        return (self.dates[out], self.sets[out]) if out is not None else (None, None)


def board_legs(conn, day, legs, table="nba_score.final_hp_board_cal", use_stored=True):
    """ONE NUMBER ON EVERY APP BOARD LEG (2026-10-23; owner 21:01 PT: final_hp IS the board hit probability, on every leg of every
    app board). legs: [(player_id, prop, line, side, baseline_hp)] of one slate (side 'Over' / 'Under').
    Returns [(p, chain, source)] in order (source "final_hp" | "chain" | None):
      * final_hp's own row for this exact leg (game_date, player_id, prop, line, side) -> (its final_hp, its cal_chain): the stored
        number, never recomputed - what the slip engine reads is what every board shows;
      * else, for the 12 calibrated props, the board-centred chain on that day's ladder (final_hp's Over rungs + final_hp_derived
        beyond-certified-depth / wn-neighbour Over rungs - the rungs build_final_hp prices from; a player with none falls back to
        the board legs' own rungs) with the slate's tunable set and standard line -> (p, 'board');
      * else (None, None, None): the caller keeps its own (as-of) number.
    use_stored=False skips the first rule (the audit: the chain on the day's ladder vs final_hp's own rows)."""
    day = day if isinstance(day, dt.date) else dt.date.fromisoformat(str(day))
    stored, rungs = {}, defaultdict(dict)
    for pid, prop, line, side, fh, ch, bh in conn.execute(
            """SELECT player_id::text, prop, line::float8, side, final_hp::float8, cal_chain, baseline_hp::float8
               FROM nba_score.final_hp WHERE game_date = %s AND final_hp IS NOT NULL""", (day,)):
        stored[(pid, prop, round(line, 1), side)] = (fh, ch or "asof")
        if side == "Over" and bh is not None:
            rungs[(pid, prop)][round(line, 1)] = bh
    for pid, prop, line, bh in conn.execute(
            """SELECT player_id::text, prop, line::float8, baseline_hp::float8 FROM nba_score.final_hp_derived
               WHERE game_date = %s AND side = 'Over' AND baseline_hp IS NOT NULL
                 AND derivation IN ('beyond_certified_depth', 'wn_neighbor')""", (day,)):
        rungs[(pid, prop)].setdefault(round(line, 1), bh)
    own = defaultdict(dict)
    for pid, prop, line, side, bh in legs:
        if bh is not None and bh == bh and prop in PROPS:
            own[(str(pid), prop)].setdefault(round(float(line), 1), float(bh) if side == "Over" else 1.0 - float(bh))
    _d, prm = TunableSets(conn, table).at(day)
    std = std_lines(conn, date=day) if prm is not None else {}
    lad, out = {}, []
    for pid, prop, line, side, bh in legs:
        pid, line = str(pid), float(line)
        k = (pid, prop, round(line, 1), side)
        if use_stored and k in stored:
            out.append(stored[k] + ("final_hp",))
            continue
        L0 = std.get((day, pid, prop))
        r = rungs.get((pid, prop)) or own.get((pid, prop))
        if prm is None or prop not in PROPS or L0 is None or not r:
            out.append((None, None, None))
            continue
        if (pid, prop) not in lad:
            lad[(pid, prop)] = Ladder(list(r.items()), prm["slope_c"].get(prop))
        p, _lt, _w = apply(prm, prop, side, lad[(pid, prop)], line, L0[0])
        out.append((p, "board", "chain") if p is not None else (None, None, None))
    return out


STD_LINE_SQL = """
    WITH s AS (
      SELECT b.game_date, nm.player_id::text AS pid, b.market_key, b.bookmaker, b.line::float8 AS line, b.snapshot_label, b.snapshot_ts
      FROM nba_market.board_snapshots b JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)
      WHERE b.market_key = ANY(%(mk)s) AND b.line IS NOT NULL AND {scope}),
    pp AS (SELECT DISTINCT ON (game_date, pid, market_key) game_date, pid, market_key, line
           FROM s WHERE bookmaker = 'prizepicks'
           ORDER BY game_date, pid, market_key, (snapshot_label = 'window') DESC, snapshot_ts DESC, line),
    -- each book's window-or-latest snapshot; a book whose snapshot carries MORE THAN ONE line in the main market (a ladder:
    -- Fanatics stocks, BetRivers points - 2026-10-23 audit_one_number) has no single main line and is left out of the median
    -- (before, DISTINCT ON picked one of its rungs arbitrarily: L0 0.5 vs 3.5 on the same leg between two reads)
    bk0 AS (SELECT game_date, pid, market_key, bookmaker, snapshot_ts, bool_or(snapshot_label = 'window') AS win,
                   min(line) AS line, count(DISTINCT line) AS nl
            FROM s WHERE bookmaker <> 'prizepicks' GROUP BY 1, 2, 3, 4, 5),
    bk1 AS (SELECT DISTINCT ON (game_date, pid, market_key, bookmaker) game_date, pid, market_key, line, nl
            FROM bk0 ORDER BY game_date, pid, market_key, bookmaker, win DESC, snapshot_ts DESC),
    bk AS (SELECT game_date, pid, market_key, percentile_disc(0.5) WITHIN GROUP (ORDER BY line) AS line
           FROM bk1 WHERE nl = 1 GROUP BY 1, 2, 3)
    SELECT coalesce(pp.game_date, bk.game_date), coalesce(pp.pid, bk.pid), coalesce(pp.market_key, bk.market_key),
           coalesce(pp.line, bk.line), CASE WHEN pp.line IS NOT NULL THEN 'prizepicks' ELSE 'books' END
    FROM pp FULL JOIN bk ON bk.game_date = pp.game_date AND bk.pid = pp.pid AND bk.market_key = pp.market_key"""

MARKETS = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made",
           "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers", "player_blocks_steals": "stocks",
           "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast",
           "player_rebounds_assists": "reb_ast"}


def std_lines(conn, date=None, seasons_dates=None):
    """{(game_date, player_id, prop): (L0, source)} - PrizePicks' main (non-alternate) line, window snapshot first, else the latest;
    without a PrizePicks line, the median main line across the other books / apps (each at its window-or-latest snapshot)"""
    if date is not None:
        scope, params = "b.game_date = %(d)s", {"d": date}
    else:
        scope, params = "b.game_date BETWEEN %(a)s AND %(b)s", {"a": seasons_dates[0], "b": seasons_dates[1]}
    params["mk"] = list(MARKETS)
    out = {}
    if date is None and conn.execute("SELECT to_regclass('nba_score.board_std_line')").fetchone()[0]:
        a, b = seasons_dates
        have = conn.execute("SELECT min(game_date), max(game_date) FROM nba_score.board_std_line").fetchone()
        if have[0] is not None and have[0] <= a and have[1] >= b:
            for d, pid, pr, line, src in conn.execute("""SELECT game_date, player_id, prop, line::float8, src FROM nba_score.board_std_line
                                                         WHERE game_date BETWEEN %s AND %s""", (a, b)):
                out[(d, pid, pr)] = (float(line), src)
            return out
    for d, pid, mk, line, src in conn.execute(STD_LINE_SQL.format(scope=scope), params):
        out[(d, pid, MARKETS[mk])] = (float(line), src)
    return out


def materialize_std_lines(conn, a, b):
    """nba_score.board_std_line for [a, b] - the same rule as std_lines(), computed once so a multi-job season rebuild does not
    rescan board_snapshots in every job (a season scan is ~17 minutes). Replaced as one set for the range."""
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.board_std_line (game_date date, player_id text, prop text, line numeric,
                    src text, built_at timestamptz DEFAULT now(), PRIMARY KEY (game_date, player_id, prop))""")
    rows = [(d, pid, MARKETS[mk], line, src) for d, pid, mk, line, src in conn.execute(
        STD_LINE_SQL.format(scope="b.game_date BETWEEN %(a)s AND %(b)s"), {"a": a, "b": b, "mk": list(MARKETS)})]
    with conn.transaction():
        conn.execute("DELETE FROM nba_score.board_std_line WHERE game_date BETWEEN %s AND %s", (a, b))
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO nba_score.board_std_line (game_date, player_id, prop, line, src) VALUES (%s,%s,%s,%s,%s)", rows)
    conn.commit()
    return len(rows)


# ---------------------------------------------------------------- fit
def load_training(conn):
    name_pid = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    legs = {}
    for d, nn, pr, sd, ln, t, h in conn.execute(
            """SELECT game_date, nba_ref.norm_name(player), prop, side, line::float8, tier, hit
               FROM nba_score.tier_map_legs_sel_wo WHERE season = ANY(%s) AND hit IS NOT NULL AND prop = ANY(%s)
               AND rank_key = 'final_hp'""", (list(TRAIN_SEASONS), list(PROPS))):
        legs[(d, nn, pr, sd, round(ln, 1))] = int(h)
    # the standard line of the training legs is PrizePicks' window main line - the same rule std_lines() applies live
    need = {(name_pid.get(nn), d, pr) for (d, nn, pr, sd, ln) in legs if name_pid.get(nn)}
    lo, hi = min(k[1] for k in need), max(k[1] for k in need)
    L0 = std_lines(conn, seasons_dates=(lo, hi))
    lad = defaultdict(list)
    cur = conn.cursor(name="bc_train_ladders")
    cur.itersize = 200000
    cur.execute("""SELECT player_id, game_date, prop, line::float8, p_more::float8 FROM nba_score.baseline_history
                   WHERE season = ANY(%s) AND prop = ANY(%s) AND upper(coalesce(period, 'FULL')) = 'FULL' AND p_more IS NOT NULL""",
                (list(TRAIN_SEASONS), list(PROPS)))
    for pid, d, pr, ln, pm in cur:
        if (pid, d, pr) in need:
            lad[(pid, d, pr)].append((ln, pm))
    cur.close()
    # the typical log-odds slope per prop, measured on ladders with >= 3 rungs: |dz/dline| x sqrt(max(c, 1))
    slopes = defaultdict(list)
    ladders = {}
    for k, v in lad.items():
        if len(v) >= 3:
            L = Ladder(v)
            ladders[k] = L
            s = (L.z[-1] - L.z[0]) / (L.lines[-1] - L.lines[0])
            if s < 0:
                slopes[k[2]].append(-s * np.sqrt(max(L.c, 1.0)))
    slope_c = {pr: float(np.median(v)) for pr, v in slopes.items() if v}
    rows = []
    for (d, nn, pr, sd, ln), h in legs.items():
        pid = name_pid.get(nn)
        l0 = L0.get((d, pid, pr))
        lk = ladders.get((pid, d, pr))
        if l0 is None or lk is None:
            continue
        rows.append((d, pr, sd, line_type(ln, l0[0]), ln, l0[0], lk, h))
    rows.sort(key=lambda r: r[0])
    T = {"day": np.array([r[0] for r in rows]), "prop": np.array([r[1] for r in rows]), "side": np.array([r[2] for r in rows]),
         "lt": np.array([r[3] for r in rows]), "y": np.array([r[7] for r in rows], float), "slope_c": slope_c}
    T["pw"] = {w: np.array([l1_p(r[6], r[4], r[5], w, r[2]) for r in rows]) for w in WGRID}
    print(f"training legs (graded PrizePicks board legs with a ladder and a standard line): {len(rows):,}; "
          f"{T['day'].min()} .. {T['day'].max()}; slope constants " + ", ".join(f"{k} {v:.2f}" for k, v in sorted(slope_c.items())),
          flush=True)
    return T


def fit_asof(T, day):
    tr = T["day"] < day
    n = int(tr.sum())
    if n < MIN_TRAIN:
        return None
    P, S, LT, Y = T["prop"], T["side"], T["lt"], T["y"]
    w = {}
    for pr in PROPS:
        m = tr & (P == pr)
        w[pr] = 1.0 if m.sum() < 300 else float(min(WGRID, key=lambda x: ll(T["pw"][x][m], Y[m])))
    p1 = np.choose(np.array([WGRID.index(w[pr]) for pr in P]), [T["pw"][x] for x in WGRID])
    X = lambda m: np.column_stack([np.ones(m.sum()), logit(p1[m])])   # noqa: E731
    l2p, l2 = {}, {}
    for lt in LTS:
        for sd in ("Over", "Under"):
            m = tr & (LT == lt) & (S == sd)
            if m.sum() < 200:
                continue
            bp = fit_logistic(X(m), Y[m])
            l2p[f"{lt}|{sd}"] = [float(bp[0]), float(bp[1]), int(m.sum())]
            for pr in PROPS:
                mc = m & (P == pr)
                nc = int(mc.sum())
                if nc < 30:
                    continue
                wgt = nc / (nc + K)
                bc = wgt * fit_logistic(X(mc), Y[mc]) + (1 - wgt) * bp
                l2[f"{pr}|{lt}|{sd}"] = [float(bc[0]), float(bc[1]), nc]
    return {"version": VERSION, "chain": CHAIN, "n_train": n, "train_through": str(T["day"][tr].max()), "w": w,
            "slope_c": T["slope_c"], "l2": l2, "l2_parent": l2p}


def run_fit(conn, days, write):
    T = load_training(conn)
    if write:
        conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.final_hp_board_cal (
                          as_of_date date PRIMARY KEY, params jsonb NOT NULL, n_train int, version text,
                          built_at timestamptz DEFAULT now())""")
        conn.commit()
    done = 0
    for d in days:
        prm = fit_asof(T, d)
        if prm is None:
            continue
        if write:
            conn.execute("""INSERT INTO nba_score.final_hp_board_cal (as_of_date, params, n_train, version) VALUES (%s, %s, %s, %s)
                            ON CONFLICT (as_of_date) DO UPDATE SET params = EXCLUDED.params, n_train = EXCLUDED.n_train,
                            version = EXCLUDED.version, built_at = now()""", (d, json.dumps(prm), prm["n_train"], VERSION))
            conn.commit()
        done += 1
        if done == 1 or d.day == 1 or d == days[-1]:
            print(f"  fit {d}: train {prm['n_train']:,} (through {prm['train_through']}); w "
                  + ", ".join(f"{k} {v}" for k, v in prm["w"].items()), flush=True)
    print(f"tunable sets {'written' if write else 'computed (dry run)'}: {done} of {len(days)} dates", flush=True)


def main():
    import psycopg
    s = os.environ.get("BC_DATES") or ""
    if not s:
        days = [dt.datetime.now(ZoneInfo("America/Los_Angeles")).date()]
    elif ":" in s:
        a, b = (dt.date.fromisoformat(x) for x in s.split(":"))
        days = [a + dt.timedelta(days=i) for i in range((b - a).days + 1)]
    else:
        days = [dt.date.fromisoformat(x) for x in s.split(",") if x]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    slate = {r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_market.board_rung_keys
                                           WHERE game_date BETWEEN %s AND %s""", (min(days), max(days))).fetchall()}
    days = [d for d in days if d in slate]
    print(f"{VERSION}: {len(days)} slate dates", flush=True)
    if os.environ.get("BC_STD_RANGE"):
        a, b = (dt.date.fromisoformat(x) for x in os.environ["BC_STD_RANGE"].split(":"))
        print(f"standard lines materialized for {a} .. {b}: {materialize_std_lines(conn, a, b):,}", flush=True)
    if days:
        run_fit(conn, days, (os.environ.get("BC_WRITE") or "0") == "1")


if __name__ == "__main__":
    main()
