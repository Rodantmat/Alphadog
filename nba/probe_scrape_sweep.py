#!/usr/bin/env python3
"""SWEEP (2026-10-19, owner 15:58 PT: "another full sweep just to be sure that all the scraping is good one last time").
Runs every production board scraper exactly as P3 does (same scripts, same sport filters) into a SCRATCH directory, then parses each
file with the archiver's own row builders (archive_live_boards.rows_*) and the archiver's game-date rule, and checks, for the
2026-10-20 slate: rows per app and market, every market key against the scorer's MARKET_TO_PROP (unmapped = a leg that would never
score), every player against nba_ref.player_name_map, ladder depth, prices / multipliers present, and the counts against what
today's P3 archived. NOTHING is written: no DB write, no commit (the scratch dir is discarded with the runner)."""
import json
import os
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SLATE = date.fromisoformat(os.environ.get("SWEEP_DATE", "2026-10-20"))
TMP = Path(tempfile.mkdtemp(prefix="sweep_"))
ENV = dict(os.environ, PP_NBA_OUT_DIR=str(TMP), PP_NBA_MIN_FUTURE_ROWS="50", SLEEPER_SPORTS="nba", SLEEPER_OUT_DIR=str(TMP),
           UNDERDOG_SPORTS="NBA", UNDERDOG_OUT_DIR=str(TMP), FLIFF_SPORTS="nba", FLIFF_OUT_DIR=str(TMP))
SCRAPERS = [("prizepicks", "scrape_prizepicks_nba_board.py", 420), ("sleeper", "scrape_sleeper_board.py", 300),
            ("underdog", "scrape_underdog_board.py", 300), ("fliff", "scrape_fliff_board.py", 300)]

print(f"SWEEP for slate {SLATE} - scratch {TMP}", flush=True)
for app, script, tmo in SCRAPERS:
    t0 = datetime.now(timezone.utc)
    try:
        r = subprocess.run([sys.executable, str(HERE / script)], env=ENV, cwd=str(HERE.parent), capture_output=True, text=True, timeout=tmo)
        tail = (r.stdout + r.stderr).strip().splitlines()[-6:]
        print(f"[{app}] exit {r.returncode} in {(datetime.now(timezone.utc) - t0).seconds}s", flush=True)
    except subprocess.TimeoutExpired:
        tail = ["TIMEOUT"]
        print(f"[{app}] TIMEOUT after {tmo}s", flush=True)
    for ln in tail:
        print(f"   | {ln[:220]}", flush=True)

import archive_live_boards as A  # noqa: E402
import ast  # noqa: E402
A.BOARDS = TMP
builders = {"prizepicks": A.rows_prizepicks, "underdog": A.rows_underdog, "sleeper": A.rows_sleeper, "fliff": A.rows_fliff}
# the scorer's own map, read from its source (score_board_legs imports pandas, which this runner does not install)
_src = (HERE / "score_board_legs.py").read_text()
_i = _src.index("MARKET_TO_PROP = {")
mk2prop = ast.literal_eval(_src[_i + len("MARKET_TO_PROP = "):_src.index("\n}", _i) + 2])
gd = datetime.now(ZoneInfo("America/New_York")).date()
conn = psycopg.connect(os.environ["DATABASE_URL"])
names = {r[0] for r in conn.execute("SELECT norm_name FROM nba_ref.player_name_map").fetchall()}
archived = dict(conn.execute("""SELECT bookmaker, count(*) FROM nba_market.board_snapshots WHERE game_date=%s
                                AND fetched_at > now() - interval '30 hours' GROUP BY 1""", (SLATE,)).fetchall())


def et_date(ct):
    if not ct:
        return None
    try:
        if isinstance(ct, str) and len(ct) == 10:
            return date.fromisoformat(ct)
        dt = ct if isinstance(ct, datetime) else datetime.fromisoformat(str(ct).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(ZoneInfo("America/New_York")).date()
    except Exception:  # noqa: BLE001
        return None


problems = []
for app, fn in builders.items():
    doc = A.load(app, "nba")
    if not doc:
        print(f"\n== {app}: NO FILE", flush=True); problems.append(f"{app}: no file"); continue
    try:
        rows = fn(doc, gd, "routine")
    except Exception as exc:  # noqa: BLE001
        print(f"\n== {app}: PARSE FAILED {type(exc).__name__}: {str(exc)[:200]}", flush=True); problems.append(f"{app}: parse failed"); continue
    slate_rows = [r for r in rows if (et_date(r[13]) or r[0]) == SLATE]
    mk = Counter(r[5] for r in slate_rows)
    base = lambda k: k.replace("_alternate", "").replace("_promo", "")  # noqa: E731
    unmapped = Counter({k: n for k, n in mk.items() if base(k) not in mk2prop})
    players = {r[6] for r in slate_rows}
    unres = sorted(p for p in players if conn.execute("SELECT nba_ref.norm_name(%s)", (p,)).fetchone()[0] not in names)
    depth = defaultdict(set)
    for r in slate_rows:
        depth[(r[6], base(r[5]))].add(r[8])
    lp = [len(v) for v in depth.values()]
    priced = sum(1 for r in slate_rows if r[9] is not None or r[10] is not None)
    print(f"\n== {app}: {len(rows)} rows parsed, {len(slate_rows)} for {SLATE}; {len(players)} players; {len(mk)} market keys; "
          f"lines per player-market avg {sum(lp) / max(1, len(lp)):.2f} max {max(lp) if lp else 0}; rows with price/multiplier "
          f"{priced}/{len(slate_rows)}; P3 archived today {archived.get(app, 0)}", flush=True)
    print(f"   markets: {dict(mk.most_common(40))}", flush=True)
    if unmapped:
        print(f"   UNMAPPED (never scored): {dict(unmapped)}", flush=True)
    if unres:
        print(f"   UNRESOLVED players: {unres[:30]}", flush=True); problems.append(f"{app}: {len(unres)} unresolved players")
    if not slate_rows and app != "fliff":
        problems.append(f"{app}: 0 rows for the slate")
    meta = TMP / f"{app}_nba_current_meta.json"
    if meta.exists():
        m = json.loads(meta.read_text())
        print(f"   meta: { {k: m.get(k) for k in ('ok', 'fetched_at', 'legs', 'events', 'players', 'alt markets', 'errors') if k in m} }", flush=True)
print("\nSWEEP PROBLEMS: " + ("; ".join(problems) if problems else "none"), flush=True)
