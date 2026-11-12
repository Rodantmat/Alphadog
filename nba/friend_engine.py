#!/usr/bin/env python3
"""
FRIEND PAGE ENGINE (owner 2026-11-05). One app per process (FR_APP = PP | UD | SLEEPER | FLIFF | BETR), mode FR_MODE:
  backfill  replay every slate (2024-25, 2025-26, 2026-27 up to yesterday) with the elected friend rules; flat 1u; write the graded slips to
            nba_friend.slips (the page's season ROI and the report read them). Seasons before 2026-10 use each app's modelled board (the books' main
            line + the app's measured payout law) except PrizePicks / Underdog, which have real window boards.
  pick      today's slate, after P3: the friend slips (each app's elected rule, the 40% leg-difference cap against the owner's rules replayed AND
            his actual slips of the day) + a backup pool, written to nba_friend.slips (status placed) and nba_friend.snapshot (the page's payload).
  grade     placed slips of finished slates: hits from the box score, the app's payout, status graded.
The friend page (Worker jstacks) reads nba_friend.* only. Flat 1u a slip, no units shown.
Env: DATABASE_URL, FR_APP, FR_MODE, (BETR) AA_BETR_PF=0.40,0.55.
"""
import json, math, os, re, sys, time, unicodedata, datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo
import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
FAPP = (os.environ.get("FR_APP") or "PP").upper()
MODE = os.environ.get("FR_MODE") or "pick"
PT = ZoneInfo("America/Los_Angeles")
T0 = time.time()
# FR_TIER=jessi (owner 2026-11-06): the third set (PrizePicks + Sleeper) - same engine, own tables (nba_jessi.*), built >= 40% different from the owner AND the friend
TIER = (os.environ.get("FR_TIER") or "friend").lower()
SCHEMA = "nba_jessi" if TIER == "jessi" else "nba_friend"
if SCHEMA != "nba_friend":
    _orig_execute = psycopg.Connection.execute

    def _execute(self, query, *a, **k):   # every nba_friend.<table> in this file points at the tier's schema; "nba_friend"."t" (quoted) is left alone on purpose
        if isinstance(query, str) and "nba_friend." in query:
            query = query.replace("nba_friend.", SCHEMA + ".")
        return _orig_execute(self, query, *a, **k)
    psycopg.Connection.execute = _execute

if FAPP == "PP":
    import portfolio_b as PB                      # noqa: E402
    import research_portfolio_caps as PC          # noqa: E402
    import live_slip_engine as L                  # noqa: E402
    import ud_live_slip_engine as UDL             # noqa: E402
    AF = AA = None
elif FAPP == "UD":
    os.environ["APP"] = "UD"
    import research_app_final_strategies as AF    # noqa: E402
    UDL = AF.UDL
    AA = None
else:
    os.environ["AA_APP"] = FAPP.lower()
    import research_app_allegs as AA              # noqa: E402
    AF = AA.AF
    UDL = AF.UDL

APP_KEY = {"PP": "prizepicks", "UD": "underdog", "SLEEPER": "sleeper", "FLIFF": "fliff", "BETR": "betr"}[FAPP]
APP_LABEL = {"PP": "PrizePicks", "UD": "Underdog", "SLEEPER": "Sleeper", "FLIFF": "Fliff", "BETR": "Betr"}[FAPP]
SEASON_LABEL = lambda d: (lambda y: f"{y}-{str(y + 1)[2:]}")(d.year if d.month >= 8 else d.year - 1)
STRUCT_NAME = {"flex": "Flex", "power": "Power", "max": "Max"}
if FAPP == "BETR":
    STRUCT_NAME["flex"] = "Dynamic"

# the elected friend rules (owner 2026-11-05): (code, size, structure, rule)
RULES = {
    "PP": [("4F", 4, "flex", ("R", "U", "all", "trail", 0.62, 1, 0, "all")),
           ("3P", 3, "power", ("R", "B", "all", "blend", 0.62, 1, 0, "low"))],
    "UD": [("4F", 4, "flex", ("RB", "B", "combos", "ev", 0.55, 0))],
    "SLEEPER": [("3F", 3, "flex", ("ev", "Under", "low", "main", 0.0, 1.04, 1))],
    "FLIFF": [("3M", 3, "max", ("bl", "Under", "low", "main", 0.6, 1.04, 0))],
    "BETR": [("4F", 4, "flex", ("p", "any", "nolow", "gc2", 0.6, 0.0, 0))],
}[FAPP]
# the extra slips, chosen in the backtest (research_friend_extra, extras picked on the first 60% of slates, read on the last 40%)
EXTRA = {
    "PP": [("X1", 4, "flex", ("RD", "B", "lowvol", "p", 0.62, 1, 0, "low"))],
    "UD": [],
    "SLEEPER": [("X1", 3, "flex", ("edge", "Under", "low", "main", 0.6, 1.04, 1))],
    "FLIFF": [("X1", 3, "max", ("edge", "any", "low", "main", 0.6, 1.04, 1))],
    "BETR": [],
}[FAPP]
FRIEND_RULES, FRIEND_EXTRA = RULES, EXTRA
# the third set's rules (research_jessi.py, filled in from its backtest): {app: [(code, size, structure, rule)]}
# (research_jessi.py run 2026-11-06: built against the owner's proxies AND the friend's legs; first 60% of the slates to choose, last 40% to read)
JESSI_RULES = {
    # owner 2026-11-06 23:25: "Deploy pair 4" (research_jessi_pp5.py): two 4-pick Flex slips, regular lines only, low-volume props, floor 0.64, built on the owner's own rule family;
    # the only rule against his / the friend's slips is that no slip is EXACTLY the same set of legs (FORBID below)
    "PP": [("J1", 4, "flex", ("R", "B", "lowvol", "trail", 0.64, 1, 0, "high")),
           ("J2", 4, "flex", ("R", "B", "lowvol", "p", 0.64, 1, 0, "all")),
           ("J3", 5, "flex", ("R", "O", "combos", "trail", 0.58, 1, 1, "low"))],
    # owner 2026-11-07 10:21 PT "B, wire B for Jessica" (research_jessi_fliff.py run 42398284000, set B: a 4-pick Max + a 2-pick Max, exact copies of his / the friend's slips allowed)
    "FLIFF": [("J1", 4, "max", ("bl", "any", "low", "main", 0.55, 1.0, 0)),
              ("J2", 2, "max", ("edge", "any", "low", "main", 0.6, 1.04, 2))],
    "SLEEPER": [("J1", 5, "flex", ("evbl", "any", "low", "main", 0.0, 1.04, 0)),
                ("J2", 5, "flex", ("edge", "any", "all", "main", 0.6, 1.04, 0))],
}
if TIER == "jessi":
    if FAPP not in JESSI_RULES:
        raise SystemExit(f"jessi tier has no {FAPP}")
    RULES, EXTRA = JESSI_RULES[FAPP], []
HIS_PP = ["B3", "B4", "B5", "B7", "B9", "J1", "J2", "J3", "F5", "B3x4", "B5x4", "B7x4"]   # 2026-11-07: B6 out, J1 J2 J3 F5 in (owner deploy)
need = lambda k: max(1, int(0.2 * k))     # owner 2026-11-11: 40% -> 20%
MK = {'player_points': 'points', 'player_rebounds': 'rebounds', 'player_assists': 'assists', 'player_threes': 'threes_made',
      'player_steals': 'steals', 'player_blocks': 'blocks', 'player_turnovers': 'turnovers', 'player_blocks_steals': 'stocks',
      'player_points_rebounds': 'pts_reb', 'player_points_assists': 'pts_ast', 'player_rebounds_assists': 'reb_ast',
      'player_points_rebounds_assists': 'pra'}


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {FAPP} {m}", flush=True)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def pid(l):
    return str(l.get("player_id") if l.get("player_id") is not None else l["player"])


def lk(l):
    return (pid(l), l["prop"], l["side"])


def tkey(l):
    return l.get("team_id") or l.get("team")


def build(cand, k, gc, H, banned=frozenset(), teams=True, allow_zero=True):
    """leg-difference ladder (owner 2026-11-05): >=40% different from the owner's legs; if no slip exists, 30%, then 20%, then 10%, else repeat his legs"""
    last = None
    for f in (0.2, 0.1, 0.0):     # owner 2026-11-11 14:48 PT: the 40% leg-difference rule drops to 20% (then 10%, then repeat his legs)
        req = max(1, int(f * k)) if f >= 0.1 else 0
        if req == last:
            continue
        last = req
        if req == 0 and not allow_zero:   # the third set never repeats the owner's / friend's legs: no slip beats a copy
            break
        s = build_at(cand, k, gc, H, banned, teams, req)
        if s:
            return s
    return None


def build_at(cand, k, gc, H, banned, teams, req):
    maxh = k - req
    out, pl, gm, h = [], set(), defaultdict(int), 0
    for l in cand:
        p = pid(l)
        if p in pl or p in banned or gm[l["event_id"]] >= gc:
            continue
        inh = lk(l) in H
        if inh and h >= maxh:
            continue
        out.append(l); pl.add(p); gm[l["event_id"]] += 1; h += inh
        if len(out) == k:
            break
    if len(out) < k:
        return None
    if teams and len({tkey(l) for l in out}) < 2:
        return None
    return out


# ------------------------------------------------------------------ box score / grading
def box(conn, d):
    st = {}
    for p, pts, reb, ast, fg3m, stl, blk, tov, mins in conn.execute(
            "SELECT nba_player_id::text, pts, reb, ast, fg3m, stl, blk, tov, min FROM nba_stats.player_game_log WHERE game_date=%s", (d,)).fetchall():
        st[p] = dict(pts=pts or 0, reb=reb or 0, ast=ast or 0, fg3m=fg3m or 0, stl=stl or 0, blk=blk or 0, tov=tov or 0, min=mins)
    return st


def outcome(st, l):
    s = st.get(str(l.get("player_id")))
    if not s or not s["min"]:
        return None
    v = UDL.STAT[l["prop"]](s)
    if v == float(l["line"]):
        return None
    return int((v > float(l["line"])) if l["side"] == "Over" else (v < float(l["line"])))


def slate_finished(conn, d):
    n_s = conn.execute("SELECT count(*) FROM nba_market.schedule_norm WHERE game_date=%s", (d,)).fetchone()[0]
    n_t = conn.execute("SELECT count(DISTINCT team_id) FROM nba_stats.player_game_log WHERE game_date=%s", (d,)).fetchone()[0]
    return n_s > 0 and n_t >= 2 * n_s


def pay_of(slip, structure):
    if FAPP == "PP":
        return PC.grade(slip, structure)
    if FAPP == "UD":
        return AF.ud_pay(slip, structure)
    return AA.pay(slip, structure)


KEEP = ("player", "player_id", "prop", "side", "line", "tier", "kind", "factor", "m", "p", "pf", "event_id", "team", "team_id", "hit")


def leg_json(l):
    o = {}
    for k in KEEP:
        v = l.get(k)
        if v is None:
            continue
        if isinstance(v, (np.floating, float)):
            v = float(v)
        elif isinstance(v, (np.integer,)):
            v = int(v)
        elif not isinstance(v, (int, str, bool)):
            v = str(v)
        o[k] = v
    return o


# ------------------------------------------------------------------ rule evaluation per app
if FAPP == "PP":
    def pp_cand(prep, rule):
        pool, side, ps, rk, fl, gc, tp, lp = rule
        b = [l for l in prep if l["tier"] in PB.POOLS[pool] and l["side"] in PB.SIDES[side] and (ps == "all" or l["_grp"] == ps)]
        if lp == "low":
            b = [l for l in b if l["_lp"] == "low"]
        if rk == "p":
            b = sorted(b, key=lambda l: -l["p"])
        elif rk == "ev":
            b = sorted(b, key=lambda l: -l["p"] * float(l["factor"]))
        elif rk == "blend":
            b = sorted(b, key=lambda l: -l["_blend"])
        else:
            b = sorted(b, key=lambda l: (-l["_trail"], -l["p"]))
        return [l for l in b if l["p"] >= fl][tp:], gc

    def proxies(prep):
        H = set()
        for uid in HIS_PP:
            s = PB.unit_slip(prep, uid)
            if s:
                H |= {lk(l) for l in s}
        return H

    def plan(legs, H):
        out = []
        for code, size, st, rule in RULES:
            cand, gc = pp_cand(legs, rule)
            s = build(cand, size, gc, H)
            out.append((code, size, st, gc, s, cand))
        return out
else:
    if FAPP == "UD":
        POOLS, SIDEMAP, GRP = AF.POOLS, AF.SIDES, AF.GRP
        HIS = [("B", "U", "rebounds", "p", 0.0, 0), ("RB", "B", "all", "ev", 0.60, 1), ("RB", "O", "combos", "ev", 0.55, 1)]

        def ranked(legs, c):
            pool, side, ps, rk, fl, sk = c
            pset = AF.PROPSETS[ps]
            b = [l for l in legs if l["tier"] in POOLS[pool] and l["side"] in SIDEMAP[side] and (pset is None or GRP.get(l["prop"]) in pset)]
            key = {"p": lambda l: -l["p"], "ev": lambda l: -l["p"] * l["m"], "base": lambda l: -(l.get("base") if l.get("base") is not None else -1),
                   "score": lambda l: -(l.get("score") if l.get("score") is not None else -1)}[rk]
            b.sort(key=key)
            return [l for l in b if l["p"] >= fl][sk:]

        def proxies(legs):
            H = set()
            for c in HIS:
                s = build(ranked(legs, c), 2, 1, set(), teams=False)
                if s:
                    H |= {lk(l) for l in s}
            return H

        def plan(legs, H):
            out = []
            for code, size, st, rule in RULES:
                cand = ranked(legs, rule)
                out.append((code, size, st, 1, build(cand, size, 1, H, teams=False), cand))
            return out
    else:
        GRP = AF.GRP
        HIS = {"SLEEPER": [("evbl", "any", "all", "all", 0.50, 1.12, 0, 5, 2)], "FLIFF": [("p", "Under", "all", "main", 0.56, 0.0, 0, 2, 1)],
               "BETR": [("bl", "any", "all", "gc1", 0.60, 0.0, 0, 4, 2)]}[FAPP]

        def ranked(legs, c):
            o, sd, pr, kd0, fl, g, sk = c
            b = [l for l in legs if (sd == "any" or l["side"] == sd) and (kd0 == "all" or l.get("kind", "main") == "main")
                 and (pr == "all" or (pr == "low") == (GRP.get(l["prop"]) == "lowvol"))]
            b.sort(key=AA.key_of(o))
            return [l for l in b if l["p"] >= fl and l["p"] * l["m"] >= g][sk:]

        def proxies(legs):
            H = set()
            for (o, sd, pr, kd0, fl, g, sk, k, ns) in HIS:
                cand = ranked(legs, (o, sd, pr, kd0, fl, g, sk))
                banned = set()
                for _ in range(ns):
                    s = build(cand, k, 2 if kd0 == "gc2" else 1, set(), frozenset(banned))
                    if not s:
                        break
                    H |= {lk(l) for l in s}; banned |= {pid(l) for l in s}
            return H

        def plan(legs, H):
            out = []
            for code, size, st, rule in RULES:
                cand = ranked(legs, rule)
                gc = 2 if rule[3] == "gc2" else 1
                out.append((code, size, st, gc, build(cand, size, gc, H), cand))
            return out


plan_base = plan


NO_BLOCK = True       # owner 2026-11-07: Jessi's slips may be exactly the same as his / the friend's - never block
FORBID = set()        # PrizePicks third set: the exact leg sets (frozenset of lk) of the owner's and the friend's slips of the day
LAST_FR_SETS = []     # filled by friend_replay: the friend's slips of the slate as leg-key sets


def build_distinct_pp(cand, size, gc, banned):
    """owner 2026-11-05/06: her slips may use his legs and his strategies; the ONLY rule is that a slip is never exactly the same set of legs as one of his or the friend's.
    The rule's slip; if it equals a forbidden slip, ban its last player and rebuild (same ranking, next leg)"""
    ban = set(banned)
    for _ in range(6):
        s = build_at(cand, size, gc, set(), frozenset(ban), True, 0)
        if not s:
            return None
        if NO_BLOCK or frozenset(lk(l) for l in s) not in FORBID:
            return s
        ban.add(pid(s[-1]))
    return None


def jessi_plan(legs, H):
    """the third set: one slip after the other, never a player already on her earlier slips (three slips of one app must not be the same four players)"""
    out, used = [], set()
    for code, size, st, rule in RULES:
        if FAPP == "PP":
            cand, gc = pp_cand(legs, rule)
            s = build_distinct_pp(cand, size, gc, used)
            out.append((code, size, st, gc, s, cand))
            if s:
                used |= {pid(l) for l in s}
            continue
        else:
            cand, gc = ranked(legs, rule), 1
        if FAPP == "FLIFF":   # Fliff for Jessi: the rule as tested (no leg-difference ladder; exact copies allowed), one slip after the other
            s = build_at(cand, size, gc, set(), frozenset(used), False, 0)
        else:
            s = build(cand, size, gc, H, banned=frozenset(used), allow_zero=False)
        out.append((code, size, st, gc, s, cand))
        if s:
            used |= {pid(l) for l in s}
    return out


if TIER == "jessi":
    plan = jessi_plan


# ------------------------------------------------------------------ day iterators
def aa_prepare(conn):
    live = [d for d in AF.slate_days(conn) if AF.season_of(d) == "2026-27"]
    ovr, kt = AA.RSH.law(conn, live)
    kf = AA.fliff_law(conn, live) if FAPP == "FLIFF" else None
    return ovr, kt, kf


def app_days(conn):
    """(season, date, legs) for every history + this-season slate before today (UD / SLEEPER / FLIFF / BETR)"""
    days = AF.slate_days(conn)
    if FAPP == "UD":
        for d in days:
            st = box(conn, d)
            if not st:
                continue
            legs, _rows = AF.load_ud(conn, d, st)
            yield AF.season_of(d), d, legs
        return
    ovr, kt, kf = aa_prepare(conn)
    for d in days:
        st = box(conn, d)
        if not st:
            continue
        si = AA.SEASONS.index(AF.season_of(d))
        legs = AA.hist_legs(conn, d, st, ovr, kt, kf) if si < 2 else AA.live_legs(conn, d, st)
        legs = [l for l in legs if l.get("p") is not None and l.get("team") is not None and l.get("event_id") is not None]
        yield AF.season_of(d), d, legs


def pp_days(conn):
    """(season, date, prep) PrizePicks: history legs (graded) + this season on the live board path"""
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    order = sorted(days, key=lambda k: k[1])
    for k in order:
        days[k].sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], float(l["line"]), l["tier"]))
    PC.L3.attach_ranks(conn, days)
    hk = [k for k in order if k[0] in PC.HIST]
    PC.MX.leg_features(conn, days, hk)
    tr = PB.Trailing()
    for k in order:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        if k[0] in PC.HIST and any(l.get("hit") is not None for l in legs):
            yield k[0], k[1], PB.prepare(legs, tr.rates())
        tr.push(legs)
    today = dt.datetime.now(PT).date()
    for (d,) in conn.execute("SELECT DISTINCT game_date FROM nba_score.final_hp WHERE game_date >= %s AND game_date < %s ORDER BY 1", (dt.date(2026, 10, 20), today)).fetchall():
        st = box(conn, d)
        if not st:
            continue
        prep = pp_live_prep(conn, d)
        if not prep:
            continue
        for l in prep:
            l["hit"] = outcome(st, l)
        yield "2026-27", d, prep


def pp_live_prep(conn, d):
    live = L.load_board_legs_live(conn, d)
    lpool = [dict(l, p=float(l["score"]), cell=f"{l['prop']}_{l['tier']}") for l in live
             if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
    if not lpool:
        return []
    return PB.prepare(lpool, L.pb_rates(conn, d))


# ------------------------------------------------------------------ database writes
def put_slip_rows(conn, rows, status, replace_dates=None, replace_status=None):
    if replace_dates:
        conn.execute("DELETE FROM nba_friend.slips WHERE app=%s AND game_date = ANY(%s)" + (" AND status=%s" if replace_status else ""),
                     (APP_KEY, list(replace_dates)) + ((replace_status,) if replace_status else ()))
    for r in rows:
        conn.execute("""INSERT INTO nba_friend.slips (game_date, app, strategy, slip_no, structure, size, legs, status, multiplier, profit, built_at, graded_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,now(),%s)""",
                     (r["d"], APP_KEY, r["code"], r["no"], r["st"], r["size"], json.dumps(r["legs"]), status, r.get("mult"), r.get("profit"),
                      dt.datetime.now(dt.timezone.utc) if status == "graded" else None))
    conn.commit()


def backfill():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    if FAPP == "PP":
        PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
        it = pp_days(conn)
    else:
        it = app_days(conn)
    rows, dates, n = [], set(), 0
    for season, d, legs in it:
        n += 1
        if len(legs) < 3:
            continue
        H = proxies(legs)
        if TIER == "jessi":
            H = H | friend_replay(legs, H)
            if FAPP == "PP":
                FORBID.clear(); FORBID.update(LAST_FR_SETS)
                for _uid in HIS_PP:
                    _s = PB.unit_slip(legs, _uid)
                    if _s:
                        FORBID.add(frozenset(lk(l) for l in _s))
        for code, size, st, gc, s, _cand in plan(legs, H):
            if not s:
                continue
            m = pay_of(s, st)
            rows.append(dict(d=d, code=code, no=1, st=st, size=size, legs=[leg_json(l) for l in s], mult=float(m), profit=float(m) - 1.0))
        dates.add(d)
        if n % 25 == 0:
            log(f"slate {n} {d}: {len(legs)} legs, {len(rows)} slips so far")
        if False:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    conn.close()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("DELETE FROM nba_friend.slips WHERE app=%s AND status='graded'", (APP_KEY,))
    put_slip_rows(conn, rows, "graded")
    log(f"wrote {len(rows)} graded slips over {len(dates)} slates")
    conn.close()


# ------------------------------------------------------------------ pick / payload
def owner_keys(conn, d):
    keys = set()
    for tbl in ("live_slips", "ud_live_slips", "sleeper_live_slips", "fliff_live_slips", "betr_live_slips"):
        try:
            for (lj,) in conn.execute(f"SELECT legs_json FROM nba_score.{tbl} WHERE game_date=%s", (d,)).fetchall():
                arr = lj if isinstance(lj, list) else json.loads(lj)
                for l in arr:
                    p = l.get("player_id") if l.get("player_id") is not None else l.get("player")
                    prop = l.get("prop") or l.get("canonical_prop_key")
                    side = l.get("side") or l.get("selected_side")
                    side = {"more": "Over", "less": "Under", "over": "Over", "under": "Under"}.get(str(side).lower(), side)
                    if p is not None and prop and side:
                        keys.add((str(p), prop, side))
        except Exception as e:
            log(f"owner legs {tbl}: {e}")
            conn.rollback()
    return keys


def decor_ctx(conn, d):
    ctx = {}
    ctx["abbr"] = {r[0]: r[1] for r in conn.execute("SELECT team_id, abbreviation FROM nba_ref.teams").fetchall()}
    tm = conn.execute("SELECT team_id, abbreviation, full_name, nickname FROM nba_ref.teams").fetchall()
    byname = {}
    for t, ab, full, nick in tm:
        byname[norm(full)] = ab
        if nick:
            byname[norm(nick)] = ab
    def abbr_of_name(n):
        n = norm(n)
        if n in byname:
            return byname[n]
        for k, v in byname.items():
            if k and n.endswith(k):
                return v
        return None
    games = {}
    for home, away in conn.execute("SELECT home, away FROM nba_market.schedule_norm WHERE game_date=%s", (d,)).fetchall():
        h, a = abbr_of_name(home), abbr_of_name(away)
        if h and a:
            games[h] = games[a] = (a, h)
    tips = {}
    for hm, aw, ct in conn.execute("""SELECT home_team, away_team, min(commence_time) FROM nba_market.board_snapshots
                                      WHERE game_date=%s AND bookmaker IN ('draftkings','bovada') AND home_team IS NOT NULL GROUP BY 1,2""", (d,)).fetchall():
        h, a = abbr_of_name(hm), abbr_of_name(aw)
        if h and a and ct:
            tips[(a, h)] = ct.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    # the official slate (nba_calendar.slate_games) fills every game/tip the odds-based sources miss, so a leg ALWAYS has matchup + tip
    # (2026-11-08: a Jessi Fliff leg had neither, so it was not seen as started and showed without teams)
    try:
        for hid, aid, gdt in conn.execute("SELECT home_team_id, away_team_id, game_datetime_utc FROM nba_calendar.slate_games WHERE game_date=%s", (d,)).fetchall():
            h, a = ctx["abbr"].get(hid), ctx["abbr"].get(aid)
            if h and a:
                games.setdefault(h, (a, h)); games.setdefault(a, (a, h))
                if gdt and (a, h) not in tips:
                    g = gdt if gdt.tzinfo else gdt.replace(tzinfo=dt.timezone.utc)
                    tips[(a, h)] = g.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception as e:
        log(f"slate_games ctx: {e}")
        conn.rollback()
    ctx["games"], ctx["tips"] = games, tips
    ctx["names"] = {r[0]: r[1] for r in conn.execute("SELECT player_id, display_name FROM nba_ref.player_name_map WHERE display_name IS NOT NULL").fetchall()}
    pns = defaultdict(set)
    for p, n in conn.execute("SELECT player_id, norm_name FROM nba_ref.player_name_map").fetchall():
        pns[p].add(n)
    ctx["pns"] = pns
    links = defaultdict(list)
    if APP_KEY in ("prizepicks", "sleeper", "betr"):
        for mk, pn, side, line, ids in conn.execute("SELECT market_key, pn, side, line::float, ids FROM nba_market.app_link_ids WHERE bookmaker=%s AND game_date=%s", (APP_KEY, d)).fetchall():
            links[(pn, side)].append((mk, line, ids if isinstance(ids, dict) else json.loads(ids)))
    ctx["links"] = links
    ctx["mk_base"] = {}
    for k, v in MK.items():
        ctx["mk_base"].setdefault(v, k)
    ctx["teamof"] = {}
    return ctx


def team_abbr(conn, ctx, l, d):
    t = str(tkey(l) or "")
    if t and re.fullmatch(r"\d+", t):
        t = "nba_" + t
    if not t:
        p = str(l.get("player_id"))
        if p not in ctx["teamof"]:
            r = conn.execute("SELECT team_id FROM nba_stats.player_game_log WHERE nba_player_id::text=%s AND game_date <= %s ORDER BY game_date DESC LIMIT 1", (p, d)).fetchone()
            ctx["teamof"][p] = r[0] if r else None
        t = str(ctx["teamof"][p] or "")
        if re.fullmatch(r"\d+", t):
            t = "nba_" + t
    return ctx["abbr"].get(t)


def deco(conn, ctx, l, d):
    ab = team_abbr(conn, ctx, l, d)
    g = ctx["games"].get(ab)
    matchup = f"{g[0]} @ {g[1]}" if g else None
    tip = ctx["tips"].get(g) if g else None
    p = str(l.get("player_id"))
    name = ctx["names"].get(p) or l["player"]
    side = "more" if l["side"] == "Over" else "less"
    link = None
    if APP_KEY in ("prizepicks", "sleeper", "betr"):
        base = ctx["mk_base"].get(l["prop"])
        best = None
        for pn in ctx["pns"].get(p, ()):
            for mk, line, ids in ctx["links"].get((pn, l["side"]), []):
                if abs(line - float(l["line"])) > 1e-9:
                    continue
                if base and mk.replace("_alternate", "") != base:
                    continue
                if APP_KEY == "prizepicks" and ids.get("odds_type") != (l.get("odds") or "standard"):
                    continue
                if best is None or ("_alternate" in best[0] and "_alternate" not in mk):
                    best = (mk, ids)
        if best:
            link = {"ids": best[1], "line": float(l["line"]), "side": "o" if side == "more" else "u", "tip_utc": tip}
    out = {"source_key": APP_KEY, "player_name": name, "canonical_prop_key": l["prop"], "line_value": float(l["line"]), "selected_side": side,
           "team_abbr": ab, "matchup": matchup, "official_game_time_utc": tip, "link": link, "event_id": str(l.get("event_id"))}
    if APP_KEY == "prizepicks" and str(l.get("tier") or "").startswith("D"):
        out["want_odds"] = "demon"   # a demon line must be checked as a demon, not flagged as drifted
    out["_g"] = leg_json(l)   # the leg as the grader needs it (player_id, prop, side, line, tier, m ...): the page saves the slip as first shown and the grade uses it
    return out


def friend_keys(conn, d):
    """the friend's actual legs of the day (his slips, as built) - the third set stays >= 40% different from them too"""
    keys = set()
    try:
        for (lj,) in conn.execute('SELECT legs FROM "nba_friend"."slips" WHERE game_date=%s AND app=%s', (d, APP_KEY)).fetchall():
            for l in (lj if isinstance(lj, list) else json.loads(lj)):
                if l.get("player_id") is not None and l.get("prop") and l.get("side"):
                    keys.add((str(l["player_id"]), l["prop"], l["side"]))
    except Exception as e:
        log(f"friend legs: {e}")
        conn.rollback()
    return keys


def friend_replay(legs, H):
    """the friend's own slips on a slate (base rules, then the extras with the played players banned) -> their leg keys; for the third set's backfill"""
    global RULES
    keys, used = set(), set()
    LAST_FR_SETS.clear()
    saved = RULES
    RULES = FRIEND_RULES
    try:
        for code, size, st, gc, s, cand in plan_base(legs, H):
            if s:
                keys |= {lk(l) for l in s}; used |= {pid(l) for l in s}; LAST_FR_SETS.append(frozenset(lk(l) for l in s))
    finally:
        RULES = saved
    for code, size, st, rule in FRIEND_EXTRA:
        if FAPP == "PP":
            cand, gc = pp_cand(legs, rule)
        else:
            cand, gc = ranked(legs, rule), 1
        s = build(cand, size, gc, H, banned=frozenset(used), teams=(FAPP != "UD"))
        if s:
            keys |= {lk(l) for l in s}; used |= {pid(l) for l in s}; LAST_FR_SETS.append(frozenset(lk(l) for l in s))
    return keys


def pick():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    d = dt.date.fromisoformat(os.environ.get("FR_DAY") or dt.datetime.now(PT).date().isoformat())
    if FAPP == "PP":
        PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
        legs = pp_live_prep(conn, d)
    elif FAPP == "UD":
        legs, _rows = AF.load_ud(conn, d, {})
    else:
        legs = AA.live_legs(conn, d, {})
        _tm = {}
        for _p, _t in conn.execute("SELECT DISTINCT ON (nba_player_id) nba_player_id::text, team_id FROM nba_stats.player_game_log WHERE game_date < %s ORDER BY nba_player_id, game_date DESC", (d,)).fetchall():
            _tm[_p] = _t
        for l in legs:
            if l.get("team") is None:
                l["team"] = _tm.get(str(l.get("player_id")))
        legs = [l for l in legs if l.get("p") is not None and l.get("team") is not None and l.get("event_id") is not None]
    log(f"{d}: {len(legs)} board legs")
    ctx = decor_ctx(conn, d)
    H = proxies(legs) | owner_keys(conn, d)
    if TIER == "jessi":
        fk = friend_keys(conn, d)
        log(f"{len(fk)} friend legs kept out of the third set")
        H = H | fk
        if FAPP == "PP":
            FORBID.clear()
            for _uid in HIS_PP:
                _s = PB.unit_slip(legs, _uid)
                if _s:
                    FORBID.add(frozenset(lk(l) for l in _s))
            for _lj in [r[0] for r in conn.execute("SELECT legs_json FROM nba_score.live_slips WHERE game_date=%s", (d,)).fetchall()]:
                _arr = _lj if isinstance(_lj, list) else json.loads(_lj)
                _ks = set()
                for _l in _arr:
                    _p = _l.get("player_id") if _l.get("player_id") is not None else _l.get("player")
                    _pr = _l.get("prop") or _l.get("canonical_prop_key"); _sd = _l.get("side") or _l.get("selected_side")
                    _sd = {"more": "Over", "less": "Under", "over": "Over", "under": "Under"}.get(str(_sd).lower(), _sd)
                    if _p is not None and _pr and _sd:
                        _ks.add((str(_p), _pr, _sd))
                if _ks:
                    FORBID.add(frozenset(_ks))
            for (_lj,) in conn.execute('SELECT legs FROM "nba_friend"."slips" WHERE game_date=%s AND app=%s', (d, APP_KEY)).fetchall():
                _arr = _lj if isinstance(_lj, list) else json.loads(_lj)
                _ks = {(str(_l["player_id"]), _l["prop"], _l["side"]) for _l in _arr if _l.get("player_id") is not None and _l.get("prop") and _l.get("side")}
                if _ks:
                    FORBID.add(frozenset(_ks))
            log(f"{len(FORBID)} exact slips of his / the friend's forbidden")
    slips, pool, rows, used = [], [], [], set()
    titles = defaultdict(int)
    for code, size, st, gc, s, cand in plan(legs, H):
        if not s:
            log(f"{code}: no slip")
            continue
        titles[size] += 1
        name = f"{APP_LABEL} {size}-pick {titles[size]}"
        slips.append({"source_key": APP_KEY, "name": name, "structure_label": STRUCT_NAME[st], "size": size, "game_cap": gc,
                      "legs": [deco(conn, ctx, l, d) for l in s]})
        rows.append(dict(d=d, code=code, no=titles[size], st=st, size=size, legs=[leg_json(l) for l in s]))
        used |= {pid(l) for l in s}
        seen = set(used)
        for l in cand:
            if len([1 for x in pool if x["_code"] == code]) >= 14:
                break
            if pid(l) in seen or lk(l) in H:
                continue
            seen.add(pid(l))
            x = deco(conn, ctx, l, d); x["_code"] = code
            pool.append(x)
        log(f"{code}: " + "; ".join(f"{x['player_name']} {x['canonical_prop_key']} {x['selected_side']} {x['line_value']}" for x in slips[-1]["legs"]))
    # EXTRA slips (owner 2026-11-06 "deploy it"): one more slip per app from other players, the same leg-difference ladder against his legs,
    # never a player already on the friend's other slips. The base rules above are untouched; the backfill history does not include them.
    for code, size, st, rule in EXTRA:
        try:
            if FAPP == "PP":
                cand, gc = pp_cand(legs, rule)
            else:
                cand, gc = ranked(legs, rule), 1
            s = build(cand, size, gc, H, banned=frozenset(used), teams=(FAPP != "UD"))
            if not s:
                log(f"{code}: no extra slip")
                continue
            xs = {"source_key": APP_KEY, "name": f"{APP_LABEL} {size}-pick {titles[size] + 1}", "structure_label": STRUCT_NAME[st], "size": size, "game_cap": gc,
                  "legs": [deco(conn, ctx, l, d) for l in s]}
        except Exception as e:
            log(f"{code}: extra slip failed, base slips unaffected: {e}")
            continue
        titles[size] += 1
        slips.append(xs)
        rows.append(dict(d=d, code=code, no=titles[size], st=st, size=size, legs=[leg_json(l) for l in s]))
        used |= {pid(l) for l in s}
        log(f"{code}: " + "; ".join(f"{x['player_name']} {x['canonical_prop_key']} {x['selected_side']} {x['line_value']}" for x in xs["legs"]))
    n_base = len(rows)
    # OWNER MIRROR (owner 2026-11-11 14:43 PT "extend it to Jessica and my friend, same for both, exact copies"; 14:44 "for tomorrow", never touch today): the slips the owner page
    # deployed 2026-11-10/11 are copied EXACTLY onto this page too - PrizePicks 5/6-pick Under Flex fallbacks + quote-repaired slips, Fliff 3-pick/2-pick Max (UD-T1 legs),
    # Underdog C4/C5/C6 (friend only: Jessi has no Underdog). From 2026-11-12 on, so today's pages and saves are never changed.
    if d >= dt.date(2026, 11, 12):
        try:
            mirror_owner_new(conn, ctx, d, legs, slips, rows, titles, used)
        except Exception as e:
            log(f"owner mirror failed, base slips unaffected: {e}")
            conn.rollback()
    # PRIZEPICKS NEVER EMPTY (owner 2026-11-10, Jessi had no PrizePicks slip on a thin board): with no slip built, the same thin-night rule the owner page uses - a
    # 3-pick POWER of the best standard Unders (final_hp >= 0.55), one leg a game, >= 2 teams, never a repeat of a slip already forbidden to this page
    if FAPP == "PP" and not slips:
        try:
            fcand = sorted([l for l in legs if l["tier"] == "R" and l["side"] == "Under" and float(l["p"]) >= 0.55], key=lambda l: -float(l["p"]))
            fs = build(fcand, 3, 1, H, banned=frozenset(used), teams=True)
            if fs:
                xs = {"source_key": APP_KEY, "name": f"{APP_LABEL} 3-pick 1", "structure_label": STRUCT_NAME["power"], "size": 3, "game_cap": 1,
                      "legs": [deco(conn, ctx, l, d) for l in fs]}
                titles[3] += 1
                slips.append(xs)
                rows.append(dict(d=d, code="FB", no=titles[3], st="power", size=3, legs=[leg_json(l) for l in fs]))
                used |= {pid(l) for l in fs}
                log("FB (thin-night fallback): " + "; ".join(f"{x['player_name']} {x['canonical_prop_key']} {x['selected_side']} {x['line_value']}" for x in xs["legs"]))
            else:
                log("FB: no 3 standard Unders >= 55% fit")
        except Exception as e:
            log(f"FB fallback failed, nothing else affected: {e}")
    # PRIZEPICKS SUB BANK (owner 2026-11-10: "subs for everybody, every app"): the standard Unders (final_hp >= 0.55, the same legs the owner screen offers as subs) that are on no slip of
    # this page fill the pool, best hit chance first - a pulled / drifted / started PrizePicks leg always has a sub. Never a goblin / demon (tier R standard lines only).
    if FAPP == "PP":
        try:
            inpool = {pid(x) for x in pool} if False else {x.get("player_name") for x in pool}
            bank = sorted([l for l in legs if l["tier"] == "R" and l["side"] == "Under" and float(l["p"]) >= 0.55 and pid(l) not in used], key=lambda l: -float(l["p"]))
            n_add = 0
            seen_pl = set()
            for l in bank:
                x = deco(conn, ctx, l, d)
                if x.get("player_name") in inpool or x.get("player_name") in seen_pl:
                    continue
                seen_pl.add(x.get("player_name")); x["_code"] = "BK"; pool.append(x); n_add += 1
                if n_add >= 14:
                    break
            log(f"PP sub bank: {n_add} standard Unders added to the pool")
        except Exception as e:
            log(f"PP sub bank failed, nothing else affected: {e}")
    for x in pool:
        x.pop("_code", None)
    conn.execute("DELETE FROM nba_friend.snapshot WHERE game_date=%s AND payload->>'app'=%s", (d, APP_KEY))
    conn.execute("INSERT INTO nba_friend.snapshot (game_date, payload, built_at) VALUES (%s, %s::jsonb, now())", (d, json.dumps({"app": APP_KEY, "slips": slips, "pool": pool})))
    put_slip_rows(conn, rows, "placed", replace_dates=[d], replace_status="placed")
    conn.commit()
    log(f"snapshot written: {len(slips)} slips, {len(pool)} pool legs")
    if FAPP == "FLIFF" and TIER != "jessi":
        try:
            mirror_fliff_to_owner(conn, d, rows[:n_base], slips)     # the owner copies above are the owner's own slips - never mirrored back
        except Exception as e:
            log(f"owner Fliff mirror failed (friend slips unaffected): {e}")
            conn.rollback()
    try:
        write_pairs(conn, d, legs, ctx)
    except Exception as e:
        log(f"pairs failed (slips are unaffected): {e}")
        conn.rollback()


def mirror_owner_new(conn, ctx, d, legs, slips, rows, titles, used):
    """copy the owner's newly deployed slips of the day onto this page, exact legs, appended after the page's own slips; a copy equal to a slip already on the page is skipped"""
    if FAPP == "PP":
        src = conn.execute("SELECT strategy, legs_json, structure FROM nba_score.live_slips WHERE game_date=%s AND status='placed' AND (strategy IN ('P_FB_U5flex','P_FB_U6flex') OR streak_note ILIKE %s) ORDER BY strategy, k", (d, "%repair%")).fetchall()
    elif FAPP == "FLIFF":
        src = conn.execute("SELECT strategy, legs_json, structure FROM nba_score.fliff_live_slips WHERE game_date=%s AND strategy IN ('F_UDT1_3max_U_pm','F_UDT1_2max_fav') ORDER BY strategy, k", (d,)).fetchall()
    elif FAPP == "UD" and TIER != "jessi":
        src = conn.execute("SELECT composition, legs_json, structure FROM nba_score.ud_live_slips WHERE game_date=%s AND portfolio='C' AND status='live' AND substr(composition,1,2) IN ('C4','C5','C6') ORDER BY composition, k", (d,)).fetchall()
    else:
        return
    board = {}
    if FAPP != "FLIFF":
        for l in legs:
            board[(pid(l), l["prop"], l["side"], round(float(l["line"]), 2))] = l
    have = [frozenset(lk(x) for x in [dict(player_id=y.get("player_id"), player=y.get("player_name"), prop=y.get("canonical_prop_key"), side={"more": "Over", "less": "Under"}.get(str(y.get("selected_side")).lower(), y.get("selected_side"))) for y in sl["legs"]]) for sl in slips]
    n = 0
    for strat, lj, owner_st in src:
        arr = lj if isinstance(lj, list) else json.loads(lj)
        s = []
        for l in arr:
            if FAPP == "FLIFF":
                x = dict(l); x["m"] = l.get("factor"); x.setdefault("kind", "main")
            else:
                x = board.get((str(l.get("player_id")), l.get("prop"), l.get("side"), round(float(l["line"]), 2)))
            if x is None:
                s = None
                break
            s.append(x)
        if not s or len(s) < 2:
            log(f"owner copy {strat}: a leg is not on this page's board - skipped")
            continue
        if frozenset(lk(x) for x in s) in have:
            log(f"owner copy {strat}: already on this page - skipped")
            continue
        st = "max" if FAPP == "FLIFF" else ("flex" if owner_st == "flex" else "power")
        size = len(s)
        titles[size] += 1
        n += 1
        slips.append({"source_key": APP_KEY, "name": f"{APP_LABEL} {size}-pick {titles[size]}", "structure_label": STRUCT_NAME[st], "size": size, "game_cap": 1,
                      "legs": [deco(conn, ctx, l, d) for l in s]})
        rows.append(dict(d=d, code=f"O{n}", no=titles[size], st=st, size=size, legs=[leg_json(l) for l in s]))
        used |= {pid(l) for l in s}
        have.append(frozenset(lk(x) for x in s))
        log(f"owner copy {strat} -> O{n}: " + "; ".join(f"{x['player_name']} {x['canonical_prop_key']} {x['selected_side']} {x['line_value']}" for x in slips[-1]["legs"]))


def mirror_fliff_to_owner(conn, d, rows, slips):
    """owner 2026-11-07 10:21 PT "my friend's fliff is a lot better than mine, wire that for me as well": the friend's Fliff slips of the day are also HIS Fliff slips
    (nba_score.fliff_live_slips, strategy F_FR_<code>) - shown on his Slips screen like his own Fliff slip, graded by fliff_live_slip_engine.grade; his own F_UDT1_2max_U stays"""
    n = 0
    for i, r in enumerate(rows):
        legs = []
        for j, l in enumerate(r["legs"]):
            x = dict(l); x["factor"] = l.get("m"); x["tier"] = "R"
            mt = (slips[i]["legs"][j] if i < len(slips) and j < len(slips[i]["legs"]) else {}).get("matchup")
            if mt:
                x["matchup"] = mt
            legs.append(x)
        mult = 1.0
        for l in legs:
            mult *= float(l["factor"])
        mult = int(mult * 100 + 1e-6) / 100.0
        conn.execute("""INSERT INTO nba_score.fliff_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier, board_ts)
                        VALUES (%s, %s, %s, 'max', 1, %s::jsonb, 1, 'live', %s, now())
                        ON CONFLICT (game_date, strategy, k) DO UPDATE SET legs_json = EXCLUDED.legs_json, model_multiplier = EXCLUDED.model_multiplier,
                          board_ts = EXCLUDED.board_ts, status = EXCLUDED.status, built_at = now()
                        WHERE nba_score.fliff_live_slips.graded_at IS NULL""", (d, "F_FR_" + r["code"], len(legs), json.dumps(legs), round(mult, 4)))
        n += 1
    conn.commit()
    log(f"owner Fliff: {n} friend slips mirrored into nba_score.fliff_live_slips")


PAIR_N = {"PP": 8, "UD": 5, "SLEEPER": 5, "FLIFF": 3, "BETR": 3}
PAIR_FLOOR = 0.80
PAIR_FLOOR_APP = {"FLIFF": 0.60, "SLEEPER": 0.60, "BETR": 0.55}  # Fliff's board has only a leg or two at 80%+ (owner 2026-11-07: no Fliff pairings showed)
# best legs first (95%+ when the board has them); the list fills down to 80% only when fewer reach 85%; the hit chance is shown on every leg


def pp_pair_legs(conn, d):
    """every PrizePicks line with a model hit chance: standard, goblin and demon, More and Less (the certified engine leaves the alternate Less out; the pairing list does not)"""
    rows = conn.execute("""
        WITH pr AS MATERIALIZED (
          SELECT p.player, nba_ref.norm_name(p.player) cn, p.side, p.line, p.kind, p.factor::float price,
            CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made'
              WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast'
              WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END prop
          FROM nba_market.pp_leg_price p
          WHERE p.snapshot_label='window' AND p.game_date=%s AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false))
        SELECT nm.player_id::text, pr.player, pr.prop, pr.side, pr.line::float, pr.price, pr.kind, f.final_hp::float
        FROM pr JOIN nba_ref.player_name_map nm ON nm.norm_name = pr.cn
        JOIN nba_score.final_hp f ON f.game_date=%s AND f.player_id=nm.player_id AND f.prop=pr.prop AND f.side=pr.side AND f.line=pr.line
        WHERE f.final_hp >= %s""", (d, d, 0.50)).fetchall()   # 0.50: the owner-only extras (best regular lines, best demon) reach below the pool floor
    out = []
    for pid_, player, prop, side, line, price, kind, hp in rows:
        out.append({"player": player, "player_id": pid_, "prop": prop, "side": side, "line": line, "m": price, "p": hp, "kind": kind,
                    "odds": (kind if kind in ("goblin", "demon") else "standard")})
    return out


def pair_score(conn, d, cand):
    """THE PAIRING SCORE (owner 2026-11-07: Wemby blocks Under 3.5 'p 90%' topped every list while the market gave it ~35%; research_pair_rank.py, 439 slates):
    a leg's model hit chance alone is over-confident (model >= 95% legs hit 79.8%; model 40+ points above the market 60.2%). The score is the LOWER of the model's
    number and the market's (board_true_hp.market_hp; no market row -> the market-anchored true_hp): score >= 0.90 hit 90.7%, >= 0.85 85.2%, >= 0.80 82.4%
    (model alone: 79.9 / 78.9 / 78.0). Every rung of a player's ladder is a candidate, the easiest rung (highest score) is the one listed."""
    rows = conn.execute("SELECT player_id::text, prop, side, line::float, market_hp::float, true_hp::float FROM nba_score.board_true_hp WHERE game_date=%s", (d,)).fetchall()
    mk = {(a, b, c_, round(e, 2)): (f, g) for a, b, c_, e, f, g in rows}
    out = []
    for l in cand:
        k = (str(l.get("player_id")), l["prop"], l["side"], round(float(l["line"]), 2))
        m, t = mk.get(k, (None, None))
        ref = m if m is not None else t
        if ref is None:
            continue
        l = dict(l); l["p_model"] = float(l["p"]); l["p"] = min(float(l["p"]), float(ref)); l["ref"] = "market" if m is not None else "anchored"
        out.append(l)
    return out


def write_pairs(conn, d, legs, ctx):
    n_want = PAIR_N[FAPP] * 4   # a POOL: 4x the legs shown, ranked by hit chance - the screens drop a started / drifted / off-board leg and the next one in the pool takes its place
    cand = pp_pair_legs(conn, d) if FAPP == "PP" else legs
    if FAPP == "SLEEPER":
        # only lines Sleeper actually posts: its 'alt' rungs are synthetic (2026-11-08: 20 of 20 pairings - Cade assists 5.5 - were not on Sleeper's board, the board has 9.5)
        cand = [l for l in cand if l.get("kind", "main") == "main"]
    cand = pair_score(conn, d, cand)
    def _best(floor):
        b = {}
        for l in cand:
            p = l.get("p")
            if p is None or float(p) < floor:
                continue
            k = pid(l)
            if k not in b or float(p) > float(b[k]["p"]):
                b[k] = l
        return b
    best = _best(PAIR_FLOOR_APP.get(FAPP, PAIR_FLOOR))
    # owner 2026-11-10: every app must show pairings every day (Underdog had none: no leg reached its 80% floor) - when the floor leaves
    # fewer than twice the shown count, the floor drops step by step to 50% so the app always keeps its easiest legs
    for fl in (0.70, 0.60, 0.55, 0.50):
        if len(best) >= PAIR_N[FAPP] * 2 or fl >= PAIR_FLOOR_APP.get(FAPP, PAIR_FLOOR):
            continue
        best = _best(fl)
    top = sorted(best.values(), key=lambda l: -float(l["p"]))
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_friend.pairs (game_date date, app text, rank int, p double precision, mult double precision,
                    kind text, leg jsonb, built_at timestamptz DEFAULT now(), PRIMARY KEY (game_date, app, rank))""")
    conn.execute("DELETE FROM nba_friend.pairs WHERE game_date=%s AND app=%s", (d, APP_KEY))
    n = 0
    for l in top:
        if n >= n_want:
            break
        x = deco(conn, ctx, l, d)
        if not x.get("team_abbr"):
            continue
        n += 1
        x["p"] = round(float(l["p"]), 4)
        conn.execute("INSERT INTO nba_friend.pairs (game_date, app, rank, p, mult, kind, leg) VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)",
                     (d, APP_KEY, n, float(l["p"]), float(l["m"]) if l.get("m") is not None else None, l.get("odds") or l.get("kind") or "standard", json.dumps(x)))
    if FAPP == "PP":
        # OWNER ONLY (2026-11-08): beside the pool of best (goblin) legs, the 3 best REGULAR lines and the best DEMON (ranks 101+; the friend page never reads pairs)
        for kind_, take, r0 in (("standard", 3, 101), ("demon", 1, 111)):
            seen_pl, got = set(), 0
            for l in sorted([c for c in cand if c.get("kind") == kind_ or (kind_ == "standard" and c.get("odds") == "standard")], key=lambda l: -float(l["p"])):
                if got >= take:
                    break
                if l["player"] in seen_pl:
                    continue
                x = deco(conn, ctx, l, d)
                if not x.get("team_abbr"):
                    continue
                seen_pl.add(l["player"]); got += 1
                x["p"] = round(float(l["p"]), 4); x["extra"] = kind_
                conn.execute("INSERT INTO nba_friend.pairs (game_date, app, rank, p, mult, kind, leg) VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)",
                             (d, APP_KEY, r0 + got, float(l["p"]), float(l["m"]) if l.get("m") is not None else None, kind_, json.dumps(x)))
            log(f"pairings extra {kind_}: {got}")
    conn.commit()
    log(f"pairings written: {n} legs (hit chance >= {PAIR_FLOOR:.0%}, best {float(top[0]['p']) * 100:.1f}%)" if top else "pairings: no leg reaches the floor")


def grade():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    if FAPP == "PP":
        PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    today = dt.datetime.now(PT).date()
    pend = conn.execute("""SELECT game_date, strategy, slip_no, structure, legs, size FROM nba_friend.slips
                           WHERE app=%s AND status='placed' AND game_date < %s ORDER BY game_date""", (APP_KEY, today)).fetchall()
    # the slips as the page FIRST showed them on the day (after the leg check and swaps; no save button there) are the ones graded - close to what was really played
    seen = {}
    try:
        for sd, nm, lg, sk in conn.execute("SELECT game_date, slip_name, legs, skipped FROM nba_friend.seen WHERE app=%s", (APP_KEY,)).fetchall():
            seen[(sd, nm)] = (lg if isinstance(lg, list) else json.loads(lg), sk)
    except Exception as e:
        log(f"seen slips: {e}")
        conn.rollback()
    done = 0
    for d, code, no, st, legs, size in pend:
        if not slate_finished(conn, d):
            log(f"{d}: slate not final in the box score yet")
            continue
        sbox = box(conn, d)
        legs = legs if isinstance(legs, list) else json.loads(legs)
        sv = seen.get((d, f"{APP_LABEL} {size}-pick {no}"))
        if sv:
            lg, skipped = sv
            # owner 2026-11-09: a slip first opened after tip-off is no longer voided (9 of 9 slips on 11-06 were) - it is graded as built
            if not skipped and lg and all(isinstance(x, dict) and x.get("_g") for x in lg):
                legs = [dict(x["_g"]) for x in lg]
        for l in legs:
            l["hit"] = outcome(sbox, l)
        m = float(pay_of(legs, st))
        conn.execute("""UPDATE nba_friend.slips SET legs=%s::jsonb, status='graded', multiplier=%s, profit=%s, graded_at=now()
                        WHERE app=%s AND game_date=%s AND strategy=%s AND slip_no=%s AND status='placed'""",
                     (json.dumps(legs), m, m - 1.0, APP_KEY, d, code, no))
        done += 1
    conn.commit()
    log(f"graded {done} of {len(pend)} pending slips")
    try:
        grade_saved(conn, today)
    except Exception as e:
        log(f"saved slips: {e}")
        conn.rollback()


def grade_saved(conn, today):
    """owner 2026-11-11 (from 11-12): the slips Jon SAVED on his page (nba_friend.saved - his own legs, swaps, X'd legs, Flex / Power) are graded here;
    a leg with no box score (did not play) or a push stays hit=None and is voided by the app's own payout rule. Friend tier only (Jessi has no save table)."""
    if SCHEMA != "nba_friend":
        return
    pend = conn.execute("SELECT id, game_date, mode, legs FROM nba_friend.saved WHERE app=%s AND status='saved_pending' AND game_date < %s ORDER BY game_date", (APP_KEY, today)).fetchall()
    n_done = 0
    for sid, d, mode, legs in pend:
        if not slate_finished(conn, d):
            log(f"saved {d}: slate not final in the box score yet")
            continue
        sbox = box(conn, d)
        legs = legs if isinstance(legs, list) else json.loads(legs)
        gl = []
        for x in legs:
            g = dict(x["g"])
            g["hit"] = outcome(sbox, g)
            x["hit"] = None if g["hit"] is None else int(bool(g["hit"]))
            gl.append(g)
        st = "flex" if mode == "flex" else ("standard" if FAPP == "UD" else ("power" if FAPP == "PP" else "max"))
        m = float(pay_of(gl, st))
        hits = sum(1 for x in legs if x.get("hit") == 1)
        conn.execute("UPDATE nba_friend.saved SET legs=%s::jsonb, status='graded', hits=%s, payout=%s, profit=%s, graded_at=now() WHERE id=%s",
                     (json.dumps(legs), hits, m, m - 1.0, sid))
        n_done += 1
    conn.commit()
    log(f"saved slips graded: {n_done} of {len(pend)}")


def pairs_only():
    """rebuild only the day's best pairings for this app (the friend's slips of the day stay untouched)"""
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    d = dt.date.fromisoformat(os.environ.get("FR_DAY") or dt.datetime.now(PT).date().isoformat())
    if FAPP == "PP":
        legs = []
    elif FAPP == "UD":
        legs, _rows = AF.load_ud(conn, d, {})
    else:
        legs = AA.live_legs(conn, d, {})
        _tm = {}
        for _p, _t in conn.execute("SELECT DISTINCT ON (nba_player_id) nba_player_id::text, team_id FROM nba_stats.player_game_log WHERE game_date < %s ORDER BY nba_player_id, game_date DESC", (d,)).fetchall():
            _tm[_p] = _t
        for l in legs:
            if l.get("team") is None:
                l["team"] = _tm.get(str(l.get("player_id")))
        legs = [l for l in legs if l.get("p") is not None and l.get("team") is not None and l.get("event_id") is not None]
    ctx = decor_ctx(conn, d)
    write_pairs(conn, d, legs, ctx)


if __name__ == "__main__":
    {"backfill": backfill, "pick": pick, "grade": grade, "pairs": pairs_only}[MODE]()
