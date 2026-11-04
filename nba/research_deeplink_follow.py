#!/usr/bin/env python3
"""RESEARCH - FOLLOW THE OWNER'S SHARE LINKS (2026-11-03, owner pasted one lineup share link per app). READ-ONLY.
For each link: every redirect hop (status, Location), then the final page's title / og / meta / apple-itunes / branch / JSON-looking
data, with iOS and Android and desktop user agents (a share link often serves different payloads per platform).
Reports only. Env: none."""
import json
import re
import urllib.error
import urllib.parse
import urllib.request

LINKS = {
    "prizepicks": "https://prizepicks.onelink.me/gCQS/shareEntry?entryId=8aa98968377fd9bb5458f95296ca7d74&origin=",
    "underdog": "https://play.underdogsports.com/vgwg/3a7hjzpv",
    "sleeper": "https://e.slpr.link/1423564897635020800",
    "betr": "https://l.betr.app/e/TRvwFdZq",
}
UAS = {
    "ios": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "android": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
    "desktop": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def hop(url, ua):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"})
    try:
        with OPENER.open(req, timeout=40) as r:
            return r.status, dict(r.headers), r.read(600_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), (e.read(600_000).decode("utf-8", "replace") if e.code < 400 or e.code in (403, 404) else "")
    except Exception as e:  # noqa: BLE001
        return None, {}, str(e)[:200]


def show_body(body):
    for pat in (r"<title>(.*?)</title>", r'<meta[^>]+(?:property|name)=["\'](?:og:[a-z:_]+|twitter:[a-z:_]+|description|apple-itunes-app|al:[a-z:_]+)["\'][^>]*>',
                r'<link[^>]+rel=["\'](?:canonical|alternate)["\'][^>]*>'):
        for m in re.findall(pat, body, re.I | re.S)[:14]:
            print(f"      {str(m)[:300]}", flush=True)
    for m in re.findall(r'(?:branch_key|\$deeplink_path|\+non_branch_link|\$canonical_url|\$og_title|deeplink_path|~[a-z_]+|\$[a-z_]+)["\']?\s*[:=]\s*["\']?([^"\'<>\s,]{3,200})', body)[:25]:
        print(f"      branchish: {m}", flush=True)
    for m in re.findall(r'(?:prizepicks|underdog\w*|sleeper|betr)[a-z]*://[^\s"\'<>\\]{3,300}', body, re.I)[:15]:
        print(f"      scheme: {m}", flush=True)
    for m in re.findall(r'https?://[^\s"\'<>\\]*(?:entry|slip|lineup|pick|projection|share)[^\s"\'<>\\]*', body, re.I)[:15]:
        print(f"      url: {m[:300]}", flush=True)
    for m in re.findall(r"(?:window\.[A-Za-z_]+|__[A-Z_]+__)\s*=\s*(\{.{20,1500})", body, re.S)[:3]:
        print(f"      state: {m[:900]}", flush=True)


def follow(name, url):
    for tag, ua in UAS.items():
        print(f"\n=== {name} [{tag}] {url}", flush=True)
        cur = url
        for i in range(10):
            st, hd, body = hop(cur, ua)
            loc = hd.get("Location") or hd.get("location")
            print(f"   hop{i}: {st} {cur[:200]}", flush=True)
            for k in ("Content-Type", "Server", "X-Branch-Request-Id", "Link"):
                if hd.get(k):
                    print(f"      {k}: {hd[k][:200]}", flush=True)
            if st and 300 <= st < 400 and loc:
                print(f"      Location: {loc[:600]}", flush=True)
                cur = urllib.parse.urljoin(cur, loc)
                continue
            print(f"      body {len(body):,} chars", flush=True)
            if st == 200:
                show_body(body)
                if len(body) < 2500:
                    print(f"      RAW: {body[:2500]}", flush=True)
            break


def main():
    for n, u in LINKS.items():
        follow(n, u)
    print("\nDONE", flush=True)


if __name__ == "__main__":
    main()
