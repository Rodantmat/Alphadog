#!/usr/bin/env python3
"""
PROBE (2026-10-09 night, owner: "prove the other apps as well for the payouts, make sure everything is sharp").
Finding that triggered it: on the 48 live MIXED quotes of run 38020184454 the certified grader (build_slip_engine.grade:
Flex = FLEX[(n, hits)] x prod(ALL leg factors), compressed) overpays the Flex ONE-MISS tier on demon slips 2-5x (3-Flex,
two demons: app 2.5x, grader 7.10x) and underpays the all-hit tier. B_demon_3flex / B_demon_5flex take most of their
certified payout from those partial tiers. This probe measures PrizePicks' own quote for ALL-DEMON Flex slips - the shape
those strategies build - so the backtest can be regraded with the real tiers.
What it does (primp, the runner's own IP - the transport certified tonight):
  1. each demon leg's factor: a 2-pick Power quote with one fixed standard partner -> factor = decompress(p2) / 3
     (the mapper's own LEG method, compression constants from pp_slip_rules defaults 9.1 / 0.857)
  2. all-demon 3-pick and 5-pick slips (distinct players, >= 2 teams), spread across the factor range -> Power + Flex
Writes nba/data/pp_payouts/pp_demon_flex_probe_<UTC>.json (committed by nothing - printed in full as JSON lines too).
Quotes only, nothing placed, no account. Env: PP_LEAGUE (7), PP_DEMON_SLIPS (40).
"""
import json
import os
import random
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pp_payout_map as M  # noqa: E402

KNEE, EXPO = 9.1, 0.857
N_SLIPS = int(os.environ.get("PP_DEMON_SLIPS", "40"))


def decomp(x):
    return x if x <= KNEE else KNEE * (x / KNEE) ** (1 / EXPO)


def tables(q, picks):
    st, txt = q._post(picks)
    out = {"status": st}
    try:
        for gt in json.loads(txt).get("data") or []:
            a = gt.get("attributes") or {}
            key = "power" if a.get("name") == "Power Play" else "flex" if a.get("name") == "Flex Play" else None
            if key:
                pay = dict(a.get("payouts") or {})
                out[key + "_adj"] = pay.pop("is_adjusted", None)
                out[key] = pay
    except Exception:  # noqa: BLE001
        out["error"] = (txt or "")[:200]
    time.sleep(1.0 + random.random() * 0.6)
    return out


def main():
    doc = M.fetch_board(M.proxies())
    rows = M.parse_board(doc or {})
    std = [r for r in rows if r["odds"] == "standard"]
    dem = [r for r in rows if r["odds"] == "demon"]
    print(f"board {len(rows)} legs: {len(std)} standard, {len(dem)} demon", flush=True)
    if not std or len(dem) < 5:
        print("not enough legs"); return
    q = M.PrimpQuoter(M.proxies())
    partner = std[0]
    # one demon per player (the strategies never pair a player with himself)
    seen, pool = set(), []
    for r in sorted(dem, key=lambda r: (r["player"], r["line"])):
        if r["player"] not in seen and r["player"] != partner["player"]:
            pool.append(r); seen.add(r["player"])
    print(f"partner {partner['name']} {partner['stat']} {partner['line']}; {len(pool)} distinct-player demons", flush=True)
    legs = []
    for r in pool:
        t = tables(q, [(partner["id"], "over"), (r["id"], "over")])
        p2 = ((t.get("power") or {}).get("2") or {}).get("2")
        if t["status"] == 200 and p2:
            f = decomp(float(p2)) / 3.0
            legs.append(dict(r, factor=round(f, 4), p2=p2))
            print(json.dumps({"kind": "LEG", "name": r["name"], "stat": r["stat"], "line": r["line"], "team_game": r["game"],
                              "p2": p2, "factor": round(f, 4)}), flush=True)
        else:
            print(f"LEG_FAIL {r['name']} status {t['status']} {t.get('error', '')[:80]}", flush=True)
    legs.sort(key=lambda l: l["factor"])
    out = []
    rng = random.Random(20261009)
    for size, share in ((3, 0.6), (5, 0.4)):
        want = max(1, int(N_SLIPS * share))
        made, tries = 0, 0
        while made < want and tries < 2000:
            tries += 1
            # spread across the factor range: anchor on a band, fill from the whole pool
            band = legs[int(len(legs) * made / want): int(len(legs) * (made + 1) / want) + size] or legs
            cand = rng.sample(band, min(size, len(band)))
            if len(cand) < size:
                cand += rng.sample([l for l in legs if l not in cand], size - len(cand))
            if len({l["player"] for l in cand}) < size or len({l["game"] for l in cand}) < 2:
                continue
            t = tables(q, [(l["id"], "over") for l in cand])
            fp = 1.0
            for l in cand:
                fp *= l["factor"]
            rec = {"kind": "SLIP", "n": size, "factors": [l["factor"] for l in cand], "fprod": round(fp, 4),
                   "n_games": len({l["game"] for l in cand}), **t}
            out.append(rec)
            print(json.dumps(rec), flush=True)
            made += 1
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = f"nba/data/pp_payouts/pp_demon_flex_probe_{stamp}.json"
    with open(path, "w") as fh:
        json.dump({"legs": legs, "slips": out, "partner": partner}, fh)
    print(f"DONE {len(legs)} legs priced, {len(out)} slips quoted ({sum(1 for s in out if s['status'] == 200)} answered) -> {path}")


if __name__ == "__main__":
    main()
