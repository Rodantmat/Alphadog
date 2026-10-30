#!/usr/bin/env python3
"""
PROBE (2026-10-30, owner 16:04 PT): "Underdog Blocks LESS do not exist" in the app, yet the Underdog feed lists a Lower option on 49 of 50
Blocks lines and the engine builds slips from them. Ground truth is the app itself. This opens Underdog's pick'em web app in a real Chrome
(SeleniumBase UC + Xvfb) through the Southern-California proxy, no login, switches to the Blocks category and prints what each Blocks card
actually offers (button labels, card text, a trimmed HTML of a few cards). Read-only: nothing is clicked except the category pill and a
card to expand it; nothing is placed.
Env: PROXY_URL (credential store). Output: log lines only.
"""
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo_proxy import geo  # noqa: E402

os.environ["PROXY_URL"] = geo(os.environ.get("PROXY_URL", ""))
from seleniumbase import SB  # noqa: E402
from betr_harvest_cloud import open_alive, start_local_proxy, where  # noqa: E402

URLS = ["https://app.underdogsports.com/pick-em/higher-lower/all/nba", "https://underdogfantasy.com/pick-em/higher-lower/all/nba"]

JS_CARDS = """
var out=[]; var els=document.querySelectorAll('[class*="player"],[class*="Player"],[class*="card"],[class*="Card"],[data-testid]');
for (var i=0;i<els.length && out.length<400;i++){var t=(els[i].innerText||'').trim(); if(t && t.length<400 && /block/i.test(t)) out.push({t:t.replace(/\\n+/g,' | '), h:els[i].outerHTML.length});}
return out;
"""


def main():
    lp, proxy_arg = start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    with SB(**kw) as sb:
        try:
            ip = None
            sb.uc_open_with_reconnect("https://ipinfo.io/json", 6)
            txt = sb.get_page_source()
            m = re.search(r'"city":\s*"([^"]+)".*?"region":\s*"([^"]+)"', txt, re.S)
            print("egress:", m.groups() if m else "unknown", flush=True)
        except Exception as exc:  # noqa: BLE001
            print("egress check failed:", str(exc)[:80], flush=True)
        ok = False
        for u in URLS:
            if open_alive(sb, u, "ud app", tries=4):
                where(sb, "loaded " + u)
                time.sleep(12)
                body = sb.execute_script("return (document.body.innerText||'')")
                print("visible text head:", body[:700].replace("\n", " | "), flush=True)
                if len(body) > 300:
                    ok = True
                    break
        if not ok:
            print("app did not render usable content", flush=True)
            return
        # category pills
        pills = sb.execute_script("return Array.from(document.querySelectorAll('button,a,[role=tab]')).map(e=>(e.innerText||'').trim()).filter(t=>t && t.length<30).slice(0,80)")
        print("buttons/pills:", pills, flush=True)
        for label in ("Blocks", "BLK", "Blks"):
            try:
                els = sb.find_elements(f"//*[self::button or self::a or @role='tab'][normalize-space(.)='{label}']", by="xpath")
                if els:
                    els[0].click()
                    print("clicked category", label, flush=True)
                    time.sleep(6)
                    break
            except Exception as exc:  # noqa: BLE001
                print("category click failed", label, str(exc)[:70], flush=True)
        body = sb.execute_script("return (document.body.innerText||'')")
        lines = [l.strip() for l in body.split("\n") if l.strip()]
        print("page lines after category:", len(lines), flush=True)
        print("TEXT:", " | ".join(lines[:260]), flush=True)
        cards = sb.execute_script(JS_CARDS)
        print("block cards:", len(cards), flush=True)
        for c in cards[:30]:
            print("  CARD", c["t"][:240], flush=True)
        btn = sb.execute_script("return Array.from(document.querySelectorAll('button')).map(b=>(b.getAttribute('aria-label')||b.innerText||'').trim()).filter(t=>/higher|lower|more|less|over|under/i.test(t)).slice(0,60)")
        print("higher/lower style buttons:", btn, flush=True)
    return


if __name__ == "__main__":
    main()
