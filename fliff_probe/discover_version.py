#!/usr/bin/env python3
"""FLIFF PROBE - CURRENT APP VERSION (read-only; 2026-10-22 09:25 PT).
The ping now answers error 30040 'This version of the app is no longer supported' to app_x_version 5.0.34.285. Read the live web app
(sports.getfliff.com + its JS chunks) and print every version-like string near 'version' / 'app_x_version' / 'build', so the client
can send the current one. Output: fliff_probe/out/discovery_version.json."""
import json
import os
import re
from pathlib import Path
from urllib.parse import urljoin

from curl_cffi import requests

OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
PROXY = os.environ.get("PROXY_URL", "").strip() or None
VER = re.compile(r"""["'`](\d{1,2}\.\d{1,3}\.\d{1,4}(?:\.\d{1,5})?)["'`]""")


def get(u):
    for px in (None, PROXY):
        try:
            r = S.get(u, timeout=60, impersonate="chrome124", proxies={"https": px, "http": px} if px else None)
            if r.status_code == 200:
                return r.text
        except Exception:  # noqa: BLE001
            pass
    return None


root = "https://sports.getfliff.com/"
html = get(root) or ""
srcs = [urljoin(root, s) for s in re.findall(r"""<script[^>]+src=["']([^"']+)["']""", html)]
rep = {"html_len": len(html), "html_versions": sorted(set(VER.findall(html))), "chunks": [], "hits": []}
seen, queue = set(), list(srcs)
while queue and len(seen) < 80:
    u = queue.pop(0)
    if u in seen:
        continue
    seen.add(u)
    js = get(u)
    if not js:
        continue
    rep["chunks"].append(u.rsplit("/", 1)[-1])
    base = u.rsplit("/", 1)[0] + "/"
    for m in re.findall(r"""["']([0-9a-zA-Z_.~\-]+\.js)["']""", js):
        queue.append(urljoin(base, m))
    for m in re.finditer(r"(app_x_version|appVersion|APP_VERSION|app_version|client_version|build_number|min_app_build|VERSION)", js):
        ctx = js[max(0, m.start() - 160): m.end() + 200].replace("\n", " ")
        vs = VER.findall(ctx)
        if vs:
            rep["hits"].append({"chunk": u.rsplit("/", 1)[-1], "key": m.group(1), "versions": vs, "ctx": ctx[:360]})
    for v in set(VER.findall(js)):
        if v.startswith("5.") and v.count(".") >= 2:
            rep.setdefault("all_5x", {}).setdefault(v, 0)
            rep["all_5x"][v] += 1
            for mm in re.finditer(re.escape(v), js):
                ctx = js[max(0, mm.start() - 400): mm.end() + 400].replace("\n", " ")
                rep.setdefault("ctx_5x", []).append({"v": v, "chunk": u.rsplit("/", 1)[-1], "ctx": ctx})
                print("CTX5", v, u.rsplit("/", 1)[-1], "|", ctx, flush=True)
print("html versions:", rep["html_versions"][:20])
print("chunks:", len(rep["chunks"]))
print("5.x strings:", json.dumps(rep.get("all_5x", {}))[:1500])
for h in rep["hits"][:40]:
    print("HIT", h["chunk"], h["key"], h["versions"], "|", h["ctx"][:260])
(OUT / "discovery_version.json").write_text(json.dumps(rep, indent=1))
