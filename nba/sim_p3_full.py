#!/usr/bin/env python3
"""FULL GAME-DAY SIMULATION (owner 2026-10-19 20:30 PT: "run, score a full slate, a real simulation and understand timeline if it fits the
deadlines we have. No more guessing").

WHAT IT DOES. Runs the REAL P2B model build and the REAL P3 chain, step by step, in the order the workflows run them, against production
data for a slate whose game day has not come, and times every step. Nothing it writes survives:

  * every script that writes to Postgres runs IN-PROCESS over ONE shared connection / ONE transaction (psycopg.connect is replaced by a
    proxy). commit() becomes "release + re-open a savepoint", rollback() becomes "roll back to the savepoint" - so each script sees exactly
    the commit/rollback semantics it was written for, and later scripts see the earlier scripts' output (final_hp -> scorer -> picks ...).
    At the end the whole transaction is ROLLED BACK and a fresh connection verifies production holds nothing for the slate.
  * scrapers and the ladder builders never touch the DB (checked: no psycopg import, no writes) and run as the real subprocesses.
  * statements that would take an ACCESS EXCLUSIVE lock on a production table for the life of the transaction (ALTER TABLE, CREATE INDEX,
    TRUNCATE) or a cross-session advisory lock are not sent (the tables already exist in production); TRUNCATE becomes a row DELETE.
    Production readers (UI, scheduler) are therefore never blocked by the simulation.
  * not simulated (no way to do it without side effects): the Betr Chrome harvest (measured separately by dispatching the real workflow
    under label 'probe'), the git commits, the slip-quote dispatch (one HTTP POST). Reported as such.

KNOWN SIMULATION DIFFERENCES (stated, not hidden): column DEFAULT now() resolves to the transaction start, not to each script's own start
(explicit now() in statements is rewritten to clock_timestamp()); the ladder builders read production state as it is tonight (no 10-20
rosters/injury rows from this transaction); the runner is a GitHub-hosted runner exactly like the real workflows.

Env: DATABASE_URL, SIM_DATE, PROXY_URL (optional, from the credential store), SIM_SETUP_S (pip-install seconds measured by the workflow).
"""
import contextlib
import json
import os
import re
import runpy
import subprocess
import sys
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg
import yaml

ROOT = Path(__file__).resolve().parent.parent
NBA = ROOT / "nba"
PT = ZoneInfo("America/Los_Angeles")
D = os.environ["SIM_DATE"]
URL = os.environ["DATABASE_URL"]
os.chdir(ROOT)
sys.path.insert(0, str(NBA))
REAL_CONNECT = psycopg.connect


# ----------------------------------------------------------------------------- the shared-transaction proxy
class Shared:
    lock = threading.RLock()
    real = None
    n_exec = 0


def _rewrite(sql):
    """Never send what would lock a production table for the life of the transaction; keep time semantics honest."""
    if not isinstance(sql, str):
        return sql
    s = sql
    s = re.sub(r"pg_advisory_xact_lock\(hashtext\('[^']*'\)\)", "1", s)
    s = re.sub(r"\bnow\(\)", "clock_timestamp()", s, flags=re.I)
    if re.search(r"\b(ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|TRUNCATE)\b", s, re.I):
        parts = s.split(";")
        keep = []
        for p in parts:
            q = re.sub(r"--[^\n]*", "", p).strip()
            if not q:
                continue
            if re.match(r"ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(nba_|public\.)", q, re.I):
                continue
            if re.match(r"CREATE\s+(UNIQUE\s+)?INDEX\b.*\bON\s+(nba_|public\.)", q, re.I | re.S):
                continue
            m = re.match(r"TRUNCATE\s+(TABLE\s+)?(nba_[\w.]+)", q, re.I)
            if m:
                keep.append(f"DELETE FROM {m.group(2)}")
                continue
            keep.append(p)
        s = ";".join(keep).strip() or "SELECT 1"
    return s


class ProxyCursor:
    def __init__(self, conn, inner):
        self._c, self._i = conn, inner

    def _run(self, fn, *a, **k):
        with Shared.lock:
            Shared.n_exec += 1
            if self._c.autocommit:
                Shared.real.execute("SAVEPOINT ac")
                try:
                    r = fn(*a, **k)
                except BaseException:
                    Shared.real.execute("ROLLBACK TO SAVEPOINT ac")
                    Shared.real.execute("RELEASE SAVEPOINT ac")
                    raise
                Shared.real.execute("RELEASE SAVEPOINT ac")
                return r
            return fn(*a, **k)

    def execute(self, q, params=None, **k):
        self._run(self._i.execute, _rewrite(q), params, **k)
        return self

    def executemany(self, q, seq, **k):
        self._run(self._i.executemany, _rewrite(q), seq, **k)
        return self

    def copy(self, q, *a, **k):
        return self._i.copy(_rewrite(q), *a, **k)

    def __enter__(self):
        return self

    def __exit__(self, *e):
        self._i.close()
        return False

    def __iter__(self):
        return iter(self._i)

    def __getattr__(self, n):
        return getattr(self._i, n)


class ProxyConn:
    def __init__(self, url=None, autocommit=False, row_factory=None, **kw):
        self.autocommit, self.rf = bool(autocommit), row_factory
        self.closed = False

    def _cur(self, **k):
        rf = k.pop("row_factory", None) or self.rf
        kk = dict(k)
        if rf:
            kk["row_factory"] = rf
        return ProxyCursor(self, Shared.real.cursor(**kk))

    def cursor(self, *a, **k):
        return ProxyCursor(self, Shared.real.cursor(*a, **({"row_factory": self.rf} if self.rf and "row_factory" not in k else {}), **k))

    def execute(self, q, params=None, **k):
        return self._cur().execute(q, params, **k)

    def commit(self):
        with Shared.lock:
            if Shared.real.info.transaction_status == psycopg.pq.TransactionStatus.INERROR:
                Shared.real.execute("ROLLBACK TO SAVEPOINT cp")
            else:
                Shared.real.execute("RELEASE SAVEPOINT cp")
                Shared.real.execute("SAVEPOINT cp")

    def rollback(self):
        with Shared.lock:
            Shared.real.execute("ROLLBACK TO SAVEPOINT cp")

    def close(self):
        self.closed = True

    def transaction(self, *a, **k):
        return Shared.real.transaction(*a, **k)

    def set_autocommit(self, v):
        self.autocommit = bool(v)

    def __enter__(self):
        return self

    def __exit__(self, et, ev, tb):
        if et is None:
            self.commit()
        else:
            self.rollback()
        return False

    def __getattr__(self, n):
        return getattr(Shared.real, n)


def proxy_connect(url=None, *a, **k):
    return ProxyConn(url, autocommit=k.get("autocommit", False), row_factory=k.get("row_factory"))


# ----------------------------------------------------------------------------- step machinery
RESULTS = []
ENVSAVE = {}


def _env(env):
    for k, v in (env or {}).items():
        ENVSAVE.setdefault(k, os.environ.get(k))
        os.environ[k] = str(v)


def _unenv():
    for k, v in ENVSAVE.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    ENVSAVE.clear()


def record(phase, name, t0, status, note=""):
    dt = time.time() - t0
    RESULTS.append({"phase": phase, "name": name, "s": round(dt, 1), "status": status, "note": note})
    print(f"SIMT|{phase}|{name}|{dt:.1f}s|{status}|{note}", flush=True)


def inproc(phase, name, script=None, code=None, env=None, argv=None):
    """Run a repo script (or an extracted heredoc) in-process over the shared transaction."""
    t0 = time.time()
    _env(env)
    status, note = "ok", ""
    old_argv = sys.argv
    sys.argv = [script or name] + list(argv or [])
    print(f"\n=== [{phase}] {name}", flush=True)
    try:
        with Shared.lock:
            Shared.real.execute("RESET statement_timeout")
        if script:
            runpy.run_path(str(ROOT / script), run_name="__main__")
        else:
            exec(compile(code, name, "exec"), {"__name__": "__main__"})
    except SystemExit as e:
        if e.code not in (None, 0):
            status, note = "FAIL", f"exit {e.code}"
    except BaseException as e:  # noqa: BLE001
        status, note = "FAIL", f"{type(e).__name__}: {str(e)[:120]}"
        traceback.print_exc()
    finally:
        sys.argv = old_argv
        _unenv()
        with Shared.lock:
            if Shared.real.info.transaction_status == psycopg.pq.TransactionStatus.INERROR:
                Shared.real.execute("ROLLBACK TO SAVEPOINT cp")
                note = (note + " (txn aborted -> rolled back to last commit point)").strip()
    record(phase, name, t0, status, note)
    return status == "ok"


def sub(phase, name, cmd, env=None, timeout=None):
    t0 = time.time()
    e = dict(os.environ)
    e.update({k: str(v) for k, v in (env or {}).items()})
    print(f"\n=== [{phase}] {name} (subprocess)", flush=True)
    try:
        r = subprocess.run(cmd, env=e, cwd=str(ROOT), capture_output=True, text=True, timeout=timeout)
        tail = (r.stdout or "").strip().splitlines()[-6:] + (r.stderr or "").strip().splitlines()[-3:]
        print("\n".join(tail)[:1500], flush=True)
        record(phase, name, t0, "ok" if r.returncode == 0 else "FAIL", "" if r.returncode == 0 else f"exit {r.returncode}")
        return r.returncode == 0
    except subprocess.TimeoutExpired:
        record(phase, name, t0, "FAIL", f"timeout {timeout}s")
        return False


def sub_parallel(phase, name, jobs, timeout=300):
    """jobs: [(label, cmd, env)] run concurrently like the workflow's '&' + wait; step time = the slowest."""
    t0 = time.time()
    print(f"\n=== [{phase}] {name} (parallel subprocesses)", flush=True)
    procs = []
    for label, cmd, env in jobs:
        e = dict(os.environ)
        e.update({k: str(v) for k, v in (env or {}).items()})
        procs.append((label, time.time(), subprocess.Popen(cmd, env=e, cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)))
    ok, per = [], {}
    for label, ts, p in procs:
        try:
            out, _ = p.communicate(timeout=max(1, timeout - (time.time() - t0)))
            good = p.returncode == 0
        except subprocess.TimeoutExpired:
            p.kill()
            out, good = "", False
        per[label] = round(time.time() - ts, 1)
        print(f"--- {label}: {'ok' if good else 'FAILED'} in {per[label]}s\n" + "\n".join((out or "").strip().splitlines()[-4:]), flush=True)
        if good:
            ok.append(label)
    record(phase, name, t0, "ok" if len(ok) == len(jobs) else "PARTIAL", f"ok={','.join(ok)}; per-scraper s={per}")
    return ok


def yaml_step(wf, job, prefix):
    y = yaml.safe_load((ROOT / ".github/workflows" / wf).read_text())
    for s in y["jobs"][job]["steps"]:
        if str(s.get("name") or "").startswith(prefix):
            return s["run"]
    raise KeyError(f"{wf}:{job}:{prefix}")


def yaml_env(wf, job, prefix, key):
    y = yaml.safe_load((ROOT / ".github/workflows" / wf).read_text())
    for s in y["jobs"][job]["steps"]:
        if str(s.get("name") or "").startswith(prefix):
            return str(s["env"][key])
    raise KeyError(f"{wf}:{job}:{prefix}:{key}")


def heredoc(run):
    m = re.search(r"<<'EOF'\n(.*?)\n\s*EOF\s*$", run, re.S | re.M)
    if not m:
        m = re.search(r"<<'EOF'\n(.*?)\nEOF", run, re.S)
    return m.group(1)


def scalar(sql, params=()):
    with Shared.lock:
        return Shared.real.execute(sql, params).fetchone()[0]


def cfg_flag(key, field):
    with Shared.lock:
        r = Shared.real.execute("SELECT coalesce((config_json->>%s)::boolean,false) FROM nba_config.classification_config WHERE config_key=%s", (field, key)).fetchone()
    return bool(r and r[0])


# ----------------------------------------------------------------------------- the simulation
def main():
    T_ALL = time.time()
    # ---- guard: production must hold nothing for the slate
    with REAL_CONNECT(URL, autocommit=True) as g:
        chk = {}
        for t in ("nba_score.baseline_history", "nba_score.final_hp", "nba_score.final_hp_derived", "nba_score.board_scored", "nba_score.live_slips",
                  "nba_score.ud_live_slips", "nba_score.paper_picks", "nba_score.board_true_hp"):
            chk[t] = g.execute(f"SELECT count(*) FROM {t} WHERE game_date=%s", (D,)).fetchone()[0]
        chk["board_snapshots[window]"] = g.execute("SELECT count(*) FROM nba_market.board_snapshots WHERE game_date=%s AND snapshot_label='window'", (D,)).fetchone()[0]
        chk["pipeline_runs"] = g.execute("SELECT count(*) FROM nba_control.pipeline_runs WHERE run_key=%s AND pipeline IN ('P2B','P3')", (D,)).fetchone()[0]
        replay = g.execute("SELECT count(*) FROM pg_stat_activity WHERE query ILIKE '%audit_season_replay%' AND pid<>pg_backend_pid() AND state='active'").fetchone()[0]
        n_games, first_tip = g.execute("SELECT count(*), min(game_datetime_utc) FROM nba_calendar.slate_games WHERE game_date=%s", (D,)).fetchone()
    print("GUARD", json.dumps(chk), "replay_active", replay, "games", n_games, "first_tip_utc", first_tip, flush=True)
    if any(chk.values()) or replay:
        raise SystemExit("ABORT: production already holds this slate (or a replay is active) - this must be a slate that has not run")
    if not n_games:
        raise SystemExit("ABORT: no games on the sim date")
    tip_pt = first_tip.astimezone(PT)
    d0 = datetime.fromisoformat(D).date()
    p3_pt = min(datetime(d0.year, d0.month, d0.day, 13, 15, tzinfo=PT), tip_pt - timedelta(minutes=30)) + timedelta(minutes=1)
    p2b_pt = min(datetime(d0.year, d0.month, d0.day, 8, 5, tzinfo=PT), p3_pt - timedelta(minutes=110))

    # ---- the shared transaction
    Shared.real = REAL_CONNECT(URL, autocommit=False)
    Shared.real.execute("SAVEPOINT cp")
    psycopg.connect = proxy_connect
    proxy_url = ""
    try:
        proxy_url = Shared.real.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='proxy_url'").fetchone()[0] or ""
    except Exception:  # noqa: BLE001
        Shared.real.execute("ROLLBACK TO SAVEPOINT cp")
    if proxy_url:
        os.environ["PROXY_URL"] = proxy_url          # never printed
    os.environ["DATABASE_URL"] = URL
    BT = {"BT_ASOF": D, "BT_CUTOFF": "baseline", "BT_REPLAY": "0"}
    PY = sys.executable

    try:
        # ============================== P2B (model build for the slate)
        P = "P2B"
        sub(P, "rosters scrape", [PY, "nba/scrape_nba_stats_players.py"], timeout=600)
        inproc(P, "sync rosters", "nba/sync_current_rosters.py")
        inproc(P, "player name map", "nba/refresh_player_name_map.py")
        sub(P, "injury report scrape", [PY, "nba/scrape_nba_injury_report.py"], env={"INJURY_MODE": "daily", "INJURY_EXPECT": "1"}, timeout=600)
        inproc(P, "load injury report", "nba/load_injury_report.py", env={"INJURY_LOAD_MODE": "current"})
        inproc(P, "referee crews (one poll)", "nba/scrape_referee_assignments.py")
        inproc(P, "morning game line", "nba/capture_game_lines_morning.py", env={"GL_DATE": D})
        inproc(P, "export market spreads", "nba/export_market_spreads.py")
        sub(P, "morning PrizePicks", [PY, "nba/scrape_prizepicks_nba_board.py"], env={"PP_NBA_OUT_DIR": "boards", "PP_NBA_MIN_FUTURE_ROWS": "50"}, timeout=300)
        sub(P, "morning Underdog", [PY, "nba/scrape_underdog_board.py"], env={"UNDERDOG_SPORTS": "NBA", "UNDERDOG_OUT_DIR": "boards"}, timeout=300)
        ok = sub_parallel(P, "morning Sleeper + Fliff", [
            ("sleeper", [PY, "nba/scrape_sleeper_board.py"], {"SLEEPER_SPORTS": "nba", "SLEEPER_OUT_DIR": "boards"}),
            ("fliff", [PY, "nba/scrape_fliff_board.py"], {"FLIFF_SPORTS": "nba"})])
        inproc(P, "archive morning boards", "nba/archive_live_boards.py",
               env={"ARCHIVE_LABEL": "morning", "ARCHIVE_SPORT": "nba", "ARCHIVE_APPS": "prizepicks,underdog" + ("," + ",".join(ok) if ok else "")})
        inproc(P, "rung keys (morning)", code=heredoc(yaml_step("nba-p2b-slate.yml", "slate", "Morning DFS board snapshot")), env={"BT_ASOF": D})

        sub(P, "ensure season files", [PY, "nba/ensure_season_files.py"], env=BT, timeout=600)
        t0 = time.time()
        for pair in ["points,rebounds", "assists,threes_made", "fga,fg3a", "ftm,fta", "fgm,dreb", "steals,blocks", "turnovers,personal_fouls", "oreb"]:
            sub(P, f"ladder {pair}", [PY, "nba/baseline/build_baseline_ladder.py"], env=dict(BT, BT_PROPS=pair))
        os.makedirs("nba/backtest/reports", exist_ok=True)
        for pair in ["points,rebounds", "assists,steals", "blocks,turnovers"]:
            sub(P, f"components {pair}", [PY, "nba/baseline/build_baseline_ladder.py"], env=dict(BT, BT_INJURY="1", BT_SAVE_COMPONENTS="1", BT_PROPS=pair))
        sub(P, "combos ladder", [PY, "nba/baseline/build_combos_ladder.py"], env=dict(BT, BT_INJURY="1"))
        sub(P, "periods ladder", [PY, "nba/baseline/build_periods_ladder.py"], env=dict(BT, BT_INJURY="1"))
        record(P, "LADDER BUILD TOTAL (8 pairs + 3 components + combos + periods)", t0, "ok")
        inproc(P, "merge ladders", code=heredoc(yaml_step("nba-p2b-slate.yml", "slate", "Merge per-pair ladders")), env={"BT_ASOF": D})
        inproc(P, "load baseline", "nba/load_baseline_ladder.py", env={"LOAD_ASOF": D})
        inproc(P, "as-of calibration", "nba/build_asof_calibration.py")
        inproc(P, "blowout refit", "nba/build_blowout_model.py")
        inproc(P, "confidence refit", "nba/build_confidence_v3.py", env={"C3_SEASONS": ""})
        inproc(P, "snapshot model params", "nba/snapshot_model_params.py", env={"SNAP_DATE": D, "SNAP_TABLES": yaml_env("nba-p2b-slate.yml", "slate", "Snapshot the slate", "SNAP_TABLES")})
        inproc(P, "build final_hp", "nba/build_final_hp.py", env={"FE_DATE": D, "FE_WRITE": "1"})
        inproc(P, "whole-number hp", "nba/build_whole_number_hp.py", env={"WN_DATE": D, "WN_WRITE": "1"})
        inproc(P, "certify P2", "nba/certify_pipeline.py", env={"PIPE": "p2", "CERT_DATE": D})
        print("P2B final_hp rows:", scalar("SELECT count(*) FROM nba_score.final_hp WHERE game_date=%s", (D,)), flush=True)

        # ============================== P3 (the game-day chain)
        P = "P3"
        sub(P, "injury report", [PY, "nba/scrape_nba_injury_report.py"], env={"INJURY_MODE": "daily", "INJURY_EXPECT": "1"}, timeout=600)
        inproc(P, "load injury report", "nba/load_injury_report.py", env={"INJURY_LOAD_MODE": "current"})
        ok_pp = sub(P, "PrizePicks board", [PY, "nba/scrape_prizepicks_nba_board.py"], env={"PP_NBA_OUT_DIR": "boards", "PP_NBA_MIN_FUTURE_ROWS": "50"}, timeout=420)
        ok = sub_parallel(P, "Sleeper + Underdog + Fliff (parallel, 300s cap)", [
            ("sleeper", [PY, "nba/scrape_sleeper_board.py"], {"SLEEPER_SPORTS": "nba", "SLEEPER_OUT_DIR": "boards"}),
            ("underdog", [PY, "nba/scrape_underdog_board.py"], {"UNDERDOG_SPORTS": "NBA", "UNDERDOG_OUT_DIR": "boards"}),
            ("fliff", [PY, "nba/scrape_fliff_board.py"], {"FLIFF_SPORTS": "nba"})])
        apps = ("prizepicks," if ok_pp else "") + ",".join(ok)
        inproc(P, "archive boards (window)", "nba/archive_live_boards.py", env={"ARCHIVE_LABEL": "window", "ARCHIVE_SPORT": "nba", "ARCHIVE_APPS": apps.strip(",")})
        inproc(P, "rung keys", code=heredoc(yaml_step("nba-p3-afternoon-light.yml", "afternoon", "Refresh board rung keys")))
        inproc(P, "board tiers", "nba/build_board_tiers_v2.py", env={"BT2_APPS": "prizepicks", "BT2_DATE": D})
        inproc(P, "PP price keys", code=heredoc(yaml_step("nba-p3-afternoon-light.yml", "afternoon", "PrizePicks price keys")), env={"SLATE": D})
        inproc(P, "ParlayAPI capture (market term)", "nba/capture_parlay_props.py", env={"CP_MODE": "capture", "CP_LABEL": "window", "CP_DATE": D})
        inproc(P, "market snapshot", "nba/export_market_spreads.py")
        inproc(P, "rung market", "nba/build_rung_market.py")
        print("SIM|NOT SIMULATED: git commit of day-of data, wait-for-P2B (P2B ran inline above), Betr harvest dispatch + wait (harvest measured separately)", flush=True)
        if cfg_flag("market_feed", "refresh_final_hp"):
            inproc(P, "market refresh: build_final_hp", "nba/build_final_hp.py", env={"FE_DATE": D, "FE_WRITE": "1"})
            inproc(P, "market refresh: whole-number hp", "nba/build_whole_number_hp.py", env={"WN_DATE": D, "WN_WRITE": "1"})
        else:
            print("market refresh OFF", flush=True)
        inproc(P, "availability delta", "nba/build_availability_delta.py", env={"DELTA_ASOF": D, "DELTA_FROM": "baseline", "DELTA_TO": "phase1"})
        # The Betr harvest (separate workflow) archives with the dispatch label 'window' in production. The simulation cannot dispatch it, so the
        # real probe harvest's Betr rows are relabelled INSIDE the rolled-back transaction, then the real wait step and the real scorer run.
        with Shared.lock:
            nb = Shared.real.execute("UPDATE nba_market.board_snapshots SET snapshot_label='window' WHERE bookmaker='betr' AND snapshot_label='probe' AND game_date=%s", (D,)).rowcount
        print(f"SIM|{nb} Betr probe-harvest rows for {D} relabelled 'window' inside the transaction (stand-in for the P3-dispatched harvest)", flush=True)
        inproc(P, "Betr wait (real step, rows present)", "nba/p3_wait_betr.py", env={"P3_ASOF": D, "BETR_DISPATCHED": "success"})
        inproc(P, "SCORE THE BOARD (all apps)", "nba/score_board_legs.py", env={"BS_ASOF": D, "BS_SEASON": ""})
        per_app = {}
        with Shared.lock:
            for a, n in Shared.real.execute("SELECT app, count(*) FROM nba_score.board_scored WHERE game_date=%s GROUP BY 1 ORDER BY 1", (D,)).fetchall():
                per_app[a] = n
        print("BOARD_SCORED per app:", json.dumps(per_app), flush=True)
        inproc(P, "paper picks", code=heredoc(yaml_step("nba-p3-afternoon-light.yml", "afternoon", "Log paper-trading picks")), env={"PAPER_DATE": D})
        inproc(P, "certify P3", "nba/certify_pipeline.py", env={"PIPE": "p3", "CERT_DATE": D, "ARCHIVE_APPS": "prizepicks,underdog,sleeper,fliff"})
        inproc(P, "PRIZEPICKS SLIP PICK (live slip engine)", "nba/live_slip_engine.py", env={"LS_MODE": "pick", "LS_DATE": D})
        inproc(P, "Underdog pick (P5 + P4 shadow)", "nba/ud_live_slip_engine.py", env={"UDL_MODE": "pick", "UDL_DATE": D})
        # 2026-10-20: the P3 soft step 'Paper tracker - goblin / demon Less + standard Flex rules' (soft_paper_al)
        inproc(P, "PAPER TRACKER (goblin / demon Less + standard Flex)", "nba/paper_altless_tracker.py", env={"MODE": "pick", "PAT_DATE": D})
        inproc(P, "price-shop ledger", "nba/build_price_shop_ledger.py", env={"PSL_DATE": D})
        inproc(P, "market anchor (UI hit probability)", "nba/apply_market_anchor.py", env={"MA_DATE": D, "MA_WORKERS": "1"})
        inproc(P, "market anchor coverage", code=heredoc(yaml_step("nba-p3-afternoon-light.yml", "afternoon", "Market-anchored hit probability - coverage")), env={"SLATE": D})
        # ---- 2026-10-20 VERIFY: the alternate-Less filing and everything downstream of it, on the real board of the slate
        with Shared.lock:
            r = Shared.real
            v = {}
            v["pp_window_less_alt_rows"] = r.execute("""SELECT count(*) FROM nba_market.board_snapshots WHERE game_date = %s AND bookmaker = 'prizepicks'
                                                        AND snapshot_label = 'window' AND side = 'Under' AND market_key LIKE '%%\\_alternate'""", (D,)).fetchone()[0]
            v["tiers_by_side_kind"] = {f"{a}/{b}": n for a, b, n in r.execute("""SELECT side, kind, count(*) FROM nba_market.board_tiers_v2
                                         WHERE game_date = %s AND bookmaker = 'prizepicks' AND snapshot_label = 'window' GROUP BY 1, 2 ORDER BY 1, 2""", (D,)).fetchall()}
            v["less_alt_fourway_violations"] = r.execute("""SELECT count(*) FROM nba_market.board_tiers_v2 t JOIN nba_market.board_snapshots s
                                         ON s.game_date = t.game_date AND s.snapshot_label = t.snapshot_label AND s.bookmaker = t.bookmaker AND s.player = t.player
                                        AND s.side = t.side AND s.line = t.line AND s.market_key = t.base_market || '_alternate'
                                         WHERE t.game_date = %s AND t.bookmaker = 'prizepicks' AND t.snapshot_label = 'window' AND t.side = 'Under'
                                           AND t.anchor_line IS NOT NULL AND t.kind <> CASE WHEN t.line < t.anchor_line THEN 'demon' ELSE 'goblin' END""", (D,)).fetchone()[0]
            v["more_alt_kind_vs_position_mismatch"] = r.execute("""SELECT count(*) FROM nba_market.board_tiers_v2 WHERE game_date = %s AND bookmaker = 'prizepicks'
                                         AND snapshot_label = 'window' AND side = 'Over' AND kind IN ('goblin', 'demon') AND anchor_line IS NOT NULL
                                         AND kind <> CASE WHEN line < anchor_line THEN 'goblin' ELSE 'demon' END""", (D,)).fetchone()[0]
            v["pp_leg_price_window"] = {f"{a}/{b}": [n, p_] for a, b, n, p_ in r.execute("""SELECT side, kind, count(*), count(factor) FROM nba_market.pp_leg_price
                                         WHERE game_date = %s AND snapshot_label = 'window' GROUP BY 1, 2 ORDER BY 1, 2""", (D,)).fetchall()}
            v["pp_no_price_key_yet"] = r.execute("""SELECT count(*) FROM nba_market.pp_leg_price WHERE game_date = %s AND snapshot_label = 'window'
                                                    AND price_reason = 'no_price_key_yet'""", (D,)).fetchone()[0]
            v["live_slip_legs_alt_less"] = r.execute("""SELECT count(*) FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) l
                                         WHERE s.game_date = %s AND lower(l->>'side') LIKE 'u%%' AND coalesce(l->>'tier', 'R') <> 'R'""", (D,)).fetchone()[0]
            v["live_slips_total_legs"] = r.execute("SELECT count(*) FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) l WHERE s.game_date = %s", (D,)).fetchone()[0]
            v["paper_tracker_rows"] = {rule_: n for rule_, n in r.execute("""SELECT left(rule, 2), count(*) FROM nba_score.paper_altless_slips
                                         WHERE game_date = %s GROUP BY 1""", (D,)).fetchall()}
        print("SIM_VERIFY_ALT_LESS", json.dumps(v, default=str), flush=True)
        problems = []
        if v["pp_window_less_alt_rows"] == 0:
            problems.append("no alternate Less rows on the window archive")
        if v["less_alt_fourway_violations"]:
            problems.append("Less rows violate the four-way rule")
        if v["live_slip_legs_alt_less"]:
            problems.append("an alternate Less leg reached the certified live pick")
        if "AL" not in v["paper_tracker_rows"] or "SR" not in v["paper_tracker_rows"]:
            problems.append("the paper tracker did not record both rule families")
        print("SIM_VERIFY_ALT_LESS_RESULT", "PASS" if not problems else "FAIL " + "; ".join(problems), flush=True)

        picks = {}
        with Shared.lock:
            for t, q in (("live_slips", "SELECT count(*) FROM nba_score.live_slips WHERE game_date=%s"),
                         ("ud_live_slips", "SELECT count(*) FROM nba_score.ud_live_slips WHERE game_date=%s"),
                         ("paper_picks", "SELECT count(*) FROM nba_score.paper_picks WHERE game_date=%s"),
                         ("board_true_hp", "SELECT count(*) FROM nba_score.board_true_hp WHERE game_date=%s"),
                         ("final_hp", "SELECT count(*) FROM nba_score.final_hp WHERE game_date=%s")):
                picks[t] = Shared.real.execute(q, (D,)).fetchone()[0]
        print("SIM_OUTPUT_COUNTS", json.dumps(picks), flush=True)
    finally:
        # ---- ALWAYS roll back, then prove production is untouched on a fresh connection
        try:
            Shared.real.rollback()
        except Exception:  # noqa: BLE001
            pass
        Shared.real.close()
        psycopg.connect = REAL_CONNECT
        with REAL_CONNECT(URL, autocommit=True) as v:
            after = {}
            for t in ("nba_score.baseline_history", "nba_score.final_hp", "nba_score.final_hp_derived", "nba_score.board_scored", "nba_score.live_slips",
                      "nba_score.ud_live_slips", "nba_score.paper_picks", "nba_score.board_true_hp", "nba_market.rung_market", "nba_market.board_tiers_v2"):
                col = "game_date"
                extra = " AND snapshot_label='window'" if t == "nba_market.rung_market" else ""
                after[t] = v.execute(f"SELECT count(*) FROM {t} WHERE {col}=%s{extra}", (D,)).fetchone()[0]
            after["board_snapshots[window]"] = v.execute("SELECT count(*) FROM nba_market.board_snapshots WHERE game_date=%s AND snapshot_label IN ('window','morning')", (D,)).fetchone()[0]
        print("PRODUCTION AFTER ROLLBACK for", D, json.dumps(after), "(all must be 0)", flush=True)

    # ---- the timeline
    p2b_s = sum(r["s"] for r in RESULTS if r["phase"] == "P2B" and not r["name"].startswith("LADDER BUILD TOTAL"))
    p3_s = sum(r["s"] for r in RESULTS if r["phase"] == "P3")
    setup = float(os.environ.get("SIM_SETUP_S", "60"))
    claim_overhead = 45.0          # the claim job (checkout + setup-python + pip psycopg + claim) runs before the afternoon job
    p3_total = p3_s + setup + claim_overhead
    p2b_end = p2b_pt + timedelta(seconds=p2b_s + setup + claim_overhead)
    p3_end = p3_pt + timedelta(seconds=p3_total)
    out = {
        "slate": D, "games": n_games, "first_tip_pt": f"{tip_pt:%H:%M}", "p2b_start_pt": f"{p2b_pt:%H:%M}", "p3_start_pt": f"{p3_pt:%H:%M}",
        "p2b_seconds": round(p2b_s), "p2b_end_pt": f"{p2b_end:%H:%M}", "p2b_before_p3_start": p2b_end <= p3_pt,
        "p3_seconds_steps": round(p3_s), "p3_seconds_with_setup": round(p3_total), "p3_end_pt": f"{p3_end:%H:%M}",
        "minutes_p3_end_to_tip": round((tip_pt - p3_end).total_seconds() / 60, 1),
        "betr_wait_cap_s_not_in_total": 360,
        "output_counts": picks, "board_scored_per_app": per_app, "production_after": after,
        "steps": RESULTS, "total_wall_s": round(time.time() - T_ALL),
    }
    Path("sim_p3_result.json").write_text(json.dumps(out, indent=1, default=str))
    print("\nSIM_RESULT|" + json.dumps({k: v for k, v in out.items() if k != "steps"}, default=str), flush=True)
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a") as f:
            f.write(f"## Full-slate simulation {D} ({n_games} games, first tip {out['first_tip_pt']} PT)\n\n")
            f.write(f"P2B model build: **{p2b_s/60:.1f} min** (starts {out['p2b_start_pt']}, ends ~{out['p2b_end_pt']}; P3 starts {out['p3_start_pt']})\n\n")
            f.write(f"P3 chain: **{p3_total/60:.1f} min** incl. {setup+claim_overhead:.0f}s runner setup (ends ~{out['p3_end_pt']}, {out['minutes_p3_end_to_tip']} min before the first tip)\n\n")
            f.write("| phase | step | s | status | note |\n|---|---|---|---|---|\n")
            for r in RESULTS:
                f.write(f"| {r['phase']} | {r['name']} | {r['s']} | {r['status']} | {str(r['note'])[:90]} |\n")
            f.write(f"\nProduction after rollback: `{json.dumps(after)}`\n")
    if any(after.values()):
        raise SystemExit("PRODUCTION WAS TOUCHED")


if __name__ == "__main__":
    main()
