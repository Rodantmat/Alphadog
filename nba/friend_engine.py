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
HIS_PP = ["B3", "B4", "B5", "B6", "B7", "B9", "B3x4", "B5x4", "B7x4"]
need = lambda k: max(1, int(0.4 * k))
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


def build(cand, k, gc, H, banned=frozenset(), teams=True):
    """leg-difference ladder (owner 2026-11-05): >=40% different from the owner's legs; if no slip exists, 30%, then 20%, then 10%, else repeat his legs"""
    last = None
    for f in (0.4, 0.3, 0.2, 0.1, 0.0):
        req = max(1, int(f * k)) if f >= 0.1 else 0
        if req == last:
            continue
        last = req
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
    return {"source_key": APP_KEY, "player_name": name, "canonical_prop_key": l["prop"], "line_value": float(l["line"]), "selected_side": side,
            "team_abbr": ab, "matchup": matchup, "official_game_time_utc": tip, "link": link, "event_id": str(l.get("event_id"))}


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
    for x in pool:
        x.pop("_code", None)
    conn.execute("DELETE FROM nba_friend.snapshot WHERE game_date=%s AND payload->>'app'=%s", (d, APP_KEY))
    conn.execute("INSERT INTO nba_friend.snapshot (game_date, payload, built_at) VALUES (%s, %s::jsonb, now())", (d, json.dumps({"app": APP_KEY, "slips": slips, "pool": pool})))
    put_slip_rows(conn, rows, "placed", replace_dates=[d], replace_status="placed")
    conn.commit()
    log(f"snapshot written: {len(slips)} slips, {len(pool)} pool legs")


def grade():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    if FAPP == "PP":
        PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    today = dt.datetime.now(PT).date()
    pend = conn.execute("""SELECT game_date, strategy, slip_no, structure, legs FROM nba_friend.slips
                           WHERE app=%s AND status='placed' AND game_date < %s ORDER BY game_date""", (APP_KEY, today)).fetchall()
    done = 0
    for d, code, no, st, legs in pend:
        if not slate_finished(conn, d):
            log(f"{d}: slate not final in the box score yet")
            continue
        sbox = box(conn, d)
        legs = legs if isinstance(legs, list) else json.loads(legs)
        for l in legs:
            l["hit"] = outcome(sbox, l)
        m = float(pay_of(legs, st))
        conn.execute("""UPDATE nba_friend.slips SET legs=%s::jsonb, status='graded', multiplier=%s, profit=%s, graded_at=now()
                        WHERE app=%s AND game_date=%s AND strategy=%s AND slip_no=%s AND status='placed'""",
                     (json.dumps(legs), m, m - 1.0, APP_KEY, d, code, no))
        done += 1
    conn.commit()
    log(f"graded {done} of {len(pend)} pending slips")


if __name__ == "__main__":
    {"backfill": backfill, "pick": pick, "grade": grade}[MODE]()
