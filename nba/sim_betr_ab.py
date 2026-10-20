#!/usr/bin/env python3
"""BETR A/B SIMULATION (owner 2026-10-19 22:51 PT: leave Betr out, debug/simulate/test it separately and deeply).
Same rolled-back shared-transaction machinery as sim_p3_full.py, a LIGHTER chain: builds the slate's final_hp (model refits skipped - both arms
read the same final_hp), captures the four app boards, archives the REAL committed Betr board (boards/betr_nba_current.json) with the CURRENT
mapping as label 'window', then scores twice: ARM A Betr ON, ARM B Betr PARKED (p3_betr_wait.enabled toggled inside the transaction).
Reports Betr legs by prop, and the per-leg effect of Betr's presence on the NON-Betr apps (f_books corroboration). Everything is rolled back;
production is verified empty for the slate and p3_betr_wait.enabled still false. Env: DATABASE_URL, SIM_DATE."""
import json, os, sys, time
from pathlib import Path
os.environ.setdefault("SIM_DATE", "2026-10-20")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import sim_p3_full as S  # noqa: E402
import psycopg  # noqa: E402

D, URL, PY = S.D, S.URL, sys.executable


def main():
    t_all = time.time()
    with S.REAL_CONNECT(URL, autocommit=True) as g:
        for t in ("nba_score.baseline_history", "nba_score.final_hp", "nba_score.board_scored", "nba_score.live_slips"):
            if g.execute(f"SELECT count(*) FROM {t} WHERE game_date=%s", (D,)).fetchone()[0]:
                raise SystemExit(f"ABORT: production already holds {t} for {D}")
        if g.execute("SELECT count(*) FROM pg_stat_activity WHERE query ILIKE '%audit_season_replay%' AND pid<>pg_backend_pid() AND state='active'").fetchone()[0]:
            raise SystemExit("ABORT: a replay is active")
    S.Shared.real = S.REAL_CONNECT(URL, autocommit=False)
    S.Shared.real.execute("SAVEPOINT cp")
    psycopg.connect = S.proxy_connect
    try:
        pu = S.Shared.real.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='proxy_url'").fetchone()[0] or ""
    except Exception:  # noqa: BLE001
        S.Shared.real.execute("ROLLBACK TO SAVEPOINT cp")
        pu = ""
    if pu:
        os.environ["PROXY_URL"] = pu
    os.environ["DATABASE_URL"] = URL
    BT = {"BT_ASOF": D, "BT_CUTOFF": "baseline", "BT_REPLAY": "0"}
    out = {"slate": D}
    after = {}
    try:
        P = "ABPREP"
        S.sub(P, "ensure season files", [PY, "nba/ensure_season_files.py"], env=BT, timeout=600)
        for pair in ["points,rebounds", "assists,threes_made", "fga,fg3a", "ftm,fta", "fgm,dreb", "steals,blocks", "turnovers,personal_fouls", "oreb"]:
            S.sub(P, f"ladder {pair}", [PY, "nba/baseline/build_baseline_ladder.py"], env=dict(BT, BT_PROPS=pair))
        os.makedirs("nba/backtest/reports", exist_ok=True)
        for pair in ["points,rebounds", "assists,steals", "blocks,turnovers"]:
            S.sub(P, f"components {pair}", [PY, "nba/baseline/build_baseline_ladder.py"], env=dict(BT, BT_INJURY="1", BT_SAVE_COMPONENTS="1", BT_PROPS=pair))
        S.sub(P, "combos ladder", [PY, "nba/baseline/build_combos_ladder.py"], env=dict(BT, BT_INJURY="1"))
        S.sub(P, "periods ladder", [PY, "nba/baseline/build_periods_ladder.py"], env=dict(BT, BT_INJURY="1"))
        S.inproc(P, "merge ladders", code=S.heredoc(S.yaml_step("nba-p2b-slate.yml", "slate", "Merge per-pair ladders")), env={"BT_ASOF": D})
        S.inproc(P, "load baseline", "nba/load_baseline_ladder.py", env={"LOAD_ASOF": D})
        S.inproc(P, "build final_hp", "nba/build_final_hp.py", env={"FE_DATE": D, "FE_WRITE": "1"})
        S.inproc(P, "whole-number hp", "nba/build_whole_number_hp.py", env={"WN_DATE": D, "WN_WRITE": "1"})
        P = "ABP3"
        ok_pp = S.sub(P, "PrizePicks board", [PY, "nba/scrape_prizepicks_nba_board.py"], env={"PP_NBA_OUT_DIR": "boards", "PP_NBA_MIN_FUTURE_ROWS": "50"}, timeout=420)
        ok = S.sub_parallel(P, "Sleeper + Underdog + Fliff", [
            ("sleeper", [PY, "nba/scrape_sleeper_board.py"], {"SLEEPER_SPORTS": "nba", "SLEEPER_OUT_DIR": "boards"}),
            ("underdog", [PY, "nba/scrape_underdog_board.py"], {"UNDERDOG_SPORTS": "NBA", "UNDERDOG_OUT_DIR": "boards"}),
            ("fliff", [PY, "nba/scrape_fliff_board.py"], {"FLIFF_SPORTS": "nba"})])
        apps = (("prizepicks," if ok_pp else "") + ",".join(ok)).strip(",")
        S.inproc(P, "archive boards (window)", "nba/archive_live_boards.py", env={"ARCHIVE_LABEL": "window", "ARCHIVE_SPORT": "nba", "ARCHIVE_APPS": apps})
        S.inproc(P, "archive Betr committed board (window)", "nba/archive_live_boards.py", env={"ARCHIVE_LABEL": "window", "ARCHIVE_SPORT": "nba", "ARCHIVE_APPS": "betr"})
        S.inproc(P, "rung keys", code=S.heredoc(S.yaml_step("nba-p3-afternoon-light.yml", "afternoon", "Refresh board rung keys")))
        S.inproc(P, "board tiers", "nba/build_board_tiers_v2.py", env={"BT2_APPS": "prizepicks", "BT2_DATE": D})
        S.inproc(P, "PP price keys", code=S.heredoc(S.yaml_step("nba-p3-afternoon-light.yml", "afternoon", "PrizePicks price keys")), env={"SLATE": D})
        S.inproc(P, "ParlayAPI capture", "nba/capture_parlay_props.py", env={"CP_MODE": "capture", "CP_LABEL": "window", "CP_DATE": D})
        S.inproc(P, "rung market", "nba/build_rung_market.py")
        S.inproc(P, "market refresh: build_final_hp", "nba/build_final_hp.py", env={"FE_DATE": D, "FE_WRITE": "1"})
        S.inproc(P, "market refresh: whole-number hp", "nba/build_whole_number_hp.py", env={"WN_DATE": D, "WN_WRITE": "1"})
        S.inproc(P, "availability delta", "nba/build_availability_delta.py", env={"DELTA_ASOF": D, "DELTA_FROM": "baseline", "DELTA_TO": "phase1"})
        with S.Shared.lock:
            out["betr_archived"] = dict(S.Shared.real.execute("SELECT market_key, count(*) FROM nba_market.board_snapshots WHERE bookmaker='betr' AND snapshot_label='window' AND game_date=%s GROUP BY 1", (D,)).fetchall())

        def set_betr(en):
            with S.Shared.lock:
                S.Shared.real.execute("UPDATE nba_config.classification_config SET config_json = jsonb_set(config_json::jsonb,'{enabled}',%s::jsonb) WHERE config_key='p3_betr_wait'", ("true" if en else "false",))

        set_betr(True)
        S.inproc("ARM", "ARM A - scorer, Betr ON", "nba/score_board_legs.py", env={"BS_ASOF": D})
        with S.Shared.lock:
            S.Shared.real.execute("CREATE TEMP TABLE arm_a AS SELECT * FROM nba_score.board_scored WHERE game_date=%s", (D,))
            out["arm_a_per_app"] = dict(S.Shared.real.execute("SELECT app, count(*) FROM arm_a GROUP BY 1 ORDER BY 1").fetchall())
            S.Shared.real.execute("DELETE FROM nba_score.board_scored WHERE game_date=%s", (D,))
        set_betr(False)
        S.inproc("ARM", "ARM B - scorer, Betr PARKED", "nba/score_board_legs.py", env={"BS_ASOF": D})
        with S.Shared.lock:
            r = S.Shared.real
            out["arm_b_per_app"] = dict(r.execute("SELECT app, count(*) FROM nba_score.board_scored WHERE game_date=%s GROUP BY 1 ORDER BY 1", (D,)).fetchall())
            out["effect_on_other_apps"] = [[str(x) for x in c] for c in r.execute("""SELECT a.app, count(*) legs,
                count(*) FILTER (WHERE abs(a.confidence-b.confidence)>1e-9) conf_changed,
                count(*) FILTER (WHERE abs(a.score-b.score)>1e-9) score_changed,
                count(*) FILTER (WHERE abs(a.final_hp-b.final_hp)>1e-9) hp_changed,
                round(avg(abs(a.confidence-b.confidence))::numeric,5) mean_abs_conf,
                round(avg(abs(a.score-b.score))::numeric,4) mean_abs_score,
                round(max(abs(a.score-b.score))::numeric,3) max_abs_score
              FROM arm_a a JOIN nba_score.board_scored b ON b.game_date=a.game_date AND b.app=a.app AND b.player_id=a.player_id AND b.prop=a.prop AND b.line=a.line AND b.side=a.side
              WHERE a.app<>'betr' GROUP BY 1 ORDER BY 1""").fetchall()]
            out["betr_legs_by_prop"] = dict(r.execute("SELECT prop, count(*) FROM arm_a WHERE app='betr' GROUP BY 1 ORDER BY 2 DESC").fetchall())
            q = "SELECT count(*), round(avg(confidence)::numeric,4), round(avg(score)::numeric,2), round(avg(final_hp)::numeric,4), round(avg(edge)::numeric,4) FROM arm_a WHERE app=%s"
            out["betr_n_conf_score_hp_edge"] = [str(x) for x in r.execute(q, ("betr",)).fetchone()]
            out["pp_n_conf_score_hp_edge"] = [str(x) for x in r.execute(q, ("prizepicks",)).fetchone()]
            out["betr_vs_pp_same_leg_n_mean_abs_hp_diff"] = [str(x) for x in r.execute("""SELECT count(*), round(avg(abs(b.final_hp-p.final_hp))::numeric,5)
              FROM arm_a b JOIN arm_a p ON p.player_id=b.player_id AND p.prop=b.prop AND p.line=b.line AND p.side=b.side AND p.app='prizepicks' WHERE b.app='betr'""").fetchone()]
    finally:
        try:
            S.Shared.real.rollback()
        except Exception:  # noqa: BLE001
            pass
        S.Shared.real.close()
        psycopg.connect = S.REAL_CONNECT
        with S.REAL_CONNECT(URL, autocommit=True) as v:
            after = {t: v.execute(f"SELECT count(*) FROM {t} WHERE game_date=%s", (D,)).fetchone()[0]
                     for t in ("nba_score.baseline_history", "nba_score.final_hp", "nba_score.board_scored", "nba_score.live_slips")}
            after["board_snapshots_window"] = v.execute("SELECT count(*) FROM nba_market.board_snapshots WHERE game_date=%s AND snapshot_label='window'", (D,)).fetchone()[0]
            after["betr_enabled"] = v.execute("SELECT config_json->>'enabled' FROM nba_config.classification_config WHERE config_key='p3_betr_wait'").fetchone()[0]
        out["production_after"] = after
        print("PRODUCTION AFTER ROLLBACK", json.dumps(after), flush=True)
    out["steps"] = S.RESULTS
    out["wall_s"] = round(time.time() - t_all)
    Path("sim_betr_ab_result.json").write_text(json.dumps(out, indent=1, default=str))
    print("BETR_AB_RESULT|" + json.dumps({k: v for k, v in out.items() if k != "steps"}, default=str), flush=True)
    if any(v for k, v in after.items() if k != "betr_enabled") or after["betr_enabled"] != "false":
        raise SystemExit("PRODUCTION WAS TOUCHED")


if __name__ == "__main__":
    main()
