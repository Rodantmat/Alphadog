#!/usr/bin/env python3
"""
SLEEPER TEST SLIPS (owner 2026-11-18 14:43 PT: "give me the deep links that I can just click and see the real multipliers"). No login, read-only: reads Sleeper's public
NBA lines (lines/available), builds a spread of test slips (3-6 picks; low / mid / high / mixed multipliers; some with a same-game pair), prints for each the legs, the share
model's Flex tiers and the Max, and the app deep link (entry_prefill) that opens the slip in the Sleeper app. Nothing is placed. Env: TL_SEED (default 7).
"""
import itertools
import json
import math
import os
import random
import urllib.request
from collections import defaultdict

UA = {"user-agent": "Mozilla/5.0", "accept": "application/json", "referer": "https://sleeper.com/"}
SH = {3: (1.0011, 0.3341, 0.0), 4: (1.0801, 0.2698, 0.0), 5: (1.1461, 0.3266, 0.0723), 6: (1.1969, 0.1995, 0.0402)}
MAXB = {2: 1.0, 3: 1.0797, 4: 1.101, 5: 1.174, 6: 1.276}


def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read())


def es(u, k):
    return sum(math.prod(c) for c in itertools.combinations(u, k))


def tiers(m):
    n = len(m)
    E, a, b = SH[n]
    pall = 1 / math.prod(m)
    u = [1 - 1 / x for x in m]
    d = [x - 1 for x in m]
    e1, e2 = sum(u), es(u, 2)
    s2 = b * e2
    s1 = a * e1 - 2 * b * e2
    s0 = E - s1 - s2
    return s0 / pall, s1 / (pall * sum(d)), (s2 / (pall * es(d, 2)) if b else None)


def main():
    rnd = random.Random(int(os.getenv("TL_SEED", "7")))
    doc = get("https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true")
    pl = get("https://api.sleeper.app/v1/players/nba")
    nba = [ln for ln in doc if ln.get("sport") == "nba" and ln.get("subject_type") == "player"]
    print(f"TL|board lines {len(doc)}, NBA player lines {len(nba)}; line keys {sorted(nba[0].keys()) if nba else None}")
    if nba:
        print("TL|option sample " + json.dumps(nba[0]["options"][0])[:260])
        print("TL|line types " + str(sorted({str(ln.get('line_type')) for ln in nba})) + " statuses " + str(sorted({str(ln.get('status')) for ln in nba})))
    legs = []
    for ln in nba:
        if str(ln.get("line_type") or "normal") not in ("normal", "None") or len(ln.get("options") or []) < 2:
            continue
        p = pl.get(str(ln.get("subject_id"))) or {}
        name = p.get("full_name") or (str(p.get("first_name") or "") + " " + str(p.get("last_name") or "")).strip() or str(ln.get("subject_id"))
        for o in ln["options"]:
            try:
                m = float(o.get("payout_multiplier"))
            except (TypeError, ValueError):
                continue
            if o.get("line_id") is None or not (1.1 <= m <= 4.5):
                continue
            legs.append({"id": str(o["line_id"]), "m": m, "g": ln.get("game_id"), "team": ln.get("subject_team") or p.get("team"), "pid": ln.get("subject_id"),
                         "name": name, "prop": ln.get("wager_type"), "side": o.get("outcome"), "line": o.get("outcome_value")})
    games = defaultdict(list)
    for l in legs:
        games[l["g"]].append(l)
    print(f"TL|usable legs {len(legs)} in {len(games)} games")

    def pick(n, lo, hi, sg=None, big=False):
        """n legs, multipliers in [lo, hi], one per game and player; sg='T' / 'O' = the first two legs share a game (same team / other team)"""
        for _ in range(4000):
            out, usedg, usedp = [], set(), set()
            if sg:
                g = rnd.choice([g for g, v in games.items() if len(v) > 6])
                c = [l for l in games[g] if lo <= l["m"] <= hi]
                rnd.shuffle(c)
                a = c[0] if c else None
                b = next((l for l in c[1:] if l["pid"] != a["pid"] and ((l["team"] == a["team"]) == (sg == "T"))), None) if a else None
                if not b:
                    continue
                out, usedg, usedp = [a, b], {g}, {a["pid"], b["pid"]}
            pool = [l for l in legs if lo <= l["m"] <= hi]
            rnd.shuffle(pool)
            if big and not sg:
                bl = [l for l in legs if 3.0 <= l["m"] <= 4.5]
                if bl:
                    x = rnd.choice(bl)
                    out.append(x); usedg.add(x["g"]); usedp.add(x["pid"])
            for l in pool:
                if len(out) == n:
                    break
                if l["g"] in usedg or l["pid"] in usedp:
                    continue
                out.append(l); usedg.add(l["g"]); usedp.add(l["pid"])
            if len(out) == n and len({l["team"] for l in out}) >= 2:
                return out
        return None

    plan = [("A", 3, 1.15, 1.5, None, False, "3-pick, low multipliers"), ("B", 3, 1.9, 2.7, None, False, "3-pick, high multipliers"),
            ("C", 4, 1.3, 2.2, None, False, "4-pick, mixed"), ("D", 4, 1.9, 2.7, None, False, "4-pick, high"),
            ("E", 5, 1.25, 1.6, None, False, "5-pick, low"), ("F", 5, 1.6, 1.95, None, False, "5-pick, middle"), ("G", 5, 2.0, 2.6, None, False, "5-pick, high"),
            ("H", 5, 1.4, 2.2, None, True, "5-pick, mixed with one 3x+ leg"), ("I", 6, 1.25, 1.6, None, False, "6-pick, low"), ("J", 6, 1.7, 2.4, None, False, "6-pick, high"),
            ("K", 5, 1.4, 2.3, "T", False, "5-pick, two legs SAME GAME same team"), ("L", 5, 1.4, 2.3, "O", False, "5-pick, two legs SAME GAME opposite teams"),
            ("M", 6, 1.4, 2.2, "T", False, "6-pick, two legs SAME GAME same team"), ("N", 3, 1.4, 2.2, "O", False, "3-pick, two legs SAME GAME opposite teams")]
    for tag, n, lo, hi, sg, big, desc in plan:
        s = pick(n, lo, hi, sg, big)
        if not s:
            print(f"TL|{tag} {desc}: could not be built on this board")
            continue
        m = [l["m"] for l in s]
        t0, t1, t2 = tiers(m)
        print(f"TL|{tag} {desc}")
        for l in s:
            print(f"TL|{tag}   {l['name']} ({l['team']}) {l['prop']} {l['side']} {l['line']}  x{l['m']}")
        print(f"TL|{tag}   MY NUMBERS -> Flex: all hit {t0:.2f}x | 1 miss {t1:.2f}x" + (f" | 2 misses {t2:.2f}x" if t2 else "") + f" || Max {math.prod(m) * MAXB[n]:.2f}x")
        print(f"TL|{tag}   LINK https://sleeper.onelink.me/GF91?deep_link_value=entry_prefill&af_dp=sleeper://&deep_link_sub1=" + ",".join(l["id"] for l in s))


if __name__ == "__main__":
    main()
