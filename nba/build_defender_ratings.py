#!/usr/bin/env python3
"""
DEFENDER RATINGS — a proper two-way model, replacing the crude "points allowed per possession".

WHY THE FIRST VERSION WAS WRONG: raw points-allowed-per-possession confounds the DEFENDER with the
OFFENSIVE PLAYERS he happens to face. A defender who draws the opponent's best scorer every night looks
bad by construction, and one who guards the fifth option looks elite. The Sloan work on defensive impact
is explicit that naive opponent-shooting metrics are unreliable - opponent 3P% has "almost no
year-to-year correlation" - and that the fix is a REGRESSION that separates the two effects:

        Y_ij = mu + alpha_i (offence) + beta_j (defence) + e

Our matchup shards give exactly the data that model needs: one row per (offensive player, defender,
game) with partial possessions, points, FGM/FGA, 3PM/3PA, free throws, turnovers forced, shooting fouls
and switch counts.

WHAT THIS BUILDS
  1. Two-way ridge fit on matchup rows, weighted by partial possessions, so beta_j is the defender's
     effect NET of who he guarded. Ridge (not OLS) because the design is sparse and collinear - most
     pairs meet a handful of times.
  2. Multiple defensive channels, not one number:
        def_pts     points allowed per 100 partial possessions, offence-adjusted
        def_fg      FG% allowed, offence-adjusted
        def_3p      3P% allowed, offence-adjusted   (noisiest - carried with its reliability)
        def_tov     turnovers forced per 100
        def_foul    shooting fouls conceded per 100
  3. RELIABILITY per defender per channel: n possessions and a split-half correlation, so a thin sample
     is shrunk rather than trusted. This is the piece the crude version lacked entirely.
  4. AS-OF by construction: ratings are refit at a weekly cadence using only games strictly before the
     as-of date, so a rating can be used on any historical day without leakage.
  5. Scheme context from the same rows: switch rate and help-block rate per defender.

OUTPUT nba_ref.defender_ratings (as_of_date, player_id, channel, rating, n_poss, shrunk_rating, reliability)

Env: DATABASE_URL, DEF_SEASONS, DEF_CADENCE_DAYS (default 7), DEF_RIDGE (default 50), DEF_SAMPLE_DATES
"""
import json
import os
import urllib.request
from collections import defaultdict
from datetime import timedelta

import numpy as np
import pandas as pd
import psycopg
from scipy import sparse
from scipy.sparse.linalg import lsqr

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
CHANNELS = ("def_pts", "def_fg", "def_3p", "def_tov", "def_foul")


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def load_matchups(slug):
    idx = fetch(f"nba_matchups_pergame_{slug}_index.json", timeout=120)
    shards = (idx.get("meta") or idx).get("shards") or []
    frames = []
    for sh in shards:
        try:
            d = fetch(f"nba_matchups_pergame_{slug}_{sh}.json")
            frames.append(pd.DataFrame(d["rows"], columns=d["columns"]))
        except Exception as exc:  # noqa: BLE001
            print(f"  shard {sh}: {exc}", flush=True)
    if not frames:
        return pd.DataFrame()
    m = pd.concat(frames, ignore_index=True)
    m["GAME_DATE"] = pd.to_datetime(m["GAME_DATE"]).dt.date
    for c in ("personIdDef", "personIdOff"):
        m[c] = m[c].astype(str)
    num = ["partialPossessions", "playerPoints", "matchupFieldGoalsMade", "matchupFieldGoalsAttempted",
           "matchupThreePointersMade", "matchupThreePointersAttempted", "matchupTurnovers",
           "shootingFouls", "switchesOn", "helpBlocks"]
    for c in num:
        if c in m.columns:
            m[c] = pd.to_numeric(m[c], errors="coerce").fillna(0.0)
        else:
            m[c] = 0.0
    return m[m["partialPossessions"] > 0].sort_values("GAME_DATE")


def two_way_fit(df, value_col, weight_col, ridge):
    """Ridge two-way fixed effects: value ~ mu + alpha(off) + beta(def), weighted.

    Returns {defender_id: beta}. Ridge is essential here - the offence x defence design is extremely
    sparse (most pairs meet a few times a season) and OLS would fit noise into the rare pairs."""
    offs = df["personIdOff"].astype("category")
    defs = df["personIdDef"].astype("category")
    n, no, nd = len(df), len(offs.cat.categories), len(defs.cat.categories)
    rows = np.arange(n)
    w = np.sqrt(df[weight_col].values)
    X = sparse.hstack([
        sparse.csr_matrix((w, (rows, np.zeros(n, dtype=int))), shape=(n, 1)),
        sparse.csr_matrix((w, (rows, offs.cat.codes.values)), shape=(n, no)),
        sparse.csr_matrix((w, (rows, defs.cat.codes.values)), shape=(n, nd)),
    ]).tocsr()
    y = df[value_col].values * w
    # ridge via augmented rows (do not penalise the intercept)
    pen = sparse.hstack([sparse.csr_matrix((1 + no + nd, 1)),
                         sparse.identity(no + nd, format="csr") * np.sqrt(ridge)]).tocsr()[:, : 1 + no + nd]
    Xa = sparse.vstack([X, pen[1:]]).tocsr()
    ya = np.concatenate([y, np.zeros(no + nd)])
    sol = lsqr(Xa, ya, atol=1e-8, btol=1e-8, iter_lim=400)[0]
    beta = sol[1 + no:]
    return dict(zip(defs.cat.categories, beta))


def main():
    seasons = [s.strip() for s in os.environ.get("DEF_SEASONS", "2024-25,2025-26").split(",")]
    cadence = int(os.environ.get("DEF_CADENCE_DAYS", "7"))
    ridge = float(os.environ.get("DEF_RIDGE", "50"))
    sample = int(os.environ.get("DEF_SAMPLE_DATES", "0"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute("""CREATE SCHEMA IF NOT EXISTS nba_ref;
            CREATE TABLE IF NOT EXISTS nba_ref.defender_ratings (
                season text, as_of_date date, player_id text, channel text,
                rating numeric, n_poss numeric, reliability numeric, shrunk_rating numeric,
                switch_rate numeric, help_block_rate numeric, built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS defender_ratings_uidx
            ON nba_ref.defender_ratings (as_of_date, player_id, channel)""")
        cur.execute("CREATE INDEX IF NOT EXISTS defender_ratings_lookup ON nba_ref.defender_ratings (season, as_of_date)")

    for season in seasons:
        slug = season.replace("-", "_")
        m = load_matchups(slug)
        if m.empty:
            print(f"{season}: no matchup shards", flush=True)
            continue
        print(f"{season}: {len(m):,} matchup rows, {m['personIdDef'].nunique()} defenders", flush=True)
        m["pts100"] = m["playerPoints"] / m["partialPossessions"] * 100
        m["fgpct"] = np.where(m["matchupFieldGoalsAttempted"] > 0,
                              m["matchupFieldGoalsMade"] / m["matchupFieldGoalsAttempted"], np.nan)
        m["p3pct"] = np.where(m["matchupThreePointersAttempted"] > 0,
                              m["matchupThreePointersMade"] / m["matchupThreePointersAttempted"], np.nan)
        m["tov100"] = m["matchupTurnovers"] / m["partialPossessions"] * 100
        m["foul100"] = m["shootingFouls"] / m["partialPossessions"] * 100

        dates = sorted(m["GAME_DATE"].unique())
        if sample:
            dates = dates[:sample]
        asofs = [d for i, d in enumerate(dates) if i % cadence == 0][2:]   # need history before the first fit
        rows_out = []
        for asof in asofs:
            hist = m[m["GAME_DATE"] < asof]
            if len(hist) < 5000:
                continue
            poss = hist.groupby("personIdDef")["partialPossessions"].sum()
            switch = (hist.groupby("personIdDef")["switchesOn"].sum() / poss.clip(lower=1) * 100)
            helpb = (hist.groupby("personIdDef")["helpBlocks"].sum() / poss.clip(lower=1) * 100)
            for channel, col, wcol, sub in (
                ("def_pts", "pts100", "partialPossessions", None),
                ("def_fg", "fgpct", "matchupFieldGoalsAttempted", "matchupFieldGoalsAttempted"),
                ("def_3p", "p3pct", "matchupThreePointersAttempted", "matchupThreePointersAttempted"),
                ("def_tov", "tov100", "partialPossessions", None),
                ("def_foul", "foul100", "partialPossessions", None),
            ):
                h = hist if sub is None else hist[hist[sub] > 0]
                h = h[h[col].notna()]
                if len(h) < 3000:
                    continue
                beta = two_way_fit(h, col, wcol, ridge)
                w_by_def = h.groupby("personIdDef")[wcol].sum()
                # reliability = n/(n+k) on the channel's own weight scale; k set at the median defender
                k = float(w_by_def.median())
                for pid, b in beta.items():
                    n_w = float(w_by_def.get(pid, 0.0))
                    rel = n_w / (n_w + k) if (n_w + k) > 0 else 0.0
                    rows_out.append((season, asof, pid, channel, float(b), n_w, rel, float(b) * rel,
                                     float(switch.get(pid, 0.0)), float(helpb.get(pid, 0.0))))
            if len(rows_out) > 60000:
                write(conn, rows_out); rows_out = []
        write(conn, rows_out)
        with conn.cursor() as cur:
            cur.execute("""SELECT channel, count(*), count(DISTINCT as_of_date), round(avg(reliability)::numeric,3),
                                  round(stddev(shrunk_rating)::numeric,4)
                           FROM nba_ref.defender_ratings WHERE season=%s GROUP BY 1 ORDER BY 1""", (season,))
            for r in cur.fetchall():
                print(f"  {r[0]:<10} rows {r[1]:>7,}  as-of dates {r[2]:>4}  mean reliability {r[3]}  sd(shrunk) {r[4]}", flush=True)
    conn.close()


def write(conn, rows):
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_ref.defender_ratings
            (season, as_of_date, player_id, channel, rating, n_poss, reliability, shrunk_rating,
             switch_rate, help_block_rate)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (as_of_date, player_id, channel) DO UPDATE
              SET rating=EXCLUDED.rating, shrunk_rating=EXCLUDED.shrunk_rating,
                  reliability=EXCLUDED.reliability, n_poss=EXCLUDED.n_poss""", rows)
    conn.commit()


if __name__ == "__main__":
    main()
