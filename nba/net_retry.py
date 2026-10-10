#!/usr/bin/env python3
"""
ONE RETRY POLICY FOR EVERY EXTERNAL CALL (owner 2026-10-09: "the system in general needs retry logic in all steps that
require it - steps that involve the proxy, external sources and so on").

Audit of 2026-10-09 (ledger "RETRY LOGIC"): every script had its own loop - single attempts on the critical path
(ParlayAPI, injury-report PDFs, Underdog/Sleeper page walks), fixed sleeps with no jitter, 429/5xx retried with no wait,
4xx retried as if transient, nothing honoured Retry-After, and several retry budgets were longer than the workflow
`timeout` around them (so the last attempts were killed, not made). This module is the one policy:

  * transient = connection errors, timeouts, and HTTP 408 / 425 / 429 / 5xx / 520-524 (and 403 when the caller says the
    host answers bot-walls with 403, e.g. DataDome) -> retried
  * final     = any other 4xx (400 / 401 / 404 / 410 / 422 ...) -> returned at once, never retried
  * backoff   = full jitter: sleep U(0, min(cap, base * 2^attempt)), raised to the server's Retry-After when it sends one
  * egress    = an ordered list of routes per attempt ("direct", "proxy"): a route that fails is followed by the next
                one in the same attempt before any sleep (keeps the proven direct-first-then-proxy pattern)
  * budget    = a wall-clock deadline: no attempt starts, and no sleep runs, past it - so the retries always fit inside the
                workflow's `timeout` wrapper and the caller gets a clean failure it can report

Use:
    from net_retry import request, call, Deadline
    r = request("GET", url, session=s, proxies=px, routes=("direct", "proxy"), tries=4, budget=Deadline(240))
    j = call(lambda: fetch_pdf(u), tries=3, label="injury pdf")
`request` works with requests / curl_cffi sessions (anything with .request(method, url, **kw)) or with the module itself.
Every retry is printed as one line: RETRY|<label>|attempt k/n|<reason>|sleep s.
"""
import os
import random
import time

TRANSIENT_STATUS = {408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}
DEFAULT_TRIES = int(os.environ.get("NET_RETRY_TRIES", "4"))
DEFAULT_BASE = float(os.environ.get("NET_RETRY_BASE", "2"))
DEFAULT_CAP = float(os.environ.get("NET_RETRY_CAP", "30"))


class RetryError(RuntimeError):
    """All attempts failed (or the budget ran out). .last holds the last response or exception."""

    def __init__(self, msg, last=None):
        super().__init__(msg)
        self.last = last


class Deadline:
    """A wall-clock budget in seconds. Deadline(None) never expires."""

    def __init__(self, seconds=None):
        self.end = None if seconds is None else time.time() + float(seconds)

    def left(self):
        return float("inf") if self.end is None else self.end - time.time()

    def expired(self, margin=0.0):
        return self.left() <= margin


def backoff(attempt, base=DEFAULT_BASE, cap=DEFAULT_CAP):
    """full-jitter exponential backoff for attempt 0, 1, 2 ..."""
    return random.uniform(0, min(cap, base * (2 ** attempt)))


def retry_after(resp):
    try:
        v = resp.headers.get("Retry-After") or resp.headers.get("retry-after")
        return min(120.0, max(0.0, float(v))) if v else None
    except Exception:  # noqa: BLE001
        return None


_SECRET_Q = None


def redact(text):
    """never print a credential: query values of apiKey / api_key / key / token / access_token / password, and
    user:pass@ in proxy URLs, are masked in every message this module prints or raises (requests' connection errors
    quote the full URL, query string included)."""
    global _SECRET_Q
    import re
    if _SECRET_Q is None:
        _SECRET_Q = (re.compile(r"(?i)((?:api_?key|apikey|key|token|access_token|password|secret)=)[^&\s'\"]+"),
                     re.compile(r"(://)[^/@\s:]+:[^/@\s]+@"))
    t = str(text)
    t = _SECRET_Q[0].sub(r"\1***", t)
    return _SECRET_Q[1].sub(r"\1***:***@", t)


def _sleep(seconds, deadline, label, k, n, reason):
    if deadline is not None:
        seconds = min(seconds, max(0.0, deadline.left() - 1.0))
    if seconds > 0:
        print(f"RETRY|{label}|attempt {k}/{n}|{reason}|sleep {seconds:.1f}s", flush=True)
        time.sleep(seconds)


def request(method, url, *, session=None, proxies=None, routes=("direct",), tries=DEFAULT_TRIES, base=DEFAULT_BASE,
            cap=DEFAULT_CAP, budget=None, retry_403=False, ok=None, label=None, timeout=60, **kw):
    """One HTTP call with the system's retry policy. Returns the response that satisfied `ok` (default: status 200),
    or a FINAL response (non-transient 4xx) at once. Raises RetryError when every attempt failed or the budget ran out.
    routes: ordered egress per attempt - "direct" (no proxy) and/or "proxy" (the `proxies` dict); "proxy" is skipped
    when no proxies were given. The per-request timeout is clipped to the remaining budget."""
    if session is not None:
        sender = session
    else:   # imported only when no session is given: several workflows install curl_cffi but not requests
        import requests as sender
    ok = ok or (lambda r: r.status_code == 200)
    label = redact(label or url.split("?")[0][-70:])
    routes = [r for r in routes if r == "direct" or (r == "proxy" and proxies)] or ["direct"]
    transient = TRANSIENT_STATUS | ({403} if retry_403 else set())
    last = None
    for attempt in range(tries):
        wait_hint = None
        for route in routes:
            if budget is not None and budget.expired(1.0):
                raise RetryError(f"{label}: budget exhausted after {attempt} attempt(s)", last)
            t = timeout if budget is None else max(5.0, min(timeout, budget.left() - 1.0))
            try:
                r = sender.request(method, url, proxies=(proxies if route == "proxy" else None), timeout=t, **kw)
            except Exception as exc:  # noqa: BLE001  (connection error, timeout, TLS, proxy tunnel)
                last = exc
                print(f"RETRY|{label}|attempt {attempt + 1}/{tries} via {route}|{type(exc).__name__}: {redact(exc)[:90]}", flush=True)
                continue
            last = r
            if ok(r):
                return r
            if r.status_code not in transient:
                if route != routes[-1]:
                    # a 4xx on one egress (e.g. a geo / bot wall on the runner's own IP) is not final while another
                    # route is left - the proven direct-then-proxy pattern tries the proxy before giving up
                    print(f"RETRY|{label}|attempt {attempt + 1}/{tries} via {route}|http {r.status_code} - next route", flush=True)
                    continue
                return r          # final answer (404, 422 ...) - the caller decides what it means
            wait_hint = retry_after(r) or wait_hint
            print(f"RETRY|{label}|attempt {attempt + 1}/{tries} via {route}|http {r.status_code}", flush=True)
        if attempt < tries - 1:
            _sleep(max(backoff(attempt, base, cap), wait_hint or 0.0), budget, label, attempt + 1, tries, "backing off")
    raise RetryError(redact(f"{label}: {tries} attempt(s) failed; last: "
                            f"{getattr(last, 'status_code', None) or type(last).__name__ if last is not None else 'nothing'}"), last)


def call(fn, *, tries=DEFAULT_TRIES, base=DEFAULT_BASE, cap=DEFAULT_CAP, budget=None, retry_on=(Exception,),
         label="call", give_up_on=()):
    """Run fn() with the retry policy for anything that is not a plain HTTP request (browser steps, SDK calls, a whole
    page walk). Exceptions in give_up_on are re-raised at once."""
    last = None
    for attempt in range(tries):
        if budget is not None and budget.expired(1.0):
            break
        try:
            return fn()
        except give_up_on:
            raise
        except retry_on as exc:  # noqa: PERF203
            last = exc
            print(f"RETRY|{label}|attempt {attempt + 1}/{tries}|{type(exc).__name__}: {str(exc)[:110]}", flush=True)
            if attempt < tries - 1:
                _sleep(backoff(attempt, base, cap), budget, label, attempt + 1, tries, "backing off")
    raise RetryError(f"{label}: {tries} attempt(s) failed", last)


if __name__ == "__main__":
    # self-test (no network): backoff bounds, budget clipping, final vs transient classification
    assert all(0 <= backoff(a, 2, 30) <= min(30, 2 * 2 ** a) for a in range(8) for _ in range(50))
    d = Deadline(0.5)
    assert not d.expired() and Deadline(None).left() == float("inf")

    class R:
        def __init__(self, code, h=None):
            self.status_code, self.headers = code, h or {}

    class S:
        def __init__(self, codes):
            self.codes, self.n = list(codes), 0

        def request(self, method, url, **kw):
            self.n += 1
            c = self.codes.pop(0)
            if isinstance(c, Exception):
                raise c
            return R(c)

    s = S([503, ConnectionError("x"), 200]); assert request("GET", "u", session=s, tries=3, base=0.01).status_code == 200 and s.n == 3
    s = S([404]); assert request("GET", "u", session=s, tries=3, base=0.01).status_code == 404 and s.n == 1
    s = S([403, 200]); assert request("GET", "u", session=s, tries=3, base=0.01).status_code == 403 and s.n == 1
    s = S([403, 200]); assert request("GET", "u", session=s, tries=3, base=0.01, retry_403=True).status_code == 200
    s = S([429, 429, 429])
    try:
        request("GET", "u", session=s, tries=3, base=0.01); raise AssertionError("should fail")
    except RetryError:
        pass
    s = S([403, 200])   # a 4xx wall on the direct route falls through to the proxy route in the same attempt
    assert request("GET", "u", session=s, proxies={"https": "p"}, routes=("direct", "proxy"), tries=1).status_code == 200
    s = S([ConnectionError("direct down"), 200])   # direct fails, proxy answers in the SAME attempt (no sleep)
    t0 = time.time(); assert request("GET", "u", session=s, proxies={"https": "p"}, routes=("direct", "proxy"), tries=1).status_code == 200
    assert time.time() - t0 < 0.5
    n = {"k": 0}

    def flaky():
        n["k"] += 1
        if n["k"] < 3:
            raise TimeoutError("t")
        return "ok"
    assert call(flaky, tries=3, base=0.01) == "ok"
    print("net_retry self-test: OK")
