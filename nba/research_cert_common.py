"""shared metrics for the certification scripts (flat 1u a slip; day-blocked)"""
import collections


def name_ids(conn, norm):
    """normalized player name -> NBA player id, only when the name maps to exactly one id (players + aliases)"""
    by = {}
    for fn, nid in conn.execute("SELECT full_name, nba_player_id::text FROM nba_ref.players WHERE nba_player_id IS NOT NULL").fetchall():
        by.setdefault(norm(fn), set()).add(nid)
    for al, nid in conn.execute("SELECT alias_value, nba_player_id::text FROM nba_ref.player_aliases WHERE nba_player_id IS NOT NULL").fetchall():
        by.setdefault(norm(al), set()).add(nid)
    return {k: next(iter(v)) for k, v in by.items() if len(v) == 1}


def season_of(d):
    y = d.year if d.month >= 8 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


def stat(items):
    """items: [(day, profit, void)] -> metrics dict. Drawdown on the slate-cumulative curve; drought = consecutive slates with net <= 0."""
    by = collections.OrderedDict()
    for d, p, v in sorted(items, key=lambda x: x[0]):
        by[d] = by.get(d, 0.0) + p
    n = len(items)
    if not n:
        return None
    net = sum(p for _, p, _ in items)
    wins = sum(1 for _, p, _ in items if p > 1e-9)
    voids = sum(1 for *_, v in items if v)
    cum = peak = dd = 0.0
    cur = dry = loss = 0
    worst, best = 1e9, -1e9
    for d, x in by.items():
        cum += x; peak = max(peak, cum); dd = max(dd, peak - cum)
        if x <= 1e-9:
            cur += 1; dry = max(dry, cur)
        else:
            cur = 0
        if x < -1e-9:
            loss += 1
        worst = min(worst, x); best = max(best, x)
    vals = list(by.values())
    top3 = sum(sorted((p for _, p, _ in items), reverse=True)[:3])
    ex3 = (net - top3) / (n - 3) if n > 3 else 0.0      # ROI with the 3 biggest winning slips removed: how much of the edge is jackpot luck
    return dict(ex3=ex3, n=n, slates=len(by), win=wins / n, roi=net / n, net=net, dd=dd, dry=dry, loss=loss / len(by), worst=worst, best=best, voids=voids,
                last14=sum(vals[-14:]), perday=n / len(by))


def line(label, s):
    if not s:
        return f"{label:34s} -"
    return (f"{label:34s} {s['n']:4d} sl {s['slates']:3d} slates {s['perday']:.1f}/day win {100 * s['win']:4.1f}% ROI {100 * s['roi']:+7.1f}% net {s['net']:+7.1f} "
            f"exTop3 {100 * s['ex3']:+6.1f}% dd {s['dd']:5.1f} drought {s['dry']:2d} losing {100 * s['loss']:4.1f}% worst {s['worst']:+5.1f} best {s['best']:+5.1f} voids {s['voids']} last14 {s['last14']:+5.1f}")


def report(name, recs, seasons=None):
    """recs: [(season, day, profit, void)] for ONE strategy -> printed lines per season + ALL"""
    seasons = seasons or sorted({r[0] for r in recs})
    for sy in seasons:
        it = [(d, p, v) for (s, d, p, v) in recs if s == sy]
        print(line(f"{name} {sy}", stat(it)), flush=True)
    print(line(f"{name} ALL", stat([(d, p, v) for (s, d, p, v) in recs])), flush=True)


def xdump(app, unit, season, d, structure, profit, legs, cands=(), n=10):
    """CERT_DUMP=1: one XD| line per replayed slip (legs + the unit's next-ranked candidates) for the cross-app exposure simulation"""
    import json as _j
    import os as _o
    if _o.environ.get("CERT_DUMP") != "1":
        return

    def enc(l):
        if isinstance(l, (tuple, list)):       # (player, event_id, hit, m, side, prop, line)
            h = l[2]
            return [str(l[0]), str(l[5]) if len(l) > 5 else "", str(l[4]), float(l[6]) if len(l) > 6 and l[6] == l[6] else None,
                    None if h is None or h != h else int(bool(h)), float(l[3]), str(l[1]), "", "", None]
        h = l.get("hit")
        m = l.get("m") if l.get("m") is not None else l.get("factor")
        ln = l.get("line")
        return [str(l.get("player") or l.get("name") or l.get("player_id") or l.get("pid")), str(l.get("prop")), str(l.get("side")),
                float(ln) if ln is not None else None, None if h is None else int(bool(h)), float(m) if m is not None else 1.0,
                str(l.get("event_id")), str(l.get("team") if l.get("team") is not None else l.get("team_id")),
                str(l.get("tier") or l.get("kind") or ""), round(float(l["p"]), 3) if l.get("p") is not None else None]
    L = [enc(l) for l in legs]
    on = {x[0] for x in L}
    C = []
    for c in cands or ():
        e = enc(c)
        if e[0] in on or any(e[0] == y[0] for y in C):
            continue
        C.append(e)
        if len(C) >= n:
            break
    print("XD|" + _j.dumps({"a": app, "u": unit, "s": str(season), "d": str(d), "st": structure, "pr": round(float(profit), 4), "L": L, "C": C}, separators=(",", ":")), flush=True)
