# BETR — build state (2026-09-28, after 17 probes + research)

## FINAL DIAGNOSIS: board is anonymous, but the edge needs a real BROWSER RUNTIME, not just a US-res IP
Proven across 17 probes:
- Board is anonymous (no token needed) — confirmed by external research (Apify Crawloop "No login") and
  by our own tests (token vs no-token identical 401).
- PROXY_URL is a genuine US RESIDENTIAL IP: ip-api shows Comcast Cable, California, hosting:false,
  proxy:false. Exactly what the commercial scraper says it needs.
- STILL 401 through that residential proxy, across: matched jurisdiction (CA), US, none; minimal headers;
  full app headers; GET with query params; and 8 guessed extra headers (apollographql-client-name,
  x-tenant, x-client, betr-platform, x-betr-jurisdiction, graphql-require-preflight, ...).
=> A plain HTTP request cannot pass the edge even from a residential IP. The commercial Apify actor must
   run a REAL HEADLESS BROWSER that executes Betr's JS (which computes a per-request signed header / solves
   an anti-bot / Akamai-Envoy challenge invisible to DevTools and uncapturable as a static value). Our
   requests/curl_cffi calls reproduce a browser-shaped PACKET but not the browser RUNTIME.

## WHAT ACTUALLY WORKS (ranked, honest)
1. **Headless browser (Playwright) through the residential proxy** — load picks.betr.app in real Chromium,
   let its JS run and authenticate, then read the LeagueUpcomingEvents response (or call the GraphQL from
   the page context so the JS-computed headers are attached). This is the in-house path that matches what
   the commercial actor does. Heaviest to run (needs Chromium on the runner or the mini-PC) but no third
   party and no per-result fee. The mini-PC/home-server is the natural host (residential by nature +
   always-on).
2. **Apify Crawloop Betr actor** — pay Apify to run exactly that headless+residential stack. Free tier
   $5/mo credit (no card); actor may add a per-run/result fee (rental model retiring Oct 1 2026 -> pay-per-
   usage). Fastest, least control, small ongoing cost. Endpoint:
   api.apify.com/v2/acts/crawloop~betr-picks-scraper/run-sync-get-dataset-items?token=APIFY_TOKEN
3. **Give up on Betr** — it is one of five DFS apps; PrizePicks (the product target) is fully covered and
   Sleeper is now live with its ladder. Betr is marginal.

## KNOWN-GOOD PIECES (reuse whichever path)
- Board query: GraphQL LeagueUpcomingEvents(league: NBA|WNBA) -> players -> projections{ value(LINE),
  currentValue, nonRegularValue(ALT LINE), nonRegularPercentage, allowedOptions{outcome}, marketStatus }.
- events?league_ids=1 works headless on api.betr.app (only the fantasy host is edge-gated).
- Offline refresh token mints access tokens (not needed for the anonymous board, but harmless).
- archive_live_boards routes betr via rows_generic; add rows_betr for the projection/alt shape.

## RECOMMENDATION
Do Betr via a Playwright harvester on the mini-PC when it's up (path 1) — free, in-house, and it's the only
thing that reproduces what the edge demands. Until then, Betr stays a documented no-op in ARCHIVE_APPS; the
certifier WARNs (harmless). Not worth more raw-HTTP probing — that dimension is exhausted.

## tooling
nba/probe_betr.py (current = residential-proxy header sweep) + nba-probe.yml. If pursuing path 1, next step
is a Playwright probe (install playwright + chromium in the workflow) that loads picks.betr.app via the
residential proxy and dumps the LeagueUpcomingEvents response.
