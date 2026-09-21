#!/usr/bin/env python3
"""
PrizePicks payout mapper - SERVER-SIDE, ANONYMOUS.

HOW ACCESS WAS ESTABLISHED (probe 4, 2026-09-21). /game_types answered from a GitHub runner through
PROXY_URL when the request used a CURRENT, INTERNALLY CONSISTENT fingerprint (curl_cffi chrome146 -
chrome124/136 were captcha'd), a Session, and a warm-up. PrizePicks issued its OWN anonymous
_prizepicks_session + CSRF-TOKEN: no owner account is ever involved.

WHAT IT MAPS (NBA board), structured sections first so a mid-run block still leaves the valuable data:
  VALIDATE  the known Tatum goblin + Wemby demon pair            -> must return 2.2
  BASE      all-standard slips at 2..6 picks, distinct games
  FLEX      sizes 3..6 with 1 goblin / 1 demon / 2 goblins / goblin+demon
  ALTALT    alt x alt 2-picks across games (multiplicativity, Power AND Flex)
  SAMEGAME  standard + standard from the SAME game               (same-game discount)
  UNDER     standard legs on Less, and goblins/demons sent as Less (is Less offered at all?)
  LEG       every goblin/demon, 2-pick vs a standard from another game - the bulk
Every record keeps the FULL Power and Flex tables, the reversion schedule (payouts_srp), the
is_adjusted flag and the legs' lines, so nothing has to be re-queried to test a new hypothesis.

RESILIENCE: on a captcha, rotate fingerprint + rebuild the session + re-warm, retry once.
Three consecutive blocks -> stop and keep what was collected. Output is ALWAYS written.
OUTPUT: nba/data/pp_payouts/pp_payout_map_<utc>.json
SAFETY: /game_types is a price quote. Nothing is ever placed.
"""
import json
import os
import random
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.prizepicks.com"
LEAGUE = 7
BOARD_URLS = [f"{API}/projections?league_id={LEAGUE}&per_page=1000&single_stat=true",
              f"https://partner-api.prizepicks.com/projections?league_id={LEAGUE}&per_page=1000&single_stat=true"]
BOARD_HEADERS = {"accept": "application/json, text/plain, */*", "accept-language": "en-US,en;q=0.9",
                 "cache-control": "no-cache", "pragma": "no-cache",
                 "referer": "https://app.prizepicks.com/", "origin": "https://app.prizepicks.com",
                 "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                               "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
KNOWN = ["13975905", "13976089"]
QUOTE_TARGETS = ["chrome146", "chrome150", "chrome145"]
MAX_Q = int(os.getenv("PP_MAX_QUOTES", "250"))
N_ALTALT = int(os.getenv("PP_ALTALT", "20"))
MODE = (os.getenv("PP_MODE") or "full").strip().lower()   # full = research map | delta = monitoring
N_DRIFT = int(os.getenv("PP_DRIFT_SAMPLE", "10"))


def already_mined():
    """(projection_id, line) pairs already in nba_market.pp_mined_leg - the delta baseline.
    No DATABASE_URL -> empty baseline, announced loudly: every leg then counts as new (never silently skipped)."""
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        print("DELTA|WARNING no DATABASE_URL - empty baseline, every leg counts as new", flush=True)
        return set()
    import psycopg
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("SELECT DISTINCT projection_id, line FROM nba_market.pp_mined_leg")
        return {(str(r[0]), float(r[1])) for r in cur.fetchall()}
DEADLINE = time.time() + float(os.getenv("PP_MAX_MINUTES", "34")) * 60
OUT_DIR = Path("nba/data/pp_payouts")


class Stop(Exception):
    pass


def utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def proxies():
    u = (os.getenv("PROXY_URL") or "").strip()
    return {"http": u, "https": u} if u else None


def app_headers(extra=None):
    h = {"accept": "application/json", "origin": "https://app.prizepicks.com",
         "referer": "https://app.prizepicks.com/",
         "sec-fetch-site": "same-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
    if extra:
        h.update(extra)
    return h


def fetch_board(px):
    from curl_cffi import requests
    for url in BOARD_URLS:
        for attempt in (1, 2):
            try:
                r = requests.get(url, headers=BOARD_HEADERS, proxies=px, timeout=45, impersonate="chrome124")
                print(f"BOARD|{r.status_code}|{url.split('/')[2]}|attempt {attempt}", flush=True)
                if r.status_code == 200:
                    doc = r.json()
                    if (doc.get("data") or []):
                        return doc
            except Exception as exc:  # noqa: BLE001
                print(f"BOARD|ERR|{str(exc)[:80]}", flush=True)
            time.sleep(6)
    return None


def parse_board(doc):
    names = {i["id"]: (i.get("attributes") or {}).get("display_name")
             for i in doc.get("included") or [] if i.get("type") == "new_player"}
    rows = []
    for p in doc.get("data") or []:
        a = p.get("attributes") or {}
        rel = ((p.get("relationships") or {}).get("new_player") or {}).get("data") or {}
        if a.get("line_score") is None or not rel.get("id"):
            continue
        rows.append({"id": str(p["id"]), "player": rel["id"], "name": names.get(rel["id"]) or rel["id"],
                     "stat": a.get("stat_type"), "line": float(a["line_score"]),
                     "odds": (a.get("odds_type") or "standard").lower(),
                     "game": str(a.get("game_id") or a.get("start_time")),
                     "start": a.get("start_time"), "adjusted_odds": a.get("adjusted_odds")})
    return rows


class Quoter:
    def __init__(self, px):
        self.px, self.ti, self.blocks, self.n = px, 0, 0, 0
        self.s, self.target = None, None
        self.new_session()

    def new_session(self):
        from curl_cffi import requests
        self.target = QUOTE_TARGETS[self.ti % len(QUOTE_TARGETS)]
        self.s = requests.Session(impersonate=self.target)
        self.dev = str(uuid.uuid4())
        try:
            self.s.get(BOARD_URLS[0].replace("per_page=1000", "per_page=50"),
                       headers=app_headers(), proxies=self.px, timeout=40)
        except Exception:  # noqa: BLE001
            pass
        print(f"SESSION|{self.target}|cookies={sorted(self.s.cookies.keys())}", flush=True)
        time.sleep(1.5)

    def _post(self, picks):
        body = {"new_wager": {"amount_bet_cents": 2000,
                              "picks": [{"wager_type": side, "projection_id": pid} for pid, side in picks],
                              "pick_protection": False},
                "game_mode": "prizepools"}
        h = app_headers({"content-type": "application/json", "x-device-id": self.dev,
                         "x-device-info": ("anonymousId=,name=,os=web,osVersion=,platform=web,"
                                           "appVersion=,gameMode=prizepools,stateCode=")})
        r = self.s.post(API + "/game_types", headers=h, data=json.dumps(body), proxies=self.px, timeout=40)
        return r.status_code, (r.text or "")

    def quote(self, picks):
        if self.n >= MAX_Q or time.time() > DEADLINE:
            raise Stop("budget")
        self.n += 1
        for retry in (0, 1):
            try:
                st, txt = self._post(picks)
            except Exception as exc:  # noqa: BLE001
                st, txt = -1, str(exc)[:200]
            captcha = "captcha-delivery" in txt
            if not captcha:
                self.blocks = 0
                break
            self.blocks += 1
            print(f"BLOCK|{self.target}|consecutive={self.blocks}", flush=True)
            if self.blocks >= 3:
                raise Stop("three consecutive blocks")
            self.ti += 1
            self.new_session()
        time.sleep(1.2 + random.random() * 0.8)
        rec = {"status": st, "t": utc(), "target": self.target}
        try:
            j = json.loads(txt)
        except Exception:  # noqa: BLE001
            rec["error"] = txt[:300]
            return rec
        if not isinstance(j, dict) or not j.get("data"):
            rec["error"] = txt[:300]
            return rec
        for gt in j["data"]:
            a = gt.get("attributes") or {}
            key = "power" if a.get("name") == "Power Play" else "flex" if a.get("name") == "Flex Play" else None
            if not key:
                continue
            pay = dict(a.get("payouts") or {})
            rec[key + "_adj"] = pay.pop("is_adjusted", None)
            rec[key] = pay
            rec[key + "_srp"] = (a.get("payouts_srp") or {}).get(key)
            rec[key + "_max_alert"] = a.get("is_max_payout_alert")
        return rec


def leg(r, side="over"):
    return {"id": r["id"], "name": r["name"], "stat": r["stat"], "line": r["line"],
            "odds": r["odds"], "game": r["game"], "side": side}


def pick_distinct(pool, k, avoid_games=(), avoid_players=()):
    out, g, p = [], set(avoid_games), set(avoid_players)
    if k <= 0:                        # asked for none -> return none (the old code appended one
        return out                    # BEFORE checking, so k=0 silently returned 1 leg)
    for r in pool:
        if r["game"] in g or r["player"] in p:
            continue
        out.append(r)
        g.add(r["game"])
        p.add(r["player"])
        if len(out) >= k:
            break
    return out


def main():
    px = proxies()
    started = utc()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"pp_payout_map_{started.replace(':', '').replace('-', '')}.json"
    result = {"meta": {"started": started, "league": LEAGUE, "game_mode": "prizepools",
                       "max_quotes": MAX_Q, "targets": QUOTE_TARGETS}, "board": [], "quotes": []}

    def save(reason):
        result["meta"].update({"finished": utc(), "stop_reason": reason, "quotes": len(result["quotes"])})
        out_path.write_text(json.dumps(result, indent=1), encoding="utf-8")
        print(f"WROTE|{out_path}|quotes={len(result['quotes'])}|reason={reason}", flush=True)

    doc = fetch_board(px)
    if not doc:
        save("board unavailable")
        return 0
    rows = parse_board(doc)
    result["board"] = rows
    std = [r for r in rows if r["odds"] == "standard"]
    alt = [r for r in rows if r["odds"] in ("goblin", "demon")]
    gob = [r for r in alt if r["odds"] == "goblin"]
    dem = [r for r in alt if r["odds"] == "demon"]
    games = sorted({r["game"] for r in rows})
    print(f"BOARD_ROWS|{len(rows)}|std={len(std)}|goblin={len(gob)}|demon={len(dem)}|games={len(games)}", flush=True)

    q = Quoter(px)

    def run(section, legs_, note=None):
        rec = q.quote([(l["id"], l["side"]) for l in legs_])
        rec.update({"section": section, "n": len(legs_), "legs": legs_,
                    "n_games": len({l["game"] for l in legs_})})
        if note:
            rec["note"] = note
        result["quotes"].append(rec)
        p = (rec.get("power") or {}).get(str(len(legs_)), {}).get(str(len(legs_)))
        f = (rec.get("flex") or {}).get(str(len(legs_)))
        print(f"Q|{section}|n={len(legs_)}|st={rec['status']}|power={p}|flex={f}|adj={rec.get('power_adj')}"
              f"|{' + '.join(l['name'].split()[-1] + ':' + l['odds'][0] + ':' + str(l['line']) + (':U' if l['side'] == 'under' else '') for l in legs_)}",
              flush=True)
        return rec

    try:
        # VALIDATE
        by_id = {r["id"]: r for r in rows}
        known = [by_id.get(k) or {"id": k, "name": k, "stat": "?", "line": 0, "odds": "?", "game": "?"} for k in KNOWN]
        run("VALIDATE", [leg(r) for r in known], "expect power 2.2")

        # BASE: all-standard, distinct games, 2..6
        base_legs = pick_distinct(std, 6)
        for k in range(2, len(base_legs) + 1):
            run("BASE", [leg(r) for r in base_legs[:k]])

        # FLEX compositions at 3..6 - same legs across sizes, so size is the only thing that varies
        comps = [("1g", 1, 0), ("1d", 0, 1), ("2g", 2, 0), ("gd", 1, 1),
                 ("2d", 0, 2), ("3d", 0, 3), ("gdd", 1, 2), ("ggd", 2, 1)]
        for k in range(3, 7):
            for comp, ng, nd in comps:
                if ng + nd >= k:
                    continue
                gs = pick_distinct(gob, ng)
                ds = pick_distinct(dem, nd, avoid_games=[r["game"] for r in gs],
                                   avoid_players=[r["player"] for r in gs])
                if len(ds) < nd:
                    ds = pick_distinct(dem, nd, avoid_players=[r["player"] for r in gs])
                alts = gs + ds
                if len(alts) < ng + nd:
                    continue
                stds = pick_distinct(std, k - len(alts), avoid_games=[r["game"] for r in alts],
                                     avoid_players=[r["player"] for r in alts])
                if len(stds) < k - len(alts):
                    stds = pick_distinct(std, k - len(alts), avoid_players=[r["player"] for r in alts])
                if len(stds) + len(alts) == k:
                    run("FLEX", [leg(r) for r in stds + alts], f"size {k} comp {comp}")

        # ALTALT: alt x alt across games, STRATIFIED over gob*gob / dem*gob / dem*dem (keys are the
        # SORTED odds initials: "dd", "dg", "gg") so the consolation-tier rule sees every combination
        # type (104 demons vs 52 goblins would otherwise swamp a plain random draw with demon*demon)
        strata, seen = {"gg": [], "dg": [], "dd": []}, set()
        for a in alt:
            for b in alt:
                if a["game"] == b["game"] or a["player"] == b["player"]:
                    continue
                key = tuple(sorted((a["id"], b["id"])))
                if key in seen:
                    continue
                seen.add(key)
                kind = "".join(sorted(x["odds"][0] for x in (a, b)))
                strata[kind].append((a, b))
        rng = random.Random(7)
        for v in strata.values():
            rng.shuffle(v)
        print(f"ALTALT_POOL|gg={len(strata['gg'])}|dg={len(strata['dg'])}|dd={len(strata['dd'])}|target={N_ALTALT}", flush=True)
        picked = []
        while len(picked) < N_ALTALT and any(strata.values()):
            for k in ("gg", "dg", "dd"):
                if strata[k] and len(picked) < N_ALTALT:
                    picked.append(strata[k].pop())
        for a, b in picked:
            run("ALTALT", [leg(a), leg(b)])

        # SAMEGAME: standard + standard, same game
        n_sg = 0
        for g in games:
            same, seen_p = [], set()          # distinct PLAYERS, deliberately the SAME game
            for r in std:
                if r["game"] == g and r["player"] not in seen_p:
                    same.append(r)
                    seen_p.add(r["player"])
                if len(same) == 2:
                    break
            if len(same) == 2 and n_sg < 8:
                run("SAMEGAME", [leg(r) for r in same])
                n_sg += 1

        # UNDER: standard on Less; alt legs sent as Less
        partner = base_legs[0] if base_legs else None
        if partner:
            for r in pick_distinct(std, 4, avoid_games=[partner["game"]], avoid_players=[partner["player"]]):
                run("UNDER", [leg(partner), leg(r, "under")], "standard on Less")
            for r in pick_distinct(gob, 2, avoid_games=[partner["game"]]) + pick_distinct(dem, 2, avoid_games=[partner["game"]]):
                run("UNDER", [leg(partner), leg(r, "under")], f"{r['odds']} sent as Less")

        # LEG: every goblin/demon vs a standard from another game - round-robin across stats
        partners = pick_distinct(std, 4)
        ladders = {}
        for r in alt:
            ladders.setdefault((r["stat"], r["player"]), []).append(r)
        by_stat = {}
        for (stat, _), rs in ladders.items():
            by_stat.setdefault(stat, []).append(sorted(rs, key=lambda x: x["line"]))
        order = []
        while any(by_stat.values()):
            for stat in sorted(by_stat):
                if by_stat[stat]:
                    order.append(by_stat[stat].pop(0))
        for lad in order:
            for r in lad:
                p = next((x for x in partners if x["game"] != r["game"] and x["player"] != r["player"]), None)
                if p:
                    run("LEG", [leg(p), leg(r)])
        save("complete")
    except Stop as s:
        save(str(s))
    except Exception as exc:  # noqa: BLE001
        save(f"error: {str(exc)[:160]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
