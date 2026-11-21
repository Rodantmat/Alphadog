#!/usr/bin/env python3
"""
ONE FORMULA OVER ALL THE DATA? READ-ONLY. (owner 2026-11-20 20:37 PT: "be sure on the back data the calculations reflect the same logic ...
run some samples all over the back data, see if they match")

For sample slates of 2024-25, 2025-26 and 2026-27 this re-runs TODAY'S production builder (nba/build_final_hp.py, FE_DATE = the slate)
in CAPTURE mode: every statement that would write a persistent table is intercepted and skipped (the rows it would have written are
kept in memory); only the builder's own TEMP table is created. Nothing in the database changes. Then, per slate:
  1. FINAL HP CHAIN: stored nba_score.final_hp vs today's formula on the same baseline rows - rows on each side, and per leg the
     difference in final_hp, confidence and score (median, 90th percentile, max, share moved > 1 point / > 5 points).
  2. SCORE ARITHMETIC: stored score vs score_and_edge(stored final_hp, stored confidence) - is the score formula itself unchanged.
  3. BASELINE: stored nba_score.baseline_history vs the honest point-in-time replay nba_score.baseline_history_h (production's builder
     with the one tier block fixed) on the same player / prop / line: median and 90th percentile difference of P(over), share > 2 points.
Env: DATABASE_URL, FP_DATES (comma list; default 15 slates, five a season).
"""
import os
import re
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

WRITE = re.compile(r"^\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|COPY|VACUUM|ANALYZE|GRANT|REFRESH|CALL)\b", re.I)
TEMP_OK = re.compile(r"^\s*(DROP TABLE IF EXISTS _fe_|CREATE TEMP TABLE _fe_|CREATE INDEX ON _fe_|ANALYZE _fe_)", re.I)
CAPTURED = defaultdict(list)
BLOCKED = defaultdict(int)


class CaptureCursor(psycopg.Cursor):
    def _blocked(self, q):
        s = q if isinstance(q, str) else str(q)
        return bool(WRITE.match(s)) and not TEMP_OK.match(s), s

    def execute(self, query, params=None, **kw):
        b, s = self._blocked(query)
        if b:
            BLOCKED[" ".join(s.split())[:70]] += 1
            return self
        return super().execute(query, params, **kw)

    def executemany(self, query, params_seq, **kw):
        b, s = self._blocked(query)
        if b:
            m = re.search(r"INSERT INTO\s+([\w.]+)", s, re.I)
            if m:
                CAPTURED[m.group(1)].extend(list(params_seq))
            BLOCKED[" ".join(s.split())[:70]] += 1
            return None
        return super().executemany(query, params_seq, **kw)


COLS = ["season", "game_date", "game_id", "player_id", "prop", "line", "side", "ladder_offset", "anchor", "baseline_hp", "final_hp", "cal_shift",
        "score", "edge", "confidence", "conf_tier", "c_exist", "c_quality", "c_market", "prop_tier", "band", "phase", "n_uncertain", "cal_chain"]
DEFAULT_DATES = ("2024-11-15,2024-12-20,2025-01-24,2025-03-05,2025-04-09,"
                 "2025-11-12,2025-12-18,2026-01-22,2026-02-26,2026-04-08,"
                 "2026-10-21,2026-10-28,2026-11-06,2026-11-14,2026-11-19")


def q(x, p):
    return float(np.percentile(x, p)) if len(x) else float("nan")


def main():
    url = os.environ["DATABASE_URL"]
    ro = psycopg.connect(url)
    ro.execute("SET statement_timeout = 0")
    V2 = os.environ.get("FP_V2") == "1"   # compare today's builder on the one-formula store (store_redirect) with what the replay stored
    if V2:
        import store_redirect as SR

        class CaptureRedirect(CaptureCursor):
            def execute(self, query, params=None, **kw):
                return super().execute(SR.rewrite(query), params, **kw)

            def executemany(self, query, params_seq, **kw):
                return super().executemany(SR.rewrite(query), params_seq, **kw)
    import build_final_hp as B
    real_connect = psycopg.connect
    dates = [d.strip() for d in (os.environ.get("FP_DATES") or DEFAULT_DATES).split(",") if d.strip()]
    print(f"FP|slates sampled: {len(dates)} | builder: nba/build_final_hp.py as on main today, CAPTURE mode (no writes)", flush=True)
    summary = []
    for d in dates:
        nb = ro.execute("SELECT count(*) FROM nba_score.baseline_history WHERE game_date=%s", (d,)).fetchone()[0]
        if nb == 0:
            print(f"FP|{d}: no baseline rows - not a slate, skipped", flush=True)
            continue
        CAPTURED.clear(); BLOCKED.clear()
        psycopg.connect = lambda *a, **k: real_connect(*a, **{**k, "cursor_factory": CaptureRedirect if V2 else CaptureCursor})
        B.psycopg.connect = psycopg.connect
        os.environ.update({"FE_DATE": d, "FE_WRITE": "1"})
        os.environ.pop("FE_SEASONS", None); os.environ.pop("FE_PROPS", None)
        try:
            B.main()
        except SystemExit as e:
            print(f"FP|{d}: builder stopped: {e}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"FP|{d}: builder failed: {type(e).__name__}: {str(e)[:200]}", flush=True)
        finally:
            psycopg.connect = real_connect; B.psycopg.connect = real_connect
        print(f"FP|{d}: intercepted writes (not executed): {dict(BLOCKED)}", flush=True)
        new = pd.DataFrame(CAPTURED.get("nba_score.final_hp_v2" if V2 else "nba_score.final_hp", []), columns=COLS)
        old = pd.read_sql("""SELECT season, game_date, player_id, prop, line::float8 line, side, baseline_hp::float8 baseline_hp, final_hp::float8 final_hp,
                                    confidence::float8 confidence, score::float8 score, edge::float8 edge, cal_chain, built_at
                             FROM nba_score.final_hp""" + ("_v2" if V2 else "") + """ WHERE game_date=%s""", ro, params=(d,))
        season = old["season"].iloc[0] if len(old) else (new["season"].iloc[0] if len(new) else "?")
        # 2. score arithmetic on the stored rows
        if len(old):
            sc, ed = B.score_and_edge(old["final_hp"].values, old["confidence"].values)
            arith = float(np.mean(np.abs(sc - old["score"].values) <= 0.011))
        else:
            arith = float("nan")
        if new.empty:
            print(f"FP|{d} ({season}): today's formula produced NO final_hp rows (stored {len(old):,})", flush=True)
            continue
        new["line"] = new["line"].astype(float); new["player_id"] = new["player_id"].astype(str)
        for c in ("baseline_hp", "final_hp", "confidence", "score", "edge"):
            new[c] = new[c].astype(float)
        old["player_id"] = old["player_id"].astype(str)
        k = ["player_id", "prop", "line", "side"]
        m = old.merge(new[k + ["baseline_hp", "final_hp", "confidence", "score", "edge", "cal_chain"]], on=k, how="outer", suffixes=("_old", "_new"), indicator=True)
        both = m[m["_merge"] == "both"]
        dfh = 100 * (both["final_hp_new"] - both["final_hp_old"]).abs()
        dcf = 100 * (both["confidence_new"] - both["confidence_old"]).abs()
        dsc = (both["score_new"] - both["score_old"]).abs()
        dbh = 100 * (both["baseline_hp_new"] - both["baseline_hp_old"]).abs()
        chain_same = float((both["cal_chain_old"].fillna("none") == both["cal_chain_new"].fillna("none")).mean())
        built = str(old["built_at"].max())[:16] if len(old) else "-"
        print(f"FP|{d} ({season}) stored built {built} | rows stored {len(old):,} / today's formula {len(new):,} / both {len(both):,} | "
              f"only stored {int((m['_merge'] == 'left_only').sum()):,} | only new {int((m['_merge'] == 'right_only').sum()):,}", flush=True)
        print(f"FP|   baseline_hp identical input: {100*float((dbh < 0.001).mean()):.1f}% | calibration chain same: {100*chain_same:.1f}% "
              f"(stored {dict(both['cal_chain_old'].fillna('none').value_counts())} vs new {dict(both['cal_chain_new'].fillna('none').value_counts())})", flush=True)
        print(f"FP|   final_hp moved (pts): median {q(dfh,50):.2f} p90 {q(dfh,90):.2f} max {dfh.max():.2f} | >1 pt {100*float((dfh > 1).mean()):.1f}% | >5 pts {100*float((dfh > 5).mean()):.1f}%", flush=True)
        print(f"FP|   confidence moved (pts): median {q(dcf,50):.2f} p90 {q(dcf,90):.2f} | mean stored {100*both['confidence_old'].mean():.1f} -> new {100*both['confidence_new'].mean():.1f}", flush=True)
        print(f"FP|   score moved: median {q(dsc,50):.2f} p90 {q(dsc,90):.2f} max {dsc.max():.2f} | >1 {100*float((dsc > 1).mean()):.1f}% | >5 {100*float((dsc > 5).mean()):.1f}% | "
              f"mean stored {both['score_old'].mean():.2f} -> new {both['score_new'].mean():.2f} | stored score = formula(stored hp, stored conf): {100*arith:.1f}%", flush=True)
        top_old = set(both.nlargest(50, "score_old")[k].astype(str).agg("|".join, axis=1))
        top_new = set(both.nlargest(50, "score_new")[k].astype(str).agg("|".join, axis=1))
        print(f"FP|   top-50 legs by score, same set: {len(top_old & top_new)}/50", flush=True)
        summary.append((d, season, len(old), len(new), len(both), q(dfh, 50), float((dfh > 1).mean()), q(dsc, 50), float((dsc > 5).mean()),
                        both["score_old"].mean(), both["score_new"].mean(), len(top_old & top_new), arith, chain_same))
    # 3. baseline: stored vs honest replay, on the same rungs
    print("FP|================ BASELINE: stored baseline_history vs honest replay baseline_history_h (same player / prop / line) ================", flush=True)
    for d in dates:
        b = pd.read_sql("""WITH h AS (SELECT h.player_id::text pid, h.prop, u.line::float8 line, u.pm::float8 pm
                                      FROM nba_score.baseline_history_h h, unnest(h.lines, h.p_more) AS u(line, pm) WHERE h.game_date=%s)
                           SELECT s.season, s.prop, s.p_more::float8 p_old, h.pm p_h FROM nba_score.baseline_history s
                           JOIN h ON h.pid=s.player_id::text AND h.prop=s.prop AND h.line=s.line::float8
                           WHERE s.game_date=%s AND coalesce(s.period,'FULL')='FULL'""", ro, params=(d, d))
        if b.empty:
            print(f"FP|{d}: no overlap with the honest replay", flush=True)
            continue
        x = 100 * (b["p_old"] - b["p_h"]).abs()
        print(f"FP|{d} ({b['season'].iloc[0]}): {len(b):,} rungs | P(over) differs: median {q(x,50):.2f} pts, p90 {q(x,90):.2f}, max {x.max():.1f} | "
              f"> 2 pts {100*float((x > 2).mean()):.1f}% | > 5 pts {100*float((x > 5).mean()):.1f}% | corr {np.corrcoef(b['p_old'], b['p_h'])[0,1]:.3f}", flush=True)
    print("FP|================ SUMMARY (final_hp chain) ================", flush=True)
    for s in summary:
        print(f"FP|  {s[0]} {s[1]}: stored {s[2]:,} new {s[3]:,} both {s[4]:,} | final_hp median move {s[5]:.2f} pts, >1 pt {100*s[6]:.0f}% | score median move {s[7]:.2f}, >5 {100*s[8]:.0f}% | "
              f"mean score {s[9]:.1f} -> {s[10]:.1f} | top-50 same {s[11]}/50 | score arithmetic {100*s[12]:.0f}% | chain same {100*s[13]:.0f}%", flush=True)
    print("FP|DONE", flush=True)


if __name__ == "__main__":
    main()
