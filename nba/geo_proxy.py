"""
Owner-location proxy for the BOARD scrapers (2026-10-30). Owner: "always use a Southern California location so if there is
anything board difference it matches the legs from my location".

geo(url) turns the stored DataImpulse URL (username ends `__cr.us`) into a San Diego exit by extending the country tag with
`;state.california;city.sandiego` (probe run 2026-10-30: 3/3 exits in CA; state-only was 2/3). Boards only - stats.nba.com
and the other stat scrapers keep the plain PROXY_URL (state/city targeting is billed at 2x by DataImpulse).

Env: BOARD_GEO (default ";state.california;city.sandiego"; set to "off" to disable). Never prints the credential.
"""
import os

DEFAULT = ";state.california;city.sandiego"


def geo(url):
    u = (url or "").strip()
    if not u:
        return u
    extra = os.environ.get("BOARD_GEO", DEFAULT).strip()
    if not extra or extra.lower() == "off" or "__cr.us" not in u or ";state." in u or ";city." in u:
        return u
    return u.replace("__cr.us", "__cr.us" + extra, 1)


def geo_proxy_env():
    return geo(os.environ.get("PROXY_URL", ""))


def routes():
    """geo proxy first (owner location), the runner's own IP only as a fallback"""
    return ("proxy", "direct")
