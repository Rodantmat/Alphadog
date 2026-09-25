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
      window  - the 1:15 PM PT pull (or first tip - 2h on early slates), the decision moment
                CUTOFF CORRECTED 2026-09-19 (COMPASS fact 107): this used to say 2:45 PM PT, which came
                from nba_asof.py's PHASE2 and ultimately from the 5:30 PM ET LEAGUE BULLETIN - a
                republication, not a filing deadline. The real constraint is the game-day injury report,
                due 11am-1pm LOCAL to each game's market, so Pacific clubs file last at 1:00 PM PT.
                One window at 1:15 PM PT holds every club's report.
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
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

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


# 🔴 PRIZEPICKS STAT NAMES ARE NOT THE CANONICAL ONES (fixed 2026-09-24).
# The builder below used PrizePicks' own labels verbatim - "player_" + stat_type.lower() - so the first
# live NBA board we ever captured wrote `player_3-pt_made`, `player_pts+rebs`, `player_pts+rebs+asts`,
# `player_blocked_shots`. Every consumer joins on the ODDS API convention that the two-season history is
# written in: `player_threes`, `player_points_rebounds`, `player_points_rebounds_assists`,
# `player_blocks` (nba_score.paper_prop_map, the scorer, the grader, the slip engine).
# Only points, rebounds and assists happened to match. Combos are ~44% of the board, so on opening night
# those legs would have joined to NOTHING - no error, no empty-result warning, just a board that
# quietly lost half itself. Verified by diffing the live 2026-10-20 keys against historical 2026-04-12.
# Anything unmapped falls through to the old behaviour and is printed once, so a new PrizePicks stat
# shows up as a visible unknown rather than silently vanishing.
PP_STAT_MAP = {
    "points": "player_points", "rebounds": "player_rebounds", "assists": "player_assists",
    "3-pt_made": "player_threes", "3-pointers_made": "player_threes", "3-pt_attempted": "player_threes_attempted",
    "3-pointers_attempted": "player_threes_attempted",
    "pts+rebs": "player_points_rebounds", "pts+asts": "player_points_assists",
    "rebs+asts": "player_rebounds_assists", "pts+rebs+asts": "player_points_rebounds_assists",
    "blocked_shots": "player_blocks", "steals": "player_steals",
    "blks+stls": "player_blocks_steals", "turnovers": "player_turnovers",
    # PrizePicks' API spells these "Fantasy Points" and "FT Made" (verified 2026-09-25 against a
    # published sample of its projections payload); the earlier guesses are kept as aliases.
    "fantasy_points": "player_fantasy_points", "fantasy_score": "player_fantasy_points",
    "double-double": "player_double_double", "triple-double": "player_triple_double",
    "ft_made": "player_ftm", "free_throws_made": "player_ftm", "ft_attempted": "player_fta",
    "free_throws_attempted": "player_fta",
    "offensive_rebounds": "player_oreb", "defensive_rebounds": "player_dreb",
    "fg_made": "player_fgm", "fg_attempted": "player_fga", "personal_fouls": "player_personal_fouls",
}
# PERIOD PREFIXES (2026-09-25). PrizePicks posts period props with a prefix on the stat name - "1H Points",
# "1H 3-Pointers Made", "1Q Points" (verified against its API shape and third-party market maps). The
# suffix here matches the scorer's MARKET_TO_PROP keys (player_points_q1, player_points_h1, ...).
PP_PERIOD_PREFIX = {"1q_": "_q1", "2q_": "_q2", "3q_": "_q3", "4q_": "_q4", "1h_": "_h1", "2h_": "_h2",
                    "1st_quarter_": "_q1", "1st_half_": "_h1", "2nd_half_": "_h2", "4th_quarter_": "_q4"}
_pp_unmapped = set()


def pp_market_key(stat_type):
    """PrizePicks stat_type -> the scorer's market key, or None if unknown (printed once)."""
    raw = str(stat_type or "").lower().replace(" ", "_")
    suffix = ""
    for pre, suf in PP_PERIOD_PREFIX.items():
        if raw.startswith(pre):
            raw, suffix = raw[len(pre):], suf
            break
    base = PP_STAT_MAP.get(raw)
    if base is None:
        if raw not in _pp_unmapped:
            _pp_unmapped.add(raw)
            print(f"  prizepicks: UNMAPPED stat_type '{stat_type}' -> player_{raw}{suffix} "
                  f"(add it to PP_STAT_MAP or it will not join the history)", flush=True)
        base = "player_" + raw
    return base + suffix


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
        raw = str(a.get("stat_type", "")).lower().replace(" ", "_")
        mk = PP_STAT_MAP.get(raw)
        if mk is None:
            mk = "player_" + raw
            if raw not in _pp_unmapped:
                _pp_unmapped.add(raw)
                print(f"  prizepicks: UNMAPPED stat_type '{a.get('stat_type')}' -> {mk} "
                      f"(add it to PP_STAT_MAP or it will not join the history)", flush=True)
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


def rows_fliff(doc, gd, label):
    """Fliff's leg shape differs from the others: the line lives on the proposal as
    t_142_selection_param_1 (the scraper stores it as `line`, but it is a STRING and is empty on team
    markets), the side is t_141_selection_name (Over/Under/Yes/No/team name), and the price is the
    American `coeff`. The generic parser skipped all 4,592 legs because it expected a numeric top-level
    line - this reads Fliff's own fields."""
    out, skipped = [], 0
    for l in doc.get("legs") or []:
        raw = l.get("line")
        sel = str(l.get("selection") or "").strip()
        if raw in (None, "") or not l.get("player"):
            skipped += 1
            continue
        try:
            line = float(raw)
        except (TypeError, ValueError):
            skipped += 1
            continue
        # SIDE: Fliff's selection is "Brandon Pfaadt Over 4.5" - the direction sits in the MIDDLE, after
        # the player name. A startswith() test matched only the handful of selections that lead with the
        # word and dropped 1,376 of 1,394 legs.
        low = sel.lower()
        if re.search(r"\b(over|more)\b", low):
            side = "Over"
        elif re.search(r"\b(under|less)\b", low):
            side = "Under"
        elif low.startswith("yes"):
            side = "Over"
        elif low.startswith("no"):
            side = "Under"
        else:
            side = None
        if side is None:
            skipped += 1                 # team markets / moneyline selections: not a player O/U leg
            continue
        price = l.get("coeff_american") or l.get("coeff")
        try:
            price = float(price) if price not in (None, "") else None
        except (TypeError, ValueError):
            price = None
        mk = "player_" + str(l.get("market") or l.get("stat") or "").lower().replace(" ", "_")
        # Fliff sends event_start_utc as epoch MILLISECONDS; the column is a timestamp
        _start = l.get("event_start_utc")
        if isinstance(_start, (int, float)):
            _start = datetime.fromtimestamp(_start / 1000.0, tz=timezone.utc).isoformat()
        out.append((gd, ev("fliff", gd, l, "conflict_fkey", "event"), label,
                    doc.get("meta", {}).get("fetched_at"), "fliff", mk, l["player"], side, line,
                    price, None, None, None, _start))
    if skipped:
        print(f"  fliff: skipped {skipped} non-player-O/U legs (team markets, no numeric line)", flush=True)
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
    failures = []
    for app in apps:
        doc = load(app, sport)
        if not doc:
            print(f"{app}: no board file", flush=True)
            continue
        try:
            if app == "prizepicks":
                rows = rows_prizepicks(doc, gd, label)
            elif app == "underdog":
                rows = rows_underdog(doc, gd, label)
            elif app == "sleeper":
                rows = rows_sleeper(doc, gd, label)
            elif app == "fliff":
                rows = rows_fliff(doc, gd, label)
            else:
                rows = rows_generic(doc, app, gd, label)
        except Exception as exc:  # noqa: BLE001
            # one app's shape must never cost the others their archive - report and carry on
            print(f"{app}: PARSE FAILED ({exc}) - skipped, other apps continue", flush=True)
            failures.append(app)
            continue
        if not rows:
            print(f"{app}: 0 rows parsed", flush=True)
            continue
        # 🔴 DATE THE LEG BY ITS GAME, NOT BY THE CLOCK (fixed 2026-09-24). Every row was stamped with
        # `gd` = the capture date. In season that usually coincides, so it hid - but PrizePicks posts
        # opening-night lines WEEKS early: captured 2026-09-24, the first PP NBA board we ever stored
        # carried commence_time 2026-10-20T19:10Z and was filed under 2026-09-24. Everything downstream
        # keys on game_date (the scorer, the tier build, the grader, the paper log), so those legs would
        # have been invisible on the day they matter and would have polluted a slate that has no games.
        # THE CONVENTION IS EASTERN, verified against nba_calendar.games: opening night 2026-10-20 holds
        # a game at 2026-10-21T01:30Z whose game_date is still 2026-10-20 - the ET date, not the UTC one.
        # Legs with no tip time (rare, app-dependent) keep the capture date rather than being dropped.
        fixed = []
        for r in rows:
            r = list(r)
            ct = r[13]
            if ct:
                try:
                    dt = ct if isinstance(ct, datetime) else datetime.fromisoformat(str(ct).replace("Z", "+00:00"))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    r[0] = dt.astimezone(ZoneInfo("America/New_York")).date()
                except Exception:  # noqa: BLE001
                    pass
            fixed.append(tuple(r))
        moved = sum(1 for a_, b_ in zip(rows, fixed) if a_[0] != b_[0])
        if moved:
            dates = sorted({r[0].isoformat() for r in fixed})
            print(f"  {app}: {moved} legs dated by tip time instead of capture date -> {', '.join(dates[:6])}",
                  flush=True)
        rows = fixed
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_market.board_snapshots
                (game_date, event_id, snapshot_label, snapshot_ts, bookmaker, market_key, player, side,
                 line, price, multiplier, home_team, away_team, commence_time)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT ((md5(coalesce(event_id,'')||'|'||coalesce(snapshot_label,'')||'|'||coalesce(bookmaker,'')||'|'||
                              coalesce(market_key,'')||'|'||coalesce(player,'')||'|'||coalesce(side,'')||'|'||
                              coalesce(line::text,''))::uuid))
                DO UPDATE SET price=EXCLUDED.price, multiplier=EXCLUDED.multiplier,
                              game_date=EXCLUDED.game_date, commence_time=EXCLUDED.commence_time,
                              snapshot_ts=EXCLUDED.snapshot_ts, fetched_at=now()""", rows)
        conn.commit()
        total += len(rows)
        print(f"{app}: archived {len(rows):,} legs as '{label}'", flush=True)
    print(f"TOTAL {total:,} legs archived for {gd} ({label})", flush=True)
    conn.close()
    if failures:
        # fail the job so a broken parser is visible, but only AFTER the healthy apps are safely stored
        raise SystemExit(f"parse failures: {', '.join(failures)}")


if __name__ == "__main__":
    main()
