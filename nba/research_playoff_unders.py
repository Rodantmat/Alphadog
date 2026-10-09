#!/usr/bin/env python3
"""
PLAYOFF UNDERS - every gate and every stress the regular-season strategies went through, on the postseason rule
(strategy §31z; owner 2026-10-09: "run all the gates, stress it out, be sure you tried everything possible and got the best of it").

The rule (playoff_unders.py, ONE implementation shared with certification and live) has a small, PRE-REGISTERED variant grid:
  rank        s_final | s_base | s_score               (the three ranks, §19p)
  props       main8 | all12                            (the 8 main props; + steals / blocks / stocks / turnovers)
  min_p       0.50 | 0.55 | 0.58 | 0.62 | 0.66          (model threshold for the Under)
  stars       keep | exclude                           (§31n star-line Unders)
  per game    any | <= 2 legs                          (PrizePicks; Underdog is one pick per game by rule)
  structure   PP 3P 3F 4P 4F 5P 5F 6P 6F | UD 2S 3S 3F  (one slip a night, the small-slate rule)
Gates (the regular season's §27-§28 bar, translated - the postseason gate of §31w is G1-G3):
  G1 ROI > 0 in EACH postseason          G2 pooled day-blocked 2.5% lower bound > 0 (10,000 resamples)      G3 >= 30 nights
  G4 plateau: the neighbouring variants (min_p one step either side, the other two ranks) are positive in both postseasons too
  G5 walk-forward, both directions: the whole grid is ranked on ONE postseason, the best variant (and the top 10) scored on the
     other; the empirical null re-runs the whole selection on hit-permuted nights (within night x prop x tier x side)
  G6 teammate sensitivity (ROI without slips holding a same-team pair)
Stress: block-bootstrap postseason envelopes (P(losing postseason), drawdown p50 / p95, losing streak p95); leg-hit decay
(ROI when the legs hit 1-5 points worse); same-game Under correlation (postseason vs regular season); the finalists on both
REGULAR seasons. The configuration that clears the most gates is written to classification_config['playoff_unders'].
Tables: nba_score.psr_pu_grid, psr_pu_final. Env: DATABASE_URL, PU_NULL (50), PU_BOOT (10000), PU_WRITE_CFG (1).
"""
import json
import os
import random
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                 # noqa: E402  PrizePicks grade()
import playoff_unders as PU                    # noqa: E402  the rule
import research_postseason_program as R        # noqa: E402  loaders (same SQL as the §31y program) + Underdog grade

NULLS = int(os.environ.get('PU_NULL') or '50')
BOOT = int(os.environ.get('PU_BOOT') or '10000')
WRITE_CFG = os.environ.get('PU_WRITE_CFG', '1') == '1'
S1, S2 = '2024-25', '2025-26'
RANKS = ['s_final', 's_base', 's_score']
PROPSETS = {'main8': PU.MAIN_PROPS, 'all12': PU.MAIN_PROPS + PU.DEF_PROPS,
            'main8_half': PU.MAIN_PROPS, 'all12_half': PU.MAIN_PROPS + PU.DEF_PROPS}   # *_half: half-point lines only (sensitivity)
MINP = [0.50, 0.55, 0.58, 0.62, 0.66]
STRUCT = {'pp': [(3, 'power'), (3, 'flex'), (4, 'power'), (4, 'flex'), (5, 'power'), (5, 'flex'), (6, 'power'), (6, 'flex')],
          'ud': [(2, 'standard'), (3, 'standard'), (3, 'flex')]}
rng = np.random.default_rng(7)
random.seed(7)


def log(*a):
    print(*a, flush=True)


def grade(app, slip, st):
    return SE.grade(slip, st) if app == 'pp' else R.ud_grade(slip, st)


def variants(app):
    for rank in RANKS:
        for ps in PROPSETS:
            for mp in MINP:
                for star in (False, True):
                    for mpg in ((99, 2) if app == 'pp' else (1,)):
                        for size, st in STRUCT[app]:
                            yield dict(rank=rank, propset=ps, props=PROPSETS[ps], half_only=ps.endswith('_half'), min_p=mp, exclude_star=star,
                                       max_per_game=mpg, size=size, structure=st)


def vkey(v):
    return (v['rank'], v['propset'], v['min_p'], v['exclude_star'], v['max_per_game'], v['size'], v['structure'])


def run_grid(app, by_day):
    """variant -> {night: (season, profit, same_team)}; candidates computed once per (rank, props, min_p, stars) per night"""
    out = defaultdict(dict)
    for d, legs in by_day.items():
        season = legs[0]['season']
        cache = {}
        for v in variants(app):
            ck = (v['rank'], v['propset'], v['min_p'], v['exclude_star'])
            if ck not in cache:
                cache[ck] = PU.candidates(legs, v)
            slip = PU.build_slip(cache[ck], v['size'], app, v)
            if slip is None:
                continue
            hits, payout = grade(app, slip, v['structure'])
            st = len(slip) - len({l.get('team_id') for l in slip})
            out[vkey(v)][d] = (season, payout - 1.0, st > 0, sum(1 for l in slip if l['hit'] is not None), sum(l['hit'] or 0 for l in slip))
    return out


def roi(rec, season=None, ban=False):
    xs = [p for s, p, st, *_ in rec.values() if (season is None or s == season) and not (ban and st)]
    return (sum(xs) / len(xs), len(xs)) if xs else (None, 0)


def boot_lo(rec, B=None):
    xs = np.array([p for _, p, *_ in rec.values()])
    if len(xs) == 0:
        return None
    B = B or 2000
    idx = rng.integers(0, len(xs), size=(B, len(xs)))
    m = xs[idx].mean(axis=1)
    return float(np.quantile(m, 0.025))


def permuted(by_day):
    out = {}
    for d, legs in by_day.items():
        grp = defaultdict(list)
        for l in legs:
            grp[(l['prop'], l['tier'], l['side'])].append(l)
        new = []
        for g in grp.values():
            hits = [l['hit'] for l in g]
            random.shuffle(hits)
            new.extend(dict(l, hit=h) for l, h in zip(g, hits))
        out[d] = new
    return out


def walk_forward(grid, tr, te, min_days=25, top=10, flex_only=False):
    ranked = []
    for k, rec in grid.items():
        if flex_only and k[6] != 'flex':
            continue
        r, n = roi(rec, tr)
        if r is not None and n >= min_days:
            ranked.append((r, k))
    ranked.sort(key=lambda x: -x[0])
    if not ranked:
        return None
    best = ranked[0][1]
    te_best = roi(grid[best], te)[0]
    tops = [roi(grid[k], te)[0] for _, k in ranked[:top]]
    tops = [x for x in tops if x is not None]
    return dict(best=best, train=ranked[0][0], test=te_best, top10_test=(sum(tops) / len(tops)) if tops else None)


def envelope(rec, n=50, sims=10000, block=7):
    days = [rec[d][1] for d in sorted(rec)]
    if not days:
        return None
    arr = np.array(days)
    lose, dds, streaks = 0, [], []
    for _ in range(sims):
        smp = []
        while len(smp) < n:
            i = random.randrange(len(arr))
            smp.extend(arr[i:i + block].tolist())
        smp = np.array(smp[:n])
        if smp.sum() < 0:
            lose += 1
        eq = np.cumsum(smp)
        dds.append(float((np.maximum.accumulate(np.maximum(eq, 0)) - eq).max()))
        s = m = 0
        for x in smp:
            s = s + 1 if x < 0 else 0
            m = max(m, s)
        streaks.append(m)
    dds.sort(); streaks.sort()
    return dict(p_lose=lose / sims, dd50=dds[sims // 2], dd95=dds[int(.95 * sims)], streak95=streaks[int(.95 * sims)])


def decay(app, by_day, v, deltas=(0.01, 0.02, 0.03, 0.05), reps=200):
    """ROI when every leg hits `delta` less often: each hit of a slip leg flips to a miss with prob delta / p_hit"""
    base = []
    for d, legs in by_day.items():
        c = PU.candidates(legs, v)
        s = PU.build_slip(c, v['size'], app, v)
        if s:
            base.append(s)
    g = [l['hit'] for s in base for l in s if l['hit'] is not None]
    ph = sum(g) / len(g) if g else 0.5
    out = {}
    for dl in deltas:
        q = dl / ph
        tot = 0.0
        for _ in range(reps):
            prof = 0.0
            for s in base:
                s2 = [dict(l, hit=(0 if (l['hit'] == 1 and random.random() < q) else l['hit'])) for l in s]
                prof += grade(app, s2, v['structure'])[1] - 1.0
            tot += prof / len(base)
        out[dl] = tot / reps
    return ph, out


def same_game_corr(by_day, v):
    """phi correlation of hits between same-game candidate Unders (the pairs a slip would hold)"""
    a = b = ab = n = 0
    for d, legs in by_day.items():
        c = PU.candidates(legs, v)
        for i in range(len(c)):
            for j in range(i + 1, len(c)):
                x, y = c[i], c[j]
                if x.get('event_id') != y.get('event_id') or x['hit'] is None or y['hit'] is None:
                    continue
                a += x['hit']; b += y['hit']; ab += x['hit'] * y['hit']; n += 1
    if n < 30:
        return None, n
    pa, pb, pab = a / n, b / n, ab / n
    den = (pa * (1 - pa) * pb * (1 - pb)) ** 0.5
    return ((pab - pa * pb) / den if den else None), n


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_pu_grid (app text, rank text, propset text, min_p double precision,
        exclude_star boolean, max_per_game int, size int, structure text, nights1 int, nights2 int, roi1 double precision, roi2 double precision,
        roi double precision, boot_lo double precision, roi_noteam double precision, built_at timestamptz DEFAULT now())""")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_pu_final (app text, variant jsonb, gates jsonb, stress jsonb, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.psr_pu_grid"); conn.execute("DELETE FROM nba_score.psr_pu_final")
    conn.commit()
    chosen_cfg = {}
    for app in ('pp', 'ud'):
        legs = R.fetch_legs(conn, R.PP_POST_SQL if app == 'pp' else R.UD_POST_SQL, (R.MAIN,))
        legs = [l for l in legs if l['tier'] == 'R']
        if app == 'ud':
            for l in legs:
                if l['team_id'] is None:
                    l['team_id'] = l['event_id']
        by_day = defaultdict(list)
        for l in legs:
            by_day[l['game_date']].append(l)
        log(f"\n######## {app.upper()} - {len(legs):,} balanced postseason legs over {len(by_day)} nights")
        grid = run_grid(app, by_day)
        rows = []
        for k, rec in grid.items():
            r1, n1 = roi(rec, S1); r2, n2 = roi(rec, S2); r, n = roi(rec)
            rows.append((app, *k[:2], k[2], k[3], k[4], k[5], k[6], n1, n2, r1, r2, r, boot_lo(rec), roi(rec, ban=True)[0]))
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_score.psr_pu_grid (app, rank, propset, min_p, exclude_star, max_per_game, size, structure, nights1, nights2,
                               roi1, roi2, roi, boot_lo, roi_noteam) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", rows)
        conn.commit()
        # ---- G1-G4 on the whole grid
        rowmap = {(r[1], r[2], r[3], r[4], r[5], r[6], r[7]): r for r in rows}
        def pos_both(k):
            r = rowmap.get(k)
            return bool(r and r[10] is not None and r[11] is not None and r[10] > 0 and r[11] > 0 and r[8] >= 20 and r[9] >= 20)
        passing = []
        for k, r in rowmap.items():
            g1 = r[10] is not None and r[11] is not None and r[10] > 0 and r[11] > 0
            g2 = r[13] is not None and r[13] > 0
            g3 = (r[8] + r[9]) >= 30
            i = MINP.index(k[2])
            neigh = [(k[0], k[1], MINP[j], k[3], k[4], k[5], k[6]) for j in (i - 1, i + 1) if 0 <= j < len(MINP)]
            neigh += [(rk, k[1], k[2], k[3], k[4], k[5], k[6]) for rk in RANKS if rk != k[0]]
            g4 = sum(1 for nk in neigh if pos_both(nk)) >= len(neigh) - 1
            if g1 and g3:
                passing.append((min(r[10], r[11]), k, g1, g2, g3, g4, r))
        passing.sort(key=lambda x: -x[0])
        log(f"{app.upper()} grid: {len(rows)} variants; G1+G3 (positive in each postseason, >= 30 nights): {len(passing)}; "
            f"+G2 (pooled lower bound > 0): {sum(1 for p in passing if p[3])}; +G4 plateau: {sum(1 for p in passing if p[3] and p[5])}")
        log(f"   {'rank':<8}{'props':<7}{'min_p':>6}{'star':>6}{'pg':>4}{'slip':>6}{'n1':>4}{'n2':>4}{'ROI 24-25':>10}{'ROI 25-26':>10}{'pooled':>8}{'lo':>8}{'no-team':>8}  gates")
        for wk, k, g1, g2, g3, g4, r in passing[:40]:
            log(f"   {k[0]:<8}{k[1]:<7}{k[2]:>6.2f}{('ex' if k[3] else '-'):>6}{k[4]:>4}{str(k[5]) + k[6][0].upper():>6}{r[8]:>4}{r[9]:>4}"
                f"{r[10]:>+10.0%}{r[11]:>+10.0%}{r[12]:>+8.0%}{r[13]:>+8.0%}{(r[14] if r[14] is not None else float('nan')):>+8.0%}  "
                f"{'G1 ' if g1 else ''}{'G2 ' if g2 else ''}{'G3 ' if g3 else ''}{'G4' if g4 else ''}")
        # ---- G5 walk-forward over the whole grid + its null
        wf = {}
        # two pre-registered selection rules: the regular season's (highest training ROI, any structure) and the
        # low-variance one this rule is deployed as (highest training ROI among Flex slips); PrizePicks only - Underdog has
        # no Flex on 2-pick nights, so its rule is the first
        rules = (('any', False), ('flex', True)) if app == 'pp' else (('any', False),)
        for rule, fo in rules:
            for direction, (tr, te) in (('fwd', (S1, S2)), ('rev', (S2, S1))):
                wf[f'{direction}_{rule}'] = walk_forward(grid, tr, te, flex_only=fo)
        null_best = defaultdict(list)
        null_top = defaultdict(list)
        for i in range(NULLS):
            ng = run_grid(app, permuted(by_day))
            for rule, fo in rules:
                for direction, (tr, te) in (('fwd', (S1, S2)), ('rev', (S2, S1))):
                    w = walk_forward(ng, tr, te, flex_only=fo)
                    if w:
                        null_best[f'{direction}_{rule}'].append(w['test'] if w['test'] is not None else -1)
                        null_top[f'{direction}_{rule}'].append(w['top10_test'] if w['top10_test'] is not None else -1)
        for direction in wf:
            w = wf[direction]
            if not w:
                continue
            nb, nt = null_best[direction], null_top[direction]
            pb = (sum(1 for x in nb if x >= (w['test'] or -1)) / len(nb)) if nb else None
            pt = (sum(1 for x in nt if x >= (w['top10_test'] or -1)) / len(nt)) if nt else None
            w.update(null_best_mean=(sum(nb) / len(nb)) if nb else None, p_best=pb, null_top_mean=(sum(nt) / len(nt)) if nt else None, p_top=pt)
            fp = lambda x: 'n/a' if x is None else f"{x:+.0%}"   # noqa: E731
            fq = lambda x: 'n/a' if x is None else f"{x:.2f}"    # noqa: E731
            log(f"   G5 walk-forward {direction}: best on train {w['best']} train {fp(w['train'])} -> test {fp(w['test'])} "
                f"(null mean {fp(w['null_best_mean'])}, p {fq(w['p_best'])}); top-10 on train -> test mean {fp(w['top10_test'])} "
                f"(null mean {fp(w['null_top_mean'])}, p {fq(w['p_top'])})")
        # ---- finalists: the best G1-G3 variant per structure (G4 preferred), full stress
        finals = {}
        for wk, k, g1, g2, g3, g4, r in passing:
            stk = (k[5], k[6])
            if stk not in finals or (g2 and g4 and not (finals[stk][3] and finals[stk][5])):
                if stk not in finals or (g2 and g4):
                    finals[stk] = (wk, k, g1, g2, g3, g4, r)
        reg_legs = None
        for stk, (wk, k, g1, g2, g3, g4, r) in sorted(finals.items(), key=lambda x: -x[1][0]):
            v = dict(rank=k[0], propset=k[1], props=PROPSETS[k[1]], min_p=k[2], exclude_star=k[3], max_per_game=k[4], size=k[5], structure=k[6])
            rec = grid[k]
            lo10 = boot_lo(rec, BOOT)
            env = envelope(rec)
            ph, dec = decay(app, by_day, v)
            corr_post = same_game_corr(by_day, v)
            # regular-season stress: the same rule on both regular seasons (balanced legs, final week out)
            if reg_legs is None:
                sql = R.PP_REG_SQL if app == 'pp' else R.UD_REG_SQL
                rl = R.fetch_legs(conn, sql, (R.MAIN, R.MAIN, ['R'] * len(R.MAIN)))
                if app == 'ud':
                    for l in rl:
                        l['team_id'] = l['event_id']
                bounds = {}
                for l in rl:
                    a, b = bounds.get(l['season'], (l['game_date'], l['game_date']))
                    bounds[l['season']] = (min(a, l['game_date']), max(b, l['game_date']))
                reg_legs = defaultdict(list)
                for l in rl:
                    if SE.phase_of(l['season'], l['game_date'], bounds) != 'final7':
                        reg_legs[l['game_date']].append(l)
                log(f"   regular-season legs for the stress: {len(rl):,} over {len(reg_legs)} nights")
            reg = {}
            for d, legs_d in reg_legs.items():
                s = PU.build_slip(PU.candidates(legs_d, v), v['size'], app, v)
                if s:
                    h, pay = grade(app, s, v['structure'])
                    reg[d] = (legs_d[0]['season'], pay - 1.0, False, 0, 0)
            rr1, rn1 = roi(reg, S1); rr2, rn2 = roi(reg, S2)
            regdd = envelope(reg, n=160, sims=2000) if reg else None
            corr_reg = same_game_corr(reg_legs, v) if app == 'pp' else (None, 0)
            gates = dict(G1=g1, G2=(lo10 is not None and lo10 > 0), G3=g3, G4=g4, boot_lo=lo10, roi1=r[10], roi2=r[11], roi=r[12],
                         nights=r[8] + r[9], roi_noteam=r[14])
            stress = dict(envelope=env, leg_hit=ph, decay={str(kk): vv for kk, vv in dec.items()},
                          corr_post=corr_post[0], corr_post_pairs=corr_post[1], corr_reg=corr_reg[0], corr_reg_pairs=corr_reg[1],
                          reg_roi1=rr1, reg_n1=rn1, reg_roi2=rr2, reg_n2=rn2, reg_envelope=regdd, walk_forward=wf)
            conn.execute("INSERT INTO nba_score.psr_pu_final (app, variant, gates, stress) VALUES (%s,%s,%s,%s)",
                         (app, json.dumps({kk: vv for kk, vv in v.items() if kk != 'props'}), json.dumps(gates), json.dumps(stress, default=str)))
            conn.commit()
            f = lambda x: 'n/a' if x is None else f"{x:+.0%}"   # noqa: E731
            log(f"\n   FINALIST {app.upper()} {k[5]}{k[6][0].upper()}: rank {k[0]} props {k[1]} min_p {k[2]} stars {'excluded' if k[3] else 'kept'} per-game {k[4]}")
            log(f"     postseason ROI {f(r[10])} / {f(r[11])} pooled {f(r[12])} | 10k lower bound {f(lo10)} | no-teammate {f(r[14])} | "
                f"gates {' '.join(g for g, ok in (('G1', g1), ('G2', lo10 is not None and lo10 > 0), ('G3', g3), ('G4', g4)) if ok)}")
            if env:
                log(f"     envelope (50-night postseasons, 7-night blocks): P(losing postseason) {env['p_lose']:.1%}, drawdown p50 {env['dd50']:.1f} / "
                    f"p95 {env['dd95']:.1f} units, losing streak p95 {env['streak95']}")
            log(f"     leg hit {ph:.3f}; ROI if legs hit worse by 1/2/3/5 pts: " + ", ".join(f"{f(dec[x])}" for x in sorted(dec)))
            log(f"     same-game Under correlation: postseason {corr_post[0] if corr_post[0] is None else round(corr_post[0], 3)} ({corr_post[1]} pairs)"
                + (f", regular season {corr_reg[0] if corr_reg[0] is None else round(corr_reg[0], 3)} ({corr_reg[1]} pairs)" if app == 'pp' else ''))
            log(f"     REGULAR-SEASON stress: {f(rr1)} ({rn1} nights) / {f(rr2)} ({rn2} nights)"
                + (f"; P(losing season) {regdd['p_lose']:.1%}, drawdown p95 {regdd['dd95']:.1f}" if regdd else ''))
        # ---- the configuration written for live: the rule of the best finalist that clears G1-G4 (Flex preferred on PP)
        best = None
        for stk, (wk, k, g1, g2, g3, g4, r) in finals.items():
            score = (g1 and g2 and g3 and g4, g1 and g3 and g4, wk)
            if best is None or score > best[0]:
                best = (score, k)
        if best:
            k = best[1]
            chosen_cfg[app] = dict(rank=k[0], props=PROPSETS[k[1]], min_p=k[2], exclude_star=k[3], max_per_game=k[4])
            strategies = {}
            for stk, (wk, kk, g1, g2, g3, g4, r) in finals.items():
                if kk[:5] == k[:5] and g1 and g3:
                    nm = f"{'P' if app == 'pp' else 'U'}_unders_{kk[5]}{kk[6]}"
                    strategies[nm] = {"app": app, "size": kk[5], "structure": kk[6]}
            chosen_cfg[app]['strategies'] = strategies
            log(f"\n   {app.upper()} CHOSEN RULE: {chosen_cfg[app]}")
    if WRITE_CFG and chosen_cfg:
        pp = chosen_cfg.get('pp', {})
        ud = chosen_cfg.get('ud', {})
        cfg = dict(PU.DEFAULT_CFG)
        cfg.update({kk: vv for kk, vv in pp.items() if kk != 'strategies'})
        cfg['ud'] = {kk: vv for kk, vv in ud.items() if kk != 'strategies'}
        cfg['strategies'] = {**pp.get('strategies', {}), **ud.get('strategies', {})} or PU.DEFAULT_CFG['strategies']
        cfg['note'] = PU.DEFAULT_CFG['note'] + " | chosen by research_playoff_unders.py (§31z): " + json.dumps({a: {kk: vv for kk, vv in c.items() if kk != 'props'} for a, c in chosen_cfg.items()})
        conn.execute("""INSERT INTO nba_config.classification_config (config_key, config_json) VALUES ('playoff_unders', %s)
                        ON CONFLICT (config_key) DO UPDATE SET config_json = EXCLUDED.config_json""", (json.dumps(cfg),))
        conn.commit()
        log(f"\nclassification_config['playoff_unders'] written: {json.dumps(cfg)[:600]}")
    conn.close()
    log("DONE")


if __name__ == "__main__":
    main()
