#!/usr/bin/env python3
"""FLIFF PROBE - PICK'EM PAIRINGS (NBA; owner 2026-10-20 23:49 PT: "multiple pairings each time I call you to run - the near lock
pairing and the good picks - from the ParlayAPI game odds and prop odds and the Fliff data", 23:51: "NBA is enough ... it needs to
get all the ladder").

SEPARATE STRUCTURE: lives in fliff_probe/, writes only fliff_probe/out/, reads only the credential row in Postgres.

DATA
 Fliff Pick'Em = the "skipper" feed (request classes read from Fliff's own web bundle, out/discovery_bundle.json; verified live
 2026-10-21 00:10 PT, out/discovery_skipper.json):
   GetLeagues -> GetGames {filter:{league}} -> GetPropCategories {filter:{league,games,in_play}} ->
   GetCards {filter:{league,games,prop_categories}} -> GetAltCards {skipper_area_key = card.betting_options.skipper_area_key}
   = the FULL LADDER (every rung, both sides; option_type 0 = Over, 1 = Under - proposal 4229594 'Paolo Banchero Over 22.5').
   H2H Combo 'Full Game' cards carry the MONEYLINE proposals (4229840/4229841): option_type 2 = home, 3 = away.
   Pick'Em rules (getfliff.com/fliff-superstars-contest-rules): min 2 picks from >= 2 teams; contest multiplier = product of the
   selection multipliers (owner's slip: 1.25 x 1.00 = 1.25); a void in a 2-pick refunds the entry.
 Sharp market = ParlayAPI, one read per book (3 credits each; the full read truncates - nba/capture_parlay_props.py 10-19):
   pinnacle (two-sided player_points / rebounds / assists / threes_made), fanduel (over-only ladder 'To Score 10+ Points', line 0
   -> Over 9.5), draftkings (*_milestones, over-only), plus game h2h (Pinnacle no-vig) for the H2H cards.

PRICING (conservative - owner rule 2026-09-21: derived lines graded conservatively, real lines untouched)
 Anchors per (player, stat): (line, lo, hi) bounds on P(stat > line).
   Pinnacle two-sided -> no-vig point estimate (lo = hi = p).
   One-sided over price q = 1/decimal -> lo = min(q - 0.03, q / 1.06) (the harsher haircut), hi = q (vig only inflates q).
 A Fliff rung at line L is priced at a LOWER BOUND of its true probability (see price_rung):
   monotone bounds (P(X > L) falls as L rises) + chords between bracketing anchors where the curve is provably concave
   (Over: harder anchor's lower bound >= 0.65, left of the mode; Under: easier anchor's upper bound <= 0.5, right of the median).
   Nothing is extrapolated; an unbracketed side gets no price and is never used.
 CERTIFIED 2026-10-21 (local fuzz, 534k rungs on normal / gamma / negative-binomial stats with 0-6% book vig): 0 ladder-order
 violations, never above the true probability. The live run re-checks ladder order on every run and fails if it breaks.
PAIRING
 near-lock: fair >= NEAR_P (0.90); good: GOOD_P_MIN (0.60) <= fair < NEAR_P with multiplier in [GOOD_M_MIN, GOOD_M_MAX].
 pair = near-lock x good, different games, slip multiplier in [SLIP_MIN, SLIP_MAX], joint p >= JOINT_MIN.
 Play-through credit per $1 = min(1, m - 1) (Fliff: lesser of risk and potential net win). Rank by cost per $1 cleared
 = -EV / min(1, m - 1); each leg used at most LEG_REUSE times.
ENV: DATABASE_URL, PROXY_URL, PROBE_HOURS (24), plus the tunables below as env overrides.
"""
import json
import os
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import product
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

OUT = HERE / "out"
PT = ZoneInfo("America/Los_Angeles")
NOW = datetime.now(timezone.utc)


def envf(k, d):
    try:
        return float(os.environ.get(k, d))
    except ValueError:
        return d


HOURS = envf("PROBE_HOURS", 24)
NEAR_P = envf("NEAR_P", 0.90)
GOOD_P_MIN = envf("GOOD_P_MIN", 0.60)
GOOD_M_MIN, GOOD_M_MAX = envf("GOOD_M_MIN", 1.12), envf("GOOD_M_MAX", 1.70)
NEAR_M_MIN = envf("NEAR_M_MIN", 1.02)
SLIP_MIN, SLIP_MAX = envf("SLIP_MIN", 1.20), envf("SLIP_MAX", 1.45)
JOINT_MIN = envf("JOINT_MIN", 0.70)
ALT_ADD = envf("ALT_ADD", 0.03)          # one-sided over price q -> lower bound min(q - ALT_ADD, q / (1 + ALT_PROP)): the HARSHER haircut
ALT_PROP = envf("ALT_PROP", 0.06)        # (fuzz 2026-10-21: the milder one sat above truth on 2.5% of rungs when the vig is proportional)
LEG_REUSE = int(envf("LEG_REUSE", 2))
CHORD_OVER_MIN = envf("CHORD_OVER_MIN", 0.65)
N_PAIRS = int(envf("N_PAIRS", 12))
TIME_BUDGET_S = envf("TIME_BUDGET_S", 900)
# SAFE MODE (owner 2026-10-22 09:15 PT after both 10-21 slips lost on their 3PM 'good pick' legs: "it needs to be safer, even if
# it's doing less"). Default mode. Both legs near-locks, stable stats only, price confirmed by >= 2 books (or Pinnacle two-sided),
# never a single-book interpolation, no overs in projected blowouts, one slip per game, small flat stake.
MODE = (os.environ.get("PROBE_MODE") or "safe").lower()
SAFE_LEG_P = envf("SAFE_LEG_P", 0.93)
SAFE_JOINT_MIN = envf("SAFE_JOINT_MIN", 0.87)
SAFE_SLIP_MIN = envf("SAFE_SLIP_MIN", 1.05)
SAFE_STATS = {"pts", "reb", "ast", "pra", "pr", "pa", "ra"}     # no 3PM / steals / blocks: too few events, too much variance
BLOWOUT_FAV_P = envf("BLOWOUT_FAV_P", 0.78)                      # Pinnacle no-vig favorite >= 78% -> skip Overs in that game
SAFE_MAX_PAIRS = int(envf("SAFE_MAX_PAIRS", 3))
STAKE_PCT = envf("STAKE_PCT", 0.05)

NBA_LEAGUE = "fkey__sk_league__461"
H2H_CAT_NAME = "H2H Combo"
# Fliff Pick'Em category name -> internal stat key (names from the app's market menu, 2026-10-20 23:37 PT screenshots)
CAT_STAT = {"Points": "pts", "Rebounds": "reb", "Assists": "ast", "3pt Made": "3pm", "Pts + Reb + Ast": "pra", "Pts + Reb": "pr",
            "Pts + Ast": "pa", "Reb + Ast": "ra", "Steals": "stl", "Blocked Shots": "blk", "Stl + Blk": "stocks"}
# ParlayAPI market_key -> stat key (full game only; '___1st_quarter' etc. are excluded by the period filter)
PARLAY_STAT = {"player_points": "pts", "player_rebounds": "reb", "player_assists": "ast", "player_threes_made": "3pm", "player_threes": "3pm",
               "player_points_milestones": "pts", "player_rebounds_milestones": "reb", "player_assists_milestones": "ast",
               "player_three_pointers_made_milestones": "3pm", "player_points_+_rebounds_milestones": "pr",
               "player_points_+_rebounds_+_assists_milestones": "pra", "player_points_+_assists_milestones": "pa",
               "player_rebounds_+_assists_milestones": "ra", "player_steals_milestones": "stl", "player_blocks_milestones": "blk",
               "player_points_rebounds_assists": "pra", "player_points_rebounds": "pr", "player_points_assists": "pa",
               "player_rebounds_assists": "ra", "player_steals": "stl", "player_blocks": "blk"}
TEAM_SUFFIX = re.compile(r"\s*\([A-Z]{2,4}\)\s*$")


# ------------------------------------------------------------------ helpers
def norm_name(s):
    s = TEAM_SUFFIX.sub("", str(s or ""))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[.'`]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def am_to_dec(a):
    try:
        a = float(a)
    except (TypeError, ValueError):
        return None
    if a == 0:
        return None
    return 1 + (a / 100.0 if a > 0 else 100.0 / -a)


def pt(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone(PT).strftime("%a %m-%d %I:%M %p") if ms else ""


def parlay_line(row):
    """Over line of a ParlayAPI prop row. line > 0 -> itself; line 0 with 'N+' in the market text ('To Score 10+ Points') -> N - 0.5."""
    try:
        ln = float(row.get("line"))
    except (TypeError, ValueError):
        ln = 0.0
    if ln > 0:
        return ln
    m = re.search(r"(\d+)\s*\+", str(row.get("market") or ""))
    return float(m.group(1)) - 0.5 if m else None


# ------------------------------------------------------------------ pricing
def build_anchors(rows):
    """ParlayAPI rows -> {(player_norm, stat): [ {line, lo, hi, src, t} ]} and a log Counter."""
    anchors, log = defaultdict(list), Counter()
    for r in rows:
        mk = str(r.get("market_key") or "").lower()
        stat = PARLAY_STAT.get(mk)
        per = str(r.get("period") or "FULL").upper()
        if not stat or per not in ("FULL", "GAME", "") or "quarter" in mk or "half" in mk:
            log["skip_market"] += 1
            continue
        if r.get("is_dfs_flat_payout"):
            log["skip_dfs"] += 1
            continue
        pl = str(r.get("player") or "")
        if not pl or "@" in pl:
            log["skip_not_player"] += 1
            continue
        line = parlay_line(r)
        if line is None or line <= 0:
            log["skip_no_line"] += 1
            continue
        od, ud = am_to_dec(r.get("over_price")), am_to_dec(r.get("under_price"))
        book = str(r.get("bookmaker") or "").lower()
        key = (norm_name(pl), stat)
        if od and ud:
            p = (1 / od) / (1 / od + 1 / ud)
            anchors[key].append({"line": line, "lo": p, "hi": p, "src": f"{book}:2way", "t": r.get("commence_time")})
            log["two_sided"] += 1
        elif od:
            q = 1 / od
            anchors[key].append({"line": line, "lo": min(q - ALT_ADD, q / (1 + ALT_PROP)), "hi": min(1.0, q), "src": f"{book}:over", "t": r.get("commence_time")})
            log["over_only"] += 1
        else:
            log["skip_no_price"] += 1
    return anchors, log


def _chord(x1, y1, x2, y2, x):
    return y1 if x2 == x1 else y1 + (y2 - y1) * (x - x1) / (x2 - x1)


def price_rung(anchors, line, side):
    """-> (fair, how) or (None, reason). Every value is a LOWER BOUND on the true probability, monotone in the line.
    Bounds: A(L) = max lo over anchors with line >= L (lower bound on P(X > L)); U(L) = min hi over anchors with line <= L (upper).
    Concavity (unimodal stat; NBA counting stats are right-skewed): left of the mode S(L) = P(X > L) is concave, so the chord between
    the LOWER bounds of the two bracketing anchors is still a lower bound of S - used only when the harder anchor's lower bound is
    >= CHORD_OVER_MIN (0.65), safely left of the mode; right of the median (hence of the mode) 1 - S is concave - used only when the
    easier anchor's upper bound is <= 0.5. Each side takes the tighter of its valid lower bounds, then is capped so it never
    exceeds the opposite side's bound (Over <= U, Under <= 1 - A)."""
    if not anchors:
        return None, "no anchors"
    harder = [a for a in anchors if a["line"] >= line]
    easier = [a for a in anchors if a["line"] <= line]
    A = max((a["lo"] for a in harder), default=None)
    U = min((a["hi"] for a in easier), default=None)
    exact = any(a["line"] == line and a["lo"] == a["hi"] for a in anchors)
    srcs = sorted({a["src"].split(":")[0] for a in harder + easier})
    tag = "exact" if exact else "bound"
    if side == "over":
        if A is None:
            return None, "unbracketed"
        lb = A
        if easier and harder:
            a1 = max(easier, key=lambda a: (a["line"], a["lo"]))   # nearest easier anchor
            a2 = min(harder, key=lambda a: (a["line"], -a["lo"]))  # nearest harder anchor
            if a2["lo"] >= CHORD_OVER_MIN:   # harder anchor's LOWER bound >= 0.65 -> safely left of the mode (right-skewed stats)
                ch = _chord(a1["line"], a1["lo"], a2["line"], a2["lo"], line)
                if ch > lb:
                    lb, tag = ch, ("exact" if exact else "interp")
        val = lb if U is None else min(lb, U)
        return val, f"{tag} " + "+".join(srcs)
    if U is None:
        return None, "unbracketed"
    lb = 1 - U
    if easier and harder:
        a1 = max(easier, key=lambda a: (a["line"], -a["hi"]))
        a2 = min(harder, key=lambda a: (a["line"], a["hi"]))
        if a1["hi"] <= 0.5:               # easier anchor's UPPER bound <= 0.5 -> right of the median, hence of the mode
            ch = _chord(a1["line"], 1 - a1["hi"], a2["line"], 1 - a2["hi"], line)
            if ch > lb:
                lb, tag = ch, ("exact" if exact else "interp")
    val = lb if A is None else min(lb, 1 - A)
    return val, f"{tag} " + "+".join(srcs)


def grade(p, m):
    ev = p * m - 1.0
    credit = min(1.0, m - 1.0)
    return ev, (-ev / credit) if credit > 0 else None


def build_pairs(legs):
    near = [l for l in legs if l["fair"] >= NEAR_P and l["m"] >= NEAR_M_MIN]
    good = [l for l in legs if GOOD_P_MIN <= l["fair"] < NEAR_P and GOOD_M_MIN <= l["m"] <= GOOD_M_MAX]
    cands = []
    for a, b in product(near, good):
        if a["game"] == b["game"] or a.get("player") == b.get("player") or (a.get("team") and a.get("team") == b.get("team")):
            continue
        m = round(a["m"] * b["m"], 4)
        if not (SLIP_MIN <= m <= SLIP_MAX):
            continue
        p = a["fair"] * b["fair"]
        if p < JOINT_MIN:
            continue
        ev, cost = grade(p, m)
        cands.append({"near": a, "good": b, "m": m, "p": round(p, 4), "ev": round(ev, 4), "clear_cost": None if cost is None else round(cost, 4)})
    cands.sort(key=lambda c: (c["clear_cost"] if c["clear_cost"] is not None else 9, -c["p"]))
    used, out = Counter(), []
    for c in cands:
        ka, kb = c["near"]["id"], c["good"]["id"]
        if used[ka] >= LEG_REUSE or used[kb] >= LEG_REUSE:
            continue
        used[ka] += 1
        used[kb] += 1
        out.append(c)
        if len(out) >= N_PAIRS:
            break
    return near, good, cands, out


def n_books(how):
    srcs = (how or "").split(" ", 1)[-1]
    return len([x for x in srcs.split("+") if x])


def safe_eligible(l, blowout_games):
    """-> (ok, reason). The SAFE MODE leg filter."""
    if l["kind"] != "prop":
        return False, "not a player prop"
    if l["stat"] not in SAFE_STATS:
        return False, f"stat {l['stat']} excluded"
    if l["fair"] < SAFE_LEG_P:
        return False, "below near-lock"
    how = l.get("how") or ""
    if how.startswith("interp"):
        return False, "interpolated price"
    if not ("pinnacle" in how or n_books(how) >= 2):
        return False, "single-book price"
    if l["side"] == "over" and l["game"] in blowout_games:
        return False, "over in projected blowout"
    return True, "ok"


def build_safe_pairs(legs, blowout_games):
    why = Counter()
    pool = []
    for l in legs:
        ok, r = safe_eligible(l, blowout_games)
        why[r] += 1
        if ok:
            pool.append(l)
    cands = []
    for i, a in enumerate(pool):
        for b in pool[i + 1:]:
            if a["game"] == b["game"] or a["player"] == b["player"] or (a.get("team") and a.get("team") == b.get("team")):
                continue
            m = round(a["m"] * b["m"], 4)
            p = a["fair"] * b["fair"]
            if m < SAFE_SLIP_MIN or p < SAFE_JOINT_MIN:
                continue
            ev, cost = grade(p, m)
            cands.append({"near": a, "good": b, "m": m, "p": round(p, 4), "ev": round(ev, 4), "clear_cost": None if cost is None else round(cost, 4)})
    # safest first, then cheapest per dollar cleared; every game appears in at most ONE slip (no shared-game risk)
    cands.sort(key=lambda c: (-round(c["p"], 2), c["clear_cost"] if c["clear_cost"] is not None else 9))
    used_games, out = set(), []
    for c in cands:
        gs = {c["near"]["game"], c["good"]["game"]}
        if gs & used_games:
            continue
        used_games |= gs
        out.append(c)
        if len(out) >= SAFE_MAX_PAIRS:
            break
    return pool, cands, out, why


def game_fav_p(ml_events, g):
    ph = h2h_fair(ml_events, g.get("home"), g["ms"])
    pa = h2h_fair(ml_events, g.get("away"), g["ms"])
    vals = [x for x in (ph, pa) if x is not None]
    return max(vals) if vals else None


# ------------------------------------------------------------------ Fliff Pick'Em fetch
class Skipper:
    def __init__(self):
        from fliff_client import FliffClient
        self.fc = FliffClient(proxy=os.environ.get("PROXY_URL", "").strip() or None)
        self.fc.ping()
        self.host = self.fc.ping_data.get("skipper_public_feed_endpoint")
        if not self.host:
            raise SystemExit("ping returned no skipper_public_feed_endpoint")
        self.calls = 0

    def req(self, cls, variables=None):
        obj = {"__object_class_name": cls}
        if variables is not None:
            obj["variables"] = variables
        self.calls += 1
        j = self.fc._post(self.host, obj)
        return ((j.get("result") or {}).get("response")) or {}


def find_name(o):
    """First plausible person name inside a render-data blob (keys 'name' / 'full_name' / 'display_name', not team/league)."""
    if isinstance(o, dict):
        for k in ("full_name", "name", "display_name", "player_name"):
            v = o.get(k)
            if isinstance(v, str) and v and " " in v:
                return v
        for k, v in o.items():
            if k in ("team", "league", "game_render_data"):
                continue
            r = find_name(v)
            if r:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find_name(v)
            if r:
                return r
    return None


def find_team(o):
    if isinstance(o, dict):
        t = o.get("team")
        if isinstance(t, dict):
            return t.get("abbreviation") or t.get("name")
        if isinstance(t, str):
            return t
        for v in o.values():
            r = find_team(v)
            if r:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find_team(v)
            if r:
                return r
    return None


def fetch_fliff(sk, want_players_by_stat, t_end, log):
    """-> (games, prop_legs, h2h_cards). Ladders only for players the sharp market prices (want_players_by_stat)."""
    games_resp = sk.req("FCM__Skipper_GetGames__Request", {"filter": {"league": NBA_LEAGUE}})
    games = []
    for g in ((games_resp.get("games") or {}).get("page") or []):
        grd = g.get("game_render_data") or g
        ms = grd.get("start_time_stamp_utc_millis") or g.get("start_time_stamp_utc_millis")
        gid = grd.get("id") or g.get("id")
        if not gid or not ms:
            continue
        if not (NOW.timestamp() * 1000 + 5 * 60 * 1000 <= ms <= NOW.timestamp() * 1000 + HOURS * 3600 * 1000):
            continue
        games.append({"id": gid, "ms": ms, "home": (grd.get("home_team") or {}).get("full_name"), "away": (grd.get("away_team") or {}).get("full_name"),
                      "home_abbr": (grd.get("home_team") or {}).get("abbreviation"), "away_abbr": (grd.get("away_team") or {}).get("abbreviation")})
    log["games"] = len(games)
    legs, h2h = [], []
    for g in sorted(games, key=lambda x: x["ms"]):
        if time.monotonic() > t_end:
            log["time_budget_hit"] = True
            break
        cats = sk.req("FCM__Skipper_GetPropCategories__Request", {"filter": {"league": NBA_LEAGUE, "games": [g["id"]], "in_play": False}})
        cat_ids = {c.get("name"): c.get("id") for c in ((cats.get("prop_categories") or {}).get("page") or [])}
        g["categories"] = sorted(cat_ids)
        for cname, cid in cat_ids.items():
            stat = CAT_STAT.get(cname)
            if cname != H2H_CAT_NAME and not stat:
                continue
            if time.monotonic() > t_end:
                log["time_budget_hit"] = True
                break
            cards = sk.req("FCM__Skipper_GetCards__Request", {"filter": {"league": NBA_LEAGUE, "games": [g["id"]], "prop_categories": [cid]}})
            for pk in cards.get("cards_packs") or []:
                for cd in pk.get("cards") or []:
                    bo = cd.get("betting_options") or {}
                    if cname == H2H_CAT_NAME:
                        if str(cd.get("card_name") or "") != "Full Game":
                            continue
                        for o in bo.get("options") or []:
                            side = {2: "home", 3: "away"}.get(o.get("option_type"))
                            if side and o.get("eu_odds"):
                                h2h.append({"game": g["id"], "side": side, "team": g[side], "m": float(o["eu_odds"]), "start": g["ms"],
                                            "proposal": o.get("proposal_fkey")})
                        continue
                    prd = cd.get("player_prop_render_data") or {}
                    player = find_name(prd) or ""
                    team = find_team(prd)
                    pn = norm_name(player)
                    log["prop_cards"] += 1
                    if pn not in want_players_by_stat.get(stat, set()):
                        log["prop_cards_no_market"] += 1
                        continue
                    key = bo.get("skipper_area_key") or cd.get("skipper_area_key")
                    try:
                        alt = sk.req("FCM__Skipper_GetAltCards__Request", {"skipper_area_key": key})
                        opts = ((alt.get("card") or {}).get("betting_options") or {}).get("options") or []
                        log["ladders"] += 1
                    except Exception:  # noqa: BLE001
                        log["ladder_errors"] += 1
                        opts = bo.get("options") or []
                    for o in opts:
                        side = {0: "over", 1: "under"}.get(o.get("option_type"))
                        if not side or not o.get("eu_odds") or o.get("status") not in (0, None):
                            continue
                        legs.append({"game": g["id"], "start": g["ms"], "matchup": f"{g['away_abbr']} @ {g['home_abbr']}", "player": player, "pn": pn,
                                     "team": team, "stat": stat, "cat": cname, "line": float(o.get("line")), "side": side,
                                     "m": float(o["eu_odds"]), "main": bool(o.get("is_main_line")), "proposal": o.get("proposal_fkey")})
                    time.sleep(0.12)
    return games, legs, h2h


# ------------------------------------------------------------------ ParlayAPI
def parlay_reads():
    import psycopg
    import requests
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        key = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='parlay_api_key'").fetchone()[0].strip()
    S = requests.Session()
    H = {"X-API-Key": key, "accept": "application/json", "User-Agent": "alphadog-fliff-probe"}
    rows, calls = [], []
    for book in ("pinnacle", "fanduel", "draftkings"):
        for attempt in range(3):
            try:
                r = S.get("https://parlay-api.com/v1/sports/basketball_nba/props", params={"bookmakers": book, "limit": 10000}, headers=H, timeout=180)
            except Exception as exc:  # noqa: BLE001
                calls.append({"book": book, "error": type(exc).__name__})
                time.sleep(3 * (attempt + 1))
                continue
            calls.append({"book": book, "http": r.status_code, "credits": r.headers.get("x-requests-last"), "remaining": r.headers.get("x-requests-remaining"),
                          "truncated": r.headers.get("x-result-truncated")})
            if r.status_code == 200:
                j = r.json()
                rows += j if isinstance(j, list) else (j.get("data") or [])
                break
            time.sleep(3 * (attempt + 1))
    ml = []
    try:
        r = S.get("https://parlay-api.com/v1/sports/basketball_nba/odds", params={"regions": "eu", "markets": "h2h", "oddsFormat": "decimal", "bookmakers": "pinnacle"},
                  headers=H, timeout=120)
        calls.append({"book": "pinnacle h2h", "http": r.status_code, "credits": r.headers.get("x-requests-last"), "remaining": r.headers.get("x-requests-remaining")})
        if r.status_code == 200 and isinstance(r.json(), list):
            ml = r.json()
    except Exception as exc:  # noqa: BLE001
        calls.append({"book": "pinnacle h2h", "error": type(exc).__name__})
    return rows, ml, calls


def h2h_fair(ml_events, team_full, start_ms):
    """Pinnacle no-vig moneyline for Fliff's team name ('ORL Magic') -> p or None."""
    nick = norm_name(team_full).split()[-1] if team_full else ""
    for e in ml_events:
        try:
            st = datetime.fromisoformat(str(e.get("commence_time")).replace("Z", "+00:00")).timestamp() * 1000
        except ValueError:
            continue
        if abs(st - start_ms) > 4 * 3600 * 1000:
            continue
        for b in e.get("bookmakers") or []:
            if b.get("key") != "pinnacle":
                continue
            for m in b.get("markets") or []:
                if m.get("key") != "h2h":
                    continue
                outs = m.get("outcomes") or []
                if len(outs) != 2:
                    continue
                inv = [1 / float(o["price"]) for o in outs]
                for o, iv in zip(outs, inv):
                    if nick and norm_name(o.get("name")).split()[-1] == nick:
                        return iv / sum(inv)
    return None


# ------------------------------------------------------------------ report
def leg_txt(l):
    if l["kind"] == "h2h":
        return f"{l['team']} H2H Combo (full game)"
    return f"{l['player']} {'Over' if l['side'] == 'over' else 'Under'} {l['line']:g} {l['cat']}"


def render(meta, near, good, pairs):
    def pc(x, s=False):
        return "" if x is None else (f"{x * 100:+.1f}%" if s else f"{x * 100:.1f}%")
    md = [f"# Fliff Pick'Em pairings — {meta['when']}", "",
          f"NBA games in window: {meta['games']} · ladders read: {meta['ladders']} · priced legs: {meta['priced']} · "
          f"near-locks: {len(near)} · good picks: {len(good)} · pairs shown: {len(pairs)}", "",
          "**How to read it.** *Fair* = conservative probability from Pinnacle / FanDuel / DraftKings (a lower bound when the exact line "
          "isn't priced). Each pair = 1 near-lock + 1 good pick from different games. *Counts* = play-through added per $100. "
          "*Cost per $1 cleared* = expected loss for each $1 of play-through (negative = expected profit). "
          "Multipliers move — check them in the app before submitting.", "",
          "## Pairings (cheapest safe clearing first)",
          "| # | Near-lock | x | Good pick | x | Slip | Win chance | Counts/$100 | Cost per $1 cleared |",
          "|---|---|---|---|---|---|---|---|---|"]
    for i, c in enumerate(pairs, 1):
        a, b = c["near"], c["good"]
        md.append(f"| {i} | {a['when']} {a['matchup']}: **{leg_txt(a)}** | {a['m']:.2f} | {b['when']} {b['matchup']}: **{leg_txt(b)}** | {b['m']:.2f} | "
                  f"{c['m']:.2f}x | {pc(c['p'])} | ${min(1, c['m'] - 1) * 100:.0f} | {pc(c['clear_cost'], True)} |")
    md += ["", "## Best near-locks (fair ≥ {:.0f}%)".format(NEAR_P * 100), "| Game | Leg | x | Fair | EV | Priced by |", "|---|---|---|---|---|---|"]
    for l in sorted(near, key=lambda l: -l["ev"])[:15]:
        md.append(f"| {l['when']} {l['matchup']} | {leg_txt(l)} | {l['m']:.2f} | {pc(l['fair'])} | {pc(l['ev'], True)} | {l['how']} |")
    md += ["", "## Best good picks (fair {:.0f}–{:.0f}%)".format(GOOD_P_MIN * 100, NEAR_P * 100), "| Game | Leg | x | Fair | EV | Priced by |", "|---|---|---|---|---|---|"]
    for l in sorted(good, key=lambda l: -l["ev"])[:15]:
        md.append(f"| {l['when']} {l['matchup']} | {leg_txt(l)} | {l['m']:.2f} | {pc(l['fair'])} | {pc(l['ev'], True)} | {l['how']} |")
    md += ["", "## Data checks"] + [f"- {x}" for x in meta["checks"]]
    return "\n".join(md)


def render_safe(meta, pool, pairs, why, blow):
    def pc(x):
        return "" if x is None else f"{x * 100:.1f}%"
    stake = meta.get("stake")
    md = [f"# Fliff Pick'Em SAFE pairings — {meta['when']}", "",
          f"NBA games in window: {meta['games']} · ladders read: {meta['ladders']} · priced legs: {meta['priced']} · "
          f"safe legs: {len(pool)} · safe slips: {len(pairs)}", "",
          "**Rules.** Both legs are near-locks (each ≥ {:.0f}% by a conservative estimate), points / rebounds / assists and their combos only "
          "(no threes, steals or blocks), each price confirmed by two sportsbooks or Pinnacle, no Overs in games projected as blowouts, "
          "every game used in only one slip. Stake: flat {:.0f}% of balance{}.".format(SAFE_LEG_P * 100, STAKE_PCT * 100,
                                                                                    f" (${stake})" if stake else ""), ""]
    if not pairs:
        md += ["## No safe slip today", "", "Nothing on the board passes every rule. **Don't play today** — that is the safe answer.", ""]
    else:
        md += ["## Safe slips", "| # | Leg 1 | x | Leg 2 | x | Slip | Win chance | Counts per $100 |", "|---|---|---|---|---|---|---|---|"]
        for i, c in enumerate(pairs, 1):
            a, b = c["near"], c["good"]
            md.append(f"| {i} | {a['when']} {a['matchup']}: **{leg_txt(a)}** ({pc(a['fair'])}) | {a['m']:.2f} | "
                      f"{b['when']} {b['matchup']}: **{leg_txt(b)}** ({pc(b['fair'])}) | {b['m']:.2f} | {c['m']:.2f}x | {pc(c['p'])} | "
                      f"${min(1, c['m'] - 1) * 100:.0f} |")
    md += ["", "## Data checks", f"- leg filter: {dict(why)}", f"- games skipped for Overs (blowout risk): {blow or 'none'}"] + \
          [f"- {x}" for x in meta["checks"]]
    return "\n".join(md)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t_end = time.monotonic() + TIME_BUDGET_S
    rows, ml_events, pcalls = parlay_reads()
    anchors, alog = build_anchors(rows)
    want = defaultdict(set)
    for (pn, stat) in anchors:
        want[stat].add(pn)
    print(f"ParlayAPI rows {len(rows)} | anchors {len(anchors)} player-stats | {dict(alog)} | calls {pcalls}", flush=True)
    sk = Skipper()
    flog = Counter()
    games, raw_legs, h2h = fetch_fliff(sk, want, t_end, flog)
    print(f"Fliff: games {len(games)} | prop legs {len(raw_legs)} | h2h {len(h2h)} | {dict(flog)} | skipper calls {sk.calls}", flush=True)

    legs, unpriced, how_count = [], Counter(), Counter()
    for l in raw_legs:
        p, how = price_rung(anchors.get((l["pn"], l["stat"]), []), l["line"], l["side"])
        if p is None:
            unpriced[how] += 1
            continue
        ev, cost = grade(p, l["m"])
        how_count[how.split()[0]] += 1
        legs.append({**l, "kind": "prop", "fair": round(p, 4), "ev": round(ev, 4), "how": how, "id": l["proposal"] or f"{l['pn']}|{l['stat']}|{l['line']}|{l['side']}",
                     "when": pt(l["start"])})
    for h in h2h:
        p = h2h_fair(ml_events, h["team"], h["start"])
        if p is None:
            unpriced["h2h no pinnacle ml"] += 1
            continue
        ev, cost = grade(p, h["m"])
        g = next((x for x in games if x["id"] == h["game"]), {})
        legs.append({**h, "kind": "h2h", "player": None, "fair": round(p, 4), "ev": round(ev, 4), "how": "pinnacle ML (H2H proxy)",
                     "id": h["proposal"] or f"h2h|{h['game']}|{h['side']}", "when": pt(h["start"]), "matchup": f"{g.get('away_abbr')} @ {g.get('home_abbr')}",
                     "team": h["team"]})
    near, good, cands, pairs = build_pairs(legs)
    blowout_games, blow_txt = set(), []
    for g in games:
        fp = game_fav_p(ml_events, g)
        if fp is not None and fp >= BLOWOUT_FAV_P:
            blowout_games.add(g["id"])
            blow_txt.append(f"{g['away_abbr']} @ {g['home_abbr']} (favorite {fp * 100:.0f}%)")
    s_pool, s_cands, s_pairs, s_why = build_safe_pairs(legs, blowout_games)
    # sanity: ladder order on every run (a higher Over line must never price more likely; Under the reverse)
    viol = 0
    by = defaultdict(list)
    for l in legs:
        if l["kind"] == "prop":
            by[(l["pn"], l["stat"], l["side"])].append(l)
    for (pn, st, side), ls in by.items():
        ls.sort(key=lambda x: x["line"])
        for x, y in zip(ls, ls[1:]):
            if side == "over" and y["fair"] > x["fair"] + 1e-9:
                viol += 1
            if side == "under" and y["fair"] + 1e-9 < x["fair"]:
                viol += 1
    meta = {"when": NOW.astimezone(PT).strftime("%a %b %d %Y, %I:%M %p PT"), "games": len(games), "ladders": flog.get("ladders", 0),
            "priced": len(legs),
            "checks": [f"ParlayAPI calls: {pcalls}", f"anchor rows: {dict(alog)}", f"Fliff fetch: {dict(flog)} (skipper calls {sk.calls})",
                       f"priced legs by method: {dict(how_count)}; unpriced: {dict(unpriced)}",
                       f"monotonic ladder check violations: {viol} (must be 0)", f"pair candidates before diversity cap: {len(cands)}",
                       f"settings: near >= {NEAR_P}, good {GOOD_P_MIN}-{NEAR_P} at {GOOD_M_MIN}-{GOOD_M_MAX}x, slip {SLIP_MIN}-{SLIP_MAX}x, joint >= {JOINT_MIN}, "
                       f"one-sided haircut min(q-{ALT_ADD}, q/(1+{ALT_PROP})), leg reuse {LEG_REUSE}",
                       "H2H Combo legs settle on team fantasy points; priced with the moneyline (same Fliff proposal) as a proxy."]}
    bal = envf("PROBE_BALANCE", 0)
    meta["stake"] = int(round(bal * STAKE_PCT)) if bal else None
    md = render_safe(meta, s_pool, s_pairs, s_why, blow_txt) if MODE == "safe" else render(meta, near, good, pairs)
    stamp = NOW.astimezone(PT).strftime("%Y%m%d_%H%M")
    (OUT / "latest_pairings.md").write_text(md)
    (OUT / "latest_pairings.json").write_text(json.dumps({"meta": meta, "mode": MODE, "safe_pairs": s_pairs, "safe_pool": s_pool[:80], "pairs": pairs, "near": near[:60], "good": good[:60],
                                                          "legs": legs, "games": games}, default=str))
    (OUT / "history").mkdir(exist_ok=True)
    (OUT / "history" / f"pairings_{stamp}.md").write_text(md)
    print(md[:7000], flush=True)
    if viol:
        raise SystemExit(f"monotonic check failed: {viol} violations")


if __name__ == "__main__":
    main()
