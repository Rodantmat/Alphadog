#!/usr/bin/env python3
"""
PASS 29 - SLEEPER, FLIFF, BETR: THE ALL-AROUND STUDY (owner 2026-11-23 09:24 PT: "Still missing all the other apps, all of them need this all
around study. Using the current season data and deriving the previous seasons as support"). READ-ONLY.
Boards: Sleeper / Fliff - 2026-27 REAL (their own multipliers), 2024-25 and 2025-26 DERIVED (nba_score.v_legs_honest, price_source 'derived' - support
only); Betr - its own board snapshots 2025-26 and 2026-27 (table prices, real). Grading: box score. One slip a slate per strategy.
  source of the order   tight (live: Underdog top 2 + PrizePicks top 5) | wide (10 + 10) | Underdog order | PrizePicks order | PrizePicks average order |
                        PrizePicks model order | Underdog certified-hit-rate order (new 2026-11-23) | PrizePicks score order | the app's own board by blend |
                        the app's own board by model | RANDOM order x3 (the luck yardstick: same pools, same rules, no ranking)
  pool                  every single stat | no assists | rebounds | points | no points | points + rebounds | defensive | threes | lines < 10 | lines 10+ |
                        home | away | multiplier 1.8+ | multiplier < 1.8 (not Betr)
  composition           1 or 2 legs a game | every prop different | start at rank 1 or 2
  slips                 Sleeper Max 2-6, Flex 3-6; Fliff Max 2-6; Betr Perfect 2-5, Dynamic 3-6
OWNER'S RULE: 2026-27 (real) ROI >= 25% and both support seasons positive -> DAILY; 0-25% (support positive) -> FALLBACK; else drop. Each candidate is
also read against the random-order cells (how many random cells pass the same rule). The live codes (S1 S4 S5 S6 S7-S11, F1 F4 F5 F6-F10, B1 B5 B6
B21) are printed by name. Leg gone (each leg removed in turn): sub-own (next leg of the strategy's own list) | shrink (one size down) | drop.
Env: DATABASE_URL, P29_APPS (sleeper,fliff,betr).
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass10 as P10                                     # noqa: E402

MKS = P10.MKS
SEAS = ("2024-25", "2025-26", "2026-27")


def take(rows, k, gcap, diff=False, start=1, skip=(), seed=()):
    out = list(seed); games = defaultdict(int); players = {r["player_id"] for r in seed} | set(skip); props = {r["prop"] for r in seed}
    for r in seed:
        games[r["game_id"]] += 1
    n = 0
    for r in rows:
        if r["player_id"] in players or games[r["game_id"]] >= gcap or (diff and r["prop"] in props):
            continue
        n += 1
        if n < start:
            players.add(r["player_id"]); continue
        out.append(r); players.add(r["player_id"]); games[r["game_id"]] += 1; props.add(r["prop"])
        if len(out) == k:
            return out
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    import sleeper_live_slip_engine as SL
    P10.SLP = SL.pricing(conn)
    BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]; P10.BR = BR if isinstance(BR, dict) else json.loads(BR)
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.kind, v.multiplier::float8 mm, (v.price_source = 'real')::int real, v.hit::int hit,
                              v.p_blend::float8 blend, v.p_honest_baseline::float8 ph FROM nba_score.v_legs_honest v WHERE v.prop = ANY(%s) AND v.is_under AND v.game_date >= '2024-10-01'""",
                    conn, params=(list(MKS.values()),))
    lc = pd.read_sql("""SELECT app, game_date::text gd, player_id, prop, line::float8 line, hit_rate::float8 hr, score::float8 score FROM nba_score.leg_card_v2
                        WHERE side = 'Under' AND ((app = 'underdog' AND leg_mult = 1) OR (app = 'prizepicks' AND kind = 'standard'))""", conn)
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id, (matchup LIKE '%%vs.%%') home, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m, stl::float8 stl,
                               blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01' AND min > 0""", conn).drop_duplicates(["player_id", "gd"])
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    bb = pd.read_sql("""SELECT DISTINCT game_date::text gd, nba_ref.norm_name(player) nm, market_key mk, line::float8 line FROM nba_market.board_snapshots
                        WHERE bookmaker IN ('betr_us_dfs', 'betr') AND snapshot_label = 'window' AND game_date < current_date AND market_key = ANY(%s) AND lower(left(side, 1)) NOT IN ('o', 'm', 'h')""",
                     conn, params=(list(MKS),))
    conn.close()
    d = d.merge(gl[["player_id", "gd", "game_id"]], on=["player_id", "gd"], how="left"); d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    d = d.merge(lc, on=["app", "gd", "player_id", "prop", "line"], how="left")
    bb["player_id"] = bb["nm"].map(ids); bb["prop"] = bb["mk"].map(MKS); bb = bb[bb["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop"]).merge(gl, on=["player_id", "gd"], how="inner")
    stat = np.full(len(bb), np.nan)
    for p_, c_ in P10.SINGLE.items():
        k_ = (bb["prop"] == p_).values; stat[k_] = bb.loc[k_, c_].values
    bb["stat"] = stat; bb = bb[bb["stat"] != bb["line"]].copy(); bb["hit"] = (bb["stat"] < bb["line"]).astype(int); bb["mm"] = 1.0; bb["app"] = "betr"; bb["real"] = 1
    bb["season"] = np.where(bb["gd"] < "2026-08-01", "2025-26", "2026-27")
    home_of = {(g_, p_): bool(h_) for g_, p_, h_ in zip(gl["gd"], gl["player_id"], gl["home"])}
    reg = d[(d["kind"] == "regular") & d["app"].isin(["underdog", "prizepicks"]) & d["blend"].notna()]; reg = reg[(reg["app"] != "prizepicks") | (reg["line"] % 1 != 0)]
    L = {key: g.to_dict("records") for key, g in reg.sort_values("blend", ascending=False).groupby(["app", "gd"], sort=False)}
    apps = [a for a in (os.environ.get("P29_APPS") or "sleeper,fliff,betr").split(",") if a]
    own = d[d["app"].isin(["sleeper", "fliff"])]
    tgt = pd.concat([own, bb[["app", "season", "gd", "player_id", "prop", "line", "mm", "hit", "game_id", "real"]]], ignore_index=True)
    T = {key: g.to_dict("records") for key, g in tgt.groupby(["app", "gd", "player_id", "prop"], sort=False)}
    BOARD = {key: g for key, g in tgt.groupby(["app", "gd"], sort=False)}
    print("P29|boards: " + " | ".join(f"{a}: " + ", ".join(f"{s} {g['gd'].nunique()} slates ({100*g['real'].mean():.0f}% real)" for s, g in tgt[tgt['app'] == a].groupby('season')) for a in apps), flush=True)

    def first(rows, k):
        return take(rows, k, 1) or rows[:0] or []

    def onto(app, gd, src):
        out = []
        for r in src:
            g = T.get((app, gd, r["player_id"], r["prop"]))
            if g:
                t = min(g, key=lambda x: abs(x["line"] - r["line"])); out.append(dict(t, player_id=r["player_id"], prop=r["prop"], game_id=r["game_id"], gd=gd))
        return out

    def firstk(rows, k):
        o = []; gs = set(); ps = set()
        for r in rows:
            if r["player_id"] in ps or r["game_id"] in gs:
                continue
            o.append(r); ps.add(r["player_id"]); gs.add(r["game_id"])
            if len(o) == k:
                break
        return o

    rng = np.random.default_rng(29)
    STRUCT = {"sleeper": [("P", k) for k in (2, 3, 4, 5, 6)] + [("F", k) for k in (3, 4, 5, 6)], "fliff": [("P", k) for k in (2, 3, 4, 5, 6)],
              "betr": [("P", k) for k in (2, 3, 4, 5)] + [("D", k) for k in (3, 4, 5, 6)]}

    def payf(app, st, k, s):
        hits = [x["hit"] for x in s]
        if st == "D":
            return float((P10.BR["dynamic_all_less"].get(str(k)) or {}).get(str(sum(hits)), 0.0))
        return P10.pay(app, k, st, hits, [x["mm"] for x in s])

    def sources(app, gd):
        U = L.get(("underdog", gd), []); P = L.get(("prizepicks", gd), [])
        b = BOARD.get((app, gd))
        ownb = b.drop_duplicates(["player_id", "prop"]).to_dict("records") if b is not None else []
        src = {"tight (live)": sorted(firstk(U, 2) + firstk(P, 5), key=lambda r: -r["blend"]),
               "wide": sorted(firstk(U, 10) + firstk(P, 10), key=lambda r: -r["blend"]),
               "Underdog order": U, "PrizePicks order": P,
               "PrizePicks average order": sorted(P, key=lambda r: -((r["blend"] + r["ph"]) / 2 if r["ph"] == r["ph"] else -9)),
               "PrizePicks model order": sorted(P, key=lambda r: -(r["ph"] if r["ph"] == r["ph"] else -9)),
               "Underdog hit-rate order": sorted([r for r in U if r.get("hr") == r.get("hr") and r.get("hr") is not None], key=lambda r: -r["hr"]),
               "PrizePicks score order": sorted([r for r in P if r.get("score") == r.get("score") and r.get("score") is not None], key=lambda r: -r["score"])}
        out = {k: onto(app, gd, v) for k, v in src.items()}
        if app != "betr":
            out["own board by blend"] = [dict(r, gd=gd) for r in sorted([r for r in ownb if r.get("blend") == r.get("blend")], key=lambda r: -r["blend"])]
            out["own board by model"] = [dict(r, gd=gd) for r in sorted([r for r in ownb if r.get("ph") == r.get("ph")], key=lambda r: -r["ph"])]
        for i in range(3):
            o = list(out["PrizePicks order"]) if out["PrizePicks order"] else []
            idx = rng.permutation(len(o)); out[f"RANDOM {i}"] = [o[j] for j in idx]
        return out

    POOLS = (("every single stat", lambda r: True), ("no assists", lambda r: r["prop"] != "assists"), ("rebounds", lambda r: r["prop"] == "rebounds"), ("points", lambda r: r["prop"] == "points"),
             ("no points", lambda r: r["prop"] != "points"), ("points + rebounds", lambda r: r["prop"] in ("points", "rebounds")), ("defensive", lambda r: r["prop"] in ("steals", "blocks", "turnovers")),
             ("threes", lambda r: r["prop"] == "threes_made"), ("lines under 10", lambda r: r["line"] < 10), ("lines 10+", lambda r: r["line"] >= 10),
             ("home", lambda r: home_of.get((r["gd"], r["player_id"])) is True), ("away", lambda r: home_of.get((r["gd"], r["player_id"])) is False),
             ("multiplier 1.8+", lambda r: r["mm"] >= 1.8), ("multiplier under 1.8", lambda r: r["mm"] < 1.8))
    # live codes: (source, pool, gcap, diff, start, struct, k, cap-the-list)
    LIVE = {"sleeper": {"S1": ("Underdog order", "every single stat", 1, 0, 1, "P", 2, 2), "S4": ("tight (live)", "every single stat", 1, 0, 1, "F", 4, None),
                        "S5": ("tight (live)", "every single stat", 1, 0, 1, "P", 4, None), "S6": ("tight (live)", "every single stat", 1, 0, 1, "F", 5, None),
                        "S9": ("tight (live)", "no assists", 1, 0, 1, "P", 2, None), "S7": ("PrizePicks order", "every single stat", 1, 0, 1, "P", 5, None),
                        "S8": ("PrizePicks order", "every single stat", 1, 0, 1, "P", 4, None), "S10": ("PrizePicks order", "no assists", 1, 1, 1, "P", 3, None),
                        "S11": ("PrizePicks order", "rebounds", 1, 0, 1, "P", 2, None)},
            "fliff": {"F1": ("Underdog order", "every single stat", 1, 0, 1, "P", 2, 2), "F4": ("tight (live)", "every single stat", 1, 0, 1, "P", 4, None),
                      "F5": ("tight (live)", "every single stat", 1, 0, 1, "P", 5, None), "F8": ("tight (live)", "no assists", 1, 0, 1, "P", 2, None),
                      "F6": ("PrizePicks order", "every single stat", 1, 0, 1, "P", 4, None), "F7": ("PrizePicks order", "every single stat", 1, 0, 1, "P", 5, None),
                      "F9": ("PrizePicks order", "no assists", 1, 1, 1, "P", 3, None), "F10": ("PrizePicks order", "rebounds", 1, 0, 1, "P", 2, None)},
            "betr": {"B1": ("tight (live)", "every single stat", 1, 0, 1, "P", 3, None), "B5": ("PrizePicks order", "every single stat", 1, 0, 1, "P", 3, 5),
                     "B6": ("PrizePicks order", "no assists", 1, 1, 1, "P", 3, None), "B21": ("tight (live)", "no assists", 1, 0, 1, "P", 3, None)}}
    for app in apps:
        days = sorted({gd for (a, gd) in BOARD if a == app})
        print(f"\nP29|================ {app.upper()}: {len(days)} slates ================", flush=True)
        acc = defaultdict(list)            # cell -> [(season, u, hit share)]
        gone = defaultdict(lambda: defaultdict(list))
        pools = [p for p in POOLS if not (app == "betr" and p[0].startswith("multiplier"))]
        named = {(src, pn, gc, df, stt, st, k): code for code, (src, pn, gc, df, stt, st, k, cap) in LIVE[app].items()}
        for gd in days:
            S = sources(app, gd)
            for sn, rows in S.items():
                for pn, pf in pools:
                    cand = [r for r in rows if pf(r)]
                    if len(cand) < 2:
                        continue
                    for diff in (0, 1):
                        if diff and pn not in ("every single stat", "no assists", "no points"):
                            continue
                        for gcap in (1, 2):
                            for start in (1, 2):
                                for (st, k) in STRUCT[app]:
                                    c2 = cand
                                    code = named.get((sn, pn, gcap, diff, start, st, k))
                                    if code and LIVE[app][code][7]:
                                        c2 = cand[:LIVE[app][code][7]]
                                    s_ = take(c2, k, gcap, diff, start)
                                    if not s_:
                                        continue
                                    u = payf(app, st, k, s_) - 1
                                    acc[(sn, pn, gcap, diff, start, st, k)].append((s_[0]["season"], u, np.mean([x["hit"] for x in s_])))
                                    if code or (sn.startswith("Underdog hit") and gcap == 1 and start == 1 and not diff):
                                        key = code or f"{sn}|{pn}|{st}{k}"
                                        for x in s_:
                                            rest = [y for y in s_ if y is not x]
                                            so = take(c2, k, gcap, diff, 1, skip={x["player_id"]}, seed=rest)
                                            gone[key]["sub-own"].append(payf(app, st, k, so) - 1 if so else None)
                                            kk = k - 1
                                            ok = kk >= 2 and (st != "F" or kk >= 3) and (st != "D" or kk >= 3)
                                            gone[key]["shrink"].append(payf(app, st if ok or st == "P" else "P", kk, rest) - 1 if kk >= 2 else None)
                                            gone[key]["drop"].append(0.0)
        rows = []
        for key, v in acc.items():
            t = pd.DataFrame(v, columns=["s", "u", "h"])
            rec = dict(zip(("src", "pool", "gcap", "diff", "start", "st", "k"), key)); rec["rand"] = key[0].startswith("RANDOM")
            for s in SEAS:
                x = t[t["s"] == s]
                rec[f"n{s[2:4]}"] = len(x); rec[f"r{s[2:4]}"] = x["u"].mean() if len(x) else np.nan; rec[f"h{s[2:4]}"] = x["h"].mean() if len(x) else np.nan
                rec[f"w{s[2:4]}"] = (x["u"].sum() - x["u"].nlargest(1 if s == "2026-27" else 2).sum()) / max(len(x), 1) if len(x) else np.nan
            rec["code"] = named.get(key, "")
            rows.append(rec)
        R = pd.DataFrame(rows)
        sup = [c for c in ("r24", "r25") if c in R and R[c].notna().any()]
        R["support"] = np.all([R[c].fillna(-1) > 0 for c in sup], axis=0) if sup else True
        R["ok26"] = (R["n26"] >= 15) & (R["w26"] > 0)
        R["daily"] = R["ok26"] & R["support"] & (R["r26"] >= 0.25)
        R["fallback"] = R["ok26"] & R["support"] & (R["r26"] > 0) & (R["r26"] < 0.25)
        for lab, m in (("real order", ~R["rand"]), ("RANDOM order", R["rand"])):
            X = R[m]
            print(f"P29|  {lab}: cells {len(X):,} | DAILY by the rule {X['daily'].sum():,} ({100*X['daily'].mean():.2f}%) | FALLBACK {X['fallback'].sum():,} ({100*X['fallback'].mean():.2f}%)", flush=True)
        print(f"P29|  LIVE CODES (ROI 2024-25 derived / 2025-26 {'real' if app == 'betr' else 'derived'} / 2026-27 real; w/o best; legs' hit):", flush=True)
        for r in R[R["code"] != ""].sort_values("code").itertuples():
            verdict = "DAILY" if r.daily else "FALLBACK" if r.fallback else "DROP"
            print(f"P29|    {r.code:4s} {r.k}{'-pick Flex' if r.st == 'F' else '-pick Dynamic' if r.st == 'D' else '-pick'} | {r.src} | {r.pool}: "
                  + " / ".join(f"{100*getattr(r, 'r'+s[2:4]):+.0f}% ({getattr(r, 'n'+s[2:4])})" if getattr(r, 'n'+s[2:4]) else "-" for s in SEAS)
                  + f" | w/o best 26-27 {100*r.w26:+.0f}% | legs 26-27 {100*r.h26:.1f}% -> {verdict}", flush=True)
        best = R[~R["rand"] & R["daily"]].sort_values("r26", ascending=False)
        print(f"P29|  BEST NEW DAILY (rule met; compare the RANDOM count above):", flush=True)
        for r in best.head(30).itertuples():
            print(f"P29|    {r.k}{'F' if r.st == 'F' else 'D' if r.st == 'D' else 'P'} | {r.src} | {r.pool} | g{r.gcap}{' pd' if r.diff else ''}{' from#2' if r.start == 2 else ''}: "
                  + " / ".join(f"{100*getattr(r, 'r'+s[2:4]):+.0f}% ({getattr(r, 'n'+s[2:4])})" if getattr(r, 'n'+s[2:4]) else "-" for s in SEAS)
                  + f" | w/o best {100*r.w26:+.0f}% | legs {100*r.h26:.1f}%{' [live ' + r.code + ']' if r.code else ''}", flush=True)
        fbk = R[~R["rand"] & R["fallback"]].sort_values("r26", ascending=False)
        print(f"P29|  BEST FALLBACK-GRADE: " + " || ".join(f"{r.k}{r.st} {r.src}/{r.pool}/g{r.gcap}: {100*r.r24:+.0f}/{100*r.r25:+.0f}/{100*r.r26:+.0f}%" for r in fbk.head(10).itertuples()), flush=True)
        print(f"P29|  LEG GONE (profit per affected slip, units):", flush=True)
        for key, g in gone.items():
            parts = []; means = {}
            for kk in ("sub-own", "shrink", "drop"):
                vals = [x for x in g[kk] if x is not None]
                means[kk] = np.mean([x if x is not None else 0.0 for x in g[kk]])
                parts.append(f"{kk} {np.mean(vals) if vals else float('nan'):+.3f} ({len(vals)})")
            print(f"P29|    {key}: " + " | ".join(parts) + f" -> best {max(means, key=means.get)}", flush=True)
    print("P29|DONE", flush=True)


if __name__ == "__main__":
    main()
