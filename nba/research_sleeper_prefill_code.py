#!/usr/bin/env python3
"""RESEARCH - HOW SLEEPER'S entry_prefill DEEP LINK IS READ (2026-11-03). READ-ONLY.
Owner's phone test of sleeper.onelink.me/GF91?deep_link_value=entry_prefill&deep_link_sub1=<line_id>,<line_id> opened Picks Entry with both
players on their CURRENT lines, both Over, $2.00 amount. Which params set the SIDE and the AMOUNT? Greps sleeper.com's web bundles for
entry_prefill / deep_link_sub / prefill and prints the code around each hit. Env: none."""
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}
KEYS = re.compile(r"entry_prefill|deep_link_sub|deep_link_value|prefill[A-Za-z_]*|pickPrefill|PICKS_PREFILL|af_dp", re.I)


def get(u, t=60):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r:
            return r.status, r.read(8_000_000).decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:100]


def main():
    seen, shown = set(), 0
    for page in ("https://sleeper.com/", "https://sleeper.com/picks", "https://sleeper.com/picks/entry?pid=1"):
        st, html = get(page)
        print(f"PAGE {page} {st} {len(html):,}", flush=True)
        srcs = re.findall(r'(?:src|href)=["\']([^"\']+\.js[^"\']*)["\']', html)
        for s in srcs:
            u = s if s.startswith("http") else ("https:" + s if s.startswith("//") else "https://sleeper.com" + (s if s.startswith("/") else "/" + s))
            if u in seen:
                continue
            seen.add(u)
            st2, js = get(u)
            if st2 != 200:
                continue
            for m in KEYS.finditer(js):
                if shown >= 60:
                    break
                a = max(0, m.start() - 260); b = min(len(js), m.end() + 420)
                print(f"\nHIT {u.rsplit('/', 1)[-1][:60]} @{m.start()} [{m.group(0)}]\n   {js[a:b]!r}", flush=True)
                shown += 1
    print(f"\nbundles scanned {len(seen)}, hits shown {shown}\nDONE", flush=True)


if __name__ == "__main__":
    main()
