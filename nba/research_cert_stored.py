#!/usr/bin/env python3
"""CERTIFICATION of the stored graded slips of the friend (Jon) or Jessi page, one app per process (FR_APP = PP | UD | SLEEPER | FLIFF, FR_TIER = friend | jessi). READ-ONLY.
Independent re-grade: every graded slip's hits are recomputed from the box score (friend_engine.outcome) and its payout from the app's law (friend_engine.pay_of)
and compared with what is stored (hit flags, multiplier, profit). Then per strategy and per season: slips, win%, ROI, net, max drawdown (slate-cumulative), longest
slate drought (consecutive slates with net <= 0), losing slates %, worst / best slate, voids; plus the last 14 slates. Flat 1u a slip."""
import collections
import json
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import friend_engine as FE   # noqa: E402

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
if FE.FAPP == "PP":
    FE.PC.SE.flex_alt_tiers(); FE.PC.SE.payout_v3_rules()
TIER = FE.TIER
rows = conn.execute("""SELECT game_date, strategy, slip_no, structure, size, legs, multiplier, profit FROM nba_friend.slips
                       WHERE app=%s AND status='graded' ORDER BY game_date, strategy, slip_no""", (FE.APP_KEY,)).fetchall()
print(f"CERT {TIER} {FE.APP_KEY}: {len(rows)} graded slips", flush=True)
NAMEID = {}
_names = sorted({l.get("player") for r in rows for l in (r[5] if isinstance(r[5], list) else json.loads(r[5])) if l.get("player") and not l.get("player_id")})
if _names:
    for nm, nid in conn.execute("""SELECT n.n, p.nba_player_id::text FROM (SELECT x AS n, nba_ref.norm_name(x) AS k FROM unnest(%s::text[]) x) n
                                   JOIN nba_ref.player_name_map m ON m.norm_name = n.k JOIN nba_ref.players p ON p.player_id = m.player_id""", (_names,)).fetchall():
        NAMEID[nm] = nid
    print(f"names without player_id: {len(_names)}, resolved {len(NAMEID)}", flush=True)
byday = collections.defaultdict(list)
for r in rows:
    byday[r[0]].append(r)
mism_hit = mism_pay = mism_prof = 0
ex = []
recs = []     # (season, strategy, day, profit, voided, structure, size)
for d in sorted(byday):
    sbox = FE.box(conn, d)
    for _d, code, no, st, size, legs, mult, prof in byday[d]:
        legs = legs if isinstance(legs, list) else json.loads(legs)
        legs2 = []
        for l in legs:
            l = dict(l)
            if not l.get("player_id") and l.get("player"):
                l["player_id"] = NAMEID.get(l["player"])
            h = FE.outcome(sbox, l)
            if (l.get("hit") if l.get("hit") is not None else None) != h:
                mism_hit += 1
                if len(ex) < 12:
                    ex.append(f"HIT {d} {code}#{no} {l.get('player')} {l.get('prop')} {l.get('side')} {l.get('line')} stored {l.get('hit')} box {h}")
            l["hit"] = h
            legs2.append(l)
        try:
            m = float(FE.pay_of(legs2, st))
        except Exception as e:
            m = float("nan")
            if len(ex) < 12:
                ex.append(f"PAY ERR {d} {code}#{no}: {e}")
        if mult is None or abs(float(mult) - m) > 1e-6:
            mism_pay += 1
            if len(ex) < 12:
                ex.append(f"PAYOUT {d} {code}#{no} {st} stored {mult} recomputed {m}")
        if prof is None or abs(float(prof) - (float(mult) - 1.0)) > 1e-6:
            mism_prof += 1
        void = abs(m - 1.0) < 1e-9 and sum(1 for l in legs2 if l["hit"] is not None) < 2
        recs.append((FE.SEASON_LABEL(d), code, d, m - 1.0, void, st, size))
print(f"RE-GRADE: hit flags differing from the box score {mism_hit}; multipliers differing from the app law {mism_pay}; profit != multiplier-1 {mism_prof}", flush=True)
for e in ex:
    print("  ", e, flush=True)


def stat(items):
    """items: list of (day, profit, void) -> dict"""
    by = collections.OrderedDict()
    for d, p, v in sorted(items, key=lambda x: x[0]):
        by.setdefault(d, 0.0)
        by[d] += p
    n = len(items); net = sum(p for _, p, _ in items)
    wins = sum(1 for _, p, _ in items if p > 1e-9); voids = sum(1 for *_, v in items if v)
    cum = peak = dd = 0.0; cur = dry = 0; loss = 0; worst = 1e9; best = -1e9
    for d, x in by.items():
        cum += x; peak = max(peak, cum); dd = max(dd, peak - cum)
        if x <= 1e-9:
            cur += 1; dry = max(dry, cur)
        else:
            cur = 0
        if x < -1e-9:
            loss += 1
        worst = min(worst, x); best = max(best, x)
    return dict(n=n, slates=len(by), win=wins / max(n, 1), roi=net / max(n, 1), net=net, dd=dd, dry=dry, loss=loss / max(len(by), 1), worst=worst, best=best, voids=voids, last14=sum(list(by.values())[-14:]))


def line(label, s):
    return (f"{label:30s} {s['n']:4d} sl {s['slates']:3d} slates win {100 * s['win']:4.1f}% ROI {100 * s['roi']:+7.1f}% net {s['net']:+7.1f} dd {s['dd']:5.1f} "
            f"drought {s['dry']:2d} losing {100 * s['loss']:4.1f}% worst {s['worst']:+5.1f} best {s['best']:+5.1f} voids {s['voids']} last14 {s['last14']:+5.1f}")


seasons = sorted({r[0] for r in recs})
strategies = sorted({r[1] for r in recs})
print("\n=== per strategy per season ===", flush=True)
for code in strategies:
    for sy in seasons:
        it = [(d, p, v) for (s2, c, d, p, v, *_x) in recs if c == code and s2 == sy]
        if it:
            sz = [r for r in recs if r[1] == code][0]
            print(line(f"{FE.APP_KEY} {code} {sz[6]}-{sz[5]} {sy}", stat(it)), flush=True)
    it = [(d, p, v) for (s2, c, d, p, v, *_x) in recs if c == code]
    print(line(f"{FE.APP_KEY} {code} ALL", stat(it)), flush=True)
print("\n=== whole app set per season ===", flush=True)
for sy in seasons:
    it = [(d, p, v) for (s2, c, d, p, v, *_x) in recs if s2 == sy]
    print(line(f"{FE.APP_KEY} SET {sy}", stat(it)), flush=True)
print(line(f"{FE.APP_KEY} SET ALL", stat([(d, p, v) for (s2, c, d, p, v, *_x) in recs])), flush=True)
