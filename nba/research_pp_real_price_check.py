#!/usr/bin/env python3
"""
REAL PRIZEPICKS PRICES x REAL RESULTS (owner 2026-11-18 22:58 PT: test, simulate and debug the per-leg ROI model). READ-ONLY.
Every goblin / demon leg PrizePicks actually quoted this season (nba_market.pp_mined_leg: the 2-pick Power quote with a regular partner), graded on the player's
box score. Answers: what does a goblin / demon really return at its REAL price, and how far are the factors stored in the two-season history
(nba_score._mf_study_fs, estimates) from the real ones.
  f2   = 2-pick quote / 3 (what the board uses today)
  f6   = the leg's sharp price implied by the 2-pick law found 2026-11-18: P2 = 2.99 x f6^0.904
  leg return = hit x f / base - 1, base 0.56 (board) and 0.542 (5/6-pick Flex)
Env: DATABASE_URL, RP_SINCE (2026-10-20).
"""
import os
import unicodedata
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

SINCE = os.environ.get("RP_SINCE") or "2026-10-20"
STAT = {"player_points": lambda s: s[0], "player_rebounds": lambda s: s[1], "player_assists": lambda s: s[2], "player_threes": lambda s: s[3],
        "player_points_rebounds_assists": lambda s: s[0] + s[1] + s[2], "player_points_rebounds": lambda s: s[0] + s[1],
        "player_points_assists": lambda s: s[0] + s[2], "player_rebounds_assists": lambda s: s[1] + s[2]}


def nk(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return "".join(c for c in s if c.isalnum())


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    names = {}
    for pid, nm in conn.execute("SELECT nba_player_id::text, full_name FROM nba_ref.players").fetchall():
        names.setdefault(nk(nm), pid)
    box = {}
    for pid, d, pts, reb, ast, fg3m in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m FROM nba_stats.player_game_log
            WHERE game_date >= %s AND min > 0""", (SINCE,)).fetchall():
        box[(pid, str(d))] = (pts or 0, reb or 0, ast or 0, fg3m or 0)
    df = pd.read_sql("""SELECT DISTINCT ON (left(b.start_time, 10), m.player, m.base_market, m.line)
               left(b.start_time, 10) gd, m.player, m.base_market, m.line::float8 line, m.kind, m.two_pick_power::float8 p2, m.std_line::float8 std_line
        FROM nba_market.pp_mined_leg m JOIN nba_market.pp_board_row b ON b.run_file = m.run_file AND b.projection_id = m.projection_id
        WHERE m.two_pick_power > 0 AND m.base_market IS NOT NULL AND left(b.start_time, 10) >= %s
        ORDER BY left(b.start_time, 10), m.player, m.base_market, m.line, m.quoted_at DESC""", conn, params=(SINCE,))
    hist = pd.read_sql("""SELECT kind, tier, factor::float8 f, hit::int hit FROM nba_score._mf_study_fs
                          WHERE season = '2025-26' AND hit IS NOT NULL AND factor > 0 AND kind IN ('goblin', 'demon')""", conn)
    conn.close()
    hit = np.full(len(df), np.nan); miss = defaultdict(int)
    for i, (gd, pl, mk, ln) in enumerate(zip(df["gd"], df["player"], df["base_market"], df["line"])):
        pid = names.get(nk(pl)); s = box.get((pid, gd)) if pid else None
        if s is None:
            miss["no box score (did not play / not graded yet / name)"] += 1
            continue
        v = STAT[mk](s)
        if v == ln:
            miss["push"] += 1
            continue
        hit[i] = float(v > ln)
    df["hit"] = hit; g = df[np.isfinite(hit)].copy()
    g["f2"] = g["p2"] / 3.0; g["f6"] = (g["p2"] / 2.99) ** (1 / 0.904)
    print(f"RP|quoted legs {len(df):,} since {SINCE}; graded {len(g):,} on {g['gd'].nunique()} slates; not graded: {dict(miss)}", flush=True)
    edges = [0, .55, .65, .72, .78, .84, .90, .97, 1.03, 1.15, 1.35, 1.7, 2.2, 3.0, 4.5, 99]
    for kind in ("goblin", "demon"):
        k = g[g["kind"] == kind]
        if not len(k):
            continue
        print(f"\nRP|=== REAL-PRICED {kind.upper()}S: {len(k):,} legs on {k['gd'].nunique()} slates; hit {k['hit'].mean():.3f}; avg f2 {k['f2'].mean():.3f}, f6 {k['f6'].mean():.3f} ===")
        for lab, col in (("price from the 2-pick quote (f2)", "f2"), ("sharp price (f6)", "f6")):
            for base in (0.56, 0.542):
                r = k["hit"] * k[col] / base - 1
                daily = r.groupby(k["gd"]).agg(["sum", "count"]); tot = daily["sum"].sum() / daily["count"].sum()
                se = np.sqrt(((daily["sum"] - tot * daily["count"]) ** 2).sum()) / daily["count"].sum()
                print(f"RP|  all {kind}s, {lab}, base {base}: real return {100 * tot:+6.1f}% +- {100 * se:4.1f}")
        print("RP|  by price (f2)        legs   hit   price x hit (0.50 = same value as a regular coin-flip leg)   real return at base 0.56 / 0.542")
        b = np.searchsorted(edges, k["f2"].values, side="right") - 1
        for j in range(len(edges) - 1):
            s_ = b == j
            if s_.sum() < 40:
                continue
            kk = k[s_]; v = (kk["hit"] * kk["f2"]).mean(); se = (kk["hit"] * kk["f2"]).std() / np.sqrt(len(kk))
            print(f"RP|  {edges[j]:4.2f} - {edges[j + 1]:5.2f}     {len(kk):6,}  {kk['hit'].mean():.3f}   {v:.3f} +- {se:.3f}   {100 * (v / .56 - 1):+6.1f}% / {100 * (v / .542 - 1):+6.1f}%")
        h = hist[hist["kind"] == kind]
        print(f"RP|  history estimates (2025-26) for comparison: {len(h):,} legs, avg factor {h['f'].mean():.3f}, hit {h['hit'].mean():.3f}, factor x hit {(h['f'] * h['hit']).mean():.3f}; "
              f"real quotes: avg f2 {k['f2'].mean():.3f}, hit {k['hit'].mean():.3f}, f2 x hit {(k['f2'] * k['hit']).mean():.3f}")
        qs = [.1, .25, .5, .75, .9]
        print(f"RP|  factor spread (10/25/50/75/90%): history {np.round(h['f'].quantile(qs).values, 2).tolist()} | real f2 {np.round(k['f2'].quantile(qs).values, 2).tolist()}")
    print("RP|DONE", flush=True)


if __name__ == "__main__":
    main()
