#!/usr/bin/env python3
"""FLIFF PROBE - STEP 2: every upcoming Fliff game vs the sharp market, ranked for strategy (2026-10-20).

SEPARATE STRUCTURE: reads nothing outside fliff_probe/ except the credential row (parlay_api_key) in Postgres; writes only
fliff_probe/out/. No existing file, table or pipeline is touched.

WHAT IT DOES
 1. Fliff catalog: ping -> sync 3054 = every active prematch event (689 on 2026-10-20) with channel id + start time.
 2. Sharp market: ParlayAPI Odds-API-compatible /sports/{key}/odds (h2h, spreads, totals) for every sport that has Fliff
    events in the window. Fair probability = Pinnacle no-vig (multiplicative normalisation of the two/three outcomes at the
    SAME line). If Pinnacle is missing on that market/line, a consensus fair price (median no-vig of >= 3 other books, Fliff
    excluded) is used and the leg is flagged fair_src='consensus'.
 3. Fliff prices, two independent sources:
      a) ParlayAPI's own 'fliff' book (same schema, exact team names) - NBA / NFL / NHL / MLB.
      b) Our own Fliff scrape (sync 3062 per event) - every sport, parsed into moneyline / spread / total at a point.
    Only SAME-LINE comparisons are graded (Fliff -2.5 is never compared with Pinnacle -1.5).
 4. Per leg: fair p, Fliff decimal, EV per $1 = p*d - 1, and the bonus-clearing cost per $1 of play-through when only
    winnings count (Fliff screen 2026-10-20: "$7.00 counts toward play-through" on a $100 x 1.07 slip) = -EV / (p*(d-1)).
 5. Strategy: top +EV legs, safest legs (fair p >= 0.70), best 2-pick parlays across different events (Fliff parlay price =
    product of the legs' decimals - standard sportsbook rule; verify on the slip screen), cheapest bonus-clearing plays.

ENV: DATABASE_URL, PROXY_URL (optional), PROBE_HOURS (48), PROBE_SPORTS ('auto' or comma list of ParlayAPI keys),
     PROBE_MAX_EVENTS (250 = cap on per-event Fliff board pulls), PROBE_SKIP_SCRAPE=1 (ParlayAPI-only run).
Tested locally 2026-10-20 (no-vig vs hand calc, event matching incl. a false-match check, market-name filters, side mapping).
"""
import json
import os
import re
import statistics
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from itertools import combinations
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fliff_client import FliffClient, conflicts_of, lists_under  # noqa: E402

OUT = HERE / "out"
PT = ZoneInfo("America/Los_Angeles")
NOW = datetime.now(timezone.utc)
HOURS = float(os.environ.get("PROBE_HOURS", "48") or 48)
MAX_EVENTS = int(os.environ.get("PROBE_MAX_EVENTS", "250") or 250)

# Fliff channel id -> ParlayAPI sport key (mapped from discovery 2026-10-20: event examples per channel)
CHANNEL_SPORT = {
    461: "basketball_nba", 451: "americanfootball_nfl", 452: "americanfootball_ncaaf", 441: "baseball_mlb",
    481: "icehockey_nhl", 467: "icehockey_nhl", 4502: "americanfootball_cfl",
    4200: "soccer_usa_mls", 43009: "soccer_epl", 4395: "soccer_spain_la_liga", 4388: "soccer_italy_serie_a",
    4384: "soccer_france_ligue_one", 43049: "soccer_germany_bundesliga2", 4382: "soccer_germany_bundesliga",
    43021: "soccer_germany_cup", 43002: "soccer_uefa_champs_league", 4397: "soccer_uefa_europa_league",
    43008: "soccer_uefa_conference_league", 4389: "soccer_mexico_ligamx", 43025: "soccer_netherlands_eredivisie",
    4303: "soccer_brazil_campeonato", 43007: "soccer_argentina_primera_division", 4383: "soccer_england_championship",
    43045: "soccer_england_league1", 43033: "soccer_usa_national_womens_soccer_league",
    10491: "tennis_atp", 10556: "tennis_atp", 10558: "tennis_atp", 10554: "tennis_wta", 10451: "tennis_wta",
    4950: "mma_mixed_martial_arts", 4951: "boxing_boxing",
}
EXCLUDE_WORDS = ("1st", "2nd", "3rd", "4th", "half", "quarter", "period", "inning", "set", "first", "1h", "2h", "1q",
                 "corner", "corners", "card", "cards", "booking", "bookings", "team total", "player", "race", "alternate",
                 "alt", "exact", "margin", "both teams", "double chance", "draw no bet", "odd", "even", "next", "parlay",
                 "method", "round", "rounds", "distance", "minute", "shots", "tackles", "games")


# ------------------------------------------------------------------ helpers
def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", s)


STOP = {"fc", "cf", "sc", "afc", "club", "de", "the", "cd", "ac", "fk", "sk", "if", "bk", "vs", "and", "of", "st", "sv",
        "cs", "over", "under", "draw"}


def toks(s):
    return {t for t in norm(s).split() if len(t) >= 3 and t not in STOP}


def name_score(a, b):
    return len(toks(a) & toks(b))


def fair_from(prices):
    """decimal odds of mutually exclusive outcomes -> no-vig probabilities (multiplicative)."""
    inv = [1.0 / p for p in prices if p and p > 1.0]
    if len(inv) != len(prices) or not inv:
        return None
    s = sum(inv)
    return [x / s for x in inv]


def am_to_dec(a):
    try:
        a = float(a)
    except (TypeError, ValueError):
        return None
    if a == 0:
        return None
    return 1 + (a / 100.0 if a > 0 else 100.0 / -a)


def pt(ts):
    return ts.astimezone(PT).strftime("%a %m-%d %I:%M %p PT") if ts else ""


def pct(x, signed=True):
    if x is None:
        return ""
    return f"{x * 100:+.1f}%" if signed else f"{x * 100:.1f}%"


def fpoint(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------ 1) Fliff catalog
def fliff_catalog(fc):
    root = fc.sync(3054)
    pre, _inp = conflicts_of(root)
    evs = []
    for c in pre:
        ms = c.get("event_start_timestamp_utc")
        if not isinstance(ms, (int, float)) or ms <= 0:
            continue
        start = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
        if not (NOW + timedelta(minutes=5) <= start <= NOW + timedelta(hours=HOURS)):
            continue
        an, hn = str(c.get("away_team_name") or ""), str(c.get("home_team_name") or "")
        if "[boosted]" in an or "[boosted]" in hn:
            continue
        evs.append({"fkey": c.get("conflict_fkey"), "channel": c.get("channel_id"), "away": an, "home": hn, "start": start,
                    "sport_key": CHANNEL_SPORT.get(c.get("channel_id")), "est_markets": c.get("estimated_markets_count")})
    return evs


# ------------------------------------------------------------------ 2) ParlayAPI market
class Parlay:
    BASE = "https://parlay-api.com/v1"

    def __init__(self):
        import psycopg
        import requests
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            self.key = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials "
                                    "WHERE credential_key='parlay_api_key'").fetchone()[0].strip()
        self.S = requests.Session()
        self.H = {"X-API-Key": self.key, "accept": "application/json", "User-Agent": "alphadog-fliff-probe"}
        self.log = []

    def odds(self, sport):
        for attempt in range(3):
            try:
                r = self.S.get(f"{self.BASE}/sports/{sport}/odds", headers=self.H, timeout=120,
                               params={"regions": "us,us2,eu", "markets": "h2h,spreads,totals", "oddsFormat": "decimal"})
            except Exception as exc:  # noqa: BLE001
                self.log.append({"sport": sport, "error": type(exc).__name__})
                time.sleep(3 * (attempt + 1))
                continue
            self.log.append({"sport": sport, "status": r.status_code, "remaining": r.headers.get("x-requests-remaining"),
                             "cost": r.headers.get("x-requests-last")})
            if r.status_code == 200:
                try:
                    j = r.json()
                    return j if isinstance(j, list) else []
                except Exception:  # noqa: BLE001
                    return []
            if r.status_code in (401, 403, 404, 422):
                return []
            time.sleep(3 * (attempt + 1))
        return []


def market_lines(ev):
    """ParlayAPI event -> {(mkt, line_key): {book: {outcome_name: (price, point)}}}.
    line_key: 'ml' for h2h; the total for totals; |spread| for spreads (both sides of one line pair up)."""
    out = defaultdict(lambda: defaultdict(dict))
    for b in ev.get("bookmakers") or []:
        bk = b.get("key")
        for m in b.get("markets") or []:
            mk = m.get("key")
            if mk not in ("h2h", "spreads", "totals"):
                continue
            for o in m.get("outcomes") or []:
                price, point = fpoint(o.get("price")), fpoint(o.get("point"))
                if not price:
                    continue
                if mk == "h2h":
                    lk, point = "ml", None
                elif point is None:
                    continue
                elif mk == "totals":
                    lk = f"{point:g}"
                else:
                    lk = f"{abs(point):g}"
                out[(mk, lk)][bk][o.get("name")] = (price, point)
    return out


def _valid_group(mk, g):
    if not g:
        return None
    if mk == "spreads":
        items = list(g.values())
        if len(items) != 2 or items[0][1] != -items[1][1]:
            return None
    if mk == "totals" and set(g) != {"Over", "Under"}:
        return None
    if mk == "h2h" and len(g) < 2:
        return None
    return g


def fair_table(lines):
    """-> {(mkt, line_key, outcome_name, point): (fair_p, src, n_books)}."""
    res = {}
    for (mk, lk), books in lines.items():
        pin = _valid_group(mk, books.get("pinnacle"))
        if pin:
            names = list(pin)
            fp = fair_from([pin[n][0] for n in names])
            if fp:
                for n, p in zip(names, fp):
                    res[(mk, lk, n, pin[n][1])] = (p, "pinnacle", 1)
                continue
        per_out, n_b = defaultdict(list), 0
        for bk, g0 in books.items():
            if bk in ("fliff", "pinnacle"):
                continue
            g = _valid_group(mk, g0)
            if not g:
                continue
            names = list(g)
            fp = fair_from([g[n][0] for n in names])
            if not fp:
                continue
            n_b += 1
            for n, p in zip(names, fp):
                per_out[(n, g[n][1])].append(p)
        if n_b >= 3:
            for (n, point), ps in per_out.items():
                if len(ps) >= 3:
                    res[(mk, lk, n, point)] = (statistics.median(ps), "consensus", len(ps))
    return res


# ------------------------------------------------------------------ 3) Fliff board parse (our scrape)
def classify_market(name):
    n = " " + norm(name) + " "
    if any(f" {w} " in n for w in EXCLUDE_WORDS):
        return None
    if any(f" {k} " in n for k in ("moneyline", "money line", "winner", "to win", "match result", "1x2", "result",
                                   "fight winner", "match winner", "game winner", "game lines moneyline")):
        return "h2h"
    if any(f" {k} " in n for k in ("spread", "handicap", "puck line", "run line", "point spread")):
        return "spreads"
    if any(f" {k} " in n for k in ("total", "totals", "total goals", "total points", "total runs", "over under")):
        return "totals"
    return None


def parse_fliff_board(j, fkey):
    """-> (list of {mk, sel, point, dec, market_name, boosted}, Counter of market names) for full-game game lines."""
    out, census = [], Counter()
    for lst in lists_under(j.get("x_slots") or {}, "market_updates"):
        for m in lst:
            if not isinstance(m, dict) or m.get("conflict_fkey") != fkey:
                continue
            vn = m.get("visual_name") or ""
            census[vn] += 1
            mk = classify_market(vn)
            if not mk:
                continue
            for g in m.get("groups") or []:
                if g.get("player_fkey"):
                    continue
                for p in g.get("proposals") or []:
                    if p.get("player_fkey") or p.get("status") not in (None, 733):
                        continue
                    dec = fpoint(p.get("eu_coeff"))
                    if not dec or dec <= 1.0:
                        dec = am_to_dec(p.get("coeff"))
                    if not dec or dec <= 1.0:
                        continue
                    sel = str(p.get("t_141_selection_name") or "")
                    point = None
                    raw = p.get("t_142_selection_param_1")
                    mnum = re.search(r"([+-]?\d+(?:\.\d+)?)", str(raw)) if raw not in (None, "") else None
                    if not mnum and mk != "h2h":
                        mnum = re.search(r"([+-]?\d+(?:\.\d+)?)\s*\)?\s*$", sel)
                    if mnum:
                        point = float(mnum.group(1))
                    out.append({"mk": mk, "sel": sel, "point": point, "dec": dec, "market_name": vn,
                                "boosted": bool(p.get("sk_boosted_offer"))})
    return out, census


def resolve_scraped(pr, teams):
    """Fliff scraped proposal -> fair-table key (mkt, line_key, outcome_name, point) or None."""
    mk, sel_n = pr["mk"], norm(pr["sel"])
    words = sel_n.split()
    if mk == "totals":
        side = "Over" if ("over" in words or words[:1] == ["o"]) else ("Under" if ("under" in words or words[:1] == ["u"]) else None)
        if not side or pr["point"] is None:
            return None
        p = abs(pr["point"])
        return (mk, f"{p:g}", side, p)
    if "draw" in words or sel_n.strip() in ("x", "tie"):
        team = "Draw"
    else:
        sc = sorted(((name_score(pr["sel"], t), t) for t in teams if t), reverse=True)
        if not sc or sc[0][0] == 0 or (len(sc) > 1 and sc[0][0] == sc[1][0]):
            return None
        team = sc[0][1]
    if mk == "h2h":
        return (mk, "ml", team, None)
    if pr["point"] is None or team == "Draw":
        return None
    return (mk, f"{abs(pr['point']):g}", team, pr["point"])


# ------------------------------------------------------------------ 4) matching + grading
def match_event(fe, pevs):
    best, bs = None, 0
    for e in pevs:
        try:
            st = datetime.fromisoformat(str(e.get("commence_time")).replace("Z", "+00:00"))
        except ValueError:
            continue
        if abs((st - fe["start"]).total_seconds()) > 4 * 3600:
            continue
        aa, hh = name_score(fe["away"], e.get("away_team")), name_score(fe["home"], e.get("home_team"))
        ah, ha = name_score(fe["away"], e.get("home_team")), name_score(fe["home"], e.get("away_team"))
        s = max(aa + hh if (aa >= 1 and hh >= 1) else 0, ah + ha if (ah >= 1 and ha >= 1) else 0)
        if s > bs:
            best, bs = e, s
    return best


def grade(p, d):
    ev = p * d - 1.0
    clear_cost = (-ev / (p * (d - 1.0))) if d > 1.0 and p > 0 else None
    return ev, clear_cost


def leg_label(l):
    mk = {"h2h": "ML", "spreads": "Spread", "totals": "Total"}[l["market"]]
    if l["market"] == "spreads" and l["point"] is not None:
        return f"{mk} {l['selection']} {l['point']:+g}"
    if l["market"] == "totals" and l["point"] is not None:
        return f"{mk} {l['selection']} {l['point']:g}"
    return f"{mk} {l['selection']}"


def build_strategy(legs):
    pos = sorted([l for l in legs if l["ev"] > 0], key=lambda l: -l["ev"])
    safe = sorted([l for l in legs if l["fair_p"] >= 0.70], key=lambda l: (-l["ev"], -l["fair_p"]))
    clear = sorted([l for l in legs if l["clear_cost"] is not None and l["fair_p"] >= 0.45], key=lambda l: l["clear_cost"])
    pool = sorted([l for l in legs if l["fair_p"] >= 0.55 and l["ev"] >= -0.03], key=lambda l: -l["ev"])[:120]
    combos = []
    for a, b in combinations(pool, 2):
        if a["event_key"] == b["event_key"]:
            continue
        p, d = a["fair_p"] * b["fair_p"], a["fliff_dec"] * b["fliff_dec"]
        ev, cc = grade(p, d)
        combos.append({"legs": [a, b], "p": round(p, 4), "dec": round(d, 3), "ev": round(ev, 4),
                       "clear_cost": None if cc is None else round(cc, 4)})
    best_combo = sorted(combos, key=lambda c: -c["ev"])[:15]
    safe_combo = sorted([c for c in combos if c["p"] >= 0.60], key=lambda c: -c["ev"])[:15]
    return pos, safe, clear, best_combo, safe_combo, len(combos)


def render_md(meta, legs, pos, safe, clear, best_combo, safe_combo):
    H = "| Start | Sport | Event | Pick | Fliff | Fair p | EV | Clear cost | Fair src |\n|---|---|---|---|---|---|---|---|---|"

    def row(l):
        return (f"| {l['start_pt']} | {l['sport'].split('_', 1)[-1]} | {l['event']} | {leg_label(l)} | {l['fliff_dec']:.3f} | "
                f"{pct(l['fair_p'], False)} | {pct(l['ev'])} | {pct(l['clear_cost'])} | {l['fair_src']}{' BOOST' if l.get('boosted') else ''} |")

    def crow(c):
        a, b = c["legs"]
        return (f"| {a['start_pt']} {a['event']}: {leg_label(a)} + {b['start_pt']} {b['event']}: {leg_label(b)} | "
                f"{c['dec']:.3f} | {pct(c['p'], False)} | {pct(c['ev'])} | {pct(c['clear_cost'])} |")

    CH = "| Legs | Parlay dec | Fair p | EV | Clear cost |\n|---|---|---|---|---|"
    md = [f"# Fliff probe — {meta['when_pt']}", "",
          f"Window: next {meta['hours']:g} h · Fliff events in window: {meta['n_events']} · boards pulled: {meta['pulls']} · "
          f"graded legs: {len(legs)} · +EV legs: {len(pos)}", "",
          "**How to read it.** *Fair p* = Pinnacle's no-vig probability (or a ≥3-book consensus when Pinnacle has no line). "
          "*EV* = expected profit per $1 at Fliff's price. *Clear cost* = expected loss per $1 of play-through cleared when only "
          "winnings count (negative = expected profit while clearing). Only same-line comparisons are graded.", "",
          "## 1. Best value legs (+EV at Fliff's price)", H] + [row(l) for l in pos[:25]]
    md += ["", "## 2. Safest legs (fair p ≥ 70%), best price first", H] + [row(l) for l in safe[:25]]
    md += ["", "## 3. Cheapest way to clear the bonus (fair p ≥ 45%)", H] + [row(l) for l in clear[:20]]
    md += ["", "## 4. Best 2-pick parlays (different games)", CH] + [crow(c) for c in best_combo]
    md += ["", "## 5. Safest 2-pick parlays (fair p ≥ 60%)", CH] + [crow(c) for c in safe_combo]
    md += ["", "## Data checks"] + [f"- {x}" for x in meta["checks"]]
    md += ["- Fliff 2-pick price assumed = product of the legs' decimals; confirm on the slip screen before staking."]
    return "\n".join(md)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"generated_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "window_hours": HOURS}
    fc = FliffClient(proxy=os.environ.get("PROXY_URL", "").strip() or None)
    fc.ping()
    fevs = fliff_catalog(fc)
    by_sport = Counter(e["sport_key"] or f"unmapped:{e['channel']}" for e in fevs)
    report["fliff_events_in_window"] = len(fevs)
    report["fliff_events_by_sport"] = dict(by_sport.most_common())
    print(f"Fliff events in next {HOURS:g}h: {len(fevs)} | {dict(by_sport.most_common(25))}", flush=True)

    want = os.environ.get("PROBE_SPORTS", "auto").strip()
    sports = sorted({e["sport_key"] for e in fevs if e["sport_key"]}) if want in ("", "auto") else [s.strip() for s in want.split(",") if s.strip()]
    pa = Parlay()
    pevs_by_sport = {}
    for sk in sports:
        pevs_by_sport[sk] = pa.odds(sk)
        print(f"  parlay {sk}: {len(pevs_by_sport[sk])} events", flush=True)
        time.sleep(0.5)
    report["parlay_calls"] = pa.log

    legs, scrape_census, unmatched, xcheck, pulls = [], defaultdict(Counter), Counter(), [], 0
    skip_scrape = os.environ.get("PROBE_SKIP_SCRAPE") == "1"
    fevs.sort(key=lambda e: (e["sport_key"] is None, e["start"]))
    for fe in fevs:
        if not fe["sport_key"]:
            continue
        pe = match_event(fe, pevs_by_sport.get(fe["sport_key"]) or [])
        if not pe:
            unmatched[fe["sport_key"]] += 1
            continue
        lines = market_lines(pe)
        fair = fair_table(lines)
        ev_label = f"{fe['away']} @ {fe['home']}"
        base = {"sport": fe["sport_key"], "event": ev_label, "event_key": fe["fkey"], "start_utc": fe["start"].isoformat(),
                "start_pt": pt(fe["start"])}

        pa_fliff = {}
        for (mk, lk), books in lines.items():
            for name, (price, point) in (books.get("fliff") or {}).items():
                k = (mk, lk, name, point)
                pa_fliff[k] = price
                f = fair.get(k)
                if f:
                    ev, cc = grade(f[0], price)
                    legs.append({**base, "market": mk, "selection": name, "point": point, "fliff_dec": price,
                                 "fair_p": round(f[0], 4), "fair_src": f[1], "fliff_src": "parlayapi", "ev": round(ev, 4),
                                 "clear_cost": None if cc is None else round(cc, 4)})

        if skip_scrape or pulls >= MAX_EVENTS:
            continue
        try:
            j = fc.sync(3062, channel=fe["channel"], conflict=fe["fkey"])
            pulls += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  board pull failed {ev_label}: {str(exc)[:100]}", flush=True)
            continue
        props, census = parse_fliff_board(j, fe["fkey"])
        scrape_census[fe["sport_key"]].update(census)
        teams = [pe.get("home_team"), pe.get("away_team")]
        for pr in props:
            k = resolve_scraped(pr, teams)
            if not k:
                continue
            if k in pa_fliff:
                xcheck.append({"event": ev_label, "key": list(k), "scrape": pr["dec"], "parlayapi": pa_fliff[k]})
            f = fair.get(k)
            if not f:
                continue
            ev, cc = grade(f[0], pr["dec"])
            legs.append({**base, "market": k[0], "selection": k[2], "point": k[3], "fliff_dec": round(pr["dec"], 4),
                         "fair_p": round(f[0], 4), "fair_src": f[1], "fliff_src": "scrape", "fliff_market_name": pr["market_name"],
                         "boosted": pr["boosted"], "ev": round(ev, 4), "clear_cost": None if cc is None else round(cc, 4)})
        time.sleep(0.35)

    dedup = {}
    for l in legs:   # prefer the scrape (fresh, every sport) over ParlayAPI's copy of the same outcome
        k = (l["event_key"], l["market"], l["selection"], l["point"])
        if k not in dedup or (l["fliff_src"] == "scrape" and dedup[k]["fliff_src"] != "scrape"):
            dedup[k] = l
    legs = list(dedup.values())

    xc = {}
    if xcheck:
        diffs = [abs(x["scrape"] - x["parlayapi"]) for x in xcheck]
        xc = {"pairs": len(xcheck), "within_0.02": sum(d <= 0.02 for d in diffs), "median_abs_diff": round(statistics.median(diffs), 4),
              "worst": sorted(xcheck, key=lambda x: -abs(x["scrape"] - x["parlayapi"]))[:8]}
    pos, safe, clear, best_combo, safe_combo, n_combos = build_strategy(legs)
    report.update({"fliff_boards_pulled": pulls, "graded_legs": len(legs), "unmatched_events_by_sport": dict(unmatched),
                   "fliff_calls": fc.calls, "scrape_market_name_census": {k: v.most_common(40) for k, v in scrape_census.items()},
                   "xcheck_scrape_vs_parlayapi_fliff": xc, "legs_by_source": dict(Counter((l["fliff_src"], l["fair_src"]) for l in legs).most_common()),
                   "top_ev_legs": pos[:40], "safest_legs": safe[:40], "cheapest_bonus_clearing": clear[:25],
                   "best_2pick_by_ev": best_combo, "safest_2pick": safe_combo})
    meta = {"when_pt": NOW.astimezone(PT).strftime("%a %b %d %Y, %I:%M %p PT"), "hours": HOURS, "n_events": len(fevs), "pulls": pulls,
            "checks": [f"Fliff events by sport: {dict(by_sport.most_common())}",
                       f"Not matched to a sharp-market event: {dict(unmatched)}",
                       f"Graded legs by source (fliff price, fair price): {report['legs_by_source']}",
                       f"ParlayAPI calls (sport, http, credits, remaining): {[(x.get('sport'), x.get('status'), x.get('cost'), x.get('remaining')) for x in pa.log]}",
                       f"Scrape vs ParlayAPI Fliff price cross-check: {json.dumps({k: v for k, v in xc.items() if k != 'worst'})}"]}
    md = render_md(meta, legs, pos, safe, clear, best_combo, safe_combo)
    (OUT / "latest_probe.json").write_text(json.dumps(report, indent=1, default=str))
    (OUT / "latest_legs.json").write_text(json.dumps(legs, default=str))
    (OUT / "latest_report.md").write_text(md)
    (OUT / "history").mkdir(exist_ok=True)
    (OUT / "history" / f"report_{NOW.astimezone(PT).strftime('%Y%m%d_%H%M')}.md").write_text(md)
    print(f"graded legs {len(legs)} | +EV {len(pos)} | safest {len(safe)} | combos {n_combos} | pulls {pulls}", flush=True)
    print(md[:6000], flush=True)


if __name__ == "__main__":
    main()
