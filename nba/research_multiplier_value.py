#!/usr/bin/env python3
"""
MULTIPLIER VALUE PROGRAM (strategy §31aa, 2026-10-09; owner: "now is the time to understand multipliers … use the hit rate of
the legs we have on backtest, understand what multiplier a leg needs to be worth it, then see the multiplier of the day … test
it out, see if it's worth it, or we just keep the strategies we have … layer by layer").

THE IDEA, as a number. A pick'em leg enters a slip as a factor. Per-leg-multiplier apps (Underdog, Sleeper, Pick6, ParlayPlay)
pay base(n) x prod(m_i); flat-table apps (PrizePicks standards, Betr) are the m = 1 case. So a leg's contribution to the
slip's expected value is  v = p x m x base(n)^(1/n)  and the leg is worth it when v >= 1, i.e. when the day's multiplier
m >= m* = 1 / (p x base(n)^(1/n)). p is the leg's HIT RATE FROM THE BACKTEST - either the certified cell's hit rate (the
cells the engines already select) or the model probability calibrated on backtest outcomes (any leg). Reference root:
Underdog 2-pick Standard 3.5^(1/2) = 1.8708 (the most lenient Underdog break-even, 53.45%); PrizePicks 5-Flex on standard
legs 1 / 0.5425 = 1.8433. Pick6's base table is not published (peer-pool origins, guaranteed floors) - its legs are read as
value against an even line (hit x m / 0.5).

STAGES (each prints its table and writes nba_score.mvp_*):
  law     - each app's pricing law from its own history: realized hit x m by multiplier bucket (PrizePicks factor from
            pp_leg_price, Underdog modifiers, Pick6 multipliers decoded) - the house edge on mains vs alternates.
  calib   - the backtest hit-rate map: isotonic final_hp -> realized hit per (side, prop, main/alt), fitted on PrizePicks legs
            of ONE season, applied to every app in the OTHER season (Pick6 is a third app the map never saw).
  gate    - the price gate per app, out of sample: legs with predicted v >= tau -> realized v (day-blocked CI), legs per day.
  udsim   - Underdog slips built from the price gate alone (any leg, one per game), tau chosen on the training season, scored
            on the other; vs the certified Underdog P5 portfolio on the same seasons.
  xapp    - the owner's case "apps without a backtest": the PrizePicks engine's certified legs (live strategies) priced with
            ANOTHER app's multiplier of the day - Underdog (two seasons, real payouts: slips built and graded) and Pick6
            (2025-26, per leg) - p = the certified cell's out-of-season hit rate, gate p x m x root >= tau.
  layer   - the gate as a layer on the certified slips: Underdog P5 and the PrizePicks live strategies, slips split by whether
            every leg clears the gate / by slip value tercile -> ROI.
Env: DATABASE_URL, MVP_STAGES (all), MVP_BOOT (4000).
"""
import json
import os
import random
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as LS            # noqa: E402  the live PrizePicks strategy list
import ud_live_slip_engine as UL         # noqa: E402  the live Underdog portfolios
import research_postseason_program as R  # noqa: E402  Underdog payout tables + grade (the certified formula)

STAGES = [s.strip() for s in (os.environ.get('MVP_STAGES') or 'law,calib,gate,udsim,xapp,layer').split(',') if s.strip()]
BOOT = int(os.environ.get('MVP_BOOT') or '4000')
S1, S2 = '2024-25', '2025-26'
OTHER = {S1: S2, S2: S1}
SEASON_BOUNDS = {S1: ('2024-10-22', '2025-04-13'), S2: ('2025-10-21', '2026-04-12')}
ROOT_UD2 = 3.5 ** 0.5                 # 1.8708
ROOT_PP5F = 1 / 0.5425                # 1.8433
TAUS = [0.95, 1.00, 1.02, 1.04, 1.06, 1.08, 1.10, 1.15, 1.20]
rng = np.random.default_rng(7)
random.seed(7)

PROP_CASE = """CASE replace(replace({mk},'player_',''),'_alternate','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made'
  WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast'
  WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(replace({mk},'player_',''),'_alternate','') END"""


def log(*a):
    print(*a, flush=True)


def f(x, pct=True, d=1):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return 'n/a'
    return f"{100 * x:+.{d}f}%" if pct else f"{x:.{d}f}"


def boot_ci(by_day, B=None):
    """day-blocked bootstrap of a per-leg mean: by_day = {day: [values]} -> (mean, lo, hi)"""
    B = B or BOOT
    days = list(by_day)
    if not days:
        return None, None, None
    s = np.array([sum(by_day[d]) for d in days]); n = np.array([len(by_day[d]) for d in days])
    idx = rng.integers(0, len(days), size=(B, len(days)))
    m = s[idx].sum(axis=1) / n[idx].sum(axis=1)
    return float(s.sum() / n.sum()), float(np.quantile(m, 0.025)), float(np.quantile(m, 0.975))


def boot_roi(day_items, B=None):
    """day-blocked bootstrap of slip ROI: day_items = [(stake, payout)] per day -> (roi, lo)"""
    B = B or BOOT
    if not day_items:
        return None, None
    a = np.array([x[0] for x in day_items]); b = np.array([x[1] for x in day_items])
    roi = float(b.sum() / a.sum() - 1)
    if len(a) < 8:
        return roi, None
    idx = rng.integers(0, len(a), size=(B, len(a)))
    m = b[idx].sum(axis=1) / a[idx].sum(axis=1) - 1
    return roi, float(np.quantile(m, 0.025))


# ------------------------------------------------------------------ data
PP_SQL = """SELECT season, game_date, nba_ref.norm_name(player) nm, prop, side, line::float, tier, factor, score, hit
            FROM nba_score.tier_map_legs WHERE rank_key='final_hp' AND hit IS NOT NULL AND score IS NOT NULL AND factor IS NOT NULL"""
UD_SQL = """SELECT l.season, l.game_date, l.player nm, l.prop, l.side, l.line::float, l.tier, l.factor, l.score, l.hit, w.event_id
            FROM nba_score.ud_tier_map_legs_curr l
            JOIN (SELECT game_date, pn, prop, side, line, min(event_id) event_id FROM nba_score.ud_window_legs GROUP BY 1,2,3,4,5) w
              ON w.game_date=l.game_date AND w.pn=l.player AND w.prop=l.prop AND w.side=l.side AND w.line=l.line
            WHERE l.rank_key='final_hp' AND l.hit IS NOT NULL AND l.score IS NOT NULL AND l.factor IS NOT NULL"""
PICK6_SQL = f"""
WITH p AS (SELECT DISTINCT ON (b.game_date, nba_ref.norm_name(b.player), b.market_key, b.side, b.line)
             b.game_date, b.event_id, b.player, nba_ref.norm_name(b.player) nm, b.market_key, b.side, b.line, b.multiplier::float m
           FROM nba_market.board_snapshots b
           WHERE b.bookmaker='pick6' AND b.snapshot_label='window' AND b.multiplier IS NOT NULL AND b.game_date BETWEEN %s AND %s
           ORDER BY b.game_date, nba_ref.norm_name(b.player), b.market_key, b.side, b.line, b.fetched_at DESC),
o AS (SELECT DISTINCT ON (game_date, player, market_key, line) game_date, player, market_key, line, leg_result
      FROM nba_market.board_outcomes WHERE game_date BETWEEN %s AND %s AND leg_result IN ('over_win','under_win')
      ORDER BY game_date, player, market_key, line)
SELECT p.game_date, p.event_id, p.nm, {PROP_CASE.format(mk='p.market_key')} prop, p.side, p.line::float, p.m,
       (p.market_key LIKE '%%alternate') alt,
       ((p.side='Over' AND o.leg_result='over_win') OR (p.side='Under' AND o.leg_result='under_win'))::int hit, f.final_hp::float
FROM p JOIN o ON o.game_date=p.game_date AND o.player=p.player AND o.market_key=p.market_key AND o.line=p.line
LEFT JOIN nba_ref.player_name_map pm ON pm.norm_name=p.nm
LEFT JOIN nba_score.final_hp f ON f.game_date=p.game_date AND f.player_id=pm.player_id::text AND f.prop={PROP_CASE.format(mk='p.market_key')}
  AND f.side=p.side AND f.line=p.line"""


def fetch(conn, sql, params=None, cols=None):
    out = []
    with conn.cursor(name=f'c{random.randint(0, 10 ** 9)}') as cur:
        cur.itersize = 50000
        cur.execute(sql, params)
        names = None
        for row in cur:
            if names is None:
                names = cols or [d.name for d in cur.description]
            out.append(dict(zip(names, row)))
    return out


def season_of(d):
    s = str(d)
    for k, (a, b) in SEASON_BOUNDS.items():
        if a <= s <= b:
            return k
    return None


# ------------------------------------------------------------------ calibration (the backtest hit-rate map)
EDGES = np.round(np.arange(0.0, 1.0001, 0.02), 4)


def pava(y, w):
    """weighted isotonic (non-decreasing) fit"""
    blocks = []   # [value, weight, count]
    for yi, wi in zip(y, w):
        blocks.append([yi, wi, 1])
        while len(blocks) > 1 and blocks[-2][0] > blocks[-1][0]:
            v2, w2, c2 = blocks.pop(); v1, w1, c1 = blocks.pop()
            ww = w1 + w2
            blocks.append([(v1 * w1 + v2 * w2) / ww if ww else 0.0, ww, c1 + c2])
    out = []
    for v, _, c in blocks:
        out += [v] * c
    return out


class Calibrator:
    """final_hp -> realized hit, isotonic within (side, prop, main/alt); fallback (side, main/alt); fitted on legs with hits"""
    def __init__(self, legs):
        self.maps = {}
        groups = defaultdict(list)
        for l in legs:
            alt = l['tier'] != 'R'
            groups[(l['side'], l['prop'], alt)].append(l)
            groups[(l['side'], '*', alt)].append(l)
        for k, g in groups.items():
            if len(g) < (2000 if k[1] != '*' else 1):
                continue
            s = np.zeros(len(EDGES)); n = np.zeros(len(EDGES))
            for l in g:
                b = min(int(l['score'] / 0.02), len(EDGES) - 1)
                s[b] += l['hit']; n[b] += 1
            idx = [i for i in range(len(EDGES)) if n[i] > 0]
            fit = pava([s[i] / n[i] for i in idx], [n[i] for i in idx])
            table = np.full(len(EDGES), np.nan)
            for i, v in zip(idx, fit):
                table[i] = v
            # fill empty bins from the nearest fitted neighbours (monotone by construction)
            last = None
            for i in range(len(table)):
                if np.isnan(table[i]):
                    table[i] = last if last is not None else np.nan
                else:
                    last = table[i]
            nxt = None
            for i in range(len(table) - 1, -1, -1):
                if np.isnan(table[i]):
                    table[i] = nxt if nxt is not None else 0.5
                else:
                    nxt = table[i]
            self.maps[k] = table

    def p(self, side, prop, alt, score):
        t = self.maps.get((side, prop, alt))
        if t is None:
            t = self.maps.get((side, '*', alt))
        if t is None or score is None:
            return None
        return float(t[min(int(score / 0.02), len(EDGES) - 1)])


# ------------------------------------------------------------------ stages
def stage_law(conn, pp, ud, p6):
    log("\n================ LAW - each app's own pricing law (realized hit x m by multiplier bucket) ================")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.mvp_law (app text, bucket text, n int, m_avg double precision, hit double precision,
                    hit_x_m double precision, implied_p double precision, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.mvp_law")
    cuts = [0.0, 0.65, 0.75, 0.85, 0.95, 1.0001, 1.3, 1.6, 2.0, 3.0, 5.0, 1e9]
    for app, legs, mk in (('prizepicks', pp, 'factor'), ('underdog', ud, 'factor'), ('pick6', p6, 'm')):
        log(f"\n  {app}: {len(legs):,} graded legs")
        log(f"    {'multiplier':<14}{'legs':>9}{'avg m':>8}{'hit':>8}{'hit x m':>9}   (an even, fair line reads 0.500)")
        rows = []
        for a, b in zip(cuts[:-1], cuts[1:]):
            g = [l for l in legs if a <= l[mk] < b]
            if not g:
                continue
            m = np.mean([l[mk] for l in g]); h = np.mean([l['hit'] for l in g]); hm = np.mean([l['hit'] * l[mk] for l in g])
            lab = '1.00 (main)' if a == 0.95 else f"{a:.2f}-{min(b, 99):.2f}"
            rows.append((app, lab, len(g), float(m), float(h), float(hm), float(0.5 / m)))
            log(f"    {lab:<14}{len(g):>9,}{m:>8.2f}{h:>8.3f}{hm:>9.3f}")
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO nba_score.mvp_law (app, bucket, n, m_avg, hit, hit_x_m, implied_p) VALUES (%s,%s,%s,%s,%s,%s,%s)", rows)
    conn.commit()


def attach_pcal(cal_by_test, legs, app):
    for l in legs:
        s = l.get('season') or season_of(l['game_date'])
        l['season'] = s
        cal = cal_by_test.get(s)
        alt = (l['tier'] != 'R') if app != 'pick6' else bool(l['alt'])
        l['pcal'] = cal.p(l['side'], l['prop'], alt, l['score']) if (cal and l.get('score') is not None) else None


def stage_calib(conn, pp, ud, p6):
    log("\n================ CALIB - backtest hit-rate map, fitted on PrizePicks one season, applied to the other ================")
    cals = {}
    for test in (S1, S2):
        train = [l for l in pp if l['season'] == OTHER[test]]
        cals[test] = Calibrator(train)
        log(f"  map for {test}: fitted on {len(train):,} PrizePicks legs of {OTHER[test]} ({len(cals[test].maps)} isotonic maps)")
    for app, legs in (('prizepicks', pp), ('underdog', ud), ('pick6', p6)):
        attach_pcal(cals, legs, app)
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.mvp_calib (app text, season text, bin text, n int, raw_p double precision,
                    pcal double precision, hit double precision, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.mvp_calib")
    rows = []
    for app, legs in (('prizepicks', pp), ('underdog', ud), ('pick6', p6)):
        for s in (S1, S2):
            g = [l for l in legs if l['season'] == s and l['pcal'] is not None]
            if not g:
                continue
            log(f"\n  {app} {s} (map from {OTHER[s]}): {len(g):,} legs   reliability: raw model p / calibrated p / realized hit")
            for a, b in ((0, .35), (.35, .45), (.45, .5), (.5, .55), (.55, .6), (.6, .65), (.65, .7), (.7, .8), (.8, 1.01)):
                h = [l for l in g if a <= l['score'] < b]
                if len(h) < 50:
                    continue
                rp = np.mean([l['score'] for l in h]); pc = np.mean([l['pcal'] for l in h]); hr = np.mean([l['hit'] for l in h])
                rows.append((app, s, f"{a:.2f}-{b:.2f}", len(h), float(rp), float(pc), float(hr)))
                log(f"    model p {a:.2f}-{b:.2f}: {len(h):>8,} legs   {rp:.3f} / {pc:.3f} / {hr:.3f}")
    with conn.cursor() as cur:
        cur.executemany("INSERT INTO nba_score.mvp_calib (app, season, bin, n, raw_p, pcal, hit) VALUES (%s,%s,%s,%s,%s,%s,%s)", rows)
    conn.commit()
    return cals


def stage_gate(conn, pp, ud, p6):
    log("\n================ GATE - p_cal x m x root >= tau, out of sample (realized value = hit x m x root; 1.00 = break-even) ================")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.mvp_gate (app text, season text, tau double precision, legs int, per_day double precision,
                    v_pred double precision, v_real double precision, lo double precision, hi double precision, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.mvp_gate")
    rows = []
    for app, legs, mk, root in (('prizepicks', pp, 'factor', ROOT_PP5F), ('underdog', ud, 'factor', ROOT_UD2), ('pick6', p6, 'm', 2.0)):
        log(f"\n  {app} (root {root:.4f}{' = even line, base table unpublished' if app == 'pick6' else ''})")
        for s in (S1, S2):
            g = [l for l in legs if l['season'] == s and l.get('pcal') is not None]
            if not g:
                continue
            ndays = len({l['game_date'] for l in g})
            log(f"    {s}: {len(g):,} legs over {ndays} days (unfiltered realized value {np.mean([l['hit'] * l[mk] * root for l in g]):.3f})")
            log(f"      {'tau':>5}{'legs':>9}{'/day':>7}{'v pred':>8}{'v real':>8}{'95% CI':>17}")
            for tau in TAUS:
                sel = [l for l in g if l['pcal'] * l[mk] * root >= tau]
                if len(sel) < 30:
                    continue
                by = defaultdict(list)
                for l in sel:
                    by[l['game_date']].append(l['hit'] * l[mk] * root)
                mean, lo, hi = boot_ci(by)
                vp = float(np.mean([l['pcal'] * l[mk] * root for l in sel]))
                rows.append((app, s, tau, len(sel), len(sel) / ndays, vp, mean, lo, hi))
                log(f"      {tau:>5.2f}{len(sel):>9,}{len(sel) / ndays:>7.1f}{vp:>8.3f}{mean:>8.3f}   [{lo:.3f}, {hi:.3f}]")
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.mvp_gate (app, season, tau, legs, per_day, v_pred, v_real, lo, hi)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""", rows)
    conn.commit()


def ud_disc(m):
    return m * (0.995 if abs(m - 1.0) < 1e-9 else 0.99)       # §30t confidence discount (the certified Underdog convention)


def build_ud_day(cands, size):
    """greedy, best value first, one pick per game and per player"""
    slip, games, players = [], set(), set()
    for l in cands:
        if l['event_id'] in games or l['nm'] in players:
            continue
        slip.append(l); games.add(l['event_id']); players.add(l['nm'])
        if len(slip) == size:
            return slip
    return None


def sim_ud(days, tau, size, structure, value_key):
    recs = defaultdict(list)
    for d, legs in days.items():
        c = sorted((l for l in legs if l[value_key] is not None and l[value_key] >= tau), key=lambda l: -l[value_key])
        s = build_ud_day(c, size)
        if not s:
            continue
        _, pay = R.ud_grade([dict(hit=l['hit'], factor=ud_disc(l['factor'])) for l in s], structure)
        recs[legs[0]['season']].append((1.0, pay))
    return recs


UD_STRUCTS = [(2, 'standard'), (3, 'standard'), (4, 'standard'), (5, 'standard'), (6, 'flex')]


def ud_reference(conn):
    """the certified Underdog P5 portfolio (the live paper set) per season, k <= cap, final week out"""
    out = {}
    for comp, size, structure, cap in UL.PORTFOLIOS['P5']:
        rows = conn.execute("""SELECT season, game_date, sum(stake), sum(payout) FROM nba_score.ud_slip_engine_slips_dlt_orig2
                               WHERE composition=%s AND size=%s AND structure=%s AND k<=%s AND phase<>'final7' GROUP BY 1,2""",
                            (comp, size, structure, cap)).fetchall()
        for s, d, a, b in rows:
            out.setdefault((comp, size, structure), defaultdict(list))[s].append((float(a), float(b)))
    return out


def stage_udsim(conn, ud):
    log("\n================ UDSIM - Underdog slips from the price gate alone (any leg), tau chosen on the training season ================")
    for l in ud:
        l['v'] = (l['pcal'] * ud_disc(l['factor']) * ROOT_UD2) if l.get('pcal') is not None else None
    days = defaultdict(list)
    for l in ud:
        days[l['game_date']].append(l)
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.mvp_udsim (source text, structure text, tau double precision, train text, test text,
                    train_roi double precision, test_roi double precision, test_lo double precision, test_days int, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.mvp_udsim WHERE source='gate_any_leg'")
    rows = []
    for size, st in UD_STRUCTS:
        res = {tau: sim_ud(days, tau, size, st, 'v') for tau in TAUS}
        for tr, te in ((S1, S2), (S2, S1)):
            best = None
            for tau, recs in res.items():
                r, _ = boot_roi(recs.get(tr, []))
                if r is not None and len(recs.get(tr, [])) >= 60 and (best is None or r > best[1]):
                    best = (tau, r)
            if not best:
                continue
            tau = best[0]
            rt, lo = boot_roi(res[tau].get(te, []))
            rows.append(('gate_any_leg', f"{size}{st[0].upper()}", tau, tr, te, best[1], rt, lo, len(res[tau].get(te, []))))
            log(f"  {size}-{st:<9} train {tr}: best tau {tau:.2f} ROI {f(best[1])} -> test {te}: ROI {f(rt)} (lower bound {f(lo)}, {len(res[tau].get(te, []))} days)")
        log("      by tau (ROI 2024-25 / 2025-26): " + "  ".join(f"{t:.2f}: {f(boot_roi(res[t].get(S1, []))[0], d=0)}/{f(boot_roi(res[t].get(S2, []))[0], d=0)}" for t in TAUS))
    ref = ud_reference(conn)
    log("\n  reference - the certified Underdog P5 portfolio (live paper set), k <= cap, final week out:")
    for key, by in ref.items():
        log(f"    {key[0]} {key[1]}-{key[2]}: " + "  ".join(f"{s} {f(boot_roi(by.get(s, []))[0])} (lo {f(boot_roi(by.get(s, []))[1])}, {len(by.get(s, []))} d)" for s in (S1, S2)))
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.mvp_udsim (source, structure, tau, train, test, train_roi, test_roi, test_lo, test_days)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""", rows)
    conn.commit()


def pp_cert_legs(conn):
    """the PrizePicks live strategies' certified legs (k <= cap), one row per distinct leg per day, with its cell"""
    out = {}
    suffix = '_mf'
    for name, (comp, size, structure, cap, *_r) in LS.STRATEGIES.items():
        if cap == 0 or name in LS.ALLSTAR_ONLY:
            continue
        ns = '_nosteals' if name.startswith(('C_', 'D_', 'R_', 'W_')) else ''
        for d, cell, player, prop, tier, side, line, factor, hit in conn.execute(
                f"""SELECT game_date, cell, player, prop, tier, side, line::float, factor, hit FROM nba_score.slip_engine_legs{suffix}{ns}
                    WHERE composition=%s AND size=%s AND structure=%s AND k<=%s""", (comp, size, structure, cap)).fetchall():
            out[(d, player, prop, side, line)] = dict(game_date=d, cell=cell, player=player, prop=prop, tier=tier, side=side, line=line,
                                                      factor=float(factor), hit=hit)
    legs = list(out.values())
    for l in legs:
        l['season'] = season_of(l['game_date'])
    return [l for l in legs if l['season']]


def cell_rates(legs):
    """certified cell hit rate per season (distinct legs) -> p_cell for season s = the OTHER season's rate (out of sample)"""
    acc = defaultdict(lambda: [0, 0])
    for l in legs:
        if l['hit'] is None:
            continue
        a = acc[(l['cell'], l['season'])]; a[0] += l['hit']; a[1] += 1
    rate = {k: v[0] / v[1] for k, v in acc.items() if v[1] >= 30}
    for l in legs:
        l['pcell'] = rate.get((l['cell'], OTHER[l['season']]))
    return rate


def stage_xapp(conn, ud, p6):
    log("\n================ XAPP - the certified PrizePicks legs priced with another app's multiplier of the day ================")
    cert = pp_cert_legs(conn)
    cell_rates(cert)
    log(f"  certified PrizePicks legs (live strategies, k <= cap): {len(cert):,} distinct legs over {len({l['game_date'] for l in cert})} days")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.mvp_xapp (target text, season text, tau double precision, structure text, legs int,
                    days int, hit double precision, m_avg double precision, v_real double precision, roi double precision, lo double precision,
                    built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.mvp_xapp")
    out_rows = []
    # name key: Underdog's player is already normalized (pn); PrizePicks display names normalized with the same function in SQL
    names = {r[0]: r[1] for r in conn.execute("SELECT DISTINCT player, nba_ref.norm_name(player) FROM nba_score.slip_engine_legs_mf").fetchall()}
    names.update({r[0]: r[1] for r in conn.execute("SELECT DISTINCT player, nba_ref.norm_name(player) FROM nba_score.slip_engine_legs_mf_nosteals").fetchall()})
    for l in cert:
        l['nm'] = names.get(l['player'])
    for target, legs, mk, root in (('underdog', ud, 'factor', ROOT_UD2), ('pick6', p6, 'm', 2.0)):
        idx = {(l['game_date'], l['nm'], l['prop'], l['side'], l['line']): l for l in legs}
        matched = []
        for c in cert:
            t = idx.get((c['game_date'], c['nm'], c['prop'], c['side'], c['line']))
            if t is None or c['pcell'] is None:
                continue
            m = ud_disc(t[mk]) if target == 'underdog' else t[mk]
            matched.append(dict(c, m=m, event_id=t.get('event_id'), hit=t['hit'], v=c['pcell'] * m * root, nm=c['nm']))
        log(f"\n  -> {target}: {len(matched):,} of {len(cert):,} certified legs found on {target} at the same line and side")
        for s in (S1, S2):
            g = [l for l in matched if l['season'] == s]
            if not g:
                continue
            nd = len({l['game_date'] for l in g})
            log(f"    {s}: {len(g):,} legs / {nd} days, hit {np.mean([l['hit'] for l in g]):.3f}, avg m {np.mean([l['m'] for l in g]):.3f}, "
                f"share m > 1: {np.mean([l['m'] > 1.0001 for l in g]):.0%}, realized value (hit x m x root) {np.mean([l['hit'] * l['m'] * root for l in g]):.3f}")
            for tau in TAUS:
                sel = [l for l in g if l['v'] >= tau]
                if len(sel) < 30:
                    continue
                by = defaultdict(list)
                for l in sel:
                    by[l['game_date']].append(l['hit'] * l['m'] * root)
                mean, lo, hi = boot_ci(by)
                out_rows.append((target, s, tau, 'leg', len(sel), len(by), float(np.mean([l['hit'] for l in sel])), float(np.mean([l['m'] for l in sel])),
                                 mean, None, lo))
                log(f"      gate {tau:.2f}: {len(sel):>6,} legs ({len(sel) / nd:.1f}/day)  hit {np.mean([l['hit'] for l in sel]):.3f}  "
                    f"m {np.mean([l['m'] for l in sel]):.3f}  realized value {mean:.3f} [{lo:.3f}, {hi:.3f}]")
        if target == 'underdog':
            # real Underdog slips from the certified legs: one pick per game, best value first, graded with Underdog's payout
            days = defaultdict(list)
            for l in matched:
                days[l['game_date']].append(l)
            log("    Underdog slips from certified PrizePicks legs (one per game, best value first), ROI 2024-25 / 2025-26:")
            for size, st in UD_STRUCTS[:4]:
                line = []
                for tau in (0.0, 1.0, 1.04, 1.08):
                    recs = defaultdict(list)
                    for d, legs_d in days.items():
                        c = sorted((l for l in legs_d if l['v'] >= tau), key=lambda l: -l['v'])
                        sl = build_ud_day(c, size)
                        if not sl:
                            continue
                        _, pay = R.ud_grade([dict(hit=l['hit'], factor=l['m']) for l in sl], st)
                        recs[legs_d[0]['season']].append((1.0, pay))
                    r1, lo1 = boot_roi(recs.get(S1, [])); r2, lo2 = boot_roi(recs.get(S2, []))
                    for s, r, lo in ((S1, r1, lo1), (S2, r2, lo2)):
                        out_rows.append((target, s, tau, f"{size}{st[0].upper()}", None, len(recs.get(s, [])), None, None, None, r, lo))
                    line.append(f"tau {tau:.2f}: {f(r1, d=0)} ({len(recs.get(S1, []))}d, lo {f(lo1, d=0)}) / {f(r2, d=0)} ({len(recs.get(S2, []))}d, lo {f(lo2, d=0)})")
                log(f"      {size}-{st:<9} " + " | ".join(line))
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.mvp_xapp (target, season, tau, structure, legs, days, hit, m_avg, v_real, roi, lo)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", out_rows)
    conn.commit()


def stage_layer(conn):
    log("\n================ LAYER - the gate on the certified slips (p = certified cell hit rate, other season) ================")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.mvp_layer (app text, strategy text, season text, split text, slips int,
                    roi double precision, lo double precision, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.mvp_layer")
    out = []
    # Underdog P5
    for comp, size, structure, cap in UL.PORTFOLIOS['P5']:
        rows = conn.execute("""SELECT season, game_date, legs_json, stake, payout FROM nba_score.ud_slip_engine_slips_dlt_orig2
                               WHERE composition=%s AND size=%s AND structure=%s AND k<=%s AND phase<>'final7'""",
                            (comp, size, structure, cap)).fetchall()
        out += layer_split(f"ud {comp} {size}-{structure}", 'ud', rows, ROOT_UD2)
    # PrizePicks live strategies
    for name, (comp, size, structure, cap, *_r) in LS.STRATEGIES.items():
        if cap == 0 or name in LS.ALLSTAR_ONLY:
            continue
        ns = '_nosteals' if name.startswith(('C_', 'D_', 'R_', 'W_')) else ''
        rows = conn.execute(f"""SELECT season, game_date, legs_json, stake, payout FROM nba_score.slip_engine_slips_mf{ns}
                                WHERE composition=%s AND size=%s AND structure=%s AND k<=%s AND phase<>'final7'""",
                            (comp, size, structure, cap)).fetchall()
        out += layer_split(name, 'pp', rows, ROOT_PP5F)
    with conn.cursor() as cur:
        cur.executemany("INSERT INTO nba_score.mvp_layer (app, strategy, season, split, slips, roi, lo) VALUES (%s,%s,%s,%s,%s,%s,%s)", out)
    conn.commit()


def layer_split(label, app, rows, root):
    legs = []
    for s, d, lj, a, b in rows:
        lj = lj if isinstance(lj, list) else json.loads(lj)
        for l in lj:
            legs.append(dict(cell=l.get('cell'), season=s, hit=l.get('hit'), key=(d, l.get('player'), l.get('prop'), l.get('side'), l.get('line'))))
    uniq = {}
    for l in legs:
        uniq[(l['key'], l['cell'])] = l
    acc = defaultdict(lambda: [0, 0])
    for l in uniq.values():
        if l['hit'] is not None:
            a = acc[(l['cell'], l['season'])]; a[0] += l['hit']; a[1] += 1
    rate = {k: v[0] / v[1] for k, v in acc.items() if v[1] >= 30}
    slips = []
    for s, d, lj, a, b in rows:
        lj = lj if isinstance(lj, list) else json.loads(lj)
        vs = []
        for l in lj:
            p = rate.get((l.get('cell'), OTHER[s]))
            vs.append(None if p is None else p * float(l.get('factor') or 1.0) * root)
        if any(v is None for v in vs):
            continue
        slips.append((s, d, float(a), float(b), min(vs), float(np.prod(vs))))
    out = []
    for s in (S1, S2):
        g = [x for x in slips if x[0] == s]
        if len(g) < 30:
            continue
        def roi_of(sub):
            by = defaultdict(lambda: [0.0, 0.0])
            for _s, d, a, b, *_ in sub:
                by[d][0] += a; by[d][1] += b
            return boot_roi(list(by.values())), len(sub)
        allr, n_all = roi_of(g)
        passr, n_pass = roi_of([x for x in g if x[4] >= 1.0])
        failr, n_fail = roi_of([x for x in g if x[4] < 1.0])
        q = np.quantile([x[5] for x in g], [1 / 3, 2 / 3])
        t = [roi_of([x for x in g if x[5] < q[0]]), roi_of([x for x in g if q[0] <= x[5] < q[1]]), roi_of([x for x in g if x[5] >= q[1]])]
        log(f"  {label:<38} {s}: all {f(allr[0], d=0)} ({n_all}) | every leg clears {f(passr[0], d=0)} ({n_pass}) | "
            f"a leg below {f(failr[0], d=0)} ({n_fail}) | slip-value terciles {f(t[0][0][0], d=0)} / {f(t[1][0][0], d=0)} / {f(t[2][0][0], d=0)}")
        out += [(app, label, s, 'all', n_all, allr[0], allr[1]), (app, label, s, 'all_legs_clear', n_pass, passr[0], passr[1]),
                (app, label, s, 'a_leg_below', n_fail, failr[0], failr[1])]
        out += [(app, label, s, f'tercile{i + 1}', t[i][1], t[i][0][0], t[i][0][1]) for i in range(3)]
    return out


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    pp = fetch(conn, PP_SQL)
    for l in pp:
        l['factor'] = float(l['factor']); l['score'] = float(l['score'])
    ud = fetch(conn, UD_SQL)
    for l in ud:
        l['factor'] = float(l['factor']); l['score'] = float(l['score'])
    p6 = fetch(conn, PICK6_SQL, ('2025-10-21', '2026-04-12', '2025-10-21', '2026-04-12'))
    for l in p6:
        l['score'] = l.pop('final_hp'); l['tier'] = 'A' if l['alt'] else 'R'; l['season'] = S2
    log(f"legs: PrizePicks {len(pp):,} | Underdog {len(ud):,} | Pick6 {len(p6):,} (scored {sum(1 for l in p6 if l['score'] is not None):,})")
    if 'law' in STAGES:
        stage_law(conn, pp, ud, p6)
    p6s = [l for l in p6 if l['score'] is not None]
    stage_calib(conn, pp, ud, p6s)
    if 'gate' in STAGES:
        stage_gate(conn, pp, ud, p6s)
    if 'udsim' in STAGES:
        stage_udsim(conn, ud)
    if 'xapp' in STAGES:
        stage_xapp(conn, ud, p6)
    if 'layer' in STAGES:
        stage_layer(conn)
    conn.close()
    log("DONE")


if __name__ == "__main__":
    main()
