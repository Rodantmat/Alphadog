#!/usr/bin/env python3
"""RESEARCH (2026-11-01, owner: "ParlayAPI provides the pro line level odds ... fix it"). READ-ONLY simulation on the stored live captures.

The game-day probe (research_parlay_gameday.py, run 41336080868) showed ParlayAPI serves NBA player props from DraftKings (mostly
one-sided milestones), Bovada, FanDuel (milestones only) AND three sharp/exchange books the capture drops because they are not in the
certified set: Pinnacle, Novig, ProphetX. BetMGM / Caesars / BetRivers / BetOnline / Fanatics / bet365 / Hard Rock / ESPN serve 0 rows.
History (Odds API) has NO pinnacle / novig / prophetx rows, so adding them to the live set leaves every certified history rung unchanged.

For every stored window capture since 10-21 this re-runs the PRODUCTION normalizer (capture_parlay_props.normalize, with the new name
map) twice - A = today's certified 8-book set, B = A + pinnacle, novig, prophetx - builds the de-vigged rung prices exactly as
build_rung_market does (both sides of the same line per book, averaged across books) on the PrizePicks window rungs, and reports:
  1. coverage of PrizePicks rungs and books per covered rung (A vs B vs the history's 64.3% / 2.11)
  2. accuracy against the real outcomes: Brier of each book's de-vigged p_over, and of the pooled A vs B price on the same rungs
Writes nothing."""
import json
import os
import sys
from collections import defaultdict
from datetime import date

import psycopg

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("CP_MODE", "probe")
import capture_parlay_props as cp  # noqa: E402
from nba_names import norm_name  # noqa: E402

EXTRA = (os.environ.get("SIM_EXTRA_BOOKS") or "pinnacle,novig,prophetx").split(",")
STAT = {"player_points": ("pts",), "player_rebounds": ("reb",), "player_assists": ("ast",), "player_threes": ("fg3m",),
        "player_blocks": ("blk",), "player_steals": ("stl",), "player_turnovers": ("tov",),
        "player_points_rebounds_assists": ("pts", "reb", "ast"), "player_points_rebounds": ("pts", "reb"),
        "player_points_assists": ("pts", "ast"), "player_rebounds_assists": ("reb", "ast"), "player_blocks_steals": ("blk", "stl")}


def implied(a):
    a = float(a)
    return 100.0 / (a + 100) if a > 0 else -a / (-a + 100.0)


def devig_rows(rows, slate):
    """board_snapshots-shaped tuples -> {(player, market, line): {book: p_over}} for the slate's window rows (build_rung_market rule)"""
    sides = defaultdict(dict)
    for (gd, ev, lab, ts, bk, mk, pl, side, line, price, *_r) in rows:
        if gd != slate or lab != "window" or price in (-137, 100) or price <= -100000:
            continue
        sides[(pl, mk.replace("_alternate", ""), float(line), bk)][side] = price
    out = defaultdict(dict)
    for (pl, mk, ln, bk), s in sides.items():
        if "Over" in s and "Under" in s:
            po, pu = implied(s["Over"]), implied(s["Under"])
            out[(pl, mk, ln)][bk] = po / (po + pu)
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    cfg = cp.load_cfg(conn)
    cfg_a = dict(cfg)
    cfg_b = dict(cfg, books=list(dict.fromkeys(list(cfg["books"]) + EXTRA)))
    names = dict(conn.execute("SELECT norm_name, player_id FROM nba_ref.player_name_map").fetchall())
    dates = [r[0] for r in conn.execute("""SELECT capture_date FROM nba_market.parlay_props_captures WHERE label='window' AND sport='basketball_nba'
                                           AND capture_date >= '2026-10-21' AND jsonb_typeof(payload)='array' ORDER BY 1""").fetchall()]
    tot = defaultdict(float)
    brier = defaultdict(lambda: [0.0, 0])
    for d in dates:
        items = conn.execute("SELECT payload FROM nba_market.parlay_props_captures WHERE capture_date=%s AND label='window' AND sport='basketball_nba'", (d,)).fetchone()[0]
        ppmap = cp.pp_name_map(conn, d)
        ra, _, _ = cp.normalize(items, cfg_a, "window", d, ppmap)
        rb, _, _ = cp.normalize(items, cfg_b, "window", d, ppmap)
        A, B = devig_rows(ra, d), devig_rows(rb, d)
        pp = conn.execute("""SELECT DISTINCT player, base_market, line FROM nba_market.board_tiers_v2
                             WHERE bookmaker='prizepicks' AND snapshot_label='window' AND game_date=%s""", (d,)).fetchall()
        pp = [(p, m, float(ln)) for p, m, ln in pp if m in STAT]
        # outcomes for the slate (ET date of the archive = player_game_log.game_date)
        logs = {}
        for pid, pts, reb, ast, fg3m, blk, stl, tov in conn.execute(
                "SELECT nba_player_id::text, pts, reb, ast, fg3m, blk, stl, tov FROM nba_stats.player_game_log WHERE game_date=%s", (d,)).fetchall():
            logs[pid] = {"pts": pts, "reb": reb, "ast": ast, "fg3m": fg3m, "blk": blk, "stl": stl, "tov": tov}
        cov_a = cov_b = books_a = books_b = ge4_a = ge4_b = 0
        for key in pp:
            a, b = A.get(key, {}), B.get(key, {})
            cov_a += bool(a); cov_b += bool(b); books_a += len(a); books_b += len(b); ge4_a += len(a) >= 4; ge4_b += len(b) >= 4
            pid = names.get(norm_name(key[0]))
            st = logs.get(str(pid)) if pid else None
            if not st or any(st.get(c) is None for c in STAT[key[1]]) or float(key[2]).is_integer():
                continue
            y = 1.0 if sum(float(st[c]) for c in STAT[key[1]]) > key[2] else 0.0
            for bk, p in b.items():
                brier[bk][0] += (p - y) ** 2; brier[bk][1] += 1
            if a:
                pa = sum(a.values()) / len(a); pb = sum(b.values()) / len(b)
                brier["POOLED_A (rungs A covers)"][0] += (pa - y) ** 2; brier["POOLED_A (rungs A covers)"][1] += 1
                brier["POOLED_B (same rungs)"][0] += (pb - y) ** 2; brier["POOLED_B (same rungs)"][1] += 1
            elif b:
                pb = sum(b.values()) / len(b)
                brier["POOLED_B (rungs only B covers)"][0] += (pb - y) ** 2; brier["POOLED_B (rungs only B covers)"][1] += 1
                brier["COINFLIP 0.5 (rungs only B covers)"][0] += 0.25; brier["COINFLIP 0.5 (rungs only B covers)"][1] += 1
        n = len(pp)
        print(f"{d}: PP rungs {n:5d} | A covered {cov_a:5d} ({100*cov_a/max(n,1):4.1f}%) books/covered {books_a/max(cov_a,1):.2f} >=4 {ge4_a} | "
              f"B covered {cov_b:5d} ({100*cov_b/max(n,1):4.1f}%) books/covered {books_b/max(cov_b,1):.2f} >=4 {ge4_b} | logs {len(logs)}", flush=True)
        for k, v in (("n", n), ("ca", cov_a), ("cb", cov_b), ("ba", books_a), ("bb", books_b), ("ga", ge4_a), ("gb", ge4_b)):
            tot[k] += v
    n = tot["n"]
    print(f"\nPOOLED {len(dates)} dates: PP rungs {int(n)}", flush=True)
    print(f"  A (certified 8): coverage {100*tot['ca']/n:.1f}%  books per covered rung {tot['ba']/max(tot['ca'],1):.2f}  >=4 books {100*tot['ga']/max(tot['ca'],1):.1f}%", flush=True)
    print(f"  B (+{','.join(EXTRA)}): coverage {100*tot['cb']/n:.1f}%  books per covered rung {tot['bb']/max(tot['cb'],1):.2f}  >=4 books {100*tot['gb']/max(tot['cb'],1):.1f}%", flush=True)
    print("  history reference (audit_market_coverage): coverage 64.3%, books per covered rung 2.11", flush=True)
    print("\nACCURACY vs outcomes (Brier, lower is better; non-integer lines, graded players):", flush=True)
    for k, (s, c) in sorted(brier.items(), key=lambda kv: kv[0]):
        print(f"  {k:40s} n={c:6d} brier={s/max(c,1):.4f}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
