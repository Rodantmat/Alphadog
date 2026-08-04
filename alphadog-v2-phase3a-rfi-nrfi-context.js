import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-phase3a-rfi-nrfi-context";
const VERSION = "alphadog-v2-gemini-calibration-checker-v1.0.0";
const JOB_KEY = "gemini-calibration-checker";
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function pg(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false, connect_timeout: 8 });
}
function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

async function gatherIntel(sql) {
  // Top legs currently qualifying for slip recommendation - PRIMARY tier, highest scores,
  // across all 3 live sources, read directly from the real production board.
  const topLegs = await sql`
    SELECT source_key, player_name, canonical_prop_key, line_value, selected_side,
      estimated_hit_probability_0_100, probability_confidence_0_100, score_0_100, score_grade,
      is_goblin, is_demon, official_date
    FROM score.final_board_current
    WHERE board_tier='PRIMARY'
    ORDER BY score_0_100 DESC NULLS LAST
    LIMIT 25`;

  // Every currently-active calibration correction, with its real fitted parameters and honest
  // out-of-sample validation numbers - not a summary, the actual evidence.
  const activeCalibrations = await sql`
    SELECT DISTINCT canonical_prop_key, methodology, fit_at, notes
    FROM score.calibration_correction_map
    WHERE methodology NOT LIKE '%DEACTIVATED%' AND methodology NOT LIKE '%SUPERSEDED%'
    ORDER BY canonical_prop_key`;

  // Sample size context per prop - how much real, graded history backs each calibration.
  const populationStats = await sql`
    SELECT canonical_prop_key, selected_side, COUNT(*) as tier_rows
    FROM classification.population_stats
    GROUP BY canonical_prop_key, selected_side
    ORDER BY canonical_prop_key`;

  return { topLegs, activeCalibrations, populationStats };
}

function buildPrompt(intel) {
  return `You are being asked to provide a rigorous, skeptical second opinion on a live sports-prop probability calibration system, by a team that wants honest pushback, not validation.

CONTEXT: This is AlphaDog, a real-money MLB player-prop scoring system. It estimates hit probability (HP) for player props (hits, strikeouts, RFI/NRFI, etc.), then applies Platt-scaling calibration corrections fit on real, historical, held-out graded outcomes before showing scores to a real user placing real slips today.

METHODOLOGY AS WE UNDERSTAND IT:
- Base HP comes from a tiered classification/baseline system (v6) using recent player performance, matchup context, and population-relative tiering.
- Calibration corrections (Platt scaling: p_calibrated = sigmoid(A*logit(p_raw) + B)) are fit per prop type on real graded historical outcomes, with an explicit train/test split - a correction is only ever applied if it demonstrably improves Brier score AND ECE on a held-out test set the model never trained on, not just in-sample.
- An isotonic regression fallback exists for props where Platt's parametric assumption doesn't hold.
- We recently found and fixed a real bug: the original fitting code used raw 0/1 outcome labels instead of Platt's own original (1999) target-smoothing safeguard (soft targets t+ = (N1+1)/(N1+2), t- = 1/(N0+2)), which let small samples produce artificially steep, overconfident slopes.

REAL CURRENT DATA - every currently-active correction in production right now, verbatim:
${JSON.stringify(intel.activeCalibrations, null, 2)}

REAL SAMPLE SIZE CONTEXT per prop/side (population.stats row counts, a proxy for how much real classification data backs each tier):
${JSON.stringify(intel.populationStats, null, 2)}

REAL TOP LEGS currently qualifying for slip recommendation on the live board right now (PRIMARY tier, highest score, actual player/prop/line data - this is what a real user would see and bet on today):
${JSON.stringify(intel.topLegs, null, 2)}

YOUR TASK - be genuinely critical, not agreeable:
1. Look at the actual fitted A/B parameters and test Brier/ECE improvements across all active corrections. Do any of them look statistically implausible, overfit, or suspicious given what you'd expect from real MLB prop data? Name specific ones and explain why.
2. Is target-smoothed Platt scaling with a held-out test-set gate, as described, actually the right methodology here, or is there a known better-practice approach for small-sample sports betting calibration we should be using instead (e.g., Bayesian shrinkage, a minimum-sample-size gate before allowing any correction, cross-validation instead of a single train/test split)?
3. Look at the specific top legs listed - do any specific combinations of score, hit probability, and confidence look internally inconsistent or worth flagging (e.g., very high score but low confidence, or a goblin/demon variant that doesn't make intuitive sense for that probability level)?
4. What is the single most important thing about this calibration approach that you think we are NOT looking at, that a rigorous quant or sports-betting-modeling practitioner would flag immediately?

Do not hedge or be diplomatically vague. If something looks fine, say so plainly and briefly. If something looks wrong, risky, or worth investigating further, say exactly what and why, citing the specific data above.`;
}

async function callGemini(env, prompt) {
  const resp = await fetch(`${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  const raw = await resp.text();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { parse_error: true, raw_text_snippet: raw.slice(0, 2000) }; }
  return { http_status: resp.status, parsed };
}

function extractText(geminiResponse) {
  try {
    const candidates = geminiResponse.parsed && geminiResponse.parsed.candidates;
    if (!candidates || !candidates.length) return null;
    const parts = candidates[0].content && candidates[0].content.parts;
    if (!parts || !parts.length) return null;
    return parts.map(p => p.text || "").join("\n");
  } catch (_) {
    return null;
  }
}

async function runGeminiCalibrationCheck(env) {
  if (!env.GEMINI_API_KEY) {
    return { ok: false, error: "missing_GEMINI_API_KEY_secret" };
  }
  const sql = pg(env);
  try {
    const intel = await gatherIntel(sql);
    const prompt = buildPrompt(intel);
    const geminiResult = await callGemini(env, prompt);
    const geminiText = extractText(geminiResult);
    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "GEMINI_CALIBRATION_CHECK_COMPLETE",
      read_only: true,
      no_production_writes: true,
      model_used: GEMINI_MODEL,
      intel_summary: {
        top_legs_count: intel.topLegs.length,
        active_calibrations_count: intel.activeCalibrations.length,
        population_stats_rows: intel.populationStats.length
      },
      gemini_http_status: geminiResult.http_status,
      gemini_raw_response: geminiResult.parsed,
      gemini_extracted_text: geminiText,
      timestamp_utc: nowUtc()
    };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse({
        ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
        status: "READY", purpose: "Read-only Gemini second-opinion calibration checker. Never writes production data.",
        bindings_present: { HYPERDRIVE: Boolean(env.HYPERDRIVE), GEMINI_API_KEY: Boolean(env.GEMINI_API_KEY) },
        model: GEMINI_MODEL, timestamp_utc: nowUtc()
      });
    }

    if (method === "POST" && path === "/run") {
      try {
        const result = await runGeminiCalibrationCheck(env);
        return jsonResponse(result, result.ok ? 200 : 500);
      } catch (err) {
        return jsonResponse({ ok: false, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }

    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
