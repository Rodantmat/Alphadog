#!/usr/bin/env python3
"""
PRIZEPICKS GOBLIN / DEMON PRICE FOR EVERY BACK LEG - THE MECHANISM (owner 2026-11-22 09:20 PT: "the pp legs that are goblins and demons should
be priced with the multipliers we know ... Get shit done").

Mechanism (research_ppmult_gbm.py): PrizePicks' chance q of the leg's side follows the sportsbooks' price of that line; the leg's 6-pick
value is y = C / q (C = 37.5 / 2.0728); its 2-pick payout is snap(g_2(y)); factor = P2 / 3; m = sqrt(3) x factor (as the leg card).
Here the books' de-vigged chance of the leg's side (leg_card_v2.p_market, the same read the hit rate uses) -> q through
logit q = a + b x logit p_market (+ side term), fitted on the 2026-27 legs that carry PrizePicks' OWN quote (price_source = 'pp_quote').

Validation angles (all printed): (1) walk-forward by week - fitted only on earlier dates; (2) leave-one-player-out (group folds by player);
(3) by kind x side and by chance band; (4) ROI: on the legs with a real quote, realized ROI with the mechanism's m vs with the real m.
Result columns (LPM_WRITE=1, clearly labelled, never written into m): m_mech, roi_mech (hit_rate x m_mech - 1), realized_mech.
Env: DATABASE_URL, LPM_WRITE.
"""
import io
import os

import numpy as np
import pandas as pd
import psycopg

LAW = {"hi": [-2.9367, 1.281669, -0.043245], "lo": [-2.732025, 1.176992, -0.029711]}
C = 37.5 / 2.0728
S3 = 3 ** 0.5


def stp(v):
    return np.where(v < 3, 0.1, np.where(v < 10, 0.25, np.where(v < 50, 0.5, np.where(v < 200, 1.0, 5.0))))


def snap(v):
    s = stp(v)
    return np.round(np.round(v / s) * s, 4)


def p2_of_y(y):
    y = np.asarray(y, float); ly = np.log(y)
    a = np.where(y >= 37.5, LAW["hi"][0], LAW["lo"][0]); b = np.where(y >= 37.5, LAW["hi"][1], LAW["lo"][1]); c = np.where(y >= 37.5, LAW["hi"][2], LAW["lo"][2])
    return snap(np.exp(a + b * ly + c * ly * ly))


def lg(p):
    p = np.clip(np.asarray(p, float), 1e-5, 1 - 1e-5)
    return np.log(p / (1 - p))


def sg(z):
    return 1 / (1 + np.exp(-z))


# inverse table: y grid -> P2, to read the real quote's y (midpoint of the y-range that gives the real P2)
YG = np.exp(np.linspace(np.log(3), np.log(3000), 300000)); PG = p2_of_y(YG)


def y_of_p2(P):
    out = np.full(len(P), np.nan)
    for v in np.unique(P):
        i = np.where(np.isclose(PG, v))[0]
        if len(i):
            out[P == v] = np.sqrt(YG[i[0]] * YG[i[-1]])
    return out


def fit(z, zq, side):
    X = np.column_stack([np.ones(len(z)), z, (side == "Under").astype(float)])
    return np.linalg.lstsq(X, zq, rcond=None)[0]


def pred_p2(co, z, side):
    zq = co[0] + co[1] * z + co[2] * (side == "Under")
    return p2_of_y(C / sg(zq))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT ctid::text rid, season, game_date, player_id, prop, line::float8 line, side, kind, p_market::float8 pm, hit_rate::float8 h,
                              result, price_source, leg_mult::float8 f
                       FROM nba_score.leg_card_v2 WHERE app = 'prizepicks' AND kind <> 'standard'""", conn)
    print(f"LPM|PrizePicks non-standard legs {len(d):,} | with a books read {d.pm.notna().sum():,}", flush=True)
    t = d[(d.price_source == "pp_quote") & d.pm.notna() & d.f.notna()].copy()
    t["P2"] = np.round(3 * t.f, 4); t["yq"] = y_of_p2(t.P2.values); t = t[t.yq.notna()]
    t["zq"] = lg(C / t.yq); t["z"] = lg(t.pm); t["wk"] = pd.to_datetime(t.game_date).dt.to_period("W").astype(str)
    print(f"LPM|legs with PrizePicks' own quote and a books read: {len(t):,} ({t.game_date.min()} .. {t.game_date.max()})", flush=True)
    co = fit(t.z.values, t.zq.values, t.side.values)
    print(f"LPM|fit on all: logit q = {co[0]:+.4f} + {co[1]:.4f} x logit p_books {co[2]:+.4f} x Under", flush=True)

    def score(lab, tt, P):
        ex = np.mean(P == tt.P2.values); s1 = np.mean(np.abs(P - tt.P2.values) <= stp(tt.P2.values) + 1e-9)
        e = np.log(P / tt.P2.values)
        print(f"LPM|  {lab}: {len(tt):,} legs | 2-pick payout exact {100*ex:.1f}% | within one step {100*s1:.1f}% | median |error| {100*np.median(np.abs(e)):.2f}% "
              f"| mean signed {100*np.mean(e):+.2f}%", flush=True)
    # angle 1: walk-forward by week
    wf = np.full(len(t), np.nan); wks = sorted(t.wk.unique())
    for w in wks[1:]:
        tr = t.wk < w; te = (t.wk == w).values
        if tr.sum() < 300:
            continue
        c_ = fit(t.z.values[tr], t.zq.values[tr], t.side.values[tr]); wf[te] = pred_p2(c_, t.z.values[te], t.side.values[te])
    m_ = ~np.isnan(wf); score("walk-forward by week (fitted on earlier weeks only)", t[m_], wf[m_])
    # angle 2: leave players out
    pl = t.player_id.astype(str).values; up = np.unique(pl); rng = np.random.default_rng(7); fo = dict(zip(up, rng.integers(0, 5, len(up))))
    gf = np.array([fo[p] for p in pl]); lp = np.zeros(len(t))
    for k in range(5):
        c_ = fit(t.z.values[gf != k], t.zq.values[gf != k], t.side.values[gf != k]); lp[gf == k] = pred_p2(c_, t.z.values[gf == k], t.side.values[gf == k])
    score("players never seen (5 folds by player)", t, lp)
    # angle 3: by kind x side, by chance band
    for (k, s), g in t.assign(P=lp).groupby(["kind", "side"]):
        score(f"   {k} {s}", g, g.P.values)
    t["band"] = pd.cut(t.pm, [0, .2, .35, .5, .65, .8, 1])
    for b, g in t.assign(P=lp).groupby("band", observed=True):
        score(f"   books' chance {b}", g, g.P.values)
    # angle 4: ROI with the mechanism's m vs the real m (legs with a real quote, graded)
    g = t.assign(P=lp)[t.result.isin(["won", "lost"])]
    won = (g.result == "won").values
    r_real = np.where(won, S3 * g.P2.values / 3 - 1, -1); r_mech = np.where(won, S3 * g.P.values / 3 - 1, -1)
    print(f"LPM|  realized ROI on {len(g):,} graded quoted legs: real price {100*r_real.mean():+.2f}% | mechanism price {100*r_mech.mean():+.2f}%", flush=True)
    for (k, s), gg in g.assign(rr=r_real, rm=r_mech).groupby(["kind", "side"]):
        print(f"LPM|     {k} {s}: {len(gg):,} | real {100*gg.rr.mean():+.2f}% | mechanism {100*gg.rm.mean():+.2f}%", flush=True)

    # apply to every non-standard PrizePicks leg with a books read
    a = d[d.pm.notna()].copy()
    a["P2m"] = pred_p2(co, lg(a.pm.values), a.side.values); a["m_mech"] = S3 * a.P2m / 3
    a["roi_mech"] = a.h * a.m_mech - 1
    a["realized_mech"] = np.where(a.result == "won", a.m_mech - 1, np.where(a.result == "lost", -1.0, np.nan))
    print("LPM|================ BACK LEGS PRICED BY THE MECHANISM (2-pick-equivalent leg ROI, m = sqrt(3) x P2 / 3) ================", flush=True)
    for (s, k, sd), g in a.groupby(["season", "kind", "side"]):
        gr = g[g.realized_mech.notna()]
        if not len(gr):
            continue
        bands = pd.cut(gr.roi_mech, [-1, -.2, -.1, -.05, 0, .03, .06, .1, .2, 10])
        bb = " ".join(f"{100*x.roi_mech.mean():+.0f}->{100*x.realized_mech.mean():+.1f}({len(x)})" for _, x in gr.groupby(bands, observed=True))
        print(f"LPM|  {s} {k:9s} {sd:5s}: {len(g):,} priced, {len(gr):,} graded | predicted {100*gr.roi_mech.mean():+.1f}% realized {100*gr.realized_mech.mean():+.1f}% | {bb}", flush=True)
    if os.environ.get("LPM_WRITE") == "1":
        for c in ("m_mech", "roi_mech", "realized_mech"):
            conn.execute(f"ALTER TABLE nba_score.leg_card_v2 ADD COLUMN IF NOT EXISTS {c} float8")
        conn.execute("UPDATE nba_score.leg_card_v2 SET m_mech = NULL, roi_mech = NULL, realized_mech = NULL WHERE m_mech IS NOT NULL")
        conn.execute("CREATE TEMP TABLE mm (rid text, m float8, r float8, z float8)")
        buf = io.StringIO(); a[["rid", "m_mech", "roi_mech", "realized_mech"]].to_csv(buf, index=False, header=False, na_rep=""); buf.seek(0)
        with conn.cursor().copy("COPY mm FROM STDIN WITH (FORMAT csv)") as cp:
            cp.write(buf.read())
        n = conn.execute("""UPDATE nba_score.leg_card_v2 l SET m_mech = mm.m, roi_mech = mm.r, realized_mech = mm.z FROM mm WHERE l.ctid = mm.rid::tid""").rowcount
        conn.execute("COMMENT ON COLUMN nba_score.leg_card_v2.m_mech IS 'ESTIMATE: PrizePicks goblin/demon leg value from the books via the mechanism (research_pp_mech_price.py); m holds real prices only'")
        print(f"LPM|written m_mech / roi_mech / realized_mech on {n:,} legs", flush=True)
    print("LPM|DONE", flush=True)


if __name__ == "__main__":
    main()
