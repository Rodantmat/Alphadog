#!/usr/bin/env python3
"""
S6c - HONEST CELL SCAN: where do REGULAR legs beat their break-even in ALL THREE seasons? READ-ONLY. (NBA_HONEST_REBUILD.md section 8h)
After S5 (no general edge) and the Underdog regular-Under lead (8g), this scans every pre-game describable cell of regular legs with honest inputs only.
Apps: Underdog regular (1.0x) legs, real board, break-even 0.5345 (2-pick Power) ; PrizePicks regular lines, break-even 0.542 (5 / 6-pick Flex).
Features (all known before the game):
  board     prop, side, line size, month phase, weekday
  honest model (baseline_history_h)   probability of the side (ph) in tenths WITHIN the slate, model lean = (anchor - line) / max(1, line), role tier,
            variance band, projected minutes
  market    sportsbook chance of the side at the exact line (when a book has it), number of books; the OTHER app's line for the same player / prop
  form      (player game log, strictly earlier games of the season) season average and last-5 average of the stat against the line, games played,
            minutes last 5 against season, days of rest, home / away
A cell = one feature bucket x side (single), and pairs of the strongest single features x side (double). A cell is KEPT only if in EACH of the three
seasons it has >= CS_MIN legs and its hit rate is above break-even, and the pooled lower 90% bound (re-drawing slates) is above break-even.
Kept cells are printed with per-season legs / hit, pooled return and legs a slate; then the count of cells scanned, so the reader can judge how many
would pass by luck (the script also runs the SAME scan on a shuffled-result copy and prints how many cells that keeps = the false-positive yardstick).
Env: DATABASE_URL, CS_APP (underdog | prizepicks), CS_MIN (150 legs per season; this season CS_MIN3 = 60).
"""
import os
from itertools import combinations

import numpy as np
import pandas as pd
import psycopg

APP = (os.environ.get("CS_APP") or "underdog").lower()
MINL = int(os.environ.get("CS_MIN") or 150); MIN3 = int(os.environ.get("CS_MIN3") or 60)
ALT = (os.environ.get("CS_KIND") or "regular").lower() == "alt"
BE = 0.5345 if APP == "underdog" else 0.542
STATCOL = {"points": ["pts"], "rebounds": ["reb"], "assists": ["ast"], "threes_made": ["fg3m"], "steals": ["stl"], "blocks": ["blk"], "turnovers": ["tov"],
           "stocks": ["stl", "blk"], "pts_reb": ["pts", "reb"], "pts_ast": ["pts", "ast"], "reb_ast": ["reb", "ast"], "pra": ["pts", "reb", "ast"]}
MKI = {"points": "player_points", "rebounds": "player_rebounds", "assists": "player_assists", "threes_made": "player_threes", "steals": "player_steals",
       "blocks": "player_blocks", "turnovers": "player_turnovers", "stocks": "player_blocks_steals", "pts_reb": "player_points_rebounds",
       "pts_ast": "player_points_assists", "reb_ast": "player_rebounds_assists", "pra": "player_points_rebounds_assists"}
rng = np.random.default_rng(29)
SEAS = ["2024-25", "2025-26", "2026-27"]


def bucket(x, edges, labels):
    return pd.cut(x, edges, labels=labels).astype(object)


def load(conn):
    kind = "R" if APP == "underdog" else "standard"
    if ALT:                                                  # Underdog alternates (tiers F / B) at their REAL multipliers
        df = pd.read_sql("""SELECT season, game_date::text gd, player_id, prop, side, line::float8 line, hit::int hit, ph::float8 ph, m::float8 m, tier FROM nba_score._lr_legs_h
                            WHERE app = 'underdog' AND kind IN ('F', 'B') AND hit IS NOT NULL AND m > 0""", conn)
    else:
        df = pd.read_sql("""SELECT season, game_date::text gd, player_id, prop, side, line::float8 line, hit::int hit, ph::float8 ph, 0::float8 m, tier FROM nba_score._lr_legs_h
                            WHERE app = %s AND kind = %s AND hit IS NOT NULL""" + (" AND m BETWEEN 1.86 AND 1.88" if APP == "underdog" else " AND tier NOT LIKE '%%-u'"),
                         conn, params=(APP, kind))
        df["m"] = 1 / BE
    df["val"] = df["hit"] * df["m"]
    df = df[df["prop"].isin(STATCOL)].copy(); df["under"] = ~df["side"].str.lower().str[0].isin(["o", "m", "h"]); df["sd"] = np.where(df["under"], "Under", "Over")
    # honest model context
    hb = pd.read_sql("SELECT game_date::text gd, player_id, prop, anchor::float8 anchor, role_tier, var_band, proj_min::float8 proj_min FROM nba_score.baseline_history_h", conn)
    df = df.merge(hb.drop_duplicates(["gd", "player_id", "prop"]), on=["gd", "player_id", "prop"], how="left")
    # sportsbook at the exact line
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, books, p_over_mean::float8 po
                        FROM nba_market.market_consensus WHERE snapshot_label = 'window'""", conn)
    inv = {v: k for k, v in MKI.items()}; mc["prop"] = mc["market_key"].map(inv); mc["player_id"] = mc["nm"].map(ids)
    mc = mc[mc["prop"].notna() & mc["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop", "line"])[["gd", "player_id", "prop", "line", "books", "po"]]
    df = df.merge(mc, on=["gd", "player_id", "prop", "line"], how="left"); df["pb"] = np.where(df["under"], 1 - df["po"], df["po"])
    # the other app's regular line
    other = "prizepicks" if APP == "underdog" else "underdog"
    ol = pd.read_sql("SELECT DISTINCT game_date::text gd, player_id, prop, line::float8 oline FROM nba_score._lr_legs_h WHERE app = %s AND kind = %s",
                     conn, params=(other, "standard" if other == "prizepicks" else "R")).drop_duplicates(["gd", "player_id", "prop"])
    df = df.merge(ol, on=["gd", "player_id", "prop"], how="left")
    # line movement between the morning board and the pick-time (window) board - PrizePicks regular lines only (nba_market.pp_leg_price keeps both)
    df["mline"] = np.nan; df["had_morning"] = False
    if APP == "prizepicks" and not ALT:
        try:
            mo = pd.read_sql("""SELECT DISTINCT game_date::text gd, nm, base_market, line::float8 mline FROM nba_market.pp_leg_price
                                WHERE snapshot_label = 'morning' AND kind = 'standard' AND side = 'Over'""", conn)
            mo["player_id"] = mo["nm"].map(ids); mo["prop"] = mo["base_market"].map(inv)
            mo = mo[mo["player_id"].notna() & mo["prop"].notna()].drop_duplicates(["gd", "player_id", "prop"])[["gd", "player_id", "prop", "mline"]]
            df = df.drop(columns=["mline"]).merge(mo, on=["gd", "player_id", "prop"], how="left")
            df["had_morning"] = df["gd"].isin(set(mo["gd"]))
            print(f"CS|morning boards on {mo['gd'].nunique()} dates; regular legs with a morning line {100 * df['mline'].notna().mean():.0f}%", flush=True)
        except Exception as ex:
            conn.rollback(); print(f"CS|morning lines not available: {str(ex)[:160]}", flush=True)
    # form from the game log (strictly earlier games of the same season)
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, season, matchup, team_id::text team_id, game_id::text game_id, min::float8 mn, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m,
                               stl::float8 stl, blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'""", conn)
    gl = gl.sort_values(["player_id", "gd"]).drop_duplicates(["player_id", "gd"]); gl["played"] = (gl["mn"] > 0).astype(int)
    g = gl.groupby(["player_id", "season"], sort=False)
    gl["gp"] = g["played"].cumsum() - gl["played"]
    gl["prev_gd"] = g["gd"].shift(1); gl["rest"] = (pd.to_datetime(gl["gd"]) - pd.to_datetime(gl["prev_gd"])).dt.days
    gl["mn_s"] = g["mn"].transform(lambda x: x.shift(1).expanding().mean()); gl["mn_5"] = g["mn"].transform(lambda x: x.shift(1).rolling(5, min_periods=3).mean())
    for c in ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov"):
        gl[c + "_s"] = g[c].transform(lambda x: x.shift(1).expanding().mean()); gl[c + "_5"] = g[c].transform(lambda x: x.shift(1).rolling(5, min_periods=3).mean())
    gl["home"] = ~gl["matchup"].fillna("").str.contains("@")
    INJ = injury_context(conn, gl)
    df = df.merge(gl[["player_id", "gd", "gp", "rest", "mn_s", "mn_5", "home", "team_id", "game_id"] + [c + s for c in ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov") for s in ("_s", "_5")]],
                  on=["player_id", "gd"], how="left")
    avs = np.full(len(df), np.nan); av5 = np.full(len(df), np.nan)
    for pr, cols in STATCOL.items():
        k = (df["prop"] == pr).values
        avs[k] = sum(df.loc[k, c + "_s"].values for c in cols); av5[k] = sum(df.loc[k, c + "_5"].values for c in cols)
    den = np.maximum(1.0, df["line"].values)
    sgn = np.where(df["under"], 1.0, -1.0)                   # every "lean" is signed so that POSITIVE = favours the leg's own side
    F = pd.DataFrame(index=df.index)
    F["prop"] = df["prop"]
    if ALT:
        F["tier"] = df["tier"].astype(str).str[:2]
        F["multiplier"] = bucket(df["m"] / 1.8708, [0, .5, .65, .8, .92, 1.08, 1.3, 1.7, 2.5, 99], ["<.5x", ".5-.65x", ".65-.8x", ".8-.92x", ".92-1.08x", "1.08-1.3x", "1.3-1.7x", "1.7-2.5x", "2.5x+"])
        F["book return"] = bucket(df["pb"] * df["m"] - 1, [-9, -.15, -.08, -.03, 0, .03, .08, 9], ["< -15%", "-15..-8%", "-8..-3%", "-3..0%", "0..+3%", "+3..+8%", "> +8%"])
        F["model return"] = bucket(df["ph"] * df["m"] - 1, [-9, -.3, -.1, 0, .1, .3, 9], ["< -30%", "-30..-10%", "-10..0%", "0..+10%", "+10..+30%", "> +30%"])
    F["line size"] = bucket(df["line"], [0, 1, 2.6, 5.6, 9.6, 14.6, 19.6, 26, 99], ["0.5", "1.5-2.5", "3-5.5", "6-9.5", "10-14.5", "15-19.5", "20-25.5", "26+"])
    F["phase"] = df["gd"].str[5:7].map(lambda m: "Oct-Nov" if m in ("10", "11") else "Dec-Jan" if m in ("12", "01") else "Feb+")
    F["weekday"] = pd.to_datetime(df["gd"]).dt.day_name().str[:3]
    r = df.groupby(["gd", "sd"])["ph"].rank(pct=True)
    F["model rank in slate"] = bucket(r, [0, .2, .4, .6, .8, .9, .95, 1.0001], ["0-20%", "20-40%", "40-60%", "60-80%", "80-90%", "90-95%", "top 5%"])
    F["model chance"] = bucket(df["ph"], [0, .35, .45, .5, .55, .6, .65, .7, .8, 1.01], ["<.35", ".35-.45", ".45-.50", ".50-.55", ".55-.60", ".60-.65", ".65-.70", ".70-.80", ".80+"])
    F["model lean"] = bucket(sgn * (df["line"] - df["anchor"]) / den, [-9, -.3, -.15, -.05, .05, .15, .3, 9], ["against 30%+", "against 15-30%", "against 5-15%", "level", "for 5-15%", "for 15-30%", "for 30%+"])
    F["role"] = df["role_tier"]; F["variance band"] = df["var_band"]
    F["projected minutes"] = bucket(df["proj_min"], [0, 18, 24, 28, 32, 35, 99], ["<18", "18-24", "24-28", "28-32", "32-35", "35+"])
    F["book chance"] = bucket(df["pb"], [0, .45, .48, .5, .52, .54, .56, .6, 1.01], ["<.45", ".45-.48", ".48-.50", ".50-.52", ".52-.54", ".54-.56", ".56-.60", ".60+"])
    F["books"] = np.where(df["books"].isna(), "none", np.where(df["books"] >= 2, "2+", "1"))
    F["other app line"] = bucket(sgn * (df["line"] - df["oline"]), [-99, -.99, -.01, .01, .99, 99], ["worse by 1+", "worse by .5", "same", "better by .5", "better by 1+"])
    F["season avg vs line"] = bucket(sgn * (df["line"] - avs) / den, [-9, -.3, -.15, -.05, .05, .15, .3, 9], ["against 30%+", "against 15-30%", "against 5-15%", "level", "for 5-15%", "for 15-30%", "for 30%+"])
    F["last 5 vs line"] = bucket(sgn * (df["line"] - av5) / den, [-9, -.3, -.15, -.05, .05, .15, .3, 9], ["against 30%+", "against 15-30%", "against 5-15%", "level", "for 5-15%", "for 15-30%", "for 30%+"])
    F["last 5 vs season"] = bucket((av5 - avs) / np.maximum(1.0, avs), [-9, -.25, -.1, .1, .25, 9], ["cold 25%+", "cold 10-25%", "level", "hot 10-25%", "hot 25%+"])
    F["games played"] = bucket(df["gp"], [-1, 2, 5, 10, 20, 40, 200], ["0-2", "3-5", "6-10", "11-20", "21-40", "41+"])
    F["minutes trend"] = bucket(df["mn_5"] - df["mn_s"], [-99, -4, -1.5, 1.5, 4, 99], ["down 4+", "down 1.5-4", "level", "up 1.5-4", "up 4+"])
    F["rest days"] = bucket(df["rest"], [0, 1, 2, 3, 6, 400], ["back-to-back", "1 day", "2 days", "3-5 days", "6+"])
    F["home"] = np.where(df["home"].isna(), None, np.where(df["home"].fillna(False), "home", "away"))
    if df["mline"].notna().any():                            # signed: "for" = the line moved in the direction that helps the leg's side
        mv = np.where(df["under"], 1.0, -1.0) * (df["line"] - df["mline"])
        lab = bucket(pd.Series(mv), [-99, -.99, -.01, .01, .99, 99], ["against by 1+", "against by .5", "no move", "for by .5", "for by 1+"]).values
        F["line move since morning"] = np.where(df["mline"].isna().values, np.where(df["had_morning"].values, "new at pick time", None), lab)
    if INJ is not None:
        own, team = INJ
        df = df.merge(own, on=["gd", "player_id"], how="left").merge(team, on=["gd", "team_id"], how="left")
        opp = team.rename(columns={"team_id": "opp_id", "min_out": "opp_out", "min_fresh": "opp_fresh", "min_q": "opp_q"})
        gt = gl[["gd", "game_id", "team_id"]].drop_duplicates(); gt = gt.merge(gt, on=["gd", "game_id"], suffixes=("", "_o")); gt = gt[gt["team_id"] != gt["team_id_o"]]
        gt = gt.rename(columns={"team_id_o": "opp_id"}).drop_duplicates(["gd", "game_id", "team_id"])
        df = df.merge(gt, on=["gd", "game_id", "team_id"], how="left").merge(opp, on=["gd", "opp_id"], how="left")
        has = df["team_id"].notna().values
        for c in ("min_out", "min_fresh", "min_q", "opp_out", "opp_fresh"):
            df[c] = np.where(has, df[c].fillna(0.0), np.nan)
        F = F.reindex(df.index)
        F["own status at pick"] = np.where(has, df["own_status"].fillna("not listed"), None)
        F["team minutes out"] = bucket(df["min_out"], [-1, .5, 24, 48, 80, 999], ["0", "1-24", "24-48", "48-80", "80+"])
        F["team FRESH minutes out"] = bucket(df["min_fresh"], [-1, .5, 20, 40, 999], ["0", "1-20", "20-40", "40+"])
        F["team questionable minutes"] = bucket(df["min_q"], [-1, .5, 30, 999], ["0", "1-30", "30+"])
        F["opponent minutes out"] = bucket(df["opp_out"], [-1, .5, 48, 999], ["0", "1-48", "48+"])
        F["opponent FRESH minutes out"] = bucket(df["opp_fresh"], [-1, .5, 20, 999], ["0", "1-20", "20+"])
    return df, F


def injury_context(conn, gl):
    """What the injury report said at pick time (latest snapshot at or before 20:20 UTC of the game date = 12:20 PST / 13:20 PDT, i.e. not later than P3).
    own: the player's own listing. team: minutes of teammates listed Out / Doubtful (their season average so far), the FRESH part of it (the absent
    player played the team's previous game - the absence is new, lines may lag), and minutes listed Questionable."""
    try:
        inj = pd.read_sql("""SELECT DISTINCT ON (game_date, team, player_name) game_date::text gd, team,
                                    nba_ref.norm_name(split_part(player_name, ', ', 2) || ' ' || split_part(player_name, ', ', 1)) nm, status
                             FROM nba_daily.injury_report_snapshots
                             WHERE game_date >= '2024-10-01' AND snapshot_ts <= (game_date::timestamp + interval '20 hours 20 minutes')
                             ORDER BY game_date, team, player_name, snapshot_ts DESC""", conn)
        ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
        tm = pd.read_sql("SELECT team_id::text a, nba_team_id::text b, full_name FROM nba_ref.teams", conn)
    except Exception as ex:
        conn.rollback(); print(f"CS|injury context not available: {str(ex)[:160]}", flush=True); return None
    known = set(gl["team_id"].dropna().unique()); tmap = {}
    for a_, b_, fn in zip(tm["a"], tm["b"], tm["full_name"]):
        tmap[fn] = a_ if a_ in known else b_ if b_ in known else None
    inj["player_id"] = inj["nm"].map(ids); inj["team_id"] = inj["team"].map(tmap); inj = inj[inj["player_id"].notna() & inj["team_id"].notna()].copy()
    pl = gl[gl["mn"] > 0].sort_values(["player_id", "gd"]).copy()
    g = pl.groupby(["player_id", "season"], sort=False)
    pl["avg_to"] = g["mn"].transform(lambda x: x.expanding().mean()); pl["n_to"] = g.cumcount() + 1; pl["last_gd"] = pl["gd"]
    pl["t"] = pd.to_datetime(pl["gd"]); inj["t"] = pd.to_datetime(inj["gd"])
    inj = pd.merge_asof(inj.sort_values("t"), pl.sort_values("t")[["t", "player_id", "avg_to", "n_to", "last_gd", "season"]], on="t", by="player_id", allow_exact_matches=False)
    inj = inj[(pd.to_datetime(inj["gd"]) - pd.to_datetime(inj["last_gd"])).dt.days < 120]           # same season only
    tg = gl[["team_id", "gd"]].drop_duplicates().sort_values(["team_id", "gd"]); tg["prev_team_gd"] = tg.groupby("team_id")["gd"].shift(1)
    inj = inj.merge(tg, on=["team_id", "gd"], how="left")
    w = np.where((inj["n_to"] >= 3) & (inj["avg_to"] >= 10), inj["avg_to"], 0.0)
    out = inj["status"].isin(["Out", "Doubtful"]).values; fresh = out & (inj["last_gd"] == inj["prev_team_gd"]).values; qq = (inj["status"] == "Questionable").values
    inj["min_out"] = w * out; inj["min_fresh"] = w * fresh; inj["min_q"] = w * qq
    team = inj.groupby(["gd", "team_id"], as_index=False)[["min_out", "min_fresh", "min_q"]].sum()
    own = inj[inj["status"].isin(["Questionable", "Probable", "Available", "Doubtful"])][["gd", "player_id", "status"]].rename(columns={"status": "own_status"}).drop_duplicates(["gd", "player_id"])
    print(f"CS|injury context: {len(inj):,} listings at pick time on {inj['gd'].nunique()} dates; team-days with minutes out {int((team['min_out'] > 0).sum()):,}, with FRESH minutes out {int((team['min_fresh'] > 0).sum()):,}", flush=True)
    return own, team


def scan(df, F, hitcol, label, verbose=True):
    """returns kept cells; prints when verbose. Counts by np.bincount over coded features; slates are re-drawn only for cells that pass every season."""
    kept = []; scanned = 0
    seas = df["season"].values; hit = df[hitcol].values.astype(float); BE1 = 1.0; sd = df["sd"].values; gd = df["gd"].values
    nsl = {s: df.loc[df["season"] == s, "gd"].nunique() for s in SEAS}
    sidx = np.array([SEAS.index(x) if x in SEAS else -1 for x in seas]); need = np.array([MINL, MINL, MIN3])
    cols = list(F.columns); codes = {}; labels = {}
    for c in cols:
        cat = pd.Categorical(F[c].astype(object).where(F[c].notna(), None)); codes[c] = cat.codes.astype(np.int64); labels[c] = [str(x) for x in cat.categories]

    def finish(mask, name, st):
        hh = hit[mask]; dd = gd[mask]; u, inv = np.unique(dd, return_inverse=True)
        sums = np.bincount(inv, weights=hh, minlength=len(u)); cnts = np.bincount(inv, minlength=len(u))
        ix = rng.integers(len(u), size=(200, len(u))); bs = sums[ix].sum(1) / cnts[ix].sum(1); lo = float(np.quantile(bs, .05))
        if lo > BE1:
            kept.append((hh.mean(), lo, name, st, int(mask.sum()), sum(n / nsl[s_] for (n, _), s_ in zip(st, SEAS)) / 3))

    for side in ("Under", "Over"):
        sm = (sd == side) & (sidx >= 0)
        def table(code, K):
            ok = sm & (code >= 0); key = sidx[ok] * K + code[ok]
            n = np.bincount(key, minlength=3 * K).reshape(3, K); h = np.bincount(key, weights=hit[ok], minlength=3 * K).reshape(3, K)
            return n, h
        ones = np.zeros(len(df), dtype=np.int64); n, h = table(ones, 1); scanned += 1
        if (n[:, 0] >= need).all() and (h[:, 0] / np.maximum(1, n[:, 0]) > BE1).all():
            finish(sm, f"{side} | all", [(int(n[q, 0]), h[q, 0] / n[q, 0]) for q in range(3)])
        for c in cols:
            K = len(labels[c]); n, h = table(codes[c], K); scanned += K
            good = (n >= need[:, None]).all(0) & (h / np.maximum(1, n) > BE1).all(0)
            for v in np.where(good)[0]:
                finish(sm & (codes[c] == v), f"{side} | {c} = {labels[c][v]}", [(int(n[q, v]), h[q, v] / n[q, v]) for q in range(3)])
        for c1, c2 in combinations(cols, 2):
            K1, K2 = len(labels[c1]), len(labels[c2]); both = np.where((codes[c1] >= 0) & (codes[c2] >= 0), codes[c1] * K2 + codes[c2], -1)
            n, h = table(both, K1 * K2); scanned += K1 * K2
            good = (n >= need[:, None]).all(0) & (h / np.maximum(1, n) > BE1).all(0)
            for v in np.where(good)[0]:
                finish(sm & (both == v), f"{side} | {c1} = {labels[c1][v // K2]} & {c2} = {labels[c2][v % K2]}", [(int(n[q, v]), h[q, v] / n[q, v]) for q in range(3)])
    if verbose:
        print(f"CS|{label}: cells scanned {scanned:,}; KEPT {len(kept)} (each season returns above zero with enough legs, pooled lower 90% bound above zero)", flush=True)
        for h_, lo, name, st, n_, per in sorted(kept, key=lambda x: -x[1])[:90]:
            print(f"CS|  {name:92s} legs {n_:6,} ({per:5.1f} a slate) return {100 * (h_ - 1):+5.1f}% (low {100 * (lo - 1):+.1f}%) | " +
                  " / ".join(f"{s_[2:]} {100 * (x[1] - 1):+.1f}% n{x[0]:,}" for x, s_ in zip(st, SEAS)), flush=True)
    return kept, scanned


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    df, F = load(conn); conn.close()
    print(f"CS|{APP}: regular legs {len(df):,} on {df['gd'].nunique()} slates; hit Under {df[df['under']]['hit'].mean():.3f} Over {df[~df['under']]['hit'].mean():.3f}; break-even {BE}; "
          f"features {len(F.columns)}; coverage: model {100 * df['ph'].notna().mean():.0f}%, book {100 * df['pb'].notna().mean():.0f}%, other app {100 * df['oline'].notna().mean():.0f}%, form {100 * df['gp'].notna().mean():.0f}%", flush=True)
    print("CS|single features, hit rate by season (Under | Over):", flush=True)
    for c in F.columns:
        for v in sorted(pd.unique(F[c].dropna()), key=str):
            cells = []
            for side in ("Under", "Over"):
                parts = []
                for s in SEAS:
                    k = (F[c].values == v) & (df["sd"].values == side) & (df["season"].values == s)
                    parts.append((f"{df['hit'].values[k].mean():.3f}" if not ALT else f"{100 * (df['val'].values[k].mean() - 1):+.1f}%") + f" n{int(k.sum()):,}" if k.sum() >= 40 else "-")
                cells.append(" / ".join(parts))
            print(f"CS|  {c:20s} {str(v):16s} Under {cells[0]:48s} | Over {cells[1]}", flush=True)
    kept, scanned = scan(df, F, "val", "REAL results")
    # false-positive yardstick: shuffle results inside each slate x side (keeps every slate's hit rate, destroys every link to the features)
    fp = []
    for i in range(5):
        d2 = df.copy(); d2["hs"] = d2.groupby(["gd", "sd"])["hit"].transform(lambda x: rng.permutation(x.values)) * d2["m"]
        k2, _ = scan(d2, F, "hs", "shuffled", verbose=False); fp.append(len(k2))
    print(f"CS|false-positive yardstick: the same scan on results shuffled inside each slate keeps {fp} cells (5 shuffles) against {len(kept)} on the real results", flush=True)
    print("CS|DONE", flush=True)


if __name__ == "__main__":
    main()
