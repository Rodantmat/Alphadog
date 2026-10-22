#!/usr/bin/env python3
"""
RESEARCH - WHAT THIS SEASON'S LOWER PRIZEPICKS LINES DO TO THE LIVE STRATEGIES (2026-10-21 PT; owner 23:07 / 23:20 PT: "compare the
first 2 days to the first 2 days of the past seasons ... we need to understand how that comparison and learning affects our numbers,
strategies, ROI").  READ-ONLY.

MEASURED (first two slates, PrizePicks window board, standard lines, line minus the player's prior-season average; 2026-27 vs the mean
of the 2024-25 / 2025-26 openers): points -0.5, PRA -0.85, pts+ast -1.0, pts+reb -0.6, reb+ast -0.3, assists -0.35, rebounds ~0;
steals / blocks / stocks / threes / turnovers inside the past openers' range (no shift).

COUNTERFACTUAL ON REAL OUTCOMES. Every slip the live PrizePicks strategies take in the live twin backtest (classification_config
live_backtest_suffix: slip_engine_slips_wo, C_ / D_ / R_ / W_ on _nosteals; k <= the strategy's current cap; regular season, final 7 days
out) is regraded with each leg's line moved by the measured shift. Lines stay on the half-point grid: a shift of d points moves a
deterministic share |d| of that prop's legs (hash of player, date, prop) by one whole point - the same expected shift, no pushes
invented. Over: hit = actual > new line; Under: actual < new line; the leg's payout factor is kept (PrizePicks pays flat). Voided legs stay
void. Payout = build_slip_engine.pp_payout (grader v3, the table's own same_game flag). Scenarios: base (no shift - must reproduce the
stored payouts), shift x1 (measured), shift x2 (a harsher season).
Env: DATABASE_URL.
"""
import hashlib
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE   # noqa: E402
import live_slip_engine as L     # noqa: E402

SHIFT = {"points": -0.5, "pra": -0.85, "pts_ast": -1.0, "pts_reb": -0.6, "reb_ast": -0.3, "assists": -0.35}
STAT = {"points": lambda g: g["pts"], "rebounds": lambda g: g["reb"], "assists": lambda g: g["ast"], "steals": lambda g: g["stl"],
        "blocks": lambda g: g["blk"], "stocks": lambda g: g["stl"] + g["blk"], "turnovers": lambda g: g["tov"],
        "threes_made": lambda g: g["fg3m"], "threes": lambda g: g["fg3m"], "pra": lambda g: g["pts"] + g["reb"] + g["ast"],
        "pts_reb": lambda g: g["pts"] + g["reb"], "pts_ast": lambda g: g["pts"] + g["ast"], "reb_ast": lambda g: g["reb"] + g["ast"]}


def norm(s):
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"[^a-z]", "", s)


def u01(*parts):
    return int(hashlib.md5("|".join(map(str, parts)).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def payout(legs, structure, sg):
    live = [l for l in legs if l["hit"] is not None]
    if len(live) < len(legs):
        return SE.grade([dict(l) for l in legs], structure)[1]      # voids: the grader's reversion rules (same game ignored, rare)
    k = len(live)
    hits = sum(1 for l in live if l["hit"])
    fprod = 1.0
    for l in live:
        fprod *= float(l["factor"])
    alt = any(abs(float(l["factor"]) - 1.0) > 1e-9 for l in live)
    return SE.pp_payout(k, hits, structure, fprod, alt, same_game=sg)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    sfx = (conn.execute("SELECT config_json->>'suffix' FROM nba_config.classification_config WHERE config_key='live_backtest_suffix'").fetchone() or [""])[0] or ""
    names = {}
    for nm, pid in conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall():
        names.setdefault(nm, pid)
    logs = {}
    for pid, d, pts, reb, ast, stl, blk, tov, fg3m in conn.execute(
            """SELECT nba_player_id::text, game_date, pts, reb, ast, stl, blk, tov, fg3m FROM nba_stats.player_game_log
               WHERE min > 0 AND season IN ('2024-25', '2025-26')""").fetchall():
        logs[(pid, d)] = {"pts": pts, "reb": reb, "ast": ast, "stl": stl, "blk": blk, "tov": tov, "fg3m": fg3m}
    print(f"twin suffix {sfx!r} | box-score rows {len(logs):,} | name map {len(names):,}", flush=True)
    print(f"shifts (points, x1): {SHIFT}", flush=True)
    out = []
    legstat = defaultdict(lambda: [0, 0, 0, 0])     # (scenario, side) -> legs, hits
    for name, spec in L.STRATEGIES.items():
        comp, size, structure, cap = spec[:4]
        if not cap:
            continue
        t = f"nba_score.slip_engine_slips{sfx}{'_nosteals' if name[:2] in ('C_', 'D_', 'R_', 'W_') else ''}"
        rows = conn.execute(f"""SELECT season, game_date, legs_json, payout, stake, same_game FROM {t}
                                WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'""",
                            (comp, size, structure, cap)).fetchall()
        acc = defaultdict(lambda: defaultdict(float))
        miss_stat = mism = 0
        for season, d, legs, stored, stake, sg in rows:
            stake = float(stake)
            acc[season]["n"] += 1
            acc[season]["st"] += stake
            acc[season]["stored"] += float(stored or 0) * stake
            for scen, mult in (("base", 0.0), ("x1", 1.0), ("x2", 2.0)):
                new = []
                for l in legs:
                    l2 = {"hit": l.get("hit"), "factor": l.get("factor", 1.0)}
                    if l2["hit"] is not None and mult:
                        sh = SHIFT.get(l.get("prop"), 0.0) * mult
                        if sh and u01(l.get("player"), d, l.get("prop")) < min(1.0, abs(sh)):
                            g = logs.get((names.get(norm(l.get("player"))), d))
                            fn = STAT.get(l.get("prop"))
                            if g is None or fn is None:
                                miss_stat += 1
                            else:
                                line = float(l["line"]) + (-1.0 if sh < 0 else 1.0)
                                a = float(fn(g))
                                l2["hit"] = int(a > line) if str(l.get("side")).lower().startswith("o") else int(a < line)
                    if l2["hit"] is not None:
                        k2 = (scen, str(l.get("side"))[:1])
                        legstat[k2][0] += 1
                        legstat[k2][1] += int(l2["hit"])
                    new.append(l2)
                p = payout(new, structure, bool(sg and sg > 0))
                acc[season][scen] += p * stake
                if scen == "base" and abs(p - float(stored or 0)) > 1e-6:
                    mism += 1
        for season in sorted(acc):
            a = acc[season]
            r = lambda key: 100 * (a[key] / a["st"] - 1)
            out.append((name, season, int(a["n"]), r("stored"), r("base"), r("x1"), r("x2")))
        print(f"{name}: {len(rows)} slips, base-vs-stored payout mismatches {mism}, shifted legs without a box score {miss_stat}", flush=True)
    print("\nstrategy             season   slips  ROI stored  ROI base  ROI shift x1  ROI shift x2")
    for name, season, n, rs, rb, r1, r2 in out:
        print(f"{name:<20} {season}  {n:>6}  {rs:>+9.1f}%  {rb:>+7.1f}%  {r1:>+11.1f}%  {r2:>+11.1f}%")
    print("\nleg hit rate by side (all live-strategy legs, both seasons):")
    for scen in ("base", "x1", "x2"):
        for side in ("O", "U"):
            n, h = legstat[(scen, side)][:2]
            if n:
                print(f"  {scen:<4} {('Over' if side == 'O' else 'Under'):<5} legs {n:>7,}  hit {h / n:.4f}")
    print("\nRESULT: stored == base recompute is the validity check; x1 = the measured 2026-27 opening shift held all season.")


if __name__ == "__main__":
    main()
