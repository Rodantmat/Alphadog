# GEMINI USAGE GUIDE — How To Call It, How To Prompt It Well

## How to call it (exact, real, working pattern)

Gemini is reachable through the Alphadog Bridge connector's `run_job` tool, targeting the admin-sql worker's proxy route directly:

```
run_job(
  job: "direct_worker_probe",
  extra: {
    method: "POST",
    url: "https://alphadog-v2-admin-sql.rodolfoaamattos.workers.dev/gemini-proxy",
    body: "{\"model\": \"gemini-3.6-flash\", \"prompt\": \"<your real, specific prompt here>\"}"
  }
)
```

This is a REAL, live, working endpoint used dozens of times successfully this session. The `body` field must be a JSON-encoded STRING (note the escaped quotes), not a nested object.

**Known real limitation**: Gemini's responses sometimes get cut off mid-sentence (a real, observed truncation, not a formatting artifact). When this happens, send a direct follow-up call: `"Continue exactly where you left off - you were mid-sentence explaining X. Finish that, then also cover Y."` This recovery pattern has worked reliably every time it was needed.

## What Gemini is genuinely good for in this research (confirmed by real, successful uses)

1. **Generating a specific, falsifiable hypothesis with a real mechanism**, not a vague direction. The single best real example from this session: asked "which of these three real data layers (schedule fatigue, umpire tendency, weather) is most likely to compound with a validated bottom-of-order signal, and why, with the exact baseball mechanism" — Gemini correctly identified umpire tendency and explained a specific, checkable causal chain (strike-zone expansion → shorter innings → capped plate appearances for bottom-of-order hitters). This was then directly tested against real data (and honestly ruled out — see SIGNALS_TECHNIQUES_TRIED.md — but the hypothesis itself was sound and worth testing).
2. **Second-opinion mathematical sanity-checks**, especially on EV/compounding logic. Real example: verified the "every demon tier's per-leg EV is below 1.0, so bigger slips always make it worse" conclusion independently, correctly, and added the one real caveat (positive leg correlation could theoretically flip this) — which was then directly tested and honestly refuted with real data.
3. **Deriving a formula from first principles** when a known real observation doesn't match a simple model. Real example: Sleeper's Flex payout didn't match a naive "same ratio as Power" assumption; Gemini correctly derived the real round-robin decomposition mechanism from the one available real data point, and it was then confirmed to match a second, independent real observation almost exactly.

## How to prompt it well (real, working patterns to copy)

- **Always give it the specific real numbers**, not a paraphrase. Every successful use included exact real figures (hit rates, sample sizes, dates, dollar amounts).
- **State what's already been tried and rejected**, so it doesn't waste a real hypothesis re-suggesting something already ruled out.
- **Ask for ONE specific, prioritized hypothesis with a mechanism**, not a general brainstorm — "give me your single best real hypothesis, with the exact mechanism" produces far more testable output than "what do you think."
- **Explicitly ask it to flag which of several options is structurally weaker/likely redundant**, and why — this produced genuinely useful negative information (ruling things out before spending real testing effort on them).

## What NOT to do

- Don't treat a Gemini hypothesis as validated just because it sounds mechanistically plausible — every real hypothesis this session, including Gemini's own, was independently tested against real data before being trusted, and several sound-seeming ones were honestly rejected.
- Don't skip the real-data verification step "because Gemini already explained the mechanism" — the mechanism explaining *why* something might work is not the same as it *actually working* on real data (see: pitcher-dominance stacking, which had a correct mechanism but a real effect size 20x smaller than predicted).

## Required: also use real, live web search — not Gemini alone

Every research pass must include genuine external web research on top of Gemini, not instead of it:
- **Real, current PrizePicks/Sleeper/Underdog payout tables**: these apps update their published tables periodically (confirmed real: a 2025-06-02 PrizePicks announcement increased 3-pick and 4-pick Flex payouts). Never assume a cached number is still current — verify via a fresh search each research session, especially before trusting any multiplier assumption in a new backtest.
- **Real injury reports, weather, umpire assignments, and other externally-sourced signals** not already captured in the system's own daily-context layer — cross-reference anything genuinely new against what `context`/`daily` schema tables already have before assuming a new external data source is needed.
- **No exceptions**: every single research step this session that touched a real payout table or a real external fact was verified via search before being trusted, not assumed from training knowledge. The daily coworker session must do the same, every time, without being asked.
