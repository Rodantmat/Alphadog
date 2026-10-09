#!/usr/bin/env python3
"""
Betr FULLY-CLOUD harvester (2026-09-28) — runs entirely on a GitHub Actions runner, no owner machine.
Proven chain: local proxy.py (unauth) -> ProxyScrape US-sticky residential; SeleniumBase UC+Xvfb clears
Cloudflare; seeded BETR_SESSION_STATE clears /auth; select US state clears geo; intercept the app's own
getUpcomingEventsV2. Parses projections (main + alt ladder + tier) identically to nba/betr_harvest.py and
writes boards/betr_<league>_current.json (+ _meta) and betr_nba_current.json for NBA. The workflow commits it.

Env: PROXY_URL, BETR_SESSION_STATE (from betr_export_session.py), BETR_LEAGUE (WNBA|NBA),
     BETR_STATE (default California), BETR_LOCAL_PROXY_PORT (8899).
Exit 0 only if a board was written.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from seleniumbase import SB

URL = "https://picks.betr.app/"
LEAGUE = os.environ.get("BETR_LEAGUE", "NBA").upper()
STATE = os.environ.get("BETR_STATE", "California")
PROXY = os.environ.get("PROXY_URL", "").strip()
LOCAL_PORT = int(os.environ.get("BETR_LOCAL_PROXY_PORT", "8899"))
OUT = Path(os.environ.get("BETR_OUT_DIR", "boards"))
OUT.mkdir(parents=True, exist_ok=True)


# ---- parsing (mirrors nba/betr_harvest.py, verified field mapping) --------------------------------
def parse_leg(ev, team, player, proj):
    legs = []
    line = proj.get("value")
    if line is None:
        return legs
    name = f"{player.get('firstName','')} {player.get('lastName','')}".strip()
    stat = proj.get("key") or proj.get("name") or proj.get("label")
    tier = proj.get("type")
    opts = [str(o.get("outcome")).upper() for o in (proj.get("allowedOptions") or [])]
    base = {"event_id": str(ev.get("id")), "player": name, "player_id": str(player.get("id")),
            "team": (team or {}).get("name"), "stat": stat, "tier": tier, "market_id": proj.get("marketId"),
            "status": proj.get("marketStatus"), "start_time": ev.get("date")}
    legs.append({**base, "line": line, "alt": False, "over": "MORE" in opts, "under": "LESS" in opts})
    alt = proj.get("nonRegularValue")
    if alt is not None and alt > 0 and alt != line:
        legs.append({**base, "line": alt, "alt": True, "alt_percentage": proj.get("nonRegularPercentage")})
    return legs


# BOARD OPERATIONS. Betr renamed its GraphQL board operations (found 2026-10-09 by the wire trail): the lobby now answers
# getUpcomingLobbyEventsV2 (+ getTopTrendingPlayersData) and a league board getEventsWithFilteredPlayers; getUpcomingEventsV2
# (the 2026-09-28 shape) is kept first for parity with the archived boards. Whichever is present with events is the board.
BOARD_OPS = ("getUpcomingEventsV2", "getEventsWithFilteredPlayers", "getUpcomingLobbyEventsV2")


def board_events(body):
    data = (body or {}).get("data") or {}
    for op in BOARD_OPS:
        v = data.get(op)
        if isinstance(v, list):
            return v, op
        if isinstance(v, dict):
            for k in ("events", "items", "data", "edges"):
                if isinstance(v.get(k), list):
                    return [e.get("node", e) if isinstance(e, dict) else e for e in v[k]], f"{op}.{k}"
    return [], None


def schema(x, depth=0, max_depth=4):
    """compact shape of a JSON value for the log: dict keys / list length and the first element's shape"""
    if depth >= max_depth:
        return "…"
    if isinstance(x, dict):
        return {k: schema(v, depth + 1, max_depth) for k, v in list(x.items())[:14]}
    if isinstance(x, list):
        return [f"list[{len(x)}]", schema(x[0], depth + 1, max_depth) if x else None]
    return type(x).__name__


def event_league(ev):
    return str(ev.get("league") or ev.get("leagueName") or (ev.get("sport") if isinstance(ev.get("sport"), str) else "") or "").upper()


def flatten(body):
    """legs of THIS league only. The lobby answer (getUpcomingLobbyEventsV2) mixes every sport - on 2026-10-09 it carried WNBA
    finals, college football, UFC and esports next to 3 NBA preseason games; the first capture on the renamed API wrote 838
    mixed legs as the NBA board (run 38003010258). Events are filtered on their own league field; an event without one is
    kept only when nothing on it says another sport."""
    events, _op = board_events(body)
    legs = []; n_ev = 0
    for ev in events:
        lg = event_league(ev)
        if lg and lg != LEAGUE:
            continue
        n_ev += 1
        buckets = [(t, t.get("players", []) or []) for t in (ev.get("teams") or [])]
        if ev.get("players"):
            buckets.append((None, ev.get("players")))
        for team, players in buckets:
            for p in players:
                for proj in (p.get("projections") or []):
                    legs.extend(parse_leg(ev, team, p, proj))
    return legs, n_ev


# ---- local forward-proxy (unauth to Chrome, upstream to ProxyScrape US-sticky) --------------------
def start_local_proxy():
    if not PROXY:
        return None, None
    raw = PROXY.split("://", 1)[-1].rstrip("/").split("/", 1)[0]
    if "@" not in raw:
        return None, raw
    creds, host = raw.rsplit("@", 1)
    user, _, pw = creds.partition(":")
    sid = os.environ.get("BETR_SESSION_ID", "betrcloud1")
    # STICKY US SESSION, provider-aware (2026-10-08): the proxy moved from ProxyScrape to DataImpulse (credential store
    # nba_config.external_credentials/proxy_url). Each provider spells targeting in the username differently:
    #   DataImpulse  login__cr.us;sessid.<id>          (docs.dataimpulse.com/proxies/parameters/session-id; ~30-min session)
    #   ProxyScrape  login-country-us-session-<id>-lifetime-10
    # A URL that already carries a session is used as given.
    if "dataimpulse" in host:
        if "sessid." not in user:
            base = user.split("__", 1)[0]          # drop any targeting already in the URL (e.g. __cr.us) and rebuild
            user = f"{base}__cr.us;sessid.{sid}"
    elif "-session-" not in user:
        user = f"{user}-country-us-session-{sid}-lifetime-10"
    cmd = [sys.executable, "-m", "proxy", "--hostname", "127.0.0.1", "--port", str(LOCAL_PORT),
           "--plugins", "proxy.plugin.ProxyPoolPlugin", "--proxy-pool", f"{user}:{pw}@{host}"]
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(4)
    return p, f"127.0.0.1:{LOCAL_PORT}"


# ---- SELF-RENEWING SESSION (owner 2026-10-09: "one of the apps needs a key update every ~30 days - make it auto") --------
# The seeded session's localStorage 'user-session-storage' carries three Keycloak JWTs: the ACCESS token (Bearer, 30-day exp),
# the OFFLINE refresh token (never expires) and the ID token (30-day exp). Probe 38000165529 proved the refresh grant works
# headless (account.betr.app, client betr-rn: new 30-day access + id token, rotated refresh token, refresh_expires_in 0).
# So the harvester renews the session itself: when the access token is within RENEW_DAYS of expiry it refreshes with the
# session's OWN refresh token, swaps the three tokens inside the stored value, and persists the renewed state in the
# credential store (nba_config.external_credentials 'betr_session_state'), which is read FIRST on the next run; the GitHub
# secret BETR_SESSION_STATE is only the seed / fallback. Nothing is ever printed but expiry dates and 6-char hashes.
import base64
import hashlib
import re
import urllib.parse
import urllib.request

KC_TOKEN = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
RENEW_DAYS = int(os.environ.get("BETR_RENEW_DAYS", "12"))
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")


def _claims(tok):
    try:
        p = tok.split(".")[1]; p += "=" * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p))
    except Exception:  # noqa: BLE001
        return {}


def _h6(s):
    return hashlib.sha256((s or "").encode()).hexdigest()[:6]


def load_session_state():
    """(state_json, source): the credential store's renewed copy first, the GitHub secret as the seed / fallback."""
    db = os.environ.get("DATABASE_URL")
    if db:
        try:
            import psycopg
            with psycopg.connect(db) as c:
                r = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='betr_session_state'").fetchone()
            if r and r[0] and r[0].strip().startswith("{"):
                return r[0].strip(), "credential store"
        except Exception as exc:  # noqa: BLE001
            print(f"session: credential store unavailable ({str(exc)[:80]}) - using the secret", flush=True)
    return os.environ.get("BETR_SESSION_STATE", "").strip(), "secret"


def renew_session_state(st):
    """Refresh the Keycloak tokens inside the seeded session when the access token is close to expiry. Returns the (possibly
    renewed) state JSON text and a short status line. Never raises: a failed renewal leaves the state as it was."""
    try:
        s = json.loads(st)
        ls = s.get("localStorage") or {}
        key = next((k for k, v in ls.items() if isinstance(v, str) and len(JWT_RE.findall(v)) >= 2), None)
        if key is None:
            return st, "session: no token bundle in localStorage (nothing to renew)"
        toks = {}
        for t in JWT_RE.findall(ls[key]):
            c = _claims(t)
            toks[c.get("typ")] = t
        access, refresh, idt = toks.get("Bearer"), toks.get("Offline") or toks.get("Refresh"), toks.get("ID")
        if not access or not refresh:
            return st, f"session: bundle has {sorted(toks)} - cannot renew without Bearer + Offline"
        exp = datetime.fromtimestamp(int(_claims(access).get("exp") or 0), timezone.utc)
        days = (exp - datetime.now(timezone.utc)).total_seconds() / 86400
        if days > RENEW_DAYS:
            return st, f"session: access token {_h6(access)} valid until {exp:%Y-%m-%d} ({days:.1f} d) - no renewal needed"
        cid = os.environ.get("BETR_CLIENT_ID", "").strip() or str(_claims(access).get("azp") or "betr-rn")
        body = urllib.parse.urlencode({"grant_type": "refresh_token", "client_id": cid, "refresh_token": refresh}).encode()
        req = urllib.request.Request(KC_TOKEN, data=body, headers={"Content-Type": "application/x-www-form-urlencoded",
                                                                   "Accept": "application/json", "User-Agent": "okhttp/4.9.2"})
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.loads(r.read().decode())
        new_access, new_refresh, new_id = j.get("access_token"), j.get("refresh_token"), j.get("id_token")
        if not new_access:
            return st, f"session: Keycloak answered without an access token ({sorted(j)})"
        v = ls[key].replace(access, new_access)
        if new_refresh:
            v = v.replace(refresh, new_refresh)
        if idt and new_id:
            v = v.replace(idt, new_id)
        ls[key] = v
        s["localStorage"] = ls
        s["renewed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        new_exp = datetime.fromtimestamp(int(_claims(new_access).get("exp") or 0), timezone.utc)
        out = json.dumps(s, separators=(",", ":"))
        db = os.environ.get("DATABASE_URL")
        persisted = "not persisted (no DATABASE_URL)"
        if db:
            try:
                import psycopg
                with psycopg.connect(db) as c:
                    c.execute("""INSERT INTO nba_config.external_credentials (credential_key, credential_value_encrypted) VALUES ('betr_session_state', %s)
                                 ON CONFLICT (credential_key) DO UPDATE SET credential_value_encrypted = EXCLUDED.credential_value_encrypted, updated_at = now()""", (out,))
                    if new_refresh:
                        c.execute("""INSERT INTO nba_config.external_credentials (credential_key, credential_value_encrypted) VALUES ('betr_refresh_token', %s)
                                     ON CONFLICT (credential_key) DO UPDATE SET credential_value_encrypted = EXCLUDED.credential_value_encrypted, updated_at = now()""", (new_refresh,))
                    c.commit()
                persisted = "persisted to the credential store"
            except Exception as exc:  # noqa: BLE001
                persisted = f"NOT persisted ({str(exc)[:80]}) - the renewed tokens live only in this run"
        return out, (f"session: RENEWED - access {_h6(access)} (exp {exp:%Y-%m-%d}) -> {_h6(new_access)} (exp {new_exp:%Y-%m-%d}), "
                     f"refresh rotated: {bool(new_refresh and new_refresh != refresh)}; {persisted}")
    except Exception as exc:  # noqa: BLE001
        return st, f"session: renewal failed ({type(exc).__name__}: {str(exc)[:120]}) - using the state as loaded"


def click_league(sb):
    """Open the league board IN-PAGE (no navigation, so the CDP session stays attached and every graphql body is readable).
    The app (2026-10-09) renders a horizontal strip of league chips ("NFL | MLB | WNBA | CFB | ... | NBA | ...") as leaf
    text nodes of a React-Native-web Pressable, most of them off-screen. Run 38004204387 proved a synthetic JS .click()
    does NOT register (the lobby stayed put): RNW's press responder wants real pointer events. So: scroll the leaf into
    view, read its rect, and press it with a REAL mouse through CDP (Input.dispatchMouseEvent); fall back to a dispatched
    pointer/mouse event sequence, then to the old XPaths."""
    # the strip is a horizontal ScrollView: WNBA (on screen) pressed fine on run 38005105453, NBA (off screen, scrolled into
    # view) did not on 38005446245 - the rect was read in the same script as the scroll. Scroll first, let the strip settle,
    # then re-read the rect and check what elementFromPoint finds under it before pressing.
    find_js = ("var L=arguments[0]; var els=Array.from(document.querySelectorAll('div,span,button,a,p')).filter(function(e){"
               " return e.children.length===0 && (e.innerText||e.textContent||'').trim()===L;}); if(!els.length) return null;"
               " var e=els[0];")
    try:
        sb.execute_script(find_js + " e.scrollIntoView({inline:'center',block:'center',behavior:'instant'}); return 1;", LEAGUE)
        time.sleep(1.2)
        rect = sb.execute_script(find_js + " var r=e.getBoundingClientRect(); var u=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);"
                                 " var hit=u&&(u===e||u.contains(e)||e.contains(u)); return [r.left+r.width/2, r.top+r.height/2, els.length,"
                                 " r.width, r.height, hit?1:0, u?((u.innerText||'').trim().slice(0,20)):'', window.innerWidth, window.innerHeight];", LEAGUE)
    except Exception as exc:  # noqa: BLE001
        rect = None; print(f"  league chip lookup failed: {str(exc)[:80]}", flush=True)
    if rect and rect[3] > 0 and rect[4] > 0:
        x, y = float(rect[0]), float(rect[1])
        on_screen = 0 <= x <= float(rect[7]) and 0 <= y <= float(rect[8])
        try:
            for ev in ({"type": "mouseMoved", "x": x, "y": y},
                       {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1},
                       {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1}):
                sb.driver.execute_cdp_cmd("Input.dispatchMouseEvent", ev)
                time.sleep(0.12)
            time.sleep(2.5)
            routed = LEAGUE.lower() in (sb.get_current_url() or "").lower()
            if routed:
                return (f"cdp mouse click on '{LEAGUE}' leaf at ({x:.0f},{y:.0f}) -> route reached "
                        f"[{int(rect[2])} leaf(s), under pointer: {'leaf' if rect[5] else repr(rect[6])}]")
            print(f"  cdp mouse click on '{LEAGUE}' leaf at ({x:.0f},{y:.0f}) did not change the route "
                  f"(on screen: {on_screen}, viewport {int(rect[7])}x{int(rect[8])}, under pointer: "
                  f"{'the leaf' if rect[5] else repr(rect[6])}) - trying a dispatched pointer sequence", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  cdp mouse click failed: {str(exc)[:80]}", flush=True)
        try:
            n = sb.execute_script(
                "var L=arguments[0]; var els=Array.from(document.querySelectorAll('div,span,button,a,p')).filter(function(e){"
                " return e.children.length===0 && (e.innerText||e.textContent||'').trim()===L;});"
                " if(!els.length) return 0; var e=els[0]; var r=e.getBoundingClientRect(); var o={bubbles:true,cancelable:true,"
                " clientX:r.left+r.width/2, clientY:r.top+r.height/2, button:0, buttons:1, pointerId:1, pointerType:'mouse', isPrimary:true};"
                " ['pointerdown','mousedown'].forEach(function(t){e.dispatchEvent(t.indexOf('pointer')==0?new PointerEvent(t,o):new MouseEvent(t,o));});"
                " o.buttons=0; ['pointerup','mouseup','click'].forEach(function(t){e.dispatchEvent(t.indexOf('pointer')==0?new PointerEvent(t,o):new MouseEvent(t,o));});"
                " return els.length;", LEAGUE)
            if n:
                return f"pointer-event sequence on {n} '{LEAGUE}' leaf(s)"
        except Exception:  # noqa: BLE001
            pass
    for xp in (f'//*[normalize-space(text())="{LEAGUE}"]', f'//a[contains(.,"{LEAGUE}")]', f'//button[contains(.,"{LEAGUE}")]'):
        try:
            if sb.is_element_visible(xp):
                sb.click(xp, timeout=4)
                return f"xpath click {xp}"
        except Exception:  # noqa: BLE001
            continue
    return "no league chip found"


def enable_network(sb):
    """(re)enable the CDP Network domain with a big body buffer. uc_open_with_reconnect detaches chromedriver for the
    navigation, so every response that arrives while it is detached has NO readable body afterwards ('graphql body
    unreadable', 4 of 5 on run 38004204387 - the lobby answer with the league's featured players was among them). Call this
    after every reconnect, and fetch the board through IN-PAGE actions (chip clicks) so the session stays attached."""
    try:
        sb.driver.execute_cdp_cmd("Network.enable", {"maxTotalBufferSize": 200_000_000, "maxResourceBufferSize": 50_000_000})
    except Exception:  # noqa: BLE001
        try:
            sb.driver.execute_cdp_cmd("Network.enable", {})
        except Exception:  # noqa: BLE001
            pass


def where(sb, tag):
    """DIAGNOSTIC TRAIL (2026-10-09): every failure used to end in a bare 'NO BOARD'. Print where the browser actually is -
    URL, title, page size, and the tell-tales (Cloudflare challenge, /auth, the geo prompt, a proxy error page)."""
    try:
        url = sb.get_current_url(); title = sb.get_title() or ""; src = sb.get_page_source() or ""
        low = src.lower()
        tells = [t for t, pat in (("cloudflare-challenge", "verify you are human"), ("cf-block", "attention required"),
                                   ("auth-page", "/auth"), ("geo-prompt", "allowlocation"), ("proxy-error", "proxy error"),
                                   ("tunnel-failed", "err_tunnel"), ("turnstile", "turnstile")) if pat in low or pat in url.lower()]
        print(f"  [{tag}] url={url} title={title[:60]!r} page={len(src)} tells={tells or 'none'}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"  [{tag}] (no page: {str(exc)[:80]})", flush=True)


def main():
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    board = None
    lobby_only = None   # a board-shaped answer without projections for this league (lobby), kept as evidence
    lobby_board = None  # the lobby's featured players of this league (fallback at the deadline)
    seen_ops = {}       # graphql operation names seen on the wire (diagnostic)
    pending = {}        # graphql response ids whose body is still to be read (requestId -> tries)
    printed_reqs = set()
    last_nudge = 0.0
    lp, proxy_arg = start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    try:
        with SB(**kw) as sb:
            sb.uc_open_with_reconnect(URL, reconnect_time=10)
            enable_network(sb)
            where(sb, "first load")
            for _ in range(3):
                try:
                    sb.uc_gui_click_captcha()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(4)
            where(sb, "after captcha pass")
            # seed session (credential store first, renewed when the access token nears expiry - see renew_session_state)
            st, src = load_session_state()
            print(f"session state: {len(st)} bytes from the {src}", flush=True)
            if st:
                st, status = renew_session_state(st)
                print(status, flush=True)
            if st:
                try:
                    s = json.loads(st)
                    for k, v in (s.get("localStorage") or {}).items():
                        try:
                            sb.execute_script("localStorage.setItem(arguments[0], arguments[1]);", k, v)
                        except Exception:  # noqa: BLE001
                            pass
                    for c in s.get("cookies") or []:
                        ck = {kk: c[kk] for kk in ("name", "value", "domain", "path", "secure", "expiry")
                              if kk in c and c[kk] is not None}
                        try:
                            sb.driver.add_cookie(ck)
                        except Exception:  # noqa: BLE001
                            pass
                    sb.uc_open_with_reconnect(URL, reconnect_time=6)
                    time.sleep(6)
                except Exception as exc:  # noqa: BLE001
                    print("seed failed:", str(exc)[:100], flush=True)
            where(sb, "after seeding")
            # clear geo + reach a booted page
            for i in range(40):
                url = sb.get_current_url(); src = sb.get_page_source() or ""
                if "AllowLocation" in url:
                    for xp in (f'//*[normalize-space(text())="{STATE}"]', f'//li[contains(.,"{STATE}")]',
                               f'//option[normalize-space(text())="{STATE}"]', '//select'):
                        try:
                            if xp == '//select' and sb.is_element_visible(xp):
                                sb.select_option_by_text(xp, STATE); break
                            if sb.is_element_visible(xp):
                                sb.click(xp, timeout=3); break
                        except Exception:  # noqa: BLE001
                            continue
                    time.sleep(4); continue
                if len(src) > 5000:
                    break
                time.sleep(3)
            # navigate to the league board. ONE detached navigation to the app root (the old /lobby/<league> route redirects
            # to /picks/home/lobby anyway), then everything in-page with the CDP session attached: the league chip is
            # pressed with a real mouse (click_league) so the app itself fires getEventsWithFilteredPlayers for the league.
            try:
                sb.uc_open_with_reconnect(URL, reconnect_time=4); time.sleep(4)
            except Exception:  # noqa: BLE001
                pass
            enable_network(sb)
            where(sb, "after root (attached)")
            print(f"  league chip click: {click_league(sb)}", flush=True)
            time.sleep(4)
            where(sb, "after league chip")
            # capture. DIAGNOSED 2026-10-07 (full-system certification pass G): the app answers getUpcomingEventsV2 more than
            # once - the LOBBY response lists every upcoming event of every sport (163 "events" on 10-07, 117 on 10-06) with
            # NO players/projections, and the league board response carries the projections. The old loop took the first
            # response with the key, so the lobby answer won and the file said ok:true, 163 events, 0 legs. Now a response
            # only counts as the board when it flattens to legs; a projection-less answer is kept as `lobby_only` evidence
            # and the loop keeps watching (and re-clicks the league tab) until the deadline.
            deadline = time.time() + 120
            while time.time() < deadline and not board:
                try:
                    logs = sb.driver.get_log("performance")
                except Exception:  # noqa: BLE001
                    logs = []
                ids = []
                for e in logs:
                    try:
                        m = json.loads(e["message"])["message"]
                    except Exception:  # noqa: BLE001
                        continue
                    if m.get("method") == "Network.requestWillBeSent" and \
                       "fantasy.betr.app/graphql" in m["params"]["request"].get("url", ""):
                        # which operation, for which league, the app actually asked - the request side of the diagnosis
                        try:
                            pj = json.loads(m["params"]["request"].get("postData") or "{}")
                            pj = pj[0] if isinstance(pj, list) and pj else pj
                            v = pj.get("variables") or {}
                            vs = {k: v[k] for k in v if k.lower() in ("league", "leagues", "sport", "sports", "leagueid", "filter", "filters")}
                            k = f"graphql request {pj.get('operationName')} {json.dumps(vs, separators=(',', ':'))[:80]}"
                        except Exception:  # noqa: BLE001
                            k = "graphql request (unparsed)"
                        seen_ops[k] = seen_ops.get(k, 0) + 1
                        if k not in printed_reqs:
                            printed_reqs.add(k); print(f"  {k}", flush=True)
                    if m.get("method") == "Network.responseReceived" and \
                       "fantasy.betr.app/graphql" in m["params"]["response"].get("url", ""):
                        ids.append(m["params"]["requestId"])
                        st_code = m["params"]["response"].get("status")
                        seen_ops[f"graphql {st_code}"] = seen_ops.get(f"graphql {st_code}", 0) + 1
                    elif m.get("method") == "Network.responseReceived":
                        u = m["params"]["response"].get("url", "")
                        if "betr" in u and not u.endswith((".js", ".css", ".png", ".svg", ".woff2", ".woff", ".jpg", ".ico")):
                            k = f"{m['params']['response'].get('status')} {u.split('?')[0][:80]}"
                            seen_ops[k] = seen_ops.get(k, 0) + 1
                    elif m.get("method") == "Network.loadingFailed":
                        k = f"FAILED {m['params'].get('errorText', '?')[:40]} {m['params'].get('type', '')}"
                        seen_ops[k] = seen_ops.get(k, 0) + 1
                # bodies are read once the response has finished loading; an id that fails is retried on the next
                # passes (3 tries) instead of being dropped with the drained performance log
                for rid in ids:
                    pending[rid] = pending.get(rid, 0)
                for rid in list(pending):
                    try:
                        if pending[rid] >= 3:
                            del pending[rid]; continue
                        pending[rid] += 1
                        b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid})
                        j = json.loads(b.get("body", ""))
                        del pending[rid]
                        ops = sorted((j.get("data") or {}).keys()) if isinstance(j.get("data"), dict) else ["<no data>"]
                        k = f"graphql body {','.join(ops)[:60]}"
                        if k not in seen_ops:
                            # first sight of each operation: print its shape (keys / list sizes, depth 4) so a renamed or
                            # reshaped board is diagnosed from the log, never guessed
                            print(f"  {k}: {json.dumps(schema(j.get('data')), separators=(',', ':'))[:1500]}", flush=True)
                        seen_ops[k] = seen_ops.get(k, 0) + 1
                        evs, op = board_events(j)
                        if evs:
                            lg_legs, lg_ev = flatten(j)
                            if lg_legs and not op.startswith("getUpcomingLobbyEventsV2"):
                                board = j; print(f"  board = {op} ({lg_ev} {LEAGUE} events, {len(lg_legs)} legs)", flush=True); break
                            if lg_legs:
                                # the lobby's featured players of this league: a FALLBACK at the deadline, never preferred
                                # over the league board (getEventsWithFilteredPlayers) that the league tab produces
                                lobby_board = j
                            else:
                                lobby_only = j   # events without projections for this league - not the board
                    except Exception as exc:  # noqa: BLE001
                        if pending.get(rid, 0) >= 3:
                            k = f"graphql body unreadable after 3 tries ({type(exc).__name__}: {str(exc)[:60]})"
                            seen_ops[k] = seen_ops.get(k, 0) + 1
                        continue
                if not board and (lobby_only is not None or lobby_board is not None) and time.time() - last_nudge > 20:
                    # the lobby answered but the league board did not: press the league chip again (at most every 20 s)
                    last_nudge = time.time()
                    print(f"  league chip re-click: {click_league(sb)}", flush=True)
                time.sleep(3)
            if not board:
                where(sb, "deadline")
                print(f"  wire: {seen_ops or 'no betr.app graphql / error responses seen'}", flush=True)
                # ROUTE DISCOVERY (2026-10-09): the app now lands on /picks/home/lobby (the old /lobby/<league> redirects there);
                # list the league links / chips it renders so the league navigation can be corrected without guessing.
                try:
                    hrefs = sb.execute_script("return Array.from(document.querySelectorAll('a[href]')).map(a=>a.getAttribute('href')).filter(h=>/nba|wnba|lobby|league|sport/i.test(h)).slice(0,40);")
                    chips = sb.execute_script("return Array.from(document.querySelectorAll('button,a,div[role=button],li')).map(e=>(e.innerText||'').trim()).filter(t=>t && t.length<24 && /NBA|WNBA|NFL|MLB|NHL|All|Sports/i.test(t)).slice(0,40);")
                    print(f"  routes seen: {hrefs}", flush=True)
                    print(f"  chips seen: {chips}", flush=True)
                    body_text = sb.execute_script("return (document.body.innerText||'').split('\\n').map(s=>s.trim()).filter(s=>s && s.length<40).slice(0,120).join(' | ');")
                    print(f"  visible text: {body_text[:1500]}", flush=True)
                except Exception as exc:  # noqa: BLE001
                    print(f"  route discovery failed: {str(exc)[:80]}", flush=True)
                if lobby_board is not None:
                    board = lobby_board
                    print(f"  WARNING: league board never answered - using the LOBBY's {LEAGUE} players as a PARTIAL board "
                          f"({len(flatten(board)[0])} legs); the league navigation needs attention (see the trail above)", flush=True)
    finally:
        if lp:
            lp.terminate()

    if not board or not board_events(board)[0]:
        if lobby_only is not None:
            # the app answered (session alive) but never produced a league board with projections: either the league has
            # no posted props right now (NBA preseason, WNBA off-day) or the league tab was not reached. Never overwrite the
            # previous board file with an empty one (certification pass G rule); the run is red so it is seen.
            lob, _ = board_events(lobby_only)
            n_ev = len(lob)
            leagues = sorted({str((e.get("league") or e.get("sport") or e.get("leagueName") or {})) for e in lob})[:12]
            print(f"NO {LEAGUE} BOARD WITH PROJECTIONS: the lobby answered with {n_ev} projection-less events "
                  f"(leagues seen: {leagues}); previous board file left untouched", file=sys.stderr)
            sys.exit(3)
        alive = any(k.startswith("200 https://api.betr.app/api/v3/auth/") for k in seen_ops) or seen_ops.get("graphql 200", 0) > 0
        if alive and not routed:
            # PROVEN 2026-10-09 (runs 38005105453 WNBA, 38006445274 EPL - on-screen and scrolled chips both route to
            # /picks/home/<LEAGUE> and fire LeagueUpcomingEvents{league}); the NBA chip did not route on 38006042574 with
            # the lobby listing no NBA event: Betr had not opened the league. The session is alive (authed API 200s).
            print(f"NO {LEAGUE} BOARD: the '{LEAGUE}' league chip does not route (Betr has not opened the {LEAGUE} board, "
                  f"or the strip changed - see the trail above); session alive; previous board file left untouched", file=sys.stderr)
            sys.exit(3)
        print("NO BOARD (session may have expired — re-run betr_export_session.py and update BETR_SESSION_STATE)",
              file=sys.stderr)
        sys.exit(2)

    legs, nevents = flatten(board)
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "github-runner uc+proxy picks.betr.app", "league": LEAGUE,
            "started_at": started, "fetched_at": fetched, "legs": len(legs),
            "alt_legs": sum(1 for l in legs if l.get("alt")),
            "players": len({l["player_id"] for l in legs}), "events": nevents,
            "board_op": board_events(board)[1], "partial_lobby": board is lobby_board}
    (OUT / f"betr_{LEAGUE.lower()}_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    (OUT / f"betr_{LEAGUE.lower()}_current_meta.json").write_text(json.dumps(meta, indent=2))
    if LEAGUE == "NBA":
        (OUT / "betr_nba_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    print(f"OK {LEAGUE}: {meta['legs']} legs ({meta['alt_legs']} alt), {meta['players']} players, "
          f"{meta['events']} events", flush=True)


if __name__ == "__main__":
    main()
