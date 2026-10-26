#!/usr/bin/env python3
"""
PROBE - HOW SLEEPER PRICES A WHOLE ENTRY (2026-10-25; owner 22:05 PT: "Be sure you are treating the multipliers right, connect to
the apps like you did to UD and be sure you have the right multiplier for all slip structure and per leg"). READ-ONLY, no login,
no entry built or submitted. Opens sleeper.com/picks in a real Chrome (residential proxy), and:
  1 reads every JS bundle of the page (CDP Page.getResourceContent) and prints the code around every mention of entry pricing
    (size bonus / payout multiplier / flex / VS score / ez pick / min multiplier / promo), every GraphQL operation name and every
    api.sleeper.app path - so the size-bonus schedule (3 picks x1.08 and 4 picks x1.10 seen on the owner's screens; 5 / 6 / 7 / 8
    unseen) and the Flex payouts can be read from the app's own code, or the server call that returns them can be found;
  2 logs every sleeper.app request the page makes for 45 s (method, path, the GraphQL operation name) and prints the first 1,500
    chars of each response that mentions a multiplier / payout / bonus.
Env: PROXY_URL.
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_harvest_cloud as H  # noqa: E402  (proxy helper only)
from seleniumbase import SB  # noqa: E402

KW = re.compile(r"(payout_?multiplier|parlay_?multiplier|entry_?multiplier|min_?(parlay_?)?multiplier|max_?(payout|multiplier)|"
                r"size_?bonus|bonus_?multiplier|multiplier_?bonus|pick_?count_?bonus|boost(ed)?_?multiplier|vs_?score|vsScore|"
                r"ez_?pick|ezPick|flex_?payout|flexPayout|payout_?table|payoutTable|payout_?schedule|calculate_?payout|calcPayout|"
                r"picks_?entry|picksEntry|entry_?preview|entryPreview|quote|1\.0797|1\.08\b|1\.102|1\.1\b)", re.I)
OP = re.compile(r"\b(query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[({]")
HOST = re.compile(r"https://[a-z0-9.\-]*sleeper\.(?:app|com)/[A-Za-z0-9_\-/{}$.?=&\[\]%]*")
PATHS = re.compile(r"[\"'`](/(?:v1/|graphql|picks|lines|entries|entry|contests?|payouts?)[A-Za-z0-9_\-/{}$.?=&\[\]%]*)[\"'`]")


def main():
    lp, proxy_arg = H.start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    with SB(**kw) as sb:
        sb.uc_open_with_reconnect("https://sleeper.com/picks", 8)
        H.enable_network(sb)
        time.sleep(10)
        print("at", sb.get_current_url(), repr(sb.get_title()), flush=True)
        try:
            tree = sb.driver.execute_cdp_cmd("Page.getResourceTree", {})
            frame = tree["frameTree"]["frame"]["id"]
            res = [r["url"] for r in tree["frameTree"].get("resources", []) if r.get("type") == "Script"]
        except Exception as exc:  # noqa: BLE001
            print("resource tree failed", type(exc).__name__, flush=True)
            frame, res = None, []
        print(f"bundles {len(res)}", flush=True)
        ops, paths, hits = {}, set(), []
        for u in res:
            try:
                t = sb.driver.execute_cdp_cmd("Page.getResourceContent", {"frameId": frame, "url": u}).get("content") or ""
            except Exception:  # noqa: BLE001
                continue
            name = u.rsplit("/", 1)[-1][:50]
            print(f"  bundle {name} {len(t)} chars", flush=True)
            for m in OP.finditer(t):
                ops.setdefault(m.group(2), (m.group(1), name, re.sub(r"\s+", " ", t[m.start():m.start() + 700])))
            for m in HOST.finditer(t):
                paths.add(m.group(0))
            for m in PATHS.finditer(t):
                paths.add(m.group(1))
            n = 0
            for m in KW.finditer(t):
                if n >= 80:
                    break
                hits.append(f"{name} :: {m.group(0)} :: " + re.sub(r"\s+", " ", t[max(0, m.start() - 300):m.start() + 400]))
                n += 1
        print(f"\nGRAPHQL OPERATIONS ({len(ops)}):", flush=True)
        for k in sorted(ops):
            print(f"  {ops[k][0]} {k} [{ops[k][1]}]", flush=True)
        print("\nOPERATIONS MENTIONING PICK / ENTRY / PAYOUT / MULTIPLIER / LINE (body):", flush=True)
        for k in sorted(ops):
            if re.search(r"pick|entr|payout|multipl|line|parlay|contest|promo|boost", k + ops[k][2], re.I):
                print(f"  {ops[k][0]} {k}: {ops[k][2]}", flush=True)
        print(f"\nAPI PATHS ({len(paths)}):", flush=True)
        for p in sorted(paths):
            print("  ", p[:200], flush=True)
        print(f"\nPRICING MENTIONS ({len(hits)}):", flush=True)
        for h in hits[:400]:
            print("  ", h, flush=True)
        seen, ids = set(), {}
        t_end = time.time() + 45
        while time.time() < t_end:
            try:
                logs = sb.driver.get_log("performance")
            except Exception:  # noqa: BLE001
                logs = []
            for e in logs:
                try:
                    m = json.loads(e["message"])["message"]
                except Exception:  # noqa: BLE001
                    continue
                if m.get("method") == "Network.requestWillBeSent":
                    rq = m["params"]["request"]
                    u = rq.get("url", "")
                    if "sleeper" in u:
                        op = ""
                        try:
                            op = json.loads(rq.get("postData") or "{}").get("operationName") or ""
                        except Exception:  # noqa: BLE001
                            pass
                        key = (u.split("?")[0], op)
                        if key not in seen:
                            seen.add(key)
                            print("REQ", rq.get("method"), u[:220], op, flush=True)
                            ids[m["params"]["requestId"]] = (u, op)
            time.sleep(2)
        for rid, (u, op) in ids.items():
            try:
                b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid}).get("body") or ""
            except Exception:  # noqa: BLE001
                continue
            if re.search(r"multiplier|payout|bonus|boost|promo", b[:400000], re.I):
                i = re.search(r"multiplier|payout|bonus|boost|promo", b, re.I).start()
                print(f"RESP {u[:160]} {op} {len(b)}b :: {b[max(0, i - 300):i + 1200]}", flush=True)
    if lp:
        lp.terminate()


if __name__ == "__main__":
    main()
