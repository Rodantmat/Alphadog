#!/usr/bin/env python3
"""
FLAT-$1 DAILY TOP-6 STUDY (owner 2026-11-12 14:20 PT). READ-ONLY. STUDY_APP = pp | ud | sleeper | fliff | betr.
Every slate day: ONE slip of the app's top 6 REGULAR legs (main line / standard / no goblin-demon / no alt rung) by the ROI-aware score
(score_roi, the board score; score_cert shown beside it), one player and one game per slip, flat $1, never increased.
A day that cannot fill 6 shrinks to 5/4/3/2 picks (fewer than 2 = no slip). Variant "roi>0": only legs with positive implied ROI qualify
(so thin days shrink); variant "any": the top 6 regular legs whatever their ROI. Structures: each app's own (Power + Flex, Max + Flex, Perfect + Dynamic).
History legs are scored with the PrizePicks back-data calibration of the OTHER season (no leakage); Sleeper / Fliff 2024-26 prices are modelled
(real 2026-27 only), Betr is its real board.
"""
import os, sys, math, collections
import numpy as np, pandas as pd, psycopg

APP = (os.environ.get("STUDY_APP") or "pp").lower()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if APP in ("pp", "ud"):
    os.environ["APP"] = APP
    import research_roi_slip_sweep as M
else:
    os.environ["SW_APP"] = APP
    import research_roi_slip_sweep_apps as M


def log(m):
    print(m, flush=True)


def picks(df, key, roi_pos, kindset, kindcol="kind"):
    d = df[df[kindcol].isin(kindset)]
    if roi_pos:
        d = d[d["roi"] > 0]
    d = d.sort_values(key, ascending=False)
    out, pl, ev = [], set(), set()
    for r in d.itertuples(index=False):
        e = getattr(r, "event_id", None)
        if r.player in pl or (e is not None and e == e and e in ev):
            continue
        out.append(r); pl.add(r.player)
        if e is not None and e == e:
            ev.add(e)
        if len(out) == 6:
            break
    return out


def tup(r):
    if APP in ("pp", "ud"):
        return (r.player, getattr(r, "event_id", None), r.hit, r.factor)
    return (r.player, r.event_id, r.hit, r.m, r.side)


def run(days, key, roi_pos, kindset, mode):
    rows = []
    for d, g in days:
        pk = picks(g, key, roi_pos, kindset)
        k = len(pk)
        if k < 2:
            continue
        m = mode
        if mode == "flex" and k < 3:
            m = "power" if APP in ("pp", "ud") else "max"
        slip = [tup(r) for r in pk]
        if any(l[2] is None or l[2] != l[2] for l in slip):
            continue
        p = M.pay(slip, m)
        rows.append((d, k, p - 1.0, 1 if p > 0 else 0))
    return rows


def summarize(rows, ndays):
    if not rows:
        return None
    ds = [r[2] for r in rows]; cum = np.cumsum(ds); pk = np.maximum.accumulate(np.concatenate([[0], cum]))[1:]
    ls = best = 0
    for r in rows:
        ls = ls + 1 if r[3] == 0 else 0; best = max(best, ls)
    sizes = collections.Counter(r[1] for r in rows)
    return dict(slates=ndays, slips=len(rows), staked=len(rows), profit=round(float(sum(ds)), 2), roi=round(float(sum(ds)) / len(rows), 3),
                win=round(sum(r[3] for r in rows) / len(rows), 3), max_dd=round(float((pk - cum).max()), 2), worst_losing_streak=best,
                best_day=round(max(ds), 2), sizes=dict(sorted(sizes.items(), reverse=True)))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    seasons_days = {}
    if APP in ("pp", "ud"):
        if APP == "pp":
            M.SE.flex_alt_tiers(); M.SE.payout_v3_rules()
        df = M.load(conn); conn.close()
        for s in sorted(df["season"].unique()):
            T = M.build_tables(df[df["season"] != s]); te = M.score_season(df[df["season"] == s].copy().reset_index(drop=True), T)
            seasons_days[s] = [(d, g) for d, g in te.groupby("game_date")]
        kindset = {"standard"}; modes = ("power", "flex")
    else:
        if APP == "betr":
            M.BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
            M.BR = M.BR if isinstance(M.BR, dict) else __import__("json").loads(M.BR)
        else:
            M.PR = M.SL.pricing(conn)
        T = M.pp_tables(conn)
        raw = M.build_betr(conn) if APP == "betr" else M.build_sleeper_fliff(conn)
        conn.close()
        for s in ("2024-25", "2025-26", M.REAL):
            if not raw.get(s):
                continue
            Ts = T[s] if s in T else T["all"]
            dd = []
            for d, legs in raw[s]:
                df = M.score_day(legs, Ts)
                if len(df):
                    df = df.copy(); df["rand"] = 0.0; dd.append((d, df))
            seasons_days[s] = dd
        kindset = {"main"}
        modes = ("perfect", "dynamic") if APP == "betr" else (("max", "flex") if APP == "sleeper" else ("max",))
    out = []
    for key in ("score_roi", "score_cert"):
        for roi_pos in (True, False):
            for mode in modes:
                tot = []
                for s, days in seasons_days.items():
                    rows = run(days, key, roi_pos, kindset, mode); tot += rows
                    st = summarize(rows, len(days))
                    if st:
                        out.append(dict(app=APP, season=s, key=key, roi_filter="roi>0" if roi_pos else "any", mode=mode, **st))
                st = summarize(tot, sum(len(v) for v in seasons_days.values()))
                if st:
                    out.append(dict(app=APP, season="ALL", key=key, roi_filter="roi>0" if roi_pos else "any", mode=mode, **st))
    R = pd.DataFrame(out)
    pd.set_option("display.width", 300); pd.set_option("display.max_rows", 500); pd.set_option("display.max_columns", 40); pd.set_option("display.max_colwidth", 80)
    log(f"\n##### FLAT $1 DAILY TOP-6 (shrinks to 5/4/3/2) - {APP}")
    log(R.to_string(index=False))
    R.to_csv(f"/tmp/flat_top6_{APP}.csv", index=False)


if __name__ == "__main__":
    main()
