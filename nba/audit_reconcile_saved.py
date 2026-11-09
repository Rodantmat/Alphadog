#!/usr/bin/env python3
"""
GRADE WHAT WAS SAVED (owner 2026-11-09: a Fliff slip placed with Bam Adebayo was graded with Derrick White, because the Slips screen swaps a leg
and Save stores the slip AS SHOWN in nba_score.ui_saved_slips, while every grader reads the originally generated live_* slip).

Before the graders run, every still-ungraded owner slip of UD / Sleeper / Betr / Fliff is compared to the slip saved for the same day and app
(best leg overlap).  If the saved slip differs, the live row's legs are replaced by the saved legs (unchanged legs keep the live dict untouched).
Safety: a saved slip is applied only if every leg has a player_id and a prop the box-score grader can score; otherwise the live row is left
alone and RECONCILE|UNGRADABLE is printed.  Idempotent.  RC_MODE=report (default) prints only; RC_MODE=apply writes.
"""
import json, os, re, sys, datetime as dt
from zoneinfo import ZoneInfo
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_final_strategies as AF  # noqa: E402

PT = ZoneInfo("America/Los_Angeles")
APPS = (("underdog", "ud_live_slips", "composition"), ("sleeper", "sleeper_live_slips", "strategy"), ("betr", "betr_live_slips", "strategy"), ("fliff", "fliff_live_slips", "strategy"))


def jl(x):
    return x if isinstance(x, list) else json.loads(x)


def side_of(s):
    s = (s or "").lower()
    return "Over" if s in ("more", "over", "o", "higher") else "Under" if s in ("less", "under", "u", "lower") else None


def key(l):
    pid = l.get("player_id") or l.get("mlb_player_id")
    prop = l.get("prop") or l.get("canonical_prop_key")
    sd = side_of(l.get("side") or l.get("selected_side"))
    ln = l.get("line") if l.get("line") is not None else l.get("line_value")
    return (str(pid), str(prop), sd, round(float(ln), 2))


def convert(sl):
    """saved (as-shown) leg -> live leg dict"""
    f = sl.get("leg_factor") if sl.get("leg_factor") is not None else sl.get("app_multiplier")
    return {"player": sl.get("player_name"), "player_id": str(sl.get("player_id") or sl.get("mlb_player_id")),
            "prop": sl.get("canonical_prop_key"), "side": side_of(sl.get("selected_side")), "line": float(sl.get("line_value")),
            "factor": float(f) if f is not None else 1.0, "team": sl.get("team_id"), "event_id": sl.get("game_pk"),
            "matchup": sl.get("game_label"), "tier": sl.get("tier") or "R", "from_saved": True}


def main():
    apply = (os.environ.get("RC_MODE") or "report") == "apply"
    regrade = os.environ.get("RC_REGRADE") == "1"     # also fix ALREADY-GRADED rows: legs rewritten, graded_at cleared, the graders then regrade them
    frm = os.environ.get("RC_FROM") or (dt.datetime.now(PT).date() - dt.timedelta(days=10)).isoformat()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    saved = {}
    for d, sk, strat, legs in conn.execute("SELECT slate_date, source_key, strategy, legs_json FROM nba_score.ui_saved_slips WHERE slate_date >= %s", (frm,)).fetchall():
        saved.setdefault((str(d), sk), []).append((strat, jl(legs)))
    n_ok = n_fix = n_skip = n_nosave = 0
    for app, tbl, scol in APPS:
        has_k = True
        rows = conn.execute(f"SELECT game_date, {scol}, coalesce(k,1), legs_json FROM nba_score.{tbl} WHERE game_date >= %s AND (graded_at IS NULL OR {'TRUE' if regrade else 'FALSE'}) AND status='live' ORDER BY 1,2,3", (frm,)).fetchall()
        used = set()
        for d, strat, k, legs in rows:
            d = str(d); live = jl(legs); lk = {key(l) for l in live}
            best = None
            for i, (ss, sl) in enumerate(saved.get((d, app), [])):
                if (d, app, i) in used:
                    continue
                try:
                    sk = {key(l) for l in sl}
                except Exception:  # noqa: BLE001
                    continue
                sc = (len(lk & sk), -abs(len(sk) - len(lk)))
                if best is None or sc > best[0]:
                    best = (sc, i, ss, sl, sk)
            if best is None or best[0][0] == 0:
                n_nosave += 1; print(f"RECONCILE|{d} {app} {strat} k{k}: no saved slip resembles it - left as generated"); continue
            _, i, ss, sl, sk = best; used.add((d, app, i))
            if sk == lk and len(sl) == len(live):
                n_ok += 1; continue
            bad = [l for l in sl if not l.get("player_id") and not l.get("mlb_player_id") or (l.get("canonical_prop_key") not in AF.STAT)]
            if bad:
                n_skip += 1
                print(f"RECONCILE|UNGRADABLE {d} {app} {strat}: saved slip has legs the box-score grader cannot score ({', '.join((b.get('player_name') or '?') + ' ' + str(b.get('canonical_prop_key')) for b in bad)}) - left as generated, CHECK BY HAND")
                continue
            by = {key(l): l for l in live}
            new = [by.get(key(l)) or convert(l) for l in sl]
            gone = [f"{l.get('player')} {l.get('prop')} {l.get('side')} {l.get('line')}" for l in live if key(l) not in sk]
            came = [f"{l.get('player')} {l.get('prop')} {l.get('side')} {l.get('line')}" for l in new if l.get("from_saved")]
            n_fix += 1
            print(f"RECONCILE|{'FIX' if apply else 'WOULD-FIX'} {d} {app} {strat} k{k}: {len(live)}->{len(new)} legs | out: {gone} | in: {came}")
            if apply:
                extra = ", size = %s" if app in ("betr", "fliff") else ""
                args = [json.dumps(new)] + ([len(new)] if extra else []) + [d, strat, k]
                conn.execute(f"UPDATE nba_score.{tbl} SET legs_json = %s{extra}{', graded_at = NULL' if regrade else ''} WHERE game_date = %s AND {scol} = %s AND coalesce(k,1) = %s{'' if regrade else ' AND graded_at IS NULL'}", args)
    if apply:
        conn.commit()
    print(f"RECONCILE|summary: {n_ok} identical, {n_fix} {'fixed' if apply else 'would fix'}, {n_skip} ungradable-left-alone, {n_nosave} with no saved slip")


main()
