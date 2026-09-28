# BETR PICKS — COMPLETE BUILD RECORD (2026-09-28)

Status: **SOLVED via a browser harvester on a US-residential machine (Path C).** The board is captured,
parsed correctly, and wired into the pipeline. Not yet scheduled (owner's choice, later). A separate
open question — can our own infra (GitHub / Cloudflare Worker) do it unattended — is analysed at the end.

──────────────────────────────────────────────────────────────────────────────
## 1. WHAT BETR IS
- Betr Picks = real-money DFS pick'em (Betr Holdings; Miami; Joey Levy + Jake Paul). iPhone app + a web
  app at **picks.betr.app**. No public developer API (API Evangelist profile confirms: no OpenAPI/GraphQL
  SDL/MCP; anonymous requests to the backend return 403/500).
- One of five DFS apps we track. PrizePicks is the product target (fully covered); Sleeper is live with
  its ladder; Betr is the marginal fifth — useful as a price/line comparison source.

## 2. THE STACK (as reverse-engineered)
- **Auth:** Keycloak at `account.betr.app/realms/betr`, client `betr-rn`, standard OAuth2 + PKCE, with
  **MFA (SMS)**. Login yields an access token (RS256 JWT, aud "account", ~30-day exp) and an **OFFLINE
  refresh token** (`refresh_expires_in: 0` = never expires) that mints access tokens headless forever.
  Secrets already saved: `BETR_REFRESH_TOKEN`, `BETR_CLIENT_ID`. (These turned out NOT to be needed for
  the board — see §4 — but work and are harmless.)
- **Two API hosts:**
  - `api.betr.app` — the "events/slate" side. `GET /api/v3/events?league_ids=1` returns NBA games
    (league id "1"), teams, tip times, is_player_props_booked. **Works headless** with the Bearer.
  - `api.fantasy.betr.app/graphql` — the BOARD. Apollo GraphQL behind an **Envoy/Cloudflare edge**.
    Operation **`LeagueUpcomingEvents(league: NBA|WNBA)`** -> `getUpcomingEventsV2` -> events ->
    players -> **projections** (the props). Lobby also calls `GetLobbyContent`, `getAllLeaguesConfigs`,
    `GetEntryAndFeedConfigs`.
- **Realtime:** an Ably websocket (`ws-token-request` -> Ably token; channels market:* event:* fixture:*
  league:*). Carries live line-move DELTAS, not the initial board (idle channels push nothing; rewind
  empty). Not used by the harvester.

## 3. THE WALL, DIAGNOSED (17 raw-HTTP probes, all documented)
`api.fantasy.betr.app/graphql` returned **401 to every server-side request**, including the owner's own
live browser token. Ruled OUT with controlled tests, in order: token identity (captured browser token
401s from a server), token CLAIMS (captured vs refreshed are claim-for-claim identical, same sid), ACR/MFA
level, datacenter IP, **US residential proxy** (PROXY_URL verified Comcast/California/hosting:false — still
401), request headers (full sec-fetch-*/sec-ch-ua/channel/jurisdiction set), TLS/JA3 (10 curl_cffi
impersonations), HttpOnly/Set-Cookie session (none set anywhere), session rotation, and 8 guessed extra
headers. **Then the browser test revealed it:** loading picks.betr.app shows a **Cloudflare Turnstile
"Verify you are human" interactive checkbox.** Vanilla Playwright gets flagged and the checkbox loops.
Research (Zenrows/Scrapfly/ScrapingBee, 2026): Turnstile "requires JavaScript execution, browser
fingerprinting, and cryptographic proof-of-work" — **HTTP-only clients cannot pass, by design.** The
commercial Apify "Betr Picks Scraper" advertises exactly this: "public GraphQL, No login, **US residential
proxy**" — i.e. it runs a real stealth browser on a residential IP. That is the requirement.

## 4. THE SOLUTION THAT WORKS (Path C) — `nba/betr_harvest.py`
Runs on a **US-residential machine with a real display** (owner's Windows PC; the mini-PC later). Steps:
1. **SeleniumBase UC Mode** (`pip install seleniumbase`) launches undetected Chromium.
   `sb.uc_gui_click_captcha()` clears the Turnstile automatically.
2. **Persistent Chrome profile** (`./betr_profile`): the board requires being LOGGED IN (anonymous nav
   loops back to login). Log in BY HAND once (phone + password + SMS) with `BETR_LOGIN=1`; the session is
   saved and reused forever after — no re-login, no code.
3. **Passive CDP capture** (NOT an injected fetch — CSP blocks that, and the reloading lobby kills injected
   async scripts with a script-timeout). Enable the CDP `Network` domain, auto-click the league tab
   (`//*[normalize-space(text())="WNBA"]`), let the app fetch its OWN `getUpcomingEventsV2` (returns 200
   for the logged-in page), and pull the response body from the CDP performance log.
4. Parse projections -> `boards/betr_<league>_current.json` (+ `_meta`), and `betr_nba_current.json` for NBA.

Run:
    python -m pip install --upgrade seleniumbase
    $env:BETR_LEAGUE="WNBA"; $env:BETR_LOGIN="1"; python nba/betr_harvest.py   # FIRST run: log in by hand (3 min)
    $env:BETR_LEAGUE="WNBA"; python nba/betr_harvest.py                        # after: fully hands-off
    $env:BETR_LEAGUE="NBA";  python nba/betr_harvest.py                        # once NBA posts (2026-10-20)

## 5. VERIFIED DATA (WNBA, 2026-09-28, ~1,000 legs/run)
Correct field mapping, learned from the raw projection shape:
- **stat = projection `key`**: POINTS, REBOUNDS, ASSISTS, THREE_POINTERS_MADE, POINTS_REBOUNDS_ASSISTS,
  POINTS_REBOUNDS, POINTS_ASSISTS, ASSISTS_REBOUNDS, DOUBLE_DOUBLE, and period props **1ST_QUARTER_POINTS**
  (and by extension 1ST_HALF_*, etc.). (NOT `type` — that was the first-parse bug.)
- **`type` = payout TIER** (REGULAR / BOOSTED / SUPER_BOOSTED / MINI_BOOSTED / EDGE_1..4 / BOOSTED_4) —
  Betr's goblin/demon axis. Stored as leg['tier'].
- **sides = MORE / LESS** -> over/under flags (611/611 mains carry a side; 136 both-sided).
- **alt ladder = `nonRegularValue` when > 0** (0.0 = no alt). Example ladder: Jackie Young 3PT
  2.5 REGULAR -> 3.5 BOOSTED -> 4.5 SUPER_BOOSTED; assists 4.5 -> 5.5 -> 7.5 across EDGE/MINI tiers.
- 0 bad legs; 0 null lines.

## 6. PIPELINE WIRING (done)
`archive_live_boards.py::rows_betr` (committed): maps Betr `key` -> scorer market key, period prefixes
(1ST_QUARTER_/1ST_HALF_ -> _q1/_h1), files non-REGULAR tiers and alt rungs as `_alternate` (never overwrite
the main REGULAR line). Emits the 14-field tuple = board_snapshots columns. `betr` is already in
`ARCHIVE_APPS` and routed in main(). So the moment `boards/betr_nba_current.json` is committed, P3's
archiver ingests it exactly like the other apps.

## 7. SCHEDULING (built, not yet installed) — `nba/betr_run_and_commit.py`
Wrapper: runs the harvester, then commits the board file(s) to the repo via the GitHub API (so P3 ingests
them). For **Windows Task Scheduler** on the owner's PC / mini-PC. Needs a fine-grained GitHub token with
Contents:read/write, set once: `setx BETR_GH_TOKEN "<token>"`. Suggested schedule (Pacific): 10:45 and
13:15 to match P3's board windows:
    schtasks /create /tn "Betr AM" /tr "python <path>\betr_run_and_commit.py" /sc daily /st 10:45
    schtasks /create /tn "Betr PM" /tr "python <path>\betr_run_and_commit.py" /sc daily /st 13:15
NOTE: the wrapper assumes the repo layout (nba/ + boards/). Owner has been running loose files in C:\old;
if not cloning the repo, repackage the harvester + committer as two flat files. Decide clone-vs-flat before
installing.

## 8. STILL OPEN
- **alt/boosted MULTIPLIER**: `nonRegularPercentage` reads 0 in the capture; the payout multiplier likely
  lives on `allowedOptions[].marketOption` (marketOptionId present) or a sibling field. Lines are complete;
  capture the multiplier when the slip/multiplier work resumes.
- **Session longevity**: unknown how long the logged-in profile lasts before Betr forces re-auth. If a
  scheduled run finds itself logged out, it writes no board (harmless) until a BETR_LOGIN=1 run. Add a
  freshness check to the certifier's per-app board-liveness (already reads betr meta).
- **Whether our own infra can do this unattended** — see §9.

## 9. CAN OUR SYSTEM DO IT (GitHub Actions / Cloudflare Worker), UNATTENDED? — analysis 2026-09-28
Short answer: **not reliably, and not without a persistent residential browser somewhere.** Detail:
- **GitHub Actions runner**: datacenter IP (Azure) — Turnstile scores it as a bot instantly. Even routing
  the browser through PROXY_URL (residential), the runner would need a full stealth browser (Camoufox /
  SeleniumBase UC) AND to solve the interactive Turnstile with NO human and NO display. Turnstile's
  interactive mode is specifically built to defeat this; success rates for headless solves are partial and
  decay with each Cloudflare update. Also the login is MFA-gated: the profile/session would have to be
  seeded once from a real login and shipped to the runner as a secret (a large, expiring cookie jar) —
  fragile, and it re-triggers Turnstile when the fingerprint/IP shifts between runs.
- **Cloudflare Worker**: cannot run a browser at all (no DOM/Chromium). Cloudflare Browser Rendering
  (Puppeteer on Workers) exists, but Betr's edge is ALSO Cloudflare — a CF-origin headless browser is
  trivially fingerprinted, and Browser Rendering is not built to solve third-party Turnstile. Dead end.
- **The honest options for "no owner machine":**
  1. **Pay a managed bypass** — the Apify Crawloop Betr actor, or a Cloudflare-bypass scraping API
     (ScrapingBee stealth_proxy, Zenrows, Scrapfly). They run stealth-browser fleets + residential proxies
     + (for interactive) captcha solvers. Cost, and dependence on a third party, but zero owner hardware.
     Endpoint (Apify): api.apify.com/v2/acts/crawloop~betr-picks-scraper/run-sync-get-dataset-items?token=…
  2. **A captcha-solver service (2Captcha/CapSolver) wired into a runner's stealth browser** — turns the
     interactive Turnstile into an API call (~$1-3 per 1000 solves). This is the only way a GitHub runner
     could plausibly do it unattended, and it's still brittle (proxy reputation + fingerprint must also
     pass). Meaningful engineering + a paid solver + a residential proxy, to automate the fifth app.
  3. **The mini-PC / home server** (already planned): residential IP by nature, always-on, real browser.
     This is Path C without the owner's desktop — the natural permanent home. **Recommended** when it's up:
     move betr_harvest.py + betr_run_and_commit.py there under Task Scheduler/cron, done.
- **Verdict:** the cheapest robust automation is the **mini-PC running Path C** (free, in-house, already
  built). Pure-cloud unattended (GitHub/CF) is possible only by paying a managed bypass or a captcha solver,
  and is not worth it for the marginal fifth app. Recommendation: run Path C on the owner's PC now if wanted,
  migrate to the mini-PC when it exists; revisit a paid API only if Betr becomes higher priority.
