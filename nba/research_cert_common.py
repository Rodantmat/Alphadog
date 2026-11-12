"""shared metrics for the certification scripts (flat 1u a slip; day-blocked)"""
import collections


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
            f"dd {s['dd']:5.1f} drought {s['dry']:2d} losing {100 * s['loss']:4.1f}% worst {s['worst']:+5.1f} best {s['best']:+5.1f} voids {s['voids']} last14 {s['last14']:+5.1f}")


def report(name, recs, seasons=None):
    """recs: [(season, day, profit, void)] for ONE strategy -> printed lines per season + ALL"""
    seasons = seasons or sorted({r[0] for r in recs})
    for sy in seasons:
        it = [(d, p, v) for (s, d, p, v) in recs if s == sy]
        print(line(f"{name} {sy}", stat(it)), flush=True)
    print(line(f"{name} ALL", stat([(d, p, v) for (s, d, p, v) in recs])), flush=True)
