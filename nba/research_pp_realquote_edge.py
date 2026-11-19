#!/usr/bin/env python3
"""
S5b - IS THE PRIZEPICKS GOBLIN "EDGE" REAL OR A PRICE-MODEL ARTIFACT? READ-ONLY. (NBA_HONEST_REBUILD.md section 8c)
Run s5_pp found price-only picks returning +27% a leg on history. History prices are MODELLED (STACKED fit, mean abs error 4.7% / 8.5%); picking the best
"price x hit chance" legs out of thousands selects the legs whose modelled price is too high. The only referee is the set of rungs with a REAL quote
(nba_market.pp_mined_leg, 2026-09-21 on). This script grades those rungs on the box score and reports:
  A  plain return at the REAL price by kind / side / price band / prop family (no model at all)
  B  the modelled (STACKED) price against the real one, split by how attractive the history model finds the leg  -> the artifact, measured
  C  a hit-chance model fitted on HISTORY legs (nba_score._lr_legs_h, modelled prices) applied to the real-quote rungs:
     return of its picks valued at the modelled price (what the backtest believes) and at the real price (what the app pays)
  D  the same model fitted on the real-quote rungs themselves, whole days held out (5 folds), with and without the honest model probability
Leg return = hit x real price / 0.542 - 1 (0.542 = per-leg break-even of the 5 / 6-pick Flex; RQ_BASE). 90% ranges from re-drawing days.
Env: DATABASE_URL, RQ_BASE.
"""
import os

import numpy as np
import pandas as pd
import psycopg

import research_legs_h_build as LH

BASE = float(os.environ.get("RQ_BASE") or 0.542)
LOW = {"steals", "blocks", "turnovers", "threes_made", "stocks"}
rng = np.random.default_rng(7)


def lg(p):
    p = np.clip(p, 1e-4, 1 - 1e-4); return np.log(p / (1 - p))


def feats(m0, kind, over, prop, ph, use_model):
    q = lg(np.clip(BASE / np.maximum(m0, 1e-6), .02, .98)); g = (kind == "goblin") * 1.0; d = (kind == "demon") * 1.0
    cols = [np.ones(len(q)), q, g, d, q * g, q * d, over * 1.0, np.isin(prop, list(LOW)) * 1.0, np.isin(prop, list(LH.COMBO - {"stocks"})) * 1.0]
    if use_model:
        mis = ~np.isfinite(ph); cols += [np.where(mis, q, lg(np.where(mis, .5, ph))), mis * 1.0]
    return np.column_stack(cols)


def fit(X, y, ridge=1e-3):
    b = np.zeros(X.shape[1])
    for _ in range(40):
        p = 1 / (1 + np.exp(-X @ b)); w = p * (1 - p) + 1e-9
        H = X.T @ (X * w[:, None]) + ridge * np.eye(X.shape[1]); st = np.linalg.solve(H, X.T @ (y - p) - ridge * b); b = b + st
        if np.abs(st).max() < 1e-7:
            break
    return b


def rep(label, df, pcol, price_cols):
    """picks = top 5 a day by predicted return, and all legs predicted positive; value at each price column"""
    out = []
    for nm, pick in (("top 5 a day", lambda g: g.nlargest(5, "pred")), ("rated positive", lambda g: g[g["pred"] > 0])):
        sel = pd.concat([pick(g) for _, g in df.groupby("gd")]) if len(df) else df
        if not len(sel):
            out.append(f"{nm}: none"); continue
        days = sel["gd"].unique(); parts = [f"{nm}: {len(sel):,} legs ({len(sel) / df['gd'].nunique():.1f} a day), predicted {100 * sel['pred'].mean():+.1f}%"]
        for pc in price_cols:
            r = sel["hit"].values * sel[pc].values / BASE - 1; by = {d_: r[(sel["gd"] == d_).values] for d_ in days}
            bs = [np.concatenate([by[d_] for d_ in rng.choice(days, len(days))]).mean() for _ in range(400)]
            parts.append(f"real at {pc} {100 * r.mean():+.1f}% [{100 * np.quantile(bs, .05):+.1f}% .. {100 * np.quantile(bs, .95):+.1f}%]")
        out.append(" | ".join(parts))
    for o in out:
        print(f"RQ|{label:34s} {o}", flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    q = pd.read_sql("""SELECT left(b.start_time, 10) gd, nba_ref.norm_name(m.player) nm, m.base_market, m.line::float8 line, m.side, m.std_line::float8 std_line,
                              m.two_pick_power::float8 p2, m.quoted_at
                       FROM nba_market.pp_mined_leg m JOIN nba_market.pp_board_row b ON b.run_file = m.run_file AND b.projection_id = m.projection_id
                       WHERE m.two_pick_power > 0 AND m.base_market = ANY(%s)""", conn, params=(list(LH.MK),))
    q = q.sort_values("quoted_at").drop_duplicates(["gd", "nm", "base_market", "line", "side"], keep="last")
    p = pd.read_sql("""SELECT game_date::text gd, nm, base_market, line::float8 line, side, kind, tier, anchor_line::float8 anchor_line, factor::float8 f_model
                       FROM nba_market.pp_leg_price WHERE game_date >= '2026-09-15' AND snapshot_label = 'window'""", conn)
    p = p.drop_duplicates(["gd", "nm", "base_market", "line", "side"])
    j = q.merge(p, on=["gd", "nm", "base_market", "line", "side"], how="inner"); j = j[j["kind"].isin(["goblin", "demon"]) & j["f_model"].notna()].copy()
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    box = {}
    for pid, d, pts, reb, ast, fg3m, stl, blk, tov in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov
            FROM nba_stats.player_game_log WHERE game_date >= '2026-09-15' AND min > 0""").fetchall():
        box[(pid, str(d))] = tuple(float(v or 0) for v in (pts, reb, ast, fg3m, stl, blk, tov))
    j["prop"] = j["base_market"].map(LH.MK); j["player_id"] = j["nm"].map(ids); j["over"] = j["side"].str.lower().str.startswith("o")
    hit = np.full(len(j), np.nan)
    for i, (pid, gd, pr, ln, ov) in enumerate(zip(j["player_id"], j["gd"], j["prop"], j["line"], j["over"])):
        st = box.get((pid, gd))
        if st is None:
            continue
        v = LH.STAT[pr](st)
        if v != ln:
            hit[i] = float((v > ln) if ov else (v < ln))
    j["hit"] = hit; n0 = len(j); j = j[np.isfinite(hit)].copy()
    j["real"] = (j["p2"] / 2.99) ** (1 / 0.904)
    lfm = np.log(np.clip(j["f_model"].values, .05, 50)); sl = np.maximum(1.0, j["std_line"].fillna(j["anchor_line"]).fillna(j["line"]).values)
    rel = (j["line"].values - j["std_line"].fillna(j["anchor_line"]).fillna(j["line"]).values) / sl; lvl = np.log(sl); tr = j["tier"].fillna(0).astype(float).values
    m = np.ones(len(j))
    for kd, b in LH.COEF.items():
        k = (j["kind"] == kd).values
        x = b[0] + b[1] * lfm[k] + b[2] * lfm[k] ** 2 + b[3] * rel[k] + b[4] * lvl[k] + b[5] * tr[k]; pr = j["prop"].values[k]
        for p_, c in LH.GRPC.items():
            x = x + b[c] * (pr == p_)
        m[k] = np.exp(x + b[9] * np.isin(pr, list(LH.COMBO)))
    un = ~j["over"].values; m[un] = (np.exp(lfm[un]) / 0.95 * 3.0 / 2.99) ** (1 / 0.904)
    j["modelled"] = m
    H = LH.ladders(conn, "2026-27")
    j["ph"] = LH.attach(j["gd"].values, j["player_id"].values, j["prop"].values, j["line"].values, j["over"].values, H); del H
    print(f"RQ|real-quoted alternates {n0:,}; graded {len(j):,} on {j['gd'].nunique()} days ({j['gd'].min()} .. {j['gd'].max()}); with honest probability {100 * j['ph'].notna().mean():.0f}%; "
          f"by kind/side {j.groupby(['kind', 'side']).size().to_dict()}", flush=True)

    print("\nRQ|=== A  plain return at the REAL price (no model) ===")
    j["fam"] = np.where(j["prop"].isin(LOW), "low-count", np.where(j["prop"].isin(LH.COMBO), "combo", "main stat"))
    j["band"] = pd.cut(j["real"], [0, .6, .7, .8, .9, 1.0, 1.3, 2.0, 3.5, 99], labels=["<0.6", "0.6-0.7", "0.7-0.8", "0.8-0.9", "0.9-1.0", "1.0-1.3", "1.3-2.0", "2.0-3.5", "3.5+"])
    j["r_real"] = j["hit"] * j["real"] / BASE - 1; j["r_mod"] = j["hit"] * j["modelled"] / BASE - 1
    for keys in (["kind", "side"], ["kind", "band"], ["kind", "fam"], ["kind", "prop"], ["kind", "tier"]):
        for kv, g in j.groupby(keys, observed=True):
            if len(g) < 60:
                continue
            se = g["r_real"].std() / np.sqrt(len(g))
            print(f"RQ|  {' / '.join(keys):12s} {str(kv):32s} legs {len(g):6,} hit {g['hit'].mean():.3f} real price {g['real'].median():.3f} | return at real {100 * g['r_real'].mean():+6.1f}% (+- {100 * se:.1f}) | "
                  f"at modelled {100 * g['r_mod'].mean():+6.1f}% | modelled / real {np.median(g['modelled'] / g['real']):.3f}", flush=True)

    print("\nRQ|=== E  the SPORTSBOOK chance at the rung's own line against the REAL price (nba_market.market_consensus, window) ===")
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key base_market, line::float8 line, books, p_over_mean::float8 po
                        FROM nba_market.market_consensus WHERE snapshot_label = 'window' AND game_date >= '2026-09-15'""", conn).drop_duplicates(["gd", "nm", "base_market", "line"])
    j = j.merge(mc, on=["gd", "nm", "base_market", "line"], how="left"); j["pb"] = np.where(j["over"], j["po"], 1 - j["po"])
    e = j[j["pb"].notna()].copy(); e["br"] = e["pb"] * e["real"] / BASE - 1; e["brm"] = e["pb"] * e["modelled"] / BASE - 1
    print(f"RQ|  rungs with a sportsbook number {len(e):,} of {len(j):,} ({e.groupby('kind').size().to_dict()}); with >= 2 books {int((e['books'] >= 2).sum()):,}", flush=True)
    for kd in ("goblin", "demon"):
        g = e[e["kind"] == kd]
        for lo, hi in ((0, .3), (.3, .4), (.4, .5), (.5, .55), (.55, .6), (.6, .65), (.65, .7), (.7, 1.01)):
            x = g[(g["pb"] >= lo) & (g["pb"] < hi)]
            if len(x) >= 40:
                print(f"RQ|  calibration {kd} book {lo:.2f}-{hi:.2f}: legs {len(x):5,} book {x['pb'].mean():.3f} hit {x['hit'].mean():.3f} | real price {x['real'].median():.3f} needs {BASE / x['real'].median():.3f}", flush=True)
    for col, nm_ in (("br", "REAL price"), ("brm", "modelled price")):
        for th in (0.0, .03, .06, .10):
            for kd in ("goblin", "demon"):
                for mb in (1, 2):
                    x = e[(e[col] > th) & (e["kind"] == kd) & (e["books"] >= mb)]
                    if len(x) >= 15:
                        r = x["r_real"].values; dd = x["gd"].values; u = np.unique(dd)
                        bs = [np.concatenate([r[dd == d_] for d_ in rng.choice(u, len(u))]).mean() for _ in range(400)]
                        print(f"RQ|  book-implied return at the {nm_} > {100 * th:+.0f}%, {kd}, >= {mb} book(s): legs {len(x):5,} ({len(x) / j['gd'].nunique():.1f} a day) book {x['pb'].mean():.3f} hit {x['hit'].mean():.3f} "
                              f"| return at the real price {100 * r.mean():+.1f}% [{100 * np.quantile(bs, .05):+.1f}% .. {100 * np.quantile(bs, .95):+.1f}%] | modelled / real {np.median(x['modelled'] / x['real']):.3f}", flush=True)

    print("\nRQ|=== C  model fitted on HISTORY legs (modelled prices, before 2026-09-15 for a clean split), applied to the real-quote rungs ===")
    h = pd.read_sql("""SELECT game_date::text gd, prop, side, kind, m, hit, ph FROM nba_score._lr_legs_h WHERE app = 'prizepicks' AND game_date < '2026-09-15'""", conn)
    conn.close()
    ho = h["side"].str.lower().str.startswith("o").values
    for um in (False, True):
        b = fit(feats(h["m"].values, h["kind"].values, ho, h["prop"].values, h["ph"].values.astype(float), um), h["hit"].values.astype(float))
        tag = "price + honest model" if um else "price only"
        print(f"RQ|history fit ({tag}) on {len(h):,} legs: " + ", ".join(f"{v:+.3f}" for v in b), flush=True)
        for pc_in in ("modelled", "real"):
            ph_ = 1 / (1 + np.exp(-feats(j[pc_in].values, j["kind"].values, j["over"].values, j["prop"].values, j["ph"].values.astype(float), um) @ b))
            j["pred"] = ph_ * j[pc_in].values / BASE - 1
            rep(f"C {tag}, sees {pc_in} price", j, "pred", ["modelled", "real"])
            if pc_in == "modelled":
                pos = j[j["pred"] > 0]
                if len(pos):
                    print(f"RQ|  B legs it rates positive on the modelled price: modelled / real price median {np.median(pos['modelled'] / pos['real']):.3f} "
                          f"(all legs {np.median(j['modelled'] / j['real']):.3f}); top tenth by predicted return: "
                          f"{np.median(j.nlargest(max(1, len(j) // 10), 'pred').eval('modelled / real')):.3f}", flush=True)
    print("\nRQ|=== D  model fitted on the real-quote rungs themselves (real price), whole days held out ===")
    days = np.array(sorted(j["gd"].unique())); fold = {d_: i % 5 for i, d_ in enumerate(days)}; fo = j["gd"].map(fold).values
    for um in (False, True):
        X = feats(j["real"].values, j["kind"].values, j["over"].values, j["prop"].values, j["ph"].values.astype(float), um); y = j["hit"].values; pr = np.full(len(j), np.nan)
        for f in range(5):
            trn = fo != f; b = fit(X[trn], y[trn], ridge=1.0); pr[~trn] = 1 / (1 + np.exp(-X[~trn] @ b))
        j["pred"] = pr * j["real"].values / BASE - 1
        rep(f"D {'price + honest model' if um else 'price only'}", j, "pred", ["real"])
        b = fit(X, y, ridge=1.0); print("RQ|  all-days coefficients: " + ", ".join(f"{v:+.3f}" for v in b), flush=True)
    print("RQ|DONE", flush=True)


if __name__ == "__main__":
    main()
