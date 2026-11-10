"""
TEMU PROBE (2026-11-09): can a cloud runner (no owner laptop) read Temu products + prices?
Real Chrome via SeleniumBase UC + Xvfb (same chain as the Betr/PrizePicks probes). Logged out, nothing is bought.
Env: TEMU_PROXY=1 routes through the residential proxy (start_local_proxy); 0 = plain GitHub runner IP.
     TEMU_QUERY = search keyword to test. Prints one JSON summary line per page plus samples.
"""
import json, os, re, sys, time
from seleniumbase import SB

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "nba"))

USE_PROXY = os.environ.get("TEMU_PROXY", "0") == "1"
QUERY = os.environ.get("TEMU_QUERY", "dog shirt")

EXTRACT_JS = r"""
const out=[]; const seen=new Set();
for (const a of document.querySelectorAll('a[href*="goods_id="], a[href*="-g-"]')) {
  const m = a.href.match(/goods_id=(\d+)/) || a.href.match(/-g-(\d+)\.html/);
  if (!m || seen.has(m[1])) continue;
  let card=a; for (let k=0;k<6 && card.parentElement;k++){ if (/\$\s?\d/.test(card.innerText||'')) break; card=card.parentElement; }
  const txt=(card.innerText||'').replace(/\s+/g,' ').trim();
  const prices=[...txt.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)].map(x=>x[1]);
  const img=card.querySelector('img[alt]');
  let title=(img && img.alt || a.getAttribute('aria-label') || '').replace(/^item picture\s*/i,'').trim();
  if (!title) title = txt.slice(0,120);
  const sold=(txt.match(/([\d.,]+K?\+?)\s*sold/i)||[])[1]||null;
  seen.add(m[1]);
  out.push({goods_id:m[1], title:title.slice(0,140), price:prices[0]||null, prices:prices.slice(0,3), sold, url:a.href.split('&_oak')[0]});
}
return out;
"""

def state(sb):
    try:
        url = sb.get_current_url()
        title = sb.get_title()
        body = sb.execute_script("return (document.body && document.body.innerText || '').slice(0,400)")
    except Exception as e:
        return {"url": None, "title": None, "body": f"ERR {e}"}
    return {"url": url, "title": title, "body": re.sub(r"\s+", " ", body)}

def blocked(st):
    u = (st["url"] or "").lower(); t = (st["title"] or "").lower(); b = (st["body"] or "").lower()
    if "login" in u or "sign in / register" in b: return "LOGIN_WALL"
    if "captcha" in u or "verify" in t or "slide to" in b or "security check" in b: return "CAPTCHA"
    return None

def visit(sb, label, url, scrolls=0, wait=6):
    t0 = time.time()
    try:
        sb.uc_open_with_reconnect(url, 4)
    except Exception as e:
        print(json.dumps({"page": label, "error": str(e)[:200]}), flush=True); return []
    sb.sleep(wait)
    for _ in range(scrolls):
        sb.execute_script("window.scrollBy(0, 2500)"); sb.sleep(2.2)
    st = state(sb)
    items = []
    if not blocked(st):
        try: items = sb.execute_script(EXTRACT_JS) or []
        except Exception as e: st["extract_err"] = str(e)[:200]
    priced = [i for i in items if i.get("price")]
    print(json.dumps({"page": label, "secs": round(time.time()-t0,1), "final_url": (st["url"] or "")[:160],
                      "title": st["title"], "block": blocked(st), "products": len(items), "with_price": len(priced),
                      "body_head": st["body"][:200]}), flush=True)
    for i in priced[:8]:
        print("   ", json.dumps(i)[:300], flush=True)
    return items

def main():
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True)
    lp = None
    if USE_PROXY:
        from betr_harvest_cloud import start_local_proxy
        lp, proxy_arg = start_local_proxy()
        if proxy_arg: kw["proxy"] = proxy_arg
    print(f"=== TEMU PROBE mode={'proxy' if USE_PROXY else 'runner-ip'} query={QUERY!r}", flush=True)
    with SB(**kw) as sb:
        home = visit(sb, "homepage", "https://www.temu.com/", scrolls=6, wait=8)
        chans = []
        try:
            chans = sb.execute_script("return [...new Set([...document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>/temu\\.com\\/(channel|[a-z0-9-]+-o3-\\d+)/.test(h)))].slice(0,6)") or []
        except Exception: pass
        print("channel/category links seen:", json.dumps(chans)[:600], flush=True)
        visit(sb, "search", "https://www.temu.com/search_result.html?search_key=" + QUERY.replace(" ", "%20"), scrolls=2)
        if home:
            visit(sb, "product_full_link", home[0]["url"], wait=6)
            visit(sb, "product_bare", "https://www.temu.com/goods.html?goods_id=" + home[0]["goods_id"], wait=6)
        for c in chans[:3]:
            visit(sb, "channel", c, scrolls=2)
        visit(sb, "best_sellers", "https://www.temu.com/channel/best-sellers.html", scrolls=2)
        visit(sb, "homepage_again", "https://www.temu.com/", scrolls=3, wait=5)
        try:
            ck = [c["name"] for c in sb.driver.get_cookies()]
            print("cookies (names):", ck, flush=True)
        except Exception: pass
    if lp:
        try: lp.terminate()
        except Exception: pass

if __name__ == "__main__":
    main()
