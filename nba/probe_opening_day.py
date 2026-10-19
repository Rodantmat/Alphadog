#!/usr/bin/env python3
"""
OPENING-DAY SOURCE PROBE (2026-10-19, owner: "probe everything ... be sure that the probes are reaching what needs to reach").
READ-ONLY against the system: nothing is written to the database or the repo. Every external source the first real slate
(2026-10-20) depends on is touched the way the pipelines touch it, from a GitHub runner, and the answer is printed with
host / status / counts only - never a credential.

  1. proxy            exit IPs + stats.nba.com through the proxy (P1/P2A/P2B path)
  2. schedule         stats.nba.com scoreboard for the slate via the proxy -> game count, tips
  3. injury report    every snapshot the CDN holds for the day before the slate (the P2B 09:00 ET cutoff reads it) -> parsed rows
  4. referee crews    official.nba.com get-game-officials for the slate (P2B polls it from ~6 AM PT)
  5. PrizePicks       partner-api projections, league 7, via the proxy (the P3 board) -> rows, players, game dates
  6. ParlayAPI        /v1/sports/basketball_nba/props limit 25 (the live market term; 502 on 10-18) -> status, credits, dates
  7. Odds API         /v4/sports with both keys -> status + credits remaining (game lines, morning + window)
  8. database         the slate predicate, rosters, name map, rung keys, last baseline / final_hp, strategy states, unit
Env: DATABASE_URL, PROXY_URL (resolved by the workflow), PROBE_SLATE (default 2026-10-20)
"""
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, "nba")
PT = ZoneInfo("America/Los_Angeles"); ET = ZoneInfo("America/New_York")
SLATE = date.fromisoformat(os.environ.get("PROBE_SLATE") or "2026-10-20")
PROXY = (os.environ.get("PROXY_URL") or "").strip()
PROXIES = {"https": PROXY, "http": PROXY} if PROXY else None
RESULTS = {}


def section(name):
    print(f"\n=== {name}", flush=True)


def mask(s):
    s = str(s)
    return s.replace(PROXY, "<PROXY_URL>") if PROXY else s


def get(url, headers=None, proxies=None, timeout=30, impersonate="chrome124"):
    from curl_cffi import requests
    t0 = time.time()
    r = requests.get(url, headers=headers or {}, proxies=proxies, timeout=timeout, impersonate=impersonate)
    return r, time.time() - t0


def db():
    import psycopg
    return psycopg.connect(os.environ["DATABASE_URL"])


# ---------------------------------------------------------------- 1. proxy
def probe_proxy():
    section("1. PROXY (DataImpulse residential, credential store)")
    if not PROXY:
        print("  no PROXY_URL resolved - the pipelines would fall back to the secret"); RESULTS["proxy"] = "NO URL"; return
    print(f"  proxy host: {PROXY.split('@')[-1]}")
    ok = 0
    for i in range(2):
        try:
            r, dt = get("https://ipinfo.io/json", proxies=PROXIES, timeout=20)
            j = r.json(); print(f"  exit {i+1}: {j.get('ip')} {j.get('country')} {j.get('region')} ({dt:.1f}s)"); ok += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  exit {i+1}: ERROR {mask(exc)[:120]}")
    RESULTS["proxy"] = f"{ok}/2 exits"


NBA_HEADERS = {"Host": "stats.nba.com", "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9",
               "Referer": "https://stats.nba.com/", "x-nba-stats-origin": "stats", "x-nba-stats-token": "true",
               "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}


# ---------------------------------------------------------------- 2. schedule
def probe_schedule():
    section(f"2. STATS.NBA.COM scoreboard for {SLATE} (via proxy, as the pipelines)")
    url = f"https://stats.nba.com/stats/scoreboardv3?GameDate={SLATE:%Y-%m-%d}&LeagueID=00"
    for label, px in (("proxy", PROXIES), ("direct", None)):
        try:
            r, dt = get(url, NBA_HEADERS, px, timeout=30)
            print(f"  {label:<7} HTTP {r.status_code} {len(r.content):>8} bytes {dt:5.1f}s")
            if r.status_code == 200:
                games = r.json().get("scoreboard", {}).get("games", [])
                for g in games:
                    print(f"    {g.get('gameId')} {g.get('awayTeam',{}).get('teamTricode')} @ {g.get('homeTeam',{}).get('teamTricode')} "
                          f"{g.get('gameStatusText')} {g.get('gameTimeUTC')}")
                RESULTS["schedule"] = f"{len(games)} games ({label})"
                return
        except Exception as exc:  # noqa: BLE001
            print(f"  {label:<7} ERROR {mask(exc)[:120]}")
    RESULTS["schedule"] = "UNREACHABLE"


# ---------------------------------------------------------------- 3. injury report
def probe_injury():
    day = SLATE - timedelta(days=1)
    section(f"3. INJURY REPORT snapshots for {day} (the day-before filing P2B reads at the 09:00 ET cutoff)")
    try:
        import scrape_nba_injury_report as inj
        from curl_cffi import requests
        found_any = []
        for label, sess in (("direct", requests.Session()), ("proxy", requests.Session(proxies=PROXIES) if PROXIES else None)):
            if sess is None:
                continue
            t0 = time.time()
            try:
                snaps = inj.scan_day(sess, day)
            except Exception as exc:  # noqa: BLE001
                print(f"  {label}: scan ERROR {mask(exc)[:140]}"); continue
            print(f"  {label}: {len(snaps)} distinct snapshot(s) in {time.time()-t0:.0f}s")
            for ts, url, content in snaps:
                txt = inj.extract_text(content); ts2 = inj.header_ts(txt) or ts
                rows = inj.parse_report(txt, ts2)
                teams = {r.get("team") for r in rows}; dates = {r.get("game_date") for r in rows}
                status = {}
                for r in rows:
                    status[r.get("status")] = status.get(r.get("status"), 0) + 1
                print(f"    {url.rsplit('/',1)[-1]}  header {ts2}  rows {len(rows)}  teams {len(teams)}  game_dates {sorted(str(d) for d in dates)}  {status}")
                found_any.append((ts2, len(rows)))
            if snaps:
                break
        if not found_any:
            now_et = datetime.now(ET)
            print(f"  NO snapshot yet for {day} (now {now_et:%H:%M} ET; the league files the day-before report at 5 PM local) -> re-run after 17:30 ET")
            RESULTS["injury"] = "NOT YET PUBLISHED"
        else:
            RESULTS["injury"] = f"{len(found_any)} snapshot(s), latest {found_any[-1][0]} rows {found_any[-1][1]}"
    except Exception as exc:  # noqa: BLE001
        print(f"  ERROR {mask(exc)[:200]}"); RESULTS["injury"] = "ERROR"


# ---------------------------------------------------------------- 4. referees
def probe_referees():
    section(f"4. REFEREE CREWS official.nba.com for {SLATE} (P2B polls from ~6 AM PT; posted the morning of the game)")
    try:
        import scrape_referee_assignments as ref
        src, doc = ref.fetch_assignments(SLATE, PROXIES)
        rows = ref.parse(doc) if doc else []
        print(f"  source {src} -> {len(rows)} official assignments")
        for m, s, n, num, gid, code in rows[:12]:
            print(f"    {m} slot {s}: {n} (#{num}) game {gid}")
        if not rows:
            print("  none yet - expected until game-day morning; the API answered" if src else "  API UNREACHABLE")
        RESULTS["referees"] = f"{len(rows)} assignments" if rows else ("api ok, not posted yet" if src else "UNREACHABLE")
    except Exception as exc:  # noqa: BLE001
        print(f"  ERROR {mask(exc)[:200]}"); RESULTS["referees"] = "ERROR"


# ---------------------------------------------------------------- 5. PrizePicks
def probe_prizepicks():
    section("5. PRIZEPICKS partner-api projections league 7 (the P3 board path, via proxy)")
    url = "https://partner-api.prizepicks.com/projections?league_id=7&per_page=1000&single_stat=true"
    hdr = {"Accept": "application/json", "Accept-Language": "en-US,en;q=0.9", "Origin": "https://app.prizepicks.com", "Referer": "https://app.prizepicks.com/"}
    for label, px in (("proxy", PROXIES), ("direct", None)):
        try:
            r, dt = get(url, hdr, px, timeout=45)
            print(f"  {label:<7} HTTP {r.status_code} {len(r.content):>9} bytes {dt:5.1f}s")
            if r.status_code == 200:
                j = r.json(); data = j.get("data", []); inc = j.get("included", [])
                players = {x["id"] for x in inc if x.get("type") == "new_player"}
                by_date, by_stat, odds_types = {}, {}, {}
                for p in data:
                    a = p.get("attributes", {})
                    d = (a.get("start_time") or "")[:10]; by_date[d] = by_date.get(d, 0) + 1
                    by_stat[a.get("stat_type")] = by_stat.get(a.get("stat_type"), 0) + 1
                    odds_types[a.get("odds_type")] = odds_types.get(a.get("odds_type"), 0) + 1
                print(f"    projections {len(data)}, players {len(players)}, pages {j.get('meta',{}).get('total_pages') or j.get('links',{}).get('last','?')}")
                print(f"    by start date (UTC): {dict(sorted(by_date.items()))}")
                print(f"    odds types: {odds_types}")
                print(f"    stat types ({len(by_stat)}): {dict(sorted(by_stat.items(), key=lambda x: -x[1])[:14])}")
                RESULTS["prizepicks"] = f"{len(data)} projections / {len(players)} players ({label})"
                return
            else:
                print(f"    body: {r.text[:160]!r}")
        except Exception as exc:  # noqa: BLE001
            print(f"  {label:<7} ERROR {mask(exc)[:120]}")
    RESULTS["prizepicks"] = "UNREACHABLE"


# ---------------------------------------------------------------- 6. ParlayAPI
def probe_parlay():
    section("6. PARLAYAPI live props (the market term; http 502 for 4 attempts on 10-18 20:22Z)")
    try:
        with db() as c:
            cfg = c.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='market_feed'").fetchone()
            cfg = cfg[0] if isinstance(cfg[0], dict) else json.loads(cfg[0])
            key = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key=%s", (cfg.get("key_name", "parlay_api_key"),)).fetchone()[0].strip()
            alt = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='parlay_api_key_alt'").fetchone()
            alt = alt[0].strip() if alt else None
        print(f"  key row in use: {cfg.get('key_name')}; refresh_final_hp={cfg.get('refresh_final_hp')}; enabled={cfg.get('enabled')}")
        from curl_cffi import requests
        for label, k in (("primary", key), ("alt", alt)):
            if not k:
                continue
            for attempt in range(1, 4):
                try:
                    t0 = time.time()
                    r = requests.get("https://parlay-api.com/v1/sports/basketball_nba/props?limit=25&offset=0",
                                     headers={"X-API-Key": k, "accept": "application/json", "User-Agent": "alphadog"}, timeout=60)
                    rem = r.headers.get("x-requests-remaining"); more = r.headers.get("x-result-has-more")
                    print(f"  {label} attempt {attempt}: HTTP {r.status_code} {len(r.content)} bytes {time.time()-t0:4.1f}s credits_remaining={rem} has_more={more}")
                    if r.status_code == 200:
                        doc = r.json(); items = doc if isinstance(doc, list) else (doc.get("data") or doc.get("props") or [])
                        books, dates = {}, {}
                        for it in items:
                            books[str(it.get("bookmaker")).lower()] = books.get(str(it.get("bookmaker")).lower(), 0) + 1
                            dates[str(it.get("commence_time") or it.get("game_date"))[:10]] = dates.get(str(it.get("commence_time") or it.get("game_date"))[:10], 0) + 1
                        print(f"    items {len(items)}; books {books}; dates {dates}")
                        RESULTS[f"parlayapi_{label}"] = f"HTTP 200, credits {rem}"
                        break
                    print(f"    body: {r.text[:200]!r}")
                    RESULTS[f"parlayapi_{label}"] = f"HTTP {r.status_code}"
                    if r.status_code < 500:
                        break
                    time.sleep(20)
                except Exception as exc:  # noqa: BLE001
                    print(f"  {label} attempt {attempt}: ERROR {mask(exc)[:140]}"); RESULTS[f"parlayapi_{label}"] = "ERROR"; time.sleep(10)
        # the last captures recorded by P3
        with db() as c:
            for row in c.execute("""SELECT capture_date, label, http_status, n_items, n_written, credits_remaining, captured_at
                                     FROM nba_market.parlay_props_captures ORDER BY captured_at DESC LIMIT 6""").fetchall():
                print(f"    capture {row[0]} {row[1]}: http {row[2]} items {row[3]} written {row[4]} credits {row[5]} at {row[6]:%m-%d %H:%MZ}")
    except Exception as exc:  # noqa: BLE001
        print(f"  ERROR {mask(exc)[:200]}"); RESULTS["parlayapi"] = "ERROR"


# ---------------------------------------------------------------- 7. Odds API
def probe_odds_api():
    section("7. ODDS API (game lines: morning line in P2B, window spread in P3) - credits on both keys")
    try:
        import requests as rq
        with db() as c:
            keys = dict(c.execute("SELECT credential_key, credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key IN ('odds_api_key','odds_api_key_nba')").fetchall())
        for name in ("odds_api_key_nba", "odds_api_key"):
            k = (keys.get(name) or "").strip()
            if not k:
                print(f"  {name}: no row"); continue
            try:
                r = rq.get("https://api.the-odds-api.com/v4/sports", params={"apiKey": k}, timeout=30)
                n = len(r.json()) if r.status_code == 200 else None
                print(f"  {name}: HTTP {r.status_code}; requests remaining {r.headers.get('x-requests-remaining')} used {r.headers.get('x-requests-used')}; sports listed {n}")
                RESULTS[name] = f"HTTP {r.status_code}, remaining {r.headers.get('x-requests-remaining')}"
            except Exception as exc:  # noqa: BLE001
                print(f"  {name}: ERROR {str(exc)[:120]}"); RESULTS[name] = "ERROR"
        with db() as c:
            for row in c.execute("""SELECT game_date, snapshot_label, count(*), count(DISTINCT bookmaker), max(fetched_at)
                                     FROM nba_market.game_lines_snapshots WHERE game_date >= %s - 1 GROUP BY 1,2 ORDER BY 1,2""", (SLATE,)).fetchall():
                print(f"    game_lines_snapshots {row[0]} {row[1]}: {row[2]} rows, {row[3]} books, last {row[4]}")
    except Exception as exc:  # noqa: BLE001
        print(f"  ERROR {str(exc)[:200]}"); RESULTS["odds_api"] = "ERROR"


# ---------------------------------------------------------------- 8. database
def probe_db():
    section("8. DATABASE - what the slate run will read")
    q = [
        ("slate predicate (regular_season_games)", "SELECT count(*), min(game_datetime_utc), max(game_datetime_utc) FROM nba_calendar.regular_season_games WHERE game_date=%s", (SLATE,)),
        ("slate_games", "SELECT count(*) FROM nba_calendar.slate_games WHERE game_date=%s", (SLATE,)),
        ("rosters nba_ref.players (active, last sync)", "SELECT count(*), max(updated_at) FROM nba_ref.players", ()),
        ("player_name_map", "SELECT count(*), max(updated_at) FROM nba_ref.player_name_map", ()),
        ("board_snapshots for the slate by app", "SELECT bookmaker, count(*), count(DISTINCT player), max(fetched_at) FROM nba_market.board_snapshots WHERE game_date=%s GROUP BY 1 ORDER BY 1", (SLATE,)),
        ("board_rung_keys for the slate", "SELECT count(*) FROM nba_market.board_rung_keys WHERE game_date=%s", (SLATE,)),
        ("injury snapshots (max)", "SELECT max(snapshot_ts), count(DISTINCT snapshot_ts) FILTER (WHERE game_date=%s) FROM nba_daily.injury_report_snapshots", (SLATE,)),
        ("referee_assignments for the slate", "SELECT count(*) FROM nba_ref.referee_assignments WHERE game_date=%s", (SLATE,)),
        ("baseline_ladder_runs (last)", "SELECT max(asof) FROM nba_score.baseline_ladder_runs", ()),
        ("final_hp (last date)", "SELECT max(game_date) FROM nba_score.final_hp", ()),
        ("board_scored (last date)", "SELECT max(game_date) FROM nba_score.board_scored", ()),
        ("live_slips", "SELECT count(*) FROM nba_score.live_slips", ()),
        ("strategy states", "SELECT strategy, state, live_cap FROM nba_score.live_strategy_state ORDER BY 1", ()),
        ("scheduler", "SELECT enabled, last_tick FROM nba_control.scheduler_switch", ()),
        ("scheduler_plan (latest)", "SELECT run_key::date, first_tip, p2a, p2b, p3, p3_deadline FROM nba_control.scheduler_plan ORDER BY run_key DESC LIMIT 2", ()),
        ("pipeline_runs (last 6)", "SELECT pipeline, run_key::date, status, left(coalesce(note,''),80) FROM nba_control.pipeline_runs ORDER BY claimed_at DESC LIMIT 6", ()),
        ("active stats season file rule", "SELECT config_key, left(config_json::text, 160) FROM nba_config.classification_config WHERE config_key IN ('stake_unit','live_backtest_suffix') ORDER BY 1", ()),
    ]
    try:
        with db() as c:
            for label, sql, params in q:
                try:
                    rows = c.execute(sql, params).fetchall()
                    print(f"  {label}:")
                    for r in rows[:16]:
                        print(f"    {r}")
                except Exception as exc:  # noqa: BLE001
                    c.rollback(); print(f"  {label}: ERROR {str(exc)[:120]}")
    except Exception as exc:  # noqa: BLE001
        print(f"  DB ERROR {str(exc)[:200]}")


def main():
    print(f"OPENING-DAY PROBE  slate {SLATE}  now {datetime.now(PT):%Y-%m-%d %H:%M} PT / {datetime.now(ET):%H:%M} ET")
    for fn in (probe_proxy, probe_schedule, probe_injury, probe_referees, probe_prizepicks, probe_parlay, probe_odds_api, probe_db):
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            print(f"  [{fn.__name__}] UNCAUGHT {mask(exc)[:200]}")
    section("SUMMARY")
    for k, v in RESULTS.items():
        print(f"  {k:<22} {v}")


if __name__ == "__main__":
    main()
