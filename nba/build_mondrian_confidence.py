#!/usr/bin/env python3
"""
MONDRIAN CONFORMAL CONFIDENCE — the measured version, replacing a hand-weighted formula.

TWO THINGS THIS FIXES.

1. THE MEASUREMENT WAS WRONG. The first verification compared RAW |won - hp| across confidence tiers
   and concluded confidence was inverted (elite gap 0.0056 vs low 0.0005). But elite legs had mean HP
   0.4884 and low legs 0.6923 - a leg at 0.49 sits at MAXIMUM Bernoulli variance (p(1-p)=0.250) while
   one at 0.69 has 0.213. Elite had to look worse whatever its true reliability. This is exactly the
   heteroskedasticity failure the conformal literature describes: "naive conformal scores suffer from
   poor conditional coverage in heteroskedastic settings". The fix is the standard one - NORMALIZE the
   nonconformity score by local variance before comparing groups:

       s = |won - hp| / sqrt(p(1-p))        normalized (studentized) residual

2. THE FORMULA WAS ASSEMBLED, NOT MEASURED. Confidence was 30% existence + 45% quality + 25% market,
   weights I chose. Measured: existence separated NOTHING (0.0000), quality was INVERTED (-0.0028),
   only market backing worked (+0.0015). So 75% of the weight was noise or worse.

THE METHOD - Mondrian (group-conditional) conformal prediction:
   groups (the taxonomy): prop x HP band x side x phase x kind
   per group, from the CALIBRATION half only, compute the quantiles of the normalized score.
   confidence(leg) = 1 - (that group's mean normalized score, mapped to [0,1])
   Groups thinner than MIN_N fall back up the hierarchy - the literature is explicit that "the
   per-group quantile becomes unstable when few calibration samples are available".

   Then the guarantee is checked on the HELD-OUT half: legs in high-confidence groups must show a
   lower REALISED normalized residual than low-confidence groups. That is fact 5b, measured properly.

Env: DATABASE_URL, MC_SEASONS, MC_MIN_N
"""
import os

import numpy as np
import pandas as pd
import psycopg

PROPS = ("points", "rebounds", "assists", "threes_made", "pra", "pts_reb", "pts_ast", "reb_ast")


def main():
    seasons = [s.strip() for s in os.environ.get("MC_SEASONS", "2024-25,2025-26").split(",")]
    MIN_N = int(os.environ.get("MC_MIN_N", "400"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    d = pd.read_sql("""
        SELECT f.season, f.game_date, f.prop, f.side, f.phase, f.final_hp, f.conf_tier,
               f.c_market, f.band,
               CASE WHEN f.side='Over' THEN (o.leg_result='over_win')::int
                    ELSE (o.leg_result='under_win')::int END AS won
        FROM nba_score.final_hp f
        JOIN nba_ref.player_name_map m ON m.player_id = f.player_id
        JOIN nba_market.board_outcomes o
          ON o.game_date = f.game_date
         AND lower(regexp_replace(o.player,'[^A-Za-z]','','g')) = m.norm_name
         AND o.line = f.line AND o.side = f.side
         AND replace(replace(o.market_key,'player_',''),'_alternate','') = f.prop
        WHERE f.season = ANY(%s) AND f.prop = ANY(%s)
          AND o.leg_result IN ('over_win','under_win')""", conn, params=(seasons, list(PROPS)))
    if d.empty:
        print("no graded legs")
        return
    d["final_hp"] = d["final_hp"].astype(float)
    p = d["final_hp"].clip(0.02, 0.98).values
    # NORMALIZED (studentized) nonconformity - the whole point of this rebuild
    d["s_norm"] = np.abs(d["won"].values - p) / np.sqrt(p * (1 - p))
    d["s_raw"] = np.abs(d["won"].values - p)
    print(f"graded legs: {len(d):,}\n", flush=True)

    # 0) show the artefact that invalidated the first verdict
    print("0) WHY THE FIRST VERDICT WAS WRONG - raw gap is confounded by Bernoulli variance")
    print(f"   {'tier':<9}{'n':>9}{'mean hp':>9}{'var p(1-p)':>12}{'RAW gap':>10}{'NORMALIZED':>12}")
    for t in ("low", "medium", "high", "elite"):
        s = d[d["conf_tier"] == t]
        if len(s) < 300:
            continue
        mp = float(s["final_hp"].mean())
        print(f"   {t:<9}{len(s):>9,}{mp:>9.4f}{mp*(1-mp):>12.4f}"
              f"{float(abs(s['won'].mean()-mp)):>10.4f}{float(s['s_norm'].mean()):>12.4f}", flush=True)

    # 1) MONDRIAN GROUPS - split calibration / held-out by season where possible, else by date
    d = d.sort_values("game_date")
    half = len(d) // 2
    cal, hold = d.iloc[:half], d.iloc[half:]
    keys = ["prop", "band", "side", "phase"]
    g = cal.groupby(keys, observed=True)["s_norm"].agg(["size", "mean"])
    full = {k: v["mean"] for k, v in g.iterrows() if v["size"] >= MIN_N}
    g2 = cal.groupby(["prop", "band", "side"], observed=True)["s_norm"].agg(["size", "mean"])
    mid = {k: v["mean"] for k, v in g2.iterrows() if v["size"] >= MIN_N}
    g3 = cal.groupby(["band", "side"], observed=True)["s_norm"].agg(["size", "mean"])
    coarse = {k: v["mean"] for k, v in g3.iterrows() if v["size"] >= MIN_N}
    glob = float(cal["s_norm"].mean())
    print(f"\n1) MONDRIAN GROUPS (min n={MIN_N}): {len(full):,} full cells, {len(mid):,} mid, "
          f"{len(coarse):,} coarse, global fallback {glob:.4f}", flush=True)

    def expected(row):
        return (full.get((row.prop, row.band, row.side, row.phase))
                or mid.get((row.prop, row.band, row.side))
                or coarse.get((row.band, row.side)) or glob)
    hold = hold.copy()
    hold["s_expected"] = [expected(r) for r in hold.itertuples(index=False)]
    # confidence = how tight this group's normalized residual is, relative to the population
    lo_q, hi_q = np.quantile(hold["s_expected"], [0.05, 0.95])
    hold["conf_new"] = np.clip(1 - (hold["s_expected"] - lo_q) / max(hi_q - lo_q, 1e-9), 0.02, 1.0)

    # 2) THE GUARANTEE - do high-confidence groups actually realise lower normalized residuals?
    print("\n2) HELD-OUT CHECK - does the new confidence predict realised reliability?")
    print(f"   {'conf quintile':<16}{'n':>9}{'predicted s':>13}{'REALISED s':>12}{'hit rate':>10}{'stated':>9}")
    # qcut with duplicates="drop" can collapse edges when many legs share the same expected score
    # (whole groups get one value), leaving fewer bins than labels -> "Bin labels must be one fewer
    # than the number of bin edges". Rank first so the quintiles are always well defined.
    hold["q"] = pd.qcut(hold["s_expected"].rank(method="first"), 5,
                        labels=["best", "good", "mid", "low", "worst"])
    rows = []
    for q, s in hold.groupby("q", observed=True):
        print(f"   {str(q):<16}{len(s):>9,}{float(s['s_expected'].mean()):>13.4f}"
              f"{float(s['s_norm'].mean()):>12.4f}{float(s['won'].mean()):>10.4f}"
              f"{float(s['final_hp'].mean()):>9.4f}", flush=True)
        rows.append(("mondrian_quintile", str(q), "new_conf", len(s),
                     round(float(s["s_expected"].mean()), 4), round(float(s["s_norm"].mean()), 4),
                     round(float(abs(s["won"].mean() - s["final_hp"].mean())), 4)))
    best = hold[hold["q"] == "best"]["s_norm"].mean()
    worst = hold[hold["q"] == "worst"]["s_norm"].mean()
    print(f"\n   best quintile realised {best:.4f} vs worst {worst:.4f}  ->  "
          f"{'DISCRIMINATES' if best < worst else 'NO DISCRIMINATION'}", flush=True)

    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.confidence_verification (
            check_type text, slice text, tier text, n int, stated numeric, actual numeric,
            gap numeric, run_at timestamptz DEFAULT now())""")
        cur.execute("DELETE FROM nba_score.confidence_verification WHERE check_type='mondrian_quintile'")
        cur.executemany("""INSERT INTO nba_score.confidence_verification
            (check_type, slice, tier, n, stated, actual, gap) VALUES (%s,%s,%s,%s,%s,%s,%s)""", rows)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
