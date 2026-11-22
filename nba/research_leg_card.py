#!/usr/bin/env python3
"""
THE LEG CARD - EVERY PICK'EM LEG, EVERY DATE, ONE LOGIC (owner 2026-11-21 17:48 PT: "each leg is properly calculated with all the final numbers ...
score, final hit probability, confidence, and ROI ... the same logic for every single leg from today and back for this season and two more ...
each one has its own hit rate ... 100% validated, certified, with a single logic, very well calibrated").
Writes nba_score.leg_card_v2 (LC_WRITE=1; rebuilt per season, nothing else is touched): one row per leg of PrizePicks, Underdog, Sleeper and Fliff
(Betr is out of the scored board, owner 2026-10-19) on every slate of 2024-25, 2025-26 and 2026-27 up to today.
  numbers   final_hp, confidence, score: from the one-formula store nba_score.board_scored_v2 (same builder, every date, as of that date).
  kind      PrizePicks: PrizePicks' own flag (pp_board_row, 2026-27) else the board's market type (standard / 'alternate' = goblin or demon,
            type unknown before 2026-27); Underdog / Sleeper: standard when the modifier is 1, else lower / higher; Fliff: odds.
  price     REAL PRICES ONLY (owner: zero assumptions) - leg_mult = the app's own factor for this leg:
              PrizePicks standard 1 (the payout table), goblin / demon = the factor PrizePicks itself quoted for that leg that day
              (pp_mined_leg; no quote = no price, never the model estimate in pp_leg_price); Underdog = its payout modifier (2024-25 legs
              read it from the American price, which maps one-to-one onto the modifier in 2025-26: 145 prices, 0 conflicts); Sleeper = the
              pick's multiplier; Fliff = the decimal of its American price.
  roi       ROI = final_hp x m - 1, m = what one leg is worth: PrizePicks / Underdog sqrt(3) x leg_mult (a 2-pick Power pays 3x, legs
            multiply), Sleeper / Fliff the price itself (a slip pays the product). roi_prod = the board's old reference (0.56 / factor) for
            comparison only.
  result    graded from nba_market.board_outcomes (box scores, playoffs included): won / lost / push / dnp / ungraded; realized = m - 1 or -1.
Then prints the certification: coverage per season x app x kind, grading cross-check against player_game_log, calibration (predicted vs hit) by
app x kind x side x final_hp band, and predicted ROI vs realized ROI by ROI band.
Env: DATABASE_URL, LC_WRITE (1 = build the table), LC_SEASONS (default all three), LC_TO (last date, default today PT).
"""
import datetime as dt
import os
import zoneinfo

import numpy as np
import pandas as pd
import psycopg

SEASONS = {"2024-25": ("2024-10-01", "2025-07-01"), "2025-26": ("2025-10-01", "2026-07-01"), "2026-27": ("2026-10-01", "2027-07-01")}
APPS = ("prizepicks", "underdog", "sleeper", "fliff")
RK = ("CASE {x} WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' "
      "WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' WHEN 'blocks_steals' THEN 'stocks' ELSE {x} END")
MK = "replace(replace({c},'player_',''),'_alternate','')"
PBS = ("('Points','points'),('Pts+Rebs','pts_reb'),('Pts+Rebs+Asts','pra'),('Rebounds','rebounds'),('Pts+Asts','pts_ast'),('Rebs+Asts','reb_ast'),"
       "('Assists','assists'),('3-PT Made','threes_made'),('Steals','steals'),('Blocked Shots','blocks'),('Blks+Stls','stocks'),('Turnovers','turnovers')")

DDL = """CREATE TABLE IF NOT EXISTS nba_score.leg_card_v2 (
  season text, game_date date, app text, player_id text, player text, prop text, line numeric, side text, game_id text,
  kind text, final_hp float8, confidence float8, score float8,
  price_source text, leg_mult float8, m float8, breakeven float8, roi float8, roi_prod float8,
  stat_actual float8, result text, realized float8, built_at timestamptz DEFAULT now())"""

BUILD = """
INSERT INTO nba_score.leg_card_v2 (season, game_date, app, player_id, player, prop, line, side, game_id, kind, final_hp, confidence, score,
                                   price_source, leg_mult, m, breakeven, roi, roi_prod, stat_actual, result, realized)
WITH bs AS MATERIALIZED (
  SELECT b.season, b.game_date, b.app, b.player_id, b.player, nba_ref.norm_name(b.player) nb, b.prop, b.line, b.side, b.game_id,
         b.final_hp::float8 hp, b.confidence::float8 conf, b.score::float8 score
  FROM nba_score.board_scored_v2 b WHERE b.app = ANY(%(apps)s) AND b.game_date >= %(a)s AND b.game_date < %(b)s AND b.game_date <= %(to)s),
snap AS MATERIALIZED (
  SELECT DISTINCT ON (s.bookmaker, s.game_date, nba_ref.norm_name(s.player), {rk_s}, s.line, s.side)
         s.bookmaker app, s.game_date, nba_ref.norm_name(s.player) nb, {rk_s} prop, s.line, s.side, s.price, s.multiplier,
         (s.market_key LIKE '%%alternate') alt
  FROM nba_market.board_snapshots s
  WHERE s.bookmaker = ANY(%(apps)s) AND s.snapshot_label = 'window' AND s.game_date >= %(a)s AND s.game_date < %(b)s
  ORDER BY s.bookmaker, s.game_date, nba_ref.norm_name(s.player), {rk_s}, s.line, s.side, s.fetched_at DESC),
udmap AS MATERIALIZED (
  SELECT DISTINCT price, multiplier FROM nba_market.board_snapshots
  WHERE bookmaker = 'underdog' AND snapshot_label = 'window' AND multiplier IS NOT NULL AND game_date >= '2025-07-01' AND game_date < '2026-07-01'),
pbs AS (SELECT * FROM (VALUES {pbs}) v(stat, prop)),
ppflag AS MATERIALIZED (
  SELECT DISTINCT ON (d, nb, s.prop, p.line) (p.start_time::timestamptz AT TIME ZONE 'America/Los_Angeles')::date d, nba_ref.norm_name(p.player) nb,
         s.prop, p.line, p.odds
  FROM nba_market.pp_board_row p JOIN pbs s ON s.stat = p.stat
  WHERE p.odds IN ('standard','goblin','demon') AND (p.start_time::timestamptz AT TIME ZONE 'America/Los_Angeles')::date >= %(a)s
    AND (p.start_time::timestamptz AT TIME ZONE 'America/Los_Angeles')::date < %(b)s
  ORDER BY d, nb, s.prop, p.line, p.run_file DESC),
ppq AS MATERIALIZED (
  SELECT DISTINCT ON (d, nb, prop, q.line, q.side) (q.quoted_at AT TIME ZONE 'America/Los_Angeles')::date d, nba_ref.norm_name(q.player) nb,
         coalesce({rk_q}, s.prop) prop, q.line, q.side, q.factor_mined::float8 f
  FROM nba_market.pp_mined_leg q LEFT JOIN pbs s ON s.stat = q.pp_stat
  WHERE q.factor_mined > 0 AND (q.quoted_at AT TIME ZONE 'America/Los_Angeles')::date >= %(a)s AND (q.quoted_at AT TIME ZONE 'America/Los_Angeles')::date < %(b)s
  ORDER BY d, nb, prop, q.line, q.side, q.quoted_at DESC),
outc AS MATERIALIZED (
  SELECT DISTINCT ON (o.game_date, nba_ref.norm_name(o.player), {rk_o}, o.line) o.game_date, nba_ref.norm_name(o.player) nb, {rk_o} prop, o.line,
         o.stat_actual::float8 v, o.played, o.leg_result
  FROM nba_market.board_outcomes o
  WHERE o.game_date >= %(a)s AND o.game_date < %(b)s AND o.leg_result IN ('over_win','under_win','push','dnp')
  ORDER BY o.game_date, nba_ref.norm_name(o.player), {rk_o}, o.line, (o.leg_result = 'dnp'), o.graded_at DESC NULLS LAST),
j AS (
  SELECT bs.*, sn.price, sn.multiplier, sn.alt, pf.odds ppodds, pq.f ppf, um.multiplier udm, oc.v, oc.played, oc.leg_result
  FROM bs
  LEFT JOIN snap sn ON sn.app = bs.app AND sn.game_date = bs.game_date AND sn.nb = bs.nb AND sn.prop = bs.prop AND sn.line = bs.line AND sn.side = bs.side
  LEFT JOIN ppflag pf ON bs.app = 'prizepicks' AND pf.d = bs.game_date AND pf.nb = bs.nb AND pf.prop = bs.prop AND pf.line = bs.line
  LEFT JOIN ppq pq ON bs.app = 'prizepicks' AND pq.d = bs.game_date AND pq.nb = bs.nb AND pq.prop = bs.prop AND pq.line = bs.line AND pq.side = bs.side
  LEFT JOIN udmap um ON bs.app = 'underdog' AND um.price = sn.price
  LEFT JOIN outc oc ON oc.game_date = bs.game_date AND oc.nb = bs.nb AND oc.prop = bs.prop AND oc.line = bs.line),
k AS (
  SELECT j.*,
    CASE j.app
      WHEN 'prizepicks' THEN coalesce(j.ppodds, CASE WHEN j.alt THEN 'alternate' WHEN j.alt = false THEN 'standard' END)
      WHEN 'fliff' THEN 'odds'
      ELSE CASE WHEN coalesce(j.multiplier, j.udm) IS NULL THEN NULL WHEN coalesce(j.multiplier, j.udm) = 1 THEN 'standard'
                WHEN coalesce(j.multiplier, j.udm) < 1 THEN 'lower' ELSE 'higher' END END kind
  FROM j),
p AS (
  SELECT k.*,
    CASE k.app
      WHEN 'prizepicks' THEN CASE WHEN k.kind = 'standard' THEN 1.0 WHEN k.kind IN ('goblin','demon') THEN k.ppf END
      WHEN 'underdog' THEN coalesce(k.multiplier, k.udm)::float8
      WHEN 'sleeper' THEN k.multiplier::float8
      WHEN 'fliff' THEN CASE WHEN k.price >= 100 THEN 1 + k.price / 100.0 WHEN k.price <= -100 THEN 1 + 100.0 / -k.price END END lm,
    CASE k.app
      WHEN 'prizepicks' THEN CASE WHEN k.kind = 'standard' THEN 'rule' WHEN k.kind IN ('goblin','demon') AND k.ppf IS NOT NULL THEN 'pp_quote' END
      WHEN 'underdog' THEN CASE WHEN k.multiplier IS NOT NULL THEN 'app' WHEN k.udm IS NOT NULL THEN 'app_price_map' END
      ELSE CASE WHEN k.multiplier IS NOT NULL OR k.price IS NOT NULL THEN 'app' END END src
  FROM k),
q AS (
  SELECT p.*, CASE WHEN p.lm > 0 THEN CASE WHEN p.app IN ('prizepicks','underdog') THEN sqrt(3.0) * p.lm ELSE p.lm END END mm FROM p)
SELECT q.season, q.game_date, q.app, q.player_id, q.player, q.prop, q.line, q.side, q.game_id, q.kind, q.hp, q.conf, q.score,
       q.src, q.lm, q.mm, CASE WHEN q.mm > 0 THEN 1 / q.mm END, q.hp * q.mm - 1,
       CASE WHEN q.lm > 0 THEN CASE WHEN q.app IN ('prizepicks','underdog') THEN q.hp * q.lm / 0.56 ELSE q.hp * q.lm END - 1 END,
       q.v,
       CASE WHEN q.leg_result IS NULL THEN 'ungraded' WHEN q.leg_result = 'dnp' OR q.played = false THEN 'dnp' WHEN q.leg_result = 'push' OR q.v = q.line::float8 THEN 'push'
            WHEN (q.leg_result = 'over_win') = (q.side = 'Over') THEN 'won' ELSE 'lost' END,
       CASE WHEN q.leg_result IN ('over_win','under_win') AND coalesce(q.played, true) AND q.mm > 0 THEN
            CASE WHEN (q.leg_result = 'over_win') = (q.side = 'Over') THEN q.mm - 1 ELSE -1 END END
FROM q""".format(rk_s=RK.format(x=MK.format(c="s.market_key")), rk_o=RK.format(x=MK.format(c="o.market_key")),
                 rk_q=RK.format(x=MK.format(c="q.base_market")), pbs=PBS)


def main():
    url = os.environ["DATABASE_URL"]
    to = os.environ.get("LC_TO") or dt.datetime.now(zoneinfo.ZoneInfo("America/Los_Angeles")).date().isoformat()
    seasons = [s.strip() for s in (os.environ.get("LC_SEASONS") or ",".join(SEASONS)).split(",") if s.strip()]
    conn = psycopg.connect(url, autocommit=True); conn.execute("SET statement_timeout = 0"); conn.execute("SET work_mem = '512MB'")
    if os.environ.get("LC_WRITE") == "1":
        conn.execute(DDL)
        for s in seasons:
            a, b = SEASONS[s]
            t0 = dt.datetime.now()
            conn.execute("DELETE FROM nba_score.leg_card_v2 WHERE season = %s", (s,))
            conn.execute(BUILD, {"apps": list(APPS), "a": a, "b": b, "to": to})
            n = conn.execute("SELECT count(*) FROM nba_score.leg_card_v2 WHERE season = %s", (s,)).fetchone()[0]
            print(f"LC|built {s}: {n:,} legs in {(dt.datetime.now() - t0).seconds}s", flush=True)
        conn.execute("CREATE INDEX IF NOT EXISTS leg_card_v2_date ON nba_score.leg_card_v2 (game_date, app)")
        conn.execute("ANALYZE nba_score.leg_card_v2")
    certify(conn, seasons)


def certify(conn, seasons):
    d = pd.read_sql("""SELECT season, game_date, app, prop, line::float8 line, side, kind, final_hp p, confidence c, score s, price_source, leg_mult, m, roi, roi_prod,
                              stat_actual, result, realized FROM nba_score.leg_card_v2 WHERE season = ANY(%s)""", conn, params=(seasons,))
    print(f"LC|================ 1. COVERAGE: {len(d):,} legs ================", flush=True)
    for (s, a), g in d.groupby(["season", "app"]):
        kinds = g["kind"].fillna("none").value_counts().to_dict()
        res = g["result"].value_counts().to_dict()
        print(f"LC|  {s} {a:10s}: {len(g):9,} legs / {g['game_date'].nunique()} days | final_hp+conf+score 100%: {bool(g[['p','c','s']].notna().all().all())} | "
              f"real price {100*g['m'].notna().mean():5.1f}% ({g['price_source'].fillna('none').value_counts().to_dict()}) | kinds {kinds} | results {res}", flush=True)
    print("LC|================ 2. GRADING CROSS-CHECK (board_outcomes vs player_game_log, regular-season dates) ================", flush=True)
    gl = pd.read_sql("""SELECT l.season, count(*) n,
                               avg(((CASE l.prop WHEN 'points' THEN g.pts WHEN 'rebounds' THEN g.reb WHEN 'assists' THEN g.ast WHEN 'threes_made' THEN g.fg3m
                                     WHEN 'steals' THEN g.stl WHEN 'blocks' THEN g.blk WHEN 'turnovers' THEN g.tov WHEN 'pra' THEN g.pts+g.reb+g.ast
                                     WHEN 'pts_reb' THEN g.pts+g.reb WHEN 'pts_ast' THEN g.pts+g.ast WHEN 'reb_ast' THEN g.reb+g.ast WHEN 'stocks' THEN g.stl+g.blk END)::float8
                                     = l.stat_actual)::int)::float8 same
                        FROM nba_score.leg_card_v2 l JOIN nba_stats.player_game_log g ON g.nba_player_id::text = l.player_id AND g.game_date = l.game_date AND g.min > 0
                        WHERE l.result IN ('won','lost','push') AND l.season = ANY(%s)
                          AND l.prop IN ('points','rebounds','assists','threes_made','steals','blocks','turnovers','pra','pts_reb','pts_ast','reb_ast','stocks')
                        GROUP BY 1 ORDER BY 1""", conn, params=(seasons,))
    for r in gl.itertuples():
        print(f"LC|  {r.season}: {r.n:,} graded legs with a box score | stat identical {100*r.same:.2f}%", flush=True)
    g = d[d["result"].isin(["won", "lost"])].copy()
    g["y"] = (g["result"] == "won").astype(int)
    print("LC|================ 3. CALIBRATION: predicted final_hp -> hit, by app x kind x side ================", flush=True)
    for (s, a, k, sd), x in g.groupby(["season", "app", g["kind"].fillna("none"), "side"]):
        if len(x) < 500:
            continue
        b = pd.cut(x["p"], [0, .3, .4, .45, .5, .55, .6, .65, .7, .8, 1.0])
        parts = [f"{100*h['p'].mean():.0f}->{100*h['y'].mean():.1f}({len(h)})" for _, h in x.groupby(b, observed=True) if len(h) >= 100]
        ece = float(np.sum([len(h) * abs(h['p'].mean() - h['y'].mean()) for _, h in x.groupby(b, observed=True)]) / len(x))
        print(f"LC|  {s} {a:10s} {k:9s} {sd:5s}: {len(x):8,} | mean {100*x['p'].mean():.1f} -> {100*x['y'].mean():.1f} | ECE {100*ece:.2f} pts | {' '.join(parts)}", flush=True)
    print("LC|================ 4. ROI: predicted vs realized (legs with a real price) ================", flush=True)
    r = g[g["m"].notna()].copy()
    for (s, a), x in r.groupby(["season", "app"]):
        b = pd.cut(x["roi"], [-1, -.3, -.2, -.1, -.05, 0, .05, .1, .2, 10])
        parts = [f"{100*h['roi'].mean():+.0f}->{100*h['realized'].mean():+.1f}({len(h)})" for _, h in x.groupby(b, observed=True) if len(h) >= 100]
        print(f"LC|  {s} {a:10s}: {len(x):8,} | mean predicted {100*x['roi'].mean():+.1f}% realized {100*x['realized'].mean():+.1f}% | {' '.join(parts)}", flush=True)
    print("LC|================ 5. CONFIDENCE and SCORE: hit vs predicted by fifth (pick'em legs, graded) ================", flush=True)
    for s, x in g.groupby("season"):
        for col in ("c", "s"):
            q = pd.qcut(x[col].rank(method="first"), 5, labels=False)
            print(f"LC|  {s} by {'confidence' if col == 'c' else 'score'} fifth: " + " | ".join(
                f"{h[col].mean():.3f}: p {100*h['p'].mean():.1f} hit {100*h['y'].mean():.1f}" for _, h in x.groupby(q)), flush=True)
    print("LC|DONE", flush=True)


if __name__ == "__main__":
    main()
