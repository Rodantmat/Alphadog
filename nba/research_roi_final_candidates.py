#!/usr/bin/env python3
"""
FINAL CANDIDATE TABLES (owner 2026-11-11 20:23 PT: "Which are the best candidates? To use everyday and fallback. ROI on the previous seasons, ROI for
this season, drawdown, droughts, all the good data for decisions"). READ-ONLY. FC_APP = pp | ud | sleeper | fliff | betr (apps never mixed).
Each candidate (rank key, leg kinds, ROI filter, side, props, pool size N, picks k, structure) is played slate by slate, one $1 slip each, on
  2024-25 and 2025-26 (history, calibration trained on the other season) and 2026-27 (this season, REAL boards, graded slates before today),
and reported with: slips, slips/day, win rate, ROI, profit (units), max drawdown (units), longest time underwater (slates), longest losing streak
(slates), worst day, share of profitable days.
"""
import os, sys, math, collections, datetime as dt
import numpy as np, pandas as pd, psycopg

FC = (os.environ.get("FC_APP") or "pp").lower()
if FC in ("pp", "ud"):
    os.environ["APP"] = FC
else:
    os.environ["SW_APP"] = FC
    os.environ["SW_CAL"] = "logit" if FC in ("sleeper", "fliff") else ""
    if FC == "betr":
        os.environ["APP"] = "BETR"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if FC in ("pp", "ud"):
    import research_roi_slip_sweep as M
else:
    import research_roi_slip_sweep_apps as M
import research_app_final_strategies as AF           # noqa: E402

PT = __import__("zoneinfo").ZoneInfo("America/Los_Angeles")
REAL = "2026-27"

# (label, key, kinds, roi_f, side, props, N, k, mode)
CANDS = {
    "pp": [
        ("PP-A 6-pick Flex, top15, today's score, regular lines", "score_cert", "std", "none", "both", "all", 15, 6, "flex"),
        ("PP-B 6-pick Power, top15, today's score, regular lines", "score_cert", "std", "none", "both", "all", 15, 6, "power"),
        ("PP-C 5-pick Flex, Less only, top15, new score, regular", "score_roi", "std", "none", "under", "all", 15, 5, "flex"),
        ("PP-D 4-pick Flex, Less only, top10, new score, regular", "score_roi", "std", "none", "under", "all", 10, 4, "flex"),
        ("PP-E 3-pick Power, top10, hit prob, regular lines", "hp", "std", "none", "both", "all", 10, 3, "power"),
        ("PP-F 4-pick Power, top15, today's score, regular", "score_cert", "std", "none", "both", "all", 15, 4, "power"),
        ("PP-G 3-pick Flex, top10, new score, regular", "score_roi", "std", "none", "both", "nodef", 10, 3, "flex"),
        ("PP-H 4-pick Power, top10, new score, ALL lines incl goblin/demon (modeled prices)", "score_roi", "all", "none", "both", "all", 10, 4, "power"),
    ],
    "ud": [
        ("UD-A 6-pick Flex, top30, More only, today's score, regular", "score_cert", "std", "none", "over", "all", 30, 6, "flex"),
        ("UD-B 4-pick Flex, top20, More only, today's score, regular", "score_cert", "std", "none", "over", "all", 20, 4, "flex"),
        ("UD-C 3-pick Flex, top10, today's score, regular+boosted", "score_cert", "std+high", "none", "both", "all", 10, 3, "flex"),
        ("UD-D 5-pick Flex, top20, Less only, today's score, regular+boosted", "score_cert", "std+high", "none", "under", "all", 20, 5, "flex"),
        ("UD-E 4-pick Flex, top15, hit prob, regular+boosted", "hp", "std+high", "none", "both", "all", 15, 4, "flex"),
        ("UD-F 2-pick Standard, top5, hit prob, Less only", "hp", "all", "none", "under", "all", 5, 2, "power"),
        ("UD-G 3-pick Flex, top15, new score, regular", "score_roi", "std", "none", "both", "all", 15, 3, "flex"),
    ],
    "sleeper": [
        ("SL-A 6-pick Flex, top15, new score, main lines, ROI>0", "score_roi", "main", "pos", "both", "all", 15, 6, "flex"),
        ("SL-B 5-pick Flex, top15, new score, all lines, ROI>5%", "score_roi", "all", "5pct", "both", "all", 15, 5, "flex"),
        ("SL-C 5-pick Flex, top20, Less only, today's score, main", "score_cert", "main", "none", "under", "all", 20, 5, "flex"),
        ("SL-D 6-pick Flex, top30, Less only, hit prob, main", "hp", "main", "none", "under", "all", 30, 6, "flex"),
        ("SL-E 6-pick Flex, top30, new score, main lines", "score_roi", "main", "none", "both", "all", 30, 6, "flex"),
        ("SL-F 3-pick Flex, top10, new score, main lines", "score_roi", "main", "none", "both", "all", 10, 3, "flex"),
    ],
    "fliff": [
        ("FL-A 5-pick product, top15, new score, main lines", "score_roi", "main", "none", "both", "all", 15, 5, "max"),
        ("FL-B 6-pick product, top15, new score, all lines", "score_roi", "all", "none", "both", "all", 15, 6, "max"),
        ("FL-C 5-pick product, top20, Less only, today's score, main", "score_cert", "main", "none", "under", "all", 20, 5, "max"),
        ("FL-D 6-pick product, top20, hit prob, main", "hp", "main", "none", "both", "all", 20, 6, "max"),
        ("FL-E 3-pick product, top10, hit prob, main", "hp", "main", "none", "both", "all", 10, 3, "max"),
    ],
    "betr": [
        ("BT-A 3-pick Dynamic, top3, Less only, today's score", "score_cert", "all", "none", "under", "all", 3, 3, "dynamic"),
        ("BT-B 4-pick Dynamic, top5, new score", "score_roi", "all", "none", "both", "all", 5, 4, "dynamic"),
        ("BT-C 2-pick Dynamic, top3, new score", "score_roi", "all", "none", "both", "all", 3, 2, "dynamic"),
        ("BT-D 6-pick Perfect, top15, Less only, today's score", "score_cert", "all", "none", "under", "all", 15, 6, "perfect"),
        ("BT-E 3-pick Perfect, top3, Less only, today's score", "score_cert", "all", "none", "under", "all", 3, 3, "perfect"),
    ],
}[FC]


def log(m):
    print(m, flush=True)


# ------------------------------------------------------------------ this season, PrizePicks / Underdog
def real_pp(conn):
    import live_slip_engine as L
    today = dt.datetime.now(PT).date()
    ds = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_score.final_hp WHERE game_date >= %s AND game_date < %s ORDER BY 1", (dt.date(2026, 10, 20), today)).fetchall()]
    rows = []
    for d in ds:
        st = AF.box(conn, d)
        if not st:
            continue
        legs = {}
        for l in L.load_board_legs_live(conn, d):
            if l.get("whole_number") or l["rank_key"] not in ("final_hp", "final_score") or l["prop"] not in AF.STAT:
                continue
            k = (l["player_id"], l["prop"], l["side"], float(l["line"]), l["tier"])
            e = legs.setdefault(k, dict(game_date=d, player=l["player"], player_id=l["player_id"], prop=l["prop"], side=l["side"], line=float(l["line"]),
                                        tier=l["tier"], factor=float(l["factor"]), event_id=l["event_id"], team=l["team_id"]))
            e["hp" if l["rank_key"] == "final_hp" else "score_cert"] = float(l["score"])
        for e in legs.values():
            if "hp" not in e or "score_cert" not in e:
                continue
            e["hit"] = AF.outcome(st, e)
            rows.append(e)
    df = pd.DataFrame(rows)
    df["kind"] = np.where(df["tier"].str.startswith("R"), "standard", np.where(df["tier"].str.startswith("G"), "goblin", "demon"))
    df["season"] = REAL
    return df


def real_ud(conn):
    today = dt.datetime.now(PT).date()
    ds = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_market.board_snapshots WHERE bookmaker='underdog' AND snapshot_label='window' AND game_date >= %s AND game_date < %s ORDER BY 1",
                                     (dt.date(2026, 10, 20), today)).fetchall()]
    rows = []
    for d in ds:
        st = AF.box(conn, d)
        if not st:
            continue
        legs, _ = AF.load_ud(conn, d, st)
        for l in legs:
            if l.get("p") is None or l.get("score") is None:
                continue
            rows.append(dict(game_date=d, player=l["player"], player_id=l["player_id"], prop=l["prop"], side=l["side"], line=l["line"], tier=l["tier"],
                             factor=float(l["m"]), event_id=l["event_id"], hp=float(l["p"]), score_cert=float(l["score"]), hit=l["hit"]))
    df = pd.DataFrame(rows)
    df["kind"] = df["factor"].map(M.klass); df["season"] = REAL
    return df


def patch_betr():
    """this season's Betr boards are stored under bookmaker 'betr' (history: 'betr_us_dfs'): read both, read-only, runtime patch"""
    import inspect, textwrap
    for fn in (AF.slate_days, AF.load_betr):
        src = textwrap.dedent(inspect.getsource(fn))
        src = src.replace("bk = \"underdog\" if APP == \"UD\" else \"betr_us_dfs\"", "bk = [\"underdog\"] if APP == \"UD\" else [\"betr\", \"betr_us_dfs\"]")
        src = src.replace("WHERE bookmaker=%s AND snapshot_label='window'\"", "WHERE bookmaker = ANY(%s) AND snapshot_label='window'\"")
        src = src.replace("bookmaker='betr_us_dfs'", "bookmaker = ANY(ARRAY['betr','betr_us_dfs'])")
        exec(src, AF.__dict__)


# ------------------------------------------------------------------ evaluation
def one(df_days, c):
    label, key, kinds, roimin, side, props, N, k, mode = c
    per = collections.OrderedDict()
    for d, df in df_days:
        legs = M.tops(df, key, kinds, roimin, side, props)
        for s in M.groups(legs, N, k):
            p = M.pay(s, mode)
            e = per.setdefault(d, [0.0, 0, 0]); e[0] += p - 1.0; e[1] += 1; e[2] += 1 if p > 0 else 0
    return per


def metrics(per, nslates):
    if not per:
        return None
    ds = list(per); pnl = np.array([per[d][0] for d in ds]); n = sum(per[d][1] for d in ds); w = sum(per[d][2] for d in ds)
    eq = np.cumsum(pnl); peak = np.maximum.accumulate(np.concatenate([[0.0], eq]))[1:]; dd = float((peak - eq).max())
    under = 0; cur = 0; peakv = 0.0
    for x in eq:
        if x >= peakv:
            peakv = x; cur = 0
        else:
            cur += 1; under = max(under, cur)
    ls = 0; cur = 0
    for x in pnl:
        cur = cur + 1 if x < 0 else 0; ls = max(ls, cur)
    return dict(n=n, per_day=n / max(1, nslates), win=w / n, roi=pnl.sum() / n, profit=float(pnl.sum()), dd=dd, under=under, streak=ls,
                worst=float(pnl.min()), best=float(pnl.max()), posdays=float((pnl > 0).mean()), days=len(ds))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    days = {}
    if FC in ("pp", "ud"):
        if FC == "pp":
            M.SE.flex_alt_tiers(); M.SE.payout_v3_rules()
        hist = M.load(conn)
        T_all = M.build_tables(hist)
        for s in sorted(hist["season"].unique()):
            te = M.score_season(hist[hist["season"] == s].copy().reset_index(drop=True), M.build_tables(hist[hist["season"] != s]))
            days[s] = [(d, g) for d, g in te.groupby("game_date")]
        r = real_pp(conn) if FC == "pp" else real_ud(conn)
        r["conf"] = float(hist["conf"].median()) if "conf" in hist else .5
        r["over"] = r["side"].str.lower().str[0].isin(["o", "m", "h"])
        r = r[r["hit"].notna()].copy(); r["hit"] = r["hit"].astype(int)
        te = M.score_season(r.reset_index(drop=True), T_all)
        days[REAL] = [(d, g) for d, g in te.groupby("game_date")]
    else:
        if FC == "betr":
            import json
            patch_betr()
            M.BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
            M.BR = M.BR if isinstance(M.BR, dict) else json.loads(M.BR)
            raw = M.build_betr(conn)
        else:
            M.PR = M.SL.pricing(conn)
            raw = M.build_sleeper_fliff(conn)
        T = M.pp_tables(conn)
        for s in [x for x in ("2024-25", "2025-26", REAL) if raw.get(x)]:
            Ts = T[s] if s in T else T["all"]
            M.FIT = M.fit_from(raw, [x for x in raw if x != s and raw[x]]) if FC in ("sleeper", "fliff") else None
            dd = []
            for d, legs in raw[s]:
                df = M.score_day(legs, Ts)
                if len(df):
                    df = df.copy(); df["rand"] = np.random.RandomState(d.toordinal()).rand(len(df)); dd.append((d, df))
            days[s] = dd
    conn.close()
    log(f"{FC}: slates per season " + ", ".join(f"{s} {len(v)}" for s, v in days.items()))
    hdr = "season  slips  /day  win%   ROI%  profit(u)  maxDD(u)  underwater(slates)  loseStreak(slates)  worstDay(u)  profitDays%"
    for c in CANDS:
        log(f"\n=== {c[0]}")
        log("  " + hdr)
        pooled = collections.OrderedDict()
        for s in days:
            per = one(days[s], c)
            m = metrics(per, len(days[s]))
            if s != REAL:
                for d, v in per.items():
                    pooled[(s, d)] = v
            if not m:
                log(f"  {s}   no slips"); continue
            log(f"  {s}  {m['n']:5d}  {m['per_day']:4.2f}  {100*m['win']:4.1f}  {100*m['roi']:+6.1f}  {m['profit']:+9.1f}  {m['dd']:8.1f}  {m['under']:17d}  {m['streak']:17d}  {m['worst']:+10.1f}  {100*m['posdays']:6.1f}")
        mp = metrics(pooled, sum(len(days[s]) for s in days if s != REAL))
        if mp:
            log(f"  pooled history  {mp['n']:5d}  {mp['per_day']:4.2f}  {100*mp['win']:4.1f}  {100*mp['roi']:+6.1f}  {mp['profit']:+9.1f}  {mp['dd']:8.1f}  {mp['under']:17d}  {mp['streak']:17d}  {mp['worst']:+10.1f}  {100*mp['posdays']:6.1f}")


if __name__ == "__main__":
    main()
