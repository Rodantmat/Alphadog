#!/usr/bin/env python3
"""
LIVE SPORTSBOOK PLAYER PROPS - the market term, live (2026-10-09; owner: "for market we're gonna get the Odds API ... for props
we use ParlayAPI"; strategy §31ac).

WHY. The certified history scored every leg with a market term - how many sportsbooks priced that exact rung (f_books =
books/4) and whether they agreed (f_agree) - built by build_rung_market.py from sportsbook rows in nba_market.board_snapshots
(the Odds API backfills, bookmakers draftkings / fanduel / betmgm / williamhill_us / betrivers / bovada / betonlineag /
fanatics). The live pipeline archived only the DFS apps, so every live leg carried f_books = 0 - the gap the market-free
twins measure (round 2 P3#4, round 3 #4). This step closes it at the source: at the P3 window it fetches ParlayAPI's live
NBA player props (every sportsbook + the DFS apps; 3 credits per call), keeps the raw payload lossless
(nba_market.parlay_props_captures - retention rule), and writes the SPORTSBOOK rows into nba_market.board_snapshots in the
backfill's exact shape (Odds API market keys, Over / Under rows with American prices, label 'window'), so build_rung_market
and build_final_hp see today's rungs exactly as they saw the history's. The DFS rows ParlayAPI carries are NOT written -
our own scrapers are the certified board source (COMPASS fact 48).

MARKET KEYS. ParlayAPI's market_key is book-derived; the map to the Odds API vocabulary lives in the tunable
nba_config.classification_config['market_feed'].market_map (defaults below). An unmapped key is kept in the raw capture,
skipped in the normalization and LISTED in the log - never silently dropped, never guessed.

Modes (CP_MODE): probe   = fetch + raw capture (label 'probe_<label>') + inventory of books / keys / lines, nothing into
                           board_snapshots (the default for a bare run)
                 capture = probe + normalize into board_snapshots (P3 sets it explicitly)
Env: DATABASE_URL, CP_MODE, CP_LABEL (window | morning | close; default window), CP_DATE (slate ET date; default today ET),
     CP_FORCE=1 (re-capture a slot that already has a capture), CP_SPORT (basketball_nba).
One set per day per label: a slot already captured is left alone unless CP_FORCE=1.
"""
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import psycopg

ET = ZoneInfo("America/New_York")
PARLAY = "https://parlay-api.com/v1"
SPORT = os.environ.get("CP_SPORT") or "basketball_nba"
MODE = (os.environ.get("CP_MODE") or "probe").lower()      # P3 sets capture explicitly; a bare run never writes the board
LABEL = os.environ.get("CP_LABEL") or "window"
FORCE = os.environ.get("CP_FORCE") == "1"

DEFAULT_CFG = {
    "enabled": True,
    "provider": "parlayapi",
    "key_name": "parlay_api_key",          # which nba_config.external_credentials row holds the key (parlay_api_key_alt = the 2026-10-09 key)
    # the sportsbooks the certified history counted (build_rung_market.BOOKS) - the live term must count the same set
    "books": ["draftkings", "fanduel", "betmgm", "williamhill_us", "betrivers", "bovada", "betonlineag", "fanatics"],
    # ParlayAPI bookmaker name -> the history's bookmaker name (identity unless listed)
    "book_aliases": {"caesars": "williamhill_us", "williamhill": "williamhill_us", "betonline": "betonlineag"},
    # ParlayAPI market_key -> Odds API market key (the history's vocabulary). Filled from the first probe; unmapped = listed.
    "market_map": {
        "player_points": "player_points", "player_rebounds": "player_rebounds", "player_assists": "player_assists",
        "player_threes": "player_threes", "player_three_pointers_made": "player_threes", "player_3pt_made": "player_threes",
        "player_blocks": "player_blocks", "player_steals": "player_steals", "player_turnovers": "player_turnovers",
        "player_points_rebounds_assists": "player_points_rebounds_assists", "player_pra": "player_points_rebounds_assists",
        "player_points_rebounds": "player_points_rebounds", "player_points_assists": "player_points_assists",
        "player_rebounds_assists": "player_rebounds_assists", "player_blocks_steals": "player_blocks_steals",
        "player_steals_blocks": "player_blocks_steals",
    },
    # ParlayAPI suffixes that mean "alternate line" -> appended as the history's `_alternate`
    "alternate_suffixes": ["_alternate", "_alt", "_alternates"],
}
DDL = """CREATE TABLE IF NOT EXISTS nba_market.parlay_props_captures (
  capture_date date NOT NULL, label text NOT NULL, sport text NOT NULL, captured_at timestamptz DEFAULT now(),
  http_status int, n_items int, credits_remaining text, n_written int, unmapped jsonb, payload jsonb,
  PRIMARY KEY (capture_date, label, sport))"""


def load_cfg(conn):
    cfg = dict(DEFAULT_CFG)
    row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='market_feed'").fetchone()
    if row:
        j = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        for k, v in j.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k] = {**cfg[k], **v}
            else:
                cfg[k] = v
    return cfg


def api_key(conn, name):
    r = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key=%s", (name,)).fetchone()
    if not r:
        raise SystemExit(f"credential store has no '{name}' row")
    return r[0].strip()


def fetch(key):
    req = urllib.request.Request(f"{PARLAY}/sports/{SPORT}/props", headers={"X-API-Key": key, "accept": "application/json", "User-Agent": "alphadog"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.headers.get("x-requests-remaining"), json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        return e.code, e.headers.get("x-requests-remaining"), {"error": body}


def et_date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(ET).date()
    except ValueError:
        return None


def normalize(items, cfg, label, slate):
    books = set(cfg["books"]); alias = cfg.get("book_aliases", {}); mmap = cfg["market_map"]; alts = cfg.get("alternate_suffixes", [])
    rows, unmapped, flat = [], {}, 0
    now = datetime.now(timezone.utc)
    for it in items:
        bk = alias.get(str(it.get("bookmaker") or "").lower(), str(it.get("bookmaker") or "").lower())
        if bk not in books:
            continue
        if it.get("is_dfs_flat_payout"):
            flat += 1
            continue
        mk = str(it.get("market_key") or "").lower(); base, alt = mk, False
        for sfx in alts:
            if base.endswith(sfx):
                base, alt = base[: -len(sfx)], True
        odds_key = mmap.get(base)
        if not odds_key:
            unmapped[mk] = unmapped.get(mk, 0) + 1
            continue
        if alt:
            odds_key += "_alternate"
        line = it.get("line")
        if line is None:
            continue
        # the archive's game_date is the EASTERN date of the tip (archive_live_boards); ParlayAPI's own game_date is the fallback
        gd = et_date(it.get("commence_time"))
        if gd is None and isinstance(it.get("game_date"), str) and len(it["game_date"]) >= 10:
            gd = datetime.strptime(it["game_date"][:10], "%Y-%m-%d").date()
        if gd is None:
            continue
        lab = label if gd == slate else "routine"      # the decision label is for the slate's games only (archive rule)
        ev = str(it.get("canonical_event_id") or it.get("event_id") or "")
        ct = it.get("commence_time")
        for side, pk in (("Over", "over_price"), ("Under", "under_price")):
            p = it.get(pk)
            if p in (None, ""):
                continue
            try:
                price = int(round(float(p)))
            except (TypeError, ValueError):
                continue
            rows.append((gd, ev, lab, now, bk, odds_key, it.get("player"), side, float(line), price, None,
                         it.get("home_team"), it.get("away_team"), ct))
    return rows, unmapped, flat


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute(DDL); conn.commit()
    cfg = load_cfg(conn)
    if not cfg.get("enabled", True):
        print("market feed disabled (classification_config['market_feed'].enabled = false) - nothing fetched", flush=True)
        return
    slate = datetime.strptime(os.environ["CP_DATE"], "%Y-%m-%d").date() if os.environ.get("CP_DATE") else datetime.now(ET).date()
    store_label = LABEL if MODE == "capture" else f"probe_{LABEL}"     # a probe never overwrites the day's real capture
    prior = conn.execute("SELECT captured_at, n_items, n_written FROM nba_market.parlay_props_captures WHERE capture_date=%s AND label=%s AND sport=%s",
                         (slate, store_label, SPORT)).fetchone()
    if prior and not FORCE and MODE == "capture":
        print(f"{slate} {LABEL}: already captured at {prior[0]} ({prior[1]} items, {prior[2]} rows written) - one set per day (CP_FORCE=1 to redo)", flush=True)
        return
    status, remaining, doc = fetch(api_key(conn, cfg["key_name"]))
    items = doc if isinstance(doc, list) else (doc.get("data") or doc.get("props") or [])
    print(f"ParlayAPI {SPORT}/props: http {status}, {len(items)} items, credits remaining {remaining}", flush=True)
    if status != 200:
        conn.execute("""INSERT INTO nba_market.parlay_props_captures (capture_date, label, sport, http_status, n_items, credits_remaining, n_written, unmapped, payload)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (capture_date, label, sport) DO UPDATE SET captured_at=now(),
                        http_status=EXCLUDED.http_status, payload=EXCLUDED.payload""",
                     (slate, store_label, SPORT, status, 0, remaining, 0, json.dumps({}), json.dumps(doc)))
        conn.commit()
        raise SystemExit(f"ParlayAPI returned http {status}: {str(doc)[:200]}")
    # inventory (both modes)
    by_book = {}
    for it in items:
        b = str(it.get("bookmaker") or "?").lower(); by_book.setdefault(b, set()).add(str(it.get("market_key")))
    print("  books: " + ", ".join(f"{b} ({len(ks)} keys)" for b, ks in sorted(by_book.items())), flush=True)
    sb = sorted({k for b, ks in by_book.items() if b in set(cfg["books"]) or cfg.get("book_aliases", {}).get(b) in set(cfg["books"]) for k in ks})
    print(f"  sportsbook market keys ({len(sb)}): {', '.join(sb)}", flush=True)
    dates = {}
    for it in items:
        d = et_date(it.get("commence_time")) or it.get("game_date"); dates[str(d)] = dates.get(str(d), 0) + 1
    print("  game dates: " + ", ".join(f"{d}: {n}" for d, n in sorted(dates.items())), flush=True)
    rows, unmapped, flat = normalize(items, cfg, LABEL, slate)
    if unmapped:
        print(f"  UNMAPPED sportsbook market keys (kept raw, not written): " + ", ".join(f"{k} x{n}" for k, n in sorted(unmapped.items(), key=lambda x: -x[1])), flush=True)
    n_slate = sum(1 for r in rows if r[2] == LABEL)
    print(f"  normalized: {len(rows)} sportsbook Over/Under rows ({n_slate} for the {slate} slate as '{LABEL}', {len(rows)-n_slate} other dates as 'routine'; {flat} flat DFS rows skipped)", flush=True)
    written = 0
    if MODE == "capture" and rows:
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_market.board_snapshots
                (game_date, event_id, snapshot_label, snapshot_ts, bookmaker, market_key, player, side,
                 line, price, multiplier, home_team, away_team, commence_time)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT ((md5(coalesce(event_id,'')||'|'||coalesce(snapshot_label,'')||'|'||coalesce(bookmaker,'')||'|'||
                              coalesce(market_key,'')||'|'||coalesce(player,'')||'|'||coalesce(side,'')||'|'||
                              coalesce(line::text,''))::uuid))
                DO UPDATE SET price=EXCLUDED.price, game_date=EXCLUDED.game_date, commence_time=EXCLUDED.commence_time,
                              snapshot_ts=EXCLUDED.snapshot_ts, fetched_at=now()""", rows)
        written = len(rows)
        print(f"  board_snapshots: {written} sportsbook rows written", flush=True)
    conn.execute("""INSERT INTO nba_market.parlay_props_captures (capture_date, label, sport, http_status, n_items, credits_remaining, n_written, unmapped, payload)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (capture_date, label, sport) DO UPDATE SET captured_at=now(),
                    http_status=EXCLUDED.http_status, n_items=EXCLUDED.n_items, credits_remaining=EXCLUDED.credits_remaining,
                    n_written=EXCLUDED.n_written, unmapped=EXCLUDED.unmapped, payload=EXCLUDED.payload""",
                 (slate, store_label, SPORT, status, len(items), remaining, written, json.dumps(unmapped), json.dumps(items)))
    conn.commit()
    conn.close()
    print(f"DONE ({MODE}) {slate} {LABEL}: raw capture stored, {written} rows into board_snapshots", flush=True)


if __name__ == "__main__":
    main()
