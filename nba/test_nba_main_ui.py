#!/usr/bin/env python3
"""
END-TO-END CERTIFICATION OF THE NBA MAIN INTERFACE (alphadog-v2-nba-main-ui, 2026-10-14).

  A. parity      - every constant the UI reads from nba_config.classification_config['nba_main_ui'] equals the code it mirrors
                   (score_board_legs.MARKET_TO_PROP, live_slip_engine.STRATEGIES, ud_live_slip_engine.PORTFOLIOS,
                   build_ud_slip_engine.STD / FLEX); the served client parts are byte-identical to nba/main_ui/client/.
  B. pricing     - nba/main_ui/pricing.js (run under node) pays exactly what the certified graders pay: build_slip_engine.grade
                   for PrizePicks (Power, Flex all-standard, Flex with alternates) and ud_live_slip_engine.payout for Underdog,
                   on 400 random slips each.
  C. api         - every route of the deployed worker answers ok, and its numbers equal the database (board legs vs
                   nba_score.board_scored, variations vs board_tiers_v2, filters totals, dossier lines, profile box scores,
                   engine slips vs their source tables, builder EV recomputed independently, save + duplicate guard).
  D. browser     - headless Chromium walks every screen (board, card dossier, builder, Slips with a substitution, profile,
                   health, calibration) at phone width: no script error, no horizontal overflow, screenshots saved.
Env: DATABASE_URL, UI_URL, OUT_DIR (default nba_ui_probe), UI_DATE (optional slate to test via ?date=).
Exit 1 on any failure; the report (OUT_DIR/report.json) lists every check.
"""
import json
import os
import random
import subprocess
import sys
import time
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "nba"))
UI = os.environ.get("UI_URL", "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev").rstrip("/")
OUT = Path(os.environ.get("OUT_DIR", "nba_ui_probe"))
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "api").mkdir(exist_ok=True)
DATE = os.environ.get("UI_DATE", "").strip()
REPORT = {"ui": UI, "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "checks": []}


def check(name, ok, detail=""):
    REPORT["checks"].append({"name": name, "ok": bool(ok), "detail": str(detail)[:600]})
    print(("PASS " if ok else "FAIL ") + name + (f" - {detail}" if detail else ""), flush=True)


def curl(path, body=None, timeout=60):
    url = UI + path
    if DATE and "date=" not in path and (path.startswith("/api/") or path == "/health") and "dossier" not in path:
        url += ("&" if "?" in url else "?") + "date=" + DATE
    cmd = ["curl", "-sS", "-m", str(timeout), "-H", "user-agent: Mozilla/5.0 AlphaDog-NBA-UI-Test", "-w", "\n%{http_code}"]
    if body is not None:
        cmd += ["-X", "POST", "-H", "content-type: application/json", "--data", json.dumps(body)]
    t0 = time.time()
    r = subprocess.run(cmd + [url], capture_output=True, text=True)
    txt, _, code = r.stdout.rpartition("\n")
    try:
        data = json.loads(txt)
    except Exception:  # noqa: BLE001
        data = {"_raw": txt[:300]}
    return int(code or 0), data, round(time.time() - t0, 2)


def _k(leg_id):
    """board leg id date~app~player_id~prop~line~side -> comparable key"""
    p = str(leg_id).split("~")
    return (p[1], p[2], p[3], float(p[4]), p[5]) if len(p) == 6 else tuple(p)


def save_sample(name, data):
    def trim(x, depth=0):
        if isinstance(x, list):
            return [trim(v, depth + 1) for v in x[:6]] + ([f"... {len(x) - 6} more"] if len(x) > 6 else [])
        if isinstance(x, dict):
            return {k: trim(v, depth + 1) for k, v in x.items()}
        return x
    (OUT / "api" / f"{name}.json").write_text(json.dumps(trim(data), indent=1, default=str)[:200000])


# ------------------------------------------------------------------ A. parity
def parity(conn):
    cfg = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='nba_main_ui'").fetchone()[0]
    import score_board_legs as SB
    check("A1 market_to_prop == score_board_legs.MARKET_TO_PROP", cfg["market_to_prop"] == SB.MARKET_TO_PROP)
    import live_slip_engine as LS
    want = {k: {"composition": v[0], "size": v[1], "structure": v[2], "cap": v[3]} for k, v in LS.STRATEGIES.items()}
    check("A2 pp_strategies == live_slip_engine.STRATEGIES", cfg["pp_strategies"] == want, set(want) ^ set(cfg["pp_strategies"]))
    import ud_live_slip_engine as UL
    wantp = {k: [{"composition": c, "size": n, "structure": s, "cap": cp} for c, n, s, cp in v] for k, v in UL.PORTFOLIOS.items()}
    check("A3 ud_portfolios == ud_live_slip_engine.PORTFOLIOS", cfg["ud_portfolios"] == wantp)
    import build_ud_slip_engine as UE
    std = {str(k): float(v) for k, v in UE.STD.items()}
    flex = {f"{n}|{m}": float(v) for (n, m), v in UE.FLEX.items()}
    check("A4 ud_payout == build_ud_slip_engine.STD / FLEX", cfg["ud_payout"]["standard"] == std and cfg["ud_payout"]["flex"] == flex)
    return cfg


# ------------------------------------------------------------------ B. pricing parity
def pricing_parity(conn, cfg):
    import build_slip_engine as E
    import ud_live_slip_engine as UL
    rules = {k: v for k, v in conn.execute("SELECT rule_key, rule_json FROM nba_config.pp_slip_rules WHERE rule_key = ANY(%s)",
                                           (["base_power", "flex_all_standard", "flex_2pick_base", "compression", "flex_alt_tiers"],)).fetchall()}
    pricing = {"pp": rules, "ud": cfg["ud_payout"]}
    rnd = random.Random(20261014)
    cases = []
    for _ in range(400):
        n = rnd.randint(2, 6)
        alt = rnd.random() < 0.5
        legs = [{"factor": (round(rnd.choice([0.6, 0.75, 0.85, 1.0, 1.0, 1.2, 1.5, 1.9]), 3) if alt else 1.0), "hit": int(rnd.random() < 0.6)} for _ in range(n)]
        cases.append({"app": "prizepicks", "mode": rnd.choice(["power", "flex"]), "legs": legs})
    for _ in range(400):
        n = rnd.randint(2, 6)
        legs = [{"factor": round(rnd.choice([1.0, 1.0, 0.9, 1.05, 1.1, 1.3]), 3), "hit": int(rnd.random() < 0.6)} for _ in range(n)]
        cases.append({"app": "underdog", "mode": rnd.choice(["power", "flex"]) if n >= 3 else "power", "legs": legs})
    (OUT / "_pricing.mjs").write_text((ROOT / "nba/main_ui/pricing.js").read_text())
    (OUT / "_pricing_parity.mjs").write_text(
        "import fs from 'node:fs';\nimport * as P from './_pricing.mjs';\n"
        "const inp = JSON.parse(fs.readFileSync(0, 'utf8'));\n"
        "const out = inp.cases.map(c => P.nbaPayout(inp.pricing, c.app, c.mode, c.legs.map(l => ({ leg_factor: l.factor })), c.legs.map(l => !!l.hit)));\n"
        "process.stdout.write(JSON.stringify(out));\n")
    r = subprocess.run(["node", str(OUT / "_pricing_parity.mjs")], input=json.dumps({"pricing": pricing, "cases": cases}), capture_output=True, text=True)
    if r.returncode != 0:
        check("B0 pricing.js runs under node", False, r.stderr[-400:])
        return
    got = json.loads(r.stdout)
    E._FLEX_ALT = None
    bad = []
    for c, g in zip(cases, got):
        if c["app"] == "prizepicks":
            _, want = E.grade([dict(l) for l in c["legs"]], c["mode"])
        else:
            want = UL.payout("standard" if c["mode"] == "power" else "flex", [dict(l) for l in c["legs"]]) or 0.0
        if g is None or abs(float(g) - float(want)) > 1e-6:
            bad.append({"case": c, "js": g, "py": want})
    pp_n = sum(1 for c in cases if c["app"] == "prizepicks")
    check(f"B1 PrizePicks payouts identical to build_slip_engine.grade ({pp_n} slips)", not [b for b in bad if b["case"]["app"] == "prizepicks"], bad[:2])
    check(f"B2 Underdog payouts identical to ud_live_slip_engine.payout ({len(cases) - pp_n} slips)", not [b for b in bad if b["case"]["app"] == "underdog"], [b for b in bad if b["case"]["app"] == "underdog"][:2])


# ------------------------------------------------------------------ C. api vs database
def api_checks(conn, cfg):
    code, h, t = curl("/health")
    check("C0 /health ok", code == 200 and h.get("ok"), f"{t}s {h.get('version')} slate {h.get('slate')}")
    slate = h.get("slate") or {}
    d = slate.get("date")
    code, f, t = curl("/api/main-board/filters"); save_sample("filters", f)
    tot = conn.execute("SELECT count(*) FROM nba_score.board_scored WHERE game_date=%s AND app = ANY(%s)", (d, cfg["apps"])).fetchone()[0]
    ftot = sum(p["rows"] for g in ("hitter", "pitcher") for p in f.get("prop_groups", {}).get(g, []))
    stot = sum(x["rows"] for g in ("prizepicks", "underdog", "sleeper") for x in f.get("source_groups", {}).get(g, []))
    check("C1 filters: prop and app totals == board_scored rows", code == 200 and ftot == tot == stot, f"{t}s props {ftot} apps {stot} db {tot} ({d})")
    code, cur, t = curl("/api/main-board/current?limit=200&min_score=80"); save_sample("current", cur)
    rows = cur.get("rows") or []
    n80 = conn.execute("SELECT count(*) FROM nba_score.board_scored WHERE game_date=%s AND app = ANY(%s) AND score >= 80", (d, cfg["apps"])).fetchone()[0]
    check("C2 current: answers, row count = min(200, legs with score >= 80)", code == 200 and len(rows) == min(200, n80), f"{t}s rows {len(rows)} db {n80}")
    bad = []
    for r in rows:
        dd, app, pid, prop, line, side = r["final_board_row_id"].split("~")
        db = conn.execute("""SELECT final_hp, confidence, score FROM nba_score.board_scored WHERE game_date=%s AND app=%s AND player_id=%s AND prop=%s AND line=%s AND side=%s""",
                          (dd, app, pid, prop, float(line), side)).fetchone()
        if not db or abs(float(db[0]) * 100 - r["estimated_hit_probability_0_100"]) > 0.051 or abs(float(db[2]) - r["score_0_100"]) > 0.051 \
                or abs(float(db[1]) * 100 - r["probability_confidence_0_100"]) > 0.051:
            bad.append((r["final_board_row_id"], db))
    check("C3 every board leg's HP / confidence / score == nba_score.board_scored", not bad and rows, bad[:3])
    miss_game = [r["final_board_row_id"] for r in rows if not r.get("official_game_time_utc") or not r.get("team_abbr")]
    check("C4 every leg resolved to a team and a game", not miss_game, miss_game[:3])
    pp = [r for r in rows if r["source_key"] == "prizepicks"][:40]
    badk = []
    for r in pp:
        k = conn.execute("""SELECT kind FROM nba_market.board_tiers_v2 WHERE game_date=%s AND bookmaker='prizepicks' AND player=%s AND side=%s AND line=%s
                            AND base_market = ANY(%s) ORDER BY array_position(%s, snapshot_label) NULLS LAST LIMIT 1""",
                         (r["official_date"], r["player_name"], "Over" if r["selected_side"] == "more" else "Under", r["line_value"],
                          [mk for mk, p in cfg["market_to_prop"].items() if p == r["canonical_prop_key"]], cfg["label_pref"])).fetchone()
        want = {"goblin": "goblin", "demon": "demon"}.get(k[0] if k else "", "regular")
        if want != r["line_type"]:
            badk.append((r["final_board_row_id"], k, r["line_type"]))
    check(f"C5 PrizePicks variation (goblin/regular/demon) == board_tiers_v2 ({len(pp)} legs)", not badk, badk[:3])
    ins = [r for r in rows if not (r.get("leg_insight_comment") or "").strip()]
    check("C6 every card carries a scouting line", not ins, len(ins))
    if not rows:
        return
    leg = rows[0]
    code, dos, t = curl("/api/main-board/dossier?final_board_row_id=" + leg["final_board_row_id"]); save_sample("dossier", dos)
    ctx = dos.get("dossier_context") or {}
    nlines = conn.execute("SELECT count(*) FROM nba_score.board_scored WHERE game_date=%s AND app = ANY(%s) AND player_id=%s", (leg["official_date"], cfg["apps"], leg["player_id"])).fetchone()[0]
    check("C7 dossier: selected leg + every line of the player", code == 200 and dos.get("selected", {}).get("final_board_row_id") == leg["final_board_row_id"] and len(ctx.get("hp_lines", [])) == nlines,
          f"{t}s lines {len(ctx.get('hp_lines', []))} db {nlines}")
    last = conn.execute("""SELECT max(game_date)::text FROM (SELECT game_date FROM nba_stats.player_game_log WHERE player_id=%s AND game_date < %s
                           UNION ALL SELECT game_date FROM nba_stats.player_game_log_postseason WHERE player_id=%s AND game_date < %s) x""",
                        ("nba_" + leg["player_id"], leg["official_date"], "nba_" + leg["player_id"], leg["official_date"])).fetchone()[0]
    rg = ctx.get("recent_games") or []
    check("C8 dossier: game log is the player's, before the slate", rg and rg[0]["game_date"] == last, f"latest {rg[0]['game_date'] if rg else None} db {last}")
    filled = [k for k in ("player_profile", "recent_form", "splits", "team_profiles", "schedule_spot", "injuries", "officials", "market_summary", "prepared_lines", "advanced") if ctx.get(k)]
    check("C9 dossier: context sections present", len(filled) >= 8, f"{len(filled)}/10 {filled}")
    code, ps, t = curl("/api/player-search?q=" + leg["player_name"].split(" ")[-1][:8]); save_sample("player_search", ps)
    check("C10 player search finds the player", code == 200 and any(x["player_id"] == "nba_" + leg["player_id"] for x in ps.get("rows", [])), f"{t}s {len(ps.get('rows', []))} rows")
    code, pr, t = curl("/api/player-profile?player_id=nba_" + leg["player_id"]); save_sample("player_profile", pr)
    snap = {s["metric_window"]: s for s in pr.get("metric_snapshots", [])}
    check("C11 profile: identity, game log, snapshots, legs", code == 200 and pr.get("player") and pr.get("recent_games") and snap.get("season_to_date", {}).get("games_count"),
          f"{t}s games {len(pr.get('recent_games', []))} legs {len(pr.get('current_legs', []))} next {pr.get('next_game')}")
    # ---- C25-C34: the bettor depth of the dossier and profile, every number reproduced from the database
    pid = "nba_" + leg["player_id"]; d0 = leg["official_date"]; opp = leg.get("opponent_abbr")
    derr = ctx.get("depth_errors") or []
    check("C25 dossier depth: every block built (no block error)", isinstance(ctx.get("depth_errors"), list) and not derr, derr[:3])
    u10 = next((r for r in ((ctx.get("usage_detail") or {}).get("usage") or []) if r["window"] == "Last 10"), None)
    dbu = conn.execute("""SELECT avg(a.usg_pct::float), avg(a.ts_pct::float), count(*) FROM (
                            SELECT game_id, game_date FROM nba_stats.player_game_log WHERE player_id=%s AND game_date < %s AND min > 0
                            UNION ALL SELECT game_id, game_date FROM nba_stats.player_game_log_postseason WHERE player_id=%s AND game_date < %s AND min > 0
                            ORDER BY game_date DESC LIMIT 10) g
                          LEFT JOIN (SELECT game_id, usg_pct, ts_pct FROM nba_stats.player_game_log_advanced WHERE player_id=%s
                                     UNION ALL SELECT game_id, usg_pct, ts_pct FROM nba_stats.player_game_log_advanced_postseason WHERE player_id=%s) a USING (game_id)""",
                       (pid, d0, pid, d0, pid, pid)).fetchone()
    check("C26 usage & efficiency: last-10 USG% / TS% == the per-game advanced log", u10 and dbu[0] is not None and abs(u10["usg"] - 100 * dbu[0]) < 0.11 and abs(u10["ts"] - 100 * dbu[1]) < 0.11,
          f"ui {u10 and (u10['usg'], u10['ts'])} db {dbu[0] and (round(100 * dbu[0], 1), round(100 * dbu[1], 1))}")
    trk = ctx.get("tracking_skills") or {}
    ntr = conn.execute("SELECT count(*) FROM nba_stats.player_tracking_detail WHERE player_id=%s", (pid,)).fetchone()[0]
    check("C27 tracking skills: one block per tracking board (touch boards merged)", (len(trk.get("groups") or []) >= 5) if ntr >= 6 else True, f"groups {[g['key'] for g in trk.get('groups') or []]} boards {ntr}")
    car = ctx.get("career") or []
    dbc = conn.execute("SELECT count(*), max(season_id) FROM nba_stats.player_career_season_totals WHERE player_id=%s", (pid,)).fetchone()
    check("C28 career: one row per season / team on record", len(car) == dbc[0] and (not car or car[0]["season"] == dbc[1]), f"ui {len(car)} db {dbc[0]} latest {dbc[1]}")
    vs = ctx.get("vs_opponent") or []
    dbv = conn.execute("""SELECT count(*) FROM (SELECT game_date FROM nba_stats.player_game_log WHERE player_id=%s AND game_date < %s AND (matchup LIKE %s OR matchup LIKE %s)
                          UNION ALL SELECT game_date FROM nba_stats.player_game_log_postseason WHERE player_id=%s AND game_date < %s AND (matchup LIKE %s OR matchup LIKE %s)) x""",
                       (pid, d0, f"% @ {opp}", f"% vs. {opp}", pid, d0, f"% @ {opp}", f"% vs. {opp}")).fetchone()[0] if opp else 0
    check("C29 head-to-head: every game vs the opponent before the slate (max 20)", len(vs) == min(20, dbv) and all(r["game_date"] < d0 for r in vs), f"vs {opp}: ui {len(vs)} db {dbv}")
    ww = ctx.get("with_without") or {}
    if ww.get("rows"):
        r0 = ww["rows"][0]
        mine = conn.execute("""SELECT count(*) FROM nba_stats.player_game_log g WHERE g.player_id=%s AND g.season=%s AND g.game_date < %s AND g.min > 0
                               AND g.game_id IN (SELECT game_id FROM nba_team.team_game_log WHERE team_id=%s AND season=%s AND game_date < %s)""",
                            (pid, ww["season"], d0, leg.get("team_id"), ww["season"], d0)).fetchone()[0]
        tot = (r0["with"] or {}).get("games", 0) + (r0["without"] or {}).get("games", 0)
        check("C30 with/without: with + without games == his games for the team this season", tot == mine, f"{r0['name']}: {tot} vs db {mine}; {len(ww['rows'])} teammates")
    else:
        check("C30 with/without: teammates listed", False, "no rows")
    lu = ctx.get("lineups") or {}
    nlu = conn.execute("SELECT count(*) FROM nba_team.lineup_profile WHERE %s = ANY(player_ids)", (pid,)).fetchone()[0]
    check("C31 lineups: most-used units present when the league data has them", bool(lu.get("five") or lu.get("pairs")) == (nlu > 0), f"five {len(lu.get('five') or [])} pairs {len(lu.get('pairs') or [])} db rows {nlu}")
    tt = ctx.get("team_trends") or []
    check("C32 team form: both teams, last 10 + season", len(tt) == 4 and all(x["games"] > 0 and x["pace"] for x in tt), [(x["team"], x["window"], x["games"]) for x in tt])
    hp = ctx.get("hp_lines") or []
    check("C33 dossier ships the full pre-slate log for line records", len(ctx.get("games_full") or []) >= len(ctx.get("recent_games") or []) and all(g["game_date"] < d0 for g in ctx.get("games_full") or []),
          f"{len(ctx.get('games_full') or [])} games for {len(hp)} lines")
    pdp = pr.get("depth") or {}
    check("C34 profile depth: built around the next game, no block error", pdp and not pdp.get("depth_errors") and pdp.get("career") and pdp.get("usage_detail"),
          f"errors {pdp.get('depth_errors')} next {pr.get('next_game') and pr['next_game'].get('opponent_abbr')} vs-opp {len(pdp.get('vs_opponent') or [])} ww {len((pdp.get('with_without') or {}).get('rows') or [])}")
    c_run, j_run, _ = curl("/run", body={"job_key": "nba_ui_test"})
    c_404, j_404, _ = curl("/nope")
    check("C35 /run is a read-only no-op and unknown paths list the allowed routes (MLB parity)", c_run == 200 and j_run.get("status") == "MAIN_UI_READ_ONLY_NOOP" and c_404 == 404 and len(j_404.get("allowed_routes") or []) >= 25,
          f"run {j_run.get('status')} 404 routes {len(j_404.get('allowed_routes') or [])}")
    code, hh, t = curl("/api/slips/high-hit", body={}); save_sample("high_hit", hh)
    sl = hh.get("generated_slips") or []
    unpriced = [s["track_label"] for s in sl if not s.get("estimated_multiplier")]
    check("C12 Slips screen: engine slips load and are priced", code == 200 and hh.get("ok") and sl and not unpriced, f"{t}s source {hh.get('source')} slips {len(sl)} pool {len(hh.get('backup_pool', []))} unpriced {unpriced[:3]}")
    nolegs = [s["track_label"] for s in sl if any(l.get("hit_probability_0_100") is None for l in s["legs"])]
    if hh.get("source") == "replay_backtest":
        # a backtest slip can hold a leg the historical scored board lacks (e.g. the pre-fix suffix-name gap): it must be
        # shown without a probability AND disclosed in the notes - never silently priced
        nleg = sum(len(s["legs"]) for s in sl)
        disclosed = any("not on the scored board" in n for n in hh.get("notes", [])) or not nolegs
        check("C13 Slips screen (replay): unmatched legs are disclosed, the rest matched", disclosed, f"{len(nolegs)} slips with an unscored leg of {len(sl)}; {nleg} legs")
    else:
        check("C13 Slips screen: every slip leg matched to its board leg", not nolegs, nolegs[:3])
    # C24: the backup pool equals the pool picked from the WHOLE slate (top HP per app, score >= min, no leg already in a slip)
    bp = cfg["backup_pool"]
    sd = (hh.get("slate") or {}).get("date")
    in_slip = {l["board_row_id"] for s in sl for l in s["legs"]}
    want_pool = []
    for app in ("prizepicks", "underdog"):
        rows_ = conn.execute("""SELECT app, player_id, prop, line::float8, side FROM nba_score.board_scored WHERE game_date=%s AND app=%s AND round(score::numeric, 1) >= %s
                                ORDER BY final_hp DESC, score DESC, player, prop, line, side""", (sd, app, bp["min_score"])).fetchall()
        picked = []
        for a, pid, prop, line, side in rows_:
            key = (a, str(pid), prop, float(line), side)
            if any(_k(x) == key for x in in_slip):
                continue
            picked.append(key)
            if len(picked) >= int(bp["size"]):
                break
        want_pool += picked
    got_pool = [_k(l["board_row_id"]) for l in hh.get("backup_pool", [])]
    check("C24 backup pool == the pool picked from the whole slate (light load is exact)", got_pool == want_pool, f"got {len(got_pool)} want {len(want_pool)}; first diff {next(((a, b) for a, b in zip(got_pool, want_pool) if a != b), None)}")
    if hh.get("source") == "replay_backtest" and sl:
        res = [s for s in sl if s.get("result")]
        check("C14 replay slips carry the backtest result", len(res) == len(sl), f"{len(res)}/{len(sl)}")
    ids = [r["final_board_row_id"] for r in rows if r["source_key"] == "prizepicks"][:6]
    code, g, t = curl("/api/slips/generate", body={"leg_ids": ids}); save_sample("generate", g)
    gs = g.get("generated_slips") or []
    okev = True
    for s in gs:
        import itertools
        legs = s["legs"]
        ps_ = [l["hit_probability_0_100"] / 100 for l in legs]
        if not all(l.get("leg_factor") for l in legs):
            continue
        import build_slip_engine as E
        mean = 0
        for hits in itertools.product([0, 1], repeat=len(legs)):
            p = 1
            for h_, q in zip(hits, ps_):
                p *= q if h_ else 1 - q
            _, pay = E.grade([{"factor": l["leg_factor"], "hit": h_} for l, h_ in zip(legs, hits)], s["entry_mode"])
            mean += p * pay
        if abs((mean - 1) - s["estimated_ev_per_unit_stake"]) > 0.002:
            okev = False
    check("C15 builder: recommendation EV == independent Python EV (certified grader)", code == 200 and gs and okev, f"{t}s {len(gs)} slips: {[s['structure_label'] for s in gs]}")
    if gs:
        test_slip = dict(gs[0]); test_slip["track_label"] = "nba_ui_test"
        c1, s1, _ = curl("/api/slips/save", body={"slips": [test_slip], "saved_by": "nba_ui_test"})
        c2, s2, _ = curl("/api/slips/save", body={"slips": [test_slip], "saved_by": "nba_ui_test"})
        check("C16 save writes nba_score.ui_saved_slips and refuses the identical slip the same day",
              c1 == 200 and c2 == 200 and (s1.get("saved_count") == 1 or s1.get("skipped_duplicates")) and s2.get("saved_count") == 0 and s2.get("skipped_duplicates"),
              f"first {s1.get('saved_count')} second {s2.get('saved_count')} dup {len(s2.get('skipped_duplicates') or [])}")
    code, rc, t = curl("/api/slips/recent?limit=5"); check("C17 saved slips list", code == 200 and rc.get("ok"), f"{len(rc.get('slips', []))}")
    code, he, t = curl("/api/main-board/health"); save_sample("health", he)
    check("C18 health: every layer reported", code == 200 and len(he.get("layers", [])) >= 7, f"{t}s overall {he.get('overall_status')} layers {[l['key'] + ':' + l['status'] for l in he.get('layers', [])]}")
    code, rr, _ = curl("/api/main-board/health/rerun", body={"target": "NOPE", "mode": "dispatch"})
    check("C19 rerun refuses an unknown target", code == 400 and not rr.get("ok"))
    code, ca, t = curl("/api/calibration/report"); save_sample("calibration", ca)
    rep = (ca.get("response") or {}).get("report") or []
    check("C20 calibration report = prop_reliability_audit_latest", code == 200 and len(rep) == len((conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='prop_reliability_audit_latest'").fetchone()[0] or {}).get("props", {})), f"{len(rep)} props")
    code, cp, _ = curl("/api/calibration/apply", body={"props": []})
    check("C21 calibration apply refuses an empty selection", code == 400)
    src = {"/app.js": "core.js.txt", "/js/dossier.js": "dossier.js.txt", "/js/build.js": "build.js.txt", "/js/slips.js": "slips.js.txt",
           "/js/profile.js": "profile.js.txt", "/js/admin.js": "admin.js.txt"}
    for p in ("/", "/app.js", "/js/dossier.js", "/js/build.js", "/js/slips.js", "/js/profile.js", "/js/admin.js", "/js/pricing.js", "/main_alphadog_logo.png"):
        r = subprocess.run(["curl", "-sS", "-m", "30", "-H", "user-agent: Mozilla/5.0", UI + p], capture_output=True)
        body = r.stdout
        same = True
        if p in src:
            same = body == (ROOT / "nba/main_ui/client" / src[p]).read_bytes()
        if p == "/js/pricing.js":
            same = b"function nbaPayout(" in body and b"function nbaFlexAlt(" in body
            # the served file must RUN as a classic browser script in a clean global scope (no bundler helpers)
            (OUT / "_served_pricing.js").write_bytes(body)
            js = ("const vm=require('vm'),fs=require('fs');const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),ctx);"
                  "const pr=JSON.parse(fs.readFileSync(0,'utf8'));const legs=[{leg_factor:1},{leg_factor:1},{leg_factor:1}];"
                  "process.stdout.write(JSON.stringify([ctx.nbaTiers(pr,'prizepicks','flex',legs),ctx.nbaBreakeven(pr,'underdog','power',legs)]))")
            rr = subprocess.run(["node", "-e", js, str(OUT / "_served_pricing.js")], input=json.dumps(hh.get("pricing") or {}), capture_output=True, text=True)
            check("C23 served pricing.js runs in a clean browser scope and prices a slip", rr.returncode == 0 and rr.stdout.startswith("[{"), (rr.stdout or rr.stderr)[-300:])
        check(f"C22 asset {p} served{' = source file' if p in src else ''}", r.returncode == 0 and len(body) > 100 and same, f"{len(body)} bytes")


# ------------------------------------------------------------------ D. browser
def browser():
    from playwright.sync_api import sync_playwright
    errors = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page(viewport={"width": 430, "height": 932})
        page.set_default_timeout(45000)
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        page.on("dialog", lambda d: d.dismiss())

        def step(name, fn):
            try:
                t0 = time.time()
                fn()
                page.wait_for_timeout(600)
                page.screenshot(path=str(OUT / f"{name}.png"))
                sw = page.evaluate("document.documentElement.scrollWidth")
                check(f"D {name}", sw <= 431, f"{round(time.time() - t0, 1)}s scrollWidth {sw}")
            except Exception as e:  # noqa: BLE001
                try:
                    page.screenshot(path=str(OUT / f"{name}_FAIL.png"))
                except Exception:  # noqa: BLE001
                    pass
                check(f"D {name}", False, str(e).split("\n")[0])
        q = ("?date=" + DATE) if DATE else ""
        step("01_board", lambda: (page.goto(UI + "/" + q), page.wait_for_selector(".card")))
        step("02_dossier", lambda: (page.locator(".card").first.click(), page.wait_for_selector("#dossierBody .dossierHero")))
        def dossier_depth():
            heads = page.evaluate("[...document.querySelectorAll('#dossierBody h3, #dossierBody .sectionLabel')].map(e => e.textContent.trim())")
            need = ["Line Profile — Every Prop", "Minutes & Role", "Usage & Efficiency", "Scoring Profile — Where His Points Come From", "Head-To-Head vs",
                    "With / Without Teammates", "Team Form — Last 10 / Season", "Career — Season By Season", "Skills — Player Tracking", "Player Depth — Form, Role, Skills, Matchup"]
            miss = [n for n in need if not any(h.startswith(n) for h in heads)]
            if miss:
                raise RuntimeError(f"dossier depth sections missing: {miss}")
            page.evaluate("[...document.querySelectorAll('#dossierBody .sectionLabel')].find(e => e.textContent.startsWith('Player Depth')).scrollIntoView()")
        step("02a_dossier_depth", dossier_depth)
        step("02b_dossier_mid", lambda: page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.45)"))
        step("02c_dossier_low", lambda: page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.8)"))

        def build():
            page.click("#dossierHome")
            boxes = page.locator(".pickBox")
            for i in range(min(4, boxes.count())):
                boxes.nth(i).check()
            page.click("#slipFloatBuild")
            page.wait_for_selector("#recoBox .slipCard, #recoBox .empty")
        step("03_builder", build)

        def slips():
            page.click("#buildBack"); page.click("#menuOpen"); page.click("#menuSlips")
            page.wait_for_function("(() => { const e = document.getElementById('autoCreateResults'); return e && (e.querySelector('.slipCard') || (e.querySelector('.empty') && !/Loading/.test(e.textContent))); })()", timeout=90000)
            n = page.locator("#autoCreateResults .slipCard").count()
            if not n:
                raise RuntimeError("no slip cards: " + page.inner_text("#autoCreateResults")[:200])
        step("04_slips", slips)

        def sub():
            rows = page.locator("#autoCreateResults .legRow")
            if not rows.count():
                raise RuntimeError("no slip legs to uncheck")
            rows.first.locator(".legKeepBox").uncheck()
            page.wait_for_selector("#autoCreateResults .subTag", timeout=10000)
            # the swapped card must price the CHECKED legs: its label names that count, and a Power badge equals the field
            card = page.evaluate("""(() => { const c = document.querySelector('.subTag').closest('.slipCard');
                const n = [...c.querySelectorAll('.legKeepBox')].filter(b => b.checked).length;
                const lab = (c.querySelector('.realMultLabel') || {}).textContent || '';
                const inp = c.querySelectorAll('.realMultInput'); const badge = (c.querySelector('.multiplierTag') || {}).textContent || '';
                return { n, lab, single: inp.length === 1 && !inp[0].dataset.tierHits ? inp[0].value : null, badge }; })()""")
            if f"({card['n']}-pick" not in card["lab"]:
                raise RuntimeError(f"swapped slip prices the wrong legs: {card}")
            if card["single"] not in (None, "") and abs(float(card["single"]) - float(card["badge"].rstrip("x") or 0)) > 0.011:
                raise RuntimeError(f"badge and real-multiplier field disagree after the swap: {card}")
        step("05_slips_substitution", sub)

        def profile():
            page.click("#slipsBack"); page.click("#menuOpen"); page.click("#menuPlayerProfile")
            page.fill("#playerSearch", os.environ.get("UI_PLAYER", "Jokic"))
            page.wait_for_selector(".searchResult")
            page.locator(".searchResult").first.click()
            page.wait_for_selector(".p2Hero")
        step("06_profile", profile)
        def profile_depth():
            heads = page.evaluate("[...document.querySelectorAll('#playerProfileBody h3, #playerProfileBody .sectionLabel')].map(e => e.textContent.trim())")
            need = ["Line Profile — Every Prop", "Minutes & Role", "Usage & Efficiency", "Career — Season By Season", "Skills — Player Tracking", "Player Depth — Form, Role, Skills, Matchup"]
            miss = [n for n in need if not any(h.startswith(n) for h in heads)]
            if miss:
                raise RuntimeError(f"profile depth sections missing: {miss}")
            page.evaluate("[...document.querySelectorAll('#playerProfileBody .sectionLabel')].find(e => e.textContent.startsWith('Player Depth')).scrollIntoView()")
        step("06a_profile_depth", profile_depth)
        step("06b_profile_low", lambda: page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.6)"))

        def health():
            page.click("#profileBack"); page.click("#menuOpen"); page.click("#menuHealth")
            page.fill("#pwGateInput", "3971"); page.click("#pwGateSubmit")
            page.wait_for_selector(".healthCard")
        step("07_health", health)

        def calib():
            page.click("#backBoard"); page.click("#menuOpen"); page.click("#menuCalibration")
            page.wait_for_selector("#calibrationCards .healthCard")
        step("08_calibration", calib)
        b.close()
    errs = [e for e in errors if "favicon" not in e]
    check("D9 no script errors in any screen", not errs, errs[:5])


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    try:
        cfg = parity(conn)
        pricing_parity(conn, cfg)
        api_checks(conn, cfg)
    except Exception as e:  # noqa: BLE001
        check("harness", False, repr(e))
    if os.environ.get("SKIP_BROWSER") != "1":
        try:
            browser()
        except Exception as e:  # noqa: BLE001
            check("D browser harness", False, repr(e))
    REPORT["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    fails = [c for c in REPORT["checks"] if not c["ok"]]
    REPORT["summary"] = f"{len(REPORT['checks']) - len(fails)}/{len(REPORT['checks'])} passed"
    (OUT / "report.json").write_text(json.dumps(REPORT, indent=1))
    print("\n" + REPORT["summary"], flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
