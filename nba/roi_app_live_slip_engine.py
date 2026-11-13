#!/usr/bin/env python3
"""
ROI-CANDIDATE LIVE SLIPS FOR SLEEPER AND FLIFF (owner 2026-11-11 20:54 PT: "Sleeper deploy all I recommend ... Fliff, all in exactly the way you said").
Candidate tables: research_roi_final_candidates.py (runs 43156304075 Sleeper, 43156307025 Fliff); sweeps research_roi_slip_sweep_apps.py (SW_CAL=logit).
Each rule = (rank key, line kinds, ROI filter, side, pool top-N, picks k, structure). Slips are the disjoint groups cut from the top-N of the day's ranked
legs (one pick per player and per game), N // k slips a slate, exactly as the research cut them. Slips go into the app's own live table
(nba_score.sleeper_live_slips / nba_score.fliff_live_slips) under their own strategy names, so the Slips screen, grading (P2A) and records already handle them.
Leg hit probability for the new score: final_hp recalibrated per app by a logistic fit on the 2024-25 + 2025-26 modelled boards
(hit ~ logit(final_hp) + logit(1/multiplier) + side + interaction; coefficients below), ROI = p x multiplier - 1, floor ROI with the standard error,
score_roi = .55 x certified final score + .45 x profit(ROI). The certified score, final_hp, thresholds and every other slip rule are untouched
(the new score is used ONLY to rank these slips). Gate: classification_config['roi_live'] {enabled, play, rules: {sleeper: [...], fliff: [...]}}.
Env: DATABASE_URL, RA_APP = sleeper | fliff | both, RA_DATE (default today PT), RA_DRY = 1 prints and writes nothing.
"""
import datetime as dt
import json
import math
import os
import sys
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_sleeper_fliff as SF            # noqa: E402
import sleeper_live_slip_engine as SL               # noqa: E402

PT = ZoneInfo("America/Los_Angeles")
BOARD_SQL = SF.BOARD_SQL.replace("f.final_hp::float\nFROM", "f.final_hp::float, f.score::float\nFROM")
assert BOARD_SQL != SF.BOARD_SQL
COEF = {"sleeper": [-0.116, 0.506, 0.655, -0.055, -0.024], "fliff": [-0.064, 0.496, 0.611, -0.071, -0.030]}
KS_W, BASE, SLOPE, FS, MODEL_SD, Z, N_CAL = .45, 60.0, 300.0, .3, .02, 1.28, 20000
KINDS = {"main": {"main"}, "alt": {"alt"}, "all": {"main", "alt"}}
ROIMIN = {"none": None, "pos": 0.0, "5pct": .05}
# name: (rank key, kinds, roi filter, side, pool N, picks k, structure)
RULES = {
    "sleeper": {
        "S_C_5flex_U20": ("score_cert", "main", "none", "under", 20, 5, "flex"),
        "S_B_5flex_R5": ("score_roi", "all", "5pct", "both", 15, 5, "flex"),
        "S_F_3flex_R10": ("score_roi", "main", "none", "both", 10, 3, "flex"),
        "S_D_6flex_U30": ("hp", "main", "none", "under", 30, 6, "flex"),
    },
    "fliff": {
        "F_A_5max_R15": ("score_roi", "main", "none", "both", 15, 5, "max"),
        "F_C_5max_U20": ("score_cert", "main", "none", "under", 20, 5, "max"),
        "F_E_3max_P10": ("hp", "main", "none", "both", 10, 3, "max"),
    },
}
TABLE = {"sleeper": "nba_score.sleeper_live_slips", "fliff": "nba_score.fliff_live_slips"}


def log(m):
    print(m, flush=True)


def floor2(x):
    return int(x * 100 + 1e-6) / 100.0


def load_legs(conn, day, app):
    names = {r[0]: r[1] for r in conn.execute("""SELECT DISTINCT ON (nba_ref.norm_name(player)) nba_ref.norm_name(player), player
                                                  FROM nba_market.board_snapshots WHERE game_date = %s AND bookmaker = %s AND snapshot_label = 'window'
                                                  ORDER BY nba_ref.norm_name(player), snapshot_ts DESC""", (day, app)).fetchall()}
    by = {}
    for bk, pn, pid, mk, side, line, price, mult, ev, p, sc in conn.execute(BOARD_SQL, (day, [app], SF.MKALL, day)).fetchall():
        d = SF.dec(price, mult)
        if d is None or d <= 1.0 or p is None:
            continue
        key = (pid, SF.MK[mk.replace("_alternate", "")], side, line)
        kind = "alt" if mk.endswith("_alternate") else "main"
        cur = by.get(key)
        if cur is None or d < cur["m"]:
            by[key] = {"player": names.get(pn) or pn, "player_id": pid, "prop": key[1], "side": side, "line": line, "m": d, "kind": kind,
                       "event_id": ev, "p": float(p), "score": None if sc is None else float(sc)}
    return list(by.values())


def score_legs(legs, app):
    df = pd.DataFrame(legs)
    if df.empty:
        return df
    df["over"] = df["side"].str.lower().str[0].isin(["o", "m", "h"])
    hp = np.clip(df["p"].values, .02, .98); bec = np.clip(1.0 / df["m"].values, .02, .98)
    lh = np.log(hp / (1 - hp)); lb = np.log(bec / (1 - bec))
    X = np.column_stack([np.ones(len(df)), lh, lb, df["over"].values.astype(float), lh * lb])
    p = np.clip(1 / (1 + np.exp(-np.clip(X @ np.array(COEF[app]), -30, 30))), .005, .995)
    be = 1.0 / df["m"].values
    se = np.sqrt(p * (1 - p) / (N_CAL + 30) + MODEL_SD ** 2 * 0.8)
    df["be"] = be; df["roi"] = p / be - 1; df["roi_lo"] = (p - Z * se) / be - 1
    df = df[df["be"] >= .12].copy()
    prof = np.clip(BASE + SLOPE * ((1 - FS) * df["roi"] + FS * df["roi_lo"]), 0, 100)
    sc = df["score"].fillna(df["score"].median() if df["score"].notna().any() else 50.0).values
    df["score_cert"] = sc; df["score_roi"] = (1 - KS_W) * sc + KS_W * prof; df["hp"] = df["p"]
    return df


def top_legs(df, rule):
    key, kinds, roimin, side, _n, _k, _s = rule
    d = df[df["kind"].isin(KINDS[kinds])]
    if ROIMIN[roimin] is not None:
        d = d[d["roi"] > ROIMIN[roimin]]
    if side == "under":
        d = d[~d["over"]]
    elif side == "over":
        d = d[d["over"]]
    return d.sort_values([key, "player", "prop", "line"], ascending=[False, True, True, True]).head(30).to_dict("records")   # ties (many legs share a final_hp) break the same way every run


def groups(legs, N, k):
    legs = legs[:N]
    if len(legs) < k:
        return []
    out, used = [], set()
    for _ in range(max(1, N // k)):
        pick, pl, ev = [], set(), set()
        for i, l in enumerate(legs):
            if i in used or l["player"] in pl or l["event_id"] in ev:
                continue
            pick.append(i); pl.add(l["player"]); ev.add(l["event_id"])
            if len(pick) == k:
                break
        if len(pick) < k:
            break
        used.update(pick); out.append([legs[i] for i in pick])
    return out


TOPS = {}      # (app, rule name) -> the rule's ranked candidate list of the day (for the next-ranked substitutes)


def build(conn, day, app, only=None):
    legs = load_legs(conn, day, app)
    if not legs:
        return {}, f"{app}: no window board with final_hp for {day}"
    df = score_legs(legs, app)
    tm = SL.teams_of(conn, {str(x["player_id"]) for x in legs}, day)
    out = {}
    for name, rule in RULES[app].items():
        if only is not None and name not in only:
            continue
        top = top_legs(df, rule)
        sl = groups(top, rule[4], rule[5])
        for s in sl:
            for l in s:
                l["team"] = tm.get(str(l["player_id"]))
        TOPS[(app, name)] = top
        out[name] = (rule, sl)
    return out, f"{app}: {len(legs)} legs with final_hp, {len(df)} scored"


def insert(conn, app, day, name, rule, k, s, pr):
    size, structure = rule[5], rule[6]
    ms = [float(l["m"]) for l in s]
    lj = [{"player": l["player"], "player_id": l["player_id"], "prop": l["prop"], "side": l["side"], "line": l["line"], "factor": l["m"],
           "p": round(l["p"], 4), "team": l.get("team"), "event_id": l["event_id"], "tier": "R", "kind": l["kind"],
           "roi": round(float(l["roi"]), 4), "score_roi": round(float(l["score_roi"]), 2)} for l in s]
    if app == "fliff":   # owner 2026-11-13 13:46 PT: the Slips screen finds a Fliff leg by its game (matchup); legs stored without it were all shown OFF BOARD
        mu = {r[0]: r[1] for r in conn.execute("""SELECT DISTINCT ON (nba_ref.norm_name(player)) nba_ref.norm_name(player), matchup FROM nba_market.fliff_pickem_board
                                                  WHERE game_date = %s AND snapshot_ts = (SELECT max(snapshot_ts) FROM nba_market.fliff_pickem_board WHERE game_date = %s)
                                                  ORDER BY nba_ref.norm_name(player)""", (day, day)).fetchall()}
        for l_ in lj:
            m_ = mu.get(conn.execute("SELECT nba_ref.norm_name(%s)", (l_["player"],)).fetchone()[0])
            if m_:
                l_["matchup"] = m_
    if app == "sleeper":
        tiers = SL.flex_tiers(ms, pr[1], pr[2])
        model, extra = tiers[size], json.dumps(tiers)
        conn.execute("""INSERT INTO nba_score.sleeper_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier, flex_tiers)
                        VALUES (%s,%s,%s,%s,%s,%s,1,'live',%s,%s)
                        ON CONFLICT (game_date, strategy, k) DO UPDATE SET legs_json = EXCLUDED.legs_json, status = EXCLUDED.status,
                          model_multiplier = EXCLUDED.model_multiplier, flex_tiers = EXCLUDED.flex_tiers, built_at = now()
                        WHERE nba_score.sleeper_live_slips.graded_at IS NULL""", (day, name, size, structure, k, json.dumps(lj), round(model, 4), extra))
    else:
        model = floor2(math.prod(ms))
        conn.execute("""INSERT INTO nba_score.fliff_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier)
                        VALUES (%s,%s,%s,%s,%s,%s,1,'live',%s)
                        ON CONFLICT (game_date, strategy, k) DO UPDATE SET legs_json = EXCLUDED.legs_json, status = EXCLUDED.status,
                          model_multiplier = EXCLUDED.model_multiplier, built_at = now()
                        WHERE nba_score.fliff_live_slips.graded_at IS NULL""", (day, name, size, structure, k, json.dumps(lj), round(model, 4)))
    return model


def pick(conn, day, apps, dry=False):
    row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = 'roi_live'").fetchone()
    c = (row[0] if isinstance(row[0], dict) else json.loads(row[0])) if row else {}
    if not c.get("enabled") and not dry:
        log(f"ROI_LIVE|disabled (classification_config roi_live.enabled) - nothing built for {day}")
        return {}
    pr = SL.pricing(conn)
    got = {}
    for app in apps:
        only = set((c.get("rules") or {}).get(app) or RULES[app])
        out, note = build(conn, day, app, only if not dry else None)
        log(f"ROI_LIVE|{day} {note}")
        for name, (rule, sl) in out.items():
            got[name] = sl
            if not sl:
                log(f"ROI_LIVE|{day} {name}: not enough qualifying legs - no slip")
            if sl and not dry:      # owner 2026-11-12: the rule's ranked candidates (the slips' own players left out) for "sub the next ranked candidate"
                try:
                    import next_legs_store as NL
                    on_slips = {l["player"] for s_ in sl for l in s_}
                    for k_ in range(1, len(sl) + 1):
                        NL.store(conn, day, name, k_, [dict(l) for l in TOPS.get((app, name), [])], exclude_players=on_slips)
                except Exception as e:  # noqa: BLE001
                    log(f"ROI_LIVE|{day} {name}: next-ranked list not stored ({e})")
            for k, s in enumerate(sl, start=1):
                model = insert(conn, app, day, name, rule, k, s, pr) if not dry else float("nan")
                log(f"ROI_LIVE|{day} {name} k{k} ({rule[5]}-pick {rule[6]}, model {model:.3f}x): " + "; ".join(
                    f"{l['player']} {l['prop']} {l['side']} {l['line']:g} x{l['m']:.2f} (hp {100 * l['p']:.0f}%)" for l in s))
    if not dry:
        conn.commit()
    return got


def main():
    app = (os.environ.get("RA_APP") or "both").lower()
    apps = ["sleeper", "fliff"] if app == "both" else [app]
    ds = (os.environ.get("RA_DATE") or "").strip()
    day = dt.date.fromisoformat(ds) if ds else dt.datetime.now(PT).date()
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        pick(conn, day, apps, dry=os.environ.get("RA_DRY") == "1")


if __name__ == "__main__":
    main()
