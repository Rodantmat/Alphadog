#!/usr/bin/env python3
"""
PHASE D - THE BATTERY FROM ZERO, ON CERTIFIED NUMBERS ONLY (NBA_HONEST_REBUILD.md 8n / 8q). READ-ONLY. Apps are never mixed (BT_APP).
Owner D8: "redo the whole battery ... create strategies from zero with the past two seasons and especially the current season ... combine legs,
specific legs, top legs, demons and goblins, player form, factors, layers, rankings".
Legs: nba_score._lr_legs_h (certified honest history, in-play boards removed, real / bounded prices) joined to the OUT-OF-SAMPLE per-leg numbers of
nba_score._lr_legs_hp (walk-forward blend / gbm / small gbm / placebo). Only legs with an out-of-sample number are used, so nothing a strategy ranks on
has seen the result.
A strategy = rank key x kind x side x props x form x minimum predicted return x slip size x structure x slips a slate.
  rank key   predicted return (p x multiplier - 1) by gbm / small gbm / blend / mix / honest baseline / sportsbook ; hit probability by gbm / blend / honest
             baseline ; CONTROLS: placebo model, random order
  kind       regular | goblin | demon | regular + goblin | all   (Sleeper / Fliff: regular (main) | alt | all)
  side       both | Under | Over          props   all | no defensive (steals, blocks, stocks, turnovers) | single stats | combos
  form       any | hot (last 5 above season by 10%+) | cold | role up (minutes last 5 above season by 2+)
  minimum    none | predicted return > 0 | > 5%   (by the blend, the honest number)
  slip       2 - 6 picks, one pick a player and a game, slips are disjoint groups down the ranked list; 1, 2, 3 or 5 slips a slate
  structure  PrizePicks Power 2-6 / Flex 3-6 ; Underdog Standard 2-6 / Flex 3-6 (owner rule: no Standard above 2 picks - reported, flagged) ;
             Sleeper Max 2-6 / Flex 3-6 ; Fliff product 2-6.  Real tables; leg multipliers applied as each app applies them.
Per strategy and season: slips, ROI, units, max drawdown (units), longest run of slates without a winning slip. SCORE = season-weighted LOW END of the ROI (ROI minus 1.645
standard errors over slates; this season 1.0, last 0.6, the one before 0.35 - owner): steady strategies score near their ROI, lottery seasons score low.
THE YARDSTICK: the same grid is run on the placebo model and on random order. With tens of thousands of strategies some win by luck; a real strategy
counts only above the best control. Finalists get a 90% range per season (re-drawing slates).
PrizePicks slips that contain a goblin or demon are priced at MODELLED (bounded) history prices -> listed separately, NOT counted (rule C9).
Env: DATABASE_URL, BT_APP (prizepicks | underdog | sleeper | fliff), BT_TOP (30 finalists).
"""
import math
import os
import sys
import time
from itertools import combinations

import numpy as np
import pandas as pd
import psycopg

APP = (os.environ.get("BT_APP") or "underdog").lower()
NTOP = int(os.environ.get("BT_TOP") or 30)
# Sleeper / Fliff: the two earlier seasons carry DERIVED prices (circular with the sportsbook) - strategies chosen there lose ~30% on real prices (8q).
# Default for them: this season's real slates only, judged by split halves.
REALONLY = (os.environ.get("BT_REALONLY") or ("1" if APP in ("sleeper", "fliff") else "0")) == "1"
SEAS = ["2024-25", "2025-26", "2026-27"]; SW = np.array([0.35, 0.6, 1.0])
DEF = {"steals", "blocks", "stocks", "turnovers"}; COMBO = {"pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double"}
PP_POWER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
PP_FLEX = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
UD_STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_FLEX = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
KS = (2, 3, 4, 5, 6); SLATES = (1, 2, 3, 5); MAXG = 5; POOL = 30
STRUCTS = ["power"] if APP == "fliff" else ["power", "flex"]
SNAME = {"prizepicks": {"power": "Power", "flex": "Flex"}, "underdog": {"power": "Standard", "flex": "Flex"}, "sleeper": {"power": "Max", "flex": "Flex"}, "fliff": {"power": "product"}}[APP]
KINDS = ({"regular": {0}, "goblin": {1}, "demon": {2}, "regular + goblin": {0, 1}, "all": {0, 1, 2}} if APP in ("prizepicks", "underdog")
         else {"regular": {0}, "alt": {3}, "all": {0, 3}})
SIDES = {"both": None, "Under": 1, "Over": 0}
PROPS = ("all", "no defensive", "single stats", "combos")
FORMS = ("any", "hot", "cold", "role up")
EVMIN = (None, 0.0, 0.05)
KEYS = ("gbm return", "small gbm return", "blend return", "mix return", "honest return", "book return", "gbm chance", "blend chance", "honest chance",
        "CONTROL placebo", "CONTROL random")
T0 = time.time()
rng = np.random.default_rng(71)
SLP = None


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def f2(x):
    return math.floor(x * 100 + 1e-6) / 100


def pay_both(hits, ms):
    """(power payout, flex payout) of one slip; hits bool list, ms the app's leg multipliers as stored (prizepicks: price factor; underdog: x 1.8708)."""
    n = len(ms); h = int(sum(hits))
    if APP == "prizepicks":
        prod = math.prod(ms); pw = PP_POWER[n] * prod if h == n else 0.0
        fx = PP_FLEX.get((n, n - h), 0.0) * math.prod(m for m, x in zip(ms, hits) if x) if n >= 3 else 0.0
        return pw, fx
    if APP == "underdog":
        fs = [m / 1.8708 for m in ms]
        pw = f2(UD_STD[n] * math.prod(fs)) if h == n else 0.0
        base = UD_FLEX.get((n, n - h), 0.0) if n >= 3 else 0.0
        return pw, (f2(base * math.prod(f for f, x in zip(fs, hits) if x)) if base else 0.0)
    if APP == "fliff":
        return (f2(math.prod(ms)) if h == n else 0.0), 0.0
    bonus, fev, frat = SLP                                   # sleeper
    pw = math.prod(ms) * bonus.get(n, 1.0) if h == n else 0.0
    fx = 0.0
    if n >= 3 and h >= n - 2:
        import sleeper_live_slip_engine as SL
        fx = float(SL.flex_tiers(list(ms), fev, frat).get(h, 0.0))
    return pw, fx


def load(conn):
    global SLP
    if APP == "sleeper":
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import sleeper_live_slip_engine as SL
        SLP = SL.pricing(conn)
    d = pd.read_sql("""SELECT l.season, l.game_date::text gd, l.player_id, l.prop, l.side, l.line::float8 line, l.kind, l.tier, l.src, l.m::float8 m, l.hit::int hit, l.ph::float8 ph,
                              p.p_blend::float8 blend, p.p_gbm::float8 gbm, p.p_gbm_s::float8 gbm_s, p.p_placebo::float8 placebo
                       FROM nba_score._lr_legs_h l JOIN nba_score._lr_legs_hp p ON p.app = l.app AND p.game_date = l.game_date AND p.player_id = l.player_id AND p.prop = l.prop
                            AND p.side = l.side AND p.line = l.line AND p.kind = l.kind AND p.tier IS NOT DISTINCT FROM l.tier
                       WHERE l.app = %s AND l.hit IS NOT NULL AND l.m > 0""", conn, params=(APP,))
    n0 = len(d); d = d.drop_duplicates(["gd", "player_id", "prop", "side", "line", "kind", "tier"])
    if APP == "prizepicks":
        d = d[~d["tier"].astype(str).str.endswith("-u")].copy(); d["mm"] = d["m"] / 0.542; d["kindc"] = d["kind"].map({"standard": 0, "goblin": 1, "demon": 2}).fillna(0).astype(int)
    else:
        d["mm"] = d["m"]; d["kindc"] = d["kind"].map({"R": 0, "F": 1, "B": 2, "main": 0, "alt": 3}).fillna(0).astype(int)
    d["under"] = (~d["side"].str.lower().str[0].isin(["o", "m", "h"])).astype(int)
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mk = {"points": "player_points", "rebounds": "player_rebounds", "assists": "player_assists", "threes_made": "player_threes", "steals": "player_steals", "blocks": "player_blocks",
          "turnovers": "player_turnovers", "stocks": "player_blocks_steals", "pts_reb": "player_points_rebounds", "pts_ast": "player_points_assists",
          "reb_ast": "player_rebounds_assists", "pra": "player_points_rebounds_assists"}
    inv = {v: k for k, v in mk.items()}
    mc = pd.read_sql("SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, p_over_mean::float8 po FROM nba_market.market_consensus WHERE snapshot_label = 'window'", conn)
    mc["prop"] = mc["market_key"].map(inv); mc["player_id"] = mc["nm"].map(ids)
    mc = mc[mc["prop"].notna() & mc["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop", "line"])[["gd", "player_id", "prop", "line", "po"]]
    d = d.merge(mc, on=["gd", "player_id", "prop", "line"], how="left"); d["pb"] = np.where(d["under"] == 1, 1 - d["po"], d["po"])
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, season, game_id::text game_id, min::float8 mn, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m,
                               stl::float8 stl, blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'""", conn)
    gl = gl.sort_values(["player_id", "gd"]).drop_duplicates(["player_id", "gd"]); g = gl.groupby(["player_id", "season"], sort=False)
    gl["pra"] = gl["pts"] + gl["reb"] + gl["ast"]
    for c in ("mn", "pra"):
        gl[c + "_s"] = g[c].transform(lambda x: x.shift(1).expanding(min_periods=5).mean()); gl[c + "_5"] = g[c].transform(lambda x: x.shift(1).rolling(5, min_periods=3).mean())
    d = d.merge(gl[["player_id", "gd", "game_id", "mn_s", "mn_5", "pra_s", "pra_5"]], on=["player_id", "gd"], how="left")
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    hot = (d["pra_5"] - d["pra_s"]) / d["pra_s"].clip(lower=1.0)
    d["form"] = np.select([hot >= .10, hot <= -.10], [1, 2], 0); d["roleup"] = ((d["mn_5"] - d["mn_s"]) >= 2).astype(int)
    if REALONLY:
        d = d[(d["season"] == "2026-27") & (d["src"] == "real")].copy()
    log(f"{APP}: out-of-sample legs {len(d):,} (rows before de-dup {n0:,}) on {d['gd'].nunique()} slates; by season {d.groupby('season').size().to_dict()}; price source {d.groupby(['season', 'src']).size().to_dict()}")
    return d


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = load(conn); conn.close()
    days = sorted(d["gd"].unique()); di = {g: i for i, g in enumerate(days)}; nd = len(days)
    dseason = np.array([SEAS.index(s) for s in d.drop_duplicates("gd").set_index("gd").loc[days, "season"]])
    # strategy index
    combos = [(key, kn, sd, pr, fm, ev) for key in KEYS for kn in KINDS for sd in SIDES for pr in PROPS for fm in FORMS for ev in EVMIN]
    nC = len(combos); nS = len(STRUCTS)
    log(f"pools {nC:,}; strategies {nC * len(KS) * nS * len(SLATES):,} (flex needs 3+ picks); slates {nd}")
    PROF = np.zeros((nC, len(KS), nS, MAXG, nd), dtype=np.float32); CNT = np.zeros((nC, len(KS), MAXG, nd), dtype=np.int8); WIN = np.zeros((nC, len(KS), nS, MAXG, nd), dtype=np.int8)
    HITS = np.zeros((nC, len(KS), MAXG, nd), dtype=np.int8)
    ALT = np.zeros((nC, len(KS), MAXG, nd), dtype=np.int8)   # the slip holds a prizepicks goblin / demon (modelled price)
    for gd, g in d.groupby("gd", sort=True):
        j = di[gd]; n = len(g)
        mm = g["mm"].values; m = g["m"].values; hit = g["hit"].values.astype(bool); pl = g["player_id"].values; gm = g["game_id"].values; kc = g["kindc"].values
        und = g["under"].values; prp = g["prop"].values; form = g["form"].values; ru = g["roleup"].values
        key = {"gbm return": g["gbm"].values * mm - 1, "small gbm return": g["gbm_s"].values * mm - 1, "blend return": g["blend"].values * mm - 1,
               "mix return": 1 / (1 + np.exp(-(0.5 * np.log(g["blend"].clip(1e-4, 1 - 1e-4) / (1 - g["blend"].clip(1e-4, 1 - 1e-4))) + 0.5 * np.log(g["gbm"].clip(1e-4, 1 - 1e-4) / (1 - g["gbm"].clip(1e-4, 1 - 1e-4)))))).values * mm - 1,
               "honest return": g["ph"].values * mm - 1, "book return": g["pb"].values * mm - 1, "gbm chance": g["gbm"].values, "blend chance": g["blend"].values,
               "honest chance": g["ph"].values, "CONTROL placebo": g["placebo"].values * mm - 1, "CONTROL random": rng.random(n)}
        evb = g["blend"].values * mm - 1
        isdef = np.isin(prp, list(DEF)); iscombo = np.isin(prp, list(COMBO))
        mk = {kn: np.isin(kc, list(s)) for kn, s in KINDS.items()}
        ms = {"both": np.ones(n, bool), "Under": und == 1, "Over": und == 0}
        mp = {"all": np.ones(n, bool), "no defensive": ~isdef, "single stats": ~iscombo, "combos": iscombo}
        mf = {"any": np.ones(n, bool), "hot": form == 1, "cold": form == 2, "role up": ru == 1}
        me = {None: np.ones(n, bool), 0.0: evb > 0, 0.05: evb > 0.05}
        order = {k_: np.argsort(-np.nan_to_num(v, nan=-9.0), kind="stable") for k_, v in key.items()}; valid = {k_: ~np.isnan(v) for k_, v in key.items()}
        for c, (k_, kn, sd, pr, fm, ev) in enumerate(combos):
            mask = mk[kn] & ms[sd] & mp[pr] & mf[fm] & me[ev] & valid[k_]
            if mask.sum() < 2:
                continue
            idx = order[k_][mask[order[k_]]]
            pool = []; seen = set()
            for i in idx:                                    # one leg a player, the best by the key
                if pl[i] in seen:
                    continue
                seen.add(pl[i]); pool.append(i)
                if len(pool) >= POOL:
                    break
            for ki, k in enumerate(KS):
                used = set()
                for gi in range(MAXG):
                    pick = []; games = set()
                    for i in pool:
                        if i in used or gm[i] in games:
                            continue
                        pick.append(i); games.add(gm[i])
                        if len(pick) == k:
                            break
                    if len(pick) < k:
                        break
                    used.update(pick)
                    pw, fx = pay_both([hit[i] for i in pick], [m[i] for i in pick])
                    HITS[c, ki, gi, j] = sum(1 for i in pick if hit[i])
                    CNT[c, ki, gi, j] = 1; ALT[c, ki, gi, j] = int(APP == "prizepicks" and any(kc[i] != 0 for i in pick))
                    PROF[c, ki, 0, gi, j] = pw - 1; WIN[c, ki, 0, gi, j] = pw > 1
                    if nS > 1 and k >= 3:
                        PROF[c, ki, 1, gi, j] = fx - 1; WIN[c, ki, 1, gi, j] = fx > 1
        if j % 40 == 0:
            log(f"slate {j + 1} / {nd} ({gd})")
    log("slips built; scoring")
    rows = []; seen_sig = set(); ndup = 0
    smask = [dseason == s for s in range(3)]
    cur = np.where(smask[2])[0]; half = np.zeros(nd, bool); half[cur[::2]] = True          # this season's slates, alternating: A = 1st, 3rd, ... ; B = 2nd, 4th, ...
    hA = smask[2] & half; hB = smask[2] & ~half
    for c, cb in enumerate(combos):
        for ki, k in enumerate(KS):
            for si, st in enumerate(STRUCTS):
                if st == "flex" and k < 3:
                    continue
                for S in SLATES:
                    if S > MAXG:
                        continue
                    cnt = CNT[c, ki, :S].sum(0).astype(float); prof = PROF[c, ki, si, :S].sum(0).astype(float); win = WIN[c, ki, si, :S].max(0)
                    if cnt.sum() < (20 if REALONLY else 80):
                        continue
                    sig = hash((k, st, prof.tobytes(), cnt.tobytes()))          # the same slips under another name (e.g. kind "all" + side Under = regular Unders)
                    if sig in seen_sig and not cb[0].startswith("CONTROL"):
                        ndup += 1; continue
                    seen_sig.add(sig)
                    rs = []; ns = []; lbs = []; ps = []
                    for s in range(3):
                        m_ = smask[s] & (cnt > 0); n_ = cnt[m_].sum(); ns.append(n_); ps.append(float(prof[m_].sum()))
                        if n_ >= (20 if s == 2 else 40) and m_.sum() >= 10:
                            p_ = prof[m_]; r_ = p_.sum() / n_; se = math.sqrt(len(p_) * p_.var(ddof=1)) / n_
                            rs.append(r_); lbs.append(r_ - 1.645 * se)
                        else:
                            rs.append(np.nan); lbs.append(np.nan)
                    rs = np.array(rs); lbs = np.array(lbs); ok = ~np.isnan(rs)
                    if not ok[2] or (ok.sum() < 2 and not REALONLY):
                        continue
                    hv = (float(prof[hA].sum()), float(cnt[hA].sum()), float(prof[hB].sum()), float(cnt[hB].sum()))
                    # SCORE = season-weighted LOW END of the ROI (ROI minus 1.645 standard errors over slates): a season carried by one lottery slip has a
                    # huge standard error and scores low; a steady season scores close to its ROI.
                    wroi = float((lbs[ok] * SW[ok]).sum() / SW[ok].sum()); wmean = float((rs[ok] * SW[ok]).sum() / SW[ok].sum())
                    rows.append((cb, k, st, S, wroi, float(np.nanmin(rs)), rs, np.array(ns), c, ki, si, float(ALT[c, ki, :S].sum() / max(1, cnt.sum())), wmean, bool(ok.all()) or REALONLY, lbs, np.array(ps), hv))
    log(f"strategies with enough slips: {len(rows):,} (identical slip series removed: {ndup:,}){' | THIS SEASON ONLY (real prices)' if REALONLY else ''}")
    R = pd.DataFrame(rows, columns=["cb", "k", "st", "S", "wroi", "worst", "rs", "ns", "c", "ki", "si", "alt", "wmean", "full", "lbs", "ps", "hv"])
    R["control"] = R["cb"].map(lambda x: x[0].startswith("CONTROL")); R["modelled"] = R["alt"] > 0
    R["allpos"] = R["rs"].map(lambda r: bool(np.all(r[~np.isnan(r)] > 0))) & R["full"]        # positive in ALL THREE seasons, each with enough slips

    def describe(r):
        cb = r["cb"]; c, ki, si, S = r["c"], r["ki"], r["si"], r["S"]
        cnt = CNT[c, ki, :S].sum(0).astype(float); prof = PROF[c, ki, si, :S].sum(0).astype(float); win = WIN[c, ki, si, :S].max(0)
        parts = []
        for s in range(3):
            m_ = smask[s] & (cnt > 0)
            if cnt[m_].sum() < 15:
                parts.append(f"{SEAS[s]}: -"); continue
            p_ = prof[m_]; n_ = cnt[m_]; ix = rng.integers(len(p_), size=(400, len(p_))); b = p_[ix].sum(1) / n_[ix].sum(1)
            cum = np.concatenate([[0], np.cumsum(p_)]); dd = float((np.maximum.accumulate(cum) - cum).max()); dr = 0; cur = 0
            for w in win[m_]:
                cur = 0 if w else cur + 1; dr = max(dr, cur)
            lh = HITS[c, ki, :S].sum(0)[m_].sum() / (r["k"] * n_.sum())
            parts.append(f"{SEAS[s]}: {int(n_.sum())} slips / {int(m_.sum())} slates, leg hit {lh:.3f}, ROI {100 * p_.sum() / n_.sum():+.1f}% [{100 * np.quantile(b, .05):+.0f} .. {100 * np.quantile(b, .95):+.0f}], units {p_.sum():+.1f}, drawdown {dd:.1f}, drought {dr}")
        flag = " | owner rule: Underdog plays no Standard above 2 picks" if (APP == "underdog" and r["st"] == "power" and r["k"] > 2) else ""
        return (f"{r['k']}-pick {SNAME[r['st']]} x {S} a slate | rank {cb[0]} | kind {cb[1]} | side {cb[2]} | props {cb[3]} | form {cb[4]} | minimum {('none' if cb[5] is None else f'> {int(100 * cb[5])}%')}"
                f" | score (weighted low end) {100 * r['wroi']:+.1f}%, weighted ROI {100 * r['wmean']:+.1f}%, worst season {100 * r['worst']:+.1f}%{flag}\n        " + "\n        ".join(parts))

    real = R[~R["control"]]; ctl = R[R["control"]]
    for label, sub_real, sub_ctl in (("REAL-PRICE strategies (counted)", real[~real["modelled"]], ctl[~ctl["modelled"]]),
                                     ("strategies holding PrizePicks goblins / demons at MODELLED prices (NOT counted, rule C9)", real[real["modelled"]], ctl[ctl["modelled"]])):
        if not len(sub_real):
            continue
        print(f"\nBT|================ {APP.upper()} - {label} ================", flush=True)
        cbest = float(sub_ctl["wroi"].max()) if len(sub_ctl) else float("nan"); c95 = float(sub_ctl["wroi"].quantile(.95)) if len(sub_ctl) else float("nan")
        cpos = float(sub_ctl["allpos"].mean()) if len(sub_ctl) else float("nan")
        print(f"BT|strategies {len(sub_real):,}; controls (placebo + random) {len(sub_ctl):,}: best control score {100 * cbest:+.1f}%, 95th percentile {100 * c95:+.1f}%, "
              f"controls positive in every season {100 * cpos:.2f}%", flush=True)
        print(f"BT|real strategies: positive in every season {100 * sub_real['allpos'].mean():.2f}% ({int(sub_real['allpos'].sum()):,}); above the best control {int((sub_real['wroi'] > cbest).sum()):,}; "
              f"above the controls' 95th percentile {100 * (sub_real['wroi'] > c95).mean():.1f}% (5.0% expected by luck); median score {100 * sub_real['wroi'].median():+.1f}% (controls {100 * sub_ctl['wroi'].median():+.1f}%)", flush=True)
        # WALK-FORWARD OF THE SELECTION ITSELF: choose strategies using EARLIER seasons only, then read the season they never saw. This is the honest test
        # of "pick the best of the grid": the controls go through the same choice (what luck plus structure gives), and "all" is the grid's base rate.
        def wf(tab, train, test, tag):
            t = tab[tab["full"]].copy()
            if len(t) < 50:
                return
            t["sel"] = t["lbs"].map(lambda v: float(sum(v[i] * SW[i] for i in train) / sum(SW[i] for i in train)))
            t["tn"] = t["ns"].map(lambda v: float(v[test])); t["tp"] = t["ps"].map(lambda v: float(v[test])); t["tr"] = t["rs"].map(lambda v: float(v[test]))
            t["trp"] = t["rs"].map(lambda v: bool(all(v[i] > 0 for i in train)))
            out = []
            for nm, q in (("top 10", t.sort_values("sel", ascending=False).head(10)), ("top 30", t.sort_values("sel", ascending=False).head(30)), ("top 100", t.sort_values("sel", ascending=False).head(100)),
                          ("top 300", t.sort_values("sel", ascending=False).head(300)), ("every one positive in the chosen seasons", t[t["trp"]]), ("all", t)):
                if len(q):
                    out.append(f"{nm} ({len(q):,}): unseen-season ROI pooled {100 * q['tp'].sum() / max(1, q['tn'].sum()):+.1f}%, median {100 * q['tr'].median():+.1f}%, positive {100 * (q['tr'] > 0).mean():.0f}%")
            print(f"BT|WF {tag}: " + " | ".join(out), flush=True)
        def halves(tab, tag):
            t = tab[tab["hv"].map(lambda v: v[1] >= 8 and v[3] >= 8)].copy()
            if len(t) < 50:
                return
            t["ra"] = t["hv"].map(lambda v: v[0] / v[1]); t["rb"] = t["hv"].map(lambda v: v[2] / v[3]); out = []
            for a_, b_, lab in (("ra", "rb", "chosen on half A -> read on half B"), ("rb", "ra", "chosen on half B -> read on half A")):
                q = t.sort_values(a_, ascending=False); bi = 2 if b_ == "rb" else 0
                for N in (10, 30, 100, 300):
                    h = q.head(N); out.append(f"{lab} top {N}: {100 * h['hv'].map(lambda v: v[bi]).sum() / h['hv'].map(lambda v: v[bi + 1]).sum():+.1f}% (median {100 * h[b_].median():+.1f}%, positive {100 * (h[b_] > 0).mean():.0f}%)")
                out.append(f"all {len(t):,}: {100 * t['hv'].map(lambda v: v[bi]).sum() / t['hv'].map(lambda v: v[bi + 1]).sum():+.1f}%")
            print(f"BT|HALVES {tag} (this season's slates, alternating): " + " | ".join(out), flush=True)
        halves(sub_real, "REAL keys"); halves(sub_ctl, "CONTROLS ")
        # FOCUS: the one pre-stated family (top of the list on regular lines, no form filter, no minimum) - every key, side, props, size and structure,
        # so the reader sees the whole surface and not a pick of the best
        kreg = "regular"
        fam = R[(~R["modelled"]) & R["cb"].map(lambda q: q[1] == kreg and q[4] == "any" and q[5] is None)]
        if label.startswith("REAL") and len(fam):
            print("BT|FOCUS regular lines, top of the list, 1 slip a slate - ROI by season (slips) | key x side x props x structure", flush=True)
            for key_ in ("blend return", "small gbm return", "gbm return", "book return", "honest chance", "CONTROL placebo", "CONTROL random"):
                for sd_ in ("both", "Under", "Over"):
                    for pr_ in ("all", "single stats"):
                        x = fam[fam["cb"].map(lambda q: q[0] == key_ and q[2] == sd_ and q[3] == pr_) & (fam["S"] == 1)]
                        if not len(x):
                            continue
                        cells = []
                        for k in KS:
                            for st in STRUCTS:
                                y = x[(x["k"] == k) & (x["st"] == st)]
                                if len(y):
                                    r_ = y.iloc[0]; cells.append(f"{k}{SNAME[st][0]} " + "/".join("-" if np.isnan(v) else f"{100 * v:+.0f}" for v in r_["rs"]))
                        print(f"BT|F {key_:17s} {sd_:5s} {pr_:12s} | " + " | ".join(cells), flush=True)
        for nm_, tab in (("REAL keys", sub_real), ("CONTROLS ", sub_ctl)):
            if REALONLY:
                break
            wf(tab, [0], 1, f"{nm_} chosen on 2024-25 -> read on 2025-26")
            wf(tab, [0, 1], 2, f"{nm_} chosen on 2024-25 + 2025-26 -> read on 2026-27")
            wf(tab, [1], 2, f"{nm_} chosen on 2025-26 -> read on 2026-27")
            wf(tab, [1], 0, f"{nm_} chosen on 2025-26 -> read on 2024-25 (backwards, as a check)")
        for kname in KEYS:
            x = sub_real[sub_real["cb"].map(lambda q: q[0] == kname)] if not kname.startswith("CONTROL") else sub_ctl[sub_ctl["cb"].map(lambda q: q[0] == kname)]
            if len(x):
                print(f"BT|  by rank key {kname:18s}: strategies {len(x):6,} | median score {100 * x['wroi'].median():+6.1f}% | top 5% {100 * x['wroi'].quantile(.95):+6.1f}% | positive every season {100 * x['allpos'].mean():5.2f}%", flush=True)
        for k in KS:
            for st in STRUCTS:
                x = sub_real[(sub_real["k"] == k) & (sub_real["st"] == st)]
                if len(x):
                    print(f"BT|  by structure {k}-pick {SNAME[st]:8s}: strategies {len(x):6,} | median score {100 * x['wroi'].median():+6.1f}% | top 5% {100 * x['wroi'].quantile(.95):+6.1f}% | positive every season {100 * x['allpos'].mean():5.2f}%", flush=True)
        # luck depends on the structure (a 6-pick Power on one slip a slate swings far more than a 2-pick): compare each strategy with the controls of
        # the SAME size, structure and slips a slate
        cg = sub_ctl.groupby(["k", "st", "S"])["wroi"].agg(cmax="max", c99=lambda x: x.quantile(.99), cn="size").reset_index()
        sub_real = sub_real.merge(cg, on=["k", "st", "S"], how="left"); sub_real["excess"] = sub_real["wroi"] - sub_real["c99"]
        beat = sub_real[(sub_real["wroi"] > sub_real["cmax"]) & sub_real["allpos"]]
        print(f"BT|against controls of the SAME structure: above their best {int((sub_real['wroi'] > sub_real['cmax']).sum()):,} ({100 * (sub_real['wroi'] > sub_real['cmax']).mean():.2f}%; "
              f"each structure has ~{int(cg['cn'].median()) if len(cg) else 0} controls, so about {100 / (1 + (cg['cn'].median() if len(cg) else 1)):.2f}% would land there by luck); "
              f"above their best AND positive in every season {len(beat):,}", flush=True)
        print(f"BT|--- top {NTOP}: positive in EVERY season, ranked by the margin over the same-structure controls' 99th percentile ---", flush=True)
        for _, r in sub_real[sub_real["allpos"]].sort_values("excess", ascending=False).head(NTOP).iterrows():
            print(f"BT|S [controls of this structure: best {100 * r['cmax']:+.1f}%, 99th pct {100 * r['c99']:+.1f}%] " + describe(r), flush=True)
        print("BT|--- top 10 by score, any season pattern ---", flush=True)
        for _, r in sub_real.sort_values("wroi", ascending=False).head(10).iterrows():
            print("BT|A " + describe(r), flush=True)
        print("BT|--- the 5 best CONTROLS (what luck alone produces on this grid) ---", flush=True)
        for _, r in sub_ctl.sort_values("wroi", ascending=False).head(5).iterrows():
            print("BT|C " + describe(r), flush=True)
    print("BT|DONE", flush=True)


if __name__ == "__main__":
    main()
