# BETR — build state (2026-09-28, after 15 probes + research)

## DIAGNOSIS (final): the board is ANONYMOUS; the wall is a US-residential-IP / browser-TLS edge gate
- 15 probes proved the Keycloak token is irrelevant to api.fantasy.betr.app/graphql: captured browser
  token, refreshed token, claim-identical tokens, no token at all -> ALL 401, direct and via our PROXY_URL,
  across 10 TLS impersonations, 6 jurisdictions, with/without cookies/session. The 401 is not auth.
- Confirmed by external research: the commercial Apify "Betr Picks Scraper" (Crawloop DFS Props Suite)
  advertises it explicitly — **"via public GraphQL. No login, US residential proxy."** And API Evangelist's
  Betr profile: "Live private backend (Symfony). Anonymous requests return HTTP 500 / 403. No contract."
  => The gateway serves anonymous requests but ONLY from a genuine US residential IP with a real browser
     TLS/JA-signature. Our GitHub runner and current PROXY_URL don't present as that to Betr's Envoy edge.
- So the whole token quest was the wrong problem. No login is needed; a qualifying US residential egress is.

## THE BOARD (known, anonymous)
POST api.fantasy.betr.app/graphql, op LeagueUpcomingEvents(league: NBA|WNBA) -> players -> projections
{ value(LINE), currentValue, nonRegularValue(ALT LINE), nonRegularPercentage, allowedOptions{outcome},
marketStatus }. Full self-contained query in probe_betr.py git history. NO Authorization header required.

## THE THREE WAYS TO MAKE IT WORK (pick per cost/control)
1. **Apify Crawloop Betr scraper (fastest, most reliable, OWNER DECISION on $$):**
   GET/POST https://api.apify.com/v2/actors/crawloop~betr-picks-scraper/run-sync-get-dataset-items?token=APIFY_TOKEN
   Returns normalized Betr NBA props JSON from THEIR US residential proxies. Needs only an Apify token
   (secret APIFY_TOKEN). Zero Betr auth, zero MFA. A tiny fetcher writes boards/betr_nba_current.json.
   There is also a multi-source actor (PrizePicks+Betr+Pick6+Underdog in one run) if we ever want it.
2. **Our own US residential proxy** (if PROXY_URL is upgraded to a real US-resident pool): the anonymous
   GraphQL call in probe_betr.py should then 200 directly — no token, no capture. Cheapest if such a proxy
   is already available; the current PROXY_URL evidently is not US-resident enough for Betr's edge.
3. **The mini-PC/home-server** (already planned): run the anonymous GraphQL from the home connection (US
   residential by nature) on a cron; POST the JSON to Postgres/commit the board file. No third party.

## HARVESTER (once egress is sorted; scheduled snapshot)
[US-resident GET] LeagueUpcomingEvents(NBA) -> parse projections (main + nonRegular alt ladder +
allowedOptions) -> boards/betr_nba_current.json. archive_live_boards routes betr via rows_generic; add a
rows_betr for the projection/alt shape (like rows_sleeper). Cron 2x/day.

## SUPERSEDED
The offline Keycloak refresh token / BETR_ACCESS_TOKEN path is NOT needed (board is anonymous). Keep the
secrets harmlessly or delete; they do not unlock the fantasy edge. Rotate the Betr password at leisure
(tokens were pasted in chat) — not load-bearing for this integration.

## tooling
nba/probe_betr.py (current = anonymous GraphQL tester) + nba-probe.yml. Trigger via
nba/TRIGGER_NBA_PROBE.txt -> `script: probe_betr.py`.
