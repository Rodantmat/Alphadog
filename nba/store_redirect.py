#!/usr/bin/env python3
"""
STORE REDIRECT - run a production builder UNCHANGED against the parallel store (owner 2026-11-20 20:58 PT: the same pipeline for every date).
Every SQL statement the builder sends is rewritten so the scoring tables it reads and writes are their _v2 twins; inputs (boards, box scores,
market, outcomes) stay the production tables. The builder's code is not edited, so the replay IS the production computation.
Use:  import store_redirect; store_redirect.activate()   (before the builder connects)
"""
import re

import psycopg

TABLES = ("baseline_history", "final_hp", "final_hp_derived", "final_hp_all", "confidence_model", "confidence_verification",
          "ladder_calibration_asof", "final_hp_board_cal", "board_scored")
INDEXES = ("final_hp_uidx", "final_hp_lookup", "final_hp_derived_key", "final_hp_derived_lookup", "final_hp_derived_date")
_T = re.compile(r"\bnba_score\.(" + "|".join(sorted(TABLES, key=len, reverse=True)) + r")\b(?!_v2)")
_I = re.compile(r"\b(" + "|".join(INDEXES) + r")\b")


def rewrite(q):
    if not isinstance(q, str):
        q = q.as_string(None) if hasattr(q, "as_string") else str(q)
    q = _T.sub(lambda m: f"nba_score.{m.group(1)}_v2", q)
    return _I.sub(lambda m: m.group(1).replace("final_hp", "final_hp_v2", 1), q)


class RedirectCursor(psycopg.Cursor):
    def execute(self, query, params=None, **kw):
        return super().execute(rewrite(query), params, **kw)

    def executemany(self, query, params_seq, **kw):
        return super().executemany(rewrite(query), params_seq, **kw)


class RedirectServerCursor(psycopg.ServerCursor):
    def execute(self, query, params=None, **kw):
        return super().execute(rewrite(query), params, **kw)


_real = psycopg.connect


def activate():
    def _connect(*a, **k):
        k.setdefault("cursor_factory", RedirectCursor)
        c = _real(*a, **k)
        c.server_cursor_factory = RedirectServerCursor
        return c
    psycopg.connect = _connect
