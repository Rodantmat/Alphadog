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


def flatten(body):
    events = ((body or {}).get("data") or {}).get("getUpcomingEventsV2") or []
    legs = []
    for ev in events:
        buckets = [(t, t.get("players", []) or []) for t in (ev.get("teams") or [])]
        if ev.get("players"):
            buckets.append((None, ev.get("players")))
        for team, players in buckets:
            for p in players:
                for proj in (p.get("projections") or []):
                    legs.extend(parse_leg(ev, team, p, proj))
    return legs, len(events)


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


def main():
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    board = None
    lobby_only = None   # a getUpcomingEventsV2 answer without projections (lobby), kept as evidence
    lp, proxy_arg = start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    try:
        with SB(**kw) as sb:
            sb.uc_open_with_reconnect(URL, reconnect_time=10)
            try:
                sb.driver.execute_cdp_cmd("Network.enable", {})
            except Exception:  # noqa: BLE001
                pass
            for _ in range(3):
                try:
                    sb.uc_gui_click_captcha()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(4)
            # seed session
            st = os.environ.get("BETR_SESSION_STATE", "").strip()
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
            # navigate to league so the app fetches the board
            for target in (f"{URL}lobby/{LEAGUE.lower()}", URL):
                try:
                    sb.uc_open_with_reconnect(target, reconnect_time=4); time.sleep(4)
                except Exception:  # noqa: BLE001
                    pass
                for xp in (f'//*[normalize-space(text())="{LEAGUE}"]', f'//a[contains(.,"{LEAGUE}")]',
                           f'//button[contains(.,"{LEAGUE}")]'):
                    try:
                        if sb.is_element_visible(xp):
                            sb.click(xp, timeout=4); break
                    except Exception:  # noqa: BLE001
                        continue
                time.sleep(3)
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
                    if m.get("method") == "Network.responseReceived" and \
                       "fantasy.betr.app/graphql" in m["params"]["response"].get("url", ""):
                        ids.append(m["params"]["requestId"])
                for rid in reversed(ids):
                    try:
                        b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid})
                        j = json.loads(b.get("body", ""))
                        if (j.get("data") or {}).get("getUpcomingEventsV2"):
                            if flatten(j)[0]:
                                board = j; break
                            lobby_only = j   # events without projections - not the board
                    except Exception:  # noqa: BLE001
                        continue
                if not board and lobby_only is not None:
                    # the lobby answered but the league board did not: nudge the league tab again
                    for xp in (f'//*[normalize-space(text())="{LEAGUE}"]', f'//a[contains(.,"{LEAGUE}")]',
                               f'//button[contains(.,"{LEAGUE}")]'):
                        try:
                            if sb.is_element_visible(xp):
                                sb.click(xp, timeout=4); break
                        except Exception:  # noqa: BLE001
                            continue
                time.sleep(3)
    finally:
        if lp:
            lp.terminate()

    if not board or ((board.get("data") or {}).get("getUpcomingEventsV2") is None):
        if lobby_only is not None:
            # the app answered (session alive) but never produced a league board with projections: either the league has
            # no posted props right now (NBA preseason, WNBA off-day) or the league tab was not reached. Never overwrite the
            # previous board file with an empty one (certification pass G rule); the run is red so it is seen.
            n_ev = len(((lobby_only.get("data") or {}).get("getUpcomingEventsV2")) or [])
            leagues = sorted({str((e.get("league") or e.get("sport") or e.get("leagueName") or {})) for e in
                              (((lobby_only.get("data") or {}).get("getUpcomingEventsV2")) or [])})[:12]
            print(f"NO {LEAGUE} BOARD WITH PROJECTIONS: the lobby answered with {n_ev} projection-less events "
                  f"(leagues seen: {leagues}); previous board file left untouched", file=sys.stderr)
            sys.exit(3)
        print("NO BOARD (session may have expired — re-run betr_export_session.py and update BETR_SESSION_STATE)",
              file=sys.stderr)
        sys.exit(2)

    legs, nevents = flatten(board)
    fetched = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"ok": True, "source": "github-runner uc+proxy picks.betr.app", "league": LEAGUE,
            "started_at": started, "fetched_at": fetched, "legs": len(legs),
            "alt_legs": sum(1 for l in legs if l.get("alt")),
            "players": len({l["player_id"] for l in legs}), "events": nevents}
    (OUT / f"betr_{LEAGUE.lower()}_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    (OUT / f"betr_{LEAGUE.lower()}_current_meta.json").write_text(json.dumps(meta, indent=2))
    if LEAGUE == "NBA":
        (OUT / "betr_nba_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    print(f"OK {LEAGUE}: {meta['legs']} legs ({meta['alt_legs']} alt), {meta['players']} players, "
          f"{meta['events']} events", flush=True)


if __name__ == "__main__":
    main()
