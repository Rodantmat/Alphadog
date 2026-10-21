#!/usr/bin/env python3
"""FLIFF PROBE - LADDER DISCOVERY (sample-first, read-only; 2026-10-20 late).

The NBA event board (sync 3062 + focused_conflict_fkey) carries ONE line per player per stat (props discovery 23:53 PT:
Points = 15 groups = 15 players, each a single main line), while the app shows a ladder picker per player. Hypothesis: the
sync request's focused_player_fkey (always "" until now) returns that player's alternate lines. Tests it on the first NBA
event's first Points player and writes fliff_probe/out/discovery_ladder.json (markets/groups/selections/prices seen).
"""
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fliff_client import FliffClient, conflicts_of, lists_under  # noqa: E402

OUT = HERE / "out"
OUT.mkdir(parents=True, exist_ok=True)


def req(fc, ch, fk, player="", code=3062):
    r = {"__object_class_name": "FCM__Public_Feed_Sync__Request", "code": code,
         "subfeed_meta": {"packed_subfeed_revisions": [], "focused_channel_id": ch, "focused_conflict_fkey": fk,
                          "focused_player_fkey": player, "focused_ticket_conflict_fkeys": [], "focused_ticket_proposal_fkeys": [],
                          "focused_ticket_data": []}}
    return fc._post(fc.feed_host, r)


def summarize(j, fk, pf):
    xs = j.get("x_slots") or {}
    mks = [m for l in lists_under(xs, "market_updates") for m in l if isinstance(m, dict)]
    out = {"x_slots_keys": {k: (len(v) if isinstance(v, (list, dict)) else type(v).__name__) for k, v in xs.items()},
           "markets": Counter(m.get("visual_name") for m in mks).most_common(60),
           "conflicts_in_markets": Counter(m.get("conflict_fkey") for m in mks).most_common(5),
           "player_groups": {}}
    for m in mks:
        for g in m.get("groups") or []:
            if g.get("player_fkey") == pf or any(p.get("player_fkey") == pf for p in g.get("proposals") or []):
                out["player_groups"].setdefault(m.get("visual_name"), []).append(
                    {"group_tag": g.get("group_tag"), "props": [(p.get("t_141_selection_name"), p.get("eu_coeff"), p.get("coeff"), p.get("status"))
                                                               for p in g.get("proposals") or []]})
    out["player_groups_count"] = {k: len(v) for k, v in out["player_groups"].items()}
    return out


def main():
    fc = FliffClient(proxy=os.environ.get("PROXY_URL", "").strip() or None)
    fc.ping()
    pre, _ = conflicts_of(fc.sync(3054))
    now_ms = time.time() * 1000
    ev = sorted([c for c in pre if c.get("channel_id") == 461 and (c.get("event_start_timestamp_utc") or 0) > now_ms],
                key=lambda c: c["event_start_timestamp_utc"])
    c = ev[0]
    fk = c["conflict_fkey"]
    rep = {"event": f"{c['away_team_name']} @ {c['home_team_name']}", "conflict_fkey": fk}
    base = req(fc, 461, fk)
    mks = [m for l in lists_under(base.get("x_slots") or {}, "market_updates") for m in l if isinstance(m, dict) and m.get("conflict_fkey") == fk]
    pts = next(m for m in mks if m.get("visual_name") == "Points")
    g0 = pts["groups"][0]
    pf = g0.get("player_fkey")
    rep["player"] = {"group_tag": g0.get("group_tag"), "player_fkey": pf}
    rep["baseline_board"] = summarize(base, fk, pf)
    variants = {"3062_conflict+player": (461, fk, pf, 3062), "3062_player_only": (461, "", pf, 3062),
                "3062_player_channel_-333": (-333, fk, pf, 3062), "3054_player": (-333, "", pf, 3054)}
    for name, (ch, cf, pl, code) in variants.items():
        try:
            j = req(fc, ch, cf, pl, code)
            rep[name] = summarize(j, fk, pf)
        except Exception as exc:  # noqa: BLE001
            rep[name] = {"error": str(exc)[:200]}
        print(name, json.dumps(rep[name].get("player_groups_count") if isinstance(rep[name], dict) else rep[name])[:400], flush=True)
        time.sleep(0.5)
    print("baseline player groups:", rep["baseline_board"]["player_groups_count"], flush=True)
    # ROUND 2 (focused_player_fkey returned nothing new): the ping lists a separate 'skipper' feed (pick'em product:
    # skipper_flex_play_modes_enabled, is_alt_prop_button_enabled). Same requests against every non-herald endpoint.
    rep["ping_endpoints"] = {k: v for k, v in fc.ping_data.items() if isinstance(v, (str, int, bool)) and ("endpoint" in k or "skipper" in k or "alt" in k)}
    print("ping endpoints:", rep["ping_endpoints"], flush=True)
    for key in ("skipper_public_feed_endpoint", "aurora_public_feed_endpoint", "real_time_parlay_plus_offers_endpoint",
                "skipper_real_time_parlay_plus_offers_endpoint"):
        host = fc.ping_data.get(key)
        if not isinstance(host, str) or not host.startswith("http"):
            continue
        saved = fc.feed_host
        fc.feed_host = host
        for name, (ch, cf, pl, code) in {"3054": (-333, "", "", 3054), "3062_conflict": (461, fk, "", 3062),
                                         "3062_conflict+player": (461, fk, pf, 3062)}.items():
            tag = f"{key}:{name}"
            try:
                j = req(fc, ch, cf, pl, code)
                s = summarize(j, fk, pf)
                s["top_keys"] = sorted(j.keys())[:20]
                s["result_preview"] = json.dumps(j.get("result") or {}, default=str)[:600]
                rep[tag] = s
            except Exception as exc:  # noqa: BLE001
                rep[tag] = {"error": str(exc)[:200]}
            r = rep[tag]
            print(tag, "->", r.get("error") or {"x_slots": r.get("x_slots_keys"), "player_groups": r.get("player_groups_count"),
                                               "markets": (r.get("markets") or [])[:8]}, flush=True)
            time.sleep(0.5)
        fc.feed_host = saved
    (OUT / "discovery_ladder.json").write_text(json.dumps(rep, indent=1, default=str))


if __name__ == "__main__":
    main()
