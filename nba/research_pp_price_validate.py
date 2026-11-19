#!/usr/bin/env python3
"""
S3 - HOW GOOD ARE THE STORED PRIZEPICKS LEG PRICES? (honest rebuild, NBA_HONEST_REBUILD.md section 8b). READ-ONLY.
nba_market.pp_leg_price holds a MODELLED price factor for every PrizePicks rung of three seasons (model_version pp-leg-v2-...). Since 2026-09-21 the quote
tool has collected REAL prices (nba_market.pp_mined_leg: the 2-pick Power quote of the rung with a regular partner). This script joins the two on the same
date / player / market / line and reports, per kind and tier and overall:
  the ratio modelled / real (median, 10%, 90%), mean abs log error, the share within 3% / 5% / 10%,
  the same by price band, by prop, by month (is the model drifting), and for rungs the model marks price_source <> 'model'.
Then a refit: real factor ~ kind, tier, prop group, relative distance of the line from the regular line, line level - fitted on whole days and scored on the
other days (5 folds by date), to see how much error a better price model would remove.
Real price read two ways: f2 = quote / 3 (0.1 grid, blurry) and f6 = the sharp price implied by the 2-pick law P2 = 2.99 x f6^0.904.
Env: DATABASE_URL.
"""
import os

import numpy as np
import pandas as pd
import psycopg

GRP = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes"}


def summ(label, r):
    r = r[np.isfinite(r) & (r > 0)]
    if len(r) < 30:
        return
    e = np.abs(np.log(r))
    print(f"PV|{label:44s} n {len(r):6,} | modelled / real: median {np.median(r):.3f} (10% {np.quantile(r, .1):.3f}, 90% {np.quantile(r, .9):.3f}) | mean abs error {100 * e.mean():5.1f}% | "
          f"within 3% {100 * (e < .03).mean():3.0f}%, 5% {100 * (e < .05).mean():3.0f}%, 10% {100 * (e < .10).mean():3.0f}%", flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    q = pd.read_sql("""SELECT left(b.start_time, 10) gd, nba_ref.norm_name(m.player) nm, m.base_market, m.line::float8 line, m.kind, m.std_line::float8 std_line,
                              m.two_pick_power::float8 p2, m.quoted_at
                       FROM nba_market.pp_mined_leg m JOIN nba_market.pp_board_row b ON b.run_file = m.run_file AND b.projection_id = m.projection_id
                       WHERE m.two_pick_power > 0 AND m.base_market IS NOT NULL""", conn)
    q = q.sort_values("quoted_at").drop_duplicates(["gd", "nm", "base_market", "line"], keep="last")
    p = pd.read_sql("""SELECT game_date::text gd, nm, base_market, line::float8 line, snapshot_label, tier, anchor_line::float8 anchor_line, factor::float8 f_model,
                              price_source, kind kind_model FROM nba_market.pp_leg_price WHERE game_date >= '2026-09-15' AND side = 'Over'""", conn)
    conn.close()
    p["w"] = (p["snapshot_label"] == "window").astype(int)
    p = p.sort_values("w").drop_duplicates(["gd", "nm", "base_market", "line"], keep="last")
    j = q.merge(p, on=["gd", "nm", "base_market", "line"], how="left")
    print(f"PV|real quoted rungs {len(q):,} on {q['gd'].nunique()} dates; found in the price table {int(j['f_model'].notna().sum()):,}; kind agrees {100 * (j['kind'] == j['kind_model'])[j['f_model'].notna()].mean():.0f}%", flush=True)
    j = j[j["f_model"].notna()].copy()
    j["f2"] = j["p2"] / 3.0; j["f6"] = (j["p2"] / 2.99) ** (1 / 0.904)
    for real in ("f2", "f6"):
        print(f"\nPV|=== stored model price against the real price read as {real} ===")
        r = (j["f_model"] / j[real]).values
        summ("all rungs", r)
        for kd in ("goblin", "demon"):
            k = j[j["kind"] == kd]; summ(f"{kd}", (k["f_model"] / k[real]).values)
            for t in sorted(k["tier"].dropna().unique()):
                kk = k[k["tier"] == t]; summ(f"{kd} tier {int(t)}", (kk["f_model"] / kk[real]).values)
            for lo, hi in ((0, .7), (.7, .85), (.85, 1.0), (1.0, 1.3), (1.3, 2.0), (2.0, 3.5), (3.5, 99)):
                kk = k[(k[real] >= lo) & (k[real] < hi)]; summ(f"{kd} real price {lo}-{hi}", (kk["f_model"] / kk[real]).values)
            for g, kk in k.groupby(k["base_market"].map(GRP).fillna("combo")):
                summ(f"{kd} {g}", (kk["f_model"] / kk[real]).values)
        for mo, kk in j.groupby(j["gd"].str[:7]):
            summ(f"month {mo}", (kk["f_model"] / kk[real]).values)
        for ps, kk in j.groupby("price_source"):
            summ(f"price_source {ps}", (kk["f_model"] / kk[real]).values)
    # refit on real quotes, 5 folds by date
    j["rel"] = (j["line"] - j["std_line"]) / np.maximum(1.0, j["std_line"]); j["lvl"] = np.log(np.maximum(1.0, j["std_line"]))
    j = j[np.isfinite(j["rel"]) & np.isfinite(j["lvl"])].copy(); j["g"] = j["base_market"].map(GRP).fillna("combo")
    days = np.array(sorted(j["gd"].unique())); fold = {d: i % 5 for i, d in enumerate(days)}; j["fold"] = j["gd"].map(fold)
    print("\nPV|=== refit on the real quotes (whole days held out): log real price ~ kind x [1, distance, distance^2, line level, distance x level] + prop group ===")
    for real in ("f2", "f6"):
        pred = np.full(len(j), np.nan); y = np.log(j[real].values)
        for kd in ("goblin", "demon"):
            mk = (j["kind"] == kd).values
            X = np.column_stack([np.ones(mk.sum()), j["rel"].values[mk], j["rel"].values[mk] ** 2, j["lvl"].values[mk], j["rel"].values[mk] * j["lvl"].values[mk]] +
                                [(j["g"].values[mk] == g).astype(float) for g in ("rebounds", "assists", "threes", "combo")])
            fo = j["fold"].values[mk]; out = np.full(mk.sum(), np.nan)
            for f in range(5):
                tr = fo != f; b, *_ = np.linalg.lstsq(X[tr], y[mk][tr], rcond=None); out[~tr] = X[~tr] @ b
            pred[mk] = out
            b, *_ = np.linalg.lstsq(X, y[mk], rcond=None)
            print(f"PV|{real} {kd} coefficients (const, distance, distance^2, level, distance x level, rebounds, assists, threes, combo): {np.round(b, 3).tolist()}")
        ok = np.isfinite(pred)
        summ(f"REFIT held out, {real}: all", np.exp(pred[ok] - y[ok]))
        for kd in ("goblin", "demon"):
            mk = ok & (j["kind"] == kd).values; summ(f"REFIT held out, {real}: {kd}", np.exp(pred[mk] - y[mk]))
            for lo, hi in ((0, .7), (.7, .85), (.85, 1.0), (1.0, 1.3), (1.3, 2.0), (2.0, 3.5), (3.5, 99)):
                m2 = mk & (j[real].values >= lo) & (j[real].values < hi); summ(f"REFIT held out, {real}: {kd} real price {lo}-{hi}", np.exp(pred[m2] - y[m2]))
    # stacked refit: the stored model price as an input, re-centred per kind with tier and distance terms (whole days held out)
    print("\nPV|=== STACKED refit (whole days held out): log real price ~ kind x [1, log stored price, (log stored price)^2, distance, level, tier] + prop group ===")
    j["lfm"] = np.log(j["f_model"].values); j["tr"] = j["tier"].fillna(0).astype(float)
    for real in ("f2", "f6"):
        pred = np.full(len(j), np.nan); y = np.log(j[real].values)
        for kd in ("goblin", "demon"):
            mk = (j["kind"] == kd).values
            X = np.column_stack([np.ones(mk.sum()), j["lfm"].values[mk], j["lfm"].values[mk] ** 2, j["rel"].values[mk], j["lvl"].values[mk], j["tr"].values[mk]] +
                                [(j["g"].values[mk] == g).astype(float) for g in ("rebounds", "assists", "threes", "combo")])
            fo = j["fold"].values[mk]; out = np.full(mk.sum(), np.nan)
            for f in range(5):
                tr = fo != f; b, *_ = np.linalg.lstsq(X[tr], y[mk][tr], rcond=None); out[~tr] = X[~tr] @ b
            pred[mk] = out
            b, *_ = np.linalg.lstsq(X, y[mk], rcond=None)
            print(f"PV|STACKED_COEF {real} {kd} (const, log stored, log stored^2, distance, level, tier, rebounds, assists, threes, combo): " + ",".join(f"{v:.4f}" for v in b))
        ok = np.isfinite(pred)
        summ(f"STACKED held out, {real}: all", np.exp(pred[ok] - y[ok]))
        for kd in ("goblin", "demon"):
            mk = ok & (j["kind"] == kd).values; summ(f"STACKED held out, {real}: {kd}", np.exp(pred[mk] - y[mk]))
            for lo, hi in ((0, .7), (.7, .85), (.85, 1.0), (1.0, 1.3), (1.3, 2.0), (2.0, 3.5), (3.5, 99)):
                m2 = mk & (j[real].values >= lo) & (j[real].values < hi); summ(f"STACKED held out, {real}: {kd} real price {lo}-{hi}", np.exp(pred[m2] - y[m2]))
            for t in sorted(j["tr"][mk].unique()):
                m2 = mk & (j["tr"].values == t); summ(f"STACKED held out, {real}: {kd} tier {int(t)}", np.exp(pred[m2] - y[m2]))
    print("PV|DONE", flush=True)


if __name__ == "__main__":
    main()
