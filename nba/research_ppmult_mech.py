#!/usr/bin/env python3
"""
PP MULTIPLIER MECHANISM - ONE HIDDEN PROJECTION PER LADDER. READ-ONLY. (owner 2026-11-20 17:08 PT)
Facts behind it (v2): the multiplier follows distance / sqrt(anchor) (a count-like spread), does not move within 30 min when the ladder is
unchanged (1.8%), but moves over hours with the ladder unchanged (33% after 2-6 h) - so PrizePicks prices each rung from a hidden projection
that updates during the day, the same projection for every rung of that player-stat.
Model tested: the stat ~ negative binomial(mean = mu, dispersion r_stat); a rung's chance q = P(stat > line) (More) or P(stat < line) (Less);
its multiplier f = snap( exp(a + b*logit(q) + c*logit(q)^2) ) onto PrizePicks' fixed values for that kind / side.
mu is unknown per ladder per run (one number); a, b, c and r_stat are global. Fitted by alternation (mu grid search per ladder / global least squares).
Proof test: leave-one-rung-out - each quoted rung is predicted from mu fitted on the OTHER rungs of the same ladder, same run. Exact = the
predicted value equals PrizePicks' value. If the mechanism is right this is far above the 36% of the feature model (v2).
Also: how mu relates to the regular line / switch point (so unquoted rungs can be priced from the ladder alone).
Env: DATABASE_URL, PPMF_SINCE (2026-10-20).
"""
import os

import numpy as np
import pandas as pd
import psycopg
from scipy.stats import nbinom

MUG = np.exp(np.linspace(np.log(0.05), np.log(80), 700))


def qchance(mu, r, line, over):
    p = r / (r + mu)
    cdf = nbinom.cdf(np.floor(line), r, p)          # P(X <= line) for half-point lines
    q = (1 - cdf) if over else cdf
    return np.clip(q, 1e-4, 1 - 1e-4)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    since = os.environ.get("PPMF_SINCE", "2026-10-20")
    m = pd.read_sql("""SELECT run_file, (quoted_at AT TIME ZONE 'America/Los_Angeles')::date gd, projection_id::text pid, line::float8 line, kind, lower(left(side,1)) sd,
                              factor_mined::float8 f FROM nba_market.pp_mined_leg WHERE factor_mined IS NOT NULL AND kind IN ('goblin','demon') AND quoted_at >= %s""", conn, params=(since,))
    b = pd.read_sql("SELECT run_file, projection_id::text pid, player_id::text ppid, player, stat, line::float8 line, odds FROM nba_market.pp_board_row WHERE run_file = ANY(%s)", conn, params=(list(m["run_file"].unique()),))
    conn.close()
    b = b[~b["player"].str.contains(r"\+", regex=True, na=False)]
    d = m.merge(b[["run_file", "pid", "ppid", "stat"]], on=["run_file", "pid"], how="inner")
    d = d.sort_values("f").drop_duplicates(["run_file", "pid", "sd"])
    std = b[b["odds"] == "standard"].groupby(["run_file", "ppid", "stat"])["line"].median().rename("std").reset_index()
    gs = b.groupby(["run_file", "ppid", "stat"]).apply(lambda x: pd.Series({"gmax": x.loc[x["odds"] == "goblin", "line"].max(), "dmin": x.loc[x["odds"] == "demon", "line"].min()})).reset_index()
    d = d.merge(std, on=["run_file", "ppid", "stat"], how="left").merge(gs, on=["run_file", "ppid", "stat"], how="left")
    d["anchor"] = d["std"].where(d["std"].notna(), (d["gmax"] + d["dmin"]) / 2)
    d["over"] = d["sd"] == "o"
    grid = {k: np.array(sorted(v.round(4).unique())) for k, v in d.groupby(["kind", "sd"])["f"]}
    d["lad"] = d["run_file"] + "|" + d["ppid"] + "|" + d["stat"]
    stats = sorted(d["stat"].unique())
    print(f"MECH|legs {len(d):,} | ladders {d['lad'].nunique():,} | ladders with >= 2 quoted rungs {int((d.groupby('lad').size() >= 2).sum()):,} | stats {len(stats)}", flush=True)
    r_stat = {s: 8.0 for s in stats}
    a, bb, c = 0.0, -0.6, 0.0
    L = {k: g for k, g in d.groupby("lad")}

    def best_mu(g, a, bb, c, r, exclude=None):
        rows = g if exclude is None else g.drop(index=exclude)
        if rows.empty:
            return np.nan
        err = np.zeros(len(MUG))
        for _, x in rows.iterrows():
            q = qchance(MUG, r, x["line"], x["over"])
            lq = np.log(q / (1 - q))
            err += (a + bb * lq + c * lq * lq - np.log(x["f"])) ** 2
        return MUG[int(np.argmin(err))]

    for it in range(6):
        mus = {k: best_mu(g, a, bb, c, r_stat[g["stat"].iloc[0]]) for k, g in L.items()}
        d["mu"] = d["lad"].map(mus)
        q = np.array([qchance(mu, r_stat[s], ln, ov) for mu, s, ln, ov in zip(d["mu"], d["stat"], d["line"], d["over"])])
        lq = np.log(q / (1 - q))
        X = np.column_stack([np.ones(len(d)), lq, lq * lq])
        a, bb, c = np.linalg.lstsq(X, np.log(d["f"].values), rcond=None)[0]
        # dispersion per stat: pick r minimising error with mu re-searched (coarse)
        if it in (1, 3):
            for s in stats:
                ks = [k for k, g in L.items() if g["stat"].iloc[0] == s and len(g) >= 2][:400]
                if len(ks) < 10:
                    continue
                best = None
                for r in (1, 2, 4, 8, 16, 40, 200):
                    e = 0.0
                    for k in ks:
                        g = L[k]; mu = best_mu(g, a, bb, c, r)
                        for _, x in g.iterrows():
                            qq = qchance(mu, r, x["line"], x["over"]); l2 = np.log(qq / (1 - qq))
                            e += (a + bb * l2 + c * l2 * l2 - np.log(x["f"])) ** 2
                    if best is None or e < best[0]:
                        best = (e, r)
                r_stat[s] = best[1]
        res = np.log(d["f"].values) - X @ np.array([a, bb, c])
        print(f"MECH|iter {it}: a {a:+.3f} b {bb:+.3f} c {c:+.4f} | in-sample median |log err| {100*np.median(np.abs(res)):.2f}% | r " + ", ".join(f"{s}:{r_stat[s]:g}" for s in stats[:12]), flush=True)

    # leave-one-rung-out exactness
    ok = []; errs = []; by = {}
    for k, g in L.items():
        if len(g) < 2:
            continue
        r = r_stat[g["stat"].iloc[0]]
        for i, x in g.iterrows():
            mu = best_mu(g, a, bb, c, r, exclude=i)
            qq = qchance(mu, r, x["line"], x["over"]); l2 = np.log(qq / (1 - qq))
            v = float(np.exp(a + bb * l2 + c * l2 * l2))
            gr = grid[(x["kind"], x["sd"])]; sn = gr[np.argmin(np.abs(gr - v))]
            hit = abs(sn - round(x["f"], 4)) < 1e-3
            ok.append(hit); errs.append(abs(sn / x["f"] - 1))
            by.setdefault((x["kind"], x["sd"]), []).append(hit)
    e = np.array(errs)
    print(f"MECH|LEAVE-ONE-RUNG-OUT: {len(ok):,} rungs | EXACT {100*np.mean(ok):.1f}% | median error {100*np.median(e):.2f}% | p90 {100*np.percentile(e,90):.2f}% | " +
          " | ".join(f"{k[0]}-{'More' if k[1]=='o' else 'Less'} exact {100*np.mean(v):.0f}% (n {len(v)})" for k, v in sorted(by.items())), flush=True)
    # mu vs anchor
    lm = d.drop_duplicates("lad")[["stat", "anchor", "mu"]].dropna()
    lm["ratio"] = lm["mu"] / lm["anchor"].clip(lower=0.25)
    print("MECH|hidden projection / regular line (or switch point), by stat: " + " | ".join(f"{s}: median {g['ratio'].median():.3f} (p10 {g['ratio'].quantile(.1):.3f}, p90 {g['ratio'].quantile(.9):.3f}, n {len(g)})" for s, g in lm.groupby("stat") if len(g) >= 20), flush=True)


if __name__ == "__main__":
    main()
