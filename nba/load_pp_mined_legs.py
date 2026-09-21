#!/usr/bin/env python3
"""
Load mined PrizePicks per-leg prices into nba_market.pp_mined_leg.

Scans nba/data/pp_payouts/pp_payout_map_*.json and loads EVERY file whose run_file is not yet in the table, so:
  * a failed load self-heals on the next run
  * older runs (e.g. runs 2-3 of 2026-09-21, never loaded) are backfilled automatically
Loads the per-leg sections - LEG (new legs) and DRIFT (re-quotes of already-mined legs): one standard partner plus
one goblin/demon, i.e. a single leg's price. Multi-leg research sections stay in the JSON.

PER LEG, NEVER PER GENERIC PRICE ID: two players with the identical (market, center, line, side, kind) carry different
real prices (see nba/PP_PAYOUT_FINDINGS.md). The key is PrizePicks' own projection_id.
Compression constants are read from nba_config.pp_slip_rules so they live in exactly one place.
Env: DATABASE_URL.
"""
import glob
import json
import os
import sys

MAP = {"Points": "player_points", "Rebounds": "player_rebounds", "Assists": "player_assists",
       "3-PT Made": "player_threes", "Pts+Rebs": "player_points_rebounds", "Pts+Asts": "player_points_assists",
       "Rebs+Asts": "player_rebounds_assists", "Pts+Rebs+Asts": "player_points_rebounds_assists"}
PER_LEG_SECTIONS = ("LEG", "DRIFT")


def legs_from_file(path, knee, expo):
    """per-leg rows from one mapper JSON (pure function - testable without a database)"""
    def decomp(x):
        return x if x <= knee else knee * (x / knee) ** (1 / expo)
    name = os.path.basename(path)
    d = json.load(open(path, encoding="utf-8"))
    board = d.get("board") or []
    std = {(r["player"], r["stat"]): r["line"] for r in board if r.get("odds") == "standard"}
    pid = {r["id"]: r["player"] for r in board}
    rows = []
    for q in d.get("quotes") or []:
        if q.get("section") not in PER_LEG_SECTIONS or q.get("status") != 200:
            continue
        n = str(q.get("n"))
        p2 = (q.get("power") or {}).get(n, {}).get(n)
        if not p2:
            continue
        alts = [l for l in q.get("legs") or [] if l.get("odds") in ("goblin", "demon")]
        stds = [l for l in q.get("legs") or [] if l.get("odds") == "standard"]
        if len(alts) != 1 or len(stds) != 1:
            continue
        a, s = alts[0], stds[0]
        fx = (q.get("flex") or {}).get(n, {})
        fac = decomp(float(p2)) / 3.0
        rows.append((name, q["t"], str(a["id"]), a.get("name"), a.get("stat"), MAP.get(a.get("stat")),
                     std.get((pid.get(a["id"]), a.get("stat"))), float(a["line"]), a["odds"],
                     "Over" if (a.get("side") or "over").lower() == "over" else "Under", str(s["id"]),
                     float(p2), fx.get("2"), fx.get("1"), fac, 0.5 / fac))
    return name, rows


def main():
    import psycopg
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    with conn.cursor() as cur:
        cur.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key = 'compression'")
        rj = cur.fetchone()[0]
        knee, expo = float(rj["knee"]), float(rj["exponent"])
        cur.execute("SELECT DISTINCT run_file FROM nba_market.pp_mined_leg")
        loaded = {r[0] for r in cur.fetchall()}
    files = sorted(glob.glob("nba/data/pp_payouts/pp_payout_map_*.json"))
    total = 0
    for path in files:
        if os.path.basename(path) in loaded:
            continue
        name, rows = legs_from_file(path, knee, expo)
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO nba_market.pp_mined_leg
                   (run_file, quoted_at, projection_id, player, pp_stat, base_market, std_line, line, kind, side,
                    partner_projection_id, two_pick_power, flex_full, flex_partial, factor_mined, implied_p_mined)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT DO NOTHING""", rows)
        conn.commit()
        print(f"LOADED|{name}|{len(rows)} per-leg prices", flush=True)
        total += len(rows)
    print(f"LOAD_DONE|files={len(files)}|previously_loaded={len(loaded)}|new_rows={total}", flush=True)
    # PRICE THE SEASON AS IT ARRIVES: rescue centers for recent no-center legs, create missing Price IDs, and price
    # them under every registered model version. Idempotent - on an unchanged board it adds nothing.
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM nba_market.pp_refresh_prices()")
        ra, rb, nk, npr = cur.fetchone()
    conn.commit()
    print(f"REFRESH|rescued_a={ra}|rescued_b={rb}|new_keys={nk}|new_prices={npr}", flush=True)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
