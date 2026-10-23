#!/usr/bin/env python3
"""
RESEARCH - CALIBRATION AUDIT OF OUR OWN NUMBERS, EVERY LINE TYPE / PROP / SIDE, AND WHY DEMONS ARE OFF (2026-10-22 PT; owner 17:49 PT:
"we need to proper calibrate our demons, understand why they are so off and fix it, same for all other prop lines and anything else
that are too off. Once understood and fixed, replicated to full back history and the live pipeline"). READ-ONLY.

Source: nba_score.tier_map_legs_sel_wo (every leg of every slate of both seasons with baseline_hp, final_hp, final_score and the
result; one row per rank key, pivoted). Per season:
  A  RELIABILITY by line type (R, G1-G3, D1-D3) x final_hp bucket: legs, mean final_hp, mean baseline_hp, hit rate, gap (fh - hit,
     bh - hit). Tells whether the error is in the baseline or added by the enrichment.
  B  THE TOP END (final_hp >= .58) by line type x prop x side: legs, fh, bh, hit, gap - where the overconfidence lives.
  C  DEMON / GOBLIN CONSISTENCY against the same player's standard line that day: a demon (a higher line, More) can never be more
     likely than the standard More; a goblin (lower line) never less. Share of alternate legs whose final_hp breaks that order, and
     the hit rate of breakers vs keepers; the alternate's final_hp vs the standard More's final_hp (ratio buckets) -> hit.
  D  the demon top end by distance from the standard line (rung) and by the enrichment push (fh - bh).
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import psycopg

SEASONS = ("2024-25", "2025-26")
FAM = {"steals": "DEF", "blocks": "DEF", "stocks": "DEF", "turnovers": "DEF", "points": "SCORE", "pra": "SCORE", "pts_reb": "SCORE",
       "pts_ast": "SCORE", "rebounds": "BOARDS", "reb_ast": "BOARDS", "assists": "AST", "threes_made": "3PM"}
BUCKETS = [0.0, 0.2, 0.3, 0.4, 0.5, 0.55, 0.58, 0.62, 0.66, 0.70, 0.75, 1.01]


def bucket(p):
    for i in range(len(BUCKETS) - 1):
        if BUCKETS[i] <= p < BUCKETS[i + 1]:
            return f"{BUCKETS[i]:.2f}-{BUCKETS[i + 1]:.2f}"
    return "?"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    legs = {}
    for season, d, rk, pl, pr, sd, ln, t, sc, h in conn.execute(
            """SELECT season, game_date, rank_key, player, prop, side, line::float8, tier, score, hit
               FROM nba_score.tier_map_legs_sel_wo WHERE season = ANY(%s) AND hit IS NOT NULL""", (list(SEASONS),)):
        k = (season, d, pl, pr, sd, round(ln, 1), t)
        l = legs.setdefault(k, {"hit": int(h)})
        l[{"final_score": "fs", "final_hp": "fh", "baseline_hp": "bh"}[rk]] = float(sc)
    L = [(k, v) for k, v in legs.items() if "fh" in v and "bh" in v and k[3] in FAM]
    print(f"graded legs with both numbers: {len(L):,}", flush=True)

    # standard More final_hp per (season, day, player, prop) for the consistency check
    std_over = {}
    for k, v in L:
        if k[6] == "R" and k[4] == "Over":
            std_over[(k[0], k[1], k[2], k[3])] = (k[5], v["fh"])

    A = defaultdict(lambda: [0, 0.0, 0.0, 0])
    B = defaultdict(lambda: [0, 0.0, 0.0, 0])
    C = defaultdict(lambda: [0, 0])
    Cr = defaultdict(lambda: [0, 0.0, 0])
    D = defaultdict(lambda: [0, 0.0, 0])
    for k, v in L:
        s, d, pl, pr, sd, ln, t = k
        lt = t if t in ("R",) else t[:2]
        a = A[(s, lt, bucket(v["fh"]))]
        a[0] += 1; a[1] += v["fh"]; a[2] += v["bh"]; a[3] += v["hit"]
        if v["fh"] >= 0.58:
            for key in ((s, lt[0], pr, sd), (s, lt[0], FAM[pr], sd), (s, lt[0], "ALL", sd)):
                b = B[key]
                b[0] += 1; b[1] += v["fh"]; b[2] += v["bh"]; b[3] += v["hit"]
        if t != "R" and sd == "Over":
            so = std_over.get((s, d, pl, pr))
            if so:
                sline, sfh = so
                kind = "D" if t.startswith("D") else "G"
                broken = (kind == "D" and v["fh"] > sfh + 1e-9) or (kind == "G" and v["fh"] < sfh - 1e-9)
                c = C[(s, kind, "breaks order" if broken else "keeps order", v["fh"] >= 0.58)]
                c[0] += 1; c[1] += v["hit"]
                ratio = v["fh"] / max(0.01, sfh)
                rb = "<0.5" if ratio < 0.5 else ("0.5-0.8" if ratio < 0.8 else ("0.8-1.0" if ratio <= 1.0 else ("1.0-1.2" if ratio < 1.2 else ">=1.2")))
                cr = Cr[(s, kind, rb)]
                cr[0] += 1; cr[1] += v["fh"]; cr[2] += v["hit"]
                if kind == "D" and v["fh"] >= 0.58:
                    gapb = "line +<=1" if ln - sline <= 1.01 else ("line +1-3" if ln - sline <= 3.01 else "line +3+")
                    push = v["fh"] - v["bh"]
                    pb = "push <=0" if push <= 0 else ("push 0-.05" if push <= 0.05 else "push >.05")
                    for key in ((s, "rung " + t, gapb), (s, "push", pb)):
                        dd = D[key]
                        dd[0] += 1; dd[1] += v["fh"]; dd[2] += v["hit"]

    for s in SEASONS:
        print(f"\n{'=' * 130}\n{s}\nA  RELIABILITY - line type x final_hp bucket: n, mean fh, mean bh, hit, fh-hit, bh-hit")
        for lt in ("R", "G1", "G2", "G3", "D1", "D2", "D3"):
            rows = sorted((b, v) for (ss, l, b), v in A.items() if ss == s and l == lt)
            for b, (n, f, bb, h) in rows:
                if n >= 30:
                    print(f"  {lt:<3} {b:<10} n{n:>7}  fh {f / n:.3f}  bh {bb / n:.3f}  hit {h / n:.3f}  fh-hit {f / n - h / n:+.3f}  bh-hit {bb / n - h / n:+.3f}")
        print("B  TOP END (fh >= .58) - line type x prop / family x side: n, fh, bh, hit, gap")
        for lt in ("R", "G", "D"):
            rows = sorted(((key, v) for key, v in B.items() if key[0] == s and key[1] == lt and v[0] >= 40), key=lambda kv: -(kv[1][1] - kv[1][3]) / kv[1][0])
            for (ss, l, pr, sd), (n, f, bb, h) in rows:
                print(f"  {l} {pr:<12} {sd:<6} n{n:>6}  fh {f / n:.3f}  bh {bb / n:.3f}  hit {h / n:.3f}  gap {f / n - h / n:+.3f}")
        print("C  ALTERNATES vs THE SAME PLAYER'S STANDARD MORE (consistency of our own numbers)")
        for kind in ("D", "G"):
            for tag in ("keeps order", "breaks order"):
                for top in (False, True):
                    c = C.get((s, kind, tag, top))
                    if c and c[0]:
                        print(f"  {kind} {tag:<13} {'fh>=.58' if top else 'fh<.58 '} n{c[0]:>7}  hit {c[1] / c[0]:.3f}")
            for rb in ("<0.5", "0.5-0.8", "0.8-1.0", "1.0-1.2", ">=1.2"):
                c = Cr.get((s, kind, rb))
                if c and c[0]:
                    print(f"  {kind} alt fh / std More fh {rb:<8} n{c[0]:>7}  mean fh {c[1] / c[0]:.3f}  hit {c[2] / c[0]:.3f}  gap {(c[1] - c[2]) / c[0]:+.3f}")
        print("D  DEMON TOP END (fh >= .58) by rung / distance from the standard line, and by the enrichment push")
        for key, (n, f, h) in sorted((kk, v) for kk, v in D.items() if kk[0] == s):
            print(f"  {key[1]:<10} {key[2]:<12} n{n:>6}  fh {f / n:.3f}  hit {h / n:.3f}  gap {(f - h) / n:+.3f}")


if __name__ == "__main__":
    main()
