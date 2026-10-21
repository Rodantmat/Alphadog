#!/usr/bin/env python3
"""FLIFF PROBE - STEP 1 DISCOVERY (sample-first rule; read-only everywhere; 2026-10-20).

Answers, before anything is built on assumptions:
  A) Fliff: which channels (sports/leagues) exist, how many upcoming events each holds, what one event's board looks like
     (market names, proposal fields, how odds are carried), where the channel names live.
  B) ParlayAPI: which sport keys and bookmakers exist; do Pinnacle AND Fliff both price game lines side by side
     (h2h/spreads/totals) on today's sports; credits used per call.
Writes fliff_probe/out/discovery.json (trimmed) and prints a summary. Never prints a key or a query string.
"""
import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fliff_client import FliffClient, conflicts_of, lists_under, walk  # noqa: E402

OUT = HERE / "out"
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def trim(obj, depth=0, max_list=3, max_str=200):
    if depth > 6:
        return "..."
    if isinstance(obj, dict):
        return {k: trim(v, depth + 1, max_list, max_str) for k, v in list(obj.items())[:60]}
    if isinstance(obj, list):
        return [trim(v, depth + 1, max_list, max_str) for v in obj[:max_list]] + ([f"... +{len(obj) - max_list}"] if len(obj) > max_list else [])
    if isinstance(obj, str) and len(obj) > max_str:
        return obj[:max_str] + "..."
    return obj


# ---------------------------------------------------------------- A) FLIFF
def fliff_discovery():
    proxy = os.environ.get("PROXY_URL", "").strip() or None
    fc = FliffClient(proxy=proxy)
    ping = fc.ping()
    REPORT["fliff_ping_data_keys"] = sorted(fc.ping_data.keys())
    REPORT["fliff_feed_host"] = fc.feed_host
    print("feed host:", fc.feed_host, "| ping keys:", REPORT["fliff_ping_data_keys"][:40], flush=True)

    root = fc.sync(3054)
    xs = root.get("x_slots") or {}
    REPORT["sync3054_x_slots_keys"] = {k: (len(v) if isinstance(v, (list, dict)) else type(v).__name__) for k, v in xs.items()}
    pre, inp = conflicts_of(root)
    print(f"3054: prematch {len(pre)} inplay {len(inp)} | x_slots keys {list(xs.keys())[:30]}", flush=True)

    # channel registry: any dict node carrying a channel id and a name-like field
    chan_names = {}
    def fn(node, path):
        cid = node.get("channel_id", node.get("id") if "channel" in "/".join(map(str, path[-2:])).lower() else None)
        if isinstance(cid, int):
            nm = node.get("name") or node.get("visual_name") or node.get("channel_name") or node.get("title") or node.get("short_name")
            if nm and cid not in chan_names:
                chan_names[cid] = {"name": nm, "path": "/".join(map(str, path[-4:]))}
    walk(root, fn)
    walk(fc.ping_data, fn)
    REPORT["channel_name_candidates"] = {str(k): v for k, v in sorted(chan_names.items())}

    sample_conf = (pre or inp or [{}])[0]
    REPORT["conflict_sample_fields"] = trim(sample_conf)
    by_chan = defaultdict(list)
    for c in pre + inp:
        by_chan[c.get("channel_id")].append(c)
    REPORT["sync3054_by_channel"] = {str(k): {"n": len(v), "examples": [f"{c.get('away_team_name')} @ {c.get('home_team_name')}" for c in v[:3]]}
                                     for k, v in sorted(by_chan.items(), key=lambda kv: -len(kv[1]))}

    # every channel id we can see anywhere (3054 + name registry) -> channel select (3062) for its full slate
    all_ids = sorted({cid for cid in list(by_chan.keys()) + list(chan_names.keys()) if isinstance(cid, int) and cid > 0})
    ch_report = {}
    one_event_per_channel = {}
    for cid in all_ids[:80]:
        try:
            j = fc.sync(3062, channel=cid)
        except Exception as exc:  # noqa: BLE001
            ch_report[str(cid)] = {"error": str(exc)[:120]}
            continue
        p2, i2 = conflicts_of(j)
        evs = [c for c in p2 + i2 if c.get("channel_id") == cid] or (p2 + i2)
        mk_lists = lists_under(j.get("x_slots") or {}, "market_updates")
        n_mk = sum(len(l) for l in mk_lists)
        ch_report[str(cid)] = {"name": (chan_names.get(cid) or {}).get("name"), "prematch": len(p2), "inplay": len(i2),
                               "own_channel_events": len(evs), "market_updates": n_mk,
                               "examples": [f"{c.get('away_team_name')} @ {c.get('home_team_name')} ({c.get('event_start_timestamp_utc')})" for c in evs[:3]]}
        if evs and cid not in one_event_per_channel:
            one_event_per_channel[cid] = evs[0]
        time.sleep(0.4)
    REPORT["channels"] = ch_report
    print("channels probed:", len(ch_report), flush=True)
    for k, v in ch_report.items():
        print(f"  ch {k:>6} {str(v.get('name'))[:28]:<28} pre {v.get('prematch')} in {v.get('inplay')} own {v.get('own_channel_events')} | {v.get('examples', [''])[:1]}", flush=True)

    # one event's whole board per channel (cap 12 channels) -> market names + proposal field names
    boards = {}
    for cid, ev in list(one_event_per_channel.items())[:12]:
        fk = ev.get("conflict_fkey")
        try:
            j = fc.sync(3062, channel=cid, conflict=fk)
        except Exception as exc:  # noqa: BLE001
            boards[str(cid)] = {"error": str(exc)[:120]}
            continue
        mks = [m for lst in lists_under(j.get("x_slots") or {}, "market_updates") for m in lst if isinstance(m, dict) and m.get("conflict_fkey") == fk]
        names = Counter(m.get("visual_name") for m in mks)
        props = [p for m in mks for g in (m.get("groups") or []) for p in (g.get("proposals") or [])]
        boards[str(cid)] = {"event": f"{ev.get('away_team_name')} @ {ev.get('home_team_name')}", "markets": len(mks), "proposals": len(props),
                            "market_names_top": names.most_common(40),
                            "market_sample": trim(mks[0]) if mks else None,
                            "proposal_keys": sorted({k for p in props[:50] for k in p.keys()})}
        print(f"  board ch {cid}: {boards[str(cid)]['event']} markets {len(mks)} proposals {len(props)} top {names.most_common(6)}", flush=True)
        time.sleep(0.4)
    REPORT["event_boards"] = boards
    REPORT["fliff_calls"] = fc.calls


# ---------------------------------------------------------------- B) PARLAYAPI
def parlay_discovery():
    import psycopg
    import requests
    base = "https://parlay-api.com/v1"
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        key = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='parlay_api_key'").fetchone()[0].strip()
    H = {"X-API-Key": key, "accept": "application/json", "User-Agent": "alphadog-fliff-probe"}
    S = requests.Session()
    credits = []

    def get(path, params=None, label=""):
        try:
            r = S.get(f"{base}{path}", params=params or {}, headers=H, timeout=120)
        except Exception as exc:  # noqa: BLE001
            print(f"[{label}] EXC {type(exc).__name__}", flush=True)
            return None
        rem = r.headers.get("x-requests-remaining")
        last = r.headers.get("x-requests-last")
        credits.append({"call": label, "status": r.status_code, "remaining": rem, "last": last})
        print(f"[{label}] http {r.status_code} remaining={rem} last={last} {'' if r.status_code == 200 else (r.text or '')[:200].replace(key, '***')}", flush=True)
        try:
            return r.json()
        except Exception:  # noqa: BLE001
            return None

    sports = get("/sports", label="sports") or []
    active = [s for s in sports if isinstance(s, dict) and s.get("active", True)]
    REPORT["parlay_sports"] = [{"key": s.get("key"), "group": s.get("group"), "title": s.get("title"), "active": s.get("active")} for s in active]
    print("parlay sports active:", len(active), [s.get("key") for s in active][:60], flush=True)
    books = get("/bookmakers", label="bookmakers")
    REPORT["parlay_bookmakers"] = trim(books, max_list=80)

    # side-by-side check on a few likely sports (one call each, 3 markets)
    pin_fliff = {}
    for sk in [s for s in ("basketball_nba", "icehockey_nhl", "americanfootball_nfl", "americanfootball_ncaaf", "baseball_mlb", "soccer_epl") if any(x.get("key") == s for x in active)][:6]:
        od = get(f"/sports/{sk}/odds", {"regions": "us,us2,eu", "markets": "h2h,spreads,totals", "oddsFormat": "decimal"}, label=f"odds {sk}")
        if not isinstance(od, list):
            pin_fliff[sk] = {"answer": str(od)[:200]}
            continue
        bk = Counter(b.get("key") for e in od for b in (e.get("bookmakers") or []))
        both = sum(1 for e in od if {"pinnacle", "fliff"} <= {b.get("key") for b in (e.get("bookmakers") or [])})
        ex = None
        for e in od:
            bs = {b.get("key"): b for b in (e.get("bookmakers") or [])}
            if "pinnacle" in bs and "fliff" in bs:
                ex = {"event": f"{e.get('away_team')} @ {e.get('home_team')} {e.get('commence_time')}",
                      "pinnacle": [{"m": m.get("key"), "o": m.get("outcomes")} for m in bs["pinnacle"].get("markets") or []],
                      "fliff": [{"m": m.get("key"), "o": m.get("outcomes")} for m in bs["fliff"].get("markets") or []]}
                break
        pin_fliff[sk] = {"events": len(od), "books": dict(bk.most_common(30)), "events_with_pinnacle_and_fliff": both, "example": trim(ex, max_list=6)}
        print(f"  {sk}: events {len(od)} pinnacle+fliff on {both}; books {dict(bk.most_common(12))}", flush=True)
    REPORT["parlay_pinnacle_vs_fliff"] = pin_fliff
    REPORT["parlay_credits_log"] = credits


if __name__ == "__main__":
    for step in (fliff_discovery, parlay_discovery):
        try:
            step()
        except Exception as exc:  # noqa: BLE001
            REPORT[f"{step.__name__}_error"] = f"{type(exc).__name__}: {str(exc)[:300]}"
            print(f"{step.__name__} FAILED: {exc}", flush=True)
    (OUT / "discovery.json").write_text(json.dumps(REPORT, indent=1, default=str))
    print("wrote", OUT / "discovery.json", flush=True)
