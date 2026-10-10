#!/usr/bin/env python3
"""
PRICE-SHOPPING LEDGER (strategy §31v, 2026-10-08) - MEASUREMENT ONLY, no slip is built or changed here.

Owner (2026-10-08): boards with no history of their own (Sleeper, Fliff, Betr) play only "the same legs we have back
tested", conservatively. Before any venue-choice rule exists, the first thing to know is the NUMBER: for every leg the
certified engines actually selected today, which other apps list the same leg, at what price, and does the model's p
clear that price. This script records that, once per slate, after the picks (P3), and prints the daily summary.

For each distinct leg of today's PrizePicks engine slips (nba_score.live_slips, every placed* status, shadow included)
and today's Underdog paper slips (nba_score.ud_live_slips), one row per app in the 'window' board archive
(nba_market.board_snapshots, bookmaker in config 'apps'):
    same_line   - the app lists (player, prop, side, line) exactly         -> m at that line
    near_line   - else its nearest line on that side (and the gap)         -> m at that line
    m           - the app's per-leg multiplier where the app prices per leg (Sleeper: multiplier; Underdog: payout
                  modifier; Fliff: American odds -> decimal); NULL on flat-table apps (PrizePicks, Betr) where the
                  question is availability, not price
    p           - the model's final_hp for the leg (nba_score.final_hp; whole-number legs: final_hp_derived)
    p_x_m       - p * m; gate_pass = (p - margin) * m >= 1, margin = classification_config['price_shop_ledger'].margin_pp
                  (default 0.0916 = the certified break-even distance EDGE_DELTA, §31p/§31s, in probability points: the
                  leg must clear the app's price even if its hit rate ran 9.16 pp below the certified p)
    p_cell      - (§31aa, 2026-10-09) the leg's BACKTEST hit rate: its certified cell's hit rate over the certified backtest legs
                  (PrizePicks: slip_engine_legs_mf[_nosteals]; Underdog: ud_slip_engine_legs_dlt_orig2). The model's raw p is
                  overconfident on other apps' lines (§31aa: model 0.74 -> realized 0.57 on Underdog lines), the cell rate is
                  what the backtest actually hit - the owner's rule "use the hit rate of the legs we have on backtest".
    m_star      - the multiplier the leg NEEDS on that app to be worth it, in the app's displayed units:
                  1 / (p_cell x root_app) - Underdog modifier units (root = its 2-pick Standard 3.5^(1/2) = 1.8708, the
                  most lenient Underdog break-even), Sleeper per-leg multiplier x (1 - slip_haircut)^(1/2) (its verified
                  product rule net of the slip haircut, classification_config['sleeper_payout']), Fliff decimal (root 1.0)
    v_cell      - p_cell x m_eff (1.00 = break-even); gate_cell = v_cell >= 1 + cell_margin (config, default 0.03)
Idempotent per (game_date, source, leg, app). Env: DATABASE_URL, PSL_DATE (slate, default today PT), PSL_LABEL (window).
"""
import json
import os
import sys
from datetime import date, datetime
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score_board_legs import norm_market  # noqa: E402  (board market_key -> our prop; ONE map)

DDL = """CREATE TABLE IF NOT EXISTS nba_score.price_shop_ledger (
    game_date date NOT NULL, source text NOT NULL, player_id bigint, player text, prop text, side text, line double precision,
    tier text, app text NOT NULL, listed boolean, same_line boolean, app_line double precision, line_gap double precision,
    kind text, m double precision, price double precision, p double precision, p_x_m double precision, gate_pass boolean,
    strategies text[], built_at timestamptz DEFAULT now(),
    PRIMARY KEY (game_date, source, player_id, prop, side, line, app));
    ALTER TABLE nba_score.price_shop_ledger ADD COLUMN IF NOT EXISTS m_eff double precision;
    ALTER TABLE nba_score.price_shop_ledger ADD COLUMN IF NOT EXISTS cell text;
    ALTER TABLE nba_score.price_shop_ledger ADD COLUMN IF NOT EXISTS p_cell double precision;
    ALTER TABLE nba_score.price_shop_ledger ADD COLUMN IF NOT EXISTS m_star double precision;
    ALTER TABLE nba_score.price_shop_ledger ADD COLUMN IF NOT EXISTS v_cell double precision;
    ALTER TABLE nba_score.price_shop_ledger ADD COLUMN IF NOT EXISTS gate_cell boolean"""

# m is what the app DISPLAYS; m_eff is the per-leg decimal price the gate needs. Sleeper's per-side multiplier and Fliff's odds
# ARE per-leg prices. Underdog's number is a payout MODIFIER on its standard table (main lines 1.00, alternates priced around
# the line), so its per-leg price is modifier x the table's per-leg root. §31aa (2026-10-09): the root is Underdog's 2-pick
# Standard 3.5^(1/2) = 1.8708 (its most lenient break-even, 53.45%; the P5 portfolio's mains 2-Standard) - it was the 5-pick
# 20^(1/5) = 1.8206 (§31v), which priced every Underdog leg 2.7% too low. Flat-table apps (PrizePicks, Betr) have no per-leg
# price - availability is the question.
DEFAULT_CFG = {"margin_pp": 0.0916, "ud_ref_per_leg": 1.8708, "cell_margin": 0.03,
               "apps": ["prizepicks", "underdog", "sleeper", "fliff", "betr", "betr_us_dfs"],
               "note": "price-shopping ledger (§31v, §31aa): margin_pp = certified break-even distance for the model-p gate; ud_ref_per_leg = "
                       "Underdog 2-pick Standard root 3.5^0.5; cell_margin = safety above break-even for the backtest-hit-rate gate"}


def cfg(conn):
    row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='price_shop_ledger'").fetchone()
    if row:
        return row[0]
    conn.execute("INSERT INTO nba_config.classification_config (config_key, config_json) VALUES ('price_shop_ledger', %s) ON CONFLICT (config_key) DO NOTHING",
                 (json.dumps(DEFAULT_CFG),))
    conn.commit()
    return DEFAULT_CFG


def american_to_decimal(a):
    if a is None:
        return None
    a = float(a)
    if a == 0:
        return None
    return 1 + (100.0 / abs(a) if a < 0 else a / 100.0)


def selected_legs(conn, day):
    """distinct legs the two engines selected today: {(src, pid, prop, side, line): {player, tier, strategies}}"""
    out = {}
    srcs = [("pp", "SELECT strategy, legs_json FROM nba_score.live_slips WHERE game_date=%s AND status LIKE 'placed%%'"),
            ("ud", "SELECT portfolio||'/'||composition, legs_json FROM nba_score.ud_live_slips WHERE game_date=%s")]
    if os.environ.get('PSL_SOURCE') == 'backtest':
        # replay / test source: the certified backtest's slips for a past slate (legs carry no player_id - resolved by name
        # through the ONE normaliser); never used by P3
        srcs = [("bt", "SELECT composition||'_'||size||structure, legs_json FROM nba_score.slip_engine_slips WHERE game_date=%s")]
    names = {}
    for src, sql in srcs:
        for strat, legs in conn.execute(sql, (day,)).fetchall():
            for l in (legs if isinstance(legs, list) else json.loads(legs)):
                if l.get('player_id') is None and l.get('player'):
                    if l['player'] not in names:
                        r = conn.execute("SELECT player_id FROM nba_ref.player_name_map WHERE norm_name = nba_ref.norm_name(%s) LIMIT 1", (l['player'],)).fetchone()
                        names[l['player']] = r[0] if r else None
                    l['player_id'] = names[l['player']]
                if l.get('player_id') is None:
                    continue
                key = (src, int(l['player_id']), l['prop'], l['side'], float(l['line']))
                rec = out.setdefault(key, {'player': l['player'], 'tier': l.get('tier'), 'cell': l.get('cell'), 'strategies': set()})
                rec['strategies'].add(strat)
    return out


def app_board(conn, day, label, apps):
    """{(app, pid, prop, side): [(line, m, price, kind)]} from the window archive, players resolved by the ONE normaliser"""
    rows = conn.execute("""SELECT b.bookmaker, m.player_id, b.market_key, b.side, b.line, b.multiplier, b.price
                           FROM nba_market.board_snapshots b
                           LEFT JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(b.player)
                           WHERE b.game_date=%s AND b.snapshot_label=%s AND b.bookmaker = ANY(%s)""", (day, label, apps)).fetchall()
    board = {}
    unresolved = 0
    for app, pid, mk, side, line, mult, price in rows:
        prop = norm_market(mk)
        if pid is None or not prop or line is None:
            unresolved += pid is None
            continue
        kind = 'alt' if '_alternate' in str(mk) else ('promo' if '_promo' in str(mk) else 'std')
        if app in ('sleeper', 'underdog'):
            m = float(mult) if mult is not None else None
        elif app == 'fliff':
            m = american_to_decimal(price)
        else:                      # prizepicks, betr: flat payout tables - availability is the question
            m = None
        board.setdefault((app, int(pid), prop, side), []).append((float(line), m, (float(price) if price is not None else None), kind))
    return board, len(rows), unresolved


def cell_rates(conn):
    """§31aa: each certified cell's backtest hit rate (distinct legs, both seasons) - {(source, cell): (rate, n)}.
    PrizePicks cells from the market-free certified slip legs (the faithful simulation of live), Underdog cells from the P5
    reference build; the Playoff Unders rule from its certified postseason slips."""
    out = {}
    q = """SELECT cell, avg(hit)::float, count(*) FROM (SELECT DISTINCT game_date, cell, player, prop, side, line, hit FROM {t} WHERE hit IS NOT NULL) x
           GROUP BY 1"""
    for src, tables in (('pp', ['nba_score.slip_engine_legs_mf', 'nba_score.slip_engine_legs_mf_nosteals']),
                        ('ud', ['nba_score.ud_slip_engine_legs_dlt_orig2'])):
        acc = {}
        for t in tables:
            try:
                for cell, rate, n in conn.execute(q.format(t=t)).fetchall():
                    a = acc.setdefault(cell, [0.0, 0])
                    a[0] += rate * n; a[1] += n
            except psycopg.errors.UndefinedTable:
                conn.rollback()
        for cell, (s, n) in acc.items():
            if n >= 30:
                out[(src, cell)] = (s / n, n)
    try:
        r = conn.execute("""SELECT avg((l->>'hit')::int)::float, count(*) FROM nba_score.playoff_unders_slips s, jsonb_array_elements(s.legs_json) l
                             WHERE s.app='pp' AND l->>'hit' IS NOT NULL""").fetchone()
        if r and r[1] and r[1] >= 30:
            out[('pp', 'playoff_unders')] = (r[0], r[1])
    except psycopg.errors.UndefinedTable:
        conn.rollback()
    return out


def model_p(conn, day, pid, prop, side, line):
    # final_hp keys player_id as text (the ladder's convention); the ledger carries it as bigint - cast at the join
    r = conn.execute("""SELECT final_hp FROM nba_score.final_hp WHERE game_date=%s AND player_id=%s::text AND prop=%s AND side=%s AND line=%s
                        UNION ALL
                        SELECT final_hp FROM nba_score.final_hp_derived WHERE game_date=%s AND player_id=%s::text AND prop=%s AND side=%s AND line=%s
                        LIMIT 1""", (day, pid, prop, side, line, day, pid, prop, side, line)).fetchone()
    return float(r[0]) if r and r[0] is not None else None


def main():
    day = date.fromisoformat(os.environ.get('PSL_DATE') or datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat())
    label = os.environ.get('PSL_LABEL', 'window')
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    for stmt in DDL.split(";\n"):
        conn.execute(stmt)
    conn.commit()
    c = cfg(conn)
    margin = float(c.get('margin_pp', 0.0916))
    ud_ref = float(c.get('ud_ref_per_leg', DEFAULT_CFG['ud_ref_per_leg']))
    cell_margin = float(c.get('cell_margin', DEFAULT_CFG['cell_margin']))
    # SLEEPER (2026-10-09, owner: "be sure [Sleeper's rule] is replicated to NBA"): a Sleeper slip pays the PRODUCT of the
    # displayed multipliers minus a slip-level haircut (2-8% below the product on the owner's MLB slips; tunable
    # classification_config['sleeper_payout'].slip_haircut, default the worst observed 8%). Per leg that is
    # m x (1 - h)^(1/n); the 2-pick Max carries the most haircut per leg, so its root (1 - h)^(1/2) is the conservative
    # per-leg price - it was treated as m itself (root 1.0), which overstated every Sleeper leg by up to 4%.
    srow = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='sleeper_payout'").fetchone()
    scfg = (srow[0] if srow else None) or {}
    if isinstance(scfg, str):        # a row stored as a JSON string (regression 38019478623) is decoded, never crashes the ledger
        scfg = json.loads(scfg)
    sl_h = float(scfg.get('slip_haircut', 0.08))
    sl_root = (1.0 - sl_h) ** 0.5
    rates = cell_rates(conn)
    apps = list(c.get('apps') or DEFAULT_CFG['apps'])
    sel = selected_legs(conn, day)
    if not sel:
        print(f"{day}: no engine slips today - nothing to shop (ledger untouched)", flush=True)
        return
    board, n_board, unresolved = app_board(conn, day, label, apps)
    print(f"{day}: {len(sel)} selected legs (pp+ud) | {label} archive rows {n_board:,} across {apps} | unresolved players {unresolved}", flush=True)
    conn.execute("DELETE FROM nba_score.price_shop_ledger WHERE game_date=%s", (day,))
    rows, stats = [], {}
    for (src, pid, prop, side, line), rec in sel.items():
        p = model_p(conn, day, pid, prop, side, line)
        pc = rates.get((src if src in ('pp', 'ud') else 'pp', rec.get('cell')))
        p_cell = pc[0] if pc else None
        for app in apps:
            offers = board.get((app, pid, prop, side), [])
            same = [o for o in offers if abs(o[0] - line) < 1e-9]
            if same:
                o = min(same, key=lambda x: (x[3] != 'std'))          # the standard listing before an alt/promo rung
                listed, same_line, app_line, gap = True, True, o[0], 0.0
            elif offers:
                o = min(offers, key=lambda x: (abs(x[0] - line), x[3] != 'std'))
                listed, same_line, app_line, gap = True, False, o[0], o[0] - line
            else:
                o, listed, same_line, app_line, gap = (None, None, None, None), False, None, None, None
            m, price, kind = o[1], o[2], o[3]
            m_eff = None if m is None else (m * ud_ref if app == 'underdog' else (m * sl_root if app == 'sleeper' else m))
            pxm = (p * m_eff) if (p is not None and m_eff is not None and same_line) else None
            gate = ((p - margin) * m_eff >= 1.0) if pxm is not None else None
            root = ud_ref if app == 'underdog' else (sl_root if app == 'sleeper' else 1.0)
            m_star = (1.0 / (p_cell * root)) if (p_cell and m is not None) else None
            v_cell = (p_cell * m_eff) if (p_cell is not None and m_eff is not None and same_line) else None
            gate_cell = (v_cell >= 1.0 + cell_margin) if v_cell is not None else None
            rows.append((day, src, pid, rec['player'], prop, side, line, rec['tier'], app, listed, same_line, app_line, gap, kind, m, price, p, pxm, gate,
                         sorted(rec['strategies']), m_eff, rec.get('cell'), p_cell, m_star, v_cell, gate_cell))
            s = stats.setdefault(app, {'n': 0, 'listed': 0, 'same': 0, 'priced': 0, 'gate': 0, 'pxm': [], 'gcell': 0, 'vcell': []})
            s['n'] += 1; s['listed'] += listed; s['same'] += bool(same_line)
            if pxm is not None:
                s['priced'] += 1; s['gate'] += bool(gate); s['pxm'].append(pxm)
            if v_cell is not None:
                s['gcell'] += bool(gate_cell); s['vcell'].append(v_cell)
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.price_shop_ledger (game_date, source, player_id, player, prop, side, line, tier, app, listed, same_line,
                           app_line, line_gap, kind, m, price, p, p_x_m, gate_pass, strategies, m_eff, cell, p_cell, m_star, v_cell, gate_cell)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                           ON CONFLICT (game_date, source, player_id, prop, side, line, app) DO UPDATE SET listed=EXCLUDED.listed, same_line=EXCLUDED.same_line,
                           app_line=EXCLUDED.app_line, line_gap=EXCLUDED.line_gap, kind=EXCLUDED.kind, m=EXCLUDED.m, m_eff=EXCLUDED.m_eff, price=EXCLUDED.price, p=EXCLUDED.p,
                           p_x_m=EXCLUDED.p_x_m, gate_pass=EXCLUDED.gate_pass, strategies=EXCLUDED.strategies, cell=EXCLUDED.cell, p_cell=EXCLUDED.p_cell,
                           m_star=EXCLUDED.m_star, v_cell=EXCLUDED.v_cell, gate_cell=EXCLUDED.gate_cell, built_at=now()""", rows)
    conn.commit()
    print(f"  ledger: {len(rows)} rows written (margin {margin:.4f})", flush=True)
    print(f"  {'app':<11}{'legs':>6}{'listed':>8}{'same':>6}{'priced':>8}{'gate':>6}  mean p*m  | backtest-hit-rate gate: pass / mean v_cell")
    for app in apps:
        s = stats.get(app)
        if not s:
            continue
        mean = (sum(s['pxm']) / len(s['pxm'])) if s['pxm'] else None
        vmean = (sum(s['vcell']) / len(s['vcell'])) if s['vcell'] else None
        print(f"  {app:<11}{s['n']:>6}{s['listed']:>8}{s['same']:>6}{s['priced']:>8}{s['gate']:>6}  {'' if mean is None else f'{mean:.3f}':>8}  | "
              f"{s['gcell']} / {'' if vmean is None else f'{vmean:.3f}'}")
    conn.close()


if __name__ == '__main__':
    main()
