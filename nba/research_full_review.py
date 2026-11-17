#!/usr/bin/env python3
"""
FULL REVIEW (owner 2026-11-16 21:04 PT, after the worst day of the season: "revise, debug, backtest, simulate ... adjustments, cuts, subs ... different tops,
different hit rates, all variations, trailing techniques, run the full prop line study again for all apps"). READ-ONLY. RV_APP = pp | ud | sleeper | fliff | betr
(apps are never mixed). Same boards / scores / payout laws as research_roi_final_candidates (2024-25, 2025-26 history - Sleeper / Fliff prices modelled there -
and 2026-27 = REAL boards, graded slates before today).
  S1  PROP-LINE MATRIX: every usable line kind x prop x side: legs, hit rate, mean multiplier, single-leg return, per season; this season split first half / second half.
  S2  CALIBRATION + TOPS: hit by hit-probability band x side; hit of the day's top 3/5/10/15/20/30 by every rank key (and the as-of trailing keys).
  S3  TRAILING (as-of, earlier slates only): a cell's (prop x side, regular lines) trailing 7 / 14 / 30-slate and season-to-date hit rate vs what the cell does next.
  S4  SWEEP: filter (none | static weak-cell cut | trailing floors | player trailing | side | defensive props) x rank key (incl. trailing blends) x pool top N x
      picks 2-6 x the app's structures: ROI per $1 slip on each season, drawdown, a random-order control.
  S5  the app's current candidate strategies, base vs each filter.
"""
import os, sys, math, collections, datetime as dt
import numpy as np, pandas as pd, psycopg

APP = (os.environ.get("RV_APP") or "pp").lower()
os.environ["FC_APP"] = APP
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_roi_final_candidates as F   # noqa: E402

M, AF, REAL = F.M, F.AF, F.REAL
MULT = "factor" if APP in ("pp", "ud") else "m"
STDK = {"pp": "std", "ud": "std", "sleeper": "main", "fliff": "main", "betr": "all"}[APP]
MODES = {"pp": ["power", "flex"], "ud": ["power", "flex"], "sleeper": ["max", "flex"], "fliff": ["max"], "betr": ["perfect", "dynamic"]}[APP]
WEAK = {("threes_made", False), ("assists", False), ("turnovers", False), ("turnovers", True)}   # from this season's real-money ledger = IN-SAMPLE for 2026-27


def log(m):
    print(m, flush=True)


def build_days():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    days = {}
    if APP in ("pp", "ud"):
        if APP == "pp":
            M.SE.flex_alt_tiers(); M.SE.payout_v3_rules()
        hist = M.load(conn)
        T_all = M.build_tables(hist)
        for s in sorted(hist["season"].unique()):
            te = M.score_season(hist[hist["season"] == s].copy().reset_index(drop=True), M.build_tables(hist[hist["season"] != s]))
            days[s] = [(d, g.copy()) for d, g in te.groupby("game_date")]
        r = F.real_pp(conn) if APP == "pp" else F.real_ud(conn)
        r["conf"] = float(hist["conf"].median()) if "conf" in hist else .5
        r["over"] = r["side"].str.lower().str[0].isin(["o", "m", "h"])
        r = r[r["hit"].notna()].copy(); r["hit"] = r["hit"].astype(int)
        te = M.score_season(r.reset_index(drop=True), T_all)
        days[REAL] = [(d, g.copy()) for d, g in te.groupby("game_date")]
    else:
        if APP == "betr":
            import json
            F.patch_betr()
            M.BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
            M.BR = M.BR if isinstance(M.BR, dict) else json.loads(M.BR)
            raw = M.build_betr(conn)
        else:
            M.PR = M.SL.pricing(conn)
            raw = M.build_sleeper_fliff(conn)
        conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        T = M.pp_tables(conn)
        for s in [x for x in ("2024-25", "2025-26", REAL) if raw.get(x)]:
            Ts = T[s] if s in T else T["all"]
            M.FIT = M.fit_from(raw, [x for x in raw if x != s and raw[x]]) if APP in ("sleeper", "fliff") else None
            dd = []
            for d, legs in raw[s]:
                df = M.score_day(legs, Ts)
                if len(df):
                    df = df.copy(); df["rand"] = np.random.RandomState(d.toordinal()).rand(len(df)); dd.append((d, df))
            days[s] = dd
    conn.close()
    return days


def is_std(df):
    return df["kind"].isin({"standard", "main"}) if APP != "betr" else pd.Series(True, index=df.index)


def add_trailing(days):
    """as-of features from EARLIER slates of the same season only: cell = (prop, over) on regular lines; player = (player, prop, over)"""
    K = 30.0
    for s, dd in days.items():
        hist = collections.defaultdict(list)          # cell -> [(n, h)] one entry per earlier slate
        ph = collections.defaultdict(list)            # (player, prop, over) -> earlier hits (one per slate)
        allh = []                                     # [(n, h)] all regular legs per earlier slate
        for d, df in sorted(dd, key=lambda x: x[0]):
            df["hit"] = pd.to_numeric(df["hit"], errors="coerce")
            std = is_std(df)
            cells = list(zip(df["prop"].values, df["over"].values))
            def base(w):
                a = allh[-w:] if w else allh
                n = sum(x[0] for x in a); h = sum(x[1] for x in a)
                return (h / n) if n else .5
            for name, w in (("tr7", 7), ("tr14", 14), ("tr30", 30), ("trS", 0)):
                p0 = base(w); out = np.empty(len(df))
                cache = {}
                for i, c in enumerate(cells):
                    v = cache.get(c)
                    if v is None:
                        a = hist[c][-w:] if w else hist[c]
                        n = sum(x[0] for x in a); h = sum(x[1] for x in a)
                        v = cache[c] = (h + K * p0) / (n + K)
                    out[i] = v
                df[name] = out
            pt = np.empty(len(df))
            for i, (pl, pr, ov) in enumerate(zip(df["player"].values, df["prop"].values, df["over"].values)):
                a = ph[(pl, pr, ov)][-10:]
                pt[i] = (sum(a) + 3 * .5) / (len(a) + 3)
            df["ptr"] = pt
            df["sr_tr"] = df["score_roi"] + 100.0 * (df["tr14"] - .55)
            df["hp_tr"] = df["hp"] + (df["tr14"] - .55)
            df["hp_ptr"] = df["hp"] + .5 * (df["ptr"] - .5)
            df["weak"] = [c in WEAK for c in cells]
            g = df[std]
            n_all = 0; h_all = 0
            for c, sub in g.groupby(["prop", "over"]):
                nn = int(sub["hit"].notna().sum()); hh = int(sub["hit"].sum())
                hist[c].append((nn, hh)); n_all += nn; h_all += hh
            allh.append((n_all, h_all))
            seen = set()
            for pl, pr, ov, h in zip(g["player"].values, g["prop"].values, g["over"].values, g["hit"].values):
                if h == h and (pl, pr, ov) not in seen:
                    seen.add((pl, pr, ov)); ph[(pl, pr, ov)].append(int(h))


def cat(dd):
    return pd.concat([df.assign(game_date=d) if "game_date" not in df else df for d, df in dd], ignore_index=True) if dd else pd.DataFrame()


# ---------------------------------------------------------------- S1
def s1(days):
    log("\n##### S1 PROP-LINE MATRIX (hit = box score; ret = mean(hit x multiplier) - 1 where a leg has its own price; kinds as the app names them)")
    allc = {s: cat(dd) for s, dd in days.items()}
    for s, df in allc.items():
        if df.empty:
            continue
        log(f"S1|{s}|legs {len(df)}|slates {df['game_date'].nunique()}|by kind: " + " ".join(f"{k} n={len(g)} hit={g['hit'].mean():.3f}" for k, g in df.groupby("kind")))
    seasons = list(allc)
    keys = collections.OrderedDict()
    for s, df in allc.items():
        for (k, p, ov), g in df.groupby(["kind", "prop", "over"]):
            keys.setdefault((k, p, ov), {})[s] = g
    log("S1|cols: kind|prop|side|" + "|".join(f"{s} n hit mult ret" for s in seasons) + f"|{REAL} first half n hit|second half n hit|last 7 slates n hit")
    rd = sorted(allc[REAL]["game_date"].unique()) if REAL in allc and len(allc[REAL]) else []
    mid = rd[len(rd) // 2] if rd else None; l7 = rd[-7] if len(rd) >= 7 else (rd[0] if rd else None)
    for (k, p, ov), per in sorted(keys.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])):
        if sum(len(g) for g in per.values()) < 60:
            continue
        cells = []
        for s in seasons:
            g = per.get(s)
            if g is None or not len(g):
                cells.append("0 - - -"); continue
            cells.append(f"{len(g)} {g['hit'].mean():.3f} {g[MULT].mean():.2f} {(g['hit'] * g[MULT]).mean() - 1:+.3f}")
        g = per.get(REAL); ex = "-|-|-"
        if g is not None and len(g) and mid is not None:
            a = g[g["game_date"] < mid]; b = g[g["game_date"] >= mid]; c = g[g["game_date"] >= l7]
            ex = "|".join(f"{len(x)} {x['hit'].mean():.3f}" if len(x) else "0 -" for x in (a, b, c))
        log(f"S1|{k}|{p}|{'Over' if ov else 'Under'}|" + "|".join(cells) + "|" + ex)


# ---------------------------------------------------------------- S2
def s2(days):
    log("\n##### S2 CALIBRATION (regular lines) and TOPS (hit of the day's top N legs by each rank key, regular lines)")
    bands = [(0, .45), (.45, .5), (.5, .55), (.55, .6), (.6, .65), (.65, .7), (.7, .75), (.75, 1.01)]
    for s, dd in days.items():
        df = cat(dd)
        if df.empty:
            continue
        df = df[is_std(df)]
        for ov in (True, False):
            g = df[df["over"] == ov]
            log(f"S2|cal|{s}|{'Over' if ov else 'Under'}|" + " ".join(f"[{lo:.2f}-{hi:.2f}) n={int(((g['hp'] >= lo) & (g['hp'] < hi)).sum())} hit={g[(g['hp'] >= lo) & (g['hp'] < hi)]['hit'].mean():.3f}" for lo, hi in bands if ((g['hp'] >= lo) & (g['hp'] < hi)).sum() >= 20))
    KEYS = ["score_cert", "score_roi", "roi", "hp", "tr14", "tr30", "trS", "ptr", "sr_tr", "hp_tr", "hp_ptr", "rand"]
    for s, dd in days.items():
        for key in KEYS:
            res = []
            for N in (3, 5, 10, 15, 20, 30):
                h = n = 0
                for d, df in dd:
                    g = df[is_std(df)].sort_values(key, ascending=False).drop_duplicates("player").head(N)
                    h += int(g["hit"].sum()); n += int(g["hit"].notna().sum())
                res.append(f"top{N} {h / max(1, n):.3f} (n={n})")
            log(f"S2|tops|{s}|{key}|" + " ".join(res))
        for side, ov in (("Over", True), ("Under", False)):
            for key in ("score_roi", "hp", "sr_tr"):
                res = []
                for N in (5, 10, 20):
                    h = n = 0
                    for d, df in dd:
                        g = df[is_std(df) & (df["over"] == ov)].sort_values(key, ascending=False).drop_duplicates("player").head(N)
                        h += int(g["hit"].sum()); n += int(g["hit"].notna().sum())
                    res.append(f"top{N} {h / max(1, n):.3f} (n={n})")
                log(f"S2|tops-{side}|{s}|{key}|" + " ".join(res))


# ---------------------------------------------------------------- S3
def s3(days):
    log("\n##### S3 TRAILING: does a cell's as-of trailing hit rate predict the cell's next hit rate? (regular lines; legs bucketed by the trailing number)")
    bk = [(0, .46), (.46, .50), (.50, .54), (.54, .58), (.58, .62), (.62, 1.01)]
    for s, dd in days.items():
        df = cat(dd[5:])
        if df.empty:
            continue
        df = df[is_std(df)]
        for name in ("tr7", "tr14", "tr30", "trS", "ptr"):
            log(f"S3|{s}|{name}|" + " ".join(f"[{lo:.2f}-{hi:.2f}) n={int(((df[name] >= lo) & (df[name] < hi)).sum())} hit={df[(df[name] >= lo) & (df[name] < hi)]['hit'].mean():.3f}" for lo, hi in bk if ((df[name] >= lo) & (df[name] < hi)).sum() >= 30)
                + f" | corr {np.corrcoef(df[name], df['hit'])[0, 1]:+.3f}")
        hi = df[df["hp"] >= .58]
        if len(hi) >= 100:
            for name in ("tr14", "tr30", "ptr"):
                log(f"S3|{s}|{name} among hp>=.58|" + " ".join(f"[{lo:.2f}-{h2:.2f}) n={int(((hi[name] >= lo) & (hi[name] < h2)).sum())} hit={hi[(hi[name] >= lo) & (hi[name] < h2)]['hit'].mean():.3f}" for lo, h2 in bk if ((hi[name] >= lo) & (hi[name] < h2)).sum() >= 30))


# ---------------------------------------------------------------- S4 / S5
FILTERS = collections.OrderedDict([
    ("none", lambda d: d),
    ("cut-weak(in-sample)", lambda d: d[~d["weak"]]),
    ("tr14>=.52", lambda d: d[d["tr14"] >= .52]),
    ("tr14>=.55", lambda d: d[d["tr14"] >= .55]),
    ("tr30>=.55", lambda d: d[d["tr30"] >= .55]),
    ("trS>=.55", lambda d: d[d["trS"] >= .55]),
    ("tr30>=.58", lambda d: d[d["tr30"] >= .58]),
    ("ptr>=.60", lambda d: d[d["ptr"] >= .60]),
    ("under", lambda d: d[~d["over"]]),
    ("over", lambda d: d[d["over"]]),
    ("nodef", lambda d: d[~d["defp"]]),
    ("def-only", lambda d: d[d["defp"]]),
    ("hp>=.58", lambda d: d[d["hp"] >= .58]),
    ("hp>=.62", lambda d: d[d["hp"] >= .62]),
    ("under+tr30>=.55", lambda d: d[(~d["over"]) & (d["tr30"] >= .55)]),
])
SKEYS = ["score_cert", "score_roi", "roi", "hp", "sr_tr", "hp_tr", "hp_ptr", "trS", "rand"]
NS = (3, 5, 10, 15, 20, 30)


def play(daytops, N, k, mode):
    per = collections.OrderedDict()
    for d, legs in daytops:
        for sl in M.groups(legs, N, k):
            p = M.pay(sl, mode)
            e = per.setdefault(d, [0.0, 0, 0]); e[0] += p - 1.0; e[1] += 1; e[2] += 1 if p > 0 else 0
    return per


def s4(days):
    log("\n##### S4 SWEEP (ROI per $1 slip; h24/h25 = history seasons, real = 2026-27 real boards; dd = max drawdown in units on the real season)")
    tops = {}
    for s, dd in days.items():
        for fn, f in FILTERS.items():
            sub = [(d, f(df)) for d, df in dd]
            for key in SKEYS:
                tops[(s, fn, key)] = [(d, M.tops(g, key, STDK, "none", "both", "all")) for d, g in sub if len(g)]
    seasons = list(days); hs = [s for s in seasons if s != REAL]
    R = {}
    for mode in MODES:
        for k in (2, 3, 4, 5, 6):
            if mode in ("flex",) and k < 3:
                continue
            for fn in FILTERS:
                for key in SKEYS:
                    for N in NS:
                        if N < k:
                            continue
                        row = {}
                        for s in seasons:
                            per = play(tops[(s, fn, key)], N, k, mode)
                            m = F.metrics(per, len(days[s]))
                            row[s] = m
                        R[(mode, k, fn, key, N)] = row
    def fmt(m):
        return f"{100 * m['roi']:+6.1f}% n={m['n']:<4d}" if m else "   -   n=0   "
    for mode in MODES:
        for k in (2, 3, 4, 5, 6):
            rows = [(kk, v) for kk, v in R.items() if kk[0] == mode and kk[1] == k]
            if not rows:
                continue
            log(f"\nS4|{mode} {k}-pick| columns: filter | key | topN | " + " | ".join(hs) + f" | {REAL} (win%, dd, /day)")
            ctl = [v for kk, v in rows if kk[3] == "rand" and kk[2] == "none"]
            for s in seasons:
                xs = [v[s]["roi"] for v in ctl if v.get(s)]
                if xs:
                    log(f"S4|{mode} {k}|control random order|{s} mean ROI {100 * np.mean(xs):+.1f}%")
            def score(v):
                real = v.get(REAL)
                if not real or real["n"] < 12:
                    return None
                h = [v[s] for s in hs if v.get(s) and v[s]["n"] >= 40]
                if hs and not h and APP not in ("betr",):
                    return None
                hr = min([x["roi"] for x in h]) if h else 0.0
                return min(real["roi"], hr) if h else real["roi"]
            ranked = sorted([(score(v), kk, v) for kk, v in rows if kk[3] != "rand" and score(v) is not None], key=lambda x: -x[0])
            shown = set()
            for sc, kk, v in ranked[:8]:
                shown.add(kk)
                r = v[REAL]
                log(f"S4|{mode} {k}|BEST-BOTH|{kk[2]}|{kk[3]}|top{kk[4]}|" + " | ".join(fmt(v.get(s)) for s in hs) + f" | {fmt(r)} win {100 * r['win']:.0f}% dd {r['dd']:.1f} {r['per_day']:.2f}/day")
            byreal = sorted([(v[REAL]["roi"], kk, v) for kk, v in rows if kk[3] != "rand" and v.get(REAL) and v[REAL]["n"] >= 15], key=lambda x: -x[0])
            for sc, kk, v in byreal[:4]:
                if kk in shown:
                    continue
                r = v[REAL]
                log(f"S4|{mode} {k}|BEST-REAL|{kk[2]}|{kk[3]}|top{kk[4]}|" + " | ".join(fmt(v.get(s)) for s in hs) + f" | {fmt(r)} win {100 * r['win']:.0f}% dd {r['dd']:.1f} {r['per_day']:.2f}/day")
            for key in ("score_cert", "score_roi", "hp"):
                for N in (10, 15):
                    v = R.get((mode, k, "none", key, N))
                    if v and v.get(REAL):
                        r = v[REAL]
                        log(f"S4|{mode} {k}|BASELINE|none|{key}|top{N}|" + " | ".join(fmt(v.get(s)) for s in hs) + f" | {fmt(r)} win {100 * r['win']:.0f}% dd {r['dd']:.1f} {r['per_day']:.2f}/day")
    log("\n##### S4b FILTER EFFECT, averaged over every key / topN / picks of a structure (mean ROI% per season; cells with >= 20 slips)")
    for mode in MODES:
        for fn in FILTERS:
            out = []
            for s in seasons:
                xs = [v[s]["roi"] for kk, v in R.items() if kk[0] == mode and kk[2] == fn and kk[3] != "rand" and v.get(s) and v[s]["n"] >= 20]
                out.append(f"{s} {100 * np.mean(xs):+6.1f}% ({len(xs)} cells)" if xs else f"{s} -")
            log(f"S4b|{mode}|{fn}|" + " | ".join(out))
    log("\n##### S4c KEY EFFECT (filter none), mean ROI% per season")
    for mode in MODES:
        for key in SKEYS:
            out = []
            for s in seasons:
                xs = [v[s]["roi"] for kk, v in R.items() if kk[0] == mode and kk[2] == "none" and kk[3] == key and v.get(s) and v[s]["n"] >= 20]
                out.append(f"{s} {100 * np.mean(xs):+6.1f}% ({len(xs)})" if xs else f"{s} -")
            log(f"S4c|{mode}|{key}|" + " | ".join(out))
    log("\n##### S4d TOP-N EFFECT (filter none, keys score_cert/score_roi/hp), mean ROI% per season")
    for mode in MODES:
        for N in NS:
            out = []
            for s in seasons:
                xs = [v[s]["roi"] for kk, v in R.items() if kk[0] == mode and kk[2] == "none" and kk[3] in ("score_cert", "score_roi", "hp") and kk[4] == N and v.get(s) and v[s]["n"] >= 20]
                out.append(f"{s} {100 * np.mean(xs):+6.1f}% ({len(xs)})" if xs else f"{s} -")
            log(f"S4d|{mode}|top{N}|" + " | ".join(out))


def s5(days):
    log("\n##### S5 CURRENT CANDIDATE STRATEGIES, base vs each filter (ROI% n | per season; last = real season win%, drawdown, last-7-slate profit)")
    rd = sorted(d for d, _ in days.get(REAL, []))
    l7 = set(rd[-7:])
    for c in F.CANDS:
        label, key, kinds, roimin, side, props, N, k, mode = c
        log(f"\nS5|{label}")
        for fn, f in FILTERS.items():
            out = []; last = ""
            for s, dd in days.items():
                per = collections.OrderedDict()
                for d, df in dd:
                    g = f(df)
                    if not len(g):
                        continue
                    for sl in M.groups(M.tops(g, key, kinds, roimin, side, props), N, k):
                        p = M.pay(sl, mode)
                        e = per.setdefault(d, [0.0, 0, 0]); e[0] += p - 1.0; e[1] += 1; e[2] += 1 if p > 0 else 0
                m = F.metrics(per, len(dd))
                out.append(f"{s} {100 * m['roi']:+6.1f}% n={m['n']}" if m else f"{s} - n=0")
                if s == REAL and m:
                    last = f" | win {100 * m['win']:.0f}% dd {m['dd']:.1f} last7 {sum(v[0] for d, v in per.items() if d in l7):+.1f}u"
            log(f"S5|  {fn:<22}| " + " | ".join(out) + last)


def main():
    days = build_days()
    log(f"{APP}: slates per season " + ", ".join(f"{s} {len(v)} ({min(d for d, _ in v)}..{max(d for d, _ in v)})" for s, v in days.items() if v))
    add_trailing(days)
    for fn in (s1, s2, s3, s4, s5):
        try:
            fn(days)
        except Exception as exc:  # noqa: BLE001
            import traceback
            log(f"SECTION {fn.__name__} FAILED: {type(exc).__name__}: {exc}"); traceback.print_exc()


if __name__ == "__main__":
    main()
