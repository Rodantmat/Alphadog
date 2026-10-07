#!/usr/bin/env python3
"""
WHOLE-NUMBER LEGS IN THE SAME CURRENCY (strategy doc §31s G1, gate 2b; owner 2026-10-06: "if whole-number lines are on the board
and properly priced they can and should make slips if they are strong ... a smart derived ladder variation with a little safety
discount").

Why gate 2 under-selected them: the certified cells rank legs by a RAW model score whose realized hit rate was certified per cell;
gate 2 inserted whole-number legs with RECALIBRATED (honest, compressed) probabilities next to RAW (mildly overconfident) half-point
scores - two currencies, so a genuinely strong whole-number leg ranked like a weak half-point leg (chosen in 1% of slips).

This build prices every PrizePicks window whole-number leg and converts it into the cell's own currency. All fitting is CROSS-FIT
(each season priced only with what was fitted on the OTHER season):
  1. derived win | no tie   pc0 = Over(k+1/2) / (Over(k+1/2) + Under(k-1/2))  (mirror for Less)   - exact for count stats
  2. recalibration          pc  = sigmoid(a + b*logit(pc0)), (a, b) from the other season (stored per_season_fit)
  3. tie probability        pt  = scale[prop] * max(0, 1 - Over(k+1/2) - Under(k-1/2)); scale = Gamma-Poisson EB ratio
                              (actual / raw-expected ties, alpha 44.25 as stored) fitted on the other season
  4. SAFETY DISCOUNT        pc_safe = pc - SE, SE = sqrt(r(1-r)/n) of the other season's out-of-sample calibration bin
                              (0.05 wide) containing pc - a one-standard-error lower bound, larger where evidence is thin
  5. EV-EQUIVALENT          p_eq = pc_safe*(1-pt) + R*pt, R = 0.5: a tie drops a Power lineup one tier; payout ratios
                              M(n-1)/M(n) = 3/6, 6/10, 10/20 for the certified sizes 3-5 -> 0.5 / 0.6 / 0.5 (0.5 = conservative)
                              p_eq is directly comparable with a half-point leg's hit probability (no ties there)
  6. SAME CURRENCY          per (rank_key, prop, tier, side): isotonic map raw half-point score -> realized hit rate, fitted on
                              the OTHER season's certified legs (weighted PAV); the whole-number leg's score s* = the LOWEST raw
                              score whose fitted hit rate >= p_eq (conservative inside flat segments); above the map's range ->
                              its top score; below -> its bottom; no map with >= MIN_N legs -> (rank_key, prop, tier) both sides;
                              none -> leg left out (counted)
Certified legs are copied UNTOUCHED (verified); n_rank / cell_size recomputed over the union. Ties kept (hit NULL -> voided by the
engine's tie-aware grade()). Writes nba_score.tier_map_legs_wi2 only. Env: DATABASE_URL.
The steps are functions (load_raw, crossfit_price, crossfit_maps, dedup, crossfit_rows) shared with the production selection table
(build_tier_map_sel.py), so the certified seasons there are exactly this computation.
"""
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_tier_map_wi import STEPS as WI_STEPS  # noqa: E402  (the certified recipe's leg selection, reused verbatim)

R_TIE = 0.5
MIN_N = 200
BIN = 0.05
OTHER = {"2024-25": "2025-26", "2025-26": "2024-25"}

RAW_SQL = """
SELECT pu.season, pi.game_date, pu.player, pi.prop, pi.side, pi.line, pi.kind, pi.sys_tier, pi.price, pu.hit,
       o.final_hp::float o_f, u.final_hp::float u_f, g.min::float mins,
       CASE pi.prop WHEN 'points' THEN g.pts WHEN 'rebounds' THEN g.reb WHEN 'assists' THEN g.ast WHEN 'threes_made' THEN g.fg3m
         WHEN 'steals' THEN g.stl WHEN 'blocks' THEN g.blk WHEN 'turnovers' THEN g.tov WHEN 'pts_reb' THEN g.pts+g.reb
         WHEN 'pts_ast' THEN g.pts+g.ast WHEN 'reb_ast' THEN g.reb+g.ast WHEN 'pra' THEN g.pts+g.reb+g.ast WHEN 'stocks' THEN g.stl+g.blk END::float stat
FROM _pi pi
JOIN nba_market.prop_universe pu ON pu.game_date=pi.game_date AND nba_ref.norm_name(pu.player)=pi.nm AND pu.prop=pi.prop
     AND pu.side=pi.side AND pu.line=pi.line AND pu.line_source='real'
JOIN nba_score.final_hp o ON o.game_date=pu.game_date AND o.player_id=pu.player_id AND o.prop=pu.prop AND o.side='Over'  AND o.line=pu.line+0.5
JOIN nba_score.final_hp u ON u.game_date=pu.game_date AND u.player_id=pu.player_id AND u.prop=pu.prop AND u.side='Under' AND u.line=pu.line-0.5
LEFT JOIN nba_stats.player_game_log g ON g.game_date=pu.game_date AND g.nba_player_id=pu.player_id::bigint
WHERE o.final_hp IS NOT NULL AND u.final_hp IS NOT NULL"""


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sig(z):
    return 1 / (1 + np.exp(-z))


def pav(x, y, w):
    """weighted isotonic (non-decreasing) regression of y on x (pool-adjacent-violators); returns sorted unique x, fitted y"""
    df = pd.DataFrame({"x": x, "yw": y * w, "w": w}).groupby("x", sort=True).sum()
    xs, ys, ws = df.index.values.astype(float), (df["yw"] / df["w"]).values, df["w"].values
    val, wt, cnt = [], [], []
    for yi, wi in zip(ys, ws):
        val.append(yi); wt.append(wi); cnt.append(1)
        while len(val) > 1 and val[-2] > val[-1]:
            v = (val[-2] * wt[-2] + val[-1] * wt[-1]) / (wt[-2] + wt[-1])
            wt[-2] += wt[-1]; cnt[-2] += cnt[-1]; val[-2] = v
            del val[-1], wt[-1], cnt[-1]
    return xs, np.repeat(np.asarray(val, float), cnt)


def inverse(fx, fy, p):
    """lowest raw score whose fitted hit rate >= p; clamp to the map's range"""
    idx = np.searchsorted(fy, p, side="left")          # fy non-decreasing
    return float(fx[min(idx, len(fx) - 1)])


def load_raw(conn):
    """every played PrizePicks window whole-number leg with its adjacent-rung model prices (the certified recipe's selection)"""
    for label, sql in WI_STEPS:
        if label in ("priced whole-number window legs", "index"):
            conn.execute(sql)
            break
    conn.execute("CREATE INDEX ON _pi (game_date, nm, prop, side, line)")
    w = pd.read_sql(RAW_SQL, conn)
    w["hit"] = w["hit"].astype(float)
    w["h"] = np.where(w["hit"].notna(), w["hit"], np.where((w["mins"].fillna(0) > 0) & (w["stat"] == w["line"]), np.nan, -1))
    w = w[w["h"] != -1].copy()                          # DNPs out, exactly as the certified build
    w["tie"] = w["h"].isna().astype(int)
    w = w[(w["o_f"] + w["u_f"]) > 0].copy()
    over = w["side"].eq("Over")
    w["pc0"] = np.where(over, w["o_f"], w["u_f"]) / (w["o_f"] + w["u_f"])
    w["raw_tie"] = np.clip(1 - w["o_f"] - w["u_f"], 0, None)
    w["tier"] = np.select([w["kind"].eq("standard"), w["kind"].eq("goblin"), w["kind"].eq("demon")],
                          ["R", "G" + w["sys_tier"].abs().clip(upper=3).fillna(1).astype(int).astype(str),
                           "D" + w["sys_tier"].abs().clip(upper=3).fillna(1).astype(int).astype(str)], default=None)
    print(f"whole-number legs (played): {len(w):,} | ties {int(w['tie'].sum()):,}", flush=True)
    return w


def crossfit_price(w, fit, alpha, verbose=True):
    """steps 2-5 for the two certified seasons: each priced only with what was fitted on the OTHER season"""
    parts = []
    for s in ("2024-25", "2025-26"):
        o = OTHER[s]; tr = w[w["season"] == o]; te = w[w["season"] == s].copy()
        if te.empty:
            continue
        a, b = float(fit[o]["a"]), float(fit[o]["b"])
        te["pc"] = sig(a + b * logit(te["pc0"].values))
        # tie scale on the OTHER season: EB ratio actual/expected per prop toward the pooled ratio (alpha as stored)
        pooled = tr["tie"].sum() / max(tr["raw_tie"].sum(), 1e-9)
        sc = {}
        for prop, g in tr.groupby("prop"):
            e = g["raw_tie"].sum(); sc[prop] = (alpha * pooled + g["tie"].sum()) / (alpha + e) if e > 0 else pooled
        te["pt"] = np.clip(te["prop"].map(sc).fillna(pooled) * te["raw_tie"], 0, 0.6)
        # calibration bins of pc on the OTHER season (non-tied legs): SE of the realized rate in the bin
        trn = tr[tr["tie"] == 0].copy()
        trn["pc"] = sig(a + b * logit(trn["pc0"].values))   # the same map applied in-sample to the fit season (bin occupancy only)
        trn["bin"] = np.floor(trn["pc"] / BIN).astype(int)
        bs = trn.groupby("bin")["h"].agg(["mean", "count"])
        te["bin"] = np.floor(te["pc"] / BIN).astype(int)
        r = te["bin"].map(bs["mean"]); n = te["bin"].map(bs["count"])
        se = np.sqrt((r * (1 - r)).fillna(0.25) / n.fillna(1).clip(lower=1))
        te["se"] = se.values
        te["pc_safe"] = np.clip(te["pc"] - te["se"], 0.0, 1.0)
        te["p_eq"] = te["pc_safe"] * (1 - te["pt"]) + R_TIE * te["pt"]
        parts.append(te)
        if verbose:
            print(f"  {s}: recal from {o} (a {a:+.5f}, b {b:.5f}); tie scale {', '.join(f'{k} {v:.2f}' for k, v in sorted(sc.items()))}", flush=True)
    return pd.concat(parts, ignore_index=True) if parts else w.iloc[0:0].assign(p_eq=[])


def crossfit_maps(conn):
    """step 6 maps per season of fit: isotonic raw score -> realized on each season's certified half-point legs"""
    cert = pd.read_sql("""SELECT rank_key, season, prop, tier, side, score, hit FROM nba_score.tier_map_legs
                          WHERE hit IS NOT NULL AND line <> floor(line) AND season IN ('2024-25', '2025-26')""", conn)
    print(f"certified half-point legs for the maps: {len(cert):,}", flush=True)
    maps = {}
    for (rk, s, prop, tier, side), g in cert.groupby(["rank_key", "season", "prop", "tier", "side"]):
        if len(g) >= MIN_N:
            maps[(rk, s, prop, tier, side)] = pav(g["score"].values, g["hit"].values.astype(float), np.ones(len(g)))
    for (rk, s, prop, tier), g in cert.groupby(["rank_key", "season", "prop", "tier"]):
        if len(g) >= MIN_N:
            maps[(rk, s, prop, tier, "*")] = pav(g["score"].values, g["hit"].values.astype(float), np.ones(len(g)))
    return maps


def dedup(w):
    """keep-first by price per leg, as the certified recipe; equal prices broken deterministically by rung (a stable sort - the
    pricing view holds a few duplicate keys at the SAME price with different rungs, where an unstable sort picked either)"""
    w = w[w["tier"].notna()].copy()
    w["_rk"] = w["sys_tier"].fillna(0)
    w = w.sort_values(["price", "_rk", "kind"], kind="mergesort").drop_duplicates(["game_date", "player", "prop", "side", "line"], keep="first")
    return w.drop(columns="_rk")


def crossfit_rows(w, maps):
    """tier-map rows (3 rank keys) in the cells' currency, using the OTHER season's maps"""
    rows, miss = [], 0
    for rk in ("final_hp", "baseline_hp", "final_score"):
        for r_ in w.itertuples(index=False):
            o = OTHER[r_.season]
            m = maps.get((rk, o, r_.prop, r_.tier, r_.side)) or maps.get((rk, o, r_.prop, r_.tier, "*"))
            if m is None:
                miss += 1; continue
            rows.append((rk, r_.season, r_.game_date, r_.player, r_.prop, r_.side, float(r_.line), r_.kind, r_.tier,
                         None if pd.isna(r_.sys_tier) else int(r_.sys_tier), float(r_.price), inverse(m[0], m[1], r_.p_eq),
                         None if pd.isna(r_.h) else int(r_.h)))
    return rows, miss


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    cfg = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='whole_number_recalibration'").fetchone()[0]
    fit = cfg["per_season_fit"]; alpha = float(cfg["tie_scale_method"]["alpha_mle"])
    w = crossfit_price(load_raw(conn), fit, alpha)

    # out-of-sample honesty of the EV-equivalent price: realized EV-equivalent = hit + R*tie
    w["real_eq"] = np.where(w["tie"] == 1, R_TIE, w["h"].fillna(0))
    w["pbin"] = (np.floor(w["p_eq"] / BIN) * BIN).round(2)
    rel = w.groupby(["season", "pbin"]).agg(n=("p_eq", "size"), pred=("p_eq", "mean"), real=("real_eq", "mean")).reset_index()
    print("\nOUT-OF-SAMPLE reliability of p_eq (predicted vs realized hit + 0.5*tie):", flush=True)
    for r_ in rel.itertuples(index=False):
        if r_.n >= 30:
            print(f"  {r_.season} {r_.pbin:.2f}: n {r_.n:>6,} pred {r_.pred:.3f} real {r_.real:.3f}", flush=True)

    # 6) same currency
    maps = crossfit_maps(conn)
    rows, miss = crossfit_rows(dedup(w), maps)
    print(f"whole-number rows in cell currency: {len(rows):,} (3 rank keys) | left out (no map): {miss:,}", flush=True)

    with conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS nba_score._wi2_new")
        cur.execute("""CREATE TABLE nba_score._wi2_new (rank_key text, season text, game_date date, player text, prop text, side text,
                       line numeric, kind text, tier text, rung int, factor double precision, score double precision, hit int)""")
        with cur.copy("COPY nba_score._wi2_new FROM STDIN") as cp:
            for t in rows:
                cp.write_row(t)
        cur.execute("DROP TABLE IF EXISTS nba_score.tier_map_legs_wi2")
        cur.execute("""CREATE TABLE nba_score.tier_map_legs_wi2 AS
            WITH u AS (SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor, score, hit FROM nba_score.tier_map_legs
                       UNION ALL SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor, score, hit FROM nba_score._wi2_new)
            SELECT u.*, row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score DESC, player, side, line)::int AS n_rank,
                   count(*) OVER (PARTITION BY rank_key, game_date, prop, tier)::int AS cell_size FROM u""")
        cur.execute("CREATE INDEX ON nba_score.tier_map_legs_wi2 (rank_key, game_date, prop, tier)")
        cur.execute("DROP TABLE nba_score._wi2_new")
    conn.commit()
    chk = conn.execute("""SELECT count(*) FROM nba_score.tier_map_legs c JOIN nba_score.tier_map_legs_wi2 w USING (rank_key, game_date, player, prop, side, line)
                          WHERE c.score IS DISTINCT FROM w.score OR c.hit IS DISTINCT FROM w.hit OR c.factor IS DISTINCT FROM w.factor""").fetchone()[0]
    print(f"certified legs altered in the copy (must be 0): {chk}", flush=True)
    top = conn.execute("""SELECT season, count(*) FILTER (WHERE line=floor(line)), count(*) FILTER (WHERE line=floor(line) AND n_rank<=3)
                          FROM nba_score.tier_map_legs_wi2 WHERE rank_key='final_score' GROUP BY 1 ORDER BY 1""").fetchall()
    print(f"whole-number legs (final_score key) and how many rank top-3 in their cell: {top}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
