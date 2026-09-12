#!/usr/bin/env python3
"""
LIVE BOARD ARCHIVER — the gap that would have left opening day with no history.

THE PROBLEM: every board scraper writes boards/<app>_<sport>_current.json and OVERWRITES it on the next
run. Git keeps old versions, but that is not queryable and it bloats the repo. The two-season historical
board lives in nba_market.board_snapshots; from opening day the LIVE boards must land in the same table,
in the same shape, or the parity rule breaks the moment the season starts.

WHAT IT DOES
  Reads whichever board files exist (prizepicks, underdog, sleeper, fliff, betr), normalizes each app's
  shape to the board_snapshots columns, and writes them with a snapshot_label:
      window  - the 2:45 PM PT pull (or first tip - 2h on early slates), the decision moment
      close   - a late pull for line-movement measurement
      routine - any other cron pull, kept for movement history but not used as a decision snapshot
  Idempotent: the same leg at the same label updates rather than duplicating (unique index already on
  the table). Nothing is deleted.

SHAPES (each app differs - this is the normalization the engine would otherwise repeat everywhere):
  prizepicks  data[].attributes: line_score, stat_type, odds_type (standard/goblin/demon), start_time
  underdog    legs[] + ladder[]: stat, line, higher/lower payout, is_main
  sleeper     legs[]: wager_type, line, over/under multiplier
  fliff       legs[]: market, line, coeff_american per proposal
  betr        legs[]: stat, line, tier, sides

Env: DATABASE_URL, ARCHIVE_LABEL (window|close|routine), ARCHIVE_SPORT (nba), ARCHIVE_APPS
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg

BOARDS = Path("boards")


def ev(app, gd, doc_or_leg, *keys):
    """Live boards carry no Odds API event_id, but the column is NOT NULL and the unique index keys on
    it. Synthesize a stable id from whatever game/event identifier the app provides, so re-running the
    archiver updates the same rows instead of duplicating them."""
    for k in keys:
        v = doc_or_leg.get(k) if isinstance(doc_or_leg, dict) else None
        if v:
            return f"live-{app}-{gd}-{v}"
    return f"live-{app}-{gd}-unknown"


def load(app, sport):
    p = BOARDS / f"{app}_{sport}_current.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception as exc:  # noqa: BLE001
        print(f"  {p.name}: {exc}", flush=True)
        return None


def rows_prizepicks(doc, gd, label):
    out = []
    inc = {i["id"]: i for i in doc.get("included", []) if i.get("type") == "new_player"}
    for p in doc.get("data", []):
        a = p.get("attributes") or {}
        rel = ((p.get("relationships") or {}).get("new_player") or {}).get("data") or {}
        who = (inc.get(rel.get("id"), {}).get("attributes") or {}).get("display_name")
        if not who or a.get("line_score") is None:
            continue
        odds_type = (a.get("odds_type") or "standard").lower()
        mk = "player_" + str(a.get("stat_type", "")).lower().replace(" ", "_")
        if odds_type in ("goblin", "demon"):
            mk += "_alternate"
        for side, price in (("Over", -137 if odds_type != "demon" else 100),
                            ("Under", -137 if odds_type == "standard" else None)):
            if price is None:
                continue
            out.append((gd, ev("prizepicks", gd, a, "game_id", "start_time"), label, a.get("board_time") or a.get("start_time"), "prizepicks", mk,
                        who, side, float(a["line_score"]), price, None, None, None, a.get("start_time")))
    return out


def rows_underdog(doc, gd, label):
    out = []
    for l in (doc.get("legs") or []) + (doc.get("ladder") or []):
        line = l.get("line")
        if line is None or not l.get("player"):
            continue
        mk = "player_" + str(l.get("stat") or l.get("stat_key") or "").lower().replace(" ", "_")
        if l.get("is_main") is False:
            mk += "_alternate"
        for side, key in (("Over", "higher_american"), ("Under", "lower_american")):
            price = l.get(key) or l.get("over_american" if side == "Over" else "under_american")
            if price is None:
                continue
            out.append((gd, ev("underdog", gd, l, "game_id", "match_id", "event"), label, doc.get("meta", {}).get("fetched_at"), "underdog", mk,
                        l["player"], side, float(line), float(price), None, None, None, l.get("event_start_utc")))
    return out


def rows_sleeper(doc, gd, label):
    out = []
    for l in doc.get("legs") or []:
        if l.get("line") is None or not l.get("player"):
            continue
        mk = "player_" + str(l.get("wager_type", "")).lower()
        for side, key in (("Over", "over_multiplier"), ("Under", "under_multiplier")):
            m = l.get(key)
            if m is None:
                continue
            out.append((gd, ev("sleeper", gd, l, "game_id", "event"), label, doc.get("meta", {}).get("fetched_at"), "sleeper", mk,
                        l["player"], side, float(l["line"]), None, float(m), None, None, None))
    return out


def rows_generic(doc, app, gd, label):
    out = []
    skipped = 0
    for l in doc.get("legs") or []:
        line = l.get("line")
        if line in (None, "") or not l.get("player"):
            skipped += 1
            continue
        try:
            line = float(line)
        except (TypeError, ValueError):
            skipped += 1          # Fliff sends '' on team markets with no numeric line - skip the leg,
            continue              # never abort the archive (an exception here lost every later app)
        mk = "player_" + str(l.get("stat") or l.get("market") or "").lower().replace(" ", "_")
        side = (l.get("selection") or l.get("side") or "Over").title()
        price = l.get("coeff_american") or l.get("american") or l.get("price")
        try:
            price = float(price) if price not in (None, "") else None
        except (TypeError, ValueError):
            price = None
        out.append((gd, ev(app, gd, l, "conflict_fkey", "event_id", "game_id", "event"), label,
                    doc.get("meta", {}).get("fetched_at"), app, mk, l["player"],
                    side if side in ("Over", "Under") else "Over", line,
                    price, None, None, None, l.get("event_start_utc")))
    if skipped:
        print(f"  {app}: skipped {skipped} legs with no usable line", flush=True)
    return out


def main():
    label = os.environ.get("ARCHIVE_LABEL", "routine")
    sport = os.environ.get("ARCHIVE_SPORT", "nba")
    apps = [a.strip() for a in os.environ.get("ARCHIVE_APPS", "prizepicks,underdog,sleeper,fliff,betr").split(",")]
    gd = datetime.now(timezone.utc).astimezone().date()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    total = 0
    for app in apps:
        doc = load(app, sport)
        if not doc:
            print(f"{app}: no board file", flush=True)
            continue
        if app == "prizepicks":
            rows = rows_prizepicks(doc, gd, label)
        elif app == "underdog":
            rows = rows_underdog(doc, gd, label)
        elif app == "sleeper":
            rows = rows_sleeper(doc, gd, label)
        else:
            rows = rows_generic(doc, app, gd, label)
        if not rows:
            print(f"{app}: 0 rows parsed", flush=True)
            continue
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_market.board_snapshots
                (game_date, event_id, snapshot_label, snapshot_ts, bookmaker, market_key, player, side,
                 line, price, multiplier, home_team, away_team, commence_time)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT ((md5(coalesce(event_id,'')||'|'||coalesce(snapshot_label,'')||'|'||coalesce(bookmaker,'')||'|'||
                              coalesce(market_key,'')||'|'||coalesce(player,'')||'|'||coalesce(side,'')||'|'||
                              coalesce(line::text,''))::uuid))
                DO UPDATE SET price=EXCLUDED.price, multiplier=EXCLUDED.multiplier,
                              snapshot_ts=EXCLUDED.snapshot_ts, fetched_at=now()""", rows)
        conn.commit()
        total += len(rows)
        print(f"{app}: archived {len(rows):,} legs as '{label}'", flush=True)
    print(f"TOTAL {total:,} legs archived for {gd} ({label})", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
