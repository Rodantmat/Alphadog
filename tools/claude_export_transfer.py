"""Owner-requested one-off: fetch the owner's claude.ai account export (4 zips) and hand them back ENCRYPTED.

The repo is public, so nothing readable is ever written here:
- the export links are read from the private credential store (nba_config.external_credentials, key claude_export_urls),
  never from inputs or the repo, and are never printed;
- the zips are tarred and encrypted (AES-256 with a random key; that key is RSA-OAEP-encrypted to the public key passed
  in XFER_PUBKEY, whose private half exists only in Claude's workspace) before they leave the runner.

Download ladder per file: curl_cffi (Chrome impersonation, direct) -> real Chrome (SeleniumBase UC + Xvfb) direct ->
real Chrome through the residential proxy (only if the first two are challenged).
Output: ./xfer_out/ (encrypted parts + status.json), pushed to an orphan branch by the workflow.
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import time

import psycopg

OUT = os.path.abspath("xfer_out")
DL = os.path.abspath("xfer_dl")
os.makedirs(OUT, exist_ok=True)
os.makedirs(DL, exist_ok=True)
status = {"files": {}}


def log(*a):
    print(*a, flush=True)


def is_zip(path):
    try:
        with open(path, "rb") as f:
            return f.read(2) == b"PK"
    except OSError:
        return False


def load_urls():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        row = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials "
                        "WHERE credential_key='claude_export_urls'").fetchone()
    urls = json.loads(row[0])
    for u in urls.values():
        print(f"::add-mask::{u}", flush=True)
        print(f"::add-mask::{u.rsplit('/', 1)[-1]}", flush=True)
    return urls


def try_curl(name, url, cookies=None, ua=None, proxy=None):
    from curl_cffi import requests as cr
    dest = os.path.join(DL, name)
    headers = {"User-Agent": ua} if ua else None
    proxies = {"http": proxy, "https": proxy} if proxy else None
    try:
        with cr.Session(impersonate="chrome") as s:
            r = s.get(url, cookies=cookies, headers=headers, proxies=proxies, stream=True, timeout=600,
                      allow_redirects=True)
            ct = r.headers.get("content-type", "")
            log(f"  curl {name}: http {r.status_code} type={ct[:40]}")
            if r.status_code != 200:
                return False
            with open(dest, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    f.write(chunk)
    except Exception as e:  # noqa: BLE001
        log(f"  curl {name}: error {type(e).__name__}")
        return False
    ok = is_zip(dest)
    log(f"  curl {name}: {'ZIP' if ok else 'not a zip'} {os.path.getsize(dest)} bytes")
    if not ok:
        import re
        txt = open(dest, "rb").read(400000).decode("utf-8", "ignore")
        m = re.search(r"<title[^>]*>(.*?)</title>", txt, re.S)
        low = txt.lower()
        log(f"  curl {name}: html title={m.group(1).strip()[:80] if m else None!r} "
            f"login={'login' in low} challenge={'just a moment' in low} final_path_kind="
            f"{'login' if 'login' in str(r.url) else 'export' if 'export' in str(r.url) else 'other'}")
    if not ok:
        os.remove(dest)
    return ok


def try_browser(pending, urls, proxy=None):
    """Open each link in a real Chrome; let Chrome download it, or reuse its cleared cookies with curl."""
    from seleniumbase import Driver
    kw = dict(uc=True)  # Xvfb display provided by xvfb-run in the workflow
    if proxy:
        kw["proxy"] = proxy.split("://", 1)[-1]
    tag = "proxy" if proxy else "direct"
    dl_dir = os.path.abspath("downloaded_files")
    shutil.rmtree(dl_dir, ignore_errors=True)
    d = Driver(**kw)
    got = []
    try:
        for name in pending:
            url = urls[name]
            log(f"  chrome[{tag}] {name}: opening")
            try:
                d.uc_open_with_reconnect(url, 6)
                try:
                    d.uc_gui_click_captcha()
                except Exception:  # noqa: BLE001
                    pass
            except Exception as e:  # noqa: BLE001
                log(f"  chrome[{tag}] {name}: open error {type(e).__name__}")
            # wait for Chrome's own download
            deadline = time.time() + 900
            done = None
            while time.time() < deadline:
                files = [f for f in glob.glob(os.path.join(dl_dir, "*")) if not f.endswith(".crdownload")]
                partial = glob.glob(os.path.join(dl_dir, "*.crdownload"))
                zips = [f for f in files if is_zip(f) and os.path.basename(f) not in [os.path.basename(g) for g in got]]
                if zips and not partial:
                    done = zips[0]
                    break
                if not partial and time.time() > deadline - 840:  # nothing started after ~60s
                    break
                time.sleep(3)
            if done:
                shutil.move(done, os.path.join(DL, name))
                got.append(name)
                log(f"  chrome[{tag}] {name}: ZIP via browser {os.path.getsize(os.path.join(DL, name))} bytes")
                continue
            try:
                title = d.get_title()
            except Exception:  # noqa: BLE001
                title = "?"
            log(f"  chrome[{tag}] {name}: no download; page title={title[:60]!r}")
            # cookie hand-off (cf_clearance is bound to this IP + UA, which curl reuses)
            try:
                ck = {c["name"]: c["value"] for c in d.get_cookies()}
                ua = d.execute_script("return navigator.userAgent")
                log(f"  chrome[{tag}] {name}: cookies={sorted(ck)}")
                if try_curl(name, url, cookies=ck, ua=ua, proxy=proxy):
                    got.append(name)
            except Exception as e:  # noqa: BLE001
                log(f"  chrome[{tag}] {name}: cookie hand-off error {type(e).__name__}")
    finally:
        try:
            d.quit()
        except Exception:  # noqa: BLE001
            pass
    return got


def encrypt_and_split(names):
    tar = os.path.join(DL, "export.tar")
    subprocess.run(["tar", "-cf", tar, "-C", DL] + names, check=True)
    key = os.path.join(DL, "k.bin")
    with open(key, "wb") as f:
        f.write(os.urandom(48))
    pub = os.path.join(DL, "pub.pem")
    with open(pub, "w") as f:
        f.write(os.environ["XFER_PUBKEY"])
    subprocess.run(["openssl", "pkeyutl", "-encrypt", "-pubin", "-inkey", pub, "-pkeyopt", "rsa_padding_mode:oaep",
                    "-in", key, "-out", os.path.join(OUT, "key.enc")], check=True)
    enc = os.path.join(DL, "export.tar.enc")
    subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt", "-in", tar, "-out", enc,
                    "-pass", f"file:{key}"], check=True)
    subprocess.run(["sha256sum", tar], check=True, stdout=open(os.path.join(OUT, "tar.sha256"), "w"))
    subprocess.run(["split", "-b", "90m", "-d", "-a", "3", enc, os.path.join(OUT, "export.tar.enc.part")], check=True)
    for p in (key, tar, enc):
        os.remove(p)


def main():
    urls = load_urls()
    pending = list(urls)
    log(f"files: {pending}")
    for name in list(pending):
        if try_curl(name, urls[name]):
            pending.remove(name)
            status["files"][name] = "curl_direct"
    if pending:
        for name in try_browser(pending, urls):
            pending.remove(name)
            status["files"][name] = "chrome_direct"
    proxy = os.environ.get("PROXY_URL")
    if pending and proxy:
        for name in try_browser(pending, urls, proxy=proxy):
            pending.remove(name)
            status["files"][name] = "chrome_proxy"
    for name in pending:
        status["files"][name] = "FAILED"
    have = [n for n in urls if n not in pending]
    status["sizes"] = {n: os.path.getsize(os.path.join(DL, n)) for n in have}
    if have:
        encrypt_and_split(have)
    with open(os.path.join(OUT, "status.json"), "w") as f:
        json.dump(status, f, indent=1)
    log(json.dumps(status, indent=1))
    sys.exit(0 if have else 1)


if __name__ == "__main__":
    main()
