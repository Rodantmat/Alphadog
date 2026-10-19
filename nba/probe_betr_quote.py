#!/usr/bin/env python3
"""
PROBE - BETR SLIP PRICES FROM BETR ITSELF (2026-10-18).  READ-ONLY: only the app's own pricing QUERY is sent; no entry is created,
no CreateEntry / CancelEntry / any mutation is ever sent.

Found by probe_betr_slip.py (run 39193921294): when a pick is added, the app asks the server for the price with the GraphQL QUERY
`ValidateEntryWithRules(rulesIds, entry)` -> `validateEntryOnEntryRules`, one answer per entry rule:
  PERFECT (all must hit: perfectRegularMultiplier / perfectBoostedMultiplier), DYNAMIC (flex: dynamicMultipliers
  [{numberOfPicks, winningPicks, multiplier}] + boostedMultipliers), MYSTERY, RACE_TO_PLACE.
The multiplier is therefore priced by Betr per entry (tiers / boosted picks change it) - this probe maps it.

Steps: boot exactly like the harvest (probe_betr_slip.boot -> the NBA board), read the board answer (LeagueUpcomingEvents) and the
app's own graphql request headers from the wire, tap ONE MORE so the app sends its own ValidateEntryWithRules (its rulesIds +
headers are reused), then send, from inside the page with those headers, the same query for a ladder of entries built from the
board: all-REGULAR 2..6 picks, LESS vs MORE, same-game pairs, and 1 / 2 picks of every non-regular tier on the board.
Env: DATABASE_URL, PROXY_URL, BETR_SESSION_ID, BETR_LEAGUE (NBA), BQ_AMOUNT (1).
"""
import itertools
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_harvest_cloud as H  # noqa: E402
import probe_betr_slip as P  # noqa: E402
from seleniumbase import SB  # noqa: E402

AMOUNT = float(os.environ.get("BQ_AMOUNT", "1"))
DEFAULT_RULES = ["648a048be70ced3cb8eba3da", "6555e46c1c12427bc8c51c14", "687605cccec6b10e272c963a", "6970aa610a4f430b3e49e841"]
DROP_HDR = {"content-length", "host", "cookie", "origin", "referer", "user-agent", "accept-encoding", "connection", "accept-language"}
QUERY = ("query ValidateEntryWithRules($rulesIds: [String!]!, $entry: EntryValidation!) { validateEntryOnEntryRules(entryRulesIds: "
         "$rulesIds, entryValidation: $entry) { entryRulesId status toWin perfectRegularMultiplier perfectBoostedMultiplier gameMode "
         "dynamicMultipliers { multiplier numberOfPicks winningPicks toWin } boostedMultipliers { numberOfPicks numberOfBoostedPicks "
         "multiplier toWin } errors { code key message } edgeCombos } }")


def wire_scan(sb, state):
    """read the performance log: the board body, the app's graphql request headers, its ValidateEntryWithRules variables."""
    try:
        logs = sb.driver.get_log("performance")
    except Exception:  # noqa: BLE001
        logs = []
    for e in logs:
        try:
            m = json.loads(e["message"])["message"]
        except Exception:  # noqa: BLE001
            continue
        meth, prm = m.get("method"), m.get("params", {})
        if meth == "Network.requestWillBeSent" and "fantasy.betr.app/graphql" in prm.get("request", {}).get("url", ""):
            req = prm["request"]
            try:
                pj = json.loads(req.get("postData") or "{}")
            except Exception:  # noqa: BLE001
                pj = {}
            op = pj.get("operationName")
            state["headers"] = {k: v for k, v in (req.get("headers") or {}).items() if k.lower() not in DROP_HDR and not k.startswith(":")}
            if op == "LeagueUpcomingEvents":
                state["board_ids"].add(prm["requestId"])
            if op == "ValidateEntryWithRules":
                state["app_validate"] = pj.get("variables")
        elif meth == "Network.requestWillBeSentExtraInfo":
            h = prm.get("headers") or {}
            if any(k.lower() == "authorization" for k in h):
                state["auth_names"] = sorted(k for k in h if not k.startswith(":"))
    for rid in list(state["board_ids"]):
        try:
            b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid})
            body = json.loads(b.get("body") or "{}")
            evs, _ = H.board_events(body)
            if evs:
                state["events"] = evs
            state["board_ids"].discard(rid)
        except Exception:  # noqa: BLE001
            pass


def picks_from_board(events):
    """every OPENED projection as the app sends it in a pick (shape copied from the app's own request, run 39193921294)."""
    out = []
    for ev in events:
        if H.event_league(ev) and H.event_league(ev) != H.LEAGUE:
            continue
        for team in ev.get("teams") or []:
            for p in team.get("players") or []:
                for pr in p.get("projections") or []:
                    if pr.get("marketStatus") not in (None, "OPENED"):
                        continue
                    tier = pr.get("type")
                    line = pr.get("value") if tier == "REGULAR" else (pr.get("nonRegularValue") or pr.get("value"))
                    for opt in pr.get("allowedOptions") or []:
                        out.append({"tier": tier, "event": ev.get("id"), "team": team.get("id"), "player": p.get("id"),
                                    "who": f"{p.get('firstName', '')} {p.get('lastName', '')}".strip(), "stat": pr.get("name"),
                                    "line": line, "outcome": opt.get("outcome"),
                                    "pick": {"eventId": ev.get("id"), "league": H.LEAGUE, "marketId": pr.get("marketId"),
                                             "outcome": opt.get("outcome"), "playerId": p.get("id"),
                                             "projection": {"isLive": bool(pr.get("isLive")), "name": pr.get("name"),
                                                            "nonRegularPercentage": pr.get("nonRegularPercentage") or 0,
                                                            "nonRegularValue": pr.get("nonRegularValue") or 0,
                                                            "option": {"marketOptionId": opt.get("marketOptionId"), "outcome": opt.get("outcome")},
                                                            "type": tier, "value": pr.get("value")},
                                             "projectionName": pr.get("name"), "projectionValue": line,
                                             "sport": ev.get("sport") or "BASKETBALL", "teamId": team.get("id")}})
    return out


def quote(sb, headers, rules, picks):
    entry = {"amount": AMOUNT, "appliedPromotionIds": [], "currency": "USD", "picks": [p["pick"] for p in picks]}
    sb.driver.set_script_timeout(60)
    r = sb.driver.execute_async_script("""
      const done = arguments[arguments.length - 1];
      fetch('https://api.fantasy.betr.app/graphql', {method: 'POST', credentials: 'include',
            headers: Object.assign({}, arguments[0], {'content-type': 'application/json'}),
            body: JSON.stringify({operationName: 'ValidateEntryWithRules', query: arguments[1], variables: {rulesIds: arguments[2], entry: arguments[3]}})})
        .then(r => r.text().then(t => done([r.status, t]))).catch(e => done([0, String(e)]));""", headers, QUERY, rules, entry)
    return r


_DB = []


def store(tag, picks, x):
    """every answer is kept: nba_market.betr_quote (one row per entry rule answered)."""
    if not os.environ.get("DATABASE_URL"):
        return
    try:
        import psycopg
        if not _DB:
            _DB.append(psycopg.connect(os.environ["DATABASE_URL"], autocommit=True))
        legs = [{k: p[k] for k in ("tier", "who", "stat", "line", "outcome", "event", "team", "player")} for p in picks]
        _DB[0].execute("""INSERT INTO nba_market.betr_quote (run_file, section, n_picks, entry_rules_id, game_mode, status, amount,
                                  perfect_regular, perfect_boosted, to_win, dynamic_multipliers, boosted_multipliers, errors, edge_combos, picks)
                          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb)""",
                       (os.environ.get("BQ_RUN") or f"probe_betr_quote run {os.environ.get('GITHUB_RUN_ID', 'local')}", tag, len(picks), x.get("entryRulesId"), x.get("gameMode"),
                        x.get("status"), AMOUNT, x.get("perfectRegularMultiplier"), x.get("perfectBoostedMultiplier"), x.get("toWin"),
                        json.dumps(x.get("dynamicMultipliers") or []), json.dumps(x.get("boostedMultipliers") or []),
                        json.dumps(x.get("errors") or []), json.dumps(x.get("edgeCombos") or []), json.dumps(legs)))
    except Exception as exc:  # noqa: BLE001
        print(f"  store failed: {type(exc).__name__}: {str(exc)[:150]}", flush=True)


def show(tag, picks, r):
    desc = " + ".join(f"{p['who'].split(' ')[-1]} {p['stat']} {p['line']} {p['outcome'][0]} [{p['tier']}]" for p in picks)
    if r[0] != 200:
        print(f"QUOTE|{tag}|{len(picks)}|http {r[0]}|{r[1][:300]}|{desc}", flush=True)
        return None
    try:
        res = json.loads(r[1])["data"]["validateEntryOnEntryRules"]
    except Exception:  # noqa: BLE001
        print(f"QUOTE|{tag}|{len(picks)}|unparsed|{r[1][:400]}|{desc}", flush=True)
        return None
    for x in res:
        store(tag, picks, x)
        dyn = [(d["numberOfPicks"], d["winningPicks"], d["multiplier"]) for d in x.get("dynamicMultipliers") or []]
        bst = [(d["numberOfPicks"], d["numberOfBoostedPicks"], d["multiplier"]) for d in x.get("boostedMultipliers") or []]
        errs = [e["key"] for e in x.get("errors") or []]
        print(f"QUOTE|{tag}|{len(picks)}|{x['gameMode']}|status {x['status']}|perfect {x['perfectRegularMultiplier']} boosted "
              f"{x['perfectBoostedMultiplier']}|toWin {x['toWin']}|dyn {dyn}|bst {bst}|edge {x.get('edgeCombos')}|err {errs}|{desc}", flush=True)
    return res


def main():
    lp, proxy_arg = H.start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    state = {"headers": None, "board_ids": set(), "events": None, "app_validate": None, "auth_names": None}
    with SB(**kw) as sb:
        P.boot(sb)
        t_end = time.time() + 40
        while time.time() < t_end and not state["events"]:
            wire_scan(sb, state)
            time.sleep(2)
        # one tap so the app sends its own ValidateEntryWithRules (its rulesIds and headers are the reference)
        tap = sb.execute_script("""
          const els = [...document.querySelectorAll('div,span,button,p')].filter(e => e.children.length === 0 && /^(MORE|More)$/.test((e.innerText||e.textContent||'').trim()));
          for (const e of els) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.y > 0 && r.y < window.innerHeight) return [r.x + r.width/2, r.y + r.height/2]; }
          return null;""")
        if tap:
            for ev in ({"type": "mouseMoved", "x": tap[0], "y": tap[1]},
                       {"type": "mousePressed", "x": tap[0], "y": tap[1], "button": "left", "clickCount": 1},
                       {"type": "mouseReleased", "x": tap[0], "y": tap[1], "button": "left", "clickCount": 1}):
                sb.driver.execute_cdp_cmd("Input.dispatchMouseEvent", ev)
                time.sleep(0.12)
        t_end = time.time() + 20
        while time.time() < t_end and not state["app_validate"]:
            wire_scan(sb, state)
            time.sleep(2)
        rules = (state["app_validate"] or {}).get("rulesIds") or DEFAULT_RULES
        hdr = state["headers"] or {}
        print(f"board events: {len(state['events'] or [])}; app ValidateEntryWithRules seen: {bool(state['app_validate'])}; "
              f"rulesIds {rules}; request header names {sorted(hdr)}; auth header names (extra info) {state['auth_names']}", flush=True)
        if not state["events"]:
            print("NO BOARD captured - stop", flush=True)
            return
        allp = picks_from_board(state["events"])
        tiers = sorted({p["tier"] for p in allp})
        print(f"picks on the board: {len(allp)}; tiers {tiers}", flush=True)
        # REGULAR MORE picks, one per player, ordered so consecutive picks alternate teams (different teams / games first)
        reg = {}
        for p in allp:
            if p["tier"] == "REGULAR" and p["outcome"] == "MORE" and p["player"] not in reg:
                reg[p["player"]] = p
        by_team = {}
        for p in reg.values():
            by_team.setdefault(p["team"], []).append(p)
        teams = sorted(by_team, key=lambda t: -len(by_team[t]))
        mixed = [x for grp in itertools.zip_longest(*[by_team[t] for t in teams]) for x in grp if x]
        # cross-game first: one player per event as far as possible
        ev_seen, cross = set(), []
        for p in mixed:
            if p["event"] not in ev_seen:
                cross.append(p); ev_seen.add(p["event"])
        cross += [p for p in mixed if p not in cross]
        # 1) the app's own price check: does our call reproduce the app's answer for the app's own entry?
        r = quote(sb, hdr, rules, cross[:2])
        if r[0] != 200:
            print(f"OUR CALL REFUSED (http {r[0]}): {r[1][:300]} - stop", flush=True)
            return
        show("first_call", cross[:2], r)
        # 2) all-REGULAR ladders, two different player sets
        for off in (0, 10):
            for n in range(2, 11):
                if len(cross) >= off + n:
                    show(f"regular_more_set{off // 10}", cross[off:off + n], quote(sb, hdr, rules, cross[off:off + n]))
                    time.sleep(0.4)
        # 3) LESS instead of MORE on the same players
        less = []
        for p in cross[:6]:
            q = next((x for x in allp if x["player"] == p["player"] and x["tier"] == "REGULAR" and x["outcome"] == "LESS"
                      and x["stat"] == p["stat"]), None)
            if q:
                less.append(q)
        for n in range(2, min(6, len(less)) + 1):
            show("regular_less", less[:n], quote(sb, hdr, rules, less[:n]))
            time.sleep(0.5)
        # 3b) k LESS picks among n (the rest MORE on other players): is LESS priced per pick?
        if os.environ.get("BQ_ONLY_LESS"):
            more_pool = [p for p in cross if p["player"] not in {q["player"] for q in less}]
            for n in range(2, 7):
                for k in range(1, n + 1):
                    if k <= len(less) and n - k <= len(more_pool):
                        legs = less[:k] + more_pool[:n - k]
                        show(f"less_k{k}_of{n}", legs, quote(sb, hdr, rules, legs))
                        time.sleep(0.4)
            # LESS on different stats (is the discount per stat?)
            for st in sorted({x["stat"] for x in allp if x["tier"] == "REGULAR" and x["outcome"] == "LESS"})[:12]:
                q = [x for x in allp if x["tier"] == "REGULAR" and x["outcome"] == "LESS" and x["stat"] == st]
                if q:
                    legs = [q[0]] + [p for p in cross if p["player"] != q[0]["player"]][:2]
                    show(f"less_stat_{st}", legs, quote(sb, hdr, rules, legs))
                    time.sleep(0.4)
            return
        # 4) same-game: two players of the same event, opposite teams, then same team
        for evid in list(ev_seen)[:2]:
            same = [p for p in mixed if p["event"] == evid]
            two_teams = []
            for p in same:
                if not two_teams or p["team"] != two_teams[0]["team"]:
                    two_teams.append(p)
                if len(two_teams) == 2:
                    break
            if len(two_teams) == 2:
                show("same_game_2teams", two_teams, quote(sb, hdr, rules, two_teams))
            same_team = [p for p in same if p["team"] == same[0]["team"]][:2]
            if len(same_team) == 2:
                show("same_team_plus_other", same_team + [p for p in cross if p["event"] != evid][:1],
                     quote(sb, hdr, rules, same_team + [p for p in cross if p["event"] != evid][:1]))
        # 5) each non-regular tier: 1 boosted pick + (n-1) regular picks of other players, n = 2..5; then 2 boosted picks
        for tier in [t for t in tiers if t != "REGULAR"]:
            bp = [p for p in allp if p["tier"] == tier]
            if not bp:
                continue
            boosted, used = [], set()
            for p in bp:
                if p["player"] not in used:
                    boosted.append(p); used.add(p["player"])
            for k in range(1, min(4, len(boosted)) + 1):
                others = [p for p in cross if p["player"] not in {b["player"] for b in boosted[:k]}]
                for n in range(max(2, k + 1), 7):
                    legs = boosted[:k] + others[:n - k]
                    show(f"tier_{tier}_x{k}", legs, quote(sb, hdr, rules, legs))
                    time.sleep(0.4)
        # 5b) two different non-regular tiers in one entry
        nonreg = [t for t in tiers if t != "REGULAR"]
        for t1, t2 in itertools.combinations(nonreg, 2):
            a = next((p for p in allp if p["tier"] == t1), None)
            b = next((p for p in allp if p["tier"] == t2 and a and p["player"] != a["player"]), None)
            if a and b:
                others = [p for p in cross if p["player"] not in (a["player"], b["player"])]
                for n in (3, 4):
                    legs = [a, b] + others[:n - 2]
                    show(f"mix_{t1}+{t2}", legs, quote(sb, hdr, rules, legs))
                    time.sleep(0.4)
        # 6) same tier, different lines: is the boost multiplier per tier or per line?
        for tier in [t for t in tiers if t != "REGULAR"][:3]:
            bp = [p for p in allp if p["tier"] == tier][:4]
            for b in bp[1:]:
                legs = [b] + [p for p in cross if p["player"] != b["player"]][:2]
                show(f"tier_{tier}_other_line", legs, quote(sb, hdr, rules, legs))
                time.sleep(0.5)
    if lp:
        lp.terminate()


if __name__ == "__main__":
    main()
